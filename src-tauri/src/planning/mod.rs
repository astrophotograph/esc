//! Planning module for observation sessions and visibility.

use crate::database::models::Session;
use crate::database::Database;
use chrono::Utc;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList, PyModule};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Target for visibility calculation
#[derive(Debug, Serialize, Deserialize)]
pub struct VisibilityTarget {
    pub name: String,
    pub ra: f64,
    pub dec: f64,
}

/// Location for visibility calculation
#[derive(Debug, Serialize, Deserialize)]
pub struct VisibilityLocation {
    pub latitude: f64,
    pub longitude: f64,
    pub elevation: Option<f64>,
}

/// Session creation parameters
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionCreateParams {
    pub name: String,
    pub telescope_id: Option<String>,
    pub location_lat: Option<f64>,
    pub location_lon: Option<f64>,
    pub notes: Option<String>,
}

/// Get visibility information for a target
#[tauri::command]
pub async fn planning_get_visibility(
    target: VisibilityTarget,
    location: VisibilityLocation,
    date: Option<String>,
    min_altitude: Option<f64>,
) -> Result<String, String> {
    tracing::info!("Getting visibility for target: {}", target.name);

    let min_alt = min_altitude.unwrap_or(20.0);
    let elevation = location.elevation.unwrap_or(0.0);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let planning_module = PyModule::import(py, "planning.planning_service")
                .map_err(|e| format!("Failed to import planning module: {}", e))?;

            let get_vis_fn = planning_module
                .getattr("get_target_visibility")
                .map_err(|e| format!("Failed to get get_target_visibility: {}", e))?;

            let kwargs = PyDict::new(py);
            kwargs.set_item("target_name", &target.name).unwrap();
            kwargs.set_item("ra", target.ra).unwrap();
            kwargs.set_item("dec", target.dec).unwrap();
            kwargs.set_item("latitude", location.latitude).unwrap();
            kwargs.set_item("longitude", location.longitude).unwrap();
            kwargs.set_item("elevation", elevation).unwrap();
            kwargs.set_item("min_altitude", min_alt).unwrap();

            if let Some(ref d) = date {
                kwargs.set_item("date", d).unwrap();
            }

            let result = get_vis_fn
                .call((), Some(&kwargs))
                .map_err(|e| format!("Failed to call get_target_visibility: {}", e))?;

            let json_module = PyModule::import(py, "json")
                .map_err(|e| format!("Failed to import json: {}", e))?;

            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract: {}", e))?;

            Ok::<String, String>(json_str)
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

/// Get recommended targets for tonight
#[tauri::command]
pub async fn planning_get_tonight_targets(
    location: VisibilityLocation,
    limit: Option<i32>,
    min_altitude: Option<f64>,
) -> Result<String, String> {
    tracing::info!(
        "Getting tonight's targets for location: {}, {}",
        location.latitude,
        location.longitude
    );

    let limit_val = limit.unwrap_or(20);
    let min_alt = min_altitude.unwrap_or(30.0);
    let elevation = location.elevation.unwrap_or(0.0);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            // First, get catalog objects from the catalog service
            let catalog_module = PyModule::import(py, "catalog.catalog_service")
                .map_err(|e| format!("Failed to import catalog module: {}", e))?;

            let search_fn = catalog_module
                .getattr("catalog_search")
                .map_err(|e| format!("Failed to get catalog_search: {}", e))?;

            // Get bright objects (mag <= 8)
            let search_kwargs = PyDict::new(py);
            search_kwargs.set_item("max_magnitude", 8.0).unwrap();
            search_kwargs.set_item("above_horizon_only", false).unwrap();
            search_kwargs.set_item("limit", 500).unwrap();

            let catalog_result = search_fn
                .call((), Some(&search_kwargs))
                .map_err(|e| format!("Failed to search catalog: {}", e))?;

            let catalog_objects = catalog_result
                .get_item("objects")
                .map_err(|e| format!("Failed to get objects: {}", e))?;

            // Now get tonight's targets from planning service
            let planning_module = PyModule::import(py, "planning.planning_service")
                .map_err(|e| format!("Failed to import planning module: {}", e))?;

            let get_targets_fn = planning_module
                .getattr("get_tonight_targets")
                .map_err(|e| format!("Failed to get get_tonight_targets: {}", e))?;

            let kwargs = PyDict::new(py);
            kwargs.set_item("catalog_objects", catalog_objects).unwrap();
            kwargs.set_item("latitude", location.latitude).unwrap();
            kwargs.set_item("longitude", location.longitude).unwrap();
            kwargs.set_item("elevation", elevation).unwrap();
            kwargs.set_item("limit", limit_val).unwrap();
            kwargs.set_item("min_altitude", min_alt).unwrap();

            let result = get_targets_fn
                .call((), Some(&kwargs))
                .map_err(|e| format!("Failed to call get_tonight_targets: {}", e))?;

            let json_module = PyModule::import(py, "json")
                .map_err(|e| format!("Failed to import json: {}", e))?;

            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract: {}", e))?;

            Ok::<String, String>(json_str)
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

/// Create a new observation session
#[tauri::command]
pub async fn planning_create_session(
    db: State<'_, Database>,
    params: SessionCreateParams,
) -> Result<String, String> {
    tracing::info!("Creating session: {}", params.name);

    let session = Session {
        id: uuid::Uuid::new_v4().to_string(),
        telescope_id: params.telescope_id,
        name: params.name,
        started_at: Utc::now(),
        ended_at: None,
        location_lat: params.location_lat,
        location_lon: params.location_lon,
        notes: params.notes,
        created_at: Utc::now(),
    };

    db.save_session(&session)
        .map_err(|e| format!("Failed to save session: {}", e))?;

    Ok(serde_json::to_string(&session).unwrap())
}

/// Get all observation sessions
#[tauri::command]
pub async fn planning_get_sessions(db: State<'_, Database>) -> Result<String, String> {
    tracing::info!("Getting all sessions");

    let sessions = db
        .get_sessions()
        .map_err(|e| format!("Failed to get sessions: {}", e))?;

    Ok(serde_json::to_string(&sessions).unwrap())
}

/// End an observation session
#[tauri::command]
pub async fn planning_end_session(
    db: State<'_, Database>,
    session_id: String,
    notes: Option<String>,
) -> Result<String, String> {
    tracing::info!("Ending session: {}", session_id);

    // Get existing session
    let sessions = db
        .get_sessions()
        .map_err(|e| format!("Failed to get sessions: {}", e))?;

    let mut session = sessions
        .into_iter()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    // Update session
    session.ended_at = Some(Utc::now());
    if let Some(n) = notes {
        session.notes = Some(n);
    }

    db.save_session(&session)
        .map_err(|e| format!("Failed to update session: {}", e))?;

    Ok(serde_json::to_string(&session).unwrap())
}

/// Delete an observation session
#[tauri::command]
pub async fn planning_delete_session(
    db: State<'_, Database>,
    session_id: String,
) -> Result<(), String> {
    tracing::info!("Deleting session: {}", session_id);

    db.delete_session(&session_id)
        .map_err(|e| format!("Failed to delete session: {}", e))?;

    Ok(())
}
