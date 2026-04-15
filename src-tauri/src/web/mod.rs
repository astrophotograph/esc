//! Standalone web API server — replaces the Python FastAPI backend.
//!
//! Provides the same `/api/{command}` POST interface that the frontend
//! expects, plus MJPEG streaming and static file serving.

// This module is not yet connected to main — allow dead code for future use.
#![allow(dead_code)]

use axum::{
    body::Body,
    extract::{Path, State as AxumState},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use scopinator_seestar::command::params::*;
use scopinator_seestar::command::Command;
use scopinator_seestar::SeestarClient;
use std::net::Ipv4Addr;
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::CorsLayer;
use tracing::info;

use crate::state::{AppState, ConnectionStatus, TelescopeConnection};
use crate::streaming;

/// Shared state for the web server
pub type WebState = Arc<AppState>;

/// Create the web API router
pub fn create_router(state: WebState, static_dir: Option<std::path::PathBuf>) -> Router {
    // Nest the streaming router under /api/ so /api/stream/{id} works
    let streaming_router = streaming::create_router().with_state(state.clone());

    let api = Router::new()
        .route("/api/{command}", post(command_handler))
        .route("/api/snapshot/{telescope_id}", get(snapshot_handler))
        .nest("/api", streaming_router)
        .with_state(state.clone());

    let app = if let Some(dir) = static_dir {
        let serve_dir = tower_http::services::ServeDir::new(dir)
            .append_index_html_on_directories(true);
        api.fallback_service(serve_dir)
    } else {
        api
    };

    app.layer(CorsLayer::permissive())
}

// ---------------------------------------------------------------------------
// Helpers (same logic as telescope/commands.rs)
// ---------------------------------------------------------------------------

fn get_client(state: &AppState, telescope_id: &str) -> Result<Arc<SeestarClient>, String> {
    let telescopes = state.telescopes.read();
    let telescope = telescopes
        .get(telescope_id)
        .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
    if !matches!(telescope.status, ConnectionStatus::Connected) {
        return Err("Telescope not connected".to_string());
    }
    telescope
        .client
        .clone()
        .ok_or_else(|| "No native client available".to_string())
}

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

fn ok_json(value: serde_json::Value) -> Response {
    Json(value).into_response()
}

fn err_json(msg: &str) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "success": false, "error": msg })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// Command dispatcher
// ---------------------------------------------------------------------------

async fn command_handler(
    AxumState(state): AxumState<WebState>,
    Path(command): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Response {
    match dispatch_command(&state, &command, payload).await {
        Ok(result) => ok_json(result),
        Err(e) => err_json(&e),
    }
}

async fn dispatch_command(
    state: &AppState,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match command {
        // --- Telescope management ---
        "discover_telescopes" => cmd_discover(state).await,
        "get_telescopes" => cmd_get_telescopes(state),
        "connect_telescope" => cmd_connect(state, &payload).await,
        "disconnect_telescope" => cmd_disconnect(state, &payload).await,

        // --- Mount ---
        "goto_target" => cmd_goto_target(state, &payload).await,
        "park_telescope" => cmd_park(state, &payload).await,
        "telescope_move" => cmd_move(state, &payload).await,
        "telescope_stop_move" => cmd_stop_move(state, &payload).await,
        "telescope_stop_goto" => cmd_stop_goto(state, &payload).await,

        // --- Focus ---
        "telescope_focus" | "set_focus" => cmd_focus(state, &payload).await,
        "telescope_focus_increment" => cmd_focus_increment(state, &payload).await,
        "telescope_auto_focus" => cmd_auto_focus(state, &payload).await,
        "telescope_get_focuser_position" => cmd_get_focuser_position(state, &payload).await,

        // --- Imaging ---
        "imaging_start" => cmd_imaging_start(state, &payload).await,
        "imaging_stop" => cmd_imaging_stop(state, &payload).await,
        "telescope_set_gain" => cmd_set_gain(state, &payload).await,
        "telescope_set_exposure" => cmd_set_exposure(state, &payload).await,
        "telescope_start_recording" => cmd_start_recording(state, &payload).await,
        "telescope_stop_recording" => cmd_stop_recording(state, &payload).await,
        "telescope_plate_solve" => cmd_plate_solve(state, &payload).await,
        "telescope_reboot" => cmd_reboot(state, &payload).await,
        "telescope_start_stack" => cmd_start_stack(state, &payload).await,
        "telescope_stop_stack" => cmd_stop_stack(state, &payload).await,
        "telescope_get_stacking_status" => cmd_get_stacking_status(state, &payload).await,
        "telescope_save_image" => cmd_save_image(state, &payload).await,

        // --- Status ---
        "get_telescope_status" => cmd_get_status(state, &payload).await,

        _ => Err(format!("Unknown command: {command}")),
    }
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

fn tid(payload: &serde_json::Value) -> Result<String, String> {
    payload
        .get("telescopeId")
        .or_else(|| payload.get("telescope_id"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| "Missing telescopeId".to_string())
}

async fn cmd_discover(state: &AppState) -> Result<serde_json::Value, String> {
    use scopinator_seestar::protocol::discovery;

    let devices = discovery::discover(Duration::from_secs(3))
        .await
        .map_err(|e| format!("Discovery failed: {e}"))?;

    let results: Vec<serde_json::Value> = devices
        .into_iter()
        .map(|d| {
            let ssid = d
                .raw_response
                .get("result")
                .and_then(|r| r.get("ssid"))
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            serde_json::json!({
                "host": d.address.to_string(),
                "port": 4700,
                "protocol": "seestar",
                "serial_number": d.serial_number.unwrap_or_default(),
                "product_model": d.product_model.unwrap_or_default(),
                "ssid": ssid,
                "discovery_method": "auto_discovery",
            })
        })
        .collect();

    // Add discovered telescopes to state
    for r in &results {
        let host = r["host"].as_str().unwrap_or_default();
        let sn = r["serial_number"].as_str().unwrap_or_default();
        let id = if sn.is_empty() {
            format!("{}:4700", host)
        } else {
            sn.to_string()
        };

        let telescopes = state.telescopes.read();
        if !telescopes.contains_key(&id) {
            drop(telescopes);
            let mut telescopes = state.telescopes.write();
            telescopes.insert(
                id.clone(),
                TelescopeConnection {
                    id: id.clone(),
                    host: host.to_string(),
                    port: 4700,
                    protocol: "seestar".to_string(),
                    name: format!("Seestar {}", sn),
                    status: ConnectionStatus::Disconnected,
                    client: None,
                },
            );
        }
    }

    Ok(serde_json::json!({ "success": true, "telescopes": results }))
}

fn cmd_get_telescopes(state: &AppState) -> Result<serde_json::Value, String> {
    let telescopes = state.telescopes.read();
    let list: Vec<serde_json::Value> = telescopes
        .values()
        .map(|t| {
            serde_json::json!({
                "id": t.id,
                "host": t.host,
                "port": t.port,
                "protocol": t.protocol,
                "name": t.name,
                "status": format!("{:?}", t.status),
            })
        })
        .collect();
    Ok(serde_json::json!(list))
}

async fn cmd_connect(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let telescope_id = tid(payload)?;
    let host = payload.get("host").and_then(|v| v.as_str());
    let port = payload.get("port").and_then(|v| v.as_u64()).map(|v| v as u16);

    let (host, _port) = if let (Some(h), Some(p)) = (host, port) {
        (h.to_string(), p)
    } else {
        let telescopes = state.telescopes.read();
        let t = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (t.host.clone(), t.port)
    };

    // Update status to connecting
    {
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = ConnectionStatus::Connecting;
        }
    }

    let ip: Ipv4Addr = host
        .parse()
        .map_err(|e| format!("Invalid IP: {e}"))?;

    // Load authentication key from environment
    let interop_key = if let Ok(pem_path) = std::env::var("SEESTAR_INTEROP_PEM") {
        match std::fs::read_to_string(&pem_path) {
            Ok(pem_content) => {
                match scopinator_seestar::InteropKey::from_pem(&pem_content) {
                    Ok(key) => {
                        info!("Web API: loaded SEESTAR_INTEROP_PEM from {}", pem_path);
                        Some(key)
                    }
                    Err(e) => {
                        tracing::warn!("Web API: failed to parse PEM: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Web API: failed to read SEESTAR_INTEROP_PEM from {}: {}", pem_path, e);
                None
            }
        }
    } else {
        tracing::debug!("Web API: SEESTAR_INTEROP_PEM not set, connecting without authentication");
        None
    };

    let config = scopinator_seestar::SeestarConfig {
        interop_key,
    };

    let client = SeestarClient::connect_with_config(ip, config)
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    client
        .wait_for_connection(Duration::from_secs(10))
        .await
        .map_err(|e| format!("Connection timeout: {e}"))?;

    info!("Web API: native client connected to {}", host);

    {
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = ConnectionStatus::Connected;
            t.client = Some(Arc::new(client));
        }
    }

    Ok(serde_json::json!({ "success": true }))
}

async fn cmd_disconnect(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let telescope_id = tid(payload)?;

    let client = {
        let telescopes = state.telescopes.read();
        telescopes
            .get(&telescope_id)
            .and_then(|t| t.client.clone())
    };

    if let Some(c) = client {
        c.shutdown().await;
    }

    {
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = ConnectionStatus::Disconnected;
            t.client = None;
        }
    }

    Ok(serde_json::json!({ "success": true }))
}

async fn cmd_goto_target(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let target_name = payload.get("targetName").or_else(|| payload.get("target_name"))
        .and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
    let ra = payload.get("ra").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let dec = payload.get("dec").and_then(|v| v.as_f64()).unwrap_or(0.0);

    response_to_json(
        client.send_command(Command::GotoTarget(GotoTargetParams {
            target_name,
            is_j2000: true,
            ra,
            dec,
        })).await,
    )
}

async fn cmd_park(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::ScopePark).await)
}

async fn cmd_move(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let direction = payload.get("direction").and_then(|v| v.as_str()).unwrap_or("n");
    let speed = payload.get("speed").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let duration = payload.get("duration_sec").and_then(|v| v.as_f64()).unwrap_or(5.0);

    let angle = match direction {
        "n" => 0, "ne" => 45, "e" => 90, "se" => 135,
        "s" => 180, "sw" => 225, "w" => 270, "nw" => 315,
        _ => return Err(format!("Unknown direction: {direction}")),
    };

    response_to_json(
        client.send_command(Command::ScopeSpeedMove(SpeedMoveParams {
            angle,
            level: 1,
            dur_sec: duration as i32,
            percent: (speed * 100.0) as i32,
        })).await,
    )
}

async fn cmd_stop_move(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(
        client.send_command(Command::ScopeSpeedMove(SpeedMoveParams {
            angle: 0, level: 0, dur_sec: 0, percent: 0,
        })).await,
    )
}

async fn cmd_stop_goto(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(
        client.send_command(Command::IscopeStopView(StopViewParams {
            stage: StopStage::AutoGoto,
        })).await,
    )
}

async fn cmd_focus(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let position = payload.get("position").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    response_to_json(
        client.send_command(Command::MoveFocuser(MoveFocuserParams {
            step: position,
            ret_step: true,
        })).await,
    )
}

async fn cmd_focus_increment(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let increment = payload.get("increment").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

    let current_resp = client.send_command(Command::GetFocuserPosition).await
        .map_err(|e| format!("Failed to get focuser position: {e}"))?;
    let current_pos = current_resp.result
        .as_ref()
        .and_then(|v| v.get("step"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    response_to_json(
        client.send_command(Command::MoveFocuser(MoveFocuserParams {
            step: current_pos + increment,
            ret_step: true,
        })).await,
    )
}

async fn cmd_auto_focus(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::StartAutoFocus).await)
}

async fn cmd_get_focuser_position(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::GetFocuserPosition).await)
}

async fn cmd_imaging_start(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let target_name = payload.get("targetName").or_else(|| payload.get("target_name"))
        .and_then(|v| v.as_str()).map(String::from);
    response_to_json(
        client.send_command(Command::IscopeStartView(StartViewParams {
            mode: Some(ViewMode::Star),
            target_name,
            target_ra_dec: None,
            target_type: None,
            lp_filter: None,
        })).await,
    )
}

async fn cmd_imaging_stop(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(
        client.send_command(Command::IscopeStopView(StopViewParams {
            stage: StopStage::Stack,
        })).await,
    )
}

async fn cmd_set_gain(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let gain = payload.get("gain").and_then(|v| v.as_i64()).unwrap_or(80) as i32;
    response_to_json(
        client.send_command(Command::SetControlValue("gain".to_string(), gain)).await,
    )
}

async fn cmd_set_exposure(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let exposure_ms = payload.get("exposure_ms").and_then(|v| v.as_i64()).unwrap_or(10000);
    response_to_json(
        client.send_command(Command::SetSetting(SettingParams {
            exp_ms: Some(serde_json::json!(exposure_ms)),
            ..Default::default()
        })).await,
    )
}

async fn cmd_start_recording(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::BeginStreaming).await)
}

async fn cmd_stop_recording(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::StopStreaming).await)
}

async fn cmd_plate_solve(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::StartSolve).await)
}

async fn cmd_reboot(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::PiReboot).await)
}

async fn cmd_start_stack(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let restart = payload.get("restart").and_then(|v| v.as_bool());
    response_to_json(
        client.send_command(Command::IscopeStartStack(
            restart.map(|r| StartStackParams { restart: Some(r) }),
        )).await,
    )
}

async fn cmd_stop_stack(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(
        client.send_command(Command::IscopeStopView(StopViewParams {
            stage: StopStage::Stack,
        })).await,
    )
}

async fn cmd_get_stacking_status(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::GetStackInfo).await)
}

async fn cmd_save_image(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::GetStackedImage).await)
}

async fn cmd_get_status(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let telescope_id = tid(payload)?;
    let client = get_client(state, &telescope_id)?;

    let (device_result, coord_result, view_result) = tokio::join!(
        client.send_command(Command::GetDeviceState),
        client.send_command(Command::ScopeGetEquCoord),
        client.send_command(Command::GetViewState),
    );

    let mut status = serde_json::json!({ "connected": true });

    // Parse device state
    if let Ok(resp) = device_result {
        if resp.is_success() {
            if let Some(result) = resp.result {
                if let Some(pi) = result.get("pi_status") {
                    status["battery_percent"] = pi.get("battery_capacity").cloned().unwrap_or_default();
                    status["temperature_c"] = pi.get("temp").cloned().unwrap_or_default();
                }
                if let Some(mount) = result.get("mount") {
                    status["is_tracking"] = mount.get("tracking").cloned().unwrap_or_default();
                }
                if let Some(focuser) = result.get("focuser") {
                    status["focus_position"] = focuser.get("step").cloned().unwrap_or_default();
                }
                if let Some(setting) = result.get("setting") {
                    status["gain"] = setting.get("gain").cloned().unwrap_or_default();
                }
            }
        }
    }

    // Parse coordinates
    if let Ok(resp) = coord_result {
        if resp.is_success() {
            if let Some(result) = resp.result {
                status["ra"] = result.get("ra").cloned().unwrap_or_default();
                status["dec"] = result.get("dec").cloned().unwrap_or_default();
            }
        }
    }

    // Parse view state
    if let Ok(resp) = view_result {
        if resp.is_success() {
            if let Some(result) = resp.result {
                let view = result.get("View").or_else(|| result.get("view"));
                if let Some(v) = view {
                    status["view_state"] = v.get("state").cloned().unwrap_or_default();
                    status["target_name"] = v.get("target_name").cloned().unwrap_or_default();
                    status["stacked_frame"] = v.get("stacked_frame").cloned().unwrap_or_default();
                }
            }
        }
    }

    Ok(serde_json::json!({ "success": true, "state": status }))
}

// ---------------------------------------------------------------------------
// Streaming endpoints (delegate to streaming module's shared logic)
// ---------------------------------------------------------------------------

async fn snapshot_handler(
    AxumState(state): AxumState<WebState>,
    Path(telescope_id): Path<String>,
) -> Response {
    // Get a single frame from the native client
    let client = {
        let telescopes = state.telescopes.read();
        match telescopes.get(&telescope_id) {
            Some(t) if matches!(t.status, ConnectionStatus::Connected) => t.client.clone(),
            _ => return (StatusCode::SERVICE_UNAVAILABLE, "Telescope not connected").into_response(),
        }
    };

    let client = match client {
        Some(c) => c,
        None => return (StatusCode::SERVICE_UNAVAILABLE, "No native client").into_response(),
    };

    // Subscribe and wait for one frame
    let mut frame_rx = client.subscribe_frames();
    let timeout = Duration::from_secs(5);

    match tokio::time::timeout(timeout, async {
        loop {
            match frame_rx.recv().await {
                Ok(frame) if frame.header.is_image() => return Ok(frame),
                Ok(_) => continue,
                Err(e) => return Err(format!("Frame receive error: {e}")),
            }
        }
    })
    .await
    {
        Ok(Ok(frame)) => {
            let width = frame.header.width as u32;
            let height = frame.header.height as u32;
            let data = frame.data.clone();
            let expected_rgb = (width * height * 3) as usize;
            let is_color = data.len() >= expected_rgb;

            let params = crate::stretch::StretchParams {
                gradient_removal: false,
                autocrop: false,
                ..Default::default()
            };

            match crate::stretch::stretch_raw_frame(&data, width, height, is_color, &params) {
                Ok(jpeg) => Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "image/jpeg")
                    .header(header::CACHE_CONTROL, "no-cache")
                    .body(Body::from(jpeg))
                    .unwrap(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Stretch failed: {e}")).into_response(),
            }
        }
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        Err(_) => (StatusCode::GATEWAY_TIMEOUT, "No frame within timeout").into_response(),
    }
}

// ---------------------------------------------------------------------------
// Standalone server entry point
// ---------------------------------------------------------------------------

/// Start the standalone web API server (replaces FastAPI).
pub async fn start_web_server(
    state: WebState,
    port: u16,
    static_dir: Option<std::path::PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    let app = create_router(state, static_dir);

    let addr = format!("0.0.0.0:{}", port);
    info!("Starting web API server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
