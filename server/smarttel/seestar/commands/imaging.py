"""Imaging commands for Seestar."""
from typing import Literal

from smarttel.seestar.commands.common import BaseCommand


class BeginStreaming(BaseCommand):
    """Begin streaming from the Seestar."""
    method: Literal["begin_streaming"] = "begin_streaming"

class StopStreaming(BaseCommand):
    """Stop streaming from the Seestar."""
    method: Literal["stop_streaming"] = "stop_streaming"
