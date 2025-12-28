#!/usr/bin/env python3
"""
ElevenLabs Audio Generator for Rhodes French

Generates audio from manifests created by generate_manifests.py
- Drills: French + English for top 20 drills per unit (9-24)
- Dialogues: English only with speaker labels on first 2 lines per unit

Features:
- Checkpointing: resumes from where it left off
- Verification: compares output to manifest
- Rate limit handling: waits and retries
- Dry run mode: shows what would be generated without API calls

Usage:
  python generate_audio.py --drills      # Generate drill audio
  python generate_audio.py --dialogues   # Generate dialogue audio
  python generate_audio.py --verify      # Verify generated audio matches manifests
  python generate_audio.py --dry-run     # Show what would be generated
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
AUDIO_DIR = SCRIPT_DIR.parent / 'audio'
DRILLS_AUDIO_DIR = AUDIO_DIR / 'drills'

# Checkpoint files
DRILL_CHECKPOINT = SCRIPT_DIR / 'drill_checkpoint.json'
DIALOGUE_CHECKPOINT = SCRIPT_DIR / 'dialogue_checkpoint.json'

# Manifests
DRILL_MANIFEST = SCRIPT_DIR / 'drill_manifest.json'
DIALOGUE_MANIFEST = SCRIPT_DIR / 'dialogue_manifest.json'

# Voice IDs (same as original scripts)
VOICES = {
    'french_male': 'necQJzI1X0vLpdnJteap',    # Mr. Laurent
    'french_female': 'm5U7XCsc8v988k2RJAqN',  # Manon
    'british_male': 'N2lVS1w4EtoT3dr4eOWO',   # Harry - British
    'british_female': 'EXAVITQu4vr4xnSDxMaL', # Bella - British
}

def get_api_key():
    """Get ElevenLabs API key from environment"""
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key:
        print("ERROR: Set ELEVENLABS_API_KEY environment variable!")
        print("  Linux: export ELEVENLABS_API_KEY=your_key_here")
        print("  Windows: set ELEVENLABS_API_KEY=your_key_here")
        sys.exit(1)
    return key

def get_client():
    """Initialize ElevenLabs client"""
    from elevenlabs import ElevenLabs
    return ElevenLabs(api_key=get_api_key())

def load_checkpoint(path):
    """Load checkpoint file"""
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'completed': [], 'failed': [], 'chars_used': 0}

def save_checkpoint(path, checkpoint):
    """Save checkpoint file"""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, indent=2)

def load_manifest(path):
    """Load manifest file"""
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_audio(client, text, voice_id, output_path, max_retries=3):
    """Generate audio with rate limit handling and retries"""
    from elevenlabs import save

    for attempt in range(max_retries):
        try:
            audio = client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id="eleven_multilingual_v2",
                voice_settings={"stability": 0.5, "similarity_boost": 0.75}
            )
            save(audio, str(output_path))
            return True, len(text)

        except Exception as e:
            error_str = str(e).lower()

            # Rate limit - wait and retry
            if 'rate' in error_str or '429' in error_str:
                wait_time = 60 * (attempt + 1)
                print(f"    Rate limited, waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            # Other error - log and fail
            print(f"    ERROR: {e}")
            return False, 0

    return False, 0

def generate_drills(dry_run=False):
    """Generate drill audio (French + English)"""
    print("\n" + "=" * 60)
    print("GENERATING DRILL AUDIO")
    print("=" * 60)

    manifest = load_manifest(DRILL_MANIFEST)
    checkpoint = load_checkpoint(DRILL_CHECKPOINT)

    completed = set(checkpoint['completed'])
    chars_used = checkpoint['chars_used']

    print(f"Manifest: {len(manifest['drills'])} drills")
    print(f"Already completed: {len(completed)}")
    print(f"Characters used so far: {chars_used:,}")

    if dry_run:
        print("\n[DRY RUN - No audio will be generated]\n")

    DRILLS_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    if not dry_run:
        client = get_client()

    for i, drill in enumerate(manifest['drills']):
        drill_id = drill['id']

        # Skip if already completed
        if drill_id in completed:
            continue

        french = drill['french']
        english = drill['english']

        print(f"\n[{i+1}/{len(manifest['drills'])}] {drill_id}")
        print(f"  FR: {french[:50]}...")
        print(f"  EN: {english[:50]}...")

        if dry_run:
            print(f"  Would generate: {drill_id}_fr.mp3, {drill_id}_en.mp3")
            continue

        # Generate French audio
        fr_path = DRILLS_AUDIO_DIR / f"{drill_id}_fr.mp3"
        if not fr_path.exists():
            print(f"  Generating French...")
            success, chars = generate_audio(client, french, VOICES['french_male'], fr_path)
            if not success:
                checkpoint['failed'].append(f"{drill_id}_fr")
                save_checkpoint(DRILL_CHECKPOINT, checkpoint)
                continue
            chars_used += chars

        # Generate English audio
        en_path = DRILLS_AUDIO_DIR / f"{drill_id}_en.mp3"
        if not en_path.exists():
            print(f"  Generating English...")
            success, chars = generate_audio(client, english, VOICES['british_male'], en_path)
            if not success:
                checkpoint['failed'].append(f"{drill_id}_en")
                save_checkpoint(DRILL_CHECKPOINT, checkpoint)
                continue
            chars_used += chars

        # Mark complete
        completed.add(drill_id)
        checkpoint['completed'] = list(completed)
        checkpoint['chars_used'] = chars_used

        # Save checkpoint every 5 drills
        if len(completed) % 5 == 0:
            save_checkpoint(DRILL_CHECKPOINT, checkpoint)
            print(f"  [Checkpoint: {len(completed)} done, {chars_used:,} chars]")

    save_checkpoint(DRILL_CHECKPOINT, checkpoint)

    print("\n" + "=" * 60)
    print(f"DRILL GENERATION COMPLETE")
    print(f"  Completed: {len(completed)}/{len(manifest['drills'])}")
    print(f"  Characters used: {chars_used:,}")
    print(f"  Failed: {len(checkpoint['failed'])}")
    print("=" * 60)

def generate_dialogues(dry_run=False):
    """Generate English dialogue audio"""
    print("\n" + "=" * 60)
    print("GENERATING DIALOGUE AUDIO (English)")
    print("=" * 60)

    manifest = load_manifest(DIALOGUE_MANIFEST)
    checkpoint = load_checkpoint(DIALOGUE_CHECKPOINT)

    completed_units = set(checkpoint['completed'])
    chars_used = checkpoint['chars_used']

    print(f"Manifest: {manifest['total_units']} units, {manifest['total_lines']} lines")
    print(f"Already completed: {len(completed_units)} units")
    print(f"Characters used so far: {chars_used:,}")

    if dry_run:
        print("\n[DRY RUN - No audio will be generated]\n")

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    if not dry_run:
        client = get_client()

    for unit_data in manifest['units']:
        unit_num = unit_data['unit']

        # Skip if already completed
        if unit_num in completed_units:
            continue

        print(f"\nUnit {unit_num}: {len(unit_data['lines'])} lines")

        if dry_run:
            for line in unit_data['lines']:
                label = "[+speaker]" if line['has_speaker_label'] else "[no label]"
                print(f"  {label} {line['text_to_speak'][:50]}...")
            print(f"  Would generate: unit{unit_num:02d}_dialogue_en.mp3")
            continue

        # Generate each line as separate file, then combine
        line_files = []
        unit_chars = 0

        for line in unit_data['lines']:
            text = line['text_to_speak']
            line_idx = line['index']

            line_path = AUDIO_DIR / f"temp_unit{unit_num:02d}_line{line_idx:02d}_en.mp3"

            # Alternate voices for dialogue feel
            voice = VOICES['british_male'] if line_idx % 2 == 0 else VOICES['british_female']

            print(f"  Line {line_idx}: {text[:40]}...")
            success, chars = generate_audio(client, text, voice, line_path)

            if not success:
                checkpoint['failed'].append(f"unit{unit_num}_line{line_idx}_en")
                # Clean up temp files
                for f in line_files:
                    if f.exists():
                        f.unlink()
                save_checkpoint(DIALOGUE_CHECKPOINT, checkpoint)
                continue

            line_files.append(line_path)
            unit_chars += chars

        if not line_files:
            continue

        # Combine line files into single dialogue file
        final_path = AUDIO_DIR / f"unit{unit_num:02d}_dialogue_en.mp3"

        try:
            import subprocess
            # Use ffmpeg to concatenate
            # Create file list
            list_path = AUDIO_DIR / f"temp_concat_unit{unit_num:02d}.txt"
            with open(list_path, 'w') as f:
                for lf in line_files:
                    f.write(f"file '{lf.name}'\n")

            subprocess.run([
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                '-i', str(list_path), '-c', 'copy', str(final_path)
            ], capture_output=True, cwd=str(AUDIO_DIR))

            # Clean up temp files
            list_path.unlink()
            for lf in line_files:
                lf.unlink()

            print(f"  -> {final_path.name} ({unit_chars} chars)")

        except Exception as e:
            print(f"  ERROR combining audio: {e}")
            checkpoint['failed'].append(f"unit{unit_num}_combine")
            save_checkpoint(DIALOGUE_CHECKPOINT, checkpoint)
            continue

        # Mark complete
        chars_used += unit_chars
        completed_units.add(unit_num)
        checkpoint['completed'] = list(completed_units)
        checkpoint['chars_used'] = chars_used
        save_checkpoint(DIALOGUE_CHECKPOINT, checkpoint)

    print("\n" + "=" * 60)
    print(f"DIALOGUE GENERATION COMPLETE")
    print(f"  Completed: {len(completed_units)}/{manifest['total_units']} units")
    print(f"  Characters used: {chars_used:,}")
    print(f"  Failed: {len(checkpoint['failed'])}")
    print("=" * 60)

def verify_audio():
    """Verify generated audio matches manifests"""
    print("\n" + "=" * 60)
    print("VERIFYING GENERATED AUDIO")
    print("=" * 60)

    # Verify drills
    print("\n[Drills]")
    drill_manifest = load_manifest(DRILL_MANIFEST)
    drill_missing = []

    for drill in drill_manifest['drills']:
        drill_id = drill['id']
        fr_path = DRILLS_AUDIO_DIR / f"{drill_id}_fr.mp3"
        en_path = DRILLS_AUDIO_DIR / f"{drill_id}_en.mp3"

        if not fr_path.exists():
            drill_missing.append(f"{drill_id}_fr.mp3")
        if not en_path.exists():
            drill_missing.append(f"{drill_id}_en.mp3")

    if drill_missing:
        print(f"  MISSING: {len(drill_missing)} files")
        for m in drill_missing[:10]:
            print(f"    - {m}")
        if len(drill_missing) > 10:
            print(f"    ... and {len(drill_missing) - 10} more")
    else:
        print(f"  OK: All {len(drill_manifest['drills']) * 2} drill audio files exist")

    # Verify dialogues
    print("\n[Dialogues]")
    dialogue_manifest = load_manifest(DIALOGUE_MANIFEST)
    dialogue_missing = []

    for unit_data in dialogue_manifest['units']:
        unit_num = unit_data['unit']
        en_path = AUDIO_DIR / f"unit{unit_num:02d}_dialogue_en.mp3"

        if not en_path.exists():
            dialogue_missing.append(f"unit{unit_num:02d}_dialogue_en.mp3")

    if dialogue_missing:
        print(f"  MISSING: {len(dialogue_missing)} files")
        for m in dialogue_missing:
            print(f"    - {m}")
    else:
        print(f"  OK: All {len(dialogue_manifest['units'])} dialogue audio files exist")

    print("\n" + "=" * 60)

def main():
    parser = argparse.ArgumentParser(description="Generate ElevenLabs audio from manifests")
    parser.add_argument('--drills', action='store_true', help='Generate drill audio')
    parser.add_argument('--dialogues', action='store_true', help='Generate dialogue audio')
    parser.add_argument('--verify', action='store_true', help='Verify generated audio')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be generated')
    parser.add_argument('--reset', action='store_true', help='Reset checkpoints')
    args = parser.parse_args()

    if args.reset:
        if DRILL_CHECKPOINT.exists():
            DRILL_CHECKPOINT.unlink()
            print("Reset drill checkpoint")
        if DIALOGUE_CHECKPOINT.exists():
            DIALOGUE_CHECKPOINT.unlink()
            print("Reset dialogue checkpoint")
        return

    if args.verify:
        verify_audio()
        return

    if not args.drills and not args.dialogues:
        parser.print_help()
        print("\nSpecify --drills, --dialogues, or both")
        return

    if args.drills:
        generate_drills(dry_run=args.dry_run)

    if args.dialogues:
        generate_dialogues(dry_run=args.dry_run)

if __name__ == '__main__':
    main()
