use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Persisted application configuration written to <app_config_dir>/config.toml
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    /// Path to the Seestar interop PEM key file (required for firmware 7.18+).
    /// Overridden by the SEESTAR_INTEROP_PEM environment variable if set.
    pub seestar_interop_pem: Option<String>,
}

impl AppConfig {
    pub fn load(config_dir: &Path) -> Self {
        let path = config_dir.join("config.toml");
        match std::fs::read_to_string(&path) {
            Ok(text) => toml::from_str(&text).unwrap_or_else(|e| {
                tracing::warn!("Failed to parse config.toml: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, config_dir: &Path) -> Result<(), String> {
        let path = config_dir.join("config.toml");
        let text = toml::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        std::fs::write(&path, text)
            .map_err(|e| format!("Failed to write config.toml: {}", e))?;
        Ok(())
    }
}

/// Shared config state managed by Tauri
pub struct ConfigState {
    pub config: Arc<RwLock<AppConfig>>,
    pub config_dir: PathBuf,
}

impl ConfigState {
    pub fn new(config_dir: PathBuf, config: AppConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            config_dir,
        }
    }

    /// Resolve the interop PEM path: env var takes precedence over config file.
    pub fn resolve_interop_pem(&self) -> Option<String> {
        if let Ok(p) = std::env::var("SEESTAR_INTEROP_PEM") {
            return Some(p);
        }
        self.config.read().seestar_interop_pem.clone()
    }
}

#[tauri::command]
pub fn config_get(state: tauri::State<'_, ConfigState>) -> AppConfig {
    state.config.read().clone()
}

#[tauri::command]
pub fn config_set(
    state: tauri::State<'_, ConfigState>,
    config: AppConfig,
) -> Result<(), String> {
    state.config.write().clone_from(&config);
    config.save(&state.config_dir)
}
