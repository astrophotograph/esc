use parking_lot::RwLock;
use scopinator_seestar::SeestarClient;
use std::collections::HashMap;
use std::sync::Arc;

/// Application state shared across the Tauri app
#[derive(Default)]
pub struct AppState {
    /// Connected telescopes indexed by their ID
    pub telescopes: Arc<RwLock<HashMap<String, TelescopeConnection>>>,
    /// Active imaging sessions
    pub imaging_sessions: Arc<RwLock<HashMap<String, ImagingSession>>>,
    /// Resolved interop PEM path (env var takes precedence over DB setting)
    pub interop_pem: Arc<RwLock<Option<String>>>,
}

/// Represents a connection to a telescope
pub struct TelescopeConnection {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub protocol: String, // "seestar" or "alpaca"
    pub name: String,
    pub status: ConnectionStatus,
    /// Native Rust client for Seestar protocol
    pub client: Option<Arc<SeestarClient>>,
}

impl std::fmt::Debug for TelescopeConnection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TelescopeConnection")
            .field("id", &self.id)
            .field("host", &self.host)
            .field("port", &self.port)
            .field("protocol", &self.protocol)
            .field("name", &self.name)
            .field("status", &self.status)
            .field("client", &self.client.as_ref().map(|_| "<SeestarClient>"))
            .finish()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

/// Represents an active imaging session
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ImagingSession {
    pub telescope_id: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub frame_count: u32,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            telescopes: Arc::clone(&self.telescopes),
            imaging_sessions: Arc::clone(&self.imaging_sessions),
            interop_pem: Arc::clone(&self.interop_pem),
        }
    }
}
