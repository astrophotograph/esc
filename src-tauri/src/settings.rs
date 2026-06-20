use crate::database::Database;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

const KEY_INTEROP_PEM: &str = "seestar_interop_pem";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    pub seestar_interop_pem: Option<String>,
}

/// Read a setting, logging (rather than silently swallowing) any DB error.
/// A DB failure is reported as "absent" to callers, but is no longer invisible.
fn read_setting(db: &Database, key: &str) -> Option<String> {
    match db.get_setting(key) {
        Ok(value) => value,
        Err(e) => {
            tracing::warn!("Failed to read setting '{}' from database: {}", key, e);
            None
        }
    }
}

/// Resolve the active interop PEM path: env var > DB setting.
pub fn resolve_interop_pem(db: &Database) -> Option<String> {
    if let Ok(p) = std::env::var("SEESTAR_INTEROP_PEM") {
        return Some(p);
    }
    read_setting(db, KEY_INTEROP_PEM)
}

#[tauri::command]
pub fn config_get(db: State<'_, Database>) -> AppConfig {
    AppConfig {
        seestar_interop_pem: read_setting(&db, KEY_INTEROP_PEM),
    }
}

#[tauri::command]
pub fn config_set(
    db: State<'_, Database>,
    app_state: State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    db.set_setting(KEY_INTEROP_PEM, config.seestar_interop_pem.as_deref())
        .map_err(|e| format!("Failed to save setting: {}", e))?;

    // Keep in-memory state in sync (env var still takes precedence)
    *app_state.interop_pem.write() = resolve_interop_pem(&db);

    Ok(())
}
