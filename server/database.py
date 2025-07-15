"""Database operations for persisting telescope configurations."""

import asyncio
import aiosqlite
from pathlib import Path
from typing import List, Optional, Dict, Any
from loguru import logger as logging


class TelescopeDatabase:
    """Database for persisting manually added telescopes."""

    def __init__(self, db_path: str = "telescopes.db"):
        """Initialize the database."""
        # Use /app/data directory if it exists (Docker volume), otherwise current directory
        data_dir = Path("/app/data")
        if data_dir.exists() and data_dir.is_dir():
            self.db_path = data_dir / db_path
        else:
            self.db_path = Path(db_path)

        # Ensure the directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialized = False

    async def initialize(self):
        """Initialize the database and create tables if needed."""
        if self._initialized:
            return

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS telescopes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    host TEXT NOT NULL,
                    port INTEGER NOT NULL DEFAULT 4700,
                    serial_number TEXT,
                    product_model TEXT,
                    ssid TEXT,
                    location TEXT,
                    discovery_method TEXT NOT NULL DEFAULT 'manual',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(host, port)
                )
            """)

            await db.execute("""
                CREATE TABLE IF NOT EXISTS configurations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    config_data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            await db.execute("""
                CREATE TABLE IF NOT EXISTS remote_controllers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    host TEXT NOT NULL,
                    port INTEGER NOT NULL,
                    name TEXT,
                    description TEXT,
                    status TEXT DEFAULT 'disconnected',
                    last_connected TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(host, port)
                )
            """)
            await db.commit()

        self._initialized = True
        logging.info(f"Telescope database initialized at {self.db_path}")

    async def save_telescope(self, telescope_data: Dict[str, Any]) -> bool:
        """Save a telescope to the database. Only saves if discovery_method is 'manual'."""
        await self.initialize()

        # Only save manually added telescopes
        if telescope_data.get("discovery_method") != "manual":
            logging.debug(
                f"Skipping database save for auto-discovered telescope {telescope_data.get('host')}"
            )
            return False

        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    INSERT OR REPLACE INTO telescopes 
                    (host, port, serial_number, product_model, ssid, location, discovery_method, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                    (
                        telescope_data["host"],
                        telescope_data["port"],
                        telescope_data.get("serial_number"),
                        telescope_data.get("product_model"),
                        telescope_data.get("ssid"),
                        telescope_data.get("location"),
                        telescope_data.get("discovery_method", "manual"),
                    ),
                )
                await db.commit()
                logging.info(
                    f"Saved telescope {telescope_data['host']}:{telescope_data['port']} to database"
                )
                return True
        except Exception as e:
            logging.error(f"Failed to save telescope to database: {e}")
            return False

    async def load_telescopes(self) -> List[Dict[str, Any]]:
        """Load all manually added telescopes from the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute("""
                    SELECT host, port, serial_number, product_model, ssid, location, discovery_method
                    FROM telescopes 
                    WHERE discovery_method = 'manual'
                    ORDER BY created_at
                """) as cursor:
                    rows = await cursor.fetchall()
                    telescopes = []
                    for row in rows:
                        telescope_data = {
                            "host": row["host"],
                            "port": row["port"],
                            "serial_number": row["serial_number"],
                            "product_model": row["product_model"],
                            "ssid": row["ssid"],
                            "location": row["location"],
                            "discovery_method": row["discovery_method"] or "manual",
                        }
                        telescopes.append(telescope_data)

                    logging.info(
                        f"Loaded {len(telescopes)} manually added telescopes from database"
                    )
                    return telescopes
        except Exception as e:
            logging.error(f"Failed to load telescopes from database: {e}")
            return []

    async def delete_telescope(self, host: str, port: int) -> bool:
        """Delete a telescope from the database by host and port."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(
                    """
                    DELETE FROM telescopes WHERE host = ? AND port = ?
                """,
                    (host, port),
                )
                await db.commit()

                if cursor.rowcount > 0:
                    logging.info(f"Deleted telescope {host}:{port} from database")
                    return True
                else:
                    logging.warning(f"Telescope {host}:{port} not found in database")
                    return False
        except Exception as e:
            logging.error(f"Failed to delete telescope from database: {e}")
            return False

    async def delete_telescope_by_name(self, name: str) -> bool:
        """Delete a telescope from the database by name (serial_number or host)."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                # Try to delete by serial_number first, then by host
                cursor = await db.execute(
                    """
                    DELETE FROM telescopes 
                    WHERE serial_number = ? OR (serial_number IS NULL AND host = ?)
                """,
                    (name, name),
                )
                await db.commit()

                if cursor.rowcount > 0:
                    logging.info(f"Deleted telescope {name} from database")
                    return True
                else:
                    logging.warning(f"Telescope {name} not found in database")
                    return False
        except Exception as e:
            logging.error(f"Failed to delete telescope from database: {e}")
            return False

    async def telescope_exists(self, host: str, port: int) -> bool:
        """Check if a telescope exists in the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute(
                    """
                    SELECT 1 FROM telescopes WHERE host = ? AND port = ?
                """,
                    (host, port),
                ) as cursor:
                    row = await cursor.fetchone()
                    return row is not None
        except Exception as e:
            logging.error(f"Failed to check telescope existence in database: {e}")
            return False

    async def save_configuration(
        self, name: str, description: Optional[str], config_data: str
    ) -> bool:
        """Save a configuration to the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    INSERT OR REPLACE INTO configurations 
                    (name, description, config_data, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                    (name, description, config_data),
                )
                await db.commit()
                logging.info(f"Saved configuration '{name}' to database")
                return True
        except Exception as e:
            logging.error(f"Failed to save configuration to database: {e}")
            return False

    async def load_configuration(self, name: str) -> Optional[Dict[str, Any]]:
        """Load a specific configuration from the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    """
                    SELECT name, description, config_data, created_at, updated_at
                    FROM configurations 
                    WHERE name = ?
                """,
                    (name,),
                ) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        return {
                            "name": row["name"],
                            "description": row["description"],
                            "config_data": row["config_data"],
                            "created_at": row["created_at"],
                            "updated_at": row["updated_at"],
                        }
                    return None
        except Exception as e:
            logging.error(f"Failed to load configuration from database: {e}")
            return None

    async def list_configurations(self) -> List[Dict[str, Any]]:
        """List all configurations from the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute("""
                    SELECT name, description, created_at, updated_at
                    FROM configurations 
                    ORDER BY updated_at DESC
                """) as cursor:
                    rows = await cursor.fetchall()
                    configurations = []
                    for row in rows:
                        config_info = {
                            "name": row["name"],
                            "description": row["description"],
                            "created_at": row["created_at"],
                            "updated_at": row["updated_at"],
                        }
                        configurations.append(config_info)

                    logging.info(
                        f"Listed {len(configurations)} configurations from database"
                    )
                    return configurations
        except Exception as e:
            logging.error(f"Failed to list configurations from database: {e}")
            return []

    async def delete_configuration(self, name: str) -> bool:
        """Delete a configuration from the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(
                    """
                    DELETE FROM configurations WHERE name = ?
                """,
                    (name,),
                )
                await db.commit()

                if cursor.rowcount > 0:
                    logging.info(f"Deleted configuration '{name}' from database")
                    return True
                else:
                    logging.warning(f"Configuration '{name}' not found in database")
                    return False
        except Exception as e:
            logging.error(f"Failed to delete configuration from database: {e}")
            return False

    async def save_remote_controller(self, controller_data: Dict[str, Any]) -> bool:
        """Save a remote controller to the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    INSERT OR REPLACE INTO remote_controllers 
                    (host, port, name, description, status, last_connected, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                    (
                        controller_data["host"],
                        controller_data["port"],
                        controller_data.get("name"),
                        controller_data.get("description"),
                        controller_data.get("status", "disconnected"),
                        controller_data.get("last_connected"),
                    ),
                )
                await db.commit()
                logging.info(
                    f"Saved remote controller {controller_data['host']}:{controller_data['port']} to database"
                )
                return True
        except Exception as e:
            logging.error(f"Failed to save remote controller to database: {e}")
            return False

    async def load_remote_controllers(self) -> List[Dict[str, Any]]:
        """Load all remote controllers from the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute("""
                    SELECT host, port, name, description, status, last_connected
                    FROM remote_controllers 
                    ORDER BY created_at
                """) as cursor:
                    rows = await cursor.fetchall()
                    controllers = []
                    for row in rows:
                        controller_data = {
                            "host": row["host"],
                            "port": row["port"],
                            "name": row["name"],
                            "description": row["description"],
                            "status": row["status"],
                            "last_connected": row["last_connected"],
                        }
                        controllers.append(controller_data)

                    logging.info(
                        f"Loaded {len(controllers)} remote controllers from database"
                    )
                    return controllers
        except Exception as e:
            logging.error(f"Failed to load remote controllers from database: {e}")
            return []

    async def delete_remote_controller(self, host: str, port: int) -> bool:
        """Delete a remote controller from the database."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(
                    """
                    DELETE FROM remote_controllers WHERE host = ? AND port = ?
                """,
                    (host, port),
                )
                await db.commit()

                if cursor.rowcount > 0:
                    logging.info(
                        f"Deleted remote controller {host}:{port} from database"
                    )
                    return True
                else:
                    logging.warning(
                        f"Remote controller {host}:{port} not found in database"
                    )
                    return False
        except Exception as e:
            logging.error(f"Failed to delete remote controller from database: {e}")
            return False

    async def update_remote_controller_status(
        self, host: str, port: int, status: str, last_connected: Optional[str] = None
    ) -> bool:
        """Update the status of a remote controller."""
        await self.initialize()

        try:
            async with aiosqlite.connect(self.db_path) as db:
                if last_connected:
                    await db.execute(
                        """
                        UPDATE remote_controllers 
                        SET status = ?, last_connected = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE host = ? AND port = ?
                    """,
                        (status, last_connected, host, port),
                    )
                else:
                    await db.execute(
                        """
                        UPDATE remote_controllers 
                        SET status = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE host = ? AND port = ?
                    """,
                        (status, host, port),
                    )
                await db.commit()
                return True
        except Exception as e:
            logging.error(f"Failed to update remote controller status: {e}")
            return False
