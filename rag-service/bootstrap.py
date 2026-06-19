#!/usr/bin/env python3
"""Create a local virtual environment and install RAG service dependencies."""

import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / ".venv"


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def main() -> None:
    if not VENV_DIR.exists():
        create_venv()

    python = venv_python()
    if not pip_available(python):
        print("pip is missing from the virtual environment; trying ensurepip")
        ensure_pip(python)

    if not pip_available(python):
        print("Existing virtual environment is missing pip; recreating it")
        shutil.rmtree(VENV_DIR)
        create_venv()
        python = venv_python()
        ensure_pip(python)

    if not pip_available(python):
        print("Could not install pip into the virtual environment.")
        print("On Ubuntu, run: sudo apt update && sudo apt install python3-venv python3-full")
        print("Then retry: npm run setup:rag")
        sys.exit(1)

    print("Installing RAG service dependencies")
    subprocess.check_call([
        str(python),
        "-m",
        "pip",
        "install",
        "-r",
        str(ROOT / "requirements.txt"),
    ])

    print(f"RAG environment is ready: {python}")


def create_venv() -> None:
    print(f"Creating virtual environment at {VENV_DIR}")
    venv.EnvBuilder(with_pip=True).create(VENV_DIR)


def pip_available(python: Path) -> bool:
    return subprocess.run(
        [str(python), "-m", "pip", "--version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def ensure_pip(python: Path) -> None:
    subprocess.run(
        [str(python), "-m", "ensurepip", "--upgrade"],
        check=False,
    )


if __name__ == "__main__":
    main()
