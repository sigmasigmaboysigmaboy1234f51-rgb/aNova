import * as THREE from 'three';

// Glowing cubes that mobs sometimes drop. Grab one for a few seconds of
// something great. The index into POWER_ORDER travels as the pickup's value.

export const POWERS = {
  dmg: { name: 'Double Damage', short: '2× DMG', color: '#ff4a3a', time: 12 },
  speed: { name: 'Speed Boost', short: 'SPEED', color: '#39d8ff', time: 12 },
  shield: { name: 'Shield', short: 'SHIELD', color: '#6f8cff', time: 9 },
  rapid: { name: 'Rapid Fire', short: 'RAPID', color: '#ffd23f', time: 10 },
  ammo: { name: 'Infinite Ammo', short: '∞ AMMO', color: '#6fd35a', time: 12 },
};
export const POWER_ORDER = ['dmg', 'speed', 'shield', 'rapid', 'ammo'];

const protos = new Map();

// A see-through cube with a bright core and a little symbol on each side.
export function powerMesh(index) {
  const id = POWER_ORDER[index] || 'dmg';
  if (!protos.has(id)) {
    const color = new THREE.Color(POWERS[id].color);
    const g = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.45) }));
    core.rotation.set(0.6, 0.6, 0);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.44, 0.44, 0.44)), new THREE.LineBasicMaterial({ color }));
    g.add(shell, core, edge);
    g.userData.core = core;
    protos.set(id, g);
  }
  const m = protos.get(id).clone();
  m.userData.core = m.children[1];
  return m;
}
