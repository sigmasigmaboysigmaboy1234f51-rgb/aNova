import * as THREE from 'three';
import { $ } from './util.js';
import { CHAPTERS, CAST, BOSS_CAST } from './storydata.js';
import { THEMES } from './themes.js';
import { BOSSES } from './boss.js';
import { drawPortrait } from './portraits.js';
import { GUNS, PARTS } from './weapons.js';
import { SX, SZ, SEA } from './world.js';

// Story mode: chapters made of goals, with talking in between.

const SHARD_COLORS = ['#d8c4ff', '#b89cff', '#8a5ae8'].map((c) => new THREE.Color(c));

// Grandma's beacon: mobs go for it, and you have to keep it standing.
class Beacon {
  constructor(game, pos, hp) {
    this.game = game;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.hw = 0.5;
    this.h = 2.4;
    this.maxHp = hp;
    this.hp = hp;
    this.dead = false;
    this.hitT = 0;
    const g = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({ color: 0xf2c230 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), gold);
    base.position.y = 0.2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), new THREE.MeshLambertMaterial({ color: 0x8f8f93 }));
    post.position.y = 1;
    this.crystalMat = new THREE.MeshBasicMaterial({ color: 0xb89cff });
    this.crystal = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), this.crystalMat);
    this.crystal.position.y = 1.9;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 40, 0.25).translate(0, 20, 0),
      new THREE.MeshBasicMaterial({ color: 0xb89cff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 1.9;
    g.add(base, post, this.crystal, beam);
    g.position.copy(this.pos);
    this.mesh = g;
    game.scene.add(g);
  }

  hurt(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this.hitT = 0.15;
    const g = this.game;
    g.fx.burst(this.pos.x, this.pos.y + 1.9, this.pos.z, SHARD_COLORS, 4, { speed: 2, size: 0.08, up: 1, life: 0.4, spread: 0.2 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      g.combat.explode(new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z), 2, 0, {});
    }
  }

  update(dt) {
    this.hitT -= dt;
    this.crystal.rotation.y += dt * 1.5;
    this.crystal.rotation.x += dt * 0.7;
    this.crystalMat.color.set(this.hitT > 0 ? 0xff6a5a : 0xb89cff);
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

// Talking heads at the bottom of the screen.
export class Dialogue {
  constructor(game) {
    this.game = game;
    this.el = $('#dialogue');
    this.pic = $('#dlg-pic');
    this.name = $('#dlg-name');
    this.text = $('#dlg-text');
    this.lines = [];
    this.done = null;
    this.typed = 0;
    this.open = false;
    const next = (e) => {
      if (!this.open) return;
      if (e) e.preventDefault();
      this.advance();
    };
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('#dlg-skip')) return;
      next(e);
    });
    $('#dlg-skip').addEventListener('click', () => this.finish());
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') next(e);
      if (e.code === 'Escape') this.finish();
    });
  }

  play(lines, done) {
    if (!lines || !lines.length) {
      done();
      return;
    }
    this.lines = lines.slice();
    this.done = done;
    this.open = true;
    this.el.hidden = false;
    this.show();
  }

  show() {
    const [who, text] = this.lines[0];
    const c = CAST[who] || CAST.pip;
    drawPortrait(this.pic, who, this.game.skin.canvas);
    this.name.textContent = c.name;
    this.name.style.color = c.color;
    this.full = text;
    this.typed = 0;
    this.text.textContent = '';
    this.game.sound.click();
  }

  advance() {
    if (this.typed < this.full.length) {
      this.typed = this.full.length;
      this.text.textContent = this.full;
      return;
    }
    this.lines.shift();
    if (this.lines.length) this.show();
    else this.finish();
  }

  finish() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    const d = this.done;
    this.done = null;
    if (d) d();
  }

  tick(dt) {
    if (!this.open || this.typed >= this.full.length) return;
    this.typed = Math.min(this.full.length, this.typed + dt * 55);
    this.text.textContent = this.full.slice(0, Math.floor(this.typed));
  }
}

export class StoryRun {
  constructor(game, index) {
    this.game = game;
    this.index = index;
    this.ch = CHAPTERS[index];
    this.goalIndex = -1;
    this.goal = null;
    this.deaths = 0;
    this.time = 0;
    this.mul = { hp: 1 + index * 0.1, speed: 1 + index * 0.02 };
    this.beacon = null;
    this.shards = [];
    this.finished = false;
  }

  get theme() {
    return THEMES[this.ch.theme];
  }

  // Everything the mobs may go after besides players.
  extraTargets() {
    return this.beacon && !this.beacon.dead ? [this.beacon] : [];
  }

  begin() {
    const g = this.game;
    g.dialogue.play(this.ch.intro, () => this.nextGoal());
  }

  nextGoal() {
    const g = this.game;
    this.goalIndex++;
    if (this.goalIndex >= this.ch.goals.length) {
      this.finish();
      return;
    }
    const goal = this.ch.goals[this.goalIndex];
    g.talk(goal.say, () => this.startGoal(goal));
  }

  startGoal(goal) {
    const g = this.game;
    this.goal = { ...goal, t: 0, spawnT: 1, wave: 0, queue: [], rest: 0, found: 0, bossUp: false, minionT: 6 };
    const G = this.goal;
    if (goal.type === 'waves') this.startWave();
    else if (goal.type === 'shards') this.placeShards(goal.n);
    else if (goal.type === 'defend') {
      const at = g.world.spawnPoint();
      at.x += 3;
      at.y = g.mobs.groundAt(at.x, at.z);
      this.beacon = new Beacon(g, at, 60 + this.index * 6);
      G.left = goal.time;
      g.mobs.refreshFlow(true);
    } else if (goal.type === 'boss') {
      G.bossT = 1.5;
      const b = BOSSES[this.ch.boss];
      g.hud.showBanner(b.name, b.title, 3);
      g.sound.roar(1);
    }
  }

  startWave() {
    const G = this.goal;
    G.wave++;
    const size = G.size + (G.wave - 1) * 2 + this.index;
    G.queue = Array.from({ length: size }, () => G.pool[Math.floor(Math.random() * G.pool.length)]);
    this.game.hud.showBanner(`Wave ${G.wave} of ${G.n}`, this.ch.title, 2);
    this.game.sound.wave();
  }

  // Spread the sparks out across the island, away from you.
  placeShards(n) {
    const g = this.game;
    const p = g.player.pos;
    let tries = 0;
    while (this.shards.length < n && tries++ < 400) {
      const x = 5 + Math.random() * (SX - 10);
      const z = 5 + Math.random() * (SZ - 10);
      if (Math.hypot(x - p.x, z - p.z) < 10) continue;
      if (this.shards.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) continue;
      const y = g.mobs.groundAt(x, z);
      if (y <= SEA + 1) continue;
      this.shards.push(g.mobs.spawnPickup('shard', Math.floor(x) + 0.5, y, Math.floor(z) + 0.5));
    }
  }

  onShard() {
    const G = this.goal;
    if (!G || G.type !== 'shards') return;
    G.found++;
    this.game.sound.crate();
    this.game.hud.popup(`Spark ${G.found} of ${G.n}`, 'head');
  }

  trickle(dt, every, cap, pool) {
    const g = this.game;
    const G = this.goal;
    G.spawnT -= dt;
    if (G.spawnT > 0 || g.mobs.alive() >= cap) return;
    G.spawnT = every * (0.7 + Math.random() * 0.6);
    const m = g.mobs.spawn(pool[Math.floor(Math.random() * pool.length)], this.mul);
    if (m) g.profile.markSeen(m.type);
  }

  update(dt) {
    const g = this.game;
    if (!this.goal || this.finished) return;
    this.time += dt;
    const G = this.goal;
    G.t += dt;
    if (this.beacon) {
      this.beacon.update(dt);
      if (this.beacon.dead) {
        this.fail('The beacon was destroyed!');
        return;
      }
    }
    switch (G.type) {
      case 'waves': {
        if (G.rest > 0) {
          G.rest -= dt;
          if (G.rest <= 0) this.startWave();
          break;
        }
        G.spawnT -= dt;
        if (G.queue.length && G.spawnT <= 0 && g.mobs.alive() < 12 + this.index) {
          const m = g.mobs.spawn(G.queue[G.queue.length - 1], this.mul);
          if (m) {
            G.queue.pop();
            g.profile.markSeen(m.type);
          }
          G.spawnT = Math.max(0.35, 0.9 - this.index * 0.04);
        }
        if (!G.queue.length && g.mobs.alive() === 0) {
          if (G.wave >= G.n) this.goalDone();
          else {
            G.rest = 3;
            g.hud.showBanner(`Wave ${G.wave} cleared`, 'Get ready...', 2);
            g.sound.cleared();
          }
        }
        break;
      }
      case 'shards':
        this.trickle(dt, 3, 5 + Math.floor(this.index / 2), G.pool);
        if (G.found >= G.n) this.goalDone();
        break;
      case 'defend':
        this.trickle(dt, 1.3, 10 + Math.floor(this.index / 2), G.pool);
        G.left -= dt;
        if (G.left <= 0) this.goalDone();
        break;
      case 'boss':
        if (!G.bossUp) {
          G.bossT -= dt;
          if (G.bossT <= 0) {
            const b = g.mobs.spawnBoss(this.ch.boss, this.mul, 1 + this.index * 0.06);
            if (b) {
              G.bossUp = true;
              g.profile.markSeen(b.type);
            } else G.bossT = 0.5;
          }
        } else {
          const boss = g.mobs.boss();
          G.minionT -= dt;
          if (boss && G.minionT <= 0 && g.mobs.alive() < 4) {
            G.minionT = 7;
            g.mobs.spawn(BOSSES[this.ch.boss].family, this.mul);
          }
          const dying = g.mobs.list.some((m) => m.def.boss);
          if (!dying) this.goalDone();
        }
        break;
      default:
    }
  }

  goalDone() {
    const g = this.game;
    const G = this.goal;
    this.goal = null;
    g.progress.event('goal');
    if (this.beacon) {
      this.beacon.dispose();
      this.beacon = null;
    }
    for (const s of this.shards) g.mobs.removePickup(s.id);
    this.shards = [];
    // The rest of the mobs run off.
    for (const m of g.mobs.list) if (m.state !== 'dying') m.remove(true);
    g.mobs.list = g.mobs.list.filter((m) => !m.gone);
    if (G.type !== 'boss') {
      g.hud.showBanner('Goal complete!', '', 2);
      g.sound.cleared();
    }
    const p = g.player;
    p.heal(8);
    p.blocks = Math.min(99, p.blocks + 10);
    setTimeout(() => {
      if (g.story === this && g.inGame) this.nextGoal();
    }, 1800);
  }

  objective() {
    const G = this.goal;
    if (!G) return '';
    if (G.type === 'waves') return `Survive wave ${G.wave} of ${G.n}: ${G.queue.length + this.game.mobs.alive()} left`;
    if (G.type === 'shards') return `Find Heartstone sparks: ${G.found} of ${G.n}`;
    if (G.type === 'defend') return `Protect the beacon: ${Math.ceil(G.left)}s`;
    if (G.type === 'boss') return `Beat the ${BOSSES[this.ch.boss].name}`;
    return '';
  }

  fail(why) {
    const g = this.game;
    if (this.failed) return;
    this.failed = true;
    this.deaths++;
    g.storyFail(why);
  }

  // Try the current goal again from the start.
  retry() {
    const g = this.game;
    this.failed = false;
    g.mobs.clear();
    g.combat.clear();
    if (this.beacon) {
      this.beacon.dispose();
      this.beacon = null;
    }
    this.shards = [];
    const third = g.player.thirdPerson;
    g.player.reset(g.world.spawnPoint());
    g.player.thirdPerson = third;
    const goal = this.ch.goals[this.goalIndex];
    this.startGoal(goal);
  }

  finish() {
    const g = this.game;
    this.finished = true;
    const prof = g.profile;
    const stars = 1 + (this.deaths === 0 ? 1 : 0) + (this.time <= this.ch.par ? 1 : 0);
    const first = (prof.story.done || 0) <= this.index;
    prof.story.done = Math.max(prof.story.done || 0, this.index + 1);
    prof.story.stars[this.index] = Math.max(prof.story.stars[this.index] || 0, stars);
    const rewards = [];
    const r = this.ch.reward;
    const coins = first ? r.coins : Math.round(r.coins / 4);
    g.gainCoins(coins);
    rewards.push(`${coins} coins`);
    if (first && r.gun && !prof.guns.has(r.gun)) {
      prof.grantGun(r.gun);
      rewards.push(`New gun: ${GUNS[r.gun].name}`);
    }
    if (first && r.parts) {
      for (const pid of r.parts) if (prof.givePart(pid)) rewards.push(`New part: ${PARTS[pid].name}`);
    }
    prof.changed();
    g.progress.event('chapter', { first });
    g.talk(this.ch.outro, () => g.storyWin(this.index, stars, rewards, this.time));
  }

  dispose() {
    if (this.beacon) this.beacon.dispose();
    this.beacon = null;
  }
}

// The chapter select screen.
export class StoryMenu {
  constructor(game) {
    this.game = game;
    this.el = $('#story');
    this.list = $('#story-list');
    $('#story-back').addEventListener('click', () => game.setState('menu'));
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
  }

  hide() {
    this.el.hidden = true;
  }

  render() {
    const prof = this.game.profile;
    const done = prof.story.done || 0;
    this.list.textContent = '';
    const total = Object.values(prof.story.stars).reduce((a, b) => a + b, 0);
    $('#story-stars').textContent = `${total} of 30 stars`;
    CHAPTERS.forEach((ch, i) => {
      const locked = i > done;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chapter';
      b.disabled = locked;
      const pic = document.createElement('canvas');
      pic.className = 'chapter-pic';
      drawPortrait(pic, BOSS_CAST[ch.boss], this.game.skin.canvas);
      const num = document.createElement('span');
      num.className = 'chapter-num';
      num.textContent = `Chapter ${i + 1}`;
      const title = document.createElement('span');
      title.className = 'chapter-title';
      title.textContent = locked ? '???' : ch.title;
      const place = document.createElement('span');
      place.className = 'chapter-place';
      place.textContent = locked ? `Beat chapter ${i} to unlock` : `${THEMES[ch.theme].name}. ${ch.lore}`;
      const stars = document.createElement('span');
      stars.className = 'chapter-stars';
      const s = prof.story.stars[i] || 0;
      stars.textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
      stars.setAttribute('aria-label', `${s} of 3 stars`);
      const reward = document.createElement('span');
      reward.className = 'chapter-reward';
      const r = ch.reward;
      reward.textContent = locked ? '' : r.gun ? `Reward: ${GUNS[r.gun].name}` : 'Reward: legendary parts';
      b.append(pic, num, title, place, stars, reward);
      if (locked) b.classList.add('locked');
      b.addEventListener('click', () => this.game.startStory(i));
      this.list.appendChild(b);
    });
  }
}
