use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures::stream::{self, StreamExt};
use std::sync::Arc;
use tokio::time::Duration;
use tracing::{error, info};

use crate::state::AppState;

/// Create the streaming router
pub fn create_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/stream/:telescope_id", get(stream_handler))
        .route("/test-pattern", get(test_pattern_handler))
        .route("/health", get(health_check))
}

/// Test pattern endpoint - returns a simple colored frame for testing
async fn test_pattern_handler() -> Response {
    // Generate a simple test pattern JPEG
    let test_frame = generate_test_pattern();

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/jpeg")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(test_frame))
        .unwrap()
}

/// Generate a simple test pattern image as JPEG bytes
fn generate_test_pattern() -> Vec<u8> {
    // Create a simple 640x480 gradient image
    let width = 640;
    let height = 480;

    // Create raw RGB data
    let mut rgb_data = vec![0u8; width * height * 3];

    for y in 0..height {
        for x in 0..width {
            let idx = (y * width + x) * 3;
            // Create a gradient pattern
            rgb_data[idx] = ((x * 255) / width) as u8;     // Red gradient
            rgb_data[idx + 1] = ((y * 255) / height) as u8; // Green gradient
            rgb_data[idx + 2] = 128;                        // Blue constant
        }
    }

    // Convert to JPEG using a simple PPM -> JPEG approach
    // For now, return a minimal valid JPEG (single color)
    // In production, you'd use an image library
    minimal_jpeg(width, height, &rgb_data)
}

/// Create a minimal JPEG from RGB data
fn minimal_jpeg(_width: usize, _height: usize, _rgb_data: &[u8]) -> Vec<u8> {
    // Return a pre-generated minimal blue JPEG (8x8 pixels)
    // This is a valid JPEG that displays as a blue square
    vec![
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x08,
        0x00, 0x08, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
        0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
        0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
        0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
        0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
        0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
        0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
        0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
        0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
        0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xF8, 0x8E, 0x9F, 0xFF,
        0xD9,
    ]
}

/// Health check endpoint
async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "Streaming server is running")
}

/// MJPEG stream handler
async fn stream_handler(
    State(state): State<Arc<AppState>>,
    Path(telescope_id): Path<String>,
) -> Response {
    info!("Starting stream for telescope: {}", telescope_id);

    // Check if telescope exists and is connected
    let connection_status = {
        let telescopes = state.telescopes.read();
        let all_ids: Vec<_> = telescopes.keys().collect();
        info!(
            "Stream handler: checking for telescope '{}', all_ids={:?}",
            telescope_id, all_ids
        );

        telescopes.get(&telescope_id).map(|t| {
            info!("Telescope '{}' status: {:?}", telescope_id, t.status);
            t.status.clone()
        })
    };

    match connection_status {
        None => {
            return (StatusCode::NOT_FOUND, format!("Telescope '{}' not found", telescope_id)).into_response();
        }
        Some(crate::state::ConnectionStatus::Disconnected) => {
            return (StatusCode::SERVICE_UNAVAILABLE, format!("Telescope '{}' is not connected", telescope_id)).into_response();
        }
        Some(crate::state::ConnectionStatus::Connecting) => {
            return (StatusCode::SERVICE_UNAVAILABLE, format!("Telescope '{}' is still connecting", telescope_id)).into_response();
        }
        Some(crate::state::ConnectionStatus::Error(e)) => {
            return (StatusCode::SERVICE_UNAVAILABLE, format!("Telescope '{}' has error: {}", telescope_id, e)).into_response();
        }
        Some(crate::state::ConnectionStatus::Connected) => {
            // Continue to streaming
        }
    }

    // Create an async stream that yields JPEG frames
    let frame_stream = stream::unfold(
        (state.clone(), telescope_id.clone()),
        |(state, telescope_id)| async move {
            // Get frame from Python bridge
            let frame_bytes = match get_frame_from_bridge(&state, &telescope_id).await {
                Ok(Some(bytes)) => bytes,
                Ok(None) => {
                    // No frame available, wait a bit
                    tokio::time::sleep(Duration::from_millis(33)).await; // ~30 fps
                    return Some((Ok::<_, std::io::Error>(Vec::new()), (state, telescope_id)));
                }
                Err(e) => {
                    error!("Error getting frame: {}", e);
                    return Some((Ok(Vec::new()), (state, telescope_id)));
                }
            };

            if frame_bytes.is_empty() {
                tokio::time::sleep(Duration::from_millis(33)).await;
                return Some((Ok(Vec::new()), (state, telescope_id)));
            }

            // Format as MJPEG multipart
            let mut response = Vec::new();
            response.extend_from_slice(b"--frame\r\n");
            response.extend_from_slice(b"Content-Type: image/jpeg\r\n");
            response
                .extend_from_slice(format!("Content-Length: {}\r\n", frame_bytes.len()).as_bytes());
            response.extend_from_slice(b"\r\n");
            response.extend_from_slice(&frame_bytes);
            response.extend_from_slice(b"\r\n");

            Some((Ok(response), (state, telescope_id)))
        },
    );

    // Convert to body - filter out empty frames
    let body = Body::from_stream(frame_stream.filter_map(|result| async move {
        match result {
            Ok(data) if !data.is_empty() => Some(Ok::<_, std::io::Error>(data)),
            _ => None,
        }
    }));

    Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            "multipart/x-mixed-replace; boundary=frame",
        )
        .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
        .header(header::PRAGMA, "no-cache")
        .header(header::EXPIRES, "0")
        .header("X-Accel-Buffering", "no") // Disable nginx buffering
        .body(body)
        .unwrap()
}

/// Get a frame from the Python bridge
async fn get_frame_from_bridge(
    state: &Arc<AppState>,
    telescope_id: &str,
) -> Result<Option<Vec<u8>>, String> {
    use pyo3::prelude::*;
    use pyo3::types::PyBytes;

    // Get the telescope's bridge
    let bridge = {
        let telescopes = state.telescopes.read();
        telescopes
            .get(telescope_id)
            .ok_or_else(|| "Telescope not found".to_string())?
            .bridge
            .clone()
    };

    // Call get_next_frame on the bridge in a blocking task
    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            // Import the helper function
            let telescope_module = py.import("telescope.telescope_bridge")?;
            let run_async = telescope_module.getattr("_run_async")?;

            // Dereference the Arc to get &PyObject, then bind it to Python context
            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            // Call the async method
            let result = run_async.call1((bridge_bound, "get_next_frame"))?;

            // Extract bytes if present
            if result.is_none() {
                tracing::info!("get_frame_from_bridge: got None from Python");
                Ok(None)
            } else {
                let bytes = result.downcast::<PyBytes>()?;
                let vec = bytes.as_bytes().to_vec();
                tracing::info!("get_frame_from_bridge: got {} bytes", vec.len());
                Ok(Some(vec))
            }
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    let frame_result = result.map_err(|e: PyErr| {
        tracing::error!("get_frame_from_bridge: Python error: {}", e);
        format!("Python error: {}", e)
    })?;
    Ok(frame_result)
}

/// Start the streaming server on a separate port
pub async fn start_streaming_server(
    state: Arc<AppState>,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    let app = create_router().with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    info!("Starting streaming server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
