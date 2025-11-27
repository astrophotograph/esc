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
        .route("/health", get(health_check))
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

    // Check if telescope exists
    let telescope_exists = {
        let telescopes = state.telescopes.read();
        telescopes.contains_key(&telescope_id)
    };

    if !telescope_exists {
        return (StatusCode::NOT_FOUND, "Telescope not found").into_response();
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

    tracing::info!(
        "get_frame_from_bridge called for telescope: {}",
        telescope_id
    );

    // Get the telescope's bridge
    let bridge = {
        let telescopes = state.telescopes.read();
        telescopes
            .get(telescope_id)
            .ok_or_else(|| {
                tracing::warn!("Telescope {} not found in state", telescope_id);
                "Telescope not found".to_string()
            })?
            .bridge
            .clone()
    };

    // Call get_next_frame on the bridge in a blocking task
    let result = tokio::task::spawn_blocking(move || {
        Python::with_gil(|py| {
            // Import the helper function
            let telescope_module = py.import("telescope.seestar_bridge")?;
            let run_async = telescope_module.getattr("_run_async")?;

            // Dereference the Arc to get &PyObject, then bind it to Python context
            let bridge_ref = bridge.as_ref();
            let bridge_bound = bridge_ref.bind(py);

            // Call the async method
            let result = run_async.call1((bridge_bound, "get_next_frame"))?;

            // Extract bytes if present
            if result.is_none() {
                Ok(None)
            } else {
                let bytes = result.downcast::<PyBytes>()?;
                let vec = bytes.as_bytes().to_vec();
                tracing::info!("Got frame from Python: {} bytes", vec.len());
                Ok(Some(vec))
            }
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    let frame_result = result.map_err(|e: PyErr| format!("Python error: {}", e))?;
    if frame_result.is_none() {
        tracing::info!("get_next_frame returned None");
    }
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
