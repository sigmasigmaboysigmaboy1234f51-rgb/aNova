import { GUNS, PARTS, cleanBuild, defaultBuild } from './weapons.js';
import { store } from './util.js';

// Everything you keep between runs: coins, what you own, how each gun is
// built, and which three guns you carry.

const START_COINS = 250;

export class Profile {
  constructor() {
    let data = null;
    try {
      data = JSON.parse(store.get('profile', 'null'));
    } catch {
      data = null;
    }
    this.coins = data && Number.isFinite(data.coins) ? data.coins : START_COINS;
    this.guns = new Set((data && data.guns) || []);
    this.parts = new Set((data && data.parts) || []);
    this.builds = {};
    this.loadout = (data && data.loadout) || ['ember', 'spark', null];
    for (const id of ['ember', 'spark']) this.grantGun(id);
    for (const id of this.guns) this.builds[id] = cleanBuild(id, data && data.builds ? data.builds[id] : null);
    this.loadout = [0, 1, 2].map((i) => (this.loadout[i] && this.guns.has(this.loadout[i]) ? this.loadout[i] : null));
    if (!this.loadout[0]) this.loadout[0] = 'ember';
    // The bestiary: mobs you have met, and how many of each you beat.
    this.seen = new Set((data && data.seen) || []);
    this.kills = (data && data.kills) || {};
    // Levels, achievements, daily challenges and story progress.
    this.xp = (data && data.xp) || 0;
    this.level = (data && data.level) || 1;
    this.ach = (data && data.ach) || {};
    this.totals = { kills: 0, heads: 0, bestWave: 0, crates: 0, placed: 0, ...((data && data.totals) || {}) };
    this.daily = (data && data.daily) || null;
    this.story = { done: 0, stars: {}, ...((data && data.story) || {}) };
    // Cosmetics: owned ids like "hat:crown", and what you are wearing.
    this.cos = new Set((data && data.cos) || []);
    this.style = { hat: null, cape: null, pet: null, fx: null, ...((data && data.style) || {}) };
    for (const k of Object.keys(this.style)) if (this.style[k] && !this.cos.has(`${k}:${this.style[k]}`)) this.style[k] = null;
    // Extras: mastery kills per gun, the lucky wheel, and settings.
    this.gunKills = (data && data.gunKills) || {};
    this.wheel = (data && data.wheel) || null;
    // Adventure mode: jobs done, golden cubes found, people met.
    const adv = (data && data.adv) || {};
    this.adv = { done: { ...(adv.done || {}) }, cubes: Array.isArray(adv.cubes) ? adv.cubes.filter(Number.isInteger) : [], met: { ...(adv.met || {}) }, crimes: Math.max(0, Math.floor(Number(adv.crimes) || 0)) };
    this.listeners = new Set();
    this.saveTimer = 0;
  }

  markSeen(type) {
    if (this.seen.has(type)) return false;
    this.seen.add(type);
    this.scheduleSave();
    return true;
  }

  addKill(type) {
    this.seen.add(type);
    this.kills[type] = (this.kills[type] || 0) + 1;
    this.scheduleSave();
  }

  // Owning a gun also gives you the parts it comes with.
  grantGun(id) {
    if (!GUNS[id]) return;
    this.guns.add(id);
    for (const pid of Object.values(defaultBuild(id))) this.parts.add(pid);
    if (!this.builds[id]) this.builds[id] = defaultBuild(id);
  }

  ownsPart(pid) {
    return PARTS[pid] && ((PARTS[pid].price === 0 && !PARTS[pid].unlock) || this.parts.has(pid));
  }

  addCoins(n) {
    this.coins = Math.max(0, Math.round(this.coins + n));
    this.changed();
  }

  buyGun(id) {
    const g = GUNS[id];
    if (!g || this.guns.has(id) || this.coins < g.price) return false;
    this.coins -= g.price;
    this.grantGun(id);
    const empty = this.loadout.indexOf(null);
    if (empty >= 0) this.loadout[empty] = id;
    this.changed();
    return true;
  }

  buyPart(pid) {
    const p = PARTS[pid];
    if (!p || this.ownsPart(pid) || this.coins < p.price) return false;
    this.coins -= p.price;
    this.parts.add(pid);
    this.changed();
    return true;
  }

  // Found in a crate. Returns false if you already had it.
  givePart(pid) {
    if (this.ownsPart(pid)) return false;
    this.parts.add(pid);
    this.changed();
    return true;
  }

  install(gunId, pid) {
    const p = PARTS[pid];
    if (!this.guns.has(gunId) || !p || !this.ownsPart(pid) || !GUNS[gunId].slots.includes(p.slot)) return false;
    this.builds[gunId] = { ...this.builds[gunId], [p.slot]: pid };
    this.changed();
    return true;
  }

  equip(gunId, slot) {
    if (!this.guns.has(gunId)) return;
    const was = this.loadout.indexOf(gunId);
    if (was >= 0) this.loadout[was] = this.loadout[slot];
    this.loadout[slot] = gunId;
    if (!this.loadout[0]) {
      const i = this.loadout.findIndex(Boolean);
      this.loadout[0] = i > 0 ? this.loadout[i] : 'ember';
      if (i > 0) this.loadout[i] = null;
    }
    this.changed();
  }

  unequip(slot) {
    if (slot === 0) return;
    this.loadout[slot] = null;
    this.changed();
  }

  ownsCos(kind, id) {
    return this.cos.has(`${kind}:${id}`);
  }

  buyCos(kind, id, price) {
    if (this.ownsCos(kind, id) || this.coins < price) return false;
    this.coins -= price;
    this.cos.add(`${kind}:${id}`);
    this.style[kind] = id;
    this.changed();
    return true;
  }

  // Found in a crate or on the wheel. Returns false if you already had it.
  giveCos(kind, id) {
    if (this.ownsCos(kind, id)) return false;
    this.cos.add(`${kind}:${id}`);
    this.changed();
    return true;
  }

  wear(kind, id) {
    if (id && !this.ownsCos(kind, id)) return;
    this.style = { ...this.style, [kind]: id || null };
    this.changed();
  }

  // A short string other players can use to dress you: hat,cape,pet,fx.
  styleCode() {
    const s = this.style;
    return [s.hat, s.cape, s.pet, s.fx].map((v) => v || '').join(',');
  }

  changed() {
    for (const fn of this.listeners) fn();
    this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 400);
  }

  save() {
    store.set(
      'profile',
      JSON.stringify({
        coins: this.coins,
        guns: [...this.guns],
        parts: [...this.parts],
        builds: this.builds,
        loadout: this.loadout,
        seen: [...this.seen],
        kills: this.kills,
        xp: this.xp,
        level: this.level,
        ach: this.ach,
        totals: this.totals,
        daily: this.daily,
        story: this.story,
        cos: [...this.cos],
        style: this.style,
        gunKills: this.gunKills,
        wheel: this.wheel,
        adv: this.adv,
      }),
    );
  }
}
