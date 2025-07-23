"""
Astrometry.net client for plate solving telescope images.
"""

import json
import asyncio
from typing import Optional, Dict, Any
import numpy as np
import cv2

import httpx
from loguru import logger
from pydantic import BaseModel, Field

from smarttel.seestar.protocol_handlers import ScopeImage


class AstrometrySettings(BaseModel):
    """Settings for astrometry.net API."""

    api_key: str
    api_url: str = "http://nova.astrometry.net/api/"
    scale_low: Optional[float] = None
    scale_high: Optional[float] = None
    scale_units: str = "degwidth"
    center_ra: Optional[float] = None
    center_dec: Optional[float] = None
    radius: Optional[float] = None
    downsample_factor: Optional[int] = None
    tweak_order: Optional[int] = None
    crpix_center: bool = True
    parity: Optional[int] = None


class PlateSolveResult(BaseModel):
    """Result from astrometry.net plate solving."""

    success: bool
    ra: Optional[float] = Field(None, description="Right ascension in degrees")
    dec: Optional[float] = Field(None, description="Declination in degrees")
    orientation: Optional[float] = Field(None, description="Field rotation in degrees")
    pixscale: Optional[float] = Field(None, description="Pixel scale in arcsec/pixel")
    field_width: Optional[float] = Field(None, description="Field width in degrees")
    field_height: Optional[float] = Field(None, description="Field height in degrees")
    error: Optional[str] = None
    job_id: Optional[int] = None
    submission_id: Optional[int] = None


class AstrometryClient:
    """Client for interacting with astrometry.net API."""

    def __init__(self, api_key: str, api_url: str = "http://nova.astrometry.net/api/"):
        self.settings = AstrometrySettings(api_key=api_key, api_url=api_url)
        self.session_key: Optional[str] = None
        # Add user agent and headers that might help
        headers = {
            "User-Agent": "ALP-Experimental-Telescope-Control/1.0",
            "Accept": "application/json",
        }
        self.client = httpx.AsyncClient(timeout=300.0, headers=headers)

    async def login(self) -> bool:
        """Login to astrometry.net and get session key."""
        # Try both HTTP and HTTPS endpoints
        urls_to_try = [self.settings.api_url]
        if self.settings.api_url.startswith("http://"):
            https_url = self.settings.api_url.replace("http://", "https://")
            urls_to_try.append(https_url)
        
        for api_url in urls_to_try:
            try:
                logger.info(f"Attempting login to: {api_url}login")
                # Use request-json format - astrometry.net API expects this specific format
                response = await self.client.post(
                    f"{api_url}login", 
                    data={"request-json": json.dumps({"apikey": self.settings.api_key})}
                )
                response.raise_for_status()
                
                # Log the raw response for debugging
                logger.debug(f"Login response status: {response.status_code}")
                logger.debug(f"Login response headers: {response.headers}")
                logger.debug(f"Login response text: {response.text[:500]}...")  # First 500 chars
                
                try:
                    data = response.json()
                except json.JSONDecodeError as e:
                    logger.error(f"Login failed: Response is not valid JSON. Status: {response.status_code}, Content-Type: {response.headers.get('content-type')}, Response: {response.text[:200]}")
                    continue  # Try next URL

                if data.get("status") == "success":
                    self.session_key = data.get("session")
                    # Update the API URL to the working one
                    self.settings.api_url = api_url
                    logger.info(f"Successfully logged in to astrometry.net using {api_url}")
                    return True
                else:
                    logger.error(
                        f"Login failed with {api_url}: {data.get('errormessage', 'Unknown error')}"
                    )
                    continue  # Try next URL
                    
            except Exception as e:
                logger.error(f"Error logging in to {api_url}: {e}")
                continue  # Try next URL
        
        logger.error("Failed to login using all available URLs")
        return False

    def _prepare_image(self, scope_image: ScopeImage) -> bytes:
        """Convert ScopeImage to JPEG bytes for upload."""
        if scope_image.image is None:
            raise ValueError("ScopeImage has no image data")

        # Convert to uint8 if needed
        image = scope_image.image
        if image.dtype != np.uint8:
            # Normalize to 0-255 range
            image = ((image - image.min()) / (image.max() - image.min()) * 255).astype(
                np.uint8
            )

        # Ensure it's BGR for OpenCV
        if len(image.shape) == 2:
            # Grayscale
            image_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        elif image.shape[2] == 3:
            # Already RGB/BGR
            image_bgr = image
        else:
            raise ValueError(f"Unsupported image shape: {image.shape}")

        # Encode as JPEG
        success, encoded = cv2.imencode(
            ".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90]
        )
        if not success:
            raise ValueError("Failed to encode image as JPEG")

        return encoded.tobytes()

    async def upload_image(self, scope_image: ScopeImage, **kwargs) -> Optional[int]:
        """Upload image to astrometry.net and return submission ID."""
        if not self.session_key:
            if not await self.login():
                return None

        try:
            # Prepare image data
            image_data = self._prepare_image(scope_image)

            # Prepare submission parameters
            submission_params = {
                "session": self.session_key,
                "allow_commercial_use": "n",
                "allow_modifications": "n",
                "publicly_visible": "n",
            }

            # Add optional parameters
            if self.settings.scale_low is not None:
                submission_params["scale_lower"] = self.settings.scale_low
            if self.settings.scale_high is not None:
                submission_params["scale_upper"] = self.settings.scale_high
            if self.settings.scale_units:
                submission_params["scale_units"] = self.settings.scale_units
            if self.settings.center_ra is not None:
                submission_params["center_ra"] = self.settings.center_ra
            if self.settings.center_dec is not None:
                submission_params["center_dec"] = self.settings.center_dec
            if self.settings.radius is not None:
                submission_params["radius"] = self.settings.radius
            if self.settings.downsample_factor is not None:
                submission_params["downsample_factor"] = self.settings.downsample_factor
            if self.settings.tweak_order is not None:
                submission_params["tweak_order"] = self.settings.tweak_order
            if self.settings.crpix_center:
                submission_params["crpix_center"] = True
            if self.settings.parity is not None:
                submission_params["parity"] = self.settings.parity

            # Override with any kwargs
            submission_params.update(kwargs)

            # Upload file
            files = {"file": ("image.jpg", image_data, "image/jpeg")}
            response = await self.client.post(
                f"{self.settings.api_url}upload",
                data={"request-json": json.dumps(submission_params)},
                files=files,
            )
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "success":
                submission_id = data.get("subid")
                logger.info(
                    f"Successfully uploaded image, submission ID: {submission_id}"
                )
                return submission_id
            else:
                logger.error(
                    f"Upload failed: {data.get('errormessage', 'Unknown error')}"
                )
                return None

        except Exception as e:
            logger.error(f"Error uploading image: {e}")
            return None

    async def get_submission_status(
        self, submission_id: int
    ) -> Optional[Dict[str, Any]]:
        """Check status of a submission."""
        try:
            response = await self.client.get(
                f"{self.settings.api_url}submissions/{submission_id}"
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error getting submission status: {e}")
            return None

    async def get_job_results(self, job_id: int) -> Optional[Dict[str, Any]]:
        """Get results from a completed job."""
        try:
            response = await self.client.get(
                f"{self.settings.api_url}jobs/{job_id}/info"
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error getting job results: {e}")
            return None

    async def wait_for_solve(
        self, submission_id: int, timeout: float = 180.0
    ) -> PlateSolveResult:
        """Wait for plate solving to complete and return results."""
        start_time = asyncio.get_event_loop().time()
        job_id = None

        while asyncio.get_event_loop().time() - start_time < timeout:
            # Check submission status
            status = await self.get_submission_status(submission_id)
            if not status:
                return PlateSolveResult(
                    success=False, error="Failed to get submission status"
                )

            # Get job IDs
            jobs = status.get("jobs", [])
            if jobs and job_id is None:
                job_id = jobs[0]
                logger.info(f"Job ID: {job_id}")

            # Check if job is done
            if job_id:
                job_info = await self.get_job_results(job_id)
                if job_info:
                    status = job_info.get("status")
                    if status == "success":
                        # Extract results
                        calibration = job_info.get("calibration", {})
                        ra = calibration.get("ra")
                        dec = calibration.get("dec")
                        orientation = calibration.get("orientation")
                        pixscale = calibration.get("pixscale")

                        # Calculate field dimensions
                        field_width = None
                        field_height = None
                        if pixscale and "width" in job_info and "height" in job_info:
                            field_width = (
                                job_info["width"] * pixscale
                            ) / 3600.0  # Convert to degrees
                            field_height = (job_info["height"] * pixscale) / 3600.0

                        return PlateSolveResult(
                            success=True,
                            ra=ra,
                            dec=dec,
                            orientation=orientation,
                            pixscale=pixscale,
                            field_width=field_width,
                            field_height=field_height,
                            job_id=job_id,
                            submission_id=submission_id,
                        )
                    elif status == "failure":
                        return PlateSolveResult(
                            success=False,
                            error="Plate solving failed",
                            job_id=job_id,
                            submission_id=submission_id,
                        )

            # Wait before checking again
            await asyncio.sleep(5.0)

        return PlateSolveResult(
            success=False,
            error="Timeout waiting for plate solve",
            job_id=job_id,
            submission_id=submission_id,
        )

    async def solve_image(self, scope_image: ScopeImage, **kwargs) -> PlateSolveResult:
        """Complete plate solving workflow for an image."""
        # Upload image
        submission_id = await self.upload_image(scope_image, **kwargs)
        if not submission_id:
            return PlateSolveResult(success=False, error="Failed to upload image")

        # Wait for results
        return await self.wait_for_solve(submission_id)

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
