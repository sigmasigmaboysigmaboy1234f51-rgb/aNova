import { $ } from './util.js';
import { MOB_TYPES, FAMILIES, FAMILY_ORDER, VARIANTS, VARIANT_ORDER } from './mobtypes.js';
import { BOSSES } from './boss.js';
import { buildMobModel } from './mobmodels.js';
import { mobTexture } from './mobskins.js';
import { buildBrute, poseBrute } from './brute.js';
import { Rig, poseMoss, poseBone } from './anim.js';
import { mobThumb } from './thumbs.js';

// The Mobs screen: every mob and boss in the game, and which ones you have
// met. Pictures are drawn a few at a time so the screen opens instantly.

function builder(type) {
  return () => {
    const def = MOB_TYPES[type];
    if (def.boss) {
      const b = BOSSES[def.bossIndex];
      const m = buildBrute({ seed: 41 + def.bossIndex * 17, ...b.look });
      poseBrute(m, {}, { speed: 0, act: 'flex', actT: 0.5, spawn: 1, hurt: 0, lookYaw: 0, lookPitch: 0 }, 1);
      return { object: m.root, dispose: () => m.dispose() };
    }
    const m = buildMobModel(def, mobTexture(type));
    m.root.scale.setScalar(1);
    if (def.body === 'humanoid') {
      const rig = new Rig(m);
      const s = { speed: 0, attack: -1, hurt: 0, spawn: 1, dead: false, deadT: 0, lookYaw: 0, lookPitch: 0, aiming: def.ai === 'archer', draw: 0, fired: 0 };
      if (def.ai === 'archer' || def.ai === 'thrower') poseBone(rig, s, 1);
      else poseMoss(rig, s, 1);
    }
    return { object: m.root, dispose: () => m.dispose() };
  };
}

// The wave a mob first shows up on.
function firstWave(def) {
  if (def.boss) return (def.bossIndex + 1) * 5;
  return Math.max(FAMILIES[def.family].unlock, VARIANTS[def.variant].unlock);
}

export class Bestiary {
  constructor(game) {
    this.game = game;
    this.el = $('#bestiary');
    this.grid = $('#best-grid');
    this.open = false;
    this.queue = [];
    this.selected = 'moss';
    $('#best-done').addEventListener('click', () => game.closeBestiary());
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        game.closeBestiary();
      }
    });
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.render();
    $('#best-done').focus();
  }

  hide() {
    this.open = false;
    this.el.hidden = true;
    this.queue = [];
  }

  seen(type) {
    return this.game.profile.seen.has(type);
  }

  render() {
    const prof = this.game.profile;
    const all = Object.keys(MOB_TYPES);
    const found = all.filter((t) => prof.seen.has(t)).length;
    $('#best-count').textContent = `${found} of ${all.length} found`;
    this.grid.textContent = '';
    this.queue = [];
    this.cards = new Map();
    const section = (title, types) => {
      const h = document.createElement('h3');
      h.className = 'best-family';
      h.textContent = title;
      const row = document.createElement('div');
      row.className = 'best-row';
      for (const t of types) row.appendChild(this.card(t));
      this.grid.append(h, row);
    };
    section('Bosses', BOSSES.map((b) => b.type));
    for (const f of FAMILY_ORDER) {
      section(FAMILIES[f].name + 's', VARIANT_ORDER.map((v) => (v === 'normal' ? f : `${f}:${v}`)));
    }
    this.details(this.selected);
  }

  card(type) {
    const def = MOB_TYPES[type];
    const seen = this.seen(type);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'best-card' + (def.boss ? ' boss' : '');
    if (!seen) b.classList.add('unknown');
    b.setAttribute('aria-pressed', String(type === this.selected));
    const pic = document.createElement('canvas');
    pic.width = 96;
    pic.height = 96;
    const name = document.createElement('span');
    name.textContent = seen ? def.name : '???';
    b.append(pic, name);
    b.addEventListener('click', () => {
      this.selected = type;
      for (const [t, el] of this.cards) el.setAttribute('aria-pressed', String(t === type));
      this.details(type);
    });
    this.cards.set(type, b);
    this.queue.push({ type, pic, seen });
    return b;
  }

  details(type) {
    const def = MOB_TYPES[type];
    const seen = this.seen(type);
    const prof = this.game.profile;
    const pic = $('#best-pic');
    const ctx = pic.getContext('2d');
    ctx.clearRect(0, 0, pic.width, pic.height);
    ctx.drawImage(mobThumb(this.game.renderer, builder(type), type, 220, 220, !seen), 0, 0, pic.width, pic.height);
    $('#best-name').textContent = seen ? def.name : '???';
    const kind = def.boss ? 'Boss' : def.variant === 'normal' ? FAMILIES[def.family].name : `${VARIANTS[def.variant].prefix} variant`;
    $('#best-kind').textContent = seen ? kind : `First shows up around wave ${firstWave(def)}`;
    const blurb = def.boss ? def.title + '.' : `${FAMILIES[def.family].blurb} ${def.variantBlurb || ''}`.trim();
    $('#best-blurb').textContent = seen ? blurb : 'You have not met this one yet.';
    const stats = $('#best-stats');
    stats.textContent = '';
    if (!seen) return;
    const moves = def.boss ? BOSSES[def.bossIndex].kit.map((k) => MOVE_NAMES[k] || k).join(', ') : null;
    const rows = [
      ['Health', Math.round(def.hp)],
      ['Speed', def.speed.toFixed(1)],
      ['Damage', def.dmg],
      ['Coins', def.coins],
      ['Beaten', prof.kills[type] || 0],
    ];
    if (moves) rows.push(['Moves', moves]);
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = String(v);
      stats.append(dt, dd);
    }
  }

  // Draw a few pictures per frame.
  frame() {
    if (!this.open) return;
    const r = this.game.renderer;
    for (let n = 0; n < 4 && this.queue.length; n++) {
      const { type, pic, seen } = this.queue.shift();
      pic.getContext('2d').drawImage(mobThumb(r, builder(type), type, 96, 96, !seen), 0, 0, 96, 96);
    }
  }
}

const MOVE_NAMES = {
  slam: 'Ground slam',
  punch: 'Haymaker',
  summon: 'Calls friends',
  volley: 'Bolt volley',
  throw: 'Boulder throw',
  bombs: 'Toxic bombs',
  breath: 'Ice breath',
  strikes: 'Lightning strikes',
  leap: 'Belly flop',
  charge: 'Charge',
  teleport: 'Shadow step',
};
