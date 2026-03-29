"""
Tests for AstrometryClient — mocks httpx.AsyncClient to avoid network calls.
"""
import asyncio
import base64
import io
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from imaging.astrometry_client import (
    AstrometryClient,
    SolveParams,
    SolveResult,
    SolveStatus,
    get_astrometry_client,
    solve_image_base64,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    """Run an async coroutine synchronously."""
    return asyncio.run(coro)


def _make_http_response(status_code: int, json_data: Any) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    return resp


def _minimal_jpeg() -> bytes:
    """Return a minimal 2x2 JPEG image as bytes."""
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", (2, 2), color=(255, 0, 0))
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# AstrometryClient._get_client / close
# ---------------------------------------------------------------------------

class TestClientLifecycle:
    def test_get_client_creates_instance(self) -> None:
        client = AstrometryClient()
        async def go():
            http = await client._get_client()
            assert http is not None
            await client.close()
        _run(go())

    def test_close_clears_client(self) -> None:
        client = AstrometryClient()
        async def go():
            await client._get_client()
            await client.close()
            assert client._client is None
        _run(go())

    def test_close_noop_when_no_client(self) -> None:
        client = AstrometryClient()
        _run(client.close())  # Should not raise


# ---------------------------------------------------------------------------
# login
# ---------------------------------------------------------------------------

class TestLogin:
    def _mock_post(self, status_code: int, data: Any) -> MagicMock:
        mock_client = AsyncMock()
        mock_client.is_closed = False
        mock_client.post = AsyncMock(return_value=_make_http_response(status_code, data))
        mock_client.aclose = AsyncMock()
        return mock_client

    def test_login_success_with_api_key(self) -> None:
        client = AstrometryClient(api_key="test-key")
        mock_http = self._mock_post(200, {"status": "success", "session": "sess123"})
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.login())
        assert result is True
        assert client.session_key == "sess123"

    def test_login_success_anonymous(self) -> None:
        client = AstrometryClient()
        mock_http = self._mock_post(200, {"status": "success", "session": "anon456"})
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.login())
        assert result is True
        assert client.session_key == "anon456"

    def test_login_failure_status_error(self) -> None:
        client = AstrometryClient()
        mock_http = self._mock_post(200, {"status": "error", "errormessage": "Bad key"})
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.login())
        assert result is False
        assert client.session_key is None

    def test_login_failure_http_error(self) -> None:
        client = AstrometryClient()
        mock_http = self._mock_post(500, {})
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.login())
        assert result is False


# ---------------------------------------------------------------------------
# upload_image
# ---------------------------------------------------------------------------

class TestUploadImage:
    def _client_with_session(self) -> AstrometryClient:
        c = AstrometryClient()
        c.session_key = "test_session"
        return c

    def _mock_http(self, upload_response: Any) -> MagicMock:
        mock = AsyncMock()
        mock.is_closed = False
        mock.post = AsyncMock(return_value=_make_http_response(200, upload_response))
        mock.aclose = AsyncMock()
        return mock

    def test_upload_returns_submission_id(self) -> None:
        client = self._client_with_session()
        mock_http = self._mock_http({"status": "success", "subid": 12345})
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.upload_image(_minimal_jpeg()))
        assert result == "12345"

    def test_upload_failure_returns_none(self) -> None:
        client = self._client_with_session()
        mock_http = self._mock_http({"status": "error"})
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.upload_image(_minimal_jpeg()))
        assert result is None

    def test_upload_with_scale_hints(self) -> None:
        client = self._client_with_session()
        mock_http = self._mock_http({"status": "success", "subid": 99})
        params = SolveParams(scale_lower=0.5, scale_upper=2.0, center_ra=83.8, center_dec=-5.4)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.upload_image(_minimal_jpeg(), params=params))
        assert result == "99"

    def test_upload_auto_logins_if_no_session(self) -> None:
        client = AstrometryClient()
        # No session key — should call login first
        login_resp = _make_http_response(200, {"status": "success", "session": "autosess"})
        upload_resp = _make_http_response(200, {"status": "success", "subid": 77})
        mock_http = AsyncMock()
        mock_http.is_closed = False
        mock_http.post = AsyncMock(side_effect=[login_resp, upload_resp])
        mock_http.aclose = AsyncMock()
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.upload_image(_minimal_jpeg()))
        assert result == "77"


# ---------------------------------------------------------------------------
# get_submission_status / get_job_status / get_job_calibration / get_job_info
# ---------------------------------------------------------------------------

class TestStatusEndpoints:
    def _make_get_client(self, *responses) -> MagicMock:
        mock = AsyncMock()
        mock.is_closed = False
        mock.get = AsyncMock(side_effect=list(responses))
        mock.aclose = AsyncMock()
        return mock

    def test_get_submission_status_success(self) -> None:
        client = AstrometryClient()
        resp = _make_http_response(200, {"jobs": ["42"], "processing_started": True})
        mock_http = self._make_get_client(resp)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.get_submission_status("subid-1"))
        assert result["jobs"] == ["42"]

    def test_get_submission_status_error(self) -> None:
        client = AstrometryClient()
        resp = _make_http_response(404, {})
        mock_http = self._make_get_client(resp)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.get_submission_status("subid-bad"))
        assert "error" in result

    def test_get_job_status_success(self) -> None:
        client = AstrometryClient()
        resp = _make_http_response(200, {"status": "success"})
        mock_http = self._make_get_client(resp)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.get_job_status("job-1"))
        assert result["status"] == "success"

    def test_get_job_calibration_success(self) -> None:
        cal = {"ra": 83.8, "dec": -5.4, "pixscale": 1.5}
        client = AstrometryClient()
        resp = _make_http_response(200, cal)
        mock_http = self._make_get_client(resp)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.get_job_calibration("job-1"))
        assert result["ra"] == 83.8

    def test_get_job_calibration_failure(self) -> None:
        client = AstrometryClient()
        resp = _make_http_response(404, {})
        mock_http = self._make_get_client(resp)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.get_job_calibration("bad-job"))
        assert result is None

    def test_get_job_info_success(self) -> None:
        info = {"objects_in_field": ["M42", "M43"]}
        client = AstrometryClient()
        resp = _make_http_response(200, info)
        mock_http = self._make_get_client(resp)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.get_job_info("job-1"))
        assert "objects_in_field" in result

    def test_get_job_info_failure(self) -> None:
        client = AstrometryClient()
        resp = _make_http_response(500, {})
        mock_http = self._make_get_client(resp)
        with patch.object(client, "_get_client", return_value=mock_http):
            result = _run(client.get_job_info("bad-job"))
        assert result is None


# ---------------------------------------------------------------------------
# wait_for_solve
# ---------------------------------------------------------------------------

class TestWaitForSolve:
    def test_immediate_success(self) -> None:
        client = AstrometryClient()
        cal = {"ra": 83.8, "dec": -5.4, "orientation": 12.0, "pixscale": 1.5,
               "radius": 0.5, "width_arcsec": 1800, "height_arcsec": 1350}
        info = {"objects_in_field": ["M42"]}

        async def go():
            with patch.object(client, "get_submission_status",
                              AsyncMock(return_value={"jobs": ["10"]})), \
                 patch.object(client, "get_job_status",
                              AsyncMock(return_value={"status": "success"})), \
                 patch.object(client, "get_job_calibration",
                              AsyncMock(return_value=cal)), \
                 patch.object(client, "get_job_info",
                              AsyncMock(return_value=info)):
                return await client.wait_for_solve("sub-1", timeout=30.0, poll_interval=0.01)

        result = _run(go())
        assert result.status == SolveStatus.SUCCESS
        assert result.ra == 83.8
        assert result.objects_in_field == ["M42"]

    def test_job_failure(self) -> None:
        client = AstrometryClient()

        async def go():
            with patch.object(client, "get_submission_status",
                              AsyncMock(return_value={"jobs": ["10"]})), \
                 patch.object(client, "get_job_status",
                              AsyncMock(return_value={"status": "failure"})):
                return await client.wait_for_solve("sub-1", timeout=30.0, poll_interval=0.01)

        result = _run(go())
        assert result.status == SolveStatus.FAILED

    def test_timeout(self) -> None:
        client = AstrometryClient()

        async def go():
            # Submission always shows no jobs yet → keep polling until timeout
            with patch.object(client, "get_submission_status",
                              AsyncMock(return_value={"jobs": []})):
                return await client.wait_for_solve("sub-1", timeout=0.05, poll_interval=0.01)

        result = _run(go())
        assert result.status == SolveStatus.TIMEOUT

    def test_submission_error(self) -> None:
        client = AstrometryClient()

        async def go():
            with patch.object(client, "get_submission_status",
                              AsyncMock(return_value={"error": "not found"})):
                return await client.wait_for_solve("sub-bad", timeout=10.0, poll_interval=0.01)

        result = _run(go())
        assert result.status == SolveStatus.FAILED


# ---------------------------------------------------------------------------
# solve_image_base64 (sync wrapper)
# ---------------------------------------------------------------------------

class TestSolveImageBase64:
    def test_solve_base64_calls_solve_image(self) -> None:
        img_bytes = _minimal_jpeg()
        img_b64 = base64.b64encode(img_bytes).decode()

        mock_result = SolveResult(
            status=SolveStatus.SUCCESS, job_id="j1", submission_id="s1", ra=83.8, dec=-5.4
        )
        mock_client = MagicMock()
        mock_client.solve_image = AsyncMock(return_value=mock_result)
        mock_client.close = AsyncMock()

        with patch("imaging.astrometry_client.get_astrometry_client", return_value=mock_client):
            result = solve_image_base64(image_base64=img_b64, timeout=10.0)

        assert result["status"] == "success"
        assert result["ra"] == 83.8


# ---------------------------------------------------------------------------
# get_astrometry_client singleton
# ---------------------------------------------------------------------------

class TestGetAstrometryClient:
    def test_returns_singleton(self) -> None:
        import imaging.astrometry_client as ac_module
        ac_module._astrometry_client = None  # reset
        c1 = get_astrometry_client()
        c2 = get_astrometry_client()
        assert c1 is c2
        ac_module._astrometry_client = None  # cleanup
