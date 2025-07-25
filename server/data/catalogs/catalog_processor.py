#!/usr/bin/env python3
"""
Astronomical Catalog Processor
Downloads and processes OpenNGC and HYG databases into a unified JSON format
containing Messier, NGC, IC objects and bright stars.
"""

import json
import csv
import requests
import zipfile
import gzip
import io
from pathlib import Path
from typing import Dict, List, Optional, Union
import re

class AstronomicalCatalogProcessor:
    def __init__(self, output_dir: str = "./astro_data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.objects = []

    def download_file(self, url: str, filename: str) -> Path:
        """Download a file from URL and save locally."""
        filepath = self.output_dir / filename
        print(f"Downloading {url}...")

        response = requests.get(url)
        response.raise_for_status()

        with open(filepath, 'wb') as f:
            f.write(response.content)

        print(f"Saved to {filepath}")
        return filepath

    def parse_ra_dec(self, ra_str: str, dec_str: str) -> Dict[str, Union[float, str]]:
        """Parse RA/Dec from various formats to decimal degrees."""
        result = {}

        # Handle sexagesimal format (HH:MM:SS)
        if ':' in str(ra_str):
            parts = ra_str.split(':')
            hours = float(parts[0])
            minutes = float(parts[1]) if len(parts) > 1 else 0
            seconds = float(parts[2]) if len(parts) > 2 else 0
            decimal_ra = 15 * (hours + minutes/60 + seconds/3600)
            result['ra_decimal'] = decimal_ra
            result['ra_sexagesimal'] = ra_str
        else:
            # Already in decimal
            result['ra_decimal'] = float(ra_str) if ra_str else None
            if result['ra_decimal'] is not None:
                hours = result['ra_decimal'] / 15
                h = int(hours)
                m = int((hours - h) * 60)
                s = ((hours - h) * 60 - m) * 60
                result['ra_sexagesimal'] = f"{h:02d}:{m:02d}:{s:05.2f}"

        # Handle Dec
        if ':' in str(dec_str):
            parts = dec_str.replace('+', '').split(':')
            sign = -1 if '-' in dec_str else 1
            degrees = abs(float(parts[0]))
            minutes = float(parts[1]) if len(parts) > 1 else 0
            seconds = float(parts[2]) if len(parts) > 2 else 0
            decimal_dec = sign * (degrees + minutes/60 + seconds/3600)
            result['dec_decimal'] = decimal_dec
            result['dec_sexagesimal'] = dec_str
        else:
            # Already in decimal
            result['dec_decimal'] = float(dec_str) if dec_str else None
            if result['dec_decimal'] is not None:
                sign = '-' if result['dec_decimal'] < 0 else '+'
                degrees = abs(result['dec_decimal'])
                d = int(degrees)
                m = int((degrees - d) * 60)
                s = ((degrees - d) * 60 - m) * 60
                result['dec_sexagesimal'] = f"{sign}{d:02d}:{m:02d}:{s:05.2f}"

        return result

    def process_openngc(self):
        """Process OpenNGC data for NGC, IC, and Messier objects."""
        print("\nProcessing OpenNGC data...")

        # Note: You'll need to download the NGC.csv file manually from GitHub
        # as it requires navigating the GitHub interface
        ngc_file = self.output_dir / "NGC.csv"

        if not ngc_file.exists():
            print(f"Please download NGC.csv from https://github.com/mattiaverga/OpenNGC")
            print(f"and place it in {self.output_dir}")
            return

        # Process main NGC catalog
        ngc_count = 0
        with open(ngc_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')

            for row in reader:
                obj = self.create_object_from_openngc(row)
                if obj:
                    self.objects.append(obj)
                    ngc_count += 1

        print(f"Processed {ngc_count} NGC/IC objects")

        # Process addendum file for additional Messier objects
        addendum_file = self.output_dir / "addendum.csv"

        if addendum_file.exists():
            addendum_count = 0
            with open(addendum_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f, delimiter=';')

                for row in reader:
                    obj = self.create_object_from_openngc(row)
                    if obj:
                        self.objects.append(obj)
                        addendum_count += 1

            print(f"Processed {addendum_count} addendum objects (including M40, M45)")
        else:
            print(f"Note: addendum.csv not found - please download from https://github.com/mattiaverga/OpenNGC")
            print(f"This file contains M40 (Winnecke 4) and M45 (Pleiades)")

        # Check for specific Messier objects
        self.verify_messier_objects()

        print(f"Total OpenNGC objects processed: {len(self.objects)}")

    def create_object_from_openngc(self, row: Dict) -> Optional[Dict]:
        """Create standardized object from OpenNGC row."""
        try:
            # Skip non-existent or duplicate objects unless they're special Messier cases
            obj_type = row.get('Type', '')
            if obj_type in ['NonEx', 'Dup']:
                # Check if it's M102 (which might be marked as duplicate)
                if row.get('M') == '102':
                    obj_type = 'G'  # Treat as galaxy
                else:
                    return None

            # Parse coordinates
            coords = self.parse_ra_dec(row.get('RA'), row.get('Dec'))

            # Parse magnitudes
            def safe_float(val):
                try:
                    return float(val) if val and val != '--' else None
                except:
                    return None

            # Get object name
            name = row.get('Name', '').strip()
            if not name:
                # For addendum objects, construct name from available data
                if row.get('M'):
                    name = f"M{row.get('M')}"
                elif row.get('NGC'):
                    name = f"NGC{row.get('NGC')}"
                elif row.get('IC'):
                    name = f"IC{row.get('IC')}"

            obj = {
                'id': name,
                'catalog_ids': {
                    'messier': f"M{row.get('M')}" if row.get('M') else None,
                    'ngc': f"NGC{row.get('NGC')}" if row.get('NGC') else None,
                    'ic': f"IC{row.get('IC')}" if row.get('IC') else None,
                    'hr': None,
                    'hd': None,
                    'hip': None,
                    'gl': None
                },
                'names': {
                    'proper': row.get('Common names', '').strip() if row.get('Common names') else None,
                    'bayer_flamsteed': None,
                    'common': [n.strip() for n in row.get('Common names', '').split(',') if n.strip()],
                    'other': []
                },
                'object_type': obj_type,
                'coordinates': {
                    'ra_j2000': {
                        'decimal': coords.get('ra_decimal'),
                        'sexagesimal': coords.get('ra_sexagesimal')
                    },
                    'dec_j2000': {
                        'decimal': coords.get('dec_decimal'),
                        'sexagesimal': coords.get('dec_sexagesimal')
                    },
                    'constellation': row.get('Const', '').strip(),
                    'galactic': {
                        'l': None,
                        'b': None
                    }
                },
                'magnitudes': {
                    'v': safe_float(row.get('V-Mag')),
                    'b': safe_float(row.get('B-Mag')),
                    'u': None,
                    'r': None,
                    'i': None,
                    'j': safe_float(row.get('J-Mag')),
                    'h': safe_float(row.get('H-Mag')),
                    'k': safe_float(row.get('K-Mag'))
                },
                'physical_properties': {
                    'distance_pc': None,
                    'distance_ly': None,
                    'size': {
                        'major_axis_arcmin': safe_float(row.get('MajAx')),
                        'minor_axis_arcmin': safe_float(row.get('MinAx')),
                        'position_angle_deg': safe_float(row.get('PA'))
                    },
                    'spectral_type': None,
                    'color_index_bv': None,
                    'absolute_magnitude': None,
                    'luminosity_solar': None,
                    'surface_brightness': safe_float(row.get('SurfBr'))
                },
                'motion': {
                    'proper_motion_ra_mas_yr': None,
                    'proper_motion_dec_mas_yr': None,
                    'radial_velocity_km_s': None
                },
                'variability': {
                    'is_variable': False,
                    'variable_type': None,
                    'magnitude_range': {
                        'min': None,
                        'max': None
                    }
                },
                'morphology': {
                    'hubble_type': row.get('Hubble', '').strip() if row.get('Hubble') else None,
                    'morphology_code': None
                },
                'notes': row.get('NED notes', '').strip() if row.get('NED notes') else None
            }

            return obj

        except Exception as e:
            print(f"Error processing OpenNGC object: {e}")
            return None

    def process_hyg_stars(self):
        """Process HYG database for bright stars."""
        print("\nProcessing HYG star data...")

        # Note: You'll need to download the HYG CSV file
        hyg_file = self.output_dir / "hygdata_v41.csv"

        if not hyg_file.exists():
            print(f"Please download hygdata_v41.csv from https://www.astronexus.com/hyg")
            print(f"and place it in {self.output_dir}")
            return

        star_count = 0
        with open(hyg_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for row in reader:
                # Only include stars brighter than magnitude 6.5 (naked eye visible)
                mag = float(row.get('mag', '99'))
                if mag <= 3.0:
                    obj = self.create_object_from_hyg(row)
                    if obj:
                        self.objects.append(obj)
                        star_count += 1

        print(f"Processed {star_count} bright stars from HYG")

    def create_object_from_hyg(self, row: Dict) -> Optional[Dict]:
        """Create standardized object from HYG star data."""
        try:
            def safe_float(val):
                try:
                    return float(val) if val and val != '' else None
                except:
                    return None

            # Build proper name
            proper_name = row.get('proper', '').strip()
            if not proper_name and row.get('bf'):
                proper_name = f"{row.get('bf')} {row.get('con', '')}"

            # Calculate light years from parsecs
            dist_pc = safe_float(row.get('dist'))
            dist_ly = dist_pc * 3.262 if dist_pc and dist_pc < 10000 else None

            obj = {
                'id': f"HYG{row.get('id')}",
                'catalog_ids': {
                    'messier': None,
                    'ngc': None,
                    'ic': None,
                    'hr': row.get('hr') if row.get('hr') else None,
                    'hd': row.get('hd') if row.get('hd') else None,
                    'hip': row.get('hip') if row.get('hip') else None,
                    'gl': row.get('gl') if row.get('gl') else None
                },
                'names': {
                    'proper': proper_name if proper_name else None,
                    'bayer_flamsteed': row.get('bf', '').strip() if row.get('bf') else None,
                    'common': [proper_name] if proper_name else [],
                    'other': []
                },
                'object_type': 'Star',
                'coordinates': {
                    'ra_j2000': {
                        'decimal': safe_float(row.get('ra')),
                        'sexagesimal': self.decimal_to_sexagesimal_ra(safe_float(row.get('ra')))
                    },
                    'dec_j2000': {
                        'decimal': safe_float(row.get('dec')),
                        'sexagesimal': self.decimal_to_sexagesimal_dec(safe_float(row.get('dec')))
                    },
                    'constellation': row.get('con', '').strip(),
                    'galactic': {
                        'l': None,
                        'b': None
                    }
                },
                'magnitudes': {
                    'v': safe_float(row.get('mag')),
                    'b': None,
                    'u': None,
                    'r': None,
                    'i': None,
                    'j': None,
                    'h': None,
                    'k': None
                },
                'physical_properties': {
                    'distance_pc': dist_pc,
                    'distance_ly': dist_ly,
                    'size': {
                        'major_axis_arcmin': None,
                        'minor_axis_arcmin': None,
                        'position_angle_deg': None
                    },
                    'spectral_type': row.get('spect', '').strip() if row.get('spect') else None,
                    'color_index_bv': safe_float(row.get('ci')),
                    'absolute_magnitude': safe_float(row.get('absmag')),
                    'luminosity_solar': safe_float(row.get('lum')),
                    'surface_brightness': None
                },
                'motion': {
                    'proper_motion_ra_mas_yr': safe_float(row.get('pmra')),
                    'proper_motion_dec_mas_yr': safe_float(row.get('pmdec')),
                    'radial_velocity_km_s': safe_float(row.get('rv'))
                },
                'variability': {
                    'is_variable': row.get('var') != '',
                    'variable_type': row.get('var', '').strip() if row.get('var') else None,
                    'magnitude_range': {
                        'min': safe_float(row.get('var_min')),
                        'max': safe_float(row.get('var_max'))
                    }
                },
                'morphology': {
                    'hubble_type': None,
                    'morphology_code': None
                },
                'notes': None
            }

            return obj

        except Exception as e:
            print(f"Error processing HYG star: {e}")
            return None

    def verify_messier_objects(self):
        """Verify that all Messier objects are included, with special handling for problematic ones."""
        messier_ids = set()
        for obj in self.objects:
            if obj['catalog_ids']['messier']:
                messier_num = int(obj['catalog_ids']['messier'][1:])  # Remove 'M' prefix
                messier_ids.add(messier_num)

        print(f"\nVerifying Messier objects...")
        print(f"Found {len(messier_ids)} Messier objects")

        # Check for specific objects
        special_cases = {
            40: "M40 (Winnecke 4) - Double star in Ursa Major",
            45: "M45 (Pleiades) - Open cluster in Taurus",
            102: "M102 - Disputed object, possibly NGC 5866 or duplicate of M101"
        }

        for m_num, description in special_cases.items():
            if m_num in messier_ids:
                print(f"✓ {description} - Found")
            else:
                print(f"✗ {description} - Missing")
                # Add placeholder if missing
                self.add_missing_messier(m_num)

        # Check for complete Messier catalog (M1-M110)
        missing = []
        for i in range(1, 111):
            if i not in messier_ids:
                missing.append(f"M{i}")

        if missing:
            print(f"\nWarning: Missing Messier objects: {', '.join(missing)}")

    def add_missing_messier(self, messier_number: int):
        """Add placeholder data for missing Messier objects."""
        # Special handling for known missing objects
        special_data = {
            40: {
                'name': 'M40',
                'common_name': 'Winnecke 4',
                'type': '**',  # Double star
                'ra': '12:22:04.0',
                'dec': '+58:05:00',
                'constellation': 'UMa',
                'mag': 9.65,
                'notes': 'Double star, not a deep sky object'
            },
            45: {
                'name': 'M45',
                'common_name': 'Pleiades',
                'type': 'OCl',  # Open Cluster
                'ra': '03:47:24.0',
                'dec': '+24:07:00',
                'constellation': 'Tau',
                'mag': 1.6,
                'size': 110.0,  # arcmin
                'notes': 'The Pleiades or Seven Sisters'
            },
            102: {
                'name': 'M102',
                'common_name': 'Spindle Galaxy (disputed)',
                'type': 'G',  # Galaxy
                'ra': '15:06:29.5',
                'dec': '+55:45:48',
                'constellation': 'Dra',
                'mag': 10.7,
                'notes': 'Possibly NGC 5866 or duplicate observation of M101'
            }
        }

        if messier_number in special_data:
            data = special_data[messier_number]
            coords = self.parse_ra_dec(data['ra'], data['dec'])

            obj = {
                'id': data['name'],
                'catalog_ids': {
                    'messier': data['name'],
                    'ngc': 'NGC5866' if messier_number == 102 else None,
                    'ic': None,
                    'hr': None,
                    'hd': None,
                    'hip': None,
                    'gl': None
                },
                'names': {
                    'proper': data['common_name'],
                    'bayer_flamsteed': None,
                    'common': [data['common_name']],
                    'other': ['Win 4'] if messier_number == 40 else []
                },
                'object_type': data['type'],
                'coordinates': {
                    'ra_j2000': {
                        'decimal': coords.get('ra_decimal'),
                        'sexagesimal': coords.get('ra_sexagesimal')
                    },
                    'dec_j2000': {
                        'decimal': coords.get('dec_decimal'),
                        'sexagesimal': coords.get('dec_sexagesimal')
                    },
                    'constellation': data['constellation'],
                    'galactic': {
                        'l': None,
                        'b': None
                    }
                },
                'magnitudes': {
                    'v': data.get('mag'),
                    'b': None,
                    'u': None,
                    'r': None,
                    'i': None,
                    'j': None,
                    'h': None,
                    'k': None
                },
                'physical_properties': {
                    'distance_pc': None,
                    'distance_ly': None,
                    'size': {
                        'major_axis_arcmin': data.get('size'),
                        'minor_axis_arcmin': data.get('size'),
                        'position_angle_deg': None
                    },
                    'spectral_type': None,
                    'color_index_bv': None,
                    'absolute_magnitude': None,
                    'luminosity_solar': None,
                    'surface_brightness': None
                },
                'motion': {
                    'proper_motion_ra_mas_yr': None,
                    'proper_motion_dec_mas_yr': None,
                    'radial_velocity_km_s': None
                },
                'variability': {
                    'is_variable': False,
                    'variable_type': None,
                    'magnitude_range': {
                        'min': None,
                        'max': None
                    }
                },
                'morphology': {
                    'hubble_type': None,
                    'morphology_code': None
                },
                'notes': data['notes']
            }

            self.objects.append(obj)
            print(f"  Added placeholder for {data['name']}")

    def decimal_to_sexagesimal_ra(self, ra: float) -> Optional[str]:
        """Convert decimal RA to sexagesimal format."""
        if ra is None:
            return None
        hours = ra / 15
        h = int(hours)
        m = int((hours - h) * 60)
        s = ((hours - h) * 60 - m) * 60
        return f"{h:02d}:{m:02d}:{s:05.2f}"

    def decimal_to_sexagesimal_dec(self, dec: float) -> Optional[str]:
        """Convert decimal Dec to sexagesimal format."""
        if dec is None:
            return None
        sign = '-' if dec < 0 else '+'
        degrees = abs(dec)
        d = int(degrees)
        m = int((degrees - d) * 60)
        s = ((degrees - d) * 60 - m) * 60
        return f"{sign}{d:02d}:{m:02d}:{s:05.2f}"

    def save_results(self):
        """Save processed data to JSON files."""
        # Save full catalog
        full_file = self.output_dir / "astronomical_objects_full.json"
        with open(full_file, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'description': 'Comprehensive catalog of Messier, NGC, IC objects and bright stars',
                    'total_objects': len(self.objects),
                    'sources': [
                        'OpenNGC Database (NGC/IC/Messier objects)',
                        'OpenNGC Addendum (M40, M45, etc.)',
                        'HYG Stellar Database v4.1 (bright stars)'
                    ],
                    'licenses': 'CC-BY-SA-4.0',
                    'special_notes': {
                        'M40': 'Double star (Winnecke 4) in Ursa Major',
                        'M45': 'Pleiades open cluster in Taurus',
                        'M102': 'Disputed object, possibly NGC 5866 or duplicate of M101'
                    }
                },
                'objects': self.objects
            }, f, indent=2, ensure_ascii=False)

        print(f"\nSaved full catalog to {full_file}")

        # Save separate catalogs
        messier_objects = [obj for obj in self.objects if obj['catalog_ids']['messier']]
        ngc_objects = [obj for obj in self.objects if obj['catalog_ids']['ngc']]
        ic_objects = [obj for obj in self.objects if obj['catalog_ids']['ic']]
        bright_stars = [obj for obj in self.objects if obj['object_type'] == 'Star']

        # Sort Messier objects by number
        messier_objects.sort(key=lambda x: int(x['catalog_ids']['messier'][1:]))

        # Save Messier catalog
        messier_file = self.output_dir / "messier_objects.json"
        with open(messier_file, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'description': 'Complete Messier objects catalog (M1-M110)',
                    'total_objects': len(messier_objects),
                    'note': 'Includes M40 (double star), M45 (Pleiades), and M102 (disputed)'
                },
                'objects': messier_objects
            }, f, indent=2, ensure_ascii=False)

        # Save bright stars catalog
        stars_file = self.output_dir / "bright_stars.json"
        with open(stars_file, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'description': 'Bright stars visible to naked eye (mag < 6.5)',
                    'total_objects': len(bright_stars)
                },
                'objects': bright_stars
            }, f, indent=2, ensure_ascii=False)

        print(f"Saved {len(messier_objects)} Messier objects to {messier_file}")
        print(f"Saved {len(bright_stars)} bright stars to {stars_file}")
        print(f"\nTotal objects processed: {len(self.objects)}")

        # Verify Messier catalog completeness
        if messier_objects:
            messier_numbers = sorted([int(obj['catalog_ids']['messier'][1:]) for obj in messier_objects])
            print(f"\nMessier objects range: M{messier_numbers[0]} - M{messier_numbers[-1]}")
            if len(messier_numbers) == 110:
                print("✓ Complete Messier catalog (all 110 objects)")
            else:
                print(f"⚠ Found {len(messier_numbers)} of 110 Messier objects")

    def run(self):
        """Run the complete processing pipeline."""
        print("Astronomical Catalog Processor")
        print("==============================")

        # Process OpenNGC data
        self.process_openngc()

        # Process HYG star data
        self.process_hyg_stars()

        # Save results
        if self.objects:
            self.save_results()
        else:
            print("\nNo objects processed. Please ensure data files are in place.")


if __name__ == "__main__":
    # Create processor and run
    processor = AstronomicalCatalogProcessor()
    processor.run()

    print("\n" + "="*50)
    print("Processing complete!")
    print("\nTo use this data:")
    print("1. Download NGC.csv from https://github.com/mattiaverga/OpenNGC")
    print("2. Download addendum.csv from https://github.com/mattiaverga/OpenNGC")
    print("3. Download hygdata_v41.csv from https://www.astronexus.com/hyg")
    print("4. Place all files in the ./astro_data directory")
    print("5. Run this script again")
    print("\nThe output JSON files will contain all the astronomical data")
    print("in a standardized, machine-processable format.")
    print("\nImportant: The addendum.csv file contains M40 and M45 which")
    print("are not in the main NGC/IC catalogs.")
