// Controllers (Xbox, PlayStation, Switch Pro, Steam Deck, and so on). Like
// the touch controls, a controller presses the same keys and mouse buttons
// as a keyboard and mouse (see Input.hold, tap, mouse and look).
//
// Playing                        Driving
//   Left stick   move              Left stick   steer
//   Right stick  look              RT / LT      gas / brake and reverse
//   RT           shoot             A            handbrake (drift)
//   LT           aim               Y            get out
//   A            jump              B            horn (Hyper Car: nitro)
//   B            crouch            X            siren
//   X            reload            RB / LB      Hyper Car turret / rockets
//   Y            use (E)           D-pad        Hyper Car jets, oil, smoke,
//   LB / RB      last / next gun                shield
//   D-pad        grenade, camera, dance, map
//   Start        pause             View         map (Adventure), players
//
// In menus: D-pad or left stick to move, A to press, B to go back.

const A = 0;
const B = 1;
const X = 2;
const Y = 3;
const LB = 4;
const RB = 5;
const LT = 6;
const RT = 7;
const VIEW = 8;
const START = 9;
const L3 = 10;
const R3 = 11;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;
const DEAD = 0.18;
const LOOK = 1100;

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class Gamepads {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.prev = [];
    this.held = new Set();
    this.active = false;
    this.repeatT = 0;
    this.lastDir = null;
    window.addEventListener('gamepadconnected', () => {
      this.game.hud.popup('Controller connected');
    });
    // Using the mouse again hides the controller focus ring.
    window.addEventListener('mousemove', () => document.body.classList.remove('pad'));
  }

  pad() {
    let list = [];
    try {
      list = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    } catch {
      return null;
    }
    // The one that was used last (or the first one connected).
    let best = null;
    for (const p of list) if (p && p.connected && (!best || p.timestamp > best.timestamp)) best = p;
    return best;
  }

  // Every frame.
  update(dt) {
    const p = this.pad();
    if (!p) {
      if (this.active) this.release();
      return;
    }
    const btn = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    const val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
    const now = p.buttons.map((b, i) => btn(i));
    const hit = (i) => now[i] && !this.prev[i];
    const axis = (i) => {
      const v = p.axes[i] || 0;
      return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD);
    };
    const used = now.some(Boolean) || p.axes.some((v) => Math.abs(v) > 0.4);
    if (used && !this.active) {
      this.active = true;
      // No mouse needed.
      this.input.free = true;
    }
    const g = this.game;
    if (g.state === 'playing' && g.inGame) this.play(p, btn, val, hit, axis, dt);
    else {
      if (this.held.size || this.input.stickOn) this.release();
      if (this.active) this.menus(hit, axis, dt);
    }
    this.prev = now;
  }

  // Hold a key (or mouse button) while `on`, and let go when it isn't.
  set(code, on) {
    if (on === this.held.has(code)) return;
    if (on) this.held.add(code);
    else this.held.delete(code);
    if (code === 'left' || code === 'right') this.input.mouse(code, on);
    else this.input.hold(code, on);
  }

  release() {
    for (const code of [...this.held]) this.set(code, false);
    const inp = this.input;
    if (inp.stickOn) {
      inp.stickOn = false;
      inp.stickX = inp.stickY = 0;
    }
    inp.throttle = 0;
  }

  play(p, btn, val, hit, axis, dt) {
    const g = this.game;
    const inp = this.input;
    const pl = g.player;
    const car = pl.driving;
    const lx = axis(0);
    const ly = -axis(1);
    // Moving (or steering).
    const moving = Math.hypot(lx, ly) > 0;
    if (moving || inp.stickOn) {
      inp.stickOn = moving;
      inp.stickX = lx;
      inp.stickY = car ? 0 : ly;
    }
    this.set('KeyW', !car && ly > 0.35);
    this.set('KeyS', !car && ly < -0.35);
    this.set('KeyD', lx > 0.35);
    this.set('KeyA', lx < -0.35);
    // Looking round: faster the further you push, gentle near the middle.
    const rx = axis(2);
    const ry = axis(3);
    if (rx || ry) {
      const k = LOOK * dt;
      inp.look(Math.sign(rx) * rx * rx * k, Math.sign(ry) * ry * ry * k * 0.75);
    }
    if (hit(START)) {
      this.release();
      g.pause();
      return;
    }
    if (car) {
      // Driving: triggers for gas and brake.
      inp.throttle = val(RT) - val(LT);
      this.set('Space', btn(A));
      if (hit(Y)) inp.tap('KeyE');
      if (hit(X)) inp.tap('KeyF');
      if (car.hyper) {
        this.set('left', btn(RB));
        this.set('right', btn(LB));
        this.set('ShiftLeft', btn(B));
        if (hit(R3)) inp.tap('KeyH');
        if (hit(UP)) inp.tap('KeyQ');
        if (hit(DOWN)) inp.tap('KeyX');
        if (hit(LEFT)) inp.tap('KeyG');
        if (hit(RIGHT)) inp.tap('KeyC');
        if (hit(L3)) inp.tap('KeyU');
      } else {
        this.set('left', false);
        this.set('right', false);
        this.set('ShiftLeft', false);
        if (hit(B)) inp.tap('KeyH');
      }
      if (hit(VIEW)) inp.tap(g.adventure ? 'KeyM' : 'KeyV');
      return;
    }
    inp.throttle = 0;
    this.set('left', btn(RT));
    this.set('right', btn(LT));
    this.set('Space', btn(A));
    this.set('ShiftLeft', btn(B));
    this.set('Tab', !!g.mp && btn(VIEW));
    if (hit(X)) inp.tap('KeyR');
    if (hit(Y)) inp.tap('KeyE');
    if (hit(RB)) inp.wheel += 1;
    if (hit(LB)) inp.wheel -= 1;
    if (hit(UP)) inp.tap('KeyG');
    if (hit(DOWN)) inp.tap('KeyX');
    if (hit(LEFT)) inp.tap('KeyQ');
    if (hit(RIGHT) || hit(R3)) inp.tap('KeyV');
    if (hit(L3) && pl.held === 7) inp.tap('KeyN');
    if (hit(VIEW) && g.adventure) inp.tap('KeyM');
  }

  // --- Menus: move between buttons, A to press, B to go back ---

  menus(hit, axis, dt) {
    const g = this.game;
    // Talking to someone: A (or B) carries on.
    if (g.state === 'talk' && g.dialogue && g.dialogue.open) {
      if (hit(A) || hit(B)) document.querySelector('#dialogue').click();
      return;
    }
    let dir = null;
    if (hit(UP)) dir = [0, -1];
    else if (hit(DOWN)) dir = [0, 1];
    else if (hit(LEFT)) dir = [-1, 0];
    else if (hit(RIGHT)) dir = [1, 0];
    // The stick repeats while you hold it.
    const sx = axis(0);
    const sy = axis(1);
    this.repeatT -= dt;
    if (!dir && Math.hypot(sx, sy) > 0.6) {
      const d = Math.abs(sx) > Math.abs(sy) ? [Math.sign(sx), 0] : [0, Math.sign(sy)];
      const same = this.lastDir && this.lastDir[0] === d[0] && this.lastDir[1] === d[1];
      if (!same || this.repeatT <= 0) {
        dir = d;
        this.repeatT = same ? 0.14 : 0.35;
      }
      this.lastDir = d;
    } else if (Math.hypot(sx, sy) < 0.3) this.lastDir = null;
    if (dir) this.moveFocus(dir);
    if (hit(A)) {
      const el = document.activeElement;
      if (el && el !== document.body && el.matches(FOCUSABLE)) {
        document.body.classList.add('pad');
        el.click();
      } else this.moveFocus(null);
    }
    if (hit(B) || hit(START)) {
      // The same as pressing Esc.
      if (hit(START) && g.state === 'paused') g.resume();
      else {
        const was = g.state;
        const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        // The pause menu has no Esc of its own: B goes back to the game.
        if (was === 'paused' && g.state === 'paused') g.resume();
      }
    }
  }

  // Focus the nearest button in direction dir ([dx, dy]), or the first one.
  moveFocus(dir) {
    document.body.classList.add('pad');
    const all = [...document.querySelectorAll(FOCUSABLE)].filter((el) => {
      if (el.disabled || el.closest('[hidden]') || el.closest('#touch')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return false;
      return getComputedStyle(el).visibility !== 'hidden';
    });
    if (!all.length) return;
    const cur = document.activeElement;
    const from = cur && all.includes(cur) ? cur.getBoundingClientRect() : null;
    if (!from || !dir) {
      const first = all.find((el) => el.classList.contains('btn-go')) || all[0];
      first.focus();
      first.scrollIntoView({ block: 'nearest' });
      return;
    }
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    let best = null;
    let bd = Infinity;
    for (const el of all) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 2) continue;
      const across = Math.abs(dx * dir[1] - dy * dir[0]);
      const d = along + across * 2.5;
      if (d < bd) {
        bd = d;
        best = el;
      }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest' });
    }
  }
}
