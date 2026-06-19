#!/usr/bin/env python3
"""Run the RAG service from its local virtual environment."""

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / ".venv"


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def main() -> None:
    python = venv_python()

    if not python.exists():
        subprocess.check_call([sys.executable, str(ROOT / "bootstrap.py")])

    os.execv(str(python), [str(python), str(ROOT / "start.py"), *sys.argv[1:]])


if __name__ == "__main__":
    main()
