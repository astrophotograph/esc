//! Background gradient removal via polynomial surface fitting.
//!
//! Fits a low-order 2D polynomial to sampled background points (with
//! sigma-clipping to reject stars), evaluates at low resolution, then
//! upsamples and subtracts.

/// Remove background gradient from a single channel.
/// `data` is row-major, `width` x `height`, values in [0, 1].
/// Returns a new vec of the same size.
pub fn remove_gradient(data: &[f64], width: usize, height: usize, order: usize) -> Vec<f64> {
    let sample_grid: usize = 32;
    let sigma_clip = 2.5;

    // Sample background on a grid using patch medians
    let patch_h = std::cmp::max(1, height / (sample_grid * 2));
    let patch_w = std::cmp::max(1, width / (sample_grid * 2));

    let mut sample_y = Vec::new();
    let mut sample_x = Vec::new();
    let mut sample_v = Vec::new();

    for gy in 0..sample_grid {
        let y = gy * (height - 1) / (sample_grid - 1);
        for gx in 0..sample_grid {
            let x = gx * (width - 1) / (sample_grid - 1);

            let y0 = y.saturating_sub(patch_h);
            let y1 = std::cmp::min(height, y + patch_h + 1);
            let x0 = x.saturating_sub(patch_w);
            let x1 = std::cmp::min(width, x + patch_w + 1);

            let mut patch: Vec<f64> = Vec::new();
            for py in y0..y1 {
                for px in x0..x1 {
                    patch.push(data[py * width + px]);
                }
            }
            patch.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

            sample_y.push(y as f64);
            sample_x.push(x as f64);
            sample_v.push(patch[patch.len() / 2]);
        }
    }

    // Sigma-clip to reject stars
    for _ in 0..3 {
        let med = vec_median(&sample_v);
        let deviations: Vec<f64> = sample_v.iter().map(|v| (v - med).abs()).collect();
        let mad = vec_median(&deviations);
        let std_est = mad * 1.4826;
        if std_est < 1e-10 {
            break;
        }
        let limit = sigma_clip * std_est;
        let mask: Vec<bool> = sample_v.iter().map(|v| (v - med).abs() < limit).collect();
        let count = mask.iter().filter(|&&m| m).count();
        if count < 6 {
            break;
        }
        sample_y = mask.iter().zip(&sample_y).filter(|(&m, _)| m).map(|(_, &v)| v).collect();
        sample_x = mask.iter().zip(&sample_x).filter(|(&m, _)| m).map(|(_, &v)| v).collect();
        sample_v = mask.iter().zip(&sample_v).filter(|(&m, _)| m).map(|(_, &v)| v).collect();
    }

    // Normalize coordinates to [-1, 1]
    let h_max = std::cmp::max(1, height - 1) as f64;
    let w_max = std::cmp::max(1, width - 1) as f64;
    let yn: Vec<f64> = sample_y.iter().map(|&y| y / h_max * 2.0 - 1.0).collect();
    let xn: Vec<f64> = sample_x.iter().map(|&x| x / w_max * 2.0 - 1.0).collect();

    // Build design matrix and solve least squares
    let terms = poly_terms_2d(&xn, &yn, order);
    let n_terms = terms.len();
    let n_samples = sample_v.len();

    let coeffs = match lstsq(&terms, &sample_v, n_samples, n_terms) {
        Some(c) => c,
        None => return data.to_vec(),
    };

    // Evaluate model at reduced resolution, then upsample
    let eval_size = std::cmp::min(256, std::cmp::min(width, height));
    let mut small_model = vec![0.0f64; eval_size * eval_size];

    for ey in 0..eval_size {
        let yn_val = ey as f64 / (eval_size - 1) as f64 * 2.0 - 1.0;
        for ex in 0..eval_size {
            let xn_val = ex as f64 / (eval_size - 1) as f64 * 2.0 - 1.0;
            let mut val = 0.0;
            let mut ci = 0;
            for total in 0..=order {
                for xpow in (0..=total).rev() {
                    let ypow = total - xpow;
                    val += coeffs[ci] * xn_val.powi(xpow as i32) * yn_val.powi(ypow as i32);
                    ci += 1;
                }
            }
            small_model[ey * eval_size + ex] = val;
        }
    }

    // Bilinear upsample to full resolution and subtract (parallel by row)
    use rayon::prelude::*;

    let es_f = (eval_size - 1) as f64;
    let mut result: Vec<f64> = (0..height)
        .into_par_iter()
        .flat_map(|y| {
            let sy = y as f64 / h_max * es_f;
            let sy0 = sy.floor() as usize;
            let sy1 = std::cmp::min(sy0 + 1, eval_size - 1);
            let fy = sy - sy0 as f64;
            let fy_inv = 1.0 - fy;

            (0..width)
                .map(|x| {
                    let sx = x as f64 / w_max * es_f;
                    let sx0 = sx.floor() as usize;
                    let sx1 = std::cmp::min(sx0 + 1, eval_size - 1);
                    let fx = sx - sx0 as f64;

                    let model_val = small_model[sy0 * eval_size + sx0] * (1.0 - fx) * fy_inv
                        + small_model[sy0 * eval_size + sx1] * fx * fy_inv
                        + small_model[sy1 * eval_size + sx0] * (1.0 - fx) * fy
                        + small_model[sy1 * eval_size + sx1] * fx * fy;

                    data[y * width + x] - model_val
                })
                .collect::<Vec<f64>>()
        })
        .collect();

    // Shift so 1st percentile is near zero
    let mut valid: Vec<f64> = result.iter().copied().filter(|x| x.is_finite()).collect();
    let bg_level = if valid.is_empty() {
        0.0
    } else {
        let idx = valid.len() / 100;
        valid.select_nth_unstable_by(idx, |a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        valid[idx]
    };

    result.iter_mut().for_each(|v| {
        *v = (*v - bg_level).clamp(0.0, 1.0);
    });

    result
}

fn vec_median(data: &[f64]) -> f64 {
    let mut buf = data.to_vec();
    if buf.is_empty() {
        return 0.0;
    }
    let mid = buf.len() / 2;
    buf.select_nth_unstable_by(mid, |a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    buf[mid]
}

/// Generate polynomial term values for 2D fitting.
/// Returns a matrix of shape [n_terms][n_samples].
fn poly_terms_2d(x: &[f64], y: &[f64], order: usize) -> Vec<Vec<f64>> {
    let n = x.len();
    let mut columns = Vec::new();
    for total in 0..=order {
        for xpow in (0..=total).rev() {
            let ypow = total - xpow;
            let col: Vec<f64> = (0..n)
                .map(|i| x[i].powi(xpow as i32) * y[i].powi(ypow as i32))
                .collect();
            columns.push(col);
        }
    }
    columns
}

/// Simple least-squares solver using normal equations: (A^T A) x = A^T b
fn lstsq(columns: &[Vec<f64>], b: &[f64], n_rows: usize, n_cols: usize) -> Option<Vec<f64>> {
    let mut ata = vec![0.0; n_cols * n_cols];
    let mut atb = vec![0.0; n_cols];

    for i in 0..n_cols {
        for j in 0..n_cols {
            let mut sum = 0.0;
            for k in 0..n_rows {
                sum += columns[i][k] * columns[j][k];
            }
            ata[i * n_cols + j] = sum;
        }
        let mut sum = 0.0;
        for k in 0..n_rows {
            sum += columns[i][k] * b[k];
        }
        atb[i] = sum;
    }

    solve_symmetric(&mut ata, &mut atb, n_cols)
}

fn solve_symmetric(a: &mut [f64], b: &mut [f64], n: usize) -> Option<Vec<f64>> {
    for col in 0..n {
        let mut max_val = a[col * n + col].abs();
        let mut max_row = col;
        for row in (col + 1)..n {
            let val = a[row * n + col].abs();
            if val > max_val {
                max_val = val;
                max_row = row;
            }
        }
        if max_val < 1e-12 {
            return None;
        }
        if max_row != col {
            for k in 0..n {
                a.swap(col * n + k, max_row * n + k);
            }
            b.swap(col, max_row);
        }
        let pivot = a[col * n + col];
        for row in (col + 1)..n {
            let factor = a[row * n + col] / pivot;
            for k in col..n {
                a[row * n + k] -= factor * a[col * n + k];
            }
            b[row] -= factor * b[col];
        }
    }
    let mut x = vec![0.0; n];
    for col in (0..n).rev() {
        let mut sum = b[col];
        for k in (col + 1)..n {
            sum -= a[col * n + k] * x[k];
        }
        x[col] = sum / a[col * n + col];
    }
    Some(x)
}
