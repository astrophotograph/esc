"""
Coordinate transformation utilities using astropy
"""

from typing import Tuple
from astropy import units as u
from astropy.coordinates import SkyCoord, EarthLocation, AltAz, ICRS
from astropy.time import Time
from pydantic import BaseModel, Field


class CoordinateInput(BaseModel):
    """Input model for coordinate transformations"""

    ra: float = Field(..., description="Right Ascension in degrees")
    dec: float = Field(..., description="Declination in degrees")
    latitude: float = Field(..., description="Observer latitude in degrees")
    longitude: float = Field(..., description="Observer longitude in degrees")
    elevation: float = Field(0.0, description="Observer elevation in meters")
    time: str = Field(..., description="Observation time in ISO format")


class AltAzOutput(BaseModel):
    """Output model for Alt-Az coordinates"""

    altitude: float = Field(..., description="Altitude in degrees")
    azimuth: float = Field(..., description="Azimuth in degrees")


class CoordinateTransformer:
    """Handles astronomical coordinate transformations"""

    @staticmethod
    def radec_to_altaz(coord_input: CoordinateInput) -> AltAzOutput:
        """
        Convert RA/Dec to Alt/Az for a given location and time

        Args:
            coord_input: Coordinate input parameters

        Returns:
            Alt/Az coordinates
        """
        # Create observer location
        location = EarthLocation(
            lat=coord_input.latitude * u.deg,
            lon=coord_input.longitude * u.deg,
            height=coord_input.elevation * u.m,
        )

        # Create sky coordinate
        sky_coord = SkyCoord(
            ra=coord_input.ra * u.deg,
            dec=coord_input.dec * u.deg,
            frame="icrs",
        )

        # Create observation time
        obs_time = Time(coord_input.time)

        # Transform to Alt/Az
        altaz_frame = AltAz(obstime=obs_time, location=location)
        altaz_coord = sky_coord.transform_to(altaz_frame)

        return AltAzOutput(
            altitude=altaz_coord.alt.deg,
            azimuth=altaz_coord.az.deg,
        )

    @staticmethod
    def altaz_to_radec(
        alt: float, az: float, latitude: float, longitude: float, elevation: float, time: str
    ) -> Tuple[float, float]:
        """
        Convert Alt/Az to RA/Dec for a given location and time

        Args:
            alt: Altitude in degrees
            az: Azimuth in degrees
            latitude: Observer latitude in degrees
            longitude: Observer longitude in degrees
            elevation: Observer elevation in meters
            time: Observation time in ISO format

        Returns:
            Tuple of (ra, dec) in degrees
        """
        location = EarthLocation(
            lat=latitude * u.deg,
            lon=longitude * u.deg,
            height=elevation * u.m,
        )

        obs_time = Time(time)
        altaz_frame = AltAz(obstime=obs_time, location=location)

        altaz_coord = SkyCoord(
            alt=alt * u.deg,
            az=az * u.deg,
            frame=altaz_frame,
        )

        icrs_coord = altaz_coord.transform_to(ICRS())

        return (icrs_coord.ra.deg, icrs_coord.dec.deg)
