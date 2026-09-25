import { $ } from './util.js';
import { HATS, CAPES, KILL_FX, RARITY, cosmeticObject } from './cosmetics.js';
import { PETS, PET_ORDER, petObject } from './pets.js';
import { COIN_ICON } from './hud.js';
import { mobThumb } from './thumbs.js';

// The Style shop: hats, capes, pets and kill effects. Pick something to
// try it on, then buy it with coins. Everything is only for looks except
// pets, which help out a little.

const TABS = {
  hat: { name: 'Hats', items: HATS, blurb: 'Sits on your head in third person and for everyone online.' },
  cape: { name: 'Capes', items: CAPES, blurb: 'Flaps behind you. The faster you run, the more it flaps.' },
  pet: { name: 'Pets', items: PETS, order: PET_ORDER },
  fx: { name: 'Kill effects', items: KILL_FX, blurb: 'A burst of particles every time you beat a mob. Everyone online sees it.' },
};

function fxThumb(id, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cols = KILL_FX[id].colors;
  // A pixel burst: squares flying out from the middle.
  let seed = id.length * 97;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const r = size * (0.08 + rand() * 0.38);
    const s = Math.round(size * (0.04 + rand() * 0.06));
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(Math.round(size / 2 + Math.cos(a) * r - s / 2), Math.round(size / 2 + Math.sin(a) * r - s / 2), s, s);
  }
  return c;
}

export class Wardrobe {
  constructor(game) {
    this.game = game;
    this.el = $('#style');
    this.open = false;
    this.tab = 'hat';
    this.sel = null;
    this.queue = [];
    $('#st-coin-icon').src = COIN_ICON;
    $('#st-done').addEventListener('click', () => game.setState('menu'));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        game.setState('menu');
      }
    });
    for (const b of this.el.querySelectorAll('[data-tab]')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab;
        this.sel = null;
        this.render();
      });
    }
    $('#st-action').addEventListener('click', () => this.act());
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.msg('');
    this.render();
    $('#st-done').focus();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.queue = [];
    this.game.preview.dress(this.game.profile.style);
  }

  msg(text) {
    const m = $('#st-msg');
    m.textContent = text;
    m.classList.remove('in');
    void m.offsetWidth;
    if (text) m.classList.add('in');
  }

  ids(kind) {
    const t = TABS[kind];
    return t.order || Object.keys(t.items);
  }

  thumb(kind, id, size) {
    if (kind === 'fx') return fxThumb(id, size);
    const build = () => ({ object: kind === 'pet' ? petObject(id) : cosmeticObject(kind, id), dispose() {} });
    return mobThumb(this.game.renderer, build, `${kind}:${id}`, size, size);
  }

  render() {
    const prof = this.game.profile;
    $('#st-coins').textContent = prof.coins.toLocaleString('en-US');
    for (const b of this.el.querySelectorAll('[data-tab]')) b.setAttribute('aria-pressed', String(b.dataset.tab === this.tab));
    const grid = $('#st-grid');
    grid.textContent = '';
    this.queue = [];
    const t = TABS[this.tab];
    // "None" takes it off.
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'st-card st-none';
    none.setAttribute('aria-pressed', String(!prof.style[this.tab] && this.sel === null));
    none.innerHTML = '<span class="st-x">×</span><span class="st-name">None</span>';
    none.addEventListener('click', () => {
      prof.wear(this.tab, null);
      this.sel = null;
      this.render();
    });
    grid.appendChild(none);
    for (const id of this.ids(this.tab)) {
      const def = t.items[id];
      const owned = prof.ownsCos(this.tab, id);
      const worn = prof.style[this.tab] === id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-card' + (owned ? ' owned' : '') + (worn ? ' worn' : '');
      b.style.setProperty('--rarity', RARITY[def.rarity].color);
      b.setAttribute('aria-pressed', String(this.sel === id));
      const pic = document.createElement('canvas');
      pic.width = pic.height = 96;
      const name = document.createElement('span');
      name.className = 'st-name';
      name.textContent = def.name;
      const state = document.createElement('span');
      state.className = 'st-state';
      if (worn) state.textContent = 'Wearing';
      else if (owned) state.textContent = 'Owned';
      else {
        const coin = document.createElement('img');
        coin.src = COIN_ICON;
        coin.alt = '';
        state.append(coin, def.price.toLocaleString('en-US'));
        if (def.price > prof.coins) state.classList.add('poor');
      }
      b.append(pic, name, state);
      b.addEventListener('click', () => {
        this.sel = id;
        this.render();
      });
      grid.appendChild(b);
      this.queue.push({ kind: this.tab, id, pic });
    }
    this.details();
  }

  details() {
    const prof = this.game.profile;
    const kind = this.tab;
    const id = this.sel;
    const t = TABS[kind];
    const btn = $('#st-action');
    const trying = { ...prof.style };
    if (!id) {
      $('#st-name').textContent = t.name;
      $('#st-kind').textContent = '';
      $('#st-desc').textContent = kind === 'pet' ? 'Pets follow you everywhere and help out in fights.' : t.blurb;
      btn.hidden = true;
    } else {
      const def = t.items[id];
      const owned = prof.ownsCos(kind, id);
      const worn = prof.style[kind] === id;
      $('#st-name').textContent = def.name;
      const r = RARITY[def.rarity];
      const kindEl = $('#st-kind');
      kindEl.textContent = `${r.name} ${kind === 'fx' ? 'kill effect' : kind}`;
      kindEl.style.color = r.color;
      $('#st-desc').textContent = def.desc || t.blurb;
      btn.hidden = false;
      if (worn) {
        btn.textContent = 'Take it off';
        btn.disabled = false;
      } else if (owned) {
        btn.textContent = 'Wear it';
        btn.disabled = false;
      } else {
        btn.textContent = `Buy for ${def.price.toLocaleString('en-US')} coins`;
        btn.disabled = prof.coins < def.price;
      }
      // Try it on.
      trying[kind] = id;
    }
    this.game.preview.dress(trying);
  }

  act() {
    const prof = this.game.profile;
    const kind = this.tab;
    const id = this.sel;
    if (!id) return;
    const def = TABS[kind].items[id];
    if (prof.style[kind] === id) {
      prof.wear(kind, null);
      this.msg(`Took off the ${def.name}.`);
    } else if (prof.ownsCos(kind, id)) {
      prof.wear(kind, id);
      this.msg(`Now wearing the ${def.name}.`);
    } else if (prof.buyCos(kind, id, def.price)) {
      this.game.sound.coin();
      this.game.progress.event('style', { kind, id });
      this.msg(`You bought the ${def.name}! You're wearing it now.`);
    } else {
      this.msg(`You need ${(def.price - prof.coins).toLocaleString('en-US')} more coins.`);
    }
    this.render();
  }

  // Draw a few pictures per frame so the screen opens instantly.
  frame() {
    if (!this.open) return;
    for (let n = 0; n < 3 && this.queue.length; n++) {
      const { kind, id, pic } = this.queue.shift();
      pic.getContext('2d').drawImage(this.thumb(kind, id, 96), 0, 0, 96, 96);
    }
  }
}
