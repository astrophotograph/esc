use crate::database::Database;
use crate::events::{emit_event, event_names};
use crate::python::TelescopeBridge;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

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

    // Create a placeholder bridge object (will be replaced on connect)
    use pyo3::prelude::*;
    use std::sync::Arc;
    let placeholder_bridge = Python::with_gil(|py| -> PyObject { py.None() });

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
                bridge: Arc::new(placeholder_bridge),
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
) -> Result<String, String> {
    tracing::info!("connect_telescope: starting for telescope_id={}", telescope_id);

    // Get telescope info from state and update status
    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let all_ids: Vec<_> = telescopes.keys().collect();
        tracing::info!(
            "connect_telescope: looking up telescope '{}', available telescopes: {:?}",
            telescope_id,
            all_ids
        );
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| {
                tracing::error!("connect_telescope: Telescope {} not found in state!", telescope_id);
                format!("Telescope {} not found", telescope_id)
            })?;

        let host = telescope.host.clone();
        let port = telescope.port;
        let protocol = telescope.protocol.clone();
        drop(telescopes);

        // Update status to connecting
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = crate::state::ConnectionStatus::Connecting;
        }

        (host, port, protocol)
    };

    // Create Python bridge object using the unified bridge with protocol support
    tracing::info!("connect_telescope: creating bridge for {}:{} (protocol: {})", host, port, protocol);
    let bridge_helper = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let bridge_obj = bridge_helper.create_bridge_object()?;
    tracing::info!("connect_telescope: bridge created, calling connect method");

    // Clone the bridge object using Python GIL
    use pyo3::prelude::*;
    let bridge_clone = Python::with_gil(|py| bridge_obj.clone_ref(py));

    // Connect using the bridge object (not a new instance!)
    let result: serde_json::Value =
        tokio::task::spawn_blocking(move || -> Result<serde_json::Value, String> {
            Python::with_gil(|py| {
                // Import the unified bridge module
                let telescope_module = py
                    .import("telescope.telescope_bridge")
                    .map_err(|e| format!("Failed to import module: {}", e))?;
                let run_method = telescope_module
                    .getattr("run_bridge_method")
                    .map_err(|e| format!("Failed to get run_bridge_method: {}", e))?;

                // Call connect on the actual bridge object
                let bridge_bound = bridge_obj.bind(py);
                let result = run_method
                    .call1((bridge_bound, "connect", py.None()))
                    .map_err(|e| format!("Failed to call connect: {}", e))?;

                // Convert to JSON
                let json_module = py
                    .import("json")
                    .map_err(|e| format!("Failed to import json: {}", e))?;
                let json_str: String = json_module
                    .call_method1("dumps", (result,))
                    .map_err(|e| format!("Failed to serialize: {}", e))?
                    .extract()
                    .map_err(|e| format!("Failed to extract string: {}", e))?;

                serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
            })
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

    tracing::info!("connect_telescope: connect result: {:?}", result);

    // Update status and store bridge based on result
    {
        use std::sync::Arc;
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            if result
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                t.status = crate::state::ConnectionStatus::Connected;
                t.bridge = Arc::new(bridge_clone);
                emit_event(
                    &app,
                    event_names::TELESCOPE_CONNECTED,
                    serde_json::json!({ "id": telescope_id }),
                )?;
            } else {
                let error = result
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                t.status = crate::state::ConnectionStatus::Error(error.to_string());
                emit_event(
                    &app,
                    event_names::TELESCOPE_ERROR,
                    serde_json::json!({ "id": telescope_id, "error": error }),
                )?;
            }
        }
    }

    Ok(serde_json::to_string(&result).unwrap())
}

/// Disconnect from a telescope
#[tauri::command]
pub async fn disconnect_telescope(
    app: AppHandle,
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<String, String> {
    tracing::info!("Disconnecting from telescope: {}", telescope_id);

    // Get telescope info
    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    // Disconnect via Python bridge
    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let result = tokio::task::spawn_blocking(move || bridge.disconnect())
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

    // Update status
    {
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = crate::state::ConnectionStatus::Disconnected;
        }
    }

    emit_event(
        &app,
        event_names::TELESCOPE_DISCONNECTED,
        serde_json::json!({ "id": telescope_id }),
    )?;

    Ok(serde_json::to_string(&result).unwrap())
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

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let target_name = params.target_name.clone();
    let ra = params.ra;
    let dec = params.dec;

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create params dict
            let params_dict = PyDict::new(py);
            params_dict
                .set_item("target_name", &target_name)
                .map_err(|e| format!("Failed to set target_name: {}", e))?;
            params_dict
                .set_item("ra", ra)
                .map_err(|e| format!("Failed to set ra: {}", e))?;
            params_dict
                .set_item("dec", dec)
                .map_err(|e| format!("Failed to set dec: {}", e))?;

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "goto_target", params_dict))
                .map_err(|e| format!("goto_target call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "park"))
                .map_err(|e| format!("park call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let direction = params.direction.clone();
    let speed = params.speed.unwrap_or(1.0);
    let duration = params.duration_sec.unwrap_or(5.0);

    // Use the stored bridge to call the move method
    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create params dict
            let params_dict = PyDict::new(py);
            params_dict
                .set_item("direction", &direction)
                .map_err(|e| format!("Failed to set direction: {}", e))?;
            params_dict
                .set_item("speed", speed)
                .map_err(|e| format!("Failed to set speed: {}", e))?;
            params_dict
                .set_item("duration_sec", duration)
                .map_err(|e| format!("Failed to set duration_sec: {}", e))?;

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "move", params_dict))
                .map_err(|e| format!("move call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "stop_move"))
                .map_err(|e| format!("stop_move call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create params dict
            let params_dict = PyDict::new(py);
            params_dict
                .set_item("position", position)
                .map_err(|e| format!("Failed to set position: {}", e))?;

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "focus", params_dict))
                .map_err(|e| format!("focus call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create params dict
            let params_dict = PyDict::new(py);
            params_dict
                .set_item("increment", increment)
                .map_err(|e| format!("Failed to set increment: {}", e))?;

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "focus_increment", params_dict))
                .map_err(|e| format!("focus_increment call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let result = tokio::task::spawn_blocking(move || {
        bridge.call_method("auto_focus", serde_json::json!({}))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let exposure_ms = params.exposure_ms;
    let gain = params.gain;
    let target_name = params.target_name.clone();

    let result = tokio::task::spawn_blocking(move || {
        bridge.call_method(
            "start_imaging",
            serde_json::json!({
                "exposure_ms": exposure_ms,
                "gain": gain,
                "target_name": target_name,
            }),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let result = tokio::task::spawn_blocking(move || {
        bridge.call_method("stop_imaging", serde_json::json!({}))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let result = tokio::task::spawn_blocking(move || {
        bridge.call_method("set_gain", serde_json::json!({ "gain": gain }))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let result = tokio::task::spawn_blocking(move || {
        bridge.call_method(
            "set_exposure",
            serde_json::json!({ "exposure_ms": exposure_ms }),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

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

    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let result =
        tokio::task::spawn_blocking(move || bridge.call_method("stop_goto", serde_json::json!({})))
            .await
            .map_err(|e| format!("Task join error: {}", e))??;

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

    let (host, port, protocol) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port, telescope.protocol.clone())
    };

    let bridge = TelescopeBridge::new_with_protocol(&host, port, &protocol)?;
    let result = tokio::task::spawn_blocking(move || {
        bridge.call_method("get_focuser_position", serde_json::json!({}))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(serde_json::to_string(&result).unwrap())
}

/// Start recording video
#[tauri::command]
pub async fn telescope_start_recording(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Start recording for telescope {}", telescope_id);

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create empty params dict
            let params_dict = PyDict::new(py);

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "start_recording", params_dict))
                .map_err(|e| format!("start_recording call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

/// Stop recording video
#[tauri::command]
pub async fn telescope_stop_recording(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Stop recording for telescope {}", telescope_id);

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create empty params dict
            let params_dict = PyDict::new(py);

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "stop_recording", params_dict))
                .map_err(|e| format!("stop_recording call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

/// Run plate solving on current image
#[tauri::command]
pub async fn telescope_plate_solve(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Plate solve for telescope {}", telescope_id);

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create empty params dict
            let params_dict = PyDict::new(py);

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "plate_solve", params_dict))
                .map_err(|e| format!("plate_solve call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

/// Reboot telescope system
#[tauri::command]
pub async fn telescope_reboot(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Reboot telescope {}", telescope_id);

    // Get the stored bridge from state
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Err("Telescope not connected".to_string());
        }

        telescope.bridge.clone()
    };

    let result = tokio::task::spawn_blocking(move || {
        use pyo3::prelude::*;
        use pyo3::types::PyDict;

        Python::with_gil(|py| -> Result<serde_json::Value, String> {
            let telescope_module = py
                .import("telescope.telescope_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Create empty params dict
            let params_dict = PyDict::new(py);

            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "reboot", params_dict))
                .map_err(|e| format!("reboot call failed: {}", e))?;

            // Convert result to JSON
            let json_module = py
                .import("json")
                .map_err(|e| format!("Failed to import json: {}", e))?;
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract string: {}", e))?;

            serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}
