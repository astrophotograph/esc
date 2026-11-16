//! Stretch a raw frame dumped from the imaging port and write it as a JPEG.
//!
//! usage: stretch_raw <raw.bin> <width> <height> <out.jpg>
use eesc_lib::stretch::{stretch_raw_frame, StretchParams};

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let data = std::fs::read(&a[1]).expect("read raw frame");
    let params = StretchParams { gradient_removal: false, autocrop: false, ..Default::default() };
    let jpeg = stretch_raw_frame(&data, a[2].parse().unwrap(), a[3].parse().unwrap(), true, &params)
        .expect("stretch");
    std::fs::write(&a[4], jpeg).expect("write jpeg");
}
