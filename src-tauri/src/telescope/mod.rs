// Telescope control module
// Handles telescope connection, mount control, and status monitoring

use std::net::Ipv4Addr;

pub mod commands;
pub mod discovery;
pub mod status;

pub use commands::*;
pub use discovery::*;
pub use status::*;

/// Resolve a user-supplied host — either an IPv4 literal (e.g. `192.168.1.50`)
/// or a DNS hostname (e.g. `seestar-proxy.local`) — to an [`Ipv4Addr`].
///
/// The Seestar client speaks IPv4 only, so any IPv6 results are skipped. This
/// lets a "direct" connection target a remote seestar-proxy by name as well as
/// by address.
pub async fn resolve_ipv4(host: &str) -> Result<Ipv4Addr, String> {
    // Fast path: already an IPv4 literal.
    if let Ok(ip) = host.parse::<Ipv4Addr>() {
        return Ok(ip);
    }

    // Otherwise resolve via DNS. The port is irrelevant to resolution, so use 0.
    let mut addrs = tokio::net::lookup_host((host, 0u16))
        .await
        .map_err(|e| format!("Could not resolve host '{host}': {e}"))?;
    addrs
        .find_map(|addr| match addr {
            std::net::SocketAddr::V4(v4) => Some(*v4.ip()),
            std::net::SocketAddr::V6(_) => None,
        })
        .ok_or_else(|| format!("No IPv4 address found for host '{host}'"))
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn ipv4_literal_passes_through() {
        assert_eq!(
            resolve_ipv4("192.168.1.50").await.unwrap(),
            Ipv4Addr::new(192, 168, 1, 50)
        );
        assert_eq!(resolve_ipv4("127.0.0.1").await.unwrap(), Ipv4Addr::LOCALHOST);
    }

    #[tokio::test]
    async fn unresolvable_host_errors() {
        // The `.invalid` TLD (RFC 6761) is guaranteed never to resolve.
        assert!(resolve_ipv4("nonexistent.invalid").await.is_err());
    }
}
