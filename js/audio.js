'use strict';
// Efeitos sonoros sintetizados (WebAudio) — sem arquivos externos
const Sfx = {
  enabled: true, ctx: null, last: {},
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  tone(freq, dur, type, vol, slide, delay) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, hp, delay) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (delay || 0);
    const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = c.createGain(); g.gain.value = vol || 0.05;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  },
  play(name) {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    const c = this.ctx; if (!c) return;
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const gap = { hit: 0.07, bow: 0.08, shot: 0.1, die: 0.12, boom: 0.15, select: 0.05 }[name] || 0.03;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'click': this.tone(520, 0.06, 'square', 0.025); break;
      case 'select': this.tone(380, 0.05, 'triangle', 0.04, 140); break;
      case 'order': this.tone(300, 0.07, 'triangle', 0.04, -80); break;
      case 'error': this.tone(140, 0.16, 'sawtooth', 0.04, -40); break;
      case 'place': this.tone(220, 0.1, 'square', 0.04, -60); this.noise(0.08, 0.03, 300); break;
      case 'build': this.tone(392, 0.12, 'triangle', 0.05); this.tone(523, 0.16, 'triangle', 0.05, 0, 0.1); break;
      case 'train': this.tone(330, 0.1, 'triangle', 0.045); this.tone(440, 0.12, 'triangle', 0.045, 0, 0.08); break;
      case 'hit': this.noise(0.06, 0.04, 1500); this.tone(160, 0.05, 'square', 0.02); break;
      case 'bow': this.noise(0.08, 0.025, 3000); break;
      case 'shot': this.noise(0.12, 0.06, 500); this.tone(90, 0.1, 'sawtooth', 0.04); break;
      case 'die': this.tone(200, 0.2, 'sawtooth', 0.025, -120); break;
      case 'boom': this.noise(0.5, 0.08, 120); this.tone(70, 0.4, 'sawtooth', 0.06, -30); break;
      case 'alert': this.tone(740, 0.12, 'square', 0.045); this.tone(554, 0.16, 'square', 0.045, 0, 0.14); break;
      case 'age': [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.06, 0, i * 0.14)); break;
      case 'win': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.07, 0, i * 0.16)); break;
      case 'lose': [330, 262, 220, 165].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.04, 0, i * 0.22)); break;
      default:
    }
  },
};
