#!/usr/bin/env python3
"""
BLM - Business Language Modeling Tool
用法: python bml.py
"""

import os
from dataclasses import dataclass
from pathlib import Path

from bml_core.server import run_server


PORT = 8888
ROOT = Path(__file__).parent


@dataclass(frozen=True)
class RuntimeConfig:
    port: int
    app_dir: Path
    workspace_dir: Path
    open_browser: bool


def _read_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", ""}


def _resolve_path(root: Path, value: str | None, fallback: Path) -> Path:
    if not value:
        return fallback
    path = Path(value)
    if path.is_absolute():
        return path
    return root / path


def build_runtime_config() -> RuntimeConfig:
    port_text = (os.getenv("BML_PORT") or str(PORT)).strip()
    try:
        port = int(port_text)
    except ValueError as exc:
        raise ValueError("BML_PORT 必须是整数") from exc

    app_dir = _resolve_path(ROOT, os.getenv("BML_APP_DIR"), ROOT / "app")
    workspace_dir = _resolve_path(ROOT, os.getenv("BML_WORKSPACE_DIR"), ROOT / "workspace")
    open_browser = not _read_bool_env("BML_NO_BROWSER", False)
    return RuntimeConfig(
        port=port,
        app_dir=app_dir,
        workspace_dir=workspace_dir,
        open_browser=open_browser,
    )


if __name__ == "__main__":
    config = build_runtime_config()
    run_server(
        port=config.port,
        app_dir=config.app_dir,
        workspace_dir=config.workspace_dir,
        open_browser=config.open_browser,
    )
