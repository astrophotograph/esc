// Event structs and constants are defined ahead of use — allow dead code.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Event names used throughout the application
pub mod event_names {
    pub const TELESCOPE_DISCOVERED: &str = "telescope:discovered";
    pub const TELESCOPE_CONNECTED: &str = "telescope:connected";
    pub const TELESCOPE_DISCONNECTED: &str = "telescope:disconnected";
    pub const TELESCOPE_STATUS: &str = "telescope:status";
    pub const TELESCOPE_ERROR: &str = "telescope:error";

    pub const IMAGING_STARTED: &str = "imaging:started";
    pub const IMAGING_STOPPED: &str = "imaging:stopped";
    pub const IMAGING_PROGRESS: &str = "imaging:progress";
    pub const IMAGING_FRAME: &str = "imaging:frame";

    pub const COMMAND_RESPONSE: &str = "command:response";
    pub const ERROR: &str = "error";
}

// ============================================================================
// Typed Event Payloads
// ============================================================================

/// Telescope discovery event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelescopeDiscoveredPayload {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub name: Option<String>,
    pub serial_number: Option<String>,
    pub product_model: Option<String>,
    pub discovery_method: String,
}

/// Telescope connection event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelescopeConnectionPayload {
    pub telescope_id: String,
    pub status: String,
    pub message: Option<String>,
}

/// Telescope status update payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelescopeStatusPayload {
    pub telescope_id: String,
    /// Right ascension in hours
    pub ra: Option<f64>,
    /// Declination in degrees
    pub dec: Option<f64>,
    /// Altitude in degrees
    pub alt: Option<f64>,
    /// Azimuth in degrees
    pub az: Option<f64>,
    /// Is tracking enabled
    pub tracking: Option<bool>,
    /// Is currently slewing
    pub slewing: Option<bool>,
    /// Is telescope parked
    pub parked: Option<bool>,
    /// Focus position
    pub focus_position: Option<i32>,
    /// Battery percentage
    pub battery: Option<f32>,
    /// Temperature in celsius
    pub temperature: Option<f32>,
    /// Humidity percentage
    pub humidity: Option<f32>,
    /// Current view state
    pub view_state: Option<String>,
}

/// Telescope error event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelescopeErrorPayload {
    pub telescope_id: String,
    pub error: String,
    pub code: Option<String>,
    pub timestamp: String,
}

/// Imaging started event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImagingStartedPayload {
    pub telescope_id: String,
    pub exposure_ms: i32,
    pub gain: i32,
    pub target_name: Option<String>,
    pub timestamp: String,
}

/// Imaging stopped event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImagingStoppedPayload {
    pub telescope_id: String,
    pub frames_captured: Option<u32>,
    pub total_exposure_ms: Option<u64>,
    pub timestamp: String,
}

/// Imaging progress event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImagingProgressPayload {
    pub telescope_id: String,
    /// Number of frames stacked
    pub frames: u32,
    /// Total exposure time in milliseconds
    pub total_exposure_ms: u64,
    /// Current stacking progress (0.0 - 1.0)
    pub progress: Option<f32>,
    /// Status message
    pub status: Option<String>,
}

/// Command response event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponsePayload {
    pub telescope_id: String,
    pub command: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub timestamp: String,
}

/// Generic error event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPayload {
    pub message: String,
    pub code: Option<String>,
    pub timestamp: String,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Helper functions for emitting events
pub fn emit_event<S: Serialize + Clone>(
    app: &AppHandle,
    event: &str,
    payload: S,
) -> Result<(), String> {
    app.emit(event, payload)
        .map_err(|e| format!("Failed to emit event {}: {}", event, e))
}

pub fn emit_error(app: &AppHandle, error: String) {
    let payload = ErrorPayload {
        message: error,
        code: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    let _ = emit_event(app, event_names::ERROR, payload);
}

/// Emit a telescope status update
pub fn emit_telescope_status(
    app: &AppHandle,
    payload: TelescopeStatusPayload,
) -> Result<(), String> {
    emit_event(app, event_names::TELESCOPE_STATUS, payload)
}

/// Emit a telescope error
pub fn emit_telescope_error(
    app: &AppHandle,
    telescope_id: &str,
    error: &str,
) -> Result<(), String> {
    let payload = TelescopeErrorPayload {
        telescope_id: telescope_id.to_string(),
        error: error.to_string(),
        code: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    emit_event(app, event_names::TELESCOPE_ERROR, payload)
}

/// Emit imaging progress
pub fn emit_imaging_progress(
    app: &AppHandle,
    telescope_id: &str,
    frames: u32,
    total_exposure_ms: u64,
    progress: Option<f32>,
    status: Option<&str>,
) -> Result<(), String> {
    let payload = ImagingProgressPayload {
        telescope_id: telescope_id.to_string(),
        frames,
        total_exposure_ms,
        progress,
        status: status.map(|s| s.to_string()),
    };
    emit_event(app, event_names::IMAGING_PROGRESS, payload)
}
