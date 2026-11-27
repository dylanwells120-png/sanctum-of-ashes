// Generic atlas discovery + slicing. Finds every <name>.json/<name>.png sheet under
// assets/sheets/{characters,tiles,props,ui,vfx}/ (and assets/sheets-draft/ as fallback),
// indexes frames by meaning (unit/anim/dir, arena/role, icon, vfx, prop, ui) and slices
// them for three.js (UV sub-rects) or canvas (tiles/icons). Missing art -> placeholders.
import * as THREE from 'three';

const FOLDERS = ['assets/sheets/characters/', 'assets/sheets/tiles/', 'assets/sheets/props/', 'assets/sheets/ui/', 'assets/sheets/vfx/', 'assets/sheets/'];
const DRAFT = ['char_templar', 'char_necromancer', 'char_hunter', 'char_assassin', 'char_gravewalker', 'char_gargoyle', 'char_ogre', 'char_archon',
  'tiles_ossuary', 'tiles_amphitheater', 'tiles_rooftop', 'tiles_foundry', 'tiles_cemetery', 'props', 'ui_hud', 'vfx_abilities', 'icons_skills', 'icons_concept_crops'].map(n => `assets/sheets-draft/${n}.json`);

export const UNIT_ALIASES = {
  templar: /templar|penitent/, necromancer: /necro|revenant/, hunter: /hunter|inquisitor/, assassin: /assassin|shadowreave/,
  gravewalker: /grave ?walker|gravewalker|husk|zombie/, gargoyle: /gargoyle|flayer/, ogre: /ogre|abomination|blood ?bound|bloodbound/, archon: /archon|boss/,
};
export const ARENA_ALIASES = { ossuary: /ossuary|coliseum/, amphitheater: /amphi|blood ?soaked/, rooftop: /rooftop|eclipse/, foundry: /foundry|iron ?maiden/, cemetery: /cemetery|rotunda|sunken/ };
const ANIM = { idle: 'idle', walk: 'walk', run: 'walk', move: 'walk', attack: 'attack', atk: 'attack', cast: 'attack', hit: 'hit', hurt: 'hit', death: 'death', die: 'death', dead: 'death' };
const DIRS = { s: 'S', n: 'N', e: 'E', w: 'W', se: 'SE', sw: 'SW', ne: 'NE', nw: 'NW', down: 'S', up: 'N', left: 'W', right: 'E', front: 'S', back: 'N', south: 'S', north: 'N', east: 'E', west: 'W' };
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function tryJSON(url) { try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) return null; const ct = r.headers.get('content-type') || ''; const txt = await r.text(); if (ct.includes('html') && !txt.trim().startsWith('{')) return { html: txt }; return JSON.parse(txt); } catch { return null; } }
function loadImage(url) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; }); }

export class Atlas {
  constructor(opts = {}) { this.opts = { aux: true, ...opts }; this.sheets = []; this.units = {}; this.tiles = {}; this.icons = []; this.vfx = {}; this.props = []; this.ui = []; this.log = []; this.tileCache = new Map(); this.tileMaps = {}; }

  async discover() {
    const ROOT = new URL('../', import.meta.url);
    const man = await tryJSON(new URL('assets/sheets/manifest.json', ROOT).href);
    const entries = (man && man.sheets) || [];
    const loaded = await Promise.all(entries.map(e => {
      const url = e.json || e.image || '';
      if (!this.opts.aux && /_(normal|roughness)(\.(json|png))?$/.test(url)) return null;
      return this.loadSheet(url, e.priority ?? 1, e.frames ? { frames: e.frames, meta: e.meta || {} } : null);
    }));
    for (const s of loaded) if (s) this.index(s);
    this.log.push(`sheets: ${this.sheets.length}`);
    return this;
  }
  async loadSheet(url, priority, bundled) {
    const ROOT = new URL('../', import.meta.url);
    const j = bundled || await tryJSON(new URL(url, ROOT).href); if (!j || !j.frames) return null;
    const imgName = (j.meta && j.meta.image) || url.split('/').pop().replace('.json', '.png');
    const imgUrl = new URL(imgName, new URL(url, ROOT)).href;
    const img = await loadImage(imgUrl); if (!img) { this.log.push('missing image ' + imgUrl); return null; }
    let frames = j.frames;
    if (Array.isArray(frames)) frames = Object.fromEntries(frames.map(f => [f.filename || f.name, f]));
    const fr = {};
    for (const [k, v] of Object.entries(frames)) { const f = v.frame || v; fr[k.replace(/\.(png|webp)$/i, '')] = { x: f.x, y: f.y, w: f.w, h: f.h }; }
    const name = url.split('/').pop().replace('.json', '');
    const cat = /characters\//.test(url) || /^char/.test(name) ? 'char' : /tiles\//.test(url) || /^tiles?/.test(name) ? 'tiles' : /vfx\//.test(url) || /vfx/.test(name) ? 'vfx'
      : /props\//.test(url) || /^props?/.test(name) ? 'props' : /icon/.test(name) ? 'icons' : /ui\//.test(url) || /ui|hud/.test(name) ? 'ui' : 'misc';
    const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    const s = { url, name, cat, img, tex, frames: fr, priority, json: j, W: img.naturalWidth, H: img.naturalHeight };
    this.sheets.push(s); return s;
  }
  index(s) {
    const sheetKey = s.name.toLowerCase();
    const M = s.json.meta || {};
    if (s.cat === "char" && M.animations && M.directions && !Array.isArray(M.animations)) {
      const unit = this.unitOf((M.unit || '') + ' ' + sheetKey + ' ' + Object.keys(s.frames)[0]); if (!unit) return;
      const U = (this.units[unit] ||= { pri: -1, anims: {} });
      if (s.priority < U.pri) return;
      U.pri = s.priority; U.anims = {}; U.sheet = s; U.fps = M.fps || null; U.fill = unit === "gargoyle" ? 0.74 : 0.82;
      const pv = M.pivot || { x: 0.5, y: 0.95 };
      for (const [key, names] of Object.entries(M.animations)) {
        const m = key.match(/^([a-z]+)_([A-Z]+)$/i); if (!m) continue;
        const anim = ANIM[m[1].toLowerCase()] || m[1]; const dir = DIRS[m[2].toLowerCase()] || m[2];
        (U.anims[anim] ||= {})[dir] = names.map(n => s.frames[n] && { sheet: s, rect: s.frames[n], name: n, pivot: (s.json.frames[n] && s.json.frames[n].pivot) || pv }).filter(Boolean);
      }
      return;
    }
    const mapKind = (sheetKey.match(/_(normal|roughness|emissive)$/) || [])[1];
    if (s.cat === 'tiles' && mapKind) { for (const [fname, rect] of Object.entries(s.frames)) (this.tileMaps[mapKind] ||= {})[fname.toLowerCase()] = { sheet: s, rect, name: fname }; return; }
    for (const [fname, rect] of Object.entries(s.frames)) {
      const f = { sheet: s, rect, name: fname }; const lname = fname.toLowerCase();
      const isIcon = s.cat === 'icons' || (s.cat === 'ui' && /icon|skill|ability/.test(sheetKey + lname) && !/orb|frame|slot|ornament|bookend|endcap|bar/.test(lname));
      if (s.cat === 'char' || (s.cat === 'misc' && /_(idle|walk|attack|hit|death)_/.test(lname))) {
        const m = lname.match(/^(.*?)[_-](idle|walk|run|move|attack|atk|cast|hit|hurt|death|die|dead)(?:[_-]([a-z]+))?[_-](\d+)$/);
        if (!m) continue;
        const unit = this.unitOf(m[1] + ' ' + sheetKey); if (!unit) continue;
        const anim = ANIM[m[2]]; const dir = DIRS[m[3] || 's'] || 'S'; const idx = +m[4];
        const U = (this.units[unit] ||= { pri: -1, anims: {} });
        if (s.priority > U.pri) { U.pri = s.priority; U.anims = {}; U.sheet = s; U.fill = 0.94; }
        if (s.priority < U.pri) continue;
        ((U.anims[anim] ||= {})[dir] ||= [])[idx] = f;
      } else if (s.cat === 'tiles') {
        let arena = null; for (const [a, re] of Object.entries(ARENA_ALIASES)) if (re.test(lname) || re.test(sheetKey)) arena = a;
        const role = ['stairs', 'floor', 'wall', 'trim', 'hazard', 'bridge', 'decal'].find(r => lname.includes(r)) || 'floor';
        const meta = s.json.tiles && s.json.tiles[fname]; const wrap = M.wrap && M.wrap[fname];
        (this.tiles[arena || 'any'] ||= []).push({ ...f, role, tileable: meta ? meta.tileable !== false : wrap ? wrap !== 'none' : role !== 'decal', pri: s.priority });
      } else if (isIcon) this.icons.push({ ...f, key: norm(fname), pri: s.priority - (/concept/.test(sheetKey) ? 0.5 : 0) });
      else if (s.cat === 'vfx') {
        const m = fname.match(/^(.*?)[_-]?(\d+)$/); const g = norm(m ? m[1] : fname); const i = m ? +m[2] : 0;
        const V = (this.vfx[g] ||= { pri: -1, frames: [] }); if (s.priority > V.pri) { V.pri = s.priority; V.frames = []; } if (s.priority < V.pri) continue; V.frames[i] = f;
      } else if (s.cat === 'props') this.props.push({ ...f, key: norm(fname), pri: s.priority, pivot: (M.pivots && M.pivots[fname]) || (M.anchor) || { x: 0.5, y: 0.97 } });
      else if (s.cat === 'ui') this.ui.push({ ...f, key: norm(fname), pri: s.priority });
    }
    for (const U of Object.values(this.units)) for (const a of Object.values(U.anims)) for (const d in a) a[d] = a[d].filter(Boolean);
    for (const V of Object.values(this.vfx)) V.frames = V.frames.filter(Boolean);
  }
  unitOf(str) { str = str.toLowerCase().replace(/[_-]/g, ' '); for (const [u, re] of Object.entries(UNIT_ALIASES)) if (re.test(str)) return u; return null; }

  // ---------------------------------------------------------------- characters
  // returns { frames:[f], mirror:bool } choosing the best available direction
  anim(unit, anim, dir) {
    const U = this.units[unit]; if (!U) return null;
    const A = U.anims[anim] || U.anims[anim === 'hit' ? 'idle' : anim === 'idle' ? 'walk' : anim === 'death' ? 'hit' : 'walk'] || U.anims.walk || U.anims.idle;
    if (!A) return null;
    const mirrorOf = { E: 'W', W: 'E', NE: 'NW', NW: 'NE', SE: 'SW', SW: 'SE' };
    const fallback = { SE: ['S', 'E'], SW: ['S', 'W'], NE: ['N', 'E'], NW: ['N', 'W'], E: ['S'], W: ['S'], N: ['S'], S: ['N'] };
    if (A[dir]?.length) return { frames: A[dir], mirror: false };
    if (mirrorOf[dir] && A[mirrorOf[dir]]?.length) return { frames: A[mirrorOf[dir]], mirror: true };
    for (const d of fallback[dir] || []) { if (A[d]?.length) return { frames: A[d], mirror: false }; if (mirrorOf[d] && A[mirrorOf[d]]?.length) return { frames: A[mirrorOf[d]], mirror: true }; }
    const any = Object.values(A).find(x => x.length); return any ? { frames: any, mirror: false } : null;
  }
  hasUnit(u) { return !!this.units[u]; }
  // apply a frame to a texture's UV transform (texture must share the sheet's source)
  static applyUV(tex, f, mirror) {
    if (!f) return;
    const s = f.sheet, r = f.rect;
    tex.repeat.set((mirror ? -1 : 1) * r.w / s.W, r.h / s.H);
    tex.offset.set((mirror ? r.x + r.w : r.x) / s.W, 1 - (r.y + r.h) / s.H);
  }
  // ---------------------------------------------------------------- canvas slicing
  sliceCanvas(f, size) {
    const c = document.createElement('canvas'); const r = f.rect; c.width = size || r.w; c.height = size ? Math.round(size * r.h / r.w) : r.h;
    c.getContext('2d').drawImage(f.sheet.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height); return c;
  }
  tile(arena, role, hint) {
    const key = arena + role + (hint || '');
    if (this.tileCache.has(key)) return this.tileCache.get(key);
    let list = (this.tiles[arena] || []).filter(t => t.role === role).sort((a, b) => b.pri - a.pri);
    if (!list.length) list = (this.tiles[arena] || []).filter(t => t.role === ({ stairs: 'trim', bridge: 'floor', decal: 'floor' }[role] || 'floor')).sort((a, b) => b.pri - a.pri);
    let t = (hint && list.find(x => x.name.toLowerCase().includes(hint))) || list.find(x => role === 'decal' || x.tileable) || list[0];
    if (hint && t && !t.name.toLowerCase().includes(hint)) t = list.find(x => x.tileable) || t;
    let canvas = t ? this.sliceCanvas(t) : placeholderTile(arena, role);
    const mk = (c, srgb) => { const tx = new THREE.CanvasTexture(c); if (srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4; return tx; };
    const out = { tex: mk(canvas, true), src: t ? t.sheet.name + ':' + t.name : 'placeholder' };
    if (t) for (const kind of ['normal', 'roughness', 'emissive']) { const m = this.tileMaps[kind] && this.tileMaps[kind][t.name.toLowerCase()]; if (m && t.pri > 0) out[kind] = mk(this.sliceCanvas(m), kind === 'emissive'); }
    this.tileCache.set(key, out); return out;
  }
  tileTex(arena, role, hint, rx = 1, ry = 1) { const t = this.tile(arena, role, hint).tex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; return t; }
  // material-ready set of maps with shared repeat
  tileMaps3(arena, role, hint, rx = 1, ry = 1, withAux = true) {
    const T = this.tile(arena, role, hint); const out = {};
    for (const k of ['tex', 'normal', 'roughness', 'emissive']) { if (!T[k] || (k !== 'tex' && !withAux && k !== 'emissive')) continue; const c = T[k].clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.needsUpdate = true; out[k] = c; }
    return out;
  }
  iconURL(key) {
    const k = norm(key); const c = this.icons.filter(i => i.key.includes(k)).sort((a, b) => b.pri - a.pri)[0];
    if (c) return this.sliceCanvas(c, 128).toDataURL();
    return placeholderIcon(key).toDataURL();
  }
  vfxFrames(key) {
    const aliases = { cleave: ['genfirecleave', 'thorncleave', 'cleave'], nova: ['genfirenova', 'cindernova', 'nova'], maelstrom: ['soulmaelstrom', 'genspectralswirl', 'maelstrom'],
      reaper: ['genspectralskull', 'spectralwisp', 'reaper'], bolt: ['arbalestbolt', 'genholybolt', 'bolt'], aegis: ['genholyburst', 'holysmite', 'aegis'],
      shadowstrike: ['genvoidslash', 'voidslash', 'shadowstrike'], shackle: ['shacklevortex', 'genvoidvortex', 'shackle'], hit: ['hitspark', 'aegis'],
      spawn: ['shadowstep', 'shackle'], fire: ['fire'], ash: ['ashburst', 'nova'], dome: ['aegisdome'], blood: ['bloodnova', 'nova'], smite: ['holysmite', 'aegis'] }[key] || [key];
    for (const a of aliases) {
      const g = this.vfx[a] || Object.entries(this.vfx).find(([k]) => k.startsWith(a))?.[1] || Object.entries(this.vfx).find(([k]) => k.includes(a))?.[1];
      if (g && g.frames.length) { const fr = g.frames.filter(Boolean); if (fr.length) return fr; }
    }
    return null;
  }
  prop(keys) { for (const key of [].concat(keys)) { const k = norm(key); const p = this.props.filter(p => p.key.includes(k)).sort((a, b) => b.pri - a.pri)[0]; if (p) return p; } return null; }
  uiURL(key) { const k = norm(key); const u = this.ui.filter(p => p.key.includes(k)).sort((a, b) => b.pri - a.pri)[0]; return u ? this.sliceCanvas(u, 256).toDataURL() : null; }
}

// ------------------------------------------------------------------ placeholders
const PAL = { ossuary: ['#8a7d66', '#5a5046'], amphitheater: ['#5c5c62', '#2a0204'], rooftop: ['#5d5a5a', '#2b2e38'], foundry: ['#2d2725', '#ff6a00'], cemetery: ['#4f5a52', '#0d1612'], any: ['#555', '#333'] };
export function placeholderTile(arena, role) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const [a, b] = PAL[arena] || PAL.any; g.fillStyle = role === 'hazard' ? b : a; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * 128, Math.random() * 128, 6, 6); }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(0, 0, 64, 64); g.strokeRect(64, 64, 64, 64); return c;
}
export function placeholderIcon(key) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#b58b3d'; g.font = 'bold 22px serif'; g.textAlign = 'center'; g.fillText(key.slice(0, 2).toUpperCase(), 32, 40); return c;
}
export function placeholderUnit(unit, color = '#888') {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.ellipse(64, 60, 26, 30, 0, 0, 7); g.fill(); g.fillRect(34, 90, 60, 150);
  g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText(unit, 64, 170); return c;
}
