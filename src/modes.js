import { $, store } from './util.js';
import { MAPS, MAP_ORDER } from './maps.js';
import { DIFFICULTY } from './bots.js';

// The "More modes" screen: Endless and its twists, and practice duels
// against bots.

export const VARIANTS = {
  endless: { name: 'Endless Waves', desc: 'The classic. Waves get bigger, a boss every fifth wave. How long can you last?' },
  bossrush: { name: 'Boss Rush', desc: 'Every wave is a boss, all ten in a row. No warm-up.' },
  horde: { name: 'Horde', desc: 'Three times the mobs, all of them tiny. Bring a minigun.' },
  hardcore: { name: 'Hardcore', desc: 'One life, no healing over time, no heart drops, and mobs hit harder. Double coins.' },
};

export function bestFor(variant) {
  try {
    return JSON.parse(store.get(variant === 'endless' ? 'best' : `best:${variant}`, 'null'));
  } catch {
    return null;
  }
}

export class Modes {
  constructor(game) {
    this.game = game;
    this.el = $('#modes');
    $('#modes-back').addEventListener('click', () => game.setState('menu'));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        game.setState('menu');
      }
    });
    const map = $('#bd-map');
    for (const id of MAP_ORDER) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = MAPS[id].name;
      map.appendChild(o);
    }
    const lvl = $('#bd-level');
    for (const [id, d] of Object.entries(DIFFICULTY)) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = d.name;
      lvl.appendChild(o);
    }
    map.value = store.get('bd-map', 'towers');
    lvl.value = store.get('bd-level', 'normal');
    $('#bd-count').value = store.get('bd-count', '1');
    $('#bd-go').addEventListener('click', () => {
      const opts = { map: map.value, level: lvl.value, count: Math.max(1, Math.min(3, Number($('#bd-count').value) || 1)) };
      store.set('bd-map', opts.map);
      store.set('bd-level', opts.level);
      store.set('bd-count', String(opts.count));
      game.startBotDuel(opts);
    });
  }

  show() {
    this.el.hidden = false;
    this.render();
  }

  hide() {
    this.el.hidden = true;
  }

  render() {
    const list = $('#modes-list');
    list.textContent = '';
    for (const [id, v] of Object.entries(VARIANTS)) {
      const card = document.createElement('div');
      card.className = 'panel mode-card';
      const h = document.createElement('h3');
      h.className = 'mode-name';
      h.textContent = v.name;
      const p = document.createElement('p');
      p.className = 'mode-desc';
      p.textContent = v.desc;
      const best = bestFor(id);
      const b = document.createElement('p');
      b.className = 'mode-best';
      b.textContent = best ? `Best: wave ${best.wave}, ${best.score.toLocaleString('en-US')} points` : 'Not played yet';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'btn btn-go';
      go.textContent = 'Play';
      go.addEventListener('click', () => this.game.play(id));
      card.append(h, p, b, go);
      list.appendChild(card);
    }
  }
}
