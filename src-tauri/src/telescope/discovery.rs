use crate::database::Database;
use crate::events::{emit_event, event_names};
use crate::state::AppState;
use pyo3::prelude::*;
use pyo3::types::PyList;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tracing::info;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveredTelescope {
    pub host: String,
    pub port: u16,
    pub serial_number: String,
    pub product_model: String,
    pub ssid: String,
    pub discovery_method: String,
}

/// Discover Seestar telescopes on the network
#[tauri::command]
pub async fn discover_telescopes(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, Database>,
) -> Result<Vec<DiscoveredTelescope>, String> {
    info!("Starting telescope discovery");

    // Call Python discovery function
    let telescopes = tokio::task::spawn_blocking(|| {
        Python::with_gil(|py| -> Result<Vec<DiscoveredTelescope>, String> {
            // Import discovery module
            let discovery_module = py
                .import("telescope.discovery")
                .map_err(|e| format!("Failed to import discovery module: {}", e))?;

            // Call discover_telescopes_sync
            let discover_fn = discovery_module
                .getattr("discover_telescopes_sync")
                .map_err(|e| format!("Failed to get discover function: {}", e))?;

            // Call with 3 second timeout
            let result = discover_fn
                .call1((3.0,))
                .map_err(|e| format!("Discovery failed: {}", e))?;

            // Convert Python list to Rust Vec
            let py_list = result
                .downcast::<PyList>()
                .map_err(|e| format!("Result is not a list: {}", e))?;

            let mut telescopes = Vec::new();

            for item in py_list.iter() {
                let host: String = item
                    .get_item("host")
                    .map_err(|e| format!("No host field: {}", e))?
                    .extract()
                    .map_err(|e| format!("Invalid host: {}", e))?;

                let port: u16 = item
                    .get_item("port")
                    .map_err(|e| format!("No port field: {}", e))?
                    .extract()
                    .map_err(|e| format!("Invalid port: {}", e))?;

                let serial_number: String = item
                    .get_item("serial_number")
                    .ok()
                    .and_then(|v| v.extract().ok())
                    .unwrap_or_default();

                let product_model: String = item
                    .get_item("product_model")
                    .ok()
                    .and_then(|v| v.extract().ok())
                    .unwrap_or_default();

                let ssid: String = item
                    .get_item("ssid")
                    .ok()
                    .and_then(|v| v.extract().ok())
                    .unwrap_or_default();

                let discovery_method: String = item
                    .get_item("discovery_method")
                    .ok()
                    .and_then(|v| v.extract().ok())
                    .unwrap_or_else(|| "auto_discovery".to_string());

                telescopes.push(DiscoveredTelescope {
                    host,
                    port,
                    serial_number,
                    product_model,
                    ssid,
                    discovery_method,
                });
            }

            Ok(telescopes)
        })
    })
    .await
    .map_err(|e| format!("Task error: {}", e))??;

    info!("Discovered {} telescopes", telescopes.len());

    // Add discovered telescopes to database and state
    for telescope in &telescopes {
        let telescope_id = if !telescope.serial_number.is_empty() {
            telescope.serial_number.clone()
        } else {
            format!("{}:{}", telescope.host, telescope.port)
        };

        // Save to database
        let db_telescope = crate::database::models::Telescope {
            id: telescope_id.clone(),
            host: telescope.host.clone(),
            port: telescope.port,
            serial_number: Some(telescope.serial_number.clone()),
            product_model: Some(telescope.product_model.clone()),
            name: Some(format!("Seestar {}", telescope.serial_number)),
            location: None,
            discovery_method: Some(telescope.discovery_method.clone()),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        if let Err(e) = db.save_telescope(&db_telescope) {
            tracing::warn!(
                "Failed to save discovered telescope {}: {}",
                telescope_id,
                e
            );
        }

        // Add to state if not already present
        {
            let telescopes_state = state.telescopes.read();
            let already_exists = telescopes_state.contains_key(&telescope_id);
            tracing::info!(
                "Discovery: telescope {} exists in state: {}",
                telescope_id,
                already_exists
            );
            if !already_exists {
                drop(telescopes_state);

                // Create placeholder bridge
                let placeholder_bridge = Python::with_gil(|py| py.None());

                let mut telescopes_state = state.telescopes.write();
                telescopes_state.insert(
                    telescope_id.clone(),
                    crate::state::TelescopeConnection {
                        id: telescope_id.clone(),
                        host: telescope.host.clone(),
                        port: telescope.port,
                        name: format!("Seestar {}", telescope.serial_number),
                        status: crate::state::ConnectionStatus::Disconnected,
                        bridge: Arc::new(placeholder_bridge),
                    },
                );
                tracing::info!(
                    "Discovery: added telescope {} to state (now {} telescopes)",
                    telescope_id,
                    telescopes_state.len()
                );

                // Emit discovery event
                emit_event(
                    &app,
                    event_names::TELESCOPE_DISCOVERED,
                    serde_json::json!({
                        "id": telescope_id,
                        "host": telescope.host,
                        "port": telescope.port,
                        "serial_number": telescope.serial_number,
                        "product_model": telescope.product_model,
                    }),
                )
                .ok();
            }
        }
    }

    Ok(telescopes)
}
