//! Catalog module for astronomical object search.

use pyo3::prelude::*;
use pyo3::types::PyModule;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Search parameters for catalog queries
#[derive(Debug, Serialize, Deserialize)]
pub struct CatalogSearchParams {
    pub query: Option<String>,
    pub object_type: Option<String>,
    pub min_magnitude: Option<f64>,
    pub max_magnitude: Option<f64>,
    pub above_horizon_only: Option<bool>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub elevation: Option<f64>,
    pub limit: Option<i32>,
}

/// Celestial object returned from search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CelestialObject {
    pub id: String,
    pub name: String,
    pub object_type: String,
    pub ra_decimal: f64,
    pub dec_decimal: f64,
    pub magnitude: Option<f64>,
    pub constellation: String,
    pub altitude: Option<f64>,
    pub azimuth: Option<f64>,
    pub above_horizon: bool,
    pub description: Option<String>,
    pub size_arcmin: Option<f64>,
    pub moon_phase: Option<f64>,
}

/// Search the astronomical catalog
#[tauri::command]
pub async fn catalog_search(params: CatalogSearchParams) -> Result<String, String> {
    tracing::info!("Catalog search: query={:?}", params.query);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            // Import the catalog module
            let catalog_module = PyModule::import(py, "catalog.catalog_service")
                .map_err(|e| format!("Failed to import catalog module: {}", e))?;

            let search_fn = catalog_module
                .getattr("catalog_search")
                .map_err(|e| format!("Failed to get catalog_search: {}", e))?;

            // Build kwargs
            let kwargs = pyo3::types::PyDict::new(py);

            if let Some(ref query) = params.query {
                kwargs.set_item("query", query).unwrap();
            }
            if let Some(ref obj_type) = params.object_type {
                kwargs.set_item("object_type", obj_type).unwrap();
            }
            if let Some(min_mag) = params.min_magnitude {
                kwargs.set_item("min_magnitude", min_mag).unwrap();
            }
            if let Some(max_mag) = params.max_magnitude {
                kwargs.set_item("max_magnitude", max_mag).unwrap();
            }
            if let Some(above_horizon) = params.above_horizon_only {
                kwargs
                    .set_item("above_horizon_only", above_horizon)
                    .unwrap();
            }
            if let Some(lat) = params.latitude {
                kwargs.set_item("latitude", lat).unwrap();
            }
            if let Some(lon) = params.longitude {
                kwargs.set_item("longitude", lon).unwrap();
            }
            if let Some(elev) = params.elevation {
                kwargs.set_item("elevation", elev).unwrap();
            }
            if let Some(lim) = params.limit {
                kwargs.set_item("limit", lim).unwrap();
            }

            // Call the function
            let result = search_fn
                .call((), Some(&kwargs))
                .map_err(|e| format!("Failed to call catalog_search: {}", e))?;

            // Convert to JSON
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

/// Quick search for autocomplete suggestions
#[tauri::command]
pub async fn catalog_quick_search(query: String, limit: Option<i32>) -> Result<String, String> {
    tracing::info!("Catalog quick search: query={}", query);

    let limit_val = limit.unwrap_or(20);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let catalog_module = PyModule::import(py, "catalog.catalog_service")
                .map_err(|e| format!("Failed to import catalog module: {}", e))?;

            let search_fn = catalog_module
                .getattr("catalog_quick_search")
                .map_err(|e| format!("Failed to get catalog_quick_search: {}", e))?;

            let result = search_fn
                .call1((query, limit_val))
                .map_err(|e| format!("Failed to call catalog_quick_search: {}", e))?;

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

/// Get available object types with counts
#[tauri::command]
pub async fn catalog_get_object_types() -> Result<String, String> {
    tracing::info!("Getting catalog object types");

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let catalog_module = PyModule::import(py, "catalog.catalog_service")
                .map_err(|e| format!("Failed to import catalog module: {}", e))?;

            let get_types_fn = catalog_module
                .getattr("catalog_get_object_types")
                .map_err(|e| format!("Failed to get catalog_get_object_types: {}", e))?;

            let result = get_types_fn
                .call0()
                .map_err(|e| format!("Failed to call catalog_get_object_types: {}", e))?;

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

/// Get solar system objects (Sun, Moon, planets)
#[tauri::command]
pub async fn catalog_get_solar_system(
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<String, String> {
    tracing::info!(
        "Getting solar system objects: lat={:?}, lon={:?}",
        latitude,
        longitude
    );

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let catalog_module = PyModule::import(py, "catalog.catalog_service")
                .map_err(|e| format!("Failed to import catalog module: {}", e))?;

            let get_solar_fn = catalog_module
                .getattr("catalog_get_solar_system")
                .map_err(|e| format!("Failed to get catalog_get_solar_system: {}", e))?;

            let kwargs = pyo3::types::PyDict::new(py);
            if let Some(lat) = latitude {
                kwargs.set_item("latitude", lat).unwrap();
            }
            if let Some(lon) = longitude {
                kwargs.set_item("longitude", lon).unwrap();
            }

            let result = get_solar_fn
                .call((), Some(&kwargs))
                .map_err(|e| format!("Failed to call catalog_get_solar_system: {}", e))?;

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
