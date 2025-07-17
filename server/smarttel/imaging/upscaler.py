"""Super-resolution/upscaling and image enhancement functionality for telescope images."""

from enum import Enum
from typing import Optional, Tuple

import cv2
import numpy as np
from skimage import restoration, transform, filters, exposure


class UpscalingMethod(str, Enum):
    """Available upscaling methods."""

    BICUBIC = "bicubic"
    LANCZOS = "lanczos"
    EDSR = "edsr"  # Enhanced Deep Super-Resolution (if OpenCV contrib available)
    FSRCNN = "fsrcnn"  # Fast Super-Resolution CNN (if OpenCV contrib available)


class SharpeningMethod(str, Enum):
    """Available sharpening methods."""
    
    NONE = "none"
    UNSHARP_MASK = "unsharp_mask"
    LAPLACIAN = "laplacian"
    HIGH_PASS = "high_pass"


class ImageUpscaler:
    """Handles super-resolution and upscaling of telescope images."""

    def __init__(self):
        self._check_opencv_contrib()

    def _check_opencv_contrib(self) -> bool:
        """Check if OpenCV contrib modules are available for DNN-based upscaling."""
        try:
            # Try to access DNN super-resolution module
            cv2.dnn_superres.DnnSuperResImpl_create()
            self._has_dnn_superres = True
        except AttributeError:
            self._has_dnn_superres = False
        return self._has_dnn_superres

    def upscale(
        self,
        image: np.ndarray,
        scale_factor: float = 2.0,
        method: UpscalingMethod = UpscalingMethod.BICUBIC,
        denoise: bool = True,
    ) -> np.ndarray:
        """
        Upscale an image using the specified method.

        Args:
            image: Input image as numpy array
            scale_factor: Scaling factor (e.g., 2.0 for 2x upscaling)
            method: Upscaling method to use
            denoise: Whether to apply denoising before upscaling

        Returns:
            Upscaled image as numpy array
        """
        if image is None or image.size == 0:
            raise ValueError("Invalid input image")

        # Convert to appropriate data type for processing
        if image.dtype == np.uint8:
            working_image = image.astype(np.float32) / 255.0
            input_uint8 = True
        else:
            working_image = image.astype(np.float32)
            input_uint8 = False

        # Optional denoising for telescope images (helps with noise amplification)
        if denoise:
            working_image = self._denoise_image(working_image)

        # Calculate target dimensions
        original_height, original_width = working_image.shape[:2]
        target_height = int(original_height * scale_factor)
        target_width = int(original_width * scale_factor)

        # Apply upscaling method
        if method == UpscalingMethod.BICUBIC:
            upscaled = self._bicubic_upscale(
                working_image, (target_width, target_height)
            )
        elif method == UpscalingMethod.LANCZOS:
            upscaled = self._lanczos_upscale(
                working_image, (target_width, target_height)
            )
        elif method == UpscalingMethod.EDSR and self._has_dnn_superres:
            upscaled = self._edsr_upscale(working_image, scale_factor)
        elif method == UpscalingMethod.FSRCNN and self._has_dnn_superres:
            upscaled = self._fsrcnn_upscale(working_image, scale_factor)
        else:
            # Fallback to bicubic if DNN methods not available
            upscaled = self._bicubic_upscale(
                working_image, (target_width, target_height)
            )

        # Convert back to original data type
        if input_uint8:
            upscaled = np.clip(upscaled * 255.0, 0, 255).astype(np.uint8)
        else:
            upscaled = upscaled.astype(image.dtype)

        return upscaled

    def _denoise_image(self, image: np.ndarray) -> np.ndarray:
        """Apply gentle denoising optimized for telescope images."""
        if len(image.shape) == 3:
            # Multi-channel image
            denoised = restoration.denoise_tv_chambolle(
                image, weight=0.05, eps=2e-4, max_num_iter=200
            )
        else:
            # Single-channel image
            denoised = restoration.denoise_tv_chambolle(
                image, weight=0.05, eps=2e-4, max_num_iter=200
            )

        return denoised

    def _bicubic_upscale(
        self, image: np.ndarray, target_size: Tuple[int, int]
    ) -> np.ndarray:
        """Upscale using bicubic interpolation."""
        return cv2.resize(image, target_size, interpolation=cv2.INTER_CUBIC)

    def _lanczos_upscale(
        self, image: np.ndarray, target_size: Tuple[int, int]
    ) -> np.ndarray:
        """Upscale using Lanczos interpolation."""
        return cv2.resize(image, target_size, interpolation=cv2.INTER_LANCZOS4)

    def _edsr_upscale(self, image: np.ndarray, scale_factor: float) -> np.ndarray:
        """Upscale using Enhanced Deep Super-Resolution (requires OpenCV contrib)."""
        if not self._has_dnn_superres:
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )

        try:
            # Create DNN super-resolution object
            sr = cv2.dnn_superres.DnnSuperResImpl_create()

            # Note: In practice, you would need to download and load pre-trained EDSR models
            # For now, we'll fall back to bicubic
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
        except Exception:
            # Fallback to bicubic
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )

    def _fsrcnn_upscale(self, image: np.ndarray, scale_factor: float) -> np.ndarray:
        """Upscale using Fast Super-Resolution CNN (requires OpenCV contrib)."""
        if not self._has_dnn_superres:
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )

        try:
            # Create DNN super-resolution object
            sr = cv2.dnn_superres.DnnSuperResImpl_create()

            # Note: In practice, you would need to download and load pre-trained FSRCNN models
            # For now, we'll fall back to bicubic
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
        except Exception:
            # Fallback to bicubic
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )

    def get_available_methods(self) -> list[UpscalingMethod]:
        """Get list of available upscaling methods."""
        methods = [UpscalingMethod.BICUBIC, UpscalingMethod.LANCZOS]

        if self._has_dnn_superres:
            methods.extend([UpscalingMethod.EDSR, UpscalingMethod.FSRCNN])

        return methods

    def sharpen_image(
        self,
        image: np.ndarray,
        method: SharpeningMethod = SharpeningMethod.UNSHARP_MASK,
        strength: float = 1.0,
    ) -> np.ndarray:
        """
        Apply sharpening to an image.
        
        Args:
            image: Input image as numpy array
            method: Sharpening method to use
            strength: Sharpening strength (0.0 to 2.0)
            
        Returns:
            Sharpened image as numpy array
        """
        if method == SharpeningMethod.NONE or strength <= 0:
            return image
            
        # Ensure image is in float format
        if image.dtype == np.uint8:
            working_image = image.astype(np.float32) / 255.0
            was_uint8 = True
        else:
            working_image = image.astype(np.float32)
            was_uint8 = False
            
        if method == SharpeningMethod.UNSHARP_MASK:
            sharpened = self._unsharp_mask(working_image, strength)
        elif method == SharpeningMethod.LAPLACIAN:
            sharpened = self._laplacian_sharpen(working_image, strength)
        elif method == SharpeningMethod.HIGH_PASS:
            sharpened = self._high_pass_sharpen(working_image, strength)
        else:
            sharpened = working_image
            
        # Convert back to original format
        if was_uint8:
            sharpened = np.clip(sharpened * 255.0, 0, 255).astype(np.uint8)
        else:
            sharpened = sharpened.astype(image.dtype)
            
        return sharpened
    
    def _unsharp_mask(self, image: np.ndarray, strength: float) -> np.ndarray:
        """Apply unsharp mask sharpening."""
        # Use different parameters for different image types
        if len(image.shape) == 3:
            # Color image
            radius = 1.0
            amount = strength
        else:
            # Grayscale image
            radius = 1.5
            amount = strength
            
        return filters.unsharp_mask(image, radius=radius, amount=amount, preserve_range=True)
    
    def _laplacian_sharpen(self, image: np.ndarray, strength: float) -> np.ndarray:
        """Apply Laplacian sharpening."""
        # Convert to uint8 for OpenCV processing if needed
        if image.dtype != np.uint8:
            img_uint8 = (image * 255).astype(np.uint8)
            was_float = True
        else:
            img_uint8 = image
            was_float = False
            
        if len(image.shape) == 3:
            # Apply to each channel separately
            sharpened = np.zeros_like(img_uint8, dtype=np.float64)
            for i in range(image.shape[2]):
                laplacian = cv2.Laplacian(img_uint8[:, :, i], cv2.CV_64F)
                sharpened[:, :, i] = img_uint8[:, :, i].astype(np.float64) - strength * laplacian
        else:
            laplacian = cv2.Laplacian(img_uint8, cv2.CV_64F)
            sharpened = img_uint8.astype(np.float64) - strength * laplacian
        
        # Convert back to original format
        if was_float:
            sharpened = np.clip(sharpened / 255.0, 0, 1)
        else:
            sharpened = np.clip(sharpened, 0, 255).astype(np.uint8)
            
        return sharpened
    
    def _high_pass_sharpen(self, image: np.ndarray, strength: float) -> np.ndarray:
        """Apply high-pass filter sharpening."""
        # Create Gaussian blur
        blurred = filters.gaussian(image, sigma=1.0, preserve_range=True)
        # High-pass = original - blurred
        high_pass = image - blurred
        # Add back to original with strength
        sharpened = image + strength * high_pass
        return np.clip(sharpened, 0, 1)
    
    def invert_image(self, image: np.ndarray) -> np.ndarray:
        """
        Invert an image (useful for viewing negatives or different contrast).
        
        Args:
            image: Input image as numpy array
            
        Returns:
            Inverted image as numpy array
        """
        if image.dtype == np.uint8:
            return 255 - image
        else:
            # Assume float image in range [0, 1]
            return 1.0 - image


class ImageEnhancementProcessor:
    """Comprehensive image processor with upscaling, sharpening, and other enhancements."""

    def __init__(
        self,
        upscaling_enabled: bool = False,
        scale_factor: float = 2.0,
        upscaling_method: UpscalingMethod = UpscalingMethod.BICUBIC,
        sharpening_enabled: bool = False,
        sharpening_method: SharpeningMethod = SharpeningMethod.UNSHARP_MASK,
        sharpening_strength: float = 1.0,
        invert_enabled: bool = False,
    ):
        self.upscaling_enabled = upscaling_enabled
        self.scale_factor = scale_factor
        self.upscaling_method = upscaling_method
        self.sharpening_enabled = sharpening_enabled
        self.sharpening_method = sharpening_method
        self.sharpening_strength = sharpening_strength
        self.invert_enabled = invert_enabled
        self.upscaler = ImageUpscaler()

    def process(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Process image with comprehensive enhancements.

        Args:
            image: Input image array

        Returns:
            Processed image with all enabled enhancements applied
        """
        if image is None:
            return None

        processed_image = image.copy()
        
        # Apply enhancements in order: sharpen -> upscale -> invert
        
        # 1. Apply sharpening first (before upscaling to avoid amplifying noise)
        if self.sharpening_enabled:
            processed_image = self.upscaler.sharpen_image(
                processed_image, 
                method=self.sharpening_method, 
                strength=self.sharpening_strength
            )
        
        # 2. Apply upscaling
        if self.upscaling_enabled and self.scale_factor > 1.0:
            processed_image = self.upscaler.upscale(
                processed_image, 
                scale_factor=self.scale_factor, 
                method=self.upscaling_method
            )
        
        # 3. Apply inversion last
        if self.invert_enabled:
            processed_image = self.upscaler.invert_image(processed_image)

        return processed_image

    def set_upscaling_params(
        self,
        enabled: bool,
        scale_factor: float = 2.0,
        method: UpscalingMethod = UpscalingMethod.BICUBIC,
    ):
        """Update upscaling parameters."""
        self.upscaling_enabled = enabled
        self.scale_factor = scale_factor
        self.upscaling_method = method
    
    def set_sharpening_params(
        self,
        enabled: bool,
        method: SharpeningMethod = SharpeningMethod.UNSHARP_MASK,
        strength: float = 1.0,
    ):
        """Update sharpening parameters."""
        self.sharpening_enabled = enabled
        self.sharpening_method = method
        self.sharpening_strength = max(0.0, min(2.0, strength))  # Clamp to safe range
    
    def set_invert_enabled(self, enabled: bool):
        """Update inversion setting."""
        self.invert_enabled = enabled
    
    def get_enhancement_settings(self) -> dict:
        """Get current enhancement settings."""
        return {
            "upscaling_enabled": self.upscaling_enabled,
            "scale_factor": self.scale_factor,
            "upscaling_method": self.upscaling_method.value,
            "sharpening_enabled": self.sharpening_enabled,
            "sharpening_method": self.sharpening_method.value,
            "sharpening_strength": self.sharpening_strength,
            "invert_enabled": self.invert_enabled,
        }


# Keep the old class for backward compatibility
class UpscalingProcessor(ImageEnhancementProcessor):
    """Backward compatibility wrapper for ImageEnhancementProcessor."""
    
    def __init__(self, enabled: bool = False, scale_factor: float = 2.0, method: UpscalingMethod = UpscalingMethod.BICUBIC):
        super().__init__(
            upscaling_enabled=enabled,
            scale_factor=scale_factor,
            upscaling_method=method
        )
        # For backward compatibility
        self.enabled = self.upscaling_enabled
        self.method = self.upscaling_method
    
    def set_upscaling_params(self, enabled: bool, scale_factor: float = 2.0, method: UpscalingMethod = UpscalingMethod.BICUBIC):
        """Backward compatibility method."""
        super().set_upscaling_params(enabled, scale_factor, method)
        self.enabled = self.upscaling_enabled
        self.method = self.upscaling_method
