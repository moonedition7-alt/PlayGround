#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$PWD"
/usr/bin/time -p pwd
DIST_DIR="$PROJECT_DIR/dist"
PORT="${PORT:-3000}"
DEPLOY_JSON_FIXED="/home/runner/work/_temp/omgithub-web/deployment-output.json"
/usr/bin/time -p test -d "$PROJECT_DIR/racing-game"
/usr/bin/time -p test -f "$PROJECT_DIR/racing-game/index.html"
/usr/bin/time -p rm -rf "$DIST_DIR"
/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p cp -r "$PROJECT_DIR/racing-game/." "$DIST_DIR/"
/usr/bin/time -p test -f "$DIST_DIR/index.html"
/usr/bin/time -p chmod -R a+r "$DIST_DIR"
/usr/bin/time -p mkdir -p "$(dirname "$DEPLOY_JSON_FIXED")"
/usr/bin/time -p bash -c 'printf "%s" "{\"project\":\"/home/runner/work/PlayGround/PlayGround\",\"directory\":\"/home/runner/work/PlayGround/PlayGround/dist\"}" > "/home/runner/work/_temp/omgithub-web/deployment-output.json"'
if [ -n "${OPENCODE_WEB_DIR:-}" ] && [ "$OPENCODE_WEB_DIR/deployment-output.json" != "$DEPLOY_JSON_FIXED" ]; then
  /usr/bin/time -p mkdir -p "$OPENCODE_WEB_DIR"
  /usr/bin/time -p cp "$DEPLOY_JSON_FIXED" "$OPENCODE_WEB_DIR/deployment-output.json"
fi
/usr/bin/time -p bash -c 'cat "/home/runner/work/_temp/omgithub-web/deployment-output.json"; echo'
echo "Serving $DIST_DIR on port $PORT"
/usr/bin/time -p python3 --version
exec /usr/bin/time -p python3 -m http.server "$PORT" --directory "$DIST_DIR" --bind 0.0.0.0
