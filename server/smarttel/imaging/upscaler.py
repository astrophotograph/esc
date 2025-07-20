"""Super-resolution/upscaling and image enhancement functionality for telescope images."""

from enum import Enum
from typing import Optional, Tuple

import cv2
import numpy as np
from loguru import logger as logging
from skimage import restoration, transform, filters, exposure


class UpscalingMethod(str, Enum):
    """Available upscaling methods."""

    BICUBIC = "bicubic"
    LANCZOS = "lanczos"
    EDSR = "edsr"  # Enhanced Deep Super-Resolution (if OpenCV contrib available)
    FSRCNN = "fsrcnn"  # Fast Super-Resolution CNN (if OpenCV contrib available)
    ESRGAN = "esrgan"  # Enhanced Super-Resolution GAN (requires PyTorch and model files)


class SharpeningMethod(str, Enum):
    """Available sharpening methods."""
    
    NONE = "none"
    UNSHARP_MASK = "unsharp_mask"
    LAPLACIAN = "laplacian"
    HIGH_PASS = "high_pass"


class DenoiseMethod(str, Enum):
    """Available denoising methods."""
    
    NONE = "none"
    TV_CHAMBOLLE = "tv_chambolle"  # Total variation denoising
    BILATERAL = "bilateral"  # Bilateral filter
    NON_LOCAL_MEANS = "non_local_means"  # Non-local means
    WAVELET = "wavelet"  # Wavelet denoising
    GAUSSIAN = "gaussian"  # Gaussian blur
    MEDIAN = "median"  # Median filter


class ImageUpscaler:
    """Handles super-resolution and upscaling of telescope images."""

    def __init__(self):
        self._check_opencv_contrib()
        self._check_pytorch_availability()

    def _check_opencv_contrib(self) -> bool:
        """Check if OpenCV contrib modules are available for DNN-based upscaling."""
        try:
            # Try to access DNN super-resolution module
            cv2.dnn_superres.DnnSuperResImpl_create()
            self._has_dnn_superres = True
        except AttributeError:
            self._has_dnn_superres = False
        return self._has_dnn_superres
    
    def _check_pytorch_availability(self) -> bool:
        """Check if PyTorch is available for deep learning upscaling."""
        try:
            import torch
            self._has_torch = True
            # Check if CUDA is available
            self._has_cuda = torch.cuda.is_available()
            logging.info(f"PyTorch available: {self._has_torch}, CUDA available: {self._has_cuda}")
        except ImportError:
            self._has_torch = False
            self._has_cuda = False
            logging.info("PyTorch not available - deep learning upscaling methods will be disabled")
        return self._has_torch

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

        # Ensure we maintain color channels properly
        original_shape = working_image.shape
        is_color = len(original_shape) == 3 and original_shape[2] == 3
        logging.info(f"Original image: shape={original_shape}, is_color={is_color}")

        # Optional denoising for telescope images (helps with noise amplification) - skip for now to avoid fuzziness
        # if denoise:
        #     working_image = self._denoise_image(working_image)

        # Calculate target dimensions
        original_height, original_width = working_image.shape[:2]
        target_height = int(original_height * scale_factor)
        target_width = int(original_width * scale_factor)

        # Apply upscaling method
        logging.info(f"Applying upscaling method: {method}, scale_factor={scale_factor}")
        logging.info(f"Available capabilities: dnn_superres={self._has_dnn_superres}, torch={self._has_torch}")
        logging.info(f"Working image before upscaling: shape={working_image.shape}, dtype={working_image.dtype}")
        
        if method == UpscalingMethod.BICUBIC:
            logging.info("Using bicubic upscaling")
            upscaled = self._bicubic_upscale(
                working_image, (target_width, target_height)
            )
        elif method == UpscalingMethod.LANCZOS:
            logging.info("Using Lanczos upscaling")
            upscaled = self._lanczos_upscale(
                working_image, (target_width, target_height)
            )
        elif method == UpscalingMethod.EDSR and self._has_dnn_superres:
            logging.info("Using EDSR upscaling")
            upscaled = self._edsr_upscale(working_image, scale_factor)
        elif method == UpscalingMethod.FSRCNN and self._has_dnn_superres:
            logging.info("Using FSRCNN upscaling")
            upscaled = self._fsrcnn_upscale(working_image, scale_factor)
        elif method == UpscalingMethod.ESRGAN and self._has_torch:
            logging.info("Using ESRGAN upscaling")
            upscaled = self._esrgan_upscale(working_image, scale_factor)
        else:
            # Fallback to bicubic if DNN methods not available
            logging.warning(f"Method {method} not available or requirements not met, falling back to bicubic")
            upscaled = self._bicubic_upscale(
                working_image, (target_width, target_height)
            )

        # Convert back to original data type
        logging.info(f"Upscaled image before conversion: shape={upscaled.shape}, dtype={upscaled.dtype}")
        if input_uint8:
            upscaled = np.clip(upscaled * 255.0, 0, 255).astype(np.uint8)
        else:
            upscaled = upscaled.astype(image.dtype)

        logging.info(f"Final upscaled image: shape={upscaled.shape}, dtype={upscaled.dtype}")
        return upscaled

    def _denoise_image(self, image: np.ndarray, method: DenoiseMethod = DenoiseMethod.TV_CHAMBOLLE) -> np.ndarray:
        """Apply denoising optimized for telescope images."""
        return self.denoise_image(image, method=method)
    
    def denoise_image(
        self, 
        image: np.ndarray, 
        method: DenoiseMethod = DenoiseMethod.TV_CHAMBOLLE, 
        strength: float = 1.0
    ) -> np.ndarray:
        """
        Apply denoising to an image using the specified method.
        
        Args:
            image: Input image array
            method: Denoising method to use
            strength: Denoising strength (0.0 to 2.0)
            
        Returns:
            Denoised image array
        """
        if method == DenoiseMethod.NONE:
            return image
            
        # Ensure image is in float32 format for processing
        if image.dtype == np.uint8:
            working_image = image.astype(np.float32) / 255.0
            was_uint8 = True
        else:
            working_image = image.astype(np.float32)
            was_uint8 = False
            
        try:
            if method == DenoiseMethod.TV_CHAMBOLLE:
                # Total variation denoising - excellent for astronomical images
                weight = 0.05 * strength
                denoised = restoration.denoise_tv_chambolle(
                    working_image, weight=weight, eps=2e-4, max_num_iter=200
                )
                
            elif method == DenoiseMethod.BILATERAL:
                # Bilateral filter - preserves edges while reducing noise
                if len(working_image.shape) == 3:
                    # Multi-channel image
                    sigma_color = 0.1 * strength
                    sigma_spatial = 1.0 * strength
                    denoised = restoration.denoise_bilateral(
                        working_image, sigma_color=sigma_color, sigma_spatial=sigma_spatial
                    )
                else:
                    # Single-channel image
                    sigma_color = 0.1 * strength
                    sigma_spatial = 1.0 * strength
                    denoised = restoration.denoise_bilateral(
                        working_image, sigma_color=sigma_color, sigma_spatial=sigma_spatial
                    )
                    
            elif method == DenoiseMethod.NON_LOCAL_MEANS:
                # Non-local means - very effective for textured noise
                patch_size = 5
                patch_distance = 6
                h = 0.1 * strength
                denoised = restoration.denoise_nl_means(
                    working_image, patch_size=patch_size, patch_distance=patch_distance, h=h
                )
                
            elif method == DenoiseMethod.WAVELET:
                # Wavelet denoising - good for various noise types
                sigma = 0.1 * strength
                denoised = restoration.denoise_wavelet(
                    working_image, sigma=sigma, mode='soft', rescale_sigma=True
                )
                
            elif method == DenoiseMethod.GAUSSIAN:
                # Gaussian blur - simple but effective
                sigma = 0.5 * strength
                denoised = filters.gaussian(working_image, sigma=sigma)
                
            elif method == DenoiseMethod.MEDIAN:
                # Median filter - excellent for salt-and-pepper noise
                if len(working_image.shape) == 3:
                    # Apply median filter to each channel
                    denoised = np.zeros_like(working_image)
                    disk_size = max(1, int(2 * strength))
                    disk = filters.disk(disk_size)
                    for i in range(working_image.shape[2]):
                        denoised[:, :, i] = filters.median(working_image[:, :, i], disk)
                else:
                    disk_size = max(1, int(2 * strength))
                    disk = filters.disk(disk_size)
                    denoised = filters.median(working_image, disk)
                    
            else:
                # Fallback to TV Chambolle
                weight = 0.05 * strength
                denoised = restoration.denoise_tv_chambolle(
                    working_image, weight=weight, eps=2e-4, max_num_iter=200
                )
                
        except Exception as e:
            logging.error(f"Denoising failed with method {method}: {e}")
            # Return original image if denoising fails
            denoised = working_image
            
        # Convert back to original data type
        if was_uint8:
            denoised = np.clip(denoised * 255.0, 0, 255).astype(np.uint8)
        else:
            denoised = denoised.astype(image.dtype)
            
        return denoised

    def _bicubic_upscale(
        self, image: np.ndarray, target_size: Tuple[int, int]
    ) -> np.ndarray:
        """Upscale using bicubic interpolation."""
        logging.info(f"Applying bicubic upscaling: {image.shape} -> {target_size}")
        logging.info(f"Input image dtype: {image.dtype}, range: [{np.min(image):.3f}, {np.max(image):.3f}]")
        
        # For multi-channel images, ensure OpenCV handles them correctly
        if len(image.shape) == 3:
            # Process color image
            upscaled = cv2.resize(image, target_size, interpolation=cv2.INTER_CUBIC)
            # Ensure we still have 3 channels after resize
            if len(upscaled.shape) == 2:
                # If somehow we lost channels, restore them
                logging.warning("Lost color channels during upscaling, restoring...")
                upscaled = np.stack([upscaled, upscaled, upscaled], axis=2)
        else:
            # Process grayscale image
            upscaled = cv2.resize(image, target_size, interpolation=cv2.INTER_CUBIC)
        
        logging.info(f"Upscaled image shape: {upscaled.shape}")
        
        return upscaled

    def _lanczos_upscale(
        self, image: np.ndarray, target_size: Tuple[int, int]
    ) -> np.ndarray:
        """Upscale using Lanczos interpolation."""
        logging.info(f"Applying Lanczos upscaling: {image.shape} -> {target_size}")
        logging.info(f"Input image dtype: {image.dtype}, range: [{np.min(image):.3f}, {np.max(image):.3f}]")
        
        # For multi-channel images, ensure OpenCV handles them correctly
        if len(image.shape) == 3:
            # Process color image
            upscaled = cv2.resize(image, target_size, interpolation=cv2.INTER_LANCZOS4)
            # Ensure we still have 3 channels after resize
            if len(upscaled.shape) == 2:
                # If somehow we lost channels, restore them
                logging.warning("Lost color channels during Lanczos upscaling, restoring...")
                upscaled = np.stack([upscaled, upscaled, upscaled], axis=2)
        else:
            # Process grayscale image
            upscaled = cv2.resize(image, target_size, interpolation=cv2.INTER_LANCZOS4)
        
        logging.info(f"Upscaled image shape: {upscaled.shape}")
        
        return upscaled

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
        logging.info(f"Unsharp mask input: shape={image.shape}, dtype={image.dtype}")
        
        # Use different parameters for different image types
        if len(image.shape) == 3:
            # Color image
            radius = 1.0
            amount = strength
            logging.info(f"Applying unsharp mask to color image: shape={image.shape}")
        else:
            # Grayscale image
            radius = 1.5
            amount = strength
            logging.info(f"Applying unsharp mask to grayscale image: shape={image.shape}")
            
        result = filters.unsharp_mask(image, radius=radius, amount=amount, preserve_range=True)
        logging.info(f"Unsharp mask result: shape={result.shape}, dtype={result.dtype}")
        return result
    
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

    def _esrgan_upscale(self, image: np.ndarray, scale_factor: float) -> np.ndarray:
        """Upscale using ESRGAN-inspired method (simplified implementation)."""
        if not self._has_torch:
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
        
        try:
            from skimage import transform, filters
            
            logging.info(f"Applying ESRGAN-inspired upscaling with edge enhancement")
            
            # First, apply bicubic upscaling as base
            target_size = (int(image.shape[1] * scale_factor), int(image.shape[0] * scale_factor))
            upscaled = cv2.resize(image, target_size, interpolation=cv2.INTER_CUBIC)
            
            # Apply edge-preserving enhancement (ESRGAN characteristic)
            # Use bilateral filter to preserve edges while smoothing
            if len(upscaled.shape) == 3:
                enhanced = np.zeros_like(upscaled)
                for i in range(upscaled.shape[2]):
                    # Convert to uint8 for bilateral filter
                    channel = upscaled[:, :, i]
                    if channel.dtype != np.uint8:
                        channel_uint8 = (np.clip(channel, 0, 1) * 255).astype(np.uint8)
                    else:
                        channel_uint8 = channel
                    
                    # Apply bilateral filter for edge preservation
                    filtered = cv2.bilateralFilter(channel_uint8, 9, 75, 75)
                    
                    # Convert back to original format
                    if upscaled.dtype != np.uint8:
                        enhanced[:, :, i] = filtered.astype(np.float32) / 255.0
                    else:
                        enhanced[:, :, i] = filtered
            else:
                if upscaled.dtype != np.uint8:
                    upscaled_uint8 = (np.clip(upscaled, 0, 1) * 255).astype(np.uint8)
                else:
                    upscaled_uint8 = upscaled
                
                enhanced = cv2.bilateralFilter(upscaled_uint8, 9, 75, 75)
                
                if upscaled.dtype != np.uint8:
                    enhanced = enhanced.astype(np.float32) / 255.0
            
            # Apply subtle sharpening for ESRGAN-like detail enhancement
            if enhanced.dtype != np.uint8:
                sharpened = filters.unsharp_mask(enhanced, radius=1.0, amount=0.5, preserve_range=True)
            else:
                sharpened = enhanced  # Skip sharpening for uint8 to avoid complications
            
            logging.info(f"ESRGAN-inspired processing complete: {image.shape} -> {sharpened.shape}")
            return sharpened
            
        except Exception as e:
            logging.error(f"ESRGAN upscaling failed: {e}")
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
    


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
        denoise_enabled: bool = False,
        denoise_method: DenoiseMethod = DenoiseMethod.TV_CHAMBOLLE,
        denoise_strength: float = 1.0,
        deconvolve_enabled: bool = False,
        deconvolve_strength: float = 0.5,
        deconvolve_psf_size: float = 2.0,
        processing_order: list[str] = None,
    ):
        self.upscaling_enabled = upscaling_enabled
        self.scale_factor = scale_factor
        self.upscaling_method = upscaling_method
        self.sharpening_enabled = sharpening_enabled
        self.sharpening_method = sharpening_method
        self.sharpening_strength = sharpening_strength
        self.denoise_enabled = denoise_enabled
        self.denoise_method = denoise_method
        self.denoise_strength = denoise_strength
        self.deconvolve_enabled = deconvolve_enabled
        self.deconvolve_strength = deconvolve_strength
        self.deconvolve_psf_size = deconvolve_psf_size
        self.processing_order = processing_order or ["upscaling", "denoise", "deconvolve", "sharpening"]
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

        logging.info(f"ImageEnhancementProcessor.process() starting with image shape: {image.shape}")
        logging.info(f"Enhancement settings: denoise={self.denoise_enabled}, deconvolve={self.deconvolve_enabled}, sharpen={self.sharpening_enabled}, upscale={self.upscaling_enabled}")
        logging.info(f"Processing order: {self.processing_order}")
        
        processed_image = image.copy()
        
        # Apply enhancements in custom order
        for step in self.processing_order:
            if step == "upscaling" and self.upscaling_enabled and self.scale_factor > 1.0:
                logging.info(f"Applying upscaling: method={self.upscaling_method}, scale_factor={self.scale_factor}")
                processed_image = self.upscaler.upscale(
                    processed_image, 
                    scale_factor=self.scale_factor, 
                    method=self.upscaling_method
                )
                logging.info(f"Upscaling completed, output shape: {processed_image.shape}")
            
            elif step == "denoise" and self.denoise_enabled:
                logging.info(f"Applying denoising: method={self.denoise_method}, strength={self.denoise_strength}")
                processed_image = self.upscaler.denoise_image(
                    processed_image,
                    method=self.denoise_method,
                    strength=self.denoise_strength
                )
                logging.info(f"Denoising completed, output shape: {processed_image.shape}")
            
            elif step == "deconvolve" and self.deconvolve_enabled:
                logging.info(f"Applying deconvolution: strength={self.deconvolve_strength}, psf_size={self.deconvolve_psf_size}")
                processed_image = self._apply_deconvolution(
                    processed_image,
                    strength=self.deconvolve_strength,
                    psf_size=self.deconvolve_psf_size
                )
                logging.info(f"Deconvolution completed, output shape: {processed_image.shape}")
            
            elif step == "sharpening" and self.sharpening_enabled:
                logging.info(f"Applying sharpening: method={self.sharpening_method}, strength={self.sharpening_strength}")
                processed_image = self.upscaler.sharpen_image(
                    processed_image, 
                    method=self.sharpening_method, 
                    strength=self.sharpening_strength
                )
                logging.info(f"Sharpening completed, output shape: {processed_image.shape}")

        logging.info(f"ImageEnhancementProcessor.process() completed, final shape: {processed_image.shape}")
        return processed_image

    def _apply_deconvolution(self, image: np.ndarray, strength: float, psf_size: float) -> np.ndarray:
        """Apply deconvolution using Richardson-Lucy algorithm."""
        try:
            from skimage import restoration
            
            logging.info(f"Deconvolution input: shape={image.shape}, dtype={image.dtype}, range=[{np.min(image):.3f}, {np.max(image):.3f}]")
            
            # Determine input format and convert appropriately
            input_range_255 = np.max(image) > 1.0
            
            if input_range_255:
                # Input is in [0, 255] range
                working_image = image.astype(np.float32) / 255.0
            else:
                # Input is already in [0, 1] range
                working_image = image.astype(np.float32)
            
            # Create a Gaussian PSF based on psf_size
            psf_radius = max(2, int(psf_size * 2))  # Ensure minimum radius
            y, x = np.ogrid[-psf_radius:psf_radius+1, -psf_radius:psf_radius+1]
            
            # Create Gaussian PSF with proper sigma
            sigma = psf_size / 2.355  # Convert FWHM to sigma
            psf = np.exp(-(x*x + y*y) / (2.0 * sigma**2))
            psf = psf / psf.sum()
            
            logging.info(f"PSF: size={psf.shape}, sigma={sigma:.3f}, sum={psf.sum():.6f}")
            
            # Limit iterations to prevent over-deconvolution
            iterations = max(1, min(5, int(strength * 10)))  # Cap at 5 iterations
            
            logging.info(f"Deconvolution parameters: iterations={iterations}, strength={strength}")
            
            # Apply deconvolution to each channel
            if len(working_image.shape) == 3:
                deconvolved = np.zeros_like(working_image)
                for i in range(working_image.shape[2]):
                    channel = working_image[:, :, i]
                    # Ensure channel has some variation to avoid division by zero
                    if np.std(channel) > 1e-6:
                        deconvolved[:, :, i] = restoration.richardson_lucy(
                            channel, psf, num_iter=iterations, clip=False
                        )
                    else:
                        deconvolved[:, :, i] = channel
            else:
                if np.std(working_image) > 1e-6:
                    deconvolved = restoration.richardson_lucy(
                        working_image, psf, num_iter=iterations, clip=False
                    )
                else:
                    deconvolved = working_image
            
            # Ensure output is in proper range and convert back to input format
            deconvolved = np.clip(deconvolved, 0, 1)
            
            if input_range_255:
                # Convert back to [0, 255] range
                deconvolved = (deconvolved * 255.0).astype(image.dtype)
            else:
                # Keep in [0, 1] range
                deconvolved = deconvolved.astype(image.dtype)
            
            logging.info(f"Deconvolution output: shape={deconvolved.shape}, dtype={deconvolved.dtype}, range=[{np.min(deconvolved):.3f}, {np.max(deconvolved):.3f}]")
            logging.info(f"Applied deconvolution: strength={strength}, psf_size={psf_size}, iterations={iterations}")
            
            return deconvolved
            
        except Exception as e:
            logging.error(f"Deconvolution failed: {e}")
            # Return original image if deconvolution fails
            return image

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
    
    def set_deconvolve_params(
        self,
        enabled: bool,
        strength: float = 0.5,
        psf_size: float = 2.0,
    ):
        """Update deconvolution parameters."""
        self.deconvolve_enabled = enabled
        self.deconvolve_strength = max(0.0, min(1.0, strength))  # Clamp to safe range
        self.deconvolve_psf_size = max(0.5, min(10.0, psf_size))  # Clamp PSF size
    
    def get_enhancement_settings(self) -> dict:
        """Get current enhancement settings."""
        return {
            "upscaling_enabled": self.upscaling_enabled,
            "scale_factor": self.scale_factor,
            "upscaling_method": self.upscaling_method.value,
            "sharpening_enabled": self.sharpening_enabled,
            "sharpening_method": self.sharpening_method.value,
            "sharpening_strength": self.sharpening_strength,
            "deconvolve_enabled": self.deconvolve_enabled,
            "deconvolve_strength": self.deconvolve_strength,
            "deconvolve_psf_size": self.deconvolve_psf_size,
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
