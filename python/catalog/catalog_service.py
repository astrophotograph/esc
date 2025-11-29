"""Catalog service for astronomical object search.

Ported from legacy FastAPI implementation.
"""

import json
import math
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field


class ObserverLocation(BaseModel):
    """Observer location for horizon calculations."""

    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees")
    elevation: float = Field(default=0, description="Elevation in meters")


class CelestialObject(BaseModel):
    """Celestial object with calculated properties."""

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
    moon_phase: Optional[float] = Field(
        None, description="Moon phase (0-1) for Moon object"
    )


class CatalogSearchResponse(BaseModel):
    """Response for catalog search."""

    objects: list[CelestialObject]
    total_count: int
    filtered_count: int
    observer_location: Optional[ObserverLocation] = None


class CatalogService:
    """Service for astronomical catalog operations."""

    _catalog_cache: Optional[dict[str, Any]] = None
    _cache_load_time: float = 0

    def __init__(self, catalog_path: Optional[Path] = None):
        """Initialize the catalog service.

        Args:
            catalog_path: Path to the catalog JSON file
        """
        if catalog_path:
            self._catalog_path = catalog_path
        else:
            # Default path relative to this file
            self._catalog_path = (
                Path(__file__).parent.parent.parent
                / "src-tauri"
                / "data"
                / "catalogs"
                / "astronomical_objects_full.json"
            )

    def load_catalog(self) -> dict[str, Any]:
        """Load the astronomical catalog from JSON file with caching."""
        # Return cached data if available and less than 1 hour old
        if (
            CatalogService._catalog_cache is not None
            and (time.time() - CatalogService._cache_load_time) < 3600
        ):
            return CatalogService._catalog_cache

        if not self._catalog_path.exists():
            raise FileNotFoundError(f"Catalog file not found: {self._catalog_path}")

        start_time = time.time()
        with open(self._catalog_path, "r", encoding="utf-8") as f:
            CatalogService._catalog_cache = json.load(f)
        CatalogService._cache_load_time = time.time()
        load_duration = CatalogService._cache_load_time - start_time
        print(
            f"Catalog loaded in {load_duration:.2f} seconds "
            f"({len(CatalogService._catalog_cache.get('objects', []))} objects)"
        )
        return CatalogService._catalog_cache

    @staticmethod
    def calculate_local_sidereal_time(longitude: float, utc_datetime: datetime) -> float:
        """Calculate Local Sidereal Time in decimal hours."""
        # Convert to Julian Day
        jd = (
            utc_datetime - datetime(2000, 1, 1, 12, 0, 0)
        ).total_seconds() / 86400.0 + 2451545.0

        # Greenwich Sidereal Time at 0h UT
        gst = 18.697374558 + 24.06570982441908 * (jd - 2451545.0)
        gst = gst % 24.0

        # Local Sidereal Time
        lst = gst + longitude / 15.0
        return lst % 24.0

    @staticmethod
    def calculate_altitude_azimuth(
        ra_hours: float, dec_degrees: float, latitude: float, lst_hours: float
    ) -> tuple[float, float]:
        """Calculate altitude and azimuth for given coordinates and observer location."""
        # Convert to radians
        dec_rad = math.radians(dec_degrees)
        lat_rad = math.radians(latitude)

        # Hour angle
        ha_hours = lst_hours - ra_hours
        ha_rad = math.radians(ha_hours * 15.0)

        # Calculate altitude
        sin_alt = math.sin(dec_rad) * math.sin(lat_rad) + math.cos(dec_rad) * math.cos(
            lat_rad
        ) * math.cos(ha_rad)
        altitude = math.degrees(math.asin(sin_alt))

        # Calculate azimuth
        cos_az = (math.sin(dec_rad) - math.sin(lat_rad) * sin_alt) / (
            math.cos(lat_rad) * math.cos(math.radians(altitude))
        )
        cos_az = max(-1.0, min(1.0, cos_az))  # Clamp to [-1, 1]

        azimuth = math.degrees(math.acos(cos_az))
        if math.sin(ha_rad) > 0:
            azimuth = 360.0 - azimuth

        return altitude, azimuth

    @staticmethod
    def get_object_magnitude(magnitudes: dict[str, Any]) -> Optional[float]:
        """Extract the best available magnitude from magnitude data."""
        mag_priority = ["v", "b", "r", "i", "j", "h", "k", "u"]

        for mag_type in mag_priority:
            mag = magnitudes.get(mag_type)
            if mag is not None:
                return float(mag)

        return None

    @staticmethod
    def get_object_name(obj: dict[str, Any]) -> str:
        """Extract the best available name for an object."""
        catalog_ids = obj.get("catalog_ids", {})
        names = obj.get("names", {})
        obj_id = obj.get("id", "")

        # Priority order for naming
        if catalog_ids.get("messier"):
            messier_id = catalog_ids["messier"]
            if messier_id.startswith("M"):
                number = messier_id[1:].lstrip("0") or "0"
                return f"M {number}"
            else:
                return f"M {messier_id}"
        elif catalog_ids.get("ngc"):
            return f"NGC {catalog_ids['ngc']}"
        elif catalog_ids.get("ic"):
            return f"IC {catalog_ids['ic']}"
        elif catalog_ids.get("sharpless"):
            return catalog_ids["sharpless"]
        elif catalog_ids.get("barnard"):
            return catalog_ids["barnard"]
        elif catalog_ids.get("ldn"):
            return catalog_ids["ldn"]
        elif catalog_ids.get("lbn"):
            return catalog_ids["lbn"]
        elif obj_id.startswith("NGC"):
            num = obj_id[3:]
            return f"NGC {num}"
        elif obj_id.startswith("IC"):
            num = obj_id[2:]
            return f"IC {num}"
        elif names.get("proper"):
            return names["proper"]
        elif names.get("bayer_flamsteed"):
            return names["bayer_flamsteed"]
        elif names.get("common") and len(names["common"]) > 0:
            return names["common"][0]
        else:
            return obj_id if obj_id else "Unknown"

    @staticmethod
    def get_all_object_names(obj: dict[str, Any]) -> list[str]:
        """Get all possible names for an object for search purposes."""
        catalog_ids = obj.get("catalog_ids", {})
        names = obj.get("names", {})
        all_names = []

        # Messier
        if catalog_ids.get("messier"):
            messier_id = catalog_ids["messier"]
            if messier_id.startswith("M"):
                number = messier_id[1:].lstrip("0") or "0"
            else:
                number = messier_id.lstrip("0") or "0"

            all_names.extend(
                [
                    f"M{number}",
                    f"M {number}",
                    f"Messier {number}",
                    f"Messier{number}",
                ]
            )

        # NGC/IC
        if catalog_ids.get("ngc"):
            ngc_num = catalog_ids["ngc"]
            all_names.extend([f"NGC{ngc_num}", f"NGC {ngc_num}"])

        if catalog_ids.get("ic"):
            ic_num = catalog_ids["ic"]
            all_names.extend([f"IC{ic_num}", f"IC {ic_num}"])

        # Other catalogs
        if catalog_ids.get("sharpless"):
            sharpless_id = catalog_ids["sharpless"]
            all_names.extend(
                [sharpless_id, sharpless_id.replace("-", ""), f"Sharpless {sharpless_id[3:]}"]
            )
        if catalog_ids.get("barnard"):
            barnard_id = catalog_ids["barnard"]
            all_names.extend([barnard_id, f"Barnard {barnard_id[1:]}", f"B {barnard_id[1:]}"])

        # Names
        if names.get("proper"):
            all_names.append(names["proper"])
        if names.get("bayer_flamsteed"):
            all_names.append(names["bayer_flamsteed"])
        if names.get("common"):
            all_names.extend(names["common"])
        if names.get("other"):
            all_names.extend(names["other"])

        # Object ID as fallback
        obj_id = obj.get("id", "")
        all_names.append(obj_id)

        return [name for name in all_names if name]

    @staticmethod
    def matches_search_query(obj: dict[str, Any], query: str) -> bool:
        """Check if an object matches the search query."""
        if not query:
            return True

        query_lower = query.lower().strip()
        all_names = CatalogService.get_all_object_names(obj)

        # Add common name aliases for famous objects
        catalog_ids = obj.get("catalog_ids", {})
        messier_num = catalog_ids.get("messier", "")
        messier_str = str(messier_num) if messier_num else ""

        common_aliases = []
        if messier_str in ["1", "001", "M1", "M001"]:
            common_aliases = ["crab nebula", "crab"]
        elif messier_str in ["31", "031", "M31", "M031"]:
            common_aliases = ["andromeda galaxy", "andromeda"]
        elif messier_str in ["42", "042", "M42", "M042"]:
            common_aliases = ["orion nebula", "orion"]
        elif messier_str in ["45", "045", "M45", "M045"]:
            common_aliases = ["pleiades", "seven sisters"]
        elif messier_str in ["57", "057", "M57", "M057"]:
            common_aliases = ["ring nebula", "ring"]
        elif messier_str in ["27", "027", "M27", "M027"]:
            common_aliases = ["dumbbell nebula", "dumbbell"]
        elif messier_str in ["51", "051", "M51", "M051"]:
            common_aliases = ["whirlpool galaxy", "whirlpool"]

        all_names.extend(common_aliases)

        # Check for exact matches first
        for name in all_names:
            if name.lower() == query_lower:
                return True

        # Special handling for Messier numbers
        messier_match = None
        if query_lower.startswith("m") and len(query_lower) > 1:
            query_num = query_lower[1:].strip()
            if query_num.isdigit():
                messier_match = query_num
        elif query_lower.startswith("messier") and len(query_lower) > 7:
            query_num = query_lower[7:].strip()
            if query_num.isdigit():
                messier_match = query_num

        if messier_match:
            messier_id = catalog_ids.get("messier", "")
            if messier_id:
                if messier_id.startswith("M"):
                    messier_digits = messier_id[1:].lstrip("0") or "0"
                else:
                    messier_digits = messier_id.lstrip("0") or "0"
                if messier_digits == messier_match:
                    return True
            return False

        # Check for partial matches
        for name in all_names:
            if query_lower in name.lower():
                return True

        # Check object type and constellation
        obj_type = obj.get("object_type", "").lower()
        if query_lower in obj_type:
            return True

        constellation = obj.get("coordinates", {}).get("constellation", "").lower()
        if query_lower in constellation:
            return True

        return False

    @staticmethod
    def get_object_size(physical_props: dict[str, Any]) -> Optional[float]:
        """Extract object size in arcminutes."""
        size = physical_props.get("size", {})
        major_axis = size.get("major_axis_arcmin")
        if major_axis is not None:
            return float(major_axis)
        return None

    @staticmethod
    def calculate_sun_position(date: datetime) -> dict[str, Any]:
        """Calculate simplified Sun position."""
        j2000 = datetime(2000, 1, 1, 12, 0, 0)
        jd = (date - j2000).total_seconds() / 86400.0 + 2451545.0
        T = (jd - 2451545.0) / 36525.0

        # Mean longitude of the Sun
        L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360

        # Mean anomaly of the Sun
        M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360
        M_rad = math.radians(M)

        # Equation of center
        C = (
            (1.914602 - 0.004817 * T - 0.000014 * T * T) * math.sin(M_rad)
            + (0.019993 - 0.000101 * T) * math.sin(2 * M_rad)
            + 0.000289 * math.sin(3 * M_rad)
        )

        # True longitude
        L = L0 + C

        # Obliquity of the ecliptic
        epsilon = 23.439291 - 0.0130042 * T
        epsilon_rad = math.radians(epsilon)
        lambda_rad = math.radians(L)

        # Convert to RA/Dec
        ra = math.degrees(
            math.atan2(math.cos(epsilon_rad) * math.sin(lambda_rad), math.cos(lambda_rad))
        )
        if ra < 0:
            ra += 360
        dec = math.degrees(math.asin(math.sin(epsilon_rad) * math.sin(lambda_rad)))

        return {
            "id": "sun",
            "catalog_ids": {},
            "names": {"proper": "Sun", "common": ["Sol"], "other": []},
            "object_type": "Star",
            "coordinates": {
                "ra_j2000": {"decimal": ra},
                "dec_j2000": {"decimal": dec},
                "constellation": "Various",
            },
            "magnitudes": {"v": -26.7},
            "physical_properties": {},
            "description": "Our star - WARNING: Never observe directly without proper solar filters",
        }

    @staticmethod
    def calculate_moon_position(date: datetime) -> dict[str, Any]:
        """Calculate simplified Moon position and phase."""
        jd = (date - datetime(2000, 1, 1, 12, 0, 0)).total_seconds() / 86400.0 + 2451545.0
        T = (jd - 2451545.0) / 36525.0

        # Mean longitude of the Moon
        L = (218.3164591 + 481267.88134236 * T) % 360

        # Mean anomaly of the Moon
        M = (134.9634114 + 477198.8676313 * T) % 360

        # Mean elongation of Moon from Sun
        D = (297.8502042 + 445267.1115168 * T) % 360

        M_rad = math.radians(M)
        D_rad = math.radians(D)

        # Simplified longitude correction
        longitude_correction = (
            6.289 * math.sin(M_rad)
            + 1.274 * math.sin(2 * D_rad - M_rad)
            + 0.658 * math.sin(2 * D_rad)
            + 0.214 * math.sin(2 * M_rad)
        )

        # True longitude
        true_longitude = (L + longitude_correction) % 360

        # Simplified conversion to RA/Dec
        epsilon = 23.439291 - 0.0130042 * T
        epsilon_rad = math.radians(epsilon)
        lambda_rad = math.radians(true_longitude)

        ra = math.degrees(
            math.atan2(math.sin(lambda_rad) * math.cos(epsilon_rad), math.cos(lambda_rad))
        )
        if ra < 0:
            ra += 360
        dec = math.degrees(math.asin(math.sin(epsilon_rad) * math.sin(lambda_rad)))

        # Calculate phase
        sun_pos = CatalogService.calculate_sun_position(date)
        elongation = (true_longitude - sun_pos["coordinates"]["ra_j2000"]["decimal"]) % 360
        phase = (1 - math.cos(math.radians(elongation))) / 2

        # Magnitude varies with phase
        magnitude = -12.6 + 2.5 * math.log10(phase + 0.1)

        return {
            "id": "moon",
            "catalog_ids": {},
            "names": {"proper": "Moon", "common": ["Luna"], "other": []},
            "object_type": "Moon",
            "coordinates": {
                "ra_j2000": {"decimal": ra},
                "dec_j2000": {"decimal": dec},
                "constellation": "Various",
            },
            "magnitudes": {"v": magnitude},
            "physical_properties": {},
            "_moon_phase": phase,
            "description": f"Earth's natural satellite - {int(phase * 100)}% illuminated",
        }

    @staticmethod
    def get_planet_positions(date: datetime) -> list[dict[str, Any]]:
        """Get simplified positions for visible planets."""
        planets = [
            {
                "name": "Mercury",
                "period": 87.97,
                "mag": -0.4,
                "desc": "Innermost planet, best seen at twilight",
            },
            {
                "name": "Venus",
                "period": 224.70,
                "mag": -4.6,
                "desc": "Brightest planet, Evening/Morning Star",
            },
            {"name": "Mars", "period": 686.98, "mag": -1.0, "desc": "The Red Planet"},
            {
                "name": "Jupiter",
                "period": 4332.59,
                "mag": -2.5,
                "desc": "Largest planet with visible moons",
            },
            {"name": "Saturn", "period": 10759.22, "mag": 0.7, "desc": "Ringed planet"},
        ]

        jd = (date - datetime(2000, 1, 1, 12, 0, 0)).total_seconds() / 86400.0 + 2451545.0

        result = []
        for planet in planets:
            # Very simplified position calculation
            mean_motion = 360.0 / planet["period"]
            mean_anomaly = (mean_motion * (jd - 2451545.0)) % 360

            # Simplified heliocentric longitude
            longitude = mean_anomaly

            # Convert to approximate RA/Dec (very rough approximation)
            ra = longitude
            dec = 0  # Planets are roughly on ecliptic

            result.append(
                {
                    "id": planet["name"].lower(),
                    "catalog_ids": {},
                    "names": {"proper": planet["name"], "common": [], "other": []},
                    "object_type": "Planet",
                    "coordinates": {
                        "ra_j2000": {"decimal": ra},
                        "dec_j2000": {"decimal": dec},
                        "constellation": "Various",
                    },
                    "magnitudes": {"v": planet["mag"]},
                    "physical_properties": {},
                    "description": planet["desc"],
                }
            )

        return result

    def search(
        self,
        query: Optional[str] = None,
        object_type: Optional[str] = None,
        min_magnitude: Optional[float] = None,
        max_magnitude: Optional[float] = None,
        above_horizon_only: bool = True,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        elevation: float = 0,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Search the astronomical catalog.

        Returns:
            Search response dict with objects, counts, and location
        """
        catalog_data = self.load_catalog()
        objects = catalog_data.get("objects", [])

        # Observer location for horizon calculations
        observer_location = None
        now = datetime.utcnow()
        lst = None

        if latitude is not None and longitude is not None:
            observer_location = ObserverLocation(
                latitude=latitude, longitude=longitude, elevation=elevation
            )
            lst = self.calculate_local_sidereal_time(longitude, now)

        # Add dynamic celestial objects
        dynamic_objects = []
        dynamic_objects.append(self.calculate_sun_position(now))
        dynamic_objects.append(self.calculate_moon_position(now))
        dynamic_objects.extend(self.get_planet_positions(now))

        # Combine all objects
        all_objects = dynamic_objects + objects

        results = []

        for obj in all_objects:
            try:
                coordinates = obj.get("coordinates", {})
                ra_data = coordinates.get("ra_j2000", {})
                dec_data = coordinates.get("dec_j2000", {})

                if not ra_data or not dec_data:
                    continue

                ra_decimal = ra_data.get("decimal")
                dec_decimal = dec_data.get("decimal")

                if ra_decimal is None or dec_decimal is None:
                    continue

                # Get object details
                name = self.get_object_name(obj)
                obj_type_str = obj.get("object_type", "Unknown")
                constellation = coordinates.get("constellation", "Unknown")
                magnitudes = obj.get("magnitudes", {})
                magnitude = self.get_object_magnitude(magnitudes)
                physical_props = obj.get("physical_properties", {})
                size_arcmin = self.get_object_size(physical_props)

                # Apply filters
                if query and not self.matches_search_query(obj, query):
                    continue

                if object_type and obj_type_str != object_type:
                    continue

                if magnitude is not None:
                    if min_magnitude is not None and magnitude < min_magnitude:
                        continue
                    if max_magnitude is not None and magnitude > max_magnitude:
                        continue

                # For initial display (no query), only show objects with magnitude ≤ 6.0
                if not query:
                    if magnitude is None or magnitude > 6.0:
                        continue

                # Calculate horizon position
                altitude = None
                azimuth = None
                above_horizon = True

                if observer_location and lst is not None:
                    ra_hours = ra_decimal / 15.0
                    altitude, azimuth = self.calculate_altitude_azimuth(
                        ra_hours, dec_decimal, observer_location.latitude, lst
                    )
                    above_horizon = altitude > 0

                    # Filter by horizon if requested
                    if (
                        above_horizon_only
                        and not above_horizon
                        and not query
                        and obj.get("id") != "sun"
                    ):
                        continue

                # Create result object
                moon_phase = obj.get("_moon_phase") if obj.get("id") == "moon" else None

                celestial_obj = CelestialObject(
                    id=obj.get("id", ""),
                    name=name,
                    object_type=obj_type_str,
                    ra_decimal=ra_decimal,
                    dec_decimal=dec_decimal,
                    magnitude=magnitude,
                    constellation=constellation,
                    altitude=altitude,
                    azimuth=azimuth,
                    above_horizon=above_horizon,
                    size_arcmin=size_arcmin,
                    moon_phase=moon_phase,
                    description=obj.get("description"),
                )

                results.append(celestial_obj)

            except Exception as e:
                print(f"Error processing object {obj.get('id', 'unknown')}: {e}")
                continue

        # Sort by magnitude (brightest first)
        results.sort(key=lambda x: x.magnitude if x.magnitude is not None else 999)

        # Apply limit
        results = results[:limit]

        return {
            "objects": [obj.model_dump() for obj in results],
            "total_count": len(all_objects),
            "filtered_count": len(results),
            "observer_location": observer_location.model_dump() if observer_location else None,
        }

    def quick_search(self, query: str, limit: int = 20) -> dict[str, Any]:
        """Quick search for autocomplete/suggestions."""
        return self.search(
            query=query,
            above_horizon_only=False,
            limit=limit,
        )

    def get_object_types(self) -> dict[str, int]:
        """Get available object types with counts."""
        catalog_data = self.load_catalog()
        objects = catalog_data.get("objects", [])

        type_counts: dict[str, int] = {}
        for obj in objects:
            obj_type = obj.get("object_type", "Unknown")
            type_counts[obj_type] = type_counts.get(obj_type, 0) + 1

        return type_counts

    def get_solar_system_objects(
        self,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> list[dict[str, Any]]:
        """Get current positions of solar system objects."""
        now = datetime.utcnow()

        objects = []
        objects.append(self.calculate_sun_position(now))
        objects.append(self.calculate_moon_position(now))
        objects.extend(self.get_planet_positions(now))

        # Calculate altitude/azimuth if location provided
        if latitude is not None and longitude is not None:
            lst = self.calculate_local_sidereal_time(longitude, now)

            for obj in objects:
                ra_decimal = obj["coordinates"]["ra_j2000"]["decimal"]
                dec_decimal = obj["coordinates"]["dec_j2000"]["decimal"]
                ra_hours = ra_decimal / 15.0

                altitude, azimuth = self.calculate_altitude_azimuth(
                    ra_hours, dec_decimal, latitude, lst
                )

                obj["altitude"] = altitude
                obj["azimuth"] = azimuth
                obj["above_horizon"] = altitude > 0

        return objects


# Synchronous wrapper for PyO3
_catalog_service: Optional[CatalogService] = None


def get_catalog_service() -> CatalogService:
    """Get or create the catalog service singleton."""
    global _catalog_service
    if _catalog_service is None:
        _catalog_service = CatalogService()
    return _catalog_service


def catalog_search(
    query: Optional[str] = None,
    object_type: Optional[str] = None,
    min_magnitude: Optional[float] = None,
    max_magnitude: Optional[float] = None,
    above_horizon_only: bool = True,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    elevation: float = 0,
    limit: int = 100,
) -> dict[str, Any]:
    """Search the catalog (for PyO3 calls)."""
    service = get_catalog_service()
    return service.search(
        query=query,
        object_type=object_type,
        min_magnitude=min_magnitude,
        max_magnitude=max_magnitude,
        above_horizon_only=above_horizon_only,
        latitude=latitude,
        longitude=longitude,
        elevation=elevation,
        limit=limit,
    )


def catalog_quick_search(query: str, limit: int = 20) -> dict[str, Any]:
    """Quick search for autocomplete (for PyO3 calls)."""
    service = get_catalog_service()
    return service.quick_search(query=query, limit=limit)


def catalog_get_object_types() -> dict[str, int]:
    """Get object types with counts (for PyO3 calls)."""
    service = get_catalog_service()
    return service.get_object_types()


def catalog_get_solar_system(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> list[dict[str, Any]]:
    """Get solar system objects (for PyO3 calls)."""
    service = get_catalog_service()
    return service.get_solar_system_objects(latitude=latitude, longitude=longitude)
