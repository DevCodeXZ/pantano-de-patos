// SFX sintetizados con WebAudio — sin archivos externos
export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { /* sin audio */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  osc(type, f0, f1, dur, vol = 0.3, delay = 0, curve = 'exp') {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    else o.frequency.linearRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.3, freq = 1200, delay = 0, type = 'lowpass') {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shot()   { this.noise(0.14, 0.55, 900); this.osc('square', 180, 40, 0.1, 0.25); }
  quack(big = false, angry = false) {
    const m = big ? 0.45 : 1;
    if (angry) {
      this.osc('sawtooth', 300 * m, 130 * m, 0.16, 0.3);
      this.osc('square', 240 * m, 100 * m, 0.2, 0.2, 0.05);
    } else {
      this.osc('square', 260 * m, 170 * m, 0.13, 0.22);
      this.osc('square', 300 * m, 190 * m, 0.1, 0.15, 0.12);
    }
  }
  pickup()  { this.osc('sine', 500, 900, 0.1, 0.25); }
  feather() { this.osc('sine', 900, 1400, 0.06, 0.15); }
  coin()    { this.osc('sine', 880, 880, 0.07, 0.22); this.osc('sine', 1320, 1320, 0.12, 0.22, 0.07); }
  buy()     { this.osc('triangle', 520, 780, 0.09, 0.25); this.osc('triangle', 780, 1040, 0.12, 0.25, 0.09); }
  deny()    { this.osc('square', 200, 150, 0.15, 0.2); }
  hurt()    { this.osc('sawtooth', 160, 70, 0.2, 0.3); this.noise(0.15, 0.2, 500); }
  bark()    { this.osc('square', 340, 200, 0.09, 0.2); this.osc('square', 300, 170, 0.09, 0.18, 0.11); }
  thud()    { this.noise(0.12, 0.3, 300); }
  roar() {
    this.osc('sawtooth', 90, 45, 1.1, 0.45);
    this.osc('sawtooth', 130, 60, 1.0, 0.35, 0.1);
    this.noise(0.9, 0.3, 400);
    this.quack(true, true);
  }
  bosshit() { this.osc('square', 140, 90, 0.08, 0.2); }
  bossdie() {
    [660, 550, 440, 330, 220].forEach((f, i) => this.osc('square', f, f * 0.7, 0.16, 0.25, i * 0.12));
    this.noise(0.8, 0.3, 600, 0.5);
    this.coin();
  }
  reloadClick() { this.osc('square', 700, 500, 0.05, 0.12); }
  empty() { this.osc('square', 900, 900, 0.04, 0.12); }
}
