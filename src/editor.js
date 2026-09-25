import { $, saveBlob, clamp } from './util.js';
import { allRegions, paintOutfit, randomOutfit, DEFAULT_OUTFIT, readSkinFile } from './skin.js';

const PALETTE = [
  '#1b1b1d', '#f4f1ea', '#8f8f93', '#4a2f1c', '#7a4a24', '#e0ac85', '#c68e6a', '#8a5738',
  '#d8392b', '#e0752d', '#ffd23f', '#5f9a37', '#1f8a8a', '#3c7dd9', '#7b4ac2', '#e46da0',
];
const GUIDE = 8;

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

export class SkinEditor {
  constructor(game) {
    this.game = game;
    this.skin = game.skin;
    this.preview = game.preview;
    this.ctx = this.skin.ctx;
    this.tool = 'pencil';
    this.layer = 'base';
    this.color = '#e0752d';
    this.recent = [];
    this.undoStack = [];
    this.regions = allRegions(this.skin.slim);
    this.flat = $('#ed-flat');
    this.flatCtx = this.flat.getContext('2d');
    this.guides = $('#ed-guides');
    this.guides.width = this.guides.height = 64 * GUIDE;
    this.gctx = this.guides.getContext('2d');
    this.status = $('#ed-status');
    this.hoverPx = null;
    this.warned = false;
    this.buildPalette();
    this.bindUI();
    this.bindFlat();
    this.preview.painter = {
      start: (x, y) => this.strokeStart(x, y),
      move: (x, y) => this.apply(x, y, false),
      end: () => this.strokeEnd(),
      hover: (px) => this.setHover(px),
    };
    this.skin.listeners.add(({ model }) => {
      if (model) {
        this.regions = allRegions(this.skin.slim);
        this.syncArms();
        this.drawGuides();
      }
      this.drawFlat();
    });
    this.setColor(this.color);
    this.drawFlat();
    this.drawGuides();
  }

  say(text) {
    this.status.textContent = text;
  }

  onOpen() {
    this.say('');
    this.syncArms();
    this.drawFlat();
    this.drawGuides();
  }

  buildPalette() {
    const pal = $('#ed-palette');
    for (const hex of PALETTE) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.type = 'button';
      b.style.background = hex;
      b.dataset.color = hex;
      b.setAttribute('aria-label', `Color ${hex}`);
      b.addEventListener('click', () => this.setColor(hex));
      pal.appendChild(b);
    }
    this.recentEl = $('#ed-recent');
  }

  renderRecent() {
    this.recentEl.textContent = '';
    for (const hex of this.recent) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.type = 'button';
      b.style.background = hex;
      b.dataset.color = hex;
      b.setAttribute('aria-label', `Recent color ${hex}`);
      b.addEventListener('click', () => this.setColor(hex));
      this.recentEl.appendChild(b);
    }
    this.markSwatches();
  }

  markSwatches() {
    for (const b of document.querySelectorAll('#editor .swatch')) {
      b.setAttribute('aria-pressed', String(b.dataset.color === this.color));
    }
  }

  setColor(hex) {
    this.color = hex.toLowerCase();
    $('#ed-color').value = this.color;
    $('#ed-color-hex').textContent = this.color.toUpperCase();
    this.markSwatches();
  }

  setTool(tool) {
    this.tool = tool;
    for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  }

  setLayer(layer) {
    this.layer = layer;
    this.preview.paintLayer = layer;
    this.preview.applyLayers();
    for (const b of document.querySelectorAll('[data-layer]')) b.setAttribute('aria-pressed', String(b.dataset.layer === layer));
    this.drawGuides();
  }

  syncArms() {
    for (const b of document.querySelectorAll('[data-arms]')) {
      b.setAttribute('aria-pressed', String((b.dataset.arms === 'slim') === this.skin.slim));
    }
  }

  bindUI() {
    for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => this.setTool(b.dataset.tool));
    for (const b of document.querySelectorAll('[data-layer]')) b.addEventListener('click', () => this.setLayer(b.dataset.layer));
    for (const b of document.querySelectorAll('[data-arms]')) {
      b.addEventListener('click', () => {
        this.pushUndo();
        this.skin.setSlim(b.dataset.arms === 'slim');
        this.say(
          this.skin.slim
            ? 'Slim arms, 3 pixels wide. Minecraft calls this the Slim model.'
            : 'Classic arms, 4 pixels wide. Minecraft calls this the Classic model.',
        );
      });
    }
    $('#ed-show-outer').addEventListener('change', (e) => {
      this.preview.showOuter = e.target.checked;
      this.preview.applyLayers();
    });
    $('#ed-color').addEventListener('input', (e) => this.setColor(e.target.value));
    $('#ed-undo').addEventListener('click', () => this.undo());
    $('#ed-random').addEventListener('click', () => {
      this.pushUndo();
      paintOutfit(this.skin.canvas, randomOutfit(), this.skin.slim, (Math.random() * 1e9) | 0);
      this.skin.changed();
      this.skin.save();
      this.say('New outfit. Press Random outfit again for another, or paint over it.');
    });
    const reset = $('#ed-reset');
    let armed = 0;
    reset.addEventListener('click', () => {
      if (!armed) {
        armed = setTimeout(() => {
          armed = 0;
          reset.textContent = 'Reset';
        }, 3000);
        reset.textContent = 'Click again';
        return;
      }
      clearTimeout(armed);
      armed = 0;
      reset.textContent = 'Reset';
      this.pushUndo();
      paintOutfit(this.skin.canvas, DEFAULT_OUTFIT, this.skin.slim);
      this.skin.changed();
      this.skin.save();
      this.say('Back to the starting skin. Undo brings your old one back.');
    });
    const file = $('#ed-file');
    $('#ed-load').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      try {
        const res = await readSkinFile(f);
        this.pushUndo();
        this.skin.replace(res.canvas, res.slim);
        let msg = `Loaded ${f.name}.`;
        if (res.legacy) msg += ' It was an old 64×32 skin, so the left arm and leg were copied from the right.';
        else if (res.slim) msg += ' It looks like a slim-arm skin, so arms are set to Slim.';
        this.say(msg);
      } catch (err) {
        this.say(err.message || 'That file could not be loaded.');
      }
    });
    $('#ed-save').addEventListener('click', () => this.save());
    window.addEventListener('keydown', (e) => {
      if (this.game.state !== 'editor') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      }
    });
  }

  save() {
    this.skin.canvas.toBlob(async (blob) => {
      if (!blob) {
        this.say('The skin could not be turned into a PNG. Try again.');
        return;
      }
      const res = await saveBlob('blockfire-skin.png', blob);
      if (res.ok) {
        this.say(
          'Saved blockfire-skin.png. To wear it in Minecraft Java Edition, open the launcher, go to Skins, choose New skin, then Browse to the file.' +
            (this.skin.slim ? ' Pick the Slim model there too.' : ''),
        );
      } else if (res.reason === 'declined') {
        this.say('Save cancelled.');
      } else {
        this.say('This view blocks file saving. Open the game from its own page to save your skin.');
      }
    }, 'image/png');
  }

  bindFlat() {
    const c = this.flat;
    let down = false;
    let last = null;
    const px = (e) => {
      const r = c.getBoundingClientRect();
      return {
        x: clamp(Math.floor(((e.clientX - r.left) / r.width) * 64), 0, 63),
        y: clamp(Math.floor(((e.clientY - r.top) / r.height) * 64), 0, 63),
      };
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      down = true;
      last = px(e);
      this.strokeStart(last.x, last.y);
    });
    c.addEventListener('pointermove', (e) => {
      const p = px(e);
      this.setHover(p);
      if (!down) return;
      // Fill in the gaps when the pointer moves fast.
      let x0 = last.x;
      let y0 = last.y;
      const dx = Math.abs(p.x - x0);
      const dy = -Math.abs(p.y - y0);
      const sx = x0 < p.x ? 1 : -1;
      const sy = y0 < p.y ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.apply(x0, y0, false);
        if (x0 === p.x && y0 === p.y) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
      last = p;
    });
    const end = () => {
      if (down) this.strokeEnd();
      down = false;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => this.setHover(null));
  }

  regionAt(x, y) {
    return this.regions.find(({ rect: [rx, ry, rw, rh] }) => x >= rx && y >= ry && x < rx + rw && y < ry + rh) || null;
  }

  pushUndo() {
    this.undoStack.push({ img: this.ctx.getImageData(0, 0, 64, 64), slim: this.skin.slim });
    if (this.undoStack.length > 40) this.undoStack.shift();
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) {
      this.say('Nothing to undo.');
      return;
    }
    this.ctx.putImageData(s.img, 0, 0);
    if (s.slim !== this.skin.slim) this.skin.setSlim(s.slim);
    this.skin.changed();
    this.skin.save();
    this.say('Undone.');
  }

  strokeStart(x, y) {
    this.pushUndo();
    this.warned = false;
    this.apply(x, y, true);
  }

  strokeEnd() {
    this.skin.save();
    if (this.tool === 'pencil' || this.tool === 'fill') {
      this.recent = [this.color, ...this.recent.filter((c) => c !== this.color)].slice(0, 8);
      this.renderRecent();
    }
  }

  apply(x, y, first) {
    const ctx = this.ctx;
    if (this.tool === 'picker') {
      if (!first) return;
      const d = ctx.getImageData(x, y, 1, 1).data;
      if (d[3] === 0) {
        this.say('That pixel is see-through, so there is no color to pick.');
        return;
      }
      this.setColor(toHex(d[0], d[1], d[2]));
      this.setTool('pencil');
      this.say(`Picked ${this.color.toUpperCase()}.`);
      return;
    }
    if (this.tool === 'fill') {
      if (first) this.flood(x, y);
      return;
    }
    if (this.tool === 'eraser') {
      const reg = this.regionAt(x, y);
      if (!reg || reg.layer !== 'outer') {
        if (!this.warned) this.say('Only the outer layer can be erased. The skin layer underneath has to stay solid.');
        this.warned = true;
        return;
      }
      ctx.clearRect(x, y, 1, 1);
    } else {
      ctx.clearRect(x, y, 1, 1);
      ctx.fillStyle = this.color;
      ctx.fillRect(x, y, 1, 1);
    }
    this.skin.changed();
  }

  // Flood fill, kept inside the face of the box that was clicked.
  flood(x, y) {
    const reg = this.regionAt(x, y);
    const [rx, ry, rw, rh] = reg ? reg.rect : [x, y, 1, 1];
    const img = this.ctx.getImageData(rx, ry, rw, rh);
    const d = img.data;
    const idx = (i, j) => (j * rw + i) * 4;
    const s = idx(x - rx, y - ry);
    const target = [d[s], d[s + 1], d[s + 2], d[s + 3]];
    const [r, g, b] = fromHex(this.color);
    if (target[0] === r && target[1] === g && target[2] === b && target[3] === 255) return;
    const seen = new Uint8Array(rw * rh);
    const stack = [[x - rx, y - ry]];
    while (stack.length) {
      const [i, j] = stack.pop();
      if (i < 0 || j < 0 || i >= rw || j >= rh || seen[j * rw + i]) continue;
      seen[j * rw + i] = 1;
      const k = idx(i, j);
      if (d[k] !== target[0] || d[k + 1] !== target[1] || d[k + 2] !== target[2] || d[k + 3] !== target[3]) continue;
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
      stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
    }
    this.ctx.putImageData(img, rx, ry);
    this.skin.changed();
  }

  setHover(px) {
    const same = px && this.hoverPx && px.x === this.hoverPx.x && px.y === this.hoverPx.y;
    if (same || (!px && !this.hoverPx)) return;
    this.hoverPx = px;
    this.drawGuides();
  }

  drawFlat() {
    this.flatCtx.clearRect(0, 0, 64, 64);
    this.flatCtx.drawImage(this.skin.canvas, 0, 0);
  }

  drawGuides() {
    const g = this.gctx;
    const S = GUIDE;
    g.clearRect(0, 0, 64 * S, 64 * S);
    g.lineWidth = 2;
    for (const r of this.regions) {
      const [x, y, w, h] = r.rect;
      g.strokeStyle = r.layer === this.layer ? 'rgba(255, 210, 63, 0.55)' : 'rgba(255, 255, 255, 0.16)';
      g.strokeRect(x * S + 1, y * S + 1, w * S - 2, h * S - 2);
    }
    if (this.hoverPx) {
      const { x, y } = this.hoverPx;
      g.lineWidth = 2;
      g.strokeStyle = '#ffffff';
      g.strokeRect(x * S + 1, y * S + 1, S - 2, S - 2);
      g.strokeStyle = '#000000';
      g.strokeRect(x * S - 1, y * S - 1, S + 2, S + 2);
    }
  }
}
