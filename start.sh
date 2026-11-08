#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "PORT must be numeric: $PORT" >&2; exit 1; }

# Keep command timings visible in the startup log, including foreground server runtime.
timed() {
  local label="$1"
  shift
  printf '[timing] %s: start\n' "$label"
  /usr/bin/time -p "$@"
}

if [[ ! -x node_modules/.bin/vite || ! -f node_modules/.package-lock.json ]] || [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
  timed 'npm ci' npm ci --no-audit --no-fund
fi

build_needed=0
if [[ ! -f dist/index.html ]]; then
  build_needed=1
elif [[ index.html -nt dist/index.html || package.json -nt dist/index.html || package-lock.json -nt dist/index.html || vite.config.js -nt dist/index.html || tailwind.config.js -nt dist/index.html || postcss.config.js -nt dist/index.html ]]; then
  build_needed=1
elif [[ -d src ]] && find src -type f -newer dist/index.html -print -quit | grep -q .; then
  build_needed=1
fi
if [[ "$build_needed" == 1 ]]; then
  timed 'npm run build' npm run build
fi

[[ -f dist/index.html ]] || { echo 'Build did not produce dist/index.html' >&2; exit 1; }
metadata_file="/home/runner/work/_temp/omgithub-web/deployment-output.json"
metadata_dir="$(dirname "$metadata_file")"
timed 'mkdir deployment metadata directory' mkdir -p "$metadata_dir"
if [[ -n "${OPENCODE_WEB_DIR:-}" && "$OPENCODE_WEB_DIR" != "$metadata_dir" ]]; then
  timed 'mkdir runtime metadata directory' mkdir -p "$OPENCODE_WEB_DIR"
fi
timed 'write deployment-output.json' env METADATA_FILE="$metadata_file" RUNTIME_METADATA_DIR="${OPENCODE_WEB_DIR:-}" node -e 'const fs=require("node:fs");const path=require("node:path");const project=process.cwd();const data=JSON.stringify({project,directory:path.resolve(project,"dist")})+"\n";for(const dir of new Set([path.dirname(process.env.METADATA_FILE),process.env.RUNTIME_METADATA_DIR].filter(Boolean))){fs.writeFileSync(path.join(dir,"deployment-output.json"),data)}'

timed 'vite preview server' npm run preview -- --host 0.0.0.0 --port "$PORT" --strictPort
