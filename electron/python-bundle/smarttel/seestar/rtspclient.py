"""OpenCV Backend RTSP Client"""

import asyncio
from threading import Thread, RLock
from typing import Any, Optional

import cv2
import numpy.typing as npt
from PIL import Image
from loguru import logger as logging


# Adapted from https://github.com/dactylroot/rtsp/tree/master


class RtspClient:
    """Maintain a live RTSP feed without buffering."""

    def __init__(self, rtsp_server_uri: str):
        self.rtsp_server_uri: str = rtsp_server_uri
        self._stream: cv2.VideoCapture | None = None
        self._bg_run: bool = False
        self._bgt: Thread | None = None
        self._queue: Image.Image | None = None
        self._lock = RLock()
        self._is_opening: bool = False

    def __enter__(self, *args, **kwargs):
        """Returns the object which later will have __exit__ called.
        This relationship creates a context manager."""
        self._bgt = Thread(target=self._opener, args=(), daemon=True)
        self._bgt.start()

        return self

    def __exit__(self, type=None, value=None, traceback=None):
        """Together with __enter__, allows support for `with-` clauses."""
        Thread(target=self._closer, args=(), daemon=True).start()

    def _opener(self):
        """open stream and start update process."""
        self._is_opening = True
        with self._lock:
            self._stream = cv2.VideoCapture(self.rtsp_server_uri)
            logging.debug("Connected to video source {}.".format(self.rtsp_server_uri))

            self._bg_run = True
        self._is_opening = False

        self._update()

    def _closer(self) -> None:
        """signal background thread to stop. release CV stream"""
        with self._lock:
            self._is_opening = False
            self._bg_run = False
            self._bgt.join()
            logging.debug("Disconnected from {}".format(self.rtsp_server_uri))

    def is_opened(self) -> bool:
        """return true if stream is opened and being read, else ensure closed"""
        try:
            return (
                (self._stream is not None) and self._stream.isOpened() and self._bg_run
            )
        except:
            self._close()
            return False

    def _update(self) -> None:
        while self.is_opened():
            (grabbed, frame) = self._stream.read()
            if not grabbed:
                self._bg_run = False
            else:
                with self._lock:
                    self._queue = frame

        self._stream.release()

    def read(self) -> Optional[npt.NDArray]:
        """Retrieve most recent frame and convert to PIL. Return unconverted with raw=True."""
        with self._lock:
            try:
                if self._queue is None:
                    return None
                return cv2.cvtColor(self._queue, cv2.COLOR_BGR2RGB)
            except:
                return None

    async def finish_opening(self):
        """Wait until stream is opened."""
        while True:
            with self._lock:
                if not self._is_opening:
                    logging.info("Stream opened.")
                    return
            await asyncio.sleep(0.1)


# def preview(self):
#     """ Blocking function. Opens OpenCV window to display stream. """
#     win_name = 'RTSP'
#     cv2.namedWindow(win_name, cv2.WINDOW_AUTOSIZE)
#     cv2.moveWindow(win_name,20,20)
#     while(self.isOpened()):
#         cv2.imshow(win_name,self.read(raw=True))
#         if cv2.waitKey(30) == ord('q'): # wait 30 ms for 'q' input
#             break
#     cv2.waitKey(1)
#     cv2.destroyAllWindows()
#     cv2.waitKey(1)
