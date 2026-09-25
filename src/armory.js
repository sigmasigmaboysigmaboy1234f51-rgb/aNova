import * as THREE from 'three';
import { $ } from './util.js';
import { buildGun } from './gun.js';
import { gunThumb } from './thumbs.js';
import { COIN_ICON } from './hud.js';
import { MASTERY, masteryTier } from './progress.js';
import { GUNS, GUN_ORDER, PARTS, RARITY, SLOTS, partsForSlot, gunStats, statBars } from './weapons.js';

// The Armory: buy guns, buy and fit parts, and pick the three guns you
// carry. The gun on the stand is the real in-game model, rebuilt every
// time a part changes.

const pct = (v) => Math.round(Math.abs(v - 1) * 100);

// Plain-words summary of what a part does.
export function describeMods(m) {
  const out = [];
  if (m.dmg) out.push(`${m.dmg > 1 ? '+' : '−'}${pct(m.dmg)}% damage`);
  if (m.gap) out.push(`fires ${pct(m.gap)}% ${m.gap < 1 ? 'faster' : 'slower'}`);
  if (m.pellets) out.push(`+${m.pellets} bullet per shot`);
  if (m.mag) out.push(`${m.mag > 1 ? '+' : '−'}${pct(m.mag)}% ammo`);
  if (m.reload) out.push(`reloads ${pct(m.reload)}% ${m.reload < 1 ? 'faster' : 'slower'}`);
  if (m.spread) out.push(m.spread < 1 ? `${pct(m.spread)}% tighter aim` : `${pct(m.spread)}% more spray`);
  if (m.range) out.push(`${m.range > 1 ? '+' : '−'}${pct(m.range)}% range`);
  if (m.recoil) out.push(m.recoil < 1 ? `${pct(m.recoil)}% less kick` : `${pct(m.recoil)}% more kick`);
  if (m.mobility) out.push(`${m.mobility > 0 ? '+' : '−'}${Math.round(Math.abs(m.mobility) * 100)}% move speed`);
  if (m.zoom) out.push(`${m.zoom}x zoom`);
  if (m.hip) out.push('much better hip fire');
  if (m.burn) out.push('sets mobs on fire');
  if (m.slow) out.push('slows mobs down');
  if (m.chain) out.push(`lightning jumps to ${m.chain} more mobs`);
  if (m.splash) out.push('shots explode');
  if (m.leech) out.push(`heals you ${Math.round(m.leech * 100)}% of damage`);
  if (m.quiet) out.push('silent');
  if (m.noFlash) out.push('no muzzle flash');
  if (m.bipod) out.push('rock steady when crouched');
  return out.length ? out.join(', ') : 'No stat changes. Just looks.';
}

export class Armory {
  constructor(game) {
    this.game = game;
    this.profile = game.profile;
    this.el = $('#armory');
    this.gunList = $('#arm-guns');
    this.slotTabs = $('#arm-slots');
    this.partList = $('#arm-parts');
    this.statsEl = $('#arm-stats');
    this.loadoutEl = $('#arm-loadout');
    this.stage = $('#arm-stage');
    this.gunId = this.profile.loadout[0] || 'ember';
    this.slot = null;
    this.hoverPart = null;
    this.open = false;
    $('#arm-coin-icon').src = COIN_ICON;
    $('#arm-done').addEventListener('click', () => game.closeArmory());
    $('#arm-buy').addEventListener('click', () => this.buyGun());
    for (const b of document.querySelectorAll('#arm-carry button')) {
      b.addEventListener('click', () => this.carry(Number(b.dataset.slot)));
    }
    this.profile.listeners.add(() => {
      if (this.open) this.render();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'KeyB') {
        e.preventDefault();
        game.closeArmory();
      }
    });
  }

  // --- 3D stand ----------------------------------------------------------

  setupStage() {
    if (this.renderer) return;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'arm-canvas';
    this.canvas.setAttribute('aria-label', 'Your gun. Drag to spin it.');
    this.stage.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xf4f0ff, 0x5a4a3a, 2.4));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2);
    sun.position.set(2, 3, 2);
    this.scene.add(sun);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.yaw = -1.1;
    this.spinVel = 0;
    let dragging = false;
    let lastX = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.yaw += dx * 0.012;
      this.spinVel = dx * 0.6;
    });
    this.canvas.addEventListener('pointerup', () => (dragging = false));
    this.canvas.addEventListener('pointercancel', () => (dragging = false));
    this.dragging = () => dragging;
  }

  showGun() {
    if (this.model) {
      this.pivot.remove(this.model);
      this.model.userData.dispose();
    }
    const build = this.previewBuild();
    this.model = buildGun(this.gunId, build);
    const u = this.model.userData;
    if (u.laser) u.laser.visible = true;
    const box = new THREE.Box3();
    if (u.laser) this.model.remove(u.laser);
    this.model.remove(u.flash);
    box.setFromObject(this.model);
    if (u.laser) this.model.add(u.laser);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.model.position.sub(c);
    this.pivot.add(this.model);
    this.span = Math.max(size.z, size.y * 2.2, 0.35);
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.lastH !== h) {
      this.renderer.setSize(w, h, false);
      this.lastH = h;
    }
    this.cam.aspect = w / h;
    const fit = (this.span / 2 / Math.tan((this.cam.fov * Math.PI) / 360)) * Math.max(1, 1.25 / this.cam.aspect) * 1.25;
    this.cam.position.set(0, fit * 0.28, fit);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix();
  }

  frame(dt) {
    if (!this.open || !this.renderer) return;
    if (!this.dragging()) {
      this.spinVel *= Math.exp(-3 * dt);
      const auto = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.35;
      this.yaw += (auto + this.spinVel * 0.05) * dt;
    }
    this.pivot.rotation.set(0.12, this.yaw, 0);
    this.resize();
    this.renderer.render(this.scene, this.cam);
  }

  // --- Open / close ------------------------------------------------------

  show() {
    this.open = true;
    this.el.hidden = false;
    this.setupStage();
    if (!this.profile.guns.has(this.gunId) && !GUNS[this.gunId]) this.gunId = 'ember';
    this.render();
    $('#arm-done').focus();
  }

  hide() {
    this.open = false;
    this.el.hidden = true;
  }

  previewBuild() {
    const b = { ...(this.profile.builds[this.gunId] || {}) };
    if (this.hoverPart) b[this.hoverPart.slot] = this.hoverPart.id;
    return b;
  }

  // --- Actions -------------------------------------------------------------

  selectGun(id) {
    this.gunId = id;
    this.hoverPart = null;
    if (!GUNS[id].slots.includes(this.slot)) this.slot = null;
    this.render();
  }

  buyGun() {
    const g = GUNS[this.gunId];
    if (this.profile.buyGun(this.gunId)) {
      this.game.sound.buy();
      this.flash(`Bought the ${g.name}!`);
    } else {
      this.game.sound.empty();
    }
  }

  carry(slot) {
    if (!this.profile.guns.has(this.gunId)) return;
    if (this.profile.loadout[slot] === this.gunId && slot > 0) this.profile.unequip(slot);
    else this.profile.equip(this.gunId, slot);
    this.game.sound.equip();
  }

  pickPart(pid) {
    const p = PARTS[pid];
    const prof = this.profile;
    if (!prof.guns.has(this.gunId)) {
      this.flash('Buy this gun first.');
      this.game.sound.empty();
      return;
    }
    if (!prof.ownsPart(pid) && p.unlock) {
      this.flash(`Beat ${p.unlock} mobs with one gun to unlock ${p.name}.`);
      this.game.sound.empty();
      return;
    }
    if (!prof.ownsPart(pid)) {
      if (!prof.buyPart(pid)) {
        this.flash(`You need ${(p.price - prof.coins).toLocaleString('en-US')} more coins.`);
        this.game.sound.empty();
        return;
      }
      this.game.sound.buy();
    } else {
      this.game.sound.equip();
    }
    prof.install(this.gunId, pid);
  }

  flash(text) {
    const el = $('#arm-msg');
    el.textContent = text;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
  }

  // --- Drawing -------------------------------------------------------------

  render() {
    const prof = this.profile;
    $('#arm-coins').textContent = prof.coins.toLocaleString('en-US');
    this.renderGuns();
    this.renderInfo();
    this.renderSlots();
    this.renderParts();
    this.renderLoadout();
    this.showGun();
  }

  renderGuns() {
    const prof = this.profile;
    const r = this.game.renderer;
    this.gunList.textContent = '';
    for (const id of GUN_ORDER) {
      const g = GUNS[id];
      const owned = prof.guns.has(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arm-gun';
      b.setAttribute('aria-pressed', String(id === this.gunId));
      if (!owned) b.classList.add('locked');
      const pic = document.createElement('canvas');
      pic.width = 160;
      pic.height = 80;
      pic.getContext('2d').drawImage(gunThumb(r, id, owned ? prof.builds[id] : null), 0, 0, 160, 80);
      const name = document.createElement('span');
      name.className = 'arm-gun-name';
      name.textContent = g.name;
      const tag = document.createElement('span');
      tag.className = 'arm-gun-tag';
      const slot = prof.loadout.indexOf(id);
      if (slot >= 0) tag.textContent = `Slot ${slot + 1}`;
      else if (owned) tag.textContent = g.kind;
      else {
        const coin = document.createElement('img');
        coin.src = COIN_ICON;
        coin.alt = '';
        tag.append(coin, g.price.toLocaleString('en-US'));
        if (prof.coins < g.price) tag.classList.add('poor');
      }
      if (slot >= 0) b.classList.add('carried');
      b.append(pic, name, tag);
      b.addEventListener('click', () => this.selectGun(id));
      this.gunList.appendChild(b);
    }
  }

  renderInfo() {
    const prof = this.profile;
    const g = GUNS[this.gunId];
    const owned = prof.guns.has(this.gunId);
    $('#arm-name').textContent = g.name;
    $('#arm-kind').textContent = g.kind;
    $('#arm-desc').textContent = g.desc;
    const kills = prof.gunKills[this.gunId] || 0;
    const tier = masteryTier(kills);
    const nextTier = MASTERY.find((t) => t.n > kills);
    $('#arm-mastery').textContent = `Mastery: ${tier ? tier.name : 'Rookie'}, ${kills.toLocaleString('en-US')} kills` + (nextTier ? `. ${nextTier.name} at ${nextTier.n}` : '. Maxed out!');
    const buy = $('#arm-buy');
    buy.hidden = owned;
    if (!owned) {
      buy.textContent = prof.coins >= g.price ? `Buy for ${g.price.toLocaleString('en-US')} coins` : `Need ${g.price.toLocaleString('en-US')} coins`;
      buy.disabled = prof.coins < g.price;
    }
    const carry = $('#arm-carry');
    carry.hidden = !owned;
    for (const b of carry.querySelectorAll('button')) {
      const i = Number(b.dataset.slot);
      const here = prof.loadout[i] === this.gunId;
      b.setAttribute('aria-pressed', String(here));
      b.textContent = here ? (i > 0 ? `In slot ${i + 1} (remove)` : 'In slot 1') : `Carry in slot ${i + 1}`;
    }

    const base = statBars(gunStats(this.gunId, prof.builds[this.gunId]));
    const next = this.hoverPart ? statBars(gunStats(this.gunId, this.previewBuild())) : base;
    this.statsEl.textContent = '';
    base.forEach((st, i) => {
      const n = next[i];
      const row = document.createElement('div');
      row.className = 'arm-stat';
      const label = document.createElement('span');
      label.textContent = st.name;
      const bar = document.createElement('span');
      bar.className = 'arm-bar';
      const fill = document.createElement('i');
      const lo = Math.min(st.v, n.v);
      const hi = Math.max(st.v, n.v);
      fill.style.width = `${lo * 100}%`;
      bar.appendChild(fill);
      if (hi - lo > 0.004) {
        const d = document.createElement('b');
        d.className = n.v > st.v ? 'up' : 'down';
        d.style.left = `${lo * 100}%`;
        d.style.width = `${(hi - lo) * 100}%`;
        bar.appendChild(d);
      }
      const val = document.createElement('span');
      val.className = 'arm-val';
      val.textContent = n.text;
      if (n.text !== st.text) val.classList.add(n.v > st.v ? 'up' : 'down');
      row.append(label, bar, val);
      this.statsEl.appendChild(row);
    });
  }

  renderSlots() {
    const g = GUNS[this.gunId];
    if (!this.slot || !g.slots.includes(this.slot)) this.slot = g.slots[0];
    this.slotTabs.textContent = '';
    for (const s of SLOTS) {
      if (!g.slots.includes(s.id)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn';
      b.textContent = s.name;
      b.setAttribute('aria-pressed', String(s.id === this.slot));
      b.addEventListener('click', () => {
        this.slot = s.id;
        this.hoverPart = null;
        this.renderSlots();
        this.renderParts();
      });
      this.slotTabs.appendChild(b);
    }
  }

  renderParts() {
    const prof = this.profile;
    const owned = prof.guns.has(this.gunId);
    const build = prof.builds[this.gunId] || {};
    this.partList.textContent = '';
    for (const p of partsForSlot(this.slot)) {
      const have = prof.ownsPart(p.id);
      const on = owned && build[p.slot] === p.id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arm-part';
      b.style.setProperty('--rarity', RARITY[p.rarity].color);
      b.setAttribute('aria-pressed', String(on));
      const top = document.createElement('span');
      top.className = 'arm-part-top';
      const name = document.createElement('span');
      name.className = 'arm-part-name';
      name.textContent = p.name;
      const state = document.createElement('span');
      state.className = 'arm-part-state';
      if (on) state.textContent = 'Fitted';
      else if (have) state.textContent = 'Fit';
      else if (p.unlock) state.textContent = `🔒 ${p.unlock} kills`;
      else {
        const coin = document.createElement('img');
        coin.src = COIN_ICON;
        coin.alt = '';
        state.append(coin, p.price.toLocaleString('en-US'));
        if (prof.coins < p.price) state.classList.add('poor');
      }
      top.append(name, state);
      const rar = document.createElement('span');
      rar.className = 'arm-part-rarity';
      rar.textContent = RARITY[p.rarity].name;
      const desc = document.createElement('span');
      desc.className = 'arm-part-desc';
      desc.textContent = `${p.desc} ${describeMods(p.mods)}.`;
      b.append(top, rar, desc);
      const preview = () => {
        if (this.hoverPart === p) return;
        this.hoverPart = p;
        this.renderInfo();
        this.showGun();
      };
      const unpreview = () => {
        if (this.hoverPart !== p) return;
        this.hoverPart = null;
        this.renderInfo();
        this.showGun();
      };
      b.addEventListener('pointerenter', preview);
      b.addEventListener('focus', preview);
      b.addEventListener('pointerleave', unpreview);
      b.addEventListener('blur', unpreview);
      b.addEventListener('click', () => {
        this.hoverPart = null;
        this.pickPart(p.id);
      });
      this.partList.appendChild(b);
    }
  }

  renderLoadout() {
    const prof = this.profile;
    const r = this.game.renderer;
    this.loadoutEl.textContent = '';
    prof.loadout.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arm-carried';
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      const pic = document.createElement('canvas');
      pic.width = 160;
      pic.height = 80;
      if (id) pic.getContext('2d').drawImage(gunThumb(r, id, prof.builds[id]), 0, 0, 160, 80);
      const name = document.createElement('span');
      name.textContent = id ? GUNS[id].name : 'Empty';
      if (!id) b.classList.add('empty');
      b.append(key, pic, name);
      b.addEventListener('click', () => {
        if (id) this.selectGun(id);
      });
      this.loadoutEl.appendChild(b);
    });
  }
}
