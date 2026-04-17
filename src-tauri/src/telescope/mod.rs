// Telescope control module
// Handles telescope connection, mount control, and status monitoring

pub mod commands;
pub mod discovery;
pub mod status;

pub use commands::*;
pub use discovery::*;
pub use status::*;

#[derive(Default)]
#[allow(dead_code)]
pub struct TelescopeController {
    // Telescope state will be managed here
}

impl TelescopeController {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::default()
    }
}
