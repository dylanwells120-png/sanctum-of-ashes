// Shared arena data (browser + Node). Units = metres. No three.js here.
// Each arena: walkable shapes, hazards, obstacles, spawns, heightAt.
const TAU = Math.PI * 2;
const inCircle = (x, z, cx, cz, r) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r;
const inRing = (x, z, r0, r1) => { const d = Math.hypot(x, z); return d >= r0 && d <= r1; };
// rotated rectangle: centre (cx,cz), half-length hl along angle a, half-width hw
function inRect(x, z, cx, cz, a, hl, hw) {
  const dx = x - cx, dz = z - cz, c = Math.cos(a), s = Math.sin(a);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return Math.abs(u) <= hl && Math.abs(v) <= hw;
}
function inOctagon(x, z, r) { // flat-sided regular octagon, apothem ~ r*cos(22.5)
  const ap = r * Math.cos(Math.PI / 8);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; if (x * Math.cos(a) + z * Math.sin(a) > ap) return false; }
  return true;
}
const ang = (k, n, off = 0) => off + k * TAU / n;
const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

export const ARENAS = {
  ossuary: {
    name: 'The Ossuary Coliseum', sub: 'Subterranean catacomb pit · 42 m', fog: 0x0b0f14, fogDensity: 0.022,
    ambient: 0x3a3430, radius: 21,
    walk(x, z) { return inCircle(x, z, 0, 0, 20.3); },
    obstacles: [...[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const [x, z] = polar(13, ang(k, 8, Math.PI / 8)); return { x, z, r: 0.7, kind: 'brazier' }; }),
                ...[0, 1, 2, 3].map(k => { const [x, z] = polar(11.5, ang(k, 4)); return { x, z, r: 1.1, kind: 'skull_pile' }; })],
    // spiked iron trapdoors: cycle every 6 s, active 1.5 s
    hazards: [[-8, -8], [8, -8], [-8, 8], [8, 8]].map(([x, z]) => ({ kind: 'spikes', shape: 'rect', x, z, a: 0, hl: 1.6, hw: 1.6, dps: 45, period: 6, active: 1.5 })),
    spawns: [0, 1, 2, 3].map(k => polar(19, ang(k, 4, Math.PI / 4))),
    playerSpawn: [0, 4],
    heightAt() { return 0; },
  },
  amphitheater: {
    name: 'The Blood-Soaked Amphitheater', sub: 'Open-air ruins · 36 m floor · crimson moonlight', fog: 0x0b0f14, fogDensity: 0.018,
    ambient: 0x2b3140, radius: 18,
    walk(x, z) { return inCircle(x, z, 0, 0, 17.4); },
    obstacles: [0, 1, 2, 3].map(k => { const [x, z] = polar(5.6, ang(k, 4, Math.PI / 4)); return { x, z, r: 0.6, kind: 'brazier' }; }),
    hazards: [0, 1, 2, 3].map(k => ({ kind: 'blood', shape: 'arc', r0: 7, r1: 9, a0: ang(k, 4, Math.PI / 4) - 0.62, a1: ang(k, 4, Math.PI / 4) + 0.62, dps: 9, slow: 0.75 })),
    spawns: [polar(16, -Math.PI / 2), polar(16, Math.PI / 2), polar(16, 0), polar(16, Math.PI)],
    playerSpawn: [0, 11],
    heightAt(x, z) { const d = Math.hypot(x, z); return d < 12.5 ? 0 : Math.min(4, Math.floor((d - 12.5) / 1.3) + 1) * 0.55; },
  },
  rooftop: {
    name: 'The Eclipse Rooftop Span', sub: 'Cathedral rooftops · 18 m octagon over the abyss', fog: 0x0b0f14, fogDensity: 0.016,
    ambient: 0x3a2a30, radius: 30,
    walk(x, z) {
      if (inOctagon(x, z, 9.6)) return true;
      for (let k = 0; k < 8; k++) {
        const a = ang(k, 8), card = k % 2 === 0, L = card ? 24 : 18;
        const [cx, cz] = polar(L / 2 + 2, a);
        if (inRect(x, z, cx, cz, a, L / 2, card ? 2.1 : 1.7)) return true;
        const [tx, tz] = polar(card ? 27 : 20.5, a);
        if (inRect(x, z, tx, tz, a, card ? 3.6 : 2.2, card ? 3.6 : 2.2)) return true;
      }
      return false;
    },
    fallKills: true,
    nav: [...Array(8)].flatMap((_, k) => { const a = ang(k, 8), card = k % 2 === 0; return [polar(7.5, a), polar(card ? 15 : 12, a), polar(card ? 25 : 19.5, a)]; }),
    obstacles: [0, 2, 4, 6].map(k => { const [x, z] = polar(27, ang(k, 8)); return { x: x * 1, z, r: 0.9, kind: 'gothic_spire' }; }),
    hazards: [],
    spawns: [0, 2, 4, 6].map(k => polar(26, ang(k, 8))),
    playerSpawn: [0, 3],
    heightAt() { return 0; },
  },
  foundry: {
    name: 'The Iron Maiden Foundry', sub: 'Subterranean forge · 24 m platform over molten iron', fog: 0x140806, fogDensity: 0.02,
    ambient: 0x3a2018, radius: 25,
    walk(x, z) {
      if (inOctagon(x, z, 12.6)) return true;
      if (inRing(x, z, 20, 24.6)) return true;
      for (let k = 0; k < 4; k++) { const a = ang(k, 4); const [cx, cz] = polar(16.3, a); if (inRect(x, z, cx, cz, a, 4.6, 1.8)) return true; }
      return false;
    },
    lavaKills: true,
    nav: [...[0, 1, 2, 3].flatMap(k => [polar(10.5, ang(k, 4)), polar(16, ang(k, 4)), polar(21.6, ang(k, 4))]), ...[...Array(16)].map((_, k) => polar(22.3, ang(k, 16)))],
    obstacles: [{ x: 0, z: 0, r: 1.5, kind: 'anvil' }],
    hazards: [{ kind: 'lava', shape: 'outside', dps: 60 }],
    spawns: [0, 1, 2, 3].map(k => polar(22.3, ang(k, 4, Math.PI / 4))),
    playerSpawn: [0, 5],
    heightAt() { return 0; },
  },
  cemetery: {
    name: 'The Sunken Cemetery Rotunda', sub: 'Flooded mausoleum · 40 m rotunda · ghost lanterns', fog: 0x0d1612, fogDensity: 0.03,
    ambient: 0x22302c, radius: 20,
    walk(x, z) { return inCircle(x, z, 0, 0, 19.3); },
    dry(x, z) {
      const d = Math.hypot(x, z);
      if (d < 5.2 || (d > 10 && d < 12.6)) return true;
      for (let k = 0; k < 4; k++) { const a = ang(k, 4); const [cx, cz] = polar(12, a); if (inRect(x, z, cx, cz, a, 7.4, 1.5)) return true; }
      return false;
    },
    obstacles: [{ x: 0, z: 0, r: 1.3, kind: 'angel_statue' }, ...[0, 1, 2, 3].map(k => { const [x, z] = polar(15.5, ang(k, 4, Math.PI / 4)); return { x, z, r: 0.8, kind: 'tombstone' }; })],
    hazards: [{ kind: 'water', shape: 'wet', slow: 0.55, dps: 0 }],
    spawns: [0, 1, 2, 3].map(k => polar(18, ang(k, 4))),
    playerSpawn: [0, 7.5],
    heightAt(x, z) { const d = Math.hypot(x, z); if (d < 5.2) return 0.4; return this.dry(x, z) ? 0.22 : -0.28; },
  },
};
export const ARENA_IDS = Object.keys(ARENAS);

// returns {dps, slow, kind} merged hazard for a point at sim time t
export function hazardAt(arena, x, z, t) {
  const A = ARENAS[arena]; let dps = 0, slow = 1, kind = null;
  for (const h of A.hazards) {
    let inside = false;
    if (h.shape === 'rect') inside = inRect(x, z, h.x, h.z, h.a, h.hl, h.hw) && (t % h.period) < h.active;
    else if (h.shape === 'arc') { const d = Math.hypot(x, z); let a = Math.atan2(z, x); if (d >= h.r0 && d <= h.r1) { for (const o of [0, TAU, -TAU]) if (a + o >= h.a0 && a + o <= h.a1) inside = true; } }
    else if (h.shape === 'wet') inside = !A.dry(x, z);
    if (inside) { dps += h.dps || 0; slow = Math.min(slow, h.slow ?? 1); kind = h.kind; }
  }
  return { dps, slow, kind };
}
export { inRect, inOctagon, polar };
