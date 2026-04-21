pub mod models;

use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::path::PathBuf;

use models::{Equipment, Image, ObservationLog, Session, Telescope};

/// Database manager for persistent storage
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Create a new database connection
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    /// Initialize database schema
    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock();

        // Telescopes table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS telescopes (
                id TEXT PRIMARY KEY,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                protocol TEXT DEFAULT 'seestar',
                serial_number TEXT,
                product_model TEXT,
                name TEXT,
                location TEXT,
                discovery_method TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_seen TEXT
            )",
            [],
        )?;

        // Add protocol column if it doesn't exist (for existing databases)
        conn.execute(
            "ALTER TABLE telescopes ADD COLUMN protocol TEXT DEFAULT 'seestar'",
            [],
        )
        .ok(); // Ignore error if column already exists

        // Add last_seen column if it doesn't exist (for existing databases)
        conn.execute(
            "ALTER TABLE telescopes ADD COLUMN last_seen TEXT",
            [],
        )
        .ok(); // Ignore error if column already exists

        // Legacy observations table (kept for backwards compatibility)
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

        // Sessions table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                telescope_id TEXT,
                name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                location_lat REAL,
                location_lon REAL,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(telescope_id) REFERENCES telescopes(id)
            )",
            [],
        )?;

        // Equipment table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS equipment (
                id TEXT PRIMARY KEY,
                equipment_type TEXT NOT NULL,
                name TEXT NOT NULL,
                specs TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // Observation logs table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS observation_logs (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                target_name TEXT NOT NULL,
                ra REAL,
                dec REAL,
                notes TEXT,
                rating INTEGER,
                captured_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )",
            [],
        )?;

        // Images table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                file_path TEXT NOT NULL,
                exposure_ms INTEGER,
                gain INTEGER,
                captured_at TEXT NOT NULL,
                plate_solved INTEGER DEFAULT 0,
                plate_solve_ra REAL,
                plate_solve_dec REAL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        Ok(rows.next()?.map(|row| row.get(0)).transpose()?)
    }

    pub fn set_setting(&self, key: &str, value: Option<&str>) -> Result<()> {
        let conn = self.conn.lock();
        match value {
            Some(v) => conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
                params![key, v],
            )?,
            None => conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?,
        };
        Ok(())
    }

    /// Save a telescope configuration
    pub fn save_telescope(&self, telescope: &Telescope) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO telescopes (
                id, host, port, protocol, serial_number, product_model, name,
                location, discovery_method, created_at, updated_at, last_seen
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                telescope.id,
                telescope.host,
                telescope.port,
                telescope.protocol.as_deref().unwrap_or("seestar"),
                telescope.serial_number,
                telescope.product_model,
                telescope.name,
                telescope.location,
                telescope.discovery_method,
                telescope.created_at.to_rfc3339(),
                telescope.updated_at.to_rfc3339(),
                telescope.last_seen.map(|dt| dt.to_rfc3339()),
            ],
        )?;
        Ok(())
    }

    /// Get all telescopes
    pub fn get_telescopes(&self) -> Result<Vec<Telescope>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, host, port, protocol, serial_number, product_model, name,
                    location, discovery_method, created_at, updated_at, last_seen
             FROM telescopes",
        )?;

        let telescopes = stmt
            .query_map([], |row| {
                let last_seen_str: Option<String> = row.get(11)?;
                Ok(Telescope {
                    id: row.get(0)?,
                    host: row.get(1)?,
                    port: row.get(2)?,
                    protocol: row.get(3)?,
                    serial_number: row.get(4)?,
                    product_model: row.get(5)?,
                    name: row.get(6)?,
                    location: row.get(7)?,
                    discovery_method: row.get(8)?,
                    created_at: row.get::<_, String>(9)?.parse().unwrap(),
                    updated_at: row.get::<_, String>(10)?.parse().unwrap(),
                    last_seen: last_seen_str.and_then(|s| s.parse().ok()),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(telescopes)
    }

    /// Remove auto-discovered telescopes not seen in the specified duration
    pub fn cleanup_stale_telescopes(&self, max_age: chrono::Duration) -> Result<usize> {
        let conn = self.conn.lock();
        let cutoff = (chrono::Utc::now() - max_age).to_rfc3339();

        // Only remove auto-discovered telescopes (not manually added ones)
        let count = conn.execute(
            "DELETE FROM telescopes
             WHERE (discovery_method = 'auto_discovery' OR discovery_method = 'alpaca_discovery')
               AND last_seen IS NOT NULL
               AND last_seen < ?1",
            params![cutoff],
        )?;

        Ok(count)
    }

    /// Delete a telescope
    pub fn delete_telescope(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM telescopes WHERE id = ?1", params![id])?;
        Ok(())
    }

    // =========================================================================
    // Session methods
    // =========================================================================

    /// Save a session
    pub fn save_session(&self, session: &Session) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO sessions (
                id, telescope_id, name, started_at, ended_at,
                location_lat, location_lon, notes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                session.id,
                session.telescope_id,
                session.name,
                session.started_at.to_rfc3339(),
                session.ended_at.map(|dt| dt.to_rfc3339()),
                session.location_lat,
                session.location_lon,
                session.notes,
                session.created_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Get all sessions
    pub fn get_sessions(&self) -> Result<Vec<Session>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, telescope_id, name, started_at, ended_at,
                    location_lat, location_lon, notes, created_at
             FROM sessions ORDER BY started_at DESC",
        )?;

        let sessions = stmt
            .query_map([], |row| {
                let ended_at_str: Option<String> = row.get(4)?;
                Ok(Session {
                    id: row.get(0)?,
                    telescope_id: row.get(1)?,
                    name: row.get(2)?,
                    started_at: row.get::<_, String>(3)?.parse().unwrap(),
                    ended_at: ended_at_str.map(|s| s.parse().unwrap()),
                    location_lat: row.get(5)?,
                    location_lon: row.get(6)?,
                    notes: row.get(7)?,
                    created_at: row.get::<_, String>(8)?.parse().unwrap(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    /// Delete a session
    pub fn delete_session(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(())
    }

    // =========================================================================
    // Equipment methods
    // =========================================================================

    /// Save equipment
    #[allow(dead_code)]
    pub fn save_equipment(&self, equipment: &Equipment) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO equipment (
                id, equipment_type, name, specs, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                equipment.id,
                equipment.equipment_type,
                equipment.name,
                equipment.specs,
                equipment.created_at.to_rfc3339(),
                equipment.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Get all equipment
    #[allow(dead_code)]
    pub fn get_equipment(&self) -> Result<Vec<Equipment>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, equipment_type, name, specs, created_at, updated_at
             FROM equipment ORDER BY name",
        )?;

        let equipment = stmt
            .query_map([], |row| {
                Ok(Equipment {
                    id: row.get(0)?,
                    equipment_type: row.get(1)?,
                    name: row.get(2)?,
                    specs: row.get(3)?,
                    created_at: row.get::<_, String>(4)?.parse().unwrap(),
                    updated_at: row.get::<_, String>(5)?.parse().unwrap(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(equipment)
    }

    /// Delete equipment
    #[allow(dead_code)]
    pub fn delete_equipment(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM equipment WHERE id = ?1", params![id])?;
        Ok(())
    }

    // =========================================================================
    // Observation log methods
    // =========================================================================

    /// Save an observation log entry
    #[allow(dead_code)]
    pub fn save_observation_log(&self, log: &ObservationLog) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO observation_logs (
                id, session_id, target_name, ra, dec, notes, rating, captured_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                log.id,
                log.session_id,
                log.target_name,
                log.ra,
                log.dec,
                log.notes,
                log.rating,
                log.captured_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Get observation logs for a session
    #[allow(dead_code)]
    pub fn get_observation_logs(&self, session_id: Option<&str>) -> Result<Vec<ObservationLog>> {
        let conn = self.conn.lock();
        let sql = if session_id.is_some() {
            "SELECT id, session_id, target_name, ra, dec, notes, rating, captured_at
             FROM observation_logs WHERE session_id = ?1 ORDER BY captured_at DESC"
        } else {
            "SELECT id, session_id, target_name, ra, dec, notes, rating, captured_at
             FROM observation_logs ORDER BY captured_at DESC"
        };

        let mut stmt = conn.prepare(sql)?;
        let logs = if let Some(sid) = session_id {
            stmt.query_map(params![sid], |row| {
                Ok(ObservationLog {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    target_name: row.get(2)?,
                    ra: row.get(3)?,
                    dec: row.get(4)?,
                    notes: row.get(5)?,
                    rating: row.get(6)?,
                    captured_at: row.get::<_, String>(7)?.parse().unwrap(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], |row| {
                Ok(ObservationLog {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    target_name: row.get(2)?,
                    ra: row.get(3)?,
                    dec: row.get(4)?,
                    notes: row.get(5)?,
                    rating: row.get(6)?,
                    captured_at: row.get::<_, String>(7)?.parse().unwrap(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };

        Ok(logs)
    }

    /// Delete an observation log
    #[allow(dead_code)]
    pub fn delete_observation_log(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM observation_logs WHERE id = ?1", params![id])?;
        Ok(())
    }

    // =========================================================================
    // Image methods
    // =========================================================================

    /// Save an image record
    pub fn save_image(&self, image: &Image) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO images (
                id, session_id, file_path, exposure_ms, gain, captured_at,
                plate_solved, plate_solve_ra, plate_solve_dec
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                image.id,
                image.session_id,
                image.file_path,
                image.exposure_ms,
                image.gain,
                image.captured_at.to_rfc3339(),
                image.plate_solved as i32,
                image.plate_solve_ra,
                image.plate_solve_dec,
            ],
        )?;
        Ok(())
    }

    /// Get images for a session
    pub fn get_images(&self, session_id: Option<&str>) -> Result<Vec<Image>> {
        let conn = self.conn.lock();
        let sql = if session_id.is_some() {
            "SELECT id, session_id, file_path, exposure_ms, gain, captured_at,
                    plate_solved, plate_solve_ra, plate_solve_dec
             FROM images WHERE session_id = ?1 ORDER BY captured_at DESC"
        } else {
            "SELECT id, session_id, file_path, exposure_ms, gain, captured_at,
                    plate_solved, plate_solve_ra, plate_solve_dec
             FROM images ORDER BY captured_at DESC"
        };

        let mut stmt = conn.prepare(sql)?;
        let images = if let Some(sid) = session_id {
            stmt.query_map(params![sid], |row| {
                Ok(Image {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    file_path: row.get(2)?,
                    exposure_ms: row.get(3)?,
                    gain: row.get(4)?,
                    captured_at: row.get::<_, String>(5)?.parse().unwrap(),
                    plate_solved: row.get::<_, i32>(6)? != 0,
                    plate_solve_ra: row.get(7)?,
                    plate_solve_dec: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], |row| {
                Ok(Image {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    file_path: row.get(2)?,
                    exposure_ms: row.get(3)?,
                    gain: row.get(4)?,
                    captured_at: row.get::<_, String>(5)?.parse().unwrap(),
                    plate_solved: row.get::<_, i32>(6)? != 0,
                    plate_solve_ra: row.get(7)?,
                    plate_solve_dec: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };

        Ok(images)
    }

    /// Delete an image
    pub fn delete_image(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM images WHERE id = ?1", params![id])?;
        Ok(())
    }
}
