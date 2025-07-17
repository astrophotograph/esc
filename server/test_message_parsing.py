#!/usr/bin/env python3
"""Test script for telescope message parsing functionality."""

import json
from datetime import datetime
from smarttel.seestar.commands.responses import (
    TelescopeMessageParser,
    MessageAnalytics,
    ParsedCommand,
    ParsedResponse,
    ParsedEvent,
    TimeResponse,
    DeviceStateResponse,
)


def test_parse_command():
    """Test parsing command messages."""
    print("🧪 Testing Command Parsing...")

    command_message = json.dumps({"id": 100, "method": "pi_get_time"})

    parsed = TelescopeMessageParser.parse_message(
        command_message, datetime.now().isoformat()
    )

    assert isinstance(parsed, ParsedCommand)
    assert parsed.method == "pi_get_time"
    assert parsed.command_id == 100
    assert parsed.parse_success is True

    print("✅ Command parsing successful")


def test_parse_response():
    """Test parsing response messages."""
    print("🧪 Testing Response Parsing...")

    response_message = json.dumps(
        {
            "id": 100,
            "jsonrpc": "2.0",
            "Timestamp": "2025-07-14T17:04:11.404446",
            "method": "pi_get_time",
            "code": 0,
            "result": {
                "year": 2024,
                "mon": 7,
                "day": 14,
                "hour": 18,
                "min": 30,
                "sec": 45,
                "time_zone": "UTC",
            },
        }
    )

    parsed = TelescopeMessageParser.parse_message(
        response_message, datetime.now().isoformat()
    )

    assert isinstance(parsed, ParsedResponse)
    assert parsed.method == "pi_get_time"
    assert parsed.response_id == 100
    assert parsed.code == 0
    assert parsed.result is not None
    assert parsed.parse_success is True

    print("✅ Response parsing successful")


def test_parse_event():
    """Test parsing event messages."""
    print("🧪 Testing Event Parsing...")

    event_message = json.dumps(
        {
            "Event": "PiStatus",
            "Timestamp": "2025-07-14T17:04:11.404487",
            "temp": 42.8,
            "charger_status": "Charging",
            "charge_online": True,
            "battery_capacity": 86,
        }
    )

    parsed = TelescopeMessageParser.parse_message(
        event_message, datetime.now().isoformat()
    )

    assert isinstance(parsed, ParsedEvent)
    assert parsed.event_type == "PiStatus"
    assert parsed.event_data["temp"] == 42.8
    assert parsed.parse_success is True

    print("✅ Event parsing successful")


def test_enhanced_response():
    """Test enhanced response parsing."""
    print("🧪 Testing Enhanced Response Parsing...")

    # Test time response
    time_response_data = {
        "id": 100,
        "jsonrpc": "2.0",
        "Timestamp": "2025-07-14T17:04:11.404446",
        "method": "pi_get_time",
        "code": 0,
        "result": {
            "year": 2024,
            "mon": 7,
            "day": 14,
            "hour": 18,
            "min": 30,
            "sec": 45,
            "time_zone": "UTC",
        },
    }

    enhanced_response = TelescopeMessageParser.create_enhanced_response(
        time_response_data
    )
    assert isinstance(enhanced_response, TimeResponse)

    parsed_time = enhanced_response.get_parsed_time()
    assert parsed_time is not None
    assert parsed_time.year == 2024
    assert parsed_time.time_zone == "UTC"

    print("✅ Enhanced response parsing successful")


def test_message_analytics():
    """Test message analytics functionality."""
    print("🧪 Testing Message Analytics...")

    sample_messages = [
        {
            "timestamp": "2025-07-14T17:04:10.000000",
            "direction": "sent",
            "message": json.dumps({"id": 100, "method": "pi_get_time"}),
        },
        {
            "timestamp": "2025-07-14T17:04:11.000000",
            "direction": "received",
            "message": json.dumps(
                {
                    "id": 100,
                    "jsonrpc": "2.0",
                    "method": "pi_get_time",
                    "code": 0,
                    "result": {"year": 2024},
                }
            ),
        },
        {
            "timestamp": "2025-07-14T17:04:12.000000",
            "direction": "received",
            "message": json.dumps({"Event": "PiStatus", "temp": 42.8}),
        },
    ]

    analytics = MessageAnalytics.analyze_message_history(sample_messages)

    assert analytics["total_messages"] == 3
    assert analytics["sent_count"] == 1
    assert analytics["received_count"] == 2
    assert "pi_get_time" in analytics["commands"]
    assert "PiStatus" in analytics["events"]
    assert len(analytics["most_common_commands"]) > 0

    print("✅ Message analytics successful")


def test_invalid_json():
    """Test handling of invalid JSON."""
    print("🧪 Testing Invalid JSON Handling...")

    invalid_message = "{ invalid json }"
    parsed = TelescopeMessageParser.parse_message(
        invalid_message, datetime.now().isoformat()
    )

    assert parsed.parse_success is False
    assert parsed.parse_error is not None
    assert parsed.parse_error.error_type == "JSON_DECODE_ERROR"

    print("✅ Invalid JSON handling successful")


def run_all_tests():
    """Run all parsing tests."""
    print("🚀 Starting Telescope Message Parsing Tests\n")

    try:
        test_parse_command()
        test_parse_response()
        test_parse_event()
        test_enhanced_response()
        test_message_analytics()
        test_invalid_json()

        print("\n🎉 All tests passed successfully!")
        return True
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
