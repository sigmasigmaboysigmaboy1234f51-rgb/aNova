// All sound effects are synthesised with Web Audio. No audio files.
//
// Every sound is built from a few layers, the way real foley is: a sharp
// transient, a body (a pitched thump), filtered noise for texture and a
// tail, all sent through a small room reverb and a compressor so it sits
// together instead of beeping.

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rnd = (a, b) => a + Math.random() * (b - a);

// Engine sounds: base pitch, how far it climbs, filter and volume.
const ENGINES = {
  car: { f0: 38, range: 92, lp: 300, lpRange: 1300, vol: 0.06 },
  sports: { f0: 52, range: 150, lp: 500, lpRange: 2200, vol: 0.06 },
  big: { f0: 27, range: 55, lp: 220, lpRange: 700, vol: 0.07 },
  monster: { f0: 24, range: 70, lp: 380, lpRange: 1400, vol: 0.09 },
};

// Inharmonic partials of a small metal part, for clicks, dings and clanks.
const METAL = [1, 2.76, 5.4, 8.93];

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
      const c = new AC();
      this.ctx = c;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7 * this.volume;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 14;
      comp.ratio.value = 5;
      comp.attack.value = 0.002;
      comp.release.value = 0.22;
      this.master.connect(comp).connect(c.destination);
      this.dry = c.createGain();
      this.dry.connect(this.master);
      // A short, roomy reverb.
      this.verbIn = c.createGain();
      const verb = c.createConvolver();
      verb.buffer = this.impulse(2.2, 3.2);
      const verbOut = c.createGain();
      verbOut.gain.value = 0.9;
      this.verbIn.connect(verb).connect(verbOut).connect(this.master);
      // Soft clipping gives gunshots and booms some grit.
      this.grit = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * 2.6) / Math.tanh(2.6);
      }
      this.grit.curve = curve;
      this.grit.connect(this.dry);
      this.white = this.makeNoise('white');
      this.pink = this.makeNoise('pink');
      this.brown = this.makeNoise('brown');
      this.noiseBuf = this.white;
    }
    if (this.ctx.state === 'suspended') {
      const r = this.ctx.resume();
      if (r && r.catch) r.catch(() => {});
    }
  }

  makeNoise(kind) {
    const c = this.ctx;
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const k = i / len;
        // A few early reflections, then a smooth decay.
        const early = i < c.sampleRate * 0.06 && Math.random() < 0.004 ? 1.6 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, decay) * early * 0.5;
      }
    }
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7 * this.volume;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7 * this.volume;
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

  // --- Building blocks ------------------------------------------------------

  // Where a sound goes: dry, plus some of it to the reverb.
  voice(send = 0.15, pan = 0) {
    const c = this.ctx;
    const g = c.createGain();
    let node = g;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    node.connect(this.dry);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      node.connect(s).connect(this.verbIn);
    }
    return g;
  }

  env(g, t, attack, peak, dur, curve = 'exp') {
    // Silent until the envelope starts, or the first sample would play at
    // full volume and click.
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t + attack + dur);
  }

  // Filtered noise. filters: [[type, f0, f1, q], ...] in series.
  noiseL({ out, t = 0, dur, vol, color = 'white', filters = [], attack = 0.001, rate = 1 }) {
    const c = this.ctx;
    const at = c.currentTime + t;
    const s = c.createBufferSource();
    s.buffer = this[color] || this.white;
    s.playbackRate.value = rate;
    let node = s;
    for (const [type, f0, f1 = f0, q = 0.7] of filters) {
      const f = c.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, at);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + attack + dur);
      node.connect(f);
      node = f;
    }
    const g = c.createGain();
    this.env(g, at, attack, vol, dur);
    node.connect(g).connect(out);
    s.start(at, Math.random() * 1.5);
    s.stop(at + attack + dur + 0.05);
  }

  // A pitched oscillator with a pitch glide.
  oscL({ out, t = 0, type = 'sine', f0, f1 = f0, dur, vol, attack = 0.002, glide, vibrato, detune = 0 }) {
    const c = this.ctx;
    const at = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + (glide || attack + dur));
    if (vibrato) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = vibrato[0];
      lg.gain.value = vibrato[1];
      l.connect(lg).connect(o.frequency);
      l.start(at);
      l.stop(at + attack + dur + 0.05);
    }
    const g = c.createGain();
    this.env(g, at, attack, vol, dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + attack + dur + 0.05);
    return o;
  }

  // A pitched thump through the grit shaper: the chest of a gunshot or a boom.
  thump({ t = 0, f0, f1, dur, vol, send = 0.1 }) {
    const c = this.ctx;
    const at = c.currentTime + t;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const g = c.createGain();
    // The grit shaper boosts quiet input about 2.6x, so feed it less.
    this.env(g, at, 0.002, vol * 0.4, dur);
    o.connect(g).connect(this.grit);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.verbIn);
    }
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // A small metal part: a click, a ding or a clank depending on length.
  metal({ out, t = 0, f = 2400, dur = 0.05, vol = 0.1, partials = METAL }) {
    vol *= 0.3;
    partials.forEach((k, i) => this.oscL({ out, t, type: 'sine', f0: f * k * rnd(0.98, 1.02), dur: dur / (1 + i * 0.7), vol: vol / (1 + i * 0.9), attack: 0.0008 }));
    this.noiseL({ out, t, dur: 0.012, vol: vol * 0.8, filters: [['highpass', f * 1.2, f * 1.2, 0.7]] });
  }

  // A voice: a buzzy tone shaped by formant filters, for grunts and growls.
  growl({ out, t = 0, f0, f1 = f0, dur, vol, formants = [[500, 4], [1100, 5]], vibrato = [6, 3], type = 'sawtooth', attack = 0.03, breath = 0.3 }) {
    const c = this.ctx;
    const at = c.currentTime + t;
    const mix = c.createGain();
    mix.gain.value = 1;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + attack + dur);
    const l = c.createOscillator();
    const lg = c.createGain();
    l.frequency.value = vibrato[0];
    lg.gain.value = vibrato[1];
    l.connect(lg).connect(o.frequency);
    const g = c.createGain();
    this.env(g, at, attack, vol, dur);
    for (const [f, q] of formants) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      o.connect(bp).connect(g);
    }
    g.connect(out);
    o.start(at);
    l.start(at);
    o.stop(at + attack + dur + 0.05);
    l.stop(at + attack + dur + 0.05);
    if (breath) this.noiseL({ out, t, dur: dur * 0.8, vol: vol * breath, color: 'pink', attack, filters: [['bandpass', formants[0][0], formants[0][0], 1.5]] });
  }

  // A soft bell for rewards and menus.
  bell({ out, t = 0, f, dur = 0.5, vol = 0.1 }) {
    [1, 2.01, 3.02, 4.2].forEach((k, i) => this.oscL({ out, t, type: 'sine', f0: f * k, dur: dur / (1 + i * 0.6), vol: vol / (1 + i * 1.3), attack: 0.002 }));
  }

  // A plucked note: triangle with a fast decay.
  pluck({ out, t = 0, f, dur = 0.25, vol = 0.1 }) {
    this.oscL({ out, t, type: 'triangle', f0: f, dur, vol, attack: 0.002 });
    this.oscL({ out, t, type: 'sine', f0: f * 2, dur: dur * 0.5, vol: vol * 0.4, attack: 0.002 });
  }

  // Old helpers other code may still call.
  tone({ type = 'sine', f0, f1 = f0, dur, vol = 0.2, delay = 0, attack = 0.004 }) {
    if (!this.ctx) return;
    this.oscL({ out: this.voice(0.1), t: delay, type, f0, f1, dur, vol: vol * 0.8, attack });
  }

  noise({ dur, vol = 0.2, type = 'lowpass', f0 = 1000, f1 = f0, q = 1, delay = 0 }) {
    if (!this.ctx) return;
    this.noiseL({ out: this.voice(0.1), t: delay, dur, vol, filters: [[type, f0, f1, q]] });
  }

  // --- Guns -------------------------------------------------------------------

  // One gunshot: crack, chest thump, mid-range bang, a room tail, and a
  // little energy zing (these are energy guns, after all).
  blast(o, vol = 1, quiet = false) {
    const far = 1 - clamp01(vol);
    const p = rnd(0.94, 1.06) * (o.pitch || 1);
    const out = this.voice((o.send ?? 0.25) + far * 0.35);
    const v = vol * 1.5;
    if (quiet) {
      // Suppressed: a soft thwip and a click.
      this.noiseL({ out, dur: 0.07, vol: 0.5 * v, color: 'pink', filters: [['bandpass', 1400 * p, 600, 0.9]] });
      this.thump({ f0: 160 * p, f1: 70, dur: 0.06, vol: 0.25 * v, send: 0 });
      this.metal({ out, f: 3200, dur: 0.03, vol: 0.05 * v });
      return;
    }
    const near = 1 - far * 0.8;
    this.noiseL({ out, dur: o.crackDur || 0.014, vol: (o.crack ?? 0.9) * v * near * near, filters: [['highpass', (o.crackF || 2600) * p, (o.crackF || 2600) * p, 0.6]] });
    this.thump({ f0: (o.bodyF || 170) * p, f1: (o.bodyF1 || 55) * p, dur: o.bodyDur || 0.1, vol: (o.body ?? 0.9) * v, send: 0.15 + far * 0.3 });
    this.noiseL({
      out,
      t: 0.002,
      dur: o.midDur || 0.08,
      vol: (o.mid ?? 0.55) * v * (0.4 + near * 0.6),
      color: 'pink',
      filters: [
        ['bandpass', (o.midF || 1300) * p, (o.midF || 1300) * p * 0.5, o.midQ || 0.8],
        ['lowpass', 7000 - far * 5500, 7000 - far * 5500, 0.5],
      ],
    });
    this.noiseL({ out, t: 0.01, dur: o.tailDur || 0.3, vol: (o.tail ?? 0.3) * v, color: 'brown', filters: [['lowpass', o.tailF || 900, (o.tailF || 900) * 0.35, 0.6]] });
    if (o.zing) this.oscL({ out, t: 0.004, type: 'sine', f0: 2600 * p, f1: 500, dur: 0.07, vol: o.zing * v * near });
  }

  // Every gun frame has its own voice. vol < 1 means it's further away.
  gunshot(frame, quiet = false, vol = 1) {
    if (!this.ready('gun-' + frame, frame === 'minigun' || frame === 'smg' ? 25 : 30) || vol <= 0.03) return;
    switch (frame) {
      case 'pistol':
        this.blast({ crackF: 3400, bodyF: 230, bodyF1: 70, bodyDur: 0.07, midF: 1800, midDur: 0.06, tailDur: 0.2, tail: 0.22, zing: 0.05 }, vol, quiet);
        break;
      case 'smg':
        this.blast({ crackF: 3200, crack: 0.7, bodyF: 210, bodyF1: 85, bodyDur: 0.05, body: 0.7, midF: 1700, midDur: 0.05, mid: 0.45, tailDur: 0.12, tail: 0.18, send: 0.18, zing: 0.04 }, vol, quiet);
        break;
      case 'shotgun': {
        this.blast({ crackF: 1800, crackDur: 0.022, bodyF: 120, bodyF1: 38, bodyDur: 0.22, body: 1.1, midF: 900, midDur: 0.16, mid: 0.7, tailF: 500, tailDur: 0.55, tail: 0.45, send: 0.3 }, vol, quiet);
        // Pump it.
        if (vol > 0.6) this.pump(0.36, vol);
        break;
      }
      case 'sniper':
        this.blast({ crackF: 4200, crack: 1, crackDur: 0.018, bodyF: 110, bodyF1: 34, bodyDur: 0.32, body: 1.1, midF: 1200, midDur: 0.12, mid: 0.6, tailF: 900, tailDur: 0.9, tail: 0.4, send: 0.45, zing: 0.08 }, vol, quiet);
        if (vol > 0.6) this.boltCycle(0.5, vol);
        break;
      case 'crossbow': {
        const out = this.voice(0.12);
        // String twang and a wooden thwack.
        this.oscL({ out, type: 'sawtooth', f0: 190, f1: 150, dur: 0.16, vol: 0.12 * vol, attack: 0.001 });
        this.noiseL({ out, dur: 0.05, vol: 0.4 * vol, color: 'pink', filters: [['bandpass', 1100, 700, 1.5]] });
        this.thump({ f0: 240, f1: 120, dur: 0.05, vol: 0.3 * vol, send: 0 });
        this.noiseL({ out, t: 0.02, dur: 0.18, vol: 0.12 * vol, filters: [['bandpass', 2500, 4500, 2]] });
        break;
      }
      case 'revolver':
        this.blast({ crackF: 2800, crackDur: 0.018, bodyF: 140, bodyF1: 42, bodyDur: 0.2, body: 1.1, midF: 1100, midDur: 0.12, mid: 0.65, tailF: 700, tailDur: 0.6, tail: 0.4, send: 0.35 }, vol, quiet);
        break;
      case 'tesla':
        this.zap(vol);
        break;
      case 'launcher': {
        const out = this.voice(0.2);
        this.thump({ f0: 95, f1: 40, dur: 0.24, vol: 0.9 * vol });
        this.noiseL({ out, dur: 0.3, vol: 0.35 * vol, color: 'brown', filters: [['lowpass', 700, 200, 0.7]] });
        this.noiseL({ out, t: 0.03, dur: 0.35, vol: 0.2 * vol, color: 'pink', filters: [['bandpass', 600, 2400, 1.2]] });
        break;
      }
      case 'minigun':
        this.blast({ crackF: 3000, crack: 0.55, crackDur: 0.01, bodyF: 190, bodyF1: 95, bodyDur: 0.035, body: 0.55, midF: 1900, midDur: 0.035, mid: 0.4, tailDur: 0.08, tail: 0.12, send: 0.14 }, vol, quiet);
        break;
      case 'builder': {
        const out = this.voice(0.12);
        this.thump({ f0: 170, f1: 80, dur: 0.09, vol: 0.6 * vol, send: 0.05 });
        this.noiseL({ out, dur: 0.07, vol: 0.3 * vol, color: 'pink', filters: [['bandpass', 500, 350, 3]] });
        break;
      }
      default:
        this.blast({ zing: 0.07 }, vol, quiet);
    }
  }

  shoot() {
    this.gunshot('rifle');
  }

  remoteShot(vol) {
    this.gunshot('rifle', false, vol);
  }

  pump(t, vol = 1) {
    const out = this.voice(0.1);
    this.noiseL({ out, t, dur: 0.07, vol: 0.25 * vol, color: 'pink', filters: [['bandpass', 1500, 900, 1.5]] });
    this.metal({ out, t: t + 0.05, f: 1500, dur: 0.05, vol: 0.12 * vol });
    this.noiseL({ out, t: t + 0.13, dur: 0.06, vol: 0.25 * vol, color: 'pink', filters: [['bandpass', 1100, 1700, 1.5]] });
    this.metal({ out, t: t + 0.17, f: 1800, dur: 0.06, vol: 0.14 * vol });
  }

  boltCycle(t, vol = 1) {
    const out = this.voice(0.1);
    this.metal({ out, t, f: 2100, dur: 0.04, vol: 0.1 * vol });
    this.noiseL({ out, t: t + 0.03, dur: 0.1, vol: 0.18 * vol, color: 'pink', filters: [['bandpass', 1800, 1100, 2]] });
    this.metal({ out, t: t + 0.15, f: 1700, dur: 0.05, vol: 0.12 * vol });
  }

  // Dry fire.
  empty() {
    if (!this.ready('empty', 120)) return;
    this.metal({ out: this.voice(0.05), f: 2600, dur: 0.035, vol: 0.12 });
  }

  // Reloads, timed to the animation. Every kind of gun reloads its own way.
  reload(dur = 1.1, frame = 'rifle') {
    if (!this.ready('reload')) return;
    const out = this.voice(0.08);
    const k = dur;
    const rustle = (t, v = 0.1) => this.noiseL({ out, t, dur: 0.08, vol: v, color: 'pink', filters: [['bandpass', 2200, 1400, 0.8]] });
    const slide = (t, f0, f1, v = 0.22) => this.noiseL({ out, t, dur: 0.1, vol: v, color: 'pink', filters: [['bandpass', f0, f1, 2.2]] });
    const click = (t, f = 2200, v = 0.14) => this.metal({ out, t, f, dur: 0.045, vol: v });
    switch (frame) {
      case 'shotgun': {
        // Shells go in one by one, then a pump.
        rustle(0.05);
        const n = 4;
        for (let i = 0; i < n; i++) {
          const t = (0.18 + (i / n) * 0.55) * k;
          slide(t, 900, 1400, 0.16);
          click(t + 0.05, 1600, 0.1);
        }
        this.pump(0.82 * k, 0.9);
        break;
      }
      case 'revolver': {
        click(0.1 * k, 1900, 0.12);
        for (let i = 0; i < 5; i++) this.metal({ out, t: (0.22 + i * 0.03) * k, f: rnd(3500, 5000), dur: 0.03, vol: 0.05 });
        for (let i = 0; i < 6; i++) click((0.45 + i * 0.05) * k, 2600, 0.06);
        click(0.82 * k, 1500, 0.16);
        for (let i = 0; i < 6; i++) this.metal({ out, t: 0.88 * k + i * 0.025, f: 3000, dur: 0.015, vol: 0.04 });
        break;
      }
      case 'crossbow': {
        rustle(0.08);
        this.noiseL({ out, t: 0.25 * k, dur: 0.45 * k, vol: 0.14, color: 'pink', filters: [['bandpass', 500, 1200, 3]] });
        this.oscL({ out, t: 0.25 * k, type: 'sawtooth', f0: 80, f1: 160, dur: 0.45 * k, vol: 0.03 });
        click(0.78 * k, 1400, 0.16);
        break;
      }
      case 'launcher': {
        this.thump({ t: 0.15 * k, f0: 220, f1: 120, dur: 0.06, vol: 0.3, send: 0.05 });
        click(0.17 * k, 1200, 0.12);
        slide(0.45 * k, 500, 900, 0.22);
        this.thump({ t: 0.8 * k, f0: 200, f1: 110, dur: 0.07, vol: 0.35, send: 0.05 });
        click(0.82 * k, 1300, 0.14);
        break;
      }
      case 'beam':
      case 'tesla': {
        // An energy cell: hiss out, click in, power back up.
        click(0.15 * k, 2400, 0.1);
        this.noiseL({ out, t: 0.18 * k, dur: 0.3, vol: 0.14, filters: [['highpass', 3500, 6000, 0.7]] });
        slide(0.6 * k, 600, 1200, 0.18);
        click(0.7 * k, 2000, 0.16);
        this.oscL({ out, t: 0.75 * k, type: 'sine', f0: 220, f1: 880, dur: 0.25, vol: 0.05, attack: 0.05 });
        break;
      }
      case 'builder': {
        for (let i = 0; i < 5; i++) this.thump({ t: (0.2 + i * 0.1) * k, f0: rnd(260, 320), f1: 150, dur: 0.04, vol: 0.18, send: 0 });
        click(0.8 * k, 1500, 0.1);
        break;
      }
      default: {
        // A magazine gun: release, pull out, slap a fresh one in, rack it.
        rustle(0.04);
        click(0.16 * k, 2000, 0.13);
        slide(0.19 * k, 1100, 600, 0.2);
        this.noiseL({ out, t: 0.45 * k, dur: 0.05, vol: 0.05, color: 'pink', filters: [['bandpass', 1500, 1500, 3]] });
        slide(0.58 * k, 600, 1200, 0.22);
        click(0.68 * k, 1700, 0.2);
        this.thump({ t: 0.68 * k, f0: 300, f1: 160, dur: 0.04, vol: 0.2, send: 0 });
        if (frame === 'pistol') click(0.86 * k, 2600, 0.18);
        else {
          click(0.8 * k, 1800, 0.12);
          slide(0.81 * k, 1600, 900, 0.14);
          click(0.9 * k, 2300, 0.17);
        }
      }
    }
  }

  zap(vol = 1) {
    if (!this.ready('zap', 40) || vol <= 0.03) return;
    const out = this.voice(0.2);
    // Crackling electricity: a burst of tiny sparks and a buzzing hum.
    for (let i = 0; i < 7; i++) this.noiseL({ out, t: rnd(0, 0.12), dur: rnd(0.006, 0.02), vol: rnd(0.2, 0.5) * vol, filters: [['highpass', rnd(2500, 5000), 3000, 0.7]] });
    this.oscL({ out, type: 'sawtooth', f0: 120, f1: 90, dur: 0.16, vol: 0.06 * vol, vibrato: [45, 25] });
    this.thump({ f0: 160, f1: 70, dur: 0.06, vol: 0.25 * vol, send: 0.1 });
  }

  // A steady hum while a beam gun is firing.
  beam(on) {
    if (!this.ctx) return;
    if (on && !this.beamNode && !this.muted) {
      const c = this.ctx;
      const g = c.createGain();
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1100;
      f.Q.value = 3;
      const oscs = [110, 110.7, 221.5].map((fr, i) => {
        const o = c.createOscillator();
        o.type = i === 2 ? 'square' : 'sawtooth';
        o.frequency.value = fr;
        o.connect(f);
        o.start();
        return o;
      });
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = 300;
      lfo.connect(lg).connect(f.frequency);
      lfo.start();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.linearRampToValueAtTime(0.09, c.currentTime + 0.06);
      const out = this.voice(0.2);
      f.connect(g).connect(out);
      this.beamNode = { oscs: [...oscs, lfo], g };
    } else if (!on && this.beamNode) {
      const { oscs, g } = this.beamNode;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      for (const o of oscs) o.stop(t + 0.1);
      this.beamNode = null;
    }
  }

  // The minigun's motor winding up.
  spin(level) {
    if (!this.ready('spin', 70) || level >= 1) return;
    const out = this.voice(0.05);
    this.oscL({ out, type: 'sawtooth', f0: 60 + level * 260, f1: 70 + level * 280, dur: 0.08, vol: 0.14, attack: 0.02 });
    this.noiseL({ out, dur: 0.08, vol: 0.15, filters: [['bandpass', 400 + level * 1500, 400 + level * 1500, 3]] });
  }

  throw() {
    if (!this.ready('throw', 80)) return;
    this.noiseL({ out: this.voice(0.1), dur: 0.2, vol: 0.18, color: 'pink', attack: 0.04, filters: [['bandpass', 500, 1800, 1.2]] });
  }

  // A grenade bouncing.
  bounce() {
    if (!this.ready('bounce', 90)) return;
    const out = this.voice(0.1);
    this.metal({ out, f: rnd(900, 1200), dur: 0.08, vol: 0.12 });
    this.thump({ f0: 200, f1: 120, dur: 0.04, vol: 0.12, send: 0 });
  }

  explosion(vol = 1, small = false) {
    if (!this.ready(small ? 'pop' : 'boom', small ? 40 : 60) || vol <= 0.03) return;
    const out = this.voice(0.35 + (1 - vol) * 0.3);
    if (small) {
      this.thump({ f0: 140, f1: 45, dur: 0.18, vol: 0.6 * vol });
      this.noiseL({ out, dur: 0.25, vol: 0.4 * vol, color: 'pink', filters: [['lowpass', 2500, 300, 0.7]] });
      return;
    }
    // Crack, a deep boom, rumble, and bits of debris pattering down.
    this.noiseL({ out, dur: 0.03, vol: 0.9 * vol * vol, filters: [['highpass', 1500, 1500, 0.5]] });
    this.thump({ f0: 75, f1: 25, dur: 0.9, vol: 1.2 * vol, send: 0.3 });
    this.noiseL({ out, dur: 0.5, vol: 0.7 * vol, color: 'pink', filters: [['lowpass', 3000, 250, 0.7]] });
    this.noiseL({ out, t: 0.02, dur: 1.6, vol: 0.6 * vol, color: 'brown', filters: [['lowpass', 500, 90, 0.6]] });
    for (let i = 0; i < 8; i++) this.noiseL({ out, t: rnd(0.2, 1.1), dur: rnd(0.01, 0.03), vol: rnd(0.04, 0.12) * vol, color: 'pink', filters: [['bandpass', rnd(1200, 3500), 1500, 1.5]] });
  }

  equip() {
    if (!this.ready('equip', 60)) return;
    const out = this.voice(0.05);
    this.noiseL({ out, dur: 0.1, vol: 0.12, color: 'pink', attack: 0.02, filters: [['bandpass', 1800, 1100, 0.8]] });
    this.metal({ out, t: 0.08, f: 1900, dur: 0.05, vol: 0.12 });
    this.metal({ out, t: 0.14, f: 2500, dur: 0.04, vol: 0.08 });
  }

  // Menus: a soft tick instead of a beep.
  click() {
    if (!this.ready('click', 30)) return;
    const out = this.voice(0.02);
    this.noiseL({ out, dur: 0.012, vol: 0.35, filters: [['bandpass', 3200, 3200, 1.2]] });
    this.oscL({ out, type: 'sine', f0: 1500, f1: 1200, dur: 0.03, vol: 0.1 });
  }

  coin() {
    if (!this.ready('coin', 45)) return;
    const out = this.voice(0.15);
    const f = rnd(1480, 1620);
    this.bell({ out, f, dur: 0.18, vol: 0.06 });
    this.bell({ out, t: 0.06, f: f * 1.335, dur: 0.35, vol: 0.06 });
  }

  buy() {
    if (!this.ready('buy', 80)) return;
    const out = this.voice(0.2);
    for (let i = 0; i < 5; i++) this.metal({ out, t: i * 0.035, f: rnd(3000, 4500), dur: 0.05, vol: 0.05 });
    this.bell({ out, t: 0.12, f: 1319, dur: 0.4, vol: 0.07 });
    this.bell({ out, t: 0.2, f: 1760, dur: 0.6, vol: 0.07 });
  }

  crate() {
    if (!this.ready('crate', 200)) return;
    const out = this.voice(0.25);
    // Wood creaks open, then a sparkle.
    this.noiseL({ out, dur: 0.25, vol: 0.2, color: 'pink', attack: 0.05, filters: [['bandpass', 400, 900, 5]] });
    this.thump({ t: 0.2, f0: 180, f1: 90, dur: 0.08, vol: 0.14, send: 0.1 });
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.bell({ out, t: 0.28 + i * 0.06, f, dur: 0.5, vol: 0.05 }));
  }

  landThud(vol = 1) {
    if (!this.ready('thud', 80) || vol <= 0.03) return;
    const out = this.voice(0.2);
    this.thump({ f0: 110, f1: 35, dur: 0.3, vol: 0.8 * vol, send: 0.2 });
    this.noiseL({ out, dur: 0.3, vol: 0.4 * vol, color: 'brown', filters: [['lowpass', 600, 120, 0.6]] });
  }

  // A boss's roar: two growling voices and a rumble.
  roar(vol = 1) {
    if (!this.ready('roar', 500) || vol <= 0.03) return;
    const out = this.voice(0.45);
    this.growl({ out, f0: 85, f1: 60, dur: 1.2, vol: 0.5 * vol, formants: [[320, 3], [720, 4], [1500, 6]], vibrato: [5, 5], attack: 0.12, breath: 0.6 });
    this.growl({ out, f0: 128, f1: 90, dur: 1.0, vol: 0.3 * vol, formants: [[450, 3], [1000, 5]], vibrato: [7, 6], attack: 0.15, breath: 0.2 });
    this.noiseL({ out, dur: 1.3, vol: 0.35 * vol, color: 'brown', attack: 0.15, filters: [['lowpass', 400, 150, 0.7]] });
  }

  // Your bullet landed: a crisp tick.
  hit() {
    if (!this.ready('hit', 25)) return;
    const out = this.voice(0.03);
    this.noiseL({ out, dur: 0.02, vol: 0.5, filters: [['bandpass', 4200, 4200, 2]] });
    this.oscL({ out, type: 'sine', f0: 2100, f1: 1800, dur: 0.035, vol: 0.14 });
  }

  // Headshot: a bright metallic ding.
  headshot() {
    if (!this.ready('head', 25)) return;
    const out = this.voice(0.15);
    this.metal({ out, f: 2200, dur: 0.35, vol: 0.16, partials: [1, 2.01, 2.76, 5.4] });
    this.noiseL({ out, dur: 0.02, vol: 0.2, filters: [['bandpass', 5000, 5000, 2]] });
  }

  blockHit(kind) {
    if (!this.ready('bhit', 30)) return;
    const out = this.voice(0.1);
    if (kind === 'hard') {
      this.noiseL({ out, dur: 0.05, vol: 0.35, color: 'pink', filters: [['bandpass', 2400, 1800, 1.5]] });
      this.metal({ out, f: rnd(2600, 3200), dur: 0.03, vol: 0.05 });
    } else if (kind === 'wood') {
      this.noiseL({ out, dur: 0.06, vol: 0.3, color: 'pink', filters: [['bandpass', 650, 500, 3]] });
      this.thump({ f0: 320, f1: 200, dur: 0.05, vol: 0.2, send: 0 });
    } else if (kind === 'leaf') {
      this.noiseL({ out, dur: 0.1, vol: 0.2, color: 'pink', filters: [['highpass', 2500, 4000, 0.7]] });
    } else {
      this.noiseL({ out, dur: 0.07, vol: 0.4, color: 'brown', filters: [['lowpass', 900, 400, 0.7]] });
      this.noiseL({ out, dur: 0.04, vol: 0.1, color: 'pink', filters: [['bandpass', 1800, 1800, 1]] });
    }
  }

  blockBreak(kind) {
    if (!this.ready('bbreak', 40)) return;
    const out = this.voice(0.15);
    out.gain.value = 2;
    const f = kind === 'hard' ? 2000 : kind === 'wood' ? 800 : kind === 'leaf' ? 3500 : 1000;
    this.noiseL({ out, dur: 0.22, vol: 0.45, color: kind === 'leaf' ? 'pink' : 'brown', filters: [[kind === 'leaf' ? 'highpass' : 'lowpass', f, f * 0.35, 0.7]] });
    for (let i = 0; i < 5; i++) this.noiseL({ out, t: rnd(0.02, 0.2), dur: 0.02, vol: 0.12, color: 'pink', filters: [['bandpass', f * rnd(1, 2), f, 2]] });
    if (kind === 'wood') this.thump({ f0: 260, f1: 120, dur: 0.08, vol: 0.25, send: 0 });
  }

  place() {
    if (!this.ready('place', 40)) return;
    const out = this.voice(0.08);
    this.thump({ f0: 200, f1: 95, dur: 0.08, vol: 0.45, send: 0.05 });
    this.noiseL({ out, dur: 0.06, vol: 0.2, color: 'brown', filters: [['lowpass', 1200, 500, 0.7]] });
  }

  // Footsteps: a soft heel thud plus the sound of what you're walking on.
  step(kind) {
    if (!this.ready('step', 90)) return;
    const out = this.voice(0.04, rnd(-0.15, 0.15));
    const v = rnd(0.8, 1.1) * 3;
    this.noiseL({ out, dur: 0.05, vol: 0.12 * v, color: 'brown', filters: [['lowpass', 350, 200, 0.7]] });
    if (kind === 'hard') this.noiseL({ out, dur: 0.03, vol: 0.1 * v, color: 'pink', filters: [['bandpass', rnd(1800, 2400), 1500, 2]] });
    else if (kind === 'wood') this.noiseL({ out, dur: 0.06, vol: 0.12 * v, color: 'pink', filters: [['bandpass', rnd(320, 420), 300, 5]] });
    else if (kind === 'leaf') this.noiseL({ out, dur: 0.08, vol: 0.07 * v, color: 'pink', filters: [['highpass', 3000, 3000, 0.7]] });
    else this.noiseL({ out, t: 0.005, dur: 0.07, vol: 0.08 * v, color: 'pink', filters: [['bandpass', rnd(1800, 2800), 1500, 0.9]] });
  }

  jump() {
    if (!this.ready('jump', 80)) return;
    this.noiseL({ out: this.voice(0.02), dur: 0.1, vol: 0.16, color: 'pink', attack: 0.02, filters: [['bandpass', 900, 1600, 0.8]] });
  }

  // You got hit: a punchy impact and a short grunt.
  hurt() {
    if (!this.ready('hurt', 80)) return;
    const out = this.voice(0.1);
    this.thump({ f0: 130, f1: 60, dur: 0.12, vol: 0.5, send: 0.05 });
    this.noiseL({ out, dur: 0.08, vol: 0.25, color: 'pink', filters: [['lowpass', 1500, 500, 0.7]] });
    this.growl({ out, t: 0.01, f0: rnd(150, 175), f1: 120, dur: 0.16, vol: 0.16, formants: [[600, 4], [1100, 6]], vibrato: [9, 3], attack: 0.01, breath: 0.5 });
  }

  mobHurt(type, vol = 1) {
    if (!this.ready('mhurt', 40) || vol <= 0) return;
    const v = vol * 1.6;
    const out = this.voice(0.15);
    switch (type) {
      case 'moss':
        this.growl({ out, f0: rnd(100, 120), f1: 80, dur: 0.3, vol: 0.3 * v, formants: [[420, 4], [900, 5]], vibrato: [7, 4] });
        break;
      case 'bone':
        for (let i = 0; i < 5; i++) this.noiseL({ out, t: i * rnd(0.018, 0.03), dur: 0.012, vol: 0.75 * v, color: 'pink', filters: [['bandpass', rnd(1600, 2600), 1500, 4]] });
        break;
      case 'gloop':
        this.noiseL({ out, dur: 0.18, vol: 0.4 * v, color: 'brown', filters: [['bandpass', 300, 1200, 5]] });
        this.oscL({ out, type: 'sine', f0: 180, f1: 380, dur: 0.12, vol: 0.18 * v });
        break;
      case 'skitter':
        for (let i = 0; i < 6; i++) this.noiseL({ out, t: i * 0.018, dur: 0.01, vol: 0.2 * v, filters: [['bandpass', rnd(3000, 4200), 3500, 5]] });
        this.noiseL({ out, dur: 0.12, vol: 0.08 * v, filters: [['highpass', 4000, 4000, 0.7]] });
        break;
      case 'bat':
        this.oscL({ out, type: 'sine', f0: 3200, f1: 4400, dur: 0.05, vol: 0.08 * v, vibrato: [60, 300] });
        this.oscL({ out, t: 0.07, type: 'sine', f0: 3400, f1: 4600, dur: 0.04, vol: 0.06 * v, vibrato: [60, 300] });
        break;
      case 'imp':
        this.growl({ out, f0: rnd(260, 320), f1: 220, dur: 0.18, vol: 0.2 * v, formants: [[900, 4], [2200, 6]], vibrato: [14, 20], attack: 0.01, breath: 0.6 });
        break;
      case 'fuse':
        this.noiseL({ out, dur: 0.15, vol: 0.18 * v, attack: 0.03, filters: [['highpass', 3000, 5000, 0.7]] });
        break;
      case 'knight':
        this.metal({ out, f: rnd(1300, 1600), dur: 0.2, vol: 0.14 * v });
        this.growl({ out, f0: 140, f1: 110, dur: 0.14, vol: 0.12 * v, formants: [[500, 4], [1000, 5]], attack: 0.01 });
        break;
      case 'golem':
        this.noiseL({ out, dur: 0.2, vol: 0.4 * v, color: 'brown', filters: [['lowpass', 500, 200, 0.7]] });
        for (let i = 0; i < 4; i++) this.noiseL({ out, t: rnd(0, 0.15), dur: 0.02, vol: 0.12 * v, color: 'pink', filters: [['bandpass', rnd(600, 1200), 800, 2]] });
        break;
      case 'ghost':
        this.noiseL({ out, dur: 0.35, vol: 0.15 * v, color: 'pink', attack: 0.05, filters: [['bandpass', 1200, 600, 6]] });
        this.oscL({ out, type: 'sine', f0: 660, f1: 440, dur: 0.3, vol: 0.06 * v, attack: 0.05, vibrato: [6, 12] });
        break;
      default:
        this.growl({ out, f0: 200, f1: 150, dur: 0.15, vol: 0.2 * v });
    }
  }

  mobDie(type, vol = 1) {
    if (!this.ready('mdie', 40) || vol <= 0) return;
    const v = vol;
    const out = this.voice(0.25);
    switch (type) {
      case 'moss':
        this.growl({ out, f0: 110, f1: 45, dur: 0.8, vol: 0.22 * v, formants: [[400, 4], [850, 5]], vibrato: [5, 5], attack: 0.05 });
        this.thump({ t: 0.5, f0: 120, f1: 50, dur: 0.15, vol: 0.12 * v });
        break;
      case 'bone':
        for (let i = 0; i < 12; i++) this.noiseL({ out, t: rnd(0, 0.45), dur: 0.015, vol: rnd(0.4, 0.7) * v, color: 'pink', filters: [['bandpass', rnd(1400, 2800), 1500, 4]] });
        break;
      case 'gloop':
        this.noiseL({ out, dur: 0.4, vol: 0.5 * v, color: 'brown', filters: [['bandpass', 200, 1500, 4]] });
        this.oscL({ out, type: 'sine', f0: 300, f1: 90, dur: 0.35, vol: 0.2 * v });
        break;
      case 'skitter':
        for (let i = 0; i < 10; i++) this.noiseL({ out, t: i * 0.03, dur: 0.012, vol: (0.5 - i * 0.04) * v, filters: [['bandpass', rnd(2800, 4000), 3000, 5]] });
        break;
      case 'bat':
        this.oscL({ out, type: 'sine', f0: 4200, f1: 1200, dur: 0.3, vol: 0.08 * v, vibrato: [40, 200] });
        break;
      case 'imp':
        this.growl({ out, f0: 340, f1: 140, dur: 0.4, vol: 0.2 * v, formants: [[900, 4], [2000, 6]], vibrato: [16, 30], breath: 0.6 });
        this.noiseL({ out, t: 0.1, dur: 0.4, vol: 0.2 * v, color: 'pink', filters: [['lowpass', 3000, 400, 0.7]] });
        break;
      case 'fuse':
        this.noiseL({ out, dur: 0.3, vol: 0.2 * v, filters: [['lowpass', 2000, 200, 0.7]] });
        break;
      case 'knight':
        for (let i = 0; i < 4; i++) this.metal({ out, t: i * rnd(0.06, 0.1), f: rnd(900, 1600), dur: 0.2, vol: 0.12 * v });
        this.thump({ t: 0.3, f0: 140, f1: 60, dur: 0.15, vol: 0.4 * v });
        break;
      case 'golem':
        this.explosion(0.5 * v, true);
        this.noiseL({ out, dur: 1.0, vol: 0.5 * v, color: 'brown', filters: [['lowpass', 700, 100, 0.7]] });
        for (let i = 0; i < 10; i++) this.noiseL({ out, t: rnd(0.1, 0.8), dur: 0.03, vol: 0.12 * v, color: 'pink', filters: [['bandpass', rnd(400, 1500), 700, 2]] });
        break;
      case 'ghost':
        this.noiseL({ out, dur: 0.9, vol: 0.2 * v, color: 'pink', attack: 0.05, filters: [['bandpass', 1500, 300, 5]] });
        this.oscL({ out, type: 'sine', f0: 880, f1: 180, dur: 0.8, vol: 0.07 * v, attack: 0.05, vibrato: [5, 15] });
        break;
      default:
        this.thump({ f0: 160, f1: 50, dur: 0.2, vol: 0.4 * v });
        this.noiseL({ out, dur: 0.25, vol: 0.2 * v, color: 'pink', filters: [['lowpass', 1200, 300, 0.7]] });
    }
  }

  // A lit fuse fizzing.
  fuse(vol = 1) {
    if (!this.ready('fuse', 110) || vol <= 0.03) return;
    const out = this.voice(0.05);
    this.noiseL({ out, dur: 0.12, vol: 0.12 * vol, filters: [['highpass', rnd(4000, 6000), 5000, 0.7]] });
    for (let i = 0; i < 3; i++) this.noiseL({ out, t: rnd(0, 0.1), dur: 0.006, vol: 0.2 * vol, filters: [['highpass', 6000, 6000, 0.7]] });
  }

  squeak(vol = 1) {
    if (!this.ready('squeak', 300) || vol <= 0.03) return;
    const out = this.voice(0.1);
    this.oscL({ out, type: 'sine', f0: 2200, f1: 3100, dur: 0.07, vol: 0.08 * vol, vibrato: [30, 80] });
    this.oscL({ out, t: 0.1, type: 'sine', f0: 2500, f1: 3300, dur: 0.05, vol: 0.06 * vol, vibrato: [30, 80] });
  }

  clank(vol = 1) {
    if (!this.ready('clank', 60) || vol <= 0.03) return;
    const out = this.voice(0.15);
    this.metal({ out, f: rnd(1200, 1600), dur: 0.18, vol: 0.14 * vol });
    this.thump({ f0: 300, f1: 180, dur: 0.04, vol: 0.2 * vol, send: 0 });
  }

  groan(vol = 1) {
    if (!this.ready('groan', 2600) || vol <= 0.05) return;
    this.growl({ out: this.voice(0.3), f0: rnd(85, 110), f1: 70, dur: 0.9, vol: 0.15 * vol, formants: [[380, 4], [800, 5]], vibrato: [4, 4], attack: 0.2, breath: 0.4 });
  }

  // Something powering up a big attack.
  charge(vol = 1) {
    if (!this.ready('charge', 300) || vol <= 0.05) return;
    const out = this.voice(0.25);
    this.oscL({ out, type: 'sawtooth', f0: 90, f1: 360, dur: 0.6, vol: 0.05 * vol, attack: 0.3, vibrato: [18, 8] });
    this.noiseL({ out, dur: 0.6, vol: 0.1 * vol, attack: 0.4, filters: [['bandpass', 400, 2400, 4]] });
  }

  // A magic bolt whooshing past.
  bolt(vol = 1) {
    if (!this.ready('bolt', 60) || vol <= 0.05) return;
    const out = this.voice(0.2);
    this.noiseL({ out, dur: 0.3, vol: 0.2 * vol, attack: 0.04, color: 'pink', filters: [['bandpass', 1800, 600, 2]] });
    this.oscL({ out, type: 'sine', f0: 900, f1: 300, dur: 0.22, vol: 0.05 * vol, vibrato: [25, 40] });
  }

  // A slime bouncing.
  hop(vol = 1) {
    if (!this.ready('hop', 60) || vol <= 0.05) return;
    const out = this.voice(0.1);
    out.gain.value = 2;
    this.noiseL({ out, dur: 0.12, vol: 0.25 * vol, color: 'brown', filters: [['bandpass', 250, 800, 4]] });
    this.oscL({ out, type: 'sine', f0: 160, f1: 320, dur: 0.09, vol: 0.12 * vol });
  }

  pickup() {
    if (!this.ready('pickup', 60)) return;
    const out = this.voice(0.15);
    this.oscL({ out, type: 'sine', f0: 420, f1: 900, dur: 0.07, vol: 0.12 });
    this.bell({ out, t: 0.05, f: 1175, dur: 0.3, vol: 0.06 });
  }

  // A war drum and a horn: here they come.
  wave() {
    if (!this.ready('wave')) return;
    const out = this.voice(0.4);
    this.thump({ f0: 90, f1: 45, dur: 0.5, vol: 0.4, send: 0.4 });
    this.thump({ t: 0.35, f0: 90, f1: 45, dur: 0.5, vol: 0.35, send: 0.4 });
    this.growl({ out, t: 0.1, f0: 146.8, dur: 0.9, vol: 0.14, formants: [[500, 2], [1200, 3], [2400, 4]], vibrato: [5, 1.5], attack: 0.08, breath: 0.1 });
    this.growl({ out, t: 0.1, f0: 220, dur: 0.9, vol: 0.1, formants: [[600, 2], [1400, 3]], vibrato: [5, 1.5], attack: 0.08, breath: 0 });
  }

  // Wave cleared: a bright little fanfare.
  cleared() {
    if (!this.ready('cleared')) return;
    const out = this.voice(0.35);
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.pluck({ out, t: i * 0.08, f, dur: 0.5, vol: 0.1 }));
    [523.3, 659.3, 784].forEach((f) => this.oscL({ out, t: 0.32, type: 'triangle', f0: f, dur: 0.8, vol: 0.05, attack: 0.05 }));
    this.bell({ out, t: 0.32, f: 2093, dur: 0.8, vol: 0.04 });
  }

  thunder(vol = 0.6, delay = 0.5) {
    if (!this.ready('thunder', 800)) return;
    const out = this.voice(0.5);
    this.noiseL({ out, t: delay, dur: 0.12, vol: 0.4 * vol, filters: [['highpass', 1500, 800, 0.5]] });
    this.noiseL({ out, t: delay, dur: 2.8, vol: 0.8 * vol, color: 'brown', attack: 0.05, filters: [['lowpass', 600, 60, 0.6]] });
    this.thump({ t: delay, f0: 60, f1: 28, dur: 1.8, vol: 0.6 * vol, send: 0.4 });
  }

  powerup() {
    if (!this.ready('powerup', 100)) return;
    const out = this.voice(0.35);
    this.oscL({ out, type: 'sine', f0: 300, f1: 1200, dur: 0.3, vol: 0.08, attack: 0.02, vibrato: [20, 20] });
    [880, 1109, 1319, 1760].forEach((f, i) => this.bell({ out, t: 0.15 + i * 0.05, f, dur: 0.4, vol: 0.05 }));
  }

  // Kill streak callouts: a brassy stab, higher for bigger streaks.
  streak(level) {
    if (!this.ready('streak', 200)) return;
    const out = this.voice(0.35);
    const base = 196 * Math.pow(1.12, Math.min(6, level));
    this.thump({ f0: 110, f1: 50, dur: 0.3, vol: 0.5, send: 0.3 });
    [1, 1.26, 1.5, 2].forEach((k, i) => this.growl({ out, t: i * 0.02, f0: base * k, dur: 0.5, vol: 0.07, formants: [[800, 1.5], [1600, 2], [2800, 3]], vibrato: [5, 2], attack: 0.03, breath: 0 }));
  }

  combo(n) {
    if (!this.ready('combo', 40)) return;
    const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5];
    this.pluck({ out: this.voice(0.15), f: scale[Math.min(scale.length - 1, n - 2)], dur: 0.2, vol: 0.16 });
  }

  // You got cubed.
  death() {
    if (!this.ready('death')) return;
    const out = this.voice(0.45);
    this.thump({ f0: 120, f1: 30, dur: 0.7, vol: 0.5, send: 0.4 });
    this.oscL({ out, type: 'triangle', f0: 392, f1: 196, dur: 1.2, vol: 0.08, attack: 0.02 });
    this.oscL({ out, t: 0.2, type: 'triangle', f0: 311, f1: 155, dur: 1.2, vol: 0.07, attack: 0.02 });
    this.noiseL({ out, dur: 1.2, vol: 0.2, color: 'brown', filters: [['lowpass', 800, 100, 0.6]] });
  }

  // --- Cars (Adventure mode) --------------------------------------------------

  // A car horn: two slightly clashing reedy tones, the classic "honk".
  // pitch < 1 for big vehicles (the bus has a deep one).
  horn(vol = 1, pitch = 1) {
    if (!this.ready('horn', 250)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.voice(0.18);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.9;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = c.createGain();
    const len = 0.42;
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.015);
    g.gain.setValueAtTime(0.16 * vol, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06);
    bp.connect(lp).connect(g).connect(out);
    for (const f of [370, 466]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * pitch * rnd(0.995, 1.005);
      o.connect(bp);
      o.start(t);
      o.stop(t + len + 0.1);
    }
  }

  // The engine while you drive. level 0 is idle, 1 is flat out. kind:
  // 'car', 'sports' (high and raspy), 'big' (bus and vans) or 'monster'.
  engine(on, level = 0, kind = 'car') {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && this.engineNode && this.engineNode.kind !== kind) this.engine(false);
    if (on && !this.engineNode && !this.muted) {
      const t = c.currentTime;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      lp.Q.value = 1.4;
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.25);
      // Put-put: the volume pulses with the cylinders firing.
      const trem = c.createGain();
      trem.gain.value = 0.7;
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 12;
      const lg = c.createGain();
      lg.gain.value = 0.3;
      lfo.connect(lg).connect(trem.gain);
      const a = c.createOscillator();
      a.type = 'sawtooth';
      a.frequency.value = 40;
      const b = c.createOscillator();
      b.type = 'square';
      b.frequency.value = 80.5;
      const bg = c.createGain();
      bg.gain.value = 0.35;
      a.connect(trem);
      b.connect(bg).connect(trem);
      const n = c.createBufferSource();
      n.buffer = this.brown;
      n.loop = true;
      const ng = c.createGain();
      ng.gain.value = 0.5;
      n.connect(ng).connect(trem);
      trem.connect(lp).connect(g).connect(this.voice(0.04));
      for (const o of [a, b, lfo, n]) o.start(t);
      this.engineNode = { a, b, lfo, lp, g, n, level: 0, upd: 0, kind };
    } else if (!on && this.engineNode) {
      const e = this.engineNode;
      const t = c.currentTime;
      e.g.gain.cancelScheduledValues(t);
      e.g.gain.setValueAtTime(e.g.gain.value, t);
      e.g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      for (const o of [e.a, e.b, e.lfo, e.n]) o.stop(t + 0.35);
      this.engineNode = null;
      return;
    }
    const e = this.engineNode;
    if (!e) return;
    const now = performance.now();
    if (now - e.upd < 50) return;
    e.upd = now;
    const k = clamp01(level);
    const t = c.currentTime;
    const K = ENGINES[e.kind] || ENGINES.car;
    const f = K.f0 + k * K.range;
    e.a.frequency.setTargetAtTime(f, t, 0.08);
    e.b.frequency.setTargetAtTime(f * 2.01, t, 0.08);
    e.lfo.frequency.setTargetAtTime(f * 0.33, t, 0.08);
    e.lp.frequency.setTargetAtTime(K.lp + k * K.lpRange, t, 0.1);
    e.g.gain.setTargetAtTime(K.vol + k * 0.06, t, 0.1);
  }

  // A police siren: a tone that wails up and down.
  siren(on) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this.sirenNode && !this.muted) {
      const t = c.currentTime;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 950;
      const lfo = c.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 0.4;
      const depth = c.createGain();
      depth.gain.value = 380;
      lfo.connect(depth).connect(o.frequency);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.2);
      o.connect(lp).connect(g).connect(this.voice(0.25));
      o.start(t);
      lfo.start(t);
      this.sirenNode = { o, lfo, g };
    } else if (!on && this.sirenNode) {
      const { o, lfo, g } = this.sirenNode;
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.15);
      o.stop(t + 0.2);
      lfo.stop(t + 0.2);
      this.sirenNode = null;
    }
  }

  // --- Police ---------------------------------------------------------------

  // A siren "whoop": you just got a wanted star.
  chirp() {
    if (!this.ready('chirp', 200)) return;
    const out = this.voice(0.2);
    this.oscL({ out, type: 'square', f0: 700, f1: 1500, dur: 0.18, vol: 0.05, attack: 0.01 });
    this.oscL({ out, t: 0.2, type: 'square', f0: 1500, f1: 700, dur: 0.22, vol: 0.05, attack: 0.01 });
  }

  // Phone buttons being pressed: 5, 0, 5, 0.
  dial() {
    if (!this.ready('dial', 300)) return;
    const out = this.voice(0.05, 0.3);
    const keys = [[770, 1336], [941, 1336], [770, 1336], [941, 1336]];
    keys.forEach(([a, b], i) => {
      this.oscL({ out, t: i * 0.16, type: 'sine', f0: a, dur: 0.09, vol: 0.035, attack: 0.004 });
      this.oscL({ out, t: i * 0.16, type: 'sine', f0: b, dur: 0.09, vol: 0.035, attack: 0.004 });
    });
  }

  // A continuous tone whose loudness follows `level` (0 turns it off).
  loop(name, level, build) {
    if (!this.ctx) return;
    const c = this.ctx;
    let n = this[name];
    if (level > 0.01 && !n && !this.muted) {
      n = this[name] = build(c);
      n.level = 0;
    }
    if (!n) return;
    if (level <= 0.01) {
      const t = c.currentTime;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setValueAtTime(n.g.gain.value, t);
      n.g.gain.linearRampToValueAtTime(0.0001, t + 0.25);
      for (const o of n.srcs) o.stop(t + 0.3);
      this[name] = null;
      return;
    }
    if (Math.abs(level - n.level) > 0.02) {
      n.level = level;
      n.g.gain.setTargetAtTime(n.peak * level, c.currentTime, 0.1);
    }
  }

  // The police cars chasing you: a fast "yelp" siren.
  copSiren(level) {
    this.loop('copNode', level, (c) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 1000;
      const lfo = c.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 2.6;
      const depth = c.createGain();
      depth.gain.value = 420;
      lfo.connect(depth).connect(o.frequency);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1900;
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(lp).connect(g).connect(this.voice(0.3, 0.2));
      o.start();
      lfo.start();
      return { g, srcs: [o, lfo], peak: 0.04 };
    });
  }

  // Helicopter blades: thumping low noise.
  heli(level) {
    this.loop('heliNode', level, (c) => {
      const n = c.createBufferSource();
      n.buffer = this.brown;
      n.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const chop = c.createGain();
      chop.gain.value = 0.5;
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 11;
      const lg = c.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(chop.gain);
      const g = c.createGain();
      g.gain.value = 0;
      n.connect(lp).connect(chop).connect(g).connect(this.voice(0.2));
      n.start();
      lfo.start();
      return { g, srcs: [n, lfo], peak: 0.5 };
    });
  }

  // --- More car sounds -------------------------------------------------------

  // A car door: a latch click and a solid thunk.
  door() {
    if (!this.ready('door', 150)) return;
    const out = this.voice(0.12);
    this.metal({ out, f: 1800, dur: 0.03, vol: 0.05 });
    this.thump({ t: 0.03, f0: 140, f1: 70, dur: 0.12, vol: 0.18, send: 0.1 });
    this.noiseL({ out, t: 0.03, dur: 0.08, vol: 0.08, filters: [['lowpass', 900, 400, 0.8]] });
  }

  // Metal crunching: a low thud, torn-metal noise and clanks.
  crash(vol = 1) {
    if (!this.ready('crash', 90) || vol < 0.05) return;
    const out = this.voice(0.3);
    this.thump({ f0: 110, f1: 40, dur: 0.3, vol: 0.45 * vol, send: 0.25 });
    this.noiseL({ out, dur: 0.35, vol: 0.28 * vol, filters: [['bandpass', 1400, 500, 1.2]], color: 'pink' });
    this.metal({ out, t: 0.02, f: 900 + Math.random() * 500, dur: 0.25, vol: 0.09 * vol });
    this.metal({ out, t: 0.09, f: 1500 + Math.random() * 700, dur: 0.2, vol: 0.06 * vol });
    if (vol > 0.55) this.glass(vol * 0.6, 0.05);
  }

  // Breaking glass: bright tinkles.
  glass(vol = 1, t0 = 0) {
    if (!this.ready('glass', 120)) return;
    const out = this.voice(0.25, rnd(-0.3, 0.3));
    this.noiseL({ out, t: t0, dur: 0.12, vol: 0.12 * vol, filters: [['highpass', 3500, 3500, 0.7]] });
    for (let i = 0; i < 6; i++) this.bell({ out, t: t0 + 0.02 + Math.random() * 0.25, f: 1500 + Math.random() * 900, dur: 0.18, vol: 0.02 * vol });
  }

  // The ice cream van's little tune.
  jingle(vol = 1) {
    if (!this.ready('jingle', 4000)) return;
    const out = this.voice(0.3);
    const notes = [784, 880, 784, 659, 698, 784, 659, 523, 587, 659, 523];
    notes.forEach((f, i) => this.pluck({ out, t: i * 0.16, f, dur: 0.22, vol: 0.05 * vol }));
  }

  // Tyres screeching while you slide.
  skid(level) {
    this.loop('skidNode', level, (c) => {
      const n = c.createBufferSource();
      n.buffer = this.white;
      n.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2300;
      bp.Q.value = 5;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 1900;
      const og = c.createGain();
      og.gain.value = 0.15;
      const lfo = c.createOscillator();
      lfo.frequency.value = 9;
      const lg = c.createGain();
      lg.gain.value = 60;
      lfo.connect(lg).connect(o.frequency);
      const g = c.createGain();
      g.gain.value = 0;
      n.connect(bp).connect(g);
      o.connect(og).connect(g);
      g.connect(this.voice(0.2));
      n.start();
      o.start();
      lfo.start();
      return { g, srcs: [n, o, lfo], peak: 0.35 };
    });
  }

  // --- Web shooters ----------------------------------------------------------

  // Thwip! A web shooting out.
  thwip(vol = 1) {
    if (!this.ready('thwip', 60)) return;
    const out = this.voice(0.12, 0.15);
    this.noiseL({ out, dur: 0.09, vol: 0.2 * vol, filters: [['bandpass', 5200, 1800, 2.5]] });
    this.oscL({ out, type: 'triangle', f0: 1900, f1: 700, dur: 0.07, vol: 0.05 * vol, attack: 0.002 });
  }

  // Air rushing past as you swing and fly.
  whoosh(vol = 1) {
    if (!this.ready('whoosh', 200)) return;
    const out = this.voice(0.2);
    this.noiseL({ out, dur: 0.45, vol: 0.2 * vol, attack: 0.12, color: 'pink', filters: [['bandpass', 500, 1500, 1.2]] });
  }

  // The spider suit spreading over you: a rising shimmer and a snap.
  suitUp(vol = 1) {
    if (!this.ready('suitUp', 300)) return;
    const out = this.voice(0.35);
    this.noiseL({ out, dur: 0.55, vol: 0.14 * vol, attack: 0.25, color: 'pink', filters: [['bandpass', 600, 4200, 1.4]] });
    [660, 880, 1320, 1760].forEach((f, i) => this.oscL({ out, t: 0.08 + i * 0.07, type: 'triangle', f0: f, dur: 0.18, vol: 0.03 * vol, attack: 0.004 }));
    this.thump({ t: 0.5, f0: 220, f1: 70, dur: 0.12, vol: 0.2 * vol, send: 0.1 });
  }

  // The Giga Chad moment: a deep boom and a dark, swelling chord.
  gigaChad(vol = 1) {
    if (!this.ready('gigaChad', 1500)) return;
    const out = this.voice(0.5);
    this.thump({ f0: 95, f1: 32, dur: 1.1, vol: 0.5 * vol, send: 0.4 });
    this.noiseL({ out, dur: 0.9, vol: 0.08 * vol, attack: 0.002, filters: [['lowpass', 900, 120, 1]] });
    [
      [110, 0],
      [130.8, 6],
      [164.8, -5],
      [220, 4],
      [55, 0],
    ].forEach(([f, d], i) => this.oscL({ out, t: 0.12 + i * 0.05, type: i === 4 ? 'sine' : 'triangle', f0: f, dur: 2.4, vol: (i === 4 ? 0.09 : 0.028) * vol, attack: 0.7, vibrato: [4.5 + i * 0.3, f * 0.004], detune: d }));
    // A quiet crackle, like an old photo.
    this.noiseL({ out, t: 0.3, dur: 2.2, vol: 0.012 * vol, attack: 0.2, filters: [['highpass', 5000]] });
  }

  // Spider-sense: a high, wobbly ring.
  tingle(vol = 1) {
    if (!this.ready('tingle', 400)) return;
    const out = this.voice(0.4);
    for (const [f, d] of [
      [2600, 0],
      [3100, 7],
      [3900, -9],
    ])
      this.oscL({ out, type: 'sine', f0: f, f1: f * 1.04, dur: 0.6, vol: 0.022 * vol, attack: 0.02, vibrato: [23, 60], detune: d });
    this.noiseL({ out, dur: 0.3, vol: 0.04 * vol, attack: 0.02, filters: [['highpass', 6000]] });
  }

  // Being pulled fast along a web.
  zip(vol = 1) {
    if (!this.ready('zip', 150)) return;
    const out = this.voice(0.15);
    this.noiseL({ out, dur: 0.35, vol: 0.16 * vol, attack: 0.02, filters: [['bandpass', 900, 3600, 2]] });
    this.oscL({ out, type: 'sawtooth', f0: 180, f1: 900, dur: 0.3, vol: 0.02 * vol, attack: 0.01 });
  }

  // Charging a Web Blast.
  webCharge(vol = 1) {
    if (!this.ready('webCharge', 200)) return;
    const out = this.voice(0.2);
    this.oscL({ out, type: 'triangle', f0: 300, f1: 1400, dur: 0.45, vol: 0.04 * vol, attack: 0.05 });
  }

  // A big web bomb going off.
  webBlast(vol = 1) {
    if (!this.ready('webBlast', 100)) return;
    const out = this.voice(0.25);
    this.noiseL({ out, dur: 0.3, vol: 0.28 * vol, attack: 0.003, filters: [['lowpass', 3500, 400, 1]] });
    this.thump({ f0: 140, f1: 50, dur: 0.2, vol: 0.35 * vol, send: 0.15 });
  }

  // Police radio crackle and beeps for a crime alert.
  radio(vol = 1) {
    if (!this.ready('radio', 500)) return;
    const out = this.voice(0.1);
    this.noiseL({ out, dur: 0.25, vol: 0.1 * vol, attack: 0.005, filters: [['bandpass', 1800, 1800, 3]] });
    [0.28, 0.42].forEach((t) => this.oscL({ out, t, type: 'square', f0: 1320, dur: 0.08, vol: 0.03 * vol, attack: 0.003 }));
  }

  // Wind rushing past while you swing and fly.
  wind(level) {
    this.loop('windNode', level, (c) => {
      const n = c.createBufferSource();
      n.buffer = this.pink || this.white;
      n.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.8;
      const g = c.createGain();
      g.gain.value = 0;
      n.connect(bp).connect(g).connect(this.voice(0.1));
      n.start();
      return { g, srcs: [n], peak: 0.22 };
    });
  }

  // A web ball sticking to something.
  splat() {
    if (!this.ready('splat', 60)) return;
    const out = this.voice(0.1);
    this.noiseL({ out, dur: 0.12, vol: 0.14, filters: [['lowpass', 1800, 500, 1]] });
    this.thump({ f0: 180, f1: 90, dur: 0.08, vol: 0.12, send: 0.05 });
  }
}
