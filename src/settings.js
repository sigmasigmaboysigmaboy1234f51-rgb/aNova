import { $, store } from './util.js';

// The Settings screen. Everything saves as soon as you change it.

export const DEFAULTS = {
  sens: 1,
  invertY: false,
  fov: 75,
  volume: 100,
  quality: 'high',
  dmgNums: true,
  showFps: false,
  dayNight: true,
  weather: true,
};

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(store.get('opts', '{}')) || {};
  } catch {
    saved = {};
  }
  const s = { ...DEFAULTS, ...saved };
  // Older versions kept mouse speed on its own.
  if (saved.sens === undefined) s.sens = parseFloat(store.get('sens', '1')) || 1;
  s.muted = store.get('muted', '0') === '1';
  return s;
}

export class SettingsScreen {
  constructor(game) {
    this.game = game;
    this.el = $('#settings');
    this.back = 'menu';
    const s = game.settings;
    const bind = (id, key, parse, fmt) => {
      const el = $(id);
      const out = el.parentElement.querySelector('output');
      const show = () => {
        if (out) out.textContent = fmt ? fmt(s[key]) : String(s[key]);
      };
      if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = String(s[key]);
      show();
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
        s[key] = el.type === 'checkbox' ? el.checked : parse ? parse(el.value) : el.value;
        show();
        this.save();
        game.applySettings();
      });
    };
    bind('#set-sens', 'sens', parseFloat, (v) => `${v.toFixed(2)}×`);
    bind('#set-invert', 'invertY');
    bind('#set-fov', 'fov', (v) => parseInt(v, 10), (v) => `${v}°`);
    bind('#set-volume', 'volume', (v) => parseInt(v, 10), (v) => `${v}%`);
    bind('#set-quality', 'quality');
    bind('#set-dmg', 'dmgNums');
    bind('#set-fps', 'showFps');
    bind('#set-daynight', 'dayNight');
    bind('#set-weather', 'weather');
    $('#set-done').addEventListener('click', () => this.close());
    $('#set-reset').addEventListener('click', () => {
      Object.assign(s, DEFAULTS);
      this.save();
      game.applySettings();
      this.refresh();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  refresh() {
    const s = this.game.settings;
    for (const [id, key] of [
      ['#set-sens', 'sens'],
      ['#set-invert', 'invertY'],
      ['#set-fov', 'fov'],
      ['#set-volume', 'volume'],
      ['#set-quality', 'quality'],
      ['#set-dmg', 'dmgNums'],
      ['#set-fps', 'showFps'],
      ['#set-daynight', 'dayNight'],
      ['#set-weather', 'weather'],
    ]) {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = String(s[key]);
      el.dispatchEvent(new Event(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input'));
    }
  }

  save() {
    const s = this.game.settings;
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = s[k];
    store.set('opts', JSON.stringify(out));
    store.set('sens', String(s.sens));
  }

  open(back) {
    this.back = back;
    this.game.setState('settings');
  }

  show() {
    this.el.hidden = false;
    $('#set-done').focus();
  }

  hide() {
    this.el.hidden = true;
  }

  close() {
    this.game.setState(this.back || 'menu');
  }
}
