/* PANDA AI STUDIO — frontend logic */
(() => {
  const $ = (id) => document.getElementById(id);
  const promptEl = $('prompt'), charCount = $('charCount'),
    generateBtn = $('generateBtn'), errorBox = $('errorBox'),
    stage = $('stage'), stageIdle = $('stageIdle'), stageLoading = $('stageLoading'),
    videoPlayer = $('videoPlayer'), progressFill = $('progressFill'), progressLabel = $('progressLabel'),
    statusChip = $('statusChip'), demoTag = $('demoTag'), resultDemoTag = $('resultDemoTag'), realTag = $('realTag'),
    metaPrompt = $('metaPrompt'), metaStyle = $('metaStyle'), metaRatio = $('metaRatio'), metaDuration = $('metaDuration'),
    downloadBtn = $('downloadBtn'), regenerateBtn = $('regenerateBtn'), copyLastBtn = $('copyLastBtn'),
    modePill = $('modePill'), demoBanner = $('demoBanner'),
    imageInput = $('imageInput'), uploadPreview = $('uploadPreview'), removeImageBtn = $('removeImage'),
    demoCanvas = $('demoCanvas'), historyGrid = $('historyGrid'), emptyHistory = $('emptyHistory');

  const state = {
    style: 'Cinematic', aspectRatio: '16:9', duration: 5,
    imageBase64: null, lastPrompt: '', lastVideoUrl: null, lastIsDemo: false,
    demoMode: true, generating: false
  };

  const EXAMPLES = [
    'A giant panda astronaut floating through a neon galaxy, cinematic slow motion',
    'Tokyo street at night in the rain, neon reflections, realistic tracking shot',
    'A cute panda chef cooking ramen in a cozy anime kitchen, steam rising',
    'Futuristic 3D city with flying cars at sunset, volumetric light',
    'Hand-drawn animation of a fox running through a magical glowing forest',
    'Ocean waves crashing on black sand beach, drone shot, golden hour'
  ];

  const GALLERY = [
    { title: 'Neon galaxy voyage — Cinematic', prompt: EXAMPLES[0], src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
    { title: 'Rainy neon street — Realistic', prompt: EXAMPLES[1], src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
    { title: 'Cozy kitchen tale — Anime', prompt: EXAMPLES[2], src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4' },
    { title: 'Sky city flyover — 3D', prompt: EXAMPLES[3], src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4' },
    { title: 'Magic forest run — Animation', prompt: EXAMPLES[4], src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4' },
    { title: 'Golden hour waves — Cinematic', prompt: EXAMPLES[5], src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4' }
  ];

  /* ---------- init ---------- */
  function init() {
    // nav
    $('hamburger').onclick = () => {
      const l = $('navLinks');
      l.classList.toggle('open');
      $('hamburger').setAttribute('aria-expanded', l.classList.contains('open'));
    };
    document.querySelectorAll('#navLinks a').forEach(a => a.onclick = () => $('navLinks').classList.remove('open'));

    promptEl.addEventListener('input', () => charCount.textContent = promptEl.value.length);

    // selectors
    bindSeg('styleGrid', 'style', (v) => { state.style = v; metaStyle.textContent = v; });
    bindSeg('ratioGrid', 'ratio', (v) => { state.aspectRatio = v; stage.dataset.ratio = v; metaRatio.textContent = v; });
    bindSeg('durationGrid', 'duration', (v) => { state.duration = Number(v); metaDuration.textContent = v + 's'; });

    // examples
    const chips = $('exampleChips');
    EXAMPLES.forEach(p => {
      const b = document.createElement('button');
      b.className = 'example-chip'; b.textContent = '✨ ' + p;
      b.onclick = () => { promptEl.value = p; promptEl.dispatchEvent(new Event('input')); promptEl.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      chips.appendChild(b);
    });

    // gallery
    const grid = $('galleryGrid');
    GALLERY.forEach(g => {
      const card = document.createElement('div');
      card.className = 'g-card';
      card.innerHTML = `<video src="${g.src}" muted loop playsinline preload="metadata" onmouseover="this.play()" onmouseout="this.pause()"></video>
        <div class="g-body"><p>${escapeHtml(g.title)}</p><button class="g-use">Use this prompt →</button></div>`;
      card.querySelector('.g-use').onclick = () => { promptEl.value = g.prompt; promptEl.dispatchEvent(new Event('input')); document.getElementById('create').scrollIntoView({ behavior: 'smooth' }); };
      grid.appendChild(card);
    });

    $('surpriseBtn').onclick = () => { promptEl.value = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]; promptEl.dispatchEvent(new Event('input')); };
    $('copyPromptBtn').onclick = () => copyText(promptEl.value || '', 'Prompt copied!');
    copyLastBtn.onclick = () => copyText(state.lastPrompt, 'Prompt copied!');
    regenerateBtn.onclick = () => { if (!state.generating && state.lastPrompt) { promptEl.value = state.lastPrompt; generate(); } };
    downloadBtn.onclick = downloadVideo;
    generateBtn.onclick = generate;
    $('clearHistory').onclick = () => { localStorage.removeItem('panda_history'); renderHistory(); };

    // upload
    $('uploadBox').addEventListener('click', (e) => { if (e.target.id !== 'removeImage') imageInput.click(); });
    imageInput.addEventListener('change', () => {
      const f = imageInput.files[0];
      if (!f) return;
      if (f.size > 6 * 1024 * 1024) return showError('Image too large (max 6MB).');
      const r = new FileReader();
      r.onload = () => { state.imageBase64 = r.result; uploadPreview.src = r.result; uploadPreview.classList.remove('hidden'); removeImageBtn.classList.remove('hidden'); };
      r.readAsDataURL(f);
    });
    removeImageBtn.onclick = (e) => { e.stopPropagation(); state.imageBase64 = null; imageInput.value = ''; uploadPreview.classList.add('hidden'); removeImageBtn.classList.add('hidden'); };

    // drag-drop
    ['dragover', 'drop'].forEach(ev => $('uploadBox').addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'drop' && e.dataTransfer.files[0]) { imageInput.files = e.dataTransfer.files; imageInput.dispatchEvent(new Event('change')); }
    }));

    checkConfig();
    renderHistory();
  }

  function bindSeg(gridId, key, onPick) {
    const grid = $(gridId);
    grid.querySelectorAll('.seg').forEach(btn => {
      btn.onclick = () => {
        grid.querySelectorAll('.seg').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
        btn.classList.add('active'); btn.setAttribute('aria-checked', 'true');
        onPick(btn.dataset[key] ?? btn.dataset.style ?? btn.dataset.ratio ?? btn.dataset.duration);
      };
    });
  }

  async function checkConfig() {
    try {
      const r = await fetch('/api/config');
      const cfg = await r.json();
      state.demoMode = !!cfg.demoMode;
    } catch { state.demoMode = true; }
    if (state.demoMode) {
      modePill.textContent = '● DEMO MODE'; modePill.className = 'mode-pill demo';
      demoBanner.classList.remove('hidden');
    } else {
      modePill.textContent = '● LIVE AI'; modePill.className = 'mode-pill live';
      demoBanner.classList.add('hidden');
    }
  }

  /* ---------- generation ---------- */
  let progressTimer = null;
  async function generate() {
    if (state.generating) return;
    const prompt = promptEl.value.trim();
    hideError();
    if (prompt.length < 3) return showError('Please enter a prompt of at least 3 characters.');
    state.generating = true;
    state.lastPrompt = prompt;
    setBusy(true, 'Generating…');
    showLoading();
    simulateProgress();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: state.style, aspectRatio: state.aspectRatio, duration: state.duration, image: state.imageBase64 })
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 503 && (data.error === 'DEMO_MODE' || data.message)) {
        // DEMO: honest labeled animated preview — never claim it's AI
        await runDemoPreview(prompt);
        finishProgress();
        showDemoResult(prompt);
        setBusy(false, 'Demo preview');
        saveHistory({ prompt, style: state.style, ratio: state.aspectRatio, duration: state.duration, videoUrl: null, demo: true, ts: Date.now() });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Generation failed. Try again.');
      const videoUrl = data.videoUrl || data.videoBase64;
      if (!videoUrl) throw new Error('API did not return a video. Check server logs / model name.');
      finishProgress();
      showRealResult(videoUrl, prompt, data.provider);
      setBusy(false, 'Done ✓');
      saveHistory({ prompt, style: state.style, ratio: state.aspectRatio, duration: state.duration, videoUrl, demo: false, ts: Date.now() });
    } catch (err) {
      finishProgress();
      setBusy(false, 'Error');
      showError(err.message || 'Something went wrong.');
      resetStage();
    } finally {
      state.generating = false;
      generateBtn.disabled = false;
      generateBtn.querySelector('.btn-label').textContent = '✨ Generate Video';
    }
  }

  function setBusy(busy, label) {
    statusChip.textContent = label;
    statusChip.className = 'status-chip' + (busy ? ' busy' : label.includes('✓') || label.includes('Done') ? ' done' : label === 'Error' ? ' error' : '');
    generateBtn.disabled = busy;
    if (busy) generateBtn.querySelector('.btn-label').textContent = '⏳ Generating…';
  }

  function showLoading() {
    stageIdle.classList.add('hidden');
    videoPlayer.classList.add('hidden');
    resultDemoTag.classList.add('hidden'); realTag.classList.add('hidden');
    stageLoading.classList.remove('hidden');
    demoCanvas.classList.add('hidden'); demoTag.classList.add('hidden');
  }
  function resetStage() {
    stageLoading.classList.add('hidden');
    stageIdle.classList.remove('hidden');
  }

  function simulateProgress() {
    let p = 0;
    clearInterval(progressTimer);
    const target = state.demoMode ? 95 : 90;
    progressTimer = setInterval(() => {
      p = Math.min(target, p + Math.random() * 6 + 1);
      progressFill.style.width = p + '%';
      progressLabel.textContent = progressStep(p);
    }, 400);
  }
  function progressStep(p) {
    if (p < 25) return `Dreaming frames… ${Math.round(p)}%`;
    if (p < 55) return `Diffusing motion… ${Math.round(p)}%`;
    if (p < 85) return `Rendering ${state.duration}s ${state.aspectRatio} ${state.style}… ${Math.round(p)}%`;
    return `Upscaling… ${Math.round(p)}%`;
  }
  function finishProgress() {
    clearInterval(progressTimer);
    progressFill.style.width = '100%';
    progressLabel.textContent = 'Complete · 100%';
  }

  /* Demo preview: animated canvas, honestly labeled */
  function runDemoPreview(prompt) {
    return new Promise((resolve) => {
      demoTag.classList.remove('hidden');
      demoCanvas.classList.remove('hidden');
      document.querySelector('.loader-ring').style.display = 'none';
      const ctx = demoCanvas.getContext('2d');
      demoCanvas.width = 640; demoCanvas.height = 360;
      const words = prompt.split(' ').slice(0, 8).join(' ');
      const t0 = Date.now();
      const durMs = Math.min(9000, 3500 + state.duration * 500);
      (function frame() {
        const t = (Date.now() - t0) / 1000;
        const g = ctx.createLinearGradient(0, 0, 640, 360);
        const hue = (t * 40 + 260) % 360;
        g.addColorStop(0, `hsl(${hue},70%,18%)`);
        g.addColorStop(1, `hsl(${(hue + 60) % 360},80%,32%)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 360);
        // floating orbs
        for (let i = 0; i < 24; i++) {
          const x = (i * 137 + t * (30 + i * 6)) % 680 - 20;
          const y = 180 + Math.sin(t * 1.6 + i) * (60 + (i % 5) * 22);
          ctx.beginPath(); ctx.arc(x, y, 6 + (i % 4) * 5, 0, 7);
          ctx.fillStyle = `hsla(${(hue + i * 22) % 360},90%,65%,.55)`; ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 280, 640, 80);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Outfit,sans-serif';
        ctx.fillText('🐼 DEMO PREVIEW', 20, 310);
        ctx.font = '14px Outfit,sans-serif'; ctx.fillStyle = '#ffd9a8';
        ctx.fillText(words.slice(0, 52), 20, 334);
        if (Date.now() - t0 < durMs) requestAnimationFrame(frame);
        else { document.querySelector('.loader-ring').style.display = ''; resolve(); }
      })();
    });
  }

  function meta(prompt) {
    metaPrompt.textContent = prompt;
    metaStyle.textContent = state.style; metaRatio.textContent = state.aspectRatio; metaDuration.textContent = state.duration + 's';
  }

  function showDemoResult(prompt) {
    stageLoading.classList.add('hidden');
    videoPlayer.classList.add('hidden');
    // keep canvas visible as the "result" + honest tag
    stageLoading.classList.remove('hidden');
    document.querySelector('.loader-ring').style.display = 'none';
    progressFill.style.width = '100%';
    progressLabel.innerHTML = 'Demo preview done — <b>not a real AI video</b>. <a href="#setup" style="color:#ffb347">Connect API →</a>';
    demoTag.classList.remove('hidden');
    meta(prompt);
    state.lastVideoUrl = null; state.lastIsDemo = true;
    downloadBtn.disabled = true; regenerateBtn.disabled = false; copyLastBtn.disabled = false;
    renderHistory();
  }

  function showRealResult(videoUrl, prompt, provider) {
    stageLoading.classList.add('hidden');
    stageIdle.classList.add('hidden');
    videoPlayer.src = videoUrl;
    videoPlayer.classList.remove('hidden');
    videoPlayer.play().catch(() => {});
    realTag.classList.remove('hidden');
    realTag.textContent = `✓ REAL AI VIDEO · ${provider || 'api'}`;
    resultDemoTag.classList.add('hidden');
    meta(prompt);
    state.lastVideoUrl = videoUrl; state.lastIsDemo = false;
    downloadBtn.disabled = false; regenerateBtn.disabled = false; copyLastBtn.disabled = false;
  }

  async function downloadVideo() {
    if (!state.lastVideoUrl) return;
    try {
      const a = document.createElement('a');
      // base64 → blob
      if (state.lastVideoUrl.startsWith('data:')) {
        const res = await fetch(state.lastVideoUrl);
        const blob = await res.blob();
        a.href = URL.createObjectURL(blob);
      } else {
        // try fetch for CORS-friendly hosts, fallback to open
        try {
          const res = await fetch(state.lastVideoUrl);
          if (res.ok) { a.href = URL.createObjectURL(await res.blob()); }
          else throw 0;
        } catch { a.href = state.lastVideoUrl; a.target = '_blank'; a.removeAttribute('download'); a.click(); return; }
      }
      a.download = `panda-ai-${Date.now()}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { window.open(state.lastVideoUrl, '_blank'); }
  }

  /* ---------- history ---------- */
  function getHistory() {
    try { return JSON.parse(localStorage.getItem('panda_history') || '[]'); } catch { return []; }
  }
  function saveHistory(item) {
    const h = getHistory();
    h.unshift(item);
    localStorage.setItem('panda_history', JSON.stringify(h.slice(0, 24)));
    renderHistory();
  }
  function renderHistory() {
    const h = getHistory();
    historyGrid.querySelectorAll('.g-card').forEach(n => n.remove());
    emptyHistory.style.display = h.length ? 'none' : '';
    h.forEach(item => {
      const card = document.createElement('div');
      card.className = 'g-card';
      const badge = item.demo
        ? '<span class="demo-tag">DEMO — not AI</span>'
        : '<span class="demo-tag" style="background:rgba(34,197,94,.15);border-color:#22c55e;color:#bbf7d0">REAL AI ✓</span>';
      card.innerHTML = `
        ${item.videoUrl && !item.demo ? `<video src="${item.videoUrl}" controls playsinline preload="metadata"></video>` : `<div style="padding:26px;text-align:center;font-size:40px">🐼🎬<div style="margin-top:8px">${badge}</div></div>`}
        <div class="g-body">
          <p>${escapeHtml(item.prompt)}</p>
          <small class="muted">${escapeHtml(item.style)} · ${escapeHtml(item.ratio)} · ${escapeHtml(String(item.duration))}s · ${new Date(item.ts).toLocaleString()}</small>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="g-use reuse">↻ Reuse</button>
            ${item.videoUrl && !item.demo ? `<button class="g-use dl">⬇ MP4</button>` : ''}
          </div>
        </div>`;
      card.querySelector('.reuse').onclick = () => { promptEl.value = item.prompt; promptEl.dispatchEvent(new Event('input')); document.getElementById('create').scrollIntoView({ behavior: 'smooth' }); };
      const dl = card.querySelector('.dl');
      if (dl) dl.onclick = () => { const a = document.createElement('a'); a.href = item.videoUrl; a.download = `panda-ai-${item.ts}.mp4`; a.target = '_blank'; a.click(); };
      historyGrid.appendChild(card);
    });
  }

  /* ---------- utils ---------- */
  function showError(msg) { errorBox.textContent = msg; errorBox.classList.remove('hidden'); errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function hideError() { errorBox.classList.add('hidden'); }
  function copyText(t, okMsg) {
    if (!t) return showError('Nothing to copy yet.');
    navigator.clipboard.writeText(t).then(() => {
      const el = $('copyPromptBtn'); const orig = el.textContent;
      el.textContent = '✓ Copied!'; setTimeout(() => el.textContent = orig, 1500);
    }).catch(() => showError('Copy blocked by browser. Select the text manually.'));
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  document.addEventListener('DOMContentLoaded', init);
})();
