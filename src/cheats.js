import * as THREE from 'three';
import { $ } from './util.js';
import { MOB_TYPES, FAMILIES, FAMILY_ORDER } from './mobtypes.js';
import { BOSSES } from './boss.js';
import { GUNS, PARTS } from './weapons.js';
import { HATS, CAPES, KILL_FX } from './cosmetics.js';
import { PETS } from './pets.js';
import { xpForLevel } from './progress.js';
import { BOT_NAMES } from './bots.js';

// The cheat menu. Press ` (the key under Esc) in a game, or click Cheats.
// In single player everything works. Online, only the host can use
// cheats (everyone else would be cheating on the host), and everyone is
// told when the host turns them on. Runs with cheats don't count for
// your best score.

export const CHEAT_GUNS = {
  kill: { name: 'Kill Gun', color: '#ff3b3b', desc: 'Anything you hit is knocked out instantly: mobs, bosses, bots, and online, other players.' },
  kick: { name: 'Kick Gun', color: '#ffb52e', desc: 'Punts mobs off into the sky and kicks bots out of the match. Online, kicks the player you hit out of your game.' },
  ban: { name: 'Ban Gun', color: '#b46cff', desc: 'Banishes a mob and stops that kind of mob coming back this game. Online, bans the player you hit so they can’t rejoin.' },
  freeze: { name: 'Freeze Gun', color: '#6ff0ff', desc: 'Freezes mobs, bosses and bots solid for 10 seconds.' },
  nuke: { name: 'Nuke Gun', color: '#6fd35a', desc: 'A giant explosion wherever you point. Breaks blocks too.' },
  launch: { name: 'Launch Gun', color: '#ff9dc0', desc: 'Blasts you toward wherever you point. Zoom across the whole island!' },
};

const TOGGLES = [
  ['god', 'God mode', 'Nothing can hurt you'],
  ['ammo', 'Infinite ammo', 'Never reload again'],
  ['rapid', 'Super fire rate', 'Every gun fires 3× faster'],
  ['onehit', 'One-hit knockouts', 'Every hit knocks a mob out'],
  ['fly', 'Fly', 'Space goes up, Shift goes down'],
  ['speed', 'Super speed', 'Run twice as fast'],
  ['jump', 'Moon jump', 'Jump really, really high'],
  ['nades', 'Infinite grenades', 'Throw as many as you like'],
  ['blocks', 'Infinite blocks', 'Build forever'],
];
const WORLD_TOGGLES = [
  ['freeze', 'Freeze all mobs', 'Every mob stops where it is'],
  ['peace', 'Pause the waves', 'No new waves start until you turn this off'],
];

const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const HEARTS = [new THREE.Color('#ff5a7a'), new THREE.Color('#ff9dc0'), new THREE.Color('#ffffff')];
const VOID = [new THREE.Color('#141018'), new THREE.Color('#6b3aa8'), new THREE.Color('#d27bff')];

export class Cheats {
  constructor(game) {
    this.game = game;
    this.on = {};
    this.gun = null;
    this.banned = new Set();
    this.bannedBots = new Set();
    this.announced = false;
    this.back = 'menu';
    this.el = $('#cheats');
    this.build();
    $('#cz-close').addEventListener('click', () => this.close());
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Backquote') {
        e.preventDefault();
        this.close();
      }
    });
  }

  // Online, only the host's cheats work.
  allowed() {
    const g = this.game;
    return !g.mp || g.mp.isHost;
  }

  has(id) {
    return !!this.on[id] && this.allowed();
  }

  gunOn() {
    return this.allowed() ? this.gun : null;
  }

  any() {
    return this.allowed() && (!!this.gun || Object.values(this.on).some(Boolean));
  }

  // A new game: forget who was banned.
  reset() {
    this.banned.clear();
    this.bannedBots.clear();
    this.announced = false;
  }

  used() {
    const g = this.game;
    if (g.inGame) g.cheatRun = true;
    if (g.mp && g.mp.isHost && !this.announced) {
      this.announced = true;
      const text = `${g.mp.name} turned on cheats`;
      g.mp.net.send({ t: 'notice', text });
      g.mp.system(text);
    }
  }

  // --- The menu -------------------------------------------------------------

  open(back) {
    this.back = back;
    this.game.input.exitLock();
    this.game.setState('cheats');
  }

  close() {
    const g = this.game;
    const back = this.back || 'menu';
    if (back === 'playing' || (back === 'paused' && g.mp)) {
      g.setState('playing');
      g.lockMouse();
    } else g.setState(back);
  }

  show() {
    this.el.hidden = false;
    this.render();
    $('#cz-close').focus();
  }

  hide() {
    this.el.hidden = true;
  }

  msg(text) {
    const m = $('#cz-msg');
    m.textContent = text;
    m.classList.remove('in');
    void m.offsetWidth;
    m.classList.add('in');
  }

  build() {
    const toggles = (list, host) => {
      for (const [id, name, desc] of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ch-toggle';
        b.dataset.cheat = id;
        b.innerHTML = '<b></b><span></span><i>OFF</i>';
        b.querySelector('b').textContent = name;
        b.querySelector('span').textContent = desc;
        b.addEventListener('click', () => {
          if (!this.allowed()) return this.msg('Only the host can use cheats in an online game.');
          this.on[id] = !this.on[id];
          if (this.on[id]) this.used();
          this.msg(`${name}: ${this.on[id] ? 'ON' : 'off'}`);
          this.render();
        });
        host.appendChild(b);
      }
    };
    toggles(TOGGLES, $('#cz-you'));
    toggles(WORLD_TOGGLES, $('#cz-world-t'));

    const guns = $('#cz-guns');
    for (const [id, def] of [['', { name: 'Normal guns', color: '#cfc6b0' }], ...Object.entries(CHEAT_GUNS)]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch-gun';
      b.dataset.gun = id;
      b.style.setProperty('--c', def.color);
      b.textContent = def.name;
      b.addEventListener('click', () => {
        if (!this.allowed()) return this.msg('Only the host can use cheats in an online game.');
        this.gun = id || null;
        if (this.gun) this.used();
        this.msg(this.gun ? `${def.name} ready. Hold any gun and shoot!` : 'Back to normal guns.');
        this.render();
      });
      guns.appendChild(b);
    }

    const bossSel = $('#cz-boss');
    BOSSES.forEach((b, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = b.name || MOB_TYPES[b.type].name;
      bossSel.appendChild(o);
    });
    const mobSel = $('#cz-mob');
    for (const f of FAMILY_ORDER) {
      const grp = document.createElement('optgroup');
      grp.label = FAMILIES[f].name + 's';
      for (const [type, def] of Object.entries(MOB_TYPES)) {
        if (def.boss || def.family !== f) continue;
        const o = document.createElement('option');
        o.value = type;
        o.textContent = def.name;
        grp.appendChild(o);
      }
      mobSel.appendChild(grp);
    }

    const act = (id, fn) => $(id).addEventListener('click', () => {
      if (!this.allowed()) return this.msg('Only the host can use cheats in an online game.');
      const text = fn();
      if (text) this.msg(text);
      this.render();
    });
    act('#cz-killall', () => this.killAll());
    act('#cz-skip', () => this.skipWave());
    act('#cz-spawnboss', () => this.spawnBoss(Number(bossSel.value)));
    act('#cz-spawnmob', () => this.spawnMobs(mobSel.value, 5));
    act('#cz-day', () => this.setTime(0.2, 'Good morning!'));
    act('#cz-night', () => this.setTime(0.75, 'Night time. Spooky.'));
    act('#cz-weather', () => this.setWeather($('#cz-weather-sel').value));
    act('#cz-addbot', () => this.addBot());
    act('#cz-unban', () => this.unbanAll());
    act('#cz-heal', () => this.fullHeal());
    act('#cz-power', () => this.allPowers());
    act('#cz-coins', () => this.coins(10000));
    act('#cz-unlock', () => this.unlockGear());
    act('#cz-style', () => this.unlockStyle());
    act('#cz-level', () => this.levelUp());
    act('#cz-spin', () => this.freeSpin());
  }

  render() {
    const g = this.game;
    const ok = this.allowed();
    const inGame = g.inGame;
    $('#cz-status').textContent = !ok
      ? 'Only the host can use cheats in an online game.'
      : g.mp
        ? 'You are the host. Everyone in your game is told when you turn cheats on.'
        : 'Cheats are on your computer only. Runs with cheats don’t count for your best score.';
    for (const b of this.el.querySelectorAll('[data-cheat]')) {
      const on = !!this.on[b.dataset.cheat];
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('i').textContent = on ? 'ON' : 'OFF';
      b.disabled = !ok;
    }
    for (const b of this.el.querySelectorAll('[data-gun]')) {
      b.setAttribute('aria-pressed', String((b.dataset.gun || null) === this.gun));
      b.disabled = !ok;
    }
    $('#cz-gun-desc').textContent = this.gun ? CHEAT_GUNS[this.gun].desc : 'Pick a cheat gun, then shoot with any gun in your hand.';
    const waves = inGame && g.authority && !g.duel && !g.story;
    for (const id of ['#cz-killall', '#cz-spawnboss', '#cz-spawnmob']) $(id).disabled = !ok || !inGame || !!g.duel || !g.authority;
    $('#cz-skip').disabled = !ok || !waves;
    for (const id of ['#cz-day', '#cz-night', '#cz-weather']) $(id).disabled = !ok || !inGame || !g.sky.active;
    $('#cz-addbot').hidden = !(inGame && g.duel && !g.mp);
    $('#cz-addbot').disabled = !ok || g.bots.length >= 5;
    $('#cz-unban').disabled = !ok || !(this.banned.size || this.bannedBots.size);
    for (const id of ['#cz-heal', '#cz-power']) $(id).disabled = !ok || !inGame;
    for (const id of ['#cz-coins', '#cz-unlock', '#cz-style', '#cz-level', '#cz-spin']) $(id).disabled = !ok;
    $('#cz-world-note').hidden = inGame;
    this.updateHud();
  }

  // The label under the crosshair.
  updateHud() {
    const el = $('#cheat-gun');
    const gun = this.gunOn();
    if (gun === this.hudGun) return;
    this.hudGun = gun;
    el.hidden = !gun;
    if (gun) {
      el.textContent = CHEAT_GUNS[gun].name.toUpperCase();
      el.style.color = CHEAT_GUNS[gun].color;
    }
  }

  // --- Actions --------------------------------------------------------------

  liveMobs() {
    return this.game.mobs.list.filter((m) => m.state === 'live' && !m.gone);
  }

  killAll() {
    const g = this.game;
    this.used();
    const list = this.liveMobs();
    for (const m of list) m.damage(1e9, tmpD.set(0, 0, 1), false, m.pos.clone(), g.myId, {});
    return list.length ? `Knocked out ${list.length} mob${list.length === 1 ? '' : 's'}.` : 'No mobs around right now.';
  }

  skipWave() {
    const g = this.game;
    this.used();
    g.queue = [];
    g.bossPending = null;
    for (const m of this.liveMobs()) m.remove(true);
    if (g.waveState === 'rest') g.waveTimer = 0;
    return `Skipped wave ${g.wave}.`;
  }

  spawnBoss(i) {
    const g = this.game;
    this.used();
    const boss = g.mobs.spawnBoss(i, g.mul || g.waveMul(Math.max(1, g.wave)), 1);
    if (!boss) return 'No room for a boss right now. Try again.';
    g.profile.markSeen(boss.type);
    g.hud.showBanner(boss.def.name, 'Summoned with cheats!', 2.5);
    if (g.waveState === 'rest') g.waveState = 'fight';
    return `Summoned the ${boss.def.name}!`;
  }

  spawnMobs(type, n) {
    const g = this.game;
    this.used();
    let made = 0;
    for (let i = 0; i < n; i++) {
      const m = g.mobs.spawn(type, g.mul || g.waveMul(Math.max(1, g.wave)));
      if (m) {
        made++;
        g.profile.markSeen(m.type);
      }
    }
    if (made && g.waveState === 'rest') g.waveState = 'fight';
    return made ? `Spawned ${made} ${MOB_TYPES[type].name}${made === 1 ? '' : 's'}.` : 'No room to spawn right now.';
  }

  setTime(t, text) {
    this.used();
    this.game.sky.t = t;
    return text;
  }

  setWeather(w) {
    this.used();
    this.game.sky.setWeather(w, true);
    return w === 'clear' ? 'Clear skies.' : `Weather: ${w}.`;
  }

  addBot() {
    const g = this.game;
    if (!g.duel || g.mp) return '';
    this.used();
    const taken = new Set(g.bots.map((b) => b.name));
    const name = BOT_NAMES.find((n) => !taken.has(n) && !this.bannedBots.has(n));
    if (!name) return 'Every bot is banned or already here!';
    const level = (g.botDuel && g.botDuel.level) || 'normal';
    const b = g.addBot(name, level);
    return `${b.name} joined the match.`;
  }

  unbanAll() {
    const n = this.banned.size + this.bannedBots.size;
    this.banned.clear();
    this.bannedBots.clear();
    return `Unbanned ${n} thing${n === 1 ? '' : 's'}.`;
  }

  fullHeal() {
    const p = this.game.player;
    this.used();
    p.hp = p.maxHp;
    p.burnT = p.poisonT = p.slowT = 0;
    p.grenades = 5;
    p.blocks = 99;
    return 'Full health, grenades and blocks.';
  }

  allPowers() {
    const p = this.game.player;
    this.used();
    for (const id of ['dmg', 'speed', 'shield', 'rapid', 'ammo']) p.addBuff(id);
    this.game.sound.powerup();
    return 'Every power-up at once!';
  }

  coins(n) {
    this.used();
    this.game.profile.addCoins(n);
    this.game.sound.coin();
    return `+${n.toLocaleString('en-US')} coins!`;
  }

  unlockGear() {
    const prof = this.game.profile;
    this.used();
    for (const id of Object.keys(GUNS)) prof.grantGun(id);
    for (const id of Object.keys(PARTS)) prof.parts.add(id);
    prof.changed();
    return 'Every gun and every part unlocked. Check the Armory!';
  }

  unlockStyle() {
    const prof = this.game.profile;
    this.used();
    for (const [kind, list] of [
      ['hat', HATS],
      ['cape', CAPES],
      ['fx', KILL_FX],
      ['pet', PETS],
    ])
      for (const id of Object.keys(list)) prof.cos.add(`${kind}:${id}`);
    prof.changed();
    return 'Every hat, cape, pet and kill effect unlocked. Check the Style shop!';
  }

  levelUp() {
    const g = this.game;
    this.used();
    g.progress.addXp(xpForLevel(g.profile.level) - g.profile.xp);
    g.profile.scheduleSave();
    g.renderLevel();
    return `You are level ${g.profile.level} now!`;
  }

  freeSpin() {
    const g = this.game;
    this.used();
    g.profile.wheel = null;
    g.profile.changed();
    g.refreshWheelDot();
    return 'Your free Lucky Wheel spin is back.';
  }

  // --- Cheat guns -----------------------------------------------------------

  // What the shot hits first: a mob, a bot, another player or a block.
  trace(o, d) {
    const g = this.game;
    const block = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 160);
    let best = null;
    let far = block ? block.t : 160;
    const mh = g.mobs.raycast(o, d, far);
    if (mh) {
      best = { mob: mh.mob, t: mh.t };
      far = mh.t;
    }
    for (const b of g.bots) {
      const h = b.hitTest(o, d, far);
      if (h) {
        best = { bot: b, t: h.t };
        far = h.t;
      }
    }
    if (g.mp) {
      for (const r of g.mp.remotes.list()) {
        const h = r.hitTest(o, d, far);
        if (h) {
          best = { player: r, t: h.t };
          far = h.t;
        }
      }
    }
    return { hit: best, end: o.clone().addScaledVector(d, far), block: best ? null : block };
  }

  fire(p) {
    const g = this.game;
    const kind = this.gunOn();
    if (!kind) return;
    const def = CHEAT_GUNS[kind];
    const o = tmpO.copy(g.camera.position);
    const d = p.aimDir(tmpD);
    const { hit, end, block } = this.trace(o, d);
    const muzzle = p.muzzleWorld(new THREE.Vector3());
    const color = new THREE.Color(def.color).getHex();
    g.tracers.fire(muzzle, end, color, 0.07);
    g.combat.lightning(muzzle, end, new THREE.Color(def.color));
    g.sound.zap(0.7);
    if (g.mp) g.mp.sendShot(muzzle, [end], { gun: 'ember', color: def.color.slice(1), quiet: false, zap: true });
    if (kind === 'nuke') {
      g.combat.explode(end, 7, 260, { local: true, breaks: true });
      if (g.mp) g.mp.sendBoom(end, 7, false);
      g.player.shake = Math.max(g.player.shake, 0.6);
      return;
    }
    if (kind === 'launch') {
      const dist = Math.min(40, o.distanceTo(end));
      p.vel.copy(d).multiplyScalar(10 + dist * 0.9);
      p.vel.y = Math.max(p.vel.y, 7);
      p.onGround = false;
      g.fx.burst(p.pos.x, p.pos.y + 0.2, p.pos.z, HEARTS, 24, { speed: 3, size: 0.1, up: 1, life: 0.6, spread: 0.3 });
      g.sound.jump();
      return;
    }
    if (!hit) {
      if (block) g.fx.burst(end.x, end.y, end.z, [new THREE.Color(def.color)], 10, { speed: 3, size: 0.08, up: 2, life: 0.5, spread: 0.1 });
      return;
    }
    if (hit.mob) this.onMob(kind, hit.mob, d);
    else if (hit.bot) this.onBot(kind, hit.bot, d);
    else if (hit.player) this.onPlayer(kind, hit.player);
  }

  onMob(kind, m, d) {
    const g = this.game;
    const name = m.def.name;
    if (kind === 'kill') {
      m.damage(1e9, d, true, m.pos.clone(), g.myId, {});
    } else if (kind === 'kick') {
      // Punted into the sky.
      m.yeet = { t: 0, v: new THREE.Vector3(d.x * 26, 20, d.z * 26) };
      g.hud.popup(`Kicked the ${name}!`, 'power');
      g.sound.landThud(1);
    } else if (kind === 'ban') {
      this.banned.add(m.type);
      g.queue = g.queue.filter((t) => t !== m.type);
      m.banish = { t: 0 };
      g.fx.burst(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z, VOID, 40, { speed: 4, size: 0.12, up: 1, life: 0.8, spread: 0.5, grav: -3 });
      g.hud.feed(`BANNED: no more ${name}s this game`, 'bad');
      g.sound.explosion(0.4, true);
    } else if (kind === 'freeze') {
      m.frozenT = 10;
      g.hud.popup(`Froze the ${name}`, 'power');
    }
  }

  onBot(kind, b, d) {
    const g = this.game;
    if (kind === 'kill') {
      // Straight through spawn protection.
      b.invuln = 0;
      b.frozenT = 0;
      b.takeHit(9999, true, null, g.myId, g.player.pos);
    } else if (kind === 'kick' || kind === 'ban') {
      if (kind === 'ban') this.bannedBots.add(b.name);
      g.fx.burst(b.pos.x, b.pos.y + 1, b.pos.z, kind === 'ban' ? VOID : [new THREE.Color('#ffb52e')], 36, { speed: 4, size: 0.12, up: 2, life: 0.8, spread: 0.4 });
      g.hud.feed(`${b.name} was ${kind === 'ban' ? 'banned' : 'kicked'} from the match`, 'me');
      g.removeBot(b);
    } else if (kind === 'freeze') {
      b.frozenT = 10;
      g.hud.popup(`Froze ${b.name}`, 'power');
    }
  }

  onPlayer(kind, r) {
    const g = this.game;
    if (!g.mp || !g.mp.isHost) return;
    if (kind === 'kill') {
      g.mp.sendHurt(r.id, 999, g.player.pos, 'cheat', null);
      g.hud.popup(`Zapped ${r.name}`, 'head');
    } else if (kind === 'kick' || kind === 'ban') {
      g.mp.net.send({ t: 'kick', to: r.id, ban: kind === 'ban' });
    } else {
      g.hud.popup(`The ${CHEAT_GUNS[kind].name} only works on mobs and bots`);
    }
  }
}
