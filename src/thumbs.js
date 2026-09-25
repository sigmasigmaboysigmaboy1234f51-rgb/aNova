import * as THREE from 'three';
import { buildGun } from './gun.js';

// Side-on pictures of guns for the hotbar and the Armory, drawn once with
// the game's own renderer and kept as 2D canvases.

const cache = new Map();
let rt = null;
let scene = null;
let cam = null;
const box = new THREE.Box3();
const size = new THREE.Vector3();
const mid = new THREE.Vector3();
const clear = new THREE.Color();

function setup() {
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf4f0ff, 0x5a4a3a, 2.4));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.8);
  sun.position.set(3, 4, 2);
  scene.add(sun);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  cam.position.set(5, 0.6, 0);
  cam.lookAt(0, 0, 0);
}

function key(gunId, build, w, h) {
  return `${gunId}|${build ? Object.values(build).sort().join(',') : ''}|${w}x${h}`;
}

export function gunThumb(renderer, gunId, build, w = 160, h = 80) {
  const k = key(gunId, build, w, h);
  if (cache.has(k)) return cache.get(k);
  if (!scene) setup();
  const scale = 2;
  const W = w * scale;
  const H = h * scale;
  if (!rt || rt.width !== W || rt.height !== H) {
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
  }
  const gun = buildGun(gunId, build);
  // The laser beam and muzzle flash would stretch the framing.
  const u = gun.userData;
  if (u.laser) gun.remove(u.laser);
  gun.remove(u.flash);
  gun.rotation.set(0, -0.35, 0);
  scene.add(gun);
  gun.updateMatrixWorld(true);
  box.setFromObject(gun);
  box.getSize(size);
  box.getCenter(mid);
  const aspect = W / H;
  // Fit the gun's length (seen from the side, mostly z) and height.
  const span = Math.max(Math.hypot(size.z, size.x * 0.35) / aspect, size.y) * 0.56;
  cam.left = -span * aspect;
  cam.right = span * aspect;
  cam.top = span;
  cam.bottom = -span;
  cam.position.set(mid.x + 5, mid.y + 0.6, mid.z);
  cam.lookAt(mid);
  cam.updateProjectionMatrix();

  const prevTarget = renderer.getRenderTarget();
  renderer.getClearColor(clear);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(clear, prevAlpha);
  scene.remove(gun);
  u.dispose();

  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const img = full.getContext('2d').createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  full.getContext('2d').putImageData(img, 0, 0);
  cache.set(k, full);
  return full;
}
