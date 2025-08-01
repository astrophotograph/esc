"""Constants used throughout the telescope server application."""

# Default telescope connection settings
DEFAULT_TELESCOPE_PORT = 4700
DEFAULT_IMAGING_PORT = 4800
DEFAULT_SERVER_PORT = 8000

# Test telescope settings
TEST_TELESCOPE_PORT = 9999
TEST_TELESCOPE_HOST = "test.telescope.local"

# Discovery settings
DISCOVERY_TIMEOUT = 5.0  # seconds
DISCOVERY_RETRIES = 3

# Performance settings
MAX_CONCURRENT_CONNECTIONS = 50
CONNECTION_TIMEOUT = 30.0  # seconds
REQUEST_TIMEOUT = 10.0  # seconds

# Image processing settings
DEFAULT_IMAGE_WIDTH = 800
DEFAULT_IMAGE_HEIGHT = 600
MAX_IMAGE_SIZE = 4096

# Star map settings
DEFAULT_STARMAP_STYLE = "BLUE_GOLD"
MAX_MAGNITUDE = 8.0
GALAXY_MAGNITUDE_LIMIT = 12.5
NEBULA_MAGNITUDE_LIMIT = 10.0
CLUSTER_MAGNITUDE_LIMIT = 9.0

# Logging settings
DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_LOG_FILE = "server.log"
DEFAULT_LOG_ROTATION = "100 MB"
DEFAULT_LOG_RETENTION = "7 days"

# Health check thresholds
MEMORY_WARNING_THRESHOLD = 80.0  # percent
MEMORY_CRITICAL_THRESHOLD = 95.0  # percent
CPU_WARNING_THRESHOLD = 80.0  # percent
LATENCY_WARNING_THRESHOLD = 5.0  # seconds

# Database settings
DEFAULT_DATABASE_FILE = "telescopes.db"

# WebRTC settings
WEBRTC_SESSION_TIMEOUT = 300  # 5 minutes

# Error messages
ERROR_TELESCOPE_NOT_FOUND = "Telescope not found"
ERROR_TELESCOPE_ALREADY_EXISTS = "Telescope already exists"
ERROR_CONNECTION_FAILED = "Failed to connect to telescope"
ERROR_COMMAND_TIMEOUT = "Command timed out"
ERROR_INVALID_COORDINATES = "Invalid coordinates provided"

# Success messages
SUCCESS_TELESCOPE_CONNECTED = "Telescope connected successfully"
SUCCESS_TELESCOPE_DISCONNECTED = "Telescope disconnected successfully"
SUCCESS_COMMAND_EXECUTED = "Command executed successfully"