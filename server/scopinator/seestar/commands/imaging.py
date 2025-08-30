"""Imaging commands for Seestar."""

from typing import Literal

from scopinator.seestar.commands.common import BaseCommand


class BeginStreaming(BaseCommand):
    """Begin streaming from the Seestar."""

    method: Literal["begin_streaming"] = "begin_streaming"


class StopStreaming(BaseCommand):
    """Stop streaming from the Seestar."""

    method: Literal["stop_streaming"] = "stop_streaming"


class GetStackedImage(BaseCommand):
    """Get the stacked image from the Seestar."""

    method: Literal["get_stacked_img"] = "get_stacked_img"
