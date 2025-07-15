"""WebRTC video track for streaming telescope images."""

import asyncio
import time
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
from aiortc import VideoStreamTrack
from av import VideoFrame
from loguru import logger

from smarttel.seestar.imaging_client import SeestarImagingClient


class TelescopeVideoTrack(VideoStreamTrack):
    """Custom video track that streams telescope images via WebRTC."""

    kind = "video"  # Explicitly set track kind

    def __init__(self, imaging_client: SeestarImagingClient, target_fps: int = 30):
        super().__init__()
        self.imaging_client = imaging_client
        self.target_fps = target_fps
        self.frame_duration = 1.0 / target_fps
        self.last_frame_time = time.time()
        self.cached_frame: Optional[np.ndarray] = None
        self.frame_count = 0
        self.start_time = datetime.now()
        self._started = False

        # Video dimensions (landscape orientation)
        self.width = 1280
        self.height = 720

        logger.info(
            f"Created telescope video track with target FPS: {target_fps}, track ID: {id(self)}, kind: {self.kind}"
        )

    def _process_telescope_image(self, image: np.ndarray) -> np.ndarray:
        """Process telescope image for WebRTC streaming."""
        try:
            # Convert from 16-bit to 8-bit
            # Telescope images are 16-bit, but WebRTC needs 8-bit
            if image.dtype == np.uint16:
                # Scale to 8-bit range
                img_8bit = cv2.convertScaleAbs(image, alpha=(255.0 / 65535.0))
            else:
                img_8bit = image

            # Resize to target dimensions
            # Original telescope images are 1080x1920 (portrait)
            # We want 1280x720 (landscape) for better web viewing
            if img_8bit.shape[:2] != (self.height, self.width):
                # Rotate if needed (telescope images are often portrait)
                if img_8bit.shape[0] > img_8bit.shape[1]:
                    img_8bit = cv2.rotate(img_8bit, cv2.ROTATE_90_CLOCKWISE)

                # Resize to target resolution
                img_8bit = cv2.resize(
                    img_8bit, (self.width, self.height), interpolation=cv2.INTER_LINEAR
                )

            # Convert BGR to RGB (OpenCV uses BGR, WebRTC needs RGB)
            if len(img_8bit.shape) == 3 and img_8bit.shape[2] == 3:
                img_rgb = cv2.cvtColor(img_8bit, cv2.COLOR_BGR2RGB)
            else:
                # If grayscale, convert to RGB
                img_rgb = cv2.cvtColor(img_8bit, cv2.COLOR_GRAY2RGB)

            return img_rgb

        except Exception as e:
            logger.error(f"Error processing telescope image: {e}")
            # Return a black frame on error
            return np.zeros((self.height, self.width, 3), dtype=np.uint8)

    async def recv(self) -> VideoFrame:
        """Receive the next video frame."""
        logger.debug("Received request to receive next video frame")
        try:
            pts, time_base = await self.next_timestamp()

            # Create placeholder with debugging info
            frame_data = np.zeros((self.height, self.width, 3), dtype=np.uint8)

            # Check imaging client status
            if not self.imaging_client.is_connected:
                text = f"Imaging client not connected"
                logger.debug(f"Frame #{self.frame_count}: Imaging client not connected")
            elif not self.imaging_client.status.is_streaming:
                text = f"Imaging client not streaming"
                logger.debug(
                    f"Frame #{self.frame_count}: Imaging client not streaming (status: {self.imaging_client.status.is_streaming})"
                )
            elif self.imaging_client.image is None:
                text = f"No image data received"
                logger.debug(f"Frame #{self.frame_count}: No image data")
            elif self.imaging_client.image.image is None:
                text = f"Image data is None"
                logger.debug(f"Frame #{self.frame_count}: Image data is None")
            else:
                # We have image data! Process it
                telescope_image = self.imaging_client.image.image
                self.cached_frame = self._process_telescope_image(telescope_image)
                frame_data = self.cached_frame
                text = None
                if self.frame_count % 30 == 0:  # Log every 30 frames to avoid spam
                    logger.info(
                        f"Processing telescope frame #{self.frame_count}, image shape: {telescope_image.shape}"
                    )

            # If we have cached frame but no new data, use cached frame
            if text and self.cached_frame is not None:
                frame_data = self.cached_frame
                text = f"Using cached frame - {text}"

            # Add status text if needed
            if text:
                font = cv2.FONT_HERSHEY_SIMPLEX
                text_size = cv2.getTextSize(text, font, 0.7, 2)[0]
                text_x = (self.width - text_size[0]) // 2
                text_y = (self.height + text_size[1]) // 2
                cv2.putText(
                    frame_data,
                    text,
                    (text_x, text_y),
                    font,
                    0.7,
                    (128, 128, 128),
                    2,
                    cv2.LINE_AA,
                )

                # Add frame counter in corner
                counter_text = f"Frame: {self.frame_count}"
                cv2.putText(
                    frame_data,
                    counter_text,
                    (10, 30),
                    font,
                    0.5,
                    (64, 64, 64),
                    1,
                    cv2.LINE_AA,
                )

            # Create VideoFrame
            frame = VideoFrame.from_ndarray(frame_data, format="rgb24")
            frame.pts = pts
            frame.time_base = time_base

            self.frame_count += 1

            # Maintain target frame rate
            current_time = time.time()
            elapsed = current_time - self.last_frame_time
            if elapsed < self.frame_duration:
                await asyncio.sleep(self.frame_duration - elapsed)
            self.last_frame_time = time.time()

            return frame
        except Exception as e:
            logger.error(f"Error processing telescope image: {e}")
            raise

    async def start(self):
        """Start the video track."""
        # await super().start()
        self._started = True
        logger.info(f"Started telescope video track {id(self)}")

    async def stop(self):
        """Stop the video track."""
        self._started = False
        # await super().stop()
        logger.info(
            f"Stopped telescope video track {id(self)} after {self.frame_count} frames"
        )


class StackedImageVideoTrack(TelescopeVideoTrack):
    """Video track specifically for stacked images with periodic updates."""

    def __init__(
        self, imaging_client: SeestarImagingClient, update_interval: float = 5.0
    ):
        # Stacked images update less frequently, so lower FPS
        super().__init__(imaging_client, target_fps=5)
        self.update_interval = update_interval
        self.last_update = 0
        self.update_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the track and begin fetching stacked images."""
        await super().start()
        # self.update_task = asyncio.create_task(self._fetch_stacked_images())

    async def stop(self):
        """Stop the track and cancel update task."""
        if self.update_task:
            self.update_task.cancel()
            try:
                await self.update_task
            except asyncio.CancelledError:
                pass
        await super().stop()

    async def _fetch_stacked_images(self):
        """Periodically fetch stacked images."""
        try:
            while True:
                current_time = time.time()
                if current_time - self.last_update >= self.update_interval:
                    try:
                        # Request stacked image
                        await self.imaging_client.get_stacked_image()
                        self.last_update = current_time
                        logger.debug("Requested stacked image update")
                    except Exception as e:
                        logger.error(f"Error fetching stacked image: {e}")

                await asyncio.sleep(1.0)  # Check every second

        except asyncio.CancelledError:
            logger.info("Stacked image fetch task cancelled")
            raise
