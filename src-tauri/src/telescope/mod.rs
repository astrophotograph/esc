// Telescope control module
// Handles telescope connection, mount control, and status monitoring

pub mod commands;
pub mod discovery;
pub mod status;

pub use commands::*;
pub use discovery::*;
pub use status::*;

pub struct TelescopeController {
    // Telescope state will be managed here
}

impl TelescopeController {
    pub fn new() -> Self {
        Self {}
    }
}
