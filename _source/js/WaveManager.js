// =========================================================
// WaveManager — Survival wave progression
//  Wave 1: 5 bots · Wave 2: 8 faster bots · Wave 3+: wave*4 bots, more HP, armored
//  15 s intermission (ENTER / F5 to skip), spawn throttling, ammo-pack drops
// =========================================================
import * as THREE from 'three';
import { Enemy } from './Enemy.js';

const INTERMISSION = 15;
const PICKUP_LIFE = 30;
const GRENADE_FUSE = 3.0;        // seconds from the throw
const GRENADE_RADIUS = 7;        // metres
const GRENADE_DAMAGE = 130;      // at the centre, falls off to 0 at the radius
const GRAVITY = -18;
// player frag grenades
const P_FUSE = 2.5, P_RADIUS = 6, P_DAMAGE = 180;
const MAX_SHOOTERS = 2;          // combat tokens: bots allowed to shoot at the player at once
// ---- endless mode (Highway Bridge): no intermission, escalation by survival time OR kills ----
const STAGE_KILLS = [20, 60];    // kills to reach MID / RAMPAGE
const STAGE_TIME = [60, 120];    // seconds survived to reach MID / RAMPAGE (ramp starts after 30 s)
const BOMB_RADIUS = 6.5, BOMB_DAMAGE = 125;
/** Weighted random pick from [[value, weight], ...] */
const pickW = (list) => { let t = 0; for (const [, w] of list) t += w; let r = Math.random() * t; for (const [v, w] of list) { if ((r -= w) <= 0) return v; } return list[0][0]; };
const DROP_LIFE = 40, MAX_DROPS = 10;
/** What the bots carry (and drop), by wave. */
function dropPool(w) {
  const p = ['ak47', 'ak47', 'ump45', 'mp9', 'usp45'];
  if (w >= 3) p.push('m4a1', 'saps12', 'm9');
  if (w >= 5) p.push('m4cqb', 'm4a1');
  return p;
}
const _gv = new THREE.Vector3(), _gp = new THREE.Vector3(), _gh = { x: 0, z: 0 };
const _gd = new THREE.Vector3(), _go = new THREE.Vector3(), _gn = new THREE.Vector3();

export class WaveManager {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.pickups = [];
    this.grenades = [];
    this.grenadeGeo = new THREE.SphereGeometry(0.055, 12, 8);
    this.grenadeGeo.scale(1, 1.25, 1);
    this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.55, metalness: 0.3 });
    this.leverMat = new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.4, metalness: 0.8 });
    this.pickupGeo = {
      box: new THREE.BoxGeometry(0.5, 0.28, 0.32),
      band: new THREE.BoxGeometry(0.52, 0.06, 0.34),
      ring: new THREE.RingGeometry(0.35, 0.5, 24),
    };
    this.pickupMat = {
      box: new THREE.MeshStandardMaterial({ color: 0x4a5230, roughness: 0.8 }),
      band: new THREE.MeshStandardMaterial({ color: 0xd8b43a, emissive: 0x6a5410, emissiveIntensity: 1.2, roughness: 0.5 }),
      ring: new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    };
    this.reset();
  }

  reset() {
    for (const d of this.drops || []) this.game.scene.remove(d.mesh);
    this.drops = [];
    this.fireTokens = new Set();
    for (const e of this.enemies) e.dispose();
    for (const p of this.pickups) this.game.scene.remove(p.mesh);
    for (const gr of this.grenades || []) this.game.scene.remove(gr.mesh);
    this.enemies.length = 0;
    this.pickups.length = 0;
    if (this.grenades) this.grenades.length = 0;
    this.lastGrenadeTime = -99;
    this.wave = 0;
    this.state = 'idle';
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.intermission = 0;
    this.statusText = '';
    this.config = null;
    this.endless = false;
    this.tier = 0;
    this.pending = [];
    this.elapsed = 0;
    this.nextJugg = 70;
    this.spawnCd = 0;
    this.intensity = 0;
    this.maxShooters = MAX_SHOOTERS;
    this.announced = {};
  }

  start() {
    this.wave = 0;
    if (this.game.arena.endless) this._startEndless();
    else this._startNextWave();
  }

  // =================== ENDLESS (Highway Bridge) ===================
  _startEndless() {
    this.endless = true;
    this.state = 'endless';
    this.elapsed = 0;
    this.pending = [];
    this.spawnCd = 1.0;
    this.nextJugg = 70;
    this.announced = {};
    this.intensity = 0;
    this._enterTier(1, true);
    this.game.ui.banner('ENDLESS HIGHWAY DEFENSE', 'HOLD SECTOR A — THEY WILL NOT STOP COMING');
    this.game.audio.ui('wave');
  }

  /**
   * Escalation level 0..3+: 0-1 = initial, 1-2 = mid, 2+ = rampage. Whichever is further along wins:
   * survival time (flat for 30 s, mid at 1:00, rampage at 2:00) or kills (mid at 20, rampage at 60).
   */
  _intensity(t, k) {
    const byTime = t < 30 ? 0 : t < STAGE_TIME[0] ? (t - 30) / (STAGE_TIME[0] - 30) : t < STAGE_TIME[1]
      ? 1 + (t - STAGE_TIME[0]) / (STAGE_TIME[1] - STAGE_TIME[0]) : 2 + (t - STAGE_TIME[1]) / 120;
    const byKills = k < STAGE_KILLS[0] ? k / STAGE_KILLS[0] : k < STAGE_KILLS[1]
      ? 1 + (k - STAGE_KILLS[0]) / (STAGE_KILLS[1] - STAGE_KILLS[0]) : 2 + (k - STAGE_KILLS[1]) / 60;
    return Math.max(byTime, byKills);
  }

  /** Stage parameters. f = progress inside the stage (0..1), used to ramp the head-count smoothly. */
  endlessConfig(tier, I) {
    const f = Math.min(1, Math.max(0, I - (tier - 1)));
    if (tier === 1) return {
      target: 8 + Math.round(f * 2), interval: 1.5, health: 100, speed: 4.0, sprintK: 1.25, accuracy: 0.25, armoredChance: 0,
      reaction: 0.85, burstCooldown: 1.5, weapons: [['usp45', 0.35], ['ak47', 0.65]], shooters: 2, push: 0, forward: 0,
    };
    if (tier === 2) return {
      target: 12 + Math.round(f * 3), interval: 0.8, health: 120, speed: 5.1, sprintK: 1.35, accuracy: 0.3, armoredChance: 0.5,
      reaction: 0.55, burstCooldown: 1.05, weapons: [['ump45', 0.4], ['m4a1', 0.4], ['ak47', 0.2]], shooters: 3, push: 0.35, forward: 0.3,
    };
    return {
      target: 18 + Math.min(2, Math.floor((I - 2) * 4)), interval: 0.4, health: 140, speed: 5.5, sprintK: 1.45, accuracy: 0.32,
      armoredChance: 0.7, reaction: 0.45, burstCooldown: 0.9, weapons: [['m4a1', 0.55], ['ump45', 0.45]], shooters: 4, push: 0.8, forward: 0.45,
    };
  }

  _enterTier(tier, silent = false) {
    this.tier = tier;
    this.wave = tier;                  // enemy grenades unlock from tier 2 (canThrowGrenade)
    this.config = this.endlessConfig(tier, this.intensity || 0);
    this.maxShooters = this.config.shooters;
    if (silent) return;
    if (tier === 2) this.game.ui.banner('MID STAGE // ASSAULT', 'MORE HOSTILES · FASTER SPRINTS · ARMOR · SUPPRESSING FIRE');
    if (tier === 3) this.game.ui.banner('RAMPAGE', 'THE SWARM IS ON THE BRIDGE — BOMBERS · SNIPERS · JUGGERNAUTS');
    this.game.audio.ui('wave');
    this.game.addCash(500, `THREAT LEVEL ${tier}  +$500`);
  }

  get threatName() { return ['', 'PROBING', 'ASSAULT', 'RAMPAGE'][this.tier] || ''; }

  _updateEndless(dt) {
    this.elapsed += dt;
    const I = this.intensity = this._intensity(this.elapsed, this.game.kills);
    const tier = I >= 2 ? 3 : I >= 1 ? 2 : 1;
    if (tier !== this.tier) this._enterTier(tier);
    const c = this.config = this.endlessConfig(this.tier, I);
    // continuous stream: one replacement every `interval` seconds while under the head-count
    // (twice as fast while the field is less than half full, so a fresh run fills up quickly)
    this.spawnCd -= dt;
    const alive = this.aliveCount;
    if (alive < c.target && this.spawnCd <= 0) {
      this._spawnEndless();
      this.spawnCd = c.interval * (0.8 + Math.random() * 0.4) * (alive < c.target * 0.5 ? 0.5 : 1);
    }
  }

  _pickKind() {
    if (this.tier < 3) return 'rifle';
    let jugg = 0, bomb = 0, snip = 0;
    for (const e of this.enemies) if (!e.dead) { if (e.type === 'jugg') jugg++; else if (e.type === 'bomber') bomb++; else if (e.type === 'sniper') snip++; }
    if (this.game.kills >= this.nextJugg && jugg === 0) { this.nextJugg = this.game.kills + 20; return 'jugg'; }
    const r = Math.random();
    if (r < 0.14 && bomb < 3) return 'bomber';
    if (r < 0.24 && snip < 2) return 'sniper';
    return 'rifle';
  }

  /** A hidden spawn deep down the bridge: far from the player and out of his line of sight. */
  _forwardSpawn() {
    const A = this.game.arena, list = A.forwardSpawns, p = this.game.player;
    if (!list || !list.length) return null;
    const eye = _gv.set(p.position.x, p.position.y + p.eye, p.position.z);
    for (let tries = 0; tries < 6; tries++) {
      const s = list[Math.floor(Math.random() * list.length)];
      if (s.z - p.position.z < 70 || A.isBlocked(s.x, s.z, 0.45)) continue;
      if (this.game.checkLOS(eye, _gp.set(s.x, 1.7, s.z)) || this.game.checkLOS(eye, _gp.set(s.x, 0.9, s.z))) continue;
      if (this.enemies.some((e) => !e.dead && Math.hypot(e.group.position.x - s.x, e.group.position.z - s.z) < 1.2)) continue;
      return new THREE.Vector3(s.x, 0, s.z);
    }
    return null;
  }

  _spawnEndless() {
    const A = this.game.arena, pts = A.spawnPoints, c = this.config;
    let pos = Math.random() < c.forward ? this._forwardSpawn() : null;
    for (let tries = 0; tries < 8 && !pos; tries++) {
      const b = pts[Math.floor(Math.random() * pts.length)];
      const x = b.x + (Math.random() - 0.5) * 1.2, z = b.z + (Math.random() - 0.5) * 1.0;
      if (A.isBlocked(x, z, 0.45)) continue;
      if (this.enemies.some((e) => !e.dead && Math.hypot(e.group.position.x - x, e.group.position.z - z) < 1.0)) continue;
      pos = new THREE.Vector3(x, 0, z);
    }
    if (!pos) { this.spawnCd = 0.2; return; }
    const kind = this._pickKind();
    const o = {
      position: pos, health: c.health, speed: c.speed, accuracy: c.accuracy, armored: Math.random() < c.armoredChance,
      reaction: c.reaction, burstCooldown: c.burstCooldown, wave: this.tier, type: kind, weapon: pickW(c.weapons),
      sprintK: c.sprintK, push: c.push,
    };
    if (kind === 'bomber') Object.assign(o, { health: 60, speed: 7.2, accuracy: 0, armored: false, weapon: 'none' });
    if (kind === 'sniper') Object.assign(o, { health: 110, speed: 4.6, accuracy: 0.62, armored: false, reaction: 1, weapon: 'sniper', push: 0 });
    if (kind === 'jugg') Object.assign(o, { health: 1100, speed: 2.6, sprintK: 1.6, accuracy: 0.3, armored: true, reaction: 0.4, burstCooldown: 1.3, weapon: 'lmg' });
    this.enemies.push(new Enemy(this.game, o));
    const ui = this.game.ui;
    if (kind === 'jugg') { ui.banner('JUGGERNAUT INBOUND', 'HEAVY ARMOR — AIM FOR CENTER MASS, USE FRAGS'); this.game.audio.ui('wave'); }
    else if (kind === 'bomber') ui.killPopup('⚠ SUICIDE BOMBER INBOUND', 'warn');
    else if (kind === 'sniper' && !this.announced.sniper) { this.announced.sniper = true; ui.killPopup('⚠ SNIPERS — WATCH FOR RED LASERS', 'warn'); }
  }

  /** Bomber vest going off (on contact, or shot — chain kills then score for the player). */
  bomberBlast(enemy, byPlayer) {
    const g = this.game, pos = _gp.copy(enemy.group.position);
    pos.y += 0.9;
    const floorY = g.arena.floorAt(pos.x, pos.z, pos.y);
    g.effects.spawnExplosion(pos, { floorY, size: 4.2, scorch: 3.6 });
    g.audio.explosion(pos);
    this._blast(pos.clone(), BOMB_RADIUS, BOMB_DAMAGE, byPlayer ? 'bombCredit' : 'bomb', enemy);
  }

  getConfig(w) {
    return {
      count: w === 1 ? 5 : w === 2 ? 8 : w * 4,
      health: w <= 2 ? 100 : 100 + (w - 2) * 20,
      speed: w === 1 ? 3.4 : w === 2 ? 4.6 : Math.min(4.6 + (w - 2) * 0.2, 6.2),
      accuracy: Math.min(0.26 + (w - 1) * 0.035, 0.6),
      armoredChance: w >= 3 ? Math.min(0.25 + (w - 3) * 0.1, 0.75) : 0,
      reaction: Math.max(0.35, 0.9 - (w - 1) * 0.07),
      burstCooldown: Math.max(0.7, 1.6 - (w - 1) * 0.1),
      maxAlive: Math.min(5 + w, 14),
      spawnInterval: Math.max(0.6, 1.6 - w * 0.1),
    };
  }

  _startNextWave() {
    this.wave++;
    this.config = this.getConfig(this.wave);
    this.toSpawn = this.config.count;
    this.state = 'active';
    this.spawnTimer = 1.2;
    this.statusText = '';
    const sub = this.wave === 1 ? 'SURVIVE THE ASSAULT'
      : this.wave === 2 ? 'FASTER HOSTILES INBOUND'
      : `${this.config.count} HOSTILES · ARMORED ENEMIES`;
    this.game.ui.banner(`WAVE ${this.wave}`, sub);
    this.game.audio.ui('wave');
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }
  get enemiesLeft() { return this.endless ? this.aliveCount : this.toSpawn + this.aliveCount; }

  update(dt) {
    for (const e of this.enemies) e.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removable) { this.enemies[i].dispose(); this.enemies.splice(i, 1); }
    }

    if (this.state === 'endless') this._updateEndless(dt);
    else if (this.state === 'active') {
      this.spawnTimer -= dt;
      if (this.toSpawn > 0 && this.spawnTimer <= 0 && this.aliveCount < this.config.maxAlive) {
        this._spawnEnemy();
        this.toSpawn--;
        this.spawnTimer = this.config.spawnInterval;
      }
      if (this.toSpawn === 0 && this.aliveCount === 0) this._completeWave();
    } else if (this.state === 'intermission') {
      this.intermission -= dt;
      this.statusText = `WAVE ${this.wave} COMPLETED - NEXT WAVE IN: ${Math.max(0, Math.ceil(this.intermission))}s (Press [F5] or [Enter] to skip)`;
      if (this.intermission <= 0) this._startNextWave();
    }

    this._updatePickups(dt);
    this._updateGrenades(dt);
    this._updateDrops(dt);
  }

  _completeWave() {
    this.state = 'intermission';
    this.intermission = INTERMISSION;
    const bonus = 200 + this.wave * 100;
    this.game.addCash(bonus, `WAVE ${this.wave} COMPLETE  +$${bonus}`);
    this.game.audio.ui('waveDone');
  }

  skipIntermission() {
    if (this.state === 'intermission') this.intermission = 0;
  }

  _spawnEnemy() {
    const pts = this.game.arena.spawnPoints;
    const pp = this.game.player.position;
    let candidates = pts.filter((p) => Math.hypot(p.x - pp.x, p.z - pp.z) > 24);
    if (!candidates.length) candidates = pts;
    const base = candidates[Math.floor(Math.random() * candidates.length)];
    const pos = new THREE.Vector3(base.x + (Math.random() - 0.5) * 4, base.y || 0, base.z + (Math.random() - 0.5) * 4);
    if (this.game.arena.mode === 'city') {
      const n = this.game.house.nearestNode(base.x + (Math.random() - 0.5) * 3, base.y, base.z + (Math.random() - 0.5) * 3);
      pos.set(n ? n.x : base.x, n ? n.y : base.y, n ? n.z : base.z);
    }
    pos.y = Math.max(pos.y, this.game.arena.resolveCircle(pos, 0.45, pos.y));
    const c = this.config;
    this.enemies.push(new Enemy(this.game, {
      position: pos,
      health: c.health,
      speed: c.speed,
      accuracy: c.accuracy,
      armored: Math.random() < c.armoredChance,
      reaction: c.reaction,
      burstCooldown: c.burstCooldown,
      wave: this.wave,
    }));
  }

  onEnemyKilled(enemy, headshot, source = 'player') {
    this.releaseFireToken(enemy);
    if (source === 'self') return;            // a bomber that reached the player: no score, no loot
    if (source === 'player') this.game.registerKill(headshot, enemy);
    else if (source === 'playerGrenade') { this.game.registerKill(false, enemy); }
    else this.game.ui.killPopup('ENEMY KILLED BY GRENADE', 'info');
    // the bot's weapon falls to the ground; sometimes an ammo box too
    const W = this.game.weapons;
    let pool;
    if (this.endless) {
      const id = enemy.ws && enemy.ws.drop;
      if (!id) return;
      pool = W.isLoaded(id) && W.weapons[id].worldModel && Math.random() < 0.55 ? [id] : [];
      if (!pool.length) { if (Math.random() < 0.3) this._spawnPickup(enemy.group.position); return; }
    } else pool = dropPool(this.wave).filter((id) => W.isLoaded(id) && W.weapons[id].worldModel);
    if (pool.length) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      const def = this.game.weapons.weapons[id].def;
      const mag = Math.max(1, Math.floor(def.magSize * (0.35 + Math.random() * 0.65)));
      const reserve = def.magSize * (1 + Math.floor(Math.random() * 2));
      this.spawnWeaponDrop(enemy.group.position, id, mag, reserve, false);
      if (Math.random() < 0.4) this._spawnPickup(enemy.group.position.clone().add(new THREE.Vector3(0.7, 0, 0.4)));
    } else this._spawnPickup(enemy.group.position);
  }

  // ---------------- combat tokens ----------------
  takeFireToken(e) {
    const T = this.fireTokens;
    if (T.has(e)) return true;
    for (const o of T) if (o.dead || o.state !== 'attack' || !o.hasLOS || o.action) T.delete(o);
    if (T.size >= this.maxShooters) return false;
    T.add(e);
    return true;
  }
  releaseFireToken(e) { this.fireTokens.delete(e); }
  hasFireToken(e) { return this.fireTokens.has(e); }

  // ---------------- dropped weapons ----------------
  spawnWeaponDrop(pos, id, mag, reserve, redDot) {
    const W = this.game.weapons, w = W.weapons[id];
    if (!w || !w.worldModel) return null;
    const mesh = new THREE.Group();
    const gun = w.worldModel.clone();
    const holder = new THREE.Group();
    holder.add(gun);
    gun.rotation.z = Math.PI / 2;                  // lying on its side
    holder.rotation.y = Math.random() * Math.PI * 2;
    mesh.add(holder);
    const ring = new THREE.Mesh(this.pickupGeo.ring, this.dropRingMat || (this.dropRingMat = new THREE.MeshBasicMaterial({
      color: 0x8fe0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(1.4);
    ring.position.y = 0.02;
    mesh.add(ring);
    const floorY = this.game.arena.floorAt(pos.x, pos.z, (pos.y || 0) + 0.5);
    mesh.position.set(pos.x, floorY, pos.z);
    this.game.scene.add(mesh);
    const d = { mesh, holder, ring, id, mag, reserve, redDot: !!redDot, life: DROP_LIFE, t: 0, vy: 2.6, h: 0.35, half: w.worldHalf || 0.04 };
    this.drops.push(d);
    while (this.drops.length > MAX_DROPS) this._removeDrop(this.drops[0]);
    return d;
  }

  _removeDrop(d) {
    const i = this.drops.indexOf(d);
    if (i >= 0) this.drops.splice(i, 1);
    this.game.scene.remove(d.mesh);
  }

  /** The drop the player is standing next to and looking at (or null). */
  lookedDrop() {
    const p = this.game.player, yaw = p.getYaw();
    const fX = -Math.sin(yaw), fZ = -Math.cos(yaw);
    let best = null, bestScore = -1;
    for (const d of this.drops) {
      const dx = d.mesh.position.x - p.position.x, dz = d.mesh.position.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.0 || Math.abs(d.mesh.position.y - p.position.y) > 1.5) continue;
      const dot = dist < 0.6 ? 1 : (dx * fX + dz * fZ) / dist;
      if (dot < 0.72) continue;                       // within ~45 deg of where we look
      const score = dot - dist * 0.1;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  _updateDrops(dt) {
    const p = this.game.player, W = this.game.weapons;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt; d.t += dt;
      // little toss + bounce
      if (d.vy !== 0 || d.h > 0) {
        d.vy += GRAVITY * dt; d.h += d.vy * dt;
        if (d.h <= 0) { d.h = 0; d.vy = d.vy < -1.5 ? -d.vy * 0.35 : 0; }
      }
      d.holder.position.y = d.h + d.half;
      d.ring.material.opacity = 0.35 + Math.sin(d.t * 4) * 0.15;
      d.mesh.visible = d.life > 5 || Math.floor(d.life * 6) % 2 === 0;
      if (d.life <= 0) { this._removeDrop(d); continue; }
      // walking over a weapon you already carry takes its ammo (COD style)
      if (d.reserve + d.mag > 0 && W.owns(d.id)) {
        const dist = Math.hypot(p.position.x - d.mesh.position.x, p.position.z - d.mesh.position.z);
        if (dist < 1.3 && Math.abs(p.position.y - d.mesh.position.y) < 1.5) {
          const w = W.weapons[d.id];
          const room = w.def.reserveMax - w.reserve;
          if (room > 0) {
            const take = Math.min(room, d.reserve + d.mag);
            w.reserve += take;
            d.reserve = Math.max(0, d.reserve - take); d.mag = Math.max(0, d.mag - Math.max(0, take - (d.reserve)));
            this.game.ui.killPopup(`+${take} ${w.def.shortName} AMMO`, 'info');
            this.game.audio.ui('pickup');
            this._removeDrop(d);
          }
        }
      }
    }
  }

  // ---------------- player grenades ----------------
  throwPlayerGrenade(from, vel) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    body.castShadow = true;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.02), this.leverMat);
    lever.position.set(0.04, 0.05, 0);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
    led.position.set(0, 0.075, 0);
    mesh.add(body, lever, led);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    this.grenades.push({ mesh, vel: vel.clone(), fuse: P_FUSE, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0),
      thrower: 'player', led, beep: 0 });
  }

  // ---------------- grenades ----------------
  /** At most one enemy grenade in the air at a time, and a short global cooldown. */
  canThrowGrenade() {
    return this.wave >= 2 && this.grenades.length === 0 && this.game.time - this.lastGrenadeTime > 7;
  }
  noteGrenade() { this.lastGrenadeTime = this.game.time; }

  throwGrenade(from, target, thrower) {
    const aim = _gp.set(target.x + (Math.random() - 0.5) * 3, (target.y || 0) + 0.1, target.z + (Math.random() - 0.5) * 3);
    const flat = Math.hypot(aim.x - from.x, aim.z - from.z);
    const T = THREE.MathUtils.clamp(flat / 13, 0.7, 1.5);
    const vel = new THREE.Vector3((aim.x - from.x) / T, (aim.y - from.y) / T - 0.5 * GRAVITY * T, (aim.z - from.z) / T);
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    body.castShadow = true;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.02), this.leverMat);
    lever.position.set(0.04, 0.05, 0);
    mesh.add(body, lever);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    this.grenades.push({ mesh, vel, fuse: GRENADE_FUSE, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), thrower });
    this.game.audio.ui('click');
  }

  _updateGrenades(dt) {
    const g = this.game, arena = g.arena, p = g.player;
    let nearest = null, nearestD = 1e9;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      const pos = gr.mesh.position;
      gr.fuse -= dt;
      if (gr.led) {
        const rate = gr.fuse < 0.8 ? 0.1 : 0.35;
        gr.beep -= dt;
        if (gr.beep <= 0) { gr.beep = rate; g.audio.grenadeBeep(pos, p.position); }
        gr.led.visible = gr.beep > rate * 0.5;
      }
      gr.vel.y += GRAVITY * dt;
      const ox = pos.x, oz = pos.z;
      // swept collision: a fast grenade must not tunnel through thin walls / floors
      const step = gr.vel.length() * dt;
      if (step > 1e-4) {
        _gd.copy(gr.vel).divideScalar(step / dt);
        const hit = g.raycastWorld(_go.copy(pos), _gd, step + 0.07);
        if (hit && hit.face) {
          const n = _gn.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          if (n.dot(_gd) > 0) n.negate();
          const vn = gr.vel.dot(n);
          gr.vel.addScaledVector(n, -1.4 * vn).multiplyScalar(0.62);   // bounce, lose energy
          pos.copy(hit.point).addScaledVector(n, 0.07);
          if (Math.abs(vn) > 2) g.audio.footstep(pos, 0.22);
        } else pos.addScaledVector(gr.vel, dt);
      }
      // bounce off walls / cover (only below their tops)
      if (arena.isBlocked(pos.x, pos.z, 0.06)) {
        let top = 0;
        for (const c of arena.colliders) if (pos.x > c.minX - 0.06 && pos.x < c.maxX + 0.06 && pos.z > c.minZ - 0.06 && pos.z < c.maxZ + 0.06) top = Math.max(top, c.top);
        if (pos.y < top) {
          const hitX = arena.isBlocked(pos.x, oz, 0.06), hitZ = arena.isBlocked(ox, pos.z, 0.06);
          if (hitX || !hitZ) { gr.vel.x *= -0.35; pos.x = ox; }
          if (hitZ || !hitX) { gr.vel.z *= -0.35; pos.z = oz; }
          if (pos.y < top && pos.y > top - 0.25 && gr.vel.y < 0) { pos.y = top + 0.06; gr.vel.y *= -0.3; gr.vel.x *= 0.6; gr.vel.z *= 0.6; }
        }
      }
      // house walls / floors
      if (arena.house && arena.house.inside(pos.x, pos.z, 0.2)) {
        const t = _gh; t.x = pos.x; t.z = pos.z;
        if (arena.house.pushOut(t, 0.08, pos.y - 0.7, 0.8)) {
          const hx = t.x - pos.x, hz = t.z - pos.z, hl = Math.hypot(hx, hz) || 1;
          const vn = (gr.vel.x * hx + gr.vel.z * hz) / hl;
          if (vn < 0) { gr.vel.x -= 1.35 * vn * hx / hl; gr.vel.z -= 1.35 * vn * hz / hl; }
          pos.x = t.x; pos.z = t.z;
        }
        const ceil = arena.house.ceilingAt(pos.x, pos.z, pos.y - 0.2);
        if (gr.vel.y > 0 && pos.y + 0.06 > ceil && ceil - pos.y < 0.3) { pos.y = ceil - 0.07; gr.vel.y *= -0.3; }
      }
      const floorY = arena.floorAt(pos.x, pos.z, pos.y - 0.25);
      if (pos.y < floorY + 0.06) {
        pos.y = floorY + 0.06;
        if (gr.vel.y < -1.5) g.audio.footstep(pos, 0.25);
        gr.vel.y *= -0.3; gr.vel.x *= 0.55; gr.vel.z *= 0.55;
      }
      const sp = Math.hypot(gr.vel.x, gr.vel.z);
      gr.mesh.rotation.x += gr.spin.x * dt * Math.min(1, sp);
      gr.mesh.rotation.z += gr.spin.y * dt * Math.min(1, sp);

      const d = Math.hypot(pos.x - p.position.x, pos.z - p.position.z);
      if (d < nearestD) { nearestD = d; nearest = gr; }
      if (gr.fuse <= 0) { this._explode(gr); this.grenades.splice(i, 1); }
    }
    // HUD warning when a live grenade is close
    if (nearest && nearestD < 9) {
      const pos = nearest.mesh.position;
      const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
      const yaw = p.getYaw();
      const fX = -Math.sin(yaw), fZ = -Math.cos(yaw), rX = Math.cos(yaw), rZ = -Math.sin(yaw);
      g.ui.setGrenadeWarning(Math.atan2(dx * rX + dz * rZ, dx * fX + dz * fZ), nearestD);
    } else g.ui.setGrenadeWarning(null);
  }

  _explode(gr) {
    const g = this.game, pos = gr.mesh.position;
    const mine = gr.thrower === 'player';
    g.scene.remove(gr.mesh);
    const floorY = g.arena.floorAt(pos.x, pos.z, pos.y + 0.2);
    g.effects.spawnExplosion(pos, { floorY, size: 3.6 });
    g.audio.explosion(pos);
    this._blast(pos, mine ? P_RADIUS : GRENADE_RADIUS, mine ? P_DAMAGE : GRENADE_DAMAGE, mine ? 'player' : 'enemy');
  }

  /**
   * Blast damage + screen effects. mode: 'player' (own frag: 60 % self damage, kills score),
   * 'enemy' (bot grenade), 'bombCredit' (bomber shot by the player: kills score), 'bomb' (bomber reached you).
   */
  _blast(pos, RAD, DMG, mode, skip = null) {
    const g = this.game, p = g.player;
    const mine = mode === 'player';
    const credit = mode === 'player' || mode === 'bombCredit';
    // player: damage, camera trauma, white flash + dirt on the screen edges
    const eye = _gv.set(p.position.x, p.position.y + p.eye * 0.6, p.position.z);
    const d = eye.distanceTo(pos);
    if (d < RAD) {
      const covered = !g.checkLOS(_gp.copy(pos).setY(pos.y + 0.3), eye);
      const dmg = DMG * Math.pow(1 - d / RAD, 1.15) * (covered ? 0.35 : 1) * (mine ? 0.6 : 1);
      if (dmg > 1) p.takeDamage(dmg, pos);
    }
    p.explosionShake(pos, mode === 'bomb' || mode === 'bombCredit' ? 1.25 : 1);
    if (d < 14 && g.checkLOS(_gp.copy(pos).setY(pos.y + 0.5), eye)) g.ui.blastFlash(Math.pow(1 - d / 14, 0.7));
    if (d < 9) g.ui.dirtVignette(1 - d / 9);
    // enemies caught in the blast (the player's own grenades score kills)
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ed = e.group.position.distanceTo(_gp.set(pos.x, pos.y - 0.06, pos.z));
      if (e === skip) continue;
      const r = credit ? RAD : RAD - 1;
      if (ed < r) {
        const res = e.takeDamage(DMG * Math.pow(1 - ed / r, credit ? 0.8 : 1), 'body', null, null, credit ? 'playerGrenade' : 'grenade');
        if (credit && res) g.onEnemyHit(e, res);
      }
    }
  }

  _spawnPickup(pos) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(this.pickupGeo.box, this.pickupMat.box);
    box.castShadow = true;
    const band = new THREE.Mesh(this.pickupGeo.band, this.pickupMat.band);
    const holder = new THREE.Group();
    holder.add(box, band);
    g.add(holder);
    const ring = new THREE.Mesh(this.pickupGeo.ring, this.pickupMat.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    g.position.set(pos.x, pos.y || 0, pos.z);
    this.game.scene.add(g);
    this.pickups.push({ mesh: g, holder, life: PICKUP_LIFE, t: Math.random() * 6 });
  }

  _updatePickups(dt) {
    const p = this.game.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.life -= dt;
      pk.t += dt;
      pk.holder.rotation.y += dt * 1.8;
      pk.holder.position.y = 0.32 + Math.sin(pk.t * 3) * 0.07;
      pk.mesh.visible = pk.life > 5 || Math.floor(pk.life * 6) % 2 === 0;
      const d = Math.hypot(p.position.x - pk.mesh.position.x, p.position.z - pk.mesh.position.z);
      if (d < 1.6 && Math.abs(p.position.y - pk.mesh.position.y) < 1.5) {
        if (this.game.weapons.addAmmo()) {
          this.game.ui.killPopup('+AMMO', 'info');
          this.game.audio.ui('pickup');
          this.game.scene.remove(pk.mesh);
          this.pickups.splice(i, 1);
          continue;
        }
      }
      if (pk.life <= 0) { this.game.scene.remove(pk.mesh); this.pickups.splice(i, 1); }
    }
  }
}
