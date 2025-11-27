"""Planning service for observation sessions and visibility calculations.

This module provides planning features for telescope observation sessions.
"""

import math
from datetime import datetime, timedelta
from typing import Any, Optional

from pydantic import BaseModel, Field


class ObserverLocation(BaseModel):
    """Observer location for calculations."""

    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees")
    elevation: float = Field(default=0, description="Elevation in meters")


class TargetInfo(BaseModel):
    """Target object information."""

    name: str
    ra: float  # Right ascension in degrees
    dec: float  # Declination in degrees
    magnitude: Optional[float] = None
    object_type: Optional[str] = None


class VisibilityInfo(BaseModel):
    """Visibility information for a target."""

    target_name: str
    is_visible: bool
    altitude: float
    azimuth: float
    rise_time: Optional[str] = None
    set_time: Optional[str] = None
    transit_time: Optional[str] = None
    transit_altitude: Optional[float] = None
    best_time: Optional[str] = None
    hours_visible: Optional[float] = None


class SessionCreate(BaseModel):
    """Session creation parameters."""

    name: str
    telescope_id: Optional[str] = None
    location_lat: Optional[float] = None
    location_lon: Optional[float] = None
    notes: Optional[str] = None
    targets: list[str] = []


class Session(BaseModel):
    """Observation session."""

    id: str
    name: str
    telescope_id: Optional[str] = None
    started_at: str
    ended_at: Optional[str] = None
    location_lat: Optional[float] = None
    location_lon: Optional[float] = None
    notes: Optional[str] = None


class PlanningService:
    """Service for observation planning."""

    @staticmethod
    def calculate_local_sidereal_time(longitude: float, utc_datetime: datetime) -> float:
        """Calculate Local Sidereal Time in decimal hours."""
        jd = (
            utc_datetime - datetime(2000, 1, 1, 12, 0, 0)
        ).total_seconds() / 86400.0 + 2451545.0

        gst = 18.697374558 + 24.06570982441908 * (jd - 2451545.0)
        gst = gst % 24.0

        lst = gst + longitude / 15.0
        return lst % 24.0

    @staticmethod
    def calculate_altitude_azimuth(
        ra_hours: float, dec_degrees: float, latitude: float, lst_hours: float
    ) -> tuple[float, float]:
        """Calculate altitude and azimuth."""
        dec_rad = math.radians(dec_degrees)
        lat_rad = math.radians(latitude)

        ha_hours = lst_hours - ra_hours
        ha_rad = math.radians(ha_hours * 15.0)

        sin_alt = math.sin(dec_rad) * math.sin(lat_rad) + math.cos(dec_rad) * math.cos(
            lat_rad
        ) * math.cos(ha_rad)

        # Clamp to valid range
        sin_alt = max(-1.0, min(1.0, sin_alt))
        altitude = math.degrees(math.asin(sin_alt))

        # Calculate azimuth
        if abs(math.cos(math.radians(altitude))) < 1e-10:
            # Near zenith, azimuth is undefined
            azimuth = 0.0
        else:
            cos_az = (math.sin(dec_rad) - math.sin(lat_rad) * sin_alt) / (
                math.cos(lat_rad) * math.cos(math.radians(altitude))
            )
            cos_az = max(-1.0, min(1.0, cos_az))

            azimuth = math.degrees(math.acos(cos_az))
            if math.sin(ha_rad) > 0:
                azimuth = 360.0 - azimuth

        return altitude, azimuth

    @staticmethod
    def get_sun_altitude(
        latitude: float, longitude: float, utc_datetime: datetime
    ) -> float:
        """Calculate Sun altitude for determining darkness."""
        j2000 = datetime(2000, 1, 1, 12, 0, 0)
        jd = (utc_datetime - j2000).total_seconds() / 86400.0 + 2451545.0
        T = (jd - 2451545.0) / 36525.0

        L0 = (280.46646 + 36000.76983 * T) % 360
        M = (357.52911 + 35999.05029 * T) % 360
        M_rad = math.radians(M)

        C = (
            (1.914602 - 0.004817 * T) * math.sin(M_rad)
            + 0.019993 * math.sin(2 * M_rad)
        )

        L = L0 + C
        epsilon = 23.439291 - 0.0130042 * T
        epsilon_rad = math.radians(epsilon)
        lambda_rad = math.radians(L)

        ra = math.degrees(
            math.atan2(math.cos(epsilon_rad) * math.sin(lambda_rad), math.cos(lambda_rad))
        )
        if ra < 0:
            ra += 360
        dec = math.degrees(math.asin(math.sin(epsilon_rad) * math.sin(lambda_rad)))

        lst = PlanningService.calculate_local_sidereal_time(longitude, utc_datetime)
        ra_hours = ra / 15.0

        altitude, _ = PlanningService.calculate_altitude_azimuth(
            ra_hours, dec, latitude, lst
        )
        return altitude

    @staticmethod
    def is_astronomical_dark(
        latitude: float, longitude: float, utc_datetime: datetime
    ) -> bool:
        """Check if it's astronomically dark (Sun below -18 degrees)."""
        sun_alt = PlanningService.get_sun_altitude(latitude, longitude, utc_datetime)
        return sun_alt < -18.0

    def get_target_visibility(
        self,
        target: TargetInfo,
        location: ObserverLocation,
        date: Optional[str] = None,
        min_altitude: float = 20.0,
    ) -> dict[str, Any]:
        """Get visibility information for a target.

        Args:
            target: Target object
            location: Observer location
            date: Date string (YYYY-MM-DD), defaults to today
            min_altitude: Minimum altitude in degrees

        Returns:
            Visibility information
        """
        if date:
            base_date = datetime.strptime(date, "%Y-%m-%d")
        else:
            base_date = datetime.utcnow().replace(hour=12, minute=0, second=0, microsecond=0)

        # Calculate for the night (6 PM to 6 AM local time approximation)
        # Using UTC for simplicity
        start_time = base_date + timedelta(hours=18)
        end_time = base_date + timedelta(hours=30)  # Next day 6 AM

        ra_hours = target.ra / 15.0

        # Find rise, set, and transit times
        best_altitude = -90.0
        best_time = None
        rise_time = None
        set_time = None
        total_visible_hours = 0.0

        # Sample every 15 minutes
        current_time = start_time
        was_visible = False

        while current_time <= end_time:
            lst = self.calculate_local_sidereal_time(location.longitude, current_time)
            altitude, azimuth = self.calculate_altitude_azimuth(
                ra_hours, target.dec, location.latitude, lst
            )

            is_visible = altitude >= min_altitude

            # Track rise time
            if is_visible and not was_visible and rise_time is None:
                rise_time = current_time.isoformat()

            # Track set time
            if not is_visible and was_visible:
                set_time = current_time.isoformat()

            # Track best time (highest altitude)
            if altitude > best_altitude:
                best_altitude = altitude
                best_time = current_time.isoformat()

            if is_visible:
                total_visible_hours += 0.25  # 15 minutes

            was_visible = is_visible
            current_time += timedelta(minutes=15)

        # Calculate current position
        now = datetime.utcnow()
        lst_now = self.calculate_local_sidereal_time(location.longitude, now)
        current_alt, current_az = self.calculate_altitude_azimuth(
            ra_hours, target.dec, location.latitude, lst_now
        )

        return {
            "target_name": target.name,
            "is_visible": current_alt >= min_altitude,
            "altitude": current_alt,
            "azimuth": current_az,
            "rise_time": rise_time,
            "set_time": set_time,
            "transit_altitude": best_altitude,
            "best_time": best_time,
            "hours_visible": total_visible_hours,
        }

    def get_tonight_targets(
        self,
        catalog_objects: list[dict[str, Any]],
        location: ObserverLocation,
        limit: int = 20,
        min_altitude: float = 30.0,
    ) -> list[dict[str, Any]]:
        """Get recommended targets for tonight.

        Args:
            catalog_objects: List of catalog objects to check
            location: Observer location
            limit: Maximum number of targets to return
            min_altitude: Minimum altitude for visibility

        Returns:
            List of recommended targets sorted by visibility
        """
        now = datetime.utcnow()
        lst = self.calculate_local_sidereal_time(location.longitude, now)

        targets = []

        for obj in catalog_objects:
            try:
                ra_decimal = obj.get("ra_decimal") or obj.get("coordinates", {}).get(
                    "ra_j2000", {}
                ).get("decimal")
                dec_decimal = obj.get("dec_decimal") or obj.get("coordinates", {}).get(
                    "dec_j2000", {}
                ).get("decimal")

                if ra_decimal is None or dec_decimal is None:
                    continue

                ra_hours = ra_decimal / 15.0
                altitude, azimuth = self.calculate_altitude_azimuth(
                    ra_hours, dec_decimal, location.latitude, lst
                )

                if altitude >= min_altitude:
                    targets.append(
                        {
                            "id": obj.get("id"),
                            "name": obj.get("name"),
                            "object_type": obj.get("object_type"),
                            "magnitude": obj.get("magnitude"),
                            "altitude": altitude,
                            "azimuth": azimuth,
                            "constellation": obj.get("constellation"),
                        }
                    )

            except Exception:
                continue

        # Sort by altitude (highest first) then by magnitude (brightest first)
        targets.sort(
            key=lambda x: (-(x.get("altitude") or 0), x.get("magnitude") or 999)
        )

        return targets[:limit]


# Singleton instance
_planning_service: Optional[PlanningService] = None


def get_planning_service() -> PlanningService:
    """Get or create the planning service singleton."""
    global _planning_service
    if _planning_service is None:
        _planning_service = PlanningService()
    return _planning_service


# PyO3-compatible functions
def get_target_visibility(
    target_name: str,
    ra: float,
    dec: float,
    latitude: float,
    longitude: float,
    elevation: float = 0,
    date: Optional[str] = None,
    min_altitude: float = 20.0,
) -> dict[str, Any]:
    """Get visibility for a target (PyO3 wrapper)."""
    service = get_planning_service()
    target = TargetInfo(name=target_name, ra=ra, dec=dec)
    location = ObserverLocation(latitude=latitude, longitude=longitude, elevation=elevation)
    return service.get_target_visibility(target, location, date, min_altitude)


def get_tonight_targets(
    catalog_objects: list[dict[str, Any]],
    latitude: float,
    longitude: float,
    elevation: float = 0,
    limit: int = 20,
    min_altitude: float = 30.0,
) -> list[dict[str, Any]]:
    """Get tonight's recommended targets (PyO3 wrapper)."""
    service = get_planning_service()
    location = ObserverLocation(latitude=latitude, longitude=longitude, elevation=elevation)
    return service.get_tonight_targets(catalog_objects, location, limit, min_altitude)


def create_session(
    name: str,
    telescope_id: Optional[str] = None,
    location_lat: Optional[float] = None,
    location_lon: Optional[float] = None,
    notes: Optional[str] = None,
) -> dict[str, Any]:
    """Create a new session (returns session data for DB storage)."""
    import uuid
    from datetime import datetime

    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    return {
        "id": session_id,
        "name": name,
        "telescope_id": telescope_id,
        "started_at": now,
        "ended_at": None,
        "location_lat": location_lat,
        "location_lon": location_lon,
        "notes": notes,
        "created_at": now,
    }


def get_sessions() -> list[dict[str, Any]]:
    """Get sessions (placeholder - actual data from DB)."""
    # This would be called from Rust with DB data
    return []


def update_session(
    session_id: str,
    ended_at: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict[str, Any]:
    """Update session fields (returns update data)."""
    updates = {"id": session_id}
    if ended_at:
        updates["ended_at"] = ended_at
    if notes is not None:
        updates["notes"] = notes
    return updates
