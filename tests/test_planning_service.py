"""
Tests for the PlanningService and its static helper methods.
"""
from datetime import datetime

import pytest

from planning.planning_service import (
    ObserverLocation,
    PlanningService,
    TargetInfo,
    create_session,
    update_session,
)


# ---------------------------------------------------------------------------
# calculate_local_sidereal_time
# ---------------------------------------------------------------------------

class TestCalculateLocalSiderealTime:
    def test_j2000_epoch(self) -> None:
        """At J2000.0 the GST is ~18.697 hours at zero longitude."""
        lst = PlanningService.calculate_local_sidereal_time(
            longitude=0.0, utc_datetime=datetime(2000, 1, 1, 12, 0, 0)
        )
        assert 0.0 <= lst < 24.0
        assert abs(lst - 18.697) < 0.01

    def test_longitude_offset(self) -> None:
        """15° east adds 1 hour to LST."""
        t = datetime(2000, 1, 1, 12, 0, 0)
        lst0 = PlanningService.calculate_local_sidereal_time(0.0, t)
        lst15 = PlanningService.calculate_local_sidereal_time(15.0, t)
        diff = (lst15 - lst0) % 24.0
        assert abs(diff - 1.0) < 1e-6

    def test_result_always_in_range(self) -> None:
        lst = PlanningService.calculate_local_sidereal_time(-120.0, datetime(2024, 12, 1, 3, 0, 0))
        assert 0.0 <= lst < 24.0


# ---------------------------------------------------------------------------
# calculate_altitude_azimuth
# ---------------------------------------------------------------------------

class TestCalculateAltitudeAzimuth:
    def test_object_on_meridian(self) -> None:
        """HA=0 → altitude = 90 - |lat - dec| for object south of zenith."""
        lat = 40.0
        dec = 20.0
        lst = 8.0
        ra_hours = lst  # HA = 0
        alt, az = PlanningService.calculate_altitude_azimuth(ra_hours, dec, lat, lst)
        assert abs(alt - (90.0 - abs(lat - dec))) < 0.5
        assert abs(az - 180.0) < 0.5

    def test_below_horizon(self) -> None:
        alt, _ = PlanningService.calculate_altitude_azimuth(0.0, -85.0, 45.0, 12.0)
        assert alt < 0.0

    def test_zenith_no_crash(self) -> None:
        """Object exactly at zenith should not raise any exception."""
        lat = 45.0
        alt, az = PlanningService.calculate_altitude_azimuth(6.0, lat, lat, 6.0)
        assert abs(alt - 90.0) < 1.0
        assert az == 0.0  # undefined at zenith

    def test_azimuth_in_range(self) -> None:
        _, az = PlanningService.calculate_altitude_azimuth(5.0, 30.0, 50.0, 7.0)
        assert 0.0 <= az <= 360.0


# ---------------------------------------------------------------------------
# get_sun_altitude / is_astronomical_dark
# ---------------------------------------------------------------------------

class TestSunAltitude:
    def test_sun_above_horizon_at_noon_utc(self) -> None:
        """At Greenwich (lon=0) near noon on summer solstice, sun should be up."""
        alt = PlanningService.get_sun_altitude(
            latitude=51.5, longitude=0.0, utc_datetime=datetime(2024, 6, 21, 12, 0, 0)
        )
        assert alt > 0.0

    def test_sun_below_horizon_at_midnight(self) -> None:
        """At midnight UTC, sun should be below horizon for mid-latitude northern sites."""
        alt = PlanningService.get_sun_altitude(
            latitude=40.0, longitude=0.0, utc_datetime=datetime(2024, 6, 21, 0, 0, 0)
        )
        assert alt < 0.0

    def test_not_astronomical_dark_at_noon(self) -> None:
        result = PlanningService.is_astronomical_dark(
            latitude=40.0, longitude=0.0, utc_datetime=datetime(2024, 6, 21, 12, 0, 0)
        )
        assert result is False

    def test_astronomical_dark_at_winter_midnight(self) -> None:
        """At midnight in winter at mid-latitude site, should be astronomically dark."""
        result = PlanningService.is_astronomical_dark(
            latitude=45.0, longitude=0.0, utc_datetime=datetime(2024, 12, 21, 0, 0, 0)
        )
        assert result is True


# ---------------------------------------------------------------------------
# get_target_visibility
# ---------------------------------------------------------------------------

class TestGetTargetVisibility:
    def _service(self) -> PlanningService:
        return PlanningService()

    def _polaris(self) -> TargetInfo:
        return TargetInfo(name="Polaris", ra=37.95, dec=89.26)

    def _loc(self) -> ObserverLocation:
        return ObserverLocation(latitude=45.0, longitude=0.0)

    def test_circumpolar_object_always_visible(self) -> None:
        """Polaris is always above horizon from mid-northern latitudes."""
        result = self._service().get_target_visibility(
            self._polaris(), self._loc(), date="2024-06-21"
        )
        assert result["transit_altitude"] is not None
        # Polaris should be visible for many hours when min_altitude is low
        result_low = self._service().get_target_visibility(
            self._polaris(), self._loc(), date="2024-06-21", min_altitude=5.0
        )
        assert result_low["hours_visible"] > 0

    def test_returns_required_keys(self) -> None:
        result = self._service().get_target_visibility(
            self._polaris(), self._loc(), date="2024-06-21"
        )
        for key in ("target_name", "is_visible", "altitude", "azimuth", "hours_visible"):
            assert key in result

    def test_target_name_preserved(self) -> None:
        result = self._service().get_target_visibility(
            self._polaris(), self._loc(), date="2024-06-21"
        )
        assert result["target_name"] == "Polaris"


# ---------------------------------------------------------------------------
# get_tonight_targets
# ---------------------------------------------------------------------------

class TestGetTonightTargets:
    def _service(self) -> PlanningService:
        return PlanningService()

    def _catalog(self) -> list:
        return [
            {
                "id": "polaris",
                "name": "Polaris",
                "ra_decimal": 37.95,
                "dec_decimal": 89.26,
                "magnitude": 1.97,
                "object_type": "Star",
                "constellation": "UMi",
            },
            {
                "id": "south_obj",
                "name": "SouthernObj",
                "ra_decimal": 90.0,
                "dec_decimal": -80.0,
                "magnitude": 2.0,
                "object_type": "Star",
                "constellation": "Car",
            },
        ]

    def test_returns_list(self) -> None:
        loc = ObserverLocation(latitude=45.0, longitude=0.0)
        result = self._service().get_tonight_targets(self._catalog(), loc)
        assert isinstance(result, list)

    def test_circumpolar_included(self) -> None:
        loc = ObserverLocation(latitude=45.0, longitude=0.0)
        result = self._service().get_tonight_targets(
            self._catalog(), loc, min_altitude=5.0
        )
        names = [t["name"] for t in result]
        assert "Polaris" in names

    def test_southern_object_excluded(self) -> None:
        loc = ObserverLocation(latitude=45.0, longitude=0.0)
        result = self._service().get_tonight_targets(
            self._catalog(), loc, min_altitude=30.0
        )
        names = [t["name"] for t in result]
        assert "SouthernObj" not in names

    def test_limit_respected(self) -> None:
        loc = ObserverLocation(latitude=45.0, longitude=0.0)
        result = self._service().get_tonight_targets(
            self._catalog(), loc, limit=1, min_altitude=5.0
        )
        assert len(result) <= 1


# ---------------------------------------------------------------------------
# create_session / update_session
# ---------------------------------------------------------------------------

class TestCreateSession:
    def test_returns_dict_with_id(self) -> None:
        session = create_session("Test session")
        assert "id" in session
        assert len(session["id"]) > 0

    def test_id_is_uuid(self) -> None:
        import uuid
        session = create_session("Test")
        uuid.UUID(session["id"])  # raises ValueError if not a valid UUID

    def test_name_stored(self) -> None:
        session = create_session("My Session")
        assert session["name"] == "My Session"

    def test_optional_fields(self) -> None:
        session = create_session(
            "Night 1", telescope_id="t1", location_lat=45.0, location_lon=-74.0, notes="clear"
        )
        assert session["telescope_id"] == "t1"
        assert session["location_lat"] == 45.0
        assert session["notes"] == "clear"

    def test_ended_at_is_none(self) -> None:
        session = create_session("Test")
        assert session["ended_at"] is None


class TestUpdateSession:
    def test_update_ended_at(self) -> None:
        result = update_session("abc-123", ended_at="2024-06-21T23:00:00")
        assert result["id"] == "abc-123"
        assert result["ended_at"] == "2024-06-21T23:00:00"

    def test_update_notes(self) -> None:
        result = update_session("abc-123", notes="Updated notes")
        assert result["notes"] == "Updated notes"

    def test_no_optional_fields(self) -> None:
        result = update_session("abc-123")
        assert result["id"] == "abc-123"
        assert "ended_at" not in result
