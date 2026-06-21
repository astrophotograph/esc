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
    /// The telescope's current operation, e.g. "ContinuousExposure", "Stack",
    /// "AutoGoto", "AutoFocus" — or "Idle" when connected but doing nothing.
    /// Mirrors the Seestar `View.stage` field; synthesized to "Idle" when the
    /// view query succeeds but reports no active stage. The frontend keys the
    /// live-view test pattern and "Start Live View" CTA off this.
    pub stage: Option<String>,
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
        stage: None,
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
        let first_err = device_result
            .as_ref()
            .err()
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown error".to_string());
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

    // Extract the raw `result` payload from each response (logging diagnostics),
    // then map them with the pure `parse_status_from_results` helper. Keeping the
    // mapping pure makes it unit-testable and lets the session-replay E2E suite
    // exercise it against recorded telescope traffic.
    let device_val = match &device_result {
        Ok(resp) => {
            if !resp.is_success() {
                tracing::debug!(
                    "GetDeviceState non-zero code {} for {}: {:?}",
                    resp.code, telescope_id, resp.error
                );
            }
            resp.result.clone()
        }
        Err(e) => {
            tracing::debug!("GetDeviceState failed for {}: {}", telescope_id, e);
            None
        }
    };

    let coord_val = match &coord_result {
        Ok(resp) => {
            if resp.result.is_none() && !resp.is_success() {
                tracing::debug!("ScopeGetEquCoord code {} for {}", resp.code, telescope_id);
            }
            resp.result.clone()
        }
        Err(e) => {
            tracing::debug!("ScopeGetEquCoord failed for {}: {}", telescope_id, e);
            None
        }
    };

    let view_val = match &view_result {
        Ok(resp) if resp.is_success() => resp.result.clone(),
        Ok(resp) => {
            tracing::debug!(
                "GetViewState code {} for {}: {:?}",
                resp.code, telescope_id, resp.error
            );
            None
        }
        Err(e) => {
            tracing::debug!("GetViewState failed for {}: {}", telescope_id, e);
            None
        }
    };

    Ok(parse_status_from_results(
        true,
        device_val.as_ref(),
        coord_val.as_ref(),
        view_val.as_ref(),
    ))
}

/// Build a [`TelescopeStatus`] from the raw `result` payloads of the three
/// status commands (`GetDeviceState`, `ScopeGetEquCoord`, `GetViewState`).
///
/// Pure and side-effect free: this is the single source of truth for how
/// telescope wire data maps to the frontend status model, so it can be
/// unit-tested directly and replayed against the recorded session corpus.
///
/// The Seestar sometimes returns a usable `result` payload even with a non-zero
/// code, so callers pass through whatever payload was present regardless of the
/// success flag; a `None` payload simply leaves the corresponding fields unset.
pub fn parse_status_from_results(
    connected: bool,
    device_result: Option<&serde_json::Value>,
    coord_result: Option<&serde_json::Value>,
    view_result: Option<&serde_json::Value>,
) -> TelescopeStatus {
    let mut status = TelescopeStatus {
        connected,
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
        stage: None,
        gain: None,
        focus_position: None,
        stacked_frame: None,
        target_name: None,
        free_mb: None,
        total_mb: None,
        balance_sensor: None,
    };

    // GetDeviceState
    if let Some(result_val) = device_result {
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

    // ScopeGetEquCoord — absent until a goto has been performed.
    if let Some(result_val) = coord_result {
        status.ra = result_val.get("ra").and_then(|v| v.as_f64());
        status.dec = result_val.get("dec").and_then(|v| v.as_f64());
    }

    // GetViewState
    if let Some(result_val) = view_result {
        let view = result_val.get("View").or_else(|| result_val.get("view"));
        if let Some(view_val) = view {
            status.view_state = view_val
                .get("state")
                .and_then(|v| v.as_str())
                .map(String::from);
            // The active operation: "ContinuousExposure", "Stack", "AutoGoto",
            // "AutoFocus", etc. The Seestar only includes this while something
            // is running, so its absence means the scope is idle.
            status.stage = view_val
                .get("stage")
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

    // When connected and the view query returned successfully but reported no
    // active stage, the scope is idle. Synthesize "Idle" so the frontend can
    // distinguish "connected but not imaging" (→ live-view test pattern + Start
    // Live View CTA) from "no data". The Python backend did this; it was lost in
    // the Rust migration, which left the frontend's idle handling stranded.
    if connected && view_result.is_some() && status.stage.is_none() {
        status.stage = Some("Idle".to_string());
    }

    status
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_inputs_yield_connected_but_unset() {
        let status = parse_status_from_results(true, None, None, None);
        assert!(status.connected);
        assert!(status.ra.is_none());
        assert!(status.dec.is_none());
        assert!(status.mount_type.is_none());
        assert!(status.focus_position.is_none());
    }

    #[test]
    fn maps_device_state_fields() {
        let device = json!({
            "pi_status": { "battery_capacity": 70, "temp": 41.5 },
            "mount": { "tracking": true, "equ_mode": false },
            "focuser": { "step": 1517 },
            "storage": { "free_mb": 12000, "total_mb": 64000 },
            "balance_sensor": { "x": 0.1, "y": -0.2, "z": 0.9, "angle": 3.0 },
            "setting": { "gain": 80 }
        });
        let status = parse_status_from_results(true, Some(&device), None, None);

        assert_eq!(status.battery_percent, Some(70.0));
        assert_eq!(status.temperature_c, Some(41.5));
        assert_eq!(status.is_tracking, Some(true));
        assert_eq!(status.mount_type.as_deref(), Some("Alt-Az"));
        assert_eq!(status.focus_position, Some(1517));
        assert_eq!(status.free_mb, Some(12000));
        assert_eq!(status.total_mb, Some(64000));
        assert_eq!(status.gain, Some(80));
        let bal = status.balance_sensor.expect("balance sensor");
        assert_eq!(bal.x, Some(0.1));
        assert_eq!(bal.angle, Some(3.0));
    }

    #[test]
    fn equ_mode_true_maps_to_equatorial() {
        let device = json!({ "mount": { "equ_mode": true } });
        let status = parse_status_from_results(true, Some(&device), None, None);
        assert_eq!(status.mount_type.as_deref(), Some("Equatorial"));
    }

    #[test]
    fn maps_coordinates() {
        let coord = json!({ "ra": 5.5, "dec": -12.25 });
        let status = parse_status_from_results(true, None, Some(&coord), None);
        assert_eq!(status.ra, Some(5.5));
        assert_eq!(status.dec, Some(-12.25));
    }

    #[test]
    fn maps_view_state_with_capital_and_lowercase_key() {
        for key in ["View", "view"] {
            let view = json!({ key: {
                "state": "SlewComplete",
                "target_name": "M31",
                "stacked_frame": 42,
                "gain": 90
            }});
            let status = parse_status_from_results(true, None, None, Some(&view));
            assert_eq!(status.view_state.as_deref(), Some("SlewComplete"));
            assert_eq!(status.is_goto, Some(true));
            assert_eq!(status.target_name.as_deref(), Some("M31"));
            assert_eq!(status.stacked_frame, Some(42));
            assert_eq!(status.gain, Some(90));
        }
    }

    #[test]
    fn maps_active_stage_from_view() {
        // A running session reports its operation in View.stage.
        let view = json!({ "View": { "state": "working", "stage": "ContinuousExposure" }});
        let status = parse_status_from_results(true, None, None, Some(&view));
        assert_eq!(status.stage.as_deref(), Some("ContinuousExposure"));
    }

    #[test]
    fn synthesizes_idle_when_view_present_without_stage() {
        // The Seestar omits `stage` when nothing is running; a successful view
        // query with no stage means the scope is idle.
        let view = json!({ "View": { "state": "cancel", "mode": "none" }});
        let status = parse_status_from_results(true, None, None, Some(&view));
        assert_eq!(status.stage.as_deref(), Some("Idle"));

        // Even an empty/absent View object (but a successful query) is idle.
        let empty = json!({});
        let status = parse_status_from_results(true, None, None, Some(&empty));
        assert_eq!(status.stage.as_deref(), Some("Idle"));
    }

    #[test]
    fn no_idle_synthesis_when_view_query_absent() {
        // If we never got a view response, we don't know the state — leave it
        // unset rather than falsely claiming idle.
        let status = parse_status_from_results(true, None, None, None);
        assert!(status.stage.is_none());

        // And never synthesize idle while disconnected.
        let view = json!({ "View": { "state": "cancel" }});
        let status = parse_status_from_results(false, None, None, Some(&view));
        assert!(status.stage.is_none());
    }

    #[test]
    fn device_state_gain_takes_priority_over_view_gain() {
        let device = json!({ "setting": { "gain": 80 } });
        let view = json!({ "View": { "gain": 999 } });
        let status = parse_status_from_results(true, Some(&device), None, Some(&view));
        assert_eq!(status.gain, Some(80), "device gain should win over view gain");
    }

    #[test]
    fn malformed_device_state_does_not_panic() {
        // A non-object payload must be tolerated (logged, fields left unset).
        let device = json!("not an object");
        let status = parse_status_from_results(true, Some(&device), None, None);
        assert!(status.connected);
        assert!(status.mount_type.is_none());
    }
}
