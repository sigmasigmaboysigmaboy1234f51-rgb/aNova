import { FAMILIES, FAMILY_ORDER, VARIANTS, MOB_TYPES } from './mobtypes.js';
import { GUNS, PARTS } from './weapons.js';
import { mulberry32 } from './rng.js';

// Levels, achievements and daily challenges: things to work toward every
// time you play. Everything is stored in the profile.

export function xpForLevel(level) {
  return 150 + level * 75;
}

const bossesBeaten = (p) => Object.keys(p.kills).filter((t) => t.startsWith('boss:')).length;
const storyDone = (p, n) => (p.story.done || 0) >= n;
const stars = (p) => Object.values(p.story.stars || {}).reduce((a, b) => a + b, 0);

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Blood', desc: 'Beat your first mob', coins: 50, goal: 1, get: (p) => p.totals.kills },
  { id: 'hunter', name: 'Mob Hunter', desc: 'Beat 100 mobs', coins: 150, goal: 100, get: (p) => p.totals.kills },
  { id: 'slayer', name: 'Mob Slayer', desc: 'Beat 1,000 mobs', coins: 600, goal: 1000, get: (p) => p.totals.kills },
  { id: 'heads', name: 'Headhunter', desc: 'Land 50 headshots', coins: 200, goal: 50, get: (p) => p.totals.heads },
  { id: 'sharp', name: 'Sharpshooter', desc: 'Land 500 headshots', coins: 600, goal: 500, get: (p) => p.totals.heads },
  { id: 'boss1', name: 'Giant Slayer', desc: 'Beat a boss', coins: 200, goal: 1, get: bossesBeaten },
  { id: 'boss10', name: 'Gym Closed', desc: 'Beat all 10 bosses', coins: 1200, goal: 10, get: bossesBeaten },
  { id: 'seen25', name: 'Mob Spotter', desc: 'Find 25 kinds of mob', coins: 200, goal: 25, get: (p) => p.seen.size },
  { id: 'seenAll', name: 'Mob Encyclopedia', desc: 'Find every mob and boss', coins: 1500, goal: 110, get: (p) => p.seen.size },
  { id: 'wave10', name: 'Holding On', desc: 'Reach wave 10 in Endless', coins: 200, goal: 10, get: (p) => p.totals.bestWave },
  { id: 'wave25', name: 'Unstoppable', desc: 'Reach wave 25 in Endless', coins: 600, goal: 25, get: (p) => p.totals.bestWave },
  { id: 'wave50', name: 'Legend', desc: 'Reach wave 50 in Endless', coins: 1500, goal: 50, get: (p) => p.totals.bestWave },
  { id: 'ch1', name: 'Wide Awake', desc: 'Finish Story chapter 1', coins: 100, goal: 1, get: (p) => (storyDone(p, 1) ? 1 : 0) },
  { id: 'ch5', name: 'Halfway There', desc: 'Finish Story chapter 5', coins: 300, goal: 1, get: (p) => (storyDone(p, 5) ? 1 : 0) },
  { id: 'ch10', name: 'Heartstone Hero', desc: 'Finish the Story', coins: 1000, goal: 1, get: (p) => (storyDone(p, 10) ? 1 : 0) },
  { id: 'stars', name: 'Star Collector', desc: 'Earn all 30 Story stars', coins: 1000, goal: 30, get: stars },
  { id: 'gun1', name: 'Gear Up', desc: 'Buy or unlock a new gun', coins: 100, goal: 3, get: (p) => p.guns.size },
  { id: 'guns', name: 'Full Arsenal', desc: 'Own all 12 guns', coins: 1000, goal: Object.keys(GUNS).length, get: (p) => p.guns.size },
  {
    id: 'legend',
    name: 'Legendary!',
    desc: 'Own a Legendary part',
    coins: 300,
    goal: 1,
    get: (p) => [...p.parts].filter((id) => PARTS[id] && PARTS[id].rarity === 'legendary').length,
  },
  { id: 'tinker', name: 'Tinkerer', desc: 'Own 25 gun parts', coins: 400, goal: 25, get: (p) => [...p.parts].filter((id) => PARTS[id] && PARTS[id].price > 0).length },
  { id: 'crates', name: 'Crate Crusher', desc: 'Open 10 supply crates', coins: 200, goal: 10, get: (p) => p.totals.crates },
  { id: 'builder', name: 'Master Builder', desc: 'Place 500 blocks', coins: 200, goal: 500, get: (p) => p.totals.placed },
  { id: 'rich', name: 'Loaded', desc: 'Have 5,000 coins at once', coins: 300, goal: 5000, get: (p) => p.coins },
  { id: 'vet', name: 'Veteran', desc: 'Reach level 10', coins: 500, goal: 10, get: (p) => p.level },
];

// Daily challenge templates. n is the target; pick picks a family or
// variant so every day feels different.
const DAILY = [
  { id: 'kills', coins: 150, n: [40, 60, 80], text: (n) => `Beat ${n} mobs` },
  { id: 'heads', coins: 150, n: [15, 25, 35], text: (n) => `Land ${n} headshots` },
  { id: 'family', coins: 200, n: [10, 15], pick: 'family', text: (n, k) => `Beat ${n} ${FAMILIES[k].name}s` },
  { id: 'variant', coins: 200, n: [5, 8], pick: 'variant', text: (n, k) => `Beat ${n} ${VARIANTS[k].prefix} mobs` },
  { id: 'wave', coins: 250, n: [8, 10, 12], text: (n) => `Reach wave ${n} in Endless` },
  { id: 'boss', coins: 250, n: [1], text: () => 'Beat a boss' },
  { id: 'crates', coins: 150, n: [3, 5], text: (n) => `Open ${n} supply crates` },
  { id: 'chapter', coins: 250, n: [1], text: () => 'Finish a Story chapter' },
  { id: 'coins', coins: 150, n: [300, 500], text: (n) => `Earn ${n} coins` },
  { id: 'blocks', coins: 100, n: [40, 80], text: (n) => `Place ${n} blocks` },
];

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export class Progress {
  constructor(game) {
    this.game = game;
    this.profile = game.profile;
    this.rollDaily();
  }

  // Three new challenges every day, the same for everyone on that date.
  rollDaily() {
    const p = this.profile;
    const date = today();
    if (p.daily && p.daily.date === date) return;
    let seed = 0;
    for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const rng = mulberry32(seed);
    const pool = [...DAILY];
    const list = [];
    while (list.length < 3 && pool.length) {
      const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      const n = t.n[Math.floor(rng() * t.n.length)];
      let key = null;
      if (t.pick === 'family') key = FAMILY_ORDER[Math.floor(rng() * 5)];
      if (t.pick === 'variant') key = ['frost', 'blaze', 'mini', 'giant', 'armored'][Math.floor(rng() * 5)];
      list.push({ id: t.id, key, n, have: 0, done: false });
    }
    p.daily = { date, list };
    p.scheduleSave();
  }

  dailyText(d) {
    const t = DAILY.find((x) => x.id === d.id);
    return t ? t.text(d.n, d.key) : d.id;
  }

  dailyCoins(d) {
    const t = DAILY.find((x) => x.id === d.id);
    return t ? t.coins : 100;
  }

  // Something happened in the game.
  event(kind, data = {}) {
    const p = this.profile;
    const T = p.totals;
    this.rollDaily();
    let xp = 0;
    if (kind === 'kill') {
      const def = MOB_TYPES[data.type];
      T.kills++;
      if (data.head) T.heads++;
      xp = def ? (def.boss ? 400 : Math.max(5, Math.round(def.score / 10))) : 10;
      this.daily('kills', 1);
      if (data.head) this.daily('heads', 1);
      if (def) {
        this.daily('family', 1, def.family);
        this.daily('variant', 1, def.variant);
        if (def.boss) this.daily('boss', 1);
      }
    } else if (kind === 'wave') {
      T.bestWave = Math.max(T.bestWave, data.n);
      xp = 40 + data.n * 10;
      this.dailyMax('wave', data.n);
    } else if (kind === 'crate') {
      T.crates++;
      this.daily('crates', 1);
    } else if (kind === 'place') {
      T.placed++;
      this.daily('blocks', 1);
    } else if (kind === 'coins') {
      this.daily('coins', data.n);
    } else if (kind === 'goal') {
      xp = 80;
    } else if (kind === 'chapter') {
      xp = data.first ? 400 : 150;
      this.daily('chapter', 1);
    }
    if (xp) this.addXp(xp);
    this.checkAchievements();
    p.scheduleSave();
  }

  daily(id, amount, key = null) {
    const d = this.profile.daily;
    if (!d) return;
    for (const c of d.list) {
      if (c.id !== id || c.done || (c.key && c.key !== key)) continue;
      c.have = Math.min(c.n, c.have + amount);
      if (c.have >= c.n) this.finishDaily(c);
    }
  }

  dailyMax(id, value) {
    const d = this.profile.daily;
    if (!d) return;
    for (const c of d.list) {
      if (c.id !== id || c.done) continue;
      c.have = Math.min(c.n, Math.max(c.have, value));
      if (c.have >= c.n) this.finishDaily(c);
    }
  }

  finishDaily(c) {
    c.done = true;
    const coins = this.dailyCoins(c);
    this.profile.addCoins(coins);
    this.addXp(100);
    this.notify('Daily challenge done!', this.dailyText(c), `+${coins} coins`, '#6fd35a');
  }

  addXp(n) {
    const p = this.profile;
    p.xp += n;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      const coins = 40 * p.level;
      p.addCoins(coins);
      this.notify('Level up!', `Level ${p.level}`, `+${coins} coins`, '#ffd23f');
      this.game.sound.cleared();
    }
  }

  checkAchievements() {
    const p = this.profile;
    for (const a of ACHIEVEMENTS) {
      if (p.ach[a.id]) continue;
      if (a.get(p) >= a.goal) {
        p.ach[a.id] = true;
        p.addCoins(a.coins);
        this.notify('Achievement!', a.name, `${a.desc}. +${a.coins} coins`, '#b46cff');
      }
    }
  }

  notify(label, title, sub, color) {
    this.game.hud.toast(label, title, sub, color);
  }
}
