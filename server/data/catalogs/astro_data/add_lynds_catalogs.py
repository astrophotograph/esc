#!/usr/bin/env python3
"""
Add Lynds Dark Nebula (LDN) and Lynds Bright Nebula (LBN) catalogs
to the astronomical objects catalog.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Union

def parse_ldn_line(line: str) -> Optional[Dict]:
    """Parse a line from the LDN catalog."""
    try:
        # Parse fixed-width format based on ReadMe
        ldn_num = line[0:4].strip()
        if not ldn_num:
            return None
            
        ra_h = int(line[5:7])
        ra_m = float(line[8:12])
        
        dec_sign = line[15:16]
        dec_d = int(line[16:18])
        dec_m = int(line[19:21])
        
        glon = float(line[22:28])
        glat = float(line[29:35])
        
        area = float(line[36:43]) if line[36:43].strip() else 0.0
        opacity = int(line[44:45]) if line[44:45].strip() else 0
        
        # Convert RA/Dec from 1950 to decimal degrees
        ra_decimal = 15 * (ra_h + ra_m/60)
        dec_decimal = (1 if dec_sign != '-' else -1) * (dec_d + dec_m/60)
        
        # Format sexagesimal
        ra_sexagesimal = f"{ra_h:02d}:{int(ra_m):02d}:{(ra_m % 1) * 60:04.1f}"
        dec_sexagesimal = f"{dec_sign}{dec_d:02d}:{dec_m:02d}:00"
        
        # Get Barnard cross-references if present
        barnard_refs = []
        if len(line) > 60:
            barn_str = line[60:].strip()
            if barn_str:
                # Split by spaces and clean up
                barnard_refs = [b.strip() for b in barn_str.split() if b.strip()]
        
        obj = {
            "id": f"LDN{ldn_num}",
            "names": {
                "proper": f"Lynds Dark Nebula {ldn_num}",
                "bayer_flamsteed": None,
                "common": [],
                "other": [f"LDN {ldn_num}"]
            },
            "object_type": "DrkN",
            "coordinates": {
                "ra_j2000": {
                    "decimal": ra_decimal,
                    "sexagesimal": ra_sexagesimal
                },
                "dec_j2000": {
                    "decimal": dec_decimal,
                    "sexagesimal": dec_sexagesimal
                },
                "galactic": {
                    "longitude": glon,
                    "latitude": glat
                }
            },
            "catalog_ids": {
                "ldn": f"LDN{ldn_num}",
                "messier": None,
                "ngc": None,
                "ic": None,
                "hr": None,
                "hd": None,
                "hip": None,
                "gl": None
            },
            "properties": {
                "area_sq_deg": area,
                "opacity": opacity
            }
        }
        
        # Add Barnard cross-references if any
        if barnard_refs:
            obj["catalog_ids"]["barnard"] = barnard_refs[0] if len(barnard_refs) == 1 else barnard_refs
            
        return obj
        
    except (ValueError, IndexError) as e:
        print(f"Error parsing LDN line: {e}")
        return None

def parse_lbn_line(line: str) -> Optional[Dict]:
    """Parse a line from the LBN catalog."""
    try:
        # Parse fixed-width format based on ReadMe
        seq_num = int(line[1:5])
        glon = float(line[6:12])
        glat = float(line[13:19])
        
        ra_h = int(line[20:22])
        ra_m = int(line[23:25])
        
        dec_sign = line[27:28]
        dec_d = int(line[28:30])
        dec_m = int(line[31:33])
        
        diam1 = int(line[35:39]) if line[35:39].strip() else 0
        diam2 = int(line[40:43]) if line[40:43].strip() else 0
        area = float(line[44:51]) if line[44:51].strip() else 0.0
        
        color = int(line[52:53]) if line[52:53].strip() else 0
        brightness = int(line[54:55]) if line[54:55].strip() else 0
        
        # Other names (NGC, IC, Sharpless, etc.)
        other_name = line[60:68].strip() if len(line) > 60 else ""
        
        # Convert RA/Dec from 1950 to decimal degrees
        ra_decimal = 15 * (ra_h + ra_m/60)
        dec_decimal = (1 if dec_sign != '-' else -1) * (dec_d + dec_m/60)
        
        # Format sexagesimal
        ra_sexagesimal = f"{ra_h:02d}:{ra_m:02d}:00"
        dec_sexagesimal = f"{dec_sign}{dec_d:02d}:{dec_m:02d}:00"
        
        obj = {
            "id": f"LBN{seq_num}",
            "names": {
                "proper": f"Lynds Bright Nebula {seq_num}",
                "bayer_flamsteed": None,
                "common": [],
                "other": [f"LBN {seq_num}"]
            },
            "object_type": "BrtN",
            "coordinates": {
                "ra_j2000": {
                    "decimal": ra_decimal,
                    "sexagesimal": ra_sexagesimal
                },
                "dec_j2000": {
                    "decimal": dec_decimal,
                    "sexagesimal": dec_sexagesimal
                },
                "galactic": {
                    "longitude": glon,
                    "latitude": glat
                }
            },
            "catalog_ids": {
                "lbn": f"LBN{seq_num}",
                "messier": None,
                "ngc": None,
                "ic": None,
                "hr": None,
                "hd": None,
                "hip": None,
                "gl": None
            },
            "properties": {
                "dimensions_arcmin": [diam1, diam2],
                "area_sq_deg": area,
                "color_index": color,
                "brightness": brightness
            }
        }
        
        # Parse other names for cross-references
        if other_name:
            if other_name.startswith('NGC'):
                obj["catalog_ids"]["ngc"] = other_name.replace(' ', '')
            elif other_name.startswith('IC'):
                obj["catalog_ids"]["ic"] = other_name.replace(' ', '')
            elif other_name.startswith('S '):
                obj["catalog_ids"]["sharpless"] = f"Sh2-{other_name[2:].strip()}"
                
        return obj
        
    except (ValueError, IndexError) as e:
        print(f"Error parsing LBN line: {e}")
        return None

def process_lynds_catalogs():
    """Process both LDN and LBN catalogs and add to astronomical catalog."""
    
    # Load existing catalog
    catalog_path = "astronomical_objects_full.json"
    print(f"Loading existing catalog from {catalog_path}...")
    
    with open(catalog_path, 'r') as f:
        data = json.load(f)
    
    existing_objects = data['objects']
    print(f"Existing catalog has {len(existing_objects)} objects")
    
    # Create lookup of existing objects by ID
    existing_ids = {obj['id'] for obj in existing_objects}
    
    # Track statistics
    stats = {
        'ldn_added': 0,
        'ldn_skipped': 0,
        'lbn_added': 0,
        'lbn_skipped': 0
    }
    
    # Process LDN catalog
    ldn_file = "ldn_catalog.dat"
    if Path(ldn_file).exists():
        print(f"\nProcessing LDN catalog from {ldn_file}...")
        with open(ldn_file, 'r') as f:
            for line in f:
                if len(line.strip()) < 40:
                    continue
                    
                obj = parse_ldn_line(line)
                if obj:
                    if obj['id'] not in existing_ids:
                        existing_objects.append(obj)
                        existing_ids.add(obj['id'])
                        stats['ldn_added'] += 1
                    else:
                        stats['ldn_skipped'] += 1
    else:
        print(f"LDN catalog file {ldn_file} not found")
    
    # Process LBN catalog
    lbn_file = "lbn_catalog.dat"
    if Path(lbn_file).exists():
        print(f"\nProcessing LBN catalog from {lbn_file}...")
        with open(lbn_file, 'r') as f:
            for line in f:
                if len(line.strip()) < 40:
                    continue
                    
                obj = parse_lbn_line(line)
                if obj:
                    if obj['id'] not in existing_ids:
                        existing_objects.append(obj)
                        existing_ids.add(obj['id'])
                        stats['lbn_added'] += 1
                    else:
                        stats['lbn_skipped'] += 1
    else:
        print(f"LBN catalog file {lbn_file} not found")
    
    # Update the catalog data
    data['objects'] = existing_objects
    
    # Save updated catalog
    output_path = "astronomical_objects_full_with_lynds.json"
    print(f"\nSaving updated catalog to {output_path}...")
    
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Print statistics
    print("\n=== Statistics ===")
    print(f"LDN objects added: {stats['ldn_added']}")
    print(f"LDN objects skipped (already exist): {stats['ldn_skipped']}")
    print(f"LBN objects added: {stats['lbn_added']}")
    print(f"LBN objects skipped (already exist): {stats['lbn_skipped']}")
    print(f"Total objects in updated catalog: {len(existing_objects)}")
    
    # Verify the additions
    print("\n=== Verification ===")
    ldn_total = sum(1 for o in existing_objects if o['id'].startswith('LDN'))
    lbn_total = sum(1 for o in existing_objects if o['id'].startswith('LBN'))
    print(f"Total LDN objects: {ldn_total}")
    print(f"Total LBN objects: {lbn_total}")
    
    return output_path

if __name__ == "__main__":
    updated_path = process_lynds_catalogs()
    print(f"\nUpdated catalog saved to: {updated_path}")
    print("\nTo replace the original catalog, run:")
    print(f"  mv {updated_path} astronomical_objects_full.json")