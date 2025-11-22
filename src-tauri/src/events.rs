use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Event names used throughout the application
pub mod event_names {
    pub const TELESCOPE_DISCOVERED: &str = "telescope-discovered";
    pub const TELESCOPE_CONNECTED: &str = "telescope-connected";
    pub const TELESCOPE_DISCONNECTED: &str = "telescope-disconnected";
    pub const TELESCOPE_STATUS: &str = "telescope-status";
    pub const TELESCOPE_ERROR: &str = "telescope-error";

    pub const IMAGING_STARTED: &str = "imaging-started";
    pub const IMAGING_STOPPED: &str = "imaging-stopped";
    pub const IMAGING_PROGRESS: &str = "imaging-progress";
    pub const IMAGING_FRAME: &str = "imaging-frame";

    pub const COMMAND_RESPONSE: &str = "command-response";
    pub const ERROR: &str = "error";
}

/// Helper functions for emitting events
pub fn emit_event<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) -> Result<(), String> {
    app.emit(event, payload)
        .map_err(|e| format!("Failed to emit event {}: {}", event, e))
}

pub fn emit_error(app: &AppHandle, error: String) {
    let _ = emit_event(app, event_names::ERROR, serde_json::json!({
        "message": error,
        "timestamp": chrono::Utc::now().to_rfc3339()
    }));
}
