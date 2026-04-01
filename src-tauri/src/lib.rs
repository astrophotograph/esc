// Library exports for the telescope control application

pub mod commands;
pub mod database;
pub mod events;
pub mod imaging;
pub mod python;
pub mod state;
pub mod streaming;
pub mod stretch;
pub mod telescope;

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
