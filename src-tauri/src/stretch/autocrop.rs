//! Detect and report dark stacking edges.
//!
//! Returns crop bounds but does NOT resize — the caller uses these bounds
//! to compute statistics from the clean interior only.

/// Crop bounds: (top, bottom, left, right) pixels to exclude.
pub type CropBounds = (usize, usize, usize, usize);

/// Detect dark edges in a single-channel image.
/// `data` is row-major, `width` x `height`.
pub fn detect_edges(data: &[f64], width: usize, height: usize) -> CropBounds {
    let threshold_frac = 0.15;
    let max_crop_frac = 0.20;
    let min_crop_pixels = std::cmp::max(1, std::cmp::min(width, height) / 100);

    // Row medians
    let row_medians: Vec<f64> = (0..height)
        .map(|y| median(&data[y * width..(y + 1) * width]))
        .collect();

    // Column medians
    let col_medians: Vec<f64> = (0..width)
        .map(|x| {
            let col: Vec<f64> = (0..height).map(|y| data[y * width + x]).collect();
            median(&col)
        })
        .collect();

    // Interior reference (central 60%)
    let ry0 = height / 5;
    let ry1 = height * 4 / 5;
    let cx0 = width / 5;
    let cx1 = width * 4 / 5;

    let mut interior: Vec<f64> = row_medians[ry0..ry1].to_vec();
    interior.extend_from_slice(&col_medians[cx0..cx1]);
    let interior_med = median(&interior);

    if interior_med <= 0.0 {
        return (0, 0, 0, 0);
    }

    let dark_thresh = interior_med * threshold_frac;
    let max_rows = (height as f64 * max_crop_frac) as usize;
    let max_cols = (width as f64 * max_crop_frac) as usize;

    let top = find_edge(&row_medians, dark_thresh, min_crop_pixels, max_rows);
    let bottom = find_edge_rev(&row_medians, dark_thresh, min_crop_pixels, max_rows);
    let left = find_edge(&col_medians, dark_thresh, min_crop_pixels, max_cols);
    let right = find_edge_rev(&col_medians, dark_thresh, min_crop_pixels, max_cols);

    (top, bottom, left, right)
}

fn find_edge(medians: &[f64], threshold: f64, min_px: usize, max_px: usize) -> usize {
    let mut count = 0;
    for (i, &v) in medians.iter().take(max_px).enumerate() {
        if v < threshold {
            count = i + 1;
        } else {
            break;
        }
    }
    if count >= min_px { count } else { 0 }
}

fn find_edge_rev(medians: &[f64], threshold: f64, min_px: usize, max_px: usize) -> usize {
    let mut count = 0;
    for (i, &v) in medians.iter().rev().take(max_px).enumerate() {
        if v < threshold {
            count = i + 1;
        } else {
            break;
        }
    }
    if count >= min_px { count } else { 0 }
}

fn median(data: &[f64]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let mut buf: Vec<f64> = data.iter().copied().filter(|x| x.is_finite()).collect();
    if buf.is_empty() {
        return 0.0;
    }
    let mid = buf.len() / 2;
    buf.select_nth_unstable_by(mid, |a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    buf[mid]
}
