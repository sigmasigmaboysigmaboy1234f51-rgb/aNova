import * as THREE from 'three';
import { buildAtlas, buildCrackTextures, buildWaterTexture, pixelTex, T } from './textures.js';
import { World, SX, SZ, SEA } from './world.js';
import { Input } from './input.js';
import { Sound } from './sound.js';
import { Particles, Tracers } from './fx.js';
import { SkinState } from './skin.js';
import { Player, MAX_NADES } from './player.js';
import { Profile } from './profile.js';
import { Combat } from './combat.js';
import { Armory } from './armory.js';
import { Bestiary } from './bestiary.js';
import { StoryRun, StoryMenu, Dialogue } from './story.js';
import { CHAPTERS } from './storydata.js';
import { THEMES } from './themes.js';
import { Progress, xpForLevel } from './progress.js';
import { Challenges } from './challenges.js';
import { Duel, TARGET } from './duel.js';
import { MAPS, MAP_ORDER } from './maps.js';
import { Bot, BOT_NAMES } from './bots.js';
import { Modes, VARIANTS, bestFor } from './modes.js';
import { Pet } from './pets.js';
import { DamageNumbers } from './popnums.js';
import { SettingsScreen, loadSettings } from './settings.js';
import { Sky } from './sky.js';
import { Wheel } from './wheel.js';
import { Cheats } from './cheats.js';
import { POWER_ORDER } from './powerups.js';
import { Wardrobe } from './wardrobe.js';
import { GUNS, RARITY, rollPart } from './weapons.js';
import { pickMob } from './mobtypes.js';
import { BOSSES } from './boss.js';
import { Mobs } from './mobs.js';
import { Adventure, CITY_THEME } from './adventure.js';
import { Hud } from './hud.js';
import { SkinPreview } from './preview.js';
import { SkinEditor } from './editor.js';
import { Multiplayer } from './multiplayer.js';
import { parseAddress } from './net.js';
import { cleanCode } from './p2p.js';
import { $, store, inArtifactViewer } from './util.js';
import { mulberry32 } from './rng.js';

const COMBO_TIME = 3;
const STREAKS = [
  { n: 5, name: 'Killing spree!' },
  { n: 10, name: 'Rampage!' },
  { n: 15, name: 'Unstoppable!' },
  { n: 20, name: 'Godlike!' },
  { n: 30, name: 'LEGENDARY!' },
  { n: 50, name: 'BLOCK MASTER!' },
  { n: 100, name: 'ARE YOU EVEN HUMAN?!' },
];
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
  'Now with 12 guns!',
  'Try the Tesla Coil!',
  'Scopes are for headshots!',
  'Grenades break walls. Yours too.',
];

const WAVE_TIPS = {
  1: 'Mossheads are waking up',
  2: 'Boneheads shoot from range. Build cover.',
  3: 'Gloops hop over two-block walls. Tiny and Giant mobs appear.',
  4: 'Skitters leap at you. Frost and Blazing mobs have nasty hits.',
  6: 'Ember Imps throw fire over your walls',
  7: 'Fuses explode. Shoot them before they reach you!',
  8: 'Rust Knights block shots with their shields. Aim for the head.',
  9: 'Cobble Golems smash straight through walls',
  11: 'Flappers fly over everything',
  12: 'Specters float through blocks. Nowhere is safe.',
};
const LATE_TIPS = [
  'They brought friends',
  'Hold the high ground',
  'Keep moving',
  'Headshots do double damage',
  'Press B to spend your coins',
  'Throw a grenade with G',
];

const DEATH_LINES = {
  moss: 'A Mosshead got you.',
  bone: 'Shot by a Bonehead.',
  gloop: 'Flattened by a Gloop.',
  skitter: 'A Skitter jumped you.',
  imp: 'Roasted by an Ember Imp.',
  fuse: 'A Fuse blew up in your face.',
  knight: 'Cut down by a Rust Knight.',
  golem: 'Pounded flat by a Cobble Golem.',
  bat: 'Bitten by a Flapper.',
  ghost: 'Spooked to death by a Specter.',
  boss: 'Crushed by a boss.',
  self: 'Caught in your own explosion.',
  lava: 'Went for a swim in lava.',
  cheat: 'Zapped by the host\u2019s Kill Gun.',
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
    this.hemi = new THREE.HemisphereLight(0xdcecff, 0x6b5a45, 2.4);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    this.sun = sun;

    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
    this.viewHemi = new THREE.HemisphereLight(0xdcecff, 0x6b5a45, 2.4);
    this.viewScene.add(this.viewHemi);
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
    this.hud = new Hud(this);
    this.dnums = new DamageNumbers(this, $('#dnums'));
    this.settings = loadSettings();
    this.sound.setMuted(this.settings.muted);
    this.stats = { kills: 0, heads: 0, placed: 0, shots: 0, score: 0, coins: 0 };
    this.profile = new Profile();
    this.combat = new Combat(this);
    this.player = new Player(this);
    this.armory = new Armory(this);
    this.bestiary = new Bestiary(this);
    this.progress = new Progress(this);
    this.dialogue = new Dialogue(this);
    this.storyMenu = new StoryMenu(this);
    this.challenges = new Challenges(this);
    this.modes = new Modes(this);
    this.story = null;
    this.duel = null;
    this.adventure = null;
    this.bots = [];
    this.botDuel = null;
    this.variant = 'endless';
    this.profile.listeners.add(() => this.player.refreshLoadout());
    this.mobs = new Mobs(this);
    this.preview = new SkinPreview(this.skin);
    this.editor = new SkinEditor(this);
    this.wardrobe = new Wardrobe(this);
    this.wheel = new Wheel(this);
    this.cheats = new Cheats(this);
    this.cheatRun = false;
    this.preview.dress(this.profile.style);
    let styleKey = this.profile.styleCode();
    this.profile.listeners.add(() => {
      const k = this.profile.styleCode();
      if (k === styleKey) return;
      styleKey = k;
      if (this.state !== 'style') this.preview.dress(this.profile.style);
    });
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
    if (this.story && this.inGame) out.push(...this.story.extraTargets());
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
    this.water = water;
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
    this.sky = new Sky(this);
  }

  setupUI() {
    $('#btn-play').addEventListener('click', () => this.setState('modes'));
    $('#btn-mp').addEventListener('click', () => this.openMp());
    $('#btn-skin').addEventListener('click', () => this.openEditor('menu'));
    $('#btn-skin-2').addEventListener('click', () => this.openEditor('menu'));
    $('#btn-armory').addEventListener('click', () => this.openArmory('menu'));
    $('#btn-bestiary').addEventListener('click', () => this.setState('bestiary'));
    $('#btn-style').addEventListener('click', () => this.setState('style'));
    $('#btn-wheel').addEventListener('click', () => this.setState('wheel'));
    $('#btn-cheats').addEventListener('click', () => this.cheats.open('menu'));
    $('#btn-pause-cheats').addEventListener('click', () => this.cheats.open('paused'));
    $('#btn-story').addEventListener('click', () => this.setState('story'));
    $('#btn-adventure').addEventListener('click', () => this.startAdventure());
    $('#btn-challenges').addEventListener('click', () => this.setState('challenges'));
    $('#sw-next').addEventListener('click', () => {
      const next = this.story ? this.story.index + 1 : 0;
      if (next < CHAPTERS.length) this.startStory(next);
      else this.endStory('story');
    });
    $('#sw-list').addEventListener('click', () => this.endStory('story'));
    $('#sf-retry').addEventListener('click', () => {
      if (!this.story) return;
      this.story.retry();
      this.setState('playing');
      this.lockMouse();
    });
    $('#sf-quit').addEventListener('click', () => this.endStory('story'));
    $('#btn-pause-armory').addEventListener('click', () => this.openArmory('paused'));
    $('#btn-sound').addEventListener('click', () => this.toggleSound());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-pause-skin').addEventListener('click', () => this.openEditor('paused'));
    $('#btn-quit').addEventListener('click', () => this.toMenu());
    $('#btn-again').addEventListener('click', () => this.play(this.variant));
    $('#btn-title').addEventListener('click', () => this.toMenu());
    $('#ed-done').addEventListener('click', () => this.closeEditor());
    $('#mp-back').addEventListener('click', () => {
      if (this.mp && !this.inGame) this.leaveMp();
      this.setState('menu');
    });
    $('#mp-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinByCode();
    });
    $('#mp-addr-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinFromForm();
    });
    $('#btn-copy-code').addEventListener('click', () => {
      const code = this.mp && this.mp.code;
      if (!code) return;
      const done = () => ($('#btn-copy-code').textContent = 'Copied!');
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, () => {});
    });
    $('#mp-host').addEventListener('click', () => this.hostGame());
    const quitApp = $('#btn-quit-app');
    quitApp.hidden = !this.desktop;
    quitApp.addEventListener('click', () => window.blockfireDesktop.quit());

    const name = $('#mp-name');
    name.value = store.get('name', '') || `Player${100 + Math.floor(Math.random() * 900)}`;
    name.addEventListener('change', () => store.set('name', this.mpName()));
    $('#mp-addr').value = store.get('addr', '');
    const modes = $('#mp-mode');
    for (const id of MAP_ORDER) {
      const o = document.createElement('option');
      o.value = `duel:${id}`;
      o.textContent = `1v1 Duel: ${MAPS[id].name}. ${MAPS[id].desc}`;
      modes.appendChild(o);
    }

    this.settingsScreen = new SettingsScreen(this);
    $('#btn-settings').addEventListener('click', () => this.settingsScreen.open('menu'));
    $('#btn-pause-settings').addEventListener('click', () => this.settingsScreen.open('paused'));
    this.fpsEl = $('#fps');
    this.fpsN = 0;
    this.fpsT = 0;
    this.applySettings();
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

  // Things the Settings screen changes.
  applySettings() {
    const s = this.settings;
    const dpr = window.devicePixelRatio || 1;
    const ratio = s.quality === 'low' ? 0.6 : s.quality === 'medium' ? Math.min(dpr, 1) : Math.min(dpr, 1.75);
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
      this.resize();
    }
    this.sound.setVolume(s.volume / 100);
    this.dnums.enabled = s.dmgNums;
    if (!s.dmgNums) this.dnums.clear();
    if (this.fpsEl) this.fpsEl.hidden = !s.showFps;
    if (this.sky) this.sky.setEnabled(s.dayNight, s.weather);
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
    if (s !== 'talk' && this.dialogue && this.dialogue.open) this.dialogue.cancel();
    this.state = s;
    document.body.dataset.state = s;
    $('#menu').hidden = s !== 'menu';
    $('#mp').hidden = s !== 'mp';
    $('#editor').hidden = s !== 'editor';
    if (s === 'armory') this.armory.show();
    else if (this.armory.open) this.armory.hide();
    if (s === 'bestiary') this.bestiary.show();
    else if (this.bestiary.open) this.bestiary.hide();
    if (s === 'story') this.storyMenu.show();
    else this.storyMenu.hide();
    if (s === 'challenges') this.challenges.show();
    else this.challenges.hide();
    if (s === 'modes') this.modes.show();
    else this.modes.hide();
    if (s === 'style') this.wardrobe.show();
    else this.wardrobe.hide();
    if (s === 'settings') this.settingsScreen.show();
    else this.settingsScreen.hide();
    if (s === 'wheel') this.wheel.show();
    else if (this.wheel.open) this.wheel.hide();
    if (s === 'cheats') this.cheats.show();
    else this.cheats.hide();
    $('#storywin').hidden = s !== 'storywin';
    $('#storyfail').hidden = s !== 'storyfail';
    $('#pause').hidden = s !== 'paused';
    $('#gameover').hidden = !(s === 'dead' && this.gameOverShown);
    this.hud.show(s === 'playing' || s === 'paused' || s === 'dead' || s === 'talk');
    this.input.active = s === 'playing';
    if (s !== 'playing') {
      this.input.releaseAll();
      if (this.mp) this.mp.closeChat();
      if (this.adventure) this.adventure.quiet();
    }
    if (s === 'menu') {
      this.renderLevel();
      this.refreshWheelDot();
      $('#splash').textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
      this.renderBest();
      this.preview.mount($('#menu-preview'), false);
      this.player.model.root.visible = false;
      this.player.selection.visible = false;
    } else if (s === 'editor') {
      this.preview.mount($('#editor-preview'), true);
      this.editor.onOpen();
    } else if (s === 'style') {
      this.preview.mount($('#st-preview'), false);
    } else {
      this.preview.hide();
    }
  }

  refreshWheelDot() {
    $('#wheel-dot').hidden = !this.wheel.freeReady();
  }

  renderLevel() {
    const p = this.profile;
    const need = xpForLevel(p.level);
    $('#lvl-num').textContent = `Level ${p.level}`;
    $('#lvl-fill').style.width = `${Math.round((p.xp / need) * 100)}%`;
    $('#lvl-xp').textContent = `${p.xp} / ${need} XP`;
  }

  // Sky, fog and light for the place you are in.
  applyTheme(th) {
    const t = th || THEMES.meadow;
    this.sky.end();
    const sky = new THREE.Color(t.sky);
    this.renderer.setClearColor(sky);
    this.scene.fog.color.set(t.fogColor || t.sky);
    this.scene.fog.near = t.fog[0];
    this.scene.fog.far = t.fog[1];
    this.hemi.intensity = 2.4 * t.light;
    this.sun.intensity = 2 * t.light;
    this.sun.color.set(t.sun || '#fff1d6');
    this.viewHemi.intensity = 2.4 * Math.max(0.6, t.light);
    this.water.material.color.set(t.water || '#ffffff');
    this.clouds.visible = t.light > 0.5 && !t.moon;
    this.sunMesh.material.color.set(t.moon ? '#e8eeff' : t.sun || '#fff6cf');
    this.sunMesh.scale.setScalar(t.moon ? 0.6 : 1);
  }

  // --- Story -----------------------------------------------------------

  startStory(index) {
    this.sound.unlock();
    if (this.mp) this.leaveMp();
    this.endAdventure();
    this.clearBots();
    this.duel = null;
    this.botDuel = null;
    if (this.story) this.story.dispose();
    const ch = CHAPTERS[index];
    this.world.generate(1000 + index * 77, THEMES[ch.theme]);
    this.world.flush();
    this.worldUsed = true;
    this.applyTheme(THEMES[ch.theme]);
    this.story = null;
    this.resetRun();
    this.story = new StoryRun(this, index);
    this.mobs.refreshFlow(true);
    this.hud.showBanner(`Chapter ${index + 1}`, ch.title, 3);
    this.setState('playing');
    this.story.begin();
  }

  endStory(toState = 'menu') {
    if (this.story) this.story.dispose();
    this.story = null;
    this.inGame = false;
    this.mobs.clear();
    this.combat.clear();
    this.input.exitLock();
    this.setState(toState);
  }

  // Show a conversation, then carry on.
  talk(lines, done) {
    if (!lines || !lines.length) {
      done();
      return;
    }
    this.input.exitLock();
    this.setState('talk');
    this.dialogue.play(lines, () => {
      this.setState('playing');
      this.lockMouse();
      done();
    });
  }

  storyFail(why) {
    this.input.exitLock();
    $('#sf-title').textContent = why;
    this.setState('storyfail');
  }

  storyWin(index, stars, rewards, time) {
    this.input.exitLock();
    $('#sw-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const why = $('#sw-why');
    why.textContent = '';
    const ch = CHAPTERS[index];
    const mins = Math.floor(time / 60);
    const secs = String(Math.floor(time % 60)).padStart(2, '0');
    for (const [ok, text] of [
      [true, 'Finished the chapter'],
      [this.story && this.story.deaths === 0, 'Never got cubed'],
      [time <= ch.par, `Finished in ${mins}:${secs} (goal: ${Math.floor(ch.par / 60)}:00)`],
    ]) {
      const li = document.createElement('li');
      li.textContent = `${ok ? '★' : '☆'} ${text}`;
      why.appendChild(li);
    }
    const ul = $('#sw-rewards');
    ul.textContent = '';
    for (const r of rewards) {
      const li = document.createElement('li');
      li.textContent = r;
      ul.appendChild(li);
    }
    $('#sw-next').textContent = index + 1 < CHAPTERS.length ? 'Next chapter' : 'Back to chapters';
    this.setState('storywin');
  }

  renderBest() {
    const b = this.best;
    $('#best').textContent = b
      ? `Best run: wave ${b.wave}, ${b.score.toLocaleString('en-US')} points`
      : 'No runs yet. Survive as many waves as you can.';
  }

  // --- Single player ----------------------------------------------------

  play(variant = this.variant || 'endless') {
    this.sound.unlock();
    if (this.mp) this.leaveMp();
    this.endAdventure();
    if (this.story) this.story.dispose();
    this.story = null;
    this.clearBots();
    this.duel = null;
    this.botDuel = null;
    this.variant = VARIANTS[variant] ? variant : 'endless';
    this.startGame();
    this.setState('playing');
    this.lockMouse();
  }

  // --- Bots ------------------------------------------------------------

  // Everyone you can hit in a duel.
  pvpTargets() {
    return [...(this.duel && this.mp ? this.mp.remotes.list() : []), ...this.bots];
  }

  addBot(name, level) {
    const b = new Bot(this, name, level, (Math.random() * 1e9) | 0);
    this.bots.push(b);
    const s = this.duel.spawnFor(b.id);
    b.spawn(s.pos, s.yaw);
    return b;
  }

  removeBot(b) {
    b.dispose();
    this.bots = this.bots.filter((x) => x !== b);
  }

  clearBots() {
    for (const b of this.bots) b.dispose();
    this.bots = [];
  }

  startBotDuel(opts) {
    this.sound.unlock();
    if (this.mp) this.leaveMp();
    this.endAdventure();
    if (this.story) this.story.dispose();
    this.story = null;
    this.clearBots();
    this.botDuel = opts;
    this.variant = 'endless';
    this.duel = new Duel(this, opts.map);
    this.duel.build();
    this.applyTheme(this.duel.theme);
    this.world.flush();
    this.worldUsed = true;
    this.resetRun();
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < opts.count; i++) {
      this.bots.push(new Bot(this, names[i], opts.level, (Math.random() * 1e9) | 0));
    }
    this.duel.placePlayer();
    for (const b of this.bots) {
      const s = this.duel.spawnFor(b.id);
      b.spawn(s.pos, s.yaw);
    }
    this.hud.showBanner(`Bot Duel: ${this.duel.map.name}`, `First to ${TARGET} knockouts wins`, 3.5);
    this.setState('playing');
    this.lockMouse();
  }

  // --- Adventure -------------------------------------------------------

  // Blockton: a town with cars, people and jobs to do.
  startAdventure() {
    this.sound.unlock();
    if (this.mp) this.leaveMp();
    if (this.story) this.story.dispose();
    this.story = null;
    this.clearBots();
    this.duel = null;
    this.botDuel = null;
    this.variant = 'endless';
    this.endAdventure();
    this.mobs.clear();
    this.adventure = new Adventure(this);
    this.adventure.start();
    this.worldUsed = true;
    this.applyTheme(CITY_THEME);
    this.sky.begin(CITY_THEME);
    this.resetRun();
    this.player.reset(this.adventure.spawn);
    // Look at your car.
    const mine = this.adventure.cars.find((c) => c.mine);
    if (mine) this.player.yaw = Math.atan2(this.player.pos.x - mine.pos.x, this.player.pos.z - mine.pos.z);
    this.mobs.refreshFlow(true);
    const first = !this.profile.adv || !Object.keys(this.profile.adv.done || {}).length;
    this.hud.showBanner('Blockton', first ? 'Your car is in the driveway. Walk up to it and press E!' : 'Talk to people with a ! for jobs', 4.5);
    this.progress.event('adventure', {});
    this.setState('playing');
    this.lockMouse();
  }

  endAdventure() {
    if (!this.adventure) return;
    this.adventure.dispose();
    this.adventure = null;
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
    this.stats = { kills: 0, heads: 0, placed: 0, shots: 0, score: 0, coins: 0, bestCombo: 0, bestStreak: 0 };
    this.combat.clear();
    this.combo = 0;
    this.comboT = 0;
    this.streak = 0;
    this.cheatRun = false;
    this.dnums.clear();
    this.wave = 0;
    this.waveState = 'rest';
    this.waveTimer = 3;
    this.queue = [];
    this.bossPending = null;
    this.netLeft = null;
    this.lastWaveMsg = null;
    this.gameOverShown = false;
    this.deadT = 0;
    this.respawnT = 0;
    this.hud.reset();
    this.inGame = true;
  }

  startGame() {
    if (this.worldUsed || (this.world.theme && this.world.theme !== THEMES.meadow)) {
      this.world.generate(randomSeed(), THEMES.meadow);
      this.world.flush();
    }
    this.applyTheme(THEMES.meadow);
    this.sky.begin(THEMES.meadow);
    this.worldUsed = true;
    this.resetRun();
    this.mobs.refreshFlow(true);
    this.hud.showBanner('Get ready', 'Shoot with left click, aim with right. Press B for the Armory.', 3.5);
  }

  pause(msg = '') {
    $('#pause-msg').textContent = msg;
    $('#pause-msg').hidden = !msg;
    const info = $('#pause-mp');
    info.hidden = !this.mp;
    if (this.mp) info.textContent = this.mp.hosting ? 'You are hosting. Friends join with this code:' : 'The game keeps going while you are paused.';
    const code = this.mp && this.mp.hosting && this.mp.code;
    $('#pause-code').hidden = !code;
    if (code) {
      $('#pause-code-text').textContent = code;
      $('#btn-copy-code').textContent = 'Copy';
    }
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
    this.endAdventure();
    if (this.story) this.story.dispose();
    this.story = null;
    this.clearBots();
    this.cheats.reset();
    if (this.pet) this.pet.dispose();
    this.pet = null;
    this.duel = null;
    this.botDuel = null;
    this.inGame = false;
    this.mobs.clear();
    this.gameOverShown = false;
    if (this.sky.active) this.applyTheme(THEMES.meadow);
    this.setState('menu');
  }

  // In single player the Armory pauses the game. In multiplayer the world
  // keeps going, so find a safe spot first.
  openArmory(from) {
    this.armoryReturn = from;
    this.input.exitLock();
    this.setState('armory');
  }

  closeBestiary() {
    this.setState('menu');
  }

  closeArmory() {
    const back = this.armoryReturn || 'menu';
    if (back === 'playing' || (back === 'paused' && this.mp)) {
      this.setState('playing');
      this.lockMouse();
    } else {
      this.setState(back);
    }
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
    $('#mp-artifact-note').hidden = !inArtifactViewer();
    this.mpStatus('');
    this.setState('mp');
  }

  // Host an online game from this computer. Friends join with the code.
  hostGame() {
    this.sound.unlock();
    store.set('name', this.mpName());
    this.mpMode = $('#mp-mode').value || 'coop';
    this.mpStatus('Getting a join code…');
    this.connect({ kind: 'host' });
  }

  onHostCode(code) {
    this.mpStatus(`Your join code is ${code}.`);
    if (this.mp) this.mp.system(this.mp.inviteText());
    this.hud.showBanner(code, 'Your join code. Friends type it under Multiplayer, Join a friend.', 6);
  }

  joinByCode() {
    const code = cleanCode($('#mp-code').value);
    if (!code) {
      this.mpStatus('A join code is 6 letters and numbers, like K7P2QX.');
      return;
    }
    store.set('name', this.mpName());
    this.mpStatus(`Looking for game ${code}…`);
    this.connect({ kind: 'join', code });
  }

  joinFromForm() {
    const raw = $('#mp-addr').value;
    const url = parseAddress(raw);
    if (!url) {
      this.mpStatus('Type the server address, like 192.168.1.23.');
      return;
    }
    store.set('addr', raw.trim());
    store.set('name', this.mpName());
    this.mpStatus('Connecting…');
    this.connect({ kind: 'server', url });
  }

  connect(opts) {
    this.sound.unlock();
    if (this.mp) this.leaveMp();
    this.mp = new Multiplayer(this, { name: this.mpName(), ...opts });
  }

  waitingForHost() {
    this.mpStatus('Connected. Waiting for the host to start the game…');
  }

  startMultiplayer(seed, edits, asHost, mode) {
    this.endAdventure();
    if (this.story) this.story.dispose();
    this.story = null;
    this.duel = null;
    this.clearBots();
    this.botDuel = null;
    this.variant = 'endless';
    if (typeof mode === 'string' && mode.startsWith('duel:')) {
      this.duel = new Duel(this, mode.slice(5));
      this.duel.build();
      this.applyTheme(this.duel.theme);
    } else {
      this.world.generate(seed, THEMES.meadow);
      this.applyTheme(THEMES.meadow);
      this.sky.begin(THEMES.meadow);
    }
    for (const [x, y, z, b] of edits) this.world.set(x, y, z, b, true);
    this.world.flush();
    this.worldUsed = true;
    this.resetRun();
    if (this.duel) {
      this.duel.placePlayer();
      this.hud.showBanner(`Duel: ${this.duel.map.name}`, `First to ${TARGET} knockouts wins. No mobs, just you and them.`, 4);
      this.setState('playing');
      this.lockMouse();
      return;
    }
    if (asHost) {
      this.mobs.refreshFlow(true);
      if (this.mp && this.mp.code) this.hud.showBanner(this.mp.code, 'Your join code. Press Esc to see it again.', 6);
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

  leaveMp() {
    const mp = this.mp;
    this.mp = null;
    this.duel = null;
    if (mp) mp.close();
    this.inGame = false;
    this.mobs.clear();
    this.input.exitLock();
    document.body.classList.remove('is-dead');
  }

  onDisconnected(reason, msg) {
    this.leaveMp();
    const why = {
      unreachable: "Could not reach that server. Check the address, and that the server's firewall lets Blockfire through.",
      nocode: 'No game found with that code. Check the code, and that your friend is still hosting.',
      broker: 'Could not reach the online game service. Check your internet connection and try again.',
      webrtc: "This browser can't play online. Use the Blockfire app, or Chrome, Edge or Firefox.",
      lost: 'Lost connection to the game.',
    };
    let text = msg || why[reason] || why.lost;
    if (!msg && inArtifactViewer() && reason !== 'lost') text = "This page can't go online. Download Blockfire to play with friends.";
    this.openMp();
    this.mpStatus(text);
  }

  // --- Waves ----------------------------------------------------------

  waveMul(n) {
    return { hp: 1 + (n - 1) * 0.08, speed: 1 + Math.min(0.3, (n - 1) * 0.03) };
  }

  beginWave(n) {
    this.wave = n;
    this.sky.onWave(n, this.world.seed);
    const crowd = 1 + (this.mp ? this.mp.remotes.list().length * 0.5 : 0);
    const rush = this.variant === 'bossrush' && !this.mp;
    const horde = this.variant === 'horde' && !this.mp;
    const bossWave = rush || n % 5 === 0;
    let count = Math.round((4 + n * 1.7 + (n > 10 ? (n - 10) * 0.8 : 0)) * crowd * (bossWave ? 0.45 : 1));
    if (rush) count = 2 + Math.floor(n / 2);
    if (horde) count = Math.round(count * 3.2);
    const q = [];
    for (let i = 0; i < count; i++) {
      // The Horde is all tiny mobs. Mobs hit by the Ban Gun don't come back.
      const pick = () => {
        const t = pickMob(horde ? n + 4 : n);
        return horde ? `${t.split(':')[0]}:mini` : t;
      };
      let t = pick();
      for (let k = 0; k < 12 && this.cheats.banned.has(t); k++) t = pick();
      if (!this.cheats.banned.has(t)) q.push(t);
    }
    this.queue = q;
    this.bossPending = null;
    if (bossWave) {
      // Every fifth wave brings the next boss. After all ten, they come
      // back tougher. Boss Rush brings one every wave.
      const k = rush ? n - 1 : n / 5 - 1;
      const loop = Math.floor(k / BOSSES.length);
      this.bossPending = { index: k % BOSSES.length, boost: crowd * (1 + loop * 0.8) * (1 + k * 0.04), t: 2.5 };
      if (this.cheats.banned.has(BOSSES[k % BOSSES.length].type)) this.bossPending = null;
    }
    this.mul = this.waveMul(n);
    this.spawnTimer = 0.5;
    this.waveState = 'fight';
    if (this.bossPending) {
      const b = BOSSES[this.bossPending.index];
      const sub = `${b.name}: ${b.title}`;
      this.hud.showBanner(`Boss wave ${n}`, sub, 3.5);
      this.sound.roar(1);
      if (this.mp) this.mp.sendBanner(`Boss wave ${n}`, sub, 'wave');
      return;
    }
    const tip = WAVE_TIPS[n] || LATE_TIPS[n % LATE_TIPS.length];
    this.hud.showBanner(`Wave ${n}`, tip);
    this.sound.wave();
    if (this.mp) this.mp.sendBanner(`Wave ${n}`, tip, 'wave');
  }

  updateWaves(dt) {
    if (this.waveState === 'rest') {
      if (this.cheats.has('peace')) return;
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.beginWave(this.wave + 1);
      return;
    }
    this.spawnTimer -= dt;
    const bp = this.bossPending;
    if (bp) {
      bp.t -= dt;
      if (bp.t <= 0) {
        const boss = this.mobs.spawnBoss(bp.index, this.mul, bp.boost);
        if (boss) {
          this.bossPending = null;
          this.profile.markSeen(boss.type);
        } else bp.t = 0.5;
      }
    }
    const cap = (this.variant === 'horde' ? 40 : 24) + (this.mp ? 8 : 0);
    if (this.queue.length && this.spawnTimer <= 0 && this.mobs.alive() < cap) {
      const m = this.mobs.spawn(this.queue[this.queue.length - 1], this.mul);
      if (m) {
        this.queue.pop();
        this.profile.markSeen(m.type);
      }
      this.spawnTimer = Math.max(this.variant === 'horde' ? 0.12 : 0.3, 1.1 - this.wave * 0.06);
    }
    if (!this.queue.length && !this.bossPending && this.mobs.alive() === 0) {
      const bonus = 250 * this.wave;
      this.onWaveCleared(this.wave, bonus);
      if (this.mp) this.mp.sendCleared(this.wave, bonus);
      this.dropCrates();
      this.waveState = 'rest';
      this.waveTimer = 6;
    }
  }

  onWaveCleared(n, bonus) {
    this.stats.score += bonus;
    this.progress.event('wave', { n });
    const coins = 20 + n * 5;
    this.gainCoins(coins);
    const p = this.player;
    if (!p.dead) {
      p.heal(4);
      p.blocks = Math.min(99, p.blocks + 8);
      p.grenades = Math.min(MAX_NADES, p.grenades + 1);
    }
    this.hud.showBanner(`Wave ${n} cleared`, `+${bonus} points, +${coins} coins, +1 grenade. A supply crate is falling!`, 3.4);
    this.sound.cleared();
  }

  // The host drops one supply crate near every player.
  dropCrates() {
    for (const t of this.targets()) {
      const pk = this.mobs.dropCrate(t.pos);
      if (pk && this.mp) this.mp.pickupAdded(pk);
    }
  }

  gainCoins(n) {
    this.profile.addCoins(n);
    this.stats.coins += n;
    this.sound.coin();
    this.progress.event('coins', { n });
  }

  // Open a supply crate: a random part, or coins if you already have it.
  openCrate() {
    this.progress.event('crate');
    const part = rollPart();
    const r = RARITY[part.rarity];
    this.sound.crate();
    if (this.profile.givePart(part.id)) {
      this.hud.toast('Supply crate', part.name, `${r.name} part. Fit it in the Armory (B).`, r.color);
    } else {
      const coins = Math.max(25, Math.round(part.price / 2));
      this.gainCoins(coins);
      this.hud.toast('Supply crate', `${coins} coins`, `You already had the ${part.name}.`, r.color);
    }
  }

  onKill(mob, head, byId) {
    if (this.adventure) this.adventure.onKill(mob);
    const pts = Math.round(mob.def.score * (head ? 1.5 : 1) * (1 + (this.wave - 1) * 0.1));
    // The killer's kill effect, if they wear one. Everyone sees it.
    const killer = !byId || byId === this.myId ? this.profile.style : this.mp && this.mp.remotes.get(byId) ? this.mp.remotes.get(byId).style : null;
    if (killer && killer.fx) this.mobs.bossFx({ k: 'kfx', p: [mob.pos.x, mob.pos.y, mob.pos.z], fx: killer.fx });
    if (!byId || byId === this.myId) this.creditKill(pts, head, mob.type);
    else if (this.mp) this.mp.sendKill(byId, pts, head, mob.type);
    const drop = (kind, value = 0) => {
      const x = mob.pos.x + (Math.random() - 0.5) * 0.8;
      const z = mob.pos.z + (Math.random() - 0.5) * 0.8;
      const pk = this.mobs.spawnPickup(kind, x, mob.pos.y, z, null, value);
      if (this.mp) this.mp.pickupAdded(pk);
    };
    // Coins always, sometimes a bonus coin for headshots.
    const hard = this.variant === 'hardcore' && !this.mp;
    const night = this.sky.isNight() ? 1.25 : 1;
    const value = Math.round((mob.def.coins || 5) * (1 + Math.floor(this.wave / 5) * 0.2) * (hard ? 2 : 1) * (this.variant === 'horde' ? 0.4 : 1) * night);
    // Big payouts come as a shower of coins.
    const pieces = Math.min(12, Math.max(1, Math.round(value / 12)));
    for (let i = 0; i < pieces; i++) drop('coin', Math.max(1, Math.round(value / pieces)));
    if (head) drop('coin', Math.ceil(value / 2));
    if (mob.def.boss) {
      // Bosses always drop a supply crate and a big heart.
      const pk = this.mobs.spawnPickup('crate', mob.pos.x, this.mobs.groundAt(mob.pos.x, mob.pos.z), mob.pos.z);
      pk.fall = 6;
      if (this.mp) this.mp.pickupAdded(pk);
      drop('heart');
      drop('nade');
      drop('power', Math.floor(Math.random() * POWER_ORDER.length));
      const sub = 'It dropped a supply crate!';
      this.hud.showBanner(`${mob.def.name} defeated!`, sub, 3.5);
      this.sound.cleared();
      if (this.mp) this.mp.sendBanner(`${mob.def.name} defeated!`, sub, '');
      return;
    }
    const r = Math.random();
    if (r < 0.16) {
      if (!hard) drop('heart');
    } else if (r < 0.34) drop('blocks');
    else if (r < 0.4) drop('nade');
    else if (r < 0.46 || (this.variant === 'horde' && r < 0.43)) drop('power', Math.floor(Math.random() * POWER_ORDER.length));
  }

  creditKill(pts, head, type) {
    if (type) this.profile.addKill(type);
    this.progress.event('kill', { type, head });
    const w = this.player.weapon;
    if (w) this.progress.gunKill(w.id);
    this.stats.kills++;
    if (head) this.stats.heads++;
    // Combos: kills close together multiply your points, up to double.
    this.combo = this.comboT > 0 ? (this.combo || 0) + 1 : 1;
    this.comboT = COMBO_TIME;
    this.stats.bestCombo = Math.max(this.stats.bestCombo || 0, this.combo);
    if (this.combo >= 2) this.sound.combo(this.combo);
    const mult = Math.min(2, 1 + (this.combo - 1) * 0.1);
    pts = Math.round(pts * mult);
    this.stats.score += pts;
    this.hud.popup(head ? `Headshot +${pts}` : `+${pts}`, head ? 'head' : '');
    // Streaks: kills without dying.
    this.streak = (this.streak || 0) + 1;
    this.stats.bestStreak = Math.max(this.stats.bestStreak || 0, this.streak);
    const call = STREAKS.find((x) => x.n === this.streak);
    if (call) {
      const coins = call.n * 4;
      this.hud.streak(call.name, `${call.n} in a row without getting cubed. +${coins} coins`);
      this.sound.streak(STREAKS.indexOf(call));
      this.gainCoins(coins);
      this.progress.event('streak', { n: call.n });
      if (this.mp) this.mp.system(`${this.mp.name} is on a ${call.name.replace('!', '').toLowerCase()} (${call.n} in a row)`);
    }
  }

  onPlayerDeath() {
    this.hud.banner.hidden = true;
    this.streak = 0;
    this.combo = 0;
    this.comboT = 0;
    if (this.story) {
      this.deadT = 0;
      return;
    }
    if (this.adventure) {
      // Wake up at the hospital. Any job you were on is a bust.
      if (this.player.driving) this.adventure.exitCar(true);
      // Wasted: the police forget about you.
      this.adventure.police.reset();
      if (this.adventure.active) this.adventure.endMission('fail');
      else this.hud.showBanner('You got cubed', 'Back in 4, at the hospital', 4.5);
      this.respawnT = 4;
      return;
    }
    if (this.duel) {
      const p = this.player;
      if (p.killer === 'pvp' && p.pvpKiller) {
        if (this.mp) this.mp.sendKnockout(p.pvpKiller);
        this.duel.onKill(p.pvpKiller, this.myId);
      } else if (this.mp) this.mp.sendDied(p.killer);
      this.respawnT = 3;
      this.hud.showBanner('Knocked out', 'Back in 3', 3.5);
      return;
    }
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
    const third = this.player.thirdPerson;
    if (this.duel) this.duel.placePlayer();
    else if (this.adventure) this.player.reset(this.adventure.hospital);
    else this.player.reset(this.world.spawnPoint());
    const s = this.player.pos;
    this.player.thirdPerson = third;
    this.hud.banner.hidden = true;
    this.fx.burst(s.x, s.y + 1, s.z, this.atlas.colors[T.GRASS_TOP], 16, { speed: 2.5, size: 0.1, up: 3, life: 0.7, spread: 0.4 });
  }

  showGameOver() {
    this.gameOverShown = true;
    this.input.exitLock();
    const s = this.stats;
    const boss = this.mobs.boss();
    $('#go-line').textContent =
      this.player.killer === 'boss' && boss ? `The ${boss.def.name} got you.` : DEATH_LINES[this.player.killer] || 'The cubes won this time.';
    $('#go-wave').textContent = String(this.wave);
    $('#go-score').textContent = s.score.toLocaleString('en-US');
    $('#go-kills').textContent = String(s.kills);
    $('#go-heads').textContent = String(s.heads);
    $('#go-placed').textContent = String(s.placed);
    $('#go-coins').textContent = s.coins.toLocaleString('en-US');
    $('#go-combo').textContent = `×${s.bestCombo || 0}`;
    $('#go-streak').textContent = String(s.bestStreak || 0);
    const key = this.variant === 'endless' ? 'best' : `best:${this.variant}`;
    const prev = bestFor(this.variant);
    const better = s.score > 0 && (!prev || s.score > prev.score) && !this.cheatRun;
    if (better) {
      store.set(key, JSON.stringify({ wave: this.wave, score: s.score }));
      if (this.variant === 'endless') this.best = { wave: this.wave, score: s.score };
    }
    const shown = better ? null : prev;
    $('#go-best').textContent = this.cheatRun
      ? 'Cheats were on, so this run doesn\u2019t count for your best score.'
      : better
      ? `New best ${VARIANTS[this.variant].name} run!`
      : shown
        ? `Best ${VARIANTS[this.variant].name} run: wave ${shown.wave}, ${shown.score.toLocaleString('en-US')} points`
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

    if (s === 'armory') this.armory.frame(dt);
    if (s === 'bestiary') this.bestiary.frame(dt);
    if (s === 'style') this.wardrobe.frame(dt);
    if (s === 'wheel') this.wheel.frame(dt);
    if (!['editor', 'armory', 'bestiary', 'story', 'challenges', 'modes', 'style', 'wheel'].includes(s)) {
      this.world.flush(4);
      this.fx.update(dt, this.world);
      this.tracers.update(dt);
      this.updateSky(dt);
      this.render();
    }
    this.preview.frame(dt);
    if (this.inGame) this.dnums.update(dt);
    if (this.settings.showFps) {
      this.fpsN++;
      this.fpsT += (now - (this.fpsLast || now)) / 1000;
      this.fpsLast = now;
      if (this.fpsT >= 0.5) {
        this.fpsEl.textContent = `${Math.round(this.fpsN / this.fpsT)} FPS`;
        this.fpsN = 0;
        this.fpsT = 0;
      }
    }
    this.hud.tick(dt);
    this.dialogue.tick(dt);
    this.input.endFrame();
  }

  updatePlay(dt) {
    const p = this.player;
    p.update(dt);
    this.combat.update(dt);
    if (this.mp && this.state === 'playing' && (this.input.pressed.has('KeyT') || this.input.pressed.has('Enter'))) {
      this.mp.openChat();
    }
    if (this.state === 'playing' && this.input.pressed.has('KeyB')) this.openArmory('playing');
    if (this.state === 'playing' && this.input.pressed.has('Backquote')) this.cheats.open('playing');
    if (this.cheats.any()) this.cheatRun = true;
    this.cheats.updateHud();
    if (this.authority) {
      if (this.duel) {
        // No mobs in a duel.
      } else if (this.story) {
        if (!p.dead) this.story.update(dt);
      } else if (this.adventure) {
        this.adventure.update(dt);
      } else if (!p.dead || this.mp) this.updateWaves(dt);
      this.mobs.update(dt);
    } else {
      this.mobs.updateRemote(dt);
    }
    for (const b of this.bots) b.update(dt);
    this.updatePet(dt);
    if (this.mp) this.mp.update(dt);
    p.updateCamera(this.camera, dt);
    p.updateModels(dt);
    document.body.classList.toggle('is-dead', p.dead);
    this.hud.setHealth(p.hp);
    this.hud.setPlayer(p);
    this.comboT = Math.max(0, (this.comboT || 0) - dt);
    if (this.comboT === 0) this.combo = 0;
    this.hud.setCombo(this.combo || 0, this.comboT / COMBO_TIME);
    this.hud.setBuffs(p.buffs);
    this.hud.setCoins(this.profile.coins);
    const boss = this.mobs.boss();
    const beacon = this.story && this.story.beacon;
    if (boss) this.hud.setBoss(boss.def.name, boss.remote ? boss.net.hp : boss.hp / boss.maxHp);
    else if (beacon) this.hud.setBoss("Grandma's beacon", beacon.hp / beacon.maxHp);
    else this.hud.setBoss(null, null);
    if (this.duel) {
      const [a, b] = this.duel.hud();
      this.hud.setObjective(a, b);
    } else if (this.story) {
      this.hud.setObjective(`Chapter ${this.story.index + 1}`, this.story.objective());
    } else if (this.adventure) {
      const [a, b] = this.adventure.objective();
      this.hud.setObjective(a, b);
    } else {
      const left = this.waveState === 'rest' ? null : this.authority ? this.queue.length + this.mobs.alive() : this.netLeft;
      this.hud.setWave(this.wave, left);
    }
    this.hud.setScore(this.stats.score);
    if (p.dead) {
      if (this.mp || this.duel || this.adventure) {
        const before = Math.ceil(this.respawnT);
        this.respawnT -= dt;
        if (Math.ceil(this.respawnT) !== before && this.respawnT > 0) this.hud.showBanner('You died', `Back in ${Math.ceil(this.respawnT)}`, 1.5);
        if (this.respawnT <= 0) this.respawn();
      } else if (this.story) {
        this.deadT += dt;
        if (this.deadT > 1.6 && !this.story.failed) this.story.fail('You got cubed!');
      } else {
        this.deadT += dt;
        if (this.deadT > 1.6 && !this.gameOverShown) this.showGameOver();
      }
    }
  }

  // Your pet from the Style shop follows you in every mode.
  updatePet(dt) {
    const want = this.profile.style.pet;
    if (this.pet && this.pet.id !== want) {
      this.pet.dispose();
      this.pet = null;
    }
    if (want && !this.pet) this.pet = new Pet(this, want, this.player, true);
    if (this.pet) this.pet.update(dt);
  }

  updateMenu(dt) {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.menuAngle += dt * 0.05;
    const a = this.menuAngle;
    const rad = SX * 0.69;
    this.camera.position.set(SX / 2 + Math.cos(a) * rad, 30 + (SX - 64) * 0.15, SZ / 2 + Math.sin(a) * rad);
    this.camera.lookAt(SX / 2, 8, SZ / 2);
    if (this.camera.fov !== 75) {
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  updateSky(dt) {
    this.sky.update(dt);
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
    if (['playing', 'paused', 'talk'].includes(this.state) && this.inGame && !this.player.thirdPerson && !this.player.dead && !this.player.driving) {
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
