#!/usr/bin/env python
"""Build script for PyInstaller (onedir mode)."""

import shutil
import subprocess
import sys

from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
FASTAPI_DIR = PROJECT_ROOT / "fastapi"


def main():
    """Build the FastAPI server directory bundle with PyInstaller."""
    # onedir output goes to tauri/sidecar/fastapi-server/
    sidecar_dir = PROJECT_ROOT / "tauri" / "sidecar"
    output_dir = sidecar_dir / "fastapi-server"

    print("Building FastAPI server (onedir)...")
    print(f"  Output: {output_dir}")

    sidecar_dir.mkdir(parents=True, exist_ok=True)

    # Clean previous build so PyInstaller doesn't skip files
    if output_dir.exists():
        shutil.rmtree(output_dir)

    result = subprocess.run(
        [
            "uv",
            "run",
            "pyinstaller",
            "specs/fastapi-server.spec",
            "--distpath",
            str(sidecar_dir),
            "--workpath",
            str(FASTAPI_DIR / "build"),
            "--noconfirm",
        ],
        cwd=FASTAPI_DIR,
        check=False,
    )

    if result.returncode != 0:
        print("Build failed!")
        sys.exit(1)

    if output_dir.exists():
        print(f"✅ Build complete: {output_dir}")
    else:
        print(f"❌ Build failed: directory not found at {output_dir}")
        sys.exit(1)


if __name__ == "__main__":
    main()
