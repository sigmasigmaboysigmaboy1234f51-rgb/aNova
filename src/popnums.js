import * as THREE from 'three';

// Damage numbers that pop out of mobs when you hit them and float up.
// Plain HTML placed over the 3D view each frame.

const MAX = 48;
const v = new THREE.Vector3();

export class DamageNumbers {
  constructor(game, container) {
    this.game = game;
    this.el = container;
    this.pool = [];
    this.live = [];
    this.enabled = true;
  }

  add(at, amount, head = false, big = false) {
    if (!this.enabled || !at) return;
    let n = this.pool.pop();
    if (!n) {
      if (this.live.length >= MAX) n = this.live.shift();
      else {
        const el = document.createElement('div');
        el.className = 'dnum';
        this.el.appendChild(el);
        n = { el };
      }
    }
    n.pos = new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.3, at.y + 0.2, at.z + (Math.random() - 0.5) * 0.3);
    n.vx = (Math.random() - 0.5) * 0.6;
    n.t = 0;
    const val = amount >= 10 ? Math.round(amount) : Math.round(amount * 10) / 10;
    n.el.textContent = String(Math.max(0.1, val));
    n.el.className = 'dnum' + (head ? ' head' : '') + (big ? ' big' : '');
    n.el.hidden = false;
    this.live.push(n);
  }

  update(dt) {
    if (!this.live.length) return;
    const cam = this.game.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const keep = [];
    for (const n of this.live) {
      n.t += dt;
      if (n.t > 0.9) {
        n.el.hidden = true;
        this.pool.push(n);
        continue;
      }
      n.pos.y += dt * (1.6 - n.t * 1.4);
      n.pos.x += n.vx * dt;
      v.copy(n.pos).project(cam);
      if (v.z > 1) {
        n.el.style.opacity = '0';
      } else {
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        const s = n.t < 0.12 ? 0.6 + (n.t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (n.t - 0.12) * 0.5);
        n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
        n.el.style.opacity = String(Math.min(1, (0.9 - n.t) * 4));
      }
      keep.push(n);
    }
    this.live = keep;
  }

  clear() {
    for (const n of this.live) {
      n.el.hidden = true;
      this.pool.push(n);
    }
    this.live = [];
  }
}
