import { $ } from './util.js';
import { COIN_ICON } from './hud.js';
import { PARTS, rollPart } from './weapons.js';
import { HATS, CAPES, KILL_FX } from './cosmetics.js';

// The Lucky Wheel: one free spin a day, more for coins.

const SPIN_PRICE = 200;
const PRIZES = [
  { label: '50', kind: 'coins', n: 50, w: 22, color: '#4d8a2c' },
  { label: 'PART', kind: 'part', w: 14, color: '#39b8ff' },
  { label: '100', kind: 'coins', n: 100, w: 18, color: '#c9a23a' },
  { label: 'STYLE', kind: 'style', w: 12, color: '#b46cff' },
  { label: '250', kind: 'coins', n: 250, w: 12, color: '#d8392b' },
  { label: 'XP', kind: 'xp', n: 400, w: 10, color: '#ff7a2f' },
  { label: '500', kind: 'coins', n: 500, w: 8, color: '#2f94ac' },
  { label: 'JACKPOT', kind: 'coins', n: 2000, w: 4, color: '#f2c230', jackpot: true },
];
const SEG = (Math.PI * 2) / PRIZES.length;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export class Wheel {
  constructor(game) {
    this.game = game;
    this.el = $('#wheel');
    this.canvas = $('#wheel-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.angle = 0;
    this.spinning = false;
    this.open = false;
    $('#wh-coin-icon').src = COIN_ICON;
    $('#wh-done').addEventListener('click', () => this.close());
    $('#wh-spin').addEventListener('click', () => this.spin());
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.draw();
  }

  freeReady() {
    const w = this.game.profile.wheel;
    return !w || w.day !== today();
  }

  close() {
    if (this.spinning) return;
    this.game.setState('menu');
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.render();
    $('#wh-spin').focus();
  }

  hide() {
    this.open = false;
    this.el.hidden = true;
  }

  render() {
    const prof = this.game.profile;
    $('#wh-coins').textContent = prof.coins.toLocaleString('en-US');
    const btn = $('#wh-spin');
    const free = this.freeReady();
    btn.textContent = free ? 'Spin! (free today)' : `Spin for ${SPIN_PRICE} coins`;
    btn.disabled = this.spinning || (!free && prof.coins < SPIN_PRICE);
    $('#wh-note').textContent = free ? 'You get one free spin every day.' : 'Your free spin is used up. Come back tomorrow for another!';
  }

  draw() {
    const c = this.ctx;
    const W = this.canvas.width;
    const R = W / 2 - 10;
    c.clearRect(0, 0, W, W);
    c.save();
    c.translate(W / 2, W / 2);
    // Outer rim with lights.
    c.fillStyle = '#2c2822';
    c.beginPath();
    c.arc(0, 0, R + 8, 0, Math.PI * 2);
    c.fill();
    c.rotate(this.angle);
    PRIZES.forEach((p, i) => {
      const a0 = i * SEG - Math.PI / 2 - SEG / 2;
      c.fillStyle = p.color;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, R, a0, a0 + SEG);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 4;
      c.stroke();
      c.save();
      c.rotate(a0 + SEG / 2);
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.font = `400 ${p.label.length > 5 ? 26 : 34}px 'Pixelify Sans', ui-monospace, monospace`;
      c.fillStyle = '#000';
      c.fillText(p.label, R - 16 + 3, 3);
      c.fillStyle = '#fff';
      c.fillText(p.label, R - 16, 0);
      c.restore();
    });
    c.restore();
    // Rim lights.
    c.save();
    c.translate(W / 2, W / 2);
    const blink = Math.floor(performance.now() / 250) % 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.fillStyle = (i + blink) % 2 ? '#fff2a8' : '#8a6a1f';
      c.fillRect(Math.cos(a) * (R + 4) - 4, Math.sin(a) * (R + 4) - 4, 8, 8);
    }
    // Hub.
    c.fillStyle = '#1b1915';
    c.fillRect(-26, -26, 52, 52);
    c.fillStyle = '#f2c230';
    c.fillRect(-18, -18, 36, 36);
    c.restore();
    // The pointer at the top.
    c.fillStyle = '#fff';
    c.strokeStyle = '#000';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(W / 2 - 18, 2);
    c.lineTo(W / 2 + 18, 2);
    c.lineTo(W / 2, 40);
    c.closePath();
    c.fill();
    c.stroke();
  }

  pick() {
    const total = PRIZES.reduce((t, p) => t + p.w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < PRIZES.length; i++) {
      r -= PRIZES[i].w;
      if (r <= 0) return i;
    }
    return 0;
  }

  spin() {
    if (this.spinning) return;
    const prof = this.game.profile;
    const free = this.freeReady();
    if (!free) {
      if (prof.coins < SPIN_PRICE) return;
      prof.addCoins(-SPIN_PRICE);
    } else {
      prof.wheel = { day: today() };
      prof.changed();
    }
    this.game.sound.unlock();
    const i = this.pick();
    // Land the middle of wedge i under the pointer, after a few turns.
    const turns = 5 + Math.floor(Math.random() * 3);
    const jitter = (Math.random() - 0.5) * SEG * 0.6;
    const start = this.angle;
    const base = -i * SEG + jitter;
    let end = base + Math.PI * 2 * Math.ceil((start - base) / (Math.PI * 2));
    end += Math.PI * 2 * turns;
    const dur = 4.2;
    this.spinning = true;
    $('#wh-msg').textContent = '';
    this.render();
    let t = 0;
    let last = performance.now();
    let lastSeg = Math.floor(start / SEG);
    const step = (now) => {
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = Math.min(1, t / dur);
      const e = 1 - Math.pow(1 - k, 4);
      this.angle = start + (end - start) * e;
      const seg = Math.floor(this.angle / SEG);
      if (seg !== lastSeg) {
        lastSeg = seg;
        this.game.sound.click();
      }
      this.draw();
      if (k < 1 && this.open) requestAnimationFrame(step);
      else {
        this.angle = end % (Math.PI * 2);
        this.draw();
        this.spinning = false;
        this.award(PRIZES[i]);
        this.render();
      }
    };
    requestAnimationFrame(step);
  }

  award(p) {
    const g = this.game;
    const prof = g.profile;
    let text = '';
    if (p.kind === 'coins') {
      prof.addCoins(p.n);
      text = p.jackpot ? `JACKPOT!!! ${p.n.toLocaleString('en-US')} coins!` : `You won ${p.n} coins!`;
    } else if (p.kind === 'xp') {
      g.progress.addXp(p.n);
      text = `You won ${p.n} XP!`;
    } else if (p.kind === 'part') {
      const part = rollPart();
      if (prof.givePart(part.id)) text = `You won the ${part.name}! Fit it in the Armory.`;
      else {
        const n = Math.max(50, Math.round(PARTS[part.id].price / 2));
        prof.addCoins(n);
        text = `You won the ${part.name}, but you had it, so here are ${n} coins.`;
      }
    } else if (p.kind === 'style') {
      const pool = [
        ...Object.keys(HATS).map((id) => ['hat', id, HATS[id].name]),
        ...Object.keys(CAPES).map((id) => ['cape', id, CAPES[id].name]),
        ...Object.keys(KILL_FX).map((id) => ['fx', id, KILL_FX[id].name]),
      ].filter(([k, id]) => !prof.ownsCos(k, id));
      if (pool.length) {
        const [k, id, name] = pool[Math.floor(Math.random() * pool.length)];
        prof.giveCos(k, id);
        text = `You won the ${name}! Wear it in the Style shop.`;
      } else {
        prof.addCoins(400);
        text = 'You own every Style item already, so here are 400 coins!';
      }
    }
    if (p.jackpot) g.sound.streak(6);
    else g.sound.cleared();
    const msg = $('#wh-msg');
    msg.textContent = text;
    msg.classList.remove('in');
    void msg.offsetWidth;
    msg.classList.add('in');
    g.progress.event('spin', {});
    g.refreshWheelDot();
  }

  // Keeps the rim lights blinking.
  frame() {
    if (this.open && !this.spinning) this.draw();
  }
}
