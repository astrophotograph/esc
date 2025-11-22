pub mod models;

use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::{Connection, params};
use std::path::PathBuf;

use models::Telescope;

/// Database manager for persistent storage
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Create a new database connection
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database { conn: Mutex::new(conn) };
        db.init_schema()?;
        Ok(db)
    }

    /// Initialize database schema
    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS telescopes (
                id TEXT PRIMARY KEY,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                serial_number TEXT,
                product_model TEXT,
                name TEXT,
                location TEXT,
                discovery_method TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS observations (
                id TEXT PRIMARY KEY,
                telescope_id TEXT NOT NULL,
                target_name TEXT NOT NULL,
                ra REAL,
                dec REAL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                notes TEXT,
                rating INTEGER,
                FOREIGN KEY(telescope_id) REFERENCES telescopes(id)
            )",
            [],
        )?;

        Ok(())
    }

    /// Save a telescope configuration
    pub fn save_telescope(&self, telescope: &Telescope) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO telescopes (
                id, host, port, serial_number, product_model, name,
                location, discovery_method, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                telescope.id,
                telescope.host,
                telescope.port,
                telescope.serial_number,
                telescope.product_model,
                telescope.name,
                telescope.location,
                telescope.discovery_method,
                telescope.created_at.to_rfc3339(),
                telescope.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Get all telescopes
    pub fn get_telescopes(&self) -> Result<Vec<Telescope>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, host, port, serial_number, product_model, name,
                    location, discovery_method, created_at, updated_at
             FROM telescopes"
        )?;

        let telescopes = stmt.query_map([], |row| {
            Ok(Telescope {
                id: row.get(0)?,
                host: row.get(1)?,
                port: row.get(2)?,
                serial_number: row.get(3)?,
                product_model: row.get(4)?,
                name: row.get(5)?,
                location: row.get(6)?,
                discovery_method: row.get(7)?,
                created_at: row.get::<_, String>(8)?.parse().unwrap(),
                updated_at: row.get::<_, String>(9)?.parse().unwrap(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(telescopes)
    }

    /// Delete a telescope
    pub fn delete_telescope(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM telescopes WHERE id = ?1", params![id])?;
        Ok(())
    }
}
