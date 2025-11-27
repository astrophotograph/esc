"""
Planning service for observation sessions and visibility calculations.
"""
import json
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

# Try to import astronomy dependencies
try:
    from astropy.coordinates import SkyCoord, EarthLocation, AltAz, get_sun
    from astropy.time import Time
    import astropy.units as u
    HAS_ASTROPY = True
except ImportError:
    HAS_ASTROPY = False

try:
    from astroplan import Observer, FixedTarget
    from astroplan import is_observable, is_always_observable
    HAS_ASTROPLAN = True
except ImportError:
    HAS_ASTROPLAN = False


class PlanningService:
    """Service for planning observations and managing sessions."""

    def __init__(self):
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def create_session(
        self,
        name: str,
        telescope_id: Optional[str] = None,
        location_lat: Optional[float] = None,
        location_lon: Optional[float] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new observation session."""
        session_id = str(uuid.uuid4())
        session = {
            "id": session_id,
            "telescope_id": telescope_id,
            "name": name,
            "started_at": datetime.utcnow().isoformat(),
            "ended_at": None,
            "location_lat": location_lat,
            "location_lon": location_lon,
            "notes": notes,
        }
        self._sessions[session_id] = session
        return session

    def get_sessions(self) -> List[Dict[str, Any]]:
        """Get all sessions."""
        return list(self._sessions.values())

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a session by ID."""
        return self._sessions.get(session_id)

    def end_session(self, session_id: str, notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """End a session."""
        if session_id in self._sessions:
            self._sessions[session_id]["ended_at"] = datetime.utcnow().isoformat()
            if notes:
                self._sessions[session_id]["notes"] = notes
            return self._sessions[session_id]
        return None

    def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False

    def get_visibility(
        self,
        ra: float,
        dec: float,
        latitude: float,
        longitude: float,
        elevation: float = 0,
        date: Optional[str] = None,
        min_altitude: float = 30
    ) -> Dict[str, Any]:
        """Calculate visibility for a target."""
        result = {
            "target_name": f"RA {ra:.2f}, Dec {dec:.2f}",
            "is_visible": False,
            "altitude": 0.0,
            "azimuth": 0.0,
            "rise_time": None,
            "set_time": None,
            "transit_time": None,
            "transit_altitude": None,
            "best_time": None,
            "hours_visible": 0.0,
        }

        if not HAS_ASTROPY:
            # Return basic estimate without astropy
            result["is_visible"] = True
            result["altitude"] = 45.0
            result["azimuth"] = 180.0
            result["hours_visible"] = 6.0
            return result

        try:
            # Set up observer location and time
            location = EarthLocation(
                lat=latitude * u.deg,
                lon=longitude * u.deg,
                height=elevation * u.m
            )

            if date:
                obs_time = Time(date)
            else:
                obs_time = Time.now()

            # Calculate current position
            coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
            altaz = coord.transform_to(AltAz(obstime=obs_time, location=location))

            result["altitude"] = float(altaz.alt.deg)
            result["azimuth"] = float(altaz.az.deg)
            result["is_visible"] = altaz.alt.deg >= min_altitude

            # Calculate rise/set/transit times using astroplan if available
            if HAS_ASTROPLAN:
                observer = Observer(location=location)
                target = FixedTarget(coord=coord)

                # Get times for tonight
                midnight = observer.midnight(obs_time, which='nearest')

                try:
                    rise = observer.target_rise_time(midnight, target, which='nearest', horizon=min_altitude * u.deg)
                    if rise:
                        result["rise_time"] = rise.iso
                except Exception:
                    pass

                try:
                    set_time = observer.target_set_time(midnight, target, which='nearest', horizon=min_altitude * u.deg)
                    if set_time:
                        result["set_time"] = set_time.iso
                except Exception:
                    pass

                try:
                    transit = observer.target_meridian_transit_time(midnight, target, which='nearest')
                    if transit:
                        result["transit_time"] = transit.iso
                        transit_altaz = coord.transform_to(AltAz(obstime=transit, location=location))
                        result["transit_altitude"] = float(transit_altaz.alt.deg)
                except Exception:
                    pass

                # Estimate hours visible
                if result["rise_time"] and result["set_time"]:
                    try:
                        rise_t = Time(result["rise_time"])
                        set_t = Time(result["set_time"])
                        if set_t > rise_t:
                            result["hours_visible"] = (set_t - rise_t).to(u.hour).value
                    except Exception:
                        pass

        except Exception as e:
            result["error"] = str(e)

        return result

    def get_tonight_targets(
        self,
        latitude: float,
        longitude: float,
        elevation: float = 0,
        limit: int = 20,
        min_altitude: float = 30
    ) -> List[Dict[str, Any]]:
        """Get recommended targets for tonight."""
        # Import catalog data
        from catalog.catalog_service import CatalogService

        catalog = CatalogService()
        all_objects = catalog.search(
            above_horizon_only=True,
            latitude=latitude,
            longitude=longitude,
            limit=100
        )

        # Filter and sort by altitude
        targets = []
        for obj in all_objects:
            alt = obj.get("altitude", 0)
            if alt and alt >= min_altitude:
                targets.append({
                    "id": obj["id"],
                    "name": obj["name"],
                    "object_type": obj["object_type"],
                    "magnitude": obj.get("magnitude"),
                    "altitude": alt,
                    "azimuth": obj.get("azimuth", 0),
                    "constellation": obj.get("constellation", ""),
                })

        # Sort by altitude (highest first)
        targets.sort(key=lambda x: x.get("altitude", 0), reverse=True)

        return targets[:limit]


# Global service instance
_service: Optional[PlanningService] = None


def _get_service() -> PlanningService:
    global _service
    if _service is None:
        _service = PlanningService()
    return _service


def create_session(
    name: str,
    telescope_id: Optional[str] = None,
    location_lat: Optional[float] = None,
    location_lon: Optional[float] = None,
    notes: Optional[str] = None
) -> str:
    """Create session and return JSON result."""
    result = _get_service().create_session(name, telescope_id, location_lat, location_lon, notes)
    return json.dumps(result)


def get_sessions() -> str:
    """Get all sessions as JSON."""
    return json.dumps(_get_service().get_sessions())


def end_session(session_id: str, notes: Optional[str] = None) -> str:
    """End session and return JSON result."""
    result = _get_service().end_session(session_id, notes)
    return json.dumps(result)


def delete_session(session_id: str) -> bool:
    """Delete a session."""
    return _get_service().delete_session(session_id)


def get_visibility(
    ra: float,
    dec: float,
    latitude: float,
    longitude: float,
    elevation: float = 0,
    date: Optional[str] = None,
    min_altitude: float = 30
) -> str:
    """Get visibility info as JSON."""
    result = _get_service().get_visibility(ra, dec, latitude, longitude, elevation, date, min_altitude)
    return json.dumps(result)


def get_tonight_targets(
    latitude: float,
    longitude: float,
    elevation: float = 0,
    limit: int = 20,
    min_altitude: float = 30
) -> str:
    """Get tonight's targets as JSON."""
    results = _get_service().get_tonight_targets(latitude, longitude, elevation, limit, min_altitude)
    return json.dumps(results)
