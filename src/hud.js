import { $ } from './util.js';
import { drawBlockIcon } from './textures.js';
import { BLOCKS } from './world.js';
import { PLACEABLE, MAG } from './player.js';

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

export class Hud {
  constructor(atlas) {
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

    const bar = $('#hotbar');
    this.slots = PLACEABLE.map((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      const icon = document.createElement('canvas');
      icon.width = icon.height = 64;
      drawBlockIcon(icon, atlas.tiles, BLOCKS[id].top, BLOCKS[id].side);
      icon.title = BLOCKS[id].name;
      const count = document.createElement('span');
      count.className = 'count';
      slot.append(key, icon, count);
      bar.appendChild(slot);
      return { slot, count };
    });
    this.slotName = $('#slot-name');

    const pips = $('#ammo-pips');
    this.pips = [];
    for (let i = 0; i < MAG; i++) {
      const pip = document.createElement('i');
      pips.appendChild(pip);
      this.pips.push(pip);
    }
    this.ammoEl = $('#ammo');
    this.ammoCur = $('#ammo-cur');
    this.ammoStatus = $('#ammo-status');
    this.waveEl = $('#hud-wave');
    this.leftEl = $('#hud-left');
    this.scoreEl = $('#hud-score');
    this.banner = $('#banner');
    this.bannerTitle = $('#banner-title');
    this.bannerSub = $('#banner-sub');
    this.hitEl = $('#hitmarker');
    this.popups = $('#popups');
    this.vignette = $('#vignette');
    this.lowEl = $('#lowhp');
    this.cache = {};
    this.bannerT = 0;
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

  setAmmo(ammo, reloadFrac) {
    const reloading = reloadFrac > 0;
    if (this.changed('ammo', ammo)) {
      this.ammoCur.textContent = String(ammo);
      this.pips.forEach((pip, i) => pip.classList.toggle('spent', i >= ammo));
    }
    if (this.changed('reloading', reloading)) {
      this.ammoEl.classList.toggle('reloading', reloading);
      this.ammoStatus.textContent = reloading ? 'Reloading' : 'R to reload';
    }
  }

  setBlocks(count, slot) {
    if (this.changed('slot', slot)) {
      this.slots.forEach((s, i) => s.slot.classList.toggle('sel', i === slot));
      this.slotName.textContent = BLOCKS[PLACEABLE[slot]].name;
    }
    if (this.changed('blocks', count)) {
      this.slots.forEach((s) => (s.count.textContent = String(count)));
    }
  }

  flashBlocks() {
    this.slots.forEach((s) => {
      s.slot.classList.remove('empty-flash');
      void s.slot.offsetWidth;
      s.slot.classList.add('empty-flash');
    });
  }

  setWave(wave, left) {
    if (this.changed('wave', wave)) this.waveEl.textContent = `Wave ${Math.max(1, wave)}`;
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

  showBanner(title, sub, time = 2.6) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub || '';
    this.banner.hidden = false;
    this.banner.classList.remove('in');
    void this.banner.offsetWidth;
    this.banner.classList.add('in');
    this.bannerT = time;
  }

  damage() {
    this.vignette.classList.add('on');
    this.vigT = 0.12;
  }

  reset() {
    this.cache = {};
    this.banner.hidden = true;
    this.popups.textContent = '';
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
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.hidden = true;
    }
  }
}
