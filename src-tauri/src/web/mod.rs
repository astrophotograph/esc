//! Standalone web API server — replaces the Python FastAPI backend.
//!
//! Provides the same `/api/{command}` POST interface that the frontend
//! expects, plus MJPEG streaming and static file serving.

// This module is not yet connected to main — allow dead code for future use.
#![allow(dead_code)]

use axum::{
    extract::{Path, Query, State as AxumState},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
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
        .route("/download/image/:telescope_id", get(download_image_handler))
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

/// Make a request body look the way the handlers below read it.
///
/// The frontend calls every command with the argument shape of the Tauri
/// command of the same name, and Tauri is forgiving in two ways these handlers
/// are not: a struct argument arrives nested (`{telescopeId, params: {direction,
/// ...}}`), and top-level names are camelCase on the wire but snake_case in
/// Rust (`exposureMs` / `exposure_ms`). A handler that read the other spelling
/// used to fall back to a default silently — every jog button sent "n", and
/// set-focus sent position 0.
///
/// So: the members of an object-valued `params` are also made available at the
/// top level, and every top-level member is reachable under both spellings.
/// A member that is already present is never overwritten.
fn normalize_payload(payload: serde_json::Value) -> serde_json::Value {
    let serde_json::Value::Object(mut map) = payload else {
        return payload;
    };
    if let Some(serde_json::Value::Object(inner)) = map.get("params").cloned() {
        for (key, value) in inner {
            map.entry(key).or_insert(value);
        }
    }
    let aliases: Vec<(String, serde_json::Value)> = map
        .iter()
        .flat_map(|(key, value)| {
            [to_snake_case(key), to_camel_case(key)]
                .into_iter()
                .filter(move |alias| alias != key)
                .map(move |alias| (alias, value.clone()))
        })
        .collect();
    for (alias, value) in aliases {
        map.entry(alias).or_insert(value);
    }
    serde_json::Value::Object(map)
}

fn to_snake_case(name: &str) -> String {
    let mut out = String::with_capacity(name.len() + 4);
    for c in name.chars() {
        if c.is_ascii_uppercase() {
            out.push('_');
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

fn to_camel_case(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut upper = false;
    for c in name.chars() {
        if c == '_' {
            upper = true;
        } else if upper {
            out.push(c.to_ascii_uppercase());
            upper = false;
        } else {
            out.push(c);
        }
    }
    out
}

/// A required numeric argument; never substitute a default for a value that
/// moves hardware.
fn required_f64(payload: &serde_json::Value, name: &str) -> Result<f64, String> {
    payload
        .get(name)
        .and_then(|v| v.as_f64())
        .ok_or_else(|| format!("Missing {name}"))
}

#[derive(Debug, serde::Deserialize)]
struct DownloadImageQuery {
    format: Option<String>,
    filename: Option<String>,
}

/// `GET /download/image/:telescope_id?format=png|jpg|fits&filename=…`: the
/// stacked image (or the current preview frame when nothing is stacked) as a
/// file download. The web counterpart of the desktop `telescope_save_image`,
/// which writes to the local disk instead.
async fn download_image_handler(
    AxumState(state): AxumState<WebState>,
    Path(telescope_id): Path<String>,
    Query(query): Query<DownloadImageQuery>,
) -> Response {
    use crate::imaging::save::{fetch_and_encode, safe_file_name, SaveFormat};

    let result = async {
        let format = SaveFormat::parse(query.format.as_deref().unwrap_or("png"))?;
        let client = get_client(&state, &telescope_id)?;
        let image = fetch_and_encode(&client, format).await?;
        let name = safe_file_name(query.filename.as_deref().unwrap_or("capture"), format);
        Ok::<_, String>((image, name))
    }
    .await;

    match result {
        Ok((image, name)) => (
            [
                (header::CONTENT_TYPE, image.format.mime().to_string()),
                (
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{name}\""),
                ),
                (header::CACHE_CONTROL, "no-store".to_string()),
            ],
            image.bytes,
        )
            .into_response(),
        Err(e) => err_json(&e),
    }
}

/// True for a command that makes the telescope do something or changes it.
///
/// These are logged with their arguments, so that what was sent to a scope can
/// be read back afterwards. Queries are left out: the frontend polls them
/// every few seconds.
fn changes_telescope(command: &str) -> bool {
    !(command.starts_with("get_")
        || command.starts_with("telescope_get_")
        || command.starts_with("catalog_")
        || command.starts_with("planning_")
        || command == "discover_telescopes")
}

async fn dispatch_command(
    state: &AppState,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let payload = normalize_payload(payload);
    if changes_telescope(command) {
        info!("Web API: {} {}", command, payload);
    }
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
        "telescope_startup" => cmd_startup(state, &payload).await,
        "set_scope_location" => cmd_set_location(state, &payload).await,
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
            // The scope reads this socket line by line: without the terminator the
            // probe stays in its buffer and corrupts the next discovery request
            // (it answers that one with 101 "Second root").
            let msg = b"{\"id\":1,\"method\":\"scan_iscope\",\"params\":\"\"}\r\n";
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
        // The clock is checked after connecting and set only if it is wrong
        // (`ensure_clock`).
        clock_sync: scopinator_seestar::ClockSync::Off,
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
    crate::telescope::ensure_clock(&client, &telescope_id).await;
    crate::telescope::spawn_goto_watcher(state.goto_errors.clone(), telescope_id.clone(), &client);

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
    // The frontend sends the Tauri shape `{telescopeId, params: {target_name, ra, dec}}`;
    // a flat `{telescopeId, targetName, ra, dec}` is accepted too.
    let args = payload.get("params").unwrap_or(payload);
    let target_name = args.get("target_name").or_else(|| args.get("targetName"))
        .and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
    // Never default a missing coordinate: that would slew to RA 0h / Dec 0°.
    let ra = args.get("ra").and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing ra (hours)".to_string())?;
    let dec = args.get("dec").and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing dec (degrees)".to_string())?;

    // scopinator 0.6.0: a goto is `iscope_start_view` in star mode; RA is in hours.
    response_to_json(client.goto(&target_name, ra, dec).await)
}

async fn cmd_park(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::ScopePark).await)
}

async fn cmd_move(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let direction = payload
        .get("direction")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing direction".to_string())?;
    let speed = payload.get("speed").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let duration = payload.get("duration_sec").and_then(|v| v.as_f64()).unwrap_or(5.0);

    let percent = (speed * 100.0) as i32;
    let dur_sec = duration as i32;

    // Cardinal jogs use scopinator's verified EQ-mode Direction→angle mapping
    // (W=0, N=90, E=180, S=270). Diagonals — which the current UI doesn't emit —
    // fall back to the interpolated heading consistent with that mapping.
    let resp = match direction {
        "n" => client.jog(Direction::North, 1, percent, dur_sec).await,
        "s" => client.jog(Direction::South, 1, percent, dur_sec).await,
        "e" => client.jog(Direction::East, 1, percent, dur_sec).await,
        "w" => client.jog(Direction::West, 1, percent, dur_sec).await,
        diag => {
            let angle = match diag {
                "nw" => 45, "ne" => 135, "se" => 225, "sw" => 315,
                _ => return Err(format!("Unknown direction: {direction}")),
            };
            client
                .send_command(Command::ScopeSpeedMove(SpeedMoveParams {
                    angle,
                    level: 1,
                    dur_sec,
                    percent,
                }))
                .await
        }
    };
    response_to_json(resp)
}

async fn cmd_stop_move(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.stop_jog().await)
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
    let position = required_f64(payload, "position")? as i32;
    response_to_json(
        client.send_command(Command::MoveFocuser(MoveFocuserParams {
            step: position,
            ret_step: true,
        })).await,
    )
}

async fn cmd_focus_increment(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let increment = required_f64(payload, "increment")? as i32;

    let current_resp = client.send_command(Command::GetFocuserPosition).await
        .map_err(|e| format!("Failed to get focuser position: {e}"))?;
    let current_pos = current_resp.result
        .as_ref()
        .and_then(|v| v.get("step"))
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "Focuser position unknown; not moving".to_string())? as i32;

    response_to_json(
        client.send_command(Command::MoveFocuser(MoveFocuserParams {
            step: current_pos + increment,
            ret_step: true,
        })).await,
    )
}

async fn cmd_auto_focus(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.start_auto_focus().await)
}

/// Send the startup sequence: set the scope clock (UTC) and observing location.
/// Returns the scope's `pi_is_verified` status.
async fn cmd_startup(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let lat = payload.get("lat").or_else(|| payload.get("latitude"))
        .and_then(|v| v.as_f64()).ok_or("Missing lat")?;
    let lon = payload.get("lon").or_else(|| payload.get("longitude"))
        .and_then(|v| v.as_f64()).ok_or("Missing lon")?;
    let verified = client.startup(lat, lon).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "verified": verified }))
}

/// Set the scope's observing location. Sent only when the user asks for it.
async fn cmd_set_location(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let lat = required_f64(payload, "lat")?;
    let lon = required_f64(payload, "lon")?;
    response_to_json(
        client
            .send_command(Command::SetUserLocation(
                scopinator_seestar::command::params::SetUserLocationParams { lat, lon, force: true },
            ))
            .await,
    )
}

async fn cmd_get_focuser_position(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    response_to_json(client.send_command(Command::GetFocuserPosition).await)
}

async fn cmd_imaging_start(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let target_name = payload.get("targetName").or_else(|| payload.get("target_name"))
        .and_then(|v| v.as_str()).map(String::from);
    // A view that is already running (a stack, most importantly) is left
    // alone: starting a view again would end it. Only the stream is armed.
    if let Some(stage) = crate::telescope::fetch_running_view_stage(&client).await {
        if let Err(e) = client.begin_streaming().await {
            tracing::warn!("Web API: begin_streaming failed for running view: {}", e);
        }
        return Ok(serde_json::json!({ "success": true, "already_running": stage }));
    }
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
    // No stage = stop the whole view. Stopping only the Stack stage leaves the
    // view working, and the scope then refuses a view plan with 268.
    response_to_json(client.send_command(Command::IscopeStopView(None)).await)
}

async fn cmd_set_gain(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let gain = required_f64(payload, "gain")? as i32;
    response_to_json(
        client.send_command(Command::SetControlValue("gain".to_string(), gain)).await,
    )
}

async fn cmd_set_exposure(state: &AppState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let client = get_client(state, &tid(payload)?)?;
    let exposure_ms = required_f64(payload, "exposure_ms")? as i64;
    response_to_json(
        client.send_command(Command::SetSetting(SettingParams {
            // `exp_ms` is an object on the wire; a bare number is refused
            // ("expected object param"). This is the stacking sub-exposure.
            exp_ms: Some(serde_json::json!({ "stack_l": exposure_ms })),
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
    // A server cannot write to the user's computer: the web frontend downloads
    // the image from GET /download/image/:telescope_id instead.
    let _ = client;
    Err("In the web version, download the image from /download/image/<telescopeId>".to_string())
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

    let mut status = status;
    status.goto_error = state.goto_errors.read().get(&telescope_id).cloned();

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

    let plan: ViewPlan =
        serde_json::from_value(plan).map_err(|e| format!("Invalid plan: {e}"))?;

    let resp = client
        .send_command(Command::SetViewPlan(Box::new(plan)))
        .await
        .map_err(|e| format!("Command failed: {e}"))?;

    let code = resp.code;
    let message = crate::telescope::view_plan_message(code);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actions_are_logged_and_polled_queries_are_not() {
        for action in ["connect_telescope", "telescope_startup", "imaging_start", "telescope_reboot", "telescope_move"] {
            assert!(changes_telescope(action), "{action}");
        }
        for query in ["get_telescope_status", "get_telescopes", "telescope_get_stacking_status", "catalog_search"] {
            assert!(!changes_telescope(query), "{query}");
        }
    }
    use serde_json::json;

    #[test]
    fn nested_params_are_readable_at_the_top_level() {
        // What the jog buttons send (TelescopeControlsOverlay).
        let p = normalize_payload(json!({
            "telescopeId": "t1",
            "params": { "direction": "w", "speed": 1.0, "duration_sec": 5.0 }
        }));
        assert_eq!(p["direction"], "w");
        assert_eq!(p["duration_sec"], 5.0);
        assert_eq!(p["params"]["direction"], "w");
    }

    #[test]
    fn top_level_names_are_readable_in_both_spellings() {
        let p = normalize_payload(json!({ "telescopeId": "t1", "exposureMs": 2000 }));
        assert_eq!(p["exposure_ms"], 2000);
        assert_eq!(p["telescope_id"], "t1");

        let p = normalize_payload(json!({ "target_name": "M31" }));
        assert_eq!(p["targetName"], "M31");
    }

    #[test]
    fn an_existing_member_is_never_overwritten() {
        let p = normalize_payload(json!({
            "direction": "n",
            "params": { "direction": "s" },
            "exposure_ms": 1, "exposureMs": 2
        }));
        assert_eq!(p["direction"], "n");
        assert_eq!(p["exposure_ms"], 1);
        assert_eq!(p["exposureMs"], 2);
    }

    #[test]
    fn non_object_payloads_pass_through() {
        assert_eq!(normalize_payload(json!(null)), json!(null));
        assert_eq!(normalize_payload(json!({ "params": "x" }))["params"], "x");
    }

    #[tokio::test]
    async fn hardware_moving_commands_refuse_missing_arguments() {
        // No telescope is registered, so a complete request stops at the
        // lookup; an incomplete one must be rejected rather than defaulted.
        let state = AppState::default();
        for (command, body, missing) in [
            ("telescope_move", json!({ "telescopeId": "t1", "params": {} }), "direction"),
            ("telescope_focus", json!({ "telescopeId": "t1" }), "position"),
            ("telescope_focus_increment", json!({ "telescopeId": "t1" }), "increment"),
            ("telescope_set_gain", json!({ "telescopeId": "t1" }), "gain"),
            ("telescope_set_exposure", json!({ "telescopeId": "t1" }), "exposure_ms"),
        ] {
            let err = dispatch_command(&state, command, body).await.unwrap_err();
            assert!(
                err.contains("not found") || err.contains(missing),
                "{command}: {err}"
            );
        }
    }
}
