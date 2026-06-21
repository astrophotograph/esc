//! MTF (Midtones Transfer Function) stretch algorithm.
//!
//! Adapted from Astra. Handles linked RGB stretching
//! with per-channel background neutralization.

use rayon::prelude::*;

/// Apply MTF stretch to normalized [0,1] channel data.
/// For RGB, pass each channel separately or use `stretch_mtf_rgb`.
pub fn stretch_mtf_rgb(
    channels: &mut [Vec<f64>],
    bg_percent: f64,
    sigma: f64,
) {
    if channels.len() == 1 {
        stretch_mtf_mono(&mut channels[0], bg_percent, sigma);
        return;
    }

    // Linked RGB mode: neutralize backgrounds then apply same stretch

    // Step 1: Per-channel statistics (parallel)
    let stats: Vec<(f64, f64)> = channels
        .par_iter()
        .map(|ch| channel_stats(ch))
        .collect();

    // Step 2: Shadow clipping
    let shadows: Vec<f64> = stats
        .iter()
        .map(|(med, mad)| (med - sigma * mad * 1.4826).max(0.0))
        .collect();

    // Equalize channel medians after shadow subtraction
    let post_medians: Vec<f64> = stats
        .iter()
        .zip(&shadows)
        .map(|((med, _), shd)| (med - shd).max(1e-10))
        .collect();
    let ref_post_median = post_medians
        .iter()
        .copied()
        .fold(f64::INFINITY, f64::min);

    // Step 3: Apply shadow subtraction + equalization (parallel)
    channels
        .par_iter_mut()
        .enumerate()
        .for_each(|(i, ch)| {
            let eq_scale = ref_post_median / post_medians[i];
            for v in ch.iter_mut() {
                *v = ((*v - shadows[i]) * eq_scale).clamp(0.0, 1.0);
            }
        });

    // Step 4: Compute shared midtone from reference channel (green or first)
    let ref_idx = std::cmp::min(1, channels.len() - 1);
    let ref_median = median_positive(&channels[ref_idx]);

    let midtone = if ref_median > 0.0 && ref_median < 1.0 && bg_percent > 0.0 {
        let m = ref_median * (bg_percent - 1.0)
            / (2.0 * bg_percent * ref_median - bg_percent - ref_median);
        m.clamp(0.01, 0.99)
    } else {
        0.5
    };

    // Step 5: Apply MTF to all channels (parallel)
    channels.par_iter_mut().for_each(|ch| {
        apply_mtf(ch, midtone);
    });
}

fn stretch_mtf_mono(data: &mut [f64], bg_percent: f64, sigma: f64) {
    let (med, mad) = channel_stats(data);
    let shadow_clip = (med - sigma * mad * 1.4826).max(0.0);
    let highlight_clip = 1.0;
    let range = highlight_clip - shadow_clip;

    if range <= 0.0 {
        return;
    }

    for v in data.iter_mut() {
        *v = ((*v - shadow_clip) / range).clamp(0.0, 1.0);
    }

    let median_norm = (med - shadow_clip) / range;
    let midtone = if median_norm > 0.0 && median_norm < 1.0 && bg_percent > 0.0 {
        let m = median_norm * (bg_percent - 1.0)
            / (2.0 * bg_percent * median_norm - bg_percent - median_norm);
        m.clamp(0.01, 0.99)
    } else {
        0.5
    };

    apply_mtf(data, midtone);
}

/// MTF(m, x) = (m - 1) * x / ((2m - 1) * x - m)
#[inline]
fn apply_mtf(data: &mut [f64], m: f64) {
    let m_minus_1 = m - 1.0;
    let two_m_minus_1 = 2.0 * m - 1.0;

    for v in data.iter_mut() {
        let x = *v;
        let denom = two_m_minus_1 * x - m;
        *v = if denom.abs() < 1e-10 {
            x
        } else {
            (m_minus_1 * x / denom).clamp(0.0, 1.0)
        };
    }
}

fn channel_stats(data: &[f64]) -> (f64, f64) {
    let count = data.iter().filter(|&&v| v > 0.0).count();
    if count == 0 {
        return (0.0, 0.01);
    }
    let mut valid: Vec<f64> = Vec::with_capacity(count);
    valid.extend(data.iter().copied().filter(|&v| v > 0.0));
    let med = fast_median(&mut valid);
    for v in valid.iter_mut() {
        *v = (*v - med).abs();
    }
    let mad = fast_median(&mut valid).max(1e-6);
    (med, mad)
}

fn median_positive(data: &[f64]) -> f64 {
    let count = data.iter().filter(|&&v| v > 0.0).count();
    if count == 0 {
        return 0.0;
    }
    let mut valid: Vec<f64> = Vec::with_capacity(count);
    valid.extend(data.iter().copied().filter(|&v| v > 0.0));
    fast_median(&mut valid)
}

/// O(n) median using select_nth_unstable (quickselect algorithm).
fn fast_median(data: &mut [f64]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let mid = data.len() / 2;
    data.select_nth_unstable_by(mid, |a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    data[mid]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn mtf_is_identity_at_midtone_half() {
        // MTF(0.5, x) = x for all x.
        let orig = vec![0.0, 0.1, 0.25, 0.5, 0.75, 1.0];
        let mut data = orig.clone();
        apply_mtf(&mut data, 0.5);
        for (got, want) in data.iter().zip(&orig) {
            assert!(approx(*got, *want), "expected identity, got {got} for {want}");
        }
    }

    #[test]
    fn mtf_fixes_endpoints() {
        // MTF maps 0->0 and 1->1 for any midtone.
        for &m in &[0.1, 0.3, 0.5, 0.7, 0.9] {
            let mut data = vec![0.0, 1.0];
            apply_mtf(&mut data, m);
            assert!(approx(data[0], 0.0), "m={m}: 0 -> {}", data[0]);
            assert!(approx(data[1], 1.0), "m={m}: 1 -> {}", data[1]);
        }
    }

    #[test]
    fn mtf_low_midtone_brightens_and_stays_monotonic() {
        let orig: Vec<f64> = (0..=10).map(|i| i as f64 / 10.0).collect();
        let mut data = orig.clone();
        apply_mtf(&mut data, 0.25); // low midtone lifts shadows

        for w in data.windows(2) {
            assert!(w[1] >= w[0] - 1e-12, "not monotonic: {:?}", w);
        }
        // Interior values brighten (output >= input).
        for (got, orig) in data.iter().zip(&orig).take(10).skip(1) {
            assert!(*got >= *orig - 1e-12, "expected brighten: {got} < {orig}");
        }
    }

    #[test]
    fn mtf_output_stays_in_unit_range() {
        let mut data: Vec<f64> = (0..=100).map(|i| i as f64 / 100.0).collect();
        apply_mtf(&mut data, 0.2);
        for v in &data {
            assert!(*v >= 0.0 && *v <= 1.0, "out of range: {v}");
        }
    }

    #[test]
    fn fast_median_picks_middle() {
        let mut odd = vec![3.0, 1.0, 2.0];
        assert_eq!(fast_median(&mut odd), 2.0);
        // Even length returns the upper-middle order statistic (index len/2).
        let mut even = vec![4.0, 1.0, 3.0, 2.0];
        assert_eq!(fast_median(&mut even), 3.0);
        assert_eq!(fast_median(&mut []), 0.0);
    }

    #[test]
    fn channel_stats_ignores_zero_background() {
        // Zeros are excluded; median/MAD computed over positive samples only.
        let (med, mad) = channel_stats(&[0.0, 0.0, 0.2, 0.4, 0.6]);
        assert!(approx(med, 0.4), "median {med}");
        assert!(approx(mad, 0.2), "mad {mad}");

        // All-zero input falls back to a safe default (non-zero MAD).
        let (med0, mad0) = channel_stats(&[0.0, 0.0]);
        assert_eq!(med0, 0.0);
        assert!(mad0 > 0.0);
    }

    #[test]
    fn median_positive_ignores_zeros() {
        assert!(approx(median_positive(&[0.0, 0.0, 0.5]), 0.5));
        assert_eq!(median_positive(&[0.0, 0.0]), 0.0);
    }

    #[test]
    fn mono_stretch_keeps_unit_range() {
        let mut channels = vec![vec![0.05, 0.06, 0.07, 0.08, 0.5, 0.9, 0.95]];
        stretch_mtf_rgb(&mut channels, 0.25, 2.0);
        for v in &channels[0] {
            assert!(*v >= 0.0 && *v <= 1.0, "out of range: {v}");
        }
    }

    #[test]
    fn rgb_stretch_keeps_unit_range_across_channels() {
        let mut channels = vec![
            vec![0.02, 0.10, 0.30, 0.80],
            vec![0.03, 0.12, 0.34, 0.82],
            vec![0.01, 0.08, 0.28, 0.78],
        ];
        stretch_mtf_rgb(&mut channels, 0.25, 2.0);
        for ch in &channels {
            for v in ch {
                assert!(*v >= 0.0 && *v <= 1.0, "out of range: {v}");
            }
        }
    }
}
