"""
Catalog service for searching celestial objects.
Provides access to Messier, NGC, IC, and other catalogs.
"""
import json
import math
from typing import Optional, List, Dict, Any
from pathlib import Path
from datetime import datetime

# Try to import astronomy dependencies
try:
    from astropy.coordinates import SkyCoord, EarthLocation, AltAz
    from astropy.time import Time
    import astropy.units as u
    HAS_ASTROPY = True
except ImportError:
    HAS_ASTROPY = False


# Built-in catalog data (subset of common objects)
MESSIER_CATALOG = [
    {"id": "M1", "name": "Crab Nebula", "type": "supernova_remnant", "ra": 83.633, "dec": 22.014, "magnitude": 8.4, "constellation": "Taurus"},
    {"id": "M13", "name": "Hercules Cluster", "type": "globular_cluster", "ra": 250.423, "dec": 36.461, "magnitude": 5.8, "constellation": "Hercules"},
    {"id": "M27", "name": "Dumbbell Nebula", "type": "planetary_nebula", "ra": 299.901, "dec": 22.721, "magnitude": 7.5, "constellation": "Vulpecula"},
    {"id": "M31", "name": "Andromeda Galaxy", "type": "galaxy", "ra": 10.685, "dec": 41.269, "magnitude": 3.4, "constellation": "Andromeda"},
    {"id": "M33", "name": "Triangulum Galaxy", "type": "galaxy", "ra": 23.462, "dec": 30.660, "magnitude": 5.7, "constellation": "Triangulum"},
    {"id": "M42", "name": "Orion Nebula", "type": "emission_nebula", "ra": 83.822, "dec": -5.391, "magnitude": 4.0, "constellation": "Orion"},
    {"id": "M45", "name": "Pleiades", "type": "open_cluster", "ra": 56.601, "dec": 24.114, "magnitude": 1.6, "constellation": "Taurus"},
    {"id": "M51", "name": "Whirlpool Galaxy", "type": "galaxy", "ra": 202.470, "dec": 47.195, "magnitude": 8.4, "constellation": "Canes Venatici"},
    {"id": "M57", "name": "Ring Nebula", "type": "planetary_nebula", "ra": 283.396, "dec": 33.029, "magnitude": 8.8, "constellation": "Lyra"},
    {"id": "M81", "name": "Bode's Galaxy", "type": "galaxy", "ra": 148.888, "dec": 69.065, "magnitude": 6.9, "constellation": "Ursa Major"},
    {"id": "M82", "name": "Cigar Galaxy", "type": "galaxy", "ra": 148.968, "dec": 69.680, "magnitude": 8.4, "constellation": "Ursa Major"},
    {"id": "M101", "name": "Pinwheel Galaxy", "type": "galaxy", "ra": 210.802, "dec": 54.349, "magnitude": 7.9, "constellation": "Ursa Major"},
    {"id": "M104", "name": "Sombrero Galaxy", "type": "galaxy", "ra": 189.998, "dec": -11.623, "magnitude": 8.0, "constellation": "Virgo"},
    {"id": "M110", "name": "M110", "type": "galaxy", "ra": 10.092, "dec": 41.685, "magnitude": 8.5, "constellation": "Andromeda"},
]

NGC_CATALOG = [
    {"id": "NGC7000", "name": "North America Nebula", "type": "emission_nebula", "ra": 314.75, "dec": 44.35, "magnitude": 4.0, "constellation": "Cygnus"},
    {"id": "NGC6992", "name": "Veil Nebula (East)", "type": "supernova_remnant", "ra": 312.75, "dec": 31.72, "magnitude": 7.0, "constellation": "Cygnus"},
    {"id": "NGC6960", "name": "Veil Nebula (West)", "type": "supernova_remnant", "ra": 311.42, "dec": 30.72, "magnitude": 7.0, "constellation": "Cygnus"},
    {"id": "NGC2237", "name": "Rosette Nebula", "type": "emission_nebula", "ra": 97.97, "dec": 5.05, "magnitude": 9.0, "constellation": "Monoceros"},
    {"id": "NGC2024", "name": "Flame Nebula", "type": "emission_nebula", "ra": 85.42, "dec": -1.85, "magnitude": 10.0, "constellation": "Orion"},
    {"id": "NGC1499", "name": "California Nebula", "type": "emission_nebula", "ra": 60.21, "dec": 36.62, "magnitude": 5.0, "constellation": "Perseus"},
    {"id": "NGC6543", "name": "Cat's Eye Nebula", "type": "planetary_nebula", "ra": 269.64, "dec": 66.63, "magnitude": 8.1, "constellation": "Draco"},
    {"id": "NGC7293", "name": "Helix Nebula", "type": "planetary_nebula", "ra": 337.41, "dec": -20.84, "magnitude": 7.6, "constellation": "Aquarius"},
    {"id": "NGC869", "name": "Double Cluster (h)", "type": "open_cluster", "ra": 35.05, "dec": 57.13, "magnitude": 4.3, "constellation": "Perseus"},
    {"id": "NGC884", "name": "Double Cluster (chi)", "type": "open_cluster", "ra": 35.60, "dec": 57.15, "magnitude": 4.4, "constellation": "Perseus"},
]

SOLAR_SYSTEM = [
    {"id": "sun", "name": "Sun", "type": "sun"},
    {"id": "moon", "name": "Moon", "type": "moon"},
    {"id": "mercury", "name": "Mercury", "type": "planet"},
    {"id": "venus", "name": "Venus", "type": "planet"},
    {"id": "mars", "name": "Mars", "type": "planet"},
    {"id": "jupiter", "name": "Jupiter", "type": "planet"},
    {"id": "saturn", "name": "Saturn", "type": "planet"},
    {"id": "uranus", "name": "Uranus", "type": "planet"},
    {"id": "neptune", "name": "Neptune", "type": "planet"},
]

OBJECT_TYPES = [
    {"id": "galaxy", "name": "Galaxy", "count": 5},
    {"id": "emission_nebula", "name": "Emission Nebula", "count": 4},
    {"id": "planetary_nebula", "name": "Planetary Nebula", "count": 3},
    {"id": "supernova_remnant", "name": "Supernova Remnant", "count": 3},
    {"id": "open_cluster", "name": "Open Cluster", "count": 3},
    {"id": "globular_cluster", "name": "Globular Cluster", "count": 1},
]


class CatalogService:
    """Service for searching celestial object catalogs."""

    def __init__(self, catalog_path: Optional[str] = None):
        self.catalog_path = Path(catalog_path) if catalog_path else None
        self._all_objects = MESSIER_CATALOG + NGC_CATALOG

    def search(
        self,
        query: str = "",
        object_type: Optional[str] = None,
        min_magnitude: Optional[float] = None,
        max_magnitude: Optional[float] = None,
        above_horizon_only: bool = False,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Search catalog with filters."""
        results = []

        for obj in self._all_objects:
            # Query filter
            if query:
                query_lower = query.lower()
                if not (
                    query_lower in obj["id"].lower() or
                    query_lower in obj["name"].lower() or
                    query_lower in obj.get("constellation", "").lower()
                ):
                    continue

            # Type filter
            if object_type and obj["type"] != object_type:
                continue

            # Magnitude filter
            mag = obj.get("magnitude")
            if mag is not None:
                if min_magnitude is not None and mag < min_magnitude:
                    continue
                if max_magnitude is not None and mag > max_magnitude:
                    continue

            # Calculate altitude/azimuth if location provided
            result = {
                "id": obj["id"],
                "name": obj["name"],
                "object_type": obj["type"],
                "ra_decimal": obj["ra"],
                "dec_decimal": obj["dec"],
                "magnitude": obj.get("magnitude"),
                "constellation": obj.get("constellation", ""),
                "above_horizon": True,  # Default
                "altitude": None,
                "azimuth": None,
            }

            if latitude is not None and longitude is not None and HAS_ASTROPY:
                alt, az = self._calculate_alt_az(obj["ra"], obj["dec"], latitude, longitude)
                result["altitude"] = alt
                result["azimuth"] = az
                result["above_horizon"] = alt > 0

                if above_horizon_only and alt <= 0:
                    continue

            results.append(result)

            if len(results) >= limit:
                break

        return results

    def quick_search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Quick search by name/ID only."""
        return self.search(query=query, limit=limit)

    def get_object_types(self) -> List[Dict[str, Any]]:
        """Get available object types."""
        return OBJECT_TYPES

    def get_solar_system_objects(
        self,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """Get solar system objects with current positions."""
        results = []

        for obj in SOLAR_SYSTEM:
            result = {
                "id": obj["id"],
                "name": obj["name"],
                "object_type": obj["type"],
                "ra_decimal": 0.0,  # Would be calculated from ephemeris
                "dec_decimal": 0.0,
                "above_horizon": True,
                "altitude": None,
                "azimuth": None,
            }

            # In a real implementation, we would calculate positions using astropy
            # For now, return placeholder data
            if HAS_ASTROPY and latitude is not None and longitude is not None:
                try:
                    from astropy.coordinates import get_body
                    location = EarthLocation(lat=latitude * u.deg, lon=longitude * u.deg)
                    time = Time.now()

                    if obj["id"] in ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]:
                        body = get_body(obj["id"], time, location)
                        altaz = body.transform_to(AltAz(obstime=time, location=location))

                        result["ra_decimal"] = body.ra.deg
                        result["dec_decimal"] = body.dec.deg
                        result["altitude"] = altaz.alt.deg
                        result["azimuth"] = altaz.az.deg
                        result["above_horizon"] = altaz.alt.deg > 0
                except Exception:
                    pass

            results.append(result)

        return results

    def _calculate_alt_az(
        self,
        ra: float,
        dec: float,
        latitude: float,
        longitude: float
    ) -> tuple:
        """Calculate altitude and azimuth for a celestial position."""
        if not HAS_ASTROPY:
            return (45.0, 180.0)  # Default values

        try:
            coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
            location = EarthLocation(lat=latitude * u.deg, lon=longitude * u.deg)
            time = Time.now()
            altaz = coord.transform_to(AltAz(obstime=time, location=location))
            return (altaz.alt.deg, altaz.az.deg)
        except Exception:
            return (45.0, 180.0)


# Global service instance
_service: Optional[CatalogService] = None


def _get_service() -> CatalogService:
    global _service
    if _service is None:
        _service = CatalogService()
    return _service


def search_objects(
    query: str = "",
    object_type: Optional[str] = None,
    min_magnitude: Optional[float] = None,
    max_magnitude: Optional[float] = None,
    above_horizon_only: bool = False,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    limit: int = 50
) -> str:
    """Search catalog and return JSON result."""
    results = _get_service().search(
        query=query,
        object_type=object_type,
        min_magnitude=min_magnitude,
        max_magnitude=max_magnitude,
        above_horizon_only=above_horizon_only,
        latitude=latitude,
        longitude=longitude,
        limit=limit
    )
    return json.dumps(results)


def quick_search(query: str, limit: int = 10) -> str:
    """Quick search and return JSON result."""
    results = _get_service().quick_search(query, limit)
    return json.dumps(results)


def get_object_types() -> str:
    """Get object types as JSON."""
    return json.dumps(_get_service().get_object_types())


def get_solar_system_objects(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> str:
    """Get solar system objects as JSON."""
    results = _get_service().get_solar_system_objects(latitude, longitude)
    return json.dumps(results)
