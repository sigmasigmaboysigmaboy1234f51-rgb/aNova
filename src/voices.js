import { $, store } from './util.js';

// Your own voice in the game. The Voice Studio records short lines from
// your microphone (pick a voice changer as the microphone for cool
// voices), and the game plays them at the right moments. Recordings stay
// on this computer (in the browser's storage); save a voice pack to move
// them to another computer or share them.

export const VOICE_LINES = [
  { id: 'suit', group: 'Spider suit', name: 'Suit up', when: 'the spider suit goes on', say: 'Time to swing!' },
  { id: 'swing', group: 'Spider suit', name: 'Swinging', when: 'you swing (now and then)', say: 'Woo-hoo!' },
  { id: 'blast', group: 'Spider suit', name: 'Web Blast', when: 'you fire a Web Blast', say: 'Web blast!' },
  { id: 'sense', group: 'Spider suit', name: 'Spider-sense', when: 'your spider-sense tingles', say: 'Whoa! Watch out!' },
  { id: 'landing', group: 'Spider suit', name: 'Superhero landing', when: 'you land from way up high', say: 'Nailed it.' },
  { id: 'radio', group: 'Crime', name: 'Police radio', fx: 'radio', when: 'a crime alert comes in', say: 'All units, robbery in progress!' },
  { id: 'stopped', group: 'Crime', name: 'Crime stopped', when: 'you stop a crime', say: 'Another day saved!' },
  { id: 'robber', group: 'Crime', name: 'Robber caught', when: 'you web a robber', say: 'Hey! Let me go!' },
  { id: 'cop', group: 'Police', name: 'Police: freeze', when: 'the police start after you', say: 'Freeze! Police!' },
  { id: 'busted', group: 'Police', name: 'Police: busted', when: 'you get busted', say: "You're under arrest!" },
  { id: 'call', group: 'Police', name: 'Calling 5-0-5-0', fx: 'phone', when: 'someone near you calls the police', say: 'Hello, police? Help!' },
  { id: 'wave', group: 'Fighting', name: 'New wave', when: 'a wave of mobs starts', say: 'Here they come!' },
  { id: 'boss', group: 'Fighting', name: 'Boss wave', when: 'a boss is on its way', say: 'That is one big mob...' },
  { id: 'head', group: 'Fighting', name: 'Headshot', when: 'you get a headshot (sometimes)', say: 'Headshot!' },
  { id: 'streak', group: 'Fighting', name: 'Kill streak', when: 'you get a kill streak', say: "I'm on fire!" },
  { id: 'hurt', group: 'Fighting', name: 'Ouch', when: 'you take a big hit', say: 'Ouch!' },
  { id: 'down', group: 'Fighting', name: 'Knocked out', when: 'you get knocked out', say: 'Nooo!' },
  { id: 'reload', group: 'Fighting', name: 'Reloading', when: 'you reload (sometimes)', say: 'Reloading!' },
  { id: 'win', group: 'Fighting', name: 'Victory', when: 'you beat a boss or a chapter', say: 'Too easy!' },
  { id: 'you', group: 'Story', name: 'You', when: 'you talk in the story', say: "Let's do this." },
  { id: 'gran', group: 'Story', name: 'Grandma Brick', when: 'Grandma Brick talks', say: 'Now listen here, dearie!' },
  { id: 'pip', group: 'Story', name: 'Pip', fx: 'robot', when: 'Pip talks', say: 'Beep boop! Hi!' },
  { id: 'villain', group: 'Story', name: 'Bosses', fx: 'deep', when: 'a boss talks', say: "You can't beat me!" },
];
const LINE = Object.fromEntries(VOICE_LINES.map((l) => [l.id, l]));

export const VOICE_FX = {
  none: 'Normal',
  deep: 'Deep',
  squeaky: 'Squeaky',
  robot: 'Robot',
  monster: 'Monster',
  radio: 'Police radio',
  phone: 'Phone',
  echo: 'Echo',
};

export const TAKES = 3;
const MAX_SECONDS = 5;

// --- Saving: IndexedDB, so recordings survive closing the game ---------------

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('no storage'));
    const r = indexedDB.open('blockfire-voices', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction('clips', mode);
    const req = fn(t.objectStore('clips'));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

// Where the sound starts and stops (skip the silence), and how loud it is.
function measure(buf) {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const th = Math.max(0.015, peak * 0.08);
  let a = 0;
  while (a < d.length && Math.abs(d[a]) < th) a++;
  let b = d.length - 1;
  while (b > a && Math.abs(d[b]) < th) b--;
  const sr = buf.sampleRate;
  return { start: Math.max(0, a / sr - 0.06), end: Math.min(buf.duration, b / sr + 0.12), peak };
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function fromDataUrl(url) {
  const [head, data] = url.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'audio/webm';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export class VoiceBank {
  constructor(game) {
    this.game = game;
    // clips[id] = [clip or null, ...]; a clip is { blob, start, end, peak }.
    this.clips = {};
    // Voices built into the game (voices/pack.json when it was built).
    // Your own recordings for a line play instead of these.
    this.builtin = {};
    this.buffers = new Map();
    this.cool = {};
    this.busyUntil = 0;
    this.current = null;
    this.enabled = store.get('voicesOn', '1') !== '0';
    try {
      this.fx = JSON.parse(store.get('voiceFx', '{}')) || {};
    } catch {
      this.fx = {};
    }
    this.db = null;
    this.ready = this.load();
  }

  async load() {
    try {
      this.db = await openDb();
      const keys = await tx(this.db, 'readonly', (s) => s.getAllKeys());
      for (const key of keys || []) {
        const [id, take] = String(key).split(':');
        if (!LINE[id]) continue;
        const clip = await tx(this.db, 'readonly', (s) => s.get(key));
        if (clip && clip.blob) this.slot(id)[Number(take)] = clip;
      }
    } catch {
      // No storage here (a private window, or inside another page): the
      // voices still work until the game closes.
      this.db = null;
    }
    const pack = window.BLOCKFIRE_VOICES;
    if (pack && Array.isArray(pack.clips)) {
      for (const c of pack.clips) {
        const take = Number(c.take);
        if (!LINE[c.id] || !(take >= 0 && take < TAKES) || typeof c.data !== 'string' || !c.data.startsWith('data:audio/')) continue;
        if (!this.builtin[c.id]) this.builtin[c.id] = new Array(TAKES).fill(null);
        this.builtin[c.id][take] = { blob: fromDataUrl(c.data), start: +c.start || 0, end: +c.end || MAX_SECONDS, peak: +c.peak || 0.5 };
      }
      if (pack.fx) for (const [id, fx] of Object.entries(pack.fx)) if (LINE[id] && VOICE_FX[fx] && !this.fx[id]) this.fx[id] = fx;
    }
  }

  // The takes that play for a line: yours, or the built-in ones.
  playing(id) {
    return this.count(id) ? this.slot(id) : this.builtin[id] || this.slot(id);
  }

  isBuiltin(id) {
    return !this.count(id) && !!this.builtin[id];
  }

  slot(id) {
    if (!this.clips[id]) this.clips[id] = new Array(TAKES).fill(null);
    return this.clips[id];
  }

  count(id) {
    return this.slot(id).filter(Boolean).length;
  }

  get total() {
    return VOICE_LINES.reduce((n, l) => n + this.count(l.id), 0);
  }

  fxFor(id) {
    return this.fx[id] || (LINE[id] && LINE[id].fx) || 'none';
  }

  setFx(id, fx) {
    this.fx[id] = fx;
    store.set('voiceFx', JSON.stringify(this.fx));
  }

  setEnabled(on) {
    this.enabled = on;
    store.set('voicesOn', on ? '1' : '0');
  }

  async put(id, take, clip) {
    this.slot(id)[take] = clip;
    this.buffers.delete(`${id}:${take}`);
    if (this.db) await tx(this.db, 'readwrite', (s) => s.put(clip, `${id}:${take}`)).catch(() => {});
  }

  async remove(id, take) {
    this.slot(id)[take] = null;
    this.buffers.delete(`${id}:${take}`);
    if (this.db) await tx(this.db, 'readwrite', (s) => s.delete(`${id}:${take}`)).catch(() => {});
  }

  async decode(id, take, which = null) {
    const list = which || this.playing(id);
    const key = `${list === this.builtin[id] ? 'b' : ''}${id}:${take}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const clip = list[take];
    const c = this.game.sound.ctx;
    if (!clip || !c) return null;
    const p = clip.blob
      .arrayBuffer()
      .then((ab) => c.decodeAudioData(ab))
      .catch(() => null);
    this.buffers.set(key, p);
    const buf = await p;
    this.buffers.set(key, buf);
    return buf;
  }

  // Get every recording ready to play straight away.
  warm() {
    if (!this.game.sound.ctx) return;
    for (const line of VOICE_LINES) this.playing(line.id).forEach((clip, i) => clip && this.decode(line.id, i));
  }

  // Play one of your takes for this line. opts: chance (0-1), cd (seconds
  // before this line can play again), force (talk over another line),
  // cut (stop the line that's playing).
  say(id, { chance = 1, cd = 4, force = false, cut = false } = {}) {
    const g = this.game;
    const list = this.playing(id);
    if (!this.enabled || !g.sound.ctx || g.sound.muted || !list.some(Boolean)) return false;
    const now = performance.now() / 1000;
    if (Math.random() > chance || (this.cool[id] || 0) > now) return false;
    if (!force && this.busyUntil > now) return false;
    const takes = list
      .map((c, i) => (c ? i : -1))
      .filter((i) => i >= 0);
    const take = takes[Math.floor(Math.random() * takes.length)];
    this.cool[id] = now + cd;
    if (cut) this.stop();
    const go = (buf) => {
      if (!buf) return;
      const clip = list[take];
      if (!clip) return;
      this.current = this.play(buf, clip, this.fxFor(id));
      this.busyUntil = performance.now() / 1000 + (clip.end - clip.start) / this.current.rate;
    };
    const cached = this.buffers.get(`${list === this.builtin[id] ? 'b' : ''}${id}:${take}`);
    if (cached && !(cached instanceof Promise)) go(cached);
    else this.decode(id, take, list).then(go);
    return true;
  }

  stop() {
    if (this.current) {
      try {
        this.current.src.stop();
      } catch {
        // Already finished.
      }
      this.current = null;
    }
    this.busyUntil = 0;
  }

  // Play a buffer through a voice effect. Returns { src, rate }.
  play(buf, clip, fx, vol = 1) {
    const snd = this.game.sound;
    const c = snd.ctx;
    const out = snd.voice(fx === 'echo' ? 0.4 : 0.12);
    const src = c.createBufferSource();
    src.buffer = buf;
    const rate = { deep: 0.8, squeaky: 1.4, monster: 0.62 }[fx] || 1;
    src.playbackRate.value = rate;
    // Recordings can be quiet: bring them up to a steady level.
    const level = c.createGain();
    level.gain.value = Math.min(6, 0.85 / Math.max(0.05, clip.peak || 0.5)) * 1.3 * vol;
    level.connect(out);
    const nodes = [];
    const chain = (...list) => {
      let n = src;
      for (const x of list) {
        n.connect(x);
        n = x;
      }
      n.connect(level);
    };
    const filter = (type, f, q = 0.7) => {
      const b = c.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    const crunch = (k) => {
      const s = c.createWaveShaper();
      const curve = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        const x = (i / 511) * 2 - 1;
        curve[i] = Math.tanh(x * k) / Math.tanh(k);
      }
      s.curve = curve;
      return s;
    };
    if (fx === 'robot') {
      // Ring modulation: the voice times a buzzing tone.
      const ring = c.createGain();
      ring.gain.value = 0;
      const osc = c.createOscillator();
      osc.frequency.value = 55;
      osc.connect(ring.gain);
      osc.start();
      nodes.push(osc);
      chain(ring);
      const dry = c.createGain();
      dry.gain.value = 0.35;
      src.connect(dry).connect(level);
    } else if (fx === 'radio') {
      chain(filter('highpass', 450), filter('lowpass', 2800), crunch(4));
      snd.noiseL({ out, dur: 0.12, vol: 0.08, filters: [['bandpass', 1800, 1800, 2]] });
    } else if (fx === 'phone') {
      chain(filter('bandpass', 1300, 0.9), crunch(1.6));
    } else if (fx === 'monster') {
      chain(filter('lowpass', 2600), crunch(1.8));
    } else if (fx === 'echo') {
      chain();
      const delay = c.createDelay(1);
      delay.delayTime.value = 0.2;
      const fb = c.createGain();
      fb.gain.value = 0.42;
      src.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(level);
    } else chain();
    const dur = Math.max(0.05, clip.end - clip.start);
    src.start(0, clip.start, dur);
    src.onended = () => {
      for (const n of nodes) n.stop();
      if (this.current && this.current.src === src) this.current = null;
    };
    return { src, rate };
  }

  // A voice pack: every recording in one file.
  async exportPack() {
    const clips = [];
    for (const id of Object.keys(this.clips)) {
      for (let t = 0; t < TAKES; t++) {
        const clip = this.slot(id)[t];
        if (clip) clips.push({ id, take: t, start: clip.start, end: clip.end, peak: clip.peak, data: await toDataUrl(clip.blob) });
      }
    }
    return JSON.stringify({ app: 'blockfire-voices', v: 1, fx: this.fx, clips });
  }

  async importPack(text) {
    const pack = JSON.parse(text);
    if (!pack || pack.app !== 'blockfire-voices' || !Array.isArray(pack.clips)) throw new Error('That is not a Blockfire voice pack.');
    let n = 0;
    for (const c of pack.clips) {
      const take = Number(c.take);
      if (!LINE[c.id] || !(take >= 0 && take < TAKES) || typeof c.data !== 'string' || !c.data.startsWith('data:audio/') || c.data.length > 3e6) continue;
      await this.put(c.id, take, { blob: fromDataUrl(c.data), start: +c.start || 0, end: +c.end || MAX_SECONDS, peak: +c.peak || 0.5 });
      n++;
    }
    if (pack.fx && typeof pack.fx === 'object') for (const [id, fx] of Object.entries(pack.fx)) if (LINE[id] && VOICE_FX[fx]) this.setFx(id, fx);
    return n;
  }
}

// --- The Voice Studio screen ---------------------------------------------------

export class VoiceStudio {
  constructor(game) {
    this.game = game;
    this.bank = game.voices;
    this.el = $('#voices');
    this.back = 'menu';
    this.stream = null;
    this.rec = null;
    this.recId = null;
    this.meterT = 0;
    $('#vs-done').addEventListener('click', () => this.close());
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    const on = $('#vs-on');
    on.checked = this.bank.enabled;
    on.addEventListener('change', () => this.bank.setEnabled(on.checked));
    $('#vs-mic').addEventListener('change', () => {
      store.set('voiceMic', $('#vs-mic').value);
      this.closeStream();
      this.msg('Microphone changed. Press Record to try it.');
    });
    $('#vs-export').addEventListener('click', () => this.exportPack());
    $('#vs-import').addEventListener('change', (e) => this.importPack(e.target.files && e.target.files[0]));
    this.build();
  }

  open(back) {
    this.back = back;
    this.game.setState('voices');
  }

  show() {
    this.el.hidden = false;
    this.game.sound.unlock();
    this.bank.ready.then(() => {
      this.render();
      this.bank.warm();
    });
    this.listMics();
    $('#vs-done').focus();
  }

  hide() {
    this.el.hidden = true;
    this.stopRecording(true);
    this.closeStream();
  }

  close() {
    this.game.setState(this.back || 'menu');
  }

  msg(text, bad = false) {
    const m = $('#vs-msg');
    m.textContent = text;
    m.classList.toggle('bad', bad);
  }

  build() {
    const list = $('#vs-list');
    list.textContent = '';
    let group = null;
    for (const line of VOICE_LINES) {
      if (line.group !== group) {
        group = line.group;
        const h = document.createElement('h3');
        h.className = 'vs-group';
        h.textContent = group;
        list.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'vs-row';
      row.dataset.id = line.id;
      const info = document.createElement('div');
      info.className = 'vs-info';
      const b = document.createElement('b');
      b.textContent = line.name;
      const s = document.createElement('span');
      s.textContent = `Plays when ${line.when}. Try: “${line.say}”`;
      info.append(b, s);
      const takes = document.createElement('div');
      takes.className = 'vs-takes';
      for (let t = 0; t < TAKES; t++) {
        const tb = document.createElement('button');
        tb.type = 'button';
        tb.className = 'vs-take';
        tb.textContent = String(t + 1);
        tb.title = `Play take ${t + 1}`;
        tb.addEventListener('click', () => this.preview(line.id, t));
        takes.appendChild(tb);
      }
      const fx = document.createElement('select');
      fx.className = 'vs-fx';
      fx.setAttribute('aria-label', `${line.name} effect`);
      for (const [k, name] of Object.entries(VOICE_FX)) {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = name;
        fx.appendChild(o);
      }
      fx.addEventListener('change', () => {
        this.bank.setFx(line.id, fx.value);
        this.preview(line.id);
      });
      const rec = document.createElement('button');
      rec.type = 'button';
      rec.className = 'btn btn-small vs-rec';
      rec.textContent = '● Record';
      rec.addEventListener('click', () => this.toggleRecord(line.id));
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn-small btn-quiet vs-clear';
      clear.textContent = 'Clear';
      clear.addEventListener('click', async () => {
        for (let t = 0; t < TAKES; t++) await this.bank.remove(line.id, t);
        this.render();
      });
      row.append(info, takes, fx, rec, clear);
      list.appendChild(row);
    }
  }

  render() {
    for (const row of this.el.querySelectorAll('.vs-row')) {
      const id = row.dataset.id;
      const slot = this.bank.slot(id);
      row.querySelectorAll('.vs-take').forEach((b, t) => {
        b.classList.toggle('full', !!slot[t]);
        b.disabled = !slot[t];
      });
      row.querySelector('.vs-fx').value = this.bank.fxFor(id);
      const built = this.bank.isBuiltin(id);
      row.classList.toggle('builtin', built);
      if (built) {
        row.querySelectorAll('.vs-take').forEach((b, t) => {
          b.classList.toggle('full', !!this.bank.builtin[id][t]);
          b.disabled = !this.bank.builtin[id][t];
        });
      }
      const rec = row.querySelector('.vs-rec');
      rec.textContent = this.recId === id ? '■ Stop' : '● Record';
      rec.classList.toggle('on', this.recId === id);
      row.classList.toggle('done', this.bank.count(id) > 0);
    }
    $('#vs-count').textContent = `${this.bank.total} recordings`;
  }

  async preview(id, take) {
    const slot = this.bank.playing(id);
    const t = take ?? slot.findIndex(Boolean);
    if (t < 0 || !slot[t]) return;
    this.game.sound.unlock();
    const buf = await this.bank.decode(id, t, slot);
    if (!buf) return this.msg("That recording won't play. Try recording it again.", true);
    this.bank.stop();
    this.bank.current = this.bank.play(buf, slot[t], this.bank.fxFor(id));
  }

  async listMics() {
    const sel = $('#vs-mic');
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const want = store.get('voiceMic', '');
      sel.textContent = '';
      const def = document.createElement('option');
      def.value = '';
      def.textContent = 'Default microphone';
      sel.appendChild(def);
      devs.forEach((d, i) => {
        if (!d.deviceId || d.deviceId === 'default') return;
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || `Microphone ${i + 1}`;
        sel.appendChild(o);
      });
      sel.value = [...sel.options].some((o) => o.value === want) ? want : '';
    } catch {
      // No microphone list here.
    }
  }

  async getStream() {
    if (this.stream) return this.stream;
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia || !window.MediaRecorder) throw new Error('nomic');
    const id = store.get('voiceMic', '');
    this.stream = await md.getUserMedia({
      audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    // Now we're allowed to see the microphones' names.
    this.listMics();
    // A level meter so you can see it hears you.
    const c = this.game.sound.ctx;
    if (c) {
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 512;
      c.createMediaStreamSource(this.stream).connect(this.analyser);
      this.levelData = new Float32Array(this.analyser.fftSize);
    }
    return this.stream;
  }

  closeStream() {
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.analyser = null;
  }

  async toggleRecord(id) {
    if (this.recId === id) return this.stopRecording(false);
    this.stopRecording(true);
    this.game.sound.unlock();
    let stream;
    try {
      stream = await this.getStream();
    } catch (e) {
      const blocked = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      return this.msg(
        blocked || (e && e.message === 'nomic')
          ? "Can't use the microphone here. Record in the Blockfire app, or open the game's index.html in Chrome or Edge and allow the microphone."
          : "Couldn't find a microphone. Plug one in (or turn on your voice changer) and try again.",
        true,
      );
    }
    this.bank.stop();
    const chunks = [];
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    this.rec = rec;
    this.recId = id;
    this.recStart = performance.now();
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      if (rec.cancelled) return;
      this.save(id, new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }));
    };
    rec.start();
    this.msg(`Recording “${LINE[id].name}”... say it now! (up to ${MAX_SECONDS} seconds)`);
    this.render();
    this.tick();
  }

  // Level meter and the time limit.
  tick() {
    if (!this.rec) {
      $('#vs-level').style.width = '0%';
      return;
    }
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.levelData);
      let peak = 0;
      for (const v of this.levelData) peak = Math.max(peak, Math.abs(v));
      $('#vs-level').style.width = `${Math.min(100, peak * 140)}%`;
    }
    if (performance.now() - this.recStart > MAX_SECONDS * 1000) return this.stopRecording(false);
    requestAnimationFrame(() => this.tick());
  }

  stopRecording(cancel) {
    const rec = this.rec;
    if (!rec) return;
    rec.cancelled = cancel;
    this.rec = null;
    this.recId = null;
    if (rec.state !== 'inactive') rec.stop();
    this.render();
  }

  async save(id, blob) {
    const c = this.game.sound.ctx;
    let info = { start: 0, end: MAX_SECONDS, peak: 0.5 };
    try {
      const buf = await c.decodeAudioData(await blob.arrayBuffer());
      info = measure(buf);
    } catch {
      return this.msg("That recording didn't work. Try again.", true);
    }
    if (info.peak < 0.02) return this.msg("I didn't hear anything. Check the microphone (or your voice changer) and try again.", true);
    const slot = this.bank.slot(id);
    let take = slot.findIndex((x) => !x);
    if (take < 0) {
      // All full: replace the oldest.
      this.next = this.next || {};
      take = this.next[id] || 0;
      this.next[id] = (take + 1) % TAKES;
    }
    await this.bank.put(id, take, { blob, ...info });
    this.render();
    this.msg(`Saved take ${take + 1} for “${LINE[id].name}”.`);
    this.preview(id, take);
  }

  async exportPack() {
    if (!this.bank.total) return this.msg('Record something first!', true);
    const text = await this.bank.exportPack();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'blockfire-voices.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.msg('Voice pack saved as blockfire-voices.json.');
  }

  async importPack(file) {
    if (!file) return;
    try {
      const n = await this.bank.importPack(await file.text());
      this.bank.warm();
      this.render();
      this.msg(`Loaded ${n} recordings.`);
    } catch (e) {
      this.msg(e && e.message ? e.message : "Couldn't read that file.", true);
    }
    $('#vs-import').value = '';
  }
}
