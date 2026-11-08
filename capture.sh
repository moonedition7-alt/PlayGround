#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL to capture}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an evidence directory outside the project}"
[[ "$CAPTURE_URL" == http://* || "$CAPTURE_URL" == https://* ]] || { echo 'CAPTURE_URL must be an absolute HTTP(S) URL.' >&2; exit 1; }

printf '[timing] create capture directory: start\n'
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
printf '[timing] browser capture: start\n'
# The runtime capture owns and closes its Playwright browser, waits for rendered content,
# and assigns exit 75 to transient browser/navigation infrastructure failures.
/usr/bin/time -p env CAPTURE_STRICT=1 node "${RUNTIME_DIR:?}/scripts/default-capture.mjs"
