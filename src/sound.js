// All sound effects are synthesised with Web Audio. No audio files.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 1;
    this.last = {};
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55 * this.volume;
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
    if (this.master) this.master.gain.value = m ? 0 : 0.55 * this.volume;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55 * this.volume;
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

  remoteShot(vol) {
    if (!this.ready('rshot', 40) || vol <= 0.05) return;
    this.noise({ dur: 0.08, vol: 0.35 * vol, type: 'bandpass', f0: 2000, f1: 500, q: 0.8 });
    this.tone({ type: 'sine', f0: 120, f1: 50, dur: 0.1, vol: 0.2 * vol });
  }

  empty() {
    if (!this.ready('empty', 120)) return;
    this.tone({ f0: 1300, dur: 0.02, vol: 0.07 });
  }

  // Clicks timed to the reload animation: cell out, cell in.
  reload(dur = 1.1) {
    if (!this.ready('reload')) return;
    const k = dur / 1.1;
    this.noise({ dur: 0.04, vol: 0.2, type: 'highpass', f0: 3000, delay: 0.2 * k });
    this.tone({ type: 'triangle', f0: 240, f1: 180, dur: 0.06, vol: 0.12, delay: 0.25 * k });
    this.noise({ dur: 0.05, vol: 0.25, type: 'bandpass', f0: 1800, q: 2, delay: 0.8 * k });
    this.tone({ f0: 180, f1: 320, dur: 0.07, vol: 0.12, delay: 0.83 * k });
  }

  // Every gun frame has its own voice.
  gunshot(frame, quiet = false, vol = 1) {
    if (!this.ready('gun-' + frame, 30) || vol <= 0.03) return;
    const v = vol * (quiet ? 0.35 : 1);
    const lp = quiet ? 0.45 : 1;
    switch (frame) {
      case 'pistol':
        this.noise({ dur: 0.07, vol: 0.4 * v, type: 'bandpass', f0: 3200 * lp, f1: 700, q: 0.9 });
        this.tone({ f0: 620, f1: 110, dur: 0.07, vol: 0.12 * v });
        this.tone({ type: 'sine', f0: 170, f1: 60, dur: 0.1, vol: 0.25 * v });
        break;
      case 'smg':
        this.noise({ dur: 0.05, vol: 0.32 * v, type: 'bandpass', f0: 3600 * lp, f1: 900, q: 1 });
        this.tone({ f0: 520, f1: 140, dur: 0.05, vol: 0.09 * v });
        break;
      case 'shotgun':
        this.noise({ dur: 0.28, vol: 0.6 * v, type: 'lowpass', f0: 4200 * lp, f1: 300 });
        this.tone({ type: 'sine', f0: 110, f1: 38, dur: 0.25, vol: 0.4 * v });
        this.noise({ dur: 0.05, vol: 0.2 * v, type: 'bandpass', f0: 1500, q: 2, delay: 0.42 });
        this.noise({ dur: 0.05, vol: 0.2 * v, type: 'bandpass', f0: 1100, q: 2, delay: 0.52 });
        break;
      case 'sniper':
        this.noise({ dur: 0.35, vol: 0.55 * v, type: 'bandpass', f0: 5000 * lp, f1: 400, q: 0.7 });
        this.tone({ type: 'sawtooth', f0: 1800, f1: 90, dur: 0.3, vol: 0.12 * v });
        this.tone({ type: 'sine', f0: 90, f1: 35, dur: 0.4, vol: 0.4 * v });
        break;
      case 'crossbow':
        this.tone({ type: 'triangle', f0: 260, f1: 120, dur: 0.12, vol: 0.25 * vol });
        this.noise({ dur: 0.08, vol: 0.2 * vol, type: 'highpass', f0: 2500 });
        break;
      case 'revolver':
        this.noise({ dur: 0.18, vol: 0.55 * v, type: 'bandpass', f0: 2400 * lp, f1: 350, q: 0.7 });
        this.tone({ type: 'sine', f0: 140, f1: 40, dur: 0.22, vol: 0.38 * v });
        this.tone({ type: 'triangle', f0: 1500, dur: 0.02, vol: 0.05 * v, delay: 0.2 });
        break;
      case 'tesla':
        this.zap(v);
        break;
      case 'launcher':
        this.tone({ type: 'sine', f0: 180, f1: 60, dur: 0.18, vol: 0.4 * v });
        this.noise({ dur: 0.14, vol: 0.3 * v, type: 'lowpass', f0: 900, f1: 200 });
        break;
      case 'minigun':
        this.noise({ dur: 0.04, vol: 0.28 * v, type: 'bandpass', f0: 2800 * lp, f1: 900, q: 1.2 });
        this.tone({ type: 'sine', f0: 140, f1: 70, dur: 0.05, vol: 0.14 * v });
        break;
      case 'builder':
        this.tone({ type: 'sine', f0: 320, f1: 150, dur: 0.1, vol: 0.28 * vol });
        this.noise({ dur: 0.06, vol: 0.16 * vol, type: 'lowpass', f0: 1200 });
        break;
      default:
        this.noise({ dur: 0.09, vol: 0.45 * v, type: 'bandpass', f0: 2600 * lp, f1: 500, q: 0.8 });
        this.tone({ f0: 440, f1: 70, dur: 0.1, vol: 0.14 * v });
        this.tone({ type: 'sine', f0: 130, f1: 45, dur: 0.13, vol: 0.32 * v });
    }
  }

  zap(vol = 1) {
    if (!this.ready('zap', 40) || vol <= 0.03) return;
    this.tone({ type: 'sawtooth', f0: 1800, f1: 200, dur: 0.18, vol: 0.12 * vol });
    this.noise({ dur: 0.16, vol: 0.3 * vol, type: 'highpass', f0: 3000, f1: 1200 });
    this.tone({ type: 'square', f0: 90, f1: 60, dur: 0.12, vol: 0.08 * vol, delay: 0.02 });
  }

  // A steady hum while a beam gun is firing.
  beam(on) {
    if (!this.ctx) return;
    if (on && !this.beamNode && !this.muted) {
      const c = this.ctx;
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 220;
      o2.type = 'square';
      o2.frequency.value = 331;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.05);
      o.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.master);
      o.start();
      o2.start();
      this.beamNode = { o, o2, g };
    } else if (on && this.beamNode) {
      this.beamNode.o.frequency.value = 210 + Math.random() * 25;
    } else if (!on && this.beamNode) {
      const { o, o2, g } = this.beamNode;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.06);
      o.stop(t + 0.08);
      o2.stop(t + 0.08);
      this.beamNode = null;
    }
  }

  spin(level) {
    if (!this.ready('spin', 70) || level >= 1) return;
    this.tone({ type: 'triangle', f0: 120 + level * 500, f1: 140 + level * 560, dur: 0.07, vol: 0.06 });
  }

  throw() {
    if (!this.ready('throw', 80)) return;
    this.noise({ dur: 0.14, vol: 0.14, type: 'bandpass', f0: 600, f1: 1800, q: 1.2 });
  }

  bounce() {
    if (!this.ready('bounce', 90)) return;
    this.tone({ type: 'triangle', f0: 700, f1: 520, dur: 0.05, vol: 0.12 });
  }

  explosion(vol = 1, small = false) {
    if (!this.ready(small ? 'pop' : 'boom', small ? 40 : 60) || vol <= 0.03) return;
    if (small) {
      this.noise({ dur: 0.2, vol: 0.3 * vol, type: 'lowpass', f0: 1800, f1: 200 });
      this.tone({ type: 'sine', f0: 140, f1: 50, dur: 0.15, vol: 0.2 * vol });
      return;
    }
    this.noise({ dur: 0.9, vol: 0.7 * vol, type: 'lowpass', f0: 2400, f1: 80 });
    this.tone({ type: 'sine', f0: 80, f1: 28, dur: 0.8, vol: 0.55 * vol });
    this.noise({ dur: 0.4, vol: 0.25 * vol, type: 'bandpass', f0: 600, f1: 150, q: 0.8, delay: 0.1 });
  }

  equip() {
    if (!this.ready('equip', 60)) return;
    this.noise({ dur: 0.04, vol: 0.14, type: 'bandpass', f0: 2400, q: 2 });
    this.tone({ type: 'triangle', f0: 300, f1: 420, dur: 0.05, vol: 0.08, delay: 0.04 });
  }

  coin() {
    if (!this.ready('coin', 45)) return;
    const f = 1320 + Math.random() * 120;
    this.tone({ type: 'square', f0: f, dur: 0.05, vol: 0.06 });
    this.tone({ type: 'square', f0: f * 1.5, dur: 0.12, vol: 0.06, delay: 0.05 });
  }

  buy() {
    if (!this.ready('buy', 80)) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.07, vol: 0.06, delay: i * 0.05 }));
  }

  crate() {
    if (!this.ready('crate', 200)) return;
    this.noise({ dur: 0.15, vol: 0.3, type: 'lowpass', f0: 900 });
    [523, 784, 1046, 1318, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.12, delay: 0.1 + i * 0.07 }));
  }

  landThud(vol = 1) {
    if (!this.ready('thud', 80) || vol <= 0.03) return;
    this.tone({ type: 'sine', f0: 120, f1: 40, dur: 0.25, vol: 0.4 * vol });
    this.noise({ dur: 0.2, vol: 0.3 * vol, type: 'lowpass', f0: 600, f1: 120 });
  }

  roar(vol = 1) {
    if (!this.ready('roar', 500) || vol <= 0.03) return;
    this.tone({ type: 'sawtooth', f0: 90, f1: 55, dur: 1.1, vol: 0.18 * vol, attack: 0.1 });
    this.tone({ type: 'sawtooth', f0: 137, f1: 80, dur: 1.0, vol: 0.1 * vol, attack: 0.15 });
    this.noise({ dur: 0.9, vol: 0.2 * vol, type: 'lowpass', f0: 500, f1: 200 });
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
    const v = vol;
    switch (type) {
      case 'moss':
        this.tone({ type: 'sawtooth', f0: 170, f1: 110, dur: 0.14, vol: 0.12 * v });
        break;
      case 'bone':
        this.tone({ f0: 720, f1: 520, dur: 0.04, vol: 0.1 * v });
        this.tone({ f0: 640, f1: 480, dur: 0.04, vol: 0.1 * v, delay: 0.05 });
        break;
      case 'skitter':
        this.noise({ dur: 0.06, vol: 0.2 * v, type: 'bandpass', f0: 3200, q: 3 });
        this.tone({ type: 'square', f0: 900, f1: 1300, dur: 0.05, vol: 0.05 * v });
        break;
      case 'bat':
        this.tone({ type: 'triangle', f0: 1800, f1: 2400, dur: 0.06, vol: 0.1 * v });
        break;
      case 'imp':
        this.tone({ type: 'square', f0: 520, f1: 380, dur: 0.08, vol: 0.08 * v });
        break;
      case 'fuse':
        this.noise({ dur: 0.08, vol: 0.2 * v, type: 'highpass', f0: 2500 });
        break;
      case 'knight':
      case 'golem':
        this.noise({ dur: 0.08, vol: 0.3 * v, type: 'bandpass', f0: type === 'golem' ? 700 : 2200, q: 2 });
        this.tone({ type: 'triangle', f0: type === 'golem' ? 120 : 600, f1: type === 'golem' ? 80 : 420, dur: 0.08, vol: 0.1 * v });
        break;
      case 'ghost':
        this.tone({ type: 'sine', f0: 700, f1: 420, dur: 0.2, vol: 0.1 * v });
        break;
      default:
        this.tone({ type: 'sine', f0: 480, f1: 900, dur: 0.1, vol: 0.2 * v });
    }
  }

  mobDie(type, vol = 1) {
    if (!this.ready('mdie', 40) || vol <= 0) return;
    const v = vol;
    switch (type) {
      case 'moss':
        this.tone({ type: 'sawtooth', f0: 150, f1: 45, dur: 0.45, vol: 0.14 * v });
        break;
      case 'bone':
        for (let i = 0; i < 4; i++) this.noise({ dur: 0.04, vol: 0.2 * v, type: 'bandpass', f0: 2600 - i * 300, q: 3, delay: i * 0.06 });
        break;
      case 'skitter':
        for (let i = 0; i < 3; i++) this.noise({ dur: 0.04, vol: 0.18 * v, type: 'bandpass', f0: 3400 - i * 500, q: 3, delay: i * 0.05 });
        break;
      case 'bat':
        this.tone({ type: 'triangle', f0: 2400, f1: 900, dur: 0.25, vol: 0.1 * v });
        break;
      case 'imp':
        [700, 560, 420].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.07, vol: 0.07 * v, delay: i * 0.07 }));
        break;
      case 'fuse':
        this.noise({ dur: 0.2, vol: 0.2 * v, type: 'lowpass', f0: 900, f1: 200 });
        this.tone({ type: 'sine', f0: 600, f1: 200, dur: 0.15, vol: 0.1 * v });
        break;
      case 'knight':
        this.noise({ dur: 0.35, vol: 0.3 * v, type: 'bandpass', f0: 1800, f1: 600, q: 1.5 });
        this.tone({ type: 'triangle', f0: 400, f1: 150, dur: 0.3, vol: 0.1 * v });
        break;
      case 'golem':
        this.noise({ dur: 0.6, vol: 0.45 * v, type: 'lowpass', f0: 900, f1: 100 });
        this.tone({ type: 'sine', f0: 90, f1: 35, dur: 0.5, vol: 0.3 * v });
        break;
      case 'ghost':
        this.tone({ type: 'sine', f0: 900, f1: 200, dur: 0.7, vol: 0.12 * v, attack: 0.05 });
        this.tone({ type: 'sine', f0: 905, f1: 205, dur: 0.7, vol: 0.08 * v, attack: 0.05 });
        break;
      default:
        this.tone({ type: 'sine', f0: 800, f1: 110, dur: 0.28, vol: 0.2 * v });
        this.noise({ dur: 0.15, vol: 0.15 * v, type: 'lowpass', f0: 600 });
    }
  }

  fuse(vol = 1) {
    if (!this.ready('fuse', 110) || vol <= 0.03) return;
    this.noise({ dur: 0.12, vol: 0.14 * vol, type: 'highpass', f0: 4000 + Math.random() * 1500 });
  }

  squeak(vol = 1) {
    if (!this.ready('squeak', 300) || vol <= 0.03) return;
    this.tone({ type: 'triangle', f0: 2200, f1: 3000, dur: 0.08, vol: 0.08 * vol });
    this.tone({ type: 'triangle', f0: 2600, f1: 3200, dur: 0.06, vol: 0.06 * vol, delay: 0.1 });
  }

  clank(vol = 1) {
    if (!this.ready('clank', 60) || vol <= 0.03) return;
    this.tone({ type: 'square', f0: 1900, f1: 1500, dur: 0.05, vol: 0.06 * vol });
    this.noise({ dur: 0.05, vol: 0.2 * vol, type: 'bandpass', f0: 3000, q: 4 });
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

  thunder(vol = 0.6, delay = 0.5) {
    if (!this.ready('thunder', 800)) return;
    this.noise({ dur: 2.4, vol: 0.5 * vol, type: 'lowpass', f0: 700, f1: 60, delay });
    this.noise({ dur: 0.5, vol: 0.35 * vol, type: 'lowpass', f0: 2600, f1: 300, delay });
    this.tone({ type: 'sine', f0: 55, f1: 30, dur: 1.8, vol: 0.3 * vol, delay });
  }

  powerup() {
    if (!this.ready('powerup', 100)) return;
    this.tone({ type: 'square', f0: 440, f1: 1320, dur: 0.25, vol: 0.08 });
    [880, 1109, 1319].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.1, vol: 0.12, delay: 0.2 + i * 0.06 }));
  }

  // Kill streak callouts: a rising fanfare, higher for bigger streaks.
  streak(level) {
    if (!this.ready('streak', 200)) return;
    const base = 392 * Math.pow(1.12, Math.min(6, level));
    [1, 1.25, 1.5, 2].forEach((k, i) => this.tone({ type: 'square', f0: base * k, dur: 0.12, vol: 0.07, delay: i * 0.07 }));
  }

  combo(n) {
    if (!this.ready('combo', 40)) return;
    this.tone({ type: 'triangle', f0: 520 + Math.min(12, n) * 60, dur: 0.08, vol: 0.08 });
  }

  death() {
    if (!this.ready('death')) return;
    this.tone({ type: 'sawtooth', f0: 300, f1: 55, dur: 0.9, vol: 0.22 });
  }
}
