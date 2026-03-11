"""
Tests for the CatalogService and its static helper methods.
"""
import json
import math
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from catalog.catalog_service import CatalogService, CelestialObject, ObserverLocation


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINIMAL_CATALOG = {
    "objects": [
        {
            "id": "M042",
            "object_type": "Nebula",
            "catalog_ids": {"messier": "M42", "ngc": "1976"},
            "names": {"proper": "Orion Nebula", "common": ["Great Nebula in Orion"], "other": []},
            "coordinates": {
                "ra_j2000": {"decimal": 83.8221},
                "dec_j2000": {"decimal": -5.3911},
                "constellation": "Ori",
            },
            "magnitudes": {"v": 4.0},
            "physical_properties": {"size": {"major_axis_arcmin": 65.0}},
            "description": "A famous emission nebula.",
        },
        {
            "id": "NGC0224",
            "object_type": "Galaxy",
            "catalog_ids": {"messier": "M31", "ngc": "224"},
            "names": {"proper": "Andromeda Galaxy", "common": [], "other": []},
            "coordinates": {
                "ra_j2000": {"decimal": 10.6848},
                "dec_j2000": {"decimal": 41.2692},
                "constellation": "And",
            },
            "magnitudes": {"v": 3.44},
            "physical_properties": {},
            "description": "Nearest spiral galaxy.",
        },
        {
            # Object with IC catalog only, no Messier
            "id": "IC0434",
            "object_type": "Nebula",
            "catalog_ids": {"ic": "434"},
            "names": {"proper": None, "common": ["Horsehead Nebula"], "other": []},
            "coordinates": {
                "ra_j2000": {"decimal": 85.2448},
                "dec_j2000": {"decimal": -2.4583},
                "constellation": "Ori",
            },
            "magnitudes": {},
            "physical_properties": {},
            "description": "Dark nebula silhouetted against IC 434.",
        },
        {
            # Object with no magnitude — should be excluded from no-query searches
            "id": "FAINT001",
            "object_type": "Galaxy",
            "catalog_ids": {},
            "names": {"proper": None, "common": [], "other": []},
            "coordinates": {
                "ra_j2000": {"decimal": 45.0},
                "dec_j2000": {"decimal": 10.0},
                "constellation": "Tau",
            },
            "magnitudes": {"v": 14.5},
            "physical_properties": {},
            "description": "A very faint galaxy.",
        },
    ]
}


@pytest.fixture
def catalog_file(tmp_path: Path) -> Path:
    """Write the minimal catalog to a temp file and return its path."""
    p = tmp_path / "catalog.json"
    p.write_text(json.dumps(MINIMAL_CATALOG))
    return p


@pytest.fixture
def service(catalog_file: Path) -> CatalogService:
    """CatalogService pointed at the minimal test catalog."""
    # Reset class-level cache so each test starts fresh
    CatalogService._catalog_cache = None
    CatalogService._cache_load_time = 0
    return CatalogService(catalog_path=catalog_file)


# ---------------------------------------------------------------------------
# calculate_local_sidereal_time
# ---------------------------------------------------------------------------

class TestCalculateLocalSiderealTime:
    def test_j2000_epoch(self) -> None:
        """At J2000.0 (2000-01-01 12:00 UTC) the GST is ~18.697 hours."""
        lst = CatalogService.calculate_local_sidereal_time(
            longitude=0.0, utc_datetime=datetime(2000, 1, 1, 12, 0, 0)
        )
        assert 0.0 <= lst < 24.0
        assert abs(lst - 18.697) < 0.01

    def test_longitude_shifts_lst(self) -> None:
        """Each 15° of longitude adds 1 hour to LST."""
        t = datetime(2000, 1, 1, 12, 0, 0)
        lst0 = CatalogService.calculate_local_sidereal_time(0.0, t)
        lst15 = CatalogService.calculate_local_sidereal_time(15.0, t)
        diff = (lst15 - lst0) % 24.0
        assert abs(diff - 1.0) < 1e-6

    def test_result_in_range(self) -> None:
        lst = CatalogService.calculate_local_sidereal_time(-74.0, datetime(2024, 6, 21, 0, 0, 0))
        assert 0.0 <= lst < 24.0


# ---------------------------------------------------------------------------
# calculate_altitude_azimuth
# ---------------------------------------------------------------------------

class TestCalculateAltitudeAzimuth:
    def test_object_on_meridian_south(self) -> None:
        """When HA=0, altitude should equal (90 - |lat - dec|) for southern sky."""
        lat = 40.0
        dec = 20.0
        lst = 6.0
        ra_hours = 6.0  # HA = 0

        alt, az = CatalogService.calculate_altitude_azimuth(ra_hours, dec, lat, lst)
        expected_alt = 90.0 - abs(lat - dec)
        assert abs(alt - expected_alt) < 0.5
        # On meridian south of zenith, azimuth is 180°
        assert abs(az - 180.0) < 0.5

    def test_object_below_horizon(self) -> None:
        """South-polar object seen from mid-northern latitudes should be below horizon."""
        alt, _az = CatalogService.calculate_altitude_azimuth(
            ra_hours=0.0, dec_degrees=-80.0, latitude=45.0, lst_hours=12.0
        )
        assert alt < 0.0

    def test_zenith_no_divide_by_zero(self) -> None:
        """Object at zenith (alt ≈ 90°) must not raise ZeroDivisionError — Bug 1 regression."""
        # Zenith: dec = lat, HA = 0
        lat = 45.0
        dec = lat
        lst = 3.0
        ra_hours = lst  # HA = 0

        alt, az = CatalogService.calculate_altitude_azimuth(ra_hours, dec, lat, lst)
        assert abs(alt - 90.0) < 1.0
        assert az == 0.0  # undefined at zenith, returns 0

    def test_azimuth_in_range(self) -> None:
        alt, az = CatalogService.calculate_altitude_azimuth(5.5, 23.5, 40.0, 6.0)
        assert 0.0 <= az <= 360.0


# ---------------------------------------------------------------------------
# get_object_magnitude
# ---------------------------------------------------------------------------

class TestGetObjectMagnitude:
    def test_v_band_preferred(self) -> None:
        mags = {"v": 5.0, "b": 6.0, "r": 4.5}
        assert CatalogService.get_object_magnitude(mags) == 5.0

    def test_fallback_to_b(self) -> None:
        mags = {"b": 6.0, "r": 4.5}
        assert CatalogService.get_object_magnitude(mags) == 6.0

    def test_empty_returns_none(self) -> None:
        assert CatalogService.get_object_magnitude({}) is None

    def test_priority_order(self) -> None:
        # All bands present — v should win
        mags = {"k": 1.0, "h": 2.0, "j": 3.0, "i": 4.0, "r": 5.0, "b": 6.0, "v": 7.0}
        assert CatalogService.get_object_magnitude(mags) == 7.0


# ---------------------------------------------------------------------------
# get_object_name
# ---------------------------------------------------------------------------

class TestGetObjectName:
    def test_messier_with_M_prefix(self) -> None:
        obj = {"catalog_ids": {"messier": "M042"}, "names": {}, "id": ""}
        assert CatalogService.get_object_name(obj) == "M 42"

    def test_messier_without_M_prefix(self) -> None:
        obj = {"catalog_ids": {"messier": "31"}, "names": {}, "id": ""}
        assert CatalogService.get_object_name(obj) == "M 31"

    def test_ngc_fallback(self) -> None:
        obj = {"catalog_ids": {"ngc": "1976"}, "names": {}, "id": ""}
        assert CatalogService.get_object_name(obj) == "NGC 1976"

    def test_ic_fallback(self) -> None:
        obj = {"catalog_ids": {"ic": "434"}, "names": {}, "id": ""}
        assert CatalogService.get_object_name(obj) == "IC 434"

    def test_id_starts_with_ngc(self) -> None:
        obj = {"catalog_ids": {}, "names": {}, "id": "NGC0224"}
        assert CatalogService.get_object_name(obj) == "NGC 0224"

    def test_id_starts_with_ic(self) -> None:
        obj = {"catalog_ids": {}, "names": {}, "id": "IC0434"}
        assert CatalogService.get_object_name(obj) == "IC 0434"

    def test_proper_name(self) -> None:
        obj = {"catalog_ids": {}, "names": {"proper": "Sirius"}, "id": ""}
        assert CatalogService.get_object_name(obj) == "Sirius"

    def test_common_name_list(self) -> None:
        obj = {"catalog_ids": {}, "names": {"common": ["Horsehead Nebula", "Other"]}, "id": ""}
        assert CatalogService.get_object_name(obj) == "Horsehead Nebula"

    def test_fallback_to_id(self) -> None:
        obj = {"catalog_ids": {}, "names": {}, "id": "UNKNOWN_OBJ"}
        assert CatalogService.get_object_name(obj) == "UNKNOWN_OBJ"

    def test_empty_object(self) -> None:
        obj = {"catalog_ids": {}, "names": {}, "id": ""}
        assert CatalogService.get_object_name(obj) == "Unknown"

    def test_sharpless_name(self) -> None:
        obj = {"catalog_ids": {"sharpless": "Sh2-292"}, "names": {}, "id": ""}
        assert CatalogService.get_object_name(obj) == "Sh2-292"

    def test_barnard_name(self) -> None:
        obj = {"catalog_ids": {"barnard": "B33"}, "names": {}, "id": ""}
        assert CatalogService.get_object_name(obj) == "B33"

    def test_bayer_flamsteed_name(self) -> None:
        obj = {"catalog_ids": {}, "names": {"bayer_flamsteed": "Alpha Ori"}, "id": ""}
        assert CatalogService.get_object_name(obj) == "Alpha Ori"


# ---------------------------------------------------------------------------
# get_all_object_names
# ---------------------------------------------------------------------------

class TestGetAllObjectNames:
    def test_includes_messier_variants(self) -> None:
        obj = {"catalog_ids": {"messier": "M42"}, "names": {}, "id": "M042"}
        names = CatalogService.get_all_object_names(obj)
        assert "M42" in names
        assert "M 42" in names
        assert "Messier 42" in names

    def test_includes_ngc_variants(self) -> None:
        obj = {"catalog_ids": {"ngc": "1976"}, "names": {}, "id": "NGC1976"}
        names = CatalogService.get_all_object_names(obj)
        assert "NGC1976" in names
        assert "NGC 1976" in names

    def test_includes_ic_variants(self) -> None:
        obj = {"catalog_ids": {"ic": "434"}, "names": {}, "id": "IC434"}
        names = CatalogService.get_all_object_names(obj)
        assert "IC434" in names
        assert "IC 434" in names

    def test_no_empty_strings(self) -> None:
        obj = {"catalog_ids": {}, "names": {"common": ["", "Real Name"]}, "id": ""}
        names = CatalogService.get_all_object_names(obj)
        assert "" not in names
        assert "Real Name" in names

    def test_includes_sharpless_variants(self) -> None:
        obj = {"catalog_ids": {"sharpless": "Sh2-292"}, "names": {}, "id": ""}
        names = CatalogService.get_all_object_names(obj)
        assert "Sh2-292" in names
        assert "Sh2292" in names

    def test_includes_barnard_variants(self) -> None:
        obj = {"catalog_ids": {"barnard": "B33"}, "names": {}, "id": ""}
        names = CatalogService.get_all_object_names(obj)
        assert "B33" in names
        assert "B 33" in names
        assert "Barnard 33" in names

    def test_includes_other_names(self) -> None:
        obj = {"catalog_ids": {}, "names": {"other": ["Alt Name 1", "Alt Name 2"]}, "id": ""}
        names = CatalogService.get_all_object_names(obj)
        assert "Alt Name 1" in names
        assert "Alt Name 2" in names


# ---------------------------------------------------------------------------
# matches_search_query
# ---------------------------------------------------------------------------

class TestMatchesSearchQuery:
    def _orion(self) -> dict:
        return {
            "id": "M042",
            "object_type": "Nebula",
            "catalog_ids": {"messier": "M42", "ngc": "1976"},
            "names": {"proper": "Orion Nebula", "common": ["Great Orion Nebula"], "other": []},
            "coordinates": {"constellation": "Ori"},
        }

    def _andromeda(self) -> dict:
        return {
            "id": "NGC0224",
            "object_type": "Galaxy",
            "catalog_ids": {"messier": "M31", "ngc": "224"},
            "names": {"proper": "Andromeda Galaxy", "common": [], "other": []},
            "coordinates": {"constellation": "And"},
        }

    def test_empty_query_matches_all(self) -> None:
        assert CatalogService.matches_search_query(self._orion(), "") is True

    def test_exact_messier_match(self) -> None:
        assert CatalogService.matches_search_query(self._orion(), "M 42") is True

    def test_messier_shorthand_m42(self) -> None:
        assert CatalogService.matches_search_query(self._orion(), "m42") is True

    def test_messier_shorthand_messier_31(self) -> None:
        assert CatalogService.matches_search_query(self._andromeda(), "messier 31") is True

    def test_common_alias_orion_nebula(self) -> None:
        assert CatalogService.matches_search_query(self._orion(), "orion nebula") is True

    def test_common_alias_andromeda(self) -> None:
        assert CatalogService.matches_search_query(self._andromeda(), "andromeda") is True

    def test_partial_name_match(self) -> None:
        assert CatalogService.matches_search_query(self._andromeda(), "galaxy") is True

    def test_constellation_match(self) -> None:
        assert CatalogService.matches_search_query(self._orion(), "ori") is True

    def test_no_match(self) -> None:
        assert CatalogService.matches_search_query(self._orion(), "horsehead") is False

    def test_messier_number_mismatch(self) -> None:
        # Querying "m99" should not match M42
        assert CatalogService.matches_search_query(self._orion(), "m99") is False


# ---------------------------------------------------------------------------
# calculate_sun_position
# ---------------------------------------------------------------------------

class TestCalculateSunPosition:
    def test_returns_expected_keys(self) -> None:
        result = CatalogService.calculate_sun_position(datetime(2024, 6, 21, 12, 0, 0))
        assert result["id"] == "sun"
        assert "ra_j2000" in result["coordinates"]
        assert "dec_j2000" in result["coordinates"]

    def test_ra_in_valid_range(self) -> None:
        result = CatalogService.calculate_sun_position(datetime(2024, 3, 20, 12, 0, 0))
        ra = result["coordinates"]["ra_j2000"]["decimal"]
        assert 0.0 <= ra < 360.0

    def test_dec_in_valid_range(self) -> None:
        result = CatalogService.calculate_sun_position(datetime(2024, 6, 21, 12, 0, 0))
        dec = result["coordinates"]["dec_j2000"]["decimal"]
        assert -90.0 <= dec <= 90.0

    def test_summer_solstice_dec_positive(self) -> None:
        """Sun declination should be ~+23.5° near summer solstice."""
        result = CatalogService.calculate_sun_position(datetime(2024, 6, 21, 0, 0, 0))
        dec = result["coordinates"]["dec_j2000"]["decimal"]
        assert 20.0 < dec < 25.0

    def test_winter_solstice_dec_negative(self) -> None:
        """Sun declination should be ~-23.5° near winter solstice."""
        result = CatalogService.calculate_sun_position(datetime(2024, 12, 21, 0, 0, 0))
        dec = result["coordinates"]["dec_j2000"]["decimal"]
        assert -25.0 < dec < -20.0


# ---------------------------------------------------------------------------
# calculate_moon_position
# ---------------------------------------------------------------------------

class TestCalculateMoonPosition:
    def test_returns_expected_keys(self) -> None:
        result = CatalogService.calculate_moon_position(datetime(2024, 6, 21, 12, 0, 0))
        assert result["id"] == "moon"
        assert "_moon_phase" in result
        assert "ra_j2000" in result["coordinates"]

    def test_phase_in_range(self) -> None:
        result = CatalogService.calculate_moon_position(datetime(2024, 6, 21, 12, 0, 0))
        phase = result["_moon_phase"]
        assert 0.0 <= phase <= 1.0

    def test_ra_dec_in_range(self) -> None:
        result = CatalogService.calculate_moon_position(datetime(2024, 1, 1, 0, 0, 0))
        ra = result["coordinates"]["ra_j2000"]["decimal"]
        dec = result["coordinates"]["dec_j2000"]["decimal"]
        assert 0.0 <= ra < 360.0
        assert -90.0 <= dec <= 90.0


# ---------------------------------------------------------------------------
# get_planet_positions
# ---------------------------------------------------------------------------

class TestGetPlanetPositions:
    def test_returns_five_planets(self) -> None:
        planets = CatalogService.get_planet_positions(datetime(2024, 6, 21))
        assert len(planets) == 5

    def test_planet_names(self) -> None:
        planets = CatalogService.get_planet_positions(datetime(2024, 6, 21))
        names = [p["names"]["proper"] for p in planets]
        assert "Mercury" in names
        assert "Jupiter" in names
        assert "Saturn" in names

    def test_all_planets_have_coordinates(self) -> None:
        for planet in CatalogService.get_planet_positions(datetime(2024, 1, 1)):
            assert "ra_j2000" in planet["coordinates"]
            assert "dec_j2000" in planet["coordinates"]


# ---------------------------------------------------------------------------
# get_object_size
# ---------------------------------------------------------------------------

class TestGetObjectSize:
    def test_returns_major_axis(self) -> None:
        props = {"size": {"major_axis_arcmin": 65.0}}
        assert CatalogService.get_object_size(props) == 65.0

    def test_missing_size_returns_none(self) -> None:
        assert CatalogService.get_object_size({}) is None

    def test_missing_major_axis_returns_none(self) -> None:
        assert CatalogService.get_object_size({"size": {}}) is None


# ---------------------------------------------------------------------------
# CatalogService.search (integration of static helpers with catalog loading)
# ---------------------------------------------------------------------------

class TestCatalogServiceSearch:
    def test_search_no_query_returns_bright_objects(self, service: CatalogService) -> None:
        """Without a query, only objects with magnitude ≤ 6.0 are returned."""
        result = service.search(above_horizon_only=False)
        for obj in result["objects"]:
            assert obj["magnitude"] is not None
            assert obj["magnitude"] <= 6.0

    def test_search_with_query_returns_matches(self, service: CatalogService) -> None:
        result = service.search(query="orion", above_horizon_only=False)
        # The query matches M42 (Orion Nebula) and IC0434 (Horsehead Nebula, in Ori)
        assert result["filtered_count"] > 0

    def test_search_returns_counts(self, service: CatalogService) -> None:
        result = service.search(above_horizon_only=False)
        assert "total_count" in result
        assert "filtered_count" in result
        assert result["filtered_count"] <= result["total_count"]

    def test_search_with_magnitude_filter(self, service: CatalogService) -> None:
        result = service.search(max_magnitude=4.0, above_horizon_only=False)
        for obj in result["objects"]:
            if obj["magnitude"] is not None:
                assert obj["magnitude"] <= 4.0

    def test_search_with_object_type_filter(self, service: CatalogService) -> None:
        result = service.search(object_type="Galaxy", above_horizon_only=False)
        for obj in result["objects"]:
            assert obj["object_type"] == "Galaxy"

    def test_search_with_location_adds_altaz(self, service: CatalogService) -> None:
        result = service.search(
            query="orion", above_horizon_only=False, latitude=40.0, longitude=-74.0
        )
        for obj in result["objects"]:
            # Objects with location should have altitude/azimuth
            assert obj["altitude"] is not None
            assert obj["azimuth"] is not None

    def test_search_missing_catalog_raises(self, tmp_path: Path) -> None:
        CatalogService._catalog_cache = None
        bad_service = CatalogService(catalog_path=tmp_path / "nonexistent.json")
        with pytest.raises(FileNotFoundError):
            bad_service.search()

    def test_quick_search(self, service: CatalogService) -> None:
        result = service.quick_search("M 42")
        assert "objects" in result
        assert "filtered_count" in result

    def test_get_object_types(self, service: CatalogService) -> None:
        types = service.get_object_types()
        assert isinstance(types, dict)
        assert "Nebula" in types or "Galaxy" in types

    def test_get_solar_system_objects(self, service: CatalogService) -> None:
        objects = service.get_solar_system_objects()
        ids = [o["id"] for o in objects]
        assert "sun" in ids
        assert "moon" in ids

    def test_get_solar_system_with_location(self, service: CatalogService) -> None:
        objects = service.get_solar_system_objects(latitude=40.0, longitude=-74.0)
        for obj in objects:
            assert "altitude" in obj
            assert "azimuth" in obj
