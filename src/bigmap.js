import { $ } from './util.js';
import { AREAS } from './county.js';
import { SX, SZ } from './world.js';

// The big map of Blockton County (press M in Adventure). Every shop,
// hospital and police station is marked. Hover over a place to see what it
// is, and click it to put a green beacon there.

// What each kind of place looks like on the map: [colour, letter, name].
const KINDS = {
  hospital: ['#ff4a4a', '+', 'Hospital'],
  police: ['#3a7aff', 'P', 'Police'],
  fire: ['#ff7a2f', 'F', 'Fire station'],
  school: ['#4fcf6a', 'S', 'School'],
  library: ['#8a6ad8', 'L', 'Library'],
  food: ['#ffb020', 'Y', 'Food'],
  mart: ['#6fd3a0', 'M', 'Shop'],
  guns: ['#9aa0a8', 'G', 'Gun shop'],
  clothes: ['#ff7ac0', 'C', 'Clothes'],
  pets: ['#ffd23f', '♥', 'Pets'],
  books: ['#b08a5a', 'B', 'Books'],
  bank: ['#f2c230', '$', 'Bank'],
  gym: ['#d8392b', 'W', 'Gym'],
  dealer: ['#39b8ff', 'D', 'Car dealer'],
  hotel: ['#c58aff', 'H', 'Hotel'],
  home: ['#ffffff', '⌂', 'Your house'],
};
const LEGEND = ['home', 'hospital', 'police', 'fire', 'school', 'food', 'mart', 'bank', 'gym', 'dealer', 'hotel', 'library'];

export class BigMap {
  constructor(adv) {
    this.adv = adv;
    this.game = adv.game;
    this.el = $('#bigmap');
    this.cv = $('#bigmap-canvas');
    this.hover = $('#bigmap-hover');
    this.open = false;
    this.hot = null;
    const leg = $('#bigmap-legend');
    leg.textContent = '';
    for (const k of LEGEND) {
      const [color, , name] = KINDS[k];
      const s = document.createElement('span');
      const i = document.createElement('i');
      i.style.background = color;
      s.append(i, name);
      leg.append(s);
    }
    this.onKey = (e) => {
      if (!this.open) return;
      if (e.code === 'KeyM' || e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    this.onMove = (e) => {
      this.hot = this.pick(e);
      this.hover.textContent = this.hot ? `${this.hot[3]} · click to go there` : 'Click a place to put a beacon on it.';
      this.draw();
    };
    this.onClick = (e) => {
      const hit = this.pick(e);
      if (!hit) return;
      this.adv.setWaypoint(hit[0], hit[1], hit[3]);
      this.game.sound.click();
      this.close();
    };
    this.onClose = () => this.close();
    window.addEventListener('keydown', this.onKey);
    this.cv.addEventListener('mousemove', this.onMove);
    this.cv.addEventListener('click', this.onClick);
    $('#bigmap-close').addEventListener('click', this.onClose);
  }

  dispose() {
    if (this.open) this.close(true);
    window.removeEventListener('keydown', this.onKey);
    this.cv.removeEventListener('mousemove', this.onMove);
    this.cv.removeEventListener('click', this.onClick);
    $('#bigmap-close').removeEventListener('click', this.onClose);
  }

  show() {
    const g = this.game;
    this.open = true;
    g.input.exitLock();
    g.setState('map');
    this.el.hidden = false;
    this.hot = null;
    this.hover.textContent = 'Click a place to put a beacon on it.';
    this.draw();
  }

  close(silent = false) {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    const g = this.game;
    if (!silent && g.state === 'map') {
      g.setState('playing');
      g.lockMouse();
    }
  }

  // The place under the mouse, if any.
  pick(e) {
    const r = this.cv.getBoundingClientRect();
    // The canvas keeps its shape inside the box (object-fit: contain).
    const k = Math.min(r.width / SX, r.height / SZ);
    const ox = (r.width - SX * k) / 2;
    const oz = (r.height - SZ * k) / 2;
    const x = (e.clientX - r.left - ox) / k;
    const z = (e.clientY - r.top - oz) / k;
    let best = null;
    let bd = 12 / Math.max(0.5, k);
    for (const m of this.adv.places.markers()) {
      const d = Math.hypot(m[0] - x, m[1] - z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  draw() {
    const a = this.adv;
    const ctx = this.cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.mapBase, 0, 0, SX, SZ);
    // A little darker, so the markers stand out.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(0, 0, SX, SZ);
    // Names of the towns and wild places.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 22px 'Pixelify Sans', ui-monospace, monospace";
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillStyle = '#fff6d8';
    for (const ar of AREAS) {
      // Keep the names on the map.
      const half = ctx.measureText(ar.name).width / 2 + 6;
      const x = Math.max(half, Math.min(SX - half, ar.x));
      const z = Math.max(16, Math.min(SZ - 16, ar.z));
      ctx.strokeText(ar.name, x, z);
      ctx.fillText(ar.name, x, z);
    }
    // Places.
    ctx.font = "700 11px ui-monospace, monospace";
    for (const m of a.places.markers()) {
      const [x, z, type] = m;
      const [color, letter] = KINDS[type] || ['#cccccc', '?'];
      const hot = this.hot === m || (this.hot && this.hot[0] === x && this.hot[1] === z);
      const r = hot ? 9 : 6.5;
      ctx.fillStyle = '#000';
      ctx.fillRect(x - r - 1.5, z - r - 1.5, r * 2 + 3, r * 2 + 3);
      ctx.fillStyle = color;
      ctx.fillRect(x - r, z - r, r * 2, r * 2);
      ctx.fillStyle = type === 'home' || type === 'bank' || type === 'pets' || type === 'food' ? '#1a1a1c' : '#ffffff';
      ctx.fillText(letter, x, z + 1);
    }
    // Jobs.
    for (const person of Object.values(a.givers)) {
      if (!a.showMark(person)) continue;
      ctx.fillStyle = '#000';
      ctx.fillRect(person.pos.x - 5, person.pos.z - 9, 10, 18);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('!', person.pos.x, person.pos.z + 1);
    }
    // Your cars.
    for (const c of a.cars) {
      if (!c.mine || c.dead) continue;
      ctx.fillStyle = '#000';
      ctx.fillRect(c.pos.x - 4, c.pos.z - 4, 8, 8);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(c.pos.x - 3, c.pos.z - 3, 6, 6);
    }
    // Where you're going.
    if (a.beaconAt) {
      const [bx, bz] = a.beaconAt;
      ctx.strokeStyle = '#6fff8a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, bz, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    // You.
    const p = this.game.player;
    const yaw = p.driving ? p.driving.yaw + Math.PI : p.yaw;
    ctx.save();
    ctx.translate(p.pos.x, p.pos.z);
    ctx.rotate(-yaw + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
