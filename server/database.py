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
            await db.commit()
            
        self._initialized = True
        logging.info(f"Telescope database initialized at {self.db_path}")
    
    async def save_telescope(self, telescope_data: Dict[str, Any]) -> bool:
        """Save a telescope to the database. Only saves if discovery_method is 'manual'."""
        await self.initialize()
        
        # Only save manually added telescopes
        if telescope_data.get('discovery_method') != 'manual':
            logging.debug(f"Skipping database save for auto-discovered telescope {telescope_data.get('host')}")
            return False
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("""
                    INSERT OR REPLACE INTO telescopes 
                    (host, port, serial_number, product_model, ssid, location, discovery_method, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (
                    telescope_data['host'],
                    telescope_data['port'],
                    telescope_data.get('serial_number'),
                    telescope_data.get('product_model'),
                    telescope_data.get('ssid'),
                    telescope_data.get('location'),
                    telescope_data.get('discovery_method', 'manual')
                ))
                await db.commit()
                logging.info(f"Saved telescope {telescope_data['host']}:{telescope_data['port']} to database")
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
                            'host': row['host'],
                            'port': row['port'],
                            'serial_number': row['serial_number'],
                            'product_model': row['product_model'],
                            'ssid': row['ssid'],
                            'location': row['location'],
                            'discovery_method': row['discovery_method'] or 'manual'
                        }
                        telescopes.append(telescope_data)
                    
                    logging.info(f"Loaded {len(telescopes)} manually added telescopes from database")
                    return telescopes
        except Exception as e:
            logging.error(f"Failed to load telescopes from database: {e}")
            return []
    
    async def delete_telescope(self, host: str, port: int) -> bool:
        """Delete a telescope from the database by host and port."""
        await self.initialize()
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    DELETE FROM telescopes WHERE host = ? AND port = ?
                """, (host, port))
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
                cursor = await db.execute("""
                    DELETE FROM telescopes 
                    WHERE serial_number = ? OR (serial_number IS NULL AND host = ?)
                """, (name, name))
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
                async with db.execute("""
                    SELECT 1 FROM telescopes WHERE host = ? AND port = ?
                """, (host, port)) as cursor:
                    row = await cursor.fetchone()
                    return row is not None
        except Exception as e:
            logging.error(f"Failed to check telescope existence in database: {e}")
            return False