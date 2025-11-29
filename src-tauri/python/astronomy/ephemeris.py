"""
Ephemeris calculations for solar system objects
"""

from datetime import datetime
from typing import Dict
from astropy.time import Time
from astropy.coordinates import get_sun, SkyCoord, EarthLocation
from astropy.coordinates.solar_system import get_body
from pydantic import BaseModel, Field


class EphemerisInput(BaseModel):
    """Input for ephemeris calculations"""

    latitude: float = Field(..., description="Observer latitude in degrees")
    longitude: float = Field(..., description="Observer longitude in degrees")
    elevation: float = Field(0.0, description="Observer elevation in meters")
    time: str = Field(..., description="Time in ISO format")


class EphemerisCalculator:
    """Calculate ephemeris for solar system objects"""

    @staticmethod
    def get_sun_position(ephemeris_input: EphemerisInput) -> Dict[str, float]:
        """
        Get the Sun's position for a given time and location

        Args:
            ephemeris_input: Ephemeris input parameters

        Returns:
            Dictionary with RA, Dec, Alt, Az of the Sun
        """
        from astropy.coordinates import AltAz
        from astropy import units as u

        obs_time = Time(ephemeris_input.time)
        location = EarthLocation(
            lat=ephemeris_input.latitude * u.deg,
            lon=ephemeris_input.longitude * u.deg,
            height=ephemeris_input.elevation * u.m,
        )

        sun = get_sun(obs_time)
        altaz_frame = AltAz(obstime=obs_time, location=location)
        sun_altaz = sun.transform_to(altaz_frame)

        return {
            "ra": sun.ra.deg,
            "dec": sun.dec.deg,
            "altitude": sun_altaz.alt.deg,
            "azimuth": sun_altaz.az.deg,
        }

    @staticmethod
    def get_moon_position(ephemeris_input: EphemerisInput) -> Dict[str, float]:
        """
        Get the Moon's position for a given time and location

        Args:
            ephemeris_input: Ephemeris input parameters

        Returns:
            Dictionary with RA, Dec, Alt, Az of the Moon
        """
        from astropy.coordinates import AltAz
        from astropy import units as u

        obs_time = Time(ephemeris_input.time)
        location = EarthLocation(
            lat=ephemeris_input.latitude * u.deg,
            lon=ephemeris_input.longitude * u.deg,
            height=ephemeris_input.elevation * u.m,
        )

        moon = get_body('moon', obs_time, location=location)
        altaz_frame = AltAz(obstime=obs_time, location=location)
        moon_altaz = moon.transform_to(altaz_frame)

        return {
            "ra": moon.ra.deg,
            "dec": moon.dec.deg,
            "altitude": moon_altaz.alt.deg,
            "azimuth": moon_altaz.az.deg,
        }
