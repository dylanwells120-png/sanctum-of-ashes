// Sanctum of Ashes — client: menus, input (keyboard/mouse/touch), rendering, HUD, solo + LAN co-op.
import * as THREE from 'three';
import { Atlas } from './atlas.js';
import { buildArena } from './world.js';
import { UnitView, FX } from './views.js';
import { Sim, CLASSES, CLASS_IDS, ENEMIES, TICK, WAVES } from './sim.js';
import { ARENAS, ARENA_IDS, hazardAt } from './arenaDefs.js';
import { Net, probe } from './net.js';
import { initFullscreen } from './fullscreen.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isTouch = params.has('touch') ? params.get('touch') !== '0' : (matchMedia('(pointer: coarse)').matches || isIOS);
if (isTouch) document.body.classList.add('touch');
initFullscreen();

// ------------------------------------------------------------------ settings
const SKEY = 'soa_settings_v1';
const defaults = { quality: (isTouch || isIOS) ? 'low' : 'high', fog: true, post: !(isTouch || isIOS), dpr: (isTouch || isIOS) ? 1.5 : 2, fps: false };
const settings = Object.assign({}, defaults, JSON.parse(localStorage.getItem(SKEY) || '{}'));
if (params.get('q')) { settings.quality = params.get('q'); settings.post = params.get('q') === 'high'; }
const saveSettings = () => localStorage.setItem(SKEY, JSON.stringify(settings));
const Q = () => ({ high: settings.quality === 'high' });

// ------------------------------------------------------------------ renderer
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality === 'high', powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 500);
let composer = null, bloomPass = null;
function applyRendererSettings() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.dpr));
  renderer.shadowMap.enabled = settings.quality === 'high';
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250));
window.visualViewport?.addEventListener('resize', resize);
async function setupPost(scene) {
  composer = null; if (!settings.post) return;
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.82); composer.addPass(bloomPass); composer.addPass(new OutputPass());
    resize();
  } catch (e) { console.warn('post disabled', e); composer = null; }
}
applyRendererSettings();

// ------------------------------------------------------------------ atlas
const atlas = new Atlas({ aux: settings.quality === 'high' });
const loadInfo = $('#loadinfo'); loadInfo.textContent = 'Loading sprite and tile sheets…';
await atlas.discover();
loadInfo.textContent = atlas.log.join(' · ') + ` · quality: ${settings.quality}${isTouch ? ' · touch controls' : ''}`;

// ------------------------------------------------------------------ menu
let chosenClass = localStorage.getItem('soa_class') || params.get('class') || 'templar';
if (params.get('class')) chosenClass = params.get('class');
let chosenArena = params.get('arena') || localStorage.getItem('soa_arena') || 'ossuary';
$('#name').value = params.get('name') || localStorage.getItem('soa_name') || '';
const portrait = (unit, size = 150) => {
  const A = atlas.anim(unit, 'idle', 'S') || atlas.anim(unit, 'walk', 'S');
  if (!A) { const c = document.createElement('canvas'); c.width = c.height = 8; return c; }
  return atlas.sliceCanvas(A.frames[0], size);
};
function buildClassCards(el, small) {
  el.innerHTML = '';
  for (const id of CLASS_IDS) {
    const C = CLASSES[id]; const d = document.createElement('div'); d.className = 'card' + (id === chosenClass ? ' sel' : ''); d.dataset.id = id;
    d.appendChild(portrait(id, small ? 96 : 150));
    d.insertAdjacentHTML('beforeend', `<div class="t">${C.name}</div><div class="d">${C.blurb}</div>`);
    d.addEventListener('click', () => { chosenClass = id; localStorage.setItem('soa_class', id); document.querySelectorAll('#classes .card, #lobby-classes .card').forEach(c => c.classList.toggle('sel', c.dataset.id === id)); if (net) net.send({ t: 'set', cls: id }); });
    el.appendChild(d);
  }
}
function buildArenaCards(el, onPick, enabled = true) {
  el.innerHTML = '';
  for (const id of ARENA_IDS) {
    const A = ARENAS[id]; const d = document.createElement('div'); d.className = 'card' + (id === chosenArena ? ' sel' : ''); d.dataset.id = id;
    d.innerHTML = `<img src="${new URL('../assets/concept/' + id + '.jpg', import.meta.url).href}" alt=""><div class="t">${A.name.replace('The ', '')}</div><div class="d">${A.sub}</div>`;
    if (enabled) d.addEventListener('click', () => onPick(id)); else d.style.opacity = 0.75;
    el.appendChild(d);
  }
}
buildClassCards($('#classes'));
const pickArena = id => { chosenArena = id; localStorage.setItem('soa_arena', id); document.querySelectorAll('#arenas .card').forEach(c => c.classList.toggle('sel', c.dataset.id === id)); };
buildArenaCards($('#arenas'), pickArena);
const myName = () => ($('#name').value.trim() || 'Pilgrim').slice(0, 16);
$('#name').addEventListener('change', () => { localStorage.setItem('soa_name', $('#name').value.trim()); net?.send({ t: 'set', name: myName() }); });

// settings UI (shared by menu + pause)
function renderSettings() {
  const s = $('#settings');
  s.innerHTML = `
  <label>Quality <select id="s-q"><option value="high">High (shadows, normal maps)</option><option value="low">Low / iPad (fast)</option></select></label>
  <label>Volumetric fog <input type="checkbox" id="s-fog"></label>
  <label>Bloom post-processing <input type="checkbox" id="s-post"></label>
  <label>Resolution cap <select id="s-dpr"><option value="1">1.0x</option><option value="1.5">1.5x</option><option value="2">2.0x</option></select></label>
  <label>Show FPS <input type="checkbox" id="s-fps"></label>`;
  $('#s-q').value = settings.quality; $('#s-fog').checked = settings.fog; $('#s-post').checked = settings.post; $('#s-dpr').value = String(settings.dpr); $('#s-fps').checked = settings.fps;
  s.onchange = async () => {
    const qChanged = settings.quality !== $('#s-q').value || settings.post !== $('#s-post').checked;
    settings.quality = $('#s-q').value; settings.fog = $('#s-fog').checked; settings.post = $('#s-post').checked; settings.dpr = +$('#s-dpr').value; settings.fps = $('#s-fps').checked; saveSettings();
    applyRendererSettings(); if (G.scene) { G.scene.fog.density = ARENAS[G.arena].fogDensity * (settings.fog ? 1 : 0.3); if (qChanged) rebuildWorld(); }
  };
}
renderSettings();
let settingsFromMenu = false;
$('#settings-btn').onclick = () => { settingsFromMenu = true; $('#pause h2').textContent = 'Settings'; $('#resume').textContent = 'Close'; $('#quit').classList.add('hidden'); $('#pause').classList.remove('hidden'); };

// ------------------------------------------------------------------ game state
const G = { mode: 'menu', scene: null, world: null, fx: null, sim: null, arena: null, myId: null, views: new Map(), paused: false,
  snaps: [], state: null, simT: 0, acc: 0, me: null, lastSend: 0, ended: false, lobby: null, bigErrT: 0 };
let net = null;
window.__soa = { G, atlas, settings, get state() { return G.state; }, get net() { return net; } };

function clearScene() {
  for (const v of G.views.values()) v.dispose(); G.views.clear();
  if (G.fx) G.fx.clear(); if (G.world) G.world.dispose();
  G.scene = null; G.world = null; G.fx = null; composer = null;
}
function rebuildWorld() {
  if (!G.scene) return; G.world.dispose(); G.world = buildArena(G.arena, atlas, G.scene, Q()); setupPost(G.scene);
  G.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
}
async function startGame(arena, mode) {
  clearScene(); G.mode = 'loading'; G.arena = arena; G.ended = false; G.paused = false; G.snaps = []; G.acc = 0; G.bigErrT = 0;
  const A = ARENAS[arena]; const scene = new THREE.Scene();
  scene.background = new THREE.Color(A.fog); scene.fog = new THREE.FogExp2(A.fog, A.fogDensity * (settings.fog ? 1 : 0.3));
  G.world = buildArena(arena, atlas, scene, Q()); G.fx = new FX(atlas, scene);
  await setupPost(scene);
  G.scene = scene; G.mode = mode; camInit = false;
  if (mode === 'solo') { G.sim = new Sim(arena); G.myId = 'me'; G.sim.addPlayer('me', myName(), chosenClass); G.local = G.sim; }
  else { G.sim = null; G.myId = net.id; G.local = new Sim(arena); G.me = null; }
  buildSkillbar(); buildMinimap(arena);
  for (const s of ['#menu', '#lobby', '#end', '#pause']) $(s).classList.add('hidden');
  $('#hud').classList.remove('hidden'); if (isTouch) $('#touch').classList.remove('hidden');
  toast(A.name);
}
function toMenu() {
  clearScene(); G.mode = 'menu'; G.state = null; $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden');
  for (const s of ['#lobby', '#end', '#pause']) $(s).classList.add('hidden'); $('#menu').classList.remove('hidden');
}
$('#solo').onclick = () => { localStorage.setItem('soa_name', $('#name').value.trim()); startGame(chosenArena, 'solo'); };
$('#again').onclick = () => { if (G.mode === 'solo') startGame(G.arena, 'solo'); else { $('#end').classList.add('hidden'); } };
$('#end-menu').onclick = () => { if (net) { net.close(); net = null; } toMenu(); };
$('#pause-btn').onclick = () => openPause();
$('#resume').onclick = () => { $('#pause').classList.add('hidden'); G.paused = false; if (settingsFromMenu) { settingsFromMenu = false; } };
$('#quit').onclick = () => { if (net) { net.close(); net = null; } toMenu(); };
function openPause() { if (G.mode === 'menu') return; settingsFromMenu = false; $('#pause h2').textContent = G.mode === 'solo' ? 'Paused' : 'Menu (co-op keeps running)'; $('#resume').textContent = 'Resume'; $('#quit').classList.remove('hidden'); $('#pause').classList.remove('hidden'); if (G.mode === 'solo') G.paused = true; }

// ------------------------------------------------------------------ HUD
const slotEls = [], tbEls = [];
const KEYS = ['LMB', '1', '2', 'R'];
function buildSkillbar() {
  const me = G.mode === 'solo' ? G.sim.players.get('me') : null; const cls = me ? me.cls : chosenClass; const C = CLASSES[cls];
  const bar = $('#skillbar'); bar.innerHTML = ''; slotEls.length = 0;
  C.slots.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'slot'; d.title = s.name;
    d.innerHTML = `<img src="${atlas.iconURL(s.icon)}" alt=""><div class="cd"></div><div class="cdt"></div><div class="key">${KEYS[i]}</div>${s.cost ? `<div class="cost">${s.cost}</div>` : ''}`;
    bar.appendChild(d); slotEls.push(d);
  });
  const ui = (k, fallback) => atlas.uiURL(k) || fallback;
  const frame = ui('orb_frame'); for (const o of document.querySelectorAll('.orb-frame')) { if (frame) { o.style.backgroundImage = `url(${frame})`; o.classList.remove('css'); } else o.classList.add('css'); }
  const fh = atlas.uiURL('orb_fill_crimson') || atlas.uiURL('orb_health'), fm = atlas.uiURL('orb_fill_soul') || atlas.uiURL('orb_soul');
  if (fh) $('#orb-hp .orb-fill').style.backgroundImage = `url(${fh})`; if (fm) $('#orb-mp .orb-fill').style.backgroundImage = `url(${fm})`;
  // touch buttons
  const tb = $('#tbuttons'); tb.innerHTML = ''; tbEls.length = 0;
  const pos = [[150, 140, 96], [52, 158, 66], [80, 66, 66], [168, 36, 66]];
  C.slots.forEach((s, i) => {
    const b = document.createElement('div'); b.className = 'tb'; const [x, y, sz] = pos[i];
    Object.assign(b.style, { left: x - sz / 2 + 'px', top: y - sz / 2 + 'px', width: sz + 'px', height: sz + 'px' });
    b.innerHTML = `<img src="${atlas.iconURL(s.icon)}" alt=""><div class="cd"></div>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('down'); if (i === 0) input.touchFire = true; else input.cast.push(i); });
    const up = () => { b.classList.remove('down'); if (i === 0) input.touchFire = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    tb.appendChild(b); tbEls.push(b);
  });
}
function toast(text) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = text; const t = $('#toasts'); t.appendChild(d); while (t.children.length > 2) t.firstChild.remove(); setTimeout(() => d.remove(), 2700); }
const tmpV = new THREE.Vector3();
function damageNumber(e) {
  const layer = $('#dmg-layer'); if (layer.childElementCount > 40) return;
  tmpV.set(e.x, (e.h || 2) * 1.05, e.z).project(camera); if (tmpV.z > 1) return;
  const d = document.createElement('div'); d.className = 'dmg' + (e.tgt === 'p' ? ' p' : ''); d.textContent = e.v;
  d.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 24) + 'px'; d.style.top = ((-tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
  layer.appendChild(d); setTimeout(() => d.remove(), 900);
}
let mmBase = null;
function buildMinimap(arena) {
  const A = ARENAS[arena]; const N = 120; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const R = A.radius + 4;
  const img = g.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = (i / N * 2 - 1) * R, z = (j / N * 2 - 1) * R; const k = (j * N + i) * 4;
    const w = A.walk(x, z); const hz = w ? hazardAt(arena, x, z, 0.1) : null;
    const col = !w ? [8, 10, 14] : hz && hz.kind === 'water' ? [16, 40, 38] : hz && hz.kind === 'blood' ? [90, 10, 14] : [74, 70, 64];
    img.data.set([...col, 255], k); }
  g.putImageData(img, 0, 0); mmBase = { c, R };
}
function drawMinimap(st) {
  const cv = $('#minimap'), g = cv.getContext('2d'), W = cv.width; if (!mmBase) return;
  g.clearRect(0, 0, W, W); g.imageSmoothingEnabled = true; g.drawImage(mmBase.c, 0, 0, W, W);
  const P = (x, z) => [(x / mmBase.R * 0.5 + 0.5) * W, (z / mmBase.R * 0.5 + 0.5) * W];
  for (const e of st.enemies) { if (e.a === 'death') continue; const [x, y] = P(e.x, e.z); g.fillStyle = e.ty === 'archon' ? '#ff6a00' : '#e63946'; g.beginPath(); g.arc(x, y, e.ty === 'archon' ? 6 : e.ty === 'ogre' ? 4 : 2.6, 0, 7); g.fill(); }
  for (const p of st.players) { const [x, y] = P(p.x, p.z); g.fillStyle = p.id === G.myId ? '#ffd36a' : '#38b2ac'; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); g.strokeStyle = '#000'; g.stroke(); }
}
const fpsEl = document.createElement('div'); Object.assign(fpsEl.style, { position: 'fixed', left: '8px', bottom: '8px', fontSize: '12px', zIndex: 30, fontFamily: 'monospace', color: '#9f9' }); document.body.appendChild(fpsEl);
function updateHUD(st, me, dt) {
  if (!me) return; const C = CLASSES[me.cls];
  $('#orb-hp .orb-fill').style.clipPath = `inset(${(1 - me.hp / me.mhp) * 100}% 0 0 0 round 0)`; $('#orb-hp .orb-text').textContent = `${me.hp} / ${me.mhp}`;
  $('#orb-mp .orb-fill').style.clipPath = `inset(${(1 - me.mp / me.mmp) * 100}% 0 0 0)`; $('#orb-mp .orb-text').textContent = `${me.mp} / ${me.mmp}`;
  C.slots.forEach((s, i) => {
    const cd = me.cds[i] || 0, p = s.cd ? cd / s.cd * 100 : 0;
    for (const el of [slotEls[i], tbEls[i]]) { if (!el) continue; el.querySelector('.cd').style.setProperty('--p', p + '%'); el.classList.toggle('nomana', me.mp < s.cost); }
    if (slotEls[i]) slotEls[i].querySelector('.cdt').textContent = cd > 0.6 ? Math.ceil(cd) : '';
  });
  const wl = $('#wave-label');
  wl.textContent = st.state === 'intro' ? 'Prepare yourself' : st.state === 'between' ? `Wave ${st.wave} cleared` : st.state === 'fight' ? `Wave ${st.wave} / ${st.waves}` : st.state === 'victory' ? 'Victory' : st.state === 'defeat' ? 'Defeat' : '';
  const boss = st.enemies.find(e => e.ty === 'archon');
  $('#boss').classList.toggle('hidden', !boss); if (boss) { $('#boss-fill').style.width = (boss.hp / boss.mhp * 100) + '%'; $('#boss-name').textContent = 'The Abyssal Archon' + (boss.ph === 2 ? ' — Phase II' : ''); }
  const party = $('#party'); const multi = st.players.length > 1;
  party.innerHTML = multi ? st.players.map(p => `<div class="pf ${p.id === G.myId ? 'me' : ''} ${p.dn ? 'down' : ''}">${escapeHTML(p.name)} · ${CLASSES[p.cls].name.split(' ').pop()}${p.dn ? ' — DOWN' : p.away ? ' — reconnecting' : ''}<div class="bar"><div style="width:${p.hp / p.mhp * 100}%"></div></div></div>`).join('') : '';
  $('#downed').classList.toggle('hidden', !me.dn || st.state !== 'fight'); $('#revive-bar div').style.width = (me.rv * 100) + '%';
  drawMinimap(st);
  if ((st.state === 'victory' || st.state === 'defeat') && !G.ended) { G.ended = true; setTimeout(() => {
    if (G.mode === 'menu') return;
    $('#end-title').textContent = st.state === 'victory' ? 'The Archon is vanquished' : 'The sanctum claims you';
    $('#end-sub').textContent = `${ARENAS[G.arena].name} · waves survived: ${st.wave}${G.mode === 'coop' ? ' · returning to the lobby shortly' : ''}`;
    $('#again').classList.toggle('hidden', G.mode !== 'solo'); $('#end').classList.remove('hidden'); }, 1800); }
}
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ input
const input = { keys: new Set(), mouse: null, mouseDown: false, touchFire: false, cast: [], stick: { x: 0, y: 0 }, lastMove: [0, 1] };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); input.keys.add(k);
  if (e.repeat) return;
  if (k === '1') input.cast.push(1); if (k === '2') input.cast.push(2); if (k === 'r' || k === '3') input.cast.push(3);
  if (k === 'escape') { if ($('#pause').classList.contains('hidden')) openPause(); else $('#resume').click(); }
});
addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') input.mouse = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; input.mouse = [e.clientX, e.clientY]; if (e.button === 0) input.mouseDown = true; if (e.button === 2) input.cast.push(1); });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) input.mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (G.mode !== 'menu' && !e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
// virtual joystick
const zone = $('#stick-zone'), base = $('#stick-base'), knob = $('#stick-knob'); let stickId = null, sx = 0, sy = 0;
zone.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; zone.setPointerCapture?.(e.pointerId); const r = zone.getBoundingClientRect(); sx = e.clientX; sy = e.clientY;
  base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px'; base.style.opacity = 1; });
zone.addEventListener('pointermove', e => { if (e.pointerId !== stickId) return; let dx = e.clientX - sx, dy = e.clientY - sy; const m = Math.hypot(dx, dy), R = 55; if (m > R) { dx *= R / m; dy *= R / m; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; input.stick = { x: dx / R, y: dy / R }; });
const stickUp = e => { if (e.pointerId !== stickId) return; stickId = null; input.stick = { x: 0, y: 0 }; knob.style.transform = ''; base.style.opacity = 0.55; };
zone.addEventListener('pointerup', stickUp); zone.addEventListener('pointercancel', stickUp);

const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
function gatherInput(meState) {
  let mx = 0, mz = 0; const K = input.keys;
  if (K.has('w') || K.has('arrowup')) mz -= 1; if (K.has('s') || K.has('arrowdown')) mz += 1; if (K.has('a') || K.has('arrowleft')) mx -= 1; if (K.has('d') || K.has('arrowright')) mx += 1;
  if (Math.hypot(input.stick.x, input.stick.y) > 0.15) { mx = input.stick.x; mz = input.stick.y; }
  if (Math.hypot(mx, mz) > 0.1) input.lastMove = [mx, mz];
  let ax = input.lastMove[0], az = input.lastMove[1], ad = 6;
  if (meState && input.mouse && !isTouch) {
    ndc.set(input.mouse[0] / innerWidth * 2 - 1, -(input.mouse[1] / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) { ax = hit.x - meState.x; az = hit.z - meState.z; ad = Math.hypot(ax, az); }
  } else if (meState && G.state) { // touch / no mouse: auto-aim nearest enemy
    let best = null, bd = 16; for (const e of G.state.enemies) { if (e.a === 'death') continue; const d = Math.hypot(e.x - meState.x, e.z - meState.z); if (d < bd) { bd = d; best = e; } }
    if (best) { ax = best.x - meState.x; az = best.z - meState.z; ad = bd; }
  }
  const fire = input.mouseDown || input.touchFire || K.has('j') || K.has(' ');
  const cast = input.cast.splice(0);
  return { mx, mz, ax, az, ad, fire, cast };
}
// demo autopilot for automated screenshots (?demo=1)
const demo = params.get('demo') === '1';
const CATCHUP = params.get('catchup') === '1';
function demoInput(me, st) {
  const live = st.enemies.filter(e => e.a !== 'death'); if (!live.length) return { mx: -me.x * 0.2, mz: -me.z * 0.2, ax: 0, az: 1, fire: false, cast: [] };
  let best = live[0], bd = 1e9; for (const e of live) { const d = Math.hypot(e.x - me.x, e.z - me.z); if (d < bd) { bd = d; best = e; } }
  const ax = best.x - me.x, az = best.z - me.z; const C = CLASSES[me.cls]; const melee = C.slots[0].type === 'melee';
  const want = melee ? 2 : 8; const [gx, gz] = G.local.steer(me, best.x, best.z); const dx = gx - me.x, dz = gz - me.z, dd = Math.hypot(dx, dz) || 1;
  const k = bd > want ? 1 : bd < want - 3 ? -0.6 : 0;
  const cast = []; if (Math.random() < 0.04) cast.push(1 + Math.floor(Math.random() * 3));
  return { mx: dx / dd * k, mz: dz / dd * k, ax, az, ad: bd, fire: true, cast };
}

// ------------------------------------------------------------------ events + views
const PCOL = [0xb58b3d, 0x38b2ac, 0xe63946, 0x9a6bff];
function handleEvents(evs) {
  for (const e of evs) {
    if (e.e === 'fx') G.fx.spawn(e);
    else if (e.e === 'dmg') damageNumber(e);
    else if (e.e === 'msg') toast(e.text);
    else if (e.e === 'die') G.fx.spawn({ k: 'ash', x: e.x, z: e.z, s: e.type === 'archon' ? 8 : 3, d: 0.6 });
    else if (e.e === 'cast' && e.pid === G.myId) { const el = slotEls[e.slot]; if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 150); } }
  }
}
const UNIT_H = { templar: 2.8, necromancer: 2.8, hunter: 2.8, assassin: 2.7, gravewalker: 2.5, gargoyle: 2.9, ogre: 4.0, archon: 6.4 };
function syncViews(st, dt) {
  const A = ARENAS[G.arena]; const seen = new Set();
  st.players.forEach((p, idx) => {
    const key = 'p' + p.id; seen.add(key); let v = G.views.get(key);
    if (!v || v.unit !== p.cls) { v?.dispose(); v = new UnitView(atlas, G.scene, p.cls, UNIT_H[p.cls], true); v.setColorRing(PCOL[idx % 4]); G.views.set(key, v); }
    v.update(p, G.simT, dt, A.heightAt(p.x, p.z), { invis: p.b.includes('invis'), downed: p.dn, away: p.away });
  });
  for (const e of st.enemies) {
    const key = 'e' + e.id; seen.add(key); let v = G.views.get(key);
    if (!v) { v = new UnitView(atlas, G.scene, e.ty, UNIT_H[e.ty], false); G.views.set(key, v); }
    v.update(e, G.simT, dt, ENEMIES[e.ty].fly ? Math.max(0, A.heightAt(e.x, e.z)) : A.heightAt(e.x, e.z), { fly: ENEMIES[e.ty].fly, stun: e.st });
  }
  for (const [k, v] of G.views) if (!seen.has(k)) { v.dispose(); G.views.delete(k); }
  G.fx.syncProjectiles(st.projs, G.simT); G.fx.syncZones(st.zones, G.simT);
}
const posOf = id => { const p = G.state && G.state.players.find(p => p.id === id); return p; };

// ------------------------------------------------------------------ co-op snapshot interpolation
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
function interpState(now) {
  const S = G.snaps; if (!S.length) return null; const rt = now - 110;
  let i = S.length - 1; while (i > 0 && S[i - 1].rt > rt) i--;
  const b = S[i], a = S[i - 1]; if (!a || rt >= b.rt) return { ...b.s, _t: b.s.t };
  const t = Math.max(0, Math.min(1, (rt - a.rt) / (b.rt - a.rt)));
  const mix = (la, lb) => { const m = new Map(la.map(x => [x.id, x])); return lb.map(x => { const o = m.get(x.id); return o ? { ...x, x: o.x + (x.x - o.x) * t, z: o.z + (x.z - o.z) * t, f: lerpA(o.f, x.f, t) } : x; }); };
  return { ...b.s, players: mix(a.s.players, b.s.players), enemies: mix(a.s.enemies, b.s.enemies), projs: mix(a.s.projs, b.s.projs), _t: a.s.t + (b.s.t - a.s.t) * t };
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, camPos = new THREE.Vector3(), camInit = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(CATCHUP ? 0.3 : 0.05, (now - last) / 1000); last = now;
  if (settings.fps) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fpsEl.textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; } } else fpsEl.textContent = '';
  if (!G.scene || (G.mode === 'solo' && !G.sim)) return;
  let st = null, me = null;
  if (G.mode === 'solo') {
    const p = G.sim.players.get('me');
    if (!G.paused) {
      G.acc += dt; let steps = 0;
      while (G.acc >= TICK && steps < (CATCHUP ? 10 : 4)) { const inp = demo ? demoInput(p, G.state || G.sim.snapshot()) : gatherInput(p); G.sim.setInput('me', inp); G.sim.step(TICK); handleEvents(G.sim.takeEvents()); G.acc -= TICK; steps++; }
    }
    st = G.sim.snapshot(); G.simT = G.sim.t;
  } else if (G.mode === 'coop') {
    st = interpState(now); if (!st) { renderFrame(dt); return; } G.simT = st._t;
    const srv = G.snaps.length ? G.snaps[G.snaps.length - 1].s.players.find(p => p.id === G.myId) : null;
    if (srv) {
      if (!G.me) G.me = { x: srv.x, z: srv.z };
      const cls = srv.cls; const inp = demo ? demoInput({ ...srv, x: G.me.x, z: G.me.z }, st) : gatherInput(G.me);
      if (!srv.dn && st.state !== 'victory' && st.state !== 'defeat') {
        const m = Math.hypot(inp.mx, inp.mz); const hz = hazardAt(G.arena, G.me.x, G.me.z, G.simT);
        if (m > 0.1) { const sp = CLASSES[cls].speed * hz.slow * Math.min(1, m) * dt; G.local.tryMove(G.me, inp.mx / m * sp, inp.mz / m * sp, 0.35); }
      } else { G.me.x = srv.x; G.me.z = srv.z; }
      const err = Math.hypot(srv.x - G.me.x, srv.z - G.me.z); G.bigErrT = err > 1.2 ? G.bigErrT + dt : 0;
      if (err > 4 || G.bigErrT > 0.6) { G.me.x = srv.x; G.me.z = srv.z; G.bigErrT = 0; }
      G.pendingCast = (G.pendingCast || []).concat(inp.cast);
      if (now - G.lastSend > 33) { net.send({ t: 'in', i: { ...inp, cast: G.pendingCast, px: G.me.x, pz: G.me.z, pdt: (now - G.lastSend) / 1000 } }); G.pendingCast = []; G.lastSend = now; }
      const mine = st.players.find(p => p.id === G.myId); if (mine) { mine.x = G.me.x; mine.z = G.me.z; if (Math.hypot(inp.ax, inp.az) > 0.01 && !srv.dn) mine.f = Math.atan2(inp.az, inp.ax); }
    }
  }
  G.state = st; me = st.players.find(p => p.id === G.myId);
  syncViews(st, dt); G.fx.update(dt, posOf); G.world.update(now / 1000, dt);
  // camera follow (iso-like, steeper/further in portrait)
  if (me) {
    const portrait = innerHeight > innerWidth; const dist = portrait ? 27 : 19.5; const y = ARENAS[G.arena].heightAt(me.x, me.z);
    const target = new THREE.Vector3(me.x, y, me.z); const want = target.clone().add(new THREE.Vector3(0, dist * 0.74, dist * 0.67));
    if (!camInit) { camPos.copy(want); camInit = true; } camPos.lerp(want, 1 - Math.exp(-dt * 6)); camera.position.copy(camPos); camera.lookAt(camPos.x, camPos.y - dist * 0.74 + 1.2, camPos.z - dist * 0.67);
  }
  updateHUD(st, me, dt);
  renderFrame(dt);
}
function renderFrame() { if (!G.scene) return; if (composer) composer.render(); else renderer.render(G.scene, camera); }
requestAnimationFrame(frame);

// ------------------------------------------------------------------ LAN co-op (disabled in the GitHub Pages / solo-static build)
const ON_PAGES = /(?:^|\.)github\.io$/.test(location.hostname);
const SOLO_ONLY = true; // this tree has no server/
const coopBtn = $('#coop'), note = $('#coop-note');
if (coopBtn) coopBtn.classList.add('hidden');
if (note) { note.classList.add('hidden'); note.textContent = ''; }
if (!SOLO_ONLY && !ON_PAGES && coopBtn) {
probe().then(ok => {
  coopBtn.disabled = !ok;
  coopBtn.classList.toggle('hidden', !ok);
  if (note) { note.classList.toggle('hidden', false); note.textContent = ok ? `LAN server found at ${location.host}. Other devices on your Wi-Fi can open http://${location.host}${location.pathname} and join.`
    : 'Single-player only here.'; }
  if (ok && params.get('coop') === '1') coopBtn.click();
});
}
if (coopBtn) coopBtn.onclick = () => { if (SOLO_ONLY || ON_PAGES) return;
  localStorage.setItem('soa_name', $('#name').value.trim());
  net = new Net({ message: onNet, status: s => { $('#netstatus').textContent = s === 'reconnecting' ? 'Connection lost — reconnecting…' : ''; $('#netstatus').classList.toggle('hidden', s !== 'reconnecting'); } });
  net.connect({ name: myName(), cls: chosenClass });
  $('#menu').classList.add('hidden'); $('#lobby').classList.remove('hidden'); $('#lobby-url').textContent = `Server: ${location.host} — share this address with players on the same network.`;
  buildClassCards($('#lobby-classes'), true);
};
$('#ready').onclick = () => { const me = G.lobby && G.lobby.players.find(p => p.id === net.id); net.send({ t: 'set', ready: !(me && me.ready), cls: chosenClass, name: myName() }); };
$('#start').onclick = () => net.send({ t: 'start' });
$('#lobby-leave').onclick = () => { net.close(); net = null; toMenu(); };
function onNet(m) {
  if (m.t === 'lobby') {
    G.lobby = m; const host = m.hostId === net.id;
    $('#lobby-players').innerHTML = m.players.map(p => `<li><span>${p.id === m.hostId ? '♛ ' : ''}${escapeHTML(p.name)}${p.id === net.id ? ' (you)' : ''} — ${CLASSES[p.cls]?.name || p.cls}${p.connected ? '' : ' · offline'}</span><span class="${p.ready ? 'r' : 'nr'}">${p.ready ? 'Ready' : 'Not ready'}</span></li>`).join('');
    if (host && params.get('arena') && !G._arenaSent && m.state === 'lobby') { G._arenaSent = true; if (m.arena !== params.get('arena')) { net.send({ t: 'arena', arena: params.get('arena') }); return; } }
    chosenArena = m.arena; buildArenaCards($('#lobby-arena'), id => net.send({ t: 'arena', arena: id }), host);
    $('#lobby-arena').insertAdjacentHTML('afterbegin', `<h2>Arena ${host ? '(you pick)' : '(host picks)'}</h2>`);
    $('#start').classList.toggle('hidden', !host); $('#start').disabled = !m.players.filter(p => p.connected).every(p => p.ready);
    const me = m.players.find(p => p.id === net.id); $('#ready').textContent = me && me.ready ? 'Not ready' : 'Ready';
    if (m.state === 'lobby' && G.mode === 'coop') { clearScene(); G.mode = 'menu'; $('#hud').classList.add('hidden'); $('#touch').classList.add('hidden'); $('#end').classList.add('hidden'); $('#lobby').classList.remove('hidden'); }
    if (params.get('autoready') === '1' && me && !me.ready && m.state === 'lobby') net.send({ t: 'set', ready: true, cls: chosenClass, name: myName() });
    const need = +params.get('autostart_players') || 0;
    if (host && need && m.state === 'lobby' && m.players.filter(p => p.connected && p.ready).length >= need) net.send({ t: 'start' });
  } else if (m.t === 'start') {
    if (G.mode !== 'coop' || G.arena !== m.arena) startGame(m.arena, 'coop').then(() => { G.myId = net.id; });
  } else if (m.t === 'snap') {
    if (G.mode !== 'coop') return;
    G.snaps.push({ rt: performance.now(), s: m.s }); if (G.snaps.length > 40) G.snaps.shift();
    if (G.fx) handleEvents(m.ev || []);
  } else if (m.t === 'welcome') { G.myId = m.id; }
}

// ------------------------------------------------------------------ auto-start for testing (?autostart=solo)
if (params.get('autostart') === 'solo') startGame(chosenArena, 'solo');
