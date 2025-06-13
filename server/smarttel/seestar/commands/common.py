"""Common models."""
from typing import Generic, TypeVar

from pydantic import BaseModel

DataT = TypeVar("DataT")

class BaseCommand(BaseModel):
    """Base command."""
    id: int | None = None
    method: str

class CommandResponse(BaseModel, Generic[DataT]):
    """Base response."""
    id: int
    jsonrpc: str = "2.0"
    Timestamp: str | None = None
    method: str # TODO : strongly type this based on request type
    code: int
    result: DataT
