"""Common models."""

from typing import Generic, TypeVar

from pydantic import BaseModel

DataT = TypeVar("DataT")


class BaseCommand(BaseModel):
    """Base command."""

    id: int | None = None
    method: str


# todo : switch back to Generic[DataT]
class CommandResponse(BaseModel):
    """Base response."""

    id: int
    jsonrpc: str = "2.0"
    Timestamp: str | None = None
    method: str  # TODO : strongly type this based on request type
    code: int
    error: str | None = None
    # Some commands return a JSON object (dict)
    # Others return a simple number (focus position)
    # Others return a tuple (for example Dec / RA)
    result: dict | tuple | int | None = None
