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

    // Get the native client from state
    let client = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| "Telescope not found".to_string())?;

        // Check if connected
        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Ok(disconnected_status);
        }

        match telescope.client.clone() {
            Some(c) => c,
            None => {
                error!("Telescope {} connected but no native client available", telescope_id);
                return Err("No native client available".to_string());
            }
        }
    };

    // Issue commands in parallel for efficiency
    let (device_result, coord_result, view_result) = tokio::join!(
        client.send_command(Command::GetDeviceState),
        client.send_command(Command::ScopeGetEquCoord),
        client.send_command(Command::GetViewState),
    );

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

    // Parse GetDeviceState response
    match device_result {
        Ok(resp) if resp.is_success() => {
            if let Some(result_val) = resp.result {
                match serde_json::from_value::<DeviceStateResult>(result_val.clone()) {
                    Ok(device_state) => {
                        // Pi status: battery, temperature
                        if let Some(pi) = &device_state.pi_status {
                            status.battery_percent =
                                pi.battery_capacity.map(|v| v as f32);
                            status.temperature_c =
                                pi.temp.map(|v| v as f32);
                        }

                        // Mount: tracking + mode
                        if let Some(mount) = &device_state.mount {
                            status.is_tracking = mount.tracking;
                            status.mount_type = mount.equ_mode.map(|eq| {
                                if eq { "Equatorial".to_string() } else { "Alt-Az".to_string() }
                            });
                        }

                        // Focuser: position
                        if let Some(focuser) = &device_state.focuser {
                            status.focus_position = focuser.step;
                        }

                        // Storage: free/total MB
                        if let Some(storage) = &device_state.storage {
                            status.free_mb = storage
                                .get("free_mb")
                                .and_then(|v| v.as_i64())
                                .map(|v| v as i32);
                            status.total_mb = storage
                                .get("total_mb")
                                .and_then(|v| v.as_i64())
                                .map(|v| v as i32);
                        }

                        // Balance sensor
                        if let Some(balance) = &device_state.balance_sensor {
                            let x = balance.get("x").and_then(|v| v.as_f64());
                            let y = balance.get("y").and_then(|v| v.as_f64());
                            let z = balance.get("z").and_then(|v| v.as_f64());
                            let angle = balance.get("angle").and_then(|v| v.as_f64());
                            if x.is_some() || y.is_some() || z.is_some() || angle.is_some() {
                                status.balance_sensor =
                                    Some(BalanceSensorData { x, y, z, angle });
                            }
                        }

                        // Setting (embedded in device state): gain, exposure
                        if let Some(setting) = &device_state.setting {
                            status.gain = setting
                                .get("gain")
                                .and_then(|v| v.as_i64())
                                .map(|v| v as i32);
                        }
                    }
                    Err(e) => {
                        error!("Failed to parse DeviceStateResult: {} | Raw JSON: {}", e, result_val);
                    }
                }
            }
        }
        Ok(resp) => {
            error!(
                "GetDeviceState returned error code {}: {:?}",
                resp.code, resp.error
            );
        }
        Err(e) => {
            error!("GetDeviceState command failed: {}", e);
        }
    }

    // Parse ScopeGetEquCoord response (ra/dec in degrees)
    match coord_result {
        Ok(resp) if resp.is_success() => {
            if let Some(result_val) = resp.result {
                status.ra = result_val
                    .get("ra")
                    .and_then(|v| v.as_f64());
                status.dec = result_val
                    .get("dec")
                    .and_then(|v| v.as_f64());
            }
        }
        Ok(resp) => {
            error!(
                "ScopeGetEquCoord returned error code {}: {:?}",
                resp.code, resp.error
            );
        }
        Err(e) => {
            error!("ScopeGetEquCoord command failed: {}", e);
        }
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
            error!(
                "GetViewState returned error code {}: {:?}",
                resp.code, resp.error
            );
        }
        Err(e) => {
            error!("GetViewState command failed: {}", e);
        }
    }

    Ok(status)
}
