#!/usr/bin/env python3
"""Test coordinate parsing improvements."""

from websocket_manager import WebSocketManager


def test_ra_parsing():
    """Test various RA coordinate formats."""
    manager = WebSocketManager()
    
    test_cases = [
        # Format, Expected (degrees)
        ("12h34m56s", 188.73333333333332),  # Standard HMS
        ("12h 34m 56s", 188.73333333333332),  # HMS with spaces
        ("12:34:56", 188.73333333333332),  # Colon format
        ("12 34 56", 188.73333333333332),  # Space separated
        ("12.5h", 187.5),  # Hours with decimal
        ("188.73333", 188.73333),  # Decimal degrees
        (188.73333, 188.73333),  # Numeric input
    ]
    
    print("Testing RA parsing:")
    for ra_input, expected in test_cases:
        try:
            result = manager._parse_ra_coordinate(ra_input)
            status = "✓" if abs(result - expected) < 0.001 else "✗"
            print(f"  {status} '{ra_input}' → {result:.5f}° (expected {expected:.5f}°)")
        except Exception as e:
            print(f"  ✗ '{ra_input}' → ERROR: {e}")


def test_dec_parsing():
    """Test various Dec coordinate formats."""
    manager = WebSocketManager()
    
    test_cases = [
        # Format, Expected (degrees)
        ("+45°12′34″", 45.20944444444444),  # Standard DMS with symbols
        ("-45°12′34″", -45.20944444444444),  # Negative DMS
        ("+45° 12′ 34″", 45.20944444444444),  # DMS with spaces
        ("-45° 12′ 34″", -45.20944444444444),  # Negative with spaces
        ("45:12:34", 45.20944444444444),  # Colon format
        ("-45:12:34", -45.20944444444444),  # Negative colon
        ("45 12 34", 45.20944444444444),  # Space separated
        ("-45 12 34", -45.20944444444444),  # Negative space separated
        ("45.20944", 45.20944),  # Decimal degrees
        ("-45.20944", -45.20944),  # Negative decimal
        (45.20944, 45.20944),  # Numeric input
        (-45.20944, -45.20944),  # Negative numeric
        ("45d12m34s", 45.20944444444444),  # DMS with letters
        ("+45d 12m 34s", 45.20944444444444),  # DMS with letters and spaces
    ]
    
    print("\nTesting Dec parsing:")
    for dec_input, expected in test_cases:
        try:
            result = manager._parse_dec_coordinate(dec_input)
            status = "✓" if abs(result - expected) < 0.001 else "✗"
            print(f"  {status} '{dec_input}' → {result:.5f}° (expected {expected:.5f}°)")
        except Exception as e:
            print(f"  ✗ '{dec_input}' → ERROR: {e}")


def test_problematic_formats():
    """Test formats that were causing issues."""
    manager = WebSocketManager()
    
    print("\nTesting problematic formats (that were returning 0):")
    
    # These are the formats coming from the catalog API
    problematic_cases = [
        ("12h 34m 56s", 188.73333333333332),  # RA with spaces
        ("+45° 12′ 34″", 45.20944444444444),  # Dec with spaces
        ("-23° 45′ 0″", -23.75),  # Negative Dec with spaces
        ("0h 42m 44s", 10.68333333333333),  # Small RA values (Andromeda Galaxy)
    ]
    
    for coord_input, expected in problematic_cases:
        try:
            # Determine if RA or Dec based on format
            if 'h' in str(coord_input) or ':' in str(coord_input) and '°' not in str(coord_input):
                result = manager._parse_ra_coordinate(coord_input)
            else:
                result = manager._parse_dec_coordinate(coord_input)
            
            status = "✓" if abs(result - expected) < 0.001 else "✗"
            print(f"  {status} '{coord_input}' → {result:.5f}° (expected {expected:.5f}°)")
        except Exception as e:
            print(f"  ✗ '{coord_input}' → ERROR: {e}")


if __name__ == "__main__":
    test_ra_parsing()
    test_dec_parsing()
    test_problematic_formats()
    
    print("\n✨ Coordinate parsing tests complete!")