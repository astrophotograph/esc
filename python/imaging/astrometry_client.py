"""Astrometry.net client for plate solving.

This module provides plate solving capabilities using the Astrometry.net API.
"""

import asyncio
import base64
import io
import time
from enum import Enum
from typing import Any, Optional

import httpx
from PIL import Image
from pydantic import BaseModel, Field


class SolveStatus(str, Enum):
    """Plate solve status."""

    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"


class SolveParams(BaseModel):
    """Parameters for plate solving."""

    # Scale hints
    scale_lower: Optional[float] = Field(default=None, description="Lower scale bound (arcsec/pixel)")
    scale_upper: Optional[float] = Field(default=None, description="Upper scale bound (arcsec/pixel)")
    scale_units: str = Field(default="arcsecperpix", description="Scale units")

    # Position hints (helps speed up solving)
    center_ra: Optional[float] = Field(default=None, description="Approximate RA in degrees")
    center_dec: Optional[float] = Field(default=None, description="Approximate Dec in degrees")
    radius: Optional[float] = Field(default=5.0, description="Search radius in degrees")

    # Processing options
    downsample_factor: int = Field(default=2, ge=1, le=8, description="Downsample factor")
    crpix_center: bool = Field(default=True, description="Set CRPIX to image center")


class SolveResult(BaseModel):
    """Result of plate solving."""

    status: SolveStatus
    job_id: Optional[str] = None
    submission_id: Optional[str] = None

    # Astrometric solution
    ra: Optional[float] = None  # Center RA in degrees
    dec: Optional[float] = None  # Center Dec in degrees
    orientation: Optional[float] = None  # Position angle in degrees
    pixscale: Optional[float] = None  # Pixel scale in arcsec/pixel
    radius: Optional[float] = None  # Field radius in degrees
    width_deg: Optional[float] = None  # Field width in degrees
    height_deg: Optional[float] = None  # Field height in degrees

    # Calibration data
    calibration: Optional[dict[str, Any]] = None
    objects_in_field: Optional[list[str]] = None
    annotations: Optional[list[dict[str, Any]]] = None

    error: Optional[str] = None


class AstrometryClient:
    """Client for Astrometry.net plate solving API."""

    API_URL = "http://nova.astrometry.net/api"

    def __init__(self, api_key: Optional[str] = None):
        """Initialize the astrometry client.

        Args:
            api_key: Astrometry.net API key. If None, uses anonymous session.
        """
        self.api_key = api_key
        self.session_key: Optional[str] = None
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def login(self) -> bool:
        """Login to Astrometry.net and get session key.

        Returns:
            True if login successful
        """
        client = await self._get_client()

        if self.api_key:
            data = {"request-json": f'{{"apikey": "{self.api_key}"}}'}
        else:
            # Anonymous session
            data = {"request-json": "{}"}

        response = await client.post(f"{self.API_URL}/login", data=data)

        if response.status_code == 200:
            result = response.json()
            if result.get("status") == "success":
                self.session_key = result.get("session")
                return True

        return False

    async def upload_image(
        self,
        image_data: bytes,
        params: Optional[SolveParams] = None,
    ) -> Optional[str]:
        """Upload an image for plate solving.

        Args:
            image_data: Image data (JPEG, PNG, or FITS)
            params: Solving parameters

        Returns:
            Submission ID or None on failure
        """
        if not self.session_key:
            if not await self.login():
                return None

        if params is None:
            params = SolveParams()

        client = await self._get_client()

        # Compress image if it's PNG (convert to JPEG for smaller upload)
        try:
            img = Image.open(io.BytesIO(image_data))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            # Downsample if requested
            if params.downsample_factor > 1:
                new_size = (
                    img.width // params.downsample_factor,
                    img.height // params.downsample_factor,
                )
                img = img.resize(new_size, Image.Resampling.LANCZOS)

            # Convert to JPEG
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=90)
            upload_data = buffer.getvalue()
        except Exception:
            # Use original data if conversion fails
            upload_data = image_data

        # Build request JSON
        request_json: dict[str, Any] = {
            "session": self.session_key,
            "allow_commercial_use": "n",
            "allow_modifications": "n",
            "publicly_visible": "n",
        }

        # Add scale hints
        if params.scale_lower and params.scale_upper:
            request_json["scale_lower"] = params.scale_lower
            request_json["scale_upper"] = params.scale_upper
            request_json["scale_units"] = params.scale_units
            request_json["scale_type"] = "ul"

        # Add position hints
        if params.center_ra is not None and params.center_dec is not None:
            request_json["center_ra"] = params.center_ra
            request_json["center_dec"] = params.center_dec
            request_json["radius"] = params.radius or 5.0

        if params.crpix_center:
            request_json["crpix_center"] = True

        # Upload via multipart form
        import json

        files = {
            "request-json": (None, json.dumps(request_json)),
            "file": ("image.jpg", upload_data, "image/jpeg"),
        }

        response = await client.post(f"{self.API_URL}/upload", files=files, timeout=120.0)

        if response.status_code == 200:
            result = response.json()
            if result.get("status") == "success":
                return str(result.get("subid"))

        return None

    async def get_submission_status(self, submission_id: str) -> dict[str, Any]:
        """Get status of a submission.

        Args:
            submission_id: Submission ID

        Returns:
            Status dictionary
        """
        client = await self._get_client()
        response = await client.get(f"{self.API_URL}/submissions/{submission_id}")

        if response.status_code == 200:
            return response.json()
        return {"error": f"HTTP {response.status_code}"}

    async def get_job_status(self, job_id: str) -> dict[str, Any]:
        """Get status of a job.

        Args:
            job_id: Job ID

        Returns:
            Status dictionary
        """
        client = await self._get_client()
        response = await client.get(f"{self.API_URL}/jobs/{job_id}")

        if response.status_code == 200:
            return response.json()
        return {"error": f"HTTP {response.status_code}"}

    async def get_job_calibration(self, job_id: str) -> Optional[dict[str, Any]]:
        """Get calibration data for a solved job.

        Args:
            job_id: Job ID

        Returns:
            Calibration dictionary or None
        """
        client = await self._get_client()
        response = await client.get(f"{self.API_URL}/jobs/{job_id}/calibration")

        if response.status_code == 200:
            return response.json()
        return None

    async def get_job_info(self, job_id: str) -> Optional[dict[str, Any]]:
        """Get info for a solved job (includes objects in field).

        Args:
            job_id: Job ID

        Returns:
            Info dictionary or None
        """
        client = await self._get_client()
        response = await client.get(f"{self.API_URL}/jobs/{job_id}/info")

        if response.status_code == 200:
            return response.json()
        return None

    async def wait_for_solve(
        self,
        submission_id: str,
        timeout: float = 300.0,
        poll_interval: float = 5.0,
    ) -> SolveResult:
        """Wait for a submission to complete solving.

        Args:
            submission_id: Submission ID
            timeout: Maximum wait time in seconds
            poll_interval: Time between status checks

        Returns:
            SolveResult with solution or error
        """
        start_time = time.time()
        job_id: Optional[str] = None

        while time.time() - start_time < timeout:
            # Check submission status
            status = await self.get_submission_status(submission_id)

            if "error" in status:
                return SolveResult(
                    status=SolveStatus.FAILED,
                    submission_id=submission_id,
                    error=status["error"],
                )

            # Get job IDs from submission
            jobs = status.get("jobs", [])
            if jobs:
                job_id = str(jobs[0])

                # Check job status
                job_status = await self.get_job_status(job_id)
                job_state = job_status.get("status")

                if job_state == "success":
                    # Get calibration data
                    calibration = await self.get_job_calibration(job_id)
                    info = await self.get_job_info(job_id)

                    if calibration:
                        return SolveResult(
                            status=SolveStatus.SUCCESS,
                            job_id=job_id,
                            submission_id=submission_id,
                            ra=calibration.get("ra"),
                            dec=calibration.get("dec"),
                            orientation=calibration.get("orientation"),
                            pixscale=calibration.get("pixscale"),
                            radius=calibration.get("radius"),
                            width_deg=calibration.get("width_arcsec", 0) / 3600.0,
                            height_deg=calibration.get("height_arcsec", 0) / 3600.0,
                            calibration=calibration,
                            objects_in_field=info.get("objects_in_field") if info else None,
                            annotations=info.get("annotations") if info else None,
                        )

                elif job_state == "failure":
                    return SolveResult(
                        status=SolveStatus.FAILED,
                        job_id=job_id,
                        submission_id=submission_id,
                        error="Plate solve failed - no solution found",
                    )

            await asyncio.sleep(poll_interval)

        return SolveResult(
            status=SolveStatus.TIMEOUT,
            job_id=job_id,
            submission_id=submission_id,
            error=f"Solve timed out after {timeout} seconds",
        )

    async def solve_image(
        self,
        image_data: bytes,
        params: Optional[SolveParams] = None,
        timeout: float = 300.0,
    ) -> SolveResult:
        """Complete workflow: upload image and wait for solution.

        Args:
            image_data: Image data
            params: Solving parameters
            timeout: Maximum wait time

        Returns:
            SolveResult with solution or error
        """
        # Upload
        submission_id = await self.upload_image(image_data, params)
        if not submission_id:
            return SolveResult(
                status=SolveStatus.FAILED,
                error="Failed to upload image",
            )

        # Wait for result
        return await self.wait_for_solve(submission_id, timeout)


# Singleton instance
_astrometry_client: Optional[AstrometryClient] = None


def get_astrometry_client(api_key: Optional[str] = None) -> AstrometryClient:
    """Get or create the astrometry client singleton."""
    global _astrometry_client
    if _astrometry_client is None:
        _astrometry_client = AstrometryClient(api_key)
    return _astrometry_client


# Synchronous wrapper for PyO3
def solve_image_sync(
    image_path: str,
    api_key: Optional[str] = None,
    scale_lower: Optional[float] = None,
    scale_upper: Optional[float] = None,
    center_ra: Optional[float] = None,
    center_dec: Optional[float] = None,
    radius: Optional[float] = 5.0,
    downsample_factor: int = 2,
    timeout: float = 300.0,
) -> dict[str, Any]:
    """Solve an image synchronously (PyO3 wrapper).

    Args:
        image_path: Path to image file
        api_key: Astrometry.net API key (optional)
        scale_lower: Lower scale bound (arcsec/pixel)
        scale_upper: Upper scale bound (arcsec/pixel)
        center_ra: Approximate RA hint
        center_dec: Approximate Dec hint
        radius: Search radius in degrees
        downsample_factor: Downsample factor
        timeout: Maximum wait time

    Returns:
        Solve result dictionary
    """
    with open(image_path, "rb") as f:
        image_data = f.read()

    params = SolveParams(
        scale_lower=scale_lower,
        scale_upper=scale_upper,
        center_ra=center_ra,
        center_dec=center_dec,
        radius=radius,
        downsample_factor=downsample_factor,
    )

    client = get_astrometry_client(api_key)

    # Run async code in event loop
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(client.solve_image(image_data, params, timeout))
        return result.model_dump()
    finally:
        loop.run_until_complete(client.close())
        loop.close()


def solve_image_base64(
    image_base64: str,
    api_key: Optional[str] = None,
    scale_lower: Optional[float] = None,
    scale_upper: Optional[float] = None,
    center_ra: Optional[float] = None,
    center_dec: Optional[float] = None,
    radius: Optional[float] = 5.0,
    downsample_factor: int = 2,
    timeout: float = 300.0,
) -> dict[str, Any]:
    """Solve an image from base64 data (PyO3 wrapper).

    Args:
        image_base64: Base64 encoded image data
        api_key: Astrometry.net API key (optional)
        scale_lower: Lower scale bound (arcsec/pixel)
        scale_upper: Upper scale bound (arcsec/pixel)
        center_ra: Approximate RA hint
        center_dec: Approximate Dec hint
        radius: Search radius in degrees
        downsample_factor: Downsample factor
        timeout: Maximum wait time

    Returns:
        Solve result dictionary
    """
    image_data = base64.b64decode(image_base64)

    params = SolveParams(
        scale_lower=scale_lower,
        scale_upper=scale_upper,
        center_ra=center_ra,
        center_dec=center_dec,
        radius=radius,
        downsample_factor=downsample_factor,
    )

    client = get_astrometry_client(api_key)

    # Run async code in event loop
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(client.solve_image(image_data, params, timeout))
        return result.model_dump()
    finally:
        loop.run_until_complete(client.close())
        loop.close()
