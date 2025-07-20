"""API routes for image processing functionality."""

import os
import uuid
import tempfile
import json
import numpy as np
from typing import Dict, Any
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException, Body
from fastapi.responses import JSONResponse, FileResponse
from loguru import logger as logging
from pydantic import BaseModel

from smarttel.imaging.fits_handler import FITSHandler
from smarttel.imaging.upscaler import ImageEnhancementProcessor, UpscalingMethod, SharpeningMethod, DenoiseMethod
from smarttel.imaging.graxpert_stretch import GraxpertStretch
from smarttel.imaging.stretch import StretchParameter
from services.async_image_processing import (
    process_graxpert_async,
    process_enhancement_async, 
    read_fits_async,
    convert_to_pil_async
)

# Metadata file for persistence
METADATA_FILE = Path("fits_metadata.json")


router = APIRouter(prefix="/api/processing", tags=["processing"])

# Create uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Create processed images directory
PROCESSED_DIR = Path("processed")
PROCESSED_DIR.mkdir(exist_ok=True)


class EnhancementSettings(BaseModel):
    """Image enhancement settings."""
    upscaling_enabled: bool = False
    scale_factor: float = 2.0
    upscaling_method: str = "bicubic"
    sharpening_enabled: bool = False
    sharpening_method: str = "unsharp_mask"
    sharpening_strength: float = 1.0
    denoise_enabled: bool = False
    denoise_method: str = "tv_chambolle"
    denoise_strength: float = 1.0
    deconvolve_enabled: bool = False
    deconvolve_strength: float = 0.5
    deconvolve_psf_size: float = 2.0
    stretch_parameter: str = "15% Bg, 3 sigma"
    processing_order: list[str] = ["upscaling", "denoise", "deconvolve", "sharpening"]


class EnhanceRequest(BaseModel):
    """Request model for image enhancement."""
    image_url: str
    settings: EnhancementSettings


def load_metadata() -> Dict[str, Any]:
    """Load FITS metadata from file."""
    try:
        if METADATA_FILE.exists():
            with open(METADATA_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        logging.warning(f"Failed to load metadata: {e}")
    return {}


def save_metadata(metadata: Dict[str, Any]):
    """Save FITS metadata to file."""
    try:
        with open(METADATA_FILE, 'w') as f:
            json.dump(metadata, f, indent=2)
    except Exception as e:
        logging.error(f"Failed to save metadata: {e}")


def add_fits_entry(file_id: str, filename: str, file_size: int, dimensions: Dict[str, int], original_metadata: Dict[str, Any]):
    """Add a new FITS file entry to metadata."""
    metadata = load_metadata()
    metadata[file_id] = {
        "filename": filename,
        "file_size": file_size,
        "dimensions": dimensions,
        "original_metadata": original_metadata,
        "upload_time": str(uuid.uuid4())  # Simple timestamp replacement
    }
    save_metadata(metadata)


class ReprocessRequest(BaseModel):
    """Request model for reprocessing a FITS file by ID."""
    file_id: str


@router.post("/reprocess-fits")
async def reprocess_fits_file(request: ReprocessRequest):
    """
    Reprocess an existing FITS file to ensure proper stretch is applied.
    
    Args:
        request: Contains file_id to reprocess
        
    Returns:
        JSON response with reprocessed image URL and metadata
    """
    try:
        file_id = request.file_id
        
        # Find original FITS file
        original_fits = None
        for ext in ['.fits', '.fit']:
            fits_path = UPLOAD_DIR / f"{file_id}{ext}"
            if fits_path.exists():
                original_fits = fits_path
                break
        
        if not original_fits:
            raise HTTPException(status_code=404, detail="FITS file not found")
        
        # Get metadata to retrieve filename
        metadata = load_metadata()
        file_metadata = metadata.get(file_id, {})
        
        # Initialize FITS handler
        try:
            fits_handler = FITSHandler()
        except ImportError:
            raise HTTPException(
                status_code=500, 
                detail="FITS processing not available. Please install astropy."
            )
        
        # Re-process with GraXpert stretch for initial display
        output_path = PROCESSED_DIR / f"{file_id}.png"
        
        # Apply GraXpert stretch to original image for consistency (async)
        image_data, fits_metadata = await read_fits_async(str(original_fits))
        
        # Process original image with default GraXpert stretch (no other enhancements) - async
        original_stretched = await process_graxpert_async(
            image_data,
            stretch_parameter=StretchParameter["15% Bg, 3 sigma"],
            enhancement_settings=None  # No enhancements, just stretch
        )
        
        # Convert to PNG bytes (async)
        image_bytes = await convert_to_pil_async(original_stretched, "PNG")
        
        # Save processed image
        with open(output_path, "wb") as f:
            f.write(image_bytes)
        
        # Create metadata
        response_metadata = {
            'dimensions': {
                'width': image_data.shape[1],
                'height': image_data.shape[0]
            },
            'original_metadata': fits_metadata,
            'graxpert_stretch_applied': True,
            'original_stretch': '15% Bg, 3 sigma'
        }
        
        # Return response
        return JSONResponse({
            "success": True,
            "image_url": f"/processed/{file_id}.png",
            "dimensions": response_metadata["dimensions"],
            "metadata": response_metadata.get("original_metadata", {}),
            "file_id": file_id
        })
        
    except Exception as e:
        logging.error(f"Failed to reprocess FITS file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fits-to-image")
async def convert_fits_to_image(file: UploadFile = File(...)):
    """
    Convert uploaded FITS file to viewable image format.
    
    Args:
        file: Uploaded FITS file
        
    Returns:
        JSON response with image URL and metadata
    """
    if not file.filename.lower().endswith(('.fits', '.fit')):
        raise HTTPException(status_code=400, detail="File must be a FITS file")
    
    try:
        # Save uploaded file
        file_id = str(uuid.uuid4())
        file_ext = Path(file.filename).suffix
        temp_path = UPLOAD_DIR / f"{file_id}{file_ext}"
        
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        
        # Initialize FITS handler
        try:
            fits_handler = FITSHandler()
        except ImportError:
            raise HTTPException(
                status_code=500, 
                detail="FITS processing not available. Please install astropy."
            )
        
        # Convert FITS to PNG with GraXpert stretching for initial display
        # This provides a good baseline view using '10% Bg, 3 sigma' stretch
        output_path = PROCESSED_DIR / f"{file_id}.png"
        
        # Apply GraXpert stretch to original image for consistency (async)
        image_data, fits_metadata = await read_fits_async(str(temp_path))
        
        # Process original image with default GraXpert stretch (no other enhancements) - async
        original_stretched = await process_graxpert_async(
            image_data,
            stretch_parameter=StretchParameter["15% Bg, 3 sigma"],
            enhancement_settings=None  # No enhancements, just stretch
        )
        
        # Convert to PNG bytes (async)
        image_bytes = await convert_to_pil_async(original_stretched, "PNG")
        
        # Create metadata
        metadata = {
            'dimensions': {
                'width': image_data.shape[1],
                'height': image_data.shape[0]
            },
            'original_metadata': fits_metadata,
            'graxpert_stretch_applied': True,
            'original_stretch': '15% Bg, 3 sigma'
        }
        
        # Save processed image
        with open(output_path, "wb") as f:
            f.write(image_bytes)
        
        # Keep the original FITS file for enhancement processing
        # Move it to uploads directory instead of deleting
        permanent_fits_path = UPLOAD_DIR / f"{file_id}{file_ext}"
        if temp_path != permanent_fits_path:
            os.rename(str(temp_path), str(permanent_fits_path))
        
        # Save metadata for persistence
        add_fits_entry(
            file_id, 
            file.filename, 
            file.size, 
            metadata["dimensions"],
            metadata.get("original_metadata", {})
        )
        
        # Return response
        return JSONResponse({
            "success": True,
            "image_url": f"/processed/{file_id}.png",
            "dimensions": metadata["dimensions"],
            "metadata": metadata.get("original_metadata", {}),
            "file_id": file_id
        })
        
    except Exception as e:
        logging.error(f"Failed to process FITS file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enhance")
async def enhance_image(request: EnhanceRequest):
    """
    Apply image enhancements to a previously uploaded image.
    
    Args:
        request: Enhancement request with image URL and settings
        
    Returns:
        JSON response with enhanced image URL
    """
    try:
        logging.info(f"Received enhance request with settings: {request.settings}")
        logging.info(f"Raw request settings: deconvolve_enabled={request.settings.deconvolve_enabled}, denoise_enabled={request.settings.denoise_enabled}")
        # Extract file ID from URL
        if "/processed/" in request.image_url:
            file_name = Path(request.image_url).name
            file_id = file_name.split('.')[0]
        else:
            raise ValueError("Invalid image URL format")
        
        # Find original FITS file or processed image
        original_fits = None
        for ext in ['.fits', '.fit']:
            fits_path = UPLOAD_DIR / f"{file_id}{ext}"
            if fits_path.exists():
                original_fits = fits_path
                break
        
        # Create enhancement processor
        processor = ImageEnhancementProcessor(
            upscaling_enabled=request.settings.upscaling_enabled,
            scale_factor=request.settings.scale_factor,
            upscaling_method=UpscalingMethod(request.settings.upscaling_method),
            sharpening_enabled=request.settings.sharpening_enabled,
            sharpening_method=SharpeningMethod(request.settings.sharpening_method),
            sharpening_strength=request.settings.sharpening_strength,
            denoise_enabled=request.settings.denoise_enabled,
            denoise_method=DenoiseMethod(request.settings.denoise_method),
            denoise_strength=request.settings.denoise_strength,
            deconvolve_enabled=request.settings.deconvolve_enabled,
            deconvolve_strength=request.settings.deconvolve_strength,
            deconvolve_psf_size=request.settings.deconvolve_psf_size,
            processing_order=request.settings.processing_order
        )
        
        if original_fits:
            # Process from original FITS file using GraxpertStretch
            try:
                fits_handler = FITSHandler()
                
                # Read the FITS file to get raw image data (async)
                image_data, fits_metadata = await read_fits_async(str(original_fits))
                
                # Map UI stretch parameter to GraXpert StretchParameter enum
                stretch_param_str = request.settings.stretch_parameter
                try:
                    graxpert_stretch_param = StretchParameter[stretch_param_str]
                except KeyError:
                    # Default fallback if parameter not found
                    graxpert_stretch_param = StretchParameter["15% Bg, 3 sigma"]
                    logging.warning(f"Unknown stretch parameter '{stretch_param_str}', using default")
                
                logging.info(f"Using GraXpert stretch parameter: '{graxpert_stretch_param}' from UI: '{stretch_param_str}'")
                
                # Configure enhancement parameters
                logging.info(f"Configuring enhancement parameters from request.settings:")
                logging.info(f"  Upscaling: enabled={request.settings.upscaling_enabled}, factor={request.settings.scale_factor}, method={request.settings.upscaling_method}")
                logging.info(f"  Sharpening: enabled={request.settings.sharpening_enabled}, method={request.settings.sharpening_method}, strength={request.settings.sharpening_strength}")
                logging.info(f"  Denoising: enabled={request.settings.denoise_enabled}, method={request.settings.denoise_method}, strength={request.settings.denoise_strength}")
                logging.info(f"  Deconvolution: enabled={request.settings.deconvolve_enabled}, strength={request.settings.deconvolve_strength}, psf_size={request.settings.deconvolve_psf_size}")
                
                # Create enhancement settings dictionary for async processing
                enhancement_settings = {
                    'upscaling': {
                        'enabled': request.settings.upscaling_enabled,
                        'scale_factor': request.settings.scale_factor,
                        'method': request.settings.upscaling_method
                    },
                    'sharpening': {
                        'enabled': request.settings.sharpening_enabled,
                        'method': request.settings.sharpening_method,
                        'strength': request.settings.sharpening_strength
                    },
                    'denoising': {
                        'enabled': request.settings.denoise_enabled,
                        'method': request.settings.denoise_method,
                        'strength': request.settings.denoise_strength
                    },
                    'deconvolution': {
                        'enabled': request.settings.deconvolve_enabled,
                        'strength': request.settings.deconvolve_strength,
                        'psf_size': request.settings.deconvolve_psf_size
                    }
                }
                
                # Process the image with GraxpertStretch (handles both stretching and enhancements) - async
                enhanced_image = await process_graxpert_async(
                    image_data,
                    stretch_parameter=graxpert_stretch_param,
                    enhancement_settings=enhancement_settings
                )
                
                # Convert to PNG bytes (async)
                enhanced_bytes = await convert_to_pil_async(enhanced_image, "PNG")
                
                metadata = {
                    'dimensions': {
                        'width': enhanced_image.shape[1],
                        'height': enhanced_image.shape[0]
                    },
                    'original_dimensions': {
                        'width': image_data.shape[1],
                        'height': image_data.shape[0]
                    },
                    'original_metadata': fits_metadata,
                    'graxpert_stretch_applied': True
                }
            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="FITS processing not available. Please install astropy."
                )
        else:
            # Process from existing PNG (async)
            existing_path = PROCESSED_DIR / f"{file_id}.png"
            if not existing_path.exists():
                raise HTTPException(status_code=404, detail="Image not found")
            
            # Load image in thread pool
            async def load_existing_image():
                from PIL import Image
                pil_image = Image.open(existing_path)
                return np.array(pil_image).astype(np.float32) / 255.0
            
            import asyncio
            loop = asyncio.get_event_loop()
            from services.async_image_processing import get_cpu_executor
            image_array = await loop.run_in_executor(get_cpu_executor(), load_existing_image)
            
            # Create enhancement settings for async processing
            enhancement_settings = {
                'upscaling_enabled': request.settings.upscaling_enabled,
                'scale_factor': request.settings.scale_factor,
                'upscaling_method': request.settings.upscaling_method,
                'sharpening_enabled': request.settings.sharpening_enabled,
                'sharpening_method': request.settings.sharpening_method,
                'sharpening_strength': request.settings.sharpening_strength,
                'denoise_enabled': request.settings.denoise_enabled,
                'denoise_method': request.settings.denoise_method,
                'denoise_strength': request.settings.denoise_strength,
                'deconvolve_enabled': request.settings.deconvolve_enabled,
                'deconvolve_strength': request.settings.deconvolve_strength,
                'deconvolve_psf_size': request.settings.deconvolve_psf_size
            }
            
            # Process (async)
            enhanced = await process_enhancement_async(image_array, enhancement_settings)
            
            # Convert to PNG bytes (async)
            enhanced_bytes = await convert_to_pil_async(enhanced, "PNG")
            
            metadata = {
                'dimensions': {
                    'width': enhanced.shape[1],
                    'height': enhanced.shape[0]
                }
            }
        
        # Save enhanced image with unique name
        enhanced_id = f"{file_id}_enhanced_{uuid.uuid4().hex[:8]}"
        enhanced_path = PROCESSED_DIR / f"{enhanced_id}.png"
        
        with open(enhanced_path, "wb") as f:
            f.write(enhanced_bytes)
        
        return JSONResponse({
            "success": True,
            "enhanced_image_url": f"/processed/{enhanced_id}.png",
            "processing_time": 0.0,  # TODO: Add actual timing
            "dimensions": metadata.get("dimensions", {})
        })
        
    except Exception as e:
        logging.error(f"Failed to enhance image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/persisted-files")
async def get_persisted_files():
    """Get list of persisted FITS files."""
    try:
        metadata = load_metadata()
        
        # Convert metadata to frontend-friendly format
        files = []
        for file_id, data in metadata.items():
            # Check if both FITS file and PNG exist
            fits_exists = False
            for ext in ['.fits', '.fit']:
                fits_path = UPLOAD_DIR / f"{file_id}{ext}"
                if fits_path.exists():
                    fits_exists = True
                    break
            
            png_path = PROCESSED_DIR / f"{file_id}.png"
            png_exists = png_path.exists()
            
            if fits_exists and png_exists:
                files.append({
                    "file_id": file_id,
                    "filename": data["filename"],
                    "file_size": data["file_size"],
                    "dimensions": data["dimensions"],
                    "image_url": f"/processed/{file_id}.png",
                    "upload_time": data.get("upload_time", "")
                })
        
        return JSONResponse({
            "success": True,
            "files": files
        })
        
    except Exception as e:
        logging.error(f"Failed to load persisted files: {e}")
        return JSONResponse({
            "success": False,
            "files": []
        })


@router.delete("/persisted-files/{file_id}")
async def delete_persisted_file(file_id: str):
    """Delete a persisted FITS file and its associated images."""
    try:
        metadata = load_metadata()
        
        if file_id not in metadata:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Remove FITS file
        for ext in ['.fits', '.fit']:
            fits_path = UPLOAD_DIR / f"{file_id}{ext}"
            if fits_path.exists():
                fits_path.unlink()
                logging.info(f"Deleted FITS file: {fits_path}")
        
        # Remove PNG file
        png_path = PROCESSED_DIR / f"{file_id}.png"
        if png_path.exists():
            png_path.unlink()
            logging.info(f"Deleted PNG file: {png_path}")
        
        # Remove any enhanced images
        for enhanced_file in PROCESSED_DIR.glob(f"{file_id}_enhanced_*.png"):
            enhanced_file.unlink()
            logging.info(f"Deleted enhanced file: {enhanced_file}")
        
        # Remove from metadata
        del metadata[file_id]
        save_metadata(metadata)
        
        return JSONResponse({
            "success": True,
            "message": "File deleted successfully"
        })
        
    except Exception as e:
        logging.error(f"Failed to delete file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/processed/{filename}")
async def get_processed_image(filename: str):
    """Serve processed images."""
    file_path = PROCESSED_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    return FileResponse(file_path, media_type="image/png")