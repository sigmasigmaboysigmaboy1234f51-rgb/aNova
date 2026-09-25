// Emotes: wave, dance, flex and dab. They run on top of the normal
// animation, blended in and out with a weight w (0..1).

export const EMOTES = {
  wave: { name: 'Wave', key: 'KeyZ', time: 2.4 },
  dance: { name: 'Dance', key: 'KeyX', time: 4.8 },
  flex: { name: 'Flex', key: 'KeyC', time: 3 },
  dab: { name: 'Dab', key: 'KeyH', time: 1.8 },
};
export const EMOTE_KEYS = Object.entries(EMOTES).map(([id, e]) => [e.key, id]);

// How much of the emote shows at time t: fades in and out.
export function emoteWeight(id, t) {
  const e = EMOTES[id];
  if (!e) return 0;
  return Math.max(0, Math.min(1, t / 0.2, (e.time - t) / 0.3));
}

export function poseEmote(model, id, t, w) {
  if (!w || !EMOTES[id]) return;
  const P = model.parts;
  const set = (name, x, y, z) => {
    const r = P[name].rotation;
    r.x += (x - r.x) * w;
    r.y += (y - r.y) * w;
    r.z += (z - r.z) * w;
  };
  const s = Math.sin;
  switch (id) {
    case 'wave': {
      set('armR', 0, 0, -2.6 + s(t * 10) * 0.35);
      set('armL', 0, 0, 0.08);
      set('head', 0.05, s(t * 2) * 0.2, 0.12);
      set('hips', 0, 0, 0.05);
      set('legR', 0, 0, 0);
      set('legL', 0, 0, 0);
      break;
    }
    case 'dance': {
      const b = t * 7;
      set('hips', 0, s(b * 0.5) * 0.35, s(b) * 0.18);
      set('armR', -2.4 + s(b) * 0.6, 0, -0.4 + s(b) * 0.3);
      set('armL', -2.4 - s(b) * 0.6, 0, 0.4 + s(b) * 0.3);
      set('head', s(b * 2) * 0.15, s(b * 0.5) * 0.3, s(b) * 0.2);
      set('legR', Math.max(0, s(b)) * -0.7, 0, -0.1);
      set('legL', Math.max(0, -s(b)) * -0.7, 0, 0.1);
      P.hips.position.y += Math.abs(s(b)) * 0.06 * w;
      break;
    }
    case 'flex': {
      // Both arms up and out like a bodybuilder, pumping.
      const pump = s(t * 6) * 0.12;
      set('armR', -0.35, 0, -2.35 + pump);
      set('armL', -0.35, 0, 2.35 - pump);
      set('hips', 0.12, 0, 0);
      set('head', -0.15, 0, 0);
      set('legR', 0, 0, -0.18);
      set('legL', 0, 0, 0.18);
      break;
    }
    case 'dab': {
      const k = Math.min(1, t / 0.25);
      set('armR', -1.35 * k, -0.9 * k, -0.5 * k);
      set('armL', -0.2 * k, 0, 2.2 * k);
      set('head', 0.55 * k, 0.5 * k, 0);
      set('hips', 0.18 * k, 0.2 * k, 0);
      set('legR', 0, 0, 0);
      set('legL', 0, 0, 0);
      break;
    }
    default:
      break;
  }
}
