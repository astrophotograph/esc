//! Shared test helpers: load the vendored Seestar session corpus and replay it
//! through a localhost mock telescope.
//!
//! The corpus lives at `tests/fixtures/sessions/<name>/control.jsonl` (see the
//! README there). Each line is one captured control-channel message. We use it
//! two ways:
//!
//!   * [`Session`] exposes the recorded client commands and telescope
//!     messages directly, for pure-parsing assertions; and
//!   * [`ReplayServer`] stands up a TCP mock that speaks the Seestar wire
//!     protocol (newline-delimited JSON-RPC) and answers a real
//!     `scopinator_seestar::SeestarClient` with the *recorded* responses and
//!     async events — i.e. an end-to-end replay of traffic that actually
//!     happened on the wire.

#![allow(dead_code)]

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

/// One captured control-channel message.
#[derive(Debug, Clone, Deserialize)]
pub struct Record {
    pub timestamp: f64,
    pub direction: String,
    /// The raw JSON-RPC payload, as a string (JSON-within-JSON).
    pub raw: String,
}

impl Record {
    pub fn is_client(&self) -> bool {
        self.direction == "client"
    }
    pub fn is_telescope(&self) -> bool {
        self.direction == "telescope"
    }
    /// Parse the embedded `raw` payload into a JSON value.
    pub fn message(&self) -> Value {
        serde_json::from_str(&self.raw)
            .unwrap_or_else(|e| panic!("corpus has malformed raw JSON: {e}\n  raw = {}", self.raw))
    }
}

/// A loaded session: its directory name plus all parsed records.
pub struct Session {
    pub name: String,
    pub records: Vec<Record>,
}

impl Session {
    pub fn client_messages(&self) -> impl Iterator<Item = Value> + '_ {
        self.records.iter().filter(|r| r.is_client()).map(|r| r.message())
    }
    pub fn telescope_messages(&self) -> impl Iterator<Item = Value> + '_ {
        self.records.iter().filter(|r| r.is_telescope()).map(|r| r.message())
    }
    /// Telescope→app messages that are async events (carry an `Event` field).
    pub fn events(&self) -> Vec<Value> {
        self.telescope_messages()
            .filter(|m| m.get("Event").is_some())
            .collect()
    }
    /// Telescope→app messages that are command responses (`id` + `code`/`result`).
    pub fn responses(&self) -> Vec<Value> {
        self.telescope_messages()
            .filter(|m| m.get("id").is_some() && (m.get("code").is_some() || m.get("result").is_some()))
            .collect()
    }
    /// First recorded response for `method`, if any.
    pub fn response_for(&self, method: &str) -> Option<Value> {
        self.responses()
            .into_iter()
            .find(|m| m.get("method").and_then(Value::as_str) == Some(method))
    }
}

/// Absolute path to `tests/fixtures/sessions`, resolved from this crate's manifest.
pub fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("sessions")
}

/// Load one named session from the vendored corpus.
pub fn load_session(name: &str) -> Session {
    let path = corpus_dir().join(name).join("control.jsonl");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read session {}: {e}", path.display()));
    let records = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str::<Record>(l).expect("parse corpus record"))
        .collect();
    Session { name: name.to_string(), records }
}

/// Names of every vendored session directory, sorted.
pub fn session_names() -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(corpus_dir())
        .expect("read corpus dir")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.join("control.jsonl").is_file())
        .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect();
    names.sort();
    assert!(!names.is_empty(), "vendored session corpus is empty");
    names
}

/// Load every vendored session.
pub fn load_all_sessions() -> Vec<Session> {
    session_names().iter().map(|n| load_session(n)).collect()
}

// ============================================================================
// ReplayServer: a localhost mock telescope that answers a real SeestarClient
// with the recorded responses/events from a captured session.
// ============================================================================

struct Shared {
    /// method -> recorded response template; the request's `id` is substituted in.
    responses: HashMap<String, Value>,
    /// Recorded async events, pushed to each control connection after connect.
    events: Vec<Value>,
    /// Every client message the mock has received, in order.
    received: Mutex<Vec<Value>>,
}

/// Handle to a running replay mock. Drop it to stop accepting new connections.
pub struct ReplayServer {
    pub control_addr: SocketAddr,
    pub imaging_addr: SocketAddr,
    shared: Arc<Shared>,
}

impl ReplayServer {
    /// Start a mock telescope that replays `session`.
    pub async fn start(session: &Session) -> Self {
        let mut responses = HashMap::new();
        for resp in session.responses() {
            if let Some(method) = resp.get("method").and_then(Value::as_str) {
                // Keep the first recorded response per method (initial state).
                responses.entry(method.to_string()).or_insert(resp);
            }
        }

        let shared = Arc::new(Shared {
            responses,
            events: session.events(),
            received: Mutex::new(Vec::new()),
        });

        let control = TcpListener::bind("127.0.0.1:0").await.expect("bind control");
        let imaging = TcpListener::bind("127.0.0.1:0").await.expect("bind imaging");
        let control_addr = control.local_addr().unwrap();
        let imaging_addr = imaging.local_addr().unwrap();

        // Control accept loop.
        {
            let shared = Arc::clone(&shared);
            tokio::spawn(async move {
                while let Ok((stream, _)) = control.accept().await {
                    let shared = Arc::clone(&shared);
                    tokio::spawn(async move { serve_control(stream, shared).await });
                }
            });
        }
        // Imaging accept loop — accept and drain so the imaging task stays quiet.
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = imaging.accept().await {
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    use tokio::io::AsyncReadExt;
                    while let Ok(n) = stream.read(&mut buf).await {
                        if n == 0 {
                            break;
                        }
                    }
                });
            }
        });

        ReplayServer { control_addr, imaging_addr, shared }
    }

    /// Every client message the mock has received so far.
    pub fn received(&self) -> Vec<Value> {
        self.shared.received.lock().unwrap().clone()
    }

    /// Number of recorded events this mock will push on connect.
    pub fn event_count(&self) -> usize {
        self.shared.events.len()
    }
}

async fn serve_control(stream: TcpStream, shared: Arc<Shared>) {
    let (read_half, mut write_half) = stream.into_split();

    // Single writer task drains an mpsc channel so the reader and the
    // event-pusher can both write to the socket without interleaving bytes.
    let (out_tx, mut out_rx) = mpsc::channel::<String>(256);
    let writer = tokio::spawn(async move {
        while let Some(mut line) = out_rx.recv().await {
            if !line.ends_with('\n') {
                line.push('\n');
            }
            if write_half.write_all(line.as_bytes()).await.is_err() {
                break;
            }
        }
    });

    // Push recorded async events shortly after the connection opens.
    {
        let events = shared.events.clone();
        let out_tx = out_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            for ev in events {
                if out_tx.send(ev.to_string()).await.is_err() {
                    break;
                }
            }
        });
    }

    // Read client commands; reply with the recorded response per method.
    let mut lines = BufReader::new(read_half).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        shared.received.lock().unwrap().push(msg.clone());

        let id = msg.get("id").cloned().unwrap_or(json!(0));
        let method = msg.get("method").and_then(Value::as_str).unwrap_or("");

        let mut response = shared.responses.get(method).cloned().unwrap_or_else(|| {
            // Unmodeled / fire-and-forget command: synthesize a bare success so
            // the client's correlation (and heartbeats) don't time out.
            json!({"jsonrpc": "2.0", "method": method, "code": 0, "result": {}})
        });
        if let Some(obj) = response.as_object_mut() {
            obj.insert("id".to_string(), id);
        }
        if out_tx.send(response.to_string()).await.is_err() {
            break;
        }
    }

    drop(out_tx);
    let _ = writer.await;
}
