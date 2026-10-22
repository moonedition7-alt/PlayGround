export class AudioFX {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.soundOn = true;
    this.musicOn = true;
    this.engine = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.lastCoin = 0;
  }

  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      this.noiseBuffer = this.makeNoise();
      this.ready = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.ready = false; }
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setSettings(sound, music) {
    this.soundOn = !!sound;
    this.musicOn = !!music;
    if (this.ready) {
      this.master.gain.setTargetAtTime(this.soundOn ? 0.9 : 0, this.ctx.currentTime, 0.08);
      this.music.gain.setTargetAtTime(this.musicOn ? 0.1 : 0, this.ctx.currentTime, 0.3);
    }
    if (this.musicOn) this.startMusic(); else this.stopMusic();
  }

  resume() {
    if (this.ready && this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur = 0.12, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    if (!this.ready || !this.soundOn) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur = 0.25, freq = 1200, vol = 0.15, type = 'bandpass') {
    if (!this.ready || !this.soundOn) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + dur);
  }

  click() { this.tone(660, 0.06, 'triangle', 0.09, -100); }
  back() { this.tone(420, 0.09, 'triangle', 0.08, -120); }
  hover() { this.tone(880, 0.03, 'sine', 0.03); }

  coin(n = 0) {
    const now = performance.now();
    const step = now - this.lastCoin < 90 ? Math.min(4, n) : 0;
    this.lastCoin = now;
    const base = 880 * Math.pow(1.059, step * 2);
    this.tone(base, 0.09, 'triangle', 0.13, 180);
    this.tone(base * 1.5, 0.12, 'sine', 0.06, 240, 0.03);
  }
  ring() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.24, 'sine', 0.1, 0, i * 0.045));
    this.noise(0.35, 2400, 0.05, 'highpass');
  }
  tech() {
    [392, 587, 880, 1175].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.09, 60, i * 0.06));
  }
  fuel() {
    this.tone(220, 0.18, 'sine', 0.1, 180);
    this.tone(330, 0.16, 'sine', 0.08, 220, 0.06);
  }
  softLanding() {
    this.noise(0.3, 500, 0.2, 'lowpass');
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.11, 0, i * 0.09));
  }
  crash() {
    this.noise(0.7, 220, 0.4, 'lowpass');
    this.tone(120, 0.6, 'sawtooth', 0.2, -70);
    this.tone(70, 0.9, 'square', 0.14, -30, 0.05);
  }
  whoosh() { this.noise(0.35, 900, 0.12, 'bandpass'); }
  boost() {
    this.noise(0.6, 1400, 0.14, 'bandpass');
    this.tone(180, 0.5, 'sawtooth', 0.08, 220);
  }
  warn() {
    this.tone(440, 0.11, 'square', 0.09);
    this.tone(330, 0.13, 'square', 0.09, 0, 0.14);
  }
  mission() {
    [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, 0, i * 0.08));
  }
  upgrade() {
    [330, 440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.24, 'square', 0.055, 0, i * 0.055));
    this.noise(0.4, 1800, 0.06, 'highpass');
  }
  unlock() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.45, 'sine', 0.12, 0, i * 0.07));
    this.noise(0.5, 2000, 0.05, 'highpass');
  }

  startEngine() {
    if (!this.ready || this.engine) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3;
    const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = 62;
    const osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 93;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer; windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 650; windFilter.Q.value = 0.6;
    const windGain = ctx.createGain(); windGain.gain.value = 0.0001;
    osc1.connect(filter); osc2.connect(g2); g2.connect(filter);
    filter.connect(gain); gain.connect(this.sfx);
    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(this.sfx);
    osc1.start(); osc2.start(); windSrc.start();
    this.engine = { osc1, osc2, filter, gain, windGain, windFilter, windSrc };
  }

  updateEngine(speedRatio, throttle, boost) {
    if (!this.ready || !this.engine) return;
    const t = this.ctx.currentTime;
    const r = Math.max(0.15, Math.min(1.35, speedRatio));
    const f = 55 + r * 62 + (boost ? 26 : 0);
    this.engine.osc1.frequency.setTargetAtTime(f, t, 0.1);
    this.engine.osc2.frequency.setTargetAtTime(f * 1.51, t, 0.1);
    this.engine.filter.frequency.setTargetAtTime(320 + r * 680 + (boost ? 400 : 0), t, 0.15);
    const vol = this.soundOn ? (0.035 + throttle * 0.045 + (boost ? 0.025 : 0)) : 0;
    this.engine.gain.gain.setTargetAtTime(vol, t, 0.15);
    this.engine.windGain.gain.setTargetAtTime(0.008 + r * 0.022, t, 0.2);
    this.engine.windFilter.frequency.setTargetAtTime(480 + r * 700, t, 0.2);
  }

  throttleBurst(up = true) { this.tone(up ? 300 : 220, 0.14, 'sawtooth', 0.06, up ? 140 : -80); }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    try {
      e.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      e.windGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      setTimeout(() => { try { e.osc1.stop(); e.osc2.stop(); e.windSrc.stop(); } catch {} }, 350);
    } catch {}
    this.engine = null;
  }

  startMusic() {
    if (!this.ready || !this.musicOn || this.musicTimer) return;
    this.music.gain.setTargetAtTime(0.095, this.ctx.currentTime, 0.6);
    const chords = [
      [220, 277.18, 329.63],
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
      [196, 246.94, 329.63]
    ];
    const melody = [659.25, 783.99, 880, 783.99, 659.25, 523.25, 587.33, 659.25, 880, 783.99, 659.25, 587.33, 523.25, 440, 523.25, 587.33];
    const step = () => {
      if (!this.ready || !this.musicOn) return;
      const t = this.ctx.currentTime + 0.03;
      const chord = chords[Math.floor(this.musicStep / 4) % chords.length];
      if (this.musicStep % 4 === 0) {
        chord.forEach((f, i) => {
          const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.1, t + 0.4);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
          o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 2);
        });
      }
      const mf = melody[this.musicStep % melody.length];
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.038, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.6);
      this.musicStep++;
    };
    step();
    this.musicTimer = setInterval(step, 460);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.ready) this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }
}
