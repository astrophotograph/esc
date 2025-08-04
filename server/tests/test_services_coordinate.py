"""
Comprehensive tests for coordinate transformation service.
Part of Phase 5: Final Coverage Push
"""

import pytest
import math
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

from services.coordinate_service import (
    CoordinateTransformationService,
    Coordinates
)


class TestCoordinates:
    """Test the Coordinates NamedTuple"""
    
    def test_coordinates_creation(self):
        """Test creating Coordinates object"""
        coords = Coordinates(ra=123.45, dec=-67.89, epoch=2000.0)
        
        assert coords.ra == 123.45
        assert coords.dec == -67.89
        assert coords.epoch == 2000.0
    
    def test_coordinates_immutable(self):
        """Test that Coordinates is immutable"""
        coords = Coordinates(ra=100.0, dec=50.0, epoch=2000.0)
        
        with pytest.raises(AttributeError):
            coords.ra = 200.0


class TestCoordinateTransformationService:
    """Test the CoordinateTransformationService class"""
    
    @pytest.fixture
    def service(self):
        """Create a CoordinateTransformationService instance"""
        with patch('services.coordinate_service.logger'):
            return CoordinateTransformationService()
    
    def test_initialization(self, service):
        """Test service initialization"""
        assert service.J2000_EPOCH == 2000.0
        assert service.J2000_JD == 2451545.0
        assert service.TROPICAL_YEAR == 365.25
        assert service.ARCSEC_TO_DEG == pytest.approx(1.0 / 3600.0)
    
    def test_julian_day_from_date(self, service):
        """Test Julian Day calculation"""
        # Test J2000 epoch
        j2000_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        jd = service.julian_day_from_date(j2000_date)
        assert jd == pytest.approx(2451545.0, rel=1e-6)
        
        # Test another known date: 2023-01-01 00:00:00 UTC = JD 2459945.5
        test_date = datetime(2023, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        jd = service.julian_day_from_date(test_date)
        assert jd == pytest.approx(2459945.5, rel=1e-6)
        
        # Test with time component
        test_date_time = datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        jd_time = service.julian_day_from_date(test_date_time)
        assert jd_time == pytest.approx(2459946.0, rel=1e-6)
    
    def test_julian_day_without_timezone(self, service):
        """Test Julian Day calculation with naive datetime"""
        # Should assume UTC
        naive_date = datetime(2000, 1, 1, 12, 0, 0)
        jd = service.julian_day_from_date(naive_date)
        assert jd == pytest.approx(2451545.0, rel=1e-6)
    
    def test_julian_day_with_different_timezone(self, service):
        """Test Julian Day calculation with non-UTC timezone"""
        import pytz
        
        # Create datetime in EST (UTC-5)
        est = pytz.timezone('US/Eastern')
        est_date = est.localize(datetime(2000, 1, 1, 7, 0, 0))  # 7 AM EST = 12 PM UTC
        
        jd = service.julian_day_from_date(est_date)
        assert jd == pytest.approx(2451545.0, rel=1e-6)
    
    def test_julian_centuries_from_j2000(self, service):
        """Test Julian centuries calculation"""
        # J2000 epoch should give 0
        j2000_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        centuries = service.julian_centuries_from_j2000(j2000_date)
        assert centuries == pytest.approx(0.0, abs=1e-10)
        
        # 100 years later should give 1.0
        future_date = datetime(2100, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        centuries = service.julian_centuries_from_j2000(future_date)
        assert centuries == pytest.approx(1.0, rel=1e-3)
        
        # 50 years later should give 0.5
        mid_date = datetime(2050, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        centuries = service.julian_centuries_from_j2000(mid_date)
        assert centuries == pytest.approx(0.5, rel=1e-3)
    
    def test_precession_matrix(self, service):
        """Test precession matrix calculation"""
        # For J2000 epoch (T=0), should get identity matrix
        matrix = service.calculate_precession_matrix(0.0)
        
        # Check it's close to identity
        assert matrix[0][0] == pytest.approx(1.0, abs=1e-6)
        assert matrix[1][1] == pytest.approx(1.0, abs=1e-6)
        assert matrix[2][2] == pytest.approx(1.0, abs=1e-6)
        
        # Off-diagonal elements should be very small
        assert abs(matrix[0][1]) < 1e-6
        assert abs(matrix[0][2]) < 1e-6
        assert abs(matrix[1][0]) < 1e-6
        
        # For non-zero T, matrix should change
        matrix_future = service.calculate_precession_matrix(0.5)  # 50 years
        
        # Diagonal elements should still be close to 1
        assert matrix_future[0][0] == pytest.approx(1.0, abs=1e-3)
        
        # But matrix should be different from identity
        assert matrix_future != matrix
    
    def test_apply_precession(self, service):
        """Test precession application"""
        # Create test coordinates
        coords = Coordinates(ra=0.0, dec=0.0, epoch=2000.0)
        
        # Apply precession to same epoch (should be unchanged)
        j2000_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        new_coords = service.apply_precession(coords, j2000_date)
        
        assert new_coords.ra == pytest.approx(coords.ra, abs=1e-6)
        assert new_coords.dec == pytest.approx(coords.dec, abs=1e-6)
        
        # Apply precession to future date
        future_date = datetime(2050, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        future_coords = service.apply_precession(coords, future_date)
        
        # Coordinates should change
        assert future_coords.ra != coords.ra
        assert future_coords.epoch == pytest.approx(2050.0, rel=1e-3)
    
    def test_apply_precession_pole_star(self, service):
        """Test precession for Polaris (near celestial pole)"""
        # Polaris coordinates (approximately)
        polaris = Coordinates(ra=37.95, dec=89.26, epoch=2000.0)
        
        # Apply precession to 2025
        date_2025 = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        polaris_2025 = service.apply_precession(polaris, date_2025)
        
        # Declination should remain very high (near pole)
        assert polaris_2025.dec > 89.0
        
        # RA should change due to precession
        assert polaris_2025.ra != polaris.ra
    
    def test_calculate_nutation(self, service):
        """Test nutation calculation"""
        # Nutation at J2000
        j2000_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        nut_lon, nut_obl = service.calculate_nutation(j2000_date)
        
        # Nutation values should be small (arcseconds)
        assert abs(nut_lon) < 20.0  # Less than 20 arcseconds
        assert abs(nut_obl) < 10.0  # Less than 10 arcseconds
        
        # Test at different date
        future_date = datetime(2025, 6, 15, 0, 0, 0, tzinfo=timezone.utc)
        nut_lon_future, nut_obl_future = service.calculate_nutation(future_date)
        
        # Should be different
        assert nut_lon_future != nut_lon
        assert nut_obl_future != nut_obl
    
    def test_apply_nutation(self, service):
        """Test nutation application"""
        coords = Coordinates(ra=100.0, dec=25.0, epoch=2000.0)
        date = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        
        # Mock nutation calculation
        with patch.object(service, 'calculate_nutation', return_value=(5.0, 3.0)):
            with patch.object(service, 'mean_obliquity', return_value=23.4):
                nutated = service.apply_nutation(coords, date)
        
        # Coordinates should change slightly
        assert nutated.ra != coords.ra
        assert nutated.dec != coords.dec
        
        # Changes should be small (nutation is a small effect)
        assert abs(nutated.ra - coords.ra) < 0.01  # Less than 0.01 degrees
        assert abs(nutated.dec - coords.dec) < 0.01
    
    def test_mean_obliquity(self, service):
        """Test mean obliquity calculation"""
        # At J2000
        j2000_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        obliquity = service.mean_obliquity(j2000_date)
        
        # Should be approximately 23.44 degrees
        assert obliquity == pytest.approx(23.44, abs=0.01)
        
        # Test at different date
        future_date = datetime(2100, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        future_obliquity = service.mean_obliquity(future_date)
        
        # Should be slightly different due to secular variation
        assert future_obliquity != obliquity
        assert abs(future_obliquity - obliquity) < 0.1  # Changes slowly
    
    def test_j2000_to_current(self, service):
        """Test complete J2000 to current epoch transformation"""
        # Test star coordinates
        star_j2000 = Coordinates(ra=83.633, dec=22.014, epoch=2000.0)  # Near Aldebaran
        
        # Transform to current date
        current_date = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        
        with patch('services.coordinate_service.logger'):
            current_coords = service.j2000_to_current(
                star_j2000.ra, 
                star_j2000.dec, 
                current_date
            )
        
        # Should return tuple
        assert isinstance(current_coords, tuple)
        assert len(current_coords) == 2
        
        ra_current, dec_current = current_coords
        
        # Coordinates should change due to precession
        assert ra_current != star_j2000.ra
        assert dec_current != star_j2000.dec
        
        # Changes should be reasonable (precession is slow)
        assert abs(ra_current - star_j2000.ra) < 1.0  # Less than 1 degree
        assert abs(dec_current - star_j2000.dec) < 1.0
    
    def test_current_to_j2000(self, service):
        """Test current epoch to J2000 transformation"""
        # Current epoch coordinates
        current_date = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        ra_current = 84.0
        dec_current = 22.0
        
        with patch('services.coordinate_service.logger'):
            ra_j2000, dec_j2000 = service.current_to_j2000(
                ra_current,
                dec_current, 
                current_date
            )
        
        # Transform back should give original (approximately)
        ra_check, dec_check = service.j2000_to_current(
            ra_j2000,
            dec_j2000,
            current_date
        )
        
        assert ra_check == pytest.approx(ra_current, abs=1e-6)
        assert dec_check == pytest.approx(dec_current, abs=1e-6)
    
    def test_coordinate_validation(self, service):
        """Test coordinate validation in transformations"""
        date = datetime.now(timezone.utc)
        
        # Valid coordinates should work
        ra, dec = service.j2000_to_current(180.0, 0.0, date)
        assert 0 <= ra < 360
        assert -90 <= dec <= 90
        
        # Test edge cases
        ra, dec = service.j2000_to_current(359.9, 89.9, date)
        assert 0 <= ra < 360
        assert -90 <= dec <= 90
        
        # Test wrap-around
        ra, dec = service.j2000_to_current(0.1, -89.9, date)
        assert 0 <= ra < 360
        assert -90 <= dec <= 90
    
    def test_proper_motion_placeholder(self, service):
        """Test that proper motion is mentioned but not implemented"""
        # This is more of a documentation test
        # The service should handle proper motion in the future
        coords = Coordinates(ra=100.0, dec=25.0, epoch=2000.0)
        
        # Current implementation doesn't use proper motion
        # Just verify the transformation works without it
        future_date = datetime(2050, 1, 1, tzinfo=timezone.utc)
        new_coords = service.apply_precession(coords, future_date)
        
        assert new_coords.epoch == pytest.approx(2050.0, rel=1e-3)


class TestCoordinateServiceIntegration:
    """Integration tests for coordinate service"""
    
    @pytest.fixture 
    def service(self):
        """Create service instance"""
        return CoordinateTransformationService()
    
    def test_round_trip_transformation(self, service):
        """Test that transforming to current and back gives original"""
        original_ra = 123.456
        original_dec = -45.678
        test_date = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
        
        # Transform J2000 -> Current
        ra_current, dec_current = service.j2000_to_current(
            original_ra, original_dec, test_date
        )
        
        # Transform Current -> J2000
        ra_j2000, dec_j2000 = service.current_to_j2000(
            ra_current, dec_current, test_date
        )
        
        # Should match original within precision
        assert ra_j2000 == pytest.approx(original_ra, abs=1e-8)
        assert dec_j2000 == pytest.approx(original_dec, abs=1e-8)
    
    def test_known_star_positions(self, service):
        """Test with known star positions"""
        # Vega approximate J2000 coordinates
        vega_j2000 = Coordinates(ra=279.234, dec=38.784, epoch=2000.0)
        
        # Transform to 2025
        date_2025 = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        ra_2025, dec_2025 = service.j2000_to_current(
            vega_j2000.ra, vega_j2000.dec, date_2025
        )
        
        # Vega should move slightly due to precession
        # RA should increase slightly
        assert ra_2025 > vega_j2000.ra
        assert ra_2025 < vega_j2000.ra + 0.5  # Less than 0.5 degree in 25 years
        
        # Dec should also change slightly
        assert abs(dec_2025 - vega_j2000.dec) < 0.2
    
    def test_batch_transformation_performance(self, service):
        """Test performance with multiple transformations"""
        import time
        
        # Create 100 random coordinates
        import random
        coords_list = [
            Coordinates(
                ra=random.uniform(0, 360),
                dec=random.uniform(-90, 90),
                epoch=2000.0
            )
            for _ in range(100)
        ]
        
        test_date = datetime.now(timezone.utc)
        
        # Time the transformations
        start_time = time.time()
        
        for coords in coords_list:
            service.j2000_to_current(coords.ra, coords.dec, test_date)
        
        elapsed = time.time() - start_time
        
        # Should be reasonably fast (less than 0.1 seconds for 100 transforms)
        assert elapsed < 0.1