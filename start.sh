#!/usr/bin/env bash
# PANDA AI STUDIO — project start script (static deployment).
# - Keeps source and built output inside PROJECT_DIR (./public -> ./dist).
# - Uses OPENCODE_WEB_DIR / RUNNER_TEMP only for worker metadata (deployment-output.json).
# - Serves the built static directory in the FOREGROUND on PORT (default 3000).
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
DIST_DIR="$PROJECT_DIR/dist"
OUT_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"

test -f public/index.html
# Install + build only when the project actually needs it (vite/next build script).
if test -f package.json && /usr/bin/time -p node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.build?0:1)"; then
  /usr/bin/time -p npm install --no-audit --no-fund
  /usr/bin/time -p npm run build
else
  echo 'No build script; syncing public/ -> dist/.'
fi
/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p cp -r public/. "$DIST_DIR"/
test -f "$DIST_DIR/index.html"
/usr/bin/time -p mkdir -p "$OUT_DIR"
/usr/bin/time -p node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({project: process.argv[2], directory: process.argv[3]}))" "$OUT_DIR/deployment-output.json" "$PROJECT_DIR" "$DIST_DIR"
/usr/bin/time -p cat "$OUT_DIR/deployment-output.json"
echo
echo "Serving $DIST_DIR on port $PORT (foreground)."
exec /usr/bin/time -p node -e "
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[1], port = Number(process.argv[2]);
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.mp4':'video/mp4','.woff2':'font/woff2'};
http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (p !== path.resolve(root) && !p.startsWith(path.resolve(root) + path.sep)) { res.writeHead(404); res.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) p = path.join(root, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(p)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(p).pipe(res);
  } catch (e) { res.writeHead(500); res.end('error'); }
}).listen(port, '0.0.0.0', () => console.log('PANDA static server listening on ' + port));
" "$DIST_DIR" "$PORT"
