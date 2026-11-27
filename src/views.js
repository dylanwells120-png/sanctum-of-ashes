// Sprite views for units, projectiles, zones and ability VFX — all sliced from atlases.
import * as THREE from 'three';
import { Atlas, placeholderUnit } from './atlas.js';
import { softTex } from './world.js';
import { CLASSES, ENEMIES } from './sim.js';

const DEF_FPS = { idle: 5, walk: 8, attack: 12, hit: 10, death: 8 };
const LOOP = { idle: true, walk: true };
const SECT = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
export function dirFromFacing(f) { let a = f; const k = Math.round(a / (Math.PI / 4)); return SECT[((k % 8) + 8) % 8]; }

export class UnitView {
  constructor(atlas, scene, unit, height, isPlayer) {
    this.atlas = atlas; this.unit = unit; this.height = height; this.scene = scene; this.isPlayer = isPlayer;
    const U = atlas.units[unit];
    this.fill = U ? (U.fill || 0.85) : 0.85;
    const tex = U ? U.sheet.tex.clone() : new THREE.CanvasTexture(placeholderUnit(unit)); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    this.tex = tex; this.hasAtlas = !!U; this.fps = (U && U.fps) || DEF_FPS;
    this.mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.3, fog: true });
    this.sprite = new THREE.Sprite(this.mat); this.sprite.center.set(0.5, 0.05); scene.add(this.sprite);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(height * 0.22, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, map: softTex() }));
    sh.rotation.x = -Math.PI / 2; scene.add(sh); this.shadow = sh;
    this.flash = 0; this.lastHp = null; this.cur = null;
    if (!isPlayer) { // enemy hp bar
      const mk = c => new THREE.Sprite(new THREE.SpriteMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.9 }));
      this.hpBg = mk(0x120406); this.hpFg = mk(0xb3121e); this.hpFg.center.set(0, 0.5); this.hpBg.center.set(0, 0.5);
      this.hpBg.renderOrder = this.hpFg.renderOrder = 10; scene.add(this.hpBg, this.hpFg);
    }
    if (isPlayer) { // ring under player for team readability
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xb58b3d, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring); this.ring = ring;
    }
  }
  setColorRing(c) { if (this.ring) this.ring.material.color.set(c); }
  update(st, simT, dt, y = 0, extra = {}) {
    const anim = st.a || 'idle'; const dir = anim === 'death' ? 'S' : dirFromFacing(st.f);
    const age = Math.max(0, simT - (st.at || 0));
    let fl = null;
    if (this.hasAtlas) {
      const A = this.atlas.anim(this.unit, anim, dir);
      if (A && A.frames.length) {
        const fps = this.fps[anim] || DEF_FPS[anim] || 8; let i = Math.floor(age * fps);
        if (anim === 'attack') i = Math.min(A.frames.length - 1, Math.floor(age / 0.4 * A.frames.length));
        else if (LOOP[anim]) i %= A.frames.length; else i = Math.min(i, A.frames.length - 1);
        i = Math.max(0, i || 0); fl = A.frames[i] || A.frames[0]; Atlas.applyUV(this.tex, fl, A.mirror);
        const pv = fl.pivot || { y: 0.95 }; this.sprite.center.set(0.5, 1 - pv.y);
        const aspect = fl.rect.w / fl.rect.h, h = this.height / this.fill; this.sprite.scale.set(h * aspect, h, 1);
      }
    } else { const h = this.height; this.sprite.scale.set(h * 0.5, h, 1); }
    const fly = extra.fly ? extra.fly + Math.sin(simT * 3 + (st.id || 0)) * 0.25 : 0;
    this.sprite.position.set(st.x, y + fly, st.z); this.shadow.position.set(st.x, y + 0.03, st.z);
    this.shadow.scale.setScalar(fly ? 0.7 : 1);
    if (this.lastHp !== null && st.hp < this.lastHp - 0.5) this.flash = 0.18; this.lastHp = st.hp; this.flash = Math.max(0, this.flash - dt);
    const c = this.mat.color;
    if (this.flash > 0) c.setRGB(1.8, 0.6, 0.6); else if (extra.stun) c.setRGB(1.0, 1.0, 1.6); else if (extra.invis) c.setRGB(0.5, 0.45, 0.7); else c.setRGB(1, 1, 1);
    this.mat.opacity = extra.invis ? 0.45 : extra.away ? 0.25 : 1; this.mat.transparent = this.mat.opacity < 1;
    if (this.hpBg) {
      const show = st.hp < st.mhp && anim !== 'death'; this.hpBg.visible = this.hpFg.visible = show;
      if (show) { const w = Math.min(4, 0.6 + this.height * 0.45), top = y + fly + this.height * 1.08 + 0.25;
        this.hpBg.position.set(st.x - w / 2, top, st.z); this.hpBg.scale.set(w, 0.13, 1);
        this.hpFg.position.set(st.x - w / 2, top, st.z + 0.001); this.hpFg.scale.set(Math.max(0.001, w * st.hp / st.mhp), 0.11, 1); }
    }
    if (this.ring) { this.ring.position.set(st.x, y + 0.04, st.z); this.ring.visible = !extra.downed; }
    if (anim === 'death' && !this.isPlayer) { const k = Math.max(0, 1 - Math.max(0, age - 0.7) / 0.5); this.mat.opacity = k; this.mat.transparent = true; }
  }
  dispose() { for (const o of [this.sprite, this.shadow, this.hpBg, this.hpFg, this.ring]) if (o) { this.scene.remove(o); o.material?.dispose?.(); } this.tex.dispose(); }
}

// ---------------------------------------------------------------- VFX
const FX_COLOR = { cleave: 0xff6a00, nova: 0xff5a10, maelstrom: 0x38b2ac, reaper: 0x5ff0e0, bolt: 0xffd36a, aegis: 0xffcf5a, shadowstrike: 0xa050ff, shackle: 0x8a3cff, trap: 0xffc040, ashes: 0xff6a20 };
export class FX {
  constructor(atlas, scene) { this.atlas = atlas; this.scene = scene; this.live = []; this.zoneViews = new Map(); this.projViews = new Map(); }
  material(k) {
    const frames = this.atlas.vfxFrames(k);
    const tex = frames ? frames[0].sheet.tex.clone() : softTex().clone(); tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: frames ? 0xffffff : FX_COLOR[k] || 0xffffff, fog: false });
    return { mat, tex, frames };
  }
  setFrame(o, p) { if (!o.frames) return; const n = o.frames.length; const i = Math.max(0, Math.min(n - 1, Math.floor((p || 0) * n))); Atlas.applyUV(o.tex, o.frames[i], false); }
  spawn(e, follow) {
    const k = e.k; const { mat, tex, frames } = this.material(k);
    let obj;
    if (e.ground) { obj = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); obj.rotation.set(-Math.PI / 2, 0, -(e.r || 0)); obj.position.set(e.x, 0.12, e.z); }
    else { const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: mat.color, fog: false, rotation: -(e.r || 0) }); mat.dispose(); obj = new THREE.Sprite(sm); obj.position.set(e.x, 1.3, e.z); }
    const s = e.s || 2; obj.scale.set(s, s, s); obj.renderOrder = 5; this.scene.add(obj);
    this.live.push({ obj, tex, frames, t: 0, d: e.d || 0.5, follow: e.follow, loop: e.d > 1.2 });
  }
  update(dt, getPos) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const o = this.live[i]; o.t += dt; const p = o.t / o.d;
      if (p >= 1) { this.scene.remove(o.obj); o.obj.material.dispose(); o.tex.dispose(); this.live.splice(i, 1); continue; }
      this.setFrame(o, o.loop ? (o.t * 1.6) % 1 : p);
      if (o.follow != null) { const q = getPos(o.follow); if (q) { o.obj.position.x = q.x; o.obj.position.z = q.z; } }
      o.obj.material.opacity = o.loop ? Math.min(1, (o.d - o.t) * 2) : 1;
    }
  }
  syncProjectiles(list, simT) {
    const seen = new Set();
    for (const q of list) {
      seen.add(q.id); let v = this.projViews.get(q.id);
      if (!v) { const { mat, tex, frames } = this.material(q.k); const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: mat.color, fog: false }); mat.dispose();
        const sp = new THREE.Sprite(sm); sp.scale.set(q.k === 'bolt' ? 2.6 : 2.4, q.k === 'bolt' ? 2.6 : 2.4, 1); this.scene.add(sp); v = { sp, tex, frames }; this.projViews.set(q.id, v); }
      v.sp.position.set(q.x, 1.25, q.z); v.sp.material.rotation = -q.f;
      if (v.frames) { const n = v.frames.length; Atlas.applyUV(v.tex, v.frames[((Math.floor(simT * 12) % n) + n) % n], false); }
    }
    for (const [id, v] of this.projViews) if (!seen.has(id)) { this.scene.remove(v.sp); v.sp.material.dispose(); v.tex.dispose(); this.projViews.delete(id); }
  }
  syncZones(list, simT) {
    const seen = new Set();
    for (const z of list) {
      seen.add(z.id); let v = this.zoneViews.get(z.id);
      if (!v) {
        const fxk = { maelstrom: 'maelstrom', shackle: 'shackle', trap: 'aegis', aegis: 'aegis', ashes: 'nova', boss_nova: null }[z.k];
        let obj, o = {};
        if (fxk) { const m = this.material(fxk); o = m; obj = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.mat); obj.rotation.x = -Math.PI / 2; const s = z.r * 2.3; obj.scale.set(s, s, s); if (z.k === 'trap') m.mat.color.set(0xffaa44); if (z.k === 'ashes') m.mat.color.set(0xff8a50); }
        else { obj = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })); obj.rotation.x = -Math.PI / 2; }
        obj.position.set(z.x, 0.15, z.z); obj.renderOrder = 4; this.scene.add(obj);
        if (z.k === 'aegis') { const dome = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.12, z.r, 64), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
          dome.rotation.x = -Math.PI / 2; dome.position.set(z.x, 0.18, z.z); this.scene.add(dome); o.dome = dome; }
        v = { obj, ...o }; this.zoneViews.set(z.id, v);
      }
      const age = simT - z.t0;
      if (z.k === 'boss_nova') { const p = Math.min(1, age / 1.3); v.obj.scale.setScalar(z.r * p); v.obj.material.opacity = 0.4 + 0.5 * p; }
      else if (v.frames) { const n = v.frames.length; const idx = z.k === 'trap' ? (z.armed ? 1 : 2) : ((Math.floor(age * 8) % n) + n) % n; Atlas.applyUV(v.tex, v.frames[Math.max(0, Math.min(n - 1, idx))], false); v.obj.rotation.z = age * (z.k === 'maelstrom' || z.k === 'shackle' ? 1.5 : 0.2); }
      if (v.mat) v.mat.opacity = z.k === 'trap' ? 0.55 : Math.min(z.k === 'aegis' ? 0.45 : 1, (z.l - age) * 2);
    }
    for (const [id, v] of this.zoneViews) if (!seen.has(id)) { this.scene.remove(v.obj); if (v.dome) this.scene.remove(v.dome); v.obj.material.dispose(); v.tex?.dispose(); this.zoneViews.delete(id); }
  }
  clear() { for (const o of this.live) this.scene.remove(o.obj); this.live = []; this.syncProjectiles([], 0); this.syncZones([], 0); }
}
export { CLASSES, ENEMIES };
