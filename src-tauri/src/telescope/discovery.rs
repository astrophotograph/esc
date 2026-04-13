use crate::database::Database;
use crate::events::{emit_event, event_names};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, State};
use tracing::info;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveredTelescope {
    pub host: String,
    pub port: u16,
    pub protocol: String, // "seestar" or "alpaca"
    pub serial_number: String,
    pub product_model: String,
    pub ssid: String,
    pub discovery_method: String,
}

/// Discover telescopes on the network using native Rust discovery
#[tauri::command]
pub async fn discover_telescopes(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, Database>,
) -> Result<Vec<DiscoveredTelescope>, String> {
    info!("Starting telescope discovery (native Rust)");

    // Use native Rust discovery via scopinator-seestar
    let devices = scopinator_seestar::protocol::discovery::discover(Duration::from_secs(3))
        .await
        .map_err(|e| format!("Discovery failed: {}", e))?;

    // Map DiscoveredDevice to DiscoveredTelescope
    let telescopes: Vec<DiscoveredTelescope> = devices
        .into_iter()
        .map(|device| {
            // Try to extract SSID from raw_response.result.ssid
            let ssid = device
                .raw_response
                .get("result")
                .and_then(|r| r.get("ssid"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            DiscoveredTelescope {
                host: device.address.to_string(),
                port: 4700,
                protocol: "seestar".to_string(),
                serial_number: device.serial_number.unwrap_or_default(),
                product_model: device.product_model.unwrap_or_default(),
                ssid,
                discovery_method: "auto_discovery".to_string(),
            }
        })
        .collect();

    info!("Discovered {} telescopes", telescopes.len());

    // Cleanup stale auto-discovered telescopes (not seen in 1 hour)
    match db.cleanup_stale_telescopes(chrono::Duration::hours(1)) {
        Ok(count) if count > 0 => {
            tracing::info!("Cleaned up {} stale auto-discovered telescopes", count);
        }
        Err(e) => {
            tracing::warn!("Failed to cleanup stale telescopes: {}", e);
        }
        _ => {}
    }

    // Add discovered telescopes to database and state
    let now = chrono::Utc::now();
    for telescope in &telescopes {
        let telescope_id = if !telescope.serial_number.is_empty() {
            telescope.serial_number.clone()
        } else {
            format!("{}:{}", telescope.host, telescope.port)
        };

        // Generate appropriate name based on protocol
        let telescope_name = if telescope.protocol == "alpaca" {
            if !telescope.product_model.is_empty() {
                telescope.product_model.clone()
            } else {
                format!("Alpaca {}", telescope_id)
            }
        } else if !telescope.serial_number.is_empty() {
            format!("Seestar {}", telescope.serial_number)
        } else {
            format!("Telescope {}", telescope_id)
        };

        // Save to database with last_seen timestamp
        let db_telescope = crate::database::models::Telescope {
            id: telescope_id.clone(),
            host: telescope.host.clone(),
            port: telescope.port,
            protocol: Some(telescope.protocol.clone()),
            serial_number: Some(telescope.serial_number.clone()),
            product_model: Some(telescope.product_model.clone()),
            name: Some(telescope_name.clone()),
            location: None,
            discovery_method: Some(telescope.discovery_method.clone()),
            created_at: now,
            updated_at: now,
            last_seen: Some(now),
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
                "Discovery: telescope {} ({}) exists in state: {}",
                telescope_id,
                telescope.protocol,
                already_exists
            );
            if !already_exists {
                drop(telescopes_state);

                let mut telescopes_state = state.telescopes.write();
                telescopes_state.insert(
                    telescope_id.clone(),
                    crate::state::TelescopeConnection {
                        id: telescope_id.clone(),
                        host: telescope.host.clone(),
                        port: telescope.port,
                        protocol: telescope.protocol.clone(),
                        name: telescope_name.clone(),
                        status: crate::state::ConnectionStatus::Disconnected,
                        client: None,
                    },
                );
                tracing::info!(
                    "Discovery: added telescope {} ({}) to state (now {} telescopes)",
                    telescope_id,
                    telescope.protocol,
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
                        "protocol": telescope.protocol,
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
