// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod events;
mod imaging;
mod python;
mod state;
mod streaming;
mod telescope;

use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

fn main() {
    // Initialize logging
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env()
            .add_directive(tracing::Level::INFO.into()))
        .init();

    tracing::info!("Starting EESC telescope control application");

    // Initialize Python interpreter
    if let Err(e) = python::init_python() {
        tracing::error!("Failed to initialize Python: {}", e);
        std::process::exit(1);
    }
    tracing::info!("Python interpreter initialized");

    // Initialize app state
    let app_state = state::AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            telescope::add_telescope,
            telescope::connect_telescope,
            telescope::disconnect_telescope,
            telescope::goto_target,
            telescope::park_telescope,
            telescope::get_telescopes,
            telescope::remove_telescope,
        ])
        .setup(|app| {
            // Initialize database
            let app_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_dir)
                .expect("Failed to create app data directory");

            let db_path = app_dir.join("eesc.db");
            tracing::info!("Database path: {:?}", db_path);

            let db = database::Database::new(db_path)
                .expect("Failed to initialize database");
            app.manage(db);

            // Start streaming server on port 8080 using Tauri's async runtime
            let app_state = app.state::<state::AppState>();
            let state_clone = std::sync::Arc::new(app_state.inner().clone());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = streaming::start_streaming_server(state_clone, 8080).await {
                    tracing::error!("Streaming server error: {}", e);
                }
            });
            tracing::info!("Streaming server starting on port 8080");

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
