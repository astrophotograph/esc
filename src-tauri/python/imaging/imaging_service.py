"""
Imaging service for FITS file processing and image enhancement.
Wraps scopinator imaging functionality for use via PyO3.
"""
import json
import base64
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import tempfile

# Try to import imaging dependencies
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    from astropy.io import fits
    HAS_ASTROPY = True
except ImportError:
    HAS_ASTROPY = False


class ImagingService:
    """Service for processing astronomical images."""

    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = Path(storage_path) if storage_path else Path(tempfile.gettempdir()) / "eesc_images"
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self._processed_images: Dict[str, Dict[str, Any]] = {}

    def process_fits(
        self,
        fits_path: str,
        stretch_mode: str = "15% Bg, 3 pointed",
        output_format: str = "png",
        return_data: bool = True
    ) -> Dict[str, Any]:
        """
        Process a FITS file with stretching and convert to viewable format.
        """
        if not HAS_ASTROPY:
            raise ImportError("astropy is required for FITS processing")
        if not HAS_NUMPY:
            raise ImportError("numpy is required for FITS processing")
        if not HAS_PIL:
            raise ImportError("Pillow is required for image output")

        # Read FITS file
        with fits.open(fits_path) as hdul:
            data = hdul[0].data
            header = dict(hdul[0].header)

        if data is None:
            raise ValueError("No image data found in FITS file")

        # Handle 3D data (color)
        if len(data.shape) == 3:
            if data.shape[0] == 3:
                data = np.moveaxis(data, 0, -1)
        elif len(data.shape) == 2:
            pass  # Grayscale
        else:
            raise ValueError(f"Unsupported data shape: {data.shape}")

        # Apply stretch
        stretched = self._apply_stretch(data, stretch_mode)

        # Convert to 8-bit
        img_data = (stretched * 255).astype(np.uint8)

        # Create PIL Image
        if len(img_data.shape) == 3:
            img = Image.fromarray(img_data, mode='RGB')
        else:
            img = Image.fromarray(img_data, mode='L')

        # Generate output
        image_id = str(uuid.uuid4())
        output_path = self.storage_path / f"{image_id}.{output_format}"
        img.save(output_path, format=output_format.upper())

        result = {
            "id": image_id,
            "original_filename": Path(fits_path).name,
            "processed_at": datetime.utcnow().isoformat(),
            "width": img.width,
            "height": img.height,
            "format": output_format,
            "stretch_mode": stretch_mode,
            "metadata": {k: str(v) for k, v in header.items() if k},
            "output_path": str(output_path),
        }

        if return_data:
            with open(output_path, "rb") as f:
                result["data_base64"] = base64.b64encode(f.read()).decode()

        self._processed_images[image_id] = result
        return result

    def _apply_stretch(self, data: "np.ndarray", stretch_mode: str) -> "np.ndarray":
        """Apply stretching algorithm to image data."""
        # Normalize data
        data = data.astype(np.float64)
        vmin, vmax = np.nanpercentile(data, [1, 99])
        data = np.clip((data - vmin) / (vmax - vmin + 1e-10), 0, 1)

        if stretch_mode == "No Stretch":
            return data

        # MTF-based stretch modes
        if "Bg" in stretch_mode:
            # Extract background percentage
            try:
                bg_pct = float(stretch_mode.split("%")[0]) / 100
            except (ValueError, IndexError):
                bg_pct = 0.15

            # Apply MTF stretch
            midtone = bg_pct
            if midtone > 0 and midtone < 1:
                data = self._mtf_stretch(data, midtone)

        return np.clip(data, 0, 1)

    def _mtf_stretch(self, data: "np.ndarray", midtone: float) -> "np.ndarray":
        """Apply Midtone Transfer Function stretch."""
        # Avoid division by zero
        eps = 1e-10
        m = midtone

        # MTF formula
        result = (m - 1) * data / ((2 * m - 1) * data - m + eps)
        return np.clip(result, 0, 1)

    def enhance_image(
        self,
        image_path: str,
        upscale_enabled: bool = False,
        upscale_factor: int = 2,
        upscale_method: str = "LANCZOS",
        denoise_enabled: bool = False,
        denoise_method: str = "bilateral",
        denoise_strength: float = 10.0,
        sharpen_enabled: bool = False,
        sharpen_method: str = "unsharp_mask",
        sharpen_strength: float = 1.0,
        deconvolution_enabled: bool = False,
        deconvolution_strength: float = 1.0,
        psf_size: int = 5,
        return_data: bool = True
    ) -> Dict[str, Any]:
        """Apply enhancement operations to an image."""
        if not HAS_PIL:
            raise ImportError("Pillow is required for image enhancement")

        img = Image.open(image_path)

        # Upscale
        if upscale_enabled and upscale_factor > 1:
            new_size = (img.width * upscale_factor, img.height * upscale_factor)
            resample = getattr(Image.Resampling, upscale_method, Image.Resampling.LANCZOS)
            img = img.resize(new_size, resample=resample)

        # Convert to numpy for advanced operations
        if HAS_NUMPY and (denoise_enabled or sharpen_enabled):
            img_array = np.array(img)

            if denoise_enabled:
                img_array = self._denoise(img_array, denoise_method, denoise_strength)

            if sharpen_enabled:
                img_array = self._sharpen(img_array, sharpen_method, sharpen_strength)

            img = Image.fromarray(img_array.astype(np.uint8))

        # Save result
        image_id = str(uuid.uuid4())
        output_path = self.storage_path / f"{image_id}_enhanced.png"
        img.save(output_path, format="PNG")

        result = {
            "id": image_id,
            "original_filename": Path(image_path).name,
            "processed_at": datetime.utcnow().isoformat(),
            "width": img.width,
            "height": img.height,
            "format": "png",
            "stretch_mode": "enhanced",
            "metadata": {
                "upscale_enabled": upscale_enabled,
                "denoise_enabled": denoise_enabled,
                "sharpen_enabled": sharpen_enabled,
            },
            "output_path": str(output_path),
        }

        if return_data:
            with open(output_path, "rb") as f:
                result["data_base64"] = base64.b64encode(f.read()).decode()

        self._processed_images[image_id] = result
        return result

    def _denoise(self, data: "np.ndarray", method: str, strength: float) -> "np.ndarray":
        """Apply denoising."""
        try:
            from skimage.restoration import denoise_tv_chambolle, denoise_bilateral
            if method == "tv_chambolle":
                return (denoise_tv_chambolle(data / 255.0, weight=strength / 100) * 255)
            elif method == "bilateral":
                return (denoise_bilateral(data / 255.0, sigma_spatial=strength) * 255)
        except ImportError:
            pass
        return data

    def _sharpen(self, data: "np.ndarray", method: str, strength: float) -> "np.ndarray":
        """Apply sharpening."""
        try:
            from skimage.filters import unsharp_mask
            if method == "unsharp_mask":
                return (unsharp_mask(data / 255.0, radius=1, amount=strength) * 255)
        except ImportError:
            pass
        return data

    def get_processed_image(self, image_id: str) -> Optional[Dict[str, Any]]:
        """Get a previously processed image by ID."""
        return self._processed_images.get(image_id)

    def cleanup_image(self, image_id: str) -> bool:
        """Remove a processed image."""
        if image_id in self._processed_images:
            info = self._processed_images.pop(image_id)
            output_path = Path(info.get("output_path", ""))
            if output_path.exists():
                output_path.unlink()
            return True
        return False


# Global service instance
_service: Optional[ImagingService] = None


def _get_service() -> ImagingService:
    global _service
    if _service is None:
        _service = ImagingService()
    return _service


def process_fits(
    fits_path: str,
    stretch_mode: str = "15% Bg, 3 pointed",
    output_format: str = "png",
    return_data: bool = True
) -> str:
    """Process FITS file and return JSON result."""
    result = _get_service().process_fits(fits_path, stretch_mode, output_format, return_data)
    return json.dumps(result)


def enhance_image(
    image_path: str,
    upscale_enabled: bool = False,
    upscale_factor: int = 2,
    upscale_method: str = "LANCZOS",
    denoise_enabled: bool = False,
    denoise_method: str = "bilateral",
    denoise_strength: float = 10.0,
    sharpen_enabled: bool = False,
    sharpen_method: str = "unsharp_mask",
    sharpen_strength: float = 1.0,
    deconvolution_enabled: bool = False,
    deconvolution_strength: float = 1.0,
    psf_size: int = 5,
    return_data: bool = True
) -> str:
    """Enhance image and return JSON result."""
    result = _get_service().enhance_image(
        image_path, upscale_enabled, upscale_factor, upscale_method,
        denoise_enabled, denoise_method, denoise_strength,
        sharpen_enabled, sharpen_method, sharpen_strength,
        deconvolution_enabled, deconvolution_strength, psf_size,
        return_data
    )
    return json.dumps(result)


def reprocess_fits(
    fits_path: str,
    stretch_mode: str = "15% Bg, 3 pointed",
    enhance_params: Optional[Dict[str, Any]] = None,
    output_format: str = "png",
    return_data: bool = True
) -> str:
    """Process FITS with optional enhancement and return JSON result."""
    service = _get_service()
    result = service.process_fits(fits_path, stretch_mode, output_format, return_data=False)

    if enhance_params and any(enhance_params.values()):
        output_path = result["output_path"]
        result = service.enhance_image(
            output_path,
            upscale_enabled=enhance_params.get("upscale_enabled", False),
            upscale_factor=enhance_params.get("upscale_factor", 2),
            denoise_enabled=enhance_params.get("denoise_enabled", False),
            denoise_strength=enhance_params.get("denoise_strength", 10.0),
            sharpen_enabled=enhance_params.get("sharpen_enabled", False),
            sharpen_strength=enhance_params.get("sharpen_strength", 1.0),
            return_data=return_data
        )
    elif return_data:
        with open(result["output_path"], "rb") as f:
            result["data_base64"] = base64.b64encode(f.read()).decode()

    return json.dumps(result)


def get_stretch_modes() -> str:
    """Get available stretch modes as JSON."""
    modes = [
        {"id": "none", "name": "No Stretch", "description": "Raw data without stretching"},
        {"id": "10bg", "name": "10% Bg, 3 pointed", "description": "Light stretch, 10% background"},
        {"id": "15bg", "name": "15% Bg, 3 pointed", "description": "Medium stretch, 15% background"},
        {"id": "20bg", "name": "20% Bg, 3 pointed", "description": "Strong stretch, 20% background"},
        {"id": "30bg", "name": "30% Bg, 3 pointed", "description": "Very strong stretch, 30% background"},
    ]
    return json.dumps(modes)


def get_enhancement_methods() -> str:
    """Get available enhancement methods as JSON."""
    methods = {
        "upscale": [
            {"id": "LANCZOS", "name": "Lanczos", "description": "High-quality resampling"},
            {"id": "BICUBIC", "name": "Bicubic", "description": "Smooth interpolation"},
            {"id": "BILINEAR", "name": "Bilinear", "description": "Fast interpolation"},
        ],
        "denoise": [
            {"id": "bilateral", "name": "Bilateral", "description": "Edge-preserving smoothing"},
            {"id": "tv_chambolle", "name": "Total Variation", "description": "Removes noise while preserving edges"},
        ],
        "sharpen": [
            {"id": "unsharp_mask", "name": "Unsharp Mask", "description": "Classic sharpening technique"},
        ],
    }
    return json.dumps(methods)


def get_processed_image(image_id: str) -> str:
    """Get processed image info as JSON."""
    result = _get_service().get_processed_image(image_id)
    return json.dumps(result) if result else json.dumps(None)


def cleanup_image(image_id: str) -> bool:
    """Remove a processed image."""
    return _get_service().cleanup_image(image_id)
