// Tauri commands module
// This module contains all the commands that can be invoked from the frontend

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to EESC.", name)
}
