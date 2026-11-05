#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must point to worker metadata}"
: "${RUNTIME_DIR:?RUNTIME_DIR must point to the OMGithub runtime}"
PORT="${PORT:-3000}"
export PORT

cd "$PROJECT_DIR"
/usr/bin/time -p mkdir -p "$PROJECT_DIR/dist" "$OPENCODE_WEB_DIR"
# Serve the checked-in studio UI from dist/. It submits jobs to the separately
# running FastAPI backend (see README.md); do not regenerate a stale preview here.

# Serve only the built directory (never the repository root) and publish its
# absolute path for the preview controller.
/usr/bin/time -p node -e '
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const project = process.cwd();
const directory = path.resolve(project, "dist");
const metadata = path.resolve(process.env.OPENCODE_WEB_DIR, "deployment-output.json");
fs.writeFileSync(metadata, JSON.stringify({ project, directory }));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  const target = path.resolve(directory, "." + pathname);
  if (target !== directory && !target.startsWith(directory + path.sep)) { response.writeHead(403).end("Forbidden"); return; }
  let file = target;
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); }
  catch { response.writeHead(404).end("Not found"); return; }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    response.end(content);
  });
}).listen(Number(process.env.PORT || 3000), "0.0.0.0");
'
