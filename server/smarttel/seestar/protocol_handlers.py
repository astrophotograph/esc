"""Protocol handlers for Seestar communication."""
import asyncio
import json
import zipfile
from abc import ABC, abstractmethod
from io import BytesIO
from struct import calcsize, unpack
from typing import TypeVar, Generic, Optional, Any, Union

import numpy as np
import numpy.typing as npt

import cv2
from loguru import logger as logging
from pydantic import BaseModel

from smarttel.seestar.commands.common import CommandResponse

U = TypeVar("U")


class ProtocolHandler(ABC, Generic[U]):
    """Base protocol handler."""
    
    @abstractmethod
    async def recv_message(self, client, message_id: int) -> U | None:
        """Receive a message with the given ID."""
        pass

class ScopeImage(BaseModel, arbitrary_types_allowed=True):
    """Base image class."""
    width: int | None = None
    height: int | None = None
    data: bytes | None = None
    image: Optional[npt.NDArray] = None


class TextProtocol(ProtocolHandler[CommandResponse]):
    """Text protocol handler for JSON-RPC messages."""
    
    def __init__(self):
        self._pending_futures: dict[int, asyncio.Future[CommandResponse]] = {}
    
    async def recv_message(self, client, message_id: int) -> CommandResponse | None:
        """Receive a JSON-RPC message with the given ID."""
        try:
            # Create a future for this message ID
            future = asyncio.Future[CommandResponse]()
            self._pending_futures[message_id] = future
            
            try:
                # Wait for the future to be resolved with a timeout
                response = await asyncio.wait_for(future, timeout=10.0)
                logging.trace(f"Received text message with ID {message_id}: {response}")
                return response
            except asyncio.TimeoutError:
                logging.warning(f"Timeout waiting for message with ID {message_id}")
                return None
            finally:
                # Clean up the future
                await self._pending_futures.pop(message_id, None)
            
        except Exception as e:
            logging.error(f"Error receiving text message with ID {message_id}: {e}")
            # Clean up on error
            await self._pending_futures.pop(message_id, None)
            return None
    
    def handle_incoming_message(self, response: CommandResponse) -> bool:
        """Handle an incoming message and resolve any pending futures.
        
        Returns True if the message was handled by a pending future, False otherwise.
        """
        if hasattr(response, 'id') and response.id is not None:
            future = self._pending_futures.get(response.id)
            if future and not future.done():
                future.set_result(response)
                logging.trace(f"Resolved future for message ID {response.id}")
                return True
        return False


class BinaryProtocol(ProtocolHandler[npt.NDArray]):
    """Binary protocol handler for image data."""
    
    async def recv_message(self, client, message_id: int) -> Optional[npt.NDArray]:
        """Receive binary image data with the given ID."""
        try:
            # For binary protocol, we need to read raw binary data
            # This is a simplified implementation - actual binary protocol
            # would need to handle the specific binary format used by Seestar
            
            max_attempts = 100  # Prevent infinite loops
            attempts = 0
            
            while attempts < max_attempts and client.is_connected:
                # In a real implementation, this would read binary data directly
                # from the connection and parse the binary protocol headers
                # For now, this is a placeholder that shows the structure
                
                if hasattr(client.connection, 'read_binary'):
                    # Hypothetical binary read method
                    binary_data = await client.connection.read_binary()
                    if binary_data is not None:
                        # Parse binary header to extract message ID and image data
                        parsed_id, image_data = self._parse_binary_data(binary_data)
                        if parsed_id == message_id:
                            logging.trace(f"Received binary message with ID {message_id}")
                            return image_data
                        else:
                            logging.trace(f"Received binary message with ID {parsed_id}, waiting for {message_id}")
                            continue
                else:
                    # Fallback: attempt to receive text and check if it's binary-related
                    response = await client.recv()
                    if response is not None and hasattr(response, 'id') and response.id == message_id:
                        # If this is a binary-related response, extract image data
                        if hasattr(response, 'result') and response.result is not None:
                            # This would be customized based on actual binary protocol
                            logging.trace(f"Received binary-related message with ID {message_id}")
                            return self._extract_image_from_response(response)
                
                attempts += 1
                await asyncio.sleep(0.01)
            
            logging.warning(f"Failed to receive binary message with ID {message_id} after {attempts} attempts")
            return None
            
        except Exception as e:
            logging.error(f"Error receiving binary message with ID {message_id}: {e}")
            return None
    
    def _parse_binary_data(self, binary_data: bytes) -> tuple[int, Optional[npt.NDArray]]:
        """Parse binary data to extract message ID and image data."""
        # This is a placeholder implementation
        # Real implementation would parse the actual binary protocol format
        try:
            # Example: first 4 bytes could be message ID, rest is image data
            if len(binary_data) < 4:
                return -1, None
            
            message_id = int.from_bytes(binary_data[:4], byteorder='big')
            image_bytes = binary_data[4:]
            
            # Convert bytes to numpy array (this would depend on actual format)
            # For now, just return empty array as placeholder
            if len(image_bytes) > 0:
                # This would be the actual image conversion logic
                image_array = np.frombuffer(image_bytes, dtype=np.uint8)
                return message_id, image_array
            
            return message_id, None
            
        except Exception as e:
            logging.error(f"Error parsing binary data: {e}")
            return -1, None
    
    def _extract_image_from_response(self, response: CommandResponse) -> Optional[npt.NDArray]:
        """Extract image data from a command response."""
        # This is a placeholder implementation
        # Real implementation would extract image data from the response
        try:
            if hasattr(response, 'result') and response.result is not None:
                # This would be customized based on actual response format
                logging.trace("Extracting image from response")
                # Return empty array as placeholder
                return np.array([])
            
            return None
            
        except Exception as e:
            logging.error(f"Error extracting image from response: {e}")
            return None


    def parse_header(self, header: bytes):
        if header is not None and len(header) > 20:
            # print(type(header))
            logging.trace("Header:" + ":".join("{:02x}".format(c) for c in header))
            # We ignore all values at end of header...
            header = header[:20]
            fmt = ">HHHIHHBBHH"
            logging.trace(f"size: {calcsize(fmt)}")
            _s1, _s2, _s3, size, _s5, _s6, code, id, width, height = unpack(fmt, header)
            if size > 100:
                logging.trace(
                    f"header: {size=} {width=} {height=} {_s1=} {_s2=} {_s3=} {code=} {id=}"
                )  # xxx trace

            return size, id, width, height
        return 0, None, None, None

    def _handle_preview_frame(self, width: int, height: int, data: bytes) -> ScopeImage:
        return ScopeImage(width=width, height=height,
                          data=data,
                          image=self._convert_star_image(data, width, height))

    def _convert_star_image(
            self, raw_image: bytes, width: int, height: int
    ) -> Optional[npt.NDArray[tuple]]:
        # if self.exposure_mode == "stack" or len(self.raw_img) == 1920 * 1080 * 6:
        w = width or 1080
        h = height or 1920
        raw_image_len = len(raw_image)
        if raw_image_len == w * h * 6:
            # print("raw buffer size:", len(self.raw_img))
            img = np.frombuffer(raw_image, dtype=np.uint16).reshape(h, w, 3)
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            return img

        elif raw_image_len == w * h * 2:
            img = np.frombuffer(raw_image, np.uint16).reshape(h, w)
            img = cv2.cvtColor(img, cv2.COLOR_BAYER_GRBG2BGR)
            return img
        else:
            logging.error(f"Unexpected raw image length: {raw_image_len} {raw_image}")
            return None

    def _handle_stack(self, width: int, height: int, data: bytes) -> ScopeImage:
        # for stacking, we have to extract zipfile
        try:
            zip_file = BytesIO(data)
            with zipfile.ZipFile(zip_file) as zip:
                contents = {name: zip.read(name) for name in zip.namelist()}
                raw_img = contents["raw_data"]
                latest_image = self._convert_star_image(raw_img, width, height)
                if latest_image is None:
                    raw_img = None
                    width = 0
                    height = 0

                return ScopeImage(width=width, height=height,
                                  data=raw_img,
                                  image=latest_image)

            # xxx Temp hack: just disconnect for now...
            # xxx Ideally we listen for an event that stack count has increased, or we track the stack
            #     count ourselves...
            # if self.is_gazing and self.exposure_mode == "stack":
            #    self.disconnect()
            #    self.reconnect()
        except Exception as e:
            logging.error(f"Exception handling zip stack: {e}")
            return ScopeImage(width=width, height=height, data=None, image=None)

    async def handle_incoming_message(self, width: int, height: int, data: bytes, id: int) -> ScopeImage:
        """Handle an incoming message and do nothing.

        Returns True to indicate that the message was handled.
        """
        if id == 21:  # Preview frame
            return self._handle_preview_frame(width, height, data)
        elif id == 23:
            return self._handle_stack(width, height, data)
        else:
            logging.trace(f"Unknown message ID: {id}: {data}")

        return ScopeImage(width=width, height=height, data=data, image=None)
