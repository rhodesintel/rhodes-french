#!/usr/bin/env python3
"""
Generate manifests for ElevenLabs audio generation.
Creates JSON files listing exactly what will be generated - verify before running!

Output:
  - drill_manifest.json: Top 20 drills per unit (9-24), French + English
  - dialogue_manifest.json: All dialogues, English only, speaker labels on lines 1-2 only
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
JS_DIR = SCRIPT_DIR.parent / 'js'

def load_drills():
    """Load drills.json"""
    with open(DATA_DIR / 'drills.json', 'r', encoding='utf-8') as f:
        return json.load(f)['drills']

def load_audio_mapping():
    """Load existing audio mapping to skip drills that already have audio"""
    mapping_file = DATA_DIR / 'reverse_audio_mapping.json'
    if mapping_file.exists():
        with open(mapping_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def extract_dialogues_from_js():
    """Extract UNIT_DATA dialogues from fsi-main.js"""
    with open(JS_DIR / 'fsi-main.js', 'r', encoding='utf-8') as f:
        content = f.read()

    dialogues = {}

    # Find all dialogue arrays with their content
    pattern = r"dialogue:\s*\[([\s\S]*?)\](?=,\s*(?:grammar|noDrills|\}))"

    for match in re.finditer(pattern, content):
        dialogue_text = match.group(1)

        # Find which unit this belongs to by looking backwards
        start_pos = match.start()
        preceding = content[max(0, start_pos-500):start_pos]

        # Look for unit number - check UNIT_DATA[N] or N: { patterns
        unit_match = re.search(r'UNIT_DATA\[(\d+)\]', preceding)
        if unit_match:
            unit_num = int(unit_match.group(1))
        else:
            # Look for inline format like "1: {"
            unit_nums = re.findall(r'(\d+):\s*\{', preceding)
            if unit_nums:
                unit_num = int(unit_nums[-1])
            else:
                continue

        # Parse lines - handle escaped quotes properly
        lines = []

        # Match each line object - use .+? with DOTALL to handle escaped quotes
        line_pattern = r"\{\s*speaker:\s*['\"](.+?)['\"],\s*fr:\s*['\"](.+?)['\"],\s*en:\s*['\"](.+?)['\"]\s*\}"

        for lm in re.finditer(line_pattern, dialogue_text, re.DOTALL):
            speaker = lm.group(1)
            fr = lm.group(2).replace("\\'", "'").replace("\\\"", '"')
            en = lm.group(3).replace("\\'", "'").replace("\\\"", '"')
            lines.append({
                'speaker': speaker,
                'fr': fr,
                'en': en
            })

        if lines:
            dialogues[unit_num] = lines

    return dialogues

def create_drill_manifest():
    """Create manifest for top 20 drills per unit (9-24)"""
    drills = load_drills()
    audio_mapping = load_audio_mapping()

    manifest = {
        'description': 'Top 20 most common drills per unit (9-24), French + English',
        'units': list(range(9, 25)),
        'drills_per_unit': 20,
        'total_drills': 0,
        'total_chars_fr': 0,
        'total_chars_en': 0,
        'drills': []
    }

    for unit in range(9, 25):
        # Get drills for this unit that don't have audio
        unit_drills = [
            d for d in drills
            if d.get('unit') == unit and d['id'] not in audio_mapping
        ]

        # Sort by commonality (descending)
        unit_drills.sort(key=lambda x: x.get('commonality', 0), reverse=True)

        # Take top 20
        top_20 = unit_drills[:20]

        for rank, drill in enumerate(top_20, 1):
            french = drill.get('french_formal', '').strip()
            english = (drill.get('english') or '').strip()

            if not french or not english:
                continue

            entry = {
                'id': drill['id'],
                'unit': unit,
                'rank': rank,
                'commonality': drill.get('commonality', 0),
                'french': french,
                'english': english,
                'chars_fr': len(french),
                'chars_en': len(english)
            }

            manifest['drills'].append(entry)
            manifest['total_chars_fr'] += len(french)
            manifest['total_chars_en'] += len(english)

    manifest['total_drills'] = len(manifest['drills'])
    manifest['total_chars'] = manifest['total_chars_fr'] + manifest['total_chars_en']

    return manifest

def create_dialogue_manifest():
    """Create manifest for English dialogues with speaker labels on lines 1-2 only"""
    dialogues = extract_dialogues_from_js()

    manifest = {
        'description': 'English dialogue audio - speaker labels on first 2 lines only',
        'total_units': len(dialogues),
        'total_lines': 0,
        'total_chars': 0,
        'units': []
    }

    for unit_num in sorted(dialogues.keys()):
        lines = dialogues[unit_num]

        unit_entry = {
            'unit': unit_num,
            'lines': [],
            'total_chars': 0
        }

        for i, line in enumerate(lines):
            speaker = line['speaker']
            english = line['en']

            # Skip metadata lines
            if english.startswith('(') and english.endswith(')'):
                continue

            # Speaker label only on lines 0 and 1
            if i < 2:
                text_to_speak = f"{speaker}: {english}"
            else:
                text_to_speak = english

            line_entry = {
                'index': i,
                'speaker': speaker,
                'original_english': english,
                'text_to_speak': text_to_speak,
                'has_speaker_label': i < 2,
                'chars': len(text_to_speak)
            }

            unit_entry['lines'].append(line_entry)
            unit_entry['total_chars'] += len(text_to_speak)

        if unit_entry['lines']:
            manifest['units'].append(unit_entry)
            manifest['total_lines'] += len(unit_entry['lines'])
            manifest['total_chars'] += unit_entry['total_chars']

    return manifest

def main():
    print("=" * 60)
    print("GENERATING AUDIO MANIFESTS")
    print("=" * 60)

    # Create drill manifest
    print("\n[1/2] Creating drill manifest...")
    drill_manifest = create_drill_manifest()

    drill_manifest_path = SCRIPT_DIR / 'drill_manifest.json'
    with open(drill_manifest_path, 'w', encoding='utf-8') as f:
        json.dump(drill_manifest, f, indent=2, ensure_ascii=False)

    print(f"  Saved: {drill_manifest_path}")
    print(f"  Units: {drill_manifest['units'][0]}-{drill_manifest['units'][-1]}")
    print(f"  Drills: {drill_manifest['total_drills']}")
    print(f"  French chars: {drill_manifest['total_chars_fr']:,}")
    print(f"  English chars: {drill_manifest['total_chars_en']:,}")
    print(f"  TOTAL: {drill_manifest['total_chars']:,} chars")

    # Create dialogue manifest
    print("\n[2/2] Creating dialogue manifest...")
    dialogue_manifest = create_dialogue_manifest()

    dialogue_manifest_path = SCRIPT_DIR / 'dialogue_manifest.json'
    with open(dialogue_manifest_path, 'w', encoding='utf-8') as f:
        json.dump(dialogue_manifest, f, indent=2, ensure_ascii=False)

    print(f"  Saved: {dialogue_manifest_path}")
    print(f"  Units: {dialogue_manifest['total_units']}")
    print(f"  Lines: {dialogue_manifest['total_lines']}")
    print(f"  TOTAL: {dialogue_manifest['total_chars']:,} chars")

    # Summary
    total = drill_manifest['total_chars'] + dialogue_manifest['total_chars']
    remaining = 28800

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Drills (Fr+En):     {drill_manifest['total_chars']:,} chars")
    print(f"  Dialogues (En):     {dialogue_manifest['total_chars']:,} chars")
    print(f"  GRAND TOTAL:        {total:,} chars")
    print(f"  Remaining budget:   {remaining:,} chars")
    print(f"  Usage:              {total / remaining * 100:.1f}%")
    print(f"  Buffer remaining:   {remaining - total:,} chars")

    if total <= remaining:
        print("\n  [OK] Fits within budget!")
    else:
        print(f"\n  [WARNING] Over budget by {total - remaining:,} chars!")

    print("\n" + "=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print("  1. Review drill_manifest.json - verify drills are correct")
    print("  2. Review dialogue_manifest.json - verify speaker labels")
    print("  3. Run: python generate_audio.py --drills")
    print("  4. Run: python generate_audio.py --dialogues")

if __name__ == '__main__':
    main()
