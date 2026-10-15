#!/usr/bin/env bash
# PANDA AI STUDIO — capture script.
# Env: CAPTURE_URL (exact URL to open), CAPTURE_DIR (output dir for
#      final-desktop.png + final-mobile.png). Keeps output outside source,
#      leaves the app running, closes its own browser.
# Exit 75: temporary navigation/browser infrastructure failures.
# Exit 1:  script or rendering defects.
set -euo pipefail
cd "$(dirname "$0")"

URL="${CAPTURE_URL:?Set CAPTURE_URL}"
OUT="${CAPTURE_DIR:?Set CAPTURE_DIR}"
/usr/bin/time -p mkdir -p "$OUT"
/usr/bin/time -p test -n "$URL"

# Extra guard: refuse to write captures inside the project source.
/usr/bin/time -p node -e "
const path = require('path');
const proj = path.resolve(process.argv[1]), out = path.resolve(process.argv[2]);
if (out === proj || out.startsWith(proj + path.sep)) { console.error('CAPTURE_DIR must be outside the project source: ' + out); process.exit(1); }
" "$(pwd)" "$OUT"

/usr/bin/time -p node <<'NODE_EOF'
const { join } = require('path');
const { mkdirSync } = require('fs');
const { createRequire } = require('node:module');
const runtime = join(process.env.HOME, '.local/share/omgithub-playwright');
const req = createRequire(join(runtime, 'node_modules', 'playwright', 'package.json'));
const { chromium } = req('playwright');

const url = process.env.CAPTURE_URL, out = process.env.CAPTURE_DIR;
if (!url || !out) { console.error('Set CAPTURE_URL and CAPTURE_DIR.'); process.exit(1); }
mkdirSync(out, { recursive: true });

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
let browser;
(async () => {
  try {
    try {
      browser = await chromium.launch({ headless: true, timeout: 30000 });
    } catch (e) { console.error('browser launch failed:', e.message); process.exit(75); }
    for (const [name, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } }).catch((e) => { console.error('newPage failed:', e.message); process.exit(75); });
      page.setDefaultTimeout(30000);
      let response;
      try {
        response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      } catch (e) { console.error('navigation failed:', e.message); await page.close().catch(() => {}); process.exit(75); }
      const status = response ? response.status() : 0;
      if (!response || !response.ok()) {
        console.error('bad HTTP status loading preview: ' + status);
        await page.close().catch(() => {});
        process.exit(!status || TRANSIENT.has(status) ? 75 : 1);
      }
      try {
        await page.locator('body').waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {});
        await page.waitForSelector('h1, #create, #prompt', { timeout: 30000 });
        await page.waitForTimeout(1500);
        const probe = await page.evaluate(() => ({
          title: document.title,
          h1: document.querySelector('h1') ? document.querySelector('h1').innerText : '',
          bodyLen: document.body ? document.body.innerText.trim().length : 0
        }));
        if (!probe.bodyLen || probe.bodyLen < 50) {
          // evaluate text content check in node context
          const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
          if (!text || text.trim().length < 50 || !/PANDA|Imagination|Generate/i.test(text)) {
            console.error('rendering defect: page has no meaningful app content. Probe: ' + JSON.stringify(probe));
            await page.close().catch(() => {});
            process.exit(1);
          }
        }
      } catch (e) { console.error('render wait failed:', e.message); await page.close().catch(() => {}); process.exit(1); }
      try {
        await page.screenshot({ path: join(out, 'final-' + name + '.png'), timeout: 30000 });
      } catch (e) {
        console.error('screenshot failed:', e.message);
        await page.close().catch(() => {});
        process.exit(e.name === 'TimeoutError' || !browser.isConnected() ? 75 : 1);
      }
      console.log('captured final-' + name + '.png');
      await page.close().catch(() => {});
    }
  } finally {
    await browser?.close().catch((e) => { console.error('browser close failed:', e.message); process.exitCode = process.exitCode || 75; });
  }
})();
NODE_EOF
/usr/bin/time -p test -f "$OUT/final-desktop.png"
/usr/bin/time -p test -f "$OUT/final-mobile.png"
echo "Captures written to $OUT."
