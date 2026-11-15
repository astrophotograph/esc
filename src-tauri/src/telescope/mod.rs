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

/// The host's local time and IANA zone, for setting a telescope's clock at
/// connect (`ClockSync::With`). A Seestar whose clock was never set accepts a
/// goto and then fails it with 501 "mount goto failed". Local time rather than
/// UTC, because the scope schedules view plans in minutes after its own local
/// midnight.
pub fn local_clock() -> scopinator_seestar::command::params::SetTimeParams {
    use chrono::{Datelike, Timelike};
    let now = chrono::Local::now();
    scopinator_seestar::command::params::SetTimeParams {
        year: now.year(),
        mon: now.month() as i32,
        day: now.day() as i32,
        hour: now.hour() as i32,
        min: now.minute() as i32,
        sec: now.second() as i32,
        time_zone: iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".to_string()),
    }
}

/// What a goto's `AutoGoto` event means for the recorded goto error:
/// `Some(None)` clears it, `Some(Some(msg))` records a failure, `None` leaves
/// it alone. Code 253 ("aborted") is a cancel, not a failure.
fn goto_error_update(
    data: &scopinator_seestar::event::AutoGotoEventData,
) -> Option<Option<String>> {
    use scopinator_seestar::event::EventState;
    const ABORTED: i32 = 253;
    match data.state.as_ref()? {
        EventState::Fail if data.code == Some(ABORTED) => Some(None),
        EventState::Fail => {
            let text = data.error.as_deref().unwrap_or("goto failed");
            Some(Some(match data.code {
                Some(code) => format!("{text} (code {code})"),
                None => text.to_string(),
            }))
        }
        EventState::Start | EventState::Working | EventState::Complete | EventState::Cancel => {
            Some(None)
        }
        _ => None,
    }
}

/// Follow a client's events and keep `errors[telescope_id]` holding the reason
/// the last goto failed. Ends when the client shuts down.
pub fn spawn_goto_watcher(
    errors: crate::state::GotoErrors,
    telescope_id: String,
    client: &scopinator_seestar::SeestarClient,
) {
    use scopinator_seestar::event::SeestarEvent;
    use tokio::sync::broadcast::error::RecvError;
    let mut events = client.subscribe_events();
    errors.write().remove(&telescope_id);
    tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(SeestarEvent::AutoGoto(data)) => match goto_error_update(&data) {
                    Some(Some(message)) => {
                        tracing::warn!("goto failed on {}: {}", telescope_id, message);
                        errors.write().insert(telescope_id.clone(), message);
                    }
                    Some(None) => {
                        errors.write().remove(&telescope_id);
                    }
                    None => {}
                },
                Ok(_) | Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => break,
            }
        }
    });
}

/// The message shown for a `set_view_plan` response code.
pub fn view_plan_message(code: i32) -> String {
    match code {
        0 => "Plan sent successfully".to_string(),
        268 => "Stop the current view before sending a plan".to_string(),
        536 => "A plan is already running — stop it first".to_string(),
        _ => format!("Device returned error code {code}"),
    }
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

    fn auto_goto(json: serde_json::Value) -> scopinator_seestar::event::AutoGotoEventData {
        serde_json::from_value(json).unwrap()
    }

    #[test]
    fn goto_failure_is_recorded_with_its_code() {
        // As sent by an S30 (fw 9.75) whose clock was not set.
        let data = auto_goto(serde_json::json!({
            "state": "fail", "error": "mount goto failed", "code": 501
        }));
        assert_eq!(
            goto_error_update(&data),
            Some(Some("mount goto failed (code 501)".to_string()))
        );
    }

    #[test]
    fn aborted_goto_and_a_new_goto_clear_the_error() {
        let aborted = auto_goto(serde_json::json!({
            "state": "fail", "error": "aborted", "code": 253
        }));
        assert_eq!(goto_error_update(&aborted), Some(None));
        let working = auto_goto(serde_json::json!({ "state": "working" }));
        assert_eq!(goto_error_update(&working), Some(None));
    }

    #[test]
    fn view_plan_codes_have_actionable_messages() {
        assert_eq!(view_plan_message(0), "Plan sent successfully");
        assert!(view_plan_message(268).contains("Stop the current view"));
        assert!(view_plan_message(999).contains("999"));
    }

    #[test]
    fn local_clock_is_a_plausible_wall_clock_time() {
        let t = local_clock();
        assert!(t.year >= 2026 && (1..=12).contains(&t.mon) && (0..24).contains(&t.hour));
        assert!(!t.time_zone.is_empty());
    }

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
