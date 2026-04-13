//! Imaging module for FITS processing, enhancement, and plate solving.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::database::Database;

/// Parameters for FITS processing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessFitsParams {
    pub fits_path: String,
    pub stretch_mode: Option<String>,
    pub output_format: Option<String>,
    pub quality: Option<i32>,
    pub return_data: Option<bool>,
}

/// Parameters for image enhancement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhanceParams {
    pub image_path: String,
    // Upscaling
    pub upscale_enabled: Option<bool>,
    pub upscale_factor: Option<f64>,
    pub upscale_method: Option<String>,
    // Denoising
    pub denoise_enabled: Option<bool>,
    pub denoise_method: Option<String>,
    pub denoise_strength: Option<f64>,
    // Sharpening
    pub sharpen_enabled: Option<bool>,
    pub sharpen_method: Option<String>,
    pub sharpen_strength: Option<f64>,
    // Deconvolution
    pub deconvolution_enabled: Option<bool>,
    pub deconvolution_strength: Option<f64>,
    pub psf_size: Option<i32>,
    // Output
    pub return_data: Option<bool>,
}

/// Parameters for reprocessing FITS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReprocessFitsParams {
    pub fits_path: String,
    // Processing
    pub stretch_mode: Option<String>,
    pub output_format: Option<String>,
    pub quality: Option<i32>,
    // Enhancement
    pub upscale_enabled: Option<bool>,
    pub upscale_factor: Option<f64>,
    pub upscale_method: Option<String>,
    pub denoise_enabled: Option<bool>,
    pub denoise_method: Option<String>,
    pub denoise_strength: Option<f64>,
    pub sharpen_enabled: Option<bool>,
    pub sharpen_method: Option<String>,
    pub sharpen_strength: Option<f64>,
    pub deconvolution_enabled: Option<bool>,
    pub deconvolution_strength: Option<f64>,
    pub psf_size: Option<i32>,
    // Output
    pub return_data: Option<bool>,
}

/// Parameters for plate solving
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlateSolveParams {
    pub image_path: Option<String>,
    pub image_base64: Option<String>,
    pub api_key: Option<String>,
    // Scale hints
    pub scale_lower: Option<f64>,
    pub scale_upper: Option<f64>,
    // Position hints
    pub center_ra: Option<f64>,
    pub center_dec: Option<f64>,
    pub radius: Option<f64>,
    // Processing
    pub downsample_factor: Option<i32>,
    pub timeout: Option<f64>,
}

/// Process a FITS file with stretching
#[tauri::command]
pub async fn imaging_process_fits(params: ProcessFitsParams) -> Result<String, String> {
    let fits_path = std::path::PathBuf::from(&params.fits_path);

    // Generate output path (same dir, .jpg extension by default)
    let output_path = fits_path.with_extension(
        params.output_format.as_deref().unwrap_or("jpg"),
    );

    let stretch_params = crate::stretch::StretchParams::default();

    // Run in blocking task since FITS processing is CPU-intensive
    let result = tokio::task::spawn_blocking(move || {
        crate::stretch::process_fits_file(&fits_path, &output_path, &stretch_params)
    })
    .await
    .map_err(|e| format!("Task error: {e}"))?;

    match result {
        Ok(path) => Ok(serde_json::json!({
            "success": true,
            "output_path": path,
            "format": params.output_format.as_deref().unwrap_or("jpg"),
        })
        .to_string()),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": e,
        })
        .to_string()),
    }
}

/// Enhance an image
#[tauri::command]
pub async fn imaging_enhance(params: EnhanceParams) -> Result<String, String> {
    Err("Image enhancement not yet available in Rust backend".to_string())
}

/// Reprocess a FITS file with new parameters
#[tauri::command]
pub async fn imaging_reprocess_fits(params: ReprocessFitsParams) -> Result<String, String> {
    Err("FITS reprocessing not yet available in Rust backend".to_string())
}

/// Get available stretch modes
#[tauri::command]
pub async fn imaging_get_stretch_modes() -> Result<String, String> {
    let modes = serde_json::json!([
        {"id": "No Stretch", "name": "No Stretch", "description": "Simple min-max normalization"},
        {"id": "10% Bg, 3 sigma", "name": "10% Background, 3\u{03c3}", "description": "Light stretch for bright objects"},
        {"id": "15% Bg, 3 sigma", "name": "15% Background, 3\u{03c3}", "description": "Default stretch (recommended)"},
        {"id": "20% Bg, 3 sigma", "name": "20% Background, 3\u{03c3}", "description": "Medium stretch for faint objects"},
        {"id": "30% Bg, 2 sigma", "name": "30% Background, 2\u{03c3}", "description": "Strong stretch for very faint objects"}
    ]);
    Ok(modes.to_string())
}

/// Get available enhancement methods
#[tauri::command]
pub async fn imaging_get_enhancement_methods() -> Result<String, String> {
    let methods = serde_json::json!({
        "upscale": [
            {"id": "BICUBIC", "name": "Bicubic", "description": "Standard bicubic interpolation"},
            {"id": "LANCZOS", "name": "Lanczos", "description": "High-quality Lanczos resampling"},
            {"id": "EDSR", "name": "EDSR", "description": "Enhanced Deep Super-Resolution (AI)"},
            {"id": "FSRCNN", "name": "FSRCNN", "description": "Fast Super-Resolution CNN (AI)"},
            {"id": "ESRGAN", "name": "ESRGAN", "description": "Enhanced Super-Resolution GAN (AI)"}
        ],
        "denoise": [
            {"id": "TV_CHAMBOLLE", "name": "Total Variation", "description": "TV denoising (Chambolle)"},
            {"id": "BILATERAL", "name": "Bilateral Filter", "description": "Edge-preserving bilateral filter"},
            {"id": "NON_LOCAL_MEANS", "name": "Non-Local Means", "description": "NL-Means denoising"},
            {"id": "WAVELET", "name": "Wavelet", "description": "Wavelet-based denoising"},
            {"id": "GAUSSIAN", "name": "Gaussian", "description": "Gaussian blur denoising"},
            {"id": "MEDIAN", "name": "Median", "description": "Median filter denoising"}
        ],
        "sharpen": [
            {"id": "UNSHARP_MASK", "name": "Unsharp Mask", "description": "Classic unsharp mask sharpening"},
            {"id": "LAPLACIAN", "name": "Laplacian", "description": "Laplacian edge sharpening"},
            {"id": "HIGH_PASS", "name": "High Pass", "description": "High-pass filter sharpening"}
        ]
    });
    Ok(methods.to_string())
}

/// Get a processed image by ID
#[tauri::command]
pub async fn imaging_get_processed(
    image_id: String,
    format: Option<String>,
) -> Result<Option<String>, String> {
    Err("Processed image retrieval not yet available in Rust backend".to_string())
}

/// Delete a processed image
#[tauri::command]
pub async fn imaging_cleanup(image_id: String) -> Result<bool, String> {
    Err("Image cleanup not yet available in Rust backend".to_string())
}

/// Plate solve an image
#[tauri::command]
pub async fn imaging_plate_solve(params: PlateSolveParams) -> Result<String, String> {
    Err("Plate solving not yet available in Rust backend".to_string())
}

/// Save image metadata to database
#[tauri::command]
pub async fn imaging_save_to_db(
    db: State<'_, Database>,
    session_id: Option<String>,
    file_path: String,
    exposure_ms: Option<i32>,
    gain: Option<i32>,
    plate_solved: Option<bool>,
    plate_solve_ra: Option<f64>,
    plate_solve_dec: Option<f64>,
) -> Result<String, String> {
    tracing::info!("Saving image to database: {}", file_path);

    let image = crate::database::models::Image {
        id: uuid::Uuid::new_v4().to_string(),
        session_id,
        file_path,
        exposure_ms,
        gain,
        captured_at: chrono::Utc::now(),
        plate_solved: plate_solved.unwrap_or(false),
        plate_solve_ra,
        plate_solve_dec,
    };

    db.save_image(&image)
        .map_err(|e| format!("Failed to save image: {}", e))?;

    Ok(serde_json::to_string(&image).unwrap())
}

/// Get images from database
#[tauri::command]
pub async fn imaging_get_from_db(
    db: State<'_, Database>,
    session_id: Option<String>,
) -> Result<String, String> {
    tracing::info!("Getting images from database");

    let images = db
        .get_images(session_id.as_deref())
        .map_err(|e| format!("Failed to get images: {}", e))?;

    Ok(serde_json::to_string(&images).unwrap())
}

/// Delete image from database
#[tauri::command]
pub async fn imaging_delete_from_db(
    db: State<'_, Database>,
    image_id: String,
) -> Result<(), String> {
    tracing::info!("Deleting image from database: {}", image_id);

    db.delete_image(&image_id)
        .map_err(|e| format!("Failed to delete image: {}", e))?;

    Ok(())
}
