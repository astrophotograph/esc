//! Planning module for observation sessions and visibility.

use crate::database::models::Session;
use crate::database::Database;
use chrono::Utc;
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
    Err("Visibility calculation not yet available in Rust backend".to_string())
}

/// Get recommended targets for tonight
#[tauri::command]
pub async fn planning_get_tonight_targets(
    location: VisibilityLocation,
    limit: Option<i32>,
    min_altitude: Option<f64>,
) -> Result<String, String> {
    Err("Tonight's targets not yet available in Rust backend".to_string())
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
