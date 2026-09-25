import * as THREE from 'three';
import { buildAtlas, buildCrackTextures, buildWaterTexture, pixelTex, T } from './textures.js';
import { World, SX, SZ, SEA } from './world.js';
import { Input } from './input.js';
import { Sound } from './sound.js';
import { Particles, Tracers } from './fx.js';
import { SkinState } from './skin.js';
import { Player } from './player.js';
import { Mobs } from './mobs.js';
import { Hud } from './hud.js';
import { SkinPreview } from './preview.js';
import { SkinEditor } from './editor.js';
import { $, store } from './util.js';
import { mulberry32 } from './rng.js';

const SKY = new THREE.Color('#8fc6ea');

const SPLASHES = [
  'Blocks are load-bearing!',
  'Now 100% cube!',
  'Do not pet the Gloop.',
  'Bring your own skin!',
  'Aim for the head. It is a cube.',
  'Contains zero spheres!',
  'Press V to see yourself!',
  'Walls are temporary.',
  'Mossheads cannot read.',
  'Built one pixel at a time!',
];

const WAVE_TIPS = {
  1: 'Mossheads are waking up',
  2: 'Boneheads shoot from range. Build cover.',
  3: 'Gloops hop over two-block walls',
  4: 'Mossheads chew through walls if you hide too long',
};
const LATE_TIPS = ['They brought friends', 'Hold the high ground', 'Keep moving', 'Headshots do double damage'];

const DEATH_LINES = {
  moss: 'A Mosshead got you.',
  bone: 'Shot by a Bonehead.',
  gloop: 'Flattened by a Gloop.',
};

function randomSeed() {
  return (Math.random() * 2 ** 31) | 0;
}

class Game {
  constructor() {
    this.canvas = $('#game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.autoClear = false;
    this.renderer.setClearColor(SKY);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY, 42, 118);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x6b5a45, 2.4));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight(0xdcecff, 0x6b5a45, 2.4));
    const vsun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    vsun.position.set(-1, 2, 1.5);
    this.viewScene.add(vsun);

    this.atlas = buildAtlas();
    this.atlas.cracks = buildCrackTextures();
    this.world = new World(this.scene, this.atlas);
    this.buildEnvironment();

    this.sound = new Sound();
    this.fx = new Particles(this.scene);
    this.tracers = new Tracers(this.scene);
    this.skin = new SkinState();
    this.input = new Input(this.canvas);
    this.hud = new Hud(this.atlas);
    this.settings = {
      sens: parseFloat(store.get('sens', '1')) || 1,
      muted: store.get('muted', '0') === '1',
    };
    this.sound.setMuted(this.settings.muted);
    this.stats = { kills: 0, heads: 0, placed: 0, shots: 0, score: 0 };
    this.player = new Player(this);
    this.mobs = new Mobs(this);
    this.preview = new SkinPreview(this.skin);
    this.editor = new SkinEditor(this);
    try {
      this.best = JSON.parse(store.get('best', 'null'));
    } catch {
      this.best = null;
    }

    this.world.generate(randomSeed());
    this.world.flush();
    this.worldUsed = false;
    this.time = 0;
    this.menuAngle = 0.6;
    this.noLock = false;
    this.lastUnlock = 0;
    this.wave = 0;

    this.setupUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.skin.restore();
    this.setState('menu');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    // Handy for tinkering from the browser console.
    window.blockfire = this;
  }

  buildEnvironment() {
    const wt = buildWaterTexture();
    wt.repeat.set(400, 400);
    this.waterTex = wt;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({ map: wt, transparent: true, opacity: 0.78, depthWrite: false }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(SX / 2, SEA - 0.12, SZ / 2);
    water.renderOrder = 1;
    this.scene.add(water);

    const st = pixelTex(new THREE.CanvasTexture(this.atlas.tiles[T.SAND]));
    st.wrapS = st.wrapT = THREE.RepeatWrapping;
    st.repeat.set(400, 400);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ map: st, color: 0x8a8a80 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(SX / 2, SEA - 3.05, SZ / 2);
    this.scene.add(bed);

    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false }));
    this.sunDir = new THREE.Vector3(0.45, 0.62, -0.64).normalize();
    this.scene.add(this.sunMesh);

    // Flat blocky clouds on a grid that wraps, drifting slowly.
    const N = 32;
    const CELL = 8;
    const rng = mulberry32(99);
    let grid = Array.from({ length: N * N }, () => rng());
    for (let pass = 0; pass < 2; pass++) {
      const next = new Array(N * N);
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++) {
          let s = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s += grid[((z + dz + N) % N) * N + ((x + dx + N) % N)];
          next[z * N + x] = s / 9;
        }
      }
      grid = next;
    }
    const cells = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (grid[z * N + x] > 0.54) cells.push([x, z]);
    const clouds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CELL, 2, CELL),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false, depthWrite: false }),
      cells.length * 3,
    );
    const m = new THREE.Matrix4();
    let i = 0;
    for (let copy = -1; copy <= 1; copy++) {
      for (const [x, z] of cells) {
        m.makeTranslation(copy * N * CELL + x * CELL, 0, z * CELL - (N * CELL) / 2);
        clouds.setMatrixAt(i++, m);
      }
    }
    clouds.position.set(SX / 2 + 128, 40, SZ / 2);
    clouds.frustumCulled = false;
    clouds.renderOrder = 2;
    this.clouds = clouds;
    this.cloudSpan = N * CELL;
    this.scene.add(clouds);
  }

  setupUI() {
    $('#btn-play').addEventListener('click', () => this.play());
    $('#btn-skin').addEventListener('click', () => this.openEditor('menu'));
    $('#btn-skin-2').addEventListener('click', () => this.openEditor('menu'));
    $('#btn-sound').addEventListener('click', () => this.toggleSound());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-pause-skin').addEventListener('click', () => this.openEditor('paused'));
    $('#btn-quit').addEventListener('click', () => this.toMenu());
    $('#btn-again').addEventListener('click', () => this.play());
    $('#btn-title').addEventListener('click', () => this.toMenu());
    $('#ed-done').addEventListener('click', () => this.closeEditor());
    const sens = $('#sens');
    sens.value = String(this.settings.sens);
    sens.addEventListener('input', () => {
      this.settings.sens = parseFloat(sens.value) || 1;
      store.set('sens', this.settings.sens);
    });
    for (const b of document.querySelectorAll('.btn, .seg-btn')) {
      b.addEventListener('click', () => {
        this.sound.unlock();
        this.sound.click();
      });
    }
    this.syncSoundButton();

    const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    $('#touch-note').hidden = !coarse;

    this.input.onLockChange = (locked) => {
      if (locked) {
        this.noLock = false;
        this.input.free = false;
        return;
      }
      this.lastUnlock = performance.now();
      if (this.state === 'playing') this.pause();
    };
    this.input.onLockError = () => {
      if (this.state !== 'playing') return;
      if (performance.now() - this.lastUnlock < 1800) {
        // Browsers refuse to re-lock right after Esc. Ask for another click.
        this.pause('Your browser needs a moment after Esc. Press Resume again.');
      } else {
        // No pointer lock here (some embedded views). Mouse look still works
        // while the cursor is over the game.
        this.noLock = true;
        this.input.free = true;
      }
    };
    this.input.onEscape = () => {
      if (this.state === 'playing') this.pause();
    };
    this.canvas.addEventListener('mousedown', () => {
      if (this.state === 'playing' && !this.input.locked && !this.noLock) this.input.requestLock();
    });
  }

  toggleSound() {
    this.settings.muted = !this.settings.muted;
    store.set('muted', this.settings.muted ? '1' : '0');
    this.sound.setMuted(this.settings.muted);
    this.syncSoundButton();
  }

  syncSoundButton() {
    const b = $('#btn-sound');
    b.textContent = this.settings.muted ? 'Sound: off' : 'Sound: on';
    b.setAttribute('aria-pressed', String(!this.settings.muted));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCam.aspect = w / h;
    this.viewCam.updateProjectionMatrix();
  }

  setState(s) {
    this.state = s;
    document.body.dataset.state = s;
    $('#menu').hidden = s !== 'menu';
    $('#editor').hidden = s !== 'editor';
    $('#pause').hidden = s !== 'paused';
    $('#gameover').hidden = !(s === 'dead' && this.gameOverShown);
    this.hud.show(s === 'playing' || s === 'paused' || s === 'dead');
    this.input.active = s === 'playing';
    if (s !== 'playing') this.input.releaseAll();
    if (s === 'menu') {
      $('#splash').textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
      this.renderBest();
      this.preview.mount($('#menu-preview'), false);
      this.player.model.root.visible = false;
      this.player.selection.visible = false;
    } else if (s === 'editor') {
      this.preview.mount($('#editor-preview'), true);
      this.editor.onOpen();
    } else {
      this.preview.hide();
    }
  }

  renderBest() {
    const b = this.best;
    $('#best').textContent = b ? `Best run: wave ${b.wave}, ${b.score.toLocaleString('en-US')} points` : 'No runs yet. Survive as many waves as you can.';
  }

  // --- Flow between screens -------------------------------------------

  play() {
    this.sound.unlock();
    this.startGame();
    this.setState('playing');
    if (!this.noLock) this.input.requestLock();
    else this.input.free = true;
  }

  startGame() {
    if (this.worldUsed) {
      this.world.generate(randomSeed());
      this.world.flush();
    }
    this.worldUsed = true;
    this.mobs.clear();
    this.fx.clear();
    this.player.reset(this.world.spawnPoint());
    this.player.thirdPerson = false;
    this.stats = { kills: 0, heads: 0, placed: 0, shots: 0, score: 0 };
    this.wave = 0;
    this.waveState = 'rest';
    this.waveTimer = 3;
    this.queue = [];
    this.gameOverShown = false;
    this.deadT = 0;
    this.hud.reset();
    this.mobs.refreshFlow(true);
    this.hud.showBanner('Get ready', 'Build walls with right click. Shoot with left.', 3);
  }

  pause(msg = '') {
    $('#pause-msg').textContent = msg;
    $('#pause-msg').hidden = !msg;
    this.setState('paused');
  }

  resume() {
    this.setState('playing');
    if (!this.noLock) this.input.requestLock();
  }

  toMenu() {
    this.input.exitLock();
    this.mobs.clear();
    this.gameOverShown = false;
    this.setState('menu');
  }

  openEditor(from) {
    this.editorReturn = from;
    this.input.exitLock();
    this.setState('editor');
  }

  closeEditor() {
    this.setState(this.editorReturn || 'menu');
  }

  // --- Waves ----------------------------------------------------------

  beginWave(n) {
    this.wave = n;
    const moss = 3 + n;
    const bone = n >= 2 ? Math.floor(n / 2) + (n >= 5 ? 1 : 0) : 0;
    const gloop = n >= 3 ? n - 2 : 0;
    const q = [...Array(moss).fill('moss'), ...Array(bone).fill('bone'), ...Array(gloop).fill('gloop')];
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    this.queue = q;
    this.mul = { hp: 1 + (n - 1) * 0.08, speed: 1 + Math.min(0.3, (n - 1) * 0.03) };
    this.spawnTimer = 0.5;
    this.waveState = 'fight';
    const tip = WAVE_TIPS[n] || LATE_TIPS[n % LATE_TIPS.length];
    this.hud.showBanner(`Wave ${n}`, tip);
    this.sound.wave();
  }

  updateWaves(dt) {
    if (this.waveState === 'rest') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.beginWave(this.wave + 1);
      return;
    }
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.mobs.alive() < 18) {
      if (this.mobs.spawn(this.queue[this.queue.length - 1], this.mul)) this.queue.pop();
      this.spawnTimer = Math.max(0.35, 1.1 - this.wave * 0.06);
    }
    if (!this.queue.length && this.mobs.alive() === 0) {
      const bonus = 250 * this.wave;
      this.stats.score += bonus;
      this.player.heal(4);
      this.player.blocks = Math.min(99, this.player.blocks + 8);
      this.hud.showBanner(`Wave ${this.wave} cleared`, `+${bonus} points, +2 hearts, +8 blocks`);
      this.sound.cleared();
      this.waveState = 'rest';
      this.waveTimer = 6;
    }
  }

  onKill(mob, head) {
    const g = this;
    g.stats.kills++;
    if (head) g.stats.heads++;
    const pts = Math.round(mob.def.score * (head ? 1.5 : 1) * (1 + (g.wave - 1) * 0.1));
    g.stats.score += pts;
    g.hud.popup(head ? `Headshot +${pts}` : `+${pts}`, head ? 'head' : '');
    const p = g.player;
    const r = Math.random();
    if (r < 0.2 && p.hp < p.maxHp) g.mobs.spawnPickup('heart', mob.pos.x, mob.pos.y, mob.pos.z);
    else if (r < 0.42) g.mobs.spawnPickup('blocks', mob.pos.x, mob.pos.y, mob.pos.z);
  }

  onPlayerDeath() {
    this.hud.banner.hidden = true;
    this.setState('dead');
    this.deadT = 0;
  }

  showGameOver() {
    this.gameOverShown = true;
    this.input.exitLock();
    const s = this.stats;
    $('#go-line').textContent = DEATH_LINES[this.player.killer] || 'The cubes won this time.';
    $('#go-wave').textContent = String(this.wave);
    $('#go-score').textContent = s.score.toLocaleString('en-US');
    $('#go-kills').textContent = String(s.kills);
    $('#go-heads').textContent = String(s.heads);
    $('#go-placed').textContent = String(s.placed);
    const better = s.score > 0 && (!this.best || s.score > this.best.score);
    if (better) {
      this.best = { wave: this.wave, score: s.score };
      store.set('best', JSON.stringify(this.best));
    }
    $('#go-best').textContent = better
      ? 'New best run!'
      : this.best
        ? `Best run: wave ${this.best.wave}, ${this.best.score.toLocaleString('en-US')} points`
        : '';
    this.setState('dead');
  }

  // --- Frame ------------------------------------------------------------

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const s = this.state;

    if (s === 'playing' || s === 'dead') this.updatePlay(dt);
    else if (s === 'menu') this.updateMenu(dt);

    if (s !== 'editor') {
      this.world.flush(4);
      this.fx.update(dt, this.world);
      this.tracers.update(dt);
      this.updateSky(dt);
      this.render();
    }
    this.preview.frame(dt);
    this.hud.tick(dt);
    this.input.endFrame();
  }

  updatePlay(dt) {
    const p = this.player;
    p.update(dt);
    if (!p.dead) this.updateWaves(dt);
    this.mobs.update(dt);
    p.updateCamera(this.camera);
    p.updateModels();
    this.hud.setHealth(p.hp);
    this.hud.setAmmo(p.ammo, p.reloadT > 0 ? p.reloadT : 0);
    this.hud.setBlocks(p.blocks, p.slot);
    this.hud.setWave(this.wave, this.waveState === 'rest' ? null : this.queue.length + this.mobs.alive());
    this.hud.setScore(this.stats.score);
    if (p.dead) {
      this.deadT += dt;
      if (this.deadT > 1.6 && !this.gameOverShown) this.showGameOver();
    }
  }

  updateMenu(dt) {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.menuAngle += dt * 0.05;
    const a = this.menuAngle;
    this.camera.position.set(SX / 2 + Math.cos(a) * 44, 30, SZ / 2 + Math.sin(a) * 44);
    this.camera.lookAt(SX / 2, 8, SZ / 2);
    this.camera.updateMatrixWorld();
  }

  updateSky(dt) {
    this.waterTex.offset.x = (this.waterTex.offset.x + dt * 0.04) % 1;
    this.waterTex.offset.y = (this.waterTex.offset.y + dt * 0.015) % 1;
    const drift = (this.time * 1.2) % this.cloudSpan;
    this.clouds.position.x = SX / 2 + 128 - drift;
    this.sunMesh.position.copy(this.camera.position).addScaledVector(this.sunDir, 220);
    this.sunMesh.lookAt(this.camera.position);
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'paused') && !this.player.thirdPerson && !this.player.dead) {
      r.clearDepth();
      r.render(this.viewScene, this.viewCam);
    }
  }
}

function boot() {
  try {
    new Game();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('boot-error');
    if (el) el.hidden = false;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
