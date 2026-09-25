import * as THREE from 'three';

// Little cubes that fly off when things get hit or broken.
export class Particles {
  constructor(scene, max = 800) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
    const m = this.mesh.instanceMatrix.array;
    for (let i = 0; i < max; i++) m.fill(0, i * 16, i * 16 + 16);
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.live = new Uint8Array(max);
    this.next = 0;
    scene.add(this.mesh);
  }

  emit(x, y, z, vx, vy, vz, color, life, size, grav = 22) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const j = i * 3;
    this.p[j] = x;
    this.p[j + 1] = y;
    this.p[j + 2] = z;
    this.v[j] = vx;
    this.v[j + 1] = vy;
    this.v[j + 2] = vz;
    this.life[i] = life;
    this.size[i] = size;
    this.grav[i] = grav;
    this.live[i] = 1;
    this.mesh.setColorAt(i, color);
    this.colorsDirty = true;
  }

  burst(x, y, z, colors, n, { speed = 3, size = 0.1, up = 2.5, life = 0.7, spread = 0.15, grav = 22 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - b * b);
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit(
        x + (Math.random() - 0.5) * spread * 2,
        y + (Math.random() - 0.5) * spread * 2,
        z + (Math.random() - 0.5) * spread * 2,
        Math.cos(a) * r * s,
        b * s + up * Math.random(),
        Math.sin(a) * r * s,
        colors[k % colors.length],
        life * (0.6 + Math.random() * 0.7),
        size * (0.7 + Math.random() * 0.6),
        grav,
      );
    }
  }

  update(dt, world) {
    const m = this.mesh.instanceMatrix.array;
    for (let i = 0; i < this.max; i++) {
      if (!this.live[i]) continue;
      const o = i * 16;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.live[i] = 0;
        m.fill(0, o, o + 16);
        continue;
      }
      const j = i * 3;
      const px = this.p[j];
      const py = this.p[j + 1];
      const pz = this.p[j + 2];
      this.v[j + 1] -= this.grav[i] * dt;
      let nx = px + this.v[j] * dt;
      let ny = py + this.v[j + 1] * dt;
      let nz = pz + this.v[j + 2] * dt;
      if (world.solid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        if (world.solid(Math.floor(px), Math.floor(ny), Math.floor(pz))) {
          this.v[j + 1] *= -0.25;
          this.v[j] *= 0.6;
          this.v[j + 2] *= 0.6;
          ny = py;
        }
        if (world.solid(Math.floor(nx), Math.floor(ny), Math.floor(pz))) {
          this.v[j] *= -0.3;
          nx = px;
        }
        if (world.solid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
          this.v[j + 2] *= -0.3;
          nz = pz;
        }
      }
      this.p[j] = nx;
      this.p[j + 1] = ny;
      this.p[j + 2] = nz;
      const s = this.size[i] * Math.min(1, this.life[i] / 0.2);
      m[o] = s;
      m[o + 1] = 0;
      m[o + 2] = 0;
      m[o + 4] = 0;
      m[o + 5] = s;
      m[o + 6] = 0;
      m[o + 8] = 0;
      m[o + 9] = 0;
      m[o + 10] = s;
      m[o + 12] = nx;
      m[o + 13] = ny;
      m[o + 14] = nz;
      m[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colorsDirty) {
      this.mesh.instanceColor.needsUpdate = true;
      this.colorsDirty = false;
    }
  }

  clear() {
    this.live.fill(0);
    this.life.fill(0);
    this.mesh.instanceMatrix.array.fill(0);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Short bright streaks from the gun to whatever it hit.
export class Tracers {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, 0.5);
    this.pool = [];
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, t: 0 });
    }
    this.next = 0;
  }

  fire(from, to, color = 0xffe9a8, width = 0.035) {
    const tr = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const len = from.distanceTo(to);
    tr.mesh.position.copy(from);
    tr.mesh.lookAt(to);
    tr.mesh.scale.set(width, width, len);
    tr.mesh.material.color.set(color);
    tr.mesh.material.opacity = 1;
    tr.mesh.visible = true;
    tr.t = 0.07;
  }

  update(dt) {
    for (const tr of this.pool) {
      if (!tr.mesh.visible) continue;
      tr.t -= dt;
      tr.mesh.material.opacity = Math.max(0, tr.t / 0.07);
      if (tr.t <= 0) tr.mesh.visible = false;
    }
  }
}
