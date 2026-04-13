use serde::{Deserialize, Serialize};

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

#[tauri::command]
pub async fn catalog_search(params: CatalogSearchParams) -> Result<String, String> {
    Err("Catalog search not yet available in Rust backend".to_string())
}

#[tauri::command]
pub async fn catalog_quick_search(query: String, limit: Option<i32>) -> Result<String, String> {
    Err("Catalog quick search not yet available in Rust backend".to_string())
}

#[tauri::command]
pub async fn catalog_get_object_types() -> Result<String, String> {
    Err("Catalog object types not yet available in Rust backend".to_string())
}

#[tauri::command]
pub async fn catalog_get_solar_system(
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<String, String> {
    Err("Solar system objects not yet available in Rust backend".to_string())
}
