"""FITS file handling and processing utilities."""

import io
import os
import tempfile
from typing import Dict, Tuple, Any, Optional
from pathlib import Path

import numpy as np
from PIL import Image
from loguru import logger as logging

try:
    from astropy.io import fits
    HAS_ASTROPY = True
except ImportError:
    HAS_ASTROPY = False
    logging.warning("astropy not available - FITS file support will be limited")


class FITSHandler:
    """Handle FITS file reading and conversion to standard image formats."""
    
    def __init__(self):
        if not HAS_ASTROPY:
            raise ImportError("astropy is required for FITS file handling. Install with: pip install astropy")
    
    def read_fits_file(self, file_path: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Read a FITS file and extract image data and metadata.
        
        Args:
            file_path: Path to the FITS file
            
        Returns:
            Tuple of (image_array, metadata_dict)
        """
        try:
            with fits.open(file_path) as hdul:
                # Get the primary HDU (Header Data Unit)
                primary_hdu = hdul[0]
                
                # Extract image data
                image_data = primary_hdu.data
                
                if image_data is None:
                    # Try other HDUs if primary has no data
                    for hdu in hdul[1:]:
                        if hdu.data is not None:
                            image_data = hdu.data
                            primary_hdu = hdu
                            break
                
                if image_data is None:
                    raise ValueError("No image data found in FITS file")
                
                # Extract metadata from header
                metadata = {}
                for key, value in primary_hdu.header.items():
                    if key and not key.startswith('HISTORY'):
                        metadata[key] = value
                
                # Handle different image dimensions
                original_shape = image_data.shape
                if len(image_data.shape) == 3:
                    # For RGB or multi-channel data, check if it's color
                    if image_data.shape[0] == 3 and image_data.shape[0] < min(image_data.shape[1], image_data.shape[2]):
                        # RGB channels first (3, H, W) - transpose to (H, W, 3)
                        image_data = np.transpose(image_data, (1, 2, 0))
                        logging.info(f"Transposed from {original_shape} to {image_data.shape}")
                    elif image_data.shape[2] == 3 and image_data.shape[2] < min(image_data.shape[0], image_data.shape[1]):
                        # Already in (H, W, 3) format
                        logging.info(f"Color image in (H, W, 3) format: {image_data.shape}")
                    elif image_data.shape[0] == 3:
                        # Could be (3, H, W) format
                        image_data = np.transpose(image_data, (1, 2, 0))
                        logging.info(f"Assumed (3, H, W) format, transposed to {image_data.shape}")
                    else:
                        # Take first channel for non-RGB data
                        logging.info(f"Non-RGB data with shape {original_shape}, taking first channel")
                        image_data = image_data[0]
                elif len(image_data.shape) > 3:
                    raise ValueError(f"Unsupported image dimensions: {image_data.shape}")
                
                # Convert to float32 for processing
                image_data = image_data.astype(np.float32)
                
                logging.info(f"Loaded FITS file: shape={image_data.shape}, dtype={image_data.dtype}")
                if len(image_data.shape) == 3:
                    logging.info(f"Color image detected with {image_data.shape[2]} channels")
                else:
                    logging.info("Grayscale image detected")
                
                return image_data, metadata
                
        except Exception as e:
            logging.error(f"Failed to read FITS file: {e}")
            raise
    
    def normalize_image_data(self, image_data: np.ndarray, stretch_mode: str = "auto", bg_percent: float = 15.0) -> np.ndarray:
        """
        Normalize FITS image data for display.
        
        Args:
            image_data: Raw image array from FITS file
            stretch_mode: Stretch mode - "auto", "linear", "log", "asinh", "sqrt"
            bg_percent: Background percentage for sigma stretching (default 15.0)
            
        Returns:
            Normalized image array in range [0, 1]
        """
        # Handle NaN and infinite values
        image_data = np.nan_to_num(image_data, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Check if this is a color image
        is_color = len(image_data.shape) == 3 and image_data.shape[2] == 3
        
        if stretch_mode == "auto":
            # Auto-detect best stretch based on data distribution
            if is_color:
                # Use luminance for auto-detection
                luminance = 0.299 * image_data[:,:,0] + 0.587 * image_data[:,:,1] + 0.114 * image_data[:,:,2]
                data_range = np.ptp(luminance)
                data_mean = np.mean(luminance)
            else:
                data_range = np.ptp(image_data)
                data_mean = np.mean(image_data)
            
            if data_range > 1000 * data_mean:
                stretch_mode = "log"
            elif data_range > 100 * data_mean:
                stretch_mode = "asinh"
            else:
                stretch_mode = "linear"
        
        if is_color:
            # Process each channel separately for color images
            normalized = np.zeros_like(image_data)
            for i in range(3):
                channel = image_data[:,:,i]
                normalized[:,:,i] = self._normalize_channel(channel, stretch_mode, bg_percent)
        else:
            # Process single channel
            normalized = self._normalize_channel(image_data, stretch_mode, bg_percent)
        
        return normalized
    
    def _normalize_channel(self, channel: np.ndarray, stretch_mode: str, bg_percent: float = 15.0, sigma_factor: float = 3.0) -> np.ndarray:
        """Normalize a single channel of image data with astronomical stretching."""
        
        if stretch_mode == "no_stretch":
            # Simple min-max normalization to [0, 1] without statistical stretching
            vmin = np.min(channel)
            vmax = np.max(channel)
            if vmax > vmin:
                return (channel - vmin) / (vmax - vmin)
            else:
                return np.zeros_like(channel)
        
        # Calculate background and noise statistics
        sorted_data = np.sort(channel.flatten())
        n_pixels = len(sorted_data)
        
        # Background estimation (median of bottom bg_percent)
        bg_end_idx = int(n_pixels * bg_percent / 100.0)
        background = np.median(sorted_data[:bg_end_idx])
        
        # Noise estimation (MAD of background pixels)
        bg_pixels = sorted_data[:bg_end_idx]
        mad = np.median(np.abs(bg_pixels - background))
        noise_sigma = 1.4826 * mad  # Convert MAD to standard deviation
        
        # Apply astronomical stretch
        if "sigma" in stretch_mode.lower():
            # Extract sigma value from stretch parameter
            if "2 sigma" in stretch_mode.lower():
                sigma_factor = 2.0
            elif "3 sigma" in stretch_mode.lower():
                sigma_factor = 3.0
            
            # Sigma-based stretch
            vmin = background
            vmax = background + sigma_factor * noise_sigma
            
            # Apply stretch with soft clipping for highlights
            normalized = (channel - vmin) / (vmax - vmin + 1e-10)
            
            # Apply soft compression for values > 1 to preserve highlight detail
            mask = normalized > 1.0
            normalized[mask] = 1.0 + 0.2 * np.log10(normalized[mask])
            normalized = np.clip(normalized, 0, 1.2)
            normalized = normalized / 1.2  # Renormalize to [0, 1]
            
        else:
            # Default linear stretch with percentile clipping
            vmin = np.percentile(channel, 1)
            vmax = np.percentile(channel, 99)
            normalized = np.clip((channel - vmin) / (vmax - vmin + 1e-10), 0, 1)
        
        return normalized
    
    def fits_to_image(self, fits_path: str, output_format: str = "PNG", 
                     stretch_mode: str = "auto", colormap: Optional[str] = None) -> Tuple[bytes, Dict[str, Any]]:
        """
        Convert FITS file to standard image format.
        
        Args:
            fits_path: Path to FITS file
            output_format: Output format (PNG, JPEG, TIFF)
            stretch_mode: Stretch mode for normalization
            colormap: Optional colormap name (e.g., "viridis", "gray", "hot")
            
        Returns:
            Tuple of (image_bytes, metadata)
        """
        # Read FITS file
        image_data, metadata = self.read_fits_file(fits_path)
        
        # Normalize the data
        normalized = self.normalize_image_data(image_data, stretch_mode)
        
        # Check if this is a color image
        is_color = len(normalized.shape) == 3 and normalized.shape[2] == 3
        logging.info(f"fits_to_image: is_color={is_color}, normalized.shape={normalized.shape}")
        
        # Convert to 8-bit
        image_8bit = (normalized * 255).astype(np.uint8)
        
        # Apply colormap if specified (only for grayscale images)
        if colormap and not is_color:
            try:
                import matplotlib.cm as cm
                cmap = cm.get_cmap(colormap)
                colored = cmap(normalized)
                image_8bit = (colored[:, :, :3] * 255).astype(np.uint8)
                is_color = True  # Now it's a color image
            except Exception as e:
                logging.warning(f"Failed to apply colormap {colormap}: {e}")
        
        # Create PIL image
        if is_color:
            pil_image = Image.fromarray(image_8bit, mode='RGB')
            logging.info(f"Created RGB PIL image from shape {image_8bit.shape}")
        else:
            pil_image = Image.fromarray(image_8bit, mode='L')
            logging.info(f"Created grayscale PIL image from shape {image_8bit.shape}")
        
        # Additional debug info
        logging.info(f"PIL image mode: {pil_image.mode}, size: {pil_image.size}")
        
        # Convert to bytes
        output_buffer = io.BytesIO()
        pil_image.save(output_buffer, format=output_format)
        image_bytes = output_buffer.getvalue()
        
        # Prepare metadata
        result_metadata = {
            'dimensions': {
                'width': image_data.shape[1],
                'height': image_data.shape[0]
            },
            'original_metadata': metadata,
            'stretch_mode': stretch_mode,
            'colormap': colormap
        }
        
        return image_bytes, result_metadata
    
    def process_fits_with_enhancements(self, fits_path: str, enhancement_processor: Any,
                                     output_format: str = "PNG", stretch_mode: str = "linear", bg_percent: float = 15.0) -> Tuple[bytes, Dict[str, Any]]:
        """
        Process FITS file with image enhancement pipeline.
        
        Args:
            fits_path: Path to FITS file
            enhancement_processor: ImageEnhancementProcessor instance
            output_format: Output format
            
        Returns:
            Tuple of (enhanced_image_bytes, metadata)
        """
        # Read FITS file
        image_data, metadata = self.read_fits_file(fits_path)
        
        # Normalize to [0, 1] range for processing with specified stretch mode
        normalized = self.normalize_image_data(image_data, stretch_mode=stretch_mode, bg_percent=bg_percent)
        
        # Process with enhancement pipeline
        enhanced = enhancement_processor.process(normalized)
        
        # Check if this is a color image
        is_color = len(enhanced.shape) == 3 and enhanced.shape[2] == 3
        
        # Convert to 8-bit
        if enhanced.dtype != np.uint8:
            enhanced_8bit = (np.clip(enhanced, 0, 1) * 255).astype(np.uint8)
        else:
            enhanced_8bit = enhanced
        
        # Create PIL image
        if is_color:
            pil_image = Image.fromarray(enhanced_8bit, mode='RGB')
            logging.info(f"Enhancement: Created RGB PIL image from shape {enhanced_8bit.shape}")
        else:
            pil_image = Image.fromarray(enhanced_8bit, mode='L')
            logging.info(f"Enhancement: Created grayscale PIL image from shape {enhanced_8bit.shape}")
        
        # Additional debug info
        logging.info(f"Enhancement: PIL image mode: {pil_image.mode}, size: {pil_image.size}")
        
        # Convert to bytes
        output_buffer = io.BytesIO()
        pil_image.save(output_buffer, format=output_format)
        image_bytes = output_buffer.getvalue()
        
        # Prepare metadata
        result_metadata = {
            'dimensions': {
                'width': enhanced.shape[1],
                'height': enhanced.shape[0]
            },
            'original_dimensions': {
                'width': image_data.shape[1],
                'height': image_data.shape[0]
            },
            'original_metadata': metadata,
            'enhancements_applied': True
        }
        
        return image_bytes, result_metadata