from typing import Optional

import numpy as np
from skimage.exposure import exposure
from skimage.util import img_as_float32

from smarttel.imaging.image_processor import ImageProcessor
from smarttel.imaging.stretch import stretch, StretchParameters, StretchParameter
from smarttel.imaging.upscaler import ImageEnhancementProcessor, UpscalingMethod, SharpeningMethod


class GraxpertStretch(ImageProcessor):
    def __init__(self):
        self.enhancement_processor = ImageEnhancementProcessor()
        self.stretch_parameter = "15% Bg, 3 sigma"

    def process(
        self, image: np.ndarray, stretch_parameter: Optional[StretchParameter] = None
    ) -> Optional[np.ndarray]:
        # Use provided parameter or default
        stretch_param = stretch_parameter or self.stretch_parameter
        
        image_array = img_as_float32(image)
        if np.min(image_array) < 0 or np.max(image_array > 1):
            image_array = exposure.rescale_intensity(image_array, out_range=(0, 1))

        image_display = stretch(image_array, StretchParameters(stretch_param))
        image_display = image_display * 255

        # Apply all enhancements (upscaling, sharpening, inversion)
        image_display = self.enhancement_processor.process(image_display)

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
    
    def set_invert_enabled(self, enabled: bool):
        """Enable or disable image inversion."""
        self.enhancement_processor.set_invert_enabled(enabled)
    
    def get_enhancement_settings(self) -> dict:
        """Get all current enhancement settings."""
        settings = self.enhancement_processor.get_enhancement_settings()
        settings["stretch_parameter"] = self.stretch_parameter
        return settings
