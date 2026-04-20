// Library exports for the telescope control application

pub mod catalog;
pub mod config;
pub mod commands;
pub mod database;
pub mod events;
pub mod imaging;
pub mod state;
pub mod streaming;
pub mod stretch;
pub mod telescope;
pub mod web;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet_command() {
        let result = commands::greet("Test");
        assert!(result.contains("Hello"));
        assert!(result.contains("Test"));
        assert!(result.contains("EESC"));
    }
}
