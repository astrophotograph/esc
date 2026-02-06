use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Telescope configuration stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Telescope {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub protocol: Option<String>, // "seestar" or "alpaca"
    pub serial_number: Option<String>,
    pub product_model: Option<String>,
    pub name: Option<String>,
    pub location: Option<String>,
    pub discovery_method: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_seen: Option<DateTime<Utc>>, // For auto-discovered telescopes
}

/// Observation log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observation {
    pub id: String,
    pub telescope_id: String,
    pub target_name: String,
    pub ra: Option<f64>,
    pub dec: Option<f64>,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub rating: Option<i32>,
}

/// Observation session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub telescope_id: Option<String>,
    pub name: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub location_lat: Option<f64>,
    pub location_lon: Option<f64>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Equipment item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Equipment {
    pub id: String,
    pub equipment_type: String, // "telescope", "eyepiece", "filter", "camera", "other"
    pub name: String,
    pub specs: Option<String>, // JSON string
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Observation log entry (detailed)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservationLog {
    pub id: String,
    pub session_id: Option<String>,
    pub target_name: String,
    pub ra: Option<f64>,
    pub dec: Option<f64>,
    pub notes: Option<String>,
    pub rating: Option<i32>,
    pub captured_at: DateTime<Utc>,
}

/// Captured image record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Image {
    pub id: String,
    pub session_id: Option<String>,
    pub file_path: String,
    pub exposure_ms: Option<i32>,
    pub gain: Option<i32>,
    pub captured_at: DateTime<Utc>,
    pub plate_solved: bool,
    pub plate_solve_ra: Option<f64>,
    pub plate_solve_dec: Option<f64>,
}
