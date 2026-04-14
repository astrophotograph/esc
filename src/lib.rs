// Library exports for testing and PyO3 integration

pub mod commands;
pub mod telescope;
pub mod imaging;

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
