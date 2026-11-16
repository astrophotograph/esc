//! Colour balance for raw sensor frames.
//!
//! In a star view the Seestar sends its live preview as the sensor's Bayer
//! data, with no white balance applied. Green is the most sensitive channel,
//! so without a correction every star is green.

/// Gains used when a frame has too few stars to measure them. They are the
/// values measured on one Seestar S30 frame of M 31, not a calibration.
const DEFAULT_RED_GAIN: f64 = 1.3;
const DEFAULT_BLUE_GAIN: f64 = 2.2;

/// A measured gain outside this range is taken to be a bad measurement.
const GAIN_RANGE: (f64, f64) = (0.5, 4.0);

/// How far above the background, in units of noise, a pixel must be to count
/// as a star.
const STAR_SIGMA: f64 = 10.0;

/// Fewer star pixels than this and the measurement is not trusted.
const MIN_STAR_PIXELS: usize = 50;

/// Balance `[red, green, blue]` in place: put the three backgrounds at the
/// same level, then scale red and blue so the stars in the frame are white on
/// average.
///
/// The backgrounds are aligned by subtraction, not by scaling: scaling would
/// change the colour of everything above the background too.
pub fn balance_raw_channels(channels: &mut [Vec<f64>]) {
    if channels.len() != 3 {
        return;
    }

    let stats: Vec<(f64, f64)> = channels.iter().map(|ch| background(ch)).collect();
    let (red_gain, blue_gain) = star_gains(channels, &stats);
    let gains = [red_gain, 1.0, blue_gain];
    let pedestal = stats[1].0;

    for (i, ch) in channels.iter_mut().enumerate() {
        let level = stats[i].0;
        for v in ch.iter_mut() {
            *v = (pedestal + (*v - level) * gains[i]).max(0.0);
        }
    }
}

/// Red and blue gains that make the summed star light equal in all channels.
fn star_gains(channels: &[Vec<f64>], stats: &[(f64, f64)]) -> (f64, f64) {
    let noise = (stats[0].1.powi(2) + stats[1].1.powi(2) + stats[2].1.powi(2)).sqrt() / 3.0;
    let threshold = STAR_SIGMA * noise;

    let mut sums = [0.0f64; 3];
    let mut count = 0usize;
    for ((r, g), b) in channels[0].iter().zip(&channels[1]).zip(&channels[2]) {
        let r = r - stats[0].0;
        let g = g - stats[1].0;
        let b = b - stats[2].0;
        if (r + g + b) / 3.0 > threshold {
            sums[0] += r;
            sums[1] += g;
            sums[2] += b;
            count += 1;
        }
    }

    if count < MIN_STAR_PIXELS || sums.iter().any(|s| *s <= 0.0) {
        return (DEFAULT_RED_GAIN, DEFAULT_BLUE_GAIN);
    }
    let red = sums[1] / sums[0];
    let blue = sums[1] / sums[2];
    let plausible = |g: f64| g >= GAIN_RANGE.0 && g <= GAIN_RANGE.1;
    if plausible(red) && plausible(blue) {
        (red, blue)
    } else {
        (DEFAULT_RED_GAIN, DEFAULT_BLUE_GAIN)
    }
}

/// Background level and noise of a channel: its median and scaled MAD.
fn background(data: &[f64]) -> (f64, f64) {
    if data.is_empty() {
        return (0.0, 0.0);
    }
    let mut sorted = data.to_vec();
    let mid = sorted.len() / 2;
    let by = |a: &f64, b: &f64| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal);
    sorted.select_nth_unstable_by(mid, by);
    let median = sorted[mid];
    for v in sorted.iter_mut() {
        *v = (*v - median).abs();
    }
    sorted.select_nth_unstable_by(mid, by);
    (median, sorted[mid] * 1.4826)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A field of `n` pixels at `level` with a small ripple, plus one star of
    /// height `star` every 20 pixels.
    fn field(n: usize, level: f64, star: f64) -> Vec<f64> {
        (0..n)
            .map(|i| {
                let ripple = ((i % 7) as f64 - 3.0) * 0.0002;
                level + ripple + if i % 20 == 0 { star } else { 0.0 }
            })
            .collect()
    }

    fn star_light(ch: &[f64], level: f64) -> f64 {
        ch.iter().step_by(20).map(|v| v - level).sum()
    }

    #[test]
    fn stars_come_out_white() {
        // Green twice as strong as red, four times as strong as blue.
        let mut channels = vec![
            field(4000, 0.015, 0.10),
            field(4000, 0.015, 0.20),
            field(4000, 0.015, 0.05),
        ];
        balance_raw_channels(&mut channels);
        let g = star_light(&channels[1], 0.015);
        for ch in [&channels[0], &channels[2]] {
            let ratio = star_light(ch, 0.015) / g;
            assert!((ratio - 1.0).abs() < 0.02, "star light ratio {ratio}");
        }
    }

    #[test]
    fn unequal_backgrounds_end_up_level() {
        let mut channels = vec![
            field(4000, 0.010, 0.10),
            field(4000, 0.015, 0.10),
            field(4000, 0.020, 0.10),
        ];
        balance_raw_channels(&mut channels);
        let levels: Vec<f64> = channels.iter().map(|ch| background(ch).0).collect();
        for level in &levels {
            assert!((level - levels[1]).abs() < 1e-9, "levels {levels:?}");
        }
    }

    #[test]
    fn a_frame_without_stars_gets_the_default_gains() {
        let flat = field(4000, 0.015, 0.0);
        let channels = vec![flat.clone(), flat.clone(), flat];
        let stats: Vec<(f64, f64)> = channels.iter().map(|ch| background(ch)).collect();
        assert_eq!(star_gains(&channels, &stats), (DEFAULT_RED_GAIN, DEFAULT_BLUE_GAIN));
    }
}
