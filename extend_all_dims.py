"""
Master Script: Extend all existing data in state.json with dimension metadata

This script runs all extension operations in the correct order:
1. batch_generate_v2_variants.py - Extend all images with missing variants + dimensions
2. extend_youtube_dims.py - Add YouTube standard dimensions (1280×720)
3. extend_instagram_videos_dims.py - Add Instagram video dimensions (extract with ffprobe or use standard)

Usage:
    python extend_all_dims.py [--skip-images] [--skip-youtube] [--skip-videos]

Options:
    --skip-images    Skip image extension
    --skip-youtube   Skip YouTube extension
    --skip-videos    Skip Instagram video extension
"""

import subprocess
import sys
import os

def run_script(script_name, description, args=None):
    """Run a Python script and track success"""
    print(f"\n{'='*60}")
    print(f"STEP: {description}")
    print(f"{'='*60}")
    
    cmd = [sys.executable, script_name]
    if args:
        cmd.extend(args)
        
    try:
        # Use sys.executable to run Python script in same interpreter
        result = subprocess.run(
            cmd,
            cwd=os.path.dirname(os.path.abspath(__file__)) or '.'
        )
        
        if result.returncode != 0:
            print(f"\n⚠ Script {script_name} exited with code {result.returncode}")
            return False
        return True
    except FileNotFoundError:
        print(f"\n[ERROR] Script {script_name} not found!")
        return False
    except Exception as e:
        print(f"\n[ERROR] Failed to run {script_name}: {e}")
        return False

def main():
    # Parse arguments
    skip_images = '--skip-images' in sys.argv
    skip_youtube = '--skip-youtube' in sys.argv
    skip_videos = '--skip-videos' in sys.argv
    force = '--force' in sys.argv
    
    print("""
╔════════════════════════════════════════════════════════════╗
║     EXTEND ALL DIMENSIONS - Master Script                 ║
║                                                            ║
║  This will extend all existing data in data/state.json     ║
║  with image/video dimension metadata.                      ║
╚════════════════════════════════════════════════════════════╝
""")
    
    results = {}
    
    # Step 1: Images
    if not skip_images:
        results['images'] = run_script(
            'batch_generate_v2_variants.py',
            'Extend All Images (variants + dimensions)'
        )
    else:
        print("\n[SKIPPED] Image extension (--skip-images)")
        results['images'] = None
    
    # Step 2: YouTube
    if not skip_youtube:
        results['youtube'] = run_script(
            'extend_youtube_dims.py',
            'Add YouTube Standard Dimensions (1280×720)'
        )
    else:
        print("\n[SKIPPED] YouTube extension (--skip-youtube)")
        results['youtube'] = None
    
    # Step 3: Instagram Videos
    if not skip_videos:
        video_args = ['--force'] if force else []
        results['videos'] = run_script(
            'extend_instagram_videos_dims.py',
            'Add Instagram Video Dimensions',
            args=video_args
        )
    else:
        print("\n[SKIPPED] Instagram video extension (--skip-videos)")
        results['videos'] = None
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    
    if results['images'] is not None:
        status = "✅ SUCCESS" if results['images'] else "❌ FAILED"
        print(f"  Images (batch_generate_v2_variants.py):  {status}")
    
    if results['youtube'] is not None:
        status = "✅ SUCCESS" if results['youtube'] else "❌ FAILED"
        print(f"  YouTube (extend_youtube_dims.py):       {status}")
    
    if results['videos'] is not None:
        status = "✅ SUCCESS" if results['videos'] else "❌ FAILED"
        print(f"  Videos (extend_instagram_videos_dims.py): {status}")
    
    # Check if all completed successfully
    completed = [r for r in results.values() if r is not None]
    if completed and all(completed):
        print(f"\n🎉 ALL STEPS COMPLETED SUCCESSFULLY!")
        print(f"   Your data/state.json has been extended with dimensions.")
        print(f"\n   Next: Reload the editor and verify the data.")
        return 0
    elif completed:
        print(f"\n⚠ SOME STEPS FAILED - Check output above")
        return 1
    else:
        print(f"\n⚠ ALL STEPS SKIPPED - Run without --skip-* flags")
        return 1

if __name__ == "__main__":
    sys.exit(main())
