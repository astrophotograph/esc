use crate::state::AppState;
use pyo3::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::error;

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
    pub view_state: Option<String>,
    pub gain: Option<i32>,
    pub focus_position: Option<i32>,
    pub stacked_frame: Option<i32>,
    pub target_name: Option<String>,
}

/// Get current telescope status
#[tauri::command]
pub async fn get_telescope_status(
    state: State<'_, AppState>,
    telescope_id: String,
) -> Result<TelescopeStatus, String> {
    // Get the telescope's bridge
    let bridge = {
        let telescopes = state.telescopes.read();
        let telescope = telescopes
            .get(&telescope_id)
            .ok_or_else(|| "Telescope not found".to_string())?;

        // Check if connected
        if !matches!(telescope.status, crate::state::ConnectionStatus::Connected) {
            return Ok(TelescopeStatus {
                connected: false,
                battery_percent: None,
                temperature_c: None,
                humidity_percent: None,
                dew_heater_power: None,
                ra: None,
                dec: None,
                is_goto: None,
                is_tracking: None,
                view_state: None,
                gain: None,
                focus_position: None,
                stacked_frame: None,
                target_name: None,
            });
        }

        telescope.bridge.clone()
    };

    // Call get_status on the bridge
    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| -> Result<TelescopeStatus, String> {
            // Import the helper function
            let telescope_module = py
                .import("telescope.seestar_bridge")
                .map_err(|e| format!("Failed to import module: {}", e))?;

            let run_async = telescope_module
                .getattr("_run_async")
                .map_err(|e| format!("Failed to get _run_async: {}", e))?;

            // Call get_status
            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            let result = run_async
                .call1((bridge_bound, "get_status"))
                .map_err(|e| format!("get_status call failed: {}", e))?;

            // Extract the result dict
            let success: bool = result
                .get_item("success")
                .map_err(|e| format!("No success field: {}", e))?
                .extract()
                .map_err(|e| format!("Invalid success value: {}", e))?;

            if !success {
                let error: String = result
                    .get_item("error")
                    .ok()
                    .and_then(|v| v.extract().ok())
                    .unwrap_or_else(|| "Unknown error".to_string());
                return Err(error);
            }

            // Extract state dict
            let state_dict = result
                .get_item("state")
                .map_err(|e| format!("No state field: {}", e))?;

            // Parse all the status fields (with safe defaults)
            let battery_percent = state_dict
                .get_item("battery")
                .ok()
                .and_then(|v| v.extract().ok());

            let temperature_c = state_dict
                .get_item("cur_temp")
                .ok()
                .and_then(|v| v.extract().ok());

            let humidity_percent = state_dict
                .get_item("cur_hum")
                .ok()
                .and_then(|v| v.extract().ok());

            let dew_heater_power = state_dict
                .get_item("dew_heater_power")
                .ok()
                .and_then(|v| v.extract().ok());

            let ra = state_dict
                .get_item("ra")
                .ok()
                .and_then(|v| v.extract().ok());

            let dec = state_dict
                .get_item("dec")
                .ok()
                .and_then(|v| v.extract().ok());

            let is_goto = state_dict
                .get_item("is_goto")
                .ok()
                .and_then(|v| v.extract().ok());

            let is_tracking = state_dict
                .get_item("is_tracking")
                .ok()
                .and_then(|v| v.extract().ok());

            let view_state = state_dict
                .get_item("view")
                .ok()
                .and_then(|v| v.extract().ok());

            let gain = state_dict
                .get_item("gain")
                .ok()
                .and_then(|v| v.extract().ok());

            let focus_position = state_dict
                .get_item("focus_position")
                .ok()
                .and_then(|v| v.extract().ok());

            let stacked_frame = state_dict
                .get_item("stacked_frame")
                .ok()
                .and_then(|v| v.extract().ok());

            let target_name = state_dict
                .get_item("target_name")
                .ok()
                .and_then(|v| v.extract().ok());

            Ok(TelescopeStatus {
                connected: true,
                battery_percent,
                temperature_c,
                humidity_percent,
                dew_heater_power,
                ra,
                dec,
                is_goto,
                is_tracking,
                view_state,
                gain,
                focus_position,
                stacked_frame,
                target_name,
            })
        })
    })
    .await
    .map_err(|e| format!("Task error: {}", e))??;

    Ok(result)
}
