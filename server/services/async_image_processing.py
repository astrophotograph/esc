"""Async-friendly image processing service that runs heavy operations in thread pools."""

import asyncio
import functools
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any
import numpy as np
from loguru import logger as logging

from smarttel.imaging.graxpert_stretch import GraxpertStretch
from smarttel.imaging.upscaler import ImageEnhancementProcessor, UpscalingMethod, SharpeningMethod, DenoiseMethod
from smarttel.imaging.stretch import StretchParameter
from smarttel.imaging.fits_handler import FITSHandler


# Global thread pool for CPU-intensive tasks
_cpu_executor: Optional[ThreadPoolExecutor] = None


def get_cpu_executor() -> ThreadPoolExecutor:
    """Get or create the global CPU thread pool executor."""
    global _cpu_executor
    if _cpu_executor is None:
        # Use number of CPU cores, but limit to reasonable max
        import os
        max_workers = min(os.cpu_count() or 4, 8)
        _cpu_executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="image_processing"
        )
        logging.info(f"Created CPU thread pool with {max_workers} workers")
    return _cpu_executor


def shutdown_cpu_executor():
    """Shutdown the global CPU thread pool executor."""
    global _cpu_executor
    if _cpu_executor is not None:
        _cpu_executor.shutdown(wait=True)
        _cpu_executor = None
        logging.info("CPU thread pool executor shutdown")


def _sync_graxpert_process(
    image_data: np.ndarray,
    stretch_parameter: Optional[StretchParameter] = None,
    enhancement_settings: Optional[Dict[str, Any]] = None
) -> np.ndarray:
    """
    Synchronous GraXpert processing function to run in thread pool.
    
    Args:
        image_data: Input image array
        stretch_parameter: GraXpert stretch parameter
        enhancement_settings: Dictionary with enhancement settings
        
    Returns:
        Processed image array
    """
    import threading
    logging.info(f"Starting sync GraXpert processing in thread: {threading.current_thread().name}")
    
    # Create GraxpertStretch processor
    graxpert_processor = GraxpertStretch()
    
    if stretch_parameter is not None:
        graxpert_processor.set_stretch_parameter(stretch_parameter)
    
    # Configure enhancement parameters if provided
    if enhancement_settings:
        if 'upscaling' in enhancement_settings:
            up = enhancement_settings['upscaling']
            graxpert_processor.set_upscaling_params(
                enabled=up.get('enabled', False),
                scale_factor=up.get('scale_factor', 2.0),
                method=UpscalingMethod(up.get('method', 'bicubic'))
            )
        
        if 'sharpening' in enhancement_settings:
            sharp = enhancement_settings['sharpening']
            graxpert_processor.set_sharpening_params(
                enabled=sharp.get('enabled', False),
                method=SharpeningMethod(sharp.get('method', 'unsharp_mask')),
                strength=sharp.get('strength', 1.0)
            )
        
        if 'denoising' in enhancement_settings:
            denoise = enhancement_settings['denoising']
            graxpert_processor.set_denoise_params(
                enabled=denoise.get('enabled', False),
                method=DenoiseMethod(denoise.get('method', 'tv_chambolle')),
                strength=denoise.get('strength', 1.0)
            )
        
        if 'deconvolution' in enhancement_settings:
            deconv = enhancement_settings['deconvolution']
            graxpert_processor.set_deconvolve_params(
                enabled=deconv.get('enabled', False),
                strength=deconv.get('strength', 0.5),
                psf_size=deconv.get('psf_size', 2.0)
            )
    
    # Process the image
    result = graxpert_processor.process(image_data, stretch_parameter)
    
    logging.info("Completed sync GraXpert processing in thread")
    return result


def _sync_enhancement_process(
    image_data: np.ndarray,
    enhancement_settings: Dict[str, Any]
) -> np.ndarray:
    """
    Synchronous image enhancement processing function to run in thread pool.
    
    Args:
        image_data: Input image array
        enhancement_settings: Dictionary with enhancement settings
        
    Returns:
        Enhanced image array
    """
    import threading
    logging.info(f"Starting sync enhancement processing in thread: {threading.current_thread().name}")
    
    # Create enhancement processor
    processor = ImageEnhancementProcessor(
        upscaling_enabled=enhancement_settings.get('upscaling_enabled', False),
        scale_factor=enhancement_settings.get('scale_factor', 2.0),
        upscaling_method=UpscalingMethod(enhancement_settings.get('upscaling_method', 'bicubic')),
        sharpening_enabled=enhancement_settings.get('sharpening_enabled', False),
        sharpening_method=SharpeningMethod(enhancement_settings.get('sharpening_method', 'unsharp_mask')),
        sharpening_strength=enhancement_settings.get('sharpening_strength', 1.0),
        denoise_enabled=enhancement_settings.get('denoise_enabled', False),
        denoise_method=DenoiseMethod(enhancement_settings.get('denoise_method', 'tv_chambolle')),
        denoise_strength=enhancement_settings.get('denoise_strength', 1.0),
        deconvolve_enabled=enhancement_settings.get('deconvolve_enabled', False),
        deconvolve_strength=enhancement_settings.get('deconvolve_strength', 0.5),
        deconvolve_psf_size=enhancement_settings.get('deconvolve_psf_size', 2.0)
    )
    
    # Process the image
    result = processor.process(image_data)
    
    logging.info("Completed sync enhancement processing in thread")
    return result


def _sync_fits_read(fits_path: str) -> tuple[np.ndarray, Dict[str, Any]]:
    """
    Synchronous FITS file reading function to run in thread pool.
    
    Args:
        fits_path: Path to FITS file
        
    Returns:
        Tuple of (image_data, metadata)
    """
    logging.info(f"Starting sync FITS reading in thread: {fits_path}")
    
    fits_handler = FITSHandler()
    image_data, metadata = fits_handler.read_fits_file(fits_path)
    
    logging.info("Completed sync FITS reading in thread")
    return image_data, metadata


async def process_graxpert_async(
    image_data: np.ndarray,
    stretch_parameter: Optional[StretchParameter] = None,
    enhancement_settings: Optional[Dict[str, Any]] = None
) -> np.ndarray:
    """
    Async wrapper for GraXpert processing that runs in a thread pool.
    
    Args:
        image_data: Input image array
        stretch_parameter: GraXpert stretch parameter
        enhancement_settings: Dictionary with enhancement settings
        
    Returns:
        Processed image array
    """
    loop = asyncio.get_event_loop()
    executor = get_cpu_executor()
    
    logging.info("Submitting GraXpert processing to thread pool")
    
    # Run the synchronous processing function in thread pool
    result = await loop.run_in_executor(
        executor,
        functools.partial(
            _sync_graxpert_process,
            image_data,
            stretch_parameter,
            enhancement_settings
        )
    )
    
    logging.info("GraXpert processing completed in thread pool")
    return result


async def process_enhancement_async(
    image_data: np.ndarray,
    enhancement_settings: Dict[str, Any]
) -> np.ndarray:
    """
    Async wrapper for image enhancement processing that runs in a thread pool.
    
    Args:
        image_data: Input image array
        enhancement_settings: Dictionary with enhancement settings
        
    Returns:
        Enhanced image array
    """
    loop = asyncio.get_event_loop()
    executor = get_cpu_executor()
    
    logging.info("Submitting enhancement processing to thread pool")
    
    # Run the synchronous processing function in thread pool
    result = await loop.run_in_executor(
        executor,
        functools.partial(
            _sync_enhancement_process,
            image_data,
            enhancement_settings
        )
    )
    
    logging.info("Enhancement processing completed in thread pool")
    return result


async def read_fits_async(fits_path: str) -> tuple[np.ndarray, Dict[str, Any]]:
    """
    Async wrapper for FITS file reading that runs in a thread pool.
    
    Args:
        fits_path: Path to FITS file
        
    Returns:
        Tuple of (image_data, metadata)
    """
    loop = asyncio.get_event_loop()
    executor = get_cpu_executor()
    
    logging.info(f"Submitting FITS reading to thread pool: {fits_path}")
    
    # Run the synchronous reading function in thread pool
    result = await loop.run_in_executor(
        executor,
        functools.partial(_sync_fits_read, fits_path)
    )
    
    logging.info("FITS reading completed in thread pool")
    return result


async def convert_to_pil_async(
    image_array: np.ndarray,
    output_format: str = "PNG"
) -> bytes:
    """
    Async wrapper for PIL image conversion that runs in a thread pool.
    
    Args:
        image_array: Image array to convert
        output_format: Output format (PNG, JPEG, etc.)
        
    Returns:
        Image bytes
    """
    def _sync_convert():
        from PIL import Image
        import io
        
        logging.info(f"Converting image to {output_format} in thread")
        
        # Ensure proper data type
        if image_array.dtype != np.uint8:
            image_8bit = (np.clip(image_array, 0, 255)).astype(np.uint8)
        else:
            image_8bit = image_array
        
        # Determine image mode
        if len(image_8bit.shape) == 3 and image_8bit.shape[2] == 3:
            pil_image = Image.fromarray(image_8bit, mode='RGB')
        else:
            pil_image = Image.fromarray(image_8bit, mode='L')
        
        # Convert to bytes
        output_buffer = io.BytesIO()
        pil_image.save(output_buffer, format=output_format)
        return output_buffer.getvalue()
    
    loop = asyncio.get_event_loop()
    executor = get_cpu_executor()
    
    logging.info(f"Submitting PIL conversion to thread pool")
    
    result = await loop.run_in_executor(executor, _sync_convert)
    
    logging.info("PIL conversion completed in thread pool")
    return result