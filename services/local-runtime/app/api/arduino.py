from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

try:
    import serial.tools.list_ports as _list_ports  # type: ignore[import-untyped]
    _SERIAL_AVAILABLE = True
except ImportError:
    _SERIAL_AVAILABLE = False

router = APIRouter(prefix="/api/arduino", tags=["arduino"])

_KNOWN_BOARDS = {
    "esp32:esp32:esp32c5": "ESP32-C5 (SketchBot — default)",
    "esp32:esp32:esp32":   "ESP32 Dev Kit",
    "esp32:esp32:esp32s3": "ESP32-S3",
    "arduino:avr:uno":     "Arduino Uno (prototyping)",
    "arduino:avr:nano":    "Arduino Nano (prototyping)",
}


class FlashRequest(BaseModel):
    code: str
    port: Optional[str] = None
    fqbn: str = "esp32:esp32:esp32c5"


class FlashResponse(BaseModel):
    ok: bool
    message: str
    output: str = ""
    port_used: Optional[str] = None


@router.get("/ports")
def list_ports() -> dict:
    if not _SERIAL_AVAILABLE:
        return {"ports": [], "error": "pyserial not installed — run: pip install pyserial"}
    ports = []
    for p in _list_ports.comports():
        ports.append({
            "port": p.device,
            "description": p.description or "Unknown device",
            "hwid": p.hwid or "",
        })
    return {"ports": ports}


@router.get("/boards")
def list_boards() -> dict:
    return {"boards": [{"fqbn": k, "label": v} for k, v in _KNOWN_BOARDS.items()]}


@router.post("/flash", response_model=FlashResponse)
def flash_sketch(req: FlashRequest) -> FlashResponse:
    cli = shutil.which("arduino-cli")
    if not cli:
        return FlashResponse(
            ok=False,
            message=(
                "arduino-cli not found. "
                "Install it from https://arduino.cc/en/software (CLI tab) "
                "and make sure it is on your PATH."
            ),
        )

    code = req.code.strip()
    if not code:
        return FlashResponse(ok=False, message="No code to flash.")

    with tempfile.TemporaryDirectory() as tmpdir:
        sketch_name = "sketchbot_sketch"
        sketch_dir = os.path.join(tmpdir, sketch_name)
        os.makedirs(sketch_dir)
        sketch_file = os.path.join(sketch_dir, f"{sketch_name}.ino")

        with open(sketch_file, "w", encoding="utf-8") as fh:
            fh.write(code)

        # ── Compile ──────────────────────────────────────────────────────────
        try:
            compile_result = subprocess.run(
                [cli, "compile", "--fqbn", req.fqbn, sketch_dir],
                capture_output=True,
                text=True,
                timeout=120,
            )
        except subprocess.TimeoutExpired:
            return FlashResponse(ok=False, message="Compilation timed out (120 s).")
        except Exception as exc:
            return FlashResponse(ok=False, message=f"Compiler error: {exc}")

        combined = (compile_result.stdout + "\n" + compile_result.stderr).strip()

        if compile_result.returncode != 0:
            return FlashResponse(ok=False, message="Compilation failed — see output below.", output=combined)

        # ── Auto-detect port if none provided ─────────────────────────────────
        port = req.port
        if not port and _SERIAL_AVAILABLE:
            candidates = list(_list_ports.comports())
            port = candidates[0].device if candidates else None

        if not port:
            return FlashResponse(
                ok=True,
                message="Compiled successfully! Connect your Arduino, select a port, and flash again.",
                output=combined,
            )

        # ── Upload ───────────────────────────────────────────────────────────
        try:
            upload_result = subprocess.run(
                [cli, "upload", "-p", port, "--fqbn", req.fqbn, sketch_dir],
                capture_output=True,
                text=True,
                timeout=60,
            )
        except subprocess.TimeoutExpired:
            return FlashResponse(ok=False, message="Upload timed out (60 s).", output=combined, port_used=port)
        except Exception as exc:
            return FlashResponse(ok=False, message=f"Upload error: {exc}", output=combined, port_used=port)

        full_output = (combined + "\n" + upload_result.stdout + "\n" + upload_result.stderr).strip()

        if upload_result.returncode != 0:
            return FlashResponse(ok=False, message="Upload failed — see output below.", output=full_output, port_used=port)

        return FlashResponse(
            ok=True,
            message=f"Sketch compiled and flashed to {port}!",
            output=full_output,
            port_used=port,
        )
