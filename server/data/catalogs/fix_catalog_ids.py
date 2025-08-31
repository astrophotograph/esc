#!/usr/bin/env python3
"""
Fix missing catalog_ids in the astronomical objects catalog.
This script:
1. Ensures NGC/IC objects have their catalog_ids properly populated
2. Adds cross-references for objects in multiple catalogs (e.g., M31 = NGC 224)
3. Ensures completeness of LDN and Barnard catalogs
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional

# Known cross-references between catalogs
MESSIER_NGC_MAPPING = {
    "M1": "NGC1952", "M2": "NGC7089", "M3": "NGC5272", "M4": "NGC6121", "M5": "NGC5904",
    "M6": "NGC6405", "M7": "NGC6475", "M8": "NGC6523", "M9": "NGC6333", "M10": "NGC6254",
    "M11": "NGC6705", "M12": "NGC6218", "M13": "NGC6205", "M14": "NGC6402", "M15": "NGC7078",
    "M16": "NGC6611", "M17": "NGC6618", "M18": "NGC6613", "M19": "NGC6273", "M20": "NGC6514",
    "M21": "NGC6531", "M22": "NGC6656", "M23": "NGC6494", "M25": "IC4725", "M26": "NGC6694",
    "M27": "NGC6853", "M28": "NGC6626", "M29": "NGC6913", "M30": "NGC7099", "M31": "NGC224",
    "M32": "NGC221", "M33": "NGC598", "M34": "NGC1039", "M35": "NGC2168", "M36": "NGC1960",
    "M37": "NGC2099", "M38": "NGC1912", "M39": "NGC7092", "M41": "NGC2287", "M42": "NGC1976",
    "M43": "NGC1982", "M44": "NGC2632", "M46": "NGC2437", "M47": "NGC2422", "M48": "NGC2548",
    "M49": "NGC4472", "M50": "NGC2323", "M51": "NGC5194", "M52": "NGC7654", "M53": "NGC5024",
    "M54": "NGC6715", "M55": "NGC6809", "M56": "NGC6779", "M57": "NGC6720", "M58": "NGC4579",
    "M59": "NGC4621", "M60": "NGC4649", "M61": "NGC4303", "M62": "NGC6266", "M63": "NGC5055",
    "M64": "NGC4826", "M65": "NGC3623", "M66": "NGC3627", "M67": "NGC2682", "M68": "NGC4590",
    "M69": "NGC6637", "M70": "NGC6681", "M71": "NGC6838", "M72": "NGC6981", "M73": "NGC6994",
    "M74": "NGC628", "M75": "NGC6864", "M76": "NGC650", "M77": "NGC1068", "M78": "NGC2068",
    "M79": "NGC1904", "M80": "NGC6093", "M81": "NGC3031", "M82": "NGC3034", "M83": "NGC5236",
    "M84": "NGC4374", "M85": "NGC4382", "M86": "NGC4406", "M87": "NGC4486", "M88": "NGC4501",
    "M89": "NGC4552", "M90": "NGC4569", "M91": "NGC4548", "M92": "NGC6341", "M93": "NGC2447",
    "M94": "NGC4736", "M95": "NGC3351", "M96": "NGC3368", "M97": "NGC3587", "M98": "NGC4192",
    "M99": "NGC4254", "M100": "NGC4321", "M101": "NGC5457", "M102": "NGC5866",
    "M103": "NGC581", "M104": "NGC4594", "M105": "NGC3379", "M106": "NGC4258",
    "M107": "NGC6171", "M108": "NGC3556", "M109": "NGC3992", "M110": "NGC205",
}

# Some NGC objects are also in IC catalog
NGC_IC_MAPPING = {
    "NGC6611": "IC4703",  # M16 Eagle Nebula region
    "NGC5194": "IC5195",  # M51 companion galaxy
}

def fix_catalog_ids(catalog_path: str):
    """Fix missing catalog_ids in the astronomical catalog."""
    
    print(f"Loading catalog from {catalog_path}...")
    with open(catalog_path, 'r') as f:
        data = json.load(f)
    
    objects = data['objects']
    print(f"Processing {len(objects)} objects...")
    
    # Create lookup dictionaries for cross-referencing
    objects_by_id = {obj['id']: obj for obj in objects}
    
    # Statistics
    stats = {
        'ngc_fixed': 0,
        'ic_fixed': 0,
        'messier_cross_refs': 0,
        'ngc_ic_cross_refs': 0,
        'barnard_fixed': 0,
        'ldn_fixed': 0,
        'total_fixed': 0
    }
    
    for obj in objects:
        obj_id = obj['id']
        catalog_ids = obj['catalog_ids']
        
        # Fix NGC objects
        if obj_id.startswith('NGC'):
            # Extract NGC number
            ngc_match = re.match(r'NGC(\d+)', obj_id)
            if ngc_match:
                ngc_num = ngc_match.group(1)
                if not catalog_ids.get('ngc'):
                    catalog_ids['ngc'] = f"NGC{ngc_num}"
                    stats['ngc_fixed'] += 1
                    stats['total_fixed'] += 1
                
                # Check for Messier cross-reference
                for m_id, ngc_id in MESSIER_NGC_MAPPING.items():
                    if ngc_id == f"NGC{ngc_num}" or ngc_id == f"NGC{int(ngc_num)}":
                        if not catalog_ids.get('messier'):
                            catalog_ids['messier'] = m_id
                            stats['messier_cross_refs'] += 1
                            stats['total_fixed'] += 1
                
                # Check for IC cross-reference
                full_ngc_id = f"NGC{ngc_num}"
                if full_ngc_id in NGC_IC_MAPPING and not catalog_ids.get('ic'):
                    catalog_ids['ic'] = NGC_IC_MAPPING[full_ngc_id]
                    stats['ngc_ic_cross_refs'] += 1
                    stats['total_fixed'] += 1
        
        # Fix IC objects
        elif obj_id.startswith('IC'):
            # Extract IC number
            ic_match = re.match(r'IC(\d+)', obj_id)
            if ic_match:
                ic_num = ic_match.group(1)
                if not catalog_ids.get('ic'):
                    catalog_ids['ic'] = f"IC{ic_num}"
                    stats['ic_fixed'] += 1
                    stats['total_fixed'] += 1
                
                # Check for Messier cross-reference (e.g., M25 = IC4725)
                for m_id, cat_id in MESSIER_NGC_MAPPING.items():
                    if cat_id == f"IC{ic_num}" or cat_id == f"IC{int(ic_num)}":
                        if not catalog_ids.get('messier'):
                            catalog_ids['messier'] = m_id
                            stats['messier_cross_refs'] += 1
                            stats['total_fixed'] += 1
        
        # Fix Barnard objects
        elif obj_id.startswith('B'):
            # Barnard objects should have their ID in a custom field
            if 'barnard' not in catalog_ids:
                catalog_ids['barnard'] = obj_id
                stats['barnard_fixed'] += 1
                stats['total_fixed'] += 1
        
        # Fix LDN objects
        elif obj_id.startswith('LDN'):
            if 'ldn' not in catalog_ids:
                catalog_ids['ldn'] = obj_id
                stats['ldn_fixed'] += 1
                stats['total_fixed'] += 1
        
        # Fix LBN objects  
        elif obj_id.startswith('LBN'):
            if 'lbn' not in catalog_ids:
                catalog_ids['lbn'] = obj_id
                stats['total_fixed'] += 1
        
        # Fix Sharpless objects
        elif obj_id.startswith('Sh2'):
            if 'sharpless' not in catalog_ids:
                catalog_ids['sharpless'] = obj_id
                stats['total_fixed'] += 1
    
    # Add reverse cross-references for Messier objects
    for obj in objects:
        if obj['id'].startswith('M'):
            m_match = re.match(r'M(\d+)', obj['id'])
            if m_match:
                m_num = m_match.group(1)
                m_id = f"M{m_num}"
                
                # Add NGC/IC reference
                if m_id in MESSIER_NGC_MAPPING:
                    other_id = MESSIER_NGC_MAPPING[m_id]
                    if other_id.startswith('NGC'):
                        if not obj['catalog_ids'].get('ngc'):
                            obj['catalog_ids']['ngc'] = other_id
                            stats['messier_cross_refs'] += 1
                            stats['total_fixed'] += 1
                    elif other_id.startswith('IC'):
                        if not obj['catalog_ids'].get('ic'):
                            obj['catalog_ids']['ic'] = other_id
                            stats['messier_cross_refs'] += 1
                            stats['total_fixed'] += 1
    
    # Save the fixed catalog
    output_path = catalog_path.replace('.json', '_fixed.json')
    print(f"\nSaving fixed catalog to {output_path}...")
    
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Print statistics
    print("\n=== Fix Statistics ===")
    print(f"NGC objects fixed: {stats['ngc_fixed']}")
    print(f"IC objects fixed: {stats['ic_fixed']}")
    print(f"Messier cross-references added: {stats['messier_cross_refs']}")
    print(f"NGC-IC cross-references added: {stats['ngc_ic_cross_refs']}")
    print(f"Barnard objects fixed: {stats['barnard_fixed']}")
    print(f"LDN objects fixed: {stats['ldn_fixed']}")
    print(f"Total fixes applied: {stats['total_fixed']}")
    
    # Verify the fixes
    print("\n=== Verification ===")
    verify_catalog(output_path)
    
    return output_path

def verify_catalog(catalog_path: str):
    """Verify the catalog has proper catalog_ids."""
    
    with open(catalog_path, 'r') as f:
        data = json.load(f)
    
    objects = data['objects']
    
    # Count objects with catalog_ids
    ngc_with_id = 0
    ic_with_id = 0
    messier_with_ngc = 0
    
    ngc_total = 0
    ic_total = 0
    messier_total = 0
    
    for obj in objects:
        obj_id = obj['id']
        catalog_ids = obj['catalog_ids']
        
        if obj_id.startswith('NGC'):
            ngc_total += 1
            if catalog_ids.get('ngc'):
                ngc_with_id += 1
        
        elif obj_id.startswith('IC'):
            ic_total += 1
            if catalog_ids.get('ic'):
                ic_with_id += 1
        
        elif obj_id.startswith('M'):
            messier_total += 1
            if catalog_ids.get('ngc') or catalog_ids.get('ic'):
                messier_with_ngc += 1
    
    print(f"NGC objects: {ngc_with_id}/{ngc_total} have catalog_ids.ngc ({100*ngc_with_id/ngc_total if ngc_total else 0:.1f}%)")
    print(f"IC objects: {ic_with_id}/{ic_total} have catalog_ids.ic ({100*ic_with_id/ic_total if ic_total else 0:.1f}%)")
    print(f"Messier objects: {messier_with_ngc}/{messier_total} have NGC/IC references ({100*messier_with_ngc/messier_total if messier_total else 0:.1f}%)")

if __name__ == "__main__":
    catalog_path = "astronomical_objects_full.json"
    
    if not Path(catalog_path).exists():
        print(f"Error: {catalog_path} not found!")
        print("Please run this script in the astro_data directory")
        exit(1)
    
    fixed_path = fix_catalog_ids(catalog_path)
    print(f"\nFixed catalog saved to: {fixed_path}")
    print("\nTo replace the original catalog, run:")
    print(f"  mv {fixed_path} {catalog_path}")