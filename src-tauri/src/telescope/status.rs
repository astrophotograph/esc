use crate::state::AppState;
use scopinator_seestar::command::Command;
use scopinator_seestar::response::DeviceStateResult;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::error;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BalanceSensorData {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub z: Option<f64>,
    pub angle: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TelescopeStatus {
    pub connected: bool,
    pub battery_percent: Option<f32>,
    pub temperature_c: Option<f32>,
    pub humidity_percent: Option<f32>,
    pub dew_heater_power: Option<i32>,
    pub ra: Option<f64>,
    pub dec: Option<f64>,
    pub is_goto: Option<bool>,
    pub is_tracking: Option<bool>,
    pub mount_type: Option<String>,
    pub view_state: Option<String>,
    pub gain: Option<i32>,
    pub focus_position: Option<i32>,
    pub stacked_frame: Option<i32>,
    pub target_name: Option<String>,
    pub free_mb: Option<i32>,
    pub total_mb: Option<i32>,
    pub balance_sensor: Option<BalanceSensorData>,
}

/// Get current telescope status
#[tauri::command]
pub async fn get_telescope_status(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<TelescopeStatus, String> {
    let disconnected_status = TelescopeStatus {
        connected: false,
        battery_percent: None,
        temperature_c: None,
        humidity_percent: None,
        dew_heater_power: None,
        ra: None,
        dec: None,
        is_goto: None,
        is_tracking: None,
        mount_type: None,
        view_state: None,
        gain: None,
        focus_position: None,
        stacked_frame: None,
        target_name: None,
        free_mb: None,
        total_mb: None,
        balance_sensor: None,
    };

    // Extract connection state inside a scoped block so the read guard is
    // dropped before any await points (required for Send futures).
    let (is_connected, maybe_client) = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| "Telescope not found".to_string())?;
        let is_connected = matches!(telescope.status, crate::state::ConnectionStatus::Connected);
        (is_connected, telescope.client.clone())
    };

    // If the telescope is marked Disconnected but still has a client, scopinator
    // may have already self-reconnected — try a single lightweight probe first.
    let client = match (is_connected, maybe_client) {
        (true, Some(c)) => c,
        (true, None) => {
            error!("Telescope {} connected but no native client", telescope_id);
            return Err("No native client available".to_string());
        }
        (false, Some(c)) => {
            match c.send_command(Command::GetViewState).await {
                Ok(_) => {
                    // Scopinator has reconnected — promote back to Connected
                    let mut tw = state.telescopes.write();
                    if let Some(t) = tw.get_mut(&telescope_id) {
                        t.status = crate::state::ConnectionStatus::Connected;
                    }
                    c
                }
                Err(_) => return Ok(disconnected_status),
            }
        }
        (false, None) => return Ok(disconnected_status),
    };

    // Issue commands in parallel for efficiency
    let (device_result, coord_result, view_result) = tokio::join!(
        client.send_command(Command::GetDeviceState),
        client.send_command(Command::ScopeGetEquCoord),
        client.send_command(Command::GetViewState),
    );

    // If all three commands failed (likely a dead connection), mark disconnected
    let all_failed = device_result.is_err() && coord_result.is_err() && view_result.is_err();
    if all_failed {
        let first_err = device_result.as_ref().unwrap_err().to_string();
        error!(
            "All status commands failed for telescope {} ({}), marking disconnected",
            telescope_id, first_err
        );
        let mut telescopes = state.telescopes.write();
        if let Some(t) = telescopes.get_mut(&telescope_id) {
            t.status = crate::state::ConnectionStatus::Disconnected;
            // Keep the client — scopinator will self-reconnect on its own.
            // The probe in the next poll will detect when it's back.
        }
        return Ok(disconnected_status);
    }

    let mut status = TelescopeStatus {
        connected: true,
        battery_percent: None,
        temperature_c: None,
        humidity_percent: None,
        dew_heater_power: None,
        ra: None,
        dec: None,
        is_goto: None,
        is_tracking: None,
        mount_type: None,
        view_state: None,
        gain: None,
        focus_position: None,
        stacked_frame: None,
        target_name: None,
        free_mb: None,
        total_mb: None,
        balance_sensor: None,
    };

    // Parse GetDeviceState response.
    // The Seestar sometimes returns data even with a non-zero code, so we
    // attempt to parse any result payload regardless of success flag.
    match device_result {
        Ok(resp) => {
            if !resp.is_success() {
                tracing::debug!(
                    "GetDeviceState non-zero code {} for {}: {:?}",
                    resp.code, telescope_id, resp.error
                );
            }
            if let Some(result_val) = resp.result {
                tracing::debug!("GetDeviceState raw result: {}", result_val);
                match serde_json::from_value::<DeviceStateResult>(result_val.clone()) {
                    Ok(device_state) => {
                        if let Some(pi) = &device_state.pi_status {
                            status.battery_percent = pi.battery_capacity.map(|v| v as f32);
                            status.temperature_c = pi.temp.map(|v| v as f32);
                        }
                        if let Some(mount) = &device_state.mount {
                            status.is_tracking = mount.tracking;
                            status.mount_type = mount.equ_mode.map(|eq| {
                                if eq { "Equatorial".to_string() } else { "Alt-Az".to_string() }
                            });
                        }
                        if let Some(focuser) = &device_state.focuser {
                            status.focus_position = focuser.step;
                        }
                        if let Some(storage) = &device_state.storage {
                            status.free_mb = storage.get("free_mb").and_then(|v| v.as_i64()).map(|v| v as i32);
                            status.total_mb = storage.get("total_mb").and_then(|v| v.as_i64()).map(|v| v as i32);
                        }
                        if let Some(balance) = &device_state.balance_sensor {
                            let x = balance.get("x").and_then(|v| v.as_f64());
                            let y = balance.get("y").and_then(|v| v.as_f64());
                            let z = balance.get("z").and_then(|v| v.as_f64());
                            let angle = balance.get("angle").and_then(|v| v.as_f64());
                            if x.is_some() || y.is_some() || z.is_some() || angle.is_some() {
                                status.balance_sensor = Some(BalanceSensorData { x, y, z, angle });
                            }
                        }
                        if let Some(setting) = &device_state.setting {
                            status.gain = setting.get("gain").and_then(|v| v.as_i64()).map(|v| v as i32);
                        }
                    }
                    Err(e) => {
                        tracing::debug!("Failed to parse DeviceStateResult: {} | raw: {}", e, result_val);
                    }
                }
            }
        }
        Err(e) => tracing::debug!("GetDeviceState failed for {}: {}", telescope_id, e),
    }

    // Parse ScopeGetEquCoord — fails normally when no goto has been done yet.
    match coord_result {
        Ok(resp) => {
            if let Some(result_val) = resp.result {
                status.ra = result_val.get("ra").and_then(|v| v.as_f64());
                status.dec = result_val.get("dec").and_then(|v| v.as_f64());
            } else if !resp.is_success() {
                tracing::debug!("ScopeGetEquCoord code {} for {}", resp.code, telescope_id);
            }
        }
        Err(e) => tracing::debug!("ScopeGetEquCoord failed for {}: {}", telescope_id, e),
    }

    // Parse GetViewState response
    match view_result {
        Ok(resp) if resp.is_success() => {
            if let Some(result_val) = resp.result {
                // View state info
                let view = result_val.get("View").or_else(|| result_val.get("view"));
                if let Some(view_val) = view {
                    status.view_state = view_val
                        .get("state")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    status.is_goto = view_val
                        .get("state")
                        .and_then(|v| v.as_str())
                        .map(|s| s == "SlewComplete" || s.contains("Goto"));
                    status.target_name = view_val
                        .get("target_name")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    status.stacked_frame = view_val
                        .get("stacked_frame")
                        .and_then(|v| v.as_i64())
                        .map(|v| v as i32);

                    // Gain can also come from view state
                    if status.gain.is_none() {
                        status.gain = view_val
                            .get("gain")
                            .and_then(|v| v.as_i64())
                            .map(|v| v as i32);
                    }
                }
            }
        }
        Ok(resp) => {
            tracing::debug!("GetViewState code {} for {}: {:?}", resp.code, telescope_id, resp.error);
        }
        Err(e) => tracing::debug!("GetViewState failed for {}: {}", telescope_id, e),
    }

    Ok(status)
}
