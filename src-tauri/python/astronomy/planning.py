"""
Observation planning utilities using astroplan
"""

from datetime import datetime
from typing import List, Dict
from astropy.time import Time
from astropy.coordinates import SkyCoord, EarthLocation
from astropy import units as u
from astroplan import Observer, FixedTarget
from pydantic import BaseModel, Field


class ObserverLocation(BaseModel):
    """Observer location model"""

    latitude: float = Field(..., description="Latitude in degrees")
    longitude: float = Field(..., description="Longitude in degrees")
    elevation: float = Field(0.0, description="Elevation in meters")
    timezone: str = Field("UTC", description="Timezone string")


class Target(BaseModel):
    """Target object model"""

    name: str = Field(..., description="Target name")
    ra: float = Field(..., description="Right Ascension in degrees")
    dec: float = Field(..., description="Declination in degrees")


class ObservationPlanner:
    """Plan observation sessions"""

    @staticmethod
    def is_target_observable(
        target: Target, observer_loc: ObserverLocation, time: str, min_altitude: float = 30.0
    ) -> bool:
        """
        Check if a target is observable at a given time

        Args:
            target: Target to observe
            observer_loc: Observer location
            time: Time in ISO format
            min_altitude: Minimum altitude in degrees

        Returns:
            True if observable, False otherwise
        """
        location = EarthLocation(
            lat=observer_loc.latitude * u.deg,
            lon=observer_loc.longitude * u.deg,
            height=observer_loc.elevation * u.m,
        )

        observer = Observer(location=location, timezone=observer_loc.timezone)

        sky_coord = SkyCoord(
            ra=target.ra * u.deg,
            dec=target.dec * u.deg,
            frame="icrs",
        )
        fixed_target = FixedTarget(coord=sky_coord, name=target.name)

        obs_time = Time(time)

        # Check if target is above minimum altitude
        altitude = observer.altaz(obs_time, fixed_target).alt.deg

        return altitude >= min_altitude

    @staticmethod
    def get_target_visibility_window(
        target: Target,
        observer_loc: ObserverLocation,
        start_time: str,
        end_time: str,
        min_altitude: float = 30.0,
    ) -> Dict[str, bool]:
        """
        Get visibility window for a target

        Args:
            target: Target to observe
            observer_loc: Observer location
            start_time: Start time in ISO format
            end_time: End time in ISO format
            min_altitude: Minimum altitude in degrees

        Returns:
            Dictionary with visibility information
        """
        location = EarthLocation(
            lat=observer_loc.latitude * u.deg,
            lon=observer_loc.longitude * u.deg,
            height=observer_loc.elevation * u.m,
        )

        observer = Observer(location=location, timezone=observer_loc.timezone)

        sky_coord = SkyCoord(
            ra=target.ra * u.deg,
            dec=target.dec * u.deg,
            frame="icrs",
        )
        fixed_target = FixedTarget(coord=sky_coord, name=target.name)

        start = Time(start_time)
        end = Time(end_time)

        # Simple check: is target observable at any point in the window?
        # More sophisticated implementation could return actual rise/set times
        mid_time = start + (end - start) / 2
        altitude = observer.altaz(mid_time, fixed_target).alt.deg

        return {
            "observable": altitude >= min_altitude,
            "altitude_at_midpoint": altitude,
        }
