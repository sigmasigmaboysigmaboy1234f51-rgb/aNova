// Box-vs-voxel movement shared by the player and the mobs.
// An entity has pos (feet centre), vel, hw (half width) and h (height).

export function boxHitsWorld(world, x0, y0, z0, x1, y1, z1) {
  const ix0 = Math.floor(x0);
  const iy0 = Math.floor(y0);
  const iz0 = Math.floor(z0);
  const ix1 = Math.floor(x1 - 1e-6);
  const iy1 = Math.floor(y1 - 1e-6);
  const iz1 = Math.floor(z1 - 1e-6);
  for (let y = iy0; y <= iy1; y++) {
    for (let z = iz0; z <= iz1; z++) {
      for (let x = ix0; x <= ix1; x++) {
        if (world.solidP(x, y, z)) return true;
      }
    }
  }
  return false;
}

function hits(world, e) {
  const p = e.pos;
  return boxHitsWorld(world, p.x - e.hw, p.y, p.z - e.hw, p.x + e.hw, p.y + e.h, p.z + e.hw);
}

export function moveEntity(world, e, dt) {
  const v = e.vel;
  const p = e.pos;
  const maxStep = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
  const steps = Math.max(1, Math.ceil(maxStep / 0.4));
  const h = dt / steps;
  e.onGround = false;
  e.hitX = false;
  e.hitZ = false;
  e.hitCeil = false;
  for (let i = 0; i < steps; i++) {
    p.y += v.y * h;
    if (hits(world, e)) {
      if (v.y < 0) {
        p.y = Math.floor(p.y) + 1;
        e.onGround = true;
      } else {
        p.y = Math.floor(p.y + e.h) - e.h - 1e-4;
        e.hitCeil = true;
      }
      v.y = 0;
    }
    p.x += v.x * h;
    if (hits(world, e)) {
      p.x = v.x > 0 ? Math.floor(p.x + e.hw) - e.hw - 1e-4 : Math.floor(p.x - e.hw) + 1 + e.hw + 1e-4;
      v.x = 0;
      e.hitX = true;
    }
    p.z += v.z * h;
    if (hits(world, e)) {
      p.z = v.z > 0 ? Math.floor(p.z + e.hw) - e.hw - 1e-4 : Math.floor(p.z - e.hw) + 1 + e.hw + 1e-4;
      v.z = 0;
      e.hitZ = true;
    }
  }
}
