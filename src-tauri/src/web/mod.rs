//! Standalone web API server — replaces the Python FastAPI backend.
//!
//! Provides the same `/api/{command}` POST interface that the frontend
//! expects, plus MJPEG streaming and static file serving.

// This module is not yet connected to main — allow dead code for future use.
#![allow(dead_code)]

use axum::{
    extract::{Path, State as AxumState},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use scopinator_seestar::command::params::*;
use scopinator_seestar::command::{Command, ImagingCommand};
use scopinator_seestar::SeestarClient;
use std::net::{SocketAddr, SocketAddrV4};
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::CorsLayer;
use tracing::info;

use crate::catalog::{catalog_get_object_types, catalog_get_solar_system, catalog_quick_search, catalog_search, CatalogSearchParams};
use crate::planning;
use crate::state::{AppState, ConnectionStatus, TelescopeConnection};

pub type WebState = Arc<AppState>;

/// Create the web API router
pub fn create_router(state: WebState, static_dir: Option<std::path::PathBuf>) -> Router {
    // Merge the streaming router at the root so /stream/:id and /snapshot/:id
    // are served on the same port as the API. This lets remote devices (e.g.
    // iPhone on LAN) reach everything through a single port via the Vite proxy.
    let router = Router::new()
        .route("/api/:command", post(command_handler))
        .merge(crate::streaming::create_router())
        .with_state(state);

    let router = if let Some(dir) = static_dir {
        let serve_dir = tower_http::services::ServeDir::new(dir)
            .append_index_html_on_directories(true);
        router.fallback_service(serve_dir)
    } else {
        router
    };

    router.layer(CorsLayer::permissive())
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

        // --- Scheduling ---
        "schedule_set_view_plan" => cmd_set_view_plan(state, &payload).await,

        // --- Catalog ---
        "catalog_search" => cmd_catalog_search(&payload).await,
        "catalog_quick_search" => cmd_catalog_quick_search(&payload).await,
        "catalog_get_object_types" => cmd_catalog_get_object_types().await,
        "catalog_get_solar_system" => cmd_catalog_get_solar_system(&payload).await,

        // --- Location ---
        "get_ip_location" => cmd_get_ip_location().await,

        // --- Planning ---
        "planning_get_visibility" => cmd_planning_get_visibility(&payload).await,
        "planning_get_tonight_targets" => cmd_planning_get_tonight_targets(&payload).await,

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

    Ok(serde_json::json!(results))
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

    let (host, port) = if let (Some(h), Some(p)) = (host, port) {
        (h.to_string(), p)
    } else {
        let telescopes = state.telescopes.read();
        let t = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (t.host.clone(), t.port)
    };

    let protocol = payload
        .get("protocol")
        .and_then(|v| v.as_str())
        .unwrap_or("seestar")
        .to_string();

    // Ensure the telescope exists in the server's in-memory map and mark it
    // connecting. Manually-added telescopes live in the browser only, so they
    // are NOT pre-loaded here — without this insert, the connect would succeed
    // but the client would be dropped, making every later command (status,
    // goto, …) fail with "Telescope not found".
    {
        let mut telescopes = state.telescopes.write();
        telescopes
            .entry(telescope_id.clone())
            .and_modify(|t| {
                t.status = ConnectionStatus::Connecting;
                t.host = host.clone();
                t.port = port;
            })
            .or_insert_with(|| TelescopeConnection {
                id: telescope_id.clone(),
                host: host.clone(),
                port,
                protocol: protocol.clone(),
                name: format!("{} @ {}:{}", protocol, host, port),
                status: ConnectionStatus::Connecting,
                client: None,
            });
    }

    // Accept hostnames as well as IPv4 literals (e.g. a remote seestar-proxy).
    let ip = crate::telescope::resolve_ipv4(&host).await?;

    // Port layout relative to the control port: control = port,
    // imaging = port + 100, discovery (UDP) = port + 20 (4700/4800/4720 default).
    let control_port = port;
    let imaging_port = port.saturating_add(100);
    let discovery_port = port.saturating_add(20);

    // Send UDP scan_iscope before TCP connect — satisfies the Seestar's guest
    // mode so it accepts control commands (mirrors Tauri flow).
    {
        use tokio::net::UdpSocket;
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0").await {
            let udp_addr = format!("{}:{}", ip, discovery_port);
            let msg = b"{\"id\":1,\"method\":\"scan_iscope\",\"params\":\"\"}";
            if let Err(e) = sock.send_to(msg, &udp_addr).await {
                tracing::warn!("Web API: UDP scan_iscope send to {} failed: {}", udp_addr, e);
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }

    // Load authentication key from env var or DB-backed setting.
    // Clone the path out in its own statement so the parking_lot read guard is
    // released before the `.await` below (a guard held across await is `!Send`).
    let pem_path = state.interop_pem.read().clone();
    let interop_key = if let Some(pem_path) = pem_path {
        match tokio::fs::read_to_string(&pem_path).await {
            Ok(pem_content) => {
                match scopinator_seestar::InteropKey::from_pem(&pem_content) {
                    Ok(key) => {
                        info!("Web API: loaded interop PEM from {}", pem_path);
                        Some(key)
                    }
                    Err(e) => {
                        tracing::warn!("Web API: failed to parse PEM at {}: {}", pem_path, e);
                        None
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Web API: failed to read PEM at {}: {}", pem_path, e);
                None
            }
        }
    } else {
        tracing::warn!("Web API: no interop PEM configured — commands will fail on firmware 7.18+");
        None
    };

    let config = scopinator_seestar::SeestarConfig {
        interop_key,
        // Use the library default response timeout (scopinator 0.2.0+).
        response_timeout: None,
    };

    let control_addr = SocketAddr::V4(SocketAddrV4::new(ip, control_port));
    let imaging_addr = SocketAddr::V4(SocketAddrV4::new(ip, imaging_port));
    let client =
        SeestarClient::connect_with_ports_and_config(ip, control_addr, imaging_addr, config)
            .await
            .map_err(|e| format!("Connection failed: {e}"))?;

    client
        .wait_for_connection(Duration::from_secs(10))
        .await
        .map_err(|e| format!("Connection timeout: {e}"))?;

    info!("Web API: native client connected to {}", host);

    let client = Arc::new(client);

    // Live view = `iscope_start_view` on the control port (4700) THEN
    // `begin_streaming` on the imaging port (4800); the fresh-start case is
    // handled by `imaging_start`. Here we re-arm streaming on connect so that if
    // the scope is *already* in a star view (a reconnect, or a view started
    // elsewhere) preview frames resume without the user re-clicking Start. It's
    // a no-op when no view is active. Uses scopinator's typed `begin_streaming()`
    // (was a raw 4800 byte hack before).
    {
        let preview_client = client.clone();
        tokio::spawn(async move {
            if let Err(e) = preview_client.begin_streaming().await {
                tracing::warn!("Web API: connect-time begin_streaming failed: {}", e);
            }
        });
    }

    {
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = ConnectionStatus::Connected;
            t.client = Some(client);
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
        client.send_command(Command::IscopeStopView(Some(StopViewParams {
            stage: StopStage::AutoGoto,
        }))).await,
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
    // Start the view on the control port (4700)...
    let result = response_to_json(
        client.send_command(Command::IscopeStartView(StartViewParams {
            mode: Some(ViewMode::Star),
            target_name,
            target_ra_dec: None,
            target_type: None,
            lp_filter: None,
        })).await,
    )?;
    // ...then arm the live frame stream on the imaging port (4800). In star mode
    // the scope only pushes preview frames once begin_streaming has been sent.
    if let Err(e) = client.begin_streaming().await {
        tracing::warn!("Web API: begin_streaming failed after start view: {}", e);
    }
    Ok(result)
}

async fn cmd_imaging_stop(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(
        client.send_command(Command::IscopeStopView(Some(StopViewParams {
            stage: StopStage::Stack,
        }))).await,
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
    client.begin_streaming().await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

async fn cmd_stop_recording(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    client.send_imaging(ImagingCommand::StopStreaming).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
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
        client.send_command(Command::IscopeStopView(Some(StopViewParams {
            stage: StopStage::Stack,
        }))).await,
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

    // Delegate to the shared mapper so the web and desktop status paths can't
    // drift apart. (This previously had its own partial copy that omitted
    // `stage`, `mountType`, storage, etc.) The view payload is only trusted on a
    // success code, matching the Tauri path.
    let device_val = device_result.ok().and_then(|resp| resp.result);
    let coord_val = coord_result.ok().and_then(|resp| resp.result);
    let view_val = view_result
        .ok()
        .filter(|resp| resp.is_success())
        .and_then(|resp| resp.result);

    let status = crate::telescope::status::parse_status_from_results(
        true,
        device_val.as_ref(),
        coord_val.as_ref(),
        view_val.as_ref(),
    );

    serde_json::to_value(status).map_err(|e| e.to_string())
}

async fn cmd_set_view_plan(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;

    let plan = payload
        .get("plan")
        .cloned()
        .ok_or_else(|| "Missing plan".to_string())?;

    if plan
        .get("list")
        .and_then(|l| l.as_array())
        .map(|a| a.is_empty())
        .unwrap_or(true)
    {
        return Err("Plan has no targets".to_string());
    }

    let resp = client
        .send_command(Command::SetViewPlan(plan))
        .await
        .map_err(|e| format!("Command failed: {e}"))?;

    let code = resp.code;
    let message = match code {
        0 => "Plan sent successfully".to_string(),
        536 => "Telescope is busy — another operation is in progress".to_string(),
        _ => format!("Device returned error code {code}"),
    };

    Ok(serde_json::json!({
        "success": code == 0,
        "code": code,
        "message": message,
    }))
}

async fn cmd_get_ip_location() -> Result<serde_json::Value, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    let mut stream = TcpStream::connect("ip-api.com:80")
        .await
        .map_err(|e| format!("ip-api.com connect failed: {e}"))?;

    let request = "GET /json/?fields=status,lat,lon,city,country,timezone HTTP/1.1\r\nHost: ip-api.com\r\nConnection: close\r\n\r\n";
    stream.write_all(request.as_bytes()).await
        .map_err(|e| format!("Request write failed: {e}"))?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response).await
        .map_err(|e| format!("Response read failed: {e}"))?;

    let text = String::from_utf8_lossy(&response);
    let body = text.split("\r\n\r\n").nth(1).unwrap_or("").trim();
    let data: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| format!("ip-api.com parse failed: {e}"))?;

    if data.get("status").and_then(|s| s.as_str()) != Some("success") {
        return Err("ip-api.com returned non-success status".to_string());
    }

    let lat = data.get("lat").and_then(|v| v.as_f64()).ok_or("Missing lat")?;
    let lon = data.get("lon").and_then(|v| v.as_f64()).ok_or("Missing lon")?;
    let city = data.get("city").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let country = data.get("country").and_then(|v| v.as_str()).unwrap_or("");
    let timezone = data.get("timezone").and_then(|v| v.as_str());
    let name = if country.is_empty() { city.to_string() } else { format!("{city}, {country}") };

    let mut result = serde_json::json!({
        "success": true,
        "latitude": lat,
        "longitude": lon,
        "name": name,
    });
    if let Some(tz) = timezone {
        result["timezone"] = serde_json::Value::String(tz.to_string());
    }
    Ok(result)
}

async fn cmd_planning_get_visibility(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let target: planning::VisibilityTarget = serde_json::from_value(
        payload.get("target").cloned().unwrap_or_default()
    ).map_err(|e| format!("Invalid target: {e}"))?;
    let location: planning::VisibilityLocation = serde_json::from_value(
        payload.get("location").cloned().unwrap_or_default()
    ).map_err(|e| format!("Invalid location: {e}"))?;
    let date = payload.get("date").and_then(|v| v.as_str()).map(String::from);
    let min_altitude = payload.get("minAltitude").and_then(|v| v.as_f64());

    let json_str = planning::planning_get_visibility(target, location, date, min_altitude).await?;
    serde_json::from_str(&json_str).map_err(|e| format!("Parse error: {e}"))
}

async fn cmd_planning_get_tonight_targets(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let location: planning::VisibilityLocation = serde_json::from_value(
        payload.get("location").cloned().unwrap_or_default()
    ).map_err(|e| format!("Invalid location: {e}"))?;
    let limit = payload.get("limit").and_then(|v| v.as_i64()).map(|v| v as i32);
    let min_altitude = payload.get("minAltitude").and_then(|v| v.as_f64());

    let json_str = planning::planning_get_tonight_targets(location, limit, min_altitude).await?;
    serde_json::from_str(&json_str).map_err(|e| format!("Parse error: {e}"))
}

async fn cmd_catalog_search(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    // Frontend sends { params: {...} } wrapping the actual CatalogSearchParams
    let inner = payload.get("params").unwrap_or(payload);
    let params: CatalogSearchParams = serde_json::from_value(inner.clone())
        .map_err(|e| format!("Invalid catalog search params: {e}"))?;
    let json_str = catalog_search(params).await?;
    serde_json::from_str(&json_str).map_err(|e| format!("Catalog search parse error: {e}"))
}

async fn cmd_catalog_quick_search(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let query = payload.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let limit = payload.get("limit").and_then(|v| v.as_i64()).map(|v| v as i32);
    let json_str = catalog_quick_search(query, limit).await?;
    serde_json::from_str(&json_str).map_err(|e| format!("Quick search parse error: {e}"))
}

async fn cmd_catalog_get_object_types() -> Result<serde_json::Value, String> {
    let json_str = catalog_get_object_types().await?;
    serde_json::from_str(&json_str).map_err(|e| format!("Object types parse error: {e}"))
}

async fn cmd_catalog_get_solar_system(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let latitude = payload.get("latitude").and_then(|v| v.as_f64());
    let longitude = payload.get("longitude").and_then(|v| v.as_f64());
    let json_str = catalog_get_solar_system(latitude, longitude).await?;
    serde_json::from_str(&json_str).map_err(|e| format!("Solar system parse error: {e}"))
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
