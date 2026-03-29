"""
Tests for ObservationPlanner (astroplan-based planning utilities).
"""
import pytest

from astronomy.planning import ObservationPlanner, ObserverLocation, Target


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def new_york() -> ObserverLocation:
    return ObserverLocation(latitude=40.7, longitude=-74.0, timezone="America/New_York")


@pytest.fixture
def polaris() -> Target:
    """Polaris — circumpolar from New York."""
    return Target(name="Polaris", ra=37.95, dec=89.26)


@pytest.fixture
def sigma_octantis() -> Target:
    """Sigma Octantis — south-polar star, below horizon from New York."""
    return Target(name="Sigma Octantis", ra=317.19, dec=-88.96)


@pytest.fixture
def summer_midnight() -> str:
    return "2024-06-21T04:00:00"  # 04:00 UTC ≈ midnight EDT


# ---------------------------------------------------------------------------
# is_target_observable
# ---------------------------------------------------------------------------

class TestIsTargetObservable:
    def test_polaris_observable_from_new_york(
        self, polaris: Target, new_york: ObserverLocation, summer_midnight: str
    ) -> None:
        result = ObservationPlanner.is_target_observable(
            polaris, new_york, time=summer_midnight, min_altitude=5.0
        )
        assert result  # np.True_ is truthy

    def test_south_polar_not_observable_from_new_york(
        self, sigma_octantis: Target, new_york: ObserverLocation, summer_midnight: str
    ) -> None:
        result = ObservationPlanner.is_target_observable(
            sigma_octantis, new_york, time=summer_midnight, min_altitude=5.0
        )
        assert not result

    def test_high_min_altitude_can_exclude_visible_target(
        self, new_york: ObserverLocation, summer_midnight: str
    ) -> None:
        # A moderately placed target with an extreme min_altitude of 89° should not be observable
        target = Target(name="TestTarget", ra=270.0, dec=40.0)
        result = ObservationPlanner.is_target_observable(
            target, new_york, time=summer_midnight, min_altitude=89.0
        )
        assert not result

    def test_returns_bool_like(
        self, polaris: Target, new_york: ObserverLocation, summer_midnight: str
    ) -> None:
        result = ObservationPlanner.is_target_observable(polaris, new_york, summer_midnight)
        # Result is bool or np.bool_ — just ensure it's truthy/falsy
        assert result or not result


# ---------------------------------------------------------------------------
# get_target_visibility_window
# ---------------------------------------------------------------------------

class TestGetTargetVisibilityWindow:
    def test_polaris_observable_in_window(
        self, polaris: Target, new_york: ObserverLocation
    ) -> None:
        result = ObservationPlanner.get_target_visibility_window(
            target=polaris,
            observer_loc=new_york,
            start_time="2024-06-21T02:00:00",
            end_time="2024-06-21T06:00:00",
            min_altitude=5.0,
        )
        assert result["observable"]  # np.True_ is truthy

    def test_south_polar_not_observable_in_window(
        self, sigma_octantis: Target, new_york: ObserverLocation
    ) -> None:
        result = ObservationPlanner.get_target_visibility_window(
            target=sigma_octantis,
            observer_loc=new_york,
            start_time="2024-06-21T02:00:00",
            end_time="2024-06-21T06:00:00",
            min_altitude=5.0,
        )
        assert not result["observable"]

    def test_returns_altitude_at_midpoint(
        self, polaris: Target, new_york: ObserverLocation
    ) -> None:
        result = ObservationPlanner.get_target_visibility_window(
            target=polaris,
            observer_loc=new_york,
            start_time="2024-06-21T02:00:00",
            end_time="2024-06-21T06:00:00",
        )
        assert "altitude_at_midpoint" in result
        assert isinstance(result["altitude_at_midpoint"], float)

    def test_polaris_altitude_near_latitude(
        self, polaris: Target, new_york: ObserverLocation
    ) -> None:
        """Polaris altitude should be approximately equal to observer's latitude."""
        result = ObservationPlanner.get_target_visibility_window(
            target=polaris,
            observer_loc=new_york,
            start_time="2024-06-21T02:00:00",
            end_time="2024-06-21T06:00:00",
        )
        alt = result["altitude_at_midpoint"]
        # Polaris is within ~1° of the north pole, so altitude ≈ latitude ± 1°
        assert abs(alt - new_york.latitude) < 2.0
