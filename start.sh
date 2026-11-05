#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
STATIC_DIR="$FRONTEND_DIR/out"
PORT="${PORT:-3000}"
export PORT STATIC_DIR

run_timed() {
  /usr/bin/time -p "$@"
}

TIMEFORMAT='real %3R user %3U sys %3S'
time cd "$PROJECT_DIR"
run_timed test -f "$FRONTEND_DIR/package.json"
run_timed test -f "$FRONTEND_DIR/package-lock.json"
run_timed mkdir -p "$OPENCODE_WEB_DIR"

# Install from the lockfile and produce Next.js's static export in frontend/out.
run_timed npm --prefix "$FRONTEND_DIR" ci
run_timed npm --prefix "$FRONTEND_DIR" run build
run_timed test -s "$STATIC_DIR/index.html"

# The deployment metadata is worker state; all generated assets stay in the project.
run_timed /usr/bin/printf '{"project":"%s","directory":"%s"}\n' "$PROJECT_DIR" "$STATIC_DIR" > "$OPENCODE_WEB_DIR/deployment-output.json"

# Keep the server process in the foreground for the runtime's app-server session.
run_timed node "$PROJECT_DIR/static-server.mjs"
