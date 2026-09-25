import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// Day and night, and weather, for Endless and co-op games. A full day
// takes a few minutes. Nights are darker (never too dark to play) and
// mobs drop more coins. Each wave can bring rain, a thunderstorm or snow.

const DAY = 240;
const NIGHT_SKY = new THREE.Color('#0d1330');
const DUSK = new THREE.Color('#f08a4b');
const STORM = new THREE.Color('#5a6272');
const RAIN_N = 1500;
const SNOW_N = 900;
const BOX = 22;
const TOP = 16;

export const WEATHER = {
  clear: { name: 'Clear skies' },
  rain: { name: 'Rain', sub: 'Puddles for everyone.' },
  storm: { name: 'Thunderstorm', sub: 'Lightning! Stay low.' },
  snow: { name: 'Snow', sub: 'A winter wonderland. Watch your step.' },
};

export class Sky {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.dayNight = true;
    this.weatherOn = true;
    this.t = 0.1;
    this.weather = 'clear';
    this.wet = 0;
    this.flash = 0;
    this.boltT = 5;
    this.nightShown = false;
    this.base = null;
    this.defaultDir = game.sunDir.clone();
    this.skyCol = new THREE.Color();
    this.tmp = new THREE.Color();

    // Stars: a dome of dots that follows the camera.
    const sp = new Float32Array(500 * 3);
    const r = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const a = r() * Math.PI * 2;
      const e = 0.08 + r() * 1.4;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * 300;
      sp[i * 3 + 1] = Math.sin(e) * 300;
      sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 300;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.stars.visible = false;
    game.scene.add(this.stars);

    // Rain: short streaks that fall around the camera and wrap.
    this.rainPos = new Float32Array(RAIN_N * 6);
    for (let i = 0; i < RAIN_N; i++) this.seedDrop(i, Math.random() * TOP * 2);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8c4e8, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    game.scene.add(this.rain);

    // Snow: slow white dots that drift.
    this.snowPos = new Float32Array(SNOW_N * 3);
    for (let i = 0; i < SNOW_N; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * BOX * 2;
      this.snowPos[i * 3 + 1] = Math.random() * TOP * 2 - TOP * 0.5;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * BOX * 2;
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(ng, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    game.scene.add(this.snow);
  }

  seedDrop(i, y) {
    const p = this.rainPos;
    const x = (Math.random() - 0.5) * BOX * 2;
    const z = (Math.random() - 0.5) * BOX * 2;
    const yy = y - TOP * 0.5;
    p[i * 6] = x;
    p[i * 6 + 1] = yy;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.04;
    p[i * 6 + 4] = yy + 0.55;
    p[i * 6 + 5] = z;
  }

  setEnabled(dayNight, weather) {
    this.dayNight = dayNight;
    this.weatherOn = weather;
    if (!weather) this.setWeather('clear', true);
  }

  // A run on the normal island starts in the morning.
  begin(theme) {
    this.active = true;
    this.base = theme;
    this.t = 0.06;
    this.nightShown = false;
    this.setWeather('clear', true);
  }

  end() {
    const g = this.game;
    if (this.active) {
      g.sunDir.copy(this.defaultDir);
      g.sun.position.set(30, 60, 20);
      g.sunMesh.visible = true;
      g.clouds.material.opacity = 0.85;
      g.world.material.color.set('#ffffff');
      g.clouds.material.color.set('#ffffff');
    }
    this.active = false;
    this.stars.visible = false;
    this.rain.visible = false;
    this.snow.visible = false;
    this.weather = 'clear';
    this.wet = 0;
  }

  isNight() {
    return this.active && this.dayNight && Math.sin(this.t * Math.PI * 2) < -0.1;
  }

  // Everyone in a co-op game gets the same weather: it comes from the
  // world seed and the wave number.
  onWave(n, seed) {
    if (!this.active || !this.weatherOn || n < 2) return;
    const r = mulberry32(((seed | 0) ^ Math.imul(n, 7919)) >>> 0)();
    const w = r < 0.55 ? 'clear' : r < 0.78 ? 'rain' : r < 0.9 ? 'storm' : 'snow';
    if (w !== this.weather) {
      this.setWeather(w);
      if (w !== 'clear') this.game.hud.feed(`${WEATHER[w].name}. ${WEATHER[w].sub}`, '');
    }
  }

  setWeather(w, instant = false) {
    this.weather = w;
    if (instant) this.wet = w === 'clear' ? 0 : 1;
  }

  update(dt) {
    const g = this.game;
    if (!this.active || !g.inGame) return;
    if (this.dayNight) this.t = (this.t + dt / DAY) % 1;
    else this.t = 0.2;
    const elev = Math.sin(this.t * Math.PI * 2);
    const day = THREE.MathUtils.clamp(elev * 3 + 0.45, 0, 1);
    const dusk = Math.max(0, 1 - Math.abs(elev) * 5) * (this.dayNight ? 1 : 0);
    const target = this.weather === 'clear' ? 0 : 1;
    this.wet += (target - this.wet) * Math.min(1, dt * 0.4);
    const base = this.base;

    // Colours: night blue, orange at dusk, grey in a storm.
    this.skyCol.set(base.sky).lerp(NIGHT_SKY, 1 - day);
    this.skyCol.lerp(DUSK, dusk * 0.35);
    this.skyCol.lerp(STORM, this.wet * (this.weather === 'snow' ? 0.35 : 0.6) * (0.4 + day * 0.6));
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.flash > 0) this.skyCol.lerp(this.tmp.set('#ffffff'), this.flash * 0.6);
    g.renderer.setClearColor(this.skyCol);
    g.scene.fog.color.copy(this.skyCol);
    g.scene.fog.near = base.fog[0] * (1 - this.wet * 0.35);
    g.scene.fog.far = base.fog[1] * (1 - this.wet * 0.3);
    const light = (0.42 + day * 0.58) * (1 - this.wet * 0.2) + this.flash * 0.8;
    // The blocks are pre-lit, so tint them: blue and dim at night.
    const dim = Math.min(1.25, (0.5 + day * 0.5) * (1 - this.wet * 0.15) + this.flash * 0.5);
    const blue = 1 - day;
    this.tmp.setRGB(dim * (1 - blue * 0.12), dim * (1 - blue * 0.05), Math.min(1.25, dim * (1 + blue * 0.25)));
    g.world.material.color.copy(this.tmp);
    g.water.material.color.set(base.water || '#ffffff').multiply(this.tmp);
    g.hemi.intensity = 2.4 * base.light * light;
    g.sun.intensity = 2 * base.light * Math.max(0.15, day) * (1 - this.wet * 0.5);
    g.viewHemi.intensity = 2.4 * Math.max(0.6, light);
    // The sun (or the moon) goes round.
    const a = this.t * Math.PI * 2;
    const sunUp = elev > -0.05;
    const dir = g.sunDir;
    if (sunUp) dir.set(Math.cos(a) * 0.8, Math.max(0.05, elev), -0.55).normalize();
    else dir.set(-Math.cos(a) * 0.8, Math.max(0.05, -elev), -0.55).normalize();
    g.sun.position.set(dir.x * 60, dir.y * 60, dir.z * 60);
    g.sunMesh.material.color.set(sunUp ? base.sun || '#fff6cf' : '#e8eeff');
    g.sunMesh.scale.setScalar(sunUp ? 1 : 0.6);
    g.sunMesh.visible = this.wet < 0.6;
    g.clouds.visible = true;
    g.clouds.material.opacity = 0.85 * (0.45 + day * 0.55);
    const grey = 1 - this.wet * 0.35;
    g.clouds.material.color.setRGB((0.25 + day * 0.75) * grey, (0.28 + day * 0.72) * grey, (0.42 + day * 0.58) * grey);

    // Stars fade in at night.
    const starA = Math.max(0, 1 - day * 1.6) * (1 - this.wet);
    this.stars.visible = starA > 0.02;
    this.stars.material.opacity = starA;
    this.stars.position.copy(g.camera.position);

    if (this.dayNight) {
      const night = this.isNight();
      if (night && !this.nightShown) {
        this.nightShown = true;
        g.hud.feed('Night falls. Mobs drop 25% more coins until morning.', 'me');
      } else if (!night && this.nightShown) {
        this.nightShown = false;
        g.hud.feed('The sun is up. Good morning!', '');
      }
    }

    this.updateRain(dt);
    this.updateSnow(dt);
    if (this.weather === 'storm') {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 5 + Math.random() * 9;
        this.flash = 1;
        g.sound.thunder(0.4 + Math.random() * 0.5, 0.3 + Math.random() * 1.2);
      }
    }
  }

  updateRain(dt) {
    const on = (this.weather === 'rain' || this.weather === 'storm') && this.wet > 0.05;
    this.rain.visible = on;
    if (!on) return;
    const cam = this.game.camera.position;
    this.rain.position.set(cam.x, cam.y, cam.z);
    this.rain.material.opacity = 0.55 * this.wet;
    const p = this.rainPos;
    const fall = dt * (this.weather === 'storm' ? 26 : 20);
    const wind = this.weather === 'storm' ? dt * 4 : 0;
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6;
      p[o + 1] -= fall;
      p[o + 4] -= fall;
      p[o] += wind;
      p[o + 3] += wind;
      if (p[o + 1] < -TOP * 0.5) this.seedDrop(i, TOP * 2);
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  updateSnow(dt) {
    const on = this.weather === 'snow' && this.wet > 0.05;
    this.snow.visible = on;
    if (!on) return;
    const cam = this.game.camera.position;
    this.snow.position.set(cam.x, cam.y, cam.z);
    this.snow.material.opacity = 0.9 * this.wet;
    const p = this.snowPos;
    const tt = performance.now() / 1000;
    for (let i = 0; i < SNOW_N; i++) {
      const o = i * 3;
      p[o + 1] -= dt * (1.2 + (i % 5) * 0.2);
      p[o] += Math.sin(tt + i) * dt * 0.4;
      if (p[o + 1] < -TOP * 0.5) {
        p[o] = (Math.random() - 0.5) * BOX * 2;
        p[o + 1] = TOP * 1.5;
        p[o + 2] = (Math.random() - 0.5) * BOX * 2;
      }
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }
}
