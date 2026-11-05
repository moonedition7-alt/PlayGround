#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must point to worker metadata}"
: "${RUNTIME_DIR:?RUNTIME_DIR must point to the OMGithub runtime}"
PORT="${PORT:-3000}"
export PORT

cd "$PROJECT_DIR"
/usr/bin/time -p mkdir -p "$PROJECT_DIR/dist" "$OPENCODE_WEB_DIR"
# This dependency-free static build uses Node's built-in HTTP server. The Python
# requirements are for the separate local inference prototype, not this preview.
/usr/bin/time -p bash -c 'cat > "$1/index.html"' _ "$PROJECT_DIR/dist" <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f6f7fb"><meta name="description" content="OpenDub — a local-first video dubbing studio.">
<title>OpenDub — Dubbing Studio</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#222239;background:#f6f7fb;font-synthesis:none;text-rendering:optimizeLegibility;--muted:#777a91;--line:#e9e9f1;--purple:#6857e8}*{box-sizing:border-box}body{margin:0;min-width:320px}button,select{font:inherit}.shell{min-height:100vh;display:grid;grid-template-columns:230px 1fr}.side{background:#fff;border-right:1px solid var(--line);padding:27px 17px;display:flex;flex-direction:column;gap:38px}.brand{display:flex;align-items:center;gap:10px;padding:0 10px;font-size:19px;font-weight:760;letter-spacing:-.7px}.mark{width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#8b7cff,#5946d5);display:grid;place-items:center;color:#fff;font-size:17px}.label{padding:0 11px;color:#a1a1b1;font-size:10px;font-weight:750;letter-spacing:1.5px;margin-bottom:9px}.nav{display:grid;gap:5px}.nav a{padding:11px;border-radius:9px;color:#73758a;text-decoration:none;font-size:13px;font-weight:600}.nav a.active{background:#f0edff;color:#5d4bd7}.nav a span{display:inline-block;width:25px;font-size:16px}.side-foot{margin-top:auto;padding:17px 13px;border:1px solid var(--line);border-radius:12px;color:#73758a;font-size:11px;line-height:1.7}.side-foot b{display:block;color:#34344b;font-size:12px}.main{min-width:0}.top{height:72px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 5.2%;}.crumb{font-size:12px;color:#85869a}.crumb b{color:#33334a}.avatar{width:33px;height:33px;background:#eeeaff;color:#6654dc;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700}.content{max-width:1080px;margin:0 auto;padding:43px 5.2% 60px}.heading{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:28px}.eyebrow{text-transform:uppercase;letter-spacing:1.6px;color:#7565dc;font-size:10px;font-weight:800}.heading h1{font-size:29px;letter-spacing:-1.1px;margin:8px 0}.heading p{margin:0;color:var(--muted);font-size:13px}.local{white-space:nowrap;padding:8px 11px;background:#fff;border:1px solid var(--line);border-radius:20px;font-size:11px;color:#5b8d70}.local i{display:inline-block;width:7px;height:7px;background:#58b77e;border-radius:50%;margin-right:6px}.steps{display:flex;align-items:center;gap:10px;margin-bottom:23px;color:#9293a5;font-size:11px;font-weight:650}.step{display:flex;align-items:center;gap:8px}.num{width:24px;height:24px;border-radius:50%;background:#fff;border:1px solid #e6e5ed;display:grid;place-items:center}.step.current{color:#5d4bd7}.step.current .num{background:#6857e8;border-color:#6857e8;color:#fff}.line{height:1px;width:50px;background:#e4e3ec}.grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(250px,.8fr);gap:18px}.card{background:#fff;border:1px solid var(--line);border-radius:15px;padding:22px;box-shadow:0 3px 12px #29295a05}.card h2{font-size:14px;margin:0 0 5px;letter-spacing:-.2px}.sub{color:var(--muted);font-size:11px;margin:0 0 18px}.drop{min-height:190px;border:1.5px dashed #d9d5f1;background:#fbfaff;border-radius:12px;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;transition:.2s}.drop.over{border-color:#6857e8;background:#f4f1ff}.upload-icon{margin:0 auto 10px;width:40px;height:40px;border-radius:12px;background:#efedff;color:#6654dc;display:grid;place-items:center;font-size:20px}.drop strong{display:block;font-size:12px}.drop p{font-size:10px;color:#9697a7;margin:6px 0 12px}.choose{border:0;border-radius:7px;background:#6857e8;color:#fff;padding:8px 13px;font-size:10px;font-weight:700}.filename{display:block;color:#5c4bd2;font-size:11px;margin-top:8px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.field label{display:block;font-size:10px;font-weight:700;color:#5b5c72;margin-bottom:7px}.field select{width:100%;padding:10px;border:1px solid #e5e5ee;border-radius:8px;background:#fff;color:#34344b;font-size:11px}.notice{margin-top:17px;padding:11px 12px;border-radius:9px;background:#f8f7ff;color:#77758d;font-size:10px;line-height:1.55}.right{display:grid;align-content:start;gap:15px}.summary{display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid #f0f0f4;font-size:11px;color:#77798d}.summary b{color:#34344b;font-size:11px}.summary:last-child{border:0}.format{display:inline-flex;gap:5px}.format span{padding:4px 6px;border-radius:5px;background:#f2f1ff;color:#6757d6;font-size:9px;font-weight:700}.info{background:linear-gradient(140deg,#6857e8,#8474f2);color:white;border:0}.info h2{font-size:13px}.info p{font-size:10px;line-height:1.6;color:#e5e1ff;margin:8px 0 0}.actions{display:flex;gap:10px;margin-top:18px}.primary,.secondary{padding:11px 16px;border-radius:8px;font-size:11px;font-weight:700}.primary{border:0;background:#6857e8;color:white}.primary:disabled{opacity:.45;cursor:not-allowed}.secondary{background:white;border:1px solid var(--line);color:#65667b}.footnote{text-align:center;color:#a0a1af;font-size:10px;margin-top:25px}@media(max-width:800px){.shell{grid-template-columns:68px 1fr}.side{padding:21px 8px;align-items:center}.brand{padding:0}.brand .word,.label,.nav a:not(.active){display:none}.nav a{padding:10px}.nav a span{width:auto}.side-foot{display:none}.grid{grid-template-columns:1fr}.right{grid-template-columns:1fr 1fr}.info{grid-column:1/-1}.content{padding-top:30px}}@media(max-width:520px){.shell{display:block}.side{display:none}.top{height:58px;padding:0 18px}.content{padding:26px 16px}.heading h1{font-size:24px}.heading{margin-bottom:22px}.local{font-size:9px;padding:7px}.grid{gap:13px}.card{padding:17px}.drop{min-height:170px}.right{grid-template-columns:1fr}.info{grid-column:auto}.steps{gap:6px;font-size:9px}.line{width:18px}.fields{gap:10px}.field select{font-size:10px;padding:9px}}
</style>
</head>
<body><div class="shell">
<aside class="side"><div class="brand"><div class="mark">◈</div><span class="word">OpenDub</span></div><div><div class="label">WORKSPACE</div><nav class="nav"><a class="active" href="#studio"><span>▧</span> Studio</a><a href="#projects"><span>◷</span> Recent projects</a><a href="#settings"><span>⚙</span> Settings</a></nav></div><div class="side-foot"><b>Made for creators</b>Translate your videos and make every story sound at home.</div></aside>
<main class="main"><header class="top"><div class="crumb">Workspace&nbsp; / &nbsp;<b>Dubbing studio</b></div><div class="avatar">OD</div></header><section class="content" id="studio"><div class="heading"><div><div class="eyebrow">YOUR LOCAL DUBBING WORKSPACE</div><h1>Create a new dub</h1><p>Bring your video to a new audience, one language at a time.</p></div><div class="local"><i></i>Local processing</div></div>
<div class="steps"><div class="step current"><span class="num">1</span> Upload media</div><div class="line"></div><div class="step"><span class="num">2</span> Choose language</div><div class="line"></div><div class="step"><span class="num">3</span> Export dub</div></div>
<div class="grid"><div class="card"><h2>Source media</h2><p class="sub">Upload a video or audio file to get started.</p><div class="drop" id="drop"><div><div class="upload-icon">↑</div><strong>Drop your file here</strong><p>MP4, MOV, MP3, WAV · up to 2 GB</p><button class="choose" id="choose" type="button">Choose a file</button><input id="file" type="file" accept="video/*,audio/*" hidden><span class="filename" id="filename"></span></div></div>
<div class="fields"><div class="field"><label for="language">Translate into</label><select id="language"><option>Hindi</option><option>Kannada</option><option>Tamil</option><option>Telugu</option><option>Malayalam</option><option>Marathi</option><option>Bengali</option><option>Gujarati</option><option>Punjabi</option><option>Odia</option><option>Urdu</option><option>English</option></select></div><div class="field"><label for="source">Spoken language</label><select id="source"><option>Auto-detect</option><option>English</option><option>Hindi</option><option>Tamil</option><option>Kannada</option><option>Telugu</option></select></div></div><div class="notice">Your files are processed on your machine. The first run may download speech and translation models.</div><div class="actions"><button class="primary" id="create" disabled>Create dub&nbsp; →</button><button class="secondary" id="clear" type="button">Clear</button></div></div>
<div class="right"><div class="card"><h2>Export includes</h2><p class="sub">Everything you need to publish.</p><div class="summary"><span>Dubbed video</span><div class="format"><span>MP4</span></div></div><div class="summary"><span>Dubbed audio</span><div class="format"><span>MP3</span></div></div><div class="summary"><span>Subtitles</span><div class="format"><span>SRT</span><span>VTT</span></div></div><div class="summary"><span>Max duration</span><b>60 min</b></div></div><div class="card info"><h2>Private by design</h2><p>Your media stays on your device while the local dubbing pipeline transcribes, translates, and generates speech.</p></div></div></div><div class="footnote">OpenDub · Local video dubbing prototype</div></section></main></div>
<script>
const input=document.querySelector('#file'),drop=document.querySelector('#drop'),name=document.querySelector('#filename'),create=document.querySelector('#create');function selectFile(file){if(!file)return;name.textContent=file.name;create.disabled=false}document.querySelector('#choose').onclick=()=>input.click();input.onchange=()=>selectFile(input.files[0]);drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};drop.ondragleave=()=>drop.classList.remove('over');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');input.files=e.dataTransfer.files;selectFile(input.files[0])};document.querySelector('#clear').onclick=()=>{input.value='';name.textContent='';create.disabled=true};create.onclick=()=>alert('This is a static preview. Run the local Python app to process media.');
</script></body></html>
HTML

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
