#!/usr/bin/env python3
"""
ElevenLabs English Dialogue Audio Generator
Speaker labels only on first 2 lines per unit, then just sentences.

Usage:
  ELEVENLABS_API_KEY=sk_xxx python3 generate_dialogue_english.py
"""
import os
import sys
import json
import time
import re
import subprocess
from pathlib import Path

API_KEY = os.environ.get('ELEVENLABS_API_KEY')
if not API_KEY:
    print("ERROR: Set ELEVENLABS_API_KEY environment variable!")
    sys.exit(1)

from elevenlabs import ElevenLabs, save

client = ElevenLabs(api_key=API_KEY)

# British English voices
VOICES = {
    'male': 'N2lVS1w4EtoT3dr4eOWO',    # Harry - British
    'female': 'EXAVITQu4vr4xnSDxMaL',  # Bella - British
}

# Speaker to voice mapping
SPEAKER_GENDER = {
    'M. Durand': 'male', 'M. Lelong': 'male',
    'Client': 'male', 'Voyageur': 'male', 'Patient': 'male',
    'Employé': 'male', 'Locataire': 'male', 'Coiffeur': 'male',
    'Étudiant': 'male', 'A': 'male',
    'Réceptionniste': 'female', 'Vendeur': 'female', 'Serveur': 'female',
    'Agent': 'female', 'Secrétaire': 'female', 'Médecin': 'female',
    'Professeur': 'female', 'Collègue': 'female', 'Passant': 'female',
    'Guichet': 'female', 'B': 'female', 'FSI': 'female',
}

SCRIPT_DIR = Path(__file__).parent
AUDIO_DIR = SCRIPT_DIR.parent / 'audio'
CHECKPOINT_FILE = SCRIPT_DIR / 'dialogue_en_checkpoint.json'

# Extract dialogues from fsi-main.js
def extract_dialogues():
    js_path = SCRIPT_DIR.parent / 'js' / 'fsi-main.js'
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()

    dialogues = {}

    # Find UNIT_DATA entries
    # Pattern: dialogue: [ {speaker: 'X', fr: 'Y', en: 'Z'}, ... ]
    for unit in range(1, 25):
        # Find dialogue array for this unit
        pattern = rf"dialogue:\s*\[(.*?)\]"
        matches = list(re.finditer(pattern, content, re.DOTALL))

        if unit <= len(matches):
            dialogue_content = matches[unit - 1].group(1)

            # Extract individual lines
            lines = []
            line_pattern = r"\{\s*speaker:\s*['\"]([^'\"]+)['\"],\s*fr:\s*['\"]([^'\"]+)['\"],\s*en:\s*['\"]([^'\"]+)['\"]\s*\}"
            for m in re.finditer(line_pattern, dialogue_content):
                speaker, fr, en = m.groups()
                # Skip metadata lines
                if en.startswith('(') or 'Exercice' in en:
                    continue
                lines.append({'speaker': speaker, 'fr': fr, 'en': en})

            if lines:
                dialogues[unit] = lines

    return dialogues

def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, 'r') as f:
            return json.load(f)
    return {'completed_units': [], 'chars_used': 0}

def save_checkpoint(cp):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(cp, f, indent=2)

def generate_audio(text, voice_id):
    """Generate audio with rate limit handling"""
    try:
        audio = client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id="eleven_multilingual_v2",
            voice_settings={"stability": 0.5, "similarity_boost": 0.75}
        )
        return audio, len(text)
    except Exception as e:
        if 'rate' in str(e).lower() or '429' in str(e):
            print(f"  Rate limited, waiting 60s...")
            time.sleep(60)
            return None, 0
        print(f"  Error: {e}")
        return False, 0

def generate_unit_dialogue(unit_num, lines, output_dir):
    """Generate English dialogue for a unit with speaker labels on first 2 lines only"""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    line_files = []
    total_chars = 0

    print(f"\nUnit {unit_num}: {len(lines)} lines")

    for i, line in enumerate(lines):
        speaker = line['speaker']
        english = line['en']

        # Speaker label only on first 2 lines
        if i < 2:
            text = f"{speaker}: {english}"
        else:
            text = english

        # Determine voice
        gender = SPEAKER_GENDER.get(speaker, 'male' if i % 2 == 0 else 'female')
        voice_id = VOICES[gender]

        line_path = output_dir / f"unit{unit_num:02d}_en_line{i:02d}.mp3"

        print(f"  [{i+1}/{len(lines)}] {text[:50]}...")

        audio, chars = generate_audio(text, voice_id)
        if audio is None:  # Rate limited, retry
            audio, chars = generate_audio(text, voice_id)
        if audio is False:
            print(f"  FAILED: {text[:30]}")
            continue

        save(audio, str(line_path))
        line_files.append(line_path)
        total_chars += chars

    # Combine into single file using ffmpeg
    if line_files:
        final_path = output_dir / f"unit{unit_num:02d}_dialogue_en.mp3"

        # Create file list for ffmpeg
        list_file = output_dir / f"unit{unit_num:02d}_list.txt"
        with open(list_file, 'w') as f:
            for lf in line_files:
                f.write(f"file '{lf.name}'\n")

        # Concatenate with ffmpeg
        try:
            subprocess.run([
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                '-i', str(list_file), '-c', 'copy', str(final_path)
            ], capture_output=True, check=True, cwd=output_dir)
            print(f"  -> {final_path.name} ({total_chars} chars)")
        except Exception as e:
            print(f"  ffmpeg error: {e}")

        # Cleanup individual files and list
        list_file.unlink(missing_ok=True)
        for lf in line_files:
            lf.unlink(missing_ok=True)

    return total_chars

def main():
    print("=" * 60)
    print("GENERATING ENGLISH DIALOGUE AUDIO")
    print("Speaker labels on lines 1-2 only")
    print("=" * 60)

    dialogues = extract_dialogues()
    print(f"Found {len(dialogues)} dialogues")

    checkpoint = load_checkpoint()
    completed = set(checkpoint['completed_units'])
    total_chars = checkpoint['chars_used']

    print(f"Already completed: {len(completed)} units, {total_chars} chars used")

    for unit_num in sorted(dialogues.keys()):
        if unit_num in completed:
            print(f"Unit {unit_num}: already done, skipping")
            continue

        chars = generate_unit_dialogue(unit_num, dialogues[unit_num], AUDIO_DIR)
        total_chars += chars

        completed.add(unit_num)
        checkpoint['completed_units'] = list(completed)
        checkpoint['chars_used'] = total_chars
        save_checkpoint(checkpoint)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {len(completed)} units, {total_chars:,} chars used")
    print("=" * 60)

if __name__ == '__main__':
    main()
