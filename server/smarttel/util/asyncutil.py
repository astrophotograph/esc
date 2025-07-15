"""Async utilities."""

import asyncio

from pydantic import BaseModel
from typing import Any, Awaitable, Callable, Coroutine, Optional


class ResettableDelay(BaseModel):
    """Resettable delay."""

    delay: float
    reset_event: asyncio.Event


# todo : note sure what the above does, but it auto completed ;)
# class AsyncContextManager:
#     """Async context manager."""
#     def __init__(self, func: Callable[..., Awaitable[Any]]) -> None:
#         self._func = func
#         self._instance: Optional[Any] = None
#         self._lock = asyncio.Lock()
#         # pylint: disable=no-self-use
#         self._args: tuple[Any, ...] = ()
#         self._kwargs: dict[str, Any] = {}
#         self._coro: Optional[Coroutine[Any, Any, Any]] = None
#         self._result: Optional[Any] = None
#         self._exception: Optional[Exception] = None
#         self._finished = False
#         self._finished_lock = asyncio.Lock()
#         self._finished_event = asyncio.Event()
#         self._finished_event.set()
#
#     def __call__(self, *args: Any, **kwargs: Any) -> 'AsyncContextManager':
#         self._args = args
#         self._kwargs = kwargs
#         return self
#
#     async def __aenter__(self) -> Any:
#         async with self._lock:
#             if self._instance is None:
#                 self._instance = await self._func(*self._args, **self._kwargs)
#         return self._instance
#
#     async def __aexit__(self, *exc: Any) -> None:
#         async with self._finished_lock:
#             if self._finished:
#                 return
#             self._finished = True
#             self._exception = exc[1] if exc else None
#             self._coro = asyncio.create_task(self._instance.__aexit__(*exc))
#
#
