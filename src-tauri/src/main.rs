// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod catalog;
mod commands;
mod database;
mod events;
mod imaging;
mod planning;
mod python;
mod state;
mod streaming;
mod stretch;
mod telescope;
mod web;

use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

fn main() {
    // Initialize logging
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
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
            telescope::discover_telescopes,
            telescope::get_telescope_status,
            // New commands for Phase 1
            telescope::telescope_move,
            telescope::telescope_stop_move,
            telescope::telescope_focus,
            telescope::telescope_focus_increment,
            telescope::telescope_auto_focus,
            telescope::imaging_start,
            telescope::imaging_stop,
            telescope::telescope_set_gain,
            telescope::telescope_set_exposure,
            telescope::telescope_stop_goto,
            telescope::telescope_get_focuser_position,
            telescope::telescope_start_recording,
            telescope::telescope_stop_recording,
            telescope::telescope_plate_solve,
            telescope::telescope_reboot,
            telescope::telescope_start_stack,
            telescope::telescope_stop_stack,
            telescope::telescope_get_stacking_status,
            telescope::telescope_save_image,
            // Catalog commands
            catalog::catalog_search,
            catalog::catalog_quick_search,
            catalog::catalog_get_object_types,
            catalog::catalog_get_solar_system,
            // Planning commands
            planning::planning_get_visibility,
            planning::planning_get_tonight_targets,
            planning::planning_create_session,
            planning::planning_get_sessions,
            planning::planning_end_session,
            planning::planning_delete_session,
            // Imaging commands
            imaging::imaging_process_fits,
            imaging::imaging_enhance,
            imaging::imaging_reprocess_fits,
            imaging::imaging_get_stretch_modes,
            imaging::imaging_get_enhancement_methods,
            imaging::imaging_get_processed,
            imaging::imaging_cleanup,
            imaging::imaging_plate_solve,
            imaging::imaging_save_to_db,
            imaging::imaging_get_from_db,
            imaging::imaging_delete_from_db,
        ])
        .setup(|app| {
            // Initialize database
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

            let db_path = app_dir.join("eesc.db");
            tracing::info!("Database path: {:?}", db_path);

            let db = database::Database::new(db_path).expect("Failed to initialize database");

            // Load existing telescopes from database into state
            let app_state = app.state::<state::AppState>();
            match db.get_telescopes() {
                Ok(telescopes) => {
                    use pyo3::prelude::*;
                    let mut state_telescopes = app_state.telescopes.write();
                    for t in telescopes {
                        let placeholder_bridge = Python::with_gil(|py| -> pyo3::PyObject { py.None() });
                        let protocol = t.protocol.clone().unwrap_or_else(|| "seestar".to_string());
                        state_telescopes.insert(
                            t.id.clone(),
                            state::TelescopeConnection {
                                id: t.id.clone(),
                                host: t.host.clone(),
                                port: t.port,
                                protocol: protocol.clone(),
                                name: t.name.unwrap_or_else(|| format!("{}:{}", t.host, t.port)),
                                status: state::ConnectionStatus::Disconnected,
                                bridge: std::sync::Arc::new(placeholder_bridge),
                                client: None,
                            },
                        );
                        tracing::info!("Loaded telescope from database: {} ({}) ({}:{})", t.id, protocol, t.host, t.port);
                    }
                    tracing::info!("Loaded {} telescopes from database", state_telescopes.len());
                }
                Err(e) => {
                    tracing::warn!("Failed to load telescopes from database: {}", e);
                }
            }

            app.manage(db);

            // Start streaming server on port 9847 using Tauri's async runtime
            let state_clone = std::sync::Arc::new(app_state.inner().clone());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = streaming::start_streaming_server(state_clone, 9847).await {
                    tracing::error!("Streaming server error: {}", e);
                }
            });
            tracing::info!("Streaming server starting on port 9847");

            // Dev tools can be opened manually with Ctrl+Shift+I if needed
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
