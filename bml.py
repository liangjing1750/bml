#!/usr/bin/env python3
"""
BML - Business Modeling Language Tool
用法: python bml.py
"""

from pathlib import Path

from bml_core.server import run_server


PORT = 8888
ROOT = Path(__file__).parent


if __name__ == "__main__":
    run_server(
        port=PORT,
        app_dir=ROOT / "app",
        workspace_dir=ROOT / "workspace",
    )
