use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Telescope configuration stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Telescope {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub serial_number: Option<String>,
    pub product_model: Option<String>,
    pub name: Option<String>,
    pub location: Option<String>,
    pub discovery_method: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
