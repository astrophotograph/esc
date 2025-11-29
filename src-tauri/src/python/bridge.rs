use pyo3::prelude::*;
use pyo3::types::{PyDict, PyModule};
use serde_json::Value;

/// Initialize the Python interpreter and add the project's Python path
pub fn init_python() -> PyResult<()> {
    // Set PYTHONHOME to the Python 3.12 installation
    // This helps PyO3 find the standard library
    std::env::set_var(
        "PYTHONHOME",
        "/opt/homebrew/opt/python@3.12/Frameworks/Python.framework/Versions/3.12",
    );

    // Get the current directory (project root)
    let current_dir = std::env::current_dir()?;
    let python_path = current_dir.join("python");

    tracing::info!("Current directory: {:?}", current_dir);
    tracing::info!("Python path: {:?}", python_path);
    tracing::info!("Python path exists: {}", python_path.exists());

    // Set PYTHONPATH environment variable
    std::env::set_var("PYTHONPATH", python_path.to_str().unwrap());

    // Initialize Python and add our path
    Python::with_gil(|py| {
        // Add python directory to sys.path
        let sys = PyModule::import(py, "sys")?;
        let path: Bound<'_, pyo3::types::PyList> = sys.getattr("path")?.extract()?;

        // Insert at beginning of path
        let python_path_str = python_path.to_str().unwrap();
        path.insert(0, python_path_str)?;

        // Add venv site-packages to sys.path
        let venv_site_packages = current_dir
            .parent()
            .unwrap()
            .join(".venv/lib/python3.12/site-packages");
        tracing::info!("Checking for venv at: {:?}", venv_site_packages);
        tracing::info!("Venv exists: {}", venv_site_packages.exists());
        if venv_site_packages.exists() {
            let venv_path_str = venv_site_packages.to_str().unwrap();
            path.insert(1, venv_path_str)?;
            tracing::info!(
                "Added venv site-packages to sys.path: {:?}",
                venv_site_packages
            );
        } else {
            tracing::warn!("Venv site-packages not found at: {:?}", venv_site_packages);
        }

        // Log sys.path for debugging
        tracing::info!("Python sys.path after init:");
        for (i, item) in path.iter().enumerate() {
            if i < 5 {
                // Only log first 5 entries
                tracing::info!("  [{}]: {:?}", i, item);
            }
        }

        // Try to import telescope module to verify
        match PyModule::import(py, "telescope") {
            Ok(_) => tracing::info!("Successfully imported telescope module"),
            Err(e) => tracing::error!("Failed to import telescope module: {}", e),
        }

        tracing::info!("Python initialized successfully");
        Ok(())
    })
}

/// Bridge to Python telescope control module
pub struct TelescopeBridge {
    host: String,
    port: u16,
}

impl TelescopeBridge {
    /// Create a new telescope bridge
    pub fn new(host: &str, port: u16) -> Result<Self, String> {
        Ok(TelescopeBridge {
            host: host.to_string(),
            port,
        })
    }

    /// Create a persistent Python bridge object
    pub fn create_bridge_object(&self) -> Result<PyObject, String> {
        Python::with_gil(|py| {
            // Import the bridge module
            let bridge_module = PyModule::import(py, "telescope.seestar_bridge")
                .map_err(|e| format!("Failed to import telescope.seestar_bridge: {}", e))?;

            // Create bridge instance
            let create_fn = bridge_module
                .getattr("create_bridge")
                .map_err(|e| format!("Failed to get create_bridge: {}", e))?;

            let bridge_obj = create_fn
                .call1((self.host.as_str(), self.port))
                .map_err(|e| format!("Failed to create bridge: {}", e))?;

            // Convert to PyObject for storage
            Ok(bridge_obj.into())
        })
    }

    /// Helper to call Python bridge methods
    fn call_python(&self, method: &str, args: Option<Bound<'_, PyDict>>) -> Result<Value, String> {
        Python::with_gil(|py| {
            // Import the bridge module
            let bridge_module = PyModule::import(py, "telescope.seestar_bridge")
                .map_err(|e| format!("Failed to import telescope.seestar_bridge: {}", e))?;

            // Create bridge instance
            let create_fn = bridge_module
                .getattr("create_bridge")
                .map_err(|e| format!("Failed to get create_bridge: {}", e))?;

            let bridge_obj = create_fn
                .call1((self.host.as_str(), self.port))
                .map_err(|e| format!("Failed to create bridge: {}", e))?;

            // Get the run method
            let run_method = bridge_module
                .getattr("run_bridge_method")
                .map_err(|e| format!("Failed to get run_bridge_method: {}", e))?;

            // Call the method
            let result = if let Some(args_dict) = args {
                run_method.call1((bridge_obj, method, args_dict))
            } else {
                // Create empty dict for methods without parameters
                let empty_dict = PyDict::new(py);
                run_method.call1((bridge_obj, method, empty_dict))
            }
            .map_err(|e| format!("Failed to call {}: {}", method, e))?;

            // Convert result to JSON string
            let json_module = PyModule::import(py, "json")
                .map_err(|e| format!("Failed to import json: {}", e))?;

            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize result: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract JSON string: {}", e))?;

            // Parse JSON string
            serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))
        })
    }

    /// Connect to the telescope
    pub fn connect(&self) -> Result<Value, String> {
        self.call_python("connect", None)
    }

    /// Disconnect from the telescope
    pub fn disconnect(&self) -> Result<Value, String> {
        self.call_python("disconnect", None)
    }

    /// GOTO target coordinates
    pub fn goto_target(&self, target_name: &str, ra: f64, dec: f64) -> Result<Value, String> {
        Python::with_gil(|py| {
            let params = PyDict::new(py);
            params
                .set_item("target_name", target_name)
                .map_err(|e| format!("Failed to set target_name: {}", e))?;
            params
                .set_item("ra", ra)
                .map_err(|e| format!("Failed to set ra: {}", e))?;
            params
                .set_item("dec", dec)
                .map_err(|e| format!("Failed to set dec: {}", e))?;

            self.call_python("goto_target", Some(params.clone()))
        })
    }

    /// Park the telescope
    pub fn park(&self) -> Result<Value, String> {
        self.call_python("park", None)
    }

    /// Start imaging
    pub fn start_imaging(
        &self,
        exposure_ms: i32,
        gain: i32,
        target_name: Option<&str>,
    ) -> Result<Value, String> {
        Python::with_gil(|py| {
            let params = PyDict::new(py);
            params
                .set_item("exposure_ms", exposure_ms)
                .map_err(|e| format!("Failed to set exposure_ms: {}", e))?;
            params
                .set_item("gain", gain)
                .map_err(|e| format!("Failed to set gain: {}", e))?;
            if let Some(name) = target_name {
                params
                    .set_item("target_name", name)
                    .map_err(|e| format!("Failed to set target_name: {}", e))?;
            }

            self.call_python("start_imaging", Some(params.clone()))
        })
    }

    /// Stop imaging
    pub fn stop_imaging(&self) -> Result<Value, String> {
        self.call_python("stop_imaging", None)
    }

    /// Get telescope status
    pub fn get_status(&self) -> Result<Value, String> {
        self.call_python("get_status", None)
    }

    /// Generic method to call any Python bridge method with JSON params
    pub fn call_method(&self, method: &str, params: Value) -> Result<Value, String> {
        Python::with_gil(|py| {
            // Convert serde_json::Value to Python dict
            let json_module = PyModule::import(py, "json")
                .map_err(|e| format!("Failed to import json: {}", e))?;

            let params_str = serde_json::to_string(&params)
                .map_err(|e| format!("Failed to serialize params: {}", e))?;

            let py_params = json_module
                .call_method1("loads", (params_str,))
                .map_err(|e| format!("Failed to convert params to Python: {}", e))?;

            // Import the bridge module
            let bridge_module = PyModule::import(py, "telescope.seestar_bridge")
                .map_err(|e| format!("Failed to import telescope.seestar_bridge: {}", e))?;

            // Create bridge instance
            let create_fn = bridge_module
                .getattr("create_bridge")
                .map_err(|e| format!("Failed to get create_bridge: {}", e))?;

            let bridge_obj = create_fn
                .call1((self.host.as_str(), self.port))
                .map_err(|e| format!("Failed to create bridge: {}", e))?;

            // Get the run method
            let run_method = bridge_module
                .getattr("run_bridge_method")
                .map_err(|e| format!("Failed to get run_bridge_method: {}", e))?;

            // Call the method
            let result = run_method
                .call1((bridge_obj, method, py_params))
                .map_err(|e| format!("Failed to call {}: {}", method, e))?;

            // Convert result to JSON string
            let json_str: String = json_module
                .call_method1("dumps", (result,))
                .map_err(|e| format!("Failed to serialize result: {}", e))?
                .extract()
                .map_err(|e| format!("Failed to extract JSON string: {}", e))?;

            // Parse JSON string
            serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))
        })
    }
}

// Make TelescopeBridge Send + Sync (safe because Python GIL protects access)
unsafe impl Send for TelescopeBridge {}
unsafe impl Sync for TelescopeBridge {}
