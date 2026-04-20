use crate::database::Database;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

const KEY_INTEROP_PEM: &str = "seestar_interop_pem";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    pub seestar_interop_pem: Option<String>,
}

/// Resolve the active interop PEM path: env var > DB setting.
pub fn resolve_interop_pem(db: &Database) -> Option<String> {
    if let Ok(p) = std::env::var("SEESTAR_INTEROP_PEM") {
        return Some(p);
    }
    db.get_setting(KEY_INTEROP_PEM).ok().flatten()
}

#[tauri::command]
pub fn config_get(db: State<'_, Database>) -> AppConfig {
    AppConfig {
        seestar_interop_pem: db.get_setting(KEY_INTEROP_PEM).ok().flatten(),
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
