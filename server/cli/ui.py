"""UI utilities for the CLI."""
import asyncio
import json
from contextlib import suppress

from textual.app import App, ComposeResult
from textual.containers import HorizontalGroup, VerticalScroll, Container
from textual.widgets import Header, Footer, Static, Button, DataTable
from textual.screen import Screen

from smarttel.seestar.client import SeestarClient


class DevicePickerScreen(Screen):
    """Device picker screen for discovered Seestar devices."""
    
    def __init__(self, devices, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.devices = devices
        self.selected_device = None
    
    def compose(self) -> ComposeResult:
        """Create child widgets for the screen."""
        yield Header()
        
        with VerticalScroll():
            yield Static("Select a Seestar device to connect:", id="instructions")
            yield DataTable(id="devices-table")
            yield Button("Connect", id="connect-button", disabled=True)
        
        yield Footer()
    
    def on_mount(self) -> None:
        """Set up the UI when the screen is mounted."""
        # Set up the devices table
        table = self.query_one("#devices-table")
        table.add_columns("IP Address", "Device Info")
        
        # Add devices to the table
        for i, device in enumerate(self.devices):
            try:
                device_info = json.dumps(device['data'], indent=2)
                table.add_row(device['address'], device_info[:50] + "..." if len(device_info) > 50 else device_info)
            except (KeyError, TypeError):
                table.add_row(device['address'], "Unknown device info")
    
    def on_data_table_row_selected(self, event) -> None:
        """Handle row selection in the devices table."""
        self.selected_device = self.devices[event.row_index]
        self.query_one("#connect-button").disabled = False
    
    def on_button_pressed(self, event) -> None:
        """Handle the Connect button press."""
        if event.button.id == "connect-button" and self.selected_device:
            # Notify the parent app of the selected device
            self.app.selected_device = self.selected_device
            # Switch to the main UI screen
            self.app.push_screen("main_ui")


class MainUIScreen(Screen):
    """Main Seestar UI screen."""
    
    def compose(self) -> ComposeResult:
        """Create child widgets for the screen."""
        yield Header()
        yield Static(id="response")
        yield Static(id="events")
        yield Footer()
    
    def on_mount(self) -> None:
        """Event handler for when the screen is mounted."""
        print("MainUIScreen mounted")
        # Get the host and port from the parent app
        host = self.app.host
        port = self.app.port
        self.app.update_title()
        # Start the connection and monitoring task
        asyncio.create_task(self.app.runner())


class CombinedSeestarUI(App):
    """Combined Seestar UI with device picker and main interface."""

    CSS_PATH = "ui.tcss"
    TITLE = "SeestarUI"
    BINDINGS = [("d", "toggle_dark", "Toggle dark mode")]

    SCREENS = {
        "main_ui": MainUIScreen,
    }

    def __init__(self, host=None, port=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.host = host
        self.port = port
        self.client = None
        self.events = []
        self.responses = []
        self.selected_device = None
    
    def update_title(self, i=0) -> None:
        """Update the app title."""
        if self.host and self.port:
            self.title = f"SeestarUI ({self.host}:{self.port} {i})"
            if self.client:
                self.sub_title = "Connected" if self.client.is_connected else "Disconnected"
        else:
            self.title = "Seestar Device Picker"
    
    def on_mount(self) -> None:
        """Event handler called when the app is mounted."""
        if self.host and self.port:
            # If we already have host and port, go directly to main UI
            self.init_client(self.host, self.port)
            self.push_screen("main_ui")
    
    def init_client(self, host, port):
        """Initialize the Seestar client with given host and port."""
        self.host = host
        self.port = port
        self.client = SeestarClient(self.host, self.port, debug=True)
        self.update_title()
    
    async def runner(self):
        """Run the client connection and message handling."""
        if not self.client:
            # Initialize client if it doesn't exist yet (from device picker)
            if self.selected_device:
                self.init_client(self.selected_device['address'], 4700)
        
        await self.client.connect()

        response_box = self.query_one("#response", Static)
        event_box = self.query_one("#events", Static)
        i = 0
        while True:
            i += 1
            if self.client.is_connected:
                try:
                    msg = await self.client.recv()
                    if msg is not None:
                        print(f'----> UI msg Received: {msg}')
                        response_box.update(str(msg))
                    with suppress(IndexError):
                        ev = self.client.recent_events.popleft()
                        print(f'----> UI event Received: {ev}')
                        event_box.update(str(ev))
                except Exception as e:
                    pass
            self.update_title(i)
            await asyncio.sleep(0.1)

        await self.client.disconnect()
    
    def action_toggle_dark(self) -> None:
        """Toggle dark mode."""
        self.theme = (
            'textual-dark' if self.theme == 'textual-light' else 'textual-light'
        )

    def set_device_picker(self, devices):
        """Set up and display the device picker screen with the discovered devices."""
        picker_screen = DevicePickerScreen(devices)
        self.install_screen(picker_screen, name="device_picker")
        self.push_screen("device_picker")