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

/// Add a telescope manually by host and port
#[tauri::command]
pub async fn add_telescope(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, Database>,
    config: TelescopeConfig,
) -> Result<String, String> {
    tracing::info!("Adding telescope: {}:{}", config.host, config.port);

    // Create telescope entry in database
    let telescope = crate::database::models::Telescope {
        id: config.id.clone(),
        host: config.host.clone(),
        port: config.port,
        serial_number: None,
        product_model: None,
        name: config.name.clone(),
        location: None,
        discovery_method: Some("manual".to_string()),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    db.save_telescope(&telescope)
        .map_err(|e| format!("Failed to save telescope: {}", e))?;

    // Create a placeholder bridge object (will be replaced on connect)
    use pyo3::prelude::*;
    use std::sync::Arc;
    let placeholder_bridge = Python::with_gil(|py| -> PyObject {
        py.None()
    });

    // Add to state
    let telescope_name = config.name.clone().unwrap_or_else(|| format!("{}:{}", config.host, config.port));
    {
        let mut telescopes = state.telescopes.write();
        telescopes.insert(
            config.id.clone(),
            crate::state::TelescopeConnection {
                id: config.id.clone(),
                host: config.host.clone(),
                port: config.port,
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
    tracing::info!("Connecting to telescope: {}", telescope_id);

    // Get telescope info from state and update status
    let (host, port) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;

        let host = telescope.host.clone();
        let port = telescope.port;
        drop(telescopes);

        // Update status to connecting
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = crate::state::ConnectionStatus::Connecting;
        }

        (host, port)
    };

    // Create Python bridge object and connect
    let bridge_helper = TelescopeBridge::new(&host, port)?;
    let bridge_obj = bridge_helper.create_bridge_object()?;

    // Clone the bridge object using Python GIL
    use pyo3::prelude::*;
    let bridge_clone = Python::with_gil(|py| bridge_obj.clone_ref(py));

    let result = tokio::task::spawn_blocking(move || {
        TelescopeBridge::new(&host, port)
            .and_then(|b| b.connect())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // Update status and store bridge based on result
    {
        use std::sync::Arc;
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            if result.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                t.status = crate::state::ConnectionStatus::Connected;
                t.bridge = Arc::new(bridge_clone);
                emit_event(
                    &app,
                    event_names::TELESCOPE_CONNECTED,
                    serde_json::json!({ "id": telescope_id }),
                )?;
            } else {
                let error = result.get("error")
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
    let (host, port) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port)
    };

    // Disconnect via Python bridge
    let bridge = TelescopeBridge::new(&host, port)?;
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

    let (host, port) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port)
    };

    let bridge = TelescopeBridge::new(&host, port)?;
    let target_name = params.target_name.clone();
    let ra = params.ra;
    let dec = params.dec;

    let result = tokio::task::spawn_blocking(move || bridge.goto_target(&target_name, ra, dec))
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

    let (host, port) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| format!("Telescope {} not found", telescope_id))?;
        (telescope.host.clone(), telescope.port)
    };

    let bridge = TelescopeBridge::new(&host, port)?;
    let result = tokio::task::spawn_blocking(move || bridge.park())
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
