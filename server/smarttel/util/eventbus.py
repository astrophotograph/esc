"""Python event bus.

Original implementation https://github.com/joeltok/py-event-bus/

Was MIT licensed, so this file is MIT licensed too...
"""
import asyncio
from typing import Any

from smarttel.seestar.events import BaseEvent


class EventBus():
    def __init__(self):
        self.listeners: dict[str, Any] = {}

    def add_listener(self, event_name: str, listener):
        if not self.listeners.get(event_name, None):
            self.listeners[event_name] = {listener}
        else:
            self.listeners[event_name].add(listener)

    def remove_listener(self, event_name: str, listener):
        self.listeners[event_name].remove(listener)
        if len(self.listeners[event_name]) == 0:
            del self.listeners[event_name]

    def emit(self, event_name: str, event: BaseEvent):
        listeners = self.listeners.get(event_name, [])
        for listener in listeners:
            asyncio.create_task(listener(event))