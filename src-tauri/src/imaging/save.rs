//! Saving an image from the telescope: fetch the stacked image (or, when
//! nothing has been stacked, the current preview frame) and encode it.

use std::io::Cursor;
use std::sync::Arc;

use scopinator_seestar::command::ImagingCommand;
use scopinator_seestar::connection::imaging::ImageFrame;
use scopinator_seestar::error::SeestarError;
use scopinator_seestar::protocol::frame::PayloadKind;
use scopinator_seestar::SeestarClient;

use crate::stretch::{stretch_raw_frame_rgb, StretchParams};

/// Output formats offered by the save dialog.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveFormat {
    /// 8-bit, stretched for viewing, lossless encoding.
    Png,
    /// 8-bit, stretched for viewing.
    Jpeg,
    /// The telescope's linear 16-bit data, unstretched.
    Fits,
}

impl SaveFormat {
    pub fn parse(name: &str) -> Result<Self, String> {
        match name.to_ascii_lowercase().as_str() {
            "png" => Ok(Self::Png),
            "jpg" | "jpeg" => Ok(Self::Jpeg),
            "fits" | "fit" => Ok(Self::Fits),
            other => Err(format!("Unsupported image format: {other}")),
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Fits => "fits",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Fits => "application/fits",
        }
    }
}

/// Which image the telescope gave us.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageSource {
    /// The live stack.
    Stack,
    /// The current preview frame (nothing has been stacked).
    Preview,
}

/// An encoded image ready to be written or downloaded.
pub struct EncodedImage {
    pub bytes: Vec<u8>,
    pub format: SaveFormat,
    pub source: ImageSource,
    pub width: u32,
    pub height: u32,
}

/// Fetch the stacked image; when the telescope has none ("there is no image
/// now"), fall back to the current preview frame.
pub async fn fetch_image(client: &SeestarClient) -> Result<(Arc<ImageFrame>, ImageSource), String> {
    match client.get_stacked_image().await {
        Ok(frame) => Ok((frame, ImageSource::Stack)),
        Err(SeestarError::ImageRequest(reason)) => {
            tracing::info!("no stacked image ({reason}); using the current preview frame");
            let frame = client
                .request_image(ImagingCommand::GetCurrentImage {
                    compress: None,
                    raw: false,
                })
                .await
                .map_err(|e| format!("No stacked image, and no preview frame either: {e}"))?;
            Ok((frame, ImageSource::Preview))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Fetch an image from the telescope and encode it as `format`.
pub async fn fetch_and_encode(
    client: &SeestarClient,
    format: SaveFormat,
) -> Result<EncodedImage, String> {
    let (frame, source) = fetch_image(client).await?;
    let kind = frame.payload_kind();
    let pixels = frame.image_bytes().map_err(|e| e.to_string())?;
    let (width, height) = (frame.header.width as u32, frame.header.height as u32);
    // Encoding a full stack takes a moment; keep it off the async workers.
    tokio::task::spawn_blocking(move || {
        encode(&pixels, width, height, kind == PayloadKind::Jpeg, format).map(
            |(bytes, width, height)| EncodedImage {
                bytes,
                format,
                source,
                width,
                height,
            },
        )
    })
    .await
    .map_err(|e| format!("encoder task failed: {e}"))?
}

/// Encode image bytes from the telescope. `is_jpeg` says the telescope already
/// sent a JPEG (its `image_transfer_mode` is Jpg) rather than raw pixels.
/// Returns the encoded bytes and the encoded image's dimensions.
pub fn encode(
    pixels: &[u8],
    width: u32,
    height: u32,
    is_jpeg: bool,
    format: SaveFormat,
) -> Result<(Vec<u8>, u32, u32), String> {
    let view_params = StretchParams {
        gradient_removal: false,
        autocrop: false,
        ..Default::default()
    };
    match (format, is_jpeg) {
        (SaveFormat::Jpeg, true) => Ok((pixels.to_vec(), width, height)),
        (SaveFormat::Png, true) => {
            let img = image::load_from_memory_with_format(pixels, image::ImageFormat::Jpeg)
                .map_err(|e| format!("Could not decode the telescope's JPEG: {e}"))?;
            let (w, h) = (img.width(), img.height());
            let mut out = Cursor::new(Vec::new());
            img.write_to(&mut out, image::ImageFormat::Png)
                .map_err(|e| format!("Failed to encode PNG: {e}"))?;
            Ok((out.into_inner(), w, h))
        }
        (SaveFormat::Fits, true) => Err(
            "The telescope sent a JPEG, which has no raw data to put in a FITS file".to_string(),
        ),
        (SaveFormat::Jpeg, false) => {
            let (w, h, rgb) = stretch_raw_frame_rgb(pixels, width, height, &view_params)?;
            let img = image::RgbImage::from_raw(w, h, rgb).ok_or("Failed to create image buffer")?;
            let mut out = Cursor::new(Vec::new());
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 92);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("Failed to encode JPEG: {e}"))?;
            Ok((out.into_inner(), w, h))
        }
        (SaveFormat::Png, false) => {
            let (w, h, rgb) = stretch_raw_frame_rgb(pixels, width, height, &view_params)?;
            let img = image::RgbImage::from_raw(w, h, rgb).ok_or("Failed to create image buffer")?;
            let mut out = Cursor::new(Vec::new());
            img.write_to(&mut out, image::ImageFormat::Png)
                .map_err(|e| format!("Failed to encode PNG: {e}"))?;
            Ok((out.into_inner(), w, h))
        }
        (SaveFormat::Fits, false) => Ok((encode_fits(pixels, width, height)?, width, height)),
    }
}

/// Write 16-bit little-endian pixel data as a FITS file: an RGB cube
/// (`NAXIS3 = 3`) for interleaved RGB (`w*h*6` bytes), a single plane with
/// `BAYERPAT` for a Bayer frame (`w*h*2` bytes). FITS has no unsigned 16-bit
/// type, so values are stored as signed with `BZERO = 32768`.
pub fn encode_fits(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    const BLOCK: usize = 2880;
    let (w, h) = (width as usize, height as usize);
    let count = w * h;
    let planes = match pixels.len() {
        n if count > 0 && n == count * 6 => 3,
        n if count > 0 && n == count * 2 => 1,
        n => {
            return Err(format!(
                "Cannot write FITS: {n} bytes is not 16-bit RGB or Bayer data for {width}x{height}"
            ))
        }
    };

    let mut cards: Vec<String> = vec![
        format!("{:<8}= {:>20}", "SIMPLE", "T"),
        format!("{:<8}= {:>20}", "BITPIX", 16),
        format!("{:<8}= {:>20}", "NAXIS", if planes == 3 { 3 } else { 2 }),
        format!("{:<8}= {:>20}", "NAXIS1", w),
        format!("{:<8}= {:>20}", "NAXIS2", h),
    ];
    if planes == 3 {
        cards.push(format!("{:<8}= {:>20}", "NAXIS3", 3));
    }
    cards.push(format!("{:<8}= {:>20}", "BZERO", 32768));
    cards.push(format!("{:<8}= {:>20}", "BSCALE", 1));
    if planes == 1 {
        cards.push(format!("{:<8}= {:<20}", "BAYERPAT", "'GRBG    '"));
    }
    cards.push(format!("{:<8}= {:<20}", "CREATOR", "'ESC     '"));
    cards.push("END".to_string());

    let mut out = Vec::with_capacity(BLOCK + pixels.len() + BLOCK);
    for card in &cards {
        out.extend_from_slice(format!("{card:<80}").as_bytes());
    }
    out.resize(out.len().div_ceil(BLOCK) * BLOCK, b' ');

    // One plane after another, each value big-endian signed (value - 32768).
    for plane in 0..planes {
        for i in 0..count {
            let at = (i * planes + plane) * 2;
            let value = u16::from_le_bytes([pixels[at], pixels[at + 1]]);
            out.extend_from_slice(&((value as i32 - 32768) as i16).to_be_bytes());
        }
    }
    out.resize(out.len().div_ceil(BLOCK) * BLOCK, 0);
    Ok(out)
}

/// A file name that is safe to use in a path or a Content-Disposition header:
/// the final path component, with anything but letters, digits, `-`, `_` and
/// `.` replaced, and the format's extension enforced.
pub fn safe_file_name(requested: &str, format: SaveFormat) -> String {
    let base = requested.rsplit(['/', '\\']).next().unwrap_or("");
    let stem = base.rsplit_once('.').map_or(base, |(stem, _)| stem);
    let mut clean: String = stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if clean.trim_matches('_').is_empty() {
        clean = "capture".to_string();
    }
    format!("{clean}.{}", format.extension())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 4x2 16-bit RGB: pixel i has R=i*1000, G=i*1000+1, B=i*1000+2.
    fn rgb16(w: usize, h: usize) -> Vec<u8> {
        let mut out = Vec::new();
        for i in 0..w * h {
            for c in 0..3u16 {
                out.extend_from_slice(&(i as u16 * 1000 + c).to_le_bytes());
            }
        }
        out
    }

    #[test]
    fn fits_rgb_is_a_three_plane_cube_in_whole_blocks() {
        let fits = encode_fits(&rgb16(4, 2), 4, 2).unwrap();
        assert_eq!(fits.len() % 2880, 0);
        let header = std::str::from_utf8(&fits[..2880]).unwrap();
        assert!(header.starts_with("SIMPLE  =                    T"));
        assert!(header.contains("NAXIS   =                    3"));
        assert!(header.contains("NAXIS1  =                    4"));
        assert!(header.contains("NAXIS3  =                    3"));
        assert!(header.contains("BZERO   =                32768"));
        // Plane 0 (red) of pixel 1 is 1000; plane 2 (blue) of pixel 7 is 7002.
        let value = |index: usize| {
            let at = 2880 + index * 2;
            i16::from_be_bytes([fits[at], fits[at + 1]]) as i32 + 32768
        };
        assert_eq!(value(1), 1000);
        assert_eq!(value(2 * 8 + 7), 7002);
    }

    #[test]
    fn fits_bayer_is_one_plane_with_the_pattern_recorded() {
        let data: Vec<u8> = (0..16u16).flat_map(|v| (v * 100).to_le_bytes()).collect();
        let fits = encode_fits(&data, 4, 4).unwrap();
        let header = std::str::from_utf8(&fits[..2880]).unwrap();
        assert!(header.contains("NAXIS   =                    2"));
        assert!(header.contains("BAYERPAT= 'GRBG    '"));
        assert!(!header.contains("NAXIS3"));
    }

    #[test]
    fn fits_refuses_data_of_the_wrong_size() {
        assert!(encode_fits(&[0u8; 10], 4, 2).is_err());
    }

    #[test]
    fn png_and_jpeg_come_out_as_decodable_images() {
        let raw = rgb16(8, 6);
        for format in [SaveFormat::Png, SaveFormat::Jpeg] {
            let (bytes, w, h) = encode(&raw, 8, 6, false, format).unwrap();
            let img = image::load_from_memory(&bytes).unwrap();
            assert_eq!((img.width(), img.height()), (8, 6));
            assert_eq!((w, h), (8, 6));
        }
    }

    #[test]
    fn fits_from_a_jpeg_is_an_error() {
        assert!(encode(&[0xFF, 0xD8], 8, 6, true, SaveFormat::Fits).is_err());
    }

    #[test]
    fn file_names_are_reduced_to_a_safe_final_component() {
        assert_eq!(safe_file_name("M31_2026.png", SaveFormat::Png), "M31_2026.png");
        assert_eq!(safe_file_name("../../etc/passwd", SaveFormat::Jpeg), "passwd.jpg");
        assert_eq!(safe_file_name("a b\"c.fits", SaveFormat::Fits), "a_b_c.fits");
        assert_eq!(safe_file_name("", SaveFormat::Png), "capture.png");
        assert_eq!(safe_file_name("x.jpg", SaveFormat::Fits), "x.fits");
    }
}
