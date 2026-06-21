//! End-to-end replay tests.
//!
//! These stand up a localhost mock telescope ([`common::ReplayServer`]) that
//! answers a real `scopinator_seestar::SeestarClient` with the *recorded*
//! responses and async events from captured Seestar sessions, then drive esc's
//! own status-mapping logic over the result. This exercises the full path the
//! desktop/web app uses — connect, command/response correlation, event
//! delivery, and `parse_status_from_results` — against traffic that actually
//! occurred on the wire, and guards the scopinator 0.2.x upgrade against drift.

mod common;

use std::net::Ipv4Addr;
use std::time::Duration;

use common::{load_all_sessions, load_session, session_names, ReplayServer, Session};

use scopinator_seestar::command::Command;
use scopinator_seestar::response::DeviceStateResult;
use scopinator_seestar::{SeestarClient, SeestarConfig};

const LOCALHOST: Ipv4Addr = Ipv4Addr::new(127, 0, 0, 1);

/// Connect a real SeestarClient to the mock and wait until the control link is up.
async fn connect(server: &ReplayServer) -> SeestarClient {
    let config = SeestarConfig {
        interop_key: None,
        response_timeout: Some(Duration::from_secs(2)),
    };
    let client = SeestarClient::connect_with_ports_and_config(
        LOCALHOST,
        server.control_addr,
        server.imaging_addr,
        config,
    )
    .await
    .expect("client should connect to the replay mock");
    client
        .wait_for_connection(Duration::from_secs(2))
        .await
        .expect("control link should come up");
    client
}

#[tokio::test]
async fn connects_to_every_replayed_session() {
    let sessions = load_all_sessions();
    assert!(!sessions.is_empty(), "no vendored sessions found");
    for session in &sessions {
        let server = ReplayServer::start(session).await;
        let _client = connect(&server).await;
    }
}

#[tokio::test]
async fn get_device_state_round_trips_with_recorded_firmware() {
    for name in session_names() {
        let session = load_session(&name);

        // The firmware the client should observe is whatever the session recorded.
        let recorded = session
            .response_for("get_device_state")
            .unwrap_or_else(|| panic!("{name}: session has no get_device_state response"));
        let expected_fw = recorded["result"]["device"]["firmware_ver_int"].as_u64();
        assert!(expected_fw.is_some(), "{name}: recorded fw missing");

        let server = ReplayServer::start(&session).await;
        let client = connect(&server).await;

        let resp = client
            .send_command(Command::GetDeviceState)
            .await
            .unwrap_or_else(|e| panic!("{name}: get_device_state send failed: {e}"));
        assert!(resp.is_success(), "{name}: non-zero code {}", resp.code);

        let result = resp.result.unwrap_or_else(|| panic!("{name}: empty result"));
        let ds: DeviceStateResult = serde_json::from_value(result)
            .unwrap_or_else(|e| panic!("{name}: DeviceStateResult parse failed: {e}"));
        let device = ds.device.unwrap_or_else(|| panic!("{name}: missing device info"));

        assert_eq!(
            device.firmware_ver_int.map(|v| v as u64),
            expected_fw,
            "{name}: firmware mismatch over the wire"
        );
        assert!(device.product_model.is_some(), "{name}: missing product_model");

        // The mock should have actually received our command.
        let received = server.received();
        assert!(
            received
                .iter()
                .any(|m| m.get("method").and_then(|v| v.as_str()) == Some("get_device_state")),
            "{name}: mock never saw get_device_state"
        );
    }
}

#[tokio::test]
async fn recorded_events_replay_to_subscribers() {
    for name in session_names() {
        let session = load_session(&name);
        let expected = session.events().len();
        if expected == 0 {
            continue;
        }

        let server = ReplayServer::start(&session).await;
        // Subscribe BEFORE the server pushes events (it waits ~80ms post-connect)
        // so the broadcast receiver can't miss the burst.
        let config = SeestarConfig {
            interop_key: None,
            response_timeout: Some(Duration::from_secs(2)),
        };
        let client = SeestarClient::connect_with_ports_and_config(
            LOCALHOST,
            server.control_addr,
            server.imaging_addr,
            config,
        )
        .await
        .expect("connect");
        let mut events = client.subscribe_events();
        client
            .wait_for_connection(Duration::from_secs(2))
            .await
            .expect("control up");

        let mut received = 0usize;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        while received < expected && tokio::time::Instant::now() < deadline {
            match tokio::time::timeout(Duration::from_millis(400), events.recv()).await {
                Ok(Ok(_event)) => received += 1,
                Ok(Err(_)) => break, // channel closed
                Err(_) => break,     // idle timeout — no more events coming
            }
        }

        // The corpus is curated to contain no Unknown events, so every recorded
        // event should classify and reach the subscriber.
        assert_eq!(
            received, expected,
            "{name}: replayed {received} of {expected} recorded events"
        );
    }
}

/// End-to-end: recorded device state → live client → esc's status mapping.
#[tokio::test]
async fn esc_status_mapping_over_live_replay() {
    for name in session_names() {
        let session = load_session(&name);
        let expected_focus = session
            .response_for("get_device_state")
            .and_then(|r| r["result"]["focuser"]["step"].as_i64())
            .map(|v| v as i32);

        let server = ReplayServer::start(&session).await;
        let client = connect(&server).await;

        let device = client.send_command(Command::GetDeviceState).await.ok();
        let coord = client.send_command(Command::ScopeGetEquCoord).await.ok();
        let view = client.send_command(Command::GetViewState).await.ok();

        let device_val = device.and_then(|r| r.result);
        let coord_val = coord.and_then(|r| r.result);
        let view_val = view.and_then(|r| r.result);

        let status = eesc_lib::telescope::status::parse_status_from_results(
            true,
            device_val.as_ref(),
            coord_val.as_ref(),
            view_val.as_ref(),
        );

        assert!(status.connected, "{name}: status should be connected");
        assert!(
            status.mount_type.is_some(),
            "{name}: mount info should map from recorded device state"
        );
        assert_eq!(
            status.focus_position, expected_focus,
            "{name}: focuser step should map through to status"
        );
    }
}

/// Pure-parse guard: every recorded telescope message must classify cleanly,
/// mirroring scopinator's own corpus test but through esc's pinned dependency.
#[test]
fn every_recorded_response_parses_as_command_response() {
    use scopinator_seestar::response::CommandResponse;
    let mut total = 0usize;
    for session in load_all_sessions() {
        for resp in session.responses() {
            serde_json::from_value::<CommandResponse>(resp.clone())
                .unwrap_or_else(|e| panic!("{}: response parse failed: {e}\n{resp}", session.name));
            total += 1;
        }
    }
    assert!(total > 0, "corpus produced no responses");
}

// Silence unused-import warnings if a helper is only used in some configs.
#[allow(dead_code)]
fn _assert_session_type(_: &Session) {}
