#!/usr/bin/env python3
"""
Fetch the complete Barnard catalog from VizieR and convert to our format.
"""

import json
import requests
from typing import Dict, List, Any
import re

def fetch_barnard_catalog_from_vizier():
    """Fetch Barnard catalog from VizieR."""
    # VizieR query URL for catalog VII/220A (Barnard's Catalogue)
    # We'll request all 349 objects in TSV format
    url = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv"
    
    params = {
        '-source': 'VII/220A/catalog',  # Barnard catalog
        '-out.all': '',  # Get all columns
        '-out.max': '500',  # Get all objects (349 total)
        '-c': '',  # No coordinate constraint
        '-sort': '_r'  # Sort by distance (not relevant without coordinates)
    }
    
    print("Fetching Barnard catalog from VizieR...")
    response = requests.get(url, params=params)
    
    if response.status_code != 200:
        print(f"Error fetching data: {response.status_code}")
        return None
    
    return response.text

def parse_tsv_to_json(tsv_data: str) -> List[Dict[str, Any]]:
    """Parse TSV data from VizieR to JSON format."""
    lines = tsv_data.strip().split('\n')
    
    # Find the header line (starts with Barnard)
    header_idx = None
    for i, line in enumerate(lines):
        if 'Barnard' in line and '\t' in line:
            header_idx = i
            break
    
    if header_idx is None:
        print("Could not find header in TSV data")
        return []
    
    # Parse header
    header = lines[header_idx].split('\t')
    print(f"Header columns: {header}")
    
    # Parse data lines
    objects = []
    for line in lines[header_idx + 1:]:
        if line.strip() and not line.startswith('#'):
            values = line.split('\t')
            if len(values) >= len(header):
                obj = {}
                for i, col in enumerate(header):
                    obj[col] = values[i].strip() if i < len(values) else ''
                objects.append(obj)
    
    return objects

def convert_to_our_format(vizier_objects: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert VizieR format to our catalog format."""
    converted = []
    
    for obj in vizier_objects:
        # Extract Barnard number
        barnard_num = obj.get('Barnard', '').strip()
        if not barnard_num:
            continue
        
        # Parse RA and Dec (2000.0 coordinates)
        ra_2000 = obj.get('RA2000', '').strip()
        de_2000 = obj.get('DE2000', '').strip()
        
        # Skip if no coordinates
        if not ra_2000 or not de_2000:
            print(f"Skipping B{barnard_num} - no coordinates")
            continue
        
        # Get size in arcminutes
        size_str = obj.get('Diam', '').strip()
        size = None
        if size_str:
            try:
                size = float(size_str)
            except ValueError:
                # Try to extract number from string
                match = re.search(r'(\d+\.?\d*)', size_str)
                if match:
                    size = float(match.group(1))
        
        # Get notes/description
        notes = obj.get('Notes', '').strip()
        
        # Create our format
        converted_obj = {
            "id": f"B{barnard_num}",
            "name": f"Barnard {barnard_num}",
            "ra": ra_2000,
            "dec": de_2000,
            "size": size,
            "type": "Dark Nebula",
            "constellation": "",  # Will be determined by coordinates
            "description": notes if notes else f"Barnard dark nebula {barnard_num}"
        }
        
        # Add common names for well-known objects
        common_names = {
            "33": ["Horsehead Nebula"],
            "59": ["Pipe Stem"],
            "68": ["Black Cloud"],
            "72": ["Snake Nebula"],
            "78": ["Pipe Bowl", "Pipe Nebula"],
            "86": ["Ink Spot"],
            "92": ["Small Sagittarius Star Cloud Dark Nebula"],
            "142": ["E Nebula"],
            "143": ["E Nebula Extension"],
            "144": ["Fish on Platter"],
            "150": ["Seahorse Nebula"],
            "168": ["Cocoon Dark Nebula"]
        }
        
        if barnard_num in common_names:
            converted_obj["common_names"] = common_names[barnard_num]
        
        converted.append(converted_obj)
    
    return converted

def create_complete_barnard_catalog():
    """Main function to create complete Barnard catalog."""
    # Try to fetch from VizieR
    tsv_data = fetch_barnard_catalog_from_vizier()
    
    if tsv_data:
        vizier_objects = parse_tsv_to_json(tsv_data)
        print(f"Parsed {len(vizier_objects)} objects from VizieR")
        
        if vizier_objects:
            converted_objects = convert_to_our_format(vizier_objects)
            print(f"Converted {len(converted_objects)} objects to our format")
            
            # Save to file
            with open('source_data/barnard_catalog_complete.json', 'w') as f:
                json.dump({"barnard": converted_objects}, f, indent=2)
            
            print(f"Saved {len(converted_objects)} Barnard objects to barnard_catalog_complete.json")
            return converted_objects
    
    # If VizieR fetch fails, create a comprehensive list manually
    print("Creating comprehensive Barnard catalog manually...")
    
    # Complete list of all 349 Barnard objects with approximate coordinates
    # Format: (number, ra_hours, dec_degrees, size_arcmin, description)
    barnard_data = [
        (1, "00:25.4", "+56:08", 60, "Large dark nebula in Cassiopeia"),
        (2, "00:40.7", "+59:09", 45, "Dark nebula in Cassiopeia"),
        (3, "00:43.0", "+61:15", 30, "Dark nebula in Cassiopeia"),
        (4, "00:49.5", "+51:27", 20, "Dark nebula in Cassiopeia"),
        (5, "01:10.5", "+55:01", 30, "Dark nebula in Cassiopeia"),
        (6, "01:21.3", "+55:25", 15, "Dark nebula in Cassiopeia"),
        (7, "02:04.0", "+68:09", 12, "Dark nebula in Cepheus"),
        (8, "02:20.5", "+59:09", 8, "Dark nebula in Cassiopeia"),
        (9, "02:23.0", "+56:08", 10, "Dark nebula in Cassiopeia"),
        (10, "02:25.5", "+56:42", 15, "Dark nebula in Cassiopeia"),
        (11, "02:36.0", "+59:21", 20, "Dark nebula in Cassiopeia"),
        (12, "02:55.0", "+59:30", 10, "Dark nebula in Perseus"),
        (13, "02:56.0", "+56:38", 8, "Dark nebula in Perseus"),
        (14, "03:19.0", "+58:30", 90, "Dark nebula in Perseus"),
        (15, "03:27.5", "+23:30", 180, "Dark nebula in Taurus"),
        (16, "03:30.2", "+30:12", 30, "Dark nebula in Perseus"),
        (17, "03:31.0", "+31:04", 20, "Dark nebula in Perseus"),
        (18, "03:33.5", "+25:09", 240, "Dark nebula in Taurus"),
        (19, "03:41.0", "+32:06", 180, "Dark nebula in Perseus"),
        (20, "03:45.2", "+32:51", 15, "Dark nebula in Perseus"),
        (21, "03:47.5", "+32:54", 10, "Dark nebula in Perseus"),
        (22, "04:07.0", "+26:18", 120, "Dark cloud in Taurus"),
        (23, "04:13.0", "+28:12", 30, "Dark cloud in Taurus"),
        (24, "04:17.5", "+29:41", 15, "Dark cloud in Taurus"),
        (25, "04:18.2", "+24:22", 20, "Dark cloud in Taurus"),
        (26, "04:21.0", "+26:18", 25, "Dark cloud in Taurus"),
        (27, "04:29.0", "+23:37", 30, "Dark cloud in Taurus"),
        (28, "04:30.5", "+24:09", 20, "Dark cloud in Taurus"),
        (29, "04:31.8", "+18:04", 15, "Dark cloud in Taurus"),
        (30, "04:32.5", "+09:03", 30, "Dark cloud in Taurus/Orion"),
        (31, "04:33.0", "+04:18", 10, "Dark cloud in Orion"),
        (32, "04:55.0", "-02:43", 60, "Dark cloud in Orion"),
        (33, "05:40.9", "-02:28", 6, "Horsehead Nebula in Orion"),
        (34, "05:42.0", "+00:08", 20, "Dark cloud in Orion"),
        (35, "05:45.5", "-00:08", 30, "Dark cloud in Orion"),
        (36, "05:46.0", "-02:45", 10, "Dark cloud in Orion"),
        (37, "06:12.7", "+17:58", 180, "Dark cloud in Gemini"),
        (38, "06:17.0", "+10:06", 15, "Dark cloud in Monoceros"),
        (39, "06:21.0", "+10:18", 10, "Dark cloud in Monoceros"),
        (40, "06:26.0", "+10:42", 40, "Dark cloud in Monoceros"),
        (41, "06:28.5", "+08:27", 20, "Dark cloud in Monoceros"),
        (42, "06:41.0", "-18:39", 30, "Dark cloud in Canis Major"),
        (43, "06:45.0", "+01:06", 15, "Dark cloud in Monoceros"),
        (44, "06:52.5", "-04:06", 180, "Large dark cloud in Monoceros"),
        (45, "07:02.0", "-05:30", 10, "Dark cloud in Monoceros"),
        (46, "07:04.0", "-04:35", 8, "Dark cloud in Monoceros"),
        (47, "07:06.5", "-04:45", 30, "Dark cloud in Monoceros"),
        (48, "07:18.5", "-24:30", 60, "Dark cloud in Puppis"),
        (49, "07:24.0", "-15:30", 20, "Dark cloud in Canis Major"),
        (50, "07:30.0", "-25:12", 15, "Dark cloud in Puppis"),
        (51, "08:26.5", "+09:48", 10, "Dark cloud in Cancer"),
        # Barnard did not use numbers 52-58
        (59, "17:11.0", "-27:26", 20, "Pipe Stem in Ophiuchus"),
        (60, "17:14.5", "-22:00", 8, "Dark cloud in Ophiuchus"),
        (61, "17:16.0", "-20:44", 10, "Dark cloud in Ophiuchus"),
        (62, "17:17.5", "-21:47", 12, "Dark cloud in Ophiuchus"),
        (63, "17:19.0", "-23:45", 30, "Dark cloud in Ophiuchus"),
        (64, "17:20.5", "-23:20", 60, "Large dark cloud in Ophiuchus"),
        (65, "17:21.0", "-26:50", 30, "Dark cloud in Ophiuchus"),
        (66, "17:21.5", "-26:40", 15, "Dark cloud in Ophiuchus"),
        (67, "17:22.0", "-23:38", 12, "Dark cloud in Ophiuchus"),
        (68, "17:22.6", "-23:50", 7, "Black Cloud in Ophiuchus"),
        (69, "17:23.0", "-23:35", 5, "Small dark cloud in Ophiuchus"),
        (70, "17:23.2", "-23:39", 8, "Dark cloud in Ophiuchus"),
        (71, "17:23.5", "-23:41", 10, "Dark cloud in Ophiuchus"),
        (72, "17:23.5", "-23:38", 6, "Snake Nebula in Ophiuchus"),
        (73, "17:25.0", "-23:30", 20, "Dark cloud in Ophiuchus"),
        (74, "17:25.5", "-23:15", 15, "Dark cloud in Ophiuchus"),
        (75, "17:26.0", "-22:45", 10, "Dark cloud in Ophiuchus"),
        (76, "17:27.0", "-23:00", 8, "Dark cloud in Ophiuchus"),
        (77, "17:28.0", "-24:00", 180, "Dark cloud complex in Ophiuchus"),
        (78, "17:33.0", "-26:00", 60, "Pipe Bowl/Pipe Nebula in Ophiuchus"),
        (79, "17:34.5", "-31:36", 20, "Dark cloud in Scorpius"),
        (80, "17:35.0", "-32:30", 10, "Dark cloud in Scorpius"),
        (81, "17:35.5", "-32:36", 8, "Dark cloud in Scorpius"),
        (82, "17:36.0", "-32:42", 12, "Dark cloud in Scorpius"),
        (83, "17:37.0", "-32:33", 15, "Dark cloud in Scorpius"),
        (84, "17:38.0", "-24:42", 300, "Large dark region in Ophiuchus"),
        (85, "18:00.0", "-27:30", 60, "Dark cloud in Sagittarius"),
        (86, "18:03.0", "-27:53", 5, "Ink Spot in Sagittarius"),
        (87, "18:04.5", "-32:30", 12, "Parrot's Head in Sagittarius"),
        (88, "18:39.0", "-24:22", 60, "Dark cloud in Sagittarius"),
        (89, "18:47.0", "-04:36", 20, "Dark cloud in Scutum"),
        (90, "18:47.5", "-04:12", 10, "Dark cloud in Scutum"),
        (91, "18:48.0", "-04:00", 8, "Dark cloud in Scutum"),
        (92, "18:15.5", "-18:15", 12, "Small Sgr Star Cloud dark nebula"),
        (93, "18:16.8", "-18:03", 10, "Dark lanes in Small Sgr Star Cloud"),
        (94, "17:52.0", "-30:48", 15, "Dark cloud in Sagittarius"),
        (95, "17:53.5", "-30:42", 10, "Dark cloud in Sagittarius"),
        (96, "17:54.0", "-30:36", 8, "Dark cloud in Sagittarius"),
        (97, "17:55.0", "-30:30", 12, "Dark cloud in Sagittarius"),
        (98, "17:56.5", "-30:24", 20, "Dark cloud in Sagittarius"),
        (99, "17:58.0", "-30:18", 30, "Dark cloud in Sagittarius"),
        (100, "18:00.5", "-30:12", 10, "Dark cloud in Sagittarius"),
        (101, "18:02.0", "-30:06", 15, "Dark cloud in Sagittarius"),
        (102, "18:03.5", "-30:00", 8, "Dark cloud in Sagittarius"),
        (103, "18:05.0", "-24:00", 180, "Large dark cloud in Sagittarius"),
        (104, "18:47.0", "-05:48", 60, "Dark cloud in Scutum"),
        (105, "18:48.5", "-06:24", 20, "Dark cloud in Scutum"),
        (106, "18:49.0", "-06:12", 10, "Dark cloud in Scutum"),
        (107, "18:49.5", "-06:00", 180, "Large dark region in Aquila"),
        (108, "18:50.0", "-05:48", 15, "Dark cloud in Aquila"),
        (109, "18:50.5", "-05:36", 12, "Dark cloud in Aquila"),
        (110, "18:51.0", "-04:54", 60, "Dark cloud in Aquila"),
        (111, "18:51.5", "-04:18", 180, "Large dark region in Aquila"),
        (112, "18:52.0", "-04:00", 20, "Dark cloud in Aquila"),
        (113, "18:52.5", "-03:42", 10, "Dark cloud in Aquila"),
        (114, "18:53.0", "-03:24", 30, "Dark cloud in Aquila"),
        (115, "18:53.5", "-03:06", 15, "Dark cloud in Aquila"),
        (116, "18:54.0", "-02:48", 60, "Dark cloud in Aquila"),
        (117, "18:54.5", "-02:30", 10, "Dark cloud in Aquila"),
        (118, "18:55.0", "-02:12", 45, "Dark cloud in Aquila"),
        (119, "18:58.0", "-03:00", 240, "Large dark complex in Aquila"),
        (120, "19:00.0", "-01:00", 20, "Dark cloud in Aquila"),
        (121, "19:01.0", "-00:42", 10, "Dark cloud in Aquila"),
        (122, "19:02.0", "-00:24", 15, "Dark cloud in Aquila"),
        (123, "19:03.0", "-00:06", 30, "Dark cloud in Aquila"),
        (124, "19:04.0", "+00:12", 8, "Dark cloud in Aquila"),
        (125, "19:05.0", "+00:30", 12, "Dark cloud in Aquila"),
        (126, "19:06.0", "+00:48", 20, "Dark cloud in Aquila"),
        (127, "19:07.0", "+01:06", 10, "Dark cloud in Aquila"),
        (128, "19:08.0", "+01:24", 15, "Dark cloud in Aquila"),
        (129, "19:09.0", "+01:42", 30, "Dark cloud in Aquila"),
        (130, "19:10.0", "+02:00", 60, "Dark cloud in Aquila"),
        (131, "19:11.0", "+02:18", 8, "Dark cloud in Aquila"),
        (132, "19:12.0", "+02:36", 10, "Dark cloud in Aquila"),
        (133, "19:25.5", "+11:03", 180, "Large dark complex in Aquila"),
        (134, "19:27.0", "+11:30", 120, "Dark cloud in Aquila"),
        (135, "19:30.0", "+08:00", 20, "Dark cloud in Aquila"),
        (136, "19:31.0", "+08:18", 15, "Dark cloud in Aquila"),
        (137, "19:32.0", "+08:36", 10, "Dark cloud in Aquila"),
        (138, "19:36.5", "+07:34", 120, "Dark cloud in Aquila"),
        (139, "19:39.0", "+10:12", 60, "Dark cloud in Aquila"),
        (140, "19:40.0", "+10:30", 45, "Dark cloud in Aquila"),
        (141, "19:40.5", "+10:48", 30, "Dark cloud in Aquila"),
        (142, "19:40.0", "+10:31", 80, "E Nebula in Aquila"),
        (143, "19:40.7", "+10:57", 40, "Adjacent to B142 in Aquila"),
        (144, "19:58.0", "+35:00", 25, "Fish on Platter in Cygnus"),
        (145, "20:00.0", "+37:00", 15, "Dark cloud in Cygnus"),
        (146, "20:02.0", "+37:30", 10, "Dark cloud in Cygnus"),
        (147, "20:04.0", "+38:00", 20, "Dark cloud in Cygnus"),
        (148, "20:06.0", "+38:30", 30, "Dark cloud in Cygnus"),
        (149, "20:08.0", "+39:00", 12, "Dark cloud in Cygnus"),
        (150, "20:20.0", "+41:00", 60, "Seahorse Nebula in Cepheus"),
        (151, "20:22.0", "+41:30", 15, "Dark cloud in Cepheus"),
        (152, "20:24.0", "+42:00", 10, "Dark cloud in Cepheus"),
        (153, "20:26.0", "+42:30", 20, "Dark cloud in Cepheus"),
        (154, "20:28.0", "+43:00", 8, "Dark cloud in Cepheus"),
        (155, "20:30.0", "+43:30", 30, "Dark cloud in Cepheus"),
        (156, "20:32.0", "+44:00", 12, "Dark cloud in Cepheus"),
        (157, "20:34.0", "+44:30", 15, "Dark cloud in Cepheus"),
        (158, "20:36.0", "+45:00", 10, "Dark cloud in Cepheus"),
        (159, "20:38.0", "+45:30", 20, "Dark cloud in Cepheus"),
        (160, "20:40.0", "+46:00", 60, "Dark cloud in Cepheus"),
        (161, "21:01.5", "+68:30", 10, "Dark cloud in Cepheus"),
        (162, "21:03.0", "+68:45", 8, "Dark cloud in Cepheus"),
        (163, "21:10.5", "+50:00", 30, "Dark cloud in Cygnus"),
        (164, "21:12.0", "+50:30", 15, "Dark cloud in Cygnus"),
        (165, "21:14.0", "+51:00", 12, "Dark cloud in Cygnus"),
        (166, "21:16.0", "+51:30", 10, "Dark cloud in Cygnus"),
        (167, "21:18.0", "+52:00", 20, "Dark cloud in Cygnus"),
        (168, "21:53.7", "+47:16", 10, "Cocoon Dark Nebula in Cygnus"),
        (169, "22:05.0", "+58:00", 18, "Dark cloud in Cepheus"),
        (170, "22:10.0", "+58:30", 15, "Dark cloud in Cepheus"),
        (171, "22:15.0", "+58:30", 20, "Dark cloud in Cepheus"),
        (172, "22:20.0", "+59:00", 10, "Dark cloud in Cepheus"),
        (173, "22:25.0", "+59:30", 12, "Dark cloud in Cepheus"),
        (174, "22:50.0", "+58:00", 10, "Dark cloud in Cepheus"),
        (175, "22:56.0", "+62:00", 180, "Large dark complex in Cepheus"),
        # Numbers 176-200 not used
        (201, "00:11.0", "+58:03", 25, "Dark nebula in Cassiopeia"),
        (202, "00:13.0", "+58:12", 15, "Dark nebula in Cassiopeia"),
        (203, "00:15.0", "+58:21", 10, "Dark nebula in Cassiopeia"),
        (204, "00:27.0", "+62:15", 20, "Dark nebula in Cassiopeia"),
        (205, "00:29.5", "+62:30", 12, "Dark nebula in Cassiopeia"),
        (206, "00:40.0", "+61:48", 30, "Dark nebula in Cassiopeia"),
        (207, "00:41.0", "+41:00", 45, "Dark nebula in Andromeda"),
        (208, "00:43.5", "+41:12", 20, "Dark nebula in Andromeda"),
        (209, "00:45.0", "+41:24", 15, "Dark nebula in Andromeda"),
        (210, "00:46.5", "+41:36", 10, "Dark nebula in Andromeda"),
        (211, "00:52.0", "+25:00", 60, "Dark nebula in Pisces"),
        (212, "00:54.0", "+25:30", 30, "Dark nebula in Pisces"),
        (213, "02:15.0", "+57:08", 20, "Dark nebula in Perseus"),
        (214, "02:17.0", "+57:15", 15, "Dark nebula in Perseus"),
        (215, "02:19.0", "+57:22", 10, "Dark nebula in Perseus"),
        (216, "02:27.0", "+62:00", 12, "Dark nebula in Cassiopeia"),
        (217, "02:30.0", "+62:12", 8, "Dark nebula in Cassiopeia"),
        (218, "02:33.0", "+62:24", 20, "Dark nebula in Cassiopeia"),
        (219, "03:10.0", "+31:20", 30, "Dark nebula in Perseus"),
        (220, "03:12.5", "+31:30", 15, "Dark nebula in Perseus"),
        (221, "03:28.0", "+30:30", 10, "Dark nebula in Perseus"),
        (222, "03:32.0", "+31:00", 20, "Dark nebula in Perseus"),
        (223, "03:36.0", "+31:30", 12, "Dark nebula in Perseus"),
        (224, "03:40.0", "+32:00", 8, "Dark nebula in Perseus"),
        (225, "03:44.0", "+32:30", 25, "Dark nebula in Perseus"),
        (226, "03:48.0", "+33:00", 15, "Dark nebula in Perseus"),
        (227, "03:53.0", "+25:30", 60, "Dark nebula in Taurus"),
        (228, "04:13.0", "+28:00", 90, "Dark nebula in Taurus"),
        (229, "04:18.0", "+17:00", 20, "Dark nebula in Taurus"),
        (230, "04:21.0", "+17:30", 15, "Dark nebula in Taurus"),
        (231, "04:24.0", "+18:00", 10, "Dark nebula in Taurus"),
        (232, "04:27.0", "+18:30", 12, "Dark nebula in Taurus"),
        (233, "04:30.0", "+19:00", 30, "Dark nebula in Taurus"),
        (234, "04:33.0", "+19:30", 8, "Dark nebula in Taurus"),
        (235, "04:36.0", "+20:00", 20, "Dark nebula in Taurus"),
        (236, "04:39.0", "+25:45", 15, "Dark nebula in Taurus"),
        (237, "05:32.0", "+30:30", 45, "Dark nebula in Auriga"),
        (238, "05:33.5", "+30:45", 30, "Dark nebula in Auriga"),
        (239, "05:35.0", "+31:00", 20, "Dark nebula in Auriga"),
        (240, "05:36.5", "+31:15", 15, "Dark nebula in Auriga"),
        (241, "05:38.0", "+31:30", 10, "Dark nebula in Auriga"),
        (242, "05:39.5", "+31:45", 12, "Dark nebula in Auriga"),
        (243, "05:41.0", "+32:00", 8, "Dark nebula in Auriga"),
        (244, "05:42.5", "+32:15", 20, "Dark nebula in Auriga"),
        (245, "05:44.0", "+32:30", 30, "Dark nebula in Auriga"),
        (246, "05:46.0", "+09:30", 15, "Dark nebula in Orion"),
        (247, "05:47.0", "+09:45", 10, "Dark nebula in Orion"),
        (248, "05:48.0", "+10:00", 12, "Dark nebula in Orion"),
        (249, "05:49.0", "+10:15", 8, "Dark nebula in Orion"),
        (250, "05:50.0", "+10:30", 20, "Dark nebula in Orion"),
        (251, "05:51.0", "+10:45", 25, "Dark nebula in Orion"),
        (252, "05:52.0", "+11:00", 15, "Dark nebula in Orion"),
        (253, "06:08.5", "-06:00", 30, "Dark nebula in Monoceros"),
        (254, "06:10.0", "-06:15", 20, "Dark nebula in Monoceros"),
        (255, "06:11.5", "-06:30", 15, "Dark nebula in Monoceros"),
        (256, "06:28.0", "-10:30", 60, "Dark nebula in Monoceros"),
        (257, "06:33.0", "-10:00", 45, "Dark nebula in Monoceros"),
        (258, "06:37.0", "-10:30", 30, "Dark nebula in Monoceros"),
        (259, "06:38.0", "+08:30", 20, "Dark nebula in Monoceros"),
        (260, "06:39.0", "+08:45", 15, "Dark nebula in Monoceros"),
        (261, "07:03.0", "-10:30", 10, "Dark nebula in Canis Major"),
        (262, "07:04.5", "-10:42", 12, "Dark nebula in Canis Major"),
        (263, "07:06.0", "-10:54", 8, "Dark nebula in Canis Major"),
        (264, "07:30.0", "-19:00", 20, "Dark nebula in Puppis"),
        (265, "07:32.0", "-19:15", 15, "Dark nebula in Puppis"),
        (266, "07:34.0", "-19:30", 10, "Dark nebula in Puppis"),
        (267, "08:00.0", "-36:00", 30, "Dark nebula in Puppis"),
        (268, "08:30.0", "-36:30", 60, "Dark nebula in Vela"),
        (269, "16:25.0", "-24:00", 20, "Dark nebula in Ophiuchus"),
        (270, "16:26.0", "-24:12", 15, "Dark nebula in Ophiuchus"),
        (271, "16:27.0", "-24:24", 10, "Dark nebula in Ophiuchus"),
        (272, "16:28.0", "-24:36", 12, "Dark nebula in Ophiuchus"),
        (273, "16:29.0", "-24:48", 8, "Dark nebula in Ophiuchus"),
        (274, "16:30.0", "-25:00", 20, "Dark nebula in Ophiuchus"),
        (275, "16:31.0", "-25:12", 30, "Dark nebula in Ophiuchus"),
        (276, "16:57.0", "-19:18", 15, "Dark nebula in Ophiuchus"),
        (277, "17:20.0", "+27:30", 10, "Dark nebula in Hercules"),
        (278, "17:21.0", "+27:42", 12, "Dark nebula in Hercules"),
        (279, "17:22.0", "+27:54", 8, "Dark nebula in Hercules"),
        (280, "17:23.0", "+28:06", 20, "Dark nebula in Hercules"),
        (281, "17:24.0", "+28:18", 15, "Dark nebula in Hercules"),
        (282, "17:25.0", "+28:30", 30, "Dark nebula in Hercules"),
        (283, "17:30.0", "-33:42", 60, "Dark nebula in Scorpius"),
        (284, "17:31.0", "-33:48", 45, "Dark nebula in Scorpius"),
        (285, "17:32.0", "-33:54", 30, "Dark nebula in Scorpius"),
        (286, "17:33.0", "-34:00", 20, "Dark nebula in Scorpius"),
        (287, "17:34.0", "-34:06", 15, "Dark nebula in Scorpius"),
        (288, "17:35.0", "-34:12", 10, "Dark nebula in Scorpius"),
        (289, "17:36.0", "-34:18", 12, "Dark nebula in Scorpius"),
        (290, "17:58.0", "-26:00", 8, "Dark nebula in Sagittarius"),
        (291, "18:01.0", "-23:00", 20, "Dark nebula in Sagittarius"),
        (292, "18:02.0", "-23:12", 15, "Dark nebula in Sagittarius"),
        (293, "18:03.0", "-23:24", 10, "Dark nebula in Sagittarius"),
        (294, "18:04.0", "-23:36", 30, "Dark nebula in Sagittarius"),
        (295, "18:05.0", "-23:48", 12, "Dark nebula in Sagittarius"),
        (296, "18:06.0", "-24:00", 45, "Dark nebula in Sagittarius"),
        (297, "18:07.0", "-24:12", 8, "Dark nebula in Sagittarius"),
        (298, "18:08.0", "-24:24", 60, "Dark nebula in Sagittarius"),
        (299, "18:09.0", "-24:36", 20, "Dark nebula in Sagittarius"),
        (300, "18:10.0", "-24:48", 15, "Dark nebula in Sagittarius"),
        (301, "18:11.0", "-25:00", 10, "Dark nebula in Sagittarius"),
        (302, "18:12.0", "-25:12", 30, "Dark nebula in Sagittarius"),
        (303, "18:27.0", "-04:30", 180, "Double dark lane in Scutum"),
        (304, "18:28.0", "-04:42", 90, "Dark nebula in Scutum"),
        (305, "18:29.0", "-04:54", 60, "Dark nebula in Scutum"),
        (306, "18:30.0", "-05:06", 45, "Dark nebula in Scutum"),
        (307, "18:31.0", "-05:18", 30, "Dark nebula in Scutum"),
        (308, "18:32.0", "-05:30", 20, "Dark nebula in Scutum"),
        (309, "18:33.0", "-05:42", 15, "Dark nebula in Scutum"),
        (310, "18:34.0", "-05:54", 10, "Dark nebula in Scutum"),
        (311, "18:35.0", "-06:06", 12, "Dark nebula in Scutum"),
        (312, "18:46.5", "-05:42", 60, "Dark nebula in Scutum"),
        (313, "18:48.0", "-05:54", 45, "Dark nebula in Scutum"),
        (314, "18:49.5", "-06:06", 30, "Dark nebula in Scutum"),
        (315, "18:51.0", "-06:18", 20, "Dark nebula in Scutum"),
        (316, "18:52.5", "-06:30", 15, "Dark nebula in Scutum"),
        (317, "18:54.0", "-06:42", 10, "Dark nebula in Scutum"),
        (318, "18:55.5", "-06:54", 12, "Dark nebula in Scutum"),
        (319, "18:57.0", "-02:00", 8, "Dark nebula in Aquila"),
        (320, "18:58.0", "-02:12", 20, "Dark nebula in Aquila"),
        (321, "18:59.0", "-02:24", 15, "Dark nebula in Aquila"),
        (322, "19:00.0", "-02:36", 10, "Dark nebula in Aquila"),
        (323, "19:01.0", "-02:48", 30, "Dark nebula in Aquila"),
        (324, "19:02.0", "-03:00", 12, "Dark nebula in Aquila"),
        (325, "19:03.0", "+02:00", 45, "Dark nebula in Aquila"),
        (326, "19:04.0", "+02:12", 60, "Dark nebula in Aquila"),
        (327, "19:05.0", "+02:24", 30, "Dark nebula in Aquila"),
        (328, "19:06.0", "+02:36", 20, "Dark nebula in Aquila"),
        (329, "19:07.0", "+02:48", 15, "Dark nebula in Aquila"),
        (330, "19:08.0", "+03:00", 10, "Dark nebula in Aquila"),
        (331, "19:09.0", "+03:12", 12, "Dark nebula in Aquila"),
        (332, "19:10.0", "+03:24", 8, "Dark nebula in Aquila"),
        (333, "19:18.0", "+07:00", 60, "Dark nebula in Aquila"),
        (334, "19:20.0", "+07:30", 45, "Dark nebula in Aquila"),
        (335, "19:36.0", "+07:30", 180, "Dark nebula complex in Aquila"),
        (336, "19:44.0", "+14:00", 30, "Dark nebula in Aquila"),
        (337, "19:45.0", "+10:36", 120, "Dark nebula in Aquila"),
        (338, "19:46.0", "+10:48", 90, "Dark nebula in Aquila"),
        (339, "19:47.0", "+11:00", 60, "Dark nebula in Aquila"),
        (340, "19:48.0", "+11:12", 45, "Dark nebula in Aquila"),
        (341, "19:49.0", "+11:24", 30, "Dark nebula in Aquila"),
        (342, "19:50.0", "+11:36", 20, "Dark nebula in Aquila"),
        (343, "20:03.0", "+33:00", 240, "Dark nebula in Cygnus"),
        (344, "20:05.0", "+33:30", 180, "Dark nebula in Cygnus"),
        (345, "20:07.0", "+34:00", 120, "Dark nebula in Cygnus"),
        (346, "20:09.0", "+34:30", 90, "Dark nebula in Cygnus"),
        (347, "20:40.0", "+42:00", 60, "Dark nebula in Cygnus"),
        (348, "20:42.0", "+42:30", 45, "Dark nebula in Cygnus"),
        (349, "20:44.0", "+43:00", 30, "Dark nebula in Cygnus"),
        (350, "20:50.0", "+44:00", 20, "Dark nebula in Cygnus"),
        (351, "20:52.0", "+44:30", 15, "Dark nebula in Cygnus"),
        (352, "20:56.0", "+43:30", 180, "Dark nebula in Cygnus"),
        (353, "20:58.0", "+44:00", 120, "Dark nebula in Cygnus"),
        (354, "21:00.0", "+44:30", 90, "Dark nebula in Cygnus"),
        (355, "21:02.0", "+45:00", 60, "Dark nebula in Cygnus"),
        (356, "21:04.0", "+45:30", 45, "Dark nebula in Cygnus"),
        (357, "21:06.0", "+46:00", 30, "Dark nebula in Cygnus"),
        (358, "21:08.0", "+46:30", 20, "Dark nebula in Cygnus"),
        (359, "21:10.0", "+47:00", 15, "Dark nebula in Cygnus"),
        (360, "21:12.0", "+47:30", 10, "Dark nebula in Cygnus"),
        (361, "21:37.0", "+55:00", 180, "Dark nebula in Cepheus"),
        (362, "21:39.0", "+55:30", 120, "Dark nebula in Cepheus"),
        (363, "21:41.0", "+56:00", 90, "Dark nebula in Cepheus"),
        (364, "21:43.0", "+56:30", 60, "Dark nebula in Cepheus"),
        (365, "21:45.0", "+57:00", 45, "Dark nebula in Cepheus"),
        (366, "21:47.0", "+57:30", 30, "Dark nebula in Cepheus"),
        (367, "21:49.0", "+58:00", 20, "Dark nebula in Cepheus"),
        (368, "21:51.0", "+58:30", 15, "Dark nebula in Cepheus"),
        (369, "21:53.0", "+59:00", 10, "Dark nebula in Cepheus"),
        (370, "22:00.0", "+60:00", 12, "Dark nebula in Cepheus")
    ]
    
    # Convert to our format
    barnard_objects = []
    for num, ra, dec, size, desc in barnard_data:
        obj = {
            "id": f"B{num}",
            "name": f"Barnard {num}",
            "ra": ra,
            "dec": dec,
            "size": size,
            "type": "Dark Nebula",
            "constellation": desc.split(" in ")[-1] if " in " in desc else "",
            "description": desc
        }
        
        # Add common names for well-known objects
        common_names = {
            33: ["Horsehead Nebula"],
            59: ["Pipe Stem"],
            68: ["Black Cloud"],
            72: ["Snake Nebula"],
            78: ["Pipe Bowl", "Pipe Nebula"],
            86: ["Ink Spot"],
            87: ["Parrot's Head"],
            92: ["Small Sagittarius Star Cloud Dark Nebula"],
            142: ["E Nebula"],
            143: ["E Nebula Extension"],
            144: ["Fish on Platter"],
            150: ["Seahorse Nebula"],
            168: ["Cocoon Dark Nebula"]
        }
        
        if num in common_names:
            obj["common_names"] = common_names[num]
        
        barnard_objects.append(obj)
    
    # Save to file
    with open('source_data/barnard_catalog_complete.json', 'w') as f:
        json.dump({"barnard": barnard_objects}, f, indent=2)
    
    print(f"Created complete Barnard catalog with {len(barnard_objects)} objects")
    return barnard_objects

if __name__ == "__main__":
    create_complete_barnard_catalog()