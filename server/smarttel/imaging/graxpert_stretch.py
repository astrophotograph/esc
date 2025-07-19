from typing import Optional

import numpy as np
from skimage.exposure import exposure
from skimage.util import img_as_float32

from smarttel.imaging.image_processor import ImageProcessor
from smarttel.imaging.stretch import stretch, StretchParameters, StretchParameter
from smarttel.imaging.upscaler import ImageEnhancementProcessor, UpscalingMethod, SharpeningMethod, DenoiseMethod


class GraxpertStretch(ImageProcessor):
    def __init__(self):
        self.enhancement_processor = ImageEnhancementProcessor()
        self.stretch_parameter = "15% Bg, 3 sigma"

    def process(
        self, image: np.ndarray, stretch_parameter: Optional[StretchParameter] = None
    ) -> Optional[np.ndarray]:
        from loguru import logger as logging
        
        # Use provided parameter or default
        stretch_param = stretch_parameter or self.stretch_parameter
        
        logging.info(f"GraxpertStretch.process() starting with stretch_param: {stretch_param}")
        logging.info(f"Input image shape: {image.shape}, dtype: {image.dtype}")
        
        # Convert to float32 for processing
        image_array = img_as_float32(image)
        if np.min(image_array) < 0 or np.max(image_array > 1):
            image_array = exposure.rescale_intensity(image_array, out_range=(0, 1))

        # FIRST: Apply upscaling if enabled (before stretching for better quality)
        if self.enhancement_processor.upscaling_enabled and self.enhancement_processor.scale_factor > 1.0:
            logging.info(f"Applying upscaling BEFORE stretching: method={self.enhancement_processor.upscaling_method}, scale_factor={self.enhancement_processor.scale_factor}")
            image_array = self.enhancement_processor.upscaler.upscale(
                image_array, 
                scale_factor=self.enhancement_processor.scale_factor, 
                method=self.enhancement_processor.upscaling_method
            )
            logging.info(f"Upscaling complete, new shape: {image_array.shape}")

        # SECOND: Apply stretch to the potentially upscaled image
        logging.info(f"Applying stretch with StretchParameters({stretch_param})")
        image_display = stretch(image_array, StretchParameters(stretch_param))
        image_display = image_display * 255
        logging.info(f"Stretch complete, image range: {np.min(image_display):.2f} - {np.max(image_display):.2f}")

        # THIRD: Apply remaining enhancements (denoising, deconvolution, sharpening)
        # Create a temporary processor without upscaling since we already did it
        from smarttel.imaging.upscaler import ImageEnhancementProcessor
        temp_processor = ImageEnhancementProcessor(
            upscaling_enabled=False,  # Already done
            scale_factor=1.0,
            upscaling_method=self.enhancement_processor.upscaling_method,
            sharpening_enabled=self.enhancement_processor.sharpening_enabled,
            sharpening_method=self.enhancement_processor.sharpening_method,
            sharpening_strength=self.enhancement_processor.sharpening_strength,
            denoise_enabled=self.enhancement_processor.denoise_enabled,
            denoise_method=self.enhancement_processor.denoise_method,
            denoise_strength=self.enhancement_processor.denoise_strength,
            deconvolve_enabled=self.enhancement_processor.deconvolve_enabled,
            deconvolve_strength=self.enhancement_processor.deconvolve_strength,
            deconvolve_psf_size=self.enhancement_processor.deconvolve_psf_size
        )
        
        logging.info(f"Calling enhancement_processor.process() for remaining enhancements on image with shape: {image_display.shape}")
        image_display = temp_processor.process(image_display)
        logging.info(f"Enhancement processing complete, final shape: {image_display.shape}")

        return image_display

    def set_stretch_parameter(self, stretch_parameter: StretchParameter):
        """Set the GraXpert stretch parameter."""
        self.stretch_parameter = stretch_parameter

    def get_stretch_parameter(self) -> StretchParameter:
        """Get the current GraXpert stretch parameter."""
        return self.stretch_parameter

    def set_upscaling_enabled(self, enabled: bool):
        """Enable or disable upscaling."""
        self.enhancement_processor.upscaling_enabled = enabled

    def set_upscaling_params(
        self,
        enabled: bool,
        scale_factor: float = 2.0,
        method: UpscalingMethod = UpscalingMethod.BICUBIC,
    ):
        """Configure upscaling parameters."""
        self.enhancement_processor.set_upscaling_params(enabled, scale_factor, method)
    
    def set_sharpening_params(
        self,
        enabled: bool,
        method: SharpeningMethod = SharpeningMethod.UNSHARP_MASK,
        strength: float = 1.0,
    ):
        """Configure sharpening parameters."""
        self.enhancement_processor.set_sharpening_params(enabled, method, strength)
    
    def set_denoise_params(
        self,
        enabled: bool,
        method: DenoiseMethod = DenoiseMethod.TV_CHAMBOLLE,
        strength: float = 1.0,
    ):
        """Configure denoising parameters."""
        from loguru import logger as logging
        logging.info(f"GraxpertStretch.set_denoise_params: enabled={enabled}, method={method}, strength={strength}")
        self.enhancement_processor.denoise_enabled = enabled
        self.enhancement_processor.denoise_method = method
        self.enhancement_processor.denoise_strength = strength
    
    def set_deconvolve_params(
        self,
        enabled: bool,
        strength: float = 0.5,
        psf_size: float = 2.0,
    ):
        """Configure deconvolution parameters."""
        from loguru import logger as logging
        logging.info(f"GraxpertStretch.set_deconvolve_params: enabled={enabled}, strength={strength}, psf_size={psf_size}")
        self.enhancement_processor.set_deconvolve_params(enabled, strength, psf_size)
    
    def get_enhancement_settings(self) -> dict:
        """Get all current enhancement settings."""
        settings = self.enhancement_processor.get_enhancement_settings()
        settings["stretch_parameter"] = self.stretch_parameter
        return settings
