use crate::database::Database;
use crate::events::{emit_event, event_names};
use crate::state::AppState;
use scopinator_seestar::command::params::*;
use scopinator_seestar::command::Command;
use scopinator_seestar::SeestarClient;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Get the native SeestarClient for a connected telescope.
fn get_client(
    state: &AppState,
    telescope_id: &str,
) -> Result<std::sync::Arc<SeestarClient>, String> {
    let telescopes = state.telescopes.read();
    let telescope = telescopes
        .get(telescope_id)
        .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
    if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
        return Err("Telescope not connected".to_string());
    }
    telescope
        .client
        .clone()
        .ok_or_else(|| "No native client available".to_string())
}

/// Convert a CommandResponse to a success/failure JSON value.
fn response_to_json(
    resp: Result<
        scopinator_seestar::response::CommandResponse,
        scopinator_seestar::error::SeestarError,
    >,
) -> Result<serde_json::Value, String> {
    let resp = resp.map_err(|e| format!("Command failed: {e}"))?;
    if resp.is_success() {
        Ok(serde_json::json!({
            "success": true,
            "response": resp.result,
        }))
    } else {
        Ok(serde_json::json!({
            "success": false,
            "error": resp.error.unwrap_or_else(|| format!("Error code {}", resp.code)),
        }))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TelescopeConfig {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub protocol: Option<String>, // "seestar" or "alpaca", defaults to "seestar"
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GotoParams {
    pub target_name: String,
    pub ra: f64,
    pub dec: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImagingParams {
    pub exposure_ms: i32,
    pub gain: i32,
    pub target_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveParams {
    pub direction: String,         // "n", "s", "e", "w", "ne", "nw", "se", "sw"
    pub speed: Option<f32>,        // Speed multiplier (0.0-1.0)
    pub duration_sec: Option<f32>, // Duration of movement
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct FocusParams {
    pub position: Option<i32>,  // Absolute position
    pub increment: Option<i32>, // Relative increment
}

/// Add a telescope manually by host and port
#[tauri::command]
pub async fn add_telescope(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, Database>,
    config: TelescopeConfig,
) -> Result<String, String> {
    let protocol = config.protocol.clone().unwrap_or_else(|| "seestar".to_string());
    tracing::info!("Adding telescope: {}:{} (protocol: {})", config.host, config.port, protocol);

    // Create telescope entry in database
    // Manually added telescopes have last_seen = None so they won't be auto-removed
    let telescope = crate::database::models::Telescope {
        id: config.id.clone(),
        host: config.host.clone(),
        port: config.port,
        protocol: Some(protocol.clone()),
        serial_number: None,
        product_model: None,
        name: config.name.clone(),
        location: None,
        discovery_method: Some("manual".to_string()),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        last_seen: None, // Manual telescopes are never auto-removed
    };

    db.save_telescope(&telescope)
        .map_err(|e| format!("Failed to save telescope: {}", e))?;

    // Add to state
    let telescope_name = config
        .name
        .clone()
        .unwrap_or_else(|| format!("{}:{}", config.host, config.port));
    {
        let mut telescopes = state.telescopes.write();
        telescopes.insert(
            config.id.clone(),
            crate::state::TelescopeConnection {
                id: config.id.clone(),
                host: config.host.clone(),
                port: config.port,
                protocol: protocol.clone(),
                name: telescope_name,
                status: crate::state::ConnectionStatus::Disconnected,
                client: None,
            },
        );
    }

    // Emit discovery event
    emit_event(
        &app,
        event_names::TELESCOPE_DISCOVERED,
        serde_json::json!({
            "id": config.id,
            "host": config.host,
            "port": config.port,
            "protocol": protocol,
            "name": config.name,
        }),
    )?;

    Ok(config.id)
}

/// Connect to a telescope
#[tauri::command]
pub async fn connect_telescope(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    host: Option<String>,
    port: Option<u16>,
    protocol: Option<String>,
) -> Result<String, String> {
    tracing::info!("connect_telescope: starting for telescope_id={}", telescope_id);

    // Get telescope info - either from provided params or from state
    let (host, port, protocol) = {
        let mut telescopes = state.telescopes.write();

        if let (Some(h), Some(p), Some(proto)) = (host.clone(), port, protocol.clone()) {
            // Manually added telescope - create/update entry in state
            tracing::info!(
                "connect_telescope: using provided params for manual telescope {}:{}",
                h,
                p
            );

            let connection = crate::state::TelescopeConnection {
                id: telescope_id.clone(),
                host: h.clone(),
                port: p,
                protocol: proto.clone(),
                name: format!("{} @ {}:{}", proto, h, p),
                status: crate::state::ConnectionStatus::Connecting,
                client: None,
            };
            telescopes.insert(telescope_id.clone(), connection);

            (h, p, proto)
        } else {
            // Look up from state (discovered telescope)
            let all_ids: Vec<_> = telescopes.keys().collect();
            tracing::info!(
                "connect_telescope: looking up telescope '{}', available telescopes: {:?}",
                telescope_id,
                all_ids
            );
            let telescope = telescopes.get(&telescope_id).ok_or_else(|| {
                tracing::error!(
                    "connect_telescope: Telescope {} not found in state!",
                    telescope_id
                );
                format!("Telescope {} not found", telescope_id)
            })?;

            let h = telescope.host.clone();
            let p = telescope.port;
            let proto = telescope.protocol.clone();

            // Update status to connecting
            if let Some(t) = telescopes.get_mut(&telescope_id) {
                t.status = crate::state::ConnectionStatus::Connecting;
            }

            (h, p, proto)
        }
    };

    tracing::info!("connect_telescope: connecting native client to {}:{} (protocol: {})", host, port, protocol);

    // Create the native Rust client
    let native_client = if protocol == "seestar" {
        use scopinator_seestar::{SeestarClient, SeestarConfig, InteropKey};
        use std::net::Ipv4Addr;
        use std::time::Duration;

        let ip: Ipv4Addr = host
            .parse()
            .map_err(|e| format!("Invalid IP: {}", e))?;

        // Load authentication key from environment
        let interop_key = if let Ok(pem_path) = std::env::var("SEESTAR_INTEROP_PEM") {
            match std::fs::read_to_string(&pem_path) {
                Ok(pem_content) => {
                    match InteropKey::from_pem(&pem_content) {
                        Ok(key) => {
                            tracing::info!("connect_telescope: loaded SEESTAR_INTEROP_PEM from {}", pem_path);
                            Some(key)
                        }
                        Err(e) => {
                            tracing::warn!("connect_telescope: failed to parse PEM: {}", e);
                            None
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("connect_telescope: failed to read SEESTAR_INTEROP_PEM from {}: {}", pem_path, e);
                    None
                }
            }
        } else {
            tracing::debug!("connect_telescope: SEESTAR_INTEROP_PEM not set, connecting without authentication");
            None
        };

        let config = SeestarConfig {
            interop_key,
        };

        let client = SeestarClient::connect_with_config(ip, config)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        client
            .wait_for_connection(Duration::from_secs(10))
            .await
            .map_err(|e| format!("Connection timeout: {}", e))?;

        tracing::info!("connect_telescope: native Rust client connected");
        Some(Arc::new(client))
    } else {
        return Err(format!("Unsupported protocol: {}", protocol));
    };

    // Update status and store client
    {
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = crate::state::ConnectionStatus::Connected;
            t.client = native_client;
        }
    }

    emit_event(
        &app,
        event_names::TELESCOPE_CONNECTED,
        serde_json::json!({ "id": telescope_id }),
    )?;

    Ok(serde_json::to_string(&serde_json::json!({ "success": true })).unwrap())
}

/// Disconnect from a telescope
#[tauri::command]
pub async fn disconnect_telescope(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Disconnecting from telescope: {}", telescope_id);

    // Shut down native Rust client if present
    let native_client = {
        let telescopes = state.telescopes.read();
        telescopes
            .get(&telescope_id)
            .and_then(|t| t.client.clone())
    };
    if let Some(client) = native_client {
        tracing::info!("disconnect_telescope: shutting down native Rust client");
        client.shutdown().await;
    }

    // Update status
    {
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = crate::state::ConnectionStatus::Disconnected;
            t.client = None;
        }
    }

    emit_event(
        &app,
        event_names::TELESCOPE_DISCONNECTED,
        serde_json::json!({ "id": telescope_id }),
    )?;

    Ok(serde_json::to_string(&serde_json::json!({ "success": true })).unwrap())
}

/// Send GOTO command to telescope
#[tauri::command]
pub async fn goto_target(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    params: GotoParams,
) -> Result<String, String> {
    tracing::info!(
        "GOTO command for telescope {}: {} (RA: {}, Dec: {})",
        telescope_id,
        params.target_name,
        params.ra,
        params.dec
    );

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::GotoTarget(GotoTargetParams {
                target_name: params.target_name.clone(),
                is_j2000: true,
                ra: params.ra,
                dec: params.dec,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "goto",
            "params": params,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Park the telescope
#[tauri::command]
pub async fn park_telescope(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Park command for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::ScopePark).await)?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "park",
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Get list of all telescopes
#[tauri::command]
pub async fn get_telescopes(db: State<'_, Database>) -> Result<String, String> {
    let telescopes = db
        .get_telescopes()
        .map_err(|e| format!("Failed to get telescopes: {}", e))?;

    Ok(serde_json::to_string(&telescopes).unwrap())
}

/// Remove a telescope
#[tauri::command]
pub async fn remove_telescope(
    state: State<'_, AppState>,
    db: State<'_, Database>,
    telescope_id: String,
) -> Result<(), String> {
    tracing::info!("Removing telescope: {}", telescope_id);

    // Remove from database
    db.delete_telescope(&telescope_id)
        .map_err(|e| format!("Failed to delete telescope: {}", e))?;

    // Remove from state
    {
        let mut telescopes = state.telescopes.write();
        telescopes.remove(&telescope_id);
    }

    Ok(())
}

/// Move telescope in a direction
#[tauri::command]
pub async fn telescope_move(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    params: MoveParams,
) -> Result<String, String> {
    tracing::info!(
        "Move command for telescope {}: direction={}, speed={:?}",
        telescope_id,
        params.direction,
        params.speed
    );

    let angle = match params.direction.as_str() {
        "n" => 0,
        "ne" => 45,
        "e" => 90,
        "se" => 135,
        "s" => 180,
        "sw" => 225,
        "w" => 270,
        "nw" => 315,
        _ => return Err(format!("Unknown direction: {}", params.direction)),
    };
    let speed = params.speed.unwrap_or(1.0);
    let duration = params.duration_sec.unwrap_or(5.0);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::ScopeSpeedMove(SpeedMoveParams {
                angle,
                level: 1,
                dur_sec: duration as i32,
                percent: (speed * 100.0) as i32,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "move",
            "params": params,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Stop telescope movement
#[tauri::command]
pub async fn telescope_stop_move(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Stop move command for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::ScopeSpeedMove(SpeedMoveParams {
                angle: 0,
                level: 0,
                dur_sec: 0,
                percent: 0,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "stop_move",
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Set focus position
#[tauri::command]
pub async fn telescope_focus(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    position: i32,
) -> Result<String, String> {
    tracing::info!(
        "Focus command for telescope {}: position={}",
        telescope_id,
        position
    );

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::MoveFocuser(MoveFocuserParams {
                step: position,
                ret_step: true,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "focus",
            "position": position,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Adjust focus by increment
#[tauri::command]
pub async fn telescope_focus_increment(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    increment: i32,
) -> Result<String, String> {
    tracing::info!(
        "Focus increment command for telescope {}: increment={}",
        telescope_id,
        increment
    );

    let client = get_client(&state, &telescope_id)?;

    // Get current position first
    let current_resp = client
        .send_command(Command::GetFocuserPosition)
        .await
        .map_err(|e| format!("Failed to get focuser position: {e}"))?;
    let current_pos = current_resp
        .result
        .as_ref()
        .and_then(|v| v.get("step"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let new_pos = current_pos + increment;

    let result = response_to_json(
        client
            .send_command(Command::MoveFocuser(MoveFocuserParams {
                step: new_pos,
                ret_step: true,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "focus_increment",
            "increment": increment,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Start auto-focus routine
#[tauri::command]
pub async fn telescope_auto_focus(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Auto-focus command for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::StartAutoFocus).await)?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "auto_focus",
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Start imaging session
#[tauri::command]
pub async fn imaging_start(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    params: ImagingParams,
) -> Result<String, String> {
    tracing::info!(
        "Start imaging for telescope {}: exposure={}ms, gain={}",
        telescope_id,
        params.exposure_ms,
        params.gain
    );

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::IscopeStartView(StartViewParams {
                mode: Some(ViewMode::Star),
                target_name: params.target_name.clone(),
                target_ra_dec: None,
                target_type: None,
                lp_filter: None,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::IMAGING_STARTED,
        serde_json::json!({
            "telescope_id": telescope_id,
            "params": params,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Stop imaging session
#[tauri::command]
pub async fn imaging_stop(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Stop imaging for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::IscopeStopView(StopViewParams {
                stage: StopStage::Stack,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::IMAGING_STOPPED,
        serde_json::json!({
            "telescope_id": telescope_id,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Set camera gain
#[tauri::command]
pub async fn telescope_set_gain(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    gain: i32,
) -> Result<String, String> {
    tracing::info!("Set gain for telescope {}: gain={}", telescope_id, gain);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::SetControlValue("gain".to_string(), gain))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "set_gain",
            "gain": gain,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Set exposure time
#[tauri::command]
pub async fn telescope_set_exposure(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    exposure_ms: i32,
) -> Result<String, String> {
    tracing::info!(
        "Set exposure for telescope {}: exposure={}ms",
        telescope_id,
        exposure_ms
    );

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::SetSetting(SettingParams {
                exp_ms: Some(serde_json::json!(exposure_ms)),
                ..Default::default()
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "set_exposure",
            "exposure_ms": exposure_ms,
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Stop GOTO operation
#[tauri::command]
pub async fn telescope_stop_goto(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Stop GOTO for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::IscopeStopView(StopViewParams {
                stage: StopStage::AutoGoto,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::COMMAND_RESPONSE,
        serde_json::json!({
            "telescope_id": telescope_id,
            "command": "stop_goto",
            "result": result,
        }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Get focuser position
#[tauri::command]
pub async fn telescope_get_focuser_position(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Get focuser position for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::GetFocuserPosition).await)?;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Start recording video
#[tauri::command]
pub async fn telescope_start_recording(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Start recording for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::BeginStreaming).await)?;

    Ok(result)
}

/// Stop recording video
#[tauri::command]
pub async fn telescope_stop_recording(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Stop recording for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::StopStreaming).await)?;

    Ok(result)
}

/// Run plate solving on current image
#[tauri::command]
pub async fn telescope_plate_solve(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Plate solve for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::StartSolve).await)?;

    Ok(result)
}

/// Reboot telescope system
#[tauri::command]
pub async fn telescope_reboot(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Reboot telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::PiReboot).await)?;

    Ok(result)
}

/// Start stacking
#[tauri::command]
pub async fn telescope_start_stack(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
    restart: Option<bool>,
) -> Result<serde_json::Value, String> {
    tracing::info!("Start stacking for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::IscopeStartStack(
                restart.map(|r| StartStackParams { restart: Some(r) }),
            ))
            .await,
    )?;

    emit_event(
        &app,
        event_names::IMAGING_STARTED,
        serde_json::json!({
            "telescope_id": telescope_id,
            "type": "stacking",
            "result": result,
        }),
    )?;

    Ok(result)
}

/// Stop stacking
#[tauri::command]
pub async fn telescope_stop_stack(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Stop stacking for telescope {}", telescope_id);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(
        client
            .send_command(Command::IscopeStopView(StopViewParams {
                stage: StopStage::Stack,
            }))
            .await,
    )?;

    emit_event(
        &app,
        event_names::IMAGING_STOPPED,
        serde_json::json!({
            "telescope_id": telescope_id,
            "type": "stacking",
            "result": result,
        }),
    )?;

    Ok(result)
}

/// Get stacking status
#[tauri::command]
pub async fn telescope_get_stacking_status(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::GetStackInfo).await)?;

    Ok(result)
}

/// Save current image to file
#[tauri::command]
pub async fn telescope_save_image(
    state: State<'_, AppState>,
    telescope_id: String,
    _file_path: String,
    _format: Option<String>,
) -> Result<serde_json::Value, String> {
    tracing::info!("Save image for telescope {} to {}", telescope_id, _file_path);

    let client = get_client(&state, &telescope_id)?;
    let result = response_to_json(client.send_command(Command::GetStackedImage).await)?;

    Ok(result)
}
