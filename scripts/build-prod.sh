#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# SaySpark Desktop — production build pipeline
# Usage: bash scripts/build-prod.sh
# Output: apps/desktop/dist/  (NSIS installer + unpacked dir)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/services/local-runtime"
VENV_DIR="$RUNTIME_DIR/.venv"
DESKTOP_DIR="$ROOT/apps/desktop"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

# Convert a Unix path to a Windows path for .exe arguments (WSL or Git Bash)
win_path() {
  if command -v wslpath &>/dev/null; then wslpath -w "$1"
  elif command -v cygpath &>/dev/null; then cygpath -w "$1"
  else echo "$1"
  fi
}

# ── 1. Python venv ────────────────────────────────────────────────────────────
step "Setting up Python venv (headless OpenCV)"

# Find a system Python (never the venv itself — its pip launchers may be broken)
SYS_PYTHON=""
for candidate in \
    "$(command -v python3 2>/dev/null)" \
    "$(command -v python 2>/dev/null)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    SYS_PYTHON="$candidate"
    break
  fi
done
[ -z "$SYS_PYTHON" ] && die "Python 3 not found. Install Python 3.11+ and re-run."

# If the venv exists but its pip launcher is broken (stale hardcoded path),
# recreate it cleanly using the system Python.
if [ -d "$VENV_DIR" ]; then
  if [ -f "$VENV_DIR/Scripts/python.exe" ]; then
    VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
  else
    VENV_PYTHON="$VENV_DIR/bin/python"
  fi
  # Test by running python -m pip — if it fails the venv is corrupt, nuke it.
  if ! "$VENV_PYTHON" -m pip --version &>/dev/null; then
    warn "Venv pip is broken (stale launcher). Recreating venv…"
    rm -rf "$VENV_DIR"
  fi
fi

if [ ! -d "$VENV_DIR" ]; then
  step "Creating venv at $VENV_DIR"
  "$SYS_PYTHON" -m venv "$(win_path "$VENV_DIR")"
fi

# Always use  python -m pip  — bypasses the .exe launcher stubs entirely
if [ -f "$VENV_DIR/Scripts/python.exe" ]; then
  VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
else
  VENV_PYTHON="$VENV_DIR/bin/python"
fi

# Remove full opencv if present (replaces it with headless)
if "$VENV_PYTHON" -m pip show opencv-python &>/dev/null; then
  warn "Removing opencv-python (full) → replacing with headless"
  "$VENV_PYTHON" -m pip uninstall opencv-python -y
fi

step "Installing Python deps from requirements.txt"
"$VENV_PYTHON" -m pip install --upgrade pip --quiet
"$VENV_PYTHON" -m pip install -r "$(win_path "$RUNTIME_DIR/requirements.txt")" --quiet
ok "Python venv ready ($(du -sh "$VENV_DIR" | cut -f1) on disk)"

# ── 1b. Generate app icon ─────────────────────────────────────────────────────
step "Generating app icon"
"$VENV_PYTHON" "$(win_path "$ROOT/apps/desktop/electron/gen-icon.py")"

# ── 2. Renderer (Next.js static export) ──────────────────────────────────────
step "Installing renderer npm deps"
npm --prefix "$(win_path "$DESKTOP_DIR/renderer")" install --prefer-offline

step "Building Next.js renderer (next build → out/)"
npm --prefix "$(win_path "$DESKTOP_DIR/renderer")" run build
ok "Renderer built → apps/desktop/renderer/out/"

# ── 3. Desktop npm deps ───────────────────────────────────────────────────────
step "Installing desktop npm deps"
npm --prefix "$(win_path "$DESKTOP_DIR")" install --prefer-offline

# ── 4. electron-builder ───────────────────────────────────────────────────────
step "Packaging with electron-builder → apps/desktop/dist/"
cd "$DESKTOP_DIR"
npx electron-builder --win

INSTALLER=$(find "$DESKTOP_DIR/dist" -name "*.exe" -not -path "*/win-unpacked/*" | head -1)
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Build complete!${NC}"
if [ -n "$INSTALLER" ]; then
  SIZE=$(du -sh "$INSTALLER" | cut -f1)
  echo -e "${GREEN}  Installer : $INSTALLER${NC}"
  echo -e "${GREEN}  Size      : $SIZE${NC}"
fi
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
