// Every gun and every part, and the numbers that make them feel different.
//
// Gun stats:
//   dmg     damage per bullet (pellet)        gap     seconds between shots
//   mag     shots per magazine                reload  seconds to reload
//   spread  aim wobble in radians (hip fire)  range   blocks before a shot fizzles
//   recoil  how hard the view kicks           mobility  move speed multiplier
//   mode    'semi' | 'auto' | 'beam' | 'spin'
//   pellets bullets per shot   head  headshot multiplier   pierce  extra mobs a shot passes through
//   proj    'bolt' | 'grenade' | 'block' for guns that fire something you can see fly
//   burn    fire damage per second   slow  how much it slows (0..1)
//   chain   extra mobs lightning jumps to   splash  explosion radius   breaks  explosions break blocks
//   leech   share of damage returned as health   spinUp  seconds for a minigun to spin up

export const RARITY = {
  common: { name: 'Common', color: '#bdb5a4', weight: 50 },
  rare: { name: 'Rare', color: '#4aa3ff', weight: 30 },
  epic: { name: 'Epic', color: '#b46cff', weight: 15 },
  legendary: { name: 'Legendary', color: '#ffc93f', weight: 5 },
};

export const SLOTS = [
  { id: 'barrel', name: 'Barrel' },
  { id: 'muzzle', name: 'Muzzle' },
  { id: 'sight', name: 'Sight' },
  { id: 'mag', name: 'Magazine' },
  { id: 'stock', name: 'Stock' },
  { id: 'under', name: 'Underbarrel' },
  { id: 'core', name: 'Core' },
  { id: 'paint', name: 'Paint' },
];

const ALL = SLOTS.map((s) => s.id);
const BASE = { pellets: 1, head: 2.25, pierce: 0, mobility: 1, recoil: 1, range: 80, zoom: 1.15, ads: 0.6, hip: 1 };

export const GUNS = {
  ember: {
    name: 'Ember Blaster',
    kind: 'Rifle',
    price: 0,
    frame: 'rifle',
    slots: ALL,
    desc: 'Full-auto energy rifle. Good at everything.',
    stats: { dmg: 4, gap: 0.13, mag: 16, reload: 1.1, spread: 0.006, range: 90, mode: 'auto' },
    defaults: { barrel: 'standard', muzzle: 'brake', sight: 'reddot', mag: 'standard', stock: 'skeleton', under: 'foregrip', core: 'ember', paint: 'steel' },
  },
  spark: {
    name: 'Spark Pistol',
    kind: 'Pistol',
    price: 0,
    frame: 'pistol',
    slots: ['barrel', 'muzzle', 'sight', 'mag', 'under', 'core', 'paint'],
    desc: 'Snappy sidearm. Quick to reload, quick to switch to.',
    stats: { dmg: 5, gap: 0.18, mag: 10, reload: 0.8, spread: 0.004, range: 70, recoil: 0.8, mode: 'semi', mobility: 1.06 },
    defaults: { barrel: 'standard', muzzle: 'none', sight: 'iron', mag: 'standard', under: 'none', core: 'ember', paint: 'gunmetal' },
  },
  buzz: {
    name: 'Buzz SMG',
    kind: 'SMG',
    price: 300,
    frame: 'smg',
    slots: ALL,
    desc: 'Sprays a storm of little bolts. Best up close.',
    stats: { dmg: 2.4, gap: 0.065, mag: 32, reload: 1.3, spread: 0.02, range: 55, recoil: 0.55, mode: 'auto', mobility: 1.08 },
    defaults: { barrel: 'short', muzzle: 'none', sight: 'iron', mag: 'standard', stock: 'skeleton', under: 'none', core: 'ember', paint: 'gunmetal' },
  },
  scatter: {
    name: 'Scatter Cannon',
    kind: 'Shotgun',
    price: 450,
    frame: 'shotgun',
    slots: ALL,
    desc: 'Nine pellets per blast. Deletes anything in arm’s reach.',
    stats: { dmg: 2.3, pellets: 9, gap: 0.75, mag: 6, reload: 1.8, spread: 0.075, range: 32, recoil: 2.6, mode: 'semi', head: 1.6 },
    defaults: { barrel: 'standard', muzzle: 'none', sight: 'iron', mag: 'standard', stock: 'standard', under: 'none', core: 'ember', paint: 'steel' },
  },
  longshot: {
    name: 'Longshot Rail',
    kind: 'Sniper',
    price: 800,
    frame: 'sniper',
    slots: ALL,
    desc: 'Punches through three mobs in a row. Aim with right click.',
    stats: { dmg: 16, gap: 1, mag: 4, reload: 2, spread: 0.0008, hip: 40, range: 160, recoil: 3.5, mode: 'semi', pierce: 3, mobility: 0.92, head: 2.5 },
    defaults: { barrel: 'long', muzzle: 'compensator', sight: 'scope4', mag: 'standard', stock: 'heavy', under: 'bipod', core: 'ember', paint: 'gunmetal' },
  },
  crossbolt: {
    name: 'Crossbolt',
    kind: 'Crossbow',
    price: 500,
    frame: 'crossbow',
    slots: ['sight', 'stock', 'under', 'core', 'paint'],
    desc: 'Silent bolts that drop with distance. Headshots hit extra hard.',
    stats: { dmg: 13, gap: 0.2, mag: 1, reload: 0.9, spread: 0.001, range: 90, recoil: 0.6, mode: 'semi', proj: 'bolt', speed: 55, head: 3, quiet: true },
    defaults: { sight: 'iron', stock: 'standard', under: 'none', core: 'ember', paint: 'desert' },
  },
  flare: {
    name: 'Flare Revolver',
    kind: 'Revolver',
    price: 600,
    frame: 'revolver',
    slots: ['barrel', 'sight', 'core', 'paint'],
    desc: 'Six heavy rounds that set mobs on fire.',
    stats: { dmg: 8, gap: 0.33, mag: 6, reload: 1.6, spread: 0.003, range: 75, recoil: 2, mode: 'semi' },
    defaults: { barrel: 'standard', sight: 'iron', core: 'inferno', paint: 'gunmetal' },
  },
  frost: {
    name: 'Frost Ray',
    kind: 'Beam',
    price: 900,
    frame: 'beam',
    slots: ['sight', 'mag', 'stock', 'under', 'core', 'paint'],
    desc: 'A freezing beam. Hold it on mobs to slow them to a crawl.',
    stats: { dmg: 1.1, gap: 0.06, mag: 80, reload: 1.8, spread: 0, range: 26, recoil: 0.05, mode: 'beam', head: 1.5 },
    defaults: { sight: 'iron', mag: 'standard', stock: 'none', under: 'none', core: 'frost', paint: 'steel' },
  },
  tesla: {
    name: 'Tesla Coil',
    kind: 'Shock',
    price: 1100,
    frame: 'tesla',
    slots: ['sight', 'mag', 'stock', 'under', 'core', 'paint'],
    desc: 'Lightning that jumps to three more mobs.',
    stats: { dmg: 5, gap: 0.45, mag: 8, reload: 1.6, spread: 0.002, range: 45, recoil: 1.2, mode: 'semi', chain: 3 },
    defaults: { sight: 'reddot', mag: 'standard', stock: 'standard', under: 'none', core: 'shock', paint: 'steel' },
  },
  boom: {
    name: 'Boomstick',
    kind: 'Launcher',
    price: 1200,
    frame: 'launcher',
    slots: ['sight', 'mag', 'stock', 'under', 'core', 'paint'],
    desc: 'Lobs grenades that blow mobs and blocks sky high.',
    stats: { dmg: 14, gap: 0.8, mag: 4, reload: 2.2, spread: 0.003, range: 60, recoil: 3, mode: 'semi', proj: 'grenade', speed: 24, splash: 3.2, breaks: true, mobility: 0.95, head: 1 },
    defaults: { sight: 'iron', mag: 'standard', stock: 'standard', under: 'none', core: 'blast', paint: 'desert' },
  },
  mill: {
    name: 'Brick Mill',
    kind: 'Minigun',
    price: 1500,
    frame: 'minigun',
    slots: ['sight', 'mag', 'core', 'paint'],
    desc: 'Spins up, then never stops. Slows you down while you hold it.',
    stats: { dmg: 2.2, gap: 0.045, mag: 120, reload: 3, spread: 0.022, range: 70, recoil: 0.35, mode: 'spin', spinUp: 0.6, mobility: 0.8 },
    defaults: { sight: 'iron', mag: 'standard', core: 'ember', paint: 'gunmetal' },
  },
  builder: {
    name: 'Block Launcher',
    kind: 'Tool',
    price: 350,
    frame: 'builder',
    slots: ['sight', 'mag', 'stock', 'paint'],
    desc: 'Fires your selected block. It builds a wall wherever it lands.',
    stats: { dmg: 3, gap: 0.3, mag: 12, reload: 1.2, spread: 0.002, range: 40, recoil: 0.8, mode: 'semi', proj: 'block', speed: 30, head: 1 },
    defaults: { sight: 'iron', mag: 'standard', stock: 'standard', paint: 'candy' },
  },
};

export const GUN_ORDER = Object.keys(GUNS);

// Part mods: dmg, gap, mag, reload, spread, range, recoil multiply the stat;
// mobility and pellets add; zoom/ads come from sights; the rest switch on
// effects.
export const PARTS = {
  'barrel.standard': { name: 'Standard Barrel', rarity: 'common', price: 0, mods: {}, desc: 'Nothing fancy.' },
  'barrel.short': { name: 'Short Barrel', rarity: 'common', price: 80, mods: { gap: 0.87, spread: 1.4, range: 0.85, mobility: 0.03 }, desc: 'Fires faster, sprays more.' },
  'barrel.long': { name: 'Long Barrel', rarity: 'rare', price: 180, mods: { dmg: 1.15, range: 1.3, gap: 1.08, spread: 0.8 }, desc: 'Hits harder and farther.' },
  'barrel.heavy': { name: 'Heavy Barrel', rarity: 'rare', price: 220, mods: { dmg: 1.3, gap: 1.15, recoil: 1.2, mobility: -0.06 }, desc: 'Big hits, slower fire.' },
  'barrel.precision': { name: 'Precision Barrel', rarity: 'epic', price: 420, mods: { spread: 0.45, dmg: 1.05, range: 1.15 }, desc: 'Laser-straight shots.' },
  'barrel.twin': { name: 'Twin Barrel', rarity: 'legendary', price: 900, mods: { pellets: 1, dmg: 0.72, spread: 1.3 }, desc: 'Two bolts every shot.' },

  'muzzle.none': { name: 'Bare Muzzle', rarity: 'common', price: 0, mods: {}, desc: 'Nothing on the end.' },
  'muzzle.brake': { name: 'Muzzle Brake', rarity: 'common', price: 60, mods: { recoil: 0.6 }, desc: 'Tames the kick.' },
  'muzzle.suppressor': { name: 'Suppressor', rarity: 'rare', price: 200, mods: { dmg: 0.92, quiet: true, noFlash: true }, desc: 'Quiet shots, no flash.' },
  'muzzle.compensator': { name: 'Compensator', rarity: 'rare', price: 240, mods: { recoil: 0.75, spread: 0.8 }, desc: 'Less kick, tighter spray.' },
  'muzzle.choke': { name: 'Choke', rarity: 'rare', price: 160, mods: { spread: 0.6, range: 1.15 }, desc: 'Squeezes pellets together.' },
  'muzzle.flame': { name: 'Flame Tip', rarity: 'epic', price: 500, mods: { burn: 1.5 }, desc: 'Every hit sets mobs on fire.' },

  'sight.iron': { name: 'Iron Sights', rarity: 'common', price: 0, mods: { zoom: 1.15, ads: 0.6 }, desc: 'Simple and clear.' },
  'sight.reddot': { name: 'Red Dot', rarity: 'common', price: 70, mods: { zoom: 1.25, ads: 0.45 }, desc: 'Fast, clean aiming.' },
  'sight.holo': { name: 'Holo Sight', rarity: 'rare', price: 180, mods: { zoom: 1.4, ads: 0.35 }, desc: 'Big window, steady aim.' },
  'sight.scope2': { name: '2x Scope', rarity: 'rare', price: 260, mods: { zoom: 2, ads: 0.3 }, desc: 'Double zoom.' },
  'sight.scope4': { name: '4x Scope', rarity: 'epic', price: 520, mods: { zoom: 4, ads: 0.12 }, desc: 'See their eyebrows from across the island.' },

  'mag.standard': { name: 'Standard Cell', rarity: 'common', price: 0, mods: {}, desc: 'Regular capacity.' },
  'mag.extended': { name: 'Extended Cell', rarity: 'common', price: 100, mods: { mag: 1.5, reload: 1.2 }, desc: 'Half again as many shots.' },
  'mag.quick': { name: 'Quick Cell', rarity: 'rare', price: 220, mods: { reload: 0.62, mag: 0.8 }, desc: 'Reloads in a flash.' },
  'mag.drum': { name: 'Drum Cell', rarity: 'epic', price: 480, mods: { mag: 2.2, reload: 1.5, mobility: -0.05 }, desc: 'Huge capacity, slow swap.' },
  'mag.overcharged': { name: 'Overcharged Cell', rarity: 'legendary', price: 950, mods: { dmg: 1.25, gap: 0.93, mag: 0.9 }, desc: 'More power per shot and faster fire.' },

  'stock.none': { name: 'No Stock', rarity: 'common', price: 0, mods: { recoil: 1.3, mobility: 0.06 }, desc: 'Light and wobbly.' },
  'stock.skeleton': { name: 'Skeleton Stock', rarity: 'common', price: 60, mods: { recoil: 0.85 }, desc: 'Balanced.' },
  'stock.standard': { name: 'Solid Stock', rarity: 'common', price: 90, mods: { recoil: 0.75 }, desc: 'Steadier shots.' },
  'stock.heavy': { name: 'Heavy Stock', rarity: 'rare', price: 200, mods: { recoil: 0.5, mobility: -0.05 }, desc: 'Barely kicks at all.' },

  'under.none': { name: 'Nothing', rarity: 'common', price: 0, mods: {}, desc: 'Clean underside.' },
  'under.foregrip': { name: 'Foregrip', rarity: 'common', price: 90, mods: { recoil: 0.75, spread: 0.9 }, desc: 'Better control.' },
  'under.laser': { name: 'Laser', rarity: 'rare', price: 230, mods: { hip: 0.55, laser: true }, desc: 'Much better hip-fire aim.' },
  'under.bipod': { name: 'Bipod', rarity: 'epic', price: 400, mods: { bipod: true }, desc: 'Crouch for rock-steady shots.' },

  'core.ember': { name: 'Ember Core', rarity: 'common', price: 0, mods: {}, desc: 'The standard orange glow.' },
  'core.inferno': { name: 'Inferno Core', rarity: 'rare', price: 300, mods: { burn: 2 }, desc: 'Shots set mobs on fire.' },
  'core.frost': { name: 'Frost Core', rarity: 'rare', price: 300, mods: { slow: 0.45 }, desc: 'Shots slow mobs down.' },
  'core.shock': { name: 'Shock Core', rarity: 'epic', price: 600, mods: { chain: 2 }, desc: 'Lightning jumps to nearby mobs.' },
  'core.blast': { name: 'Blast Core', rarity: 'epic', price: 700, mods: { splash: 1.6 }, desc: 'Shots pop in small explosions.' },
  'core.leech': { name: 'Leech Core', rarity: 'legendary', price: 1100, mods: { leech: 0.06 }, desc: 'Heals you as you deal damage.' },

  'paint.steel': { name: 'Steel', rarity: 'common', price: 0, mods: {}, desc: 'Factory finish.' },
  'paint.gunmetal': { name: 'Gunmetal', rarity: 'common', price: 0, mods: {}, desc: 'Dark and serious.' },
  'paint.desert': { name: 'Desert', rarity: 'common', price: 80, mods: {}, desc: 'Sandy tan.' },
  'paint.camo': { name: 'Camo', rarity: 'rare', price: 150, mods: {}, desc: 'Forest pattern.' },
  'paint.candy': { name: 'Candy', rarity: 'rare', price: 150, mods: {}, desc: 'Pink and mint.' },
  'paint.obsidian': { name: 'Obsidian', rarity: 'epic', price: 400, mods: {}, desc: 'Black glass with a purple shine.' },
  'paint.neon': { name: 'Neon', rarity: 'epic', price: 450, mods: {}, desc: 'Glowing edges.' },
  'paint.gold': { name: 'Solid Gold', rarity: 'legendary', price: 1000, mods: {}, desc: 'Show off.' },
  'paint.bronze': { name: 'Bronze Mastery', rarity: 'rare', price: 0, unlock: 50, mods: {}, desc: 'Earned, not bought.' },
  'paint.diamond': { name: 'Diamond Mastery', rarity: 'epic', price: 0, unlock: 250, mods: {}, desc: 'Sparkling crystal.' },
  'paint.lava': { name: 'Lava Mastery', rarity: 'legendary', price: 0, unlock: 600, mods: {}, desc: 'Glowing hot seams.' },
};

for (const [id, p] of Object.entries(PARTS)) {
  p.id = id;
  p.slot = id.split('.')[0];
  p.style = id.split('.')[1];
}

export function partsForSlot(slot) {
  return Object.values(PARTS).filter((p) => p.slot === slot);
}

// A build maps slot -> part id. Missing slots fall back to the gun's defaults.
export function defaultBuild(gunId) {
  const g = GUNS[gunId];
  const b = {};
  for (const slot of g.slots) b[slot] = `${slot}.${g.defaults[slot]}`;
  return b;
}

export function cleanBuild(gunId, build) {
  const g = GUNS[gunId];
  const b = defaultBuild(gunId);
  if (build) {
    for (const slot of g.slots) {
      const pid = build[slot];
      if (PARTS[pid] && PARTS[pid].slot === slot) b[slot] = pid;
    }
  }
  return b;
}

export function buildCode(build) {
  return Object.keys(build)
    .sort()
    .map((s) => build[s].split('.')[1])
    .join(',');
}

// The other half of buildCode: turns "brake,standard,..." back into a
// build for a gun. Unknown pieces fall back to the gun's defaults.
export function parseBuildCode(gunId, code) {
  const g = GUNS[gunId];
  if (!g) return null;
  const slots = [...g.slots].sort();
  const vals = String(code || '').split(',');
  const b = {};
  slots.forEach((slot, i) => {
    if (vals[i]) b[slot] = `${slot}.${vals[i]}`;
  });
  return cleanBuild(gunId, b);
}

export function gunStats(gunId, build) {
  const g = GUNS[gunId];
  const s = { ...BASE, ...g.stats, burn: 0, slow: 0, chain: g.stats.chain || 0, splash: g.stats.splash || 0, leech: 0 };
  s.burn = g.stats.burn || 0;
  s.slow = g.stats.slow || 0;
  const b = cleanBuild(gunId, build);
  for (const pid of Object.values(b)) {
    const m = PARTS[pid].mods;
    for (const k of ['dmg', 'gap', 'reload', 'spread', 'range', 'recoil']) if (m[k]) s[k] *= m[k];
    if (m.mag) s.mag *= m.mag;
    if (m.mobility) s.mobility += m.mobility;
    if (m.pellets) s.pellets += m.pellets;
    if (m.zoom) s.zoom = Math.max(g.stats.zoom || 1, m.zoom);
    if (m.ads) s.ads = m.ads;
    if (m.hip) s.hip *= m.hip;
    if (m.burn) s.burn += m.burn;
    if (m.slow) s.slow = Math.max(s.slow, m.slow);
    if (m.chain) s.chain += m.chain;
    if (m.splash && !s.proj) s.splash = Math.max(s.splash, m.splash);
    if (m.leech) s.leech += m.leech;
    for (const flag of ['quiet', 'noFlash', 'laser', 'bipod']) if (m[flag]) s[flag] = true;
  }
  s.mag = Math.max(1, Math.round(s.mag));
  s.core = b.core || 'core.ember';
  s.paint = b.paint || 'paint.steel';
  return s;
}

// Numbers for the Armory's stat bars, all 0..1.
export function statBars(s) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const perShot = s.dmg * s.pellets;
  const dps = (perShot / s.gap) * (s.mode === 'spin' ? 0.9 : 1);
  return [
    { id: 'dmg', name: 'Damage', v: clamp01(perShot / 22), text: perShot.toFixed(perShot < 10 ? 1 : 0) },
    { id: 'rate', name: 'Fire rate', v: clamp01(1 / s.gap / 22), text: `${(1 / s.gap).toFixed(1)}/s` },
    { id: 'dps', name: 'Damage / sec', v: clamp01(dps / 60), text: dps.toFixed(0) },
    { id: 'mag', name: 'Magazine', v: clamp01(s.mag / 120), text: String(s.mag) },
    { id: 'reload', name: 'Reload speed', v: clamp01(1 - (s.reload - 0.5) / 3), text: `${s.reload.toFixed(1)}s` },
    { id: 'acc', name: 'Accuracy', v: clamp01(1 - s.spread / 0.08), text: `${Math.round(clamp01(1 - s.spread / 0.08) * 100)}` },
    { id: 'range', name: 'Range', v: clamp01(s.range / 160), text: `${Math.round(s.range)}` },
    { id: 'mob', name: 'Mobility', v: clamp01((s.mobility - 0.7) / 0.45), text: `${Math.round(s.mobility * 100)}%` },
  ];
}

// Pick a random part for a supply crate, rarer ones less often.
export function rollPart(rng = Math.random) {
  const pool = Object.values(PARTS).filter((p) => p.price > 0);
  const total = pool.reduce((t, p) => t + RARITY[p.rarity].weight, 0);
  let r = rng() * total;
  for (const p of pool) {
    r -= RARITY[p.rarity].weight;
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}
