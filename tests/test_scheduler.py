"""Tests for get_visibility_curve."""

import pytest

from planning.planning_service import get_visibility_curve


# M42 (Orion Nebula): RA=83.82°, Dec=-5.39°
# Polaris:            RA=37.95°, Dec=89.26°
# Vega:               RA=279.23°, Dec=38.78°
# Observer reference: lat=45°N, lon=-93°W (Minnesota), tz=America/Chicago


class TestGetVisibilityCurveStructure:
    def test_curve_length(self):
        result = get_visibility_curve(
            ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0,
        )
        assert len(result["curve"]) == 145

    def test_curve_points_have_required_keys(self):
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0)
        first = result["curve"][0]
        assert "time_local" in first
        assert "time_label" in first
        assert "altitude_deg" in first
        assert "azimuth_deg" in first
        assert "sun_altitude_deg" in first

    def test_events_dict_has_required_keys(self):
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0)
        ev = result["events"]
        assert "rise_time_local" in ev
        assert "set_time_local" in ev
        assert "transit_time_local" in ev
        assert "max_altitude_deg" in ev

    def test_twilight_dict_has_required_keys(self):
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0)
        tw = result["twilight"]
        assert "astro_dark_start" in tw
        assert "astro_dark_end" in tw


class TestGetVisibilityCurveValues:
    def test_altitude_range(self):
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0)
        for pt in result["curve"]:
            assert -90 <= pt["altitude_deg"] <= 90

    def test_azimuth_range(self):
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0)
        for pt in result["curve"]:
            assert 0 <= pt["azimuth_deg"] <= 360, f"azimuth out of range: {pt['azimuth_deg']}"

    def test_polaris_always_above_horizon(self):
        """Polaris is circumpolar from lat=45°N — every altitude should be positive."""
        result = get_visibility_curve(
            ra=37.95, dec=89.26, latitude=45.0, longitude=-93.0,
        )
        altitudes = [pt["altitude_deg"] for pt in result["curve"]]
        assert all(alt > 0 for alt in altitudes), (
            f"Polaris dipped below horizon; min alt = {min(altitudes):.1f}°"
        )

    def test_rise_before_set_when_both_exist(self):
        """If an object rises and sets during the window, rise comes before set."""
        # M31 from mid-latitude in April
        result = get_visibility_curve(
            ra=10.68, dec=41.27, latitude=45.0, longitude=-93.0,
            date="2026-04-18", tz="America/Chicago",
        )
        ev = result["events"]
        if ev["rise_time_local"] and ev["set_time_local"]:
            assert ev["rise_time_local"] < ev["set_time_local"]

    def test_twilight_order(self):
        """Astronomical darkness starts before it ends."""
        result = get_visibility_curve(
            ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0,
            date="2026-04-18", tz="America/Chicago",
        )
        tw = result["twilight"]
        if tw["astro_dark_start"] and tw["astro_dark_end"]:
            assert tw["astro_dark_start"] < tw["astro_dark_end"]

    def test_max_altitude_is_positive_for_visible_object(self):
        """A well-placed object should have a positive max altitude."""
        result = get_visibility_curve(
            ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0,
        )
        ev = result["events"]
        assert ev["max_altitude_deg"] is not None
        assert ev["max_altitude_deg"] > 0

    def test_time_labels_are_hhmm(self):
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0)
        for pt in result["curve"]:
            label = pt["time_label"]
            assert len(label) == 5, f"Expected HH:MM, got: {label}"
            assert label[2] == ":", f"Expected colon at index 2, got: {label}"


class TestGetVisibilityCurveEdgeCases:
    def test_invalid_tz_falls_back_gracefully(self):
        """An unrecognised timezone should not raise; falls back to UTC."""
        result = get_visibility_curve(
            ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0,
            tz="Bogus/Timezone",
        )
        assert len(result["curve"]) == 145

    def test_default_date_produces_result(self):
        """Omitting date should still return a valid curve."""
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0)
        assert len(result["curve"]) == 145

    def test_malformed_date_falls_back(self):
        result = get_visibility_curve(
            ra=83.82, dec=-5.39, latitude=45.0, longitude=-93.0,
            date="not-a-date",
        )
        assert len(result["curve"]) == 145

    def test_equatorial_observer(self):
        """Equatorial observer (lat=0) should not crash."""
        result = get_visibility_curve(ra=83.82, dec=-5.39, latitude=0.0, longitude=0.0)
        assert len(result["curve"]) == 145
