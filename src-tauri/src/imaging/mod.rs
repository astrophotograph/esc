//! Imaging module for FITS processing, enhancement, and plate solving.

use pyo3::prelude::*;
use pyo3::types::{PyDict, PyModule};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::database::Database;
use crate::state::AppState;

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
    tracing::info!("Processing FITS: {}", params.fits_path);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let imaging_module = PyModule::import(py, "imaging.imaging_service")
                .map_err(|e| format!("Failed to import imaging module: {}", e))?;

            let process_fn = imaging_module
                .getattr("process_fits")
                .map_err(|e| format!("Failed to get process_fits: {}", e))?;

            let kwargs = PyDict::new(py);
            kwargs.set_item("fits_path", &params.fits_path).unwrap();

            if let Some(ref mode) = params.stretch_mode {
                kwargs.set_item("stretch_mode", mode).unwrap();
            }
            if let Some(ref fmt) = params.output_format {
                kwargs.set_item("output_format", fmt).unwrap();
            }
            if let Some(q) = params.quality {
                kwargs.set_item("quality", q).unwrap();
            }
            if let Some(rd) = params.return_data {
                kwargs.set_item("return_data", rd).unwrap();
            }

            let result = process_fn
                .call((), Some(&kwargs))
                .map_err(|e| format!("Failed to call process_fits: {}", e))?;

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

/// Enhance an image
#[tauri::command]
pub async fn imaging_enhance(params: EnhanceParams) -> Result<String, String> {
    tracing::info!("Enhancing image: {}", params.image_path);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let imaging_module = PyModule::import(py, "imaging.imaging_service")
                .map_err(|e| format!("Failed to import imaging module: {}", e))?;

            let enhance_fn = imaging_module
                .getattr("enhance_image")
                .map_err(|e| format!("Failed to get enhance_image: {}", e))?;

            let kwargs = PyDict::new(py);
            kwargs.set_item("image_path", &params.image_path).unwrap();

            // Upscaling
            if let Some(v) = params.upscale_enabled {
                kwargs.set_item("upscale_enabled", v).unwrap();
            }
            if let Some(v) = params.upscale_factor {
                kwargs.set_item("upscale_factor", v).unwrap();
            }
            if let Some(ref v) = params.upscale_method {
                kwargs.set_item("upscale_method", v).unwrap();
            }

            // Denoising
            if let Some(v) = params.denoise_enabled {
                kwargs.set_item("denoise_enabled", v).unwrap();
            }
            if let Some(ref v) = params.denoise_method {
                kwargs.set_item("denoise_method", v).unwrap();
            }
            if let Some(v) = params.denoise_strength {
                kwargs.set_item("denoise_strength", v).unwrap();
            }

            // Sharpening
            if let Some(v) = params.sharpen_enabled {
                kwargs.set_item("sharpen_enabled", v).unwrap();
            }
            if let Some(ref v) = params.sharpen_method {
                kwargs.set_item("sharpen_method", v).unwrap();
            }
            if let Some(v) = params.sharpen_strength {
                kwargs.set_item("sharpen_strength", v).unwrap();
            }

            // Deconvolution
            if let Some(v) = params.deconvolution_enabled {
                kwargs.set_item("deconvolution_enabled", v).unwrap();
            }
            if let Some(v) = params.deconvolution_strength {
                kwargs.set_item("deconvolution_strength", v).unwrap();
            }
            if let Some(v) = params.psf_size {
                kwargs.set_item("psf_size", v).unwrap();
            }

            // Output
            if let Some(v) = params.return_data {
                kwargs.set_item("return_data", v).unwrap();
            }

            let result = enhance_fn
                .call((), Some(&kwargs))
                .map_err(|e| format!("Failed to call enhance_image: {}", e))?;

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

/// Reprocess a FITS file with new parameters
#[tauri::command]
pub async fn imaging_reprocess_fits(params: ReprocessFitsParams) -> Result<String, String> {
    tracing::info!("Reprocessing FITS: {}", params.fits_path);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let imaging_module = PyModule::import(py, "imaging.imaging_service")
                .map_err(|e| format!("Failed to import imaging module: {}", e))?;

            let reprocess_fn = imaging_module
                .getattr("reprocess_fits")
                .map_err(|e| format!("Failed to get reprocess_fits: {}", e))?;

            let kwargs = PyDict::new(py);
            kwargs.set_item("fits_path", &params.fits_path).unwrap();

            // Processing
            if let Some(ref v) = params.stretch_mode {
                kwargs.set_item("stretch_mode", v).unwrap();
            }
            if let Some(ref v) = params.output_format {
                kwargs.set_item("output_format", v).unwrap();
            }
            if let Some(v) = params.quality {
                kwargs.set_item("quality", v).unwrap();
            }

            // Enhancement
            if let Some(v) = params.upscale_enabled {
                kwargs.set_item("upscale_enabled", v).unwrap();
            }
            if let Some(v) = params.upscale_factor {
                kwargs.set_item("upscale_factor", v).unwrap();
            }
            if let Some(ref v) = params.upscale_method {
                kwargs.set_item("upscale_method", v).unwrap();
            }
            if let Some(v) = params.denoise_enabled {
                kwargs.set_item("denoise_enabled", v).unwrap();
            }
            if let Some(ref v) = params.denoise_method {
                kwargs.set_item("denoise_method", v).unwrap();
            }
            if let Some(v) = params.denoise_strength {
                kwargs.set_item("denoise_strength", v).unwrap();
            }
            if let Some(v) = params.sharpen_enabled {
                kwargs.set_item("sharpen_enabled", v).unwrap();
            }
            if let Some(ref v) = params.sharpen_method {
                kwargs.set_item("sharpen_method", v).unwrap();
            }
            if let Some(v) = params.sharpen_strength {
                kwargs.set_item("sharpen_strength", v).unwrap();
            }
            if let Some(v) = params.deconvolution_enabled {
                kwargs.set_item("deconvolution_enabled", v).unwrap();
            }
            if let Some(v) = params.deconvolution_strength {
                kwargs.set_item("deconvolution_strength", v).unwrap();
            }
            if let Some(v) = params.psf_size {
                kwargs.set_item("psf_size", v).unwrap();
            }

            // Output
            if let Some(v) = params.return_data {
                kwargs.set_item("return_data", v).unwrap();
            }

            let result = reprocess_fn
                .call((), Some(&kwargs))
                .map_err(|e| format!("Failed to call reprocess_fits: {}", e))?;

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

/// Get available stretch modes
#[tauri::command]
pub async fn imaging_get_stretch_modes() -> Result<String, String> {
    tracing::info!("Getting stretch modes");

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let imaging_module = PyModule::import(py, "imaging.imaging_service")
                .map_err(|e| format!("Failed to import imaging module: {}", e))?;

            let get_modes_fn = imaging_module
                .getattr("get_stretch_modes")
                .map_err(|e| format!("Failed to get get_stretch_modes: {}", e))?;

            let result = get_modes_fn
                .call0()
                .map_err(|e| format!("Failed to call get_stretch_modes: {}", e))?;

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

/// Get available enhancement methods
#[tauri::command]
pub async fn imaging_get_enhancement_methods() -> Result<String, String> {
    tracing::info!("Getting enhancement methods");

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let imaging_module = PyModule::import(py, "imaging.imaging_service")
                .map_err(|e| format!("Failed to import imaging module: {}", e))?;

            let get_methods_fn = imaging_module
                .getattr("get_enhancement_methods")
                .map_err(|e| format!("Failed to get get_enhancement_methods: {}", e))?;

            let result = get_methods_fn
                .call0()
                .map_err(|e| format!("Failed to call get_enhancement_methods: {}", e))?;

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

/// Get a processed image by ID
#[tauri::command]
pub async fn imaging_get_processed(
    image_id: String,
    format: Option<String>,
) -> Result<Option<String>, String> {
    tracing::info!("Getting processed image: {}", image_id);

    let fmt = format.unwrap_or_else(|| "png".to_string());

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let imaging_module = PyModule::import(py, "imaging.imaging_service")
                .map_err(|e| format!("Failed to import imaging module: {}", e))?;

            let get_fn = imaging_module
                .getattr("get_processed_image")
                .map_err(|e| format!("Failed to get get_processed_image: {}", e))?;

            let result = get_fn
                .call1((image_id, fmt))
                .map_err(|e| format!("Failed to call get_processed_image: {}", e))?;

            if result.is_none() {
                return Ok::<Option<String>, String>(None);
            }

            let base64_str: String = result
                .extract()
                .map_err(|e| format!("Failed to extract: {}", e))?;

            Ok(Some(base64_str))
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

/// Delete a processed image
#[tauri::command]
pub async fn imaging_cleanup(image_id: String) -> Result<bool, String> {
    tracing::info!("Cleaning up image: {}", image_id);

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let imaging_module = PyModule::import(py, "imaging.imaging_service")
                .map_err(|e| format!("Failed to import imaging module: {}", e))?;

            let cleanup_fn = imaging_module
                .getattr("cleanup_image")
                .map_err(|e| format!("Failed to get cleanup_image: {}", e))?;

            let result: bool = cleanup_fn
                .call1((image_id,))
                .map_err(|e| format!("Failed to call cleanup_image: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract: {}", e))?;

            Ok::<bool, String>(result)
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

/// Plate solve an image
#[tauri::command]
pub async fn imaging_plate_solve(params: PlateSolveParams) -> Result<String, String> {
    tracing::info!("Plate solving image");

    // Determine which solve function to use
    let use_base64 = params.image_base64.is_some();

    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            let astrometry_module = PyModule::import(py, "imaging.astrometry_client")
                .map_err(|e| format!("Failed to import astrometry module: {}", e))?;

            let kwargs = PyDict::new(py);

            if let Some(ref key) = params.api_key {
                kwargs.set_item("api_key", key).unwrap();
            }
            if let Some(v) = params.scale_lower {
                kwargs.set_item("scale_lower", v).unwrap();
            }
            if let Some(v) = params.scale_upper {
                kwargs.set_item("scale_upper", v).unwrap();
            }
            if let Some(v) = params.center_ra {
                kwargs.set_item("center_ra", v).unwrap();
            }
            if let Some(v) = params.center_dec {
                kwargs.set_item("center_dec", v).unwrap();
            }
            if let Some(v) = params.radius {
                kwargs.set_item("radius", v).unwrap();
            }
            if let Some(v) = params.downsample_factor {
                kwargs.set_item("downsample_factor", v).unwrap();
            }
            if let Some(v) = params.timeout {
                kwargs.set_item("timeout", v).unwrap();
            }

            let result = if use_base64 {
                let solve_fn = astrometry_module
                    .getattr("solve_image_base64")
                    .map_err(|e| format!("Failed to get solve_image_base64: {}", e))?;

                kwargs
                    .set_item("image_base64", params.image_base64.as_ref().unwrap())
                    .unwrap();

                solve_fn
                    .call((), Some(&kwargs))
                    .map_err(|e| format!("Failed to call solve_image_base64: {}", e))?
            } else {
                let solve_fn = astrometry_module
                    .getattr("solve_image_sync")
                    .map_err(|e| format!("Failed to get solve_image_sync: {}", e))?;

                kwargs
                    .set_item(
                        "image_path",
                        params.image_path.as_ref().ok_or("image_path required")?,
                    )
                    .unwrap();

                solve_fn
                    .call((), Some(&kwargs))
                    .map_err(|e| format!("Failed to call solve_image_sync: {}", e))?
            };

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
