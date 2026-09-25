import { $ } from './util.js';
import { ACHIEVEMENTS, xpForLevel } from './progress.js';

// The Challenges screen: your level, today's challenges and achievements.
export class Challenges {
  constructor(game) {
    this.game = game;
    this.el = $('#challenges');
    $('#ch-back').addEventListener('click', () => game.setState('menu'));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        game.setState('menu');
      }
    });
  }

  show() {
    this.el.hidden = false;
    this.render();
    $('#ch-back').focus();
  }

  hide() {
    this.el.hidden = true;
  }

  row(title, sub, have, goal, done) {
    const el = document.createElement('div');
    el.className = 'ch-row' + (done ? ' done' : '');
    const b = document.createElement('b');
    b.textContent = (done ? '✓ ' : '') + title;
    const small = document.createElement('small');
    small.textContent = sub;
    const bar = document.createElement('div');
    bar.className = 'ch-prog';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(Math.min(1, have / goal) * 100)}%`;
    bar.appendChild(fill);
    el.append(b, small, bar);
    return el;
  }

  render() {
    const g = this.game;
    const p = g.profile;
    g.progress.rollDaily();
    $('#ch-level').textContent = `Level ${p.level}: ${p.xp} / ${xpForLevel(p.level)} XP`;
    const daily = $('#ch-daily');
    daily.textContent = '';
    for (const d of p.daily.list) {
      daily.appendChild(this.row(g.progress.dailyText(d), `${Math.min(d.have, d.n).toLocaleString('en-US')} / ${d.n.toLocaleString('en-US')}. Reward: ${g.progress.dailyCoins(d)} coins`, d.have, d.n, d.done));
    }
    const ach = $('#ch-ach');
    ach.textContent = '';
    let n = 0;
    for (const a of ACHIEVEMENTS) {
      const done = !!p.ach[a.id];
      if (done) n++;
      const have = Math.min(a.goal, a.get(p));
      ach.appendChild(this.row(a.name, `${a.desc}. ${done ? 'Done!' : `${have.toLocaleString('en-US')} / ${a.goal.toLocaleString('en-US')}.`} Reward: ${a.coins} coins`, done ? a.goal : have, a.goal, done));
    }
    $('#ch-count').textContent = `(${n} of ${ACHIEVEMENTS.length})`;
  }
}
