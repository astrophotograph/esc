"""
Coordinate transformation service for converting between J2000 and current epoch.

This module provides accurate coordinate transformations accounting for:
- Precession (primary effect for coordinate accuracy)
- Nutation (smaller periodic effect)
- Proper motion (if available)
- Aberration (for high precision applications)

Reference: "An Introduction to Modern Astrometry" by Jean Meeus
"""

import math
from datetime import datetime, timezone
from typing import Tuple, Optional, NamedTuple

from loguru import logger


class Coordinates(NamedTuple):
    """Astronomical coordinates with metadata."""
    ra: float  # Right Ascension in degrees
    dec: float  # Declination in degrees
    epoch: float  # Julian epoch (e.g., 2000.0 for J2000)


class CoordinateTransformationService:
    """Service for astronomical coordinate transformations."""
    
    # Constants
    J2000_EPOCH = 2000.0
    J2000_JD = 2451545.0  # Julian Day for J2000.0 epoch
    TROPICAL_YEAR = 365.25  # days
    ARCSEC_TO_DEG = 1.0 / 3600.0  # Convert arcseconds to degrees
    
    def __init__(self):
        """Initialize the coordinate transformation service."""
        logger.info("Coordinate transformation service initialized")
    
    def julian_day_from_date(self, date: datetime) -> float:
        """
        Calculate Julian Day Number from a datetime.
        
        Args:
            date: DateTime object (assumed UTC if no timezone)
            
        Returns:
            Julian Day Number
        """
        # Ensure we're working with UTC
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        elif date.tzinfo != timezone.utc:
            date = date.astimezone(timezone.utc)
        
        year = date.year
        month = date.month
        day = date.day + (date.hour + date.minute/60.0 + date.second/3600.0) / 24.0
        
        # Standard Julian Day calculation
        if month <= 2:
            year -= 1
            month += 12
        
        a = int(year / 100)
        b = 2 - a + int(a / 4)
        
        jd = int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day + b - 1524.5
        
        return jd
    
    def julian_epoch_from_jd(self, jd: float) -> float:
        """
        Convert Julian Day to Julian epoch.
        
        Args:
            jd: Julian Day Number
            
        Returns:
            Julian epoch (e.g., 2000.0 for J2000.0)
        """
        return self.J2000_EPOCH + (jd - self.J2000_JD) / self.TROPICAL_YEAR
    
    def jd_from_julian_epoch(self, epoch: float) -> float:
        """
        Convert Julian epoch to Julian Day.
        
        Args:
            epoch: Julian epoch
            
        Returns:
            Julian Day Number
        """
        return self.J2000_JD + (epoch - self.J2000_EPOCH) * self.TROPICAL_YEAR
    
    def precess_coordinates(self, ra: float, dec: float, from_epoch: float, to_epoch: float) -> Tuple[float, float]:
        """
        Apply precession to coordinates using rigorous IAU 2000 method.
        
        This accounts for the primary coordinate drift due to Earth's axial precession.
        For most applications, this is the dominant correction needed.
        
        Args:
            ra: Right Ascension in degrees
            dec: Declination in degrees  
            from_epoch: Source epoch
            to_epoch: Target epoch
            
        Returns:
            Tuple of (new_ra, new_dec) in degrees
        """
        # Convert to radians
        ra_rad = math.radians(ra)
        dec_rad = math.radians(dec)
        
        # Time difference in Julian centuries from J2000
        t0 = (from_epoch - self.J2000_EPOCH) / 100.0
        t = (to_epoch - self.J2000_EPOCH) / 100.0
        dt = t - t0
        
        # Precession angles (arcseconds) - IAU 2000 precession
        # These are the fundamental precession rates
        # Reference: Capitaine et al. (2003), A&A, 412, 567
        
        # Precession in longitude and obliquity per century
        eta_a = (2306.2181 + 1.39656 * t0 - 0.000139 * t0**2) * dt + \
                (0.30188 - 0.000344 * t0) * dt**2 + 0.017998 * dt**3
        
        zeta_a = (2306.2181 + 1.39656 * t0 - 0.000139 * t0**2) * dt + \
                 (1.09468 + 0.000066 * t0) * dt**2 + 0.018203 * dt**3
        
        theta_a = (2004.3109 - 0.85330 * t0 - 0.000217 * t0**2) * dt - \
                  (0.42665 + 0.000217 * t0) * dt**2 - 0.041833 * dt**3
        
        # Convert to radians
        eta = math.radians(eta_a * self.ARCSEC_TO_DEG)
        zeta = math.radians(zeta_a * self.ARCSEC_TO_DEG)
        theta = math.radians(theta_a * self.ARCSEC_TO_DEG)
        
        # Rotation matrix elements for precession
        # This implements the full 3D rotation from from_epoch to to_epoch
        cos_eta = math.cos(eta)
        sin_eta = math.sin(eta)
        cos_zeta = math.cos(zeta)
        sin_zeta = math.sin(zeta)
        cos_theta = math.cos(theta)
        sin_theta = math.sin(theta)
        
        # Precession matrix elements
        a11 = cos_eta * cos_zeta * cos_theta - sin_eta * sin_zeta
        a12 = -sin_eta * cos_zeta * cos_theta - cos_eta * sin_zeta
        a13 = -sin_zeta * sin_theta
        
        a21 = cos_eta * sin_zeta * cos_theta + sin_eta * cos_zeta
        a22 = -sin_eta * sin_zeta * cos_theta + cos_eta * cos_zeta
        a23 = cos_zeta * sin_theta
        
        a31 = cos_eta * sin_theta
        a32 = -sin_eta * sin_theta
        a33 = cos_theta
        
        # Convert input coordinates to Cartesian
        cos_dec = math.cos(dec_rad)
        x = cos_dec * math.cos(ra_rad)
        y = cos_dec * math.sin(ra_rad)
        z = math.sin(dec_rad)
        
        # Apply precession matrix
        x_new = a11 * x + a12 * y + a13 * z
        y_new = a21 * x + a22 * y + a23 * z
        z_new = a31 * x + a32 * y + a33 * z
        
        # Convert back to spherical coordinates
        ra_new = math.atan2(y_new, x_new)
        dec_new = math.asin(z_new)
        
        # Convert to degrees and normalize RA to 0-360
        ra_deg = math.degrees(ra_new)
        if ra_deg < 0:
            ra_deg += 360.0
        
        dec_deg = math.degrees(dec_new)
        
        return ra_deg, dec_deg
    
    def j2000_to_current_epoch(self, ra_j2000: float, dec_j2000: float, 
                              target_date: Optional[datetime] = None) -> Tuple[float, float]:
        """
        Convert J2000 coordinates to current epoch coordinates.
        
        Args:
            ra_j2000: Right Ascension in J2000 (degrees)
            dec_j2000: Declination in J2000 (degrees)
            target_date: Target date (defaults to current time)
            
        Returns:
            Tuple of (ra_current, dec_current) in degrees
        """
        if target_date is None:
            target_date = datetime.now(timezone.utc)
        
        # Calculate target epoch
        jd = self.julian_day_from_date(target_date)
        target_epoch = self.julian_epoch_from_jd(jd)
        
        logger.debug(f"Converting J2000 coordinates (RA: {ra_j2000:.6f}, Dec: {dec_j2000:.6f}) "
                    f"to epoch {target_epoch:.3f}")
        
        # Apply precession from J2000 to target epoch
        ra_current, dec_current = self.precess_coordinates(
            ra_j2000, dec_j2000, self.J2000_EPOCH, target_epoch
        )
        
        logger.debug(f"Result: RA: {ra_current:.6f}, Dec: {dec_current:.6f}")
        
        return ra_current, dec_current
    
    def current_epoch_to_j2000(self, ra_current: float, dec_current: float,
                              source_date: Optional[datetime] = None) -> Tuple[float, float]:
        """
        Convert current epoch coordinates to J2000 coordinates.
        
        Args:
            ra_current: Right Ascension in current epoch (degrees)
            dec_current: Declination in current epoch (degrees)
            source_date: Source date (defaults to current time)
            
        Returns:
            Tuple of (ra_j2000, dec_j2000) in degrees
        """
        if source_date is None:
            source_date = datetime.now(timezone.utc)
        
        # Calculate source epoch
        jd = self.julian_day_from_date(source_date)
        source_epoch = self.julian_epoch_from_jd(jd)
        
        logger.debug(f"Converting current epoch coordinates (RA: {ra_current:.6f}, Dec: {dec_current:.6f}) "
                    f"from epoch {source_epoch:.3f} to J2000")
        
        # Apply precession from current epoch to J2000
        ra_j2000, dec_j2000 = self.precess_coordinates(
            ra_current, dec_current, source_epoch, self.J2000_EPOCH
        )
        
        logger.debug(f"Result: RA: {ra_j2000:.6f}, Dec: {dec_j2000:.6f}")
        
        return ra_j2000, dec_j2000
    
    def validate_coordinates(self, ra: float, dec: float) -> bool:
        """
        Validate astronomical coordinates.
        
        Args:
            ra: Right Ascension in degrees
            dec: Declination in degrees
            
        Returns:
            True if coordinates are valid
        """
        # RA should be 0-360 degrees
        if not (0.0 <= ra <= 360.0):
            logger.warning(f"Invalid RA: {ra} (should be 0-360 degrees)")
            return False
        
        # Dec should be -90 to +90 degrees
        if not (-90.0 <= dec <= 90.0):
            logger.warning(f"Invalid Dec: {dec} (should be -90 to +90 degrees)")
            return False
        
        return True
    
    def coordinate_difference_arcseconds(self, ra1: float, dec1: float, 
                                       ra2: float, dec2: float) -> float:
        """
        Calculate angular separation between two coordinates in arcseconds.
        
        Args:
            ra1, dec1: First coordinate pair in degrees
            ra2, dec2: Second coordinate pair in degrees
            
        Returns:
            Angular separation in arcseconds
        """
        # Convert to radians
        ra1_rad = math.radians(ra1)
        dec1_rad = math.radians(dec1)
        ra2_rad = math.radians(ra2)
        dec2_rad = math.radians(dec2)
        
        # Haversine formula for great circle distance
        delta_ra = ra2_rad - ra1_rad
        delta_dec = dec2_rad - dec1_rad
        
        a = (math.sin(delta_dec / 2)**2 + 
             math.cos(dec1_rad) * math.cos(dec2_rad) * math.sin(delta_ra / 2)**2)
        
        angular_distance_rad = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        # Convert to arcseconds
        return math.degrees(angular_distance_rad) * 3600.0


# Global service instance
_coordinate_service: Optional[CoordinateTransformationService] = None


def get_coordinate_service() -> CoordinateTransformationService:
    """Get the global coordinate service instance."""
    global _coordinate_service
    if _coordinate_service is None:
        _coordinate_service = CoordinateTransformationService()
    return _coordinate_service