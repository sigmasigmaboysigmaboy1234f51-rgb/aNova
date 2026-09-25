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
import { Multiplayer } from './multiplayer.js';
import { parseAddress, DEFAULT_PORT } from './net.js';
import { $, store, inArtifactViewer } from './util.js';
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
  'Crouch to stay on ledges!',
  'Bring a friend!',
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

    this.desktop = !!window.blockfireDesktop;
    this.mp = null;
    this.inGame = false;
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
    this.waveState = 'rest';
    this.queue = [];
    this.netLeft = null;
    this.lastWaveMsg = null;

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

  // Does this computer run the mobs and waves? True in single player and
  // for the multiplayer host.
  get authority() {
    return !this.mp || this.mp.isHost;
  }

  get myId() {
    return this.mp ? this.mp.id : 0;
  }

  // Everyone the mobs can go after.
  targets() {
    const out = [];
    if (this.inGame && !this.player.dead) out.push(this.player);
    if (this.mp) for (const r of this.mp.remotes.list()) if (r.hasState && !r.dead) out.push(r);
    return out;
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
    $('#btn-mp').addEventListener('click', () => this.openMp());
    $('#btn-skin').addEventListener('click', () => this.openEditor('menu'));
    $('#btn-skin-2').addEventListener('click', () => this.openEditor('menu'));
    $('#btn-sound').addEventListener('click', () => this.toggleSound());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-pause-skin').addEventListener('click', () => this.openEditor('paused'));
    $('#btn-quit').addEventListener('click', () => this.toMenu());
    $('#btn-again').addEventListener('click', () => this.play());
    $('#btn-title').addEventListener('click', () => this.toMenu());
    $('#ed-done').addEventListener('click', () => this.closeEditor());
    $('#mp-back').addEventListener('click', () => {
      if (this.mp && !this.inGame) this.leaveMp();
      this.setState('menu');
    });
    $('#mp-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinFromForm();
    });
    $('#mp-host').addEventListener('click', () => this.hostGame());
    const quitApp = $('#btn-quit-app');
    quitApp.hidden = !this.desktop;
    quitApp.addEventListener('click', () => window.blockfireDesktop.quit());

    const name = $('#mp-name');
    name.value = store.get('name', '') || `Player${100 + Math.floor(Math.random() * 900)}`;
    name.addEventListener('change', () => store.set('name', this.mpName()));
    $('#mp-addr').value = store.get('addr', '');

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
    document.body.classList.toggle('desktop', this.desktop);

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
    // A click is what browsers need before they allow pointer lock, so any
    // click on the game tries again (joining a server starts without one).
    this.canvas.addEventListener('mousedown', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
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
    $('#mp').hidden = s !== 'mp';
    $('#editor').hidden = s !== 'editor';
    $('#pause').hidden = s !== 'paused';
    $('#gameover').hidden = !(s === 'dead' && this.gameOverShown);
    this.hud.show(s === 'playing' || s === 'paused' || s === 'dead');
    this.input.active = s === 'playing';
    if (s !== 'playing') {
      this.input.releaseAll();
      if (this.mp) this.mp.closeChat();
    }
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
    $('#best').textContent = b
      ? `Best run: wave ${b.wave}, ${b.score.toLocaleString('en-US')} points`
      : 'No runs yet. Survive as many waves as you can.';
  }

  // --- Single player ----------------------------------------------------

  play() {
    this.sound.unlock();
    if (this.mp) this.leaveMp();
    this.startGame();
    this.setState('playing');
    this.lockMouse();
  }

  lockMouse() {
    if (!this.noLock) this.input.requestLock();
    else this.input.free = true;
  }

  resetRun() {
    this.mobs.clear();
    this.fx.clear();
    this.player.reset(this.world.spawnPoint());
    this.player.thirdPerson = false;
    this.stats = { kills: 0, heads: 0, placed: 0, shots: 0, score: 0 };
    this.wave = 0;
    this.waveState = 'rest';
    this.waveTimer = 3;
    this.queue = [];
    this.netLeft = null;
    this.lastWaveMsg = null;
    this.gameOverShown = false;
    this.deadT = 0;
    this.respawnT = 0;
    this.hud.reset();
    this.inGame = true;
  }

  startGame() {
    if (this.worldUsed) {
      this.world.generate(randomSeed());
      this.world.flush();
    }
    this.worldUsed = true;
    this.resetRun();
    this.mobs.refreshFlow(true);
    this.hud.showBanner('Get ready', 'Build walls with right click. Shoot with left.', 3);
  }

  pause(msg = '') {
    $('#pause-msg').textContent = msg;
    $('#pause-msg').hidden = !msg;
    const info = $('#pause-mp');
    info.hidden = !this.mp;
    if (this.mp) info.textContent = this.mp.hosting ? this.mp.inviteText() : 'The game keeps going while you are paused.';
    $('#btn-quit').textContent = this.mp ? 'Leave game' : 'Quit to title';
    this.input.exitLock();
    this.setState('paused');
  }

  resume() {
    this.setState('playing');
    if (!this.noLock) this.input.requestLock();
  }

  toMenu() {
    this.input.exitLock();
    if (this.mp) this.leaveMp();
    this.inGame = false;
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

  // --- Multiplayer ------------------------------------------------------

  mpName() {
    return $('#mp-name').value.replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
  }

  mpStatus(text) {
    $('#mp-status').textContent = text;
  }

  openMp() {
    $('#mp-host-box').hidden = !this.desktop;
    $('#mp-web-note').hidden = this.desktop;
    $('#mp-artifact-note').hidden = !inArtifactViewer();
    this.mpStatus('');
    this.setState('mp');
  }

  async hostGame() {
    this.sound.unlock();
    store.set('name', this.mpName());
    this.mpStatus('Starting a server on this computer…');
    const res = await window.blockfireDesktop.host(DEFAULT_PORT);
    if (!res.ok) {
      this.mpStatus(res.error);
      return;
    }
    this.connect(`ws://127.0.0.1:${res.port}`, { hosting: true, addresses: res.addresses, port: res.port });
  }

  joinFromForm() {
    const raw = $('#mp-addr').value;
    const url = parseAddress(raw);
    if (!url) {
      this.mpStatus('Type the address the host gave you, like 192.168.1.23.');
      return;
    }
    store.set('addr', raw.trim());
    store.set('name', this.mpName());
    this.connect(url, {});
  }

  connect(url, opts) {
    this.sound.unlock();
    if (this.mp) this.leaveMp(false);
    this.mpStatus('Connecting…');
    this.mp = new Multiplayer(this, url, { name: this.mpName(), ...opts });
  }

  waitingForHost() {
    this.mpStatus('Connected. Waiting for the host to start the game…');
  }

  startMultiplayer(seed, edits, asHost) {
    this.world.generate(seed);
    for (const [x, y, z, b] of edits) this.world.set(x, y, z, b, true);
    this.world.flush();
    this.worldUsed = true;
    this.resetRun();
    if (asHost) {
      this.mobs.refreshFlow(true);
      this.hud.showBanner('Get ready', 'You are hosting. Friends can join any time.', 3);
    } else {
      this.hud.showBanner('Joined', 'Press T to chat. Hold Tab to see players.', 3);
    }
    this.setState('playing');
    this.lockMouse();
  }

  becomeHost() {
    const m = this.lastWaveMsg;
    this.wave = m ? m.n : 0;
    this.mul = this.waveMul(Math.max(1, this.wave));
    this.mobs.promote(this.mul);
    const left = m && m.left != null ? Math.max(0, m.left - this.mobs.alive()) : 0;
    this.queue = Array(left).fill('moss');
    this.waveState = m && !m.rest ? 'fight' : 'rest';
    this.waveTimer = 5;
    this.spawnTimer = 1;
  }

  leaveMp(stopServer = true) {
    const mp = this.mp;
    this.mp = null;
    if (mp) {
      mp.close();
      if (stopServer && mp.hosting && this.desktop) window.blockfireDesktop.stopHost();
    }
    this.inGame = false;
    this.mobs.clear();
    this.input.exitLock();
    document.body.classList.remove('is-dead');
  }

  onDisconnected(reason, msg) {
    const hosting = this.mp && this.mp.hosting;
    this.leaveMp(hosting);
    let text = msg;
    if (!text && reason === 'unreachable') {
      text = inArtifactViewer()
        ? 'This page is not allowed to connect to game servers. Use the Blockfire app or the downloaded game to play online.'
        : "Could not reach that server. Check the address, and that the host's firewall lets Blockfire through.";
    }
    this.openMp();
    this.mpStatus(text || 'Lost connection to the server.');
  }

  // --- Waves ----------------------------------------------------------

  waveMul(n) {
    return { hp: 1 + (n - 1) * 0.08, speed: 1 + Math.min(0.3, (n - 1) * 0.03) };
  }

  beginWave(n) {
    this.wave = n;
    const crowd = 1 + (this.mp ? this.mp.remotes.list().length * 0.5 : 0);
    const moss = Math.round((3 + n) * crowd);
    const bone = Math.round((n >= 2 ? Math.floor(n / 2) + (n >= 5 ? 1 : 0) : 0) * crowd);
    const gloop = Math.round((n >= 3 ? n - 2 : 0) * crowd);
    const q = [...Array(moss).fill('moss'), ...Array(bone).fill('bone'), ...Array(gloop).fill('gloop')];
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    this.queue = q;
    this.mul = this.waveMul(n);
    this.spawnTimer = 0.5;
    this.waveState = 'fight';
    const tip = WAVE_TIPS[n] || LATE_TIPS[n % LATE_TIPS.length];
    this.hud.showBanner(`Wave ${n}`, tip);
    this.sound.wave();
    if (this.mp) this.mp.sendBanner(`Wave ${n}`, tip, 'wave');
  }

  updateWaves(dt) {
    if (this.waveState === 'rest') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.beginWave(this.wave + 1);
      return;
    }
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.mobs.alive() < 18 + (this.mp ? 6 : 0)) {
      if (this.mobs.spawn(this.queue[this.queue.length - 1], this.mul)) this.queue.pop();
      this.spawnTimer = Math.max(0.35, 1.1 - this.wave * 0.06);
    }
    if (!this.queue.length && this.mobs.alive() === 0) {
      const bonus = 250 * this.wave;
      this.onWaveCleared(this.wave, bonus);
      if (this.mp) this.mp.sendCleared(this.wave, bonus);
      this.waveState = 'rest';
      this.waveTimer = 6;
    }
  }

  onWaveCleared(n, bonus) {
    this.stats.score += bonus;
    if (!this.player.dead) {
      this.player.heal(4);
      this.player.blocks = Math.min(99, this.player.blocks + 8);
    }
    this.hud.showBanner(`Wave ${n} cleared`, `+${bonus} points, +2 hearts, +8 blocks`);
    this.sound.cleared();
  }

  onKill(mob, head, byId) {
    const pts = Math.round(mob.def.score * (head ? 1.5 : 1) * (1 + (this.wave - 1) * 0.1));
    if (!byId || byId === this.myId) this.creditKill(pts, head);
    else if (this.mp) this.mp.sendKill(byId, pts, head);
    const r = Math.random();
    let pk = null;
    if (r < 0.2) pk = this.mobs.spawnPickup('heart', mob.pos.x, mob.pos.y, mob.pos.z);
    else if (r < 0.42) pk = this.mobs.spawnPickup('blocks', mob.pos.x, mob.pos.y, mob.pos.z);
    if (pk && this.mp) this.mp.pickupAdded(pk);
  }

  creditKill(pts, head) {
    this.stats.kills++;
    if (head) this.stats.heads++;
    this.stats.score += pts;
    this.hud.popup(head ? `Headshot +${pts}` : `+${pts}`, head ? 'head' : '');
  }

  onPlayerDeath() {
    this.hud.banner.hidden = true;
    if (this.mp) {
      this.mp.sendDied(this.player.killer);
      this.respawnT = 5;
      this.hud.showBanner('You died', 'Back in 5', 5.5);
      return;
    }
    this.setState('dead');
    this.deadT = 0;
  }

  respawn() {
    const s = this.world.spawnPoint();
    const third = this.player.thirdPerson;
    this.player.reset(s);
    this.player.thirdPerson = third;
    this.hud.banner.hidden = true;
    this.fx.burst(s.x, s.y + 1, s.z, this.atlas.colors[T.GRASS_TOP], 16, { speed: 2.5, size: 0.1, up: 3, life: 0.7, spread: 0.4 });
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

    // Multiplayer never pauses: the world keeps going for everyone else.
    if (this.inGame && (this.mp || s === 'playing' || s === 'dead')) this.updatePlay(dt);
    else if (s === 'menu' || s === 'mp') this.updateMenu(dt);
    if (this.mp && !this.inGame) this.mp.update(dt);

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
    if (this.mp && this.state === 'playing' && (this.input.pressed.has('KeyT') || this.input.pressed.has('Enter'))) {
      this.mp.openChat();
    }
    if (this.authority) {
      if (!p.dead || this.mp) this.updateWaves(dt);
      this.mobs.update(dt);
    } else {
      this.mobs.updateRemote(dt);
    }
    if (this.mp) this.mp.update(dt);
    p.updateCamera(this.camera, dt);
    p.updateModels(dt);
    document.body.classList.toggle('is-dead', p.dead);
    this.hud.setHealth(p.hp);
    this.hud.setAmmo(p.ammo, p.reloadT > 0 ? p.reloadT : 0);
    this.hud.setBlocks(p.blocks, p.slot);
    const left = this.waveState === 'rest' ? null : this.authority ? this.queue.length + this.mobs.alive() : this.netLeft;
    this.hud.setWave(this.wave, left);
    this.hud.setScore(this.stats.score);
    if (p.dead) {
      if (this.mp) {
        const before = Math.ceil(this.respawnT);
        this.respawnT -= dt;
        if (Math.ceil(this.respawnT) !== before && this.respawnT > 0) this.hud.showBanner('You died', `Back in ${Math.ceil(this.respawnT)}`, 1.5);
        if (this.respawnT <= 0) this.respawn();
      } else {
        this.deadT += dt;
        if (this.deadT > 1.6 && !this.gameOverShown) this.showGameOver();
      }
    }
  }

  updateMenu(dt) {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.menuAngle += dt * 0.05;
    const a = this.menuAngle;
    this.camera.position.set(SX / 2 + Math.cos(a) * 44, 30, SZ / 2 + Math.sin(a) * 44);
    this.camera.lookAt(SX / 2, 8, SZ / 2);
    if (this.camera.fov !== 75) {
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
    }
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
    if ((this.state === 'playing' || this.state === 'paused') && this.inGame && !this.player.thirdPerson && !this.player.dead) {
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
