import { POWERS, POWER_ORDER } from './powerups.js';
import { $ } from './util.js';
import { drawBlockIcon } from './textures.js';
import { BLOCKS } from './world.js';
import { PLACEABLE } from './player.js';
import { gunThumb } from './thumbs.js';
import { drawWebIcon } from './webs.js';

const HEART = ['.11...11.', '1331.1221', '132212221', '122222221', '.1222221.', '..12221..', '...121...', '....1....'];

function heartURL(kind) {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext('2d');
  const full = { 1: '#1f0a08', 2: '#d8392b', 3: '#ff9d8c' };
  const empty = { 1: '#1f0a08', 2: '#4a2c28', 3: '#5a3833' };
  HEART.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const pal = kind === 'full' || (kind === 'half' && x <= 4) ? full : empty;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c.toDataURL();
}

// Little pixel icons drawn from strings, for coins and grenades.
function pixelIcon(rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (!pal[ch]) return;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c.toDataURL();
}

export const COIN_ICON = pixelIcon(['..1111..', '.122221.', '12233221', '12322321', '12322321', '12233221', '.122221.', '..1111..'], {
  1: '#5a3a08',
  2: '#f2c230',
  3: '#fff2a8',
});
const NADE_ICON = pixelIcon(['...33...', '..3..3..', '.111111.', '12222221', '14444441', '12222221', '12222221', '.111111.'], {
  1: '#1a2012',
  2: '#4f6136',
  3: '#bfbfbf',
  4: '#ff7a2f',
});

export class Hud {
  constructor(game) {
    this.game = game;
    const atlas = game.atlas;
    this.root = $('#hud');
    this.hearts = [];
    this.heartImg = { full: heartURL('full'), half: heartURL('half'), empty: heartURL('empty') };
    const hearts = $('#hearts');
    for (let i = 0; i < 10; i++) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = this.heartImg.full;
      img.style.animationDelay = `${-i * 0.07}s`;
      hearts.appendChild(img);
      this.hearts.push(img);
    }
    hearts.setAttribute('role', 'img');
    this.heartsEl = hearts;

    // Hotbar: three gun slots, then four block slots.
    const bar = $('#hotbar');
    this.slots = [];
    for (let i = 0; i < 7; i++) {
      const slot = document.createElement('div');
      slot.className = i < 3 ? 'slot gun-slot' : 'slot';
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      const icon = document.createElement('canvas');
      const count = document.createElement('span');
      count.className = 'count';
      if (i < 3) {
        icon.width = 160;
        icon.height = 80;
      } else {
        const id = PLACEABLE[i - 3];
        icon.width = icon.height = 64;
        drawBlockIcon(icon, atlas.tiles, BLOCKS[id].top, BLOCKS[id].side);
        icon.title = BLOCKS[id].name;
      }
      slot.append(key, icon, count);
      bar.appendChild(slot);
      this.slots.push({ slot, icon, count, code: null });
    }
    // Slot 8: web shooters (only shown in Adventure mode).
    {
      const slot = document.createElement('div');
      slot.className = 'slot web-slot';
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = '8';
      const icon = document.createElement('canvas');
      icon.width = icon.height = 64;
      drawWebIcon(icon);
      icon.title = 'Web Shooters';
      const count = document.createElement('span');
      count.className = 'count';
      slot.append(key, icon, count);
      bar.appendChild(slot);
      this.slots.push({ slot, icon, count, code: null });
    }
    this.slotName = $('#slot-name');

    this.ammoEl = $('#ammo');
    this.ammoCur = $('#ammo-cur');
    this.ammoMax = $('#ammo-max');
    this.ammoFill = $('#ammo-fill');
    this.ammoStatus = $('#ammo-status');
    this.nadeEl = $('#nades');
    $('#nade-icon').src = NADE_ICON;
    $('#coin-icon').src = COIN_ICON;
    this.coinEl = $('#hud-coins');
    this.coinBox = $('#coin-box');
    this.waveEl = $('#hud-wave');
    this.leftEl = $('#hud-left');
    this.scoreEl = $('#hud-score');
    this.bossEl = $('#boss');
    this.bossName = $('#boss-name');
    this.bossFill = $('#boss-fill');
    this.scopeEl = $('#scope');
    this.crossEl = $('#crosshair');
    this.banner = $('#banner');
    this.bannerTitle = $('#banner-title');
    this.bannerSub = $('#banner-sub');
    this.toastEl = $('#toast');
    this.hitEl = $('#hitmarker');
    this.popups = $('#popups');
    this.feedEl = $('#feed');
    this.vignette = $('#vignette');
    this.lowEl = $('#lowhp');
    this.comboEl = $('#combo');
    this.comboN = $('#combo-n');
    this.comboBar = $('#combo-bar');
    this.streakEl = $('#streak');
    this.streakT = 0;
    this.buffsEl = $('#buffs');
    this.buffEls = {};
    this.cache = {};
    this.bannerT = 0;
    this.toastT = 0;
    this.hitT = 0;
    this.vigT = 0;
  }

  show(on) {
    this.root.hidden = !on;
  }

  changed(key, value) {
    if (this.cache[key] === value) return false;
    this.cache[key] = value;
    return true;
  }

  setHealth(hp) {
    if (!this.changed('hp', hp)) return;
    for (let i = 0; i < 10; i++) {
      const v = hp - i * 2;
      const kind = v >= 2 ? 'full' : v === 1 ? 'half' : 'empty';
      if (this.hearts[i].dataset.kind !== kind) {
        this.hearts[i].dataset.kind = kind;
        this.hearts[i].src = this.heartImg[kind];
      }
    }
    this.heartsEl.setAttribute('aria-label', `Health: ${hp / 2} of 10 hearts`);
    this.heartsEl.classList.toggle('low', hp <= 6);
    this.lowEl.classList.toggle('on', hp > 0 && hp <= 6);
  }

  // Everything about what you are holding: hotbar, ammo, blocks, grenades.
  setPlayer(p) {
    const renderer = this.game.renderer;
    for (let i = 0; i < 3; i++) {
      const w = p.weapons[i];
      const s = this.slots[i];
      const code = w ? w.id + '|' + w.code : '';
      if (s.code === code) continue;
      s.code = code;
      const ctx = s.icon.getContext('2d');
      ctx.clearRect(0, 0, s.icon.width, s.icon.height);
      s.slot.classList.toggle('none', !w);
      s.icon.title = w ? w.def.name : 'Empty. Add a gun in the Armory.';
      if (w) ctx.drawImage(gunThumb(renderer, w.id, w.build), 0, 0, s.icon.width, s.icon.height);
      // One new picture per frame keeps gun swaps smooth.
      break;
    }
    if (this.changed('held', p.held)) {
      this.slots.forEach((s, i) => s.slot.classList.toggle('sel', i === p.held));
    }
    const w = p.weapon;
    const webs = p.held === 7;
    const name = w ? w.def.name : webs ? 'Web Shooters' : BLOCKS[PLACEABLE[p.held - 3]].name;
    if (this.changed('name', name)) this.slotName.textContent = name;
    if (this.changed('blocks', p.blocks)) for (let i = 3; i < 7; i++) this.slots[i].count.textContent = String(p.blocks);
    for (let i = 0; i < 3; i++) {
      const wp = p.weapons[i];
      const text = wp ? String(wp.ammo) : '';
      if (this.changed('slotAmmo' + i, text)) this.slots[i].count.textContent = text;
    }
    if (this.changed('nades', p.grenades)) {
      this.nadeEl.textContent = `×${p.grenades}`;
      this.nadeEl.parentElement.classList.toggle('out', p.grenades === 0);
    }

    const reloading = !!w && w.reloadT > 0;
    let cur;
    let max;
    let fill;
    let status;
    if (w) {
      cur = String(w.ammo);
      max = `/${w.stats.mag}`;
      fill = reloading ? w.reloadFrac : w.ammo / w.stats.mag;
      status = reloading ? 'Reloading' : w.stats.proj === 'block' ? `Uses blocks: ${p.blocks} left` : 'R to reload';
    } else if (webs) {
      cur = '∞';
      max = ' web';
      fill = 1;
      status = 'Right: swing / yank · Left: web (hold: blast) · R: zip · Space: glide · N: suit';
    } else {
      cur = String(p.blocks);
      max = ' blocks';
      fill = p.blocks / 99;
      status = 'Right click place · Left click mine';
    }
    if (this.changed('ammoCur', cur)) this.ammoCur.textContent = cur;
    if (this.changed('ammoMax', max)) this.ammoMax.textContent = max;
    const f = Math.round(Math.max(0, Math.min(1, fill)) * 100);
    if (this.changed('ammoFill', f)) this.ammoFill.style.width = `${f}%`;
    if (this.changed('ammoStatus', status)) this.ammoStatus.textContent = status;
    if (this.changed('reloading', reloading)) this.ammoEl.classList.toggle('reloading', reloading);
    if (this.changed('blockMode', !w)) this.ammoEl.classList.toggle('blocks', !w);

    const scoped = p.scoped();
    if (this.changed('scope', scoped)) {
      this.scopeEl.hidden = !scoped;
      this.root.classList.toggle('scoped', scoped);
    }
    // The crosshair opens up as your aim gets shakier.
    const gap = w ? Math.round(Math.min(40, 3 + p.spreadFor(w) * 900)) : 3;
    if (this.changed('gap', gap)) this.crossEl.style.setProperty('--gap', `${gap}px`);
    const aimed = w ? Math.round((1 - p.ads) * 10) / 10 : 1;
    if (this.changed('aimed', aimed)) this.crossEl.style.opacity = String(aimed);
  }

  flashBlocks() {
    for (let i = 3; i < 7; i++) {
      const s = this.slots[i].slot;
      s.classList.remove('empty-flash');
      void s.offsetWidth;
      s.classList.add('empty-flash');
    }
  }

  setCoins(n) {
    if (!this.changed('coins', n)) return;
    const before = this.cache.coinsShown;
    this.coinEl.textContent = n.toLocaleString('en-US');
    if (before !== undefined && n > before) {
      this.coinBox.classList.remove('bump');
      void this.coinBox.offsetWidth;
      this.coinBox.classList.add('bump');
    }
    this.cache.coinsShown = n;
  }

  setBoss(name, frac) {
    const on = frac !== null && frac !== undefined;
    if (this.changed('bossOn', on)) this.bossEl.hidden = !on;
    if (!on) return;
    if (this.changed('bossName', name)) this.bossName.textContent = name;
    const f = Math.round(Math.max(0, frac) * 1000) / 10;
    if (this.changed('bossFill', f)) this.bossFill.style.width = `${f}%`;
  }

  setWave(wave, left) {
    if (this.changed('wave', `Wave ${Math.max(1, wave)}`)) this.waveEl.textContent = `Wave ${Math.max(1, wave)}`;
    const text = left === null ? (wave === 0 ? 'Starting soon' : 'Next wave soon') : left === 1 ? '1 mob left' : `${left} mobs left`;
    if (this.changed('left', text)) this.leftEl.textContent = text;
  }

  setScore(score) {
    if (this.changed('score', score)) this.scoreEl.textContent = score.toLocaleString('en-US');
  }

  hitmarker(head) {
    this.hitEl.classList.toggle('head', !!head);
    this.hitEl.classList.add('show');
    this.hitT = 0.12;
  }

  popup(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls;
    el.textContent = text;
    this.popups.appendChild(el);
    while (this.popups.children.length > 4) this.popups.firstChild.remove();
    setTimeout(() => el.remove(), 1000);
  }

  // The combo counter on the right: how many mobs in a row, and how long
  // until it runs out.
  setCombo(n, frac) {
    const on = n >= 2 && frac > 0;
    if (this.comboEl.hidden === on) this.comboEl.hidden = !on;
    if (!on) return;
    const text = `×${n}`;
    if (this.comboN.textContent !== text) {
      this.comboN.textContent = text;
      this.comboEl.classList.remove('bump');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('bump');
    }
    this.comboBar.style.width = `${Math.round(frac * 100)}%`;
  }

  // Big callouts for kill streaks.
  streak(title, sub) {
    this.streakEl.innerHTML = '';
    const t = document.createElement('b');
    t.textContent = title;
    const s = document.createElement('span');
    s.textContent = sub;
    this.streakEl.append(t, s);
    this.streakEl.hidden = false;
    this.streakEl.classList.remove('in');
    void this.streakEl.offsetWidth;
    this.streakEl.classList.add('in');
    this.streakT = 2.2;
  }

  // Power-ups you have, with a bar that runs down.
  setBuffs(buffs) {
    for (const id of POWER_ORDER) {
      const t = buffs[id] || 0;
      let el = this.buffEls[id];
      if (t <= 0) {
        if (el) el.hidden = true;
        continue;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = 'buff';
        el.style.setProperty('--c', POWERS[id].color);
        const name = document.createElement('span');
        name.textContent = POWERS[id].short;
        const bar = document.createElement('i');
        el.append(name, bar);
        el.bar = bar;
        this.buffsEl.appendChild(el);
        this.buffEls[id] = el;
      }
      el.hidden = false;
      el.bar.style.width = `${Math.round((t / POWERS[id].time) * 100)}%`;
      el.classList.toggle('ending', t < 2.5);
    }
  }

  showBanner(title, sub, time = 2.6) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub || '';
    this.banner.hidden = false;
    this.banner.classList.remove('in');
    void this.banner.offsetWidth;
    this.banner.classList.add('in');
    this.bannerT = time;
  }

  // A card on the right for crate rewards, level ups and achievements.
  // Several at once wait their turn.
  toast(label, title, sub, color) {
    this.toasts = this.toasts || [];
    this.toasts.push([label, title, sub, color]);
    if (this.toastT <= 0) this.nextToast();
  }

  nextToast() {
    const t = this.toasts.shift();
    if (!t) return;
    const [label, title, sub, color] = t;
    const el = this.toastEl;
    el.querySelector('.toast-label').textContent = label;
    el.querySelector('.toast-title').textContent = title;
    el.querySelector('.toast-sub').textContent = sub || '';
    el.style.setProperty('--rarity', color || 'var(--gold)');
    el.hidden = false;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    this.toastT = 3.2;
  }

  // A short line in the kill feed on the right.
  feed(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'feed-line ' + cls;
    el.textContent = text;
    this.feedEl.appendChild(el);
    while (this.feedEl.children.length > 5) this.feedEl.firstChild.remove();
    setTimeout(() => el.classList.add('old'), 5000);
    setTimeout(() => el.remove(), 5600);
  }

  // Story mode's top-left: chapter name and what to do right now.
  setObjective(title, line) {
    if (this.changed('wave', title)) this.waveEl.textContent = title;
    if (this.changed('left', line)) this.leftEl.textContent = line;
  }

  damage() {
    this.vignette.classList.add('on');
    this.vigT = 0.12;
  }

  reset() {
    const keep = this.cache.coinsShown;
    this.cache = { coinsShown: keep };
    for (const s of this.slots) s.code = null;
    this.banner.hidden = true;
    this.bossEl.hidden = true;
    this.scopeEl.hidden = true;
    this.root.classList.remove('scoped');
    this.popups.textContent = '';
    this.feedEl.textContent = '';
    this.vignette.classList.remove('on');
  }

  tick(dt) {
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.hitEl.classList.remove('show');
    }
    if (this.vigT > 0) {
      this.vigT -= dt;
      if (this.vigT <= 0) this.vignette.classList.remove('on');
    }
    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) this.streakEl.hidden = true;
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.hidden = true;
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toastEl.hidden = true;
        this.nextToast();
      }
    }
  }
}
