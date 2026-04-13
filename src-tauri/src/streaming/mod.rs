use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures::stream::{self, StreamExt};
use std::io::Cursor;
use std::sync::Arc;
use tokio::sync::watch;
use tokio::time::Duration;
use tracing::{debug, error, info, warn};

use crate::state::AppState;
use crate::stretch::{stretch_raw_frame, StretchParams};

/// Create the streaming router
pub fn create_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/stream/:telescope_id", get(stream_handler))
        .route("/test-pattern", get(test_pattern_handler))
        .route("/test-mjpeg", get(test_mjpeg_stream))
        .route("/health", get(health_check))
}

/// Test MJPEG stream endpoint - returns a simple stream without Python
async fn test_mjpeg_stream() -> Response {
    info!("Starting test MJPEG stream");

    let frame_stream = stream::unfold(0u32, |counter| async move {
        if counter >= 100 {
            return None;
        }

        let test_frame = generate_placeholder_jpeg(640, 480, counter);

        let mut response = Vec::new();
        response.extend_from_slice(b"--frame\r\n");
        response.extend_from_slice(b"Content-Type: image/jpeg\r\n");
        response.extend_from_slice(format!("Content-Length: {}\r\n", test_frame.len()).as_bytes());
        response.extend_from_slice(b"\r\n");
        response.extend_from_slice(&test_frame);
        response.extend_from_slice(b"\r\n");

        tokio::time::sleep(Duration::from_millis(100)).await;

        Some((Ok::<_, std::io::Error>(response), counter + 1))
    });

    let body = Body::from_stream(frame_stream);

    Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            "multipart/x-mixed-replace; boundary=frame",
        )
        .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
        .header(header::PRAGMA, "no-cache")
        .header(header::EXPIRES, "0")
        .header("X-Accel-Buffering", "no")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap()
}

/// Test pattern endpoint - returns a simple colored frame for testing
async fn test_pattern_handler() -> Response {
    let test_frame = generate_placeholder_jpeg(640, 480, 0);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/jpeg")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(test_frame))
        .unwrap()
}

/// Generate a placeholder JPEG using the image crate (pure Rust)
fn generate_placeholder_jpeg(width: u32, height: u32, frame_num: u32) -> Vec<u8> {
    use image::codecs::jpeg::JpegEncoder;

    let mut rgb_data = vec![0u8; (width * height * 3) as usize];

    for y in 0..height {
        for x in 0..width {
            let idx = ((y * width + x) * 3) as usize;
            // Dark gradient with a subtle animation based on frame_num
            let offset = (frame_num * 3) as u8;
            rgb_data[idx] = ((x * 40 / width) as u8).wrapping_add(offset); // R
            rgb_data[idx + 1] = ((y * 40 / height) as u8).wrapping_add(offset); // G
            rgb_data[idx + 2] = 30; // B
        }
    }

    let img = image::RgbImage::from_raw(width, height, rgb_data)
        .expect("Failed to create placeholder image");

    let mut jpeg_buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, 50);
    img.write_with_encoder(encoder).expect("Failed to encode placeholder JPEG");

    jpeg_buf.into_inner()
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

    // Check if telescope exists, is connected, and has a native client
    let client = {
        let telescopes = state.telescopes.read();

        let telescope = match telescopes.get(&telescope_id) {
            Some(t) => t,
            None => {
                return (
                    StatusCode::NOT_FOUND,
                    format!("Telescope '{}' not found", telescope_id),
                )
                    .into_response();
            }
        };

        match &telescope.status {
            crate::state::ConnectionStatus::Connected => {}
            crate::state::ConnectionStatus::Disconnected => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Telescope '{}' is not connected", telescope_id),
                )
                    .into_response();
            }
            crate::state::ConnectionStatus::Connecting => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Telescope '{}' is still connecting", telescope_id),
                )
                    .into_response();
            }
            crate::state::ConnectionStatus::Error(e) => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Telescope '{}' has error: {}", telescope_id, e),
                )
                    .into_response();
            }
        }

        match &telescope.client {
            Some(c) => c.clone(),
            None => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "No native client available for streaming".to_string(),
                )
                    .into_response();
            }
        }
    };

    // Subscribe to imaging frames from the native client
    let mut frame_rx = client.subscribe_frames();

    // Create a watch channel to share the latest processed JPEG frame
    let placeholder = generate_placeholder_jpeg(640, 480, 0);
    let (jpeg_tx, jpeg_rx) = watch::channel(placeholder);

    // Spawn background task to receive raw frames, stretch, and encode to JPEG
    let telescope_id_for_fetcher = telescope_id.clone();
    tokio::spawn(async move {
        info!(
            "Frame processor: starting for '{}'",
            telescope_id_for_fetcher
        );
        let stretch_params = StretchParams {
            // Lighter stretch for live view — skip expensive gradient removal
            gradient_removal: false,
            autocrop: false,
            ..Default::default()
        };

        loop {
            match frame_rx.recv().await {
                Ok(frame) => {
                    if !frame.header.is_image() {
                        continue;
                    }

                    let width = frame.header.width as u32;
                    let height = frame.header.height as u32;
                    let data = frame.data.clone();

                    // Determine if color based on data size vs dimensions
                    // RGB interleaved = w*h*3, mono = w*h
                    let expected_rgb = (width * height * 3) as usize;
                    let is_color = data.len() >= expected_rgb;

                    // Offload stretch + JPEG encode to a blocking task
                    let params = StretchParams {
                        gradient_removal: stretch_params.gradient_removal,
                        autocrop: stretch_params.autocrop,
                        ..Default::default()
                    };
                    let jpeg_tx = jpeg_tx.clone();

                    tokio::task::spawn_blocking(move || {
                        match stretch_raw_frame(&data, width, height, is_color, &params) {
                            Ok(jpeg_bytes) => {
                                debug!(
                                    "Frame processor: stretched {}x{} → {} byte JPEG",
                                    width,
                                    height,
                                    jpeg_bytes.len()
                                );
                                let _ = jpeg_tx.send(jpeg_bytes);
                            }
                            Err(e) => {
                                warn!("Frame processor: stretch failed: {}", e);
                            }
                        }
                    });
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    debug!("Frame processor: skipped {} frames (lagged)", n);
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    info!(
                        "Frame processor: channel closed for '{}'",
                        telescope_id_for_fetcher
                    );
                    break;
                }
            }
        }
        info!(
            "Frame processor: stopped for '{}'",
            telescope_id_for_fetcher
        );
    });

    // Stream that sends JPEG frames at regular intervals
    let keep_alive_interval = Duration::from_millis(500);
    let frame_stream = stream::unfold(
        (jpeg_rx, true),
        move |(mut rx, is_first)| async move {
            let frame_bytes = rx.borrow().clone();

            if frame_bytes.is_empty() {
                tokio::time::sleep(keep_alive_interval).await;
                return Some((Ok::<_, std::io::Error>(Vec::new()), (rx, false)));
            }

            let mut response = Vec::new();
            response.extend_from_slice(b"--frame\r\n");
            response.extend_from_slice(b"Content-Type: image/jpeg\r\n");
            response
                .extend_from_slice(format!("Content-Length: {}\r\n", frame_bytes.len()).as_bytes());
            response.extend_from_slice(b"\r\n");
            response.extend_from_slice(&frame_bytes);
            response.extend_from_slice(b"\r\n");

            if is_first {
                info!(
                    "Keep-alive stream: sending initial frame ({} bytes)",
                    response.len()
                );
            }

            tokio::time::sleep(keep_alive_interval).await;

            Some((Ok(response), (rx, false)))
        },
    );

    let body = Body::from_stream(frame_stream.filter_map(|result| async move {
        match result {
            Ok(data) if !data.is_empty() => Some(Ok::<_, std::io::Error>(data)),
            Ok(_) => None,
            Err(e) => {
                error!("Stream error: {:?}", e);
                None
            }
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
        .header("X-Accel-Buffering", "no")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "*")
        .body(body)
        .unwrap()
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
