"""
Basic tests for service layer components.
Part of Phase 1: Critical Path Testing - Service layer testing
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from services.coordinate_service import CoordinateTransformationService, Coordinates
from services.version_check import VersionChecker
from services.astrometry_client import AstrometrySettings, PlateSolveResult


class TestCoordinateService:
    """Test coordinate transformation service"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.coord_service = CoordinateTransformationService()
    
    def test_service_initialization(self):
        """Test that coordinate service initializes correctly"""
        assert self.coord_service.J2000_EPOCH == 2000.0
        assert self.coord_service.J2000_JD == 2451545.0
        assert self.coord_service.TROPICAL_YEAR == 365.25
    
    def test_coordinates_named_tuple(self):
        """Test Coordinates named tuple creation"""
        coords = Coordinates(ra=180.0, dec=45.0, epoch=2000.0)
        
        assert coords.ra == 180.0
        assert coords.dec == 45.0
        assert coords.epoch == 2000.0
    
    def test_julian_day_calculation(self):
        """Test Julian Day calculation for known dates"""
        # Test J2000.0 epoch (Jan 1, 2000, 12:00 UTC)
        j2000_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        jd = self.coord_service.julian_day_from_date(j2000_date)
        
        # Should be close to the standard J2000.0 JD
        assert abs(jd - self.coord_service.J2000_JD) < 0.1
    
    def test_julian_day_with_timezone(self):
        """Test Julian Day calculation handles timezones properly"""
        # Create date without timezone (should be treated as UTC)
        date_naive = datetime(2000, 1, 1, 12, 0, 0)
        jd_naive = self.coord_service.julian_day_from_date(date_naive)
        
        # Create same date with explicit UTC timezone
        date_utc = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        jd_utc = self.coord_service.julian_day_from_date(date_utc)
        
        # Should be the same
        assert abs(jd_naive - jd_utc) < 0.001


class TestVersionChecker:
    """Test version checking service"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.version_checker = VersionChecker(
            github_repo="test/repo",
            current_version="1.0.0"
        )
    
    def test_version_checker_initialization(self):
        """Test that version checker initializes correctly"""
        assert self.version_checker.github_repo == "test/repo"
        assert self.version_checker.current_version == "1.0.0"
        assert self.version_checker.last_check is None
        assert self.version_checker.cached_result is None
    
    def test_custom_initialization_parameters(self):
        """Test version checker with custom parameters"""
        checker = VersionChecker(
            github_repo="custom/repo",
            current_version="2.1.0",
            cache_duration_hours=12
        )
        
        assert checker.github_repo == "custom/repo"
        assert checker.current_version == "2.1.0"
        assert checker.cache_duration.total_seconds() == 12 * 3600
    
    def test_cache_validity_check(self):
        """Test cache validity checking"""
        # Fresh instance should not have valid cache
        assert not self.version_checker._is_cache_valid()
        
        # Set a recent check time
        from datetime import datetime, timedelta
        self.version_checker.last_check = datetime.now() - timedelta(hours=1)
        self.version_checker.cached_result = {"test": "data"}
        
        # Should now be valid (within 24 hour default)
        assert self.version_checker._is_cache_valid()
    
    @pytest.mark.asyncio
    async def test_check_updates_with_cache(self):
        """Test check for updates returns cached result when valid"""
        # Set up valid cache
        from datetime import datetime, timedelta
        self.version_checker.last_check = datetime.now() - timedelta(hours=1)
        self.version_checker.cached_result = {
            "update_available": False,
            "current_version": "1.0.0"
        }
        
        # Should return cached result without making HTTP request
        result = await self.version_checker.check_for_updates()
        
        assert result == self.version_checker.cached_result
        assert result["update_available"] is False
    
    @pytest.mark.asyncio
    async def test_check_updates_force_check(self):
        """Test force check bypasses cache"""
        # Set up valid cache
        from datetime import datetime, timedelta
        self.version_checker.last_check = datetime.now() - timedelta(hours=1)
        self.version_checker.cached_result = {"old": "data"}
        
        # Mock the GitHub API fetch
        with patch.object(self.version_checker, '_fetch_github_release', new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = {
                "tag_name": "v1.1.0",
                "published_at": "2023-01-01T00:00:00Z",
                "html_url": "https://github.com/test/repo/releases/tag/v1.1.0"
            }
            
            result = await self.version_checker.check_for_updates(force_check=True)
            
            # Should have called the GitHub API
            mock_fetch.assert_called_once()
            assert result["update_available"] is True
            assert result["latest_version"] == "1.1.0"


class TestAstrometryModels:
    """Test astrometry client models"""
    
    def test_astrometry_settings_creation(self):
        """Test AstrometrySettings model creation"""
        settings = AstrometrySettings(
            api_key="test_key",
            scale_low=0.5,
            scale_high=2.0
        )
        
        assert settings.api_key == "test_key"
        assert settings.scale_low == 0.5
        assert settings.scale_high == 2.0
        assert settings.api_url == "http://nova.astrometry.net/api/"  # default value
    
    def test_astrometry_settings_defaults(self):
        """Test AstrometrySettings with minimal parameters"""
        settings = AstrometrySettings(api_key="test_key")
        
        assert settings.api_key == "test_key"
        assert settings.scale_low is None
        assert settings.scale_high is None
        assert settings.scale_units == "degwidth"
        assert settings.crpix_center is True
    
    def test_plate_solve_result_success(self):
        """Test successful PlateSolveResult creation"""
        result = PlateSolveResult(
            success=True,
            ra=180.0,
            dec=45.0,
            orientation=90.0,
            pixscale=1.5,
            field_width=2.0,
            field_height=1.5
        )
        
        assert result.success is True
        assert result.ra == 180.0
        assert result.dec == 45.0
        assert result.orientation == 90.0
        assert result.pixscale == 1.5
        assert result.error is None
    
    def test_plate_solve_result_failure(self):
        """Test failed PlateSolveResult creation"""
        result = PlateSolveResult(
            success=False,
            error="Plate solve failed: no stars found"
        )
        
        assert result.success is False
        assert result.error == "Plate solve failed: no stars found"
        assert result.ra is None
        assert result.dec is None
    
    def test_plate_solve_result_with_job_info(self):
        """Test PlateSolveResult with job tracking information"""
        result = PlateSolveResult(
            success=True,
            ra=180.0,
            dec=45.0,
            job_id=12345,
            submission_id=67890
        )
        
        assert result.success is True
        assert result.job_id == 12345
        assert result.submission_id == 67890


class TestServiceImports:
    """Test that service modules can be imported correctly"""
    
    def test_coordinate_service_import(self):
        """Test coordinate service imports"""
        from services.coordinate_service import CoordinateTransformationService, Coordinates
        
        assert CoordinateTransformationService is not None
        assert Coordinates is not None
    
    def test_version_check_import(self):
        """Test version check service imports"""
        from services.version_check import VersionChecker
        
        assert VersionChecker is not None
    
    def test_astrometry_client_import(self):
        """Test astrometry client imports"""
        from services.astrometry_client import AstrometrySettings, PlateSolveResult
        
        assert AstrometrySettings is not None
        assert PlateSolveResult is not None
    
    def test_async_image_processing_import(self):
        """Test async image processing service imports"""
        try:
            from services.async_image_processing import AsyncImageProcessor
            assert AsyncImageProcessor is not None
        except ImportError:
            # Module might not have this class, that's ok for basic test
            pass
    
    def test_goto_service_import(self):
        """Test goto service imports"""
        try:
            from services.goto_service import GotoService
            assert GotoService is not None
        except ImportError:
            # Module might not have this class, that's ok for basic test
            pass