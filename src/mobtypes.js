import * as THREE from 'three';

// Every mob in the game: ten families, each in ten variants, makes 100.
// A family decides the body and the brain; a variant changes the colours,
// size, toughness and what its hits do to you.

export const FAMILIES = {
  moss: {
    name: 'Mosshead',
    body: 'humanoid',
    ai: 'melee',
    hp: 12,
    speed: 3.2,
    dmg: 3,
    score: 100,
    coins: 5,
    digs: true,
    death: 1.2,
    unlock: 1,
    colors: ['#6f8c55', '#3d6a6e', '#5a7446', '#4f7d2f'],
    blurb: 'Shambles at you and slams down with both arms. Step back during the wind-up and it misses. Chews through walls.',
  },
  bone: {
    name: 'Bonehead',
    body: 'humanoid',
    limb: 2,
    ai: 'archer',
    hp: 9,
    speed: 3,
    dmg: 3,
    score: 150,
    coins: 6,
    death: 1.6,
    unlock: 2,
    colors: ['#dcd6c4', '#c4bca6', '#3b3446'],
    blurb: 'Keeps its distance and fires glowing bolts. Its eyes light up just before it shoots.',
  },
  gloop: {
    name: 'Gloop',
    body: 'gloop',
    ai: 'hopper',
    hp: 8,
    speed: 5.4,
    hw: 0.45,
    h: 0.9,
    dmg: 3,
    score: 120,
    coins: 6,
    digs: true,
    death: 0.6,
    unlock: 3,
    colors: ['#9b5fd1', '#caa6ee', '#6d3aa0'],
    blurb: 'A bouncy jelly cube. Hops over walls two blocks high.',
  },
  skitter: {
    name: 'Skitter',
    body: 'crawler',
    ai: 'crawler',
    hp: 6,
    speed: 5.6,
    hw: 0.45,
    h: 0.7,
    dmg: 2,
    score: 110,
    coins: 5,
    death: 0.7,
    unlock: 4,
    colors: ['#3a3440', '#241f2a', '#ff3b3b', '#5a5064'],
    blurb: 'A hairy spider, very fast. Leaps at you from a few blocks away and runs straight up walls, however tall you build them.',
  },
  imp: {
    name: 'Ember Imp',
    body: 'humanoid',
    scale: 0.78,
    ai: 'thrower',
    hp: 8,
    speed: 3.5,
    dmg: 3,
    score: 160,
    coins: 7,
    death: 1,
    unlock: 6,
    colors: ['#c8402a', '#7a1f14', '#ffb040', '#2a1210'],
    blurb: 'A little horned pest that lobs fireballs over your walls. The blast sets you on fire.',
  },
  fuse: {
    name: 'Fuse',
    body: 'humanoid',
    ai: 'bomber',
    hp: 7,
    speed: 4,
    dmg: 8,
    score: 140,
    coins: 6,
    death: 0.5,
    unlock: 7,
    colors: ['#d8392b', '#2a2622', '#ffd23f', '#8a2a1c'],
    blurb: 'Runs up, hisses and swells, then explodes and takes your walls with it. Back off when it starts flashing.',
  },
  knight: {
    name: 'Rust Knight',
    body: 'humanoid',
    ai: 'knight',
    hp: 18,
    speed: 3,
    dmg: 4,
    score: 200,
    coins: 8,
    death: 1.3,
    unlock: 8,
    colors: ['#8a5a3a', '#a8703f', '#5e4a3a', '#c9a23a'],
    blurb: 'Carries a shield that soaks up shots from the front. Aim for the head or get behind it. Charges when close.',
  },
  golem: {
    name: 'Cobble Golem',
    body: 'humanoid',
    scale: 1.3,
    ai: 'golem',
    hp: 32,
    speed: 2.2,
    dmg: 5,
    score: 260,
    coins: 10,
    digs: true,
    death: 1.4,
    unlock: 9,
    colors: ['#7a7a7a', '#5e5e5e', '#8f8f8f', '#6fd6f0'],
    blurb: 'Slow and very tough. Its punches send you flying and walls do not stop it for long.',
  },
  bat: {
    name: 'Flapper',
    body: 'flyer',
    ai: 'flyer',
    hp: 5,
    speed: 5.2,
    hw: 0.35,
    h: 0.6,
    dmg: 2,
    score: 130,
    coins: 6,
    death: 0.8,
    unlock: 11,
    colors: ['#4a3a32', '#2e241f', '#ff5a3a', '#6b5448'],
    blurb: 'Flies over everything, circles you, then dives in to bite.',
  },
  ghost: {
    name: 'Specter',
    body: 'humanoid',
    ghost: true,
    ai: 'ghost',
    hp: 10,
    speed: 2.6,
    dmg: 3,
    score: 180,
    coins: 8,
    death: 1,
    unlock: 12,
    colors: ['#dfe8f0', '#b8c8d8', '#8fe3ff'],
    blurb: 'Drifts straight through blocks. Walls will not help. Shoot it.',
  },
};

export const FAMILY_ORDER = Object.keys(FAMILIES);

// ramp: colours from dark to light that the skin is repainted with.
export const VARIANTS = {
  normal: { prefix: '', unlock: 0, weight: 0 },
  mini: { prefix: 'Tiny', hp: 0.5, speed: 1.35, dmg: 0.7, scale: 0.66, unlock: 3, weight: 10, blurb: 'Half the size, twice as twitchy.' },
  giant: { prefix: 'Giant', hp: 2.6, speed: 0.82, dmg: 1.6, scale: 1.45, coins: 2.5, score: 2.2, unlock: 3, weight: 7, blurb: 'Huge, slow and hard to put down.' },
  frost: {
    prefix: 'Frost',
    hp: 1.2,
    fx: { slow: 0.45 },
    ramp: ['#1d3f66', '#3a78b0', '#79b9e8', '#c9ecff', '#ffffff'],
    glow: '#9fe8ff',
    unlock: 4,
    weight: 10,
    blurb: 'Its hits freeze you and slow you down.',
  },
  blaze: {
    prefix: 'Blazing',
    hp: 1.2,
    fx: { burn: 1 },
    immune: 'burn',
    ramp: ['#3a0e05', '#8a2a0c', '#e0501a', '#ff9a3c', '#ffe08a'],
    glow: '#ff7a2f',
    unlock: 4,
    weight: 10,
    blurb: 'Its hits set you on fire. Fire cores do nothing to it.',
  },
  toxic: {
    prefix: 'Toxic',
    hp: 1.2,
    fx: { poison: 1 },
    ramp: ['#1f2a0e', '#3f6b12', '#7bc62a', '#c8f25a', '#f0ffb0'],
    glow: '#9be070',
    unlock: 6,
    weight: 9,
    blurb: 'Its hits poison you. Poison stops you healing.',
  },
  shock: {
    prefix: 'Shock',
    hp: 1.1,
    speed: 1.25,
    fx: { shock: 2 },
    ramp: ['#1d0f3a', '#44248a', '#8a4dff', '#c8a4ff', '#fff6a0'],
    glow: '#c8a4ff',
    unlock: 7,
    weight: 8,
    blurb: 'Fast, and its hits zap you for extra damage.',
  },
  shadow: {
    prefix: 'Shadow',
    hp: 1.1,
    speed: 1.2,
    alpha: 0.6,
    ramp: ['#050508', '#121018', '#241e30', '#3a3050', '#5a4a78'],
    eyes: '#d27bff',
    unlock: 9,
    weight: 7,
    blurb: 'See-through and quick. Hard to spot until it is close.',
  },
  armored: { prefix: 'Armored', hp: 1.9, speed: 0.9, armor: 0.3, score: 1.6, coins: 1.6, unlock: 8, weight: 8, blurb: 'Iron helmet and chest plate. Takes less damage.' },
  golden: {
    prefix: 'Golden',
    hp: 1.6,
    coins: 6,
    score: 3,
    ramp: ['#4a2f05', '#8a6a1f', '#c9a23a', '#f2d774', '#fff6c8'],
    glow: '#ffd84a',
    unlock: 2,
    weight: 2,
    blurb: 'Rare and shiny. Drops a pile of coins.',
  },
};

export const VARIANT_ORDER = Object.keys(VARIANTS);

function mapColor(hex, ramp) {
  const c = new THREE.Color(hex);
  const l = Math.min(0.999, c.r * 0.3 + c.g * 0.59 + c.b * 0.11);
  const x = l * (ramp.length - 1);
  const i = Math.floor(x);
  return new THREE.Color(ramp[i]).lerp(new THREE.Color(ramp[Math.min(ramp.length - 1, i + 1)]), x - i).getStyle();
}

// Every mob type, "moss" for a plain Mosshead or "moss:frost" and so on.
export const MOB_TYPES = {};
export const TYPE_LIST = [];
for (const fid of FAMILY_ORDER) {
  for (const vid of VARIANT_ORDER) {
    const f = FAMILIES[fid];
    const v = VARIANTS[vid];
    const id = vid === 'normal' ? fid : `${fid}:${vid}`;
    const scale = (f.scale || 1) * (v.scale || 1);
    const humanoid = f.body === 'humanoid';
    const def = {
      ...f,
      id,
      family: fid,
      variant: vid,
      name: v.prefix ? `${v.prefix} ${f.name}` : f.name,
      hp: f.hp * (v.hp || 1),
      speed: f.speed * (v.speed || 1),
      dmg: Math.max(1, Math.round(f.dmg * (v.dmg || 1))),
      score: Math.round(f.score * (v.score || 1)),
      coins: Math.round(f.coins * (v.coins || 1)),
      scale,
      hw: (humanoid ? 0.3 : f.hw) * scale,
      h: (humanoid ? 1.8 : f.h) * scale,
      fx: v.fx || null,
      armor: v.armor || 0,
      alpha: f.ghost ? 0.55 : v.alpha || 1,
      immune: v.immune || null,
      glow: v.glow || null,
      variantBlurb: v.blurb || '',
      colors: v.ramp ? f.colors.map((c) => mapColor(c, v.ramp)) : f.colors,
    };
    def.colorObjs = def.colors.map((c) => new THREE.Color(c));
    MOB_TYPES[id] = def;
    TYPE_LIST.push(id);
  }
}

// Pick what to spawn on a wave: which families are out yet, and how often
// they come in a special variant.
export function pickMob(wave, rng = Math.random) {
  const fams = FAMILY_ORDER.filter((f) => FAMILIES[f].unlock <= wave);
  // Newer families show up a little less often than the old ones.
  const fw = fams.map((f) => (f === 'moss' ? 3 : f === 'bone' || f === 'gloop' ? 2 : 1.3));
  let r = rng() * fw.reduce((a, b) => a + b, 0);
  let fam = fams[0];
  for (let i = 0; i < fams.length; i++) {
    r -= fw[i];
    if (r <= 0) {
      fam = fams[i];
      break;
    }
  }
  const chance = Math.min(0.75, wave < 2 ? 0 : 0.08 + wave * 0.045);
  if (rng() >= chance) return fam;
  const vars = VARIANT_ORDER.filter((v) => v !== 'normal' && VARIANTS[v].unlock <= wave);
  if (!vars.length) return fam;
  const total = vars.reduce((t, v) => t + VARIANTS[v].weight, 0);
  let q = rng() * total;
  for (const v of vars) {
    q -= VARIANTS[v].weight;
    if (q <= 0) return `${fam}:${v}`;
  }
  return fam;
}
