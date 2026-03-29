"""Imaging service for FITS processing and image enhancement.

This module provides image processing features for astronomical imaging,
leveraging the scopinator imaging library.
"""

import base64
import io
import os
import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image
from pydantic import BaseModel, Field

# Import scopinator imaging modules
try:
    from scopinator.imaging.fits_handler import FITSHandler
    from scopinator.imaging.upscaler import (
        DenoiseMethod,
        ImageEnhancementProcessor,
        ImageUpscaler,
        SharpeningMethod,
        UpscalingMethod,
    )

    SCOPINATOR_AVAILABLE = True
except ImportError:
    SCOPINATOR_AVAILABLE = False


class StretchMode(str, Enum):
    """Available stretch modes for FITS processing."""

    NO_STRETCH = "No Stretch"
    BG_10_SIGMA_3 = "10% Bg, 3 sigma"
    BG_15_SIGMA_3 = "15% Bg, 3 sigma"  # Default
    BG_20_SIGMA_3 = "20% Bg, 3 sigma"
    BG_30_SIGMA_2 = "30% Bg, 2 sigma"


class ProcessingParams(BaseModel):
    """Parameters for FITS processing."""

    stretch_mode: str = Field(default="15% Bg, 3 sigma", description="Stretch mode")
    output_format: str = Field(default="png", description="Output format (png, jpeg)")
    quality: int = Field(default=95, ge=1, le=100, description="JPEG quality")


class EnhancementParams(BaseModel):
    """Parameters for image enhancement."""

    # Upscaling
    upscale_enabled: bool = Field(default=False, description="Enable upscaling")
    upscale_factor: float = Field(default=2.0, ge=1.0, le=4.0, description="Upscale factor")
    upscale_method: str = Field(default="LANCZOS", description="Upscale method")

    # Denoising
    denoise_enabled: bool = Field(default=False, description="Enable denoising")
    denoise_method: str = Field(default="TV_CHAMBOLLE", description="Denoise method")
    denoise_strength: float = Field(default=0.1, ge=0.0, le=1.0, description="Denoise strength")

    # Sharpening
    sharpen_enabled: bool = Field(default=False, description="Enable sharpening")
    sharpen_method: str = Field(default="UNSHARP_MASK", description="Sharpen method")
    sharpen_strength: float = Field(default=0.5, ge=0.0, le=2.0, description="Sharpen strength")

    # Deconvolution
    deconvolution_enabled: bool = Field(default=False, description="Enable deconvolution")
    deconvolution_strength: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Deconvolution strength"
    )
    psf_size: int = Field(default=5, ge=3, le=15, description="PSF size for deconvolution")


class ProcessedImage(BaseModel):
    """Result of image processing."""

    id: str
    original_filename: str
    processed_at: str
    width: int
    height: int
    format: str
    stretch_mode: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    data_base64: Optional[str] = None  # Base64 encoded image data


class ImagingService:
    """Service for FITS processing and image enhancement."""

    def __init__(self, storage_path: Optional[Path] = None):
        """Initialize the imaging service.

        Args:
            storage_path: Path to store processed images. Defaults to temp directory.
        """
        if storage_path:
            self.storage_path = storage_path
        else:
            self.storage_path = Path("/tmp/eesc_imaging")

        self.storage_path.mkdir(parents=True, exist_ok=True)

        if not SCOPINATOR_AVAILABLE:
            raise ImportError("scopinator imaging module not available")

        self.fits_handler = FITSHandler()
        self.upscaler = ImageUpscaler()

    def process_fits(
        self,
        fits_path: str,
        params: Optional[ProcessingParams] = None,
        return_data: bool = True,
    ) -> ProcessedImage:
        """Process a FITS file with stretching.

        Args:
            fits_path: Path to FITS file
            params: Processing parameters
            return_data: Whether to include base64 image data in result

        Returns:
            ProcessedImage with result information
        """
        if params is None:
            params = ProcessingParams()

        # Read FITS file
        image_data, metadata = self.fits_handler.read_fits_file(fits_path)

        # Apply stretch
        stretched = self.fits_handler.normalize_image_data(
            image_data, stretch_mode=params.stretch_mode
        )

        # Convert to PIL Image
        if stretched.dtype != np.uint8:
            stretched = (stretched * 255).astype(np.uint8)

        # Handle grayscale vs color
        if len(stretched.shape) == 2:
            pil_image = Image.fromarray(stretched, mode="L")
        elif stretched.shape[2] == 1:
            pil_image = Image.fromarray(stretched[:, :, 0], mode="L")
        else:
            pil_image = Image.fromarray(stretched, mode="RGB")

        # Generate output
        image_id = str(uuid.uuid4())
        output_filename = f"{image_id}.{params.output_format}"
        output_path = self.storage_path / output_filename

        # Save to file
        if params.output_format.lower() == "jpeg":
            pil_image.save(output_path, "JPEG", quality=params.quality)
        else:
            pil_image.save(output_path, "PNG")

        # Get base64 data if requested
        data_base64 = None
        if return_data:
            buffer = io.BytesIO()
            if params.output_format.lower() == "jpeg":
                pil_image.save(buffer, "JPEG", quality=params.quality)
            else:
                pil_image.save(buffer, "PNG")
            data_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        # Clean metadata for JSON serialization
        clean_metadata = {}
        for key, value in metadata.items():
            if isinstance(value, (str, int, float, bool)):
                clean_metadata[key] = value
            elif hasattr(value, "item"):  # numpy scalar
                clean_metadata[key] = value.item()
            else:
                clean_metadata[key] = str(value)

        return ProcessedImage(
            id=image_id,
            original_filename=os.path.basename(fits_path),
            processed_at=datetime.utcnow().isoformat(),
            width=pil_image.width,
            height=pil_image.height,
            format=params.output_format,
            stretch_mode=params.stretch_mode,
            metadata=clean_metadata,
            data_base64=data_base64,
        )

    def enhance_image(
        self,
        image_path: str,
        params: EnhancementParams,
        return_data: bool = True,
    ) -> ProcessedImage:
        """Apply enhancements to an image.

        Args:
            image_path: Path to image file (PNG, JPEG, or FITS)
            params: Enhancement parameters
            return_data: Whether to include base64 image data in result

        Returns:
            ProcessedImage with result information
        """
        # Load image
        if image_path.lower().endswith((".fits", ".fit")):
            image_data, metadata = self.fits_handler.read_fits_file(image_path)
            if image_data.dtype != np.uint8:
                image_data = (image_data * 255).astype(np.uint8)
        else:
            pil_image = Image.open(image_path)
            image_data = np.array(pil_image)
            metadata = {}

        # Ensure RGB
        if len(image_data.shape) == 2:
            image_data = np.stack([image_data] * 3, axis=-1)
        elif image_data.shape[2] == 1:
            image_data = np.stack([image_data[:, :, 0]] * 3, axis=-1)

        # Apply upscaling
        if params.upscale_enabled and params.upscale_factor > 1.0:
            method = getattr(UpscalingMethod, params.upscale_method, UpscalingMethod.LANCZOS)
            image_data = self.upscaler.upscale(
                image_data, scale_factor=params.upscale_factor, method=method
            )

        # Apply denoising
        if params.denoise_enabled:
            method = getattr(DenoiseMethod, params.denoise_method, DenoiseMethod.TV_CHAMBOLLE)
            image_data = self.upscaler.denoise_image(
                image_data, method=method, strength=params.denoise_strength
            )

        # Apply sharpening
        if params.sharpen_enabled:
            method = getattr(SharpeningMethod, params.sharpen_method, SharpeningMethod.UNSHARP_MASK)
            image_data = self.upscaler.sharpen_image(
                image_data, method=method, strength=params.sharpen_strength
            )

        # Convert to PIL and save
        if image_data.dtype != np.uint8:
            image_data = np.clip(image_data * 255, 0, 255).astype(np.uint8)

        pil_image = Image.fromarray(image_data, mode="RGB")

        image_id = str(uuid.uuid4())
        output_filename = f"{image_id}_enhanced.png"
        output_path = self.storage_path / output_filename
        pil_image.save(output_path, "PNG")

        # Get base64 data if requested
        data_base64 = None
        if return_data:
            buffer = io.BytesIO()
            pil_image.save(buffer, "PNG")
            data_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        return ProcessedImage(
            id=image_id,
            original_filename=os.path.basename(image_path),
            processed_at=datetime.utcnow().isoformat(),
            width=pil_image.width,
            height=pil_image.height,
            format="png",
            stretch_mode="enhanced",
            metadata=metadata,
            data_base64=data_base64,
        )

    def reprocess_fits(
        self,
        fits_path: str,
        processing_params: Optional[ProcessingParams] = None,
        enhancement_params: Optional[EnhancementParams] = None,
        return_data: bool = True,
    ) -> ProcessedImage:
        """Reprocess a FITS file with new parameters.

        Args:
            fits_path: Path to FITS file
            processing_params: Stretch and output parameters
            enhancement_params: Enhancement parameters
            return_data: Whether to include base64 image data in result

        Returns:
            ProcessedImage with result information
        """
        if processing_params is None:
            processing_params = ProcessingParams()

        # First process with stretch
        result = self.process_fits(fits_path, processing_params, return_data=False)

        # If enhancements requested, apply them
        if enhancement_params and (
            enhancement_params.upscale_enabled
            or enhancement_params.denoise_enabled
            or enhancement_params.sharpen_enabled
            or enhancement_params.deconvolution_enabled
        ):
            processed_path = self.storage_path / f"{result.id}.{result.format}"
            result = self.enhance_image(str(processed_path), enhancement_params, return_data)

        # Load data if requested and not already included
        if return_data and not result.data_base64:
            processed_path = self.storage_path / f"{result.id}.{result.format}"
            with open(processed_path, "rb") as f:
                result.data_base64 = base64.b64encode(f.read()).decode("utf-8")

        return result

    def get_processed_image(self, image_id: str, format: str = "png") -> Optional[bytes]:
        """Get a processed image by ID.

        Args:
            image_id: Image ID
            format: Image format

        Returns:
            Image bytes or None if not found
        """
        path = self.storage_path / f"{image_id}.{format}"
        if path.exists():
            return path.read_bytes()

        # Try enhanced version
        path = self.storage_path / f"{image_id}_enhanced.{format}"
        if path.exists():
            return path.read_bytes()

        return None

    def cleanup_image(self, image_id: str) -> bool:
        """Delete a processed image.

        Args:
            image_id: Image ID to delete

        Returns:
            True if deleted, False if not found
        """
        deleted = False
        for suffix in ["", "_enhanced"]:
            for fmt in ["png", "jpeg", "jpg"]:
                path = self.storage_path / f"{image_id}{suffix}.{fmt}"
                if path.exists():
                    path.unlink()
                    deleted = True
        return deleted

    @staticmethod
    def get_stretch_modes() -> list[dict[str, str]]:
        """Get available stretch modes."""
        return [
            {"id": "No Stretch", "name": "No Stretch", "description": "Simple min-max normalization"},
            {
                "id": "10% Bg, 3 sigma",
                "name": "10% Background, 3σ",
                "description": "Light stretch for bright objects",
            },
            {
                "id": "15% Bg, 3 sigma",
                "name": "15% Background, 3σ",
                "description": "Default stretch (recommended)",
            },
            {
                "id": "20% Bg, 3 sigma",
                "name": "20% Background, 3σ",
                "description": "Medium stretch for faint objects",
            },
            {
                "id": "30% Bg, 2 sigma",
                "name": "30% Background, 2σ",
                "description": "Strong stretch for very faint objects",
            },
        ]

    @staticmethod
    def get_enhancement_methods() -> dict[str, list[dict[str, str]]]:
        """Get available enhancement methods."""
        return {
            "upscale": [
                {"id": "BICUBIC", "name": "Bicubic", "description": "Standard cubic interpolation"},
                {"id": "LANCZOS", "name": "Lanczos", "description": "High-quality resampling"},
                {"id": "EDSR", "name": "EDSR", "description": "AI super-resolution (requires OpenCV contrib)"},
                {"id": "FSRCNN", "name": "FSRCNN", "description": "Fast AI super-resolution"},
                {"id": "ESRGAN", "name": "ESRGAN", "description": "Best quality AI upscaling (requires PyTorch)"},
            ],
            "denoise": [
                {
                    "id": "TV_CHAMBOLLE",
                    "name": "Total Variation",
                    "description": "Best for astronomical images",
                },
                {"id": "BILATERAL", "name": "Bilateral", "description": "Edge-preserving filter"},
                {
                    "id": "NON_LOCAL_MEANS",
                    "name": "Non-Local Means",
                    "description": "Effective for texture",
                },
                {"id": "WAVELET", "name": "Wavelet", "description": "Wavelet-based denoising"},
                {"id": "GAUSSIAN", "name": "Gaussian", "description": "Simple Gaussian blur"},
                {"id": "MEDIAN", "name": "Median", "description": "Good for salt-and-pepper noise"},
            ],
            "sharpen": [
                {"id": "UNSHARP_MASK", "name": "Unsharp Mask", "description": "Classic sharpening"},
                {"id": "LAPLACIAN", "name": "Laplacian", "description": "Edge detection-based"},
                {"id": "HIGH_PASS", "name": "High Pass", "description": "High-frequency enhancement"},
            ],
        }


# Singleton instance
_imaging_service: Optional[ImagingService] = None


def get_imaging_service(storage_path: Optional[str] = None) -> ImagingService:
    """Get or create the imaging service singleton."""
    global _imaging_service
    if _imaging_service is None:
        path = Path(storage_path) if storage_path else None
        _imaging_service = ImagingService(path)
    return _imaging_service


# PyO3-compatible functions
def process_fits(
    fits_path: str,
    stretch_mode: str = "15% Bg, 3 sigma",
    output_format: str = "png",
    quality: int = 95,
    return_data: bool = True,
    storage_path: Optional[str] = None,
) -> dict[str, Any]:
    """Process a FITS file (PyO3 wrapper)."""
    service = get_imaging_service(storage_path)
    params = ProcessingParams(
        stretch_mode=stretch_mode, output_format=output_format, quality=quality
    )
    result = service.process_fits(fits_path, params, return_data)
    return result.model_dump()


def enhance_image(
    image_path: str,
    upscale_enabled: bool = False,
    upscale_factor: float = 2.0,
    upscale_method: str = "LANCZOS",
    denoise_enabled: bool = False,
    denoise_method: str = "TV_CHAMBOLLE",
    denoise_strength: float = 0.1,
    sharpen_enabled: bool = False,
    sharpen_method: str = "UNSHARP_MASK",
    sharpen_strength: float = 0.5,
    deconvolution_enabled: bool = False,
    deconvolution_strength: float = 0.5,
    psf_size: int = 5,
    return_data: bool = True,
    storage_path: Optional[str] = None,
) -> dict[str, Any]:
    """Enhance an image (PyO3 wrapper)."""
    service = get_imaging_service(storage_path)
    params = EnhancementParams(
        upscale_enabled=upscale_enabled,
        upscale_factor=upscale_factor,
        upscale_method=upscale_method,
        denoise_enabled=denoise_enabled,
        denoise_method=denoise_method,
        denoise_strength=denoise_strength,
        sharpen_enabled=sharpen_enabled,
        sharpen_method=sharpen_method,
        sharpen_strength=sharpen_strength,
        deconvolution_enabled=deconvolution_enabled,
        deconvolution_strength=deconvolution_strength,
        psf_size=psf_size,
    )
    result = service.enhance_image(image_path, params, return_data)
    return result.model_dump()


def reprocess_fits(
    fits_path: str,
    stretch_mode: str = "15% Bg, 3 sigma",
    output_format: str = "png",
    quality: int = 95,
    upscale_enabled: bool = False,
    upscale_factor: float = 2.0,
    upscale_method: str = "LANCZOS",
    denoise_enabled: bool = False,
    denoise_method: str = "TV_CHAMBOLLE",
    denoise_strength: float = 0.1,
    sharpen_enabled: bool = False,
    sharpen_method: str = "UNSHARP_MASK",
    sharpen_strength: float = 0.5,
    deconvolution_enabled: bool = False,
    deconvolution_strength: float = 0.5,
    psf_size: int = 5,
    return_data: bool = True,
    storage_path: Optional[str] = None,
) -> dict[str, Any]:
    """Reprocess a FITS file with new parameters (PyO3 wrapper)."""
    service = get_imaging_service(storage_path)
    processing_params = ProcessingParams(
        stretch_mode=stretch_mode, output_format=output_format, quality=quality
    )
    enhancement_params = EnhancementParams(
        upscale_enabled=upscale_enabled,
        upscale_factor=upscale_factor,
        upscale_method=upscale_method,
        denoise_enabled=denoise_enabled,
        denoise_method=denoise_method,
        denoise_strength=denoise_strength,
        sharpen_enabled=sharpen_enabled,
        sharpen_method=sharpen_method,
        sharpen_strength=sharpen_strength,
        deconvolution_enabled=deconvolution_enabled,
        deconvolution_strength=deconvolution_strength,
        psf_size=psf_size,
    )
    result = service.reprocess_fits(fits_path, processing_params, enhancement_params, return_data)
    return result.model_dump()


def get_stretch_modes() -> list[dict[str, str]]:
    """Get available stretch modes (PyO3 wrapper)."""
    return ImagingService.get_stretch_modes()


def get_enhancement_methods() -> dict[str, list[dict[str, str]]]:
    """Get available enhancement methods (PyO3 wrapper)."""
    return ImagingService.get_enhancement_methods()


def get_processed_image(image_id: str, format: str = "png", storage_path: Optional[str] = None) -> Optional[str]:
    """Get processed image as base64 (PyO3 wrapper)."""
    service = get_imaging_service(storage_path)
    data = service.get_processed_image(image_id, format)
    if data:
        return base64.b64encode(data).decode("utf-8")
    return None


def cleanup_image(image_id: str, storage_path: Optional[str] = None) -> bool:
    """Delete a processed image (PyO3 wrapper)."""
    service = get_imaging_service(storage_path)
    return service.cleanup_image(image_id)
