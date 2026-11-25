// =========================================================
// Effects — particles (blood, dust, sparks), bullet tracers,
// bullet-hole decals and pooled muzzle-flash lights.
// All pools are fixed-size so no allocations happen mid-fight
// and the light count never changes (no shader recompiles).
// =========================================================
import * as THREE from 'three';

export function createFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,235,1)');
  grd.addColorStop(0.18, 'rgba(255,225,130,0.95)');
  grd.addColorStop(0.45, 'rgba(255,145,40,0.45)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
    g.save();
    g.translate(64, 64);
    g.rotate(a);
    const lg = g.createLinearGradient(0, 0, 62, 0);
    lg.addColorStop(0, 'rgba(255,235,160,0.9)');
    lg.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, -5); g.lineTo(62, 0); g.lineTo(0, 5); g.closePath(); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createBulletHoleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(8,8,8,1)');
  grd.addColorStop(0.22, 'rgba(15,14,12,0.95)');
  grd.addColorStop(0.35, 'rgba(60,55,48,0.7)');
  grd.addColorStop(0.7, 'rgba(70,65,55,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(20,18,15,0.6)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    g.beginPath(); g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6);
    g.lineTo(32 + Math.cos(a) * (14 + Math.random() * 10), 32 + Math.sin(a) * (14 + Math.random() * 10));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------- blood textures (procedural, no files needed) ----------------
/** Dark burnt scorch mark left on the ground by an explosion. */
function createScorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let seed = 7;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(8,6,5,0.95)'); grd.addColorStop(0.45, 'rgba(14,11,9,0.85)');
  grd.addColorStop(0.75, 'rgba(25,20,16,0.4)'); grd.addColorStop(1, 'rgba(30,25,20,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {               // radial soot streaks
    const a = R() * Math.PI * 2, r0 = 20 + R() * 40, r1 = r0 + 30 + R() * 70;
    g.strokeStyle = `rgba(5,4,3,${0.25 + R() * 0.4})`; g.lineWidth = 1 + R() * 4;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1); g.stroke();
  }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.5})`; g.beginPath(); g.arc(128 + (R() - 0.5) * 200, 128 + (R() - 0.5) * 200, R() * 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

/** Blood splatter decal: a main blob, satellite droplets and streaks in one direction. */
export function createBloodSplatTexture(seed = 1, streaky = true) {
  const R = rnd(seed * 7919 + 3);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(70,0,2,${a})`);
    grd.addColorStop(0.65, `rgba(105,4,6,${a * 0.95})`);
    grd.addColorStop(1, 'rgba(110,5,8,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  // main irregular blob
  for (let i = 0; i < 14; i++) blob(128 + (R() - 0.5) * 50, 128 + (R() - 0.5) * 50, 22 + R() * 30, 0.9);
  // streaks (spray direction = +x)
  if (streaky) {
    for (let i = 0; i < 12; i++) {
      const a = (R() - 0.5) * 1.1, len = 50 + R() * 70, w = 2 + R() * 5;
      g.save(); g.translate(128, 128); g.rotate(a);
      const grd = g.createLinearGradient(20, 0, len + 20, 0);
      grd.addColorStop(0, 'rgba(95,3,5,0.9)'); grd.addColorStop(1, 'rgba(95,3,5,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(20, -w); g.lineTo(20 + len, 0); g.lineTo(20, w); g.closePath(); g.fill();
      g.restore();
      blob(128 + Math.cos(a) * (len + 20), 128 + Math.sin(a) * (len + 20), 3 + R() * 5, 0.95);
    }
  }
  // droplets
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, d = 40 + R() * 80;
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1.5 + R() * 4.5, 0.9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 8-frame flipbook of a blood burst (spray expanding and thinning out). */
function createBloodFlipbook() {
  const F = 8, S = 128;
  const c = document.createElement('canvas');
  c.width = S * F; c.height = S;
  const g = c.getContext('2d');
  const R = rnd(42);
  const drops = Array.from({ length: 34 }, () => ({ a: R() * Math.PI * 2, v: 0.35 + R() * 0.65, r: 2 + R() * 6 }));
  for (let f = 0; f < F; f++) {
    const t = (f + 1) / F, cx = f * S + S / 2, cy = S / 2;
    const alpha = Math.pow(1 - t, 0.7);
    // core puff
    const core = 10 + t * 38;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, core);
    grd.addColorStop(0, `rgba(150,8,10,${0.95 * alpha})`);
    grd.addColorStop(0.5, `rgba(120,6,8,${0.7 * alpha})`);
    grd.addColorStop(1, 'rgba(90,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, core, 0, Math.PI * 2); g.fill();
    // flying droplets with short trails
    for (const d of drops) {
      const dist = d.v * t * 58;
      const x = cx + Math.cos(d.a) * dist, y = cy + Math.sin(d.a) * dist + t * t * 14;
      g.strokeStyle = `rgba(130,6,8,${alpha})`;
      g.lineWidth = d.r * (1 - t * 0.6);
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx + Math.cos(d.a) * dist * 0.75, cy + Math.sin(d.a) * dist * 0.75); g.lineTo(x, y); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / F, 1);
  return { tex, frames: F };
}

const PARTICLE_VS = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute vec3 pcolor;
  uniform float uScale;
  varying float vA;
  varying vec3 vC;
  void main() {
    vA = alpha; vC = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = alpha <= 0.001 ? 0.0 : size * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const PARTICLE_FS = /* glsl */`
  varying float vA;
  varying vec3 vC;
  void main() {
    if (vA <= 0.001) discard;
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, d));
  }`;


/** Soft round glow (flash billboards). */
function createRadialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,240,200,0.8)');
  grd.addColorStop(0.55, 'rgba(255,170,80,0.18)'); grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Fireball core: noise-displaced sphere; colour follows heat (yellow -> orange -> dark smoke) and breaks up as it cools. */
function fireballMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uSeed;
      varying vec3 vN; varying vec3 vV; varying float vNoise;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        float n = noise(position * 2.3 + uSeed + vec3(0.0, -uTime * 4.0, 0.0)) * 0.65 + noise(position * 5.3 - uSeed) * 0.35;
        vNoise = n;
        vec3 p = position * (0.72 + 0.5 * n);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uT;
      varying vec3 vN; varying vec3 vV; varying float vNoise;
      void main() {
        float fres = clamp(abs(dot(vN, vV)), 0.0, 1.0);
        float heat = clamp(1.05 - uT * 1.2 + (vNoise - 0.5) * 0.7 + fres * 0.3, 0.0, 1.0);
        vec3 smoke = vec3(0.07, 0.06, 0.055);
        vec3 orange = vec3(1.0, 0.42, 0.07) * 1.35;
        vec3 yellow = vec3(1.0, 0.92, 0.6) * 1.6;
        vec3 col = heat > 0.5 ? mix(orange, yellow, (heat - 0.5) * 2.0) : mix(smoke, orange, heat * 2.0);
        float a = smoothstep(0.0, 0.5, fres) * (1.0 - smoothstep(0.6, 1.0, uT));
        a *= smoothstep(0.12, 0.42, vNoise + 0.35 - uT * 0.3);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
}

class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.density = 1;
    this.cursor = 0;
    this.dirty = false;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.bounce = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('pcolor', this.aCol);
    geo.setAttribute('size', this.aSize);
    geo.setAttribute('alpha', this.aAlpha);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, r, g, b, size, life, gravity = 0, grow = 0, alpha = 1, drag = 0, bounce = 0) {
    if (this.density < 1 && Math.random() > this.density) return;   // graphics quality: particle budget
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.size[i] = this.baseSize[i] = size;
    this.alpha[i] = this.baseAlpha[i] = alpha;
    this.life[i] = this.maxLife[i] = life;
    this.grav[i] = gravity; this.grow[i] = grow; this.drag[i] = drag; this.bounce[i] = bounce;
    this.dirty = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const i3 = i * 3;
      this.vel[i3 + 1] += this.grav[i] * dt;
      const damp = 1 / (1 + this.drag[i] * dt);
      this.vel[i3] *= damp; this.vel[i3 + 1] *= damp; this.vel[i3 + 2] *= damp;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.01) {
        this.pos[i3 + 1] = 0.01;
        // sparks / debris bounce off the deck, everything else settles
        if (this.bounce[i] > 0 && this.vel[i3 + 1] < -1.2) { this.vel[i3 + 1] *= -this.bounce[i]; this.vel[i3] *= 0.62; this.vel[i3 + 2] *= 0.62; }
        else { this.vel[i3 + 1] = 0; this.vel[i3] *= 0.5; this.vel[i3 + 2] *= 0.5; }
      }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, t * 1.6);
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - t));
    }
    if (any || this.dirty) {
      this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
      this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
      this.dirty = any;
    }
  }

  clear() { this.life.fill(0); this.alpha.fill(0); this.dirty = true; }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.soft = new ParticlePool(scene, 1000, false);
    this.glow = new ParticlePool(scene, 500, true);
    this.flashTex = createFlashTexture();

    // ---- tracers
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(0.028, 0.028, 1);
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(tGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      // soft outer glow so rounds read as streaks of light through the night fog
      const halo = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      halo.scale.set(4, 4, 1);
      mesh.add(halo);
      this.tracers.push({ mesh, halo, active: false, from: new THREE.Vector3(), dir: new THREE.Vector3(), total: 0, traveled: 0, speed: 300, len: 3 });
    }
    this.tracerIdx = 0;

    // ---- decals
    this.decals = [];
    const dMat = new THREE.MeshBasicMaterial({ map: createBulletHoleTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const dGeo = new THREE.PlaneGeometry(0.13, 0.13);
    for (let i = 0; i < 100; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.decals.push(m);
    }
    this.decalIdx = 0;

    // ---- blood: flipbook bursts, wall splats, ground pools
    const fb = createBloodFlipbook();
    this.bloodFrames = fb.frames;
    this.bloodBursts = [];
    for (let i = 0; i < 12; i++) {
      const tex = fb.tex.clone(); tex.needsUpdate = true;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.visible = false;
      sp.renderOrder = 3;
      scene.add(sp);
      this.bloodBursts.push({ sprite: sp, tex, t: 0, dur: 0.3, active: false });
    }
    this.burstIdx = 0;
    this.splatMats = [1, 2, 3, 4].map((k) => new THREE.MeshBasicMaterial({
      map: createBloodSplatTexture(k, true), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    }));
    this.poolMat = new THREE.MeshBasicMaterial({
      map: createBloodSplatTexture(9, false), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    });
    const splatGeo = new THREE.PlaneGeometry(1, 1);
    this.splats = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(splatGeo, this.splatMats[i % 4]);
      m.visible = false; m.renderOrder = 1;
      scene.add(m);
      this.splats.push(m);
    }
    this.splatIdx = 0;
    this.pools = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(splatGeo, this.poolMat);
      m.visible = false; m.renderOrder = 1;
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
      this.pools.push({ mesh: m, t: 0, size: 1, active: false });
    }
    this.poolIdx = 0;

    // ---- pooled muzzle flash lights + sprites (fixed light count)
    this.enemyLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 10, 2);
      scene.add(l);
      this.enemyLights.push({ light: l, t: 0 });
    }
    this.enemyLightIdx = 0;
    this.playerLight = { light: new THREE.PointLight(0xffb060, 0, 14, 2), t: 0 };
    scene.add(this.playerLight.light);
    this.boomLight = { light: new THREE.PointLight(0xffaa33, 0, 28, 2), t: 0 };
    scene.add(this.boomLight.light);

    this.flashSprites = [];
    const sMat = new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(sMat);
      s.visible = false;
      s.scale.setScalar(0.55);
      scene.add(s);
      this.flashSprites.push({ sprite: s, t: 0 });
    }
    this.spriteIdx = 0;

    this._v = new THREE.Vector3();
    this._initExplosionFx();
  }

  _initExplosionFx() {
    // scorch marks (pool)
    const tex = createScorchTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.scorches = [];
    this.scorchIdx = 0;
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; m.renderOrder = 1;
      this.scene.add(m);
      this.scorches.push(m);
    }
    // procedural blasts (pool): noisy fireball core, ground shockwave ring, flash billboard
    const coreGeo = new THREE.IcosahedronGeometry(1, 4);
    const ringGeo = new THREE.RingGeometry(0.8, 1, 72).rotateX(-Math.PI / 2);
    const glow = createRadialTexture();
    this.blasts = [];
    this.blastIdx = 0;
    for (let i = 0; i < 5; i++) {
      const core = new THREE.Mesh(coreGeo, fireballMaterial());
      core.visible = false; core.frustumCulled = false; core.renderOrder = 4;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd6a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
      ring.visible = false; ring.renderOrder = 3;
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffd890, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      flash.visible = false; flash.renderOrder = 5;
      this.scene.add(core, ring, flash);
      this.blasts.push({ core, ring, flash, t: 99, size: 1, y0: 0 });
    }
  }

  /** Kick off one pooled blast (fireball 0.35 s, shockwave 0.5 s, flash 0.1 s). */
  _spawnBlast(pos, size, floorY) {
    const B = this.blasts[this.blastIdx];
    this.blastIdx = (this.blastIdx + 1) % this.blasts.length;
    B.t = 0; B.size = size; B.y0 = pos.y;
    B.core.position.copy(pos);
    B.core.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    B.core.material.uniforms.uSeed.value = Math.random() * 50;
    B.core.visible = true;
    B.ring.position.set(pos.x, floorY + 0.04, pos.z);
    B.ring.visible = true;
    B.flash.position.copy(pos);
    B.flash.visible = true;
  }

  _updateBlasts(dt) {
    for (const B of this.blasts) {
      if (B.t > 2) continue;
      B.t += dt;
      const t = B.t, S = B.size;
      // fireball core: explosive expansion, yellow -> orange -> dark smoke, gone at 0.35 s
      const tc = t / 0.35;
      if (tc < 1) {
        const k = 1 - Math.pow(1 - tc, 3);
        B.core.scale.setScalar(S * 0.55 * (0.22 + 0.78 * k) * (1 + 0.2 * tc));
        B.core.position.y = B.y0 + S * 0.12 * k;
        const u = B.core.material.uniforms;
        u.uT.value = tc; u.uTime.value = t;
      } else B.core.visible = false;
      // shockwave ring sweeping along the deck
      const tr = t / 0.5;
      if (tr < 1) {
        const k = 1 - Math.pow(1 - tr, 2.2);
        B.ring.scale.setScalar(0.4 + S * 2.3 * k);
        B.ring.material.opacity = 0.85 * Math.pow(1 - tr, 1.6);
      } else B.ring.visible = false;
      // flash billboard
      const tf = t / 0.1;
      if (tf < 1) { B.flash.scale.setScalar(S * (2.4 + tf * 1.2)); B.flash.material.opacity = 1 - tf; } else B.flash.visible = false;
    }
  }

  /** Burnt mark on the ground (floor height = y). */
  addScorch(x, y, z, size = 3.2) {
    const m = this.scorches[this.scorchIdx];
    this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;
    m.position.set(x, y + 0.015 + this.scorchIdx * 0.0005, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(size * (0.85 + Math.random() * 0.3));
    m.visible = true;
  }

  setViewport(heightPx, fovDeg) {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.soft.material.uniforms.uScale.value = s;
    this.glow.material.uniforms.uScale.value = s;
  }

  spawnBlood(point, dir) {
    const R = Math.random;
    for (let i = 0; i < 16; i++) {
      const sp = 0.6 + R() * 2.2;
      this.soft.emit(point.x, point.y, point.z,
        dir.x * sp * 0.8 + (R() - 0.5) * 2.2, 0.4 + R() * 1.6 + dir.y * sp, dir.z * sp * 0.8 + (R() - 0.5) * 2.2,
        0.42 + R() * 0.2, 0.01, 0.01, 0.05 + R() * 0.09, 0.4 + R() * 0.5, -9.5, 0.6, 0.95, 0.5);
    }
    for (let i = 0; i < 3; i++) {
      this.soft.emit(point.x, point.y, point.z, (R() - 0.5) * 0.6 + dir.x * 0.6, 0.2 + R() * 0.3, (R() - 0.5) * 0.6 + dir.z * 0.6,
        0.55, 0.03, 0.03, 0.22 + R() * 0.12, 0.35 + R() * 0.2, -0.5, 2.2, 0.55, 2);
    }
  }

  /** Bullet hit on a body: animated burst sprite + exit spray + mist. Bigger for headshots. */
  spawnBloodHit(point, dir, headshot = false, killed = false) {
    const k = headshot ? 1.4 : killed ? 1.15 : 1;
    const B = this.bloodBursts[this.burstIdx];
    this.burstIdx = (this.burstIdx + 1) % this.bloodBursts.length;
    B.sprite.position.copy(point);
    B.sprite.scale.setScalar((0.32 + Math.random() * 0.12) * k);
    B.sprite.material.rotation = Math.random() * Math.PI * 2;
    B.t = 0; B.dur = 0.28 + 0.06 * k; B.active = true;
    B.tex.offset.x = 0;
    B.sprite.visible = true;

    const R = Math.random;
    const n = Math.round(14 * k);
    for (let i = 0; i < n; i++) {                       // exit spray, continuing along the bullet
      const sp = 1.5 + R() * 3.5 * k;
      this.soft.emit(point.x, point.y, point.z,
        dir.x * sp + (R() - 0.5) * 1.6, dir.y * sp + R() * 1.5, dir.z * sp + (R() - 0.5) * 1.6,
        0.38 + R() * 0.2, 0.0, 0.01, 0.035 + R() * 0.07, 0.45 + R() * 0.45, -9.8, 0.3, 1, 0.3);
    }
    for (let i = 0; i < 5; i++) {                        // back-spray toward the shooter
      const sp = 0.6 + R() * 1.4;
      this.soft.emit(point.x, point.y, point.z,
        -dir.x * sp + (R() - 0.5), 0.3 + R() * 1.2, -dir.z * sp + (R() - 0.5),
        0.45, 0.02, 0.02, 0.04 + R() * 0.05, 0.35 + R() * 0.3, -9.8, 0.3, 1, 0.4);
    }
    for (let i = 0; i < Math.round(3 * k); i++) {        // red mist
      this.soft.emit(point.x, point.y, point.z, dir.x * 0.8 + (R() - 0.5) * 0.5, 0.15 + R() * 0.3, dir.z * 0.8 + (R() - 0.5) * 0.5,
        0.55, 0.04, 0.04, 0.28 * k + R() * 0.15, 0.4 + R() * 0.25, -0.3, 2.4, 0.5, 2.5);
    }
  }

  /** Blood splatter decal on a wall / cover / floor behind the target. */
  addBloodSplat(point, normal, size = 0.7) {
    const m = this.splats[this.splatIdx];
    this.splatIdx = (this.splatIdx + 1) % this.splats.length;
    m.material = this.splatMats[Math.floor(Math.random() * 4)];
    m.position.copy(point).addScaledVector(normal, 0.015);
    m.quaternion.setFromUnitVectors(Z_AXIS, normal);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    m.visible = true;
  }

  /** Pool of blood that slowly spreads under a body. */
  addBloodPool(pos, size = 1.3, floorY = 0) {
    const P = this.pools[this.poolIdx];
    this.poolIdx = (this.poolIdx + 1) % this.pools.length;
    P.mesh.position.set(pos.x, floorY + 0.012 + this.poolIdx * 0.0004, pos.z);
    P.mesh.rotation.z = Math.random() * Math.PI * 2;
    P.mesh.scale.setScalar(0.05);
    P.mesh.visible = true;
    P.t = 0; P.size = size * (0.8 + Math.random() * 0.4); P.active = true;
  }

  /** Graphics quality: 'low' | 'medium' | 'ultra' (particle budget, tracer glow). */
  setQuality(q) {
    this.quality = q;
    const d = q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1;
    this.soft.density = d; this.glow.density = d;
    for (const t of this.tracers) t.halo.visible = q !== 'low';
  }

  /** Bullet striking a car body / metal: a shower of bouncing sparks, a hot flash and grey smoke. */
  spawnMetalSparks(point, normal) {
    const R = Math.random;
    const n = this.quality === 'low' ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const sp = 3 + R() * 9;
      this.glow.emit(point.x, point.y, point.z,
        normal.x * sp * 0.7 + (R() - 0.5) * 6, normal.y * sp * 0.5 + R() * 4.5, normal.z * sp * 0.7 + (R() - 0.5) * 6,
        1, 0.82 + R() * 0.15, 0.45 + R() * 0.25, 0.025 + R() * 0.025, 0.25 + R() * 0.45, -16, 0, 1, 0.4);
    }
    this.glow.emit(point.x + normal.x * 0.03, point.y + normal.y * 0.03, point.z + normal.z * 0.03, 0, 0, 0, 1, 0.9, 0.6, 0.32, 0.06, 0, 0.5, 1, 0);
    for (let i = 0; i < 3; i++) {
      const c = 0.5 + R() * 0.1;
      this.soft.emit(point.x, point.y, point.z, normal.x * 0.8 + (R() - 0.5) * 0.6, 0.3 + R() * 0.5, normal.z * 0.8 + (R() - 0.5) * 0.6,
        c, c, c, 0.1 + R() * 0.1, 0.6 + R() * 0.5, 0.2, 2.4, 0.4, 2);
    }
    const S = this.flashSprites[this.spriteIdx];
    this.spriteIdx = (this.spriteIdx + 1) % this.flashSprites.length;
    S.sprite.position.copy(point).addScaledVector(normal, 0.04);
    S.sprite.material.rotation = R() * Math.PI;
    S.sprite.scale.setScalar(0.18 + R() * 0.12);
    S.sprite.visible = true;
    S.t = 0.035;
  }

  spawnImpact(point, normal, surface) {
    if (surface === 'metal') { this.spawnMetalSparks(point, normal); return; }
    const R = Math.random;
    for (let i = 0; i < 9; i++) {
      const sp = 0.8 + R() * 2.2;
      const c = 0.45 + R() * 0.15;
      this.soft.emit(point.x, point.y, point.z,
        normal.x * sp + (R() - 0.5) * 1.6, normal.y * sp + R() * 1.2, normal.z * sp + (R() - 0.5) * 1.6,
        c, c * 0.95, c * 0.85, 0.08 + R() * 0.14, 0.5 + R() * 0.6, -2.5, 2.6, 0.6, 2.5);
    }
    for (let i = 0; i < 6; i++) {
      const sp = 2 + R() * 5;
      this.glow.emit(point.x, point.y, point.z,
        normal.x * sp + (R() - 0.5) * 4, normal.y * sp + R() * 3, normal.z * sp + (R() - 0.5) * 4,
        1, 0.75 + R() * 0.2, 0.35, 0.035 + R() * 0.03, 0.12 + R() * 0.2, -14, 0, 1, 0);
    }
  }

  addDecal(point, normal) {
    const m = this.decals[this.decalIdx];
    this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.quaternion.setFromUnitVectors(Z_AXIS, normal);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(0.8 + Math.random() * 0.5);
    m.visible = true;
  }

  spawnTracer(from, to, color = 0xffd36b, speed = 320) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    t.from.copy(from);
    t.dir.subVectors(to, from);
    t.total = t.dir.length();
    if (t.total < 0.6) { t.active = false; t.mesh.visible = false; return; }
    t.dir.divideScalar(t.total);
    t.traveled = 0;
    t.speed = speed;
    t.len = Math.min(4.5, t.total * 0.5);
    t.mesh.material.color.set(color);
    t.halo.material.color.set(color);
    t.mesh.quaternion.setFromUnitVectors(Z_AXIS, t.dir);
    t.active = true;
    t.mesh.visible = false; // becomes visible on first update
  }

  enemyMuzzleFlash(pos, k = 1) {
    const L = this.enemyLights[this.enemyLightIdx];
    this.enemyLightIdx = (this.enemyLightIdx + 1) % this.enemyLights.length;
    L.light.position.copy(pos);
    L.light.intensity = 22 * k * (this.nightBoost || 1);
    L.t = 0.05;
    const S = this.flashSprites[this.spriteIdx];
    this.spriteIdx = (this.spriteIdx + 1) % this.flashSprites.length;
    S.sprite.position.copy(pos);
    S.sprite.material.rotation = Math.random() * Math.PI;
    S.sprite.scale.setScalar(0.45 + Math.random() * 0.3);
    S.sprite.visible = true;
    S.t = 0.05;
  }

  /**
   * Procedural explosion (no model): fireball core, ground shockwave, 30-45 bouncing metal sparks,
   * debris chunks, rising smoke (~1.2 s), dust ring, scorch mark and a 0.12 s orange light flash.
   */
  spawnExplosion(pos, opts = {}) {
    if (!this.scorches) this._initExplosionFx();
    const R = Math.random, size = opts.size || 3.6;
    const floorY = opts.floorY !== undefined ? opts.floorY : 0;
    const q = this.quality === 'low' ? 0.6 : 1;
    this._spawnBlast(pos, size, floorY);
    this.addScorch(pos.x, floorY, pos.z, opts.scorch || 3.2);
    // hot inner glow (short, additive)
    for (let i = 0; i < 14 * q; i++) {
      const a = R() * Math.PI * 2, u = R() * 2 - 1, sp = 2 + R() * 4, k = Math.sqrt(1 - u * u);
      this.glow.emit(pos.x, pos.y + 0.2, pos.z, Math.cos(a) * k * sp, Math.abs(u) * sp + 1.5, Math.sin(a) * k * sp,
        1, 0.62 + R() * 0.25, 0.2, 0.4 + R() * 0.4, 0.18 + R() * 0.17, -2, 2.2, 1, 4);
    }
    // metal sparks: gravity + ground bounce
    const sparks = Math.round((30 + R() * 15) * q);
    for (let i = 0; i < sparks; i++) {
      const a = R() * Math.PI * 2, sp = 5 + R() * 11;
      this.glow.emit(pos.x, pos.y + 0.1, pos.z, Math.cos(a) * sp, 2.5 + R() * 8, Math.sin(a) * sp,
        1, 0.78 + R() * 0.18, 0.38 + R() * 0.25, 0.04 + R() * 0.035, 0.7 + R() * 0.7, -17, 0, 1, 0.35, 0.42);
    }
    // heavy debris chunks (dark, bounce lower)
    for (let i = 0; i < 16 * q; i++) {
      const a = R() * Math.PI * 2, sp = 3 + R() * 8, c = 0.1 + R() * 0.08;
      this.soft.emit(pos.x, pos.y + 0.15, pos.z, Math.cos(a) * sp, 4 + R() * 7, Math.sin(a) * sp,
        c, c * 0.9, c * 0.8, 0.05 + R() * 0.06, 1.0 + R() * 0.5, -20, 0, 1, 0.3, 0.3);
    }
    // rising smoke puffs, dissipating over ~1.2 s
    for (let i = 0; i < 16 * q; i++) {
      const a = R() * Math.PI * 2, sp = 0.4 + R() * 1.4, c = 0.16 + R() * 0.1;
      this.soft.emit(pos.x + (R() - 0.5) * size * 0.3, pos.y + 0.3 + R() * size * 0.25, pos.z + (R() - 0.5) * size * 0.3,
        Math.cos(a) * sp, 1.6 + R() * 1.8, Math.sin(a) * sp, c, c * 0.97, c * 0.93, 0.7 + R() * 0.7, 1.0 + R() * 0.4, 0.6, 2.6, 0.62, 1.2);
    }
    // dust ring kicked along the deck (follows the shockwave)
    for (let i = 0; i < 26 * q; i++) {
      const a = (i / 26) * Math.PI * 2 + R() * 0.2, sp = 7 + R() * 3, c = 0.4 + R() * 0.1;
      this.soft.emit(pos.x, floorY + 0.12, pos.z, Math.cos(a) * sp, 0.3 + R() * 0.5, Math.sin(a) * sp,
        c, c * 0.93, c * 0.82, 0.32 + R() * 0.28, 0.8 + R() * 0.4, -1, 2.5, 0.55, 3.5);
    }
    // dynamic flash light: lights up the wrecks and barriers around the blast for 0.12 s
    this.boomLight.light.position.set(pos.x, pos.y + 1.2, pos.z);
    this.boomLight.light.intensity = 260 * (this.nightBoost || 1);
    this.boomLight.peak = this.boomLight.light.intensity;
    this.boomLight.t = 0.12;
  }

  playerMuzzleFlash(pos) {
    const L = this.playerLight;
    L.light.position.copy(pos);
    L.light.intensity = 32 * (this.nightBoost || 1);
    L.t = 0.05;
  }

  update(dt) {
    this.soft.update(dt);
    this.glow.update(dt);
    if (this.blasts) this._updateBlasts(dt);

    for (const t of this.tracers) {
      if (!t.active) continue;
      t.traveled += t.speed * dt;
      // the tail keeps travelling past the impact point, so the streak shrinks into it and despawns
      const tail = t.traveled - t.len;
      if (tail >= t.total) { t.active = false; t.mesh.visible = false; continue; }
      const head = Math.min(t.traveled, t.total);
      const clampedTail = Math.max(0, tail);
      const mid = (head + clampedTail) * 0.5;
      t.mesh.position.copy(t.from).addScaledVector(t.dir, mid);
      t.mesh.scale.set(1, 1, Math.max(0.05, head - clampedTail));
      t.mesh.visible = true;
    }

    for (const L of this.enemyLights) {
      if (L.t > 0) { L.t -= dt; if (L.t <= 0) L.light.intensity = 0; }
    }
    if (this.playerLight.t > 0) { this.playerLight.t -= dt; if (this.playerLight.t <= 0) this.playerLight.light.intensity = 0; }
    if (this.boomLight.t > 0) { this.boomLight.t -= dt; this.boomLight.light.intensity = Math.max(0, this.boomLight.t / 0.12) * (this.boomLight.peak || 260); }
    for (const S of this.flashSprites) {
      if (S.t > 0) { S.t -= dt; if (S.t <= 0) S.sprite.visible = false; }
    }
    for (const B of this.bloodBursts) {
      if (!B.active) continue;
      B.t += dt;
      const f = Math.floor((B.t / B.dur) * this.bloodFrames);
      if (f >= this.bloodFrames) { B.active = false; B.sprite.visible = false; continue; }
      B.tex.offset.x = f / this.bloodFrames;
      B.sprite.position.y -= dt * 0.25;
    }
    for (const P of this.pools) {
      if (!P.active) continue;
      P.t += dt;
      const k = 1 - Math.pow(1 - Math.min(1, P.t / 3.5), 3);   // ease-out spread over 3.5 s
      P.mesh.scale.setScalar(Math.max(0.05, P.size * k));
      if (k >= 1) P.active = false;
    }
  }

  reset() {
    this.soft.clear();
    this.glow.clear();
    for (const t of this.tracers) { t.active = false; t.mesh.visible = false; }
    for (const d of this.decals) d.visible = false;
    for (const m of this.splats) m.visible = false;
    for (const P of this.pools) { P.active = false; P.mesh.visible = false; }
    for (const B of this.bloodBursts) { B.active = false; B.sprite.visible = false; }
    for (const L of this.enemyLights) { L.light.intensity = 0; L.t = 0; }
    this.playerLight.light.intensity = 0;
    this.boomLight.light.intensity = 0; this.boomLight.t = 0;
    for (const S of this.flashSprites) { S.sprite.visible = false; S.t = 0; }
    if (this.scorches) for (const m of this.scorches) m.visible = false;
    if (this.blasts) for (const B of this.blasts) { B.t = 99; B.core.visible = B.ring.visible = B.flash.visible = false; }
  }
}
