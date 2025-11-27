"""
Astrometry.net client for plate solving astronomical images.
"""
import json
import base64
import time
import urllib.request
import urllib.parse
from typing import Optional, Dict, Any


class AstrometryClient:
    """Client for astrometry.net plate solving API."""

    BASE_URL = "http://nova.astrometry.net/api"
    DEFAULT_TIMEOUT = 300  # 5 minutes

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.session_key: Optional[str] = None

    def login(self) -> bool:
        """Login to astrometry.net and get session key."""
        if not self.api_key:
            return False

        try:
            data = json.dumps({"apikey": self.api_key}).encode()
            req = urllib.request.Request(
                f"{self.BASE_URL}/login",
                data=data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode())
                if result.get("status") == "success":
                    self.session_key = result.get("session")
                    return True
        except Exception as e:
            print(f"Login failed: {e}")
        return False

    def upload_image(
        self,
        image_path: Optional[str] = None,
        image_base64: Optional[str] = None,
        scale_lower: Optional[float] = None,
        scale_upper: Optional[float] = None,
        scale_units: str = "arcsecperpix",
        center_ra: Optional[float] = None,
        center_dec: Optional[float] = None,
        radius: Optional[float] = None,
        downsample_factor: int = 2,
    ) -> Optional[int]:
        """Upload image for plate solving. Returns submission ID."""
        if not self.session_key:
            if not self.login():
                raise ValueError("Not logged in and no API key provided")

        # Prepare upload data
        upload_args = {
            "session": self.session_key,
            "allow_commercial_use": "n",
            "allow_modifications": "n",
            "publicly_visible": "n",
            "downsample_factor": downsample_factor,
        }

        if scale_lower is not None:
            upload_args["scale_lower"] = scale_lower
        if scale_upper is not None:
            upload_args["scale_upper"] = scale_upper
        if scale_lower is not None or scale_upper is not None:
            upload_args["scale_units"] = scale_units
            upload_args["scale_type"] = "ul"

        if center_ra is not None and center_dec is not None:
            upload_args["center_ra"] = center_ra
            upload_args["center_dec"] = center_dec
            if radius is not None:
                upload_args["radius"] = radius

        # Read image data
        if image_path:
            with open(image_path, "rb") as f:
                image_data = f.read()
        elif image_base64:
            image_data = base64.b64decode(image_base64)
        else:
            raise ValueError("Either image_path or image_base64 must be provided")

        # Create multipart form data
        boundary = "----WebKitFormBoundary" + str(int(time.time() * 1000))
        body = []

        # Add request-json part
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="request-json"')
        body.append(b"")
        body.append(json.dumps(upload_args).encode())

        # Add file part
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="file"; filename="image.jpg"')
        body.append(b"Content-Type: application/octet-stream")
        body.append(b"")
        body.append(image_data)

        body.append(f"--{boundary}--".encode())
        body.append(b"")

        body_data = b"\r\n".join(body)

        try:
            req = urllib.request.Request(
                f"{self.BASE_URL}/upload",
                data=body_data,
                headers={
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                }
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode())
                if result.get("status") == "success":
                    return result.get("subid")
        except Exception as e:
            print(f"Upload failed: {e}")

        return None

    def get_submission_status(self, submission_id: int) -> Dict[str, Any]:
        """Get status of a submission."""
        try:
            url = f"{self.BASE_URL}/submissions/{submission_id}"
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}

    def get_job_status(self, job_id: int) -> Dict[str, Any]:
        """Get status of a job."""
        try:
            url = f"{self.BASE_URL}/jobs/{job_id}"
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}

    def get_job_calibration(self, job_id: int) -> Dict[str, Any]:
        """Get calibration data for a solved job."""
        try:
            url = f"{self.BASE_URL}/jobs/{job_id}/calibration"
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}

    def get_job_objects(self, job_id: int) -> Dict[str, Any]:
        """Get objects in field for a solved job."""
        try:
            url = f"{self.BASE_URL}/jobs/{job_id}/objects_in_field"
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}

    def solve_and_wait(
        self,
        image_path: Optional[str] = None,
        image_base64: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
        **kwargs
    ) -> Dict[str, Any]:
        """Upload image, wait for solve, and return results."""
        # Upload image
        submission_id = self.upload_image(
            image_path=image_path,
            image_base64=image_base64,
            **kwargs
        )

        if not submission_id:
            return {"status": "failed", "error": "Upload failed"}

        result = {
            "status": "pending",
            "submission_id": submission_id,
        }

        # Poll for completion
        start_time = time.time()
        job_id = None

        while time.time() - start_time < timeout:
            # Check submission status
            sub_status = self.get_submission_status(submission_id)

            if "jobs" in sub_status and sub_status["jobs"]:
                job_id = sub_status["jobs"][0]
                if job_id:
                    break

            time.sleep(5)

        if not job_id:
            result["status"] = "timeout"
            result["error"] = "No job created within timeout"
            return result

        result["job_id"] = job_id

        # Wait for job to complete
        while time.time() - start_time < timeout:
            job_status = self.get_job_status(job_id)
            status = job_status.get("status")

            if status == "success":
                result["status"] = "success"

                # Get calibration
                calibration = self.get_job_calibration(job_id)
                result.update({
                    "ra": calibration.get("ra"),
                    "dec": calibration.get("dec"),
                    "orientation": calibration.get("orientation"),
                    "pixscale": calibration.get("pixscale"),
                    "radius": calibration.get("radius"),
                    "width_deg": calibration.get("width_arcsec", 0) / 3600 if calibration.get("width_arcsec") else None,
                    "height_deg": calibration.get("height_arcsec", 0) / 3600 if calibration.get("height_arcsec") else None,
                })

                # Get objects in field
                objects = self.get_job_objects(job_id)
                if "objects_in_field" in objects:
                    result["objects_in_field"] = objects["objects_in_field"]

                return result

            elif status == "failure":
                result["status"] = "failed"
                result["error"] = "Plate solve failed"
                return result

            result["status"] = "processing"
            time.sleep(5)

        result["status"] = "timeout"
        result["error"] = "Job did not complete within timeout"
        return result


# Module-level functions for PyO3 compatibility

_client: Optional[AstrometryClient] = None


def _get_client(api_key: Optional[str] = None) -> AstrometryClient:
    global _client
    if _client is None or (api_key and _client.api_key != api_key):
        _client = AstrometryClient(api_key)
    return _client


def solve_image_sync(
    image_path: str,
    api_key: Optional[str] = None,
    scale_lower: Optional[float] = None,
    scale_upper: Optional[float] = None,
    center_ra: Optional[float] = None,
    center_dec: Optional[float] = None,
    radius: Optional[float] = None,
    downsample_factor: int = 2,
    timeout: int = 300
) -> str:
    """Plate solve an image file and return JSON result."""
    client = _get_client(api_key)
    result = client.solve_and_wait(
        image_path=image_path,
        scale_lower=scale_lower,
        scale_upper=scale_upper,
        center_ra=center_ra,
        center_dec=center_dec,
        radius=radius,
        downsample_factor=downsample_factor,
        timeout=timeout
    )
    return json.dumps(result)


def solve_image_base64(
    image_base64: str,
    api_key: Optional[str] = None,
    scale_lower: Optional[float] = None,
    scale_upper: Optional[float] = None,
    center_ra: Optional[float] = None,
    center_dec: Optional[float] = None,
    radius: Optional[float] = None,
    downsample_factor: int = 2,
    timeout: int = 300
) -> str:
    """Plate solve a base64-encoded image and return JSON result."""
    client = _get_client(api_key)
    result = client.solve_and_wait(
        image_base64=image_base64,
        scale_lower=scale_lower,
        scale_upper=scale_upper,
        center_ra=center_ra,
        center_dec=center_dec,
        radius=radius,
        downsample_factor=downsample_factor,
        timeout=timeout
    )
    return json.dumps(result)
