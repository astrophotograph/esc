"""Astronomical catalog endpoints."""

import json
import math
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


class ObserverLocation(BaseModel):
    """Observer location for horizon calculations."""
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees") 
    elevation: float = Field(default=0, description="Elevation in meters")


class CelestialObject(BaseModel):
    """Enhanced celestial object with horizon calculations."""
    id: str
    name: str
    object_type: str
    ra_decimal: float
    dec_decimal: float
    magnitude: Optional[float] = None
    constellation: str
    altitude: Optional[float] = None
    azimuth: Optional[float] = None
    above_horizon: bool = False
    description: Optional[str] = None
    size_arcmin: Optional[float] = None
    moon_phase: Optional[float] = Field(None, description="Moon phase (0-1) for Moon object")


class CatalogSearchResponse(BaseModel):
    """Response for catalog search."""
    objects: List[CelestialObject]
    total_count: int
    filtered_count: int
    observer_location: Optional[ObserverLocation] = None


def calculate_local_sidereal_time(longitude: float, utc_datetime: datetime) -> float:
    """Calculate Local Sidereal Time in decimal hours."""
    # Convert to Julian Day
    jd = (utc_datetime - datetime(2000, 1, 1, 12, 0, 0)).total_seconds() / 86400.0 + 2451545.0
    
    # Greenwich Sidereal Time at 0h UT
    gst = 18.697374558 + 24.06570982441908 * (jd - 2451545.0)
    gst = gst % 24.0
    
    # Local Sidereal Time
    lst = gst + longitude / 15.0
    return lst % 24.0


def calculate_altitude_azimuth(ra_hours: float, dec_degrees: float, 
                             latitude: float, lst_hours: float) -> tuple[float, float]:
    """Calculate altitude and azimuth for given coordinates and observer location."""
    # Convert to radians
    dec_rad = math.radians(dec_degrees)
    lat_rad = math.radians(latitude)
    
    # Hour angle
    ha_hours = lst_hours - ra_hours
    ha_rad = math.radians(ha_hours * 15.0)
    
    # Calculate altitude
    sin_alt = (math.sin(dec_rad) * math.sin(lat_rad) + 
               math.cos(dec_rad) * math.cos(lat_rad) * math.cos(ha_rad))
    altitude = math.degrees(math.asin(sin_alt))
    
    # Calculate azimuth
    cos_az = ((math.sin(dec_rad) - math.sin(lat_rad) * sin_alt) / 
              (math.cos(lat_rad) * math.cos(math.radians(altitude))))
    cos_az = max(-1.0, min(1.0, cos_az))  # Clamp to [-1, 1]
    
    azimuth = math.degrees(math.acos(cos_az))
    if math.sin(ha_rad) > 0:
        azimuth = 360.0 - azimuth
    
    return altitude, azimuth


def load_catalog() -> Dict[str, Any]:
    """Load the astronomical catalog from JSON file."""
    catalog_path = Path(__file__).parent.parent.parent / "data" / "catalogs" / "astro_data" / "astronomical_objects_full.json"
    
    if not catalog_path.exists():
        raise HTTPException(status_code=500, detail="Catalog file not found")
    
    try:
        with open(catalog_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading catalog: {e}")
        raise HTTPException(status_code=500, detail="Error loading catalog")


def get_object_magnitude(magnitudes: Dict[str, Any]) -> Optional[float]:
    """Extract the best available magnitude from magnitude data."""
    # Priority order for magnitude selection
    mag_priority = ['v', 'b', 'r', 'i', 'j', 'h', 'k', 'u']
    
    for mag_type in mag_priority:
        mag = magnitudes.get(mag_type)
        if mag is not None:
            return float(mag)
    
    return None


def get_object_name(obj: Dict[str, Any]) -> str:
    """Extract the best available name for an object."""
    catalog_ids = obj.get('catalog_ids', {})
    names = obj.get('names', {})
    obj_id = obj.get('id', '')
    
    # Priority order for naming
    if catalog_ids.get('messier'):
        messier_id = catalog_ids['messier']
        # Handle both formats: "M001" and "001"
        if messier_id.startswith('M'):
            # Remove leading zeros and format properly: M001 -> M 1
            number = messier_id[1:].lstrip('0') or '0'
            return f"M {number}"
        else:
            # Legacy format without M prefix
            return f"M {messier_id}"
    elif catalog_ids.get('ngc'):
        return f"NGC {catalog_ids['ngc']}"
    elif catalog_ids.get('ic'):
        return f"IC {catalog_ids['ic']}"
    elif obj_id.startswith('NGC'):
        # Parse NGC number from ID field and format with space
        num = obj_id[3:]  # Remove 'NGC' prefix
        return f"NGC {num}"
    elif obj_id.startswith('IC'):
        # Parse IC number from ID field and format with space
        num = obj_id[2:]  # Remove 'IC' prefix
        return f"IC {num}"
    elif names.get('proper'):
        return names['proper']
    elif names.get('bayer_flamsteed'):
        return names['bayer_flamsteed']
    elif names.get('common') and len(names['common']) > 0:
        return names['common'][0]
    else:
        return obj_id if obj_id else 'Unknown'


def get_all_object_names(obj: Dict[str, Any]) -> List[str]:
    """Get all possible names for an object for search purposes."""
    catalog_ids = obj.get('catalog_ids', {})
    names = obj.get('names', {})
    all_names = []
    
    # Primary catalog designations
    if catalog_ids.get('messier'):
        messier_id = catalog_ids['messier']
        # Handle both formats: "M001" and "001"
        if messier_id.startswith('M'):
            number = messier_id[1:].lstrip('0') or '0'
        else:
            number = messier_id.lstrip('0') or '0'
        
        all_names.extend([
            f"M{number}",
            f"M {number}",
            f"Messier {number}",
            f"Messier{number}",
            f"M{messier_id}",  # Original format for backwards compatibility
            f"M {messier_id}"
        ])
    
    if catalog_ids.get('ngc'):
        ngc_num = catalog_ids['ngc']
        all_names.extend([
            f"NGC{ngc_num}",
            f"NGC {ngc_num}"
        ])
    
    if catalog_ids.get('ic'):
        ic_num = catalog_ids['ic']
        all_names.extend([
            f"IC{ic_num}",
            f"IC {ic_num}"
        ])
    
    # Other catalog names
    if catalog_ids.get('hr'):
        all_names.append(f"HR {catalog_ids['hr']}")
    if catalog_ids.get('hd'):
        all_names.append(f"HD {catalog_ids['hd']}")
    if catalog_ids.get('hip'):
        all_names.append(f"HIP {catalog_ids['hip']}")
    
    # Proper names and common names
    if names.get('proper'):
        all_names.append(names['proper'])
    
    if names.get('bayer_flamsteed'):
        all_names.append(names['bayer_flamsteed'])
    
    if names.get('common'):
        all_names.extend(names['common'])
    
    if names.get('other'):
        all_names.extend(names['other'])
    
    # Object ID as fallback - also parse NGC/IC numbers from ID
    obj_id = obj.get('id', '')
    all_names.append(obj_id)
    
    # Parse NGC/IC numbers from the ID field and add spaced versions
    if obj_id.startswith('NGC'):
        num = obj_id[3:]  # Remove 'NGC' prefix
        all_names.extend([
            f"NGC {num}",
            f"ngc {num}",
            f"NGC{num}",
            f"ngc{num}"
        ])
    elif obj_id.startswith('IC'):
        num = obj_id[2:]  # Remove 'IC' prefix  
        all_names.extend([
            f"IC {num}",
            f"ic {num}",
            f"IC{num}",
            f"ic{num}"
        ])
    
    return [name for name in all_names if name]  # Remove empty strings


def matches_search_query(obj: Dict[str, Any], query: str) -> bool:
    """Check if an object matches the search query."""
    if not query:
        return True
    
    query_lower = query.lower().strip()
    all_names = get_all_object_names(obj)
    
    # Add common name aliases for famous objects
    catalog_ids = obj.get('catalog_ids', {})
    messier_num = catalog_ids.get('messier', '')
    
    # Add well-known common names - check both catalog_ids and convert to string for comparison
    common_aliases = []
    messier_str = str(messier_num) if messier_num else ''
    
    if messier_str in ['1', '001', 'M1', 'M001']:
        common_aliases = ['crab nebula', 'crab']
    elif messier_str in ['31', '031', 'M31', 'M031']:
        common_aliases = ['andromeda galaxy', 'andromeda']
    elif messier_str in ['42', '042', 'M42', 'M042']:
        common_aliases = ['orion nebula', 'orion']
    elif messier_str in ['45', '045', 'M45', 'M045']:
        common_aliases = ['pleiades', 'seven sisters']
    elif messier_str in ['13', '013', 'M13', 'M013']:
        common_aliases = ['hercules cluster', 'great globular cluster']
    elif messier_str in ['57', '057', 'M57', 'M057']:
        common_aliases = ['ring nebula', 'ring']
    elif messier_str in ['27', '027', 'M27', 'M027']:
        common_aliases = ['dumbbell nebula', 'dumbbell']
    elif messier_str in ['51', '051', 'M51', 'M051']:
        common_aliases = ['whirlpool galaxy', 'whirlpool']
    elif messier_str in ['81', '081', 'M81', 'M081']:
        common_aliases = ['bodes galaxy', 'bode']
    elif messier_str in ['82', '082', 'M82', 'M082']:
        common_aliases = ['cigar galaxy', 'cigar']
    elif messier_str in ['104', 'M104']:
        common_aliases = ['sombrero galaxy', 'sombrero']
    
    all_names.extend(common_aliases)
    
    # Check for exact matches first
    for name in all_names:
        if name.lower() == query_lower:
            return True
    
    # Special handling for Messier numbers to avoid partial matches
    # If query looks like a Messier number (M + number or Messier + number), do exact matching
    messier_match = None
    if query_lower.startswith('m') and len(query_lower) > 1:
        query_num = query_lower[1:].strip()
        if query_num.isdigit():
            messier_match = query_num
    elif query_lower.startswith('messier') and len(query_lower) > 7:
        # Handle "messier 7", "messier7", etc.
        query_num = query_lower[7:].strip()
        if query_num.isdigit():
            messier_match = query_num
    
    if messier_match:
        # Query is like "M1", "M31", "Messier 7", etc. - only match exact Messier numbers
        messier_id = catalog_ids.get('messier', '')
        if messier_id:
            # Handle both M001 and M1 formats
            if messier_id.startswith('M'):
                messier_digits = messier_id[1:].lstrip('0') or '0'  # Remove M prefix and leading zeros
            else:
                messier_digits = messier_id.lstrip('0') or '0'  # Remove leading zeros
            if messier_digits == messier_match:
                return True
        return False  # Don't do partial matching for Messier queries
    
    # Check for partial matches (contains) for non-Messier queries
    for name in all_names:
        if query_lower in name.lower():
            return True
    
    # Check if query matches object type
    obj_type = obj.get('object_type', '').lower()
    if query_lower in obj_type:
        return True
    
    # Check constellation
    constellation = obj.get('coordinates', {}).get('constellation', '').lower()
    if query_lower in constellation:
        return True
    
    return False


def get_object_size(physical_props: Dict[str, Any]) -> Optional[float]:
    """Extract object size in arcminutes."""
    size = physical_props.get('size', {})
    major_axis = size.get('major_axis_arcmin')
    if major_axis is not None:
        return float(major_axis)
    return None


def calculate_sun_position(date: datetime) -> Dict[str, Any]:
    """Calculate simplified Sun position."""
    # Days since J2000.0 (J2000.0 = January 1, 2000, 12:00 UTC)
    j2000 = datetime(2000, 1, 1, 12, 0, 0)
    jd = (date - j2000).total_seconds() / 86400.0 + 2451545.0
    T = (jd - 2451545.0) / 36525.0
    
    # Mean longitude of the Sun
    L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360
    
    # Mean anomaly of the Sun  
    M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360
    M_rad = math.radians(M)
    
    # Equation of center
    C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * math.sin(M_rad) + \
        (0.019993 - 0.000101 * T) * math.sin(2 * M_rad) + \
        0.000289 * math.sin(3 * M_rad)
    
    # True longitude
    L = L0 + C
    
    # Obliquity of the ecliptic
    epsilon = 23.439291 - 0.0130042 * T
    epsilon_rad = math.radians(epsilon)
    lambda_rad = math.radians(L)
    
    # Convert to RA/Dec
    ra = math.degrees(math.atan2(math.cos(epsilon_rad) * math.sin(lambda_rad), math.cos(lambda_rad)))
    if ra < 0:
        ra += 360
    dec = math.degrees(math.asin(math.sin(epsilon_rad) * math.sin(lambda_rad)))
    
    return {
        'id': 'sun',
        'catalog_ids': {},
        'names': {'proper': 'Sun', 'common': ['Sol'], 'other': []},
        'object_type': 'Star',
        'coordinates': {
            'ra_j2000': {'decimal': ra},
            'dec_j2000': {'decimal': dec},
            'constellation': 'Various'
        },
        'magnitudes': {'v': -26.7},
        'physical_properties': {},
        'description': 'Our star - WARNING: Never observe directly without proper solar filters'
    }


def calculate_moon_position(date: datetime) -> Dict[str, Any]:
    """Calculate simplified Moon position and phase."""
    # Days since J2000.0
    jd = (date - datetime(2000, 1, 1, 12, 0, 0)).total_seconds() / 86400.0 + 2451545.0
    T = (jd - 2451545.0) / 36525.0
    
    # Mean longitude of the Moon
    L = (218.3164591 + 481267.88134236 * T) % 360
    
    # Mean anomaly of the Moon
    M = (134.9634114 + 477198.8676313 * T) % 360
    
    # Mean anomaly of the Sun
    M_sun = (357.5291 + 35999.0503 * T) % 360
    
    # Mean elongation of Moon from Sun
    D = (297.8502042 + 445267.1115168 * T) % 360
    
    # Convert to radians
    M_rad = math.radians(M)
    D_rad = math.radians(D)
    
    # Simplified longitude correction
    longitude_correction = \
        6.289 * math.sin(M_rad) + \
        1.274 * math.sin(2 * D_rad - M_rad) + \
        0.658 * math.sin(2 * D_rad) + \
        0.214 * math.sin(2 * M_rad)
    
    # True longitude
    true_longitude = (L + longitude_correction) % 360
    
    # Simplified conversion to RA/Dec (assuming zero latitude)
    epsilon = 23.439291 - 0.0130042 * T
    epsilon_rad = math.radians(epsilon)
    lambda_rad = math.radians(true_longitude)
    
    ra = math.degrees(math.atan2(math.sin(lambda_rad) * math.cos(epsilon_rad), math.cos(lambda_rad)))
    if ra < 0:
        ra += 360
    dec = math.degrees(math.asin(math.sin(epsilon_rad) * math.sin(lambda_rad)))
    
    # Calculate phase (simplified)
    sun_pos = calculate_sun_position(date)
    elongation = (true_longitude - sun_pos['coordinates']['ra_j2000']['decimal']) % 360
    phase = (1 - math.cos(math.radians(elongation))) / 2
    
    # Magnitude varies with phase
    magnitude = -12.6 + 2.5 * math.log10(phase + 0.1)
    
    return {
        'id': 'moon',
        'catalog_ids': {},
        'names': {'proper': 'Moon', 'common': ['Luna'], 'other': []},
        'object_type': 'Moon',
        'coordinates': {
            'ra_j2000': {'decimal': ra},
            'dec_j2000': {'decimal': dec},
            'constellation': 'Various'
        },
        'magnitudes': {'v': magnitude},
        'physical_properties': {},
        '_moon_phase': phase,
        'description': f"Earth's natural satellite - {int(phase * 100)}% illuminated"
    }


def get_planet_positions(date: datetime) -> List[Dict[str, Any]]:
    """Get simplified positions for visible planets."""
    # Planet orbital data (simplified)
    planets = [
        {'name': 'Mercury', 'period': 87.97, 'distance': 0.387, 'mag': -0.4, 'desc': 'Innermost planet, best seen at twilight'},
        {'name': 'Venus', 'period': 224.70, 'distance': 0.723, 'mag': -4.6, 'desc': 'Brightest planet, Evening/Morning Star'},
        {'name': 'Mars', 'period': 686.98, 'distance': 1.524, 'mag': -1.0, 'desc': 'The Red Planet'},
        {'name': 'Jupiter', 'period': 4332.59, 'distance': 5.203, 'mag': -2.5, 'desc': 'Largest planet with visible moons'},
        {'name': 'Saturn', 'period': 10759.22, 'distance': 9.537, 'mag': 0.7, 'desc': 'Ringed planet'},
    ]
    
    jd = (date - datetime(2000, 1, 1, 12, 0, 0)).total_seconds() / 86400.0 + 2451545.0
    
    result = []
    for planet in planets:
        # Very simplified position calculation
        # In reality, would need proper orbital elements
        mean_motion = 360.0 / planet['period']
        mean_anomaly = (mean_motion * (jd - 2451545.0)) % 360
        
        # Simplified heliocentric longitude
        longitude = mean_anomaly  # This is very simplified!
        
        # Convert to approximate RA/Dec (very rough approximation)
        ra = longitude
        dec = 0  # Planets are roughly on ecliptic
        
        result.append({
            'id': planet['name'].lower(),
            'catalog_ids': {},
            'names': {'proper': planet['name'], 'common': [], 'other': []},
            'object_type': 'Planet',
            'coordinates': {
                'ra_j2000': {'decimal': ra},
                'dec_j2000': {'decimal': dec},
                'constellation': 'Various'
            },
            'magnitudes': {'v': planet['mag']},
            'physical_properties': {},
            'description': planet['desc']
        })
    
    return result


@router.get("/search", response_model=CatalogSearchResponse)
async def search_catalog(
    query: Optional[str] = Query(None, description="Search query for object name or type"),
    object_type: Optional[str] = Query(None, description="Filter by object type (G=galaxy, PN=planetary nebula, etc.)"),
    min_magnitude: Optional[float] = Query(None, description="Minimum magnitude (brighter objects)"),
    max_magnitude: Optional[float] = Query(None, description="Maximum magnitude (fainter objects)"),
    above_horizon_only: bool = Query(True, description="Only show objects above horizon"),
    latitude: Optional[float] = Query(None, ge=-90, le=90, description="Observer latitude"),
    longitude: Optional[float] = Query(None, ge=-180, le=180, description="Observer longitude"),
    elevation: Optional[float] = Query(0, description="Observer elevation in meters"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results")
) -> CatalogSearchResponse:
    """
    Search the astronomical catalog with horizon calculations.
    Objects are sorted by magnitude (brightest first) within each type.
    """
    
    catalog_data = load_catalog()
    objects = catalog_data.get('objects', [])
    
    # Observer location for horizon calculations
    observer_location = None
    now = datetime.utcnow()
    if latitude is not None and longitude is not None:
        observer_location = ObserverLocation(
            latitude=latitude,
            longitude=longitude,
            elevation=elevation
        )
        
        # Calculate Local Sidereal Time
        lst = calculate_local_sidereal_time(longitude, now)
    
    # Add dynamic celestial objects (Sun, Moon, planets)
    dynamic_objects = []
    
    # Add Sun
    sun = calculate_sun_position(now)
    dynamic_objects.append(sun)
    
    # Add Moon
    moon = calculate_moon_position(now)
    dynamic_objects.append(moon)
    
    # Add planets
    planets = get_planet_positions(now)
    dynamic_objects.extend(planets)
    
    # Combine all objects
    all_objects = dynamic_objects + objects
    
    results = []
    
    for obj in all_objects:
        try:
            # Extract basic object data
            coordinates = obj.get('coordinates', {})
            ra_data = coordinates.get('ra_j2000', {})
            dec_data = coordinates.get('dec_j2000', {})
            
            if not ra_data or not dec_data:
                continue
                
            ra_decimal = ra_data.get('decimal')
            dec_decimal = dec_data.get('decimal')
            
            if ra_decimal is None or dec_decimal is None:
                continue
            
            # Get object details
            name = get_object_name(obj)
            obj_type = obj.get('object_type', 'Unknown')
            constellation = coordinates.get('constellation', 'Unknown')
            magnitudes = obj.get('magnitudes', {})
            magnitude = get_object_magnitude(magnitudes)
            physical_props = obj.get('physical_properties', {})
            size_arcmin = get_object_size(physical_props)
            
            # Apply search query filter using enhanced matching
            if query and not matches_search_query(obj, query):
                continue
                
            if object_type and obj_type != object_type:
                continue
                
            if magnitude is not None:
                if min_magnitude is not None and magnitude < min_magnitude:
                    continue
                if max_magnitude is not None and magnitude > max_magnitude:
                    continue
            
            # For initial display (no search query), only show objects with magnitude ≤ 6.0
            if not query:
                if magnitude is None or magnitude > 6.0:
                    continue
            
            # Calculate horizon position if observer location provided
            altitude = None
            azimuth = None
            above_horizon = True  # Default to true if no location provided
            
            if observer_location:
                ra_hours = ra_decimal / 15.0  # Convert degrees to hours
                altitude, azimuth = calculate_altitude_azimuth(
                    ra_hours, dec_decimal, observer_location.latitude, lst
                )
                above_horizon = altitude > 0
                
                # Filter by horizon if requested - but allow below horizon objects when searching
                if above_horizon_only and not above_horizon and not query:
                    continue
            
            # Create celestial object
            moon_phase = obj.get('_moon_phase') if obj.get('id') == 'moon' else None
            
            celestial_obj = CelestialObject(
                id=obj.get('id', ''),
                name=name,
                object_type=obj_type,
                ra_decimal=ra_decimal,
                dec_decimal=dec_decimal,
                magnitude=magnitude,
                constellation=constellation,
                altitude=altitude,
                azimuth=azimuth,
                above_horizon=above_horizon,
                size_arcmin=size_arcmin,
                moon_phase=moon_phase
            )
            
            results.append(celestial_obj)
            
        except Exception as e:
            logger.warning(f"Error processing object {obj.get('id', 'unknown')}: {e}")
            continue
    
    # Map object types to display groups
    def get_display_group(obj_type: str) -> str:
        # Map various object types to main display groups
        type_mapping = {
            # Planets and Solar System
            'Planet': 'Planets',
            'Moon': 'Planets',
            
            # Stars
            'Star': 'Stars',
            '*': 'Stars',
            '**': 'Stars',
            'V*': 'Stars',
            
            # Nebulae
            'PN': 'Nebulae',
            'EN': 'Nebulae',
            'RN': 'Nebulae',
            'DN': 'Nebulae',
            'SNR': 'Nebulae',
            'Neb': 'Nebulae',
            'HII': 'Nebulae',
            'EmN': 'Nebulae',
            'RfN': 'Nebulae',
            'DrkN': 'Nebulae',
            
            # Galaxies
            'G': 'Galaxies',
            'GPair': 'Galaxies',
            'GTrpl': 'Galaxies',
            'GGroup': 'Galaxies',
            
            # Clusters
            'OC': 'Clusters',
            'OCl': 'Clusters',
            'GC': 'Clusters',
            'GCl': 'Clusters',
            'Cl+N': 'Clusters',
            '*Ass': 'Clusters',
        }
        return type_mapping.get(obj_type, 'Other')
    
    # Sort by display group, then by above/below horizon, then by altitude, then by magnitude
    def sort_key(obj: CelestialObject) -> tuple:
        display_group = get_display_group(obj.object_type)
        # Group order: Planets first, Stars last
        group_order = {'Planets': 0, 'Nebulae': 1, 'Galaxies': 2, 'Clusters': 3, 'Other': 4, 'Stars': 5}
        group_sort = group_order.get(display_group, 99)
        
        # Above horizon objects first (0 = above, 1 = below)
        horizon_sort = 0 if obj.above_horizon else 1
        
        # Higher altitude is better (negative for descending sort)
        altitude_sort = -obj.altitude if obj.altitude is not None else -999.0
        
        # Brighter magnitude is better (smaller value)
        magnitude_sort = obj.magnitude if obj.magnitude is not None else 999.0
        
        return (group_sort, horizon_sort, altitude_sort, magnitude_sort)
    
    results.sort(key=sort_key)
    
    # For initial display (no query), ensure a mix of object types
    if not query and len(results) > limit:
        # Take the best objects from each group
        grouped_results = {}
        for obj in results:
            group = get_display_group(obj.object_type)
            if group not in grouped_results:
                grouped_results[group] = []
            grouped_results[group].append(obj)
        
        # Take up to limit/5 objects from each group (ensures variety)
        filtered_results = []
        per_group_limit = max(limit // 5, 10)  # At least 10 per group
        
        # Process groups in order
        for group in ['Planets', 'Nebulae', 'Galaxies', 'Clusters', 'Stars', 'Other']:
            if group in grouped_results:
                filtered_results.extend(grouped_results[group][:per_group_limit])
        
        # If we haven't reached the limit, add more from each group
        if len(filtered_results) < limit:
            remaining = limit - len(filtered_results)
            for group in ['Planets', 'Nebulae', 'Galaxies', 'Clusters', 'Stars', 'Other']:
                if group in grouped_results:
                    already_added = min(per_group_limit, len(grouped_results[group]))
                    additional = grouped_results[group][already_added:already_added + remaining]
                    filtered_results.extend(additional)
                    remaining -= len(additional)
                    if remaining <= 0:
                        break
        
        filtered_results = filtered_results[:limit]
    else:
        # For searches or when under limit, just apply limit
        filtered_results = results[:limit]
    
    total_count = len(results)
    
    return CatalogSearchResponse(
        objects=filtered_results,
        total_count=len(all_objects),
        filtered_count=total_count,
        observer_location=observer_location
    )


@router.get("/object-types")
async def get_object_types() -> Dict[str, int]:
    """Get available object types and their counts."""
    catalog_data = load_catalog()
    objects = catalog_data.get('objects', [])
    
    type_counts = {}
    for obj in objects:
        obj_type = obj.get('object_type', 'Unknown')
        type_counts[obj_type] = type_counts.get(obj_type, 0) + 1
    
    return type_counts