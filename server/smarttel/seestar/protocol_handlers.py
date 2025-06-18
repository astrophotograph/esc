"""Protocol handlers for Seestar communication."""
import asyncio
import json
from abc import ABC, abstractmethod
from typing import TypeVar, Generic

import numpy as np
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


class TextProtocol(ProtocolHandler[CommandResponse[U]]):
    """Text protocol handler for JSON-RPC messages."""
    
    def __init__(self):
        self._pending_futures: dict[int, asyncio.Future[CommandResponse[U]]] = {}
    
    async def recv_message(self, client, message_id: int) -> CommandResponse[U] | None:
        """Receive a JSON-RPC message with the given ID."""
        try:
            # Create a future for this message ID
            future = asyncio.Future[CommandResponse[U]]()
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
                self._pending_futures.pop(message_id, None)
            
        except Exception as e:
            logging.error(f"Error receiving text message with ID {message_id}: {e}")
            # Clean up on error
            self._pending_futures.pop(message_id, None)
            return None
    
    def handle_incoming_message(self, response: CommandResponse[U]) -> bool:
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


class BinaryProtocol(ProtocolHandler[np.ndarray]):
    """Binary protocol handler for image data."""
    
    async def recv_message(self, client, message_id: int) -> np.ndarray | None:
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
    
    def _parse_binary_data(self, binary_data: bytes) -> tuple[int, np.ndarray | None]:
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
    
    def _extract_image_from_response(self, response: CommandResponse) -> np.ndarray | None:
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