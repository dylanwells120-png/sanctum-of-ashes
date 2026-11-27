// Sanctum of Ashes — authoritative simulation. Pure JS, shared by the browser
// (single-player) and server/server.js (LAN co-op). No DOM / three.js.
import { ARENAS, hazardAt } from './arenaDefs.js';

export const TICK = 1 / 30;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// ---------------------------------------------------------------- classes
// icon keys follow concept-25's action bar; vfx keys follow concept-06 / concept-20.
export const CLASSES = {
  templar: { name: 'Penitent Templar', hp: 560, mana: 100, regen: 7, speed: 5.2, height: 2.25,
    blurb: 'Heavy plate, cinder greatsword. Cleaves crowds, shields self, erupts in flame.',
    slots: [
      { id: 'basic', name: 'Cinder Strike', icon: 'cinder_strike', type: 'melee', range: 2.9, arc: 110, dmg: 36, cd: 0.6, cost: 0, fx: 'cleave', fxs: 1.0 },
      { id: 'a1', name: "Martyr's Thorned Cleave", icon: 'martyrs_cleave', type: 'melee', range: 4.0, arc: 180, dmg: 85, bleed: 12, cd: 4, cost: 22, fx: 'cleave', fxs: 1.7 },
      { id: 'a2', name: 'Thorned Shield', icon: 'thorned_shield', type: 'buff', buff: 'shield', dur: 5, cd: 13, cost: 28, fx: 'aegis', fxs: 0.9 },
      { id: 'ult', name: 'Cinder Nova Cataclysm', icon: 'cinder_nova', type: 'nova', radius: 7, dmg: 95, knock: 7, cd: 10, cost: 40, fx: 'nova', fxs: 2.6 } ] },
  necromancer: { name: 'Revenant Necromancer', hp: 400, mana: 170, regen: 11, speed: 5.0, height: 2.25,
    blurb: 'Spirit-lantern caster. Homing wraiths, soul vortex, life-draining shroud.',
    slots: [
      { id: 'basic', name: 'Revenant Call', icon: 'revenant_call', type: 'proj', proj: 'reaper', speed: 15, dmg: 28, range: 15, cd: 0.5, cost: 0, homing: 2.2 },
      { id: 'a1', name: 'Soul-Lantern Maelstrom', icon: 'soul_lantern', type: 'zone', zone: 'maelstrom', radius: 3.8, dur: 4, dps: 34, pull: 3.2, reach: 11, cd: 7, cost: 32 },
      { id: 'a2', name: 'Death Shroud', icon: 'death_shroud', type: 'buff', buff: 'shroud', dur: 5, radius: 5, dps: 24, cd: 12, cost: 30, fx: 'maelstrom', fxs: 1.4 },
      { id: 'ult', name: 'Spectral Reaper Swarm', icon: 'spectral_reaper', type: 'swarm', proj: 'reaper', count: 7, speed: 13, dmg: 36, range: 20, homing: 4, cd: 9, cost: 45 } ] },
  hunter: { name: 'Blood-Hunter Inquisitor', hp: 450, mana: 120, regen: 8, speed: 5.6, height: 2.25,
    blurb: 'Runic repeater. Holy bolts (every 3rd is a 30° volley), traps, ash vials, team aegis.',
    slots: [
      { id: 'basic', name: 'Blessed Bolt / Consecrated Volley', icon: 'blessed_bolt', type: 'proj', proj: 'bolt', speed: 26, dmg: 30, range: 18, cd: 0.42, cost: 0, volleyEvery: 3, pierce: 1 },
      { id: 'a1', name: 'Inquisition Trap', icon: 'inquisition_trap', type: 'zone', zone: 'trap', radius: 2.6, dur: 10, dmg: 70, stun: 2.2, reach: 9, cd: 6, cost: 22 },
      { id: 'a2', name: 'Vial of Ashes', icon: 'vial_of_ashes', type: 'zone', zone: 'ashes', radius: 3.6, dur: 4, dps: 30, heal: 22, reach: 10, cd: 8, cost: 26 },
      { id: 'ult', name: 'Reliquary Aegis Bastion', icon: 'reliquary_aegis', type: 'zone', zone: 'aegis', radius: 6, dur: 6, reach: 0, cd: 16, cost: 45 } ] },
  assassin: { name: 'Shadowreave Assassin', hp: 420, mana: 110, regen: 9, speed: 6.3, height: 2.15,
    blurb: 'Void-stitched blades. Shadow-step blinks, executions and a chaining soul vortex.',
    slots: [
      { id: 'basic', name: 'Dual Bleed', icon: 'dual_bleed', type: 'melee', range: 2.4, arc: 90, dmg: 24, bleed: 6, cd: 0.34, cost: 0, fx: 'shadowstrike', fxs: 0.7 },
      { id: 'a1', name: 'Shadowstep / Umbral Shadowstrike', icon: 'shadowstep', type: 'blink', reach: 9, radius: 3.2, dmg: 65, cd: 4.5, cost: 24, fx: 'shadowstrike', fxs: 1.5 },
      { id: 'a2', name: 'Void Execution', icon: 'void_execution', type: 'melee', range: 3.0, arc: 70, dmg: 95, execute: 0.3, cd: 6, cost: 28, fx: 'shadowstrike', fxs: 1.2 },
      { id: 'ult', name: 'Soul-Shackle Vortex', icon: 'soul_shackle', type: 'zone', zone: 'shackle', radius: 6, dur: 3.5, dps: 26, pull: 5, root: true, reach: 10, cd: 12, cost: 45 } ] },
};
export const CLASS_IDS = Object.keys(CLASSES);

export const ENEMIES = {
  gravewalker: { name: 'Gravewalker Husk', hp: 70, speed: 2.7, dmg: 12, range: 1.7, cd: 1.3, wind: 0.4, height: 2.0, r: 0.45 },
  gargoyle: { name: 'Gargoyle Flayer', hp: 100, speed: 4.6, dmg: 16, range: 1.9, cd: 1.1, wind: 0.3, height: 2.4, r: 0.6, fly: 1.2 },
  ogre: { name: 'Blood-Bound Abomination', hp: 480, speed: 1.95, dmg: 40, range: 2.6, cd: 2.5, wind: 0.7, height: 3.3, r: 1.0, smash: 2.6 },
  archon: { name: 'The Abyssal Archon', hp: 3200, speed: 2.4, dmg: 46, range: 4.2, cd: 2.4, wind: 0.6, height: 5.6, r: 1.4, boss: true, arc: 160 },
};
export const WAVES = [
  { gravewalker: 8 },
  { gravewalker: 9, gargoyle: 4 },
  { gravewalker: 8, gargoyle: 4, ogre: 2 },
  { archon: 1, gravewalker: 4 },
];

export class Sim {
  constructor(arena = 'ossuary') {
    this.arena = arena; this.A = ARENAS[arena]; this.t = 0; this.nextId = 1;
    this.players = new Map(); this.enemies = new Map(); this.projs = new Map(); this.zones = new Map();
    this.nav = (this.A.nav || []).map(([x, z]) => ({ x, z }));
    const n = this.nav.length; this.navD = [...Array(n)].map(() => Array(n).fill(1e9));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i === j) this.navD[i][j] = 0; else if (this.los(this.nav[i].x, this.nav[i].z, this.nav[j].x, this.nav[j].z)) this.navD[i][j] = Math.hypot(this.nav[i].x - this.nav[j].x, this.nav[i].z - this.nav[j].z);
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (this.navD[i][k] + this.navD[k][j] < this.navD[i][j]) this.navD[i][j] = this.navD[i][k] + this.navD[k][j];
    this.events = []; this.wave = 0; this.state = 'intro'; this.stateT = 2.5; this.spawnQueue = []; this.msg = '';
  }
  id() { return this.nextId++; }
  ev(e) { this.events.push(e); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  addPlayer(pid, name, cls) {
    const C = CLASSES[cls] || CLASSES.templar; const n = this.players.size;
    const [sx, sz] = this.A.playerSpawn;
    const p = { id: pid, name: name || 'Pilgrim', cls: CLASSES[cls] ? cls : 'templar', x: sx + (n % 2 ? 1.6 : -1.6) * Math.ceil(n / 2), z: sz, face: -Math.PI / 2,
      hp: C.hp, maxHp: C.hp, mana: C.mana, maxMana: C.mana, cds: [0, 0, 0, 0], anim: 'idle', animT: 0, downed: false, revive: 0,
      buffs: {}, shots: 0, input: { mx: 0, mz: 0, ax: 0, az: -1, fire: false, cast: [] }, away: false, kills: 0, hurtT: 0 };
    this.players.set(pid, p); return p;
  }
  removePlayer(pid) { this.players.delete(pid); }
  setInput(pid, inp) { const p = this.players.get(pid); if (!p) return;
    const keep = p.input.cast; Object.assign(p.input, inp); p.input.cast = keep.concat(inp.cast || []); }

  // ------------------------------------------------------------ movement
  blocked(x, z, r = 0.4) {
    if (!this.A.walk(x, z)) return true;
    for (const o of this.A.obstacles) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + r) ** 2) return true;
    return false;
  }
  tryMove(e, dx, dz, r, free = false) {
    if (free) { e.x += dx; e.z += dz; return; }
    if (!this.blocked(e.x + dx, e.z + dz, r)) { e.x += dx; e.z += dz; return; }
    if (!this.blocked(e.x + dx, e.z, r)) { e.x += dx; return; }
    if (!this.blocked(e.x, e.z + dz, r)) { e.z += dz; }
  }
  los(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.5);
    for (let i = 1; i < n; i++) { const t = i / n; if (!this.A.walk(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  }
  steer(e, tx, tz) { // returns point to walk toward (direct or via nav graph)
    if (!this.nav.length || this.los(e.x, e.z, tx, tz)) return [tx, tz];
    const N = this.nav; let best = null, bv = 1e9;
    const B = N.map(w => this.los(w.x, w.z, tx, tz) ? Math.hypot(w.x - tx, w.z - tz) : 1e9);
    for (let a = 0; a < N.length; a++) {
      const da = Math.hypot(N[a].x - e.x, N[a].z - e.z); if (da < 0.6 || da + 0 > bv) continue;
      if (!this.los(e.x, e.z, N[a].x, N[a].z)) continue;
      for (let b = 0; b < N.length; b++) { if (B[b] >= 1e9) continue; const v = da + this.navD[a][b] + B[b]; if (v < bv) { bv = v; best = N[a]; } }
    }
    return best ? [best.x, best.z] : [tx, tz];
  }
  setAnim(e, a) { if (e.anim !== a) { e.anim = a; e.animT = this.t; } }

  // ------------------------------------------------------------ main step
  step(dt = TICK) {
    this.t += dt;
    if (this.state === 'intro') { this.stateT -= dt; if (this.stateT <= 0) this.nextWave(); }
    else if (this.state === 'between') { this.stateT -= dt; if (this.stateT <= 0) this.nextWave(); }
    this.spawnTick(dt);
    for (const p of this.players.values()) this.stepPlayer(p, dt);
    for (const e of this.enemies.values()) this.stepEnemy(e, dt);
    this.stepProjs(dt); this.stepZones(dt);
    // cleanup dead enemies after death anim
    for (const [id, e] of this.enemies) if (e.dead && this.t - e.deadT > 1.2) this.enemies.delete(id);
    if (this.state === 'fight' && this.spawnQueue.length === 0 && ![...this.enemies.values()].some(e => !e.dead)) {
      if (this.wave >= WAVES.length) { this.state = 'victory'; this.ev({ e: 'msg', text: 'The Archon falls. Victory!' }); }
      else { this.state = 'between'; this.stateT = 4; this.ev({ e: 'msg', text: `Wave ${this.wave} cleared` });
        for (const p of this.players.values()) { if (p.downed) { p.downed = false; p.hp = p.maxHp * 0.4; this.setAnim(p, 'idle'); } p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25); } }
    }
    const active = [...this.players.values()].filter(p => !p.away);
    if (this.state === 'fight' && active.length && active.every(p => p.downed)) { this.state = 'defeat'; this.ev({ e: 'msg', text: 'All pilgrims have fallen' }); }
  }
  nextWave() {
    const W = WAVES[this.wave]; this.wave++; this.state = 'fight';
    const n = Math.max(1, [...this.players.values()].filter(p => !p.away).length);
    const list = [];
    for (const [type, count] of Object.entries(W)) { const c = ENEMIES[type].boss ? count : Math.round(count * (1 + 0.5 * (n - 1))); for (let i = 0; i < c; i++) list.push(type); }
    list.sort(() => Math.random() - 0.5);
    if (W.archon) { list.splice(list.indexOf('archon'), 1); list.unshift('archon'); }
    this.spawnQueue = list.map((type, i) => ({ type, at: this.t + 0.5 + i * 0.55 }));
    this.ev({ e: 'wave', n: this.wave, boss: !!W.archon });
    this.ev({ e: 'msg', text: W.archon ? 'The Abyssal Archon descends!' : `Wave ${this.wave}` });
  }
  spawnTick() {
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.t) {
      const { type } = this.spawnQueue.shift(); const sp = this.A.spawns[Math.floor(Math.random() * this.A.spawns.length)];
      const T = ENEMIES[type]; const n = Math.max(1, [...this.players.values()].filter(p => !p.away).length);
      const hp = T.hp * (1 + 0.45 * (n - 1));
      const jitter = () => (Math.random() - 0.5) * 2;
      const e = { id: this.id(), type, x: sp[0] + jitter(), z: sp[1] + jitter(), face: 0, hp, maxHp: hp, anim: 'walk', animT: this.t, cd: 1 + Math.random(),
        wind: 0, kx: 0, kz: 0, stun: 0, root: 0, bleed: 0, bleedT: 0, dead: false, special: 6, summon: 12, phase: 1 };
      if (this.blocked(e.x, e.z, T.r)) { e.x = sp[0]; e.z = sp[1]; }
      this.enemies.set(e.id, e); this.ev({ e: 'fx', k: 'shackle', x: e.x, z: e.z, s: T.boss ? 3 : 1.2, ground: 1, d: 0.8 });
    }
  }
  livingPlayers() { return [...this.players.values()].filter(p => !p.downed && !p.away); }

  stepPlayer(p, dt) {
    const C = CLASSES[p.cls]; const inp = p.input;
    for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
    for (const k in p.buffs) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) delete p.buffs[k]; }
    if (p.away) { p.input.cast = []; return; }
    if (p.downed) {
      p.input.cast = [];
      const helper = this.livingPlayers().find(o => Math.hypot(o.x - p.x, o.z - p.z) < 2.4);
      if (helper) { p.revive += dt / 3; if (p.revive >= 1) { p.downed = false; p.revive = 0; p.hp = p.maxHp * 0.4; this.setAnim(p, 'idle'); this.ev({ e: 'msg', text: `${helper.name} revived ${p.name}` }); this.ev({ e: 'fx', k: 'aegis', x: p.x, z: p.z, s: 1.4, ground: 1, d: 0.9 }); } }
      else p.revive = Math.max(0, p.revive - dt * 0.25);
      return;
    }
    p.mana = Math.min(p.maxMana, p.mana + C.regen * dt);
    const hz = hazardAt(this.arena, p.x, p.z, this.t);
    if (hz.dps) this.hurtPlayer(p, hz.dps * dt, true);
    // movement: client-reported position (co-op) or input vector (solo)
    let moving = false;
    if (inp.px !== undefined && inp.pz !== undefined) {
      const dx = inp.px - p.x, dz = inp.pz - p.z, d = Math.hypot(dx, dz), maxd = C.speed * 1.6 * Math.max(dt, inp.pdt || dt) + 0.35;
      if (d > 0.001) { const k = d > maxd ? maxd / d : 1; if (!this.blocked(p.x + dx * k, p.z + dz * k, 0.35)) { p.x += dx * k; p.z += dz * k; } moving = d > 0.02; }
      delete inp.px; delete inp.pz;
      moving = moving || Math.hypot(inp.mx, inp.mz) > 0.1;
    } else {
      const m = Math.hypot(inp.mx, inp.mz);
      if (m > 0.1) { const sp = C.speed * hz.slow * Math.min(1, m) * (p.buffs.haste ? 1.5 : 1); this.tryMove(p, inp.mx / m * sp * dt, inp.mz / m * sp * dt, 0.35); moving = true; }
    }
    const aimA = Math.atan2(inp.az, inp.ax);
    if (Math.hypot(inp.ax, inp.az) > 0.01) p.face = aimA; else if (moving) p.face = Math.atan2(inp.mz, inp.mx);
    if (p.buffs.shroud) {
      for (const e of this.enemies.values()) if (!e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 5) { const d = 24 * dt; this.damageEnemy(e, d, p, true); p.hp = Math.min(p.maxHp, p.hp + d * 0.5); }
    }
    // abilities
    const casting = p.anim === 'attack' && this.t - p.animT < 0.32;
    if (inp.fire) this.useSlot(p, 0);
    for (const s of inp.cast) this.useSlot(p, s);
    inp.cast = [];
    if (!(p.anim === 'attack' && this.t - p.animT < 0.4)) this.setAnim(p, moving ? 'walk' : (p.anim === 'hit' && this.t - p.animT < 0.25 ? 'hit' : 'idle'));
    else if (casting && moving) {/* keep attack anim */}
  }
  aimPoint(p, reach) {
    const ax = p.input.ax, az = p.input.az; const d = Math.hypot(ax, az) || 1;
    const dist = Math.min(reach, p.input.ad ?? reach);
    return [p.x + ax / d * dist, p.z + az / d * dist];
  }
  useSlot(p, i) {
    const C = CLASSES[p.cls]; const s = C.slots[i]; if (!s || p.cds[i] > 0 || p.mana < s.cost) return;
    p.cds[i] = s.cd; p.mana -= s.cost; this.setAnim(p, 'attack');
    const f = p.face, fx = Math.cos(f), fz = Math.sin(f);
    this.ev({ e: 'cast', pid: p.id, slot: i });
    if (s.type === 'melee') {
      this.ev({ e: 'fx', k: s.fx, x: p.x + fx * s.range * 0.5, z: p.z + fz * s.range * 0.5, r: f, s: s.fxs * 2.4, ground: s.fx === 'cleave' ? 1 : 0, d: 0.45 });
      for (const e of this.enemies.values()) {
        if (e.dead) continue; const T = ENEMIES[e.type];
        const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
        if (d > s.range + T.r) continue;
        if (Math.abs(angDiff(Math.atan2(dz, dx), f)) > (s.arc / 2) * Math.PI / 180 && d > T.r + 0.6) continue;
        let dmg = s.dmg; if (s.execute && e.hp / e.maxHp < s.execute) dmg *= 3;
        this.damageEnemy(e, dmg, p); if (s.bleed) { e.bleed = s.bleed; e.bleedT = 4; }
        if (s.id === 'a1' && p.cls === 'templar') this.knock(e, dx / (d || 1), dz / (d || 1), 2.5);
      }
    } else if (s.type === 'proj') {
      p.shots++;
      const volley = s.volleyEvery && p.shots % s.volleyEvery === 0;
      const angs = volley ? [-15, -7.5, 0, 7.5, 15].map(a => a * Math.PI / 180) : [0];
      for (const a of angs) this.spawnProj(p, s, f + a, volley ? 3 : (s.pierce || 0));
      if (volley) this.ev({ e: 'fx', k: 'aegis', x: p.x + fx, z: p.z + fz, s: 1, d: 0.3 });
    } else if (s.type === 'swarm') {
      for (let k = 0; k < s.count; k++) this.spawnProj(p, s, f + (k - (s.count - 1) / 2) * 0.32, 0);
    } else if (s.type === 'zone') {
      const [x, z] = s.reach ? this.aimPoint(p, s.reach) : [p.x, p.z];
      const zid = this.id(); this.zones.set(zid, { id: zid, kind: s.zone, x, z, r: s.radius, t0: this.t, life: s.dur, owner: p.id, s, armed: true });
    } else if (s.type === 'nova') {
      this.ev({ e: 'fx', k: 'nova', x: p.x, z: p.z, s: s.radius * 2.1, ground: 1, d: 0.7 });
      for (const e of this.enemies.values()) { if (e.dead) continue; const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz); if (d < s.radius + ENEMIES[e.type].r) { this.damageEnemy(e, s.dmg, p); this.knock(e, dx / (d || 1), dz / (d || 1), s.knock); } }
    } else if (s.type === 'buff') {
      p.buffs[s.buff] = s.dur; this.ev({ e: 'fx', k: s.fx, x: p.x, z: p.z, s: s.fxs * 2.5, follow: p.id, ground: s.buff === 'shroud' ? 1 : 0, d: s.dur });
    } else if (s.type === 'blink') {
      let [x, z] = this.aimPoint(p, s.reach); const sx = p.x, sz = p.z;
      for (let k = 0; k < 12 && this.blocked(x, z, 0.35); k++) { x = (x + p.x) / 2; z = (z + p.z) / 2; }
      if (!this.blocked(x, z, 0.35)) { p.x = x; p.z = z; }
      this.ev({ e: 'fx', k: 'shadowstrike', x: sx, z: sz, s: 2, d: 0.4 }); this.ev({ e: 'fx', k: 'shadowstrike', x: p.x, z: p.z, s: s.fxs * 2.4, d: 0.5 });
      p.buffs.invis = 1.2;
      for (const e of this.enemies.values()) if (!e.dead && Math.hypot(e.x - p.x, e.z - p.z) < s.radius + ENEMIES[e.type].r) this.damageEnemy(e, s.dmg, p);
    }
  }
  spawnProj(p, s, a, pierce) {
    const id = this.id();
    this.projs.set(id, { id, kind: s.proj, x: p.x + Math.cos(a) * 0.8, z: p.z + Math.sin(a) * 0.8, vx: Math.cos(a) * s.speed, vz: Math.sin(a) * s.speed, dmg: s.dmg,
      life: s.range / s.speed, owner: p.id, pierce, hit: new Set(), homing: s.homing || 0 });
  }
  stepProjs(dt) {
    for (const [id, q] of this.projs) {
      q.life -= dt; if (q.life <= 0) { this.projs.delete(id); continue; }
      if (q.homing) {
        let best = null, bd = 9; for (const e of this.enemies.values()) { if (e.dead || q.hit.has(e.id)) continue; const d = Math.hypot(e.x - q.x, e.z - q.z); if (d < bd) { bd = d; best = e; } }
        if (best) { const sp = Math.hypot(q.vx, q.vz); const ta = Math.atan2(best.z - q.z, best.x - q.x), ca = Math.atan2(q.vz, q.vx); const na = ca + clamp(angDiff(ta, ca), -q.homing * dt, q.homing * dt); q.vx = Math.cos(na) * sp; q.vz = Math.sin(na) * sp; }
      }
      q.x += q.vx * dt; q.z += q.vz * dt;
      const owner = this.players.get(q.owner);
      for (const e of this.enemies.values()) {
        if (e.dead || q.hit.has(e.id)) continue;
        if (Math.hypot(e.x - q.x, e.z - q.z) < ENEMIES[e.type].r + 0.45) {
          this.damageEnemy(e, q.dmg, owner); q.hit.add(e.id); this.ev({ e: 'fx', k: q.kind === 'bolt' ? 'aegis' : 'maelstrom', x: q.x, z: q.z, s: 1.1, d: 0.3 });
          if (q.pierce-- <= 0) { this.projs.delete(id); break; }
        }
      }
      if (this.projs.has(id) && Math.hypot(q.x, q.z) > this.A.radius + 8) this.projs.delete(id);
    }
  }
  stepZones(dt) {
    for (const [id, z] of this.zones) {
      const age = this.t - z.t0; const s = z.s;
      if (age > z.life) { this.zones.delete(id); continue; }
      const owner = this.players.get(z.owner);
      if (z.kind === 'trap') {
        if (!z.armed) continue;
        for (const e of this.enemies.values()) if (!e.dead && Math.hypot(e.x - z.x, e.z - z.z) < z.r) {
          z.armed = false; z.life = age + 0.6; this.ev({ e: 'fx', k: 'aegis', x: z.x, z: z.z, s: z.r * 2.2, ground: 1, d: 0.6 });
          for (const e2 of this.enemies.values()) if (!e2.dead && Math.hypot(e2.x - z.x, e2.z - z.z) < z.r) { this.damageEnemy(e2, s.dmg, owner); e2.stun = s.stun; }
          break;
        }
      } else if (z.kind === 'aegis') {
        for (const p of this.players.values()) if (Math.hypot(p.x - z.x, p.z - z.z) < z.r) p.buffs.aegis = 0.2;
      } else if (z.kind === 'boss_nova') {
        if (!z.fired && age > 1.3) { z.fired = true; this.ev({ e: 'fx', k: 'nova', x: z.x, z: z.z, s: z.r * 2.1, ground: 1, d: 0.7 });
          for (const p of this.livingPlayers()) if (Math.hypot(p.x - z.x, p.z - z.z) < z.r) this.hurtPlayer(p, 52); }
      } else {
        for (const e of this.enemies.values()) {
          if (e.dead) continue; const dx = z.x - e.x, dz = z.z - e.z, d = Math.hypot(dx, dz);
          if (d < z.r + ENEMIES[e.type].r) {
            if (s.dps) this.damageEnemy(e, s.dps * dt, owner, true);
            if (s.pull && d > 0.4 && !ENEMIES[e.type].boss) { e.x += dx / d * s.pull * dt; e.z += dz / d * s.pull * dt; }
            if (s.root) e.root = 0.3;
          }
        }
        if (s.heal) for (const p of this.livingPlayers()) if (Math.hypot(p.x - z.x, p.z - z.z) < z.r) p.hp = Math.min(p.maxHp, p.hp + s.heal * dt);
      }
    }
  }
  knock(e, nx, nz, f) { if (ENEMIES[e.type].boss) return; const m = e.type === 'ogre' ? 0.35 : 1; e.kx += nx * f * m * 2.2; e.kz += nz * f * m * 2.2; }
  damageEnemy(e, dmg, src, quiet = false) {
    if (e.dead) return; e.hp -= dmg;
    if (!quiet) { this.ev({ e: 'dmg', x: e.x, z: e.z, v: Math.round(dmg), tgt: 'e', h: ENEMIES[e.type].height }); if (e.anim !== 'attack') this.setAnim(e, 'hit'); }
    if (e.hp <= 0) this.killEnemy(e, src);
  }
  killEnemy(e, src) {
    e.dead = true; e.deadT = this.t; e.hp = 0; this.setAnim(e, 'death'); if (src) src.kills = (src.kills || 0) + 1;
    this.ev({ e: 'die', id: e.id, type: e.type, x: e.x, z: e.z });
    if (ENEMIES[e.type].boss) { this.spawnQueue = []; for (const o of this.enemies.values()) if (!o.dead) { o.dead = true; o.deadT = this.t; this.setAnim(o, 'death'); } }
  }
  hurtPlayer(p, dmg, quiet = false) {
    if (p.downed || p.away) return;
    if (p.buffs.shield) dmg *= 0.4; if (p.buffs.aegis) dmg *= 0.5;
    p.hp -= dmg;
    if (!quiet) { this.ev({ e: 'dmg', x: p.x, z: p.z, v: Math.round(dmg), tgt: 'p', pid: p.id, h: 2.2 }); if (p.anim !== 'attack') this.setAnim(p, 'hit'); }
    if (p.hp <= 0) { p.hp = 0; p.downed = true; p.revive = 0; this.setAnim(p, 'death'); this.ev({ e: 'msg', text: `${p.name} is down!` }); }
  }
  stepEnemy(e, dt) {
    const T = ENEMIES[e.type]; if (e.dead) return;
    // knockback + environmental kills
    if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) {
      const nx = e.x + e.kx * dt, nz = e.z + e.kz * dt; e.kx *= 0.86; e.kz *= 0.86;
      if (!this.A.walk(nx, nz) && !T.fly) {
        if (this.A.fallKills || this.A.lavaKills) { e.x = nx; e.z = nz; this.ev({ e: 'fx', k: this.A.lavaKills ? 'nova' : 'shackle', x: nx, z: nz, s: 2.4, ground: 1, d: 0.6 }); this.ev({ e: 'msg', text: this.A.lavaKills ? 'Melted in the foundry!' : 'Cast into the abyss!' }); this.killEnemy(e, null); return; }
      } else this.tryMove(e, nx - e.x, nz - e.z, T.r, T.fly);
    }
    if (e.bleedT > 0) { e.bleedT -= dt; this.damageEnemy(e, e.bleed * dt, null, true); if (e.dead) return; }
    const hz = T.fly ? { dps: 0, slow: 1 } : hazardAt(this.arena, e.x, e.z, this.t);
    if (hz.dps && hz.kind === 'spikes') { this.damageEnemy(e, hz.dps * dt, null, true); if (e.dead) return; }
    if (e.stun > 0) { e.stun -= dt; this.setAnim(e, 'hit'); return; }
    e.cd -= dt; e.root = Math.max(0, e.root - dt);
    // target: nearest visible living player
    let tgt = null, bd = 1e9;
    for (const p of this.livingPlayers()) { if (p.buffs.invis) continue; const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < bd) { bd = d; tgt = p; } }
    if (T.boss) this.bossAI(e, dt, tgt);
    if (e.wind > 0) {
      e.wind -= dt;
      if (e.wind <= 0) {
        const hits = [];
        for (const p of this.livingPlayers()) {
          const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
          if (T.smash ? d < T.smash + 0.5 : (d < T.range + 0.6 && (!T.arc || Math.abs(angDiff(Math.atan2(dz, dx), e.face)) < T.arc * Math.PI / 360))) hits.push(p);
        }
        if (T.smash) this.ev({ e: 'fx', k: 'nova', x: e.x + Math.cos(e.face), z: e.z + Math.sin(e.face), s: T.smash * 2, ground: 1, d: 0.5 });
        if (T.boss) this.ev({ e: 'fx', k: 'cleave', x: e.x + Math.cos(e.face) * 2.2, z: e.z + Math.sin(e.face) * 2.2, r: e.face, s: 7, ground: 1, d: 0.5 });
        for (const p of hits) this.hurtPlayer(p, T.dmg * (e.phase === 2 ? 1.25 : 1));
      }
      return;
    }
    if (!tgt) { this.setAnim(e, 'idle'); return; }
    const dx = tgt.x - e.x, dz = tgt.z - e.z, d = Math.hypot(dx, dz);
    e.face = Math.atan2(dz, dx);
    if (d < T.range + 0.3 && e.cd <= 0) { e.cd = T.cd * (e.phase === 2 ? 0.75 : 1); e.wind = T.wind; this.setAnim(e, 'attack'); return; }
    if (d > T.range * 0.8 && e.root <= 0) {
      e.navT = (e.navT || 0) - dt;
      if (!T.fly && (e.navT <= 0 || !e.goal)) { e.navT = 0.4; e.goal = this.steer(e, tgt.x, tgt.z); }
      const [gx, gz] = T.fly ? [tgt.x, tgt.z] : e.goal; const gd = Math.hypot(gx - e.x, gz - e.z) || 1;
      let vx = (gx - e.x) / gd, vz = (gz - e.z) / gd;
      for (const o of this.enemies.values()) { if (o === e || o.dead) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), rr = T.r + ENEMIES[o.type].r; if (od < rr && od > 0.001) { vx += ox / od * 0.9; vz += oz / od * 0.9; } }
      const m = Math.hypot(vx, vz) || 1; const sp = T.speed * hz.slow * (e.phase === 2 ? 1.25 : 1);
      this.tryMove(e, vx / m * sp * dt, vz / m * sp * dt, T.r * 0.7, !!T.fly && Math.hypot(e.x + vx, e.z + vz) < this.A.radius);
      if (e.anim !== 'hit' || this.t - e.animT > 0.25) this.setAnim(e, 'walk');
    } else if (e.anim !== 'attack' || this.t - e.animT > 0.6) this.setAnim(e, 'idle');
  }
  bossAI(e, dt, tgt) {
    if (e.phase === 1 && e.hp < e.maxHp * 0.5) { e.phase = 2; this.ev({ e: 'msg', text: 'The Archon\u2019s crown of ashen flame erupts! (Phase II)' }); }
    e.special -= dt; e.summon -= dt;
    if (e.special <= 0 && tgt) {
      e.special = e.phase === 2 ? 6 : 9;
      const zid = this.id(); this.zones.set(zid, { id: zid, kind: 'boss_nova', x: tgt.x, z: tgt.z, r: 4.5, t0: this.t, life: 1.6, s: {} });
      if (e.phase === 2) { const z2 = this.id(); this.zones.set(z2, { id: z2, kind: 'boss_nova', x: e.x, z: e.z, r: 6.5, t0: this.t, life: 1.6, s: {} }); }
    }
    if (e.summon <= 0) { e.summon = e.phase === 2 ? 11 : 16; for (let i = 0; i < 3; i++) this.spawnQueue.push({ type: 'gravewalker', at: this.t + i * 0.3 }); this.ev({ e: 'msg', text: 'The Archon summons the Gravewalkers' }); }
  }

  // ------------------------------------------------------------ snapshot
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return {
      t: r(this.t), arena: this.arena, wave: this.wave, waves: WAVES.length, state: this.state, stateT: r(this.stateT),
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, cls: p.cls, x: r(p.x), z: r(p.z), f: r(p.face), a: p.anim, at: r(p.animT),
        hp: Math.round(p.hp), mhp: p.maxHp, mp: Math.round(p.mana), mmp: p.maxMana, cds: p.cds.map(r), dn: p.downed ? 1 : 0, rv: r(p.revive), b: Object.keys(p.buffs), away: p.away ? 1 : 0, k: p.kills })),
      enemies: [...this.enemies.values()].map(e => ({ id: e.id, ty: e.type, x: r(e.x), z: r(e.z), f: r(e.face), a: e.anim, at: r(e.animT), hp: Math.round(e.hp), mhp: Math.round(e.maxHp), st: e.stun > 0 ? 1 : 0, ph: e.phase })),
      projs: [...this.projs.values()].map(q => ({ id: q.id, k: q.kind, x: r(q.x), z: r(q.z), f: r(Math.atan2(q.vz, q.vx)) })),
      zones: [...this.zones.values()].map(z => ({ id: z.id, k: z.kind, x: r(z.x), z: r(z.z), r: z.r, t0: r(z.t0), l: z.life, armed: z.armed ? 1 : 0 })),
    };
  }
}
