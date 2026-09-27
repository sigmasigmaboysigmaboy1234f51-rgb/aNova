import { $, store } from './util.js';

// Touch controls for phones and tablets. They press the same keys and mouse
// buttons a keyboard and mouse would (see Input.hold, tap, mouse and look),
// so everything in the game works the same way.
//
//   Left side of the screen   a joystick wherever your thumb lands. Push it
//                             all the way forward to sprint.
//   Right side                drag to look round (and hold FIRE and drag to
//                             aim while you shoot).
//   Buttons                   change with what you're doing: on foot, with
//                             blocks, with web shooters, driving, and in
//                             the Hyper Car.
//   Top row                   pause, map, camera, emotes, chat, players.
//   Hotbar                    tap a slot to pick it.

// Each button: [id, label, what it presses, how, right, bottom, size]
//   what: a key code, or 'left' / 'right' for the mouse buttons
//   how:  'hold' (while your finger is on it), 'tap', or 'toggle'
// right, bottom and size are in button units (see --tu in style.css).
const LAYOUTS = {
  foot: [
    ['fire', 'FIRE', 'left', 'hold', 0.2, 0.3, 1.45, true],
    ['jump', 'JUMP', 'Space', 'hold', 1.85, 0.15, 1],
    ['aim', 'AIM', 'right', 'toggle', 0.45, 1.95, 1],
    ['reload', 'RELOAD', 'KeyR', 'tap', 1.8, 1.3, 0.85],
    ['nade', 'NADE', 'KeyG', 'tap', 2.95, 0.95, 0.8],
    ['crouch', 'DUCK', 'ShiftLeft', 'toggle', 3.05, 0.05, 0.8],
  ],
  block: [
    ['fire', 'BREAK', 'left', 'hold', 0.2, 0.3, 1.45, true],
    ['jump', 'JUMP', 'Space', 'hold', 1.85, 0.15, 1],
    ['aim', 'PLACE', 'right', 'hold', 0.45, 1.95, 1],
    ['nade', 'NADE', 'KeyG', 'tap', 2.95, 0.95, 0.8],
    ['crouch', 'DUCK', 'ShiftLeft', 'toggle', 3.05, 0.05, 0.8],
  ],
  webs: [
    ['fire', 'WEB', 'left', 'hold', 0.2, 0.3, 1.45, true],
    ['jump', 'JUMP', 'Space', 'hold', 1.85, 0.15, 1],
    ['aim', 'SWING', 'right', 'hold', 0.45, 1.95, 1.1, true],
    ['reload', 'ZIP', 'KeyR', 'tap', 1.8, 1.3, 0.85],
    ['suit', 'SUIT', 'KeyN', 'tap', 2.95, 0.95, 0.8],
    ['crouch', 'LET GO', 'ShiftLeft', 'hold', 3.05, 0.05, 0.8],
  ],
  drive: [
    ['brake', 'BRAKE', 'Space', 'hold', 0.25, 0.3, 1.3],
    ['exit', 'EXIT', 'KeyE', 'tap', 1.75, 0.2, 0.9],
    ['horn', 'HORN', 'KeyH', 'tap', 0.45, 1.75, 0.85],
    ['siren', 'SIREN', 'KeyF', 'tap', 1.65, 1.25, 0.8],
  ],
  hyper: [
    ['fire', 'GUN', 'left', 'hold', 0.2, 0.3, 1.3, true],
    ['rocket', 'ROCKET', 'right', 'hold', 0.35, 1.75, 0.95, true],
    ['nitro', 'NITRO', 'ShiftLeft', 'hold', 1.7, 0.15, 1],
    ['brake', 'BRAKE', 'Space', 'hold', 2.85, 0.1, 0.85],
    ['jets', 'JETS', 'KeyQ', 'tap', 1.55, 1.25, 0.8],
    ['exit', 'EXIT', 'KeyE', 'tap', 3.9, 0.1, 0.75],
    ['shield', 'SHIELD', 'KeyC', 'tap', 2.55, 1.1, 0.72],
    ['oil', 'OIL', 'KeyX', 'tap', 0.3, 2.85, 0.72],
    ['smoke', 'SMOKE', 'KeyG', 'tap', 1.25, 2.3, 0.72],
    ['glow', 'GLOW', 'KeyU', 'tap', 2.4, 2.05, 0.65],
  ],
};

// Top row: [id, label, action]
const TOP = [
  ['pause', 'II', 'pause'],
  ['map', 'MAP', 'KeyM'],
  ['cam', 'CAM', 'KeyV'],
  ['emote', ':)', 'emotes'],
  ['chat', 'CHAT', 'KeyT'],
  ['players', 'LIST', 'Tab'],
];
const EMOTES = [
  ['KeyZ', 'Wave'],
  ['KeyX', 'Dance'],
  ['KeyC', 'Flex'],
  ['KeyH', 'Dab'],
];
const STICK_R = 60;
const LOOK_SPEED = 1.7;

// Is this a phone or tablet (a touch screen and no mouse)?
export function isTouchDevice() {
  try {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.enabled = false;
    this.mode = null;
    this.pointers = new Map();
    this.buttons = new Map();
    this.toggled = new Set();
    this.el = document.createElement('div');
    this.el.id = 'touch';
    this.el.className = 'touch';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="tc-stick" aria-hidden="true"><i></i></div>
      <div class="tc-btns"></div>
      <div class="tc-top"></div>
      <div class="tc-emotes" hidden></div>
      <button type="button" class="tc-btn tc-use" data-id="use" hidden>USE</button>
      <div class="tc-turn"><b>Turn your phone sideways</b><span>Blockfire plays in landscape.</span></div>`;
    document.body.appendChild(this.el);
    this.stick = this.el.querySelector('.tc-stick');
    this.knob = this.stick.querySelector('i');
    this.btnBox = this.el.querySelector('.tc-btns');
    this.useBtn = this.el.querySelector('.tc-use');
    this.emoteBox = this.el.querySelector('.tc-emotes');
    // Top row.
    const top = this.el.querySelector('.tc-top');
    this.top = {};
    for (const [id, label, action] of TOP) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tc-btn tc-small';
      b.dataset.id = id;
      b.dataset.action = action;
      b.textContent = label;
      b.setAttribute('aria-label', { pause: 'Pause', map: 'Map', cam: 'Camera', emote: 'Emotes', chat: 'Chat', players: 'Players' }[id]);
      top.appendChild(b);
      this.top[id] = b;
    }
    for (const [code, label] of EMOTES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tc-btn tc-small';
      b.dataset.emote = code;
      b.textContent = label;
      this.emoteBox.appendChild(b);
    }
    // Every touch on the layer goes through here.
    const opts = { passive: false };
    this.el.addEventListener('pointerdown', (e) => this.down(e), opts);
    this.el.addEventListener('pointermove', (e) => this.move(e), opts);
    this.el.addEventListener('pointerup', (e) => this.up(e), opts);
    this.el.addEventListener('pointercancel', (e) => this.up(e), opts);
    // No pretend mouse clicks, no page scrolling or zooming.
    for (const type of ['touchstart', 'touchmove', 'touchend']) this.el.addEventListener(type, (e) => e.cancelable && e.preventDefault(), opts);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    const saved = store.get('touch', 'auto');
    this.setEnabled(saved === 'on' || (saved === 'auto' && isTouchDevice()));
  }

  setEnabled(on) {
    this.enabled = on;
    document.body.classList.toggle('touch', on);
    if (on) {
      // No mouse to lock on a touch screen.
      this.game.noLock = true;
      this.input.free = true;
    }
    this.sync();
  }

  // Tries to go full screen (from a tap, when a game starts).
  fullScreen() {
    if (!this.enabled) return;
    try {
      const d = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch {
      // Not allowed here: that's fine.
    }
  }

  // What you're doing right now decides which buttons show.
  currentMode() {
    const p = this.game.player;
    if (p.driving) return p.driving.hyper ? 'hyper' : 'drive';
    if (p.held === 7 && this.game.adventure) return 'webs';
    if (p.held >= 3 && p.held <= 6) return 'block';
    return 'foot';
  }

  build(mode) {
    this.mode = mode;
    this.releaseAll();
    this.btnBox.textContent = '';
    this.buttons.clear();
    for (const [id, label, what, how, right, bottom, size, look] of LAYOUTS[mode]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tc-btn tc-${id}`;
      b.textContent = label;
      b.dataset.id = id;
      b.style.setProperty('--r', right);
      b.style.setProperty('--b', bottom);
      b.style.setProperty('--s', size);
      this.btnBox.appendChild(b);
      this.buttons.set(id, { el: b, what, how, look: !!look });
    }
  }

  // Every frame.
  sync() {
    const g = this.game;
    const show = this.enabled && g.state === 'playing' && g.inGame;
    if (this.el.hidden === show) this.el.hidden = !show;
    if (!show) {
      if (this.pointers.size || this.toggled.size) this.releaseAll();
      return;
    }
    const mode = this.currentMode();
    if (mode !== this.mode) this.build(mode);
    // The siren button only in cars that have one.
    const siren = this.buttons.get('siren');
    if (siren) siren.el.hidden = !(g.player.driving && g.player.driving.def.siren);
    // USE pops up when there's something to do (the prompt at the bottom).
    const prompt = $('#prompt');
    const use = !g.player.driving && !prompt.hidden && /Press E/.test(prompt.textContent);
    this.useBtn.hidden = !use;
    if (use) this.useBtn.textContent = prompt.textContent.replace(/^Press E to /, '').replace(/ \(.*\)$/, '').slice(0, 28).toUpperCase();
    this.top.map.hidden = !g.adventure;
    this.top.chat.hidden = !g.mp;
    this.top.players.hidden = !g.mp;
    for (const [id, b] of this.buttons) b.el.classList.toggle('on', this.toggled.has(id));
  }

  // --- Fingers ---

  down(e) {
    const g = this.game;
    if (e.cancelable) e.preventDefault();
    g.sound.unlock();
    const t = e.target.closest('.tc-btn, [data-emote]');
    const rec = { x: e.clientX, y: e.clientY, kind: 'look', id: null };
    if (t && t.dataset.emote) {
      this.input.tap(t.dataset.emote);
      this.emoteBox.hidden = true;
      return;
    }
    if (t && t.dataset.action) {
      this.topAction(t.dataset.action, true);
      if (t.dataset.action === 'Tab') this.pointers.set(e.pointerId, { ...rec, kind: 'hold-top', code: 'Tab' });
      return;
    }
    if (t && t.dataset.id === 'use') {
      this.input.tap('KeyE');
      return;
    }
    if (t && t.dataset.id) {
      const b = this.buttons.get(t.dataset.id);
      if (!b) return;
      rec.kind = 'button';
      rec.id = t.dataset.id;
      this.press(t.dataset.id, b, true);
      if (b.look || b.how === 'hold') {
        this.pointers.set(e.pointerId, rec);
        try {
          this.el.setPointerCapture(e.pointerId);
        } catch {
          // Fine without it.
        }
      }
      return;
    }
    this.emoteBox.hidden = true;
    // The hotbar is under this layer: tap a slot to pick it.
    const slots = document.querySelectorAll('#hotbar .slot');
    for (let i = 0; i < slots.length; i++) {
      const r = slots[i].getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        this.input.tap(`Digit${i + 1}`);
        return;
      }
    }
    // Left part of the screen: the joystick. The rest: looking round.
    if (e.clientX < innerWidth * 0.42 && ![...this.pointers.values()].some((p) => p.kind === 'stick')) {
      rec.kind = 'stick';
      this.stick.classList.add('live');
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.input.stickOn = true;
      this.input.stickX = 0;
      this.input.stickY = 0;
    }
    this.pointers.set(e.pointerId, rec);
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Fine without it.
    }
  }

  move(e) {
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    if (e.cancelable) e.preventDefault();
    if (rec.kind === 'stick') {
      let dx = e.clientX - rec.x;
      let dy = e.clientY - rec.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        dx *= STICK_R / d;
        dy *= STICK_R / d;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const inp = this.input;
      inp.stickX = dx / STICK_R;
      inp.stickY = -dy / STICK_R;
      // The same as W, A, S and D for everything that reads keys.
      inp.hold('KeyW', inp.stickY > 0.35);
      inp.hold('KeyS', inp.stickY < -0.35);
      inp.hold('KeyD', inp.stickX > 0.35);
      inp.hold('KeyA', inp.stickX < -0.35);
      return;
    }
    const b = rec.id && this.buttons.get(rec.id);
    if (rec.kind === 'look' || (b && b.look)) {
      const k = LOOK_SPEED * (this.game.settings.sens || 1) ** 0.5;
      this.input.look((e.clientX - rec.x) * k, (e.clientY - rec.y) * k);
    }
    rec.x = e.clientX;
    rec.y = e.clientY;
  }

  up(e) {
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    this.pointers.delete(e.pointerId);
    if (rec.kind === 'stick') {
      this.stick.classList.remove('live');
      this.stick.style.left = this.stick.style.top = '';
      this.knob.style.transform = '';
      const inp = this.input;
      inp.stickOn = false;
      inp.stickX = inp.stickY = 0;
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) inp.hold(c, false);
    } else if (rec.kind === 'button') {
      const b = this.buttons.get(rec.id);
      if (b) this.press(rec.id, b, false);
    } else if (rec.kind === 'hold-top') this.input.hold(rec.code, false);
  }

  // A button went down (on = true) or up.
  press(id, b, on) {
    const inp = this.input;
    const set = (v) => (b.what === 'left' || b.what === 'right' ? inp.mouse(b.what, v) : inp.hold(b.what, v));
    if (b.how === 'tap') {
      if (on) inp.tap(b.what);
    } else if (b.how === 'toggle') {
      if (!on) return;
      const now = !this.toggled.has(id);
      if (now) this.toggled.add(id);
      else this.toggled.delete(id);
      set(now);
    } else set(on);
    b.el.classList.toggle('down', on && b.how !== 'toggle');
  }

  topAction(action) {
    const g = this.game;
    if (action === 'pause') g.pause();
    else if (action === 'emotes') this.emoteBox.hidden = !this.emoteBox.hidden;
    else if (action === 'Tab') this.input.hold('Tab', true);
    else this.input.tap(action);
  }

  releaseAll() {
    for (const [id, b] of this.buttons) {
      if (this.toggled.has(id) || b.el.classList.contains('down')) {
        if (b.what === 'left' || b.what === 'right') this.input.mouse(b.what, false);
        else this.input.hold(b.what, false);
      }
      b.el.classList.remove('down', 'on');
    }
    this.toggled.clear();
    this.pointers.clear();
    this.stick.classList.remove('live');
    const inp = this.input;
    inp.stickOn = false;
    inp.stickX = inp.stickY = 0;
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab']) inp.hold(c, false);
  }
}
