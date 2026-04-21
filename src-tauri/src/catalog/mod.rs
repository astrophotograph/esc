use chrono::Utc;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// Deserialize a field that may be either a bare string or a JSON array of strings.
/// Returns the first string element, or None if the value is null/missing/empty.
fn deserialize_string_or_vec<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrVec {
        Str(String),
        Vec(Vec<String>),
    }

    Ok(match Option::<StringOrVec>::deserialize(deserializer)? {
        None => None,
        Some(StringOrVec::Str(s)) => Some(s),
        Some(StringOrVec::Vec(v)) => v.into_iter().find(|s| !s.is_empty()),
    })
}

// ---------------------------------------------------------------------------
// JSON deserialization structs (matching astronomical_objects_full.json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CatalogData {
    pub(crate) objects: Vec<CatalogObject>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CatalogObject {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) catalog_ids: CatalogIds,
    #[serde(default)]
    pub(crate) names: ObjectNames,
    #[serde(default, deserialize_with = "deserialize_string_or_vec")]
    pub(crate) object_type: Option<String>,
    #[serde(default)]
    pub(crate) coordinates: Coordinates,
    #[serde(default)]
    pub(crate) magnitudes: Magnitudes,
    #[serde(default)]
    pub(crate) physical_properties: PhysicalProperties,
    #[serde(default)]
    pub(crate) description: Option<String>,
    // Internal: moon phase (not in JSON, added at runtime)
    #[serde(skip)]
    pub(crate) _moon_phase: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[allow(dead_code)]
pub(crate) struct CatalogIds {
    pub(crate) messier: Option<String>,
    pub(crate) ngc: Option<String>,
    pub(crate) ic: Option<String>,
    #[serde(default)]
    sharpless: Option<String>,
    #[serde(default, deserialize_with = "deserialize_string_or_vec")]
    barnard: Option<String>,
    #[serde(default)]
    ldn: Option<String>,
    #[serde(default)]
    lbn: Option<String>,
    #[serde(default)]
    hr: Option<String>,
    #[serde(default)]
    hd: Option<String>,
    #[serde(default)]
    hip: Option<String>,
    #[serde(default)]
    gl: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct ObjectNames {
    pub(crate) proper: Option<String>,
    pub(crate) bayer_flamsteed: Option<String>,
    #[serde(default)]
    common: Vec<String>,
    #[serde(default)]
    other: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct Coordinates {
    #[serde(default)]
    pub(crate) ra_j2000: Option<CoordValue>,
    #[serde(default)]
    pub(crate) dec_j2000: Option<CoordValue>,
    #[serde(default, deserialize_with = "deserialize_string_or_vec")]
    pub(crate) constellation: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct CoordValue {
    pub(crate) decimal: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct Magnitudes {
    pub(crate) v: Option<f64>,
    b: Option<f64>,
    u: Option<f64>,
    r: Option<f64>,
    i: Option<f64>,
    j: Option<f64>,
    h: Option<f64>,
    k: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct PhysicalProperties {
    #[serde(default)]
    pub(crate) size: Option<ObjectSize>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct ObjectSize {
    major_axis_arcmin: Option<f64>,
}

// ---------------------------------------------------------------------------
// Output structs
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct CelestialObject {
    id: String,
    name: String,
    object_type: String,
    ra_decimal: f64,
    dec_decimal: f64,
    magnitude: Option<f64>,
    constellation: String,
    altitude: Option<f64>,
    azimuth: Option<f64>,
    above_horizon: bool,
    description: Option<String>,
    size_arcmin: Option<f64>,
    moon_phase: Option<f64>,
}

#[derive(Debug, Serialize)]
struct CatalogSearchResponse {
    objects: Vec<CelestialObject>,
    total_count: usize,
    filtered_count: usize,
    observer_location: Option<ObserverLocation>,
}

#[derive(Debug, Serialize)]
struct ObserverLocation {
    latitude: f64,
    longitude: f64,
    elevation: f64,
}

// ---------------------------------------------------------------------------
// Tauri command params
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct CatalogSearchParams {
    pub query: Option<String>,
    pub object_type: Option<String>,
    pub min_magnitude: Option<f64>,
    pub max_magnitude: Option<f64>,
    pub above_horizon_only: Option<bool>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub elevation: Option<f64>,
    pub limit: Option<i32>,
}

// ---------------------------------------------------------------------------
// Catalog cache
// ---------------------------------------------------------------------------

static CATALOG_CACHE: OnceLock<CatalogData> = OnceLock::new();

fn catalog_data_path() -> std::path::PathBuf {
    // In dev, use CARGO_MANIFEST_DIR; in release, look relative to the executable
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        std::path::PathBuf::from(manifest_dir)
            .join("data")
            .join("catalogs")
            .join("astronomical_objects_full.json")
    } else {
        // Fallback: look relative to the executable
        let exe = std::env::current_exe().unwrap_or_default();
        let exe_dir = exe.parent().unwrap_or(std::path::Path::new("."));
        // Try a few common locations
        let candidates = [
            exe_dir.join("data/catalogs/astronomical_objects_full.json"),
            exe_dir.join("../data/catalogs/astronomical_objects_full.json"),
            exe_dir.join("../Resources/data/catalogs/astronomical_objects_full.json"),
            std::path::PathBuf::from("data/catalogs/astronomical_objects_full.json"),
            std::path::PathBuf::from("src-tauri/data/catalogs/astronomical_objects_full.json"),
        ];
        candidates
            .into_iter()
            .find(|p| p.exists())
            .unwrap_or_else(|| exe_dir.join("data/catalogs/astronomical_objects_full.json"))
    }
}

pub(crate) fn load_catalog() -> Result<&'static CatalogData, String> {
    if let Some(cached) = CATALOG_CACHE.get() {
        return Ok(cached);
    }

    let path = catalog_data_path();
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read catalog file {:?}: {}", path, e))?;
    let catalog: CatalogData =
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse catalog: {}", e))?;
    tracing::info!("Catalog loaded: {} objects", catalog.objects.len());

    // If another thread raced us, that's fine — just return whichever won.
    let _ = CATALOG_CACHE.set(catalog);
    Ok(CATALOG_CACHE.get().unwrap())
}

// ---------------------------------------------------------------------------
// Astronomy helpers
// ---------------------------------------------------------------------------

pub(crate) fn local_sidereal_time(longitude: f64, utc: chrono::DateTime<Utc>) -> f64 {
    let j2000 = Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap();
    let jd = (utc - j2000).num_seconds() as f64 / 86400.0 + 2451545.0;
    let gst = (18.697374558 + 24.06570982441908 * (jd - 2451545.0)) % 24.0;
    (gst + longitude / 15.0).rem_euclid(24.0)
}

use chrono::TimeZone;

pub(crate) fn altitude_azimuth(ra_hours: f64, dec_deg: f64, lat: f64, lst_hours: f64) -> (f64, f64) {
    let dec_rad = dec_deg.to_radians();
    let lat_rad = lat.to_radians();
    let ha_rad = ((lst_hours - ra_hours) * 15.0).to_radians();
    let sin_alt = dec_rad.sin() * lat_rad.sin() + dec_rad.cos() * lat_rad.cos() * ha_rad.cos();
    let altitude = sin_alt.asin().to_degrees();
    let cos_alt = altitude.to_radians().cos();
    let azimuth = if cos_alt.abs() < 1e-10 {
        0.0
    } else {
        let cos_az =
            ((dec_rad.sin() - lat_rad.sin() * sin_alt) / (lat_rad.cos() * cos_alt)).clamp(-1.0, 1.0);
        let az = cos_az.acos().to_degrees();
        if ha_rad.sin() > 0.0 {
            360.0 - az
        } else {
            az
        }
    };
    (altitude, azimuth)
}

// ---------------------------------------------------------------------------
// Sun, Moon, Planet positions
// ---------------------------------------------------------------------------

fn calculate_sun_position(now: chrono::DateTime<Utc>) -> CatalogObject {
    let j2000 = Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap();
    let jd = (now - j2000).num_seconds() as f64 / 86400.0 + 2451545.0;
    let t = (jd - 2451545.0) / 36525.0;

    let l0 = (280.46646 + 36000.76983 * t + 0.0003032 * t * t).rem_euclid(360.0);
    let m = (357.52911 + 35999.05029 * t - 0.0001537 * t * t).rem_euclid(360.0);
    let m_rad = m.to_radians();

    let c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * m_rad.sin()
        + (0.019993 - 0.000101 * t) * (2.0 * m_rad).sin()
        + 0.000289 * (3.0 * m_rad).sin();

    let l = l0 + c;
    let epsilon = 23.439291 - 0.0130042 * t;
    let epsilon_rad = epsilon.to_radians();
    let lambda_rad = l.to_radians();

    let mut ra = (epsilon_rad.cos() * lambda_rad.sin()).atan2(lambda_rad.cos()).to_degrees();
    if ra < 0.0 {
        ra += 360.0;
    }
    let dec = (epsilon_rad.sin() * lambda_rad.sin()).asin().to_degrees();

    CatalogObject {
        id: "sun".to_string(),
        catalog_ids: CatalogIds::default(),
        names: ObjectNames {
            proper: Some("Sun".to_string()),
            common: vec!["Sol".to_string()],
            ..Default::default()
        },
        object_type: Some("Star".to_string()),
        coordinates: Coordinates {
            ra_j2000: Some(CoordValue { decimal: Some(ra) }),
            dec_j2000: Some(CoordValue { decimal: Some(dec) }),
            constellation: Some("Various".to_string()),
        },
        magnitudes: Magnitudes {
            v: Some(-26.7),
            ..Default::default()
        },
        physical_properties: PhysicalProperties::default(),
        description: Some(
            "Our star - WARNING: Never observe directly without proper solar filters".to_string(),
        ),
        _moon_phase: None,
    }
}

fn calculate_moon_position(now: chrono::DateTime<Utc>) -> CatalogObject {
    let j2000 = Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap();
    let jd = (now - j2000).num_seconds() as f64 / 86400.0 + 2451545.0;
    let t = (jd - 2451545.0) / 36525.0;

    let l = (218.3164591 + 481267.88134236 * t).rem_euclid(360.0);
    let m = (134.9634114 + 477198.8676313 * t).rem_euclid(360.0);
    let d = (297.8502042 + 445267.1115168 * t).rem_euclid(360.0);

    let m_rad = m.to_radians();
    let d_rad = d.to_radians();

    let longitude_correction = 6.289 * m_rad.sin()
        + 1.274 * (2.0 * d_rad - m_rad).sin()
        + 0.658 * (2.0 * d_rad).sin()
        + 0.214 * (2.0 * m_rad).sin();

    let true_longitude = (l + longitude_correction).rem_euclid(360.0);

    let epsilon = 23.439291 - 0.0130042 * t;
    let epsilon_rad = epsilon.to_radians();
    let lambda_rad = true_longitude.to_radians();

    let mut ra = (lambda_rad.sin() * epsilon_rad.cos())
        .atan2(lambda_rad.cos())
        .to_degrees();
    if ra < 0.0 {
        ra += 360.0;
    }
    let dec = (epsilon_rad.sin() * lambda_rad.sin()).asin().to_degrees();

    // Phase calculation
    let sun = calculate_sun_position(now);
    let sun_ra = sun
        .coordinates
        .ra_j2000
        .as_ref()
        .and_then(|c| c.decimal)
        .unwrap_or(0.0);
    let elongation = (true_longitude - sun_ra).rem_euclid(360.0);
    let phase = (1.0 - elongation.to_radians().cos()) / 2.0;

    let magnitude = -12.6 + 2.5 * (phase + 0.1).log10();

    CatalogObject {
        id: "moon".to_string(),
        catalog_ids: CatalogIds::default(),
        names: ObjectNames {
            proper: Some("Moon".to_string()),
            common: vec!["Luna".to_string()],
            ..Default::default()
        },
        object_type: Some("Moon".to_string()),
        coordinates: Coordinates {
            ra_j2000: Some(CoordValue { decimal: Some(ra) }),
            dec_j2000: Some(CoordValue { decimal: Some(dec) }),
            constellation: Some("Various".to_string()),
        },
        magnitudes: Magnitudes {
            v: Some(magnitude),
            ..Default::default()
        },
        physical_properties: PhysicalProperties::default(),
        description: Some(format!(
            "Earth's natural satellite - {}% illuminated",
            (phase * 100.0) as i32
        )),
        _moon_phase: Some(phase),
    }
}

fn get_planet_positions(now: chrono::DateTime<Utc>) -> Vec<CatalogObject> {
    struct PlanetInfo {
        name: &'static str,
        period: f64,
        mag: f64,
        desc: &'static str,
    }

    let planets = [
        PlanetInfo {
            name: "Mercury",
            period: 87.97,
            mag: -0.4,
            desc: "Innermost planet, best seen at twilight",
        },
        PlanetInfo {
            name: "Venus",
            period: 224.70,
            mag: -4.6,
            desc: "Brightest planet, Evening/Morning Star",
        },
        PlanetInfo {
            name: "Mars",
            period: 686.98,
            mag: -1.0,
            desc: "The Red Planet",
        },
        PlanetInfo {
            name: "Jupiter",
            period: 4332.59,
            mag: -2.5,
            desc: "Largest planet with visible moons",
        },
        PlanetInfo {
            name: "Saturn",
            period: 10759.22,
            mag: 0.7,
            desc: "Ringed planet",
        },
    ];

    let j2000 = Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap();
    let jd = (now - j2000).num_seconds() as f64 / 86400.0 + 2451545.0;

    planets
        .iter()
        .map(|p| {
            let mean_motion = 360.0 / p.period;
            let longitude = (mean_motion * (jd - 2451545.0)).rem_euclid(360.0);
            let ra = longitude;
            let dec = 0.0;

            CatalogObject {
                id: p.name.to_lowercase(),
                catalog_ids: CatalogIds::default(),
                names: ObjectNames {
                    proper: Some(p.name.to_string()),
                    common: vec![],
                    ..Default::default()
                },
                object_type: Some("Planet".to_string()),
                coordinates: Coordinates {
                    ra_j2000: Some(CoordValue { decimal: Some(ra) }),
                    dec_j2000: Some(CoordValue { decimal: Some(dec) }),
                    constellation: Some("Various".to_string()),
                },
                magnitudes: Magnitudes {
                    v: Some(p.mag),
                    ..Default::default()
                },
                physical_properties: PhysicalProperties::default(),
                description: Some(p.desc.to_string()),
                _moon_phase: None,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Object helpers
// ---------------------------------------------------------------------------

pub(crate) fn get_object_magnitude(mags: &Magnitudes) -> Option<f64> {
    mags.v
        .or(mags.b)
        .or(mags.r)
        .or(mags.i)
        .or(mags.j)
        .or(mags.h)
        .or(mags.k)
        .or(mags.u)
}

fn get_object_size(props: &PhysicalProperties) -> Option<f64> {
    props.size.as_ref().and_then(|s| s.major_axis_arcmin)
}

pub(crate) fn get_object_name(obj: &CatalogObject) -> String {
    let ids = &obj.catalog_ids;
    let names = &obj.names;

    if let Some(ref messier) = ids.messier {
        if let Some(stripped) = messier.strip_prefix('M') {
            let number = stripped.trim_start_matches('0');
            let number = if number.is_empty() { "0" } else { number };
            return format!("M {}", number);
        } else {
            return format!("M {}", messier);
        }
    }
    if let Some(ref ngc) = ids.ngc {
        return format!("NGC {}", ngc);
    }
    if let Some(ref ic) = ids.ic {
        return format!("IC {}", ic);
    }
    if let Some(ref s) = ids.sharpless {
        return s.clone();
    }
    if let Some(ref b) = ids.barnard {
        return b.clone();
    }
    if let Some(ref l) = ids.ldn {
        return l.clone();
    }
    if let Some(ref l) = ids.lbn {
        return l.clone();
    }
    if obj.id.starts_with("NGC") {
        return format!("NGC {}", &obj.id[3..]);
    }
    if obj.id.starts_with("IC") {
        return format!("IC {}", &obj.id[2..]);
    }
    if let Some(ref p) = names.proper {
        return p.clone();
    }
    if let Some(ref bf) = names.bayer_flamsteed {
        return bf.clone();
    }
    if let Some(first) = names.common.first() {
        return first.clone();
    }
    if !obj.id.is_empty() {
        obj.id.clone()
    } else {
        "Unknown".to_string()
    }
}

fn get_all_object_names(obj: &CatalogObject) -> Vec<String> {
    let ids = &obj.catalog_ids;
    let names = &obj.names;
    let mut all: Vec<String> = Vec::new();

    // Messier
    if let Some(ref messier) = ids.messier {
        let number = if let Some(stripped) = messier.strip_prefix('M') {
            let n = stripped.trim_start_matches('0');
            if n.is_empty() { "0" } else { n }
        } else {
            let n = messier.trim_start_matches('0');
            if n.is_empty() { "0" } else { n }
        };
        all.push(format!("M{}", number));
        all.push(format!("M {}", number));
        all.push(format!("Messier {}", number));
        all.push(format!("Messier{}", number));
    }

    // NGC/IC
    if let Some(ref ngc) = ids.ngc {
        all.push(format!("NGC{}", ngc));
        all.push(format!("NGC {}", ngc));
    }
    if let Some(ref ic) = ids.ic {
        all.push(format!("IC{}", ic));
        all.push(format!("IC {}", ic));
    }

    // Sharpless
    if let Some(ref s) = ids.sharpless {
        all.push(s.clone());
        all.push(s.replace('-', ""));
        if s.len() > 3 {
            all.push(format!("Sharpless {}", &s[3..]));
        }
    }

    // Barnard
    if let Some(ref b) = ids.barnard {
        all.push(b.clone());
        if b.len() > 1 {
            all.push(format!("Barnard {}", &b[1..]));
            all.push(format!("B {}", &b[1..]));
        }
    }

    // Names
    if let Some(ref p) = names.proper {
        all.push(p.clone());
    }
    if let Some(ref bf) = names.bayer_flamsteed {
        all.push(bf.clone());
    }
    for c in &names.common {
        all.push(c.clone());
    }
    for o in &names.other {
        all.push(o.clone());
    }

    // Object ID
    if !obj.id.is_empty() {
        all.push(obj.id.clone());
    }

    all.retain(|s| !s.is_empty());
    all
}

fn get_common_aliases(messier_str: &str) -> Vec<&'static str> {
    match messier_str {
        "1" | "001" | "M1" | "M001" => vec!["crab nebula", "crab"],
        "31" | "031" | "M31" | "M031" => vec!["andromeda galaxy", "andromeda"],
        "42" | "042" | "M42" | "M042" => vec!["orion nebula", "orion"],
        "45" | "045" | "M45" | "M045" => vec!["pleiades", "seven sisters"],
        "57" | "057" | "M57" | "M057" => vec!["ring nebula", "ring"],
        "27" | "027" | "M27" | "M027" => vec!["dumbbell nebula", "dumbbell"],
        "51" | "051" | "M51" | "M051" => vec!["whirlpool galaxy", "whirlpool"],
        _ => vec![],
    }
}

fn matches_search_query(obj: &CatalogObject, query: &str) -> bool {
    if query.is_empty() {
        return true;
    }

    let query_lower = query.trim().to_lowercase();
    let all_names = get_all_object_names(obj);

    // Common aliases
    let messier_str = obj.catalog_ids.messier.as_deref().unwrap_or("");
    let aliases = get_common_aliases(messier_str);

    // Exact match
    for name in &all_names {
        if name.to_lowercase() == query_lower {
            return true;
        }
    }
    for alias in &aliases {
        if *alias == query_lower {
            return true;
        }
    }

    // Messier number matching
    let messier_match = if query_lower.starts_with('m') && query_lower.len() > 1 {
        let num_part = query_lower[1..].trim();
        if num_part.chars().all(|c| c.is_ascii_digit()) && !num_part.is_empty() {
            Some(num_part.to_string())
        } else {
            None
        }
    } else if query_lower.starts_with("messier") && query_lower.len() > 7 {
        let num_part = query_lower[7..].trim();
        if num_part.chars().all(|c| c.is_ascii_digit()) && !num_part.is_empty() {
            Some(num_part.to_string())
        } else {
            None
        }
    } else {
        None
    };

    if let Some(ref target_num) = messier_match {
        if let Some(ref messier_id) = obj.catalog_ids.messier {
            let digits = if let Some(stripped) = messier_id.strip_prefix('M') {
                let d = stripped.trim_start_matches('0');
                if d.is_empty() { "0" } else { d }
            } else {
                let d = messier_id.trim_start_matches('0');
                if d.is_empty() { "0" } else { d }
            };
            return digits == target_num.as_str();
        }
        return false;
    }

    // Partial match on names
    for name in &all_names {
        if name.to_lowercase().contains(&query_lower) {
            return true;
        }
    }

    // Alias partial match
    for alias in &aliases {
        if alias.contains(query_lower.as_str()) {
            return true;
        }
    }

    // Object type
    if let Some(ref obj_type) = obj.object_type {
        if obj_type.to_lowercase().contains(&query_lower) {
            return true;
        }
    }

    // Constellation
    if let Some(ref constellation) = obj.coordinates.constellation {
        if constellation.to_lowercase().contains(&query_lower) {
            return true;
        }
    }

    false
}

// ---------------------------------------------------------------------------
// Core search logic
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn do_search(
    query: Option<&str>,
    object_type: Option<&str>,
    min_magnitude: Option<f64>,
    max_magnitude: Option<f64>,
    above_horizon_only: bool,
    latitude: Option<f64>,
    longitude: Option<f64>,
    elevation: f64,
    limit: i32,
) -> Result<String, String> {
    let catalog = load_catalog()?;
    let now = Utc::now();

    // Generate dynamic objects
    let mut dynamic: Vec<CatalogObject> = Vec::with_capacity(8);
    dynamic.push(calculate_sun_position(now));
    dynamic.push(calculate_moon_position(now));
    dynamic.extend(get_planet_positions(now));

    // Observer location
    let observer_location = match (latitude, longitude) {
        (Some(lat), Some(lon)) => Some(ObserverLocation {
            latitude: lat,
            longitude: lon,
            elevation,
        }),
        _ => None,
    };

    let lst = match (latitude, longitude) {
        (Some(_), Some(lon)) => Some(local_sidereal_time(lon, now)),
        _ => None,
    };

    let total_count = dynamic.len() + catalog.objects.len();

    // Process objects
    let mut results: Vec<CelestialObject> = Vec::new();

    let iter_dynamic = dynamic.iter();
    let iter_catalog = catalog.objects.iter();

    for obj in iter_dynamic.chain(iter_catalog) {
        let ra_decimal = match obj.coordinates.ra_j2000.as_ref().and_then(|c| c.decimal) {
            Some(v) => v,
            None => continue,
        };
        let dec_decimal = match obj.coordinates.dec_j2000.as_ref().and_then(|c| c.decimal) {
            Some(v) => v,
            None => continue,
        };

        let name = get_object_name(obj);
        let obj_type_str = obj
            .object_type
            .as_deref()
            .unwrap_or("Unknown")
            .to_string();
        let constellation = obj
            .coordinates
            .constellation
            .as_deref()
            .unwrap_or("Unknown")
            .to_string();
        let magnitude = get_object_magnitude(&obj.magnitudes);
        let size_arcmin = get_object_size(&obj.physical_properties);

        // Filter: query
        if let Some(q) = query {
            if !q.is_empty() && !matches_search_query(obj, q) {
                continue;
            }
        }

        // Filter: object_type
        if let Some(ot) = object_type {
            if obj_type_str != ot {
                continue;
            }
        }

        // Filter: magnitude range
        if let Some(mag) = magnitude {
            if let Some(min_mag) = min_magnitude {
                if mag < min_mag {
                    continue;
                }
            }
            if let Some(max_mag) = max_magnitude {
                if mag > max_mag {
                    continue;
                }
            }
        }

        // Default display: only objects with magnitude <= 6.0
        if query.is_none_or(|q| q.is_empty()) {
            match magnitude {
                None => continue,
                Some(mag) if mag > 6.0 => continue,
                _ => {}
            }
        }

        // Altitude/azimuth
        let (altitude, azimuth, above_horizon) =
            if let (Some(obs), Some(lst_val)) = (&observer_location, lst) {
                let ra_hours = ra_decimal / 15.0;
                let (alt, az) = altitude_azimuth(ra_hours, dec_decimal, obs.latitude, lst_val);
                let above = alt > 0.0;

                // Filter by horizon
                if above_horizon_only
                    && !above
                    && query.is_none_or(|q| q.is_empty())
                    && obj.id != "sun"
                {
                    continue;
                }

                (Some(alt), Some(az), above)
            } else {
                (None, None, true)
            };

        let moon_phase = if obj.id == "moon" {
            obj._moon_phase
        } else {
            None
        };

        results.push(CelestialObject {
            id: obj.id.clone(),
            name,
            object_type: obj_type_str,
            ra_decimal,
            dec_decimal,
            magnitude,
            constellation,
            altitude,
            azimuth,
            above_horizon,
            description: obj.description.clone(),
            size_arcmin,
            moon_phase,
        });
    }

    // Sort by magnitude (brightest first)
    results.sort_by(|a, b| {
        let ma = a.magnitude.unwrap_or(999.0);
        let mb = b.magnitude.unwrap_or(999.0);
        ma.partial_cmp(&mb).unwrap_or(std::cmp::Ordering::Equal)
    });

    // Apply limit
    let limited: Vec<CelestialObject> = results.into_iter().take(limit as usize).collect();

    let response = CatalogSearchResponse {
        filtered_count: limited.len(),
        objects: limited,
        total_count,
        observer_location,
    };

    serde_json::to_string(&response).map_err(|e| format!("Serialization error: {}", e))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn catalog_search(params: CatalogSearchParams) -> Result<String, String> {
    let above_horizon = params.above_horizon_only.unwrap_or(true);
    let limit = params.limit.unwrap_or(100);
    let elevation = params.elevation.unwrap_or(0.0);

    do_search(
        params.query.as_deref(),
        params.object_type.as_deref(),
        params.min_magnitude,
        params.max_magnitude,
        above_horizon,
        params.latitude,
        params.longitude,
        elevation,
        limit,
    )
}

#[tauri::command]
pub async fn catalog_quick_search(query: String, limit: Option<i32>) -> Result<String, String> {
    let lim = limit.unwrap_or(20);
    do_search(
        Some(&query),
        None,
        None,
        None,
        false, // above_horizon_only = false
        None,
        None,
        0.0,
        lim,
    )
}

#[tauri::command]
pub async fn catalog_get_object_types() -> Result<String, String> {
    let catalog = load_catalog()?;
    let mut type_counts: HashMap<String, usize> = HashMap::new();

    for obj in &catalog.objects {
        let obj_type = obj
            .object_type
            .as_deref()
            .unwrap_or("Unknown")
            .to_string();
        *type_counts.entry(obj_type).or_insert(0) += 1;
    }

    serde_json::to_string(&type_counts).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
pub async fn catalog_get_solar_system(
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<String, String> {
    let now = Utc::now();

    let mut objects: Vec<CatalogObject> = Vec::with_capacity(8);
    objects.push(calculate_sun_position(now));
    objects.push(calculate_moon_position(now));
    objects.extend(get_planet_positions(now));

    // Build output with optional alt/az
    let lst = match (latitude, longitude) {
        (Some(_), Some(lon)) => Some(local_sidereal_time(lon, now)),
        _ => None,
    };

    let mut result: Vec<serde_json::Value> = Vec::new();

    for obj in &objects {
        let ra_decimal = obj
            .coordinates
            .ra_j2000
            .as_ref()
            .and_then(|c| c.decimal)
            .unwrap_or(0.0);
        let dec_decimal = obj
            .coordinates
            .dec_j2000
            .as_ref()
            .and_then(|c| c.decimal)
            .unwrap_or(0.0);

        let mut entry = serde_json::json!({
            "id": obj.id,
            "catalog_ids": {},
            "names": {
                "proper": obj.names.proper,
                "common": obj.names.common,
                "other": obj.names.other,
            },
            "object_type": obj.object_type,
            "coordinates": {
                "ra_j2000": { "decimal": ra_decimal },
                "dec_j2000": { "decimal": dec_decimal },
                "constellation": obj.coordinates.constellation,
            },
            "magnitudes": { "v": obj.magnitudes.v },
            "physical_properties": {},
            "description": obj.description,
        });

        if let (Some(lat), Some(lst_val)) = (latitude, lst) {
            let ra_hours = ra_decimal / 15.0;
            let (alt, az) = altitude_azimuth(ra_hours, dec_decimal, lat, lst_val);
            entry["altitude"] = serde_json::json!(alt);
            entry["azimuth"] = serde_json::json!(az);
            entry["above_horizon"] = serde_json::json!(alt > 0.0);
        }

        if obj.id == "moon" {
            if let Some(phase) = obj._moon_phase {
                entry["_moon_phase"] = serde_json::json!(phase);
            }
        }

        result.push(entry);
    }

    serde_json::to_string(&result).map_err(|e| format!("Serialization error: {}", e))
}
