// All sound effects are synthesised with Web Audio. No audio files.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  ready(name, gapMs) {
    if (!this.ctx || this.muted) return false;
    if (gapMs) {
      const now = performance.now();
      if (this.last[name] && now - this.last[name] < gapMs) return false;
      this.last[name] = now;
    }
    return true;
  }

  tone({ type = 'square', f0, f1 = f0, dur, vol = 0.2, delay = 0, attack = 0.004 }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur, vol = 0.2, type = 'lowpass', f0 = 1000, f1 = f0, q = 1, delay = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  click() {
    if (!this.ready('click', 30)) return;
    this.tone({ f0: 520, dur: 0.035, vol: 0.07 });
  }

  shoot() {
    if (!this.ready('shoot')) return;
    this.noise({ dur: 0.09, vol: 0.45, type: 'bandpass', f0: 2600, f1: 500, q: 0.8 });
    this.tone({ f0: 440, f1: 70, dur: 0.1, vol: 0.14 });
    this.tone({ type: 'sine', f0: 130, f1: 45, dur: 0.13, vol: 0.32 });
  }

  empty() {
    if (!this.ready('empty', 120)) return;
    this.tone({ f0: 1300, dur: 0.02, vol: 0.07 });
  }

  reload() {
    if (!this.ready('reload')) return;
    this.noise({ dur: 0.04, vol: 0.2, type: 'highpass', f0: 3000 });
    this.tone({ type: 'triangle', f0: 240, f1: 180, dur: 0.06, vol: 0.12, delay: 0.05 });
    this.noise({ dur: 0.05, vol: 0.25, type: 'bandpass', f0: 1800, q: 2, delay: 0.85 });
    this.tone({ f0: 180, f1: 320, dur: 0.07, vol: 0.12, delay: 0.88 });
  }

  hit() {
    if (!this.ready('hit', 25)) return;
    this.tone({ f0: 900, f1: 700, dur: 0.05, vol: 0.12 });
  }

  headshot() {
    if (!this.ready('head', 25)) return;
    this.tone({ type: 'triangle', f0: 1320, dur: 0.07, vol: 0.2 });
    this.tone({ type: 'triangle', f0: 1760, dur: 0.1, vol: 0.18, delay: 0.05 });
  }

  blockHit(kind) {
    if (!this.ready('bhit', 30)) return;
    if (kind === 'hard') {
      this.noise({ dur: 0.06, vol: 0.3, type: 'bandpass', f0: 2600, q: 2 });
      this.tone({ type: 'triangle', f0: 1200, f1: 900, dur: 0.04, vol: 0.06 });
    } else if (kind === 'wood') {
      this.noise({ dur: 0.07, vol: 0.3, type: 'bandpass', f0: 700, q: 1.5 });
      this.tone({ type: 'triangle', f0: 320, f1: 240, dur: 0.06, vol: 0.12 });
    } else if (kind === 'leaf') {
      this.noise({ dur: 0.08, vol: 0.18, type: 'highpass', f0: 3500 });
    } else {
      this.noise({ dur: 0.07, vol: 0.32, type: 'lowpass', f0: 900 });
    }
  }

  blockBreak(kind) {
    if (!this.ready('bbreak', 40)) return;
    const f = kind === 'hard' ? 2200 : kind === 'wood' ? 900 : kind === 'leaf' ? 4000 : 1100;
    this.noise({ dur: 0.2, vol: 0.4, type: kind === 'leaf' ? 'highpass' : 'lowpass', f0: f, f1: f * 0.3 });
    this.noise({ dur: 0.08, vol: 0.2, type: 'bandpass', f0: f * 1.5, q: 1.2, delay: 0.06 });
  }

  place() {
    if (!this.ready('place', 40)) return;
    this.tone({ type: 'sine', f0: 190, f1: 90, dur: 0.09, vol: 0.3 });
    this.noise({ dur: 0.05, vol: 0.15, type: 'lowpass', f0: 1400 });
  }

  step(kind) {
    if (!this.ready('step', 90)) return;
    const f = kind === 'hard' ? 1600 : kind === 'wood' ? 700 : kind === 'leaf' ? 3000 : 520;
    this.noise({ dur: 0.05, vol: 0.09, type: kind === 'hard' ? 'bandpass' : 'lowpass', f0: f * (0.9 + Math.random() * 0.2), q: 1.2 });
  }

  jump() {
    if (!this.ready('jump', 80)) return;
    this.noise({ dur: 0.05, vol: 0.06, type: 'lowpass', f0: 700 });
  }

  hurt() {
    if (!this.ready('hurt', 80)) return;
    this.tone({ f0: 330, f1: 150, dur: 0.18, vol: 0.2 });
    this.noise({ dur: 0.1, vol: 0.2, type: 'lowpass', f0: 800 });
  }

  mobHurt(type, vol = 1) {
    if (!this.ready('mhurt', 40) || vol <= 0) return;
    if (type === 'moss') this.tone({ type: 'sawtooth', f0: 170, f1: 110, dur: 0.14, vol: 0.12 * vol });
    else if (type === 'bone') {
      this.tone({ f0: 720, f1: 520, dur: 0.04, vol: 0.1 * vol });
      this.tone({ f0: 640, f1: 480, dur: 0.04, vol: 0.1 * vol, delay: 0.05 });
    } else this.tone({ type: 'sine', f0: 480, f1: 900, dur: 0.1, vol: 0.2 * vol });
  }

  mobDie(type, vol = 1) {
    if (!this.ready('mdie', 40) || vol <= 0) return;
    if (type === 'moss') this.tone({ type: 'sawtooth', f0: 150, f1: 45, dur: 0.45, vol: 0.14 * vol });
    else if (type === 'bone') {
      for (let i = 0; i < 4; i++) this.noise({ dur: 0.04, vol: 0.2 * vol, type: 'bandpass', f0: 2600 - i * 300, q: 3, delay: i * 0.06 });
    } else {
      this.tone({ type: 'sine', f0: 800, f1: 110, dur: 0.28, vol: 0.2 * vol });
      this.noise({ dur: 0.15, vol: 0.15 * vol, type: 'lowpass', f0: 600 });
    }
  }

  groan(vol = 1) {
    if (!this.ready('groan', 2600) || vol <= 0.05) return;
    this.tone({ type: 'sawtooth', f0: 95 + Math.random() * 30, f1: 70, dur: 0.6, vol: 0.06 * vol, attack: 0.15 });
  }

  charge(vol = 1) {
    if (!this.ready('charge', 300) || vol <= 0.05) return;
    this.tone({ type: 'triangle', f0: 400, f1: 1400, dur: 0.5, vol: 0.05 * vol, attack: 0.3 });
  }

  bolt(vol = 1) {
    if (!this.ready('bolt', 60) || vol <= 0.05) return;
    this.noise({ dur: 0.25, vol: 0.15 * vol, type: 'bandpass', f0: 1800, f1: 600, q: 1 });
    this.tone({ type: 'triangle', f0: 1100, f1: 300, dur: 0.2, vol: 0.08 * vol });
  }

  hop(vol = 1) {
    if (!this.ready('hop', 60) || vol <= 0.05) return;
    this.tone({ type: 'sine', f0: 200, f1: 420, dur: 0.09, vol: 0.14 * vol });
  }

  pickup() {
    if (!this.ready('pickup', 60)) return;
    this.tone({ type: 'triangle', f0: 660, dur: 0.07, vol: 0.16 });
    this.tone({ type: 'triangle', f0: 990, dur: 0.1, vol: 0.16, delay: 0.07 });
  }

  wave() {
    if (!this.ready('wave')) return;
    [330, 440, 554, 660].forEach((f, i) => this.tone({ f0: f, dur: 0.12, vol: 0.1, delay: i * 0.09 }));
  }

  cleared() {
    if (!this.ready('cleared')) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.14, delay: i * 0.08 }));
  }

  death() {
    if (!this.ready('death')) return;
    this.tone({ type: 'sawtooth', f0: 300, f1: 55, dur: 0.9, vol: 0.22 });
  }
}
