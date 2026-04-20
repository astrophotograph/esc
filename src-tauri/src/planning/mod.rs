//! Planning module for observation sessions and visibility.

use crate::catalog;
use crate::database::models::Session;
use crate::database::Database;
use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

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

/// Visibility result for a target
#[derive(Debug, Serialize)]
struct VisibilityInfo {
    target_name: String,
    is_visible: bool,
    altitude: f64,
    azimuth: f64,
    rise_time: Option<String>,
    set_time: Option<String>,
    transit_altitude: f64,
    best_time: Option<String>,
    hours_visible: f64,
}

/// Tonight target result
#[derive(Debug, Serialize)]
struct TonightTarget {
    id: String,
    name: String,
    object_type: Option<String>,
    magnitude: Option<f64>,
    altitude: f64,
    azimuth: f64,
    constellation: Option<String>,
    ra: f64,
    dec: f64,
}

/// Get visibility information for a target
#[tauri::command]
pub async fn planning_get_visibility(
    target: VisibilityTarget,
    location: VisibilityLocation,
    date: Option<String>,
    min_altitude: Option<f64>,
) -> Result<String, String> {
    let min_alt = min_altitude.unwrap_or(20.0);

    // Determine base date (noon UTC on the given or current date)
    let base_date = if let Some(ref date_str) = date {
        let nd = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date format: {}", e))?;
        nd.and_hms_opt(12, 0, 0).unwrap()
    } else {
        let now = Utc::now().naive_utc();
        NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
    };

    // Night window: 6 PM to 6 AM UTC
    let start_time = base_date + Duration::hours(6); // 18:00 from noon = base_date noon + 6h = 18:00
    // Actually: base_date is at noon (12:00), so +6h = 18:00, +18h = 06:00 next day
    let end_time = base_date + Duration::hours(18);

    let ra_hours = target.ra / 15.0;

    let mut best_altitude: f64 = -90.0;
    let mut best_time: Option<String> = None;
    let mut rise_time: Option<String> = None;
    let mut set_time: Option<String> = None;
    let mut total_visible_hours: f64 = 0.0;
    let mut was_visible = false;

    // Sample every 15 minutes
    let mut current = start_time;
    while current <= end_time {
        let utc_dt = chrono::DateTime::<Utc>::from_naive_utc_and_offset(current, Utc);
        let lst = catalog::local_sidereal_time(location.longitude, utc_dt);
        let (altitude, _azimuth) =
            catalog::altitude_azimuth(ra_hours, target.dec, location.latitude, lst);

        let is_visible = altitude >= min_alt;

        // Track rise time (first crossing above min_alt)
        if is_visible && !was_visible && rise_time.is_none() {
            rise_time = Some(utc_dt.to_rfc3339());
        }

        // Track set time (crossing below min_alt)
        if !is_visible && was_visible {
            set_time = Some(utc_dt.to_rfc3339());
        }

        // Track best time (highest altitude)
        if altitude > best_altitude {
            best_altitude = altitude;
            best_time = Some(utc_dt.to_rfc3339());
        }

        if is_visible {
            total_visible_hours += 0.25; // 15 minutes
        }

        was_visible = is_visible;
        current += Duration::minutes(15);
    }

    // Calculate current position
    let now = Utc::now();
    let lst_now = catalog::local_sidereal_time(location.longitude, now);
    let (current_alt, current_az) =
        catalog::altitude_azimuth(ra_hours, target.dec, location.latitude, lst_now);

    let info = VisibilityInfo {
        target_name: target.name,
        is_visible: current_alt >= min_alt,
        altitude: current_alt,
        azimuth: current_az,
        rise_time,
        set_time,
        transit_altitude: best_altitude,
        best_time,
        hours_visible: total_visible_hours,
    };

    serde_json::to_string(&info).map_err(|e| format!("Serialization error: {}", e))
}

/// Get recommended targets for tonight
#[tauri::command]
pub async fn planning_get_tonight_targets(
    location: VisibilityLocation,
    limit: Option<i32>,
    min_altitude: Option<f64>,
) -> Result<String, String> {
    let limit = limit.unwrap_or(20) as usize;
    let min_alt = min_altitude.unwrap_or(30.0);

    let catalog_data = catalog::load_catalog()?;
    let now = Utc::now();
    let lst = catalog::local_sidereal_time(location.longitude, now);

    let mut targets: Vec<TonightTarget> = Vec::new();

    for obj in &catalog_data.objects {
        let ra_decimal = match obj.coordinates.ra_j2000.as_ref().and_then(|c| c.decimal) {
            Some(v) => v,
            None => continue,
        };
        let dec_decimal = match obj.coordinates.dec_j2000.as_ref().and_then(|c| c.decimal) {
            Some(v) => v,
            None => continue,
        };

        let ra_hours = ra_decimal / 15.0;
        let (altitude, azimuth) =
            catalog::altitude_azimuth(ra_hours, dec_decimal, location.latitude, lst);

        if altitude >= min_alt {
            let name = catalog::get_object_name(obj);
            let magnitude = catalog::get_object_magnitude(&obj.magnitudes);
            let constellation = obj.coordinates.constellation.clone();
            let object_type = obj.object_type.clone();

            targets.push(TonightTarget {
                id: obj.id.clone(),
                name,
                object_type,
                magnitude,
                altitude,
                azimuth,
                constellation,
                ra: ra_decimal,
                dec: dec_decimal,
            });
        }
    }

    // Sort by altitude (highest first), then by magnitude (brightest first)
    targets.sort_by(|a, b| {
        let alt_cmp = b
            .altitude
            .partial_cmp(&a.altitude)
            .unwrap_or(std::cmp::Ordering::Equal);
        if alt_cmp != std::cmp::Ordering::Equal {
            return alt_cmp;
        }
        let ma = a.magnitude.unwrap_or(999.0);
        let mb = b.magnitude.unwrap_or(999.0);
        ma.partial_cmp(&mb).unwrap_or(std::cmp::Ordering::Equal)
    });

    targets.truncate(limit);

    serde_json::to_string(&targets).map_err(|e| format!("Serialization error: {}", e))
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

/// Save a text file to the user's Downloads folder
#[tauri::command]
pub async fn planning_save_file(
    app: tauri::AppHandle,
    filename: String,
    content: String,
) -> Result<String, String> {
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("Failed to get Downloads directory: {}", e))?;

    let path = download_dir.join(&filename);
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}
