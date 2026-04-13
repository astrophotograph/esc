//! Native image stretching pipeline for telescope live view.
//!
//! Adapted from Astra's stretch pipeline. Handles:
//! - Raw frame processing (from scopinator-rs ImageFrame)
//! - Per-channel normalization
//! - Background gradient removal (polynomial surface fit)
//! - MTF (Midtones Transfer Function) stretch
//! - JPEG output (via image crate)

mod autocrop;
mod gradient;
pub mod mtf;
mod pipeline;

pub use pipeline::{process_fits_file, read_fits_pixels, stretch_raw_frame, StretchParams};
