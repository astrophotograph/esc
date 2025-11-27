"""Imaging module for FITS processing and image enhancement."""

from .imaging_service import (
    ImagingService,
    process_fits,
    enhance_image,
    reprocess_fits,
    get_stretch_modes,
    get_enhancement_methods,
    get_processed_image,
    cleanup_image,
)

from .astrometry_client import (
    AstrometryClient,
    solve_image_sync,
    solve_image_base64,
)

__all__ = [
    "ImagingService",
    "process_fits",
    "enhance_image",
    "reprocess_fits",
    "get_stretch_modes",
    "get_enhancement_methods",
    "get_processed_image",
    "cleanup_image",
    "AstrometryClient",
    "solve_image_sync",
    "solve_image_base64",
]
