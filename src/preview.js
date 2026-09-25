import * as THREE from 'three';
import { buildHumanoid } from './model.js';
import { clamp } from './util.js';

// The spinning character on the title screen, which doubles as the canvas
// you paint on in the skin editor.
export class SkinPreview {
  constructor(skin) {
    this.skin = skin;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.canvas.setAttribute('aria-label', 'Your character. Drag to spin.');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xf4f0ff, 0x5a4a3a, 2.6));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
    sun.position.set(-2, 3, 4);
    this.scene.add(sun);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.yaw = 0.55;
    this.pitch = 0.1;
    this.dist = 5.2;
    this.autoRotate = true;
    this.editing = false;
    this.visible = false;
    this.t = 0;
    this.painter = null;
    this.showOuter = true;
    this.paintLayer = 'base';
    this.raycaster = new THREE.Raycaster();
    this.buildModel();
    skin.listeners.add(({ model }) => {
      if (model) this.buildModel();
    });
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
  }

  buildModel() {
    if (this.model) {
      this.pivot.remove(this.model.root);
      this.model.dispose();
    }
    this.model = buildHumanoid(this.skin.texture, { slim: this.skin.slim });
    this.model.root.position.y = -0.92;
    this.pivot.add(this.model.root);
    this.applyLayers();
  }

  applyLayers() {
    for (const m of this.model.outerMeshes) m.visible = this.showOuter || (this.editing && this.paintLayer === 'outer');
  }

  mount(container, editing) {
    if (this.canvas.parentElement !== container) container.appendChild(this.canvas);
    if (editing && !this.editing) {
      this.yaw = 0.45;
      this.pitch = 0.1;
    }
    this.editing = editing;
    this.visible = true;
    this.autoRotate = !editing && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dist = editing ? 4.6 : 5.2;
    this.canvas.style.cursor = editing ? 'crosshair' : 'grab';
    this.applyLayers();
    this.resize();
  }

  hide() {
    this.visible = false;
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Skin pixel under the pointer on the given layer, or null.
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = this.paintLayer === 'outer' ? this.model.outerMeshes : this.model.baseMeshes;
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit || !hit.uv) return null;
    return { x: clamp(Math.floor(hit.uv.x * 64), 0, 63), y: clamp(Math.floor((1 - hit.uv.y) * 64), 0, 63) };
  }

  bindPointer() {
    const c = this.canvas;
    let mode = null;
    let lx = 0;
    let ly = 0;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      c.setPointerCapture(e.pointerId);
      lx = e.clientX;
      ly = e.clientY;
      if (this.editing && this.painter) {
        const px = this.pick(e.clientX, e.clientY);
        if (px) {
          mode = 'paint';
          this.painter.start(px.x, px.y);
          return;
        }
      }
      mode = 'spin';
      this.autoRotate = false;
      c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      if (mode === 'paint') {
        const px = this.pick(e.clientX, e.clientY);
        if (px) this.painter.move(px.x, px.y);
      } else if (mode === 'spin') {
        this.yaw += (e.clientX - lx) * 0.012;
        this.pitch = clamp(this.pitch + (e.clientY - ly) * 0.008, -0.9, 0.9);
        lx = e.clientX;
        ly = e.clientY;
      } else if (this.editing && this.painter && e.pointerType === 'mouse') {
        const px = this.pick(e.clientX, e.clientY);
        this.painter.hover(px);
      }
    });
    const end = () => {
      if (mode === 'paint') this.painter.end();
      mode = null;
      c.style.cursor = this.editing ? 'crosshair' : 'grab';
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      if (this.editing && this.painter && !mode) this.painter.hover(null);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        if (!this.editing) return;
        e.preventDefault();
        this.dist = clamp(this.dist + e.deltaY * 0.004, 2.4, 8);
      },
      { passive: false },
    );
  }

  frame(dt) {
    if (!this.visible || !this.canvas.isConnected) return;
    this.t += dt;
    if (this.autoRotate) this.yaw += dt * 0.5;
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'XYZ');
    const P = this.model.parts;
    if (this.editing) {
      P.armR.rotation.set(0, 0, -0.14);
      P.armL.rotation.set(0, 0, 0.14);
      P.legR.rotation.set(0, 0, -0.03);
      P.legL.rotation.set(0, 0, 0.03);
      P.head.rotation.set(0, 0, 0);
    } else {
      const s = Math.sin(this.t * 1.6);
      P.armR.rotation.set(s * 0.08, 0, -0.06 - Math.max(0, s) * 0.03);
      P.armL.rotation.set(-s * 0.08, 0, 0.06 + Math.max(0, -s) * 0.03);
      P.legR.rotation.set(0, 0, 0);
      P.legL.rotation.set(0, 0, 0);
      P.head.rotation.set(Math.sin(this.t * 0.7) * 0.06, Math.sin(this.t * 0.45) * 0.25, 0);
    }
    this.camera.position.set(0, 0.05, this.dist);
    this.camera.lookAt(0, 0.02, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
