/// Standalone web API server — runs the Rust backend without Tauri.
/// Used for the browser-based dev workflow: `./run-web-dev.sh`
///
/// The DB and settings live in the same location as the desktop app
/// (~/.local/share/eesc/ on Linux, ~/Library/Application Support/com.erewhon.esc/ on macOS).

use eesc_lib::{database::Database, settings, state::AppState, web};
use std::sync::Arc;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

const PORT: u16 = 9846;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
        .init();

    tracing::info!("Starting EESC web API server on port {}", PORT);

    // Resolve DB path the same way main.rs does via Tauri's app_data_dir.
    // On macOS: ~/Library/Application Support/com.erewhon.esc/
    let data_dir = dirs::data_dir()
        .expect("Could not determine data directory")
        .join("com.erewhon.esc");
    std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");

    let db_path = data_dir.join("eesc.db");
    tracing::info!("Database: {:?}", db_path);

    let db = Database::new(db_path).expect("Failed to open database");

    let app_state = AppState::default();

    let pem = settings::resolve_interop_pem(&db);
    if pem.is_none() {
        tracing::warn!(
            "Seestar interop PEM key not configured. \
             Telescope commands will fail on firmware 7.18+. \
             Set SEESTAR_INTEROP_PEM or configure the path in Settings."
        );
    }
    *app_state.interop_pem.write() = pem;

    let state = Arc::new(app_state);

    web::start_web_server(state, PORT, None)
        .await
        .expect("Web server error");
}
