"""
Tests for the EphemerisCalculator (astropy-based sun/moon positions).
"""
import pytest

from astronomy.ephemeris import EphemerisCalculator, EphemerisInput


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def greenwich_noon() -> EphemerisInput:
    """Greenwich, noon on summer solstice 2024."""
    return EphemerisInput(
        latitude=51.477,
        longitude=0.0,
        elevation=0.0,
        time="2024-06-21T12:00:00",
    )


@pytest.fixture
def newyork_midnight() -> EphemerisInput:
    """New York City, midnight on winter solstice 2024."""
    return EphemerisInput(
        latitude=40.712,
        longitude=-74.006,
        elevation=10.0,
        time="2024-12-21T05:00:00",  # 05:00 UTC ≈ midnight EST
    )


# ---------------------------------------------------------------------------
# get_sun_position
# ---------------------------------------------------------------------------

class TestGetSunPosition:
    def test_returns_all_keys(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_sun_position(greenwich_noon)
        assert "ra" in result
        assert "dec" in result
        assert "altitude" in result
        assert "azimuth" in result

    def test_values_are_floats(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_sun_position(greenwich_noon)
        for key in ("ra", "dec", "altitude", "azimuth"):
            assert isinstance(result[key], float)

    def test_sun_above_horizon_at_noon(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_sun_position(greenwich_noon)
        assert result["altitude"] > 0.0

    def test_sun_below_horizon_at_night(self, newyork_midnight: EphemerisInput) -> None:
        result = EphemerisCalculator.get_sun_position(newyork_midnight)
        assert result["altitude"] < 0.0

    def test_ra_in_valid_range(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_sun_position(greenwich_noon)
        assert 0.0 <= result["ra"] < 360.0

    def test_dec_in_valid_range(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_sun_position(greenwich_noon)
        assert -90.0 <= result["dec"] <= 90.0

    def test_azimuth_in_valid_range(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_sun_position(greenwich_noon)
        assert 0.0 <= result["azimuth"] <= 360.0

    def test_summer_solstice_dec_approx(self, greenwich_noon: EphemerisInput) -> None:
        """Sun declination should be near +23.4° at summer solstice."""
        result = EphemerisCalculator.get_sun_position(greenwich_noon)
        assert 22.0 < result["dec"] < 24.5


# ---------------------------------------------------------------------------
# get_moon_position
# ---------------------------------------------------------------------------

class TestGetMoonPosition:
    def test_returns_all_keys(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_moon_position(greenwich_noon)
        assert "ra" in result
        assert "dec" in result
        assert "altitude" in result
        assert "azimuth" in result

    def test_values_are_floats(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_moon_position(greenwich_noon)
        for key in ("ra", "dec", "altitude", "azimuth"):
            assert isinstance(result[key], float)

    def test_ra_in_valid_range(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_moon_position(greenwich_noon)
        assert 0.0 <= result["ra"] < 360.0

    def test_dec_in_valid_range(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_moon_position(greenwich_noon)
        assert -90.0 <= result["dec"] <= 90.0

    def test_azimuth_in_valid_range(self, greenwich_noon: EphemerisInput) -> None:
        result = EphemerisCalculator.get_moon_position(greenwich_noon)
        assert 0.0 <= result["azimuth"] <= 360.0

    def test_different_time_gives_different_result(self) -> None:
        t1 = EphemerisInput(latitude=40.0, longitude=0.0, elevation=0.0,
                             time="2024-01-01T00:00:00")
        t2 = EphemerisInput(latitude=40.0, longitude=0.0, elevation=0.0,
                             time="2024-01-15T00:00:00")
        r1 = EphemerisCalculator.get_moon_position(t1)
        r2 = EphemerisCalculator.get_moon_position(t2)
        # Moon moves significantly over two weeks
        assert abs(r1["ra"] - r2["ra"]) > 1.0
