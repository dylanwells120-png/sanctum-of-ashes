// Arena construction (three.js). Every surface uses tiles sliced from the tile sheets.
import * as THREE from 'three';
import { ARENAS, polar } from './arenaDefs.js';
import { Atlas } from './atlas.js';
let FIRE = null;

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

export function buildArena(id, atlas, scene, Q) {
  FIRE = atlas.vfxFrames('fire');
  const A = ARENAS[id]; const g = new THREE.Group(); g.name = 'arena'; scene.add(g);
  const anim = []; // per-frame updaters
  const lights = [];
  const aux = Q.high; // normal/roughness maps only in high quality

  const mat = (role, hint, rx, ry, o = {}) => {
    const m = atlas.tileMaps3(id, role, hint, rx, ry, aux);
    const p = { map: m.tex, roughness: o.roughness ?? 0.92, metalness: o.metalness ?? 0.0, side: o.side ?? THREE.FrontSide, color: o.color ?? 0xffffff };
    if (m.normal) { p.normalMap = m.normal; p.normalScale = new THREE.Vector2(0.8, 0.8); }
    if (m.roughness) p.roughnessMap = m.roughness;
    if (m.emissive && o.emissive !== false) { p.emissiveMap = m.emissive; p.emissive = new THREE.Color(o.emissiveColor ?? 0xffffff); p.emissiveIntensity = o.emissiveIntensity ?? 1; }
    else if (o.emissiveColor) { p.emissiveMap = m.tex; p.emissive = new THREE.Color(o.emissiveColor); p.emissiveIntensity = o.emissiveIntensity ?? 1; }
    if (role === 'decal') { p.alphaTest = 0.5; p.transparent = false; }
    if (o.transparent) { p.transparent = true; p.opacity = o.opacity ?? 1; p.depthWrite = false; }
    return new THREE.MeshStandardMaterial(p);
  };
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, opts = {}) => {
    const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz);
    me.receiveShadow = opts.receive ?? true; me.castShadow = opts.cast ?? false; g.add(me); return me;
  };
  const disc = (r, y, m, seg = 64) => add(new THREE.CircleGeometry(r, seg), m, 0, y, 0, -Math.PI / 2);
  const ring = (r0, r1, y, m, a0 = 0, al = TAU, seg = 96) => { const geo = new THREE.RingGeometry(r0, r1, seg, 1, a0, al); return add(geo, m, 0, y, 0, -Math.PI / 2); };
  // ring geometry UVs are planar; remap so the texture runs around the ring
  const ringUV = (mesh, r0, r1, tile = 3) => { const geo = mesh.geometry, pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); const a = Math.atan2(y, x), r = Math.hypot(x, y); uv.setXY(i, (a / TAU + 0.5) * (TAU * (r0 + r1) / 2) / tile, (r - r0) / tile); } uv.needsUpdate = true; return mesh; };
  const wallCyl = (r, y0, h, m, seg = 64, open = true) => { const geo = new THREE.CylinderGeometry(r, r, h, seg, 1, open); return add(geo, m, 0, y0 + h / 2, 0, 0, 0, 0, { receive: true }); };
  const box = (w, h, d, m, x, y, z, ry = 0) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, 0, ry, 0, { cast: Q.high });
  const pointLight = (color, intensity, dist, x, y, z, flicker = 0) => {
    const L = new THREE.PointLight(color, intensity, dist, 1.6); L.position.set(x, y, z); g.add(L); lights.push(L);
    if (flicker) { const base = intensity, ph = Math.random() * 10; anim.push(t => { L.intensity = base * (1 + flicker * (Math.sin(t * 13 + ph) * 0.5 + Math.sin(t * 7.3 + ph * 2) * 0.5)); }); }
    return L;
  };
  const prop = (keys, x, z, h, y = 0, opts = {}) => {
    const f = atlas.prop(keys); if (!f) return null;
    const tex = f.sheet.tex.clone(); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace;
    const r = f.rect; tex.repeat.set(r.w / f.sheet.W, r.h / f.sheet.H); tex.offset.set(r.x / f.sheet.W, 1 - (r.y + r.h) / f.sheet.H);
    const sm = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.35, fog: true, color: opts.tint ?? 0xffffff });
    const sp = new THREE.Sprite(sm); const pv = f.pivot || { x: 0.5, y: 0.97 };
    sp.center.set(pv.x, 1 - pv.y); sp.scale.set(h * r.w / r.h, h, 1); sp.position.set(x, y, z); g.add(sp); return sp;
  };
  const S = Math.max;
  // ------------------------------------------------------------------ per-arena
  let sky = null;
  if (id === 'ossuary') {
    disc(21.3, 0, mat('floor', 'floor_0', 10, 10));
    ringUV(ring(4.6, 20.6, 0.005, mat('floor', 'floor_2', 1, 1, { transparent: true, opacity: 0.35 })), 4.6, 20.6, 5);
    add(new THREE.CircleGeometry(3.6, 48), mat('decal', 'decal_0', 1, 1), 0, 0.02, 0, -Math.PI / 2);
    for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) add(new THREE.PlaneGeometry(3.2, 3.2), mat('hazard', 'hazard_1', 1, 1), x, 0.02, z, -Math.PI / 2);
    // bone-cage lower wall + loggia upper tier + trim ledges
    const circ = TAU * 21; wallCyl(21, 0, 6.5, mat('wall', 'wall_0', Math.round(circ / 5.2), 1.0, { side: THREE.BackSide }));
    ringUV(ring(21, 23.5, 6.5, mat('trim', 'trim_0', 1, 1)), 21, 23.5, 2.5);
    wallCyl(21, 6.5, 1.0, mat('trim', 'trim_0', Math.round(circ / 3), 1, { side: THREE.BackSide }));
    wallCyl(23.5, 6.5, 6, mat('wall', 'wall_1', Math.round(TAU * 23.5 / 5), 1, { side: THREE.BackSide }));
    wallCyl(23.5, 12.5, 6, mat('wall', 'wall_0', Math.round(TAU * 23.5 / 5), 1, { side: THREE.BackSide, color: 0x9a9a9a }));
    // spectator terraces (steps) behind the upper ring, out of reach
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + Math.PI / 8; const [x, z] = polar(13, a);
      const fx = prop(['brazier'], x, z, 2.1); pointLight(0xff6a00, Q.high ? 9 : 12, 11, x, 2.2, z, 0.18);
      flame(g, anim, x, 2.0, z, 0xff6a00, 0.9); }
    if (!Q.high) lights.splice(4);
    for (let k = 0; k < 4; k++) { const [x, z] = polar(11.5, k * TAU / 4); prop(['bone_pile', 'skull_pile'], x, z, 1.6); }
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + Math.PI / 4; const [x, z] = polar(20.3, a); prop(['portcullis', 'portcullis_arch'], x, z, 5.2); }
    for (let k = 0; k < 10; k++) { const a = k * TAU / 10 + 0.2; const [x, z] = polar(18.8, a); if (k % 2) prop(['iron_spike_fence', 'iron_fence'], x, z, 1.6); else prop(['broken_pillar', 'broken_column'], x, z, 2.2); }
    for (let k = 0; k < 6; k++) { const [x, z] = polar(22.4, k * TAU / 6 + 0.4); prop(['gibbet_cage'], x, z, 3.2, 8.5); prop(['banner_crimson'], x * 1.04, z * 1.04, 4.5, 9); }
    for (let k = 0; k < 8; k++) { const [x, z] = polar(20.9, k * TAU / 8); prop(['wall_torch', 'torch'], x, z, 1.4, 4.2); }
  } else if (id === 'amphitheater') {
    disc(12.6, 0, mat('floor', 'floor_0', 6, 6));
    add(new THREE.CircleGeometry(4.6, 64), mat('decal', 'decal_0', 1, 1, { emissiveColor: 0xff2030, emissiveIntensity: 0.55 }), 0, 0.03, 0, -Math.PI / 2);
    add(new THREE.RingGeometry(9.2, 12.4, 96), mat('decal', 'decal_1', 1, 1, { transparent: true, opacity: 0.0 }), 0, 0.01, 0, -Math.PI / 2);
    const blood = mat('hazard', 'hazard_0', 1, 1, { roughness: 0.25, emissiveColor: 0x2a0204, emissiveIntensity: 0.6 });
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + Math.PI / 4; ringUV(ring(7, 9, 0.025, blood, -a - 0.62, 1.24, 24), 7, 9, 2); }
    anim.push(t => { blood.map.offset.set(t * 0.01, t * 0.006); });
    // tiered seating rings (stairs tiles on risers, floor tiles on treads)
    for (let i = 0; i < 4; i++) {
      const r0 = 12.5 + i * 1.3, h = (i + 1) * 0.55;
      wallCyl(r0, h - 0.55, 0.55, mat('stairs', 'stairs_0', Math.round(TAU * r0 / 2.2), 0.25, { side: THREE.BackSide }));
      ringUV(ring(r0, r0 + 1.3, h, mat('floor', i % 2 ? 'floor_3' : 'floor_2', 1, 1)), r0, r0 + 1.3, 2.6);
    }
    ringUV(ring(17.7, 23, 2.2, mat('floor', 'floor_2', 1, 1)), 17.7, 23, 4);
    wallCyl(23, 2.2, 7, mat('wall', 'wall_0', Math.round(TAU * 23 / 4), 1.6, { side: THREE.BackSide }));
    wallCyl(23, 9.2, 0.8, mat('trim', 'trim_1', Math.round(TAU * 23 / 3), 1, { side: THREE.BackSide }));
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + Math.PI / 4; const [x, z] = polar(5.6, a); prop(['brazier'], x, z, 1.9); pointLight(0xff3020, 7, 9, x, 2, z, 0.2); flame(g, anim, x, 1.85, z, 0xff3a20, 0.8); }
    for (let k = 0; k < 14; k++) { const a = k * TAU / 14; const [x, z] = polar(21.5, a); prop(k % 3 ? ['lancet_arch'] : ['gothic_spire'], x, z, k % 3 ? 7 : 9, 2.2); }
    for (let k = 0; k < 3; k++) { const [x, z] = polar(16.8, k * TAU / 3 + 0.5); prop(['gibbet_cage'], x, z, 3.2, 3.2); }
    for (let k = 0; k < 6; k++) { const [x, z] = polar(15, k * TAU / 6 + 0.2); prop(['broken_pillar', 'broken_column'], x, z, 2.4, 1.1); }
    prop(['blood_font'], 0, -2.6, 1.6, 0.03);
    sky = { moon: 0xd8c7c9, moonGlow: 0xff2a2a, moonPos: [-30, 38, -70], moonSize: 16 };
  } else if (id === 'rooftop') {
    const oct = new THREE.CylinderGeometry(9.6, 9.6, 1.4, 8, 1, false); oct.rotateY(Math.PI / 8);
    const octM = [mat('wall', 'wall_0', 8, 0.4), mat('floor', 'floor_3', 5, 5), mat('floor', 'floor_3', 5, 5)];
    add(oct, octM, 0, -0.7, 0);
    add(new THREE.CircleGeometry(4.4, 48), mat('decal', 'decal_0', 1, 1), 0, 0.02, 0, -Math.PI / 2);
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8, card = k % 2 === 0, L = card ? 24 : 18, W = card ? 4.2 : 3.4; const [cx, cz] = polar(L / 2 + 2, a);
      box(L, 1.2, W, [mat('wall', 'wall_0', L / 4, 0.3), mat('wall', 'wall_0', L / 4, 0.3), mat('floor', 'floor_2', L / 4, W / 4), mat('floor', 'floor_2', 1, 1), mat('wall', 'wall_0', 1, .3), mat('wall', 'wall_0', 1, .3)], cx, -0.6, cz, -a);
      // flying-buttress arch under the span
      const arch = new THREE.Mesh(new THREE.TorusGeometry(L / 2.2, 0.45, 6, 18, Math.PI), mat('wall', 'wall_0', 4, 1));
      arch.position.set(cx, -1.2, cz); arch.rotation.set(Math.PI, -a, 0); arch.scale.set(1, 0.7, 1); g.add(arch);
      for (const side of [-1, 1]) { const ox = -Math.sin(a) * (W / 2 - 0.15) * side, oz = Math.cos(a) * (W / 2 - 0.15) * side;
        if (k === 3 && side === 1) continue; // broken balustrade (concept hazard B)
        box(L - 1.5, 0.55, 0.25, mat('trim', 'trim_0', L / 3, 1), cx + ox, 0.27, cz + oz, -a); }
      const [tx, tz] = polar(card ? 27 : 20.5, a); const T = card ? 7.4 : 4.6;
      box(T, 1.6, T, [mat('wall', 'wall_0', 2, .4), mat('wall', 'wall_0', 2, .4), mat('floor', 'floor_0', T / 4, T / 4), mat('floor', 'floor_0', 1, 1), mat('wall', 'wall_0', 2, .4), mat('wall', 'wall_0', 2, .4)], tx, -0.8, tz, -a);
      if (card) { prop(['gothic_spire'], tx + Math.cos(a) * 2.6, tz + Math.sin(a) * 2.6, 9); prop(['gargoyle_statue', 'gargoyle_spout'], tx - Math.sin(a) * 3, tz + Math.cos(a) * 3, 2.2); }
      else prop(['gothic_spire'], tx, tz, 6.5, 0);
      const [lx, lz] = polar(L * 0.55, a + 0.12); prop(['ghost_lantern_hanging', 'ghost_lantern'], lx, lz, 1.6, 2.5);
    }
    for (let k = 0; k < 8; k++) { const [x, z] = polar(9.3, k * TAU / 8 + Math.PI / 8); box(0.6, 1.1, 0.6, mat('wall', 'wall_0', .3, .3), x, 0.55, z); }
    // abyss far below + distant cathedral spires
    const ab = mat('hazard', 'hazard_1', 40, 40, { emissive: false }); add(new THREE.PlaneGeometry(400, 400), ab, 0, -38, 0, -Math.PI / 2);
    for (let k = 0; k < 26; k++) { const a = k * TAU / 26 + Math.random() * 0.2, r = 40 + Math.random() * 30, h = 30 + Math.random() * 40;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2 + Math.random() * 2.5, h, 6), mat('floor', 'floor_1', 1, 6)); const [x, z] = polar(r, a); cone.position.set(x, -38 + h / 2 + Math.random() * 18, z); g.add(cone);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 40, 5), mat('wall', 'wall_0', 1, 6)); tower.position.set(x, -38 + 12, z); g.add(tower); }
    sky = { eclipse: true, moonPos: [25, 30, -60], moonSize: 18 };
  } else if (id === 'foundry') {
    const oct = new THREE.CylinderGeometry(12.6, 13.6, 3, 8, 1, false); oct.rotateY(Math.PI / 8);
    add(oct, [mat('wall', 'wall_0', 10, 1), mat('floor', 'floor_0', 6, 6), mat('floor', 'floor_0', 1, 1)], 0, -1.5, 0);
    add(new THREE.CircleGeometry(5.5, 8), mat('decal', 'decal_0', 1, 1), 0, 0.02, 0, -Math.PI / 2, 0);
    add(new THREE.CircleGeometry(8.5, 8), mat('floor', 'floor_1', 4, 4), 0, 0.01, 0, -Math.PI / 2).rotation.z = Math.PI / 8;
    prop(['alchemical_anvil', 'anvil'], 0, 0, 2.6, 0.02);
    // molten iron lake (animated scroll) + glow
    const lava = mat('hazard', 'hazard_0', 14, 14, { emissiveColor: 0xffd700, emissiveIntensity: 1.25, roughness: 0.6 });
    lava.emissiveMap = lava.map; add(new THREE.CircleGeometry(60, 64), lava, 0, -1.4, 0, -Math.PI / 2, 0, 0, { receive: false });
    anim.push(t => { lava.map.offset.set(t * 0.012, t * 0.007); lava.emissiveIntensity = 1.1 + Math.sin(t * 1.7) * 0.15; });
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4; const [cx, cz] = polar(16.3, a);
      box(9.4, 0.4, 3.6, [mat('trim', 'trim_0', 3, .3), mat('trim', 'trim_0', 3, .3), mat('stairs', 'stairs_0', 3, 1.2), mat('stairs', 'stairs_0', 1, 1), mat('trim', 'trim_0', 1, .3), mat('trim', 'trim_0', 1, .3)], cx, -0.2, cz, -a);
      for (const side of [-1, 1]) { const ox = -Math.sin(a) * 1.8 * side, oz = Math.cos(a) * 1.8 * side; box(9.2, 0.1, 0.1, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 }), cx + ox, 1.1, cz + oz, -a); } }
    ringUV(ring(20, 24.8, 0, mat('floor', 'floor_2', 1, 1)), 20, 24.8, 3);
    wallCyl(20, -1.5, 1.5, mat('trim', 'trim_0', 30, 0.5, { side: THREE.FrontSide }));
    wallCyl(25, 0, 12, mat('wall', 'wall_0', Math.round(TAU * 25 / 4), 3, { side: THREE.BackSide }));
    // lava falls from the walls
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + 0.3; const [x, z] = polar(24.6, a);
      const lf = mat('hazard', 'hazard_2', 1, 4, { emissiveColor: 0xffb000, emissiveIntensity: 1.4 }); lf.emissiveMap = lf.map;
      const pl = add(new THREE.PlaneGeometry(2.2, 12), lf, x, 6, z, 0, -a - Math.PI / 2, 0, { receive: false }); anim.push(t => { lf.map.offset.y = t * 0.5; }); }
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; pointLight(0xff6a00, 14, 20, ...[Math.cos(a) * 16, -0.5, Math.sin(a) * 16], 0.12); }
    if (!Q.high) lights.splice(3);
    for (let k = 0; k < 4; k++) { const [x, z] = polar(22.4, k * TAU / 4 + Math.PI / 4); prop(['iron_maiden'], x, z, 3.2); prop(['gibbet_cage'], x * 0.75, z * 0.75, 3, 4.5); }
    for (let k = 0; k < 8; k++) { const [x, z] = polar(24.5, k * TAU / 8 + 0.15); prop(['wall_torch', 'torch'], x, z, 1.4, 3.5); }
  } else if (id === 'cemetery') {
    const water = mat('hazard', 'hazard_0', 10, 10, { roughness: 0.12, metalness: 0.1, color: 0x8fa69a });
    add(new THREE.CircleGeometry(21, 64), water, 0, -0.28, 0, -Math.PI / 2);
    anim.push(t => { water.map.offset.set(Math.sin(t * 0.1) * 0.05, t * 0.008); });
    const cyl = (r, h, y, top) => add(new THREE.CylinderGeometry(r, r, h, 64), [mat('wall', 'wall_0', Math.round(TAU * r / 4), 0.25), top, top], 0, y - h / 2, 0);
    cyl(5.2, 0.8, 0.4, mat('floor', 'floor_0', 3, 3));
    ringUV(ring(10, 12.6, 0.22, mat('floor', 'floor_3', 1, 1)), 10, 12.6, 2.6);
    wallCyl(12.6, -0.3, 0.52, mat('trim', 'trim_0', 30, 0.3, { side: THREE.FrontSide })); wallCyl(10, -0.3, 0.52, mat('trim', 'trim_0', 24, 0.3, { side: THREE.BackSide }));
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4; const [cx, cz] = polar(12, a);
      box(14.8, 0.5, 3, [mat('wall', 'wall_0', 4, .2), mat('wall', 'wall_0', 4, .2), mat('floor', 'floor_2', 1, 3.5), mat('floor', 'floor_2', 1, 1), mat('wall', 'wall_0', 1, .2), mat('wall', 'wall_0', 1, .2)], cx, -0.03, cz, -a); }
    ringUV(ring(19.3, 24, 0.3, mat('floor', 'floor_1', 1, 1)), 19.3, 24, 3);
    wallCyl(24, 0.3, 4.5, mat('wall', 'wall_0', Math.round(TAU * 24 / 4), 1.1, { side: THREE.BackSide }));
    prop(['angel_statue', 'weeping_angel'], 0, 0, 4.2, 0.4);
    const lanterns = 6;
    for (let k = 0; k < lanterns; k++) { const a = k * TAU / lanterns + Math.PI / 6; const [x, z] = polar(12.9, a); prop(['ghost_lamp', 'ghost_lantern'], x, z, 3.4, 0.22);
      if (Q.high || k % 2 === 0) pointLight(0x38b2ac, 9, 12, x, 3.2, z, 0.08); wisp(g, anim, x, 3.1, z); }
    for (let k = 0; k < 4; k++) { const [x, z] = polar(15.5, k * TAU / 4 + Math.PI / 4); prop(['gravestone', 'tombstone'], x, z, 1.7, -0.2); }
    for (let k = 0; k < 10; k++) { const [x, z] = polar(17.5 + (k % 2), k * TAU / 10 + 0.35); prop(k % 3 ? ['gravestone', 'tombstone'] : ['stone_sarcophagus', 'sarcophagus'], x, z, k % 3 ? 1.5 : 1.3, -0.25); }
    for (let k = 0; k < 18; k++) { const [x, z] = polar(22.5, k * TAU / 18); prop(k % 6 === 0 ? ['gothic_spire', 'mausoleum'] : ['iron_spike_fence', 'iron_fence'], x, z, k % 6 === 0 ? 7 : 2.4, 0.3); }
    sky = { moon: 0xb8d0c8, moonGlow: 0x38b2ac, moonPos: [-20, 34, -70], moonSize: 9 };
  }
  // ------------------------------------------------------------------ sky + light
  const hemi = new THREE.HemisphereLight(0x8a94a8, 0x0b0f14, id === 'foundry' ? 1.1 : id === 'cemetery' ? 1.0 : 0.75); g.add(hemi);
  const amb = new THREE.AmbientLight(A.ambient, 2.2); g.add(amb);
  const keyColor = { ossuary: 0xc8bba8, amphitheater: 0x9aa9c4, rooftop: 0xe63946, foundry: 0xff8a40, cemetery: 0x7fa8a0 }[id];
  const key = new THREE.DirectionalLight(keyColor, id === 'rooftop' ? 2.0 : id === 'amphitheater' ? 1.8 : id === 'foundry' ? 1.5 : 1.3);
  key.position.set(-14, 34, 12); key.target.position.set(0, 0, 0); g.add(key, key.target);
  if (Q.high) { key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const c = key.shadow.camera; c.left = c.bottom = -32; c.right = c.top = 32; c.near = 1; c.far = 90; key.shadow.bias = -0.0008; }
  if (sky) addSky(g, sky);
  // drifting ground fog sprites (volumetric fog albedo #0B0F14 lifted for visibility)
  const fogCount = Q.high ? 46 : 18; const fogTex = softTex(); const fogs = [];
  for (let i = 0; i < fogCount; i++) {
    const m = new THREE.SpriteMaterial({ map: fogTex, color: id === 'foundry' ? 0x5a3020 : id === 'cemetery' ? 0x50675f : 0x6a7280, transparent: true, opacity: 0.16, depthWrite: false, fog: true });
    const s = new THREE.Sprite(m); const r = Math.random() * (A.radius + 4), a = Math.random() * TAU; s.position.set(Math.cos(a) * r, 0.6 + Math.random() * 1.6, Math.sin(a) * r); const sc = 7 + Math.random() * 8; s.scale.set(sc, sc * 0.45, 1); g.add(s); fogs.push([s, Math.random() * 10]);
  }
  anim.push((t, dt) => { for (const [s, ph] of fogs) { s.position.x += Math.sin(t * 0.07 + ph) * dt * 0.4; s.position.z += Math.cos(t * 0.05 + ph) * dt * 0.3; s.material.opacity = 0.11 + Math.sin(t * 0.3 + ph) * 0.05; } });
  return { group: g, update: (t, dt) => anim.forEach(f => f(t, dt)), dispose() { scene.remove(g); g.traverse(o => { o.geometry?.dispose?.(); }); } };
}

let _soft = null;
function softTex() {
  if (_soft) return _soft; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); _soft = new THREE.CanvasTexture(c); return _soft;
}
export { softTex };
function flame(g, anim, x, y, z, color, s) {
  if (FIRE) {
    const tex = FIRE[0].sheet.tex.clone(); tex.needsUpdate = true;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: (((color >> 8) & 255) < 120 && (color & 255) < 120) ? 0xffffff : color }));
    sp.center.set(0.5, 0.12); sp.position.set(x, y - 0.25, z); sp.scale.set(s * 1.5, s * 1.5, 1); g.add(sp); const ph = Math.random() * 3;
    anim.push(t => Atlas.applyUV(tex, FIRE[Math.floor((t + ph) * 16) % FIRE.length], false)); return;
  }
  const m = new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.set(s * 1.4, s * 2, 1); g.add(sp); const ph = Math.random() * 9;
  anim.push(t => { const k = 1 + Math.sin(t * 17 + ph) * 0.12 + Math.sin(t * 9 + ph) * 0.1; sp.scale.set(s * 1.4 * k, s * 2.1 * k, 1); });
}
function wisp(g, anim, x, y, z) {
  const m = new THREE.SpriteMaterial({ map: softTex(), color: 0x38b2ac, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.set(1.6, 1.6, 1); g.add(sp); const ph = Math.random() * 9;
  anim.push(t => { sp.material.opacity = 0.7 + Math.sin(t * 3 + ph) * 0.3; });
}
function addSky(g, sky) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  if (sky.eclipse) {
    const gr = x.createRadialGradient(128, 128, 40, 128, 128, 128); gr.addColorStop(0, 'rgba(255,80,70,1)'); gr.addColorStop(0.3, 'rgba(230,57,70,.85)'); gr.addColorStop(1, 'rgba(230,57,70,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256); x.fillStyle = '#050304'; x.beginPath(); x.arc(128, 128, 44, 0, 7); x.fill();
  } else {
    const col = '#' + sky.moon.toString(16).padStart(6, '0'), glow = '#' + sky.moonGlow.toString(16).padStart(6, '0');
    const gr = x.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, glow + 'aa'); gr.addColorStop(1, glow + '00'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    x.fillStyle = col; x.beginPath(); x.arc(128, 128, 36, 0, 7); x.fill(); x.fillStyle = 'rgba(80,40,40,.25)'; for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(110 + Math.random() * 36, 110 + Math.random() * 36, 4 + Math.random() * 6, 0, 7); x.fill(); }
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, fog: false, depthWrite: false }));
  sp.position.set(...sky.moonPos); sp.scale.set(sky.moonSize * 2, sky.moonSize * 2, 1); sp.renderOrder = -1; g.add(sp);
}
