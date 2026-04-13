//! SSH tunnel manager for remote Seestar connections.
//!
//! Opens an SSH connection and forwards the Seestar's TCP ports (4700 command,
//! 4800 imaging) through the tunnel so the local client can connect via localhost.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use russh::client;
use russh::keys::{load_secret_key, HashAlg, PrivateKeyWithHashAlg};
use russh::ChannelMsg;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::watch;
use tracing::{error, info, warn};

/// The two TCP ports the Seestar exposes.
const SEESTAR_PORTS: [u16; 2] = [4700, 4800];

/// Configuration for an SSH tunnel.
#[derive(Debug, Clone)]
pub struct SshTunnelConfig {
    pub ssh_host: String,
    pub ssh_port: u16,
    pub ssh_user: String,
    pub key_path: Option<String>,
    pub remote_host: String,
}

/// Manages SSH tunnel connections for forwarding telescope ports.
pub struct SshTunnelManager {
    config: SshTunnelConfig,
    /// Maps remote_port -> local_port
    local_ports: HashMap<u16, u16>,
    /// Handle to stop the tunnel
    shutdown_tx: Option<watch::Sender<bool>>,
}

/// Minimal SSH client handler that accepts any server key.
struct TunnelHandler;

impl client::Handler for TunnelHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept any host key (typical for Pi/LAN usage).
        Ok(true)
    }
}

impl SshTunnelManager {
    pub fn new(config: SshTunnelConfig) -> Self {
        Self {
            config,
            local_ports: HashMap::new(),
            shutdown_tx: None,
        }
    }

    /// Connect via SSH and set up local port forwarding for ports 4700 and 4800.
    /// Returns a map of remote_port -> local_port.
    pub async fn connect(&mut self) -> Result<HashMap<u16, u16>, String> {
        // Disconnect any existing tunnel first.
        self.disconnect().await;

        let cfg = &self.config;
        info!(
            "SSH: connecting to {}@{}:{}",
            cfg.ssh_user, cfg.ssh_host, cfg.ssh_port
        );

        // 1. Load SSH key
        let key = self.load_key()?;

        // 2. Connect to SSH server
        let client_config = Arc::new(client::Config::default());
        let handler = TunnelHandler;

        let mut session = client::connect(
            client_config,
            (cfg.ssh_host.as_str(), cfg.ssh_port),
            handler,
        )
        .await
        .map_err(|e| format!("SSH connection failed: {e}"))?;

        // 3. Authenticate with key
        let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(key), Some(HashAlg::Sha256));
        let auth_result = session
            .authenticate_publickey(&cfg.ssh_user, key_with_hash)
            .await
            .map_err(|e| format!("SSH authentication error: {e}"))?;

        if !auth_result.success() {
            return Err("SSH key authentication rejected by server".to_string());
        }
        info!("SSH: authenticated successfully");

        // 4. Set up local port forwarding
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let session = Arc::new(session);
        let mut local_ports = HashMap::new();

        for &remote_port in &SEESTAR_PORTS {
            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|e| format!("Failed to bind local listener: {e}"))?;
            let local_addr = listener
                .local_addr()
                .map_err(|e| format!("Failed to get local addr: {e}"))?;
            let local_port = local_addr.port();
            local_ports.insert(remote_port, local_port);

            info!(
                "SSH: forwarding localhost:{} -> {}:{}",
                local_port, cfg.remote_host, remote_port
            );

            let session_clone = Arc::clone(&session);
            let remote_host = cfg.remote_host.clone();
            let mut shutdown_rx_clone = shutdown_rx.clone();

            tokio::spawn(async move {
                loop {
                    tokio::select! {
                        accept_result = listener.accept() => {
                            match accept_result {
                                Ok((stream, peer_addr)) => {
                                    let session = Arc::clone(&session_clone);
                                    let remote_host = remote_host.clone();
                                    tokio::spawn(async move {
                                        if let Err(e) = forward_connection(
                                            session,
                                            stream,
                                            peer_addr,
                                            &remote_host,
                                            remote_port,
                                        ).await {
                                            warn!("SSH forward connection error: {e}");
                                        }
                                    });
                                }
                                Err(e) => {
                                    error!("SSH listener accept error: {e}");
                                    break;
                                }
                            }
                        }
                        _ = shutdown_rx_clone.changed() => {
                            info!("SSH: shutting down listener for port {}", remote_port);
                            break;
                        }
                    }
                }
            });
        }

        self.local_ports = local_ports.clone();
        self.shutdown_tx = Some(shutdown_tx);

        Ok(local_ports)
    }

    /// Disconnect the tunnel.
    pub async fn disconnect(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }
        self.local_ports.clear();
        info!("SSH: tunnel closed");
    }

    /// Check if the tunnel is still alive.
    pub fn is_alive(&self) -> bool {
        self.shutdown_tx.is_some()
    }

    /// Get the local port for a given remote port.
    pub fn local_port(&self, remote_port: u16) -> Option<u16> {
        self.local_ports.get(&remote_port).copied()
    }

    /// Load the SSH private key from the configured path or default locations.
    fn load_key(&self) -> Result<russh::keys::PrivateKey, String> {
        if let Some(ref path) = self.config.key_path {
            return load_secret_key(path, None)
                .map_err(|e| format!("Failed to load SSH key from {path}: {e}"));
        }

        // Try default key locations.
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        let candidates = [
            format!("{home}/.ssh/id_ed25519"),
            format!("{home}/.ssh/id_rsa"),
        ];

        for path in &candidates {
            if std::path::Path::new(path).exists() {
                match load_secret_key(path, None) {
                    Ok(key) => {
                        info!("SSH: loaded key from {path}");
                        return Ok(key);
                    }
                    Err(e) => {
                        warn!("SSH: failed to load key from {path}: {e}");
                    }
                }
            }
        }

        Err("No SSH key found. Provide key_path or ensure ~/.ssh/id_ed25519 or ~/.ssh/id_rsa exists.".to_string())
    }
}

/// Forward data between a local TCP stream and an SSH direct-tcpip channel.
async fn forward_connection(
    session: Arc<client::Handle<TunnelHandler>>,
    mut local_stream: tokio::net::TcpStream,
    originator_addr: SocketAddr,
    remote_host: &str,
    remote_port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut channel = session
        .channel_open_direct_tcpip(
            remote_host.to_string(),
            remote_port.into(),
            originator_addr.ip().to_string(),
            originator_addr.port().into(),
        )
        .await?;

    let mut stream_closed = false;
    let mut buf = vec![0u8; 65536];

    loop {
        tokio::select! {
            r = local_stream.read(&mut buf), if !stream_closed => {
                match r {
                    Ok(0) => {
                        stream_closed = true;
                        channel.eof().await?;
                    }
                    Ok(n) => {
                        channel.data(&buf[..n]).await?;
                    }
                    Err(e) => return Err(e.into()),
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { ref data }) => {
                        local_stream.write_all(data).await?;
                    }
                    Some(ChannelMsg::Eof) => {
                        if !stream_closed {
                            channel.eof().await?;
                        }
                        break;
                    }
                    Some(ChannelMsg::WindowAdjusted { .. }) => {}
                    Some(_) => {}
                    None => break,
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tunnel_manager_new() {
        let config = SshTunnelConfig {
            ssh_host: "192.168.1.100".to_string(),
            ssh_port: 22,
            ssh_user: "pi".to_string(),
            key_path: None,
            remote_host: "10.0.0.1".to_string(),
        };
        let manager = SshTunnelManager::new(config);
        assert!(!manager.is_alive());
        assert!(manager.local_ports.is_empty());
        assert_eq!(manager.local_port(4700), None);
    }
}
