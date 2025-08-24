"""Dummy video track for WebRTC testing."""

import asyncio
import time
import math
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
from aiortc import VideoStreamTrack
from av import VideoFrame
from loguru import logger


class DummyVideoTrack(VideoStreamTrack):
    """Dummy video track that generates test patterns for WebRTC testing."""

    kind = "video"  # Explicitly set track kind

    def __init__(self, target_fps: int = 30):
        super().__init__()
        self.target_fps = target_fps
        self.frame_duration = 1.0 / target_fps
        self.last_frame_time = time.time()
        self.frame_count = 0
        self.start_time = datetime.now()
        self._started = False

        # Video dimensions (landscape orientation)
        self.width = 1280
        self.height = 720

        logger.info(
            f"Created dummy video track with target FPS: {target_fps}, track ID: {id(self)}, kind: {self.kind}"
        )

    def _generate_test_pattern(self) -> np.ndarray:
        """Generate a test pattern with moving elements."""
        try:
            # Create base image
            frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)

            # Current time for animation
            current_time = time.time() - self.last_frame_time

            # Background gradient
            for y in range(self.height):
                intensity = int(255 * (y / self.height))
                frame[y, :] = [intensity // 3, intensity // 2, intensity]

            # Moving circle
            circle_x = int(self.width // 2 + 200 * math.sin(current_time))
            circle_y = int(self.height // 2 + 100 * math.cos(current_time * 1.5))
            cv2.circle(frame, (circle_x, circle_y), 50, (0, 255, 255), -1)

            # Frame counter text
            font = cv2.FONT_HERSHEY_SIMPLEX
            text = f"Frame: {self.frame_count}"
            cv2.putText(
                frame, text, (50, 50), font, 1.5, (255, 255, 255), 3, cv2.LINE_AA
            )

            # Timestamp
            timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            cv2.putText(
                frame, timestamp, (50, 100), font, 1, (255, 255, 255), 2, cv2.LINE_AA
            )

            # FPS indicator
            fps_text = f"Target FPS: {self.target_fps}"
            cv2.putText(
                frame, fps_text, (50, 150), font, 1, (255, 255, 255), 2, cv2.LINE_AA
            )

            # Track status
            status_text = f"Started: {self._started}"
            cv2.putText(
                frame, status_text, (50, 200), font, 1, (255, 255, 255), 2, cv2.LINE_AA
            )

            # Moving bars for motion detection
            bar_pos = int((self.frame_count * 5) % self.width)
            cv2.rectangle(
                frame,
                (bar_pos, self.height - 100),
                (bar_pos + 20, self.height),
                (255, 0, 0),
                -1,
            )

            return frame

        except Exception as e:
            logger.error(f"Error generating test pattern: {e}")
            # Return a simple colored frame on error
            error_frame = np.full(
                (self.height, self.width, 3), [128, 0, 128], dtype=np.uint8
            )
            cv2.putText(
                error_frame,
                "ERROR",
                (self.width // 2 - 100, self.height // 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                2,
                (255, 255, 255),
                3,
            )
            return error_frame

    async def recv(self) -> VideoFrame:
        """Receive the next video frame."""
        logger.debug(
            f"Dummy track: Received request to receive next video frame #{self.frame_count}"
        )

        try:
            pts, time_base = await self.next_timestamp()

            # Generate test pattern
            frame_data = self._generate_test_pattern()

            # Create VideoFrame
            frame = VideoFrame.from_ndarray(frame_data, format="rgb24")
            frame.pts = pts
            frame.time_base = time_base

            self.frame_count += 1

            # Log every 30 frames to avoid spam
            if self.frame_count % 30 == 0:
                logger.info(f"Dummy track: Generated frame #{self.frame_count}")

            # Maintain target frame rate
            current_time = time.time()
            elapsed = current_time - self.last_frame_time
            if elapsed < self.frame_duration:
                await asyncio.sleep(self.frame_duration - elapsed)
            self.last_frame_time = time.time()

            return frame

        except Exception as e:
            logger.error(f"Error in dummy track recv(): {e}")
            raise

    async def start(self):
        """Start the video track."""
        # await super().start()  # Commented out like the telescope track
        self._started = True
        logger.info(f"Started dummy video track {id(self)}")

    async def stop(self):
        """Stop the video track."""
        self._started = False
        # await super().stop()  # Commented out like the telescope track
        logger.info(
            f"Stopped dummy video track {id(self)} after {self.frame_count} frames"
        )


class StaticTestVideoTrack(VideoStreamTrack):
    """Static test video track with a simple pattern."""

    kind = "video"

    def __init__(self):
        super().__init__()
        self.frame_count = 0
        self._started = False
        self.width = 640
        self.height = 480

        logger.info(f"Created static test video track, track ID: {id(self)}")

    async def recv(self) -> VideoFrame:
        """Generate a simple static test pattern."""
        pts, time_base = await self.next_timestamp()

        # Create a simple test pattern
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)

        # Checkerboard pattern
        for y in range(0, self.height, 40):
            for x in range(0, self.width, 40):
                if (x // 40 + y // 40) % 2 == 0:
                    frame[y : y + 40, x : x + 40] = [255, 255, 255]

        # Frame counter
        cv2.putText(
            frame,
            f"Frame {self.frame_count}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 0, 0),
            2,
        )

        video_frame = VideoFrame.from_ndarray(frame, format="rgb24")
        video_frame.pts = pts
        video_frame.time_base = time_base

        self.frame_count += 1

        if self.frame_count % 30 == 0:
            logger.info(f"Static test track: Generated frame #{self.frame_count}")

        return video_frame

    async def start(self):
        """Start the video track."""
        self._started = True
        logger.info(f"Started static test video track {id(self)}")

    async def stop(self):
        """Stop the video track."""
        self._started = False
        logger.info(
            f"Stopped static test video track {id(self)} after {self.frame_count} frames"
        )
