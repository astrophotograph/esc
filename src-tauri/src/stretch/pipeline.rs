//! Stretch pipeline for raw telescope frames → JPEG.
//!
//! Provides `stretch_raw_frame` for converting raw pixel data from the
//! Seestar imaging port into stretched JPEG bytes suitable for streaming.

use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use rayon::prelude::*;

use super::autocrop;
use super::gradient;
use super::mtf;

/// Parameters for the stretch pipeline.
pub struct StretchParams {
    pub bg_percent: f64,
    pub sigma: f64,
    pub gradient_removal: bool,
    pub autocrop: bool,
}

impl Default for StretchParams {
    fn default() -> Self {
        Self {
            bg_percent: 0.15,
            sigma: 3.0,
            gradient_removal: true,
            autocrop: true,
        }
    }
}

/// Stretch raw frame data and encode to JPEG bytes.
///
/// Auto-detects pixel format from data length:
/// - `w*h*6` → uint16 LE interleaved RGB
/// - `w*h*2` → uint16 LE Bayer GRBG (2×2 binned → half resolution)
/// - `w*h*3` → uint8 interleaved RGB
/// - `w*h`   → uint8 mono
///
/// Returns JPEG-encoded bytes.
pub fn stretch_raw_frame(
    data: &[u8],
    width: u32,
    height: u32,
    _is_color: bool,
    params: &StretchParams,
) -> Result<Vec<u8>, String> {
    let w = width as usize;
    let h = height as usize;
    let pixels = w * h;

    // Auto-detect format from data length; derive output dimensions and f64 channels
    let (out_w, out_h, mut channels): (usize, usize, Vec<Vec<f64>>) = match data.len() {
        n if n == pixels * 6 => {
            // 16-bit interleaved RGB (uint16 LE per component: R G B)
            let mut r = Vec::with_capacity(pixels);
            let mut g = Vec::with_capacity(pixels);
            let mut b = Vec::with_capacity(pixels);
            for i in 0..pixels {
                let base = i * 6;
                r.push(u16::from_le_bytes([data[base],     data[base + 1]]) as f64 / 65535.0);
                g.push(u16::from_le_bytes([data[base + 2], data[base + 3]]) as f64 / 65535.0);
                b.push(u16::from_le_bytes([data[base + 4], data[base + 5]]) as f64 / 65535.0);
            }
            (w, h, vec![r, g, b])
        }
        n if n == pixels * 2 => {
            // 16-bit Bayer GRBG — 2×2 binning demosaic → half resolution color
            // Pattern: (even row, even col)=G  (even row, odd col)=R
            //          (odd  row, even col)=B  (odd  row, odd col)=G
            let ow = w / 2;
            let oh = h / 2;
            let out_pixels = ow * oh;
            let mut r = Vec::with_capacity(out_pixels);
            let mut g = Vec::with_capacity(out_pixels);
            let mut b = Vec::with_capacity(out_pixels);
            for row in 0..oh {
                for col in 0..ow {
                    let sr = row * 2;
                    let sc = col * 2;
                    let ig0 = (sr * w + sc) * 2;
                    let ir  = (sr * w + sc + 1) * 2;
                    let ib  = ((sr + 1) * w + sc) * 2;
                    let ig1 = ((sr + 1) * w + sc + 1) * 2;
                    let g0 = u16::from_le_bytes([data[ig0], data[ig0 + 1]]) as f64;
                    let rv = u16::from_le_bytes([data[ir],  data[ir  + 1]]) as f64;
                    let bv = u16::from_le_bytes([data[ib],  data[ib  + 1]]) as f64;
                    let g1 = u16::from_le_bytes([data[ig1], data[ig1 + 1]]) as f64;
                    r.push(rv / 65535.0);
                    g.push((g0 + g1) / 2.0 / 65535.0);
                    b.push(bv / 65535.0);
                }
            }
            (ow, oh, vec![r, g, b])
        }
        n if n >= pixels * 3 => {
            // 8-bit interleaved RGB
            let mut r = Vec::with_capacity(pixels);
            let mut g = Vec::with_capacity(pixels);
            let mut b = Vec::with_capacity(pixels);
            for i in 0..pixels {
                r.push(data[i * 3]     as f64 / 255.0);
                g.push(data[i * 3 + 1] as f64 / 255.0);
                b.push(data[i * 3 + 2] as f64 / 255.0);
            }
            (w, h, vec![r, g, b])
        }
        _ => {
            // 8-bit mono (treat undersized as padded mono)
            let count = pixels.min(data.len());
            let mut ch: Vec<f64> = data[..count].iter().map(|&v| v as f64 / 255.0).collect();
            ch.resize(pixels, 0.0);
            (w, h, vec![ch])
        }
    };

    let is_color = channels.len() == 3;
    let channel_size = out_w * out_h;

    // Autocrop — detect edges from averaged channels
    let crop_bounds = if params.autocrop {
        let mono: Vec<f64> = if is_color {
            (0..channel_size)
                .map(|i| (channels[0][i] + channels[1][i] + channels[2][i]) / 3.0)
                .collect()
        } else {
            channels[0].clone()
        };
        autocrop::detect_edges(&mono, out_w, out_h)
    } else {
        (0, 0, 0, 0)
    };

    // Normalize — compute percentiles from interior, apply to full frame
    let (top, bottom, left, right) = crop_bounds;
    let interior_y0 = top;
    let interior_y1 = out_h - bottom;
    let interior_x0 = left;
    let interior_x1 = out_w - right;

    channels.par_iter_mut().for_each(|ch| {
        let mut interior: Vec<f64> = if top > 0 || bottom > 0 || left > 0 || right > 0 {
            let mut v = Vec::new();
            for y in interior_y0..interior_y1 {
                for x in interior_x0..interior_x1 {
                    v.push(ch[y * out_w + x]);
                }
            }
            v
        } else {
            ch.clone()
        };

        let (vmin, vmax) = percentiles_in_place(&mut interior, 0.001, 0.9999);
        let range = vmax - vmin;
        if range > 0.0 {
            for v in ch.iter_mut() {
                *v = ((*v - vmin) / range).clamp(0.0, 1.0);
            }
        }
    });

    // Gradient removal
    if params.gradient_removal {
        let order = 2;
        channels.par_iter_mut().for_each(|ch| {
            let corrected = gradient::remove_gradient(ch, out_w, out_h, order);
            ch.copy_from_slice(&corrected);
        });
    }

    // MTF stretch
    mtf::stretch_mtf_rgb(&mut channels, params.bg_percent, params.sigma);

    // Interleave channels → RGB bytes → JPEG
    let mut rgb = vec![0u8; channel_size * 3];

    if is_color {
        for i in 0..channel_size {
            rgb[i * 3]     = (channels[0][i] * 255.0).clamp(0.0, 255.0) as u8;
            rgb[i * 3 + 1] = (channels[1][i] * 255.0).clamp(0.0, 255.0) as u8;
            rgb[i * 3 + 2] = (channels[2][i] * 255.0).clamp(0.0, 255.0) as u8;
        }
    } else {
        for i in 0..channel_size {
            let v = (channels[0][i] * 255.0).clamp(0.0, 255.0) as u8;
            rgb[i * 3]     = v;
            rgb[i * 3 + 1] = v;
            rgb[i * 3 + 2] = v;
        }
    }

    let img = image::RgbImage::from_raw(out_w as u32, out_h as u32, rgb)
        .ok_or("Failed to create image buffer")?;

    let mut jpeg_buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, 85);
    img.write_with_encoder(encoder)
        .map_err(|e| format!("Failed to encode JPEG: {e}"))?;

    Ok(jpeg_buf.into_inner())
}

/// Read a FITS file and extract pixel data as f64 channels.
///
/// Returns `(width, height, pixels, is_color)`.
/// `pixels` is a flat array — mono has `w*h` elements, color has `3*w*h` (planes: R, G, B).
pub fn read_fits_pixels(path: &std::path::Path) -> Result<(usize, usize, Vec<f64>, bool), String> {
    use fitrs::Fits;
    let fits = Fits::open(path).map_err(|e| format!("Failed to open FITS: {}", e))?;
    let hdu = fits.into_iter().next().ok_or("No HDU in FITS file")?;
    let (width, height, pixels) = match hdu.read_data() {
        fitrs::FitsData::FloatingPoint32(data) => {
            let (w, h) = extract_dims(&data.shape);
            let pixels: Vec<f64> = data.data.iter().map(|&x| x as f64).collect();
            (w, h, pixels)
        }
        fitrs::FitsData::FloatingPoint64(data) => {
            let (w, h) = extract_dims(&data.shape);
            (w, h, data.data.clone())
        }
        fitrs::FitsData::IntegersI32(data) => {
            let (w, h) = extract_dims(&data.shape);
            let pixels: Vec<f64> = data.data.iter().map(|x| x.unwrap_or(0) as f64).collect();
            (w, h, pixels)
        }
        fitrs::FitsData::IntegersU32(data) => {
            let (w, h) = extract_dims(&data.shape);
            let pixels: Vec<f64> = data.data.iter().map(|x| x.unwrap_or(0) as f64).collect();
            (w, h, pixels)
        }
        _ => return Err("Unsupported FITS pixel format".to_string()),
    };
    let channel_size = width * height;
    let is_color = pixels.len() >= channel_size * 3;
    Ok((width, height, pixels, is_color))
}

fn extract_dims(shape: &[usize]) -> (usize, usize) {
    match shape.len() {
        2 => (shape[0], shape[1]),
        3 => (shape[0], shape[1]),
        _ => (shape[0], shape.get(1).copied().unwrap_or(1)),
    }
}

/// Process a FITS file: read → stretch → save as JPEG/PNG.
/// Returns the output path on success.
pub fn process_fits_file(
    fits_path: &std::path::Path,
    output_path: &std::path::Path,
    params: &StretchParams,
) -> Result<String, String> {
    let (w, h, pixels, is_color) = read_fits_pixels(fits_path)?;
    let channel_size = w * h;

    // Split into channels (FITS color data is stored as planes: all R, then G, then B)
    let mut channels: Vec<Vec<f64>> = if is_color {
        vec![
            pixels[..channel_size].to_vec(),
            pixels[channel_size..channel_size * 2].to_vec(),
            pixels[channel_size * 2..channel_size * 3].to_vec(),
        ]
    } else {
        vec![pixels[..channel_size].to_vec()]
    };

    // Autocrop — detect edges from averaged channels
    let crop_bounds = if params.autocrop {
        let mono: Vec<f64> = if is_color {
            (0..channel_size)
                .map(|i| (channels[0][i] + channels[1][i] + channels[2][i]) / 3.0)
                .collect()
        } else {
            channels[0].clone()
        };
        autocrop::detect_edges(&mono, w, h)
    } else {
        (0, 0, 0, 0)
    };

    // Normalize — compute percentiles from interior, apply to full frame
    let (top, bottom, left, right) = crop_bounds;
    let interior_y0 = top;
    let interior_y1 = h - bottom;
    let interior_x0 = left;
    let interior_x1 = w - right;

    channels.par_iter_mut().for_each(|ch| {
        let mut interior: Vec<f64> = if top > 0 || bottom > 0 || left > 0 || right > 0 {
            let mut v = Vec::new();
            for y in interior_y0..interior_y1 {
                for x in interior_x0..interior_x1 {
                    v.push(ch[y * w + x]);
                }
            }
            v
        } else {
            ch.clone()
        };

        let (vmin, vmax) = percentiles_in_place(&mut interior, 0.001, 0.9999);
        let range = vmax - vmin;
        if range > 0.0 {
            for v in ch.iter_mut() {
                *v = ((*v - vmin) / range).clamp(0.0, 1.0);
            }
        }
    });

    // Gradient removal
    if params.gradient_removal {
        let order = 2;
        channels.par_iter_mut().for_each(|ch| {
            let corrected = gradient::remove_gradient(ch, w, h, order);
            ch.copy_from_slice(&corrected);
        });
    }

    // MTF stretch
    mtf::stretch_mtf_rgb(&mut channels, params.bg_percent, params.sigma);

    // Interleave channels → RGB bytes
    let width = w as u32;
    let height = h as u32;
    let mut rgb = vec![0u8; channel_size * 3];

    if is_color {
        for i in 0..channel_size {
            rgb[i * 3] = (channels[0][i] * 255.0).clamp(0.0, 255.0) as u8;
            rgb[i * 3 + 1] = (channels[1][i] * 255.0).clamp(0.0, 255.0) as u8;
            rgb[i * 3 + 2] = (channels[2][i] * 255.0).clamp(0.0, 255.0) as u8;
        }
    } else {
        for i in 0..channel_size {
            let v = (channels[0][i] * 255.0).clamp(0.0, 255.0) as u8;
            rgb[i * 3] = v;
            rgb[i * 3 + 1] = v;
            rgb[i * 3 + 2] = v;
        }
    }

    let img = image::RgbImage::from_raw(width, height, rgb)
        .ok_or("Failed to create image buffer")?;

    // Save based on output extension
    let ext = output_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();

    match ext.as_str() {
        "png" => {
            img.save(output_path)
                .map_err(|e| format!("Failed to save PNG: {e}"))?;
        }
        _ => {
            // Default to JPEG
            let file = std::fs::File::create(output_path)
                .map_err(|e| format!("Failed to create output file: {e}"))?;
            let mut writer = std::io::BufWriter::new(file);
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 90);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("Failed to encode JPEG: {e}"))?;
        }
    }

    Ok(output_path.to_string_lossy().into_owned())
}

/// Compute two percentiles using quickselect (O(n) each).
fn percentiles_in_place(data: &mut [f64], lo_frac: f64, hi_frac: f64) -> (f64, f64) {
    if data.is_empty() {
        return (0.0, 1.0);
    }
    let cmp = |a: &f64, b: &f64| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal);
    let lo_idx = ((data.len() as f64 * lo_frac) as usize).min(data.len() - 1);
    data.select_nth_unstable_by(lo_idx, cmp);
    let lo_val = data[lo_idx];

    let hi_idx = ((data.len() as f64 * hi_frac) as usize).min(data.len() - 1);
    data.select_nth_unstable_by(hi_idx, cmp);
    let hi_val = data[hi_idx];

    (lo_val, hi_val)
}
