// =========================================================
// Enemy — terrorist bot
//  * Model: first available entry of BOT_MODELS (Mixamo-rigged CS2 terrorist with 14 named
//    clips, or the older single-take bot.glb), otherwise a procedural humanoid.
//  * HUNT   : pursue the player, probe obstacle avoidance, stuck recovery, directional
//             locomotion clips (walk / run / strafe left-right / walk back)
//  * ATTACK : < 25 m with clear LOS -> face player, 3-5 round bursts (15 HP per hit),
//             some bots crouch to fire (smaller hitboxes), 30-round mags + reload animation,
//             flinch (hit reaction) when shot, grenades when the player hides behind cover
//  * 100 HP (scaled per wave), 2x headshots, armored variants, 3 death animations
// =========================================================
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

/** Models tried in order; the first one that loads is used for every bot. */
export const BOT_MODELS = [
  {
    // CS2 terrorist (Sketchfab, CC-BY "Cs2 Terrorist" by Toast), rigged + animated on Mixamo.
    // Built from assets/models/Terrorist 3d/*.fbx into one file with named clips.
    url: 'assets/models/terrorist.glb',
    yaw: 0,                 // faces +Z
    aimYawOffset: -0.27,    // Mixamo rifle poses hold the gun ~15° off the hips' facing
    attachRifle: true,      // the character has empty hands -> give it an AK
    // natural speed (m/s) of each locomotion clip, so feet don't slide
    clipSpeed: { walk: 1.6, run: 3.3, strafe_left: 2.2, strafe_right: 2.2, walk_back: 1.6 },
    targetHeight: 1.8,
    colors: null,
  },
  {
    // older 3DRT middle-east character: ONE 95 s mocap take, exported upside down, no textures
    url: 'assets/models/bot.glb',
    yaw: Math.PI,
    aimYawOffset: -0.39,
    segments: {
      walk: [10.5, 11.82, true],
      aim: [80.5, 81.85, true],
      die: [81.95, 82.75, false],
    },
    refTime: 81.2,
    targetHeight: 1.8,
    colors: [
      [/turban|head|hat/i, 0x2a2826, 0.95, 0],
      [/ak|gun|weapon|rifle/i, 0x2b2724, 0.5, 0.55],
      [/male|body|char/i, 0x75664c, 0.95, 0],
    ],
    handBone: /L_Hand|LeftHand|Hand_L/i,
    muzzleForward: 0.36,
  },
];

const ATTACK_RANGE = 25;
const BOT_DAMAGE = 15;
const BOT_MAG = 30;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _eye = new THREE.Vector3(), _target = new THREE.Vector3();
const _muz = new THREE.Vector3(), _dir = new THREE.Vector3(), _end = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _m1 = new THREE.Matrix4();
const _zAxis = new THREE.Vector3(0, 0, 1);

/**
 * What a bot carries: damage per hit, burst length, time between rounds, burst-cooldown factor,
 * engagement range, magazine. `drop` = the Armory weapon id it leaves behind.
 */
export const ENEMY_WEAPONS = {
  usp45: { damage: 12, burst: [1, 3], gap: 0.26, coolK: 0.8, range: 18, mag: 12, drop: 'usp45' },
  ak47: { damage: 15, burst: [3, 5], gap: 0.1, coolK: 1, range: 28, mag: 30, drop: 'ak47' },
  ump45: { damage: 11, burst: [4, 7], gap: 0.085, coolK: 0.9, range: 24, mag: 25, drop: 'ump45' },
  m4a1: { damage: 14, burst: [3, 6], gap: 0.09, coolK: 0.85, range: 32, mag: 30, drop: 'm4a1' },
  lmg: { damage: 9, burst: [6, 10], gap: 0.09, coolK: 0.85, range: 30, mag: 100, drop: 'm4a1' },
  sniper: { damage: 45, burst: [1, 1], gap: 1, coolK: 1, range: 85, mag: 5, drop: 'm4a1' },
  none: { damage: 0, burst: [0, 0], gap: 1, coolK: 1, range: 0, mag: 1, drop: null },
};
const LASER_GEO = new THREE.BoxGeometry(0.012, 0.012, 1);
const V3 = () => new THREE.Vector3();

const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
const BODY_GEO = new THREE.BoxGeometry(0.62, 1.5, 0.5);
const HEAD_GEO = new THREE.BoxGeometry(0.32, 0.34, 0.34);

let template = null;
let CFG = null;

/** Copies the [a, b] seconds of a long take into a standalone clip (keeps one key either side). */
function trimClip(clip, name, a, b) {
  const tracks = [];
  for (const tr of clip.tracks) {
    const times = tr.times, n = times.length, size = tr.getValueSize();
    let i0 = 0; while (i0 < n - 1 && times[i0 + 1] <= a) i0++;
    let i1 = n - 1; while (i1 > 0 && times[i1 - 1] >= b) i1--;
    if (i1 < i0) i1 = i0;
    const t = new Float32Array(i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) t[i - i0] = times[i] - a;
    const v = tr.values.slice(i0 * size, (i1 + 1) * size);
    tracks.push(new tr.constructor(tr.name, t, v));
  }
  return new THREE.AnimationClip(name, b - a, tracks);
}

const FULL_SET = ['idle', 'walk', 'run', 'strafe_left', 'strafe_right', 'walk_back', 'fire', 'reload',
  'crouch_fire', 'grenade', 'hit', 'death1', 'death2', 'death3'];
const ONE_SHOTS = ['reload', 'grenade', 'hit', 'death1', 'death2', 'death3', 'die'];

export function setBotTemplate(gltf, cfg) {
  CFG = cfg;
  const scene = gltf.scene;
  const anims = gltf.animations || [];

  if (cfg.colors) {
    scene.traverse((o) => {
      if (!o.isMesh || (o.material && o.material.map)) return;
      const c = cfg.colors.find(([re]) => re.test(o.name));
      if (c) o.material = new THREE.MeshStandardMaterial({ color: c[1], roughness: c[2], metalness: c[3] });
    });
  }

  // clips: exact names (Mixamo set) > keyword match > segments cut from a single long take
  const clips = {};
  for (const c of anims) if (FULL_SET.includes(c.name)) clips[c.name] = c;
  if (!clips.walk) {
    const named = { walk: /walk/i, run: /run|sprint/i, aim: /shoot|fire|attack|aim/i, die: /die|death|dead/i, idle: /idle|stand/i };
    for (const [k, re] of Object.entries(named)) { const c = anims.find((x) => re.test(x.name)); if (c) clips[k] = c; }
  }
  if (!clips.walk && !clips.aim && anims.length && cfg.segments) {
    for (const [k, [a, b]] of Object.entries(cfg.segments)) if (b <= anims[0].duration) clips[k] = trimClip(anims[0], k, a, b);
  }
  const loops = {};
  for (const k of Object.keys(clips)) loops[k] = !ONE_SHOTS.includes(k);
  for (const [k, seg] of Object.entries(cfg.segments || {})) loops[k] = seg[2];

  // measure the model in a reference pose: upright? height? centre? where are the hands?
  const probe = new THREE.Group();
  probe.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const refClip = clips.idle || clips.aim || anims[0];
  if (refClip) {
    mixer.clipAction(refClip).play();
    const t = cfg.segments && cfg.segments.aim && refClip === clips.aim ? cfg.refTime - cfg.segments.aim[0] : refClip.duration * 0.3;
    mixer.setTime(Math.max(0, Math.min(refClip.duration, t)));
  }
  probe.updateMatrixWorld(true);
  const find = (re) => { let f = null; scene.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };
  const head = find(/head(?!nub|top)/i) || find(/head/i), foot = find(/foot|toe/i), pelvis = find(/pelvis|hips/i);
  let flip = false;
  if (head && foot && head.getWorldPosition(V3()).y < foot.getWorldPosition(V3()).y) {
    flip = true; probe.rotation.z = Math.PI; probe.updateMatrixWorld(true);
  }
  const box = new THREE.Box3().setFromObject(probe);
  const size = box.getSize(V3());
  const scale = size.y > 0 ? cfg.targetHeight / size.y : 1;
  const centre = pelvis ? pelvis.getWorldPosition(V3()) : box.getCenter(V3());
  const headY = head ? (head.getWorldPosition(V3()).y - box.min.y) * scale + 0.08 : 1.7;
  const hand = cfg.handBone ? find(cfg.handBone) : null;
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  probe.remove(scene);
  scene.rotation.set(0, 0, 0);

  template = {
    scene, clips, loops, flip, scale, minY: box.min.y, cx: centre.x, cz: centre.z, headY,
    handName: hand ? hand.name : null,
    full: !!(clips.walk && clips.fire && clips.idle),
  };
  console.info(`[Enemy] ${cfg.url}: clips [${Object.keys(clips).join(', ')}]${flip ? ', flipped upright' : ''}, scale ${scale.toFixed(3)}`);
}

// ---------------- procedural pieces ----------------
const geoCache = new Map();
function bgeo(w, h, d) {
  const k = `${w}_${h}_${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
let M = null;
function mats() {
  if (M) return M;
  const std = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  M = {
    shirt: std(0x7a6b4c), pants: std(0x4c4736), vest: std(0x3a4030), vestArmor: std(0x24282a, 0.6, 0.3),
    plate: std(0x30343a, 0.5, 0.45), mask: std(0x161616, 0.95), skin: std(0xb4876a, 0.8), boots: std(0x1b1916, 0.8),
    gun: std(0x1f1f1f, 0.45, 0.65), wood: std(0x6b3a1e, 0.7), helmet: std(0x3b402f, 0.6, 0.2), pouch: std(0x4a4a34, 0.9),
    grenade: std(0x3d4a2c, 0.6, 0.2),
  };
  return M;
}
function part(parent, w, h, d, m, x, y, z) {
  const mesh = new THREE.Mesh(bgeo(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Bot AK: origin at the pistol grip, barrel along +Z. */
function buildRifle() {
  const m = mats();
  const g = new THREE.Group();
  part(g, 0.05, 0.075, 0.42, m.gun, 0, 0.035, 0.08);       // receiver
  part(g, 0.058, 0.058, 0.2, m.wood, 0, 0.03, 0.38);       // handguard
  part(g, 0.022, 0.022, 0.34, m.gun, 0, 0.045, 0.62);      // barrel
  part(g, 0.032, 0.03, 0.04, m.gun, 0, 0.06, 0.74);        // front sight block
  part(g, 0.045, 0.075, 0.3, m.wood, 0, 0.0, -0.27);       // stock
  part(g, 0.032, 0.09, 0.04, m.gun, 0, -0.04, -0.01);      // pistol grip
  const mag = part(g, 0.035, 0.17, 0.07, m.gun, 0, -0.07, 0.16);
  mag.rotation.x = 0.35;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, 0.8);
  g.add(muzzle);
  return { group: g, muzzle };
}

function buildSoldier(armored) {
  const m = mats();
  const root = new THREE.Group();
  const P = {};
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.11 * side, 0.92, 0);
    root.add(leg);
    part(leg, 0.17, 0.48, 0.19, m.pants, 0, -0.24, 0);
    part(leg, 0.15, 0.4, 0.17, m.pants, 0, -0.66, 0);
    part(leg, 0.175, 0.1, 0.2, m.pouch, 0, -0.48, 0.015);
    part(leg, 0.16, 0.11, 0.28, m.boots, 0, -0.865, 0.04);
    P[side < 0 ? 'legL' : 'legR'] = leg;
  }
  part(root, 0.38, 0.16, 0.22, m.pants, 0, 0.96, 0);
  const torso = new THREE.Group();
  torso.position.set(0, 1.0, 0);
  root.add(torso);
  P.torso = torso;
  part(torso, 0.44, 0.52, 0.24, m.shirt, 0, 0.27, 0);
  part(torso, 0.47, 0.4, 0.29, armored ? m.vestArmor : m.vest, 0, 0.28, 0);
  if (armored) {
    part(torso, 0.34, 0.28, 0.04, m.plate, 0, 0.31, 0.165);
    part(torso, 0.34, 0.28, 0.04, m.plate, 0, 0.31, -0.165);
    part(torso, 0.14, 0.08, 0.2, m.plate, 0.27, 0.52, 0);
    part(torso, 0.14, 0.08, 0.2, m.plate, -0.27, 0.52, 0);
  } else {
    for (const x of [-0.13, 0, 0.13]) part(torso, 0.1, 0.12, 0.06, m.pouch, x, 0.18, 0.165);
  }
  part(torso, 0.12, 0.08, 0.12, m.mask, 0, 0.57, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.7, 0);
  torso.add(head);
  part(head, 0.22, 0.25, 0.24, m.mask, 0, 0, 0);
  part(head, 0.17, 0.045, 0.01, m.skin, 0, 0.03, 0.121);
  if (armored) {
    part(head, 0.27, 0.11, 0.29, m.helmet, 0, 0.12, 0);
    part(head, 0.28, 0.04, 0.3, m.helmet, 0, 0.07, 0.005);
  } else part(head, 0.23, 0.06, 0.25, m.mask, 0, 0.13, 0);
  const upper = new THREE.Group();
  torso.add(upper);
  P.upper = upper;
  const arm = (side, upperRotX, foreRotX, yaw) => {
    const a = new THREE.Group();
    a.position.set(0.26 * side, 0.47, 0);
    a.rotation.set(upperRotX, yaw, 0);
    upper.add(a);
    part(a, 0.12, 0.3, 0.12, m.shirt, 0, -0.15, 0);
    const f = new THREE.Group();
    f.position.set(0, -0.3, 0);
    f.rotation.x = foreRotX;
    a.add(f);
    part(f, 0.1, 0.27, 0.1, m.shirt, 0, -0.13, 0);
    part(f, 0.09, 0.09, 0.1, m.boots, 0, -0.29, 0);
  };
  arm(1, -0.3, -1.15, -0.35);
  arm(-1, -0.9, -0.7, 0.4);
  const rifle = buildRifle();
  rifle.group.position.set(0.1, 0.3, 0.2);
  upper.add(rifle.group);
  return { root, parts: P, muzzle: rifle.muzzle };
}

function createGLBVisual() {
  const obj = skeletonClone(template.scene);
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; if (o.isSkinnedMesh) o.frustumCulled = false; }
  });
  // yaw -> scale -> upright fix + centring -> model
  const fix = new THREE.Group();
  fix.rotation.z = template.flip ? Math.PI : 0;
  fix.position.set(-template.cx, -template.minY, -template.cz);
  fix.add(obj);
  const scaler = new THREE.Group();
  scaler.scale.setScalar(template.scale);
  scaler.add(fix);
  const yaw = new THREE.Group();
  yaw.rotation.y = CFG.yaw;
  yaw.add(scaler);

  const mixer = new THREE.AnimationMixer(obj);
  const actions = {};
  for (const [k, clip] of Object.entries(template.clips)) {
    const a = mixer.clipAction(clip);
    const loop = template.loops[k];
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    actions[k] = a;
  }
  if (!actions.run && actions.walk) actions.run = actions.walk;
  if (!actions.walk && actions.run) actions.walk = actions.run;
  if (!actions.fire && actions.aim) actions.fire = actions.aim;
  if (!actions.idle) actions.idle = actions.aim || actions.walk || null;
  if (!actions.death1 && actions.die) actions.death1 = actions.die;

  const bone = (re) => { let f = null; obj.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };
  let hand = template.handName ? bone(new RegExp(`^${template.handName}$`)) : null;

  // empty-handed character: put an AK in the right hand, aligned toward the left hand
  let muzzle = null, rifle = null;
  if (CFG.attachRifle && actions.idle) {
    const rh = bone(/RightHand$/), lh = bone(/LeftHand$/);
    if (rh && lh) {
      actions.idle.reset().play(); mixer.update(0.35); yaw.updateMatrixWorld(true);
      const r = rh.getWorldPosition(V3()), l = lh.getWorldPosition(V3());
      const fwd = l.clone().sub(r).normalize();
      const up = V3().set(0, 1, 0).addScaledVector(fwd, -fwd.y).normalize();
      const right = V3().crossVectors(up, fwd).normalize();
      const gunQ = new THREE.Quaternion().setFromRotationMatrix(_m1.makeBasis(right, up, fwd));
      const gunPos = r.clone().addScaledVector(fwd, 0.05).addScaledVector(up, -0.02);
      rifle = buildRifle();
      rh.add(rifle.group);
      const hq = rh.getWorldQuaternion(new THREE.Quaternion());
      const hs = rh.getWorldScale(V3());
      rifle.group.quaternion.copy(hq.invert().multiply(gunQ));
      rifle.group.position.copy(rh.worldToLocal(gunPos));
      rifle.group.scale.setScalar(1 / hs.x);
      muzzle = rifle.muzzle;
      actions.idle.stop();
      // calibrate once: how far each clip turns the rifle away from the hips' facing
      if (!template.aimOffsets) {
        template.aimOffsets = {};
        const f = V3();
        for (const k of ['idle', 'fire', 'walk', 'run', 'strafe_left', 'strafe_right', 'walk_back', 'crouch_fire', 'hit']) {
          const a = actions[k];
          if (!a) continue;
          let sum = 0, n = 0;
          for (const frac of [0.2, 0.5, 0.8]) {
            mixer.stopAllAction();
            a.reset().play();
            mixer.setTime(a.getClip().duration * frac);
            yaw.updateMatrixWorld(true);
            f.set(0, 0, 1).applyQuaternion(rifle.group.getWorldQuaternion(_q1));
            sum += Math.atan2(f.x, f.z); n++;
          }
          template.aimOffsets[k] = THREE.MathUtils.clamp(-(sum / n), -0.8, 0.8);
        }
        mixer.stopAllAction();
        console.info('[Enemy] rifle aim offsets (deg):', Object.fromEntries(Object.entries(template.aimOffsets).map(([k, v]) => [k, Math.round(v * 57.3)])));
      }
      mixer.update(0);
    }
  }
  if (!muzzle) { muzzle = new THREE.Object3D(); muzzle.position.set(0.16, 1.38, 0.7); }
  return { root: yaw, yawGroup: yaw, mixer, actions, muzzle, hand, rifleOnModel: !!rifle };
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2));
  if (d < 0) d += Math.PI * 2;
  return a + (d - Math.PI) * t;
}

const cdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Enemy {
  constructor(game, opts) {
    this.game = game;
    this.cfg = opts;
    this.maxHealth = opts.health;
    this.health = opts.health;
    this.armored = !!opts.armored;
    this.speed = opts.speed * (0.9 + Math.random() * 0.2);
    this.accuracy = opts.accuracy;
    // type: 'rifle' (default) | 'bomber' | 'sniper' | 'jugg'
    this.type = opts.type || 'rifle';
    this.weapon = opts.weapon || (this.type === 'sniper' ? 'sniper' : this.type === 'jugg' ? 'lmg' : this.type === 'bomber' ? 'none' : 'ak47');
    const ws = ENEMY_WEAPONS[this.weapon] || ENEMY_WEAPONS.ak47;
    this.ws = ws;
    this.damage = ws.damage;
    this.burstMin = ws.burst[0]; this.burstMax = ws.burst[1];
    this.shotGap = ws.gap; this.coolK = ws.coolK;
    this.range = ws.range || ATTACK_RANGE;
    this.magSize = ws.mag;
    this.sightRange = this.type === 'sniper' ? 95 : 70;
    this.sizeK = this.type === 'jugg' ? 1.18 : 1;
    this.useCover = this.type === 'rifle' && !!(game.arena.coverSpots && game.arena.coverSpots.length);
    this.cover = null; this.coverCd = 1 + Math.random() * 2;
    this.perch = null; this.aimT = 0; this.aimLen = 1;
    this.beepT = 0; this.ledT = 0;
    this._mv = { x: 0, z: 0, s: 0, yaw: 0 };

    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    if (template) {
      const v = createGLBVisual();
      this.rig.add(v.root);
      this.mixer = v.mixer;
      this.actions = v.actions;
      this.muzzle = v.muzzle;
      if (!v.rifleOnModel) this.group.add(this.muzzle);
      this.handBone = v.rifleOnModel ? null : v.hand;
      v.root.traverse((o) => { if (!this.hipsBone && o.isBone && /hips|pelvis/i.test(o.name)) this.hipsBone = o; });
      this.yawGroup = v.yawGroup;
      this.full = template.full;
      this.parts = null;
      this.currentAction = null;
      if (this.armored || this.type === 'jugg') this._tintArmor(v.root, this.type === 'jugg' ? 0.32 : 0.6);
      if (this.type === 'bomber') this._tintArmor(v.root, 0.85, 0x9a6a50);
      this._playAction(this.actions.walk ? 'walk' : 'idle', 0);
    } else {
      const v = buildSoldier(this.armored);
      this.rig.add(v.root);
      this.parts = v.parts;
      this.muzzle = v.muzzle;
      this.actions = {};
      this.mixer = null;
      this.full = false;
    }

    // hitboxes (work for both GLB and procedural models)
    this.body = new THREE.Mesh(BODY_GEO, HITBOX_MAT);
    this.body.position.y = 0.76;
    this.body.userData = { enemy: this, part: 'body' };
    this.head = new THREE.Mesh(HEAD_GEO, HITBOX_MAT);
    this.standHeadY = template ? THREE.MathUtils.clamp(template.headY, 1.45, 1.85) : 1.7;
    this.head.position.y = this.standHeadY;
    this.head.userData = { enemy: this, part: 'head' };
    this.group.add(this.body, this.head);
    this.hitboxes = [this.body, this.head];
    if (this.type === 'jugg') this.group.scale.setScalar(this.sizeK);
    if (this.type === 'bomber') this._buildVest();
    if (this.type === 'sniper') {
      this.laser = new THREE.Mesh(LASER_GEO, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      this.laser.visible = false; this.laser.frustumCulled = false;
      game.scene.add(this.laser);
    }

    this.group.position.copy(opts.position);
    const p = game.player.position;
    this.yaw = Math.atan2(p.x - opts.position.x, p.z - opts.position.z);
    this.group.rotation.y = this.yaw;
    game.scene.add(this.group);
    this.group.updateMatrixWorld(true);

    this.vel = new THREE.Vector3();
    this.state = 'hunt';
    this.dead = false;
    this.removable = false;
    this.hasLOS = false;
    this.losTimer = Math.random() * 0.2;
    this.lostTimer = 0;
    this.reaction = 0;
    this.burstLeft = 0;
    this.shotTimer = 0;
    this.cooldown = 0.5;
    this.strafeTimer = 0;
    this.strafeDir = 0;
    this.avoidSide = 0;
    this.avoidTimer = 0;
    this.wanderTimer = 0;
    this.wanderDir = new THREE.Vector3();
    this.stuckTimer = 0;
    this.stuckRef = new THREE.Vector3().copy(opts.position);
    this.walkPhase = Math.random() * 6;
    this.stepTimer = 0;
    this.recoilAnim = 0;
    this.flinch = 0;
    this.fireAnimT = 0;
    this._steerOut = new THREE.Vector3();
    // combat extras
    this.mag = this.magSize;
    this.crouchPref = Math.random() < 0.35;      // this bot likes to kneel when it fights
    this.crouching = false;
    this.action = null;                          // one-shot: 'reload' | 'grenade' | 'hit'
    this.actionT = 0;
    this.actionLen = 0;
    this.grenadeReleased = false;
    this.grenadeCooldown = 6 + Math.random() * 8;
    this.lastSeen = new THREE.Vector3().copy(p);
    this.aimW = 0;
  }

  /** Explosive vest with a blinking LED (suicide bomber). */
  _buildVest() {
    const m = mats();
    const vest = new THREE.Group();
    vest.position.set(0, 1.18, 0.17);
    part(vest, 0.46, 0.36, 0.1, m.vest, 0, 0, 0);
    for (const x of [-0.15, -0.05, 0.05, 0.15]) part(vest, 0.07, 0.26, 0.07, new THREE.MeshStandardMaterial({ color: 0x9a3a1a, roughness: 0.7 }), x, 0, 0.07);
    part(vest, 0.42, 0.03, 0.04, new THREE.MeshStandardMaterial({ color: 0xd8c020, roughness: 0.5 }), 0, 0.08, 0.11);
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }));
    this.led.position.set(0.12, 0.12, 0.12);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff3020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    glow.scale.setScalar(0.16);
    this.led.add(glow);
    vest.add(this.led);
    this.group.add(vest);
  }

  _tintArmor(root, k = 0.6, tint = null) {
    const tc = tint !== null ? new THREE.Color(tint) : null;
    root.traverse((o) => {
      if (o.isMesh && o.material) {
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        const cl = arr.map((m) => { const c = m.clone(); if (c.color) { c.color.multiplyScalar(k); if (tc) c.color.multiply(tc); } return c; });
        o.material = Array.isArray(o.material) ? cl : cl[0];
      }
    });
  }

  // ---------------- animation helpers ----------------
  _playAction(name, fade = 0.2) {
    if (!this.mixer) return null;
    const a = this.actions[name];
    if (!a) return null;
    if (this.currentAction === a) return a;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.currentAction) this.currentAction.fadeOut(fade);
    this.currentAction = a;
    return a;
  }

  /** Start a one-shot clip (reload / grenade / hit) lasting `len` seconds. */
  _startAction(name, len) {
    this.action = name;
    this.actionT = 0;
    this.actionLen = len;
    this.grenadeReleased = false;
    if (this.mixer && this.actions[name]) {
      if (this.currentAction === this.actions[name]) this.currentAction = null;
      const a = this._playAction(name, name === 'hit' ? 0.08 : 0.15);
      if (a) a.timeScale = a.getClip().duration / len;
    }
  }

  _animate(dt, spd) {
    if (!this.mixer) return this._animateProcedural(dt, spd);
    if (this.full) this._animateFull(dt, spd);
    else {
      const aiming = this.state === 'attack' && spd < 2.2;
      if (aiming && this.actions.fire) this._playAction('fire');
      else if (spd > 0.5 && this.actions.walk) {
        this._playAction(spd > 3.8 ? 'run' : 'walk');
        if (this.currentAction) this.currentAction.timeScale = Math.max(0.7, Math.min(1.8, spd / 2.6));
      } else if (this.actions.idle) this._playAction('idle');
      if (this.currentAction && (this.currentAction === this.actions.fire || this.currentAction === this.actions.idle)) this.currentAction.timeScale = 1;
    }
    // rifle poses turn the body a little sideways: compensate so the gun points at the player
    let want;
    if (this.full && template.aimOffsets) {
      const key = this.currentAction ? this.currentAction.getClip().name : 'idle';
      want = template.aimOffsets[key] !== undefined ? template.aimOffsets[key] : (this.action ? this.aimW : 0);
    } else want = this.full || this.currentAction === this.actions.fire ? CFG.aimYawOffset : 0;
    this.aimW += (want - this.aimW) * (1 - Math.exp(-8 * dt));
    if (this.yawGroup) this.yawGroup.rotation.y = CFG.yaw + this.aimW;
    this.mixer.update(dt);
  }

  _animateFull(dt, spd) {
    if (this.action) return;   // a one-shot owns the body
    let key;
    if (spd > 0.5) {
      // pick the locomotion clip from the velocity in the bot's own frame
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const f = this.vel.x * fx + this.vel.z * fz;           // forward
      const s = -this.vel.x * fz + this.vel.z * fx;          // right (+) when facing +Z is -X
      if (Math.abs(f) >= Math.abs(s) * 0.8) key = f >= 0 ? (spd > 3.0 ? 'run' : 'walk') : 'walk_back';
      else key = s > 0 ? 'strafe_right' : 'strafe_left';
      const a = this._playAction(key, 0.22);
      const nat = (CFG.clipSpeed && CFG.clipSpeed[key]) || 2;
      if (a) a.timeScale = THREE.MathUtils.clamp(spd / nat, 0.6, 1.6);
    } else if (this.state === 'attack') {
      key = this.crouching && this.actions.crouch_fire ? 'crouch_fire' : (this.fireAnimT > 0 ? 'fire' : 'idle');
      const a = this._playAction(key, 0.18);
      if (a) a.timeScale = 1;
    } else {
      const a = this._playAction('idle', 0.25);
      if (a) a.timeScale = 1;
    }
  }

  _animateProcedural(dt, spd) {
    const P = this.parts;
    const amt = Math.min(1, spd / 2.5);
    this.walkPhase += dt * spd * 3.1;
    const sw = Math.sin(this.walkPhase) * 0.65 * amt;
    P.legL.rotation.x = sw;
    P.legR.rotation.x = -sw;
    const crouch = this.crouching ? 0.35 : 0;
    P.torso.position.y = 1.0 - crouch + Math.abs(Math.cos(this.walkPhase)) * 0.035 * amt;
    P.legL.position.y = P.legR.position.y = 0.92 - crouch;
    P.legL.rotation.x += crouch * 2.2; P.legR.rotation.x -= crouch * 0.6;
    this.recoilAnim = Math.max(0, this.recoilAnim - dt * 9);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    const reloadDip = this.action === 'reload' ? Math.sin(Math.min(1, this.actionT / this.actionLen) * Math.PI) * 0.6 : 0;
    P.upper.rotation.x = -this.recoilAnim * 0.12 + reloadDip;
    P.upper.position.z = -this.recoilAnim * 0.03;
    P.torso.rotation.x = -this.flinch * 0.3;
    P.torso.rotation.y = (this.state === 'attack' ? 0.15 : 0);
  }

  _setCrouch(on) {
    if (this.crouching === on) return;
    this.crouching = on;
    // smaller target when kneeling
    this.body.scale.y = on ? 0.68 : 1;
    this.body.position.y = on ? 0.52 : 0.76;
    this.head.position.y = on ? this.standHeadY - 0.62 : this.standHeadY;
  }

  // ---------------- AI ----------------
  _steer(dirX, dirZ, dt) {
    const pos = this.group.position, arena = this.game.arena;
    this.avoidTimer -= dt;
    if (this.wanderTimer > 0) { this.wanderTimer -= dt; return this.wanderDir; }
    const look = 1.7;
    const angles = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.4, -2.4];
    const side = this.avoidSide || (Math.random() < 0.5 ? 1 : -1);
    for (const a0 of angles) {
      const a = a0 * side;
      const c = Math.cos(a), s = Math.sin(a);
      const x = dirX * c - dirZ * s, z = dirX * s + dirZ * c;
      if (!arena.isBlocked(pos.x + x * look, pos.z + z * look, 0.5) &&
          !arena.isBlocked(pos.x + x * look * 0.5, pos.z + z * look * 0.5, 0.5)) {
        if (a0 !== 0) { this.avoidSide = side; this.avoidTimer = 1.2; }
        else if (this.avoidTimer <= 0) this.avoidSide = 0;
        return this._steerOut.set(x, 0, z);
      }
    }
    return this._steerOut.set(dirX, 0, dirZ);
  }

  /** Is there something to stand on at (x,z) on this enemy's level? (don't strafe off balconies) */
  _hasFloor(x, z) {
    const y = this.group.position.y;
    if (y < 0.3) return true;
    const h = this.game.house;
    return !!h && h.groundAt(x, z, y, 0.2) > y - 0.6;
  }

  /**
   * House navigation: when the player is on another level (or either of us is inside / on
   * the house), follow an A* path over the nav grid. Returns a unit direction or null.
   */
  _navDir(dt, dist) {
    const h = this.game.house, pos = this.group.position, pp = this.game.player.position;
    if (!h || !h.navNodes) return null;
    const dy = Math.abs(pp.y - pos.y);
    const city = this.game.arena.mode === 'city';
    if (city) {
      // whole map is navmesh: go straight when we can see the player on our level
      if (this.hasLOS && dy < 1.2) { this.path = null; return null; }
    } else {
      const meIn = h.inside(pos.x, pos.z, 0.8), heIn = h.inside(pp.x, pp.z, 0.8);
      if (dy < 1.2 && !meIn && !heIn) { this.path = null; return null; }
    }
    if (!h.inNav(pos.x, pos.z)) { this.path = null; return null; }   // walk in normally first
    this.pathTimer = (this.pathTimer || 0) - dt;
    if (!this.path || this.pathTimer <= 0 || this.pathIdx >= this.path.length) {
      this.pathTimer = city ? 1.2 + Math.random() * 0.8 : 0.9 + Math.random() * 0.4;
      this.path = h.findPath(pos, pp);
      this.pathIdx = this.path && this.path.length > 1 ? 1 : 0;
    }
    if (!this.path) return null;
    let wp = this.path[this.pathIdx];
    while (wp && Math.hypot(wp.x - pos.x, wp.z - pos.z) < 0.35 && Math.abs(wp.y - pos.y) < 0.7) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    if (!wp) return null;
    const dx = wp.x - pos.x, dz = wp.z - pos.z, l = Math.hypot(dx, dz) || 1;
    this.stuckTimer = 0;
    return this._steerOut.set(dx / l, 0, dz / l);
  }

  // ---------------- cover (bridge wrecks) ----------------
  /** Pick a free cover spot behind a wreck that puts the car between us and the player. */
  _pickCover() {
    const spots = this.game.arena.coverSpots;
    if (!spots || !spots.length) return false;
    const pos = this.group.position, pp = this.game.player.position;
    let best = null, bs = 1e9;
    // late-stage hostiles push hard toward Sector A: closer cover, shorter holds
    const push = this.cfg.push || 0, ideal = 15 - 7 * push;
    for (const s of spots) {
      if (s.taken && s.taken !== this && !s.taken.dead) continue;
      const de = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (de > 13) continue;
      const pdx = pp.x - s.x, pdz = pp.z - s.z, pd = Math.hypot(pdx, pdz) || 1;
      if (pd < 8 || pd > 34 || s.z < pp.z + 5) continue;
      if ((s.nx * pdx + s.nz * pdz) / pd > -0.35) continue;          // wreck must shield us from the player
      const score = de * 0.7 + Math.abs(pd - ideal) * 0.6 + (s.z > pos.z + 1 ? 4 : 0) + Math.random() * 2;
      if (score < bs) { bs = score; best = s; }
    }
    if (!best) return false;
    best.taken = this;
    this.cover = { spot: best, t: 0, hold: (5 + Math.random() * 7) * (1 - 0.5 * push), arrived: false };
    return true;
  }

  _leaveCover(cd = 2.5) {
    if (this.cover) { if (this.cover.spot.taken === this) this.cover.spot.taken = null; this.cover = null; }
    this.coverCd = cd + Math.random() * 2;
  }

  // ---------------- AI ----------------
  update(dt) {
    if (this.dead) { this._updateDead(dt); return; }
    const g = this.game, p = g.player, pos = this.group.position;
    const dx = p.position.x - pos.x, dz = p.position.z - pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;

    // line of sight (throttled). Behind cover we test from standing height: "can I pop up and shoot?"
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.18 + Math.random() * 0.12;
      const peek = (this.cover && this.cover.arrived) || (this.perch && this.perch.arrived);
      _eye.set(pos.x, pos.y + (this.crouching && !peek ? 1.0 : 1.6) * this.sizeK, pos.z);
      _target.set(p.position.x, p.position.y + p.eye * 0.92, p.position.z);
      this.hasLOS = dist < this.sightRange && g.checkLOS(_eye, _target);
    }
    if (this.hasLOS) { this.lostTimer = 0; this.lastSeen.copy(p.position); } else this.lostTimer += dt;
    this.fireAnimT = Math.max(0, this.fireAnimT - dt);
    this.grenadeCooldown -= dt;

    if (this.action) this._updateAction(dt, dist);

    const mv = this._mv;
    mv.x = 0; mv.z = 0; mv.s = 0; mv.yaw = Math.atan2(dx, dz);
    if (this.type === 'bomber') { if (this._thinkBomber(dt, dist, nx, nz, mv)) return; }
    else if (this.type === 'sniper') this._thinkSniper(dt, dist, nx, nz, mv);
    else this._thinkSoldier(dt, dist, nx, nz, dx, dz, mv);

    this.yaw = lerpAngle(this.yaw, mv.yaw, 1 - Math.exp(-(this.state === 'attack' ? 10 : 6) * dt));
    this.group.rotation.y = this.yaw;

    const a = 1 - Math.exp(-8 * dt);
    this.vel.x += (mv.x * mv.s - this.vel.x) * a;
    this.vel.z += (mv.z * mv.s - this.vel.z) * a;
    pos.x += this.vel.x * dt;
    pos.z += this.vel.z * dt;

    for (const o of g.waveManager.enemies) {
      if (o === this || o.dead || Math.abs(o.group.position.y - pos.y) > 1.5) continue;
      const ox = pos.x - o.group.position.x, oz = pos.z - o.group.position.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.9 - d) * 0.5 / d; pos.x += ox * push; pos.z += oz * push; }
    }
    if (dist < 0.9 && Math.abs(p.position.y - pos.y) < 1.5) { pos.x -= nx * (0.9 - dist); pos.z -= nz * (0.9 - dist); }
    const ground = g.arena.resolveCircle(pos, 0.4, pos.y);
    if (ground >= pos.y - 0.7 && (this.vy || 0) <= 0) { pos.y = ground; this.vy = 0; }   // steps / stairs
    else { this.vy = (this.vy || 0) - 18 * dt; pos.y = Math.max(ground, pos.y + this.vy * dt); if (pos.y === ground) this.vy = 0; }

    const spd = Math.hypot(this.vel.x, this.vel.z);
    this._animate(dt, spd);
    this.group.updateMatrixWorld(true);
    if (this.laser) this._updateLaser();

    if (spd > 1) {
      this.stepTimer -= dt * (spd / 3.5);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.36;
        if (dist < 30) g.audio.footstep(pos, this.type === 'jugg' ? 0.6 : 0.35);
      }
    }
  }

  /** Tactical sprint down the bridge while far away (and unseen, or very far): endless mode only. */
  _sprintSpeed(dist) {
    const k = this.cfg.sprintK || 1;
    return k > 1 && dist > 30 && (!this.hasLOS || dist > 50) ? this.speed * k : this.speed;
  }

  /** Path toward the player: house nav, else probe steering + stuck recovery. Writes into mv. */
  _huntMove(dt, dist, nx, nz, dx, dz, mv, speed) {
    const p = this.game.player, pos = this.group.position;
    this._setCrouch(false);
    const nav = this._navDir(dt, dist);
    const d = nav || this._steer(nx, nz, dt);
    if (dist > 1.8 || Math.abs(p.position.y - pos.y) > 1.2) { mv.x = d.x; mv.z = d.z; mv.s = speed; }
    mv.yaw = mv.s > 0 ? Math.atan2(mv.x, mv.z) : Math.atan2(dx, dz);
    this.stuckTimer += dt;
    if (this.stuckTimer > 1.5) {
      if (pos.distanceTo(this.stuckRef) < 0.5 && dist > 3) {
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.set(Math.cos(a), 0, Math.sin(a));
        this.wanderTimer = 0.9;
        this.avoidSide = -this.avoidSide || 1;
      }
      this.stuckTimer = 0;
      this.stuckRef.copy(pos);
    }
  }

  /** Move to (x,z) with obstacle steering; returns the remaining distance. */
  _moveTo(x, z, dt, mv, speed) {
    const pos = this.group.position;
    const cx = x - pos.x, cz = z - pos.z, cd = Math.hypot(cx, cz) || 1e-6;
    if (cd > 0.35) {
      const d = cd > 1.6 ? this._steer(cx / cd, cz / cd, dt) : this._steerOut.set(cx / cd, 0, cz / cd);
      mv.x = d.x; mv.z = d.z; mv.s = cd > 1.6 ? speed : Math.max(1.2, speed * 0.5);
      mv.yaw = Math.atan2(mv.x, mv.z);
    }
    return cd;
  }

  _thinkSoldier(dt, dist, nx, nz, dx, dz, mv) {
    const g = this.game, p = g.player, pos = this.group.position;
    // state transitions
    if (this.state === 'hunt') {
      if (this.hasLOS && dist < this.range) {
        this.state = 'attack';
        this.reaction = this.cfg.reaction * (0.7 + Math.random() * 0.6);
        this.burstLeft = 0;
        this.cooldown = 0;
      }
    } else if (this.lostTimer > (this.cover ? 2.5 : 0.9) || dist > this.range + 4) {
      this.state = 'hunt';
      this._leaveCover(1);
    }

    // grenade: the player has been hiding from this bot for a while and is in throwing range
    if (this.type === 'rifle' && !this.action && this.grenadeCooldown <= 0 && this.lostTimer > 2.2 && dist > 7 && dist < 28 &&
        g.waveManager.canThrowGrenade()) {
      this.grenadeCooldown = 12 + Math.random() * 10;
      g.waveManager.noteGrenade();
      this._setCrouch(false);
      this._startAction('grenade', this.full ? 2.0 : 0.9);
    }
    // tactical reload while out of sight (or tucked behind a car)
    if (!this.action && this.mag < this.magSize * 0.5 && (this.lostTimer > 1.5 || (this.cover && this.cover.arrived && !this.burstLeft))) this._startAction('reload', 2.4);

    if (this.action) {
      mv.yaw = Math.atan2(this.lastSeen.x - pos.x, this.lastSeen.z - pos.z);
      return;
    }
    if (this.state === 'hunt') { this._huntMove(dt, dist, nx, nz, dx, dz, mv, this._sprintSpeed(dist)); return; }

    mv.yaw = Math.atan2(dx, dz);
    // ---- use the wrecks as cover (bridge) ----
    if (this.useCover) {
      this.coverCd -= dt;
      if (!this.cover && this.coverCd <= 0) { this.coverCd = 1.2 + Math.random(); this._pickCover(); }
      if (this.cover) {
        const c = this.cover.spot;
        this.cover.t += dt;
        const pdx = p.position.x - c.x, pdz = p.position.z - c.z, pd = Math.hypot(pdx, pdz) || 1;
        const protects = (c.nx * pdx + c.nz * pdz) / pd < -0.2;
        if (!protects || pd < 6 || this.cover.t > this.cover.hold || (!this.cover.arrived && this.cover.t > 6)) {
          this._leaveCover();
        } else {
          const cd = this._moveTo(c.x, c.z, dt, mv, cdist(c, pos) > 6 ? this._sprintSpeed(30) : this.speed);
          if (!this.cover.arrived && cd < 0.5) this.cover.arrived = true;
          if (this.cover.arrived) {
            // tucked in behind the car; pop up only to shoot
            const popped = this.burstLeft > 0 || g.waveManager.hasFireToken(this);
            this._setCrouch(!popped && mv.s === 0);
            if (cd < 0.35) mv.s = 0;
            mv.yaw = Math.atan2(dx, dz);
          }
          if (this.cover.arrived || this.hasLOS) this._updateCombat(dt, dist);
          return;
        }
      }
    }

    // ---- open-ground fighting: strafe, close in / back off ----
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 0.8 + Math.random() * 1.6;
      this.strafeDir = Math.random() < 0.35 ? 0 : (Math.random() < 0.5 ? -1 : 1);
      if (this.crouchPref) this.strafeDir = Math.random() < 0.75 ? 0 : this.strafeDir;
    }
    const waiting = !g.waveManager.hasFireToken(this) && this.type !== 'jugg';
    if (waiting && this.strafeDir === 0) this.strafeDir = Math.random() < 0.5 ? -1 : 1;   // flank while waiting to shoot
    let sx = -nz * this.strafeDir, sz = nx * this.strafeDir;
    const push = this.cfg.push || 0;
    const fwdAmt = this.type === 'jugg' ? (dist > 7 ? 0.9 : 0) : dist > 16 - 6 * push ? 0.6 : dist < 6 ? -0.5 : (waiting && dist > 11 - 4 * push ? 0.35 + 0.3 * push : 0);
    if (this.type === 'jugg') { sx *= 0.3; sz *= 0.3; }
    sx += nx * fwdAmt; sz += nz * fwdAmt;
    const l = Math.hypot(sx, sz);
    if (l > 0.01) {
      sx /= l; sz /= l;
      if (!g.arena.isBlocked(pos.x + sx, pos.z + sz, 0.45, pos.y) && this._hasFloor(pos.x + sx, pos.z + sz)) {
        mv.x = sx; mv.z = sz; mv.s = this.type === 'jugg' ? this.speed : this.speed * (waiting ? 0.65 : 0.4);
      } else this.strafeDir *= -1;
    }
    this._setCrouch(this.crouchPref && l <= 0.01 && this.type !== 'jugg');
    this._updateCombat(dt, dist);
  }

  /** Suicide bomber: sprint at the player, beeping faster as he closes in, detonate at arm's length. */
  _thinkBomber(dt, dist, nx, nz, mv) {
    const p = this.game.player, pos = this.group.position;
    this.state = 'hunt';
    this.beepT -= dt;
    const rate = dist < 7 ? 0.11 : dist < 18 ? 0.26 : 0.55;
    if (this.beepT <= 0) {
      this.beepT = rate;
      this.game.audio.bomberBeep(pos, p.position);
      this.ledOn = true; this.ledT = 0.05;
    }
    this.ledT -= dt;
    if (this.led) this.led.visible = this.ledT > 0 || rate < 0.15;
    if (dist < 2.3 && Math.abs(p.position.y - pos.y) < 1.6) { this.detonate(); return true; }
    if (this.action === 'hit') return false;       // staggered by a hit
    this._huntMove(dt, dist, nx, nz, p.position.x - pos.x, p.position.z - pos.z, mv, this.speed);
    return false;
  }

  /** Sniper: settle behind a far wreck, paint the player with a laser, then one heavy shot. */
  _thinkSniper(dt, dist, nx, nz, mv) {
    const g = this.game, p = g.player, pos = this.group.position;
    this.state = this.hasLOS ? 'attack' : 'hunt';
    if (!this.perch || (this.perch.arrived && this.lostTimer > 7)) {
      if (this.perch && this.perch.spot) this.perch.spot.taken = null;
      let best = null, bs = -1e9;
      for (const s of g.arena.coverSpots || []) {
        if (s.taken && s.taken !== this && !s.taken.dead) continue;
        const pd = s.z - p.position.z;
        if (pd < 26 || pd > 62) continue;
        const pdx = p.position.x - s.x, pdz = p.position.z - s.z, l = Math.hypot(pdx, pdz) || 1;
        if ((s.nx * pdx + s.nz * pdz) / l > -0.2) continue;
        const score = pd * 0.15 - Math.hypot(s.x - pos.x, s.z - pos.z) * 0.2 + Math.random() * 3;
        if (score > bs) { bs = score; best = s; }
      }
      if (best) best.taken = this;
      this.perch = best ? { spot: best, x: best.x, z: best.z, arrived: false } : { x: pos.x, z: Math.min(pos.z, g.arena.bounds.maxZ - 8), arrived: false };
      this.lostTimer = 0;
    }
    const P = this.perch;
    if (!P.arrived) {
      const cd = this._moveTo(P.x, P.z, dt, mv, this.speed);
      // give up on a perch we can't reach: hold wherever we are (still far from the player)
      P.t = (P.t || 0) + dt;
      if (P.best === undefined || cd < P.best - 0.4) { P.best = cd; P.prog = 0; } else P.prog = (P.prog || 0) + dt;
      if (cd < 0.5 || P.t > 9 || P.prog > 2.5) {
        P.arrived = true;
        if (cd >= 0.5) { if (P.spot) P.spot.taken = null; P.spot = null; P.x = pos.x; P.z = pos.z; }
      }
      this._setCrouch(false);
      this._laserOn(false);
      return;
    }
    mv.yaw = Math.atan2(p.position.x - pos.x, p.position.z - pos.z);
    this.cooldown -= dt;
    if (this.action) { this._laserOn(false); this.aimT = 0; return; }
    if (this.aimT > 0) {
      this.aimT -= dt;
      this._setCrouch(false);
      this._laserOn(true, 1 - this.aimT / this.aimLen);
      if (!this.hasLOS) { this.aimT = 0; this._laserOn(false); this.cooldown = 0.8; }
      else if (this.aimT <= 0) {
        this._laserOn(false);
        this._shoot(dist, { sniper: true });
        this.cooldown = 2.6 + Math.random() * 1.8;
      }
      return;
    }
    this._setCrouch(true);
    if (this.hasLOS && this.cooldown <= 0 && dist < this.range) { this.aimLen = this.aimT = 1.25 + Math.random() * 0.4; }
  }

  _laserOn(on, k = 0) {
    if (!this.laser) return;
    this.laser.visible = on;
    this.laserK = k;
  }

  _updateLaser() {
    const L = this.laser;
    if (!L.visible) return;
    const p = this.game.player;
    this.muzzle.getWorldPosition(_muz);
    _target.set(p.position.x, p.position.y + p.eye * 0.85, p.position.z);
    _dir.subVectors(_target, _muz);
    const len = _dir.length();
    L.position.copy(_muz).addScaledVector(_dir, 0.5);
    L.scale.set(1, 1, len);
    L.quaternion.setFromUnitVectors(_zAxis, _dir.divideScalar(len));
    L.material.opacity = 0.25 + 0.6 * this.laserK + (this.laserK > 0.75 ? Math.random() * 0.2 : 0);
  }

  detonate() {
    if (this.dead) return;
    this.exploded = true;
    this.die(false, 'self');
  }

  _updateAction(dt, dist) {
    this.actionT += dt;
    const t = this.actionT / this.actionLen;
    if (this.action === 'grenade' && !this.grenadeReleased && t >= 0.55) {
      this.grenadeReleased = true;
      this.group.updateMatrixWorld(true);
      const from = this.muzzle.getWorldPosition(V3());
      from.y = Math.max(from.y, 1.5);
      this.game.waveManager.throwGrenade(from, this.lastSeen, this);
    }
    if (this.action === 'reload' && t >= 0.85) this.mag = this.magSize;
    if (t >= 1) {
      if (this.action === 'reload') this.mag = this.magSize;
      this.action = null;
      if (this.state === 'attack') { this.burstLeft = 0; this.cooldown = 0.2 + Math.random() * 0.3; }
    }
  }

  _updateCombat(dt, dist) {
    if (this.action) return;
    if (this.reaction > 0) { this.reaction -= dt; return; }
    if (!this.hasLOS) return;
    if (this.mag <= 0) { this._startAction('reload', 2.4); return; }
    const W = this.game.waveManager;
    if (this.burstLeft > 0) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        this._shoot(dist, { forceMiss: this.suppress });
        this.burstLeft--;
        this.shotTimer = this.shotGap * (1 + Math.random() * 0.3);
      }
      if (this.burstLeft <= 0) { W.releaseFireToken(this); this.suppress = false; }
    } else {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        // combat tokens: at most a few bots shoot at the player at the same time; the rest reposition
        // (juggernauts don't wait their turn). Later tiers lay down suppressing fire while they wait.
        if (this.type !== 'jugg' && !W.takeFireToken(this)) {
          if ((W.tier || 0) >= 2 && dist > 9 && Math.random() < 0.4) {
            this.suppress = true;
            this.burstLeft = Math.min(this.mag, 3 + Math.floor(Math.random() * 4));
            this.shotTimer = 0;
            this.cooldown = this.cfg.burstCooldown * (1 + Math.random());
            return;
          }
          this.cooldown = 0.25 + Math.random() * 0.35;
          return;
        }
        this.suppress = false;
        this.burstLeft = Math.min(this.mag, this.burstMin + Math.floor(Math.random() * (this.burstMax - this.burstMin + 1)));
        this.cooldown = this.cfg.burstCooldown * this.coolK * (0.7 + Math.random() * 0.6);
        this.shotTimer = this.cover && this.cover.arrived ? 0.35 : 0;      // pop up from behind the car first
      }
    }
  }

  _shoot(dist, opts = {}) {
    const g = this.game, p = g.player;
    if (this.handBone) {
      this.handBone.getWorldPosition(_muz);
      _muz.x += Math.sin(this.yaw) * CFG.muzzleForward;
      _muz.z += Math.cos(this.yaw) * CFG.muzzleForward;
      _muz.y += 0.03;
    } else this.muzzle.getWorldPosition(_muz);
    _target.set(p.position.x, p.position.y + p.eye * 0.75, p.position.z);

    let chance = opts.sniper
      ? this.accuracy * THREE.MathUtils.clamp(1.3 - dist / 90, 0.5, 1.1)
      : this.accuracy * THREE.MathUtils.clamp(1.25 - dist / 28, 0.35, 1.15);
    const pv = p.speed2D;
    if (p.sprinting) chance *= 0.55; else if (pv > 4) chance *= 0.75;
    if (p.crouching) chance *= 0.8;
    if (!p.grounded) chance *= 0.7;
    const hit = !opts.forceMiss && Math.random() < chance;

    if (!hit) {
      const ang = Math.random() * Math.PI * 2, off = opts.forceMiss ? 0.35 + Math.random() * 1.0 : 0.6 + Math.random() * 1.4;
      const ddx = p.position.x - _muz.x, ddz = p.position.z - _muz.z, l = Math.hypot(ddx, ddz) || 1;
      _target.x += (-ddz / l) * Math.cos(ang) * off;
      _target.z += (ddx / l) * Math.cos(ang) * off;
      _target.y += Math.sin(ang) * off * 0.6;
      if (dist > 6 && Math.random() < (opts.forceMiss ? 0.6 : 0.35)) g.audio.whiz(opts.sniper);
    }

    _dir.subVectors(_target, _muz);
    const len = _dir.length();
    _dir.divideScalar(len);

    const block = g.raycastWorld(_muz, _dir, hit ? Math.max(0.1, len - 0.3) : 150);
    if (block) {
      _end.copy(block.point);
      const n = block.face && block.instanceId === undefined ? _v1.copy(block.face.normal).transformDirection(block.object.matrixWorld) : _v1.copy(_dir).negate();
      g.effects.spawnImpact(block.point, n, block.object.userData.surface);
      if (block.object.userData.surface === 'metal' && block.distance < 40) g.audio.ricochet(block.point);
    } else if (hit) {
      _end.copy(_target);
      p.takeDamage(this.damage, this.group.position);
    } else {
      _end.copy(_muz).addScaledVector(_dir, 150);
    }

    if (opts.sniper) {
      g.effects.spawnTracer(_muz, _end, 0xff5a4a, 520);
      g.effects.enemyMuzzleFlash(_muz, 1.6);
      g.audio.enemyShot(_muz, 'sniper');
    } else {
      g.effects.spawnTracer(_muz, _end, 0xffa040, 260);
      g.effects.enemyMuzzleFlash(_muz);
      g.audio.enemyShot(_muz, this.weapon);
    }
    this.recoilAnim = 1;
    this.fireAnimT = 0.3;
    this.mag--;
  }

  /** `source` = 'player' (default) or 'grenade' (no score for the player). */
  takeDamage(amount, part, point, dir, source = 'player') {
    if (this.dead) return null;
    const headshot = part === 'head';
    let dmg = amount;
    if (this.armored && !headshot) dmg *= 0.6;
    if (this.type === 'jugg' && headshot) dmg *= 0.5;        // ballistic helmet
    this.health -= dmg;
    this.flinch = 1;
    if (point) {
      const d = dir || _v2.set(0, 1, 0);
      const fx = this.game.effects;
      fx.spawnBloodHit(point, d, headshot, this.health <= 0);
      if (this.type === 'jugg' && !headshot) fx.spawnImpact(point, _v1.copy(d).negate(), 'metal');   // armour plates spark
      // exit splatter on whatever is behind the target (wall, cover, floor)
      if (dir) {
        const hit = this.game.raycastWorld(_v1.copy(point).addScaledVector(d, 0.3), d, 3.2);
        if (hit) {
          const n = hit.face && hit.instanceId === undefined ? _end.copy(hit.face.normal).transformDirection(hit.object.matrixWorld) : _end.copy(d).negate();
          fx.addBloodSplat(hit.point, n, headshot ? 0.95 : 0.65);
        } else if (Math.random() < 0.6) {
          const fp = _v1.copy(point).addScaledVector(d, 0.8 + Math.random() * 1.2); fp.y = this.game.arena.floorAt(fp.x, fp.z, this.group.position.y) + 0.005;
          fx.addBloodSplat(fp, _end.set(0, 1, 0), 0.45);
        }
      }
    }
    if (this.state === 'attack') this.reaction = Math.min(this.reaction, 0.15);
    if (source === 'player') this.lastSeen.copy(this.game.player.position);
    if (this.health <= 0) {
      this.die(headshot, source);
      return { killed: true, headshot, damage: dmg };
    }
    // flinch: interrupts shooting (and a reload); a grenade already thrown keeps going
    const canFlinch = (this.action !== 'grenade' || this.grenadeReleased) && (this.type !== 'jugg' || dmg >= 120);
    if (canFlinch && (this.action !== 'hit' || this.actionT > 0.25) && (dmg >= 25 || Math.random() < 0.5)) {
      this._startAction('hit', this.type === 'bomber' ? 0.35 : 0.75);
      this.burstLeft = 0;
      this.aimT = 0;
    }
    return { killed: false, headshot, damage: dmg };
  }

  die(headshot, source = 'player') {
    this.dead = true;
    this.deadTimer = 0;
    this.action = null;
    this._leaveCover();
    if (this.perch && this.perch.spot) this.perch.spot.taken = null;
    if (this.laser) this.laser.visible = false;
    this.fallSign = Math.random() < 0.7 ? -1 : 1;
    if (this.mixer) {
      const pick = headshot && this.actions.death2 ? 'death2'
        : ['death1', 'death3', 'death2'].filter((k) => this.actions[k])[Math.floor(Math.random() * 2)] || 'death1';
      this.deathKey = this.actions[pick] ? pick : (this.actions.death1 ? 'death1' : null);
      if (this.deathKey) {
        if (this.currentAction === this.actions[this.deathKey]) this.currentAction = null;
        const a = this._playAction(this.deathKey, 0.1);
        if (a) a.timeScale = 1.15;
      }
    }
    this.game.waveManager.onEnemyKilled(this, headshot, source);
    if (this.type === 'bomber') {
      // the vest goes off whether he reached you or you shot him (chain reactions credit the player)
      this.game.waveManager.bomberBlast(this, source === 'player' || source === 'playerGrenade');
      this.rig.visible = false;
      this.removableAt = 0.15;
      return;
    }
    this.poolPending = 0.9 + Math.random() * 0.5;   // blood pool once the body is down
  }

  _updateDead(dt) {
    this.deadTimer += dt;
    if (this.removableAt !== undefined) { if (this.deadTimer > this.removableAt) this.removable = true; return; }
    if (this.poolPending !== undefined && this.deadTimer >= this.poolPending) {
      this.poolPending = undefined;
      let p = this.group.position;
      if (this.hipsBone) p = this.hipsBone.getWorldPosition(_v1);
      this.game.effects.addBloodPool(p, 1.2 + Math.random() * 0.5, this.group.position.y);
    }
    if (this.mixer && this.deathKey) {
      this.mixer.update(dt);
    } else {
      const t = Math.min(1, this.deadTimer / 0.55);
      const e = t * t;
      this.rig.rotation.x = this.fallSign * (Math.PI / 2) * e;
      this.rig.position.y = 0.13 * e;
      if (this.mixer) this.mixer.update(dt * Math.max(0, 1 - t));
    }
    if (this.deadTimer > 7) this.rig.position.y -= dt * 0.25;
    if (this.deadTimer > 9.5) this.removable = true;
  }

  dispose() {
    this._leaveCover();
    if (this.perch && this.perch.spot) this.perch.spot.taken = null;
    this.game.scene.remove(this.group);
    if (this.laser) { this.game.scene.remove(this.laser); this.laser.material.dispose(); }
    if (this.mixer) this.mixer.stopAllAction();
  }
}
