"""
Tests for ImagingService — mocks scopinator classes (SCOPINATOR_AVAILABLE=False in env).
"""
import base64
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest
from PIL import Image

import imaging.imaging_service as imaging_module
from imaging.imaging_service import (
    EnhancementParams,
    ImagingService,
    ProcessedImage,
    ProcessingParams,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gray_array(h: int = 10, w: int = 10) -> np.ndarray:
    return np.zeros((h, w), dtype=np.float32)


def _rgb_array(h: int = 10, w: int = 10) -> np.ndarray:
    return np.zeros((h, w, 3), dtype=np.float32)


def _single_channel_array(h: int = 10, w: int = 10) -> np.ndarray:
    return np.zeros((h, w, 1), dtype=np.float32)


def _make_png_file(tmp_path: Path, mode: str = "RGB") -> Path:
    if mode == "L":
        arr = np.zeros((10, 10), dtype=np.uint8)
        img = Image.fromarray(arr, mode="L")
    else:
        arr = np.zeros((10, 10, 3), dtype=np.uint8)
        img = Image.fromarray(arr, mode="RGB")
    p = tmp_path / "test.png"
    img.save(p)
    return p


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _inject_scopinator_mocks():
    """
    Since SCOPINATOR_AVAILABLE=False in this environment (EnhancementSettings missing),
    inject mock class references so ImagingService can be instantiated.
    """
    mock_fh_instance = MagicMock()
    mock_up_instance = MagicMock()

    originals = {}
    patches = {
        "SCOPINATOR_AVAILABLE": True,
        "FITSHandler": MagicMock(return_value=mock_fh_instance),
        "ImageUpscaler": MagicMock(return_value=mock_up_instance),
        "UpscaleMethod": MagicMock(),
        "DenoiseMethod": MagicMock(),
        "SharpenMethod": MagicMock(),
    }
    for k, v in patches.items():
        originals[k] = getattr(imaging_module, k, None)
        setattr(imaging_module, k, v)

    yield patches

    for k, v in originals.items():
        if v is None:
            try:
                delattr(imaging_module, k)
            except AttributeError:
                pass
        else:
            setattr(imaging_module, k, v)


@pytest.fixture(autouse=True)
def reset_singleton():
    imaging_module._imaging_service = None
    yield
    imaging_module._imaging_service = None


@pytest.fixture
def service(tmp_path):
    """ImagingService with mocked scopinator objects."""
    svc = ImagingService(storage_path=tmp_path)
    svc.fits_handler = MagicMock()
    svc.upscaler = MagicMock()
    return svc


# ---------------------------------------------------------------------------
# __init__
# ---------------------------------------------------------------------------

class TestInit:
    def test_uses_custom_storage_path(self, tmp_path):
        custom = tmp_path / "imaging_out"
        svc = ImagingService(storage_path=custom)
        assert svc.storage_path == custom
        assert svc.storage_path.exists()

    def test_uses_default_storage_path(self):
        svc = ImagingService()
        assert svc.storage_path == Path("/tmp/eesc_imaging")
        assert svc.storage_path.exists()

    def test_scopinator_unavailable_raises(self, tmp_path):
        """If SCOPINATOR_AVAILABLE is False, __init__ raises ImportError."""
        imaging_module.SCOPINATOR_AVAILABLE = False
        try:
            with pytest.raises(ImportError, match="scopinator"):
                ImagingService(storage_path=tmp_path)
        finally:
            imaging_module.SCOPINATOR_AVAILABLE = True


# ---------------------------------------------------------------------------
# process_fits
# ---------------------------------------------------------------------------

class TestProcessFits:
    def test_grayscale_2d_returns_processed_image(self, service):
        service.fits_handler.read_fits_file.return_value = (_gray_array(), {"OBJECT": "M42"})
        service.fits_handler.normalize_image_data.return_value = _gray_array()

        result = service.process_fits("/fake/test.fits")

        assert isinstance(result, ProcessedImage)
        assert result.width == 10
        assert result.height == 10
        assert result.data_base64 is not None
        assert result.original_filename == "test.fits"

    def test_rgb_3d_returns_processed_image(self, service):
        service.fits_handler.read_fits_file.return_value = (_rgb_array(), {})
        service.fits_handler.normalize_image_data.return_value = _rgb_array()

        result = service.process_fits("/fake/color.fits")

        assert result.width == 10

    def test_single_channel_3d_array(self, service):
        service.fits_handler.read_fits_file.return_value = (_single_channel_array(), {})
        service.fits_handler.normalize_image_data.return_value = _single_channel_array()

        result = service.process_fits("/fake/single.fits")

        assert result.width == 10

    def test_uint8_array_not_rescaled(self, service):
        uint8_data = np.zeros((10, 10), dtype=np.uint8)
        service.fits_handler.read_fits_file.return_value = (uint8_data, {})
        service.fits_handler.normalize_image_data.return_value = uint8_data

        result = service.process_fits("/fake/test.fits")
        assert result.width == 10

    def test_return_data_false_gives_no_base64(self, service):
        service.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        service.fits_handler.normalize_image_data.return_value = _gray_array()

        result = service.process_fits("/fake/test.fits", return_data=False)

        assert result.data_base64 is None

    def test_jpeg_format(self, service):
        service.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        service.fits_handler.normalize_image_data.return_value = _gray_array()

        params = ProcessingParams(output_format="jpeg", quality=80)
        result = service.process_fits("/fake/test.fits", params=params)

        assert result.format == "jpeg"

    def test_default_params_when_none(self, service):
        service.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        service.fits_handler.normalize_image_data.return_value = _gray_array()

        result = service.process_fits("/fake/test.fits", params=None)

        assert result.stretch_mode == "15% Bg, 3 sigma"

    def test_metadata_cleaning(self, service):
        scalar = np.float32(3.14)
        metadata = {
            "str_key": "value",
            "int_key": 42,
            "numpy_key": scalar,
            "list_key": [1, 2, 3],
        }
        service.fits_handler.read_fits_file.return_value = (_gray_array(), metadata)
        service.fits_handler.normalize_image_data.return_value = _gray_array()

        result = service.process_fits("/fake/test.fits")

        assert result.metadata["str_key"] == "value"
        assert result.metadata["int_key"] == 42
        assert isinstance(result.metadata["numpy_key"], float)  # numpy scalar → float
        assert isinstance(result.metadata["list_key"], str)  # list → str


# ---------------------------------------------------------------------------
# enhance_image
# ---------------------------------------------------------------------------

class TestEnhanceImage:
    def test_enhance_from_png_rgb(self, service, tmp_path):
        png_path = _make_png_file(tmp_path, "RGB")
        params = EnhancementParams()

        result = service.enhance_image(str(png_path), params)

        assert isinstance(result, ProcessedImage)
        assert result.width == 10

    def test_enhance_from_png_grayscale_to_rgb(self, service, tmp_path):
        png_path = _make_png_file(tmp_path, "L")
        params = EnhancementParams()

        result = service.enhance_image(str(png_path), params)
        assert result.width == 10

    def test_enhance_from_fits(self, service):
        service.fits_handler.read_fits_file.return_value = (_rgb_array(), {"key": "val"})
        params = EnhancementParams()

        result = service.enhance_image("/fake/img.fits", params)

        assert isinstance(result, ProcessedImage)

    def test_enhance_from_fits_float_converted(self, service):
        data = np.full((10, 10, 3), 0.5, dtype=np.float32)
        service.fits_handler.read_fits_file.return_value = (data, {})
        params = EnhancementParams()

        result = service.enhance_image("/fake/img.fits", params)
        assert result.width == 10

    def test_enhance_single_channel_to_rgb(self, service):
        service.fits_handler.read_fits_file.return_value = (_single_channel_array(), {})
        params = EnhancementParams()

        result = service.enhance_image("/fake/img.fits", params)
        assert result.width == 10

    def test_return_data_false(self, service, tmp_path):
        png_path = _make_png_file(tmp_path)
        params = EnhancementParams()

        result = service.enhance_image(str(png_path), params, return_data=False)
        assert result.data_base64 is None

    def test_upscale_enabled_calls_upscaler(self, service, tmp_path):
        png_path = _make_png_file(tmp_path)
        upscaled = np.zeros((20, 20, 3), dtype=np.uint8)
        service.upscaler.upscale.return_value = upscaled

        params = EnhancementParams(upscale_enabled=True, upscale_factor=2.0)
        result = service.enhance_image(str(png_path), params)

        service.upscaler.upscale.assert_called_once()
        assert result.width == 20

    def test_denoise_enabled_calls_upscaler(self, service, tmp_path):
        png_path = _make_png_file(tmp_path)
        arr = np.zeros((10, 10, 3), dtype=np.uint8)
        service.upscaler.denoise_image.return_value = arr

        params = EnhancementParams(denoise_enabled=True)
        service.enhance_image(str(png_path), params)

        service.upscaler.denoise_image.assert_called_once()

    def test_sharpen_enabled_calls_upscaler(self, service, tmp_path):
        png_path = _make_png_file(tmp_path)
        arr = np.zeros((10, 10, 3), dtype=np.uint8)
        service.upscaler.sharpen_image.return_value = arr

        params = EnhancementParams(sharpen_enabled=True)
        service.enhance_image(str(png_path), params)

        service.upscaler.sharpen_image.assert_called_once()


# ---------------------------------------------------------------------------
# reprocess_fits
# ---------------------------------------------------------------------------

class TestReprocessFits:
    def test_no_enhancement_returns_process_result(self, service):
        service.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        service.fits_handler.normalize_image_data.return_value = _gray_array()

        result = service.reprocess_fits("/fake/test.fits")

        assert isinstance(result, ProcessedImage)

    def test_with_enhancement_applies_enhance(self, service, tmp_path):
        service.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        service.fits_handler.normalize_image_data.return_value = _gray_array()
        arr = np.zeros((10, 10, 3), dtype=np.uint8)
        service.upscaler.sharpen_image.return_value = arr

        enhancement = EnhancementParams(sharpen_enabled=True)
        result = service.reprocess_fits("/fake/test.fits", enhancement_params=enhancement)

        assert isinstance(result, ProcessedImage)

    def test_return_data_true(self, service):
        service.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        service.fits_handler.normalize_image_data.return_value = _gray_array()

        result = service.reprocess_fits("/fake/test.fits", return_data=True)
        assert result.data_base64 is not None


# ---------------------------------------------------------------------------
# get_processed_image
# ---------------------------------------------------------------------------

class TestGetProcessedImage:
    def test_returns_bytes_for_existing_file(self, service):
        path = service.storage_path / "abc.png"
        path.write_bytes(b"fakepng")

        result = service.get_processed_image("abc", "png")
        assert result == b"fakepng"

    def test_returns_none_for_missing_file(self, service):
        result = service.get_processed_image("nonexistent", "png")
        assert result is None

    def test_falls_back_to_enhanced_suffix(self, service):
        path = service.storage_path / "xyz_enhanced.png"
        path.write_bytes(b"enhanced")

        result = service.get_processed_image("xyz", "png")
        assert result == b"enhanced"


# ---------------------------------------------------------------------------
# cleanup_image
# ---------------------------------------------------------------------------

class TestCleanupImage:
    def test_deletes_existing_png(self, service):
        path = service.storage_path / "todel.png"
        path.write_bytes(b"data")

        result = service.cleanup_image("todel")

        assert result is True
        assert not path.exists()

    def test_deletes_enhanced_variant(self, service):
        path = service.storage_path / "todel_enhanced.png"
        path.write_bytes(b"data")

        result = service.cleanup_image("todel")
        assert result is True

    def test_returns_false_if_nothing_found(self, service):
        result = service.cleanup_image("nonexistent")
        assert result is False


# ---------------------------------------------------------------------------
# Static methods
# ---------------------------------------------------------------------------

class TestStaticMethods:
    def test_get_stretch_modes_returns_five(self):
        modes = ImagingService.get_stretch_modes()
        assert len(modes) == 5
        assert all("id" in m and "name" in m and "description" in m for m in modes)

    def test_get_enhancement_methods_has_three_keys(self):
        methods = ImagingService.get_enhancement_methods()
        assert "upscale" in methods
        assert "denoise" in methods
        assert "sharpen" in methods


# ---------------------------------------------------------------------------
# PyO3-compatible wrapper functions
# ---------------------------------------------------------------------------

class TestPyO3Wrappers:
    def test_get_stretch_modes(self):
        modes = imaging_module.get_stretch_modes()
        assert len(modes) == 5

    def test_get_enhancement_methods(self):
        methods = imaging_module.get_enhancement_methods()
        assert "upscale" in methods

    def test_get_imaging_service_singleton(self, tmp_path):
        svc1 = imaging_module.get_imaging_service(str(tmp_path))
        svc2 = imaging_module.get_imaging_service(str(tmp_path))
        assert svc1 is svc2

    def test_cleanup_image_wrapper(self, tmp_path):
        svc = ImagingService(storage_path=tmp_path)
        svc.fits_handler = MagicMock()
        svc.upscaler = MagicMock()
        imaging_module._imaging_service = svc

        (tmp_path / "test123.png").write_bytes(b"data")
        result = imaging_module.cleanup_image("test123")
        assert result is True

    def test_get_processed_image_wrapper_returns_base64(self, tmp_path):
        svc = ImagingService(storage_path=tmp_path)
        svc.fits_handler = MagicMock()
        svc.upscaler = MagicMock()
        imaging_module._imaging_service = svc

        (tmp_path / "imgabc.png").write_bytes(b"rawbytes")
        result = imaging_module.get_processed_image("imgabc", "png")
        assert result == base64.b64encode(b"rawbytes").decode("utf-8")

    def test_get_processed_image_wrapper_none_if_missing(self, tmp_path):
        svc = ImagingService(storage_path=tmp_path)
        svc.fits_handler = MagicMock()
        svc.upscaler = MagicMock()
        imaging_module._imaging_service = svc

        result = imaging_module.get_processed_image("nothere", "png")
        assert result is None

    def test_process_fits_wrapper(self, tmp_path):
        svc = ImagingService(storage_path=tmp_path)
        svc.fits_handler = MagicMock()
        svc.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        svc.fits_handler.normalize_image_data.return_value = _gray_array()
        svc.upscaler = MagicMock()
        imaging_module._imaging_service = svc

        result = imaging_module.process_fits("/fake/test.fits")
        assert isinstance(result, dict)
        assert "id" in result

    def test_enhance_image_wrapper(self, tmp_path):
        svc = ImagingService(storage_path=tmp_path)
        svc.fits_handler = MagicMock()
        svc.upscaler = MagicMock()
        imaging_module._imaging_service = svc

        png_path = _make_png_file(tmp_path)
        result = imaging_module.enhance_image(str(png_path))
        assert isinstance(result, dict)
        assert "id" in result

    def test_reprocess_fits_wrapper(self, tmp_path):
        svc = ImagingService(storage_path=tmp_path)
        svc.fits_handler = MagicMock()
        svc.fits_handler.read_fits_file.return_value = (_gray_array(), {})
        svc.fits_handler.normalize_image_data.return_value = _gray_array()
        svc.upscaler = MagicMock()
        imaging_module._imaging_service = svc

        result = imaging_module.reprocess_fits("/fake/test.fits")
        assert isinstance(result, dict)
        assert "id" in result
