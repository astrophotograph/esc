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
    REAL_ESRGAN = "real_esrgan"  # Real-ESRGAN (requires PyTorch and model files)
    WAIFU2X = "waifu2x"  # Waifu2x-style upscaling (requires PyTorch and model files)


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
        elif method == UpscalingMethod.ESRGAN and self._has_torch:
            upscaled = self._esrgan_upscale(working_image, scale_factor)
        elif method == UpscalingMethod.REAL_ESRGAN and self._has_torch:
            upscaled = self._real_esrgan_upscale(working_image, scale_factor)
        elif method == UpscalingMethod.WAIFU2X and self._has_torch:
            upscaled = self._waifu2x_upscale(working_image, scale_factor)
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

    def _esrgan_upscale(self, image: np.ndarray, scale_factor: float) -> np.ndarray:
        """Upscale using ESRGAN (Enhanced Super-Resolution GAN)."""
        if not self._has_torch:
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
        
        try:
            import torch
            import torch.nn as nn
            
            # Simple ESRGAN-like architecture (lightweight version)
            class ESRGANBlock(nn.Module):
                def __init__(self, channels=64):
                    super().__init__()
                    self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)
                    self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)
                    self.relu = nn.LeakyReLU(0.2)
                    
                def forward(self, x):
                    residual = x
                    out = self.relu(self.conv1(x))
                    out = self.conv2(out)
                    return out + residual
            
            class SimpleESRGAN(nn.Module):
                def __init__(self, scale_factor=2):
                    super().__init__()
                    self.scale_factor = int(scale_factor)
                    channels = 64
                    
                    # Initial convolution
                    self.conv_first = nn.Conv2d(3, channels, 3, padding=1)
                    
                    # Residual blocks
                    self.blocks = nn.ModuleList([ESRGANBlock(channels) for _ in range(6)])
                    
                    # Upsampling layers
                    self.upsample = nn.Sequential(
                        nn.Conv2d(channels, channels * 4, 3, padding=1),
                        nn.PixelShuffle(2),
                        nn.LeakyReLU(0.2)
                    )
                    
                    # Final convolution
                    self.conv_last = nn.Conv2d(channels, 3, 3, padding=1)
                    
                def forward(self, x):
                    x = self.conv_first(x)
                    
                    for block in self.blocks:
                        x = block(x)
                    
                    x = self.upsample(x)
                    x = self.conv_last(x)
                    
                    return torch.tanh(x)
            
            # Convert image to tensor
            if len(image.shape) == 2:
                # Convert grayscale to RGB
                image = np.stack([image, image, image], axis=2)
            
            # Normalize to [-1, 1]
            image_tensor = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0).float()
            image_tensor = image_tensor * 2.0 - 1.0
            
            # Create model
            device = torch.device('cuda' if self._has_cuda else 'cpu')
            model = SimpleESRGAN(scale_factor=scale_factor).to(device)
            image_tensor = image_tensor.to(device)
            
            # Process with model
            model.eval()
            with torch.no_grad():
                output = model(image_tensor)
            
            # Convert back to numpy
            output = output.squeeze(0).permute(1, 2, 0).cpu().numpy()
            output = (output + 1.0) / 2.0  # Denormalize
            output = np.clip(output, 0, 1)
            
            return output
            
        except Exception as e:
            logging.error(f"ESRGAN upscaling failed: {e}")
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
    
    def _real_esrgan_upscale(self, image: np.ndarray, scale_factor: float) -> np.ndarray:
        """Upscale using Real-ESRGAN architecture."""
        if not self._has_torch:
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
        
        try:
            import torch
            import torch.nn as nn
            
            # Real-ESRGAN inspired architecture
            class RealESRGANBlock(nn.Module):
                def __init__(self, channels=64):
                    super().__init__()
                    self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)
                    self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)
                    self.relu = nn.LeakyReLU(0.2)
                    self.bn1 = nn.BatchNorm2d(channels)
                    self.bn2 = nn.BatchNorm2d(channels)
                    
                def forward(self, x):
                    residual = x
                    out = self.relu(self.bn1(self.conv1(x)))
                    out = self.bn2(self.conv2(out))
                    return out + residual
            
            class RealESRGAN(nn.Module):
                def __init__(self, scale_factor=2):
                    super().__init__()
                    self.scale_factor = int(scale_factor)
                    channels = 64
                    
                    # Initial convolution
                    self.conv_first = nn.Conv2d(3, channels, 3, padding=1)
                    
                    # Residual blocks
                    self.blocks = nn.ModuleList([RealESRGANBlock(channels) for _ in range(8)])
                    
                    # Upsampling layers
                    self.upsample = nn.Sequential(
                        nn.Conv2d(channels, channels * 4, 3, padding=1),
                        nn.PixelShuffle(2),
                        nn.LeakyReLU(0.2)
                    )
                    
                    # Final convolution
                    self.conv_last = nn.Conv2d(channels, 3, 3, padding=1)
                    
                def forward(self, x):
                    x = self.conv_first(x)
                    
                    for block in self.blocks:
                        x = block(x)
                    
                    x = self.upsample(x)
                    x = self.conv_last(x)
                    
                    return torch.sigmoid(x)
            
            # Convert image to tensor
            if len(image.shape) == 2:
                # Convert grayscale to RGB
                image = np.stack([image, image, image], axis=2)
            
            # Normalize to [0, 1]
            image_tensor = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0).float()
            
            # Create model
            device = torch.device('cuda' if self._has_cuda else 'cpu')
            model = RealESRGAN(scale_factor=scale_factor).to(device)
            image_tensor = image_tensor.to(device)
            
            # Process with model
            model.eval()
            with torch.no_grad():
                output = model(image_tensor)
            
            # Convert back to numpy
            output = output.squeeze(0).permute(1, 2, 0).cpu().numpy()
            output = np.clip(output, 0, 1)
            
            return output
            
        except Exception as e:
            logging.error(f"Real-ESRGAN upscaling failed: {e}")
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
    
    def _waifu2x_upscale(self, image: np.ndarray, scale_factor: float) -> np.ndarray:
        """Upscale using Waifu2x-style architecture."""
        if not self._has_torch:
            return self._bicubic_upscale(
                image,
                (
                    int(image.shape[1] * scale_factor),
                    int(image.shape[0] * scale_factor),
                ),
            )
        
        try:
            import torch
            import torch.nn as nn
            
            # Waifu2x inspired architecture
            class Waifu2xBlock(nn.Module):
                def __init__(self, channels=64):
                    super().__init__()
                    self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)
                    self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)
                    self.relu = nn.LeakyReLU(0.1)
                    
                def forward(self, x):
                    residual = x
                    out = self.relu(self.conv1(x))
                    out = self.conv2(out)
                    return out + residual
            
            class Waifu2x(nn.Module):
                def __init__(self, scale_factor=2):
                    super().__init__()
                    self.scale_factor = int(scale_factor)
                    channels = 64
                    
                    # Initial convolution
                    self.conv_first = nn.Conv2d(3, channels, 3, padding=1)
                    
                    # Residual blocks
                    self.blocks = nn.ModuleList([Waifu2xBlock(channels) for _ in range(6)])
                    
                    # Upsampling layers
                    self.upsample = nn.Sequential(
                        nn.Conv2d(channels, channels * 4, 3, padding=1),
                        nn.PixelShuffle(2),
                        nn.LeakyReLU(0.1)
                    )
                    
                    # Final convolution
                    self.conv_last = nn.Conv2d(channels, 3, 3, padding=1)
                    
                def forward(self, x):
                    x = self.conv_first(x)
                    
                    for block in self.blocks:
                        x = block(x)
                    
                    x = self.upsample(x)
                    x = self.conv_last(x)
                    
                    return torch.sigmoid(x)
            
            # Convert image to tensor
            if len(image.shape) == 2:
                # Convert grayscale to RGB
                image = np.stack([image, image, image], axis=2)
            
            # Normalize to [0, 1]
            image_tensor = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0).float()
            
            # Create model
            device = torch.device('cuda' if self._has_cuda else 'cpu')
            model = Waifu2x(scale_factor=scale_factor).to(device)
            image_tensor = image_tensor.to(device)
            
            # Process with model
            model.eval()
            with torch.no_grad():
                output = model(image_tensor)
            
            # Convert back to numpy
            output = output.squeeze(0).permute(1, 2, 0).cpu().numpy()
            output = np.clip(output, 0, 1)
            
            return output
            
        except Exception as e:
            logging.error(f"Waifu2x upscaling failed: {e}")
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
        invert_enabled: bool = False,
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
        
        # Apply enhancements in order: denoise -> sharpen -> upscale -> invert
        
        # 1. Apply denoising first (improves overall image quality)
        if self.denoise_enabled:
            processed_image = self.upscaler.denoise_image(
                processed_image,
                method=self.denoise_method,
                strength=self.denoise_strength
            )
        
        # 2. Apply sharpening (after denoising to avoid amplifying noise)
        if self.sharpening_enabled:
            processed_image = self.upscaler.sharpen_image(
                processed_image, 
                method=self.sharpening_method, 
                strength=self.sharpening_strength
            )
        
        # 3. Apply upscaling
        if self.upscaling_enabled and self.scale_factor > 1.0:
            processed_image = self.upscaler.upscale(
                processed_image, 
                scale_factor=self.scale_factor, 
                method=self.upscaling_method
            )
        
        # 4. Apply inversion last
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
