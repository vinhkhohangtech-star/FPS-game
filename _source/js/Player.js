// =========================================================
// Player — FPS controller
//  * PointerLockControls mouse-look (drives an invisible "look" rig;
//    the real camera = look + bob/tilt/shake/recoil offsets)
//  * walk 7.0 / tactical sprint 11.5 / crouch 3.5 m/s, jump 7.5, gravity -22
//  * sinusoidal head bob, sprint dip & forward tilt, landing dip, damage shake
//  * health (100, COD-style regen) + armor shield
// =========================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAYER_START } from './Arena.js';

const WALK = 7.0, SPRINT = 11.5, CROUCH = 3.5;
const JUMP_V = 7.5, GRAVITY = -22.0;
const STAND_H = 1.7, CROUCH_H = 1.0, RADIUS = 0.4;
const MAX_PITCH = Math.PI / 2 - 0.02;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.look = new THREE.Object3D();
    this.controls = new PointerLockControls(this.look, game.renderer.domElement);
    this.controls.pointerSpeed = 1.0;
    this.sensitivity = 1.0;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.keys = Object.create(null);
    this.maxHealth = 100;

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._offEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._q = new THREE.Quaternion();
    this.reset();
  }

  reset() {
    const A = this.game.arena;
    if (A) this.position.copy(A.playerStart); else this.position.set(PLAYER_START[0], 0, PLAYER_START[1]);
    this.velocity.set(0, 0, 0);
    // yaw PI = facing +Z (yard: crate, then the house)
    this.look.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), A ? A.playerYaw : Math.PI);
    this.health = this.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.eye = STAND_H;
    this.crouchToggle = false;
    this.crouching = false;
    this.sprinting = false;
    this.grounded = true;
    this.jumpHeld = false;
    this.sprintBlock = 0;
    this.bobPhase = 0; this.bobAmt = 0; this.bobX = 0; this.bobY = 0;
    this.lastStep = 0;
    this.sprintT = 0;
    this.landDip = 0;
    this.roll = 0;
    this.shake = 0;
    this.kick = new THREE.Vector3();      // explosion impulse (pitch, yaw, roll) on a damped spring
    this.kickV = new THREE.Vector3();
    this.lastDamageTime = -99;
    this.recoilAccum = 0;
    this.timeSinceFire = 99;
    this.graceT = 0;            // damage-mitigation window (seconds left)
    this.graceCooldown = 0;
    this.recentDmg = 0;         // damage taken in roughly the last half second
    for (const k in this.keys) this.keys[k] = false;
  }

  // ---------- look helpers ----------
  getYaw() { this._euler.setFromQuaternion(this.look.quaternion, 'YXZ'); return this._euler.y; }

  addLook(dPitch, dYaw) {
    this._euler.setFromQuaternion(this.look.quaternion, 'YXZ');
    this._euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this._euler.x + dPitch));
    this._euler.y += dYaw;
    this._euler.z = 0;
    this.look.quaternion.setFromEuler(this._euler);
  }

  /** Persistent recoil climb (partially recovers when the trigger is released). */
  addRecoil(pitch, yaw) {
    this.addLook(pitch, yaw);
    this.recoilAccum += pitch;
    this.timeSinceFire = 0;
  }

  /**
   * Mouse look input while firing: pulling the mouse DOWN counters the recoil climb, so it is
   * taken off the pending recovery — otherwise the auto-recovery would drag the view into the floor.
   * (PointerLockControls turns 1 px into 0.002 * pointerSpeed radians.)
   */
  onMouseMoveY(dy) {
    if (dy <= 0 || this.recoilAccum <= 0) return;
    if (this.timeSinceFire > 0.6) return;
    this.recoilAccum = Math.max(0, this.recoilAccum - dy * 0.002 * this.controls.pointerSpeed);
  }

  cancelSprint() { this.sprintBlock = 0.3; this.sprinting = false; }
  toggleCrouch() { this.crouchToggle = !this.crouchToggle; }
  get speed2D() { return Math.hypot(this.velocity.x, this.velocity.z); }

  // ---------- per-frame ----------
  update(dt, ctx) {
    const k = this.keys, g = this.game;
    this.sprintBlock = Math.max(0, this.sprintBlock - dt);

    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const holdCrouch = k.ControlLeft || k.ControlRight;
    const shift = k.ShiftLeft || k.ShiftRight;

    if (shift && fwd > 0 && this.crouchToggle) this.crouchToggle = false; // sprinting stands you up
    this.crouching = this.crouchToggle || !!holdCrouch;
    this.sprinting = !!shift && fwd > 0 && !this.crouching && !ctx.ads && !ctx.firing && this.sprintBlock <= 0;

    let speed = this.sprinting ? SPRINT : this.crouching ? CROUCH : WALK;
    if (ctx.ads && !this.sprinting) speed *= 0.6;

    const yaw = this.getYaw();
    const fX = -Math.sin(yaw), fZ = -Math.cos(yaw);
    const rX = Math.cos(yaw), rZ = -Math.sin(yaw);
    let wx = fX * fwd + rX * str, wz = fZ * fwd + rZ * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }

    const a = 1 - Math.exp(-(this.grounded ? 12 : 2.5) * dt);
    this.velocity.x += (wx - this.velocity.x) * a;
    this.velocity.z += (wz - this.velocity.z) * a;

    // jump (space while crouched = stand up)
    if (k.Space && !this.jumpHeld) {
      this.jumpHeld = true;
      if (this.grounded) {
        if (this.crouchToggle) this.crouchToggle = false;
        else if (!this.crouching) { this.velocity.y = JUMP_V; this.grounded = false; }
      }
    }
    if (!k.Space) this.jumpHeld = false;

    this.velocity.y += GRAVITY * dt;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // keep out of enemies' bodies
    for (const e of g.waveManager.enemies) {
      if (e.dead || Math.abs(e.group.position.y - this.position.y) > 1.5) continue;
      const ex = this.position.x - e.group.position.x, ez = this.position.z - e.group.position.z;
      const d2 = ex * ex + ez * ez;
      if (d2 < 0.64 && d2 > 1e-6) { const d = Math.sqrt(d2), p = (0.8 - d) / d; this.position.x += ex * p; this.position.z += ez * p; }
    }

    const ground = g.arena.resolveCircle(this.position, RADIUS, this.position.y);
    // walking down stairs: stick to the steps instead of hopping off each one
    if (this.grounded && this.velocity.y <= 0 && this.position.y > ground && this.position.y - ground < 0.7) this.position.y = ground;
    // head bump under floors / stair flights (house)
    if (g.house && this.velocity.y > 0) {
      const ceil = g.house.ceilingAt(this.position.x, this.position.z, this.position.y + 0.6);
      const head = this.position.y + this.eye + 0.12;
      if (head > ceil) { this.position.y -= head - ceil; this.velocity.y = 0; }
    }
    if (this.position.y <= ground) {
      if (!this.grounded && this.velocity.y < -5) {
        this.landDip = Math.min(0.14, -this.velocity.y * 0.013);
        g.audio.footstep(null, 0.55);
      }
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (this.position.y < -20) { this.position.copy(g.arena.playerStart); this.velocity.set(0, 0, 0); }

    // eye height (crouch lerp 1.7 -> 1.0)
    this.eye += ((this.crouching ? CROUCH_H : STAND_H) - this.eye) * (1 - Math.exp(-12 * dt));

    // head bob
    const hs = this.speed2D;
    const moving = this.grounded && hs > 0.6;
    const stride = this.sprinting ? 2.0 : this.crouching ? 4.4 : 2.6; // phase per metre
    if (moving) this.bobPhase += dt * hs * stride;
    const amp = moving ? (this.sprinting ? 0.06 : this.crouching ? 0.02 : 0.035) * (ctx.ads ? 0.3 : 1) : 0;
    this.bobAmt += (amp - this.bobAmt) * (1 - Math.exp(-8 * dt));
    this.bobX = Math.sin(this.bobPhase) * this.bobAmt * 0.6;
    this.bobY = Math.sin(this.bobPhase * 2) * this.bobAmt * 0.5;

    const stepIdx = Math.floor(this.bobPhase / Math.PI);
    if (stepIdx !== this.lastStep) {
      this.lastStep = stepIdx;
      if (moving) g.audio.footstep(null, this.sprinting ? 0.42 : this.crouching ? 0.1 : 0.25);
    }

    // sprint pose, strafe roll, shake, landing dip
    this.sprintT += ((this.sprinting ? 1 : 0) - this.sprintT) * (1 - Math.exp(-10 * dt));
    this.roll += (-str * 0.012 - this.roll) * (1 - Math.exp(-8 * dt));
    this.landDip *= Math.exp(-7 * dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake;
    // explosion kick: stiff damped spring back to rest
    this.kickV.addScaledVector(this.kick, -150 * dt).multiplyScalar(Math.exp(-11 * dt));
    this.kick.addScaledVector(this.kickV, dt);

    // damage grace window
    this.graceT = Math.max(0, this.graceT - dt);
    this.graceCooldown = Math.max(0, this.graceCooldown - dt);
    this.recentDmg *= Math.exp(-dt / 0.5);

    // recoil recovery
    this.timeSinceFire += dt;
    if (this.timeSinceFire > 0.12 && this.recoilAccum > 0.0001) {
      const r = this.recoilAccum * (1 - Math.exp(-9 * dt));
      this.addLook(-r * 0.55, 0);
      this.recoilAccum -= r;
    }

    // compose the real camera
    const cam = this.camera;
    cam.position.set(
      this.position.x + rX * this.bobX,
      this.position.y + this.eye + this.bobY - this.sprintT * 0.07 - this.landDip,
      this.position.z + rZ * this.bobX
    );
    this._offEuler.set(
      -this.sprintT * 0.05 + (Math.random() - 0.5) * sh * 0.05 + this.kick.x,
      (Math.random() - 0.5) * sh * 0.04 + this.kick.y,
      this.roll + this.bobX * 0.15 + (Math.random() - 0.5) * sh * 0.05 + this.kick.z,
      'YXZ'
    );
    this._q.setFromEuler(this._offEuler);
    cam.quaternion.copy(this.look.quaternion).multiply(this._q);

    // COD-style health regeneration
    if (g.time - this.lastDamageTime > 4.5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 30 * dt);
    }
  }

  /**
   * Camera impulse from a detonation: trauma shake plus a directional kick away from the blast,
   * both decaying with distance (nothing beyond ~26 m * power).
   */
  explosionShake(pos, power = 1) {
    const dx = pos.x - this.position.x, dz = pos.z - this.position.z;
    const d = Math.hypot(dx, (pos.y || 0) - (this.position.y + 1), dz);
    const R = 26 * power;
    if (d >= R) return;
    const k = Math.pow(1 - d / R, 1.6) * power;
    this.shake = Math.min(1.8, this.shake + k * 1.7);
    const yaw = this.getYaw();
    const rX = Math.cos(yaw), rZ = -Math.sin(yaw), fX = -Math.sin(yaw), fZ = -Math.cos(yaw);
    const side = d > 0.01 ? (dx * rX + dz * rZ) / d : 0, front = d > 0.01 ? (dx * fX + dz * fZ) / d : 0;
    this.kickV.x += (2.2 + front * 1.2) * k;            // head snaps up (more if it went off in front)
    this.kickV.y += -side * 1.6 * k;                     // and away from the side it came from
    this.kickV.z += side * 2.0 * k;                      // roll
  }

  takeDamage(amount, fromPos) {
    if (!this.alive) return;
    const g = this.game;
    // Grace period: when health is low or a burst just landed, the next 0.25 s only deal 40 %
    if (this.graceT > 0) amount *= 0.4;
    else if (this.graceCooldown <= 0 && (this.health - amount < 50 || this.recentDmg + amount > 35)) {
      this.graceT = 0.25;
      this.graceCooldown = 1.6;
      amount *= 0.4;
      g.audio.heartbeat();
      if (g.slowMo) g.slowMo(0.3, 0.65);
    }
    this.recentDmg += amount;
    let armorHit = false;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount);
      this.armor -= absorbed;
      amount -= absorbed;
      armorHit = amount <= 0;
    }
    this.health -= amount;
    this.lastDamageTime = g.time;
    this.shake = Math.min(1, this.shake + 0.35);
    g.ui.damageFlash(armorHit ? 0.2 : 1);
    if (!armorHit) g.ui.screenBloodHit(Math.min(1, amount / 30 + (1 - this.health / this.maxHealth) * 0.5));
    g.audio.hurt(armorHit);

    if (fromPos) {
      const dx = fromPos.x - this.position.x, dz = fromPos.z - this.position.z;
      const yaw = this.getYaw();
      const fX = -Math.sin(yaw), fZ = -Math.cos(yaw), rX = Math.cos(yaw), rZ = -Math.sin(yaw);
      g.ui.damageIndicator(Math.atan2(dx * rX + dz * rZ, dx * fX + dz * fZ));
    }

    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      g.onPlayerDeath();
    }
  }
}
