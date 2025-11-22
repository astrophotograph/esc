"""
Tests for astronomy module
"""

import pytest
from datetime import datetime
from astronomy.coordinates import CoordinateTransformer, CoordinateInput, AltAzOutput


def test_coordinate_transformer_radec_to_altaz() -> None:
    """Test RA/Dec to Alt/Az transformation"""
    coord_input = CoordinateInput(
        ra=0.0,  # Vernal equinox
        dec=0.0,
        latitude=40.0,  # Somewhere in mid-latitudes
        longitude=-74.0,  # New York area
        elevation=0.0,
        time="2024-03-20T12:00:00",  # Spring equinox, noon
    )

    result = CoordinateTransformer.radec_to_altaz(coord_input)

    assert isinstance(result, AltAzOutput)
    assert isinstance(result.altitude, float)
    assert isinstance(result.azimuth, float)
    assert -90.0 <= result.altitude <= 90.0
    assert 0.0 <= result.azimuth <= 360.0


def test_coordinate_transformer_altaz_to_radec() -> None:
    """Test Alt/Az to RA/Dec transformation"""
    result = CoordinateTransformer.altaz_to_radec(
        alt=45.0,
        az=180.0,  # South
        latitude=40.0,
        longitude=-74.0,
        elevation=0.0,
        time="2024-03-20T12:00:00",
    )

    ra, dec = result
    assert isinstance(ra, float)
    assert isinstance(dec, float)
    assert 0.0 <= ra <= 360.0
    assert -90.0 <= dec <= 90.0
