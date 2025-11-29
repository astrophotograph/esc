// Python integration module via PyO3
// Handles astronomical calculations, hardware control, and user scripting

pub mod bridge;

use pyo3::prelude::*;

pub use bridge::{init_python, TelescopeBridge};

pub struct PythonBridge {
    // Python interpreter state
}

impl PythonBridge {
    pub fn new() -> PyResult<Self> {
        Ok(Self {})
    }

    pub fn execute_script(&self, script: &str) -> PyResult<String> {
        Python::with_gil(|py| {
            let locals = pyo3::types::PyDict::new_bound(py);
            py.run_bound(script, None, Some(&locals))?;
            Ok("Script executed successfully".to_string())
        })
    }
}
