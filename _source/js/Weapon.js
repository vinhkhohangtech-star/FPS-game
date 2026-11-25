// =========================================================
// Weapon — viewmodel + gunplay
//  * viewmodel lives in its own scene/camera, rendered after a depth clear,
//    so it never clips into walls
//  * ADS (150 ms lerp, FOV 75 -> 58, zero spread, iron-sight alignment)
//  * AUTO / SEMI (AK-47 600 RPM), hitscan raycast + tracer streaks
//  * muzzle flash planes + dynamic point light
//  * spring-damper procedural recoil + camera climb with recovery
//  * 3-stage reload (tilt -> mag swap -> charging handle) synced with the reload sound
//  * GLB viewmodel (FPS_AK-74m_animations.glb): aligned to its Head_Cam bone,
//    AnimationMixer drives Idle / Walk / Run / Shot / Reload / Draw clips,
//    ADS transform computed from the model's own rear-sight & front-post positions
// =========================================================
import * as THREE from 'three';

export const WEAPON_DEFS = {
  ak47: {
    id: 'ak47', name: 'AK-47', shortName: 'AK-47',
    magSize: 30, reserveMax: 180, damage: 30, headMult: 2.0, rpm: 600,
    modes: ['auto', 'semi'], reloadTime: 2.0,
    hipSpread: 0.028, moveSpread: 0.03, bloomPerShot: 0.005, maxBloom: 0.045,
    recoilPitch: 0.0105, recoilYaw: 0.0045, kickZ: 0.045, kickRot: 0.05,
    soundRate: 1.0, volume: 0.9, pickupAmmo: 60, flashScale: 1.0,
  },
  deagle: {
    id: 'deagle', name: 'DESERT EAGLE', shortName: 'DEAGLE',
    magSize: 7, reserveMax: 42, damage: 75, headMult: 2.0, rpm: 220,
    modes: ['semi'], reloadTime: 1.6,
    hipSpread: 0.02, moveSpread: 0.03, bloomPerShot: 0.02, maxBloom: 0.05,
    recoilPitch: 0.035, recoilYaw: 0.008, kickZ: 0.07, kickRot: 0.16,
    soundRate: 0.78, volume: 1.0, pickupAmmo: 14, flashScale: 0.8,
  },
  // ---- Armory weapons (animated arms + gun .glb, loaded on demand) ----
  usp45: {
    id: 'usp45', name: 'USP .45', shortName: 'USP .45', slot: 'secondary', cls: 'PISTOL', price: 500, glb: true,
    desc: '12-round .45 sidearm — reliable backup',
    magSize: 12, reserveMax: 96, damage: 40, headMult: 2.0, rpm: 400, modes: ['semi'], reloadTime: 1.7, reloadEmptyTime: 2.1,
    hipSpread: 0.02, moveSpread: 0.025, bloomPerShot: 0.012, maxBloom: 0.04,
    recoilPitch: 0.02, recoilYaw: 0.006, kickZ: 0.05, kickRot: 0.1, soundRate: 1.15, volume: 0.85, pickupAmmo: 24, flashScale: 0.6, drawTime: 0.5,
  },
  m9: {
    id: 'm9', name: 'M9', shortName: 'M9', slot: 'secondary', cls: 'PISTOL', price: 750, glb: true,
    desc: '15-round 9mm pistol with real aim-down-sight pose',
    magSize: 15, reserveMax: 120, damage: 34, headMult: 2.2, rpm: 450, modes: ['semi'], reloadTime: 1.8,
    hipSpread: 0.018, moveSpread: 0.022, bloomPerShot: 0.01, maxBloom: 0.035,
    recoilPitch: 0.016, recoilYaw: 0.005, kickZ: 0.04, kickRot: 0.08, soundRate: 1.2, volume: 0.8, pickupAmmo: 30, flashScale: 0.55, drawTime: 0.55,
  },
  mp9: {
    id: 'mp9', name: 'MP9 (RED DOT)', shortName: 'MP9', slot: 'primary', cls: 'SMG', price: 1500, glb: true,
    desc: 'Machine pistol, 900 RPM, red-dot sight',
    magSize: 30, reserveMax: 240, damage: 21, headMult: 2.0, rpm: 900, modes: ['auto', 'semi'], reloadTime: 2.0, reloadEmptyTime: 2.3,
    hipSpread: 0.03, moveSpread: 0.02, bloomPerShot: 0.004, maxBloom: 0.04,
    recoilPitch: 0.0065, recoilYaw: 0.004, kickZ: 0.03, kickRot: 0.03, soundRate: 1.3, volume: 0.75, pickupAmmo: 60, flashScale: 0.7, drawTime: 0.5,
  },
  ump45: {
    id: 'ump45', name: 'UMP45', shortName: 'UMP45', slot: 'primary', cls: 'SMG', price: 1750, glb: true,
    desc: 'Hard-hitting .45 SMG, 600 RPM',
    magSize: 25, reserveMax: 200, damage: 30, headMult: 2.0, rpm: 620, modes: ['auto', 'semi'], reloadTime: 2.2, reloadEmptyTime: 2.5,
    hipSpread: 0.026, moveSpread: 0.02, bloomPerShot: 0.004, maxBloom: 0.04,
    recoilPitch: 0.0085, recoilYaw: 0.004, kickZ: 0.035, kickRot: 0.035, soundRate: 1.15, volume: 0.8, pickupAmmo: 50, flashScale: 0.75, drawTime: 0.6,
  },
  saps12: {
    id: 'saps12', name: 'SAPS-12', shortName: 'SAPS-12', slot: 'primary', cls: 'SHOTGUN', price: 2000, glb: true,
    desc: 'Semi-auto shotgun, 8 pellets per shell — devastating up close',
    magSize: 8, reserveMax: 48, damage: 20, pellets: 8, pelletSpread: 0.055, headMult: 1.5, rpm: 220, modes: ['semi'], reloadTime: 2.6,
    hipSpread: 0.0, moveSpread: 0.0, bloomPerShot: 0, maxBloom: 0, fireAnim: 0.45,
    recoilPitch: 0.04, recoilYaw: 0.01, kickZ: 0.08, kickRot: 0.12, soundRate: 0.62, volume: 1.0, pickupAmmo: 12, flashScale: 1.3, drawTime: 0.6,
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1', shortName: 'M4A1', slot: 'primary', cls: 'ASSAULT RIFLE', price: 2250, glb: true,
    desc: '5.56 assault rifle, iron sights, 750 RPM',
    magSize: 30, reserveMax: 210, damage: 30, headMult: 2.0, rpm: 750, modes: ['auto', 'semi'], reloadTime: 2.4, reloadEmptyTime: 2.9,
    hipSpread: 0.026, moveSpread: 0.028, bloomPerShot: 0.004, maxBloom: 0.04,
    recoilPitch: 0.0085, recoilYaw: 0.004, kickZ: 0.035, kickRot: 0.035, soundRate: 1.08, volume: 0.85, pickupAmmo: 60, flashScale: 0.9, drawTime: 0.6,
  },
  m4cqb: {
    id: 'm4cqb', name: 'M4 CQB (RED DOT)', shortName: 'M4 CQB', slot: 'primary', cls: 'ASSAULT RIFLE', price: 2750, glb: true,
    desc: 'Short carbine with red-dot optic — fastest target acquisition',
    magSize: 30, reserveMax: 210, damage: 31, headMult: 2.0, rpm: 780, modes: ['auto', 'semi'], reloadTime: 2.1, reloadEmptyTime: 2.4,
    hipSpread: 0.024, moveSpread: 0.026, bloomPerShot: 0.004, maxBloom: 0.038,
    recoilPitch: 0.008, recoilYaw: 0.0035, kickZ: 0.032, kickRot: 0.03, soundRate: 1.1, volume: 0.85, pickupAmmo: 60, flashScale: 0.85, drawTime: 0.55,
  },
};
WEAPON_DEFS.ak47.slot = 'primary'; WEAPON_DEFS.ak47.cls = 'ASSAULT RIFLE'; WEAPON_DEFS.ak47.price = 1000;
WEAPON_DEFS.ak47.reloadTime = 2.6; WEAPON_DEFS.ak47.drawTime = 0.6; WEAPON_DEFS.ak47.glb = true;
WEAPON_DEFS.mp9.optic = true; WEAPON_DEFS.m4cqb.optic = true;
/** Red dot sight can be bolted onto these (rifles / SMGs / shotgun without their own optic). */
export const RED_DOT_PRICE = 500;
export const canTakeRedDot = (id) => !!(GUN_GLB[id] && GUN_GLB[id].dot && !WEAPON_DEFS[id].optic);
WEAPON_DEFS.ak47.desc = 'Your starting rifle — 7.62, 600 RPM';
WEAPON_DEFS.deagle.slot = 'secondary';

/** Order in the Armory list. */
export const SHOP_WEAPONS = ['usp45', 'm9', 'mp9', 'ump45', 'saps12', 'm4a1', 'm4cqb', 'ak47'];

// frame ranges (30 fps) inside a combined clip
const F = (src, from, to) => ({ src, from, to });
/**
 * Animated arms + gun models (Sketchfab, CC BY 4.0). Numbers measured offline in model space at the idle pose:
 *  eye    = where the player's eye sits, fwd = view direction  (camera looks along fwd)
 *  sightRear / sightFront = two points on the aiming line, muzzle = barrel tip, scale = model units -> metres
 */
export const GUN_GLB = {
  ak47: {
    // "FPS Character Animation Pack Ak-47" (textured: stamped steel, varnished wood, bakelite mag)
    url: 'assets/models/guns/web/ak47.glb', scale: 1, eye: [0, 1.5984, 0.0222], fwd: [0, 0, 1], adsMode: 'aim', hipPos: [0, 0.015, 0.02], adsPush: 0.1,
    sightRear: [0.0048, 1.5363, 0.4177], sightFront: [0.005, 1.5605, 0.7634], muzzle: [-0.1221, 1.465, 0.8365],
    dot: { at: [-0.124, 1.497, 0.40], lift: 0.034 },
    clips: { idle: /_AK_Idle$/, aim: /_AK_Idle_Aim$/, walk: /_AK_Walk$/, run: /_AK__Run$/, fire: /_AK_Fire$/, aimFire: /_AK_Aim_Fire$/, reload: /_AK_Reload$/, draw: /_AK_Equip$/ },
  },
  usp45: {
    url: 'assets/models/guns/web/usp45.glb', scale: 0.0065, eye: [7, 25, -12], fwd: [0, 0, 1],
    sightRear: [0.0467, 19.658, 30.0828], sightFront: [0.0467, 19.658, 43.5304], muzzle: [-0.8744, 16.5246, 43.8126], adsEyeDist: 0.3,
    clips: { idle: F(0, 179, 204), fire: F(0, 0, 9), reload: F(0, 9, 64), reloadEmpty: F(0, 65, 130), draw: F(0, 205, 224) },
  },
  m9: {
    url: 'assets/models/guns/web/m9.glb', scale: 0.3, eye: [0, 4.66, 0.05], fwd: [0, 0, 1], adsMode: 'aim',
    sightRear: [0.0042, 4.6917, 1.7644], sightFront: [0.0042, 4.6917, 2.0801], muzzle: [-0.263, 4.3766, 1.9236],
    clips: { idle: /Comando_Idle$/, aim: /Aim_Idle$/, walk: /Comando_Walk$/, run: /Comando_Run$/, fire: /Comando_Fire$/, aimFire: /Aim_Fire$/, reload: /Comando_Reload$/, draw: /Comando_Equip$/ },
  },
  mp9: {
    url: 'assets/models/guns/web/mp9.glb', scale: 0.0104, eye: [6.446, 23.8614, -17.5855], fwd: [0, 0, 1],
    sightRear: [-0.5612, 18.8562, 4.9378], sightFront: [-0.5612, 18.8562, 14.9482], muzzle: [-0.38, 14.3653, 46.8567], adsEyeDist: 0.2,
    clips: { idle: F(0, 178, 204), fire: F(0, 0, 6), reload: F(0, 6, 77), reloadEmpty: F(0, 78, 131), draw: F(0, 205, 221) },
  },
  ump45: {
    url: 'assets/models/guns/web/ump45.glb', scale: 0.0092, eye: [9.6021, 30.9577, -19.9972], fwd: [0, 0, 1],
    sightRear: [-0.9568, 23.4156, 13.942], sightFront: [-0.9657, 23.1901, 44.1094], muzzle: [-0.47, 14.8553, 49.4081], adsEyeDist: 0.12,
    dot: { at: [-0.96, 21.6, 20.0], lift: 0.03 },
    clips: { idle: F(0, 186, 214), fire: F(0, 0, 7), reload: F(0, 8, 81), reloadEmpty: F(0, 81, 129), draw: F(0, 215, 234) },
  },
  saps12: {
    url: 'assets/models/guns/web/saps12.glb', scale: 0.5, eye: [0, 3.86, 0.05], fwd: [0, 0, 1], adsMode: 'center', hide: /Case/,
    sightRear: [-0.2236, 3.6684, 1.1276], sightFront: [-0.2236, 3.6684, 1.9391], muzzle: [-0.2273, 3.4432, 2.1435], adsEyeDist: 0.42, adsDrop: 0.035,
    dot: { at: [-0.2236, 3.655, 0.95], lift: 0.03 },
    clips: { idle: /Comando_Idle$/, walk: /Comando_Walk$/, run: /Comando_Run$/, fire: /Comando_Fire$/, reloadIn: /IdleToReload$/, reload: /Comando_Reload$/, reloadOut: /ReloadToIdle$/, draw: /Comando_Equip$/ },
  },
  m4a1: {
    url: 'assets/models/guns/web/m4a1.glb', scale: 0.85, eye: [0.0109, 1.5393, -0.1006], fwd: [0, 0, 1],
    sightRear: [-0.0517, 1.5389, 0.0636], sightFront: [-0.0509, 1.5343, 0.4674], muzzle: [-0.0568, 1.4636, 0.6302], adsEyeDist: 0.09, hipPos: [0.01, -0.035, 0.02],
    dot: { at: [-0.0515, 1.535, 0.16], lift: 0.03 },
    clips: { idle: F(/^Fire$/, 0, 30), fire: F(/^Fire$/, 226, 250), reload: F(/^Reload$/, 0, 110), reloadEmpty: F(/^Reload_Empty$/, 112, 225), draw: F(/^Draw$/, 270, 300) },
  },
  m4cqb: {
    url: 'assets/models/guns/web/m4cqb.glb', scale: 0.4, eye: [0.2843, 0.6786, -0.8046], fwd: [0, 0, 1],
    sightRear: [-0.0094, 0.4688, 0.1392], sightFront: [-0.0094, 0.4688, 0.5587], muzzle: [-0.005, 0.3282, 1.4228], adsEyeDist: 0.17,
    clips: { idle: F(0, 178, 204), fire: F(0, 0, 7), reload: F(0, 9, 68), reloadEmpty: F(0, 69, 134), draw: F(0, 205, 222) },
  },
};

/** Rotation that turns model-space `fwd` into the camera's -Z (keeping world up). */
function alignQuat(f) {
  const F_ = new THREE.Vector3(...f).normalize();
  const R = new THREE.Vector3().crossVectors(F_, new THREE.Vector3(0, 1, 0)).normalize();
  const U = new THREE.Vector3().crossVectors(R, F_);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, U, F_.clone().negate())).invert();
}

function pickClip(gltf, spec, key) {
  const A = gltf.animations;
  if (spec instanceof RegExp) return A.find((c) => spec.test(c.name)) || null;
  if (spec && typeof spec === 'object') {
    const src = typeof spec.src === 'number' ? A[spec.src] : A.find((c) => spec.src.test(c.name));
    if (!src) return null;
    return THREE.AnimationUtils.subclip(src, key, spec.from, Math.max(spec.to, spec.from + 1), 30);
  }
  return null;
}

const ARM_RE = /^Object_7$|Object_84|arm|glove|shirt|hand/i;
const isArmMesh = (o) => ARM_RE.test(o.name) || ARM_RE.test((o.material && o.material.name) || '');

/** Compact red-dot reflex sight (metres). Origin = centre of the lens, looking down -Z. */
function buildRedDot(riser = 0.026) {
  const g = new THREE.Group();
  const body = mat(0x1b1c1e, 0.55, 0.6);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.034, 28, 1, true), body);
  tube.material = body.clone(); tube.material.side = THREE.DoubleSide;
  tube.rotation.x = Math.PI / 2;
  g.add(tube);
  for (const z of [-0.017, 0.017]) {                                  // front / rear rims
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0175, 0.0022, 8, 28), body);
    rim.position.z = z; g.add(rim);
  }
  const rh = Math.max(0.012, riser - 0.017);                             // riser from the tube down to the rail
  add(rbox(0.026, rh, 0.03, 0.003), body, g, 0, -0.017 - rh / 2, 0);
  add(rbox(0.03, 0.006, 0.05, 0.002), body, g, 0, -riser - 0.003, 0);  // rail clamp
  add(rbox(0.008, 0.008, 0.012, 0.002), body, g, 0.019, -0.004, 0.004); // brightness knob
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0158, 28), new THREE.MeshBasicMaterial({
    color: 0x5fa0ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  lens.position.z = -0.012;
  g.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 16), new THREE.MeshBasicMaterial({ color: 0xff1a1a, toneMapped: false }));
  dot.position.z = -0.0125;
  g.add(dot);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 16), new THREE.MeshBasicMaterial({
    color: 0xff3030, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
  halo.position.z = -0.0124;
  g.add(halo);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

/** Bone (or mesh) that carries the gun near camera-space point P — so attachments follow the animations. */
function carrierNear(model, P) {
  const v = new THREE.Vector3();
  let best = null, bestD = Infinity;
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || isArmMesh(o)) return;
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 3000));
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i += step) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
      const d = v.distanceToSquared(P);
      if (d < bestD) {
        bestD = d;
        if (o.isSkinnedMesh && si) {
          let k = 0; for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, k)) k = j;
          best = o.skeleton.bones[si.getComponent(i, k)];
        } else best = o;
      }
    }
  });
  return best;
}

/**
 * Snap the muzzle onto the real barrel tip and parent it to the bone that carries the gun.
 *  P   = rough muzzle guess (camera space, idle pose), dir = barrel direction (camera space).
 * Searches gun vertices close to the bore line through P, takes the most forward slice and uses
 * its centre — so hand-measured numbers that are a few cm off no longer matter. Then the muzzle
 * is attached to the carrier bone, so the flash follows aim / walk / fire / reload animations
 * instead of hanging in mid-air where the barrel was in the idle pose.
 */
function mountMuzzle(model, root, muzzle, P, dir) {
  root.updateMatrixWorld(true);
  // bone matrices are normally refreshed by the renderer; refresh now so skinned vertices are posed
  // (restored afterwards so nothing else measured at load time changes behaviour)
  const saved = [];
  model.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton && !saved.some((e) => e.s === o.skeleton)) {
      saved.push({ s: o.skeleton, m: o.skeleton.boneMatrices.slice() });
      o.skeleton.update();
    }
  });
  const D = dir.clone().normalize();
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  const pts = [];
  let maxA = -Infinity;
  const LAT = 0.045;                     // metres from the bore line
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || isArmMesh(o)) return;
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += step) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
      d.subVectors(v, P);
      const a = d.dot(D);
      if (a < -0.35 || a > 0.35) continue;
      const lat = d.addScaledVector(D, -a).length();
      if (lat > LAT) continue;
      pts.push(v.x, v.y, v.z, a);
      if (a > maxA) maxA = a;
    }
  });
  const tip = P.clone();
  if (pts.length && maxA > -Infinity) {
    // centre of the front-most 1.5 cm slice = the bore opening
    const c = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < pts.length; i += 4) {
      if (pts[i + 3] < maxA - 0.015) continue;
      c.x += pts[i]; c.y += pts[i + 1]; c.z += pts[i + 2]; n++;
    }
    if (n) {
      c.divideScalar(n);
      // keep it on the slice plane exactly at the tip
      tip.copy(c).addScaledVector(D, maxA - c.clone().sub(P).dot(D));
    }
  }
  tip.addScaledVector(D, 0.008);         // a hair in front of the metal
  muzzle.position.copy(tip);
  muzzle.quaternion.setFromUnitVectors(V(0, 0, -1), D);
  root.add(muzzle);
  root.updateMatrixWorld(true);
  const carrier = carrierNear(model, tip);
  for (const e of saved) e.s.boneMatrices.set(e.m);
  if (carrier) carrier.attach(muzzle);
  return muzzle;
}

/** Highest gun surface (camera space) around point P — where a rail-mounted optic sits. */
function railTop(model, P, rx = 0.012, rz = 0.03) {
  const v = new THREE.Vector3();
  let top = -Infinity;
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || isArmMesh(o)) return;
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 6000));
    for (let i = 0; i < pos.count; i += step) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
      if (Math.abs(v.x - P.x) < rx && Math.abs(v.z - P.z) < rz && v.y > top) top = v.y;
    }
  });
  return top === -Infinity ? P.y : top;
}

/** ADS transform that puts a sight point on screen centre: rotate `dir` onto -Z, then centre `point`. */
function adsFor(point, dir, eyeDist) {
  const q = new THREE.Quaternion().setFromUnitVectors(dir.clone().normalize(), V(0, 0, -1));
  const r2 = point.clone().applyQuaternion(q);
  return { quat: q, pos: V(-r2.x, -r2.y, eyeDist === null ? point.z - r2.z : -eyeDist - r2.z) };
}

/** Static copy of the gun (no arms) in its idle pose, centred, metres, barrel along -Z: for weapons lying on the ground. */
function bakeWorldModel(m) {
  const out = new THREE.Group();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  m.root.updateMatrixWorld(true);
  m.root.traverse((o) => {
    if (!o.isMesh || !o.visible || isArmMesh(o) || !o.geometry.attributes.position) return;
    if (o.material && o.material.transparent && o.material.opacity < 0.5) return;
    const src = o.geometry, n = src.attributes.position.count;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv);
    if (src.index) geo.setIndex(src.index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, o.material);
    mesh.castShadow = true;
    out.add(mesh);
    geo.computeBoundingBox(); box.union(geo.boundingBox);
  });
  if (box.isEmpty()) return null;
  const c = box.getCenter(V());
  for (const ch of out.children) ch.geometry.translate(-c.x, -c.y, -c.z);
  out.userData.half = (box.max.x - box.min.x) / 2;     // lies on its side -> width becomes height
  return out;
}

/** Animated arms + gun (Armory weapons). Same result shape as prepareGLB(). */
export function prepareGunGLB(gltf, cfg) {
  const root = new THREE.Group();     // = camera space
  const align = new THREE.Group();
  const model = gltf.scene;
  root.add(align);
  align.add(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mn = (o.material && o.material.name) || '';
    if (cfg.hide && cfg.hide.test(o.name + ' ' + mn)) { o.visible = false; return; }
    o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false;
  });
  const q = alignQuat(cfg.fwd), s = cfg.scale;
  align.quaternion.copy(q);
  align.scale.setScalar(s);
  align.position.copy(V(...cfg.eye).multiplyScalar(s).applyQuaternion(q).negate());
  const toCam = (p) => V(...p).sub(V(...cfg.eye)).multiplyScalar(s).applyQuaternion(q);

  const result = {
    root, muzzle: new THREE.Object3D(), isGLB: true,
    hipPos: V(...(cfg.hipPos || [0, 0, 0])), adsPos: V(0, 0, 0), adsQuat: null, adsMode: cfg.adsMode || 'sight',
    mixer: null, actions: {}, base: ['idle', 'walk', 'run', 'aim'], weights: { idle: 1, walk: 0, run: 0, aim: 0 },
    overlay: null, overlayLeft: 0, overlayW: 0,
  };
  const mixer = new THREE.AnimationMixer(model);
  result.mixer = mixer;
  for (const [key, spec] of Object.entries(cfg.clips)) {
    const clip = pickClip(gltf, spec, key);
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    if (result.base.includes(key)) { a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(key === 'idle' ? 1 : 0); }
    else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    result.actions[key] = a;
  }
  mixer.update(0);

  // aiming
  const R = toCam(cfg.sightRear), Fp = toCam(cfg.sightFront);
  if (result.adsMode === 'sight') {
    const qa = new THREE.Quaternion().setFromUnitVectors(_v1.subVectors(Fp, R).normalize(), V(0, 0, -1));
    const r2 = R.clone().applyQuaternion(qa);
    result.adsQuat = qa;
    result.adsPos.set(-r2.x, -r2.y, -(cfg.adsEyeDist || 0.15) - r2.z);
  } else if (result.adsMode === 'aim') {
    // the rig has its own aim pose (sights measured in that pose): line them up exactly, keep the distance
    // the rig has its own aim pose: keep its angle, just put the front sight on screen centre
    result.adsQuat = null;
    result.adsPos.set(-Fp.x, -Fp.y, -(cfg.adsPush || 0));
  } else {
    // 'center': bring the gun toward the middle of the screen, slightly low (shotguns)
    result.adsPos.set(-R.x, -R.y - (cfg.adsDrop || 0), -(cfg.adsEyeDist || 0.3) - R.z);
  }
  mountMuzzle(model, root, result.muzzle, toCam(cfg.muzzle), Fp.clone().sub(R));
  result.adsBase = { pos: result.adsPos.clone(), quat: result.adsQuat ? result.adsQuat.clone() : null };

  // optional red dot: mounted on the rail, parented to the bone that carries the gun
  if (cfg.dot) {
    const at = toCam(cfg.dot.at);
    const rail = railTop(model, at);
    at.y = rail + cfg.dot.lift;
    // the lens must clear the iron sights, otherwise the rear sight blocks the view
    if (result.adsMode !== 'aim') at.y = Math.max(at.y, R.y + 0.016);
    const riser = at.y - rail;
    const dir = _v2.subVectors(Fp, R).normalize().clone();
    const carrier = carrierNear(model, at);
    if (carrier) {
      const dot = buildRedDot(riser);
      dot.position.copy(at);
      dot.quaternion.setFromUnitVectors(V(0, 0, -1), dir);
      root.add(dot);
      root.updateMatrixWorld(true);
      carrier.attach(dot);
      dot.visible = false;
      result.dot = dot;
      const lensCentre = (d) => { root.updateMatrixWorld(true); const p = d.getWorldPosition(V()); const q = d.getWorldQuaternion(new THREE.Quaternion()); return { p, f: V(0, 0, -1).applyQuaternion(q) }; };
      if (result.adsMode === 'aim' && result.actions.aim) {
        // measure the dot in the rig's own aim pose
        const A = result.actions;
        A.idle.setEffectiveWeight(0); A.aim.setEffectiveWeight(1); mixer.update(0);
        const L = lensCentre(dot);
        result.adsDot = adsFor(L.p, L.f, null);
        result.adsDot.pos.z -= (cfg.adsPush || 0) * 0.5;
        A.aim.setEffectiveWeight(0); A.idle.setEffectiveWeight(1); mixer.update(0);
      } else {
        const L = lensCentre(dot);
        result.adsDot = adsFor(L.p, L.f, cfg.dot.eyeDist || 0.24);
      }
      root.updateMatrixWorld(true);
    }
  }
  return result;
}

/** First-person AK .glb (tuned for FPS_AK-74m_animations.glb, works as a fallback for others). */
export const AK_GLB_CONFIG = {
  urls: ['assets/models/ak47.glb', 'assets/models/FPS_AK-74m_animations.glb'],
  cameraBone: /Head_Cam/i,       // the rig's camera bone is placed exactly at the player's eye
  cameraYaw: Math.PI,            // this rig looks down +Z, our camera looks down -Z
  // Iron sights measured on the model in camera space (Idle, frame 0):
  sightRear: [0.0334, -0.0245, -0.395],   // centre of the rear-sight U-notch, level with its shoulders
  sightFront: [0.0219, -0.0280, -0.857],  // tip of the front post (between the protective ears)
  adsLift: 0.0,                  // + raises the sight picture
  adsForward: 0.05,              // pushes the gun slightly away from the eye when aiming
  hipPos: [0.012, -0.012, 0.01],
  muzzle: [0.027, -0.095, -1.0],
  // the model ships without textures, so give each part a sensible material
  colors: [
    [/mag/i, 0x4a2516, 0.6, 0.05],
    [/ak|gun|weapon|rifle/i, 0x2c2d2f, 0.42, 0.75],
    [/arm|hand|glove|sleeve/i, 0x4c4a39, 0.92, 0.0],
  ],
  clips: { idle: /Idle/i, walk: /Walk/i, run: /Run/i, fire: /Shot|Fire/i, reload: /Reload$/i, draw: /Draw/i },
  // generic fallback when the model has no camera bone
  targetLength: 0.85, flip: false,
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v3 = V(), _v1 = V(), _v2 = V(), _right = V(), _up = V(), _dir = V(), _origin = V(), _end = V();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e1 = new THREE.Euler();
const Q_ID = new THREE.Quaternion();
const UP = V(0, 1, 0);

const easeInOut = (t) => t * t * (3 - 2 * t);
const smooth = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

// ---------------- procedural model helpers ----------------
function mat(color, rough = 0.5, metal = 0.6) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function add(geo, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** Box with bevelled edges, centred, length along Z. */
function rbox(w, h, d, r = 0.004) {
  const b = Math.min(r, w / 3, h / 3, d / 3);
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * b, h - 2 * b, b * 0.5), {
    depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3,
  });
  g.translate(0, 0, -(d - 2 * b) / 2);
  return g;
}
function cylZ(r, len, seg = 16, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
}
/** Side profile drawn in (u = forward = -Z, v = up) and extruded across X with `width`. */
function profile(points, width, bevel = 0.002, curves = null) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, width - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments: 2, curveSegments: curves || 10,
  });
  g.rotateY(Math.PI / 2);               // shape X -> -Z (forward), extrusion -> +X
  g.translate(-(width - 2 * bevel) / 2, 0, 0);
  return g;
}

/** Tapered cylinder between two points, re-aimable every frame. */
class Limb {
  constructor(rA, rB, m, parent) {
    const g = new THREE.CylinderGeometry(rB, rA, 1, 12);
    g.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(g, m);
    parent.add(this.mesh);
  }
  set(a, b) {
    const d = _v1.subVectors(b, a);
    const len = d.length() || 0.001;
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    this.mesh.scale.set(1, len, 1);
  }
}

const ARM_MATS = { sleeve: null, glove: null };
function armMats() {
  if (!ARM_MATS.sleeve) {
    ARM_MATS.sleeve = mat(0x58553f, 0.95, 0);
    ARM_MATS.cuff = mat(0x46442f, 0.95, 0);
    ARM_MATS.glove = mat(0x1d1d1b, 0.75, 0.05);
  }
  return ARM_MATS;
}

/** One first-person arm: gloved hand + forearm + upper arm. `grip` = 'wrap' (handguard) or 'pistol'. */
function buildArm(parent, shoulder, grip) {
  const m = armMats();
  const hand = new THREE.Group();
  parent.add(hand);
  if (grip === 'wrap') {
    add(rbox(0.075, 0.03, 0.095, 0.01), m.glove, hand, 0, -0.012, 0);            // palm under the handguard
    add(rbox(0.016, 0.06, 0.085, 0.006), m.glove, hand, -0.036, 0.01, 0);        // fingers up the left side
    add(rbox(0.014, 0.045, 0.03, 0.005), m.glove, hand, 0.034, 0.008, 0.02);     // thumb on the right
  } else {
    add(rbox(0.055, 0.075, 0.085, 0.012), m.glove, hand, 0, 0, 0);
    add(rbox(0.05, 0.025, 0.06, 0.008), m.glove, hand, 0, 0.01, -0.045, -0.4);   // index finger toward trigger
  }
  add(cylZ(0.04, 0.035, 14), m.cuff, hand, 0, -0.01, 0.06);
  const fore = new Limb(0.034, 0.042, m.sleeve, parent);
  const upper = new Limb(0.043, 0.05, m.sleeve, parent);
  const elbow = V();
  return {
    hand, shoulder: shoulder.clone(),
    set(handPos, elbowOffset = null) {
      hand.position.copy(handPos);
      elbow.copy(handPos).add(this.shoulder).multiplyScalar(0.5);
      elbow.add(elbowOffset || this.elbowOffset);
      fore.set(_v2.copy(handPos).add(V(0, -0.01, 0.05)), elbow);
      upper.set(elbow, this.shoulder);
    },
    elbowOffset: V(0, -0.12, 0.02),
  };
}

// ---------------- procedural AK-47 ----------------
export function buildAK47() {
  const root = new THREE.Group();
  const metal = mat(0x2a2b2d, 0.38, 0.82);
  const metal2 = mat(0x3b3c3f, 0.5, 0.7);
  const dark = mat(0x161616, 0.55, 0.6);
  const polymer = mat(0x1c1c1c, 0.82, 0.05);
  const magMat = mat(0x4a2516, 0.6, 0.05);   // AK-74 "plum" bakelite magazine

  // --- receiver (sight line at y = 0, barrel along -Z)
  add(rbox(0.05, 0.068, 0.42, 0.006), metal, root, 0, -0.062, -0.02);
  const cover = add(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 20, 1, false, -Math.PI / 2, Math.PI), metal2, root, 0, -0.03, 0.0, Math.PI / 2, 0, 0);
  cover.scale.set(1, 1, 0.55);
  add(rbox(0.006, 0.02, 0.11, 0.002), metal2, root, 0.027, -0.05, 0.02);          // selector lever (right side)
  add(rbox(0.044, 0.012, 0.03, 0.003), metal2, root, 0, -0.025, 0.2);             // rear trunnion block

  // --- rear sight: base + leaf with a real U-notch
  add(rbox(0.034, 0.018, 0.07, 0.003), metal, root, 0, -0.022, -0.255);
  const leaf = new THREE.Shape();
  leaf.moveTo(-0.017, -0.008); leaf.lineTo(0.017, -0.008); leaf.lineTo(0.017, 0.006); leaf.lineTo(0.0045, 0.006);
  leaf.lineTo(0.0045, 0.0015); leaf.absarc(0, 0.0015, 0.0045, 0, -Math.PI, true); leaf.lineTo(-0.0045, 0.006);
  leaf.lineTo(-0.017, 0.006); leaf.closePath();
  const leafGeo = new THREE.ExtrudeGeometry(leaf, { depth: 0.005, bevelEnabled: false, curveSegments: 8 });
  leafGeo.translate(0, -0.0015, -0.0025);           // notch bottom exactly on the sight line (y = 0)
  add(leafGeo, metal, root, 0, 0, -0.262);

  // --- gas tube, handguards, gas block
  add(cylZ(0.0115, 0.3), metal2, root, 0, -0.028, -0.42);
  const upperHG = add(new THREE.CylinderGeometry(0.02, 0.02, 0.19, 18, 1, false, -Math.PI / 2, Math.PI), polymer, root, 0, -0.032, -0.355, Math.PI / 2, 0, 0);
  upperHG.scale.set(1, 1, 0.8);
  add(rbox(0.06, 0.054, 0.26, 0.01), polymer, root, 0, -0.077, -0.37);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.062, 0.004, 0.012), dark, root, 0, -0.06, -0.29 - i * 0.05); // grip grooves
  add(rbox(0.03, 0.042, 0.035, 0.004), metal, root, 0, -0.042, -0.585);

  // --- barrel, front sight, AK-74 muzzle brake
  add(cylZ(0.0105, 0.6, 18), metal, root, 0, -0.055, -0.54);
  add(rbox(0.026, 0.03, 0.04, 0.004), metal, root, 0, -0.045, -0.765);
  add(new THREE.CylinderGeometry(0.0017, 0.0019, 0.026, 8), metal, root, 0, -0.013, -0.765);   // front post, top at y = 0
  add(new THREE.BoxGeometry(0.003, 0.03, 0.012), metal, root, -0.0115, -0.016, -0.765);          // protective ears
  add(new THREE.BoxGeometry(0.003, 0.03, 0.012), metal, root, 0.0115, -0.016, -0.765);
  add(cylZ(0.015, 0.085, 18), dark, root, 0, -0.055, -0.88);
  for (const z of [-0.86, -0.9]) add(new THREE.BoxGeometry(0.031, 0.006, 0.01), metal2, root, 0, -0.04, z);

  // --- curved banana magazine
  const mag = new THREE.Group();
  mag.position.set(0, -0.096, -0.135);
  root.add(mag);
  const magGeo = profile([
    [-0.036, 0.004], [0.038, 0.004],
    [0.07, -0.13, 0.13, -0.245],
    [0.078, -0.268],
    [0.012, -0.13, -0.036, 0.004],
  ], 0.032, 0.003, 16);
  add(magGeo, magMat, mag, 0, 0, 0);
  add(rbox(0.036, 0.012, 0.06, 0.003), polymer, mag, 0, -0.258, -0.1, 0.55, 0, 0);  // base plate
  for (let i = 1; i < 4; i++) {                                                       // reinforcement ribs
    const t = i / 4;
    add(new THREE.BoxGeometry(0.034, 0.004, 0.06), magMat, mag, 0, -0.06 - t * 0.17, -0.02 - t * t * 0.09, 0.15 + t * 0.4, 0, 0);
  }

  // --- angled pistol grip, trigger + guard
  add(profile([[0.024, 0.0], [-0.024, 0.0], [-0.062, -0.112], [-0.018, -0.118]], 0.032, 0.004), polymer, root, 0, -0.092, 0.06);
  add(new THREE.BoxGeometry(0.006, 0.005, 0.075), metal, root, 0, -0.128, 0.0);
  add(new THREE.BoxGeometry(0.006, 0.034, 0.005), metal, root, 0, -0.112, -0.037);
  add(new THREE.BoxGeometry(0.004, 0.026, 0.006), metal2, root, 0, -0.106, 0.012, 0.25);

  // --- AK-74M polymer stock
  add(profile([
    [-0.19, -0.032], [-0.19, -0.094], [-0.32, -0.112], [-0.495, -0.138], [-0.505, -0.138],
    [-0.505, -0.018], [-0.48, -0.016], [-0.32, -0.036],
  ], 0.042, 0.005), polymer, root, 0, 0, 0);
  add(rbox(0.046, 0.124, 0.014, 0.004), dark, root, 0, -0.077, 0.512);

  // --- charging handle / bolt carrier (right side) — animated in stage 3 of the reload
  const bolt = new THREE.Group();
  bolt.position.set(0, 0, 0);
  root.add(bolt);
  add(new THREE.BoxGeometry(0.004, 0.012, 0.16), metal2, bolt, 0.026, -0.038, 0.02);
  add(cylZ(0.004, 0.03, 8), metal, bolt, 0.04, -0.036, 0.1).rotation.set(0, Math.PI / 2, 0);
  add(new THREE.SphereGeometry(0.008, 10, 8), metal, bolt, 0.056, -0.036, 0.1);

  // --- arms: right hand on the grip, left hand (animated) under the handguard
  const right = buildArm(root, V(0.24, -0.38, 0.75), 'pistol');
  right.elbowOffset.set(0.03, -0.1, 0.05);
  right.set(V(0.004, -0.15, 0.085));
  const left = buildArm(root, V(-0.26, -0.43, 0.3), 'wrap');
  left.elbowOffset.set(-0.08, -0.08, 0.05);
  const leftRest = V(0, -0.104, -0.385);
  left.set(leftRest);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.055, -0.925);
  root.add(muzzle);

  return {
    root, muzzle, isGLB: false,
    mag, magBase: mag.position.clone(), magRotX: 0,
    magGrab: V(0, -0.2, -0.06),            // where the left hand holds the mag (mag-local)
    bolt, boltTravel: 0.075,
    handle: V(0.058, -0.03, 0.105),        // charging-handle knob, for the left hand
    leftArm: left, leftRest,
    hipPos: V(0.12, -0.115, -0.3),
    adsPos: V(0, 0, -0.32),                // sight line stays exactly on screen centre (y = 0)
    adsQuat: null,
  };
}

// ---------------- procedural Desert Eagle ----------------
export function buildDeagle() {
  const root = new THREE.Group();
  const steel = mat(0x8c8c8a, 0.28, 0.92);
  const steel2 = mat(0x5c5c5c, 0.4, 0.85);
  const black = mat(0x141414, 0.75, 0.2);

  const slide = new THREE.Group();     // animated like a bolt (racked in stage 3)
  root.add(slide);
  add(rbox(0.034, 0.038, 0.27, 0.005), steel, slide, 0, -0.022, -0.11);
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.036, 0.03, 0.004), steel2, slide, 0, -0.022, 0.0 - i * 0.008);
  add(new THREE.BoxGeometry(0.005, 0.012, 0.008), steel, slide, 0, -0.008, -0.225);   // front sight (top at y≈-0.002)
  add(new THREE.BoxGeometry(0.006, 0.012, 0.01), steel, slide, -0.0075, -0.008, 0.012); // rear sight with notch
  add(new THREE.BoxGeometry(0.006, 0.012, 0.01), steel, slide, 0.0075, -0.008, 0.012);
  add(rbox(0.03, 0.03, 0.2, 0.004), steel2, root, 0, -0.055, -0.08);
  add(cylZ(0.009, 0.02, 12), steel2, root, 0, -0.022, -0.25);
  add(profile([[0.03, 0], [-0.022, 0], [-0.05, -0.12], [0.002, -0.124]], 0.034, 0.005), black, root, 0, -0.065, 0.02);
  add(new THREE.BoxGeometry(0.006, 0.006, 0.06), steel2, root, 0, -0.088, -0.035);
  const mag = new THREE.Group();
  mag.position.set(0, -0.12, 0.012);
  mag.rotation.x = -0.25;
  root.add(mag);
  add(rbox(0.024, 0.11, 0.04, 0.003), steel2, mag, 0, 0, 0);

  const right = buildArm(root, V(0.24, -0.38, 0.7), 'pistol');
  right.elbowOffset.set(0.03, -0.1, 0.05);
  right.set(V(0.005, -0.125, 0.03));
  const left = buildArm(root, V(-0.26, -0.4, 0.68), 'pistol');
  left.elbowOffset.set(-0.06, -0.1, 0.05);
  const leftRest = V(-0.035, -0.135, 0.04);
  left.set(leftRest);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.022, -0.26);
  root.add(muzzle);

  return {
    root, muzzle, isGLB: false,
    mag, magBase: mag.position.clone(), magRotX: -0.25,
    magGrab: V(0, -0.06, 0.0),
    bolt: slide, boltTravel: 0.045,
    handle: V(0, 0.0, 0.03),
    leftArm: left, leftRest,
    hipPos: V(0.15, -0.15, -0.38),
    adsPos: V(0, 0, -0.3),
    adsQuat: null,
  };
}

// ---------------- GLB viewmodel ----------------
export async function loadWeaponGLB(loader) {
  for (const url of AK_GLB_CONFIG.urls) {
    try {
      const gltf = await loader.loadAsync((window.__EMBED && window.__EMBED[url]) || url);
      console.info(`[Weapon] Loaded viewmodel ${url} (${gltf.animations.length} clips: ${gltf.animations.map((c) => c.name).join(', ')})`);
      return gltf;
    } catch (e) { /* try next */ }
  }
  console.info('[Weapon] No AK .glb found — using procedural AK-47 viewmodel.');
  return null;
}

function prepareGLB(gltf, cfg) {
  const root = new THREE.Group();     // = camera space
  const align = new THREE.Group();
  const model = gltf.scene;
  root.add(align);
  align.add(model);

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false;
    const hasMap = o.material && o.material.map;
    const c = cfg.colors.find(([re]) => re.test(o.name));
    if (c && !hasMap) o.material = new THREE.MeshStandardMaterial({ color: c[1], roughness: c[2], metalness: c[3] });
  });

  // animations
  const result = {
    root, muzzle: new THREE.Object3D(), isGLB: true,
    hipPos: V(...cfg.hipPos), adsPos: V(0, 0, 0), adsQuat: null,
    mixer: null, actions: {}, base: ['idle', 'walk', 'run'], weights: { idle: 1, walk: 0, run: 0 },
    overlay: null, overlayLeft: 0, overlayW: 0,
  };
  if (gltf.animations.length) {
    const mixer = new THREE.AnimationMixer(model);
    result.mixer = mixer;
    for (const [key, re] of Object.entries(cfg.clips)) {
      const clip = gltf.animations.find((c) => re.test(c.name));
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (result.base.includes(key)) { a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(key === 'idle' ? 1 : 0); }
      else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      result.actions[key] = a;
    }
    mixer.update(0);
  }
  root.updateMatrixWorld(true);

  // place the rig's camera bone on the player's eye
  let camBone = null;
  model.traverse((o) => { if (!camBone && cfg.cameraBone.test(o.name)) camBone = o; });
  if (camBone) {
    const m = camBone.matrixWorld.clone().multiply(new THREE.Matrix4().makeRotationY(cfg.cameraYaw));
    m.invert().decompose(align.position, align.quaternion, align.scale);
    if (cfg.sightRear && cfg.sightFront) {
      const R = V(...cfg.sightRear), F = V(...cfg.sightFront);
      const q = new THREE.Quaternion().setFromUnitVectors(_v1.subVectors(F, R).normalize(), V(0, 0, -1));
      const r2 = R.clone().applyQuaternion(q);
      result.adsQuat = q;
      result.adsPos.set(-r2.x, -r2.y + cfg.adsLift, cfg.adsForward * -1);
    }
    const md = (cfg.sightRear && cfg.sightFront) ? V(...cfg.sightFront).sub(V(...cfg.sightRear)) : V(0, 0, -1);
    mountMuzzle(model, root, result.muzzle, V(...cfg.muzzle), md);
  } else {
    // generic static model: auto-fit, barrel along -Z, top of the model on the sight line
    const box3 = new THREE.Box3();
    const measure = () => { root.updateMatrixWorld(true); box3.setFromObject(model); return box3.getSize(V()); };
    let size = measure();
    if (size.x > size.z && size.x >= size.y) { model.rotation.y += Math.PI / 2; size = measure(); }
    if (cfg.flip) { model.rotation.y += Math.PI; size = measure(); }
    model.scale.multiplyScalar(cfg.targetLength / (Math.max(size.x, size.y, size.z) || 1));
    size = measure();
    const center = box3.getCenter(V());
    model.position.x -= center.x; model.position.y -= box3.max.y; model.position.z -= box3.max.z - 0.28;
    measure();
    result.hipPos.set(0.17, -0.18, -0.42);
    result.adsPos.set(0, -0.005, -0.12);
    result.muzzle.position.set(0, -size.y * 0.25, box3.min.z - 0.01);
    root.add(result.muzzle);
  }
  return result;
}

/** Blend base loops (idle/walk/run) with one-shot overlays (fire/reload/draw). */
function animateGLB(m, dt, state) {
  if (!m.mixer) return;
  const target = state.sprint ? 'run' : (state.ads && m.actions.aim) ? 'aim' : state.moving ? 'walk' : 'idle';
  const k = 1 - Math.exp(-10 * dt);
  for (const b of m.base) {
    if (!m.actions[b]) continue;
    if (m.weights[b] === undefined) m.weights[b] = 0;
    m.weights[b] += ((b === target ? 1 : 0) - m.weights[b]) * k;
  }
  if (!m.actions[target]) m.weights.idle += (1 - m.weights.idle) * k;
  if (m.actions.walk) m.actions.walk.timeScale = Math.max(0.6, Math.min(1.5, state.speed / 6));
  if (m.overlay) {
    m.overlayLeft -= dt;
    const want = m.overlayLeft > 0.06 ? 1 : 0;
    m.overlayW += (want - m.overlayW) * (1 - Math.exp(-(want ? 40 : 18) * dt));
    if (m.overlayLeft <= 0 && m.overlayW < 0.01) { m.overlay.stop(); m.overlay = null; m.overlayW = 0; }
  }
  const baseScale = 1 - m.overlayW;
  for (const b of m.base) if (m.actions[b]) m.actions[b].setEffectiveWeight(m.weights[b] * baseScale);
  if (m.overlay) m.overlay.setEffectiveWeight(m.overlayW);
  m.mixer.update(dt);
}

function playOverlay(m, key, duration = 0, force = true) {
  const a = m.actions && m.actions[key];
  if (!a) return false;
  if (m.overlay && m.overlay !== a && !force) return false;
  if (m.overlay && m.overlay !== a) m.overlay.stop();
  const clipDur = a.getClip().duration;
  a.reset();
  a.timeScale = duration > 0 ? clipDur / duration : 1;
  a.setEffectiveWeight(1);
  a.play();
  m.overlay = a;
  m.overlayLeft = clipDur / a.timeScale;
  if (m.overlayW < 0.5) m.overlayW = 0.5;
  return true;
}

// ---------------- weapon state ----------------
class Weapon {
  constructor(def, model) {
    this.def = def;
    this.id = def.id;
    this.model = model;
    this.reset();
  }
  reset() {
    this.mag = this.def.magSize;
    this.reserve = this.def.reserveMax;
    this.mode = this.def.modes[0];
  }
}

export class WeaponManager {
  constructor(game) {
    this.game = game;
    this.scene = game.weaponScene;
    this.vmCamera = game.weaponCamera;
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.weapons = {};
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 300;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.scene.add(this.flashLight);
    this._pos = V(); this._rot = V(); this._hand = V();
    this.sway = new THREE.Vector2(); this.swayTarget = new THREE.Vector2();
    this.kick = { z: 0, vz: 0, rx: 0, vrx: 0, x: 0, vx: 0 };
  }

  init(akGLTF) {
    const akModel = akGLTF ? prepareGLB(akGLTF, AK_GLB_CONFIG) : buildAK47();
    this._register(new Weapon(WEAPON_DEFS.ak47, akModel));
    this._register(new Weapon(WEAPON_DEFS.deagle, buildDeagle()));
    this.loading = {};
    this.reset();
  }

  _register(w) {
    const old = this.weapons[w.id];
    if (old) { this.pivot.remove(old.model.root); if (this.currentId === w.id) w.model.root.visible = true; }
    this.weapons[w.id] = w;
    w.flash = this._makeFlash(w.def.flashScale);
    w.model.muzzle.add(w.flash);
    w.model.root.visible = false;
    this.pivot.add(w.model.root);
  }

  isLoaded(id) { return !!this.weapons[id]; }
  isLoading(id) { return !!(this.loading[id] && !this.weapons[id]); }

  /** Load an Armory weapon's .glb (once). Resolves to true when it is ready. */
  ensure(id, replace = false) {
    if (this.weapons[id] && !(replace && !this.weapons[id].model.fromGunGLB)) return Promise.resolve(true);
    if (this.loading[id]) return this.loading[id];
    const cfg = GUN_GLB[id];
    if (!cfg) return Promise.resolve(false);
    this.loading[id] = (async () => {
      try {
        const url = window.__assetURL ? await window.__assetURL(cfg.url) : cfg.url;
        const gltf = await this.game.loader.loadAsync(url);
        const model = prepareGunGLB(gltf, cfg);
        model.fromGunGLB = true;
        const prev = this.weapons[id];
        const w = new Weapon(WEAPON_DEFS[id], model);
        if (prev) { w.mag = prev.mag; w.reserve = prev.reserve; w.mode = prev.mode; }
        w.worldModel = bakeWorldModel(model);
        w.worldHalf = w.worldModel ? w.worldModel.userData.half : 0.04;
        this._register(w);
        if (prev && this.currentId === id) this.equip(id);
        // compile shaders now, not on the first draw in combat
        model.root.visible = true; this.game.renderer.compile(this.scene, this.vmCamera); model.root.visible = id === this.currentId;
        console.info(`[Weapon] ${id} ready (${gltf.animations.length} clips)`);
        return true;
      } catch (e) {
        console.warn(`[Weapon] ${id} failed to load:`, e);
        delete this.loading[id];
        return false;
      }
    })();
    return this.loading[id];
  }

  /** Background-load every Armory weapon, one after another. */
  async preloadAll() {
    for (const id of SHOP_WEAPONS) if (GUN_GLB[id]) await this.ensure(id);
  }

  owns(id) { return this.slots.includes(id); }

  /** Armory purchase: replaces the weapon in that slot (primary / secondary) and switches to it. */
  // ---------------- grenade toss (procedural arm) ----------------
  _buildThrowRig() {
    const root = new THREE.Group();
    const arm = buildArm(root, V(0.3, -0.36, 0.12), 'pistol');
    arm.elbowOffset.set(0.1, -0.1, 0.04);
    const gren = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), mat(0x3d4a2c, 0.55, 0.3));
    body.scale.set(1, 1.25, 1);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.022, 10), mat(0x8a8a80, 0.4, 0.8));
    top.position.y = 0.048;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.012), mat(0x8a8a80, 0.4, 0.8));
    lever.position.set(0.025, 0.03, 0);
    gren.add(body, top, lever);
    gren.position.set(0, 0.035, -0.02);
    arm.hand.add(gren);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    root.visible = false;
    this.scene.add(root);
    this.throwRig = { root, arm, gren };
  }

  get throwing() { return this.throwT >= 0; }

  /** Start a grenade toss; `onRelease` fires when the grenade leaves the hand. */
  startThrow(onRelease) {
    if (this.throwT >= 0 || this.switchState) return false;
    if (!this.throwRig) this._buildThrowRig();
    this.cancelReload();
    this.game.audio.stopAuto();
    this.autoSoundActive = false;
    this.throwT = 0;
    this.throwCb = onRelease;
    this.throwRig.gren.visible = true;
    this.game.audio.ui('pin');
    return true;
  }

  _updateThrow(dt) {
    if (this.throwT < 0) return;
    const T = (this.throwT += dt), R = this.throwRig;
    const D = 0.8;
    if (T >= D) { this.throwT = -1; R.root.visible = false; return; }
    R.root.visible = T > 0.06 && T < 0.66;
    // hand path: rise from below -> wind up behind the shoulder -> whip forward -> drop away
    const keys = [
      [0.06, V(0.2, -0.4, -0.42)],     // comes up from below, grenade in hand
      [0.2, V(0.19, -0.12, -0.4)],
      [0.34, V(0.24, 0.0, -0.3)],      // wind up beside the head
      [0.45, V(0.04, 0.0, -0.72)],     // whip forward, release
      [0.66, V(0.06, -0.45, -0.6)],    // follow through and drop away
    ];
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (T >= keys[i][0] && T <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    const k = b[0] > a[0] ? easeInOut(THREE.MathUtils.clamp((T - a[0]) / (b[0] - a[0]), 0, 1)) : 1;
    this._hand.lerpVectors(a[1], b[1], k);
    R.arm.set(this._hand);
    R.arm.hand.rotation.set(-0.6 + T * 1.5, 0.2, -0.2);
    if (this.throwCb && T >= 0.42) {
      const cb = this.throwCb; this.throwCb = null;
      R.gren.visible = false;
      cb();
    }
  }

  primaryId() { return this.slots.find((id) => WEAPON_DEFS[id].slot !== 'secondary') || null; }
  secondaryId() { return this.slots.find((id) => WEAPON_DEFS[id].slot === 'secondary') || null; }
  /** The weapon that taking `id` would replace (same slot), or null. */
  slotRival(id) { return WEAPON_DEFS[id].slot === 'secondary' ? this.secondaryId() : this.primaryId(); }

  /** Bolt on / take off the red dot (swaps the aiming transform). */
  setRedDot(id, on) {
    const w = this.weapons[id];
    if (!w || !w.model.dot) return false;
    w.redDot = !!on;
    const m = w.model;
    m.dot.visible = w.redDot;
    const a = w.redDot ? m.adsDot : m.adsBase;
    m.adsPos.copy(a.pos);
    m.adsQuat = a.quat ? a.quat.clone() : null;
    return true;
  }

  giveWeapon(id, carry = null) {
    const def = WEAPON_DEFS[id], w = this.weapons[id];
    if (!def || !w || this.slots.includes(id)) return false;
    w.reset();
    this.setRedDot(id, carry ? carry.redDot : false);
    if (carry) { w.mag = carry.mag; w.reserve = carry.reserve; }
    const isSec = def.slot === 'secondary';
    const idx = this.slots.findIndex((sid) => (WEAPON_DEFS[sid].slot === 'secondary') === isSec);
    if (idx >= 0) this.slots[idx] = id;
    else if (isSec) this.slots.push(id);
    else this.slots.unshift(id);
    this.cancelReload();
    this.switchState = null;
    if (!this.slots.includes(this.currentId)) {
      // the weapon in hand was traded in: swap instantly, then play the draw animation
      this.equip(id);
      this.switchState = 'raise'; this.switchTimer = 0;
      if (w.model.isGLB) playOverlay(w.model, 'draw', this._raiseTime());
    } else this.switchTo(id, true);
    return true;
  }

  reset() {
    for (const w of Object.values(this.weapons)) { w.reset(); if (w.model.dot) this.setRedDot(w.id, false); }
    this.throwT = -1; this.throwCb = null;
    if (this.throwRig) this.throwRig.root.visible = false;
    this.slots = ['ak47'];
    this.adsT = 0; this.sprintT = 0;
    this.reloading = false; this.reloadTimer = 0; this.reloadDur = 2; this.reloadEvents = 0;
    this.switchState = null; this.switchTimer = 0; this.pendingId = null;
    this.nextFire = 0; this.bloom = 0; this.spread = 0;
    this.flashTimer = 0; this.autoSoundActive = false;
    this.shotsFired = 0; this.shotsHit = 0;
    Object.assign(this.kick, { z: 0, vz: 0, rx: 0, vrx: 0, x: 0, vx: 0 });
    this.sway.set(0, 0); this.swayTarget.set(0, 0);
    this.currentId = 'ak47';
    this.cancelReload();
    this.equip('ak47');
  }

  _makeFlash(scale) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({
      map: this.game.effects.flashTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), m);
    const side1 = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), m);
    side1.rotation.y = Math.PI / 2; side1.position.z = -0.12;
    const side2 = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.34), m);
    side2.rotation.x = Math.PI / 2; side2.position.z = -0.12;
    g.add(front, side1, side2);
    g.scale.setScalar(scale);
    g.userData.baseScale = scale;
    g.visible = false;
    return g;
  }

  get current() { return this.weapons[this.currentId]; }
  get hasSecondary() { return this.slots.some((id) => WEAPON_DEFS[id].slot === 'secondary'); }
  slotId(i) { return this.slots[i]; }

  equip(id) {
    this.currentId = id;
    for (const w of Object.values(this.weapons)) w.model.root.visible = w.id === id;
  }

  _raiseTime() { const w = this.current; return w.model.actions && w.model.actions.draw ? (w.def.drawTime || 0.4) : 0.25; }

  switchTo(id, force = false) {
    if (!this.weapons[id] || (!force && (!this.slots.includes(id) || this.switchState || this.throwT >= 0))) return;
    if (id === this.currentId) return;
    this.cancelReload();
    this.game.audio.stopAuto();
    this.autoSoundActive = false;
    this.switchState = 'lower';
    this.switchTimer = 0;
    this.pendingId = id;
    this.game.audio.ui('switch');
  }

  cycle(dir) {
    if (this.slots.length < 2) return;
    const i = this.slots.indexOf(this.currentId);
    this.switchTo(this.slots[(i + dir + this.slots.length) % this.slots.length]);
  }

  toggleFireMode() {
    const w = this.current;
    if (w.def.modes.length < 2) return;
    const i = w.def.modes.indexOf(w.mode);
    w.mode = w.def.modes[(i + 1) % w.def.modes.length];
    this.game.audio.stopAuto();
    this.autoSoundActive = false;
    this.game.audio.ui('click');
  }



  refillAll() {
    for (const id of this.slots) { const w = this.weapons[id]; w.mag = w.def.magSize; w.reserve = w.def.reserveMax; }
    this.cancelReload();
  }

  /** Ammo pickup — returns true if anything was added. */
  addAmmo() {
    let added = false;
    for (const id of this.slots) {
      const w = this.weapons[id];
      const before = w.reserve;
      w.reserve = Math.min(w.def.reserveMax, w.reserve + w.def.pickupAmmo);
      if (w.reserve > before) added = true;
    }
    return added;
  }

  startReload() {
    const w = this.current;
    if (this.reloading || this.switchState || this.throwT >= 0 || w.mag >= w.def.magSize || w.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = 0;
    const m = w.model;
    const empty = w.mag === 0 && m.actions && m.actions.reloadEmpty;
    this.reloadDur = empty ? (w.def.reloadEmptyTime || w.def.reloadTime) : w.def.reloadTime;
    this.reloadEvents = 0;
    this.reloadSeq = null;
    this.game.audio.stopAuto();
    this.autoSoundActive = false;
    this.game.audio.reload(this.reloadDur);
    if (m.isGLB) {
      if (m.actions && m.actions.reloadIn && m.actions.reloadOut && m.actions.reload) {
        // shotgun: open -> load -> close, stretched over the reload time
        const parts = ['reloadIn', 'reload', 'reloadOut'];
        const lens = parts.map((k) => m.actions[k].getClip().duration);
        const tot = lens.reduce((a, b) => a + b, 0);
        let t = 0;
        this.reloadSeq = parts.map((k, i) => { const d = this.reloadDur * lens[i] / tot; const e = { key: k, start: t, dur: d }; t += d; return e; });
        this.reloadSeqIdx = 0;
        playOverlay(m, 'reloadIn', this.reloadSeq[0].dur);
      } else playOverlay(m, empty ? 'reloadEmpty' : 'reload', this.reloadDur);
    }
  }

  cancelReload() {
    const wasReloading = this.reloading;
    this.reloading = false;
    this.reloadTimer = 0;
    for (const w of Object.values(this.weapons)) {
      const m = w.model;
      if (m.isGLB) {
        const a = m.actions || {};
        if (wasReloading && w === this.current && m.overlay && [a.reload, a.reloadEmpty, a.reloadIn, a.reloadOut].includes(m.overlay)) m.overlayLeft = 0;
        continue;
      }
      m.mag.position.copy(m.magBase); m.mag.rotation.x = m.magRotX; m.mag.visible = true;
      m.bolt.position.z = 0;
      m.leftArm.set(m.leftRest);
    }
  }

  _finishReload() {
    const w = this.current;
    const take = Math.min(w.def.magSize - w.mag, w.reserve);
    w.mag += take;
    w.reserve -= take;
    this.cancelReload();
  }

  setSwayInput(dx, dy) {
    const k = 0.00055 * (1 - 0.7 * this.adsT);
    this.swayTarget.set(
      THREE.MathUtils.clamp(dx * k, -0.07, 0.07),
      THREE.MathUtils.clamp(dy * k, -0.05, 0.05)
    );
  }

  update(dt, input) {
    const g = this.game, p = g.player;
    let w = this.current;

    // ---- switching (lower old weapon, raise new one; GLB plays its Draw clip)
    if (this.switchState === 'lower') {
      this.switchTimer += dt;
      if (this.switchTimer >= 0.22) {
        this.equip(this.pendingId);
        this.switchState = 'raise';
        this.switchTimer = 0;
        w = this.current;
        if (w.model.isGLB) playOverlay(w.model, 'draw', this._raiseTime());
      }
    } else if (this.switchState === 'raise') {
      this.switchTimer += dt;
      if (this.switchTimer >= this._raiseTime()) this.switchState = null;
    }
    const def = w.def;

    // ---- ADS & sprint blend
    this._updateThrow(dt);
    const canADS = !p.sprinting && !this.switchState && this.throwT < 0;
    this.adsT = THREE.MathUtils.clamp(this.adsT + ((input.adsHeld && canADS) ? 1 : -1) * dt / 0.15, 0, 1);
    this.sprintT += ((p.sprinting ? 1 : 0) - this.sprintT) * (1 - Math.exp(-10 * dt));
    const e = easeInOut(this.adsT);

    // ---- reload
    if (this.reloading) {
      this.reloadTimer += dt;
      if (this.reloadSeq) {
        const nx = this.reloadSeq[this.reloadSeqIdx + 1];
        if (nx && this.reloadTimer >= nx.start) { this.reloadSeqIdx++; playOverlay(w.model, nx.key, nx.dur); }
      }
      if (this.reloadTimer >= this.reloadDur) this._finishReload();
    }

    // ---- pose (before firing so the muzzle position is current)
    if (w.model.isGLB) animateGLB(w.model, dt, { sprint: p.sprinting, ads: this.adsT > 0.3, moving: p.speed2D > 1 && p.grounded && e < 0.5, speed: p.speed2D });
    this._updatePose(dt, w, e);

    // ---- firing
    if (!input.fireHeld && this.autoSoundActive) { g.audio.stopAuto(); this.autoSoundActive = false; }
    const wantsFire = w.mode === 'auto' ? input.fireHeld : input.firePressed;
    if (wantsFire) {
      if (p.sprinting) p.cancelSprint();
      const ready = !this.reloading && !this.switchState && this.throwT < 0 && this.sprintT < 0.35 && g.time >= this.nextFire;
      if (ready) {
        if (w.mag > 0) this._fire(w, e);
        else if (input.firePressed) {
          if (w.reserve > 0) this.startReload();
          else g.audio.dry();
        }
      }
    }
    if (w.mag === 0 && this.autoSoundActive) { g.audio.stopAuto(); this.autoSoundActive = false; }
    // COD-style auto reload when the mag runs dry
    if (w.mag === 0 && w.reserve > 0 && !this.reloading && !this.switchState && this.throwT < 0 && g.time > this.nextFire + 0.2) this.startReload();

    // ---- spread / bloom
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    const mv = Math.min(1.6, p.speed2D / 7);
    let s = def.hipSpread + mv * def.moveSpread + this.bloom + (p.grounded ? 0 : 0.05);
    if (p.crouching) s *= 0.7;
    this.spread = s * (1 - e);

    // ---- FOV zoom (75 -> 58) for a clear sight picture downrange
    const cam = g.camera;
    const fov = THREE.MathUtils.lerp(75, 58, e) + this.sprintT * 4 * (1 - e);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const vfov = THREE.MathUtils.lerp(62, 50, e);
    if (Math.abs(this.vmCamera.fov - vfov) > 0.01) { this.vmCamera.fov = vfov; this.vmCamera.updateProjectionMatrix(); }

    // ---- flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) { w.flash.visible = false; this.flashLight.intensity = 0; }
    }
  }

  /** 3-stage procedural reload (fractions of the reload time; the reload sound is stretched to match):
   *   1) 0.00–0.125  gun tilts left and dips
   *   2) 0.075–0.64  left hand grabs the mag, old mag drops out (~0.25), fresh mag rocks in, click (~0.62)
   *   3) 0.64–0.875  left hand reaches over to the charging handle, racks it back and lets it slam home (~0.745)
   *  then the gun returns to the ready position (0.80–1.00). */
  _reloadPose(m, t, pos, rot) {
    // stage 1: the gun swings left toward the centre, muzzle up, canted so the mag well faces the
    // camera (rolled clockwise — rolling the other way would hide the magazine behind the receiver)
    const tilt = smooth(0, 0.125, t) * (1 - smooth(0.8, 1.0, t));
    rot.x += 0.32 * tilt; rot.y += 0.28 * tilt; rot.z -= 0.55 * tilt;
    pos.x -= 0.08 * tilt; pos.y += 0.065 * tilt; pos.z += 0.06 * tilt;
    // stage 3: un-cant and turn the right side (charging handle) toward the camera
    const s3 = smooth(0.62, 0.7, t) * (1 - smooth(0.76, 0.86, t));
    rot.z += 0.4 * s3; rot.y += 0.22 * s3; rot.x -= 0.1 * s3; pos.y += 0.02 * s3;
    // magazine
    let drop, visible = true;
    if (t < 0.275) drop = smooth(0.2, 0.275, t) * 0.35;
    else if (t < 0.45) { drop = 0.4; visible = false; }
    else drop = 0.4 * (1 - smooth(0.45, 0.625, t));
    m.mag.visible = visible;
    m.mag.position.set(m.magBase.x, m.magBase.y - drop, m.magBase.z + drop * (t < 0.3 ? -0.15 : 0.1));
    m.mag.rotation.x = m.magRotX + (t < 0.3 ? 0.35 * smooth(0.2, 0.275, t) : 0.4 * (1 - smooth(0.5, 0.62, t)));

    // bolt / charging handle (pull back 0.70–0.735, snap forward 0.735–0.75)
    const pull = smooth(0.7, 0.735, t) * (1 - smooth(0.735, 0.75, t));
    m.bolt.position.z = m.boltTravel * pull;

    // left hand
    const magHand = _v2.copy(m.magGrab).applyEuler(m.mag.rotation).add(m.mag.position);
    const handle = _v1.copy(m.handle); handle.z += m.boltTravel * pull;
    const hand = this._hand;
    if (t < 0.2) hand.lerpVectors(m.leftRest, magHand, smooth(0.075, 0.175, t));
    else if (t < 0.64) hand.copy(magHand);
    else if (t < 0.75) hand.lerpVectors(magHand.copy(m.magGrab).applyEuler(m.mag.rotation).add(m.mag.position), handle, smooth(0.64, 0.7, t));
    else hand.lerpVectors(handle, m.leftRest, smooth(0.75, 0.875, t));
    m.leftArm.set(hand);

    // tactile events: mag seats, bolt slams home
    if (this.reloadEvents === 0 && t >= 0.625) { this.reloadEvents = 1; this.kick.vrx += 0.5; this.kick.vz += 0.4; }
    if (this.reloadEvents === 1 && t >= 0.745) { this.reloadEvents = 2; this.kick.vz += 0.8; this.kick.vx += 0.2; }
  }

  _updatePose(dt, w, e) {
    const g = this.game, p = g.player, m = w.model, t = g.time;
    const pos = this._pos, rot = this._rot;
    pos.lerpVectors(m.hipPos, m.adsPos, e);
    rot.set(0, 0, 0);
    const glb = m.isGLB;

    // sprint pose (the GLB has its own Run clip, so only a hint of it)
    const s = this.sprintT * (1 - e) * (glb ? 0.25 : 1);
    pos.x += -0.06 * s; pos.y += -0.06 * s; pos.z += 0.03 * s;
    rot.x += -0.3 * s; rot.y += 0.55 * s; rot.z += 0.35 * s;
    if (s > 0.01) { pos.x += Math.sin(p.bobPhase) * 0.025 * s; pos.y += Math.abs(Math.sin(p.bobPhase)) * 0.02 * s; }

    if (this.reloading && !glb) this._reloadPose(m, this.reloadTimer / this.reloadDur, pos, rot);

    // switch
    if (this.switchState) {
      const raise = this._raiseTime();
      const k = this.switchState === 'lower' ? this.switchTimer / 0.22 : 1 - this.switchTimer / raise;
      const kk = easeInOut(THREE.MathUtils.clamp(k, 0, 1)) * (glb && this.switchState === 'raise' ? 0.3 : 1);
      pos.y -= 0.28 * kk; rot.x -= 0.8 * kk;
    }

    // grenade toss: the gun dips out of the way
    if (this.throwT >= 0) {
      const k = smooth(0, 0.12, this.throwT) * (1 - smooth(0.58, 0.8, this.throwT));
      pos.y -= 0.32 * k; pos.x += 0.05 * k; rot.x -= 0.7 * k; rot.z -= 0.2 * k;
    }

    // bob, breathing, landing
    const bs = (1 - 0.85 * e) * (glb ? 0.5 : 1);
    pos.x += p.bobX * 0.5 * bs;
    pos.y += p.bobY * 0.6 * bs - p.landDip * 0.35;
    rot.z += p.bobX * 0.6 * bs;
    const br = (1 - 0.75 * e) * (glb ? 0.4 : 1);
    pos.y += Math.sin(t * 1.6) * 0.0025 * br;
    pos.x += Math.sin(t * 0.8) * 0.0015 * br;

    // sway lag
    this.sway.x += (this.swayTarget.x - this.sway.x) * (1 - Math.exp(-10 * dt));
    this.sway.y += (this.swayTarget.y - this.sway.y) * (1 - Math.exp(-10 * dt));
    this.swayTarget.multiplyScalar(Math.exp(-12 * dt));
    rot.y += this.sway.x; rot.x += this.sway.y;
    pos.x += this.sway.x * 0.04; pos.y -= this.sway.y * 0.04;

    // recoil spring-damper
    const K = 220, C = 22, kk = this.kick;
    kk.vz += (-K * kk.z - C * kk.vz) * dt; kk.z += kk.vz * dt;
    kk.vrx += (-K * kk.rx - C * kk.vrx) * dt; kk.rx += kk.vrx * dt;
    kk.vx += (-K * kk.x - C * kk.vx) * dt; kk.x += kk.vx * dt;
    pos.z += kk.z; pos.x += kk.x; rot.x += kk.rx;

    this.pivot.position.copy(pos);
    _q1.setFromEuler(_e1.set(rot.x, rot.y, rot.z));
    if (m.adsQuat) _q2.slerpQuaternions(Q_ID, m.adsQuat, e); else _q2.identity();
    this.pivot.quaternion.copy(_q2).multiply(_q1);
    this.pivot.updateMatrixWorld(true);
  }

  getMuzzleWorld(target) {
    this.current.model.muzzle.getWorldPosition(target);   // in viewmodel (camera) space
    return this.game.camera.localToWorld(target);
  }

  _fire(w, e) {
    const g = this.game, p = g.player, def = w.def;
    this.nextFire = g.time + 60 / def.rpm;
    w.mag--;
    this.shotsFired++;

    if (w.mode === 'auto') { g.audio.autoShot(def); this.autoSoundActive = true; }
    else g.audio.singleShot(def);

    // hitscan ray with spread (zero spread when fully aimed)
    const cam = g.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(_origin);
    cam.getWorldDirection(_dir);
    const spread = this.adsT > 0.9 ? 0 : this.spread;
    if (spread > 0) {
      _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    }
    const pellets = def.pellets || 1;
    const baseDir = _v3.copy(_dir);
    let hitAny = false, hitEnemy = null;
    const merged = { headshot: false, killed: false };
    const targets = g.getHitTargets();
    this.getMuzzleWorld(_v1);
    for (let k = 0; k < pellets; k++) {
      if (pellets > 1) {
        _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
        _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * def.pelletSpread * (1 - 0.3 * e);
        _dir.copy(baseDir).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
      }
      this.raycaster.set(_origin, _dir);
      this.raycaster.far = pellets > 1 ? 60 : 300;
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length) {
        const h = hits[0];
        _end.copy(h.point);
        const ud = h.object.userData;
        if (ud.enemy) {
          const part = ud.part;
          const res = ud.enemy.takeDamage(def.damage * (part === 'head' ? def.headMult : 1), part, h.point, _dir);
          if (res) {
            hitAny = true; hitEnemy = ud.enemy;
            merged.headshot = merged.headshot || !!res.headshot; merged.killed = merged.killed || !!res.killed;
            if (pellets === 1) g.onEnemyHit(ud.enemy, res);
          }
        } else {
          const n = (h.face && h.instanceId === undefined)
            ? _v2.copy(h.face.normal).transformDirection(h.object.matrixWorld)
            : _v2.copy(_dir).negate();
          const surf = h.object.userData.surface;
          g.effects.spawnImpact(h.point, n, surf);
          if (surf === 'metal') { if (k < 2) g.audio.ricochet(h.point); }
          else if (k < 4) g.effects.addDecal(h.point, n);
        }
      } else {
        _end.copy(_origin).addScaledVector(_dir, pellets > 1 ? 40 : 250);
      }
      // tracer from the barrel
      if (k < 3) g.effects.spawnTracer(_v1, _end, 0xffd36b, 340);
    }
    if (hitAny) this.shotsHit++;
    if (hitAny && pellets > 1) g.onEnemyHit(hitEnemy, merged);   // one hitmarker/sound per shell, not per pellet
    g.effects.playerMuzzleFlash(_v1);

    // muzzle flash (viewmodel)
    const f = w.flash;
    f.visible = true;
    f.rotation.z = Math.random() * Math.PI * 2;
    f.scale.setScalar(f.userData.baseScale * (0.8 + Math.random() * 0.5) * (1 - 0.35 * e));
    this.flashTimer = 0.05;
    w.model.muzzle.getWorldPosition(this.flashLight.position);
    this.flashLight.intensity = 6;

    // recoil
    this.bloom = Math.min(def.maxBloom, this.bloom + def.bloomPerShot);
    const adsMul = 1 - 0.35 * e, crouchMul = p.crouching ? 0.8 : 1;
    p.addRecoil(def.recoilPitch * adsMul * crouchMul * (0.85 + Math.random() * 0.3),
      (Math.random() - 0.5) * 2 * def.recoilYaw * adsMul);
    const glbScale = w.model.isGLB ? 0.6 : 1;   // the GLB Shot clip adds its own kick
    this.kick.vz += def.kickZ * 28 * (1 - 0.4 * e) * glbScale;
    this.kick.vrx += def.kickRot * 28 * (1 - 0.5 * e) * glbScale;
    this.kick.vx += (Math.random() - 0.5) * 0.25 * (1 - 0.6 * e);

    if (w.model.isGLB && !this.reloading) {
      const key = (this.adsT > 0.3 && w.model.actions.aimFire) ? 'aimFire' : 'fire';
      const d = def.fireAnim || 0;
      playOverlay(w.model, key, d, false) || playOverlay(w.model, key, d);
    }
  }
}
