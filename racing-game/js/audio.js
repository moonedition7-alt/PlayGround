// Procedural audio: engine, skid, crash, countdown + simple music
export class GameAudio {
  constructor() {
    this.ctx = null; this.muted = false;
    this.engineOsc = null; this.engineOsc2 = null;
    this.engineGain = null; this.engineFilter = null;
    this.skidGain = null; this.musicTimer = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: two detuned saws through lowpass
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 900;
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 70;
    this.engineOsc2 = this.ctx.createOscillator(); this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 35;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2); g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start(); this.engineOsc2.start();
    // Skid noise
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
    this.skidGain = this.ctx.createGain(); this.skidGain.gain.value = 0;
    src.connect(bp); bp.connect(this.skidGain); this.skidGain.connect(this.ctx.destination);
    src.start();
  }
  engine(rpm01, throttle, on) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const f = 55 + rpm01 * 240 + (throttle ? 18 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5 + 3, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(500 + rpm01 * 2600 + (throttle ? 600 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.10 + rpm01 * 0.06 + (throttle ? 0.03 : 0) : 0, t, 0.1);
  }
  skid(amount) {
    if (!this.ctx || this.muted) return;
    this.skidGain.gain.setTargetAtTime(Math.min(0.25, amount * 0.25), this.ctx.currentTime, 0.08);
  }
  crash(intensity = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400 + intensity * 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5 * Math.min(1.4, intensity), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(lp); lp.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + 0.4);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(og); og.connect(this.ctx.destination); o.start(t); o.stop(t + 0.4);
  }
  beep(freq = 660, dur = 0.12) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.engineGain && this.ctx) this.engineGain.gain.value = this.muted ? 0 : 0.1;
    if (this.skidGain && this.ctx) this.skidGain.gain.value = 0;
    return this.muted;
  }
}
