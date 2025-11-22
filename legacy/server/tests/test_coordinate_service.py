"""Tests for coordinate transformation service."""

import math
import pytest
from datetime import datetime, timezone

from services.coordinate_service import CoordinateTransformationService, get_coordinate_service


class TestCoordinateTransformationService:
    """Test coordinate transformation service."""
    
    @pytest.fixture
    def service(self):
        """Create a coordinate service instance."""
        return CoordinateTransformationService()
    
    def test_service_initialization(self, service):
        """Test service initialization."""
        assert service is not None
        assert service.J2000_EPOCH == 2000.0
        assert service.J2000_JD == 2451545.0
    
    def test_global_service_instance(self):
        """Test global service instance."""
        service1 = get_coordinate_service()
        service2 = get_coordinate_service()
        assert service1 is service2  # Should be same instance
    
    def test_julian_day_calculation(self, service):
        """Test Julian Day calculation."""
        # Test J2000.0 epoch (January 1, 2000, 12:00 UTC)
        j2000_date = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        jd = service.julian_day_from_date(j2000_date)
        
        # Should be exactly 2451545.0
        assert abs(jd - 2451545.0) < 0.001
    
    def test_julian_epoch_conversion(self, service):
        """Test conversion between Julian Day and Julian epoch."""
        # Test J2000.0
        jd_j2000 = 2451545.0
        epoch = service.julian_epoch_from_jd(jd_j2000)
        assert abs(epoch - 2000.0) < 0.001
        
        # Test round trip
        jd_back = service.jd_from_julian_epoch(epoch)
        assert abs(jd_back - jd_j2000) < 0.001
    
    def test_coordinate_validation(self, service):
        """Test coordinate validation."""
        # Valid coordinates
        assert service.validate_coordinates(0.0, 0.0)
        assert service.validate_coordinates(180.0, 45.0)
        assert service.validate_coordinates(360.0, 90.0)
        assert service.validate_coordinates(270.0, -90.0)
        
        # Invalid RA
        assert not service.validate_coordinates(-1.0, 0.0)
        assert not service.validate_coordinates(361.0, 0.0)
        
        # Invalid Dec
        assert not service.validate_coordinates(0.0, -91.0)
        assert not service.validate_coordinates(0.0, 91.0)
    
    def test_coordinate_difference(self, service):
        """Test angular separation calculation."""
        # Same coordinates should have zero separation
        sep = service.coordinate_difference_arcseconds(0.0, 0.0, 0.0, 0.0)
        assert abs(sep) < 0.001
        
        # 1 degree separation
        sep = service.coordinate_difference_arcseconds(0.0, 0.0, 1.0, 0.0)
        assert abs(sep - 3600.0) < 1.0  # Should be 3600 arcseconds ± 1
        
        # Test known separation (Polaris to Vega approximately)
        # Polaris: RA ≈ 37.95°, Dec ≈ 89.26°
        # Vega: RA ≈ 279.23°, Dec ≈ 38.78°
        sep = service.coordinate_difference_arcseconds(37.95, 89.26, 279.23, 38.78)
        # This should be about 51.5 degrees or ~185,400 arcseconds
        assert 180000 < sep < 190000
    
    def test_precession_known_values(self, service):
        """Test precession using known star positions."""
        # Test with a well-known star: Sirius
        # J2000 coordinates: RA = 101.287°, Dec = -16.716°
        ra_j2000 = 101.287
        dec_j2000 = -16.716
        
        # Precess from J2000 to J2025 (25 years)
        ra_2025, dec_2025 = service.precess_coordinates(ra_j2000, dec_j2000, 2000.0, 2025.0)
        
        # Precession should cause a measurable but small change
        # For 25 years, typical precession is ~1 arcminute
        ra_diff_arcmin = abs(ra_2025 - ra_j2000) * 60  # Convert to arcminutes
        dec_diff_arcmin = abs(dec_2025 - dec_j2000) * 60
        
        # Should be between 0.5 and 2 arcminutes for 25 years
        assert 0.5 < ra_diff_arcmin < 2.0
        assert 0.1 < dec_diff_arcmin < 1.0  # Dec changes less near equator
        
        print(f"Sirius precession (25 years): RA change = {ra_diff_arcmin:.2f}', Dec change = {dec_diff_arcmin:.2f}'")
    
    def test_precession_reversibility(self, service):
        """Test that precession is reversible."""
        # Original coordinates
        ra_orig = 123.456
        dec_orig = 45.678
        
        # Precess forward then backward
        ra_forward, dec_forward = service.precess_coordinates(ra_orig, dec_orig, 2000.0, 2025.0)
        ra_back, dec_back = service.precess_coordinates(ra_forward, dec_forward, 2025.0, 2000.0)
        
        # Should get back to original coordinates within numerical precision
        assert abs(ra_back - ra_orig) < 0.001
        assert abs(dec_back - dec_orig) < 0.001
    
    def test_j2000_to_current_epoch_conversion(self, service):
        """Test J2000 to current epoch conversion."""
        # Test coordinates for Vega (bright star)
        ra_j2000 = 279.234734787  # Vega J2000
        dec_j2000 = 38.783688956
        
        # Convert to epoch 2025.0
        test_date = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        ra_current, dec_current = service.j2000_to_current_epoch(ra_j2000, dec_j2000, test_date)
        
        # Should be different from J2000 coordinates
        assert abs(ra_current - ra_j2000) > 0.01  # At least 0.01 degrees difference
        
        # Coordinates should still be valid
        assert service.validate_coordinates(ra_current, dec_current)
        
        print(f"Vega J2000: RA={ra_j2000:.6f}, Dec={dec_j2000:.6f}")
        print(f"Vega 2025: RA={ra_current:.6f}, Dec={dec_current:.6f}")
    
    def test_current_epoch_to_j2000_conversion(self, service):
        """Test current epoch to J2000 conversion."""
        # Start with some current coordinates
        ra_current = 280.0
        dec_current = 39.0
        
        # Convert to J2000
        test_date = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        ra_j2000, dec_j2000 = service.current_epoch_to_j2000(ra_current, dec_current, test_date)
        
        # Should be different from current coordinates
        assert abs(ra_j2000 - ra_current) > 0.01
        
        # Coordinates should still be valid
        assert service.validate_coordinates(ra_j2000, dec_j2000)
    
    def test_round_trip_conversion(self, service):
        """Test round-trip conversion (J2000 -> current -> J2000)."""
        # Original J2000 coordinates
        ra_j2000_orig = 150.123
        dec_j2000_orig = 25.456
        
        test_date = datetime(2024, 6, 15, 18, 30, 0, tzinfo=timezone.utc)
        
        # Convert to current epoch
        ra_current, dec_current = service.j2000_to_current_epoch(
            ra_j2000_orig, dec_j2000_orig, test_date
        )
        
        # Convert back to J2000
        ra_j2000_back, dec_j2000_back = service.current_epoch_to_j2000(
            ra_current, dec_current, test_date
        )
        
        # Should get back to original coordinates within small tolerance
        assert abs(ra_j2000_back - ra_j2000_orig) < 0.001
        assert abs(dec_j2000_back - dec_j2000_orig) < 0.001
    
    def test_polar_coordinates(self, service):
        """Test precession near celestial poles."""
        # Test near north celestial pole (Polaris region)
        ra_pole = 37.954561  # Polaris J2000 RA
        dec_pole = 89.264109  # Polaris J2000 Dec
        
        ra_new, dec_new = service.precess_coordinates(ra_pole, dec_pole, 2000.0, 2025.0)
        
        # Coordinates should still be valid and near the pole
        assert service.validate_coordinates(ra_new, dec_new)
        assert dec_new > 88.0  # Should still be very close to pole
        
        # Test near south celestial pole
        ra_south = 0.0
        dec_south = -89.0
        
        ra_new_s, dec_new_s = service.precess_coordinates(ra_south, dec_south, 2000.0, 2025.0)
        assert service.validate_coordinates(ra_new_s, dec_new_s)
        assert dec_new_s < -88.0
    
    def test_ra_wraparound(self, service):
        """Test RA wraparound at 0/360 boundary."""
        # Test coordinates near RA = 0/360
        ra_near_zero = 359.5
        dec_test = 45.0
        
        ra_new, dec_new = service.precess_coordinates(ra_near_zero, dec_test, 2000.0, 2025.0)
        
        # Should still be valid coordinates
        assert service.validate_coordinates(ra_new, dec_new)
        
        # RA might wrap around 0/360 boundary
        assert 0.0 <= ra_new <= 360.0
    
    def test_different_time_spans(self, service):
        """Test precession over different time spans."""
        ra_test = 180.0
        dec_test = 0.0
        
        # Test different time spans
        spans = [1, 5, 10, 25, 50, 100]  # years
        
        for span in spans:
            ra_new, dec_new = service.precess_coordinates(ra_test, dec_test, 2000.0, 2000.0 + span)
            
            # Larger time spans should show larger changes
            ra_change = abs(ra_new - ra_test) * 3600  # arcseconds
            dec_change = abs(dec_new - dec_test) * 3600
            
            # Precession rate is roughly 50 arcseconds per year
            expected_change = span * 50  # rough estimate
            
            # Should be within order of magnitude
            assert ra_change < expected_change * 2  # Allow factor of 2 variation
            
            print(f"Precession over {span} years: RA change = {ra_change:.1f}\", Dec change = {dec_change:.1f}\"")
    
    def test_performance_benchmark(self, service):
        """Test performance of coordinate conversion."""
        import time
        
        # Test coordinates
        ra_test = 123.456
        dec_test = 45.678
        test_date = datetime.now(timezone.utc)
        
        # Benchmark J2000 to current conversion
        start_time = time.time()
        iterations = 1000
        
        for _ in range(iterations):
            ra_new, dec_new = service.j2000_to_current_epoch(ra_test, dec_test, test_date)
        
        elapsed = time.time() - start_time
        per_conversion = elapsed / iterations * 1000  # ms per conversion
        
        print(f"Performance: {per_conversion:.3f} ms per coordinate conversion")
        
        # Should be fast enough for real-time use (< 1ms per conversion)
        assert per_conversion < 1.0


# Integration tests
class TestCoordinateServiceIntegration:
    """Integration tests with real astronomical data."""
    
    def test_bright_stars_precession(self):
        """Test precession with catalog of bright stars."""
        service = get_coordinate_service()
        
        # Bright stars with J2000 coordinates
        bright_stars = [
            ("Sirius", 101.287, -16.716),
            ("Canopus", 95.988, -52.696),
            ("Arcturus", 213.915, 19.182),
            ("Vega", 279.235, 38.784),
            ("Capella", 79.172, 45.998),
            ("Rigel", 78.634, -8.202),
            ("Procyon", 114.825, 5.225),
            ("Betelgeuse", 88.793, 7.407),
        ]
        
        target_date = datetime(2025, 1, 1, tzinfo=timezone.utc)
        
        for name, ra_j2000, dec_j2000 in bright_stars:
            # Convert to current epoch
            ra_current, dec_current = service.j2000_to_current_epoch(
                ra_j2000, dec_j2000, target_date
            )
            
            # Calculate change in arcseconds
            ra_change = abs(ra_current - ra_j2000) * 3600
            dec_change = abs(dec_current - dec_j2000) * 3600
            
            # Should show reasonable precession (roughly 50"/year * 25 years = ~20')
            assert 0 < ra_change < 2000  # Less than 2000 arcseconds
            assert 0 < dec_change < 1000  # Less than 1000 arcseconds
            
            print(f"{name}: RA change = {ra_change:.1f}\", Dec change = {dec_change:.1f}\"")
    
    def test_messier_objects_conversion(self):
        """Test conversion with Messier catalog objects."""
        service = get_coordinate_service()
        
        # Sample Messier objects with J2000 coordinates
        messier_objects = [
            ("M1 (Crab Nebula)", 83.633, 22.014),
            ("M31 (Andromeda)", 10.685, 41.269),
            ("M42 (Orion Nebula)", 83.822, -5.391),
            ("M45 (Pleiades)", 56.75, 24.117),
            ("M57 (Ring Nebula)", 283.396, 33.029),
        ]
        
        current_date = datetime.now(timezone.utc)
        
        for name, ra_j2000, dec_j2000 in messier_objects:
            # Validate input coordinates
            assert service.validate_coordinates(ra_j2000, dec_j2000)
            
            # Convert to current epoch
            ra_current, dec_current = service.j2000_to_current_epoch(
                ra_j2000, dec_j2000, current_date
            )
            
            # Validate output coordinates
            assert service.validate_coordinates(ra_current, dec_current)
            
            # Test round trip
            ra_back, dec_back = service.current_epoch_to_j2000(
                ra_current, dec_current, current_date
            )
            
            # Should be close to original
            assert abs(ra_back - ra_j2000) < 0.001
            assert abs(dec_back - dec_j2000) < 0.001
            
            print(f"{name}: J2000=({ra_j2000:.3f}, {dec_j2000:.3f}) -> "
                  f"Current=({ra_current:.3f}, {dec_current:.3f})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])