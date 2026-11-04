const scenes = [
  { start: 0, end: 7, label: '01 / THE SPARK', chapter: 'The spark', desc: 'Every great video starts somewhere.', voice: 'Have a video idea? Just type it.', kicker: 'BIG IDEAS START SMALL', title: 'What if your<br>idea could <em>move?</em>', art: 'prompt', step: 0 },
  { start: 7, end: 15, label: '02 / YOUR PROMPT', chapter: 'Your prompt', desc: 'Set the scene. Make it yours.', voice: 'Describe your idea, add the length, platform and voiceover accent.', kicker: 'A FEW DETAILS. THAT’S IT.', title: 'Your idea.<br><em>Your way.</em>', art: 'details', step: 0 },
  { start: 15, end: 27, label: '03 / THE MAGIC HAPPENS', chapter: 'AI brings it to life', desc: 'Script, visuals, voice, subtitles, music.', voice: 'Our AI writes the script, adds AI-generated visuals, human-sounding voiceovers in over 50 languages, subtitles and music.', kicker: 'MEET YOUR CREATIVE SIDEKICK', title: 'A whole video.<br><em>Made for you.</em>', art: 'generate', step: 1 },
  { start: 27, end: 39, label: '04 / MAKE IT YOURS', chapter: 'A little magic', desc: 'Fine-tune every detail with a command.', voice: 'Want changes? Use the Magic Box. Delete a scene, change the accent, or add a funny intro with a simple command.', kicker: 'THE MAGIC BOX', title: 'Changes?<br><em>Just ask.</em>', art: 'magic', step: 2 },
  { start: 39, end: 46, label: '05 / READY TO SHARE', chapter: 'Ready to share', desc: 'One tap from ready to out there.', voice: 'Export your video and share it with your audience.', kicker: 'LOOKS GOOD ON YOU', title: 'Your next post<br>is <em>ready.</em>', art: 'export', step: 3 },
  { start: 46, end: 52, label: '06 / AROUND THE WORLD', chapter: 'A global community', desc: '25 million customers. 190 countries.', voice: 'Trusted by 25 million customers in 190 countries.', kicker: 'A WORLD OF BIG IDEAS', title: 'Made for<br><em>everyone.</em>', art: 'globe', step: 3 },
  { start: 52, end: 60, label: '07 / YOUR TURN', chapter: 'Your turn', desc: 'Start creating for free today.', voice: "Turn your idea into a video with just a prompt. Get started, it's free!", kicker: 'YOUR IDEA IS WAITING', title: 'Make it<br><em>happen.</em>', art: 'cta', step: 3 }
];
const steps = ['Prompt', 'Generate', 'Edit', 'Publish'];
const $ = (id) => document.getElementById(id);
const stage = $('videoStage'), copy = $('sceneCopy'), art = $('sceneArt'), subtitle = $('subtitle');
const scrubber = $('scrubber'), playButton = $('playButton'), playIcon = $('playIcon');
let current = 0, playing = false, voiceOn = true, musicOn = true, tick = null, lastNarration = -1;
let audioContext = null, musicGain = null, musicTimer = null, chordIndex = 0;

function artMarkup(type) {
  if (type === 'prompt') return `<div class="art-orb"><i class="orb-spark spark-a">✦</i><i class="orb-spark spark-b">✧</i><i class="orb-spark spark-c">·</i></div>`;
  if (type === 'details') return `<div class="art-glass"><div class="glass-label">YOUR VIDEO PROMPT</div><div class="prompt-text">A cozy café in Paris on a rainy day<span class="prompt-cursor"></span></div><div class="prompt-tags"><span>30 sec</span><span>Reels</span><span>English · US</span></div></div>`;
  if (type === 'generate') return `<div class="art-generate"><div class="mini-window"><div class="mini-window-head"><i></i><i></i><i></i></div><div class="mini-land"></div><span class="scene-audio">✦ Scene 01</span></div><div class="transform-arrow">→</div><div class="mini-window"><div class="mini-window-head"><i></i><i></i><i></i></div><div class="mini-land generated"></div><span class="scene-audio">♫ Voice + captions</span></div></div>`;
  if (type === 'magic') return `<div class="art-magic"><div class="magic-window"><div class="magic-title">✦ &nbsp;Magic Box</div><div class="magic-chip"><b>↗</b> Add a funny intro</div><div class="magic-result"><span>✓</span>Done! Your video just got funnier.</div></div></div>`;
  if (type === 'export') return `<div class="art-export"><div class="share-orbit"></div><div class="export-phone"><div class="export-screen"><div class="export-play">▶</div></div></div><div class="export-check">✓</div></div>`;
  if (type === 'globe') return `<div class="art-orb art-globe"><div class="globe-lines"></div><div class="globe-points"></div><div class="stat-float"><b>25M+</b><small>happy creators</small></div></div>`;
  return `<div class="art-cta"><div class="cta-icon">✳</div><div class="cta-button">Start creating for free <span>↗</span></div></div>`;
}
function renderSteps(active) {
  $('stepper').innerHTML = steps.map((step, i) => `<div class="step ${i === active ? 'active' : ''} ${i < active ? 'done' : ''}"><span class="step-num">${i < active ? '✓' : i + 1}</span><span>${step}</span></div>${i < 3 ? '<i class="step-line"></i>' : ''}`).join('');
}
function renderChapters() {
  $('chapterList').innerHTML = scenes.map((s, i) => `<div class="chapter" data-scene="${i}" tabindex="0" role="button" aria-label="Preview ${s.chapter}, ${formatTime(s.start)}"><span class="chapter-index">0${i + 1}</span><div><div class="chapter-name">${s.chapter}</div><div class="chapter-desc">${s.desc}</div></div><span class="chapter-time">${formatTime(s.start)}</span></div>`).join('');
  document.querySelectorAll('.chapter').forEach(el => {
    const go = () => seek(scenes[Number(el.dataset.scene)].start);
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}
function formatTime(seconds) { const n = Math.floor(seconds); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
function getScene(time) { return scenes.findIndex((s, i) => time >= s.start && (time < s.end || i === scenes.length - 1)); }
function render(time, force = false) {
  current = Math.max(0, Math.min(60, time));
  const i = getScene(current), s = scenes[i];
  const sceneChanged = Number(stage.dataset.scene) !== i;
  if (force || sceneChanged) {
    stage.dataset.scene = i;
    stage.className = `video-stage scene-${i + 1}${playing ? ' playing' : ''}`;
    stage.classList.add('changing');
    $('stageLabel').textContent = s.label;
    copy.className = `scene-copy${s.art === 'cta' ? ' cta-copy' : ''}`;
    copy.innerHTML = `<div class="scene-kicker">${s.kicker}</div><div class="scene-title">${s.title}</div>${i === 0 || i === 6 ? '' : `<div class="scene-description">${s.desc}</div>`}`;
    art.innerHTML = artMarkup(s.art);
    renderSteps(s.step);
    subtitle.textContent = s.voice;
    subtitle.style.opacity = '0';
    requestAnimationFrame(() => { subtitle.style.opacity = '1'; stage.classList.remove('changing'); });
    document.querySelectorAll('.chapter').forEach((el, n) => el.classList.toggle('active', n === i));
    if (playing && sceneChanged && voiceOn && i !== lastNarration) speak(s.voice, i);
  }
  $('currentTime').textContent = formatTime(current);
  $('stageTime').textContent = formatTime(current);
  $('stageProgress').style.width = `${current / 60 * 100}%`;
  scrubber.value = current;
  scrubber.style.setProperty('--progress', `${current / 60 * 100}%`);
}
function speak(text, index) {
  if (!('speechSynthesis' in window) || !voiceOn) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US'; utterance.rate = 1.04; utterance.pitch = 1.04; utterance.volume = 0.95;
  const voices = speechSynthesis.getVoices();
  const english = voices.find(v => /^en(-|_)/i.test(v.lang) && /natural|samantha|google|aria|jenny/i.test(v.name)) || voices.find(v => /^en(-|_)/i.test(v.lang));
  if (english) utterance.voice = english;
  lastNarration = index;
  speechSynthesis.speak(utterance);
}
function setPlaying(value) {
  playing = value;
  playIcon.textContent = value ? 'Ⅱ' : '▶';
  playButton.classList.toggle('playing', value);
  playButton.setAttribute('aria-label', value ? 'Pause' : 'Play');
  stage.classList.toggle('playing', value);
  if (value) {
    if (current >= 60) { current = 0; lastNarration = -1; render(0, true); }
    startMusic(); tick = setInterval(() => { if (current >= 60) { render(60); setPlaying(false); return; } render(Math.min(60, current + 0.05)); }, 50);
    const sceneIndex = getScene(current);
    if (voiceOn && lastNarration !== sceneIndex) speak(scenes[sceneIndex].voice, sceneIndex);
    if ('speechSynthesis' in window && speechSynthesis.paused) speechSynthesis.resume();
  } else {
    clearInterval(tick); tick = null;
    if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.pause();
  }
}
function seek(time) {
  const old = getScene(current), next = getScene(time);
  current = time;
  if (old !== next) lastNarration = -1;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  render(time, true);
  if (playing && voiceOn) speak(scenes[next].voice, next);
}
function startMusic() {
  if (!musicOn || musicTimer) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  audioContext ||= new Audio();
  if (audioContext.state === 'suspended') audioContext.resume();
  if (!musicGain) { musicGain = audioContext.createGain(); musicGain.gain.value = 0.12; musicGain.connect(audioContext.destination); }
  const chords = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
  const playChord = () => {
    if (!playing || !musicOn) return;
    const now = audioContext.currentTime, notes = chords[chordIndex++ % chords.length];
    notes.forEach((hz, n) => {
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = n === 0 ? 'sine' : 'triangle'; osc.frequency.value = hz * (n === 2 ? 2 : 1);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(n === 0 ? .18 : .065, now + .35); gain.gain.setTargetAtTime(.0001, now + 1.35, .45);
      osc.connect(gain); gain.connect(musicGain); osc.start(now); osc.stop(now + 3.2);
    });
  };
  playChord(); musicTimer = setInterval(playChord, 1650);
}
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2400); }

renderChapters(); render(0, true);
playButton.addEventListener('click', () => setPlaying(!playing));
scrubber.addEventListener('input', e => seek(Number(e.target.value)));
$('voiceButton').addEventListener('click', () => {
  voiceOn = !voiceOn; const button = $('voiceButton'); button.classList.toggle('off', !voiceOn); button.title = `Voiceover ${voiceOn ? 'on' : 'off'}`;
  if (!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel();
  else if (playing) { lastNarration = -1; speak(scenes[getScene(current)].voice, getScene(current)); }
  $('voiceStatus').textContent = voiceOn ? 'Voiceover uses your browser’s English voice.' : 'Voiceover muted. Subtitles stay on.';
});
$('musicButton').addEventListener('click', () => {
  musicOn = !musicOn; const button = $('musicButton'); button.classList.toggle('off', !musicOn); button.title = `Music ${musicOn ? 'on' : 'off'}`;
  if (musicGain && audioContext) musicGain.gain.setTargetAtTime(musicOn ? .12 : 0, audioContext.currentTime, .15);
  if (musicOn && playing) { stopMusic(); startMusic(); }
});
$('fullscreenButton').addEventListener('click', async () => {
  try { if (!document.fullscreenElement) await $('phoneFrame').requestFullscreen(); else await document.exitFullscreen(); }
  catch { showToast('Fullscreen is not available in this browser.'); }
});
$('shareButton').addEventListener('click', async () => {
  const data = { title: 'AI Video Generator — 60s Promo', text: 'Turn your idea into a video with just a prompt.', url: location.href };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); showToast('Preview link copied to clipboard.'); } }
  catch (e) { if (e.name !== 'AbortError') showToast('Copy this page URL to share the preview.'); }
});
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)) { e.preventDefault(); setPlaying(!playing); }
  if (e.code === 'Escape' && document.fullscreenElement) document.exitFullscreen();
  if (e.code === 'ArrowRight' && e.altKey) seek(Math.min(60, current + 5));
  if (e.code === 'ArrowLeft' && e.altKey) seek(Math.max(0, current - 5));
});
