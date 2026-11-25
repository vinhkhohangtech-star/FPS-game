// =========================================================
// Bridge — "HIGHWAY BRIDGE // ENDLESS DEFENSE" level geometry
//  * 220 m walkable suspension-bridge deck (Z -100..+120), 15 m / 4 lanes, wet asphalt shader
//  * 1.2 m Jersey barriers + steel guardrails (colliders), floodlight poles every 18 m on both edges
//    (cones + light pools on every pole; a fixed pool of real SpotLights follows the player)
//  * twin suspension towers, main cables + hangers, sign gantries, misty abyss
//  * ~36 high-detail wrecks (extruded bodywork, wheel arches, rounded tyres + spoked rims,
//    bumpers, mirrors, tinted glass with interiors) in traffic jams and accident zones;
//    merged per material, invisible metal ray/LOS boxes, segmented AABB colliders
//  * police cruisers with red/blue strobes, burning wrecks with smoke plumes
//  * Sector A (south) bastion is built by Arena.buildBridge(); this file builds the rest
// =========================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const BRIDGE = {
  halfWidth: 6.3,            // free deck between the Jersey barriers (15 m incl. barriers + shoulders)
  minZ: -100, maxZ: 120,     // walkable span: 220 m
  deckMin: -150, deckMax: 170,   // visible deck (fades into the fog beyond the walkable ends)
  // lighter slate fog + low density: hostiles stay readable 100-150 m down the deck
  fogColor: 0x1a2332, fogDensity: 0.0056,
  lampStep: 18,
};

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, paint, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------------- procedural textures ----------------
function asphaltTex(R) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2c2d30'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {               // aggregate
      const v = 20 + R() * 70 | 0;
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + R() * 0.5})`;
      const s = 1 + R() * 2.2; g.fillRect(R() * w, R() * h, s, s);
    }
    for (let i = 0; i < 14; i++) {                   // tar patches / oil
      const x = R() * w, y = R() * h, r = 20 + R() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(10,10,12,${0.25 + R() * 0.25})`); grd.addColorStop(1, 'rgba(10,10,12,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(8,8,9,0.7)'; g.lineWidth = 1.5;   // cracks
    for (let i = 0; i < 7; i++) {
      let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 9; k++) { x += (R() - 0.5) * 50; y += (R() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

/** Grey-scale puddle mask (white = standing water), tileable-ish, sampled in world space by the wet shader. */
function puddleTex(R) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 34; i++) {
      const x = R() * w, y = R() * h, rx = 14 + R() * 60, ry = rx * (0.4 + R() * 0.7);
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        g.save(); g.translate(x + ox, y + oy); g.rotate(R() * 3.14); g.scale(1, ry / rx);
        const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.35})`; g.fillRect(R() * w, R() * h, 2, 2); }
  }, false);
}

function concreteTex(R, base = '#8a877f') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const v = R() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${R() * 0.12})`; g.fillRect(R() * w, R() * h, 2, 2); }
    for (let i = 0; i < 10; i++) {
      const x = R() * w, y = R() * h, r = 15 + R() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(30,28,25,0.22)'); grd.addColorStop(1, 'rgba(30,28,25,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const grd = g.createLinearGradient(0, h * 0.6, 0, h);       // road grime at the bottom
    grd.addColorStop(0, 'rgba(20,18,15,0)'); grd.addColorStop(1, 'rgba(20,18,15,0.45)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

function corrugatedTex(R) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, '#d8d8d8'); grd.addColorStop(0.45, '#9a9a9a'); grd.addColorStop(1, '#d0d0d0');
      g.fillStyle = grd; g.fillRect(x, 0, 16, h);
    }
    for (let i = 0; i < 40; i++) {            // rust streaks
      const x = R() * w, len = 20 + R() * 160;
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, 'rgba(90,45,20,0.5)'); grd.addColorStop(1, 'rgba(90,45,20,0)');
      g.fillStyle = grd; g.fillRect(x, 0, 2 + R() * 5, len);
    }
    g.fillStyle = 'rgba(40,30,20,0.5)'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  });
}

function glowTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, false);
}

function mistTex(R) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = R() * w, y = R() * h, r = 20 + R() * 70;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, `rgba(255,255,255,${0.08 + R() * 0.12})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }, false);
}

function signTex() {
  return canvasTex(1024, 320, (g, w, h) => {
    g.fillStyle = '#0d5a34'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8efe8'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#eef3ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 120px Arial, sans-serif'; g.fillText('HWY 9  NORTH', w / 2, h * 0.38);
    g.fillStyle = '#ffd23a'; g.font = 'bold 64px Arial, sans-serif'; g.fillText('BRIDGE CLOSED — NO EXIT', w / 2, h * 0.75);
  });
}

function stencilTex(text) {
  return canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(235,225,190,0.85)'; g.font = 'bold 150px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.8})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  });
}

/**
 * Wet asphalt: a world-space puddle mask lowers roughness (mirror-like water) and darkens the albedo,
 * so street lamps, police strobes and muzzle flashes leave long glossy streaks on the road.
 */
function makeWet(mat, puddles, scale = 1 / 22) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPuddle = { value: puddles };
    sh.uniforms.uPuddleScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWetPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;\nuniform sampler2D uPuddle;\nuniform float uPuddleScale;\nfloat gWet;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float pm = texture2D(uPuddle, vWetPos.xz * uPuddleScale).r;
        float pm2 = texture2D(uPuddle, vWetPos.zx * uPuddleScale * 0.37 + 0.31).r;
        gWet = smoothstep(0.32, 0.7, pm * 0.75 + pm2 * 0.45);
        diffuseColor.rgb *= mix(0.92, 0.42, gWet);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.035, gWet);`);
  };
  mat.customProgramCacheKey = () => 'wet-asphalt';
  return mat;
}

/** Additive "volumetric" light cone under a lamp, fading with height, view angle and fog. */
function coneMaterial(color, height) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.16 }, uH: { value: height }, uDensity: { value: BRIDGE.fogDensity } },
    vertexShader: /* glsl */`
      varying float vT; varying float vFres; varying float vDepth;
      uniform float uH;
      void main() {
        vT = clamp(position.y / uH + 0.5, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFres = abs(dot(n, normalize(-mv.xyz)));
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vT; varying float vFres; varying float vDepth;
      uniform vec3 uColor; uniform float uOpacity; uniform float uDensity;
      void main() {
        float a = uOpacity * pow(vT, 1.6) * pow(vFres, 1.8);
        a *= exp(-pow(uDensity * vDepth, 2.0));
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: new THREE.Color(BRIDGE.fogColor) }, uZenith: { value: new THREE.Color(0x1c2a40) } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform vec3 uHorizon; uniform vec3 uZenith;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
        float cl = sin(vDir.x * 7.0 + vDir.z * 3.0) * sin(vDir.z * 9.0 - vDir.x * 2.0);          // faint cloud banding
        c += vec3(0.012, 0.016, 0.024) * smoothstep(0.2, 1.0, cl) * smoothstep(0.05, 0.4, h);
        float s = hash(floor(vDir * 420.0));
        c += vec3(0.75, 0.8, 0.95) * step(0.9975, s) * smoothstep(0.15, 0.6, h) * 0.6;           // stars
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

/** A dark environment (steel-blue sky, amber city glow, overhead lamps) for wet reflections at night. */
export function makeNightEnvScene() {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const col = [];
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    const c = y > 0 ? new THREE.Color(0x0e141e).lerp(new THREE.Color(0x24344c), Math.pow(y, 0.6)) : new THREE.Color(0x07080a);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(2.2) });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(3 + (i % 3), 0.6, 0.5), amber);
    m.position.set(Math.cos(a) * 45, 2 + (i % 4) * 0.7, Math.sin(a) * 45); m.lookAt(0, 2, 0);
    s.add(m);
  }
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(6) });
  for (const z of [-14, 0, 14]) for (const x of [-6, 6]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.6), lamp); m.position.set(x, 14, z); s.add(m);
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbcd0ff).multiplyScalar(3) }));
  moon.position.set(-18, 26, 34); s.add(moon);
  return s;
}

// ---------------- geometry merging helpers ----------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
/** Everything merged into the vehicle buckets is non-indexed (ExtrudeGeometry is, so the rest must match). */
const NI = (g) => (g.index ? g.toNonIndexed() : g);
const GEO = {
  box: NI(new THREE.BoxGeometry(1, 1, 1)),
  cyl: NI(new THREE.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2)),      // axis along X
  cyl10: NI(new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2)),
  vcyl: NI(new THREE.CylinderGeometry(1, 1, 1, 12)),                           // axis along Y
  tire: NI(new THREE.TorusGeometry(0.72, 0.28, 8, 24).rotateY(Math.PI / 2)),  // rounded tyre: outer r 1, width 0.56, axis X
  arch: NI(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2)),   // upper half shell (wheel-arch liner)
  ring: NI(new THREE.TorusGeometry(1, 0.13, 6, 18)),                          // steering wheel (axis Z)
};
// fallback for ray boxes / misc meshes
const BOX = new THREE.BoxGeometry(1, 1, 1);

class Buckets {
  constructor() { this.b = {}; this.tris = 0; }
  add(key, geo, matrix, color) {
    const g = geo.clone().applyMatrix4(matrix);
    if (key !== 'container' && g.attributes.uv) g.deleteAttribute('uv');      // only the corrugated boxes are textured
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    _c.set(color === undefined ? 0xffffff : color);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.clearGroups();
    (this.b[key] || (this.b[key] = [])).push(g);
    this.tris += n / 3;
  }
  build(root, mats, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [k, list] of Object.entries(this.b)) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[k]);
      mesh.castShadow = cast && k !== 'lens' && k !== 'glass'; mesh.receiveShadow = receive;
      if (k === 'glass') mesh.renderOrder = 3;
      mesh.name = 'merged-' + k;
      root.add(mesh); out.push(mesh);
      for (const g of list) g.dispose();
    }
    this.b = {};
    return out;
  }
}

/** Vehicle-local part placement: parent matrix * local TRS (box of size w,h,d centred at x,y,z). */
function partMatrix(parent, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz)); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s).premultiply(parent);
}

/**
 * Side-profile bodywork: a silhouette in (u = forward, v = up) extruded across the car's width,
 * with rounded (bevelled) edges and real wheel-arch cut-outs. Cached per archetype.
 * top: points from the nose (bottom) over the top to the tail (bottom). axles: [{ z, r, c }].
 */
const PROFILES = new Map();
function profileGeo(key, top, { yb = 0.3, axles = null, width, bevel = 0.05 }) {
  if (PROFILES.has(key)) return PROFILES.get(key);
  const pts = top.map(([u, v]) => new THREE.Vector2(u, v));
  if (axles) {
    for (const A of [...axles].sort((a, b) => a.z - b.z)) {
      pts.push(new THREE.Vector2(A.z - A.r, yb));
      for (let i = 0; i <= 12; i++) {
        const t = Math.PI - (i / 12) * Math.PI;
        pts.push(new THREE.Vector2(A.z + A.r * Math.cos(t), A.c + A.r * Math.sin(t)));
      }
      pts.push(new THREE.Vector2(A.z + A.r, yb));
    }
  }
  const shape = new THREE.Shape(pts);
  const depth = Math.max(0.04, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 1, steps: 1,
  });
  // shape space (u, v, extrude) -> car space (x = width, y = up, z = forward); a proper rotation (det +1)
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, depth / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  // weld + smooth normals so the bevels and the profile read as curved bodywork, then back to non-indexed
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  const out = welded.toNonIndexed();
  g.dispose(); welded.dispose();
  PROFILES.set(key, out);
  return out;
}

/** Thin bar between two points of the side profile (pillars), at lateral offset x. */
function strut(B, M, key, col, x, z0, y0, z1, y1, thick, depth = 0.06) {
  const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
  B.add(key, GEO.box, partMatrix(M, x, (y0 + y1) / 2, (z0 + z1) / 2, depth, len, thick, Math.atan2(dz, dy), 0, 0), col);
}

/**
 * Tyres (rounded torus), metallic rims, 5-spoke faces with a hub cap, and an arch liner over each wheel.
 * tx = half track (wheel centre x), zs = axle z positions.
 */
function wheelSet(B, M, tx, zs, r, w, o = {}) {
  const lift = o.lift || 0, burnt = !!o.burnt, dual = !!o.dual;
  const rimCol = burnt ? 0x3b2a1e : (o.rim || 0x9ea4aa);
  for (const z of zs) for (const s of [-1, 1]) {
    const y = r + lift;
    const xs = dual ? [tx - w * 0.52, tx + w * 0.52] : [tx];
    for (const xx of xs) {
      if (!burnt) B.add('tire', GEO.tire, partMatrix(M, xx * s, y, z, w / 0.56, r, r), 0x151515);
      B.add('rim', GEO.cyl, partMatrix(M, xx * s, burnt ? y - 0.05 : y, z, w * 0.78, r * 0.6, r * 0.6), rimCol);
    }
    const xo = ((dual ? tx + w * 0.52 : tx) + w * 0.4) * s;
    B.add('rim', GEO.cyl10, partMatrix(M, xo, y, z, 0.05, r * 0.2, r * 0.2), burnt ? 0x2a1e16 : 0xd0d4d8);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + z * 1.7;
      B.add('rim', GEO.box, partMatrix(M, xo - s * 0.01, y - Math.sin(a) * r * 0.32, z + Math.cos(a) * r * 0.32, 0.03, r * 0.11, r * 0.42, a), rimCol);
    }
    if (o.arch !== false) B.add('trim', GEO.arch, partMatrix(M, (tx - (dual ? 0 : 0.02)) * s, y, z, w * (dual ? 2.3 : 1.15), r + 0.07, r + 0.07), 0x0d0d0e);
  }
}

/** Shared car-body details: bumpers, grille, lamps, plates, mirrors, door seams, handles, skirts. */
function carDetails(B, M, d) {
  const { L, W, lift = 0, burnt, paint, mk } = d;
  const hw = W / 2, zf = L / 2, y = (v) => v + lift;
  const P = (x, yy, z, w, h, dd, key, col, rx = 0, ry = 0, rz = 0) => B.add(key, GEO.box, partMatrix(M, x, y(yy), z, w, h, dd, rx, ry, rz), col);
  const trim = burnt ? 0x14110e : 0x18191b;
  P(0, d.bumperY || 0.42, zf - 0.04, W + 0.06, 0.22, 0.2, 'trim', trim);                 // front bumper
  P(0, d.bumperY || 0.42, -zf + 0.04, W + 0.06, 0.22, 0.2, 'trim', trim);                // rear bumper
  for (const s of [-1, 1]) {                                                              // bumper wrap-arounds
    P(s * (hw + 0.01), d.bumperY || 0.42, zf - 0.3, 0.06, 0.2, 0.45, 'trim', trim);
    P(s * (hw + 0.01), d.bumperY || 0.42, -zf + 0.3, 0.06, 0.2, 0.45, 'trim', trim);
  }
  P(0, d.grilleY || 0.62, zf + 0.005, W * 0.5, 0.16, 0.05, 'trim', 0x0b0b0c);              // grille
  if (!burnt) {
    P(0, d.grilleY || 0.62, zf + 0.03, W * 0.46, 0.02, 0.02, 'chrome', 0xb4b8bc);
    P(0, (d.bumperY || 0.42), zf + 0.08, 0.52, 0.12, 0.02, 'trim', 0xd8d8d0);              // plates
    P(0, (d.bumperY || 0.42) + 0.22, -zf - 0.02, 0.52, 0.12, 0.02, 'trim', 0xd8d8d0);
    for (const s of [-1, 1]) {
      P(s * hw * 0.68, d.headY || 0.7, zf - 0.02, W * 0.22, 0.12, 0.08, 'lens', 0xdfe6ee);      // headlights
      P(s * hw * 0.74, d.tailY || 0.8, -zf + 0.01, W * 0.2, 0.14, 0.06, 'lens', 0x900d0d);     // tail lights
      P(s * hw * 0.74, (d.tailY || 0.8) - 0.1, -zf + 0.01, W * 0.2, 0.05, 0.06, 'lens', 0xd08a2a);
    }
  }
  if (d.mirrorZ !== undefined) for (const s of [-1, 1]) {                                  // side mirrors
    P(s * (hw + 0.1), d.mirrorY, d.mirrorZ, 0.18, 0.13, 0.08, mk, paint);
    P(s * (hw + 0.03), d.mirrorY - 0.03, d.mirrorZ + 0.02, 0.08, 0.04, 0.05, 'trim', trim);
    if (!burnt) P(s * (hw + 0.13), d.mirrorY, d.mirrorZ - 0.045, 0.12, 0.09, 0.01, 'chrome', 0x8a9096);
  }
  for (const s of [-1, 1]) {
    for (const sz of d.seams || []) P(s * (hw + 0.004), d.seamY || 0.66, sz, 0.008, d.seamH || 0.58, 0.012, 'trim', 0x050505);   // door seams
    if (!burnt) for (const hz of d.handles || []) P(s * (hw + 0.012), d.handleY || 0.88, hz, 0.02, 0.035, 0.15, 'chrome', 0xaab0b6);
    P(s * (hw - 0.04), d.skirtY || 0.33, 0, 0.06, 0.08, L * 0.5, 'trim', trim);            // rocker / side skirt
  }
}

/** Seats, dashboard and steering wheel (seen through the tinted glass). */
function interior(B, M, { lift = 0, burnt, W, seatZ, rearZ, dashZ, floorY = 0.62, wheelX = 0.38 }) {
  const col = burnt ? 0x0b0a09 : 0x26272a, y = (v) => v + lift;
  const P = (x, yy, z, w, h, d, c = col, rx = 0) => B.add('interior', GEO.box, partMatrix(M, x, y(yy), z, w, h, d, rx), c);
  P(0, floorY, (seatZ + dashZ) / 2 - 0.3, W - 0.3, 0.06, Math.abs(dashZ - (rearZ ?? seatZ)) + 1.2);
  for (const s of [-1, 1]) {
    P(s * 0.36, floorY + 0.2, seatZ, 0.48, 0.14, 0.5);
    P(s * 0.36, floorY + 0.5, seatZ - 0.24, 0.48, 0.56, 0.12, col, -0.12);
    P(s * 0.36, floorY + 0.86, seatZ - 0.27, 0.24, 0.16, 0.1);
  }
  if (rearZ !== undefined) {
    P(0, floorY + 0.2, rearZ, W - 0.4, 0.14, 0.5);
    P(0, floorY + 0.5, rearZ - 0.24, W - 0.4, 0.56, 0.12, col, -0.12);
  }
  P(0, floorY + 0.38, dashZ, W - 0.24, 0.26, 0.42, burnt ? col : 0x1b1c1e);
  if (!burnt) B.add('interior', GEO.ring, partMatrix(M, wheelX, y(floorY + 0.55), dashZ - 0.32, 0.17, 0.17, 0.17, -0.45), 0x101012);
}

// ---------------- vehicles ----------------
const PAINTS = [0x6f1d1b, 0x23395b, 0x8a8d91, 0xd7d7d2, 0x1d1e20, 0x3c5a3c, 0x7b5a2a, 0x4b4f55, 0x9a2b14, 0x2f4b6e, 0xb59a3a, 0x5b2c4e];
const CONTAINER_COLORS = [0x8c2f1f, 0x1f4d7a, 0x2f5f3a, 0xb0661c, 0x6d6f70];
const LIVERY = [0xc8361e, 0x1f5fa8, 0x2b7a3c, 0xe0a020, 0x5a2a7a];

// profiles (u forward, v up)
const PRO = {
  sedanLow: [[2.34, 0.3], [2.4, 0.5], [2.35, 0.7], [2.16, 0.82], [1.6, 0.9], [1.0, 0.97], [-1.3, 1.0], [-1.9, 0.98], [-2.25, 0.92], [-2.37, 0.78], [-2.39, 0.52], [-2.32, 0.3]],
  sedanGlass: [[1.02, 0.95], [0.24, 1.41], [-0.86, 1.42], [-1.36, 0.97]],
  sedanRoof: [[0.3, 1.39], [0.22, 1.46], [-0.88, 1.47], [-0.95, 1.4]],
  suvLow: [[2.4, 0.38], [2.46, 0.62], [2.42, 0.88], [2.22, 1.02], [1.45, 1.1], [1.05, 1.13], [-2.2, 1.15], [-2.38, 1.1], [-2.45, 0.82], [-2.42, 0.38]],
  suvGlass: [[1.07, 1.11], [0.42, 1.72], [-2.22, 1.74], [-2.34, 1.13]],
  suvRoof: [[0.48, 1.7], [0.4, 1.79], [-2.28, 1.8], [-2.33, 1.71]],
  pickLow: [[2.72, 0.42], [2.76, 0.7], [2.68, 0.98], [2.35, 1.1], [1.35, 1.16], [-0.32, 1.18], [-0.36, 0.92], [-2.66, 0.92], [-2.72, 0.85], [-2.74, 0.42]],
  pickGlass: [[1.37, 1.14], [0.85, 1.72], [-0.12, 1.74], [-0.28, 1.15]],
  pickRoof: [[0.9, 1.7], [0.82, 1.79], [-0.18, 1.8], [-0.24, 1.71]],
  vanCab: [[3.0, 0.36], [3.06, 0.66], [2.98, 1.0], [2.66, 1.16], [2.25, 1.22], [1.38, 1.22], [1.38, 0.36]],
  vanGlass: [[2.26, 1.2], [1.86, 2.02], [1.42, 2.06], [1.42, 1.2]],
};

/**
 * Each builder adds visual parts to buckets and returns
 * { rays: [local boxes {w,h,d,x,y,z}], strobes?: [...], smoke?: local emitter }.
 */
const VEHICLES = {
  sedan(B, M, o) {
    const burnt = !!o.burnt, paint = burnt ? 0x1b1713 : o.color, mk = burnt ? 'burnt' : 'paint';
    const lift = burnt ? -0.12 : 0, W = 1.82, L = 4.7;
    const LM = burnt ? partMatrix(M, 0, lift, 0, 1, 1, 1).clone() : M;
    const ax = [{ z: 1.42, r: 0.4, c: 0.34 }, { z: -1.42, r: 0.4, c: 0.34 }];
    B.add(mk, profileGeo('sedanLow', PRO.sedanLow, { yb: 0.3, axles: ax, width: W, bevel: 0.06 }), LM, paint);
    if (!burnt) B.add('glass', profileGeo('sedanGlass', PRO.sedanGlass, { width: W - 0.2, bevel: 0.03 }), LM, 0xffffff);
    B.add(mk, profileGeo('sedanRoof', PRO.sedanRoof, { width: W - 0.16, bevel: 0.03 }), LM, burnt ? 0x2a1c12 : paint);
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.08);
      strut(B, LM, mk, paint, x, 1.0, 0.96, 0.25, 1.42, 0.07);       // A
      strut(B, LM, mk, paint, x, -0.25, 0.98, -0.3, 1.42, 0.1);      // B
      strut(B, LM, mk, paint, x, -1.36, 0.98, -0.88, 1.42, 0.24);    // C
    }
    interior(B, LM, { burnt, W, seatZ: 0.05, rearZ: -0.95, dashZ: 0.78 });
    carDetails(B, LM, { L, W, burnt, paint, mk, mirrorZ: 0.88, mirrorY: 1.02, seams: [0.98, -0.25, -1.3], handles: [0.32, -0.78], headY: 0.72, tailY: 0.82 });
    wheelSet(B, M, 0.8, [1.42, -1.42], 0.33, 0.24, { burnt, lift });
    return { rays: [{ w: 1.9, h: 1.0 + lift, d: 4.8, x: 0, y: (1.0 + lift) / 2, z: 0 }, { w: 1.66, h: 0.5, d: 2.3, x: 0, y: 1.19 + lift, z: -0.3 }],
      smoke: burnt ? { x: 0, y: 1.0, z: 1.5 } : null };
  },

  suv(B, M, o) {
    const burnt = !!o.burnt, paint = burnt ? 0x1b1713 : o.color, mk = burnt ? 'burnt' : 'paint';
    const W = 1.96, L = 4.88, lift = burnt ? -0.1 : 0;
    const LM = burnt ? partMatrix(M, 0, lift, 0, 1, 1, 1).clone() : M;
    const ax = [{ z: 1.5, r: 0.48, c: 0.41 }, { z: -1.5, r: 0.48, c: 0.41 }];
    B.add(mk, profileGeo('suvLow', PRO.suvLow, { yb: 0.38, axles: ax, width: W, bevel: 0.07 }), LM, paint);
    if (!burnt) B.add('glass', profileGeo('suvGlass', PRO.suvGlass, { width: W - 0.2, bevel: 0.03 }), LM, 0xffffff);
    B.add(mk, profileGeo('suvRoof', PRO.suvRoof, { width: W - 0.14, bevel: 0.03 }), LM, burnt ? 0x2a1c12 : paint);
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.08);
      strut(B, LM, mk, paint, x, 1.07, 1.11, 0.42, 1.72, 0.08);
      strut(B, LM, mk, paint, x, -0.3, 1.12, -0.32, 1.73, 0.11);
      strut(B, LM, mk, paint, x, -1.45, 1.13, -1.47, 1.74, 0.12);
      strut(B, LM, mk, paint, x, -2.3, 1.13, -2.24, 1.74, 0.16);
      if (!burnt) B.add('chrome', GEO.box, partMatrix(LM, s * 0.72, 1.85, -0.9, 0.05, 0.05, 2.6), 0x2a2c2e);     // roof rails
      B.add('trim', GEO.box, partMatrix(LM, s * (W / 2 + 0.02), 0.58, 0, 0.05, 0.16, 3.6), 0x1a1a1b);            // cladding
    }
    if (!burnt) {
      for (const z of [-0.2, -1.6]) B.add('trim', GEO.box, partMatrix(LM, 0, 1.86, z, 1.5, 0.04, 0.06), 0x2a2c2e);   // cross bars
      B.add('tire', GEO.tire, partMatrix(LM, 0, 0.95, -2.52, 0.28 / 0.56, 0.36, 0.36, 0, Math.PI / 2), 0x151515);   // spare wheel
      B.add('rim', GEO.cyl, partMatrix(LM, 0, 0.95, -2.52, 0.2, 0.22, 0.22, 0, Math.PI / 2), 0x9ea4aa);
    }
    B.add('trim', GEO.box, partMatrix(LM, 0, 0.55, 2.55, 1.3, 0.45, 0.08), 0x101011);                                  // bull bar
    interior(B, LM, { burnt, W, seatZ: 0.0, rearZ: -1.0, dashZ: 0.85, floorY: 0.78 });
    carDetails(B, LM, { L, W, burnt, paint, mk, mirrorZ: 0.95, mirrorY: 1.2, seams: [1.05, -0.3, -1.45], handles: [0.25, -0.95], headY: 0.86, tailY: 1.0, bumperY: 0.5, grilleY: 0.78, skirtY: 0.42, seamY: 0.78, seamH: 0.62, handleY: 1.02 });
    wheelSet(B, M, 0.86, [1.5, -1.5], 0.4, 0.28, { burnt, lift });
    return { rays: [{ w: 2.02, h: 1.18 + lift, d: 5.0, x: 0, y: (1.18 + lift) / 2, z: 0 }, { w: 1.82, h: 0.66, d: 3.45, x: 0, y: 1.47 + lift, z: -0.6 }],
      smoke: burnt ? { x: 0, y: 1.2, z: 1.6 } : null };
  },

  police(B, M) {
    // full-size cruiser: the sedan shell stretched, two-tone livery, push bar, light bar, spotlight
    const S = partMatrix(M, 0, 0, 0, 1.07, 1.05, 1.075).clone();
    const W = 1.82 * 1.07, L = 4.7 * 1.075, black = 0x111316, white = 0xe9ecef;
    const ax = [{ z: 1.42, r: 0.4, c: 0.34 }, { z: -1.42, r: 0.4, c: 0.34 }];
    B.add('paint', profileGeo('sedanLow', PRO.sedanLow, { yb: 0.3, axles: ax, width: 1.82, bevel: 0.06 }), S, black);
    B.add('glass', profileGeo('sedanGlass', PRO.sedanGlass, { width: 1.62, bevel: 0.03 }), S, 0xffffff);
    B.add('paint', profileGeo('sedanRoof', PRO.sedanRoof, { width: 1.66, bevel: 0.03 }), S, white);
    for (const s of [-1, 1]) {
      const x = s * (1.82 / 2 - 0.08);
      strut(B, S, 'paint', white, x, 1.0, 0.96, 0.25, 1.42, 0.07);
      strut(B, S, 'paint', white, x, -0.25, 0.98, -0.3, 1.42, 0.1);
      strut(B, S, 'paint', white, x, -1.36, 0.98, -0.88, 1.42, 0.24);
      B.add('paint', GEO.box, partMatrix(M, s * (W / 2 + 0.006), 0.72, -0.15, 0.012, 0.42, 2.45), white);         // white doors
      B.add('lens', GEO.box, partMatrix(M, s * (W / 2 + 0.014), 0.72, -0.15, 0.006, 0.07, 2.0), 0x1b3f9a);         // blue stripe
    }
    interior(B, S, { W: 1.82, seatZ: 0.05, rearZ: -0.95, dashZ: 0.78 });
    B.add('interior', GEO.box, partMatrix(S, 0, 1.1, -0.45, 1.5, 0.5, 0.04), 0x2a2a2a);                              // prisoner cage
    carDetails(B, M, { L, W, paint: black, mk: 'paint', mirrorZ: 0.95, mirrorY: 1.07, seams: [1.05, -0.27, -1.4], handles: [0.34, -0.84], headY: 0.75, tailY: 0.86 });
    const P = (x, y, z, w, h, d, key, col, rx = 0, ry = 0, rz = 0) => B.add(key, GEO.box, partMatrix(M, x, y, z, w, h, d, rx, ry, rz), col);
    P(0, 0.62, 2.66, 1.5, 0.5, 0.08, 'trim', 0x0c0c0d);                // push bar
    for (const s of [-1, 1]) P(s * 0.55, 0.62, 2.58, 0.08, 0.5, 0.2, 'trim', 0x0c0c0d);
    P(0, 1.56, -0.32, 1.32, 0.08, 0.32, 'trim', 0x202224);             // light bar base
    P(0, 1.63, -0.32, 0.22, 0.1, 0.3, 'chrome', 0xc0c4c8);
    P(0.92, 1.2, 0.95, 0.08, 0.12, 0.18, 'chrome', 0xc8ccd0);           // A-pillar spotlight
    P(-0.4, 1.9, -1.2, 0.012, 0.75, 0.012, 'trim', 0x0a0a0a);           // antenna
    wheelSet(B, M, 0.86, [1.52, -1.52], 0.34, 0.26, { rim: 0x5a5e62 });
    return { rays: [{ w: 2.04, h: 1.06, d: 5.15, x: 0, y: 0.53, z: 0 }, { w: 1.78, h: 0.55, d: 2.45, x: 0, y: 1.3, z: -0.32 }],
      strobes: [{ x: -0.34, y: 1.66, z: -0.32, color: 0xff1a1a }, { x: 0.34, y: 1.66, z: -0.32, color: 0x1a4dff }] };
  },

  pickup(B, M, o) {
    const c = o.color, W = 2.0, L = 5.5;
    const ax = [{ z: 1.68, r: 0.5, c: 0.42 }, { z: -1.68, r: 0.5, c: 0.42 }];
    B.add('paint', profileGeo('pickLow', PRO.pickLow, { yb: 0.42, axles: ax, width: W, bevel: 0.06 }), M, c);
    B.add('glass', profileGeo('pickGlass', PRO.pickGlass, { width: W - 0.2, bevel: 0.03 }), M, 0xffffff);
    B.add('paint', profileGeo('pickRoof', PRO.pickRoof, { width: W - 0.14, bevel: 0.03 }), M, c);
    const P = (x, y, z, w, h, d, key, col, rx = 0, ry = 0, rz = 0) => B.add(key, GEO.box, partMatrix(M, x, y, z, w, h, d, rx, ry, rz), col);
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.08);
      strut(B, M, 'paint', c, x, 1.37, 1.14, 0.85, 1.72, 0.08);
      strut(B, M, 'paint', c, x, -0.24, 1.15, -0.16, 1.74, 0.14);
      P(s * 0.94, 1.2, -1.53, 0.1, 0.56, 2.38, 'paint', c);                  // bed walls
      P(s * 0.94, 1.49, -1.53, 0.14, 0.04, 2.4, 'trim', 0x1a1a1a);           // bed rail caps
      P(s * 0.62, 1.0, -1.68, 0.36, 0.16, 1.15, 'paint', c);                 // wheel tubs
    }
    P(0, 1.2, -2.7, W, 0.56, 0.08, 'paint', c);                              // tailgate
    P(0, 1.22, -0.36, W - 0.06, 0.12, 0.06, 'trim', 0x1a1a1a);
    P(0, 0.97, -1.53, 1.78, 0.04, 2.3, 'trim', 0x1b1b1b);                    // bed liner
    interior(B, M, { W, seatZ: 0.25, dashZ: 1.05, floorY: 0.78 });
    carDetails(B, M, { L, W, paint: c, mk: 'paint', mirrorZ: 1.25, mirrorY: 1.25, seams: [1.35, -0.3], handles: [0.5], headY: 0.92, tailY: 1.12, bumperY: 0.55, grilleY: 0.8, skirtY: 0.46, seamY: 0.82, seamH: 0.66, handleY: 1.02 });
    B.add('chrome', GEO.box, partMatrix(M, 0, 0.82, 2.73, 1.3, 0.3, 0.05), 0xb8bcc0);
    wheelSet(B, M, 0.9, [1.68, -1.68], 0.42, 0.3, {});
    return { rays: [{ w: 2.06, h: 1.48, d: 5.6, x: 0, y: 0.74, z: 0 }, { w: 1.86, h: 0.6, d: 1.65, x: 0, y: 1.48, z: 0.55 }] };
  },

  boxvan(B, M, o) {
    // delivery box van: rounded cab + 4.9 m ribbed box body with livery and a roll-up door
    const c = o.color, liv = LIVERY[o.livery || 0], W = 2.12;
    const ax = [{ z: 2.25, r: 0.5, c: 0.42 }];
    B.add('paint', profileGeo('vanCab', PRO.vanCab, { yb: 0.36, axles: ax, width: W, bevel: 0.06 }), M, c);
    B.add('glass', profileGeo('vanGlass', PRO.vanGlass, { width: W - 0.2, bevel: 0.03 }), M, 0xffffff);
    const P = (x, y, z, w, h, d, key, col, rx = 0, ry = 0, rz = 0) => B.add(key, GEO.box, partMatrix(M, x, y, z, w, h, d, rx, ry, rz), col);
    P(0, 2.1, 1.82, W - 0.06, 0.12, 0.9, 'paint', c);                                   // cab roof
    for (const s of [-1, 1]) { strut(B, M, 'paint', c, s * (W / 2 - 0.08), 2.26, 1.2, 1.86, 2.02, 0.1); P(s * (W / 2 - 0.06), 1.62, 1.42, 0.1, 0.86, 0.12, 'paint', c); }
    P(0, 1.68, 1.34, W - 0.05, 0.9, 0.06, 'paint', c);                                  // cab back wall
    interior(B, M, { W, seatZ: 1.8, dashZ: 2.55, floorY: 0.9 });
    P(0, 1.8, -1.15, 2.36, 2.62, 4.9, 'box', 0xdedbd2);                                 // cargo box
    P(0, 1.35, -1.15, 2.38, 0.42, 4.92, 'paint', liv);                                  // livery band
    P(0, 1.62, -1.15, 2.385, 0.06, 4.925, 'lens', 0xf0e6c8);
    for (const s of [-1, 1]) for (let z = 1.1; z >= -3.4; z -= 0.56) P(s * 1.185, 1.8, z, 0.02, 2.62, 0.05, 'trim', 0xb8b6ae);   // ribs
    for (let y = 0.6; y <= 3.0; y += 0.2) P(0, y, -3.62, 2.2, 0.02, 0.03, 'trim', 0x9a988f);                                   // roll-up door
    P(0, 3.12, -1.15, 2.38, 0.05, 4.92, 'trim', 0xb0aea6);
    P(0, 0.62, -1.15, 1.8, 0.24, 4.8, 'trim', 0x151515);                                // chassis rails
    for (const s of [-1, 1]) P(s * 0.9, 0.42, -3.1, 0.4, 0.5, 0.03, 'trim', 0x0d0d0d);   // mud flaps
    carDetails(B, M, { L: 6.1, W, paint: c, mk: 'paint', mirrorZ: 2.15, mirrorY: 1.7, seams: [2.25], handles: [1.72], headY: 0.95, tailY: 0.9, bumperY: 0.5, grilleY: 0.76, skirtY: 0.42, seamY: 1.0, seamH: 0.9, handleY: 1.1 });
    wheelSet(B, M, 0.92, [2.25], 0.42, 0.28, {});
    wheelSet(B, M, 0.78, [-2.35], 0.42, 0.24, { dual: true });
    return { rays: [{ w: 2.38, h: 2.75, d: 4.92, x: 0, y: 1.8, z: -1.15 }, { w: 2.14, h: 2.1, d: 1.75, x: 0, y: 1.05, z: 2.2 }, { w: 2.0, h: 0.5, d: 4.9, x: 0, y: 0.25, z: -1.15 }] };
  },

  semi(B, M, o) {
    const P = (x, y, z, w, h, d, key, col, rx = 0, ry = 0, rz = 0) => B.add(key, GEO.box, partMatrix(M, x, y, z, w, h, d, rx, ry, rz), col);
    const cont = o.color;
    // ---- 13.6 m box trailer ----
    P(0, 1.12, -1.4, 2.42, 0.22, 13.2, 'trim', 0x1b1b1c);                 // floor
    P(0, 2.62, -1.4, 2.48, 2.78, 13.2, 'container', cont);                // corrugated box
    for (const s of [-1, 1]) {
      P(s * 1.245, 1.32, -1.4, 0.03, 0.16, 13.2, 'trim', 0x202020);        // bottom rail
      P(s * 1.245, 3.95, -1.4, 0.03, 0.14, 13.2, 'trim', 0x202020);
      P(s * 0.92, 0.62, -1.4, 0.16, 0.5, 12.8, 'trim', 0x111111);          // frame
      P(s * 1.0, 0.8, -6.0, 0.6, 0.16, 2.9, 'trim', 0x141414);             // side under-run guard
      P(s * 0.85, 0.55, 3.5, 0.12, 1.0, 0.12, 'trim', 0x2a2a2a);           // landing gear
      for (const y of [1.6, 3.6]) P(s * 0.5, y, -8.02, 0.06, 0.06, 0.04, 'chrome', 0x9ea2a6);   // door bars
      P(s * 0.4, 2.62, -8.02, 0.05, 2.6, 0.04, 'chrome', 0x9ea2a6);
      P(s * 1.0, 1.0, -8.0, 0.24, 0.12, 0.04, 'lens', 0x900d0d);
    }
    P(0, 0.5, 3.5, 1.6, 0.08, 0.12, 'trim', 0x2a2a2a);
    wheelSet(B, M, 0.78, [-6.1, -4.75], 0.5, 0.3, { dual: true });
    const rays = [{ w: 2.5, h: 3.1, d: 13.2, x: 0, y: 2.48, z: -1.4 }, { w: 2.3, h: 0.95, d: 12.8, x: 0, y: 0.48, z: -1.4 }];
    if (o.cab) {
      const cc = o.cabColor || 0xb0261c;
      P(0, 1.6, 7.75, 2.3, 1.05, 1.75, 'paint', cc);                       // hood
      P(0, 1.1, 8.7, 2.38, 0.6, 0.25, 'chrome', 0xc0c4c8);                 // bumper
      P(0, 1.55, 8.64, 1.3, 0.95, 0.06, 'chrome', 0xb0b4b8);               // grille
      for (const s of [-1, 1]) {
        P(s * 0.85, 1.55, 8.66, 0.28, 0.16, 0.04, 'lens', 0xe8eef4);
        P(s * 1.28, 1.25, 7.85, 0.32, 0.55, 1.35, 'paint', cc, 0, 0, s * -0.12);   // fenders
      }
      P(0, 2.35, 6.0, 2.46, 2.25, 1.8, 'paint', cc);                       // cab
      P(0, 2.95, 6.92, 2.2, 0.92, 0.05, 'glass', 0xffffff, -0.12);
      for (const s of [-1, 1]) P(s * 1.235, 2.95, 6.15, 0.05, 0.8, 1.1, 'glass', 0xffffff);
      P(0, 3.15, 4.65, 2.46, 2.2, 0.9, 'paint', cc);                        // sleeper
      P(0, 3.65, 6.2, 2.3, 0.35, 1.5, 'paint', cc, -0.2);                   // roof fairing
      for (const s of [-1, 1]) {
        B.add('chrome', GEO.vcyl, partMatrix(M, s * 0.98, 3.75, 4.3, 0.1, 2.6, 0.1), 0xa6aaae);            // stacks
        B.add('chrome', GEO.cyl, partMatrix(M, s * 1.0, 0.85, 4.9, 0.95, 0.34, 0.34, 0, Math.PI / 2), 0xc4c8cc);   // fuel tanks
        P(s * 1.38, 2.9, 7.0, 0.06, 0.5, 0.18, 'chrome', 0xb0b4b8);                                         // mirrors
        P(s * 1.24, 1.0, 6.05, 0.4, 0.05, 0.5, 'trim', 0x1a1a1a);                                           // step
      }
      interior(B, M, { W: 2.3, seatZ: 6.2, dashZ: 6.75, floorY: 1.45, wheelX: 0.55 });
      P(0, 0.75, 6.0, 2.0, 0.35, 5.6, 'trim', 0x151515);                    // tractor frame
      wheelSet(B, M, 1.0, [7.7], 0.52, 0.32, {});
      wheelSet(B, M, 0.8, [4.25, 2.95], 0.52, 0.3, { dual: true });
      rays.push({ w: 2.5, h: 3.4, d: 2.7, x: 0, y: 1.7, z: 5.6 }, { w: 2.4, h: 2.2, d: 2.0, x: 0, y: 1.1, z: 7.8 });
    }
    return { rays };
  },

  container(B, M, o) {
    const P = (x, y, z, w, h, d, key, col, rx = 0, ry = 0, rz = 0) => B.add(key, GEO.box, partMatrix(M, x, y, z, w, h, d, rx, ry, rz), col);
    P(0, 1.3, 0, 2.44, 2.6, 6.06, 'container', o.color);
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) P(sx * 1.13, 0.09 + sy * 2.42, sz * 2.94, 0.2, 0.18, 0.2, 'trim', 0x1c1c1c);   // corner castings
    for (const s of [-1, 1]) { P(s * 0.45, 1.3, -3.04, 0.05, 2.5, 0.05, 'chrome', 0x8a8e92); P(s * 0.9, 1.3, -3.04, 0.05, 2.5, 0.05, 'chrome', 0x8a8e92); }
    return { rays: [{ w: 2.44, h: 2.6, d: 6.06, x: 0, y: 1.3, z: 0 }] };
  },
};

// @layout-begin
/**
 * ~36 wrecks along the 220 m span: accident zones and traffic jams with open lanes between them.
 * [type, x, z, yaw, opts]  (yaw 0 = nose toward +Z / Sector B)
 */
const LAYOUT = [
  // -- zone 1: first collision just past Sector A (police on scene)
  ['sedan', -4.6, -77, 0.12, { color: 0 }],
  ['sedan', -1.6, -72.2, 1.05, { color: 3 }],
  ['police', 4.3, -74, -0.22, {}],
  ['suv', 1.6, -63.5, 0.06, { color: 5 }],
  // -- zone 2: jam
  ['sedan', -4.7, -55, -0.04, { color: 2 }],
  ['boxvan', 4.55, -52, 0.02, { color: 3, livery: 0 }],
  ['suv', -1.5, -46, 0.08, { color: 4 }],
  ['sedan', 1.7, -39, -0.12, { color: 9 }],
  // -- zone 3: jack-knifed semi + van
  ['semi', 2.4, -22.5, 0.2, { color: 0, cab: true }],
  ['sedan', -3.6, -34.5, 1.25, { burnt: true }],
  ['pickup', -4.55, -15.5, -0.08, { color: 6 }],
  ['sedan', -1.4, -7.5, 0.35, { color: 10 }],
  // -- zone 4: pile-up
  ['suv', -4.5, 3, -0.3, { color: 1 }],
  ['sedan', 1.4, 2.0, -0.55, { burnt: true }],
  ['police', 4.75, 11.5, 0.08, {}],
  ['sedan', -2.0, 12, 1.45, { color: 0 }],
  // -- zone 5: traffic jam (all four lanes, staggered)
  ['sedan', -4.75, 23, 0.03, { color: 4 }],
  ['suv', -1.55, 27, -0.04, { color: 2 }],
  ['sedan', 4.75, 25.5, 0.0, { color: 5 }],
  ['boxvan', 1.65, 37.5, 0.04, { color: 3, livery: 2 }],
  ['sedan', -4.65, 38.5, 0.1, { color: 7 }],
  ['pickup', 4.65, 46, -0.12, { color: 8 }],
  // -- zone 6: second semi + spilled container
  ['semi', -3.0, 63, -0.09, { color: 3, cab: true, cabColor: 0x2a4a7a }],
  ['container', 3.4, 57.5, 0.42, { color: 1 }],
  ['sedan', 4.3, 70.5, -0.4, { color: 11 }],
  ['suv', 1.0, 76.5, 0.9, { color: 6 }],
  // -- zone 7: police roadblock that failed
  ['sedan', -1.3, 85, 2.6, { burnt: true }],
  ['police', -4.6, 90, -0.3, {}],
  ['suv', 4.0, 88.5, 0.25, { burnt: true }],
  ['police', 1.6, 96, 1.35, {}],
  // -- zone 8: last cover before Sector B
  ['boxvan', -4.4, 101.5, -0.06, { color: 2, livery: 1 }],
  ['sedan', 4.55, 103.5, -0.08, { color: 1 }],
  ['pickup', 0.9, 106, 0.2, { color: 0 }],
  ['sedan', -1.6, -84.6, 1.52, { color: 8 }],
];

// @layout-end

const RAY_MAT = new THREE.MeshBasicMaterial({ visible: false });

/** Fixed-size pool of real lights that follows the player around a list of emitters (constant light count = no shader rebuilds). */
class LightPool {
  constructor(root, n, make) {
    this.lights = [];
    for (let i = 0; i < n; i++) { const l = make(); root.add(l); if (l.target) root.add(l.target); this.lights.push({ light: l, src: null }); }
    this.active = n; this.t = 0;
  }
  setActive(n) { this.active = Math.min(n, this.lights.length); this.lights.forEach((L, i) => { L.light.visible = i < this.active; if (i >= this.active) L.src = null; }); }
  assign(srcs, fx, fz, ahead) {
    const scored = srcs.map((s) => ({ s, d: Math.hypot(s.x - fx, s.z - fz) - (ahead && (s.z - fz) * ahead > 0 ? 7 : 0) }));
    scored.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.active; i++) this.lights[i].src = scored[i] ? scored[i].s : null;
  }
}

// =========================================================
export function buildBridgeWorld(arena) {
  const R = rng(9001);
  const root = arena.root;
  const W = {
    lamps: [], strobes: [], fires: [], smokes: [], beacons: [], mist: [],
    t: 0, quality: 'medium', fx: null, focus: new THREE.Vector3(0, 0, BRIDGE.minZ + 8), ahead: 1, poolT: 0,
  };
  const puddles = puddleTex(R);
  const tex = {
    asphalt: asphaltTex(R), concrete: concreteTex(R), deck: concreteTex(R, '#6d6b66'), steel: concreteTex(R, '#5d636b'),
    corr: corrugatedTex(R), glow: glowTex(), mist: mistTex(R),
  };
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const Z0 = BRIDGE.deckMin, Z1 = BRIDGE.deckMax, LEN = Z1 - Z0, ZC = (Z0 + Z1) / 2;

  // tactical night ambient: cool slate blue, shadows never go pitch black (only on while this map is shown)
  const amb = new THREE.AmbientLight(0x3e4a5d, 3.4);
  root.add(amb);
  W.ambient = amb;

  // ---------------- deck + wet asphalt ----------------
  const HW = 7.0;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, LEN),
    makeWet(std({ map: rep(tex.asphalt, HW * 2 / 4, LEN / 4), roughness: 0.62, metalness: 0.0, envMapIntensity: 1.1 }), puddles));
  road.rotation.x = -Math.PI / 2; road.position.z = ZC;
  road.receiveShadow = true;
  root.add(road);
  arena.raycastMeshes.push(road);
  arena.groundMesh = road;

  const deckMat = std({ map: rep(tex.deck, 6, LEN / 6), roughness: 0.9 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(19.6, 1.8, LEN), deckMat);
  slab.position.set(0, -0.92, ZC); slab.receiveShadow = true; root.add(slab);
  for (const s of [-1, 1]) {               // walkways outside the barriers
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, LEN), makeWet(std({ map: rep(tex.concrete, 1, LEN / 4), roughness: 0.7 }), puddles, 1 / 9));
    w.position.set(s * 8.4, 0.09, ZC); w.receiveShadow = true; root.add(w);
  }
  const girderMat = std({ map: rep(tex.steel, 1, LEN / 8), roughness: 0.55, metalness: 0.6, color: 0x7d858f });
  for (const x of [-9.5, -5, 0, 5, 9.5]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, LEN), girderMat);
    g.position.set(x, -3.0, ZC); root.add(g);
  }
  {
    const cross = [];
    for (let z = Z0 + 2; z <= Z1; z += 6) cross.push(z);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(19.4, 0.5, 0.4), girderMat, cross.length);
    cross.forEach((z, i) => { _m.makeTranslation(0, -4.1, z); im.setMatrixAt(i, _m); });
    root.add(im);
  }

  // ---------------- lane markings (reflective paint + cat-eyes) ----------------
  const paintW = std({ color: 0xd8d8cf, roughness: 0.32, metalness: 0, emissive: 0x2a2a26, polygonOffset: true, polygonOffsetFactor: -2 });
  const paintY = std({ color: 0xd9a51d, roughness: 0.32, metalness: 0, emissive: 0x2b1f04, polygonOffset: true, polygonOffsetFactor: -2 });
  const strip = (x, w, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, LEN), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, ZC); m.receiveShadow = true; root.add(m);
  };
  strip(-5.9, 0.16, paintW); strip(5.9, 0.16, paintW);
  strip(-0.13, 0.11, paintY); strip(0.13, 0.11, paintY);
  const dashGeo = new THREE.PlaneGeometry(0.13, 3).rotateX(-Math.PI / 2);
  const dashes = [];
  for (let z = Z0 + 2; z < Z1; z += 9) for (const x of [-2.95, 2.95]) dashes.push([x, z]);
  const dashMesh = new THREE.InstancedMesh(dashGeo, paintW, dashes.length);
  dashes.forEach(([x, z], i) => { _m.makeTranslation(x, 0.006, z); dashMesh.setMatrixAt(i, _m); });
  dashMesh.receiveShadow = true; root.add(dashMesh);
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.025, 0.1);
  const eyes = [];
  for (let z = Z0 + 6.5; z < Z1; z += 9) for (const x of [-5.9, -2.95, 2.95, 5.9]) eyes.push([x, z, Math.abs(x) > 5 ? 0 : 1]);
  for (const [col, sel] of [[0xffc35a, 0], [0xe9f2ff, 1]]) {
    const list = eyes.filter((e) => e[2] === sel);
    const im = new THREE.InstancedMesh(eyeGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), toneMapped: false }), list.length);
    list.forEach(([x, z], i) => { _m.makeTranslation(x, 0.012, z); im.setMatrixAt(i, _m); });
    root.add(im);
  }
  for (const [txt, z, flip] of [['SECTOR A', BRIDGE.minZ + 19, false], ['SECTOR B', BRIDGE.maxZ - 10, true], ['100 M', BRIDGE.minZ + 100, false]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: stencilTex(txt), transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.x = -Math.PI / 2; if (flip) m.rotation.z = Math.PI;
    m.position.set(0, 0.008, z); root.add(m);
  }

  // ---------------- 1.2 m Jersey barriers + reinforced steel guardrails ----------------
  const jShape = new THREE.Shape();
  jShape.moveTo(0, 0); jShape.lineTo(0.05, 0); jShape.lineTo(0.05, 0.08); jShape.lineTo(0.2, 0.33);
  jShape.lineTo(0.27, 1.2); jShape.lineTo(0.47, 1.2); jShape.lineTo(0.54, 0.33); jShape.lineTo(0.69, 0.08); jShape.lineTo(0.7, 0); jShape.lineTo(0, 0);
  const jGeo = new THREE.ExtrudeGeometry(jShape, { depth: LEN, bevelEnabled: false, steps: 1 });
  jGeo.translate(0, 0, Z0);
  const jMat = std({ map: rep(tex.concrete, 0.3, 0.8), roughness: 0.85, color: 0xb9b5aa });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(jGeo, jMat);
    m.position.set(s * BRIDGE.halfWidth, 0, 0);
    if (s < 0) m.scale.x = -1;
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
    arena.raycastMeshes.push(m); arena.losMeshes.push(m);
    m.userData.surface = 'concrete';
    // tall invisible collider: the visible barrier is 1.2 m, nobody vaults it into the abyss
    const x0 = s < 0 ? -BRIDGE.halfWidth - 0.7 : BRIDGE.halfWidth;
    arena.colliders.push({ minX: x0, maxX: x0 + 0.7, minZ: Z0, maxZ: Z1, bottom: 0, top: 3.4 });
  }
  const railMat = std({ color: 0x8e959c, roughness: 0.38, metalness: 0.85 });
  const posts = [];
  for (let z = Z0 + 1; z < Z1; z += 2.5) for (const s of [-1, 1]) posts.push([s * 9.45, z]);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), railMat, posts.length);
  posts.forEach(([x, z], i) => { _m.makeTranslation(x, 0.75, z); postMesh.setMatrixAt(i, _m); });
  postMesh.castShadow = true; root.add(postMesh);
  for (const s of [-1, 1]) for (const y of [0.62, 1.0, 1.3]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, y === 1.0 ? 0.3 : 0.12, LEN), railMat);
    r.position.set(s * 9.42, y, ZC); r.castShadow = y === 1.0; root.add(r);
  }
  // reflective delineators on top of the Jersey barriers
  const dels = [];
  for (let z = Z0 + 3; z < Z1; z += 6) for (const s of [-1, 1]) dels.push([s * (BRIDGE.halfWidth + 0.37), z]);
  const delMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(1.4), toneMapped: false }), dels.length);
  dels.forEach(([x, z], i) => { _m.makeTranslation(x, 1.27, z); delMesh.setMatrixAt(i, _m); });
  root.add(delMesh);

  // ---------------- highway floodlight poles: every 18 m on both edges ----------------
  const lampColor = 0xffc27a;
  const poleMat = std({ color: 0x5a6068, roughness: 0.45, metalness: 0.8 });
  const lampSpots = [];
  for (let z = BRIDGE.minZ + 1; z <= Z1 - 4; z += BRIDGE.lampStep) for (const s of [-1, 1]) lampSpots.push({ x: s * 7.75, z: z + (s > 0 ? BRIDGE.lampStep / 2 : 0), s });
  for (let z = BRIDGE.minZ + 1 - BRIDGE.lampStep; z >= Z0 + 4; z -= BRIDGE.lampStep) for (const s of [-1, 1]) lampSpots.push({ x: s * 7.75, z: z + (s > 0 ? BRIDGE.lampStep / 2 : 0), s });
  const n = lampSpots.length;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 10.2, 10), poleMat, n);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.14, 0.16), poleMat, n);
  const housings = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 0.26, 0.7), poleMat, n);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.05, 0.58), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2b0).multiplyScalar(2.6), toneMapped: false }), n);
  const poolMat = new THREE.MeshBasicMaterial({ map: tex.glow, color: lampColor, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, n);
  const haloMat = new THREE.SpriteMaterial({ map: tex.glow, color: 0xffcf8a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  const CONE_H = 10, HEAD_Y = 10.15;
  const coneGeo = new THREE.ConeGeometry(5.2, CONE_H, 28, 1, true);
  lampSpots.forEach((L, i) => {
    _m.makeTranslation(L.x, 5.1 + 0.18, L.z); poles.setMatrixAt(i, _m);
    _m.makeTranslation(L.x - L.s * 1.25, HEAD_Y + 0.12, L.z); arms.setMatrixAt(i, _m);
    const hx = L.x - L.s * 2.35;
    _m.makeTranslation(hx, HEAD_Y + 0.05, L.z); housings.setMatrixAt(i, _m);
    _m.makeTranslation(hx, HEAD_Y - 0.1, L.z); heads.setMatrixAt(i, _m);
    _m.compose(_p.set(hx * 0.8, 0.012, L.z), _q.identity(), _s.set(15, 1, 15)); pools.setMatrixAt(i, _m);
    const halo = new THREE.Sprite(haloMat.clone());
    halo.position.set(hx, HEAD_Y - 0.25, L.z); halo.scale.setScalar(3.2); root.add(halo);
    const cone = new THREE.Mesh(coneGeo, coneMaterial(lampColor, CONE_H));
    cone.position.set(hx, HEAD_Y - CONE_H / 2, L.z); cone.renderOrder = 5; root.add(cone);
    W.lamps.push({ x: hx, z: L.z, y: HEAD_Y - 0.25, cone, halo, k: 1, flicker: i === 9 || i === 22, ft: 0 });
  });
  for (const im of [poles, arms, housings]) { im.castShadow = true; root.add(im); }
  root.add(heads, pools);
  // real lights: broad downward SpotLights re-assigned to the poles around the player
  const LAMP_I = 260;
  W.lampPool = new LightPool(root, 10, () => {
    const l = new THREE.SpotLight(lampColor, 0, 38, 1.08, 0.7, 1.6);
    l.castShadow = false;
    return l;
  });
  W.lampAt = (x, z) => {
    let k = 0;
    for (const L of W.lamps) {
      const d = Math.hypot(L.x - x, L.z - z);
      if (d < 13) k = Math.max(k, (1 - d / 13) * L.k);
    }
    return k;
  };

  // ---------------- suspension towers + cables ----------------
  const towerMat = std({ map: rep(tex.concrete, 1, 8), color: 0x8d8b86, roughness: 0.8 });
  const TOWERS = [-48, 78], TOP = 54, CX = 10.6;
  for (const tz of TOWERS) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.8, 130, 2.6), towerMat);
      leg.position.set(s * CX, TOP - 65, tz); leg.castShadow = true; leg.receiveShadow = true; root.add(leg);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 3.0), towerMat);
      cap.position.set(s * CX, TOP + 0.6, tz); root.add(cap);
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      beacon.position.set(s * CX, TOP + 1.6, tz); beacon.scale.setScalar(2.6); root.add(beacon);
      W.beacons.push({ sprite: beacon, phase: s > 0 ? 0 : 0.5 });
    }
    for (const y of [16, 34, TOP - 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(CX * 2 + 1.8, 2.0, 2.0), towerMat);
      beam.position.set(0, y, tz); beam.castShadow = true; root.add(beam);
    }
    for (const s of [-1, 1]) {
      const len = Math.hypot(CX * 2, 16);
      const br = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.9), towerMat);
      br.position.set(0, 25, tz); br.rotation.z = s * Math.atan2(16, CX * 2); root.add(br);
    }
  }
  const cableY = (z) => {
    const [a, b] = TOWERS, mid = (a + b) / 2, half = (b - a) / 2;
    if (z >= a && z <= b) return 4.4 + (TOP - 4.4) * Math.pow((z - mid) / half, 2);
    const s = z < a ? (a - z) / (a - Z0) : (z - b) / (Z1 - b);
    return 1.2 + (TOP - 1.2) * Math.pow(1 - Math.min(1, s), 2);
  };
  const cableMat = std({ color: 0x6f757d, roughness: 0.35, metalness: 0.9 });
  for (const s of [-1, 1]) {
    const pts = [];
    for (let z = Z0; z <= Z1; z += 2) pts.push(new THREE.Vector3(s * CX, cableY(z), z));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.32, 8), cableMat);
    tube.castShadow = true; root.add(tube);
  }
  const hangers = [];
  for (let z = Z0 + 4; z < Z1; z += 4) {
    if (TOWERS.some((t) => Math.abs(t - z) < 2)) continue;
    for (const s of [-1, 1]) hangers.push([s * CX, z, cableY(z)]);
  }
  const hangMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 5).translate(0, 0.5, 0), cableMat, hangers.length);
  hangers.forEach(([x, z, y], i) => { _m.compose(_p.set(x, 0.2, z), _q.identity(), _s.set(1, y - 0.2, 1)); hangMesh.setMatrixAt(i, _m); });
  root.add(hangMesh);
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, LEN), girderMat);
    g.position.set(s * CX, -0.5, ZC); g.castShadow = true; root.add(g);
  }

  // ---------------- sign gantries ----------------
  const gMat = std({ color: 0x80868c, roughness: 0.5, metalness: 0.75 });
  for (const [gz, face] of [[-60, Math.PI], [52, Math.PI]]) {
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.6, 0.4), gMat);
      p.position.set(s * 7.75, 3.9, gz); p.castShadow = true; root.add(p);
    }
    for (const y of [6.7, 7.5]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(15.9, 0.18, 0.18), gMat);
      b.position.set(0, y, gz); root.add(b);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.0, 0.12), [gMat, gMat, gMat, gMat, null, gMat]);
    const st = signTex();
    sign.material[4] = std({ map: st, emissiveMap: st, emissive: 0x3a3a3a, roughness: 0.4 });
    sign.rotation.y = face;
    sign.position.set(-1.2, 6.0, gz - 0.2); sign.castShadow = true; root.add(sign);
  }

  // ---------------- the abyss: drifting mist layers ----------------
  for (const [y, op, sp] of [[-6, 0.5, 0.004], [-16, 0.65, -0.003], [-30, 0.8, 0.002]]) {
    const t = tex.mist.clone(); t.needsUpdate = true; t.repeat.set(6, 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({
      map: t, color: 0x3a4a62, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, y, ZC); root.add(m);
    W.mist.push({ tex: t, sp });
  }

  // ---------------- sky dome + moon ----------------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(560, 40, 20), skyMaterial());
  sky.renderOrder = -10; sky.frustumCulled = false; sky.position.z = ZC; root.add(sky);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xcfdcff, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  moon.position.set(-170, 200, 360); moon.scale.setScalar(70); root.add(moon);
  W.sky = sky; W.moon = moon;

  // ---------------- vehicles ----------------
  const VB = new Buckets();
  const vmats = {
    paint: std({ vertexColors: true, roughness: 0.3, metalness: 0.55, envMapIntensity: 1.25 }),
    trim: std({ vertexColors: true, roughness: 0.75, metalness: 0.3, side: THREE.DoubleSide }),
    glass: std({ color: 0x1b2a34, roughness: 0.04, metalness: 0.3, envMapIntensity: 1.6, transparent: true, opacity: 0.5, depthWrite: false }),
    interior: std({ vertexColors: true, roughness: 0.9, metalness: 0.05 }),
    tire: std({ vertexColors: true, roughness: 0.92 }),
    rim: std({ vertexColors: true, roughness: 0.25, metalness: 1.0 }),
    chrome: std({ vertexColors: true, roughness: 0.2, metalness: 1.0 }),
    burnt: std({ vertexColors: true, roughness: 1.0, metalness: 0.25 }),
    box: std({ vertexColors: true, roughness: 0.6, metalness: 0.2 }),
    container: std({ vertexColors: true, map: tex.corr, roughness: 0.55, metalness: 0.45 }),
    lens: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  W.vehicles = [];
  const vm = new THREE.Matrix4();
  const colorOf = (type, opts) => {
    if (typeof opts.color !== 'number') return;
    const list = type === 'semi' || type === 'container' ? CONTAINER_COLORS : PAINTS;
    opts.color = list[opts.color % list.length];
  };
  LAYOUT.forEach(([type, x, z, yaw, o], idx) => {
    const opts = { ...o };
    colorOf(type, opts);
    const tilt = opts.burnt ? 0.03 : (R() - 0.5) * 0.02;
    vm.compose(_p.set(x, 0, z), _q.setFromEuler(_e.set(tilt, yaw, (R() - 0.5) * 0.025)), _s.set(1, 1, 1));
    const info = VEHICLES[type](VB, vm.clone(), opts);
    const veh = { type, x, z, yaw, boxes: [], cx: x, cz: z };
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const b of info.rays) {
      const mesh = new THREE.Mesh(BOX, RAY_MAT);
      mesh.scale.set(b.w, b.h, b.d);
      mesh.position.set(x + b.x * c + b.z * s, b.y, z - b.x * s + b.z * c);
      mesh.rotation.y = yaw;
      mesh.userData = { surface: 'metal', vehicle: idx };
      root.add(mesh);
      mesh.updateMatrixWorld(true);
      arena.raycastMeshes.push(mesh); arena.losMeshes.push(mesh);
      const bottom = b.y - b.h / 2, top = b.y + b.h / 2;
      if (bottom < 0.5) addOBBColliders(arena, mesh.position.x, mesh.position.z, b.w, b.d, yaw, top);
      veh.boxes.push({ cx: mesh.position.x, cz: mesh.position.z, w: b.w, d: b.d, yaw, top, bottom });
    }
    if (info.strobes) {
      const lights = [];
      for (const st of info.strobes) {
        const wx = x + st.x * c + st.z * s, wz = z - st.x * s + st.z * c;
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.26), new THREE.MeshBasicMaterial({ color: st.color, toneMapped: false }));
        lens.position.set(wx, st.y, wz); lens.rotation.y = yaw; root.add(lens);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: st.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        glow.position.set(wx, st.y + 0.05, wz); glow.scale.setScalar(2.2); root.add(glow);
        lights.push({ lens, glow, color: new THREE.Color(st.color), on: false });
      }
      W.strobes.push({ lights, phase: R() * 2, x, z, y: info.strobes[0].y + 0.35 });
    }
    if (info.smoke) {
      const p = new THREE.Vector3(x + info.smoke.x * c + info.smoke.z * s, info.smoke.y, z - info.smoke.x * s + info.smoke.z * c);
      W.smokes.push({ pos: p, acc: R(), fireAcc: 0 });
      W.fires.push({ x: p.x, z: p.z, y: p.y + 0.6, base: 9, t: R() * 10, k: 1 });
    }
    W.vehicles.push(veh);
  });
  // fog-shrouded wrecks beyond the walkable ends (scale + mood only; no collision)
  [['semi', -3.4, 140, 0.4, { color: 2, cab: true }], ['sedan', 3.5, 128, -0.4, { color: 3 }], ['boxvan', 1.0, 152, 1.1, { color: 5 }],
    ['sedan', -4.5, -112, 0.3, { color: 1 }], ['pickup', 3.8, -121, -0.2, { color: 4 }], ['suv', 0.5, 160, 1.0, { burnt: true }],
    ['sedan', -1.8, -134, 1.3, { burnt: true }],
  ].forEach(([type, x, z, yaw, o]) => {
    const opts = { ...o };
    colorOf(type, opts);
    vm.compose(_p.set(x, 0, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1));
    VEHICLES[type](VB, vm.clone(), opts);
  });
  W.vehicleTris = Math.round(VB.tris);
  W.vehicleMeshes = VB.build(root, vmats);

  W.strobePool = new LightPool(root, 4, () => new THREE.PointLight(0xff2020, 0, 18, 2));
  W.firePool = new LightPool(root, 3, () => new THREE.PointLight(0xff7a2a, 0, 10, 2));

  // ---------------- Sector B: debris barricade with gaps, burning barrels ----------------
  const BZ = BRIDGE.maxZ - 11.5;
  const blockMat = std({ map: rep(tex.concrete, 1, 1), color: 0xa8a49a, roughness: 0.88 });
  arena._instancedBlocks([[-5.25, BZ, 1.9, 1.05, 0.9, 0.08], [-1.95, BZ - 0.4, 1.9, 1.05, 0.9, -0.06], [1.45, BZ + 0.1, 1.9, 1.05, 0.9, 0.1], [4.85, BZ - 0.3, 1.9, 1.05, 0.9, -0.05]], blockMat);
  const barrelMat = std({ color: 0x5b3a22, roughness: 0.6, metalness: 0.5 });
  const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14);
  const barrels = [[-3.6, BZ + 1.6], [3.1, BZ + 1.2], [0.2, BZ + 3.8], [-5.2, BRIDGE.minZ + 3.4]];
  const barrelMesh = new THREE.InstancedMesh(barrelGeo, barrelMat, barrels.length);
  barrels.forEach(([bx, bz], i) => {
    _m.makeTranslation(bx, 0.45, bz); barrelMesh.setMatrixAt(i, _m);
    arena.colliders.push({ minX: bx - 0.3, maxX: bx + 0.3, minZ: bz - 0.3, maxZ: bz + 0.3, bottom: 0, top: 0.9 });
    W.fires.push({ x: bx, z: bz, y: 1.4, base: 7, t: R() * 10, k: 1, barrel: new THREE.Vector3(bx, 0.95, bz) });
  });
  barrelMesh.castShadow = true; barrelMesh.userData.surface = 'metal'; barrelMesh.computeBoundingSphere(); root.add(barrelMesh);
  arena.raycastMeshes.push(barrelMesh); arena.losMeshes.push(barrelMesh);

  // traffic cones + rubble (instanced, visual only)
  const tconeGeo = new THREE.ConeGeometry(0.17, 0.55, 10).translate(0, 0.275, 0);
  const tcones = [];
  for (let i = 0; i < 48; i++) tcones.push([(R() - 0.5) * 11.5, BRIDGE.minZ + 16 + R() * (BRIDGE.maxZ - BRIDGE.minZ - 20), R() < 0.3]);
  const tcMesh = new THREE.InstancedMesh(tconeGeo, std({ color: 0xff5a10, roughness: 0.6, emissive: 0x2a0800 }), tcones.length);
  tcones.forEach(([x, z, fallen], i) => {
    if (arena._boxBlocked(x, z, 0.3)) { x = -x * 0.5; }
    _m.compose(_p.set(x, fallen ? 0.17 : 0, z), _q.setFromEuler(_e.set(fallen ? Math.PI / 2 : 0, R() * 6, 0)), _s.set(1, 1, 1));
    tcMesh.setMatrixAt(i, _m);
  });
  tcMesh.castShadow = true; root.add(tcMesh);
  const rub = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.18, 0), std({ map: tex.concrete, color: 0x8c877d, roughness: 0.95 }), 160);
  for (let i = 0; i < 160; i++) {
    const near = i < 50;
    const x = (R() - 0.5) * 12;
    const z = near ? BZ - 2 + R() * 10 : BRIDGE.minZ + 14 + R() * (BRIDGE.maxZ - BRIDGE.minZ - 24);
    const sc = 0.4 + R() * 1.4;
    _m.compose(_p.set(x, 0.06 * sc, z), _q.setFromEuler(_e.set(R() * 3, R() * 3, R() * 3)), _s.set(sc, sc * 0.6, sc));
    rub.setMatrixAt(i, _m);
  }
  rub.castShadow = true; rub.receiveShadow = true; root.add(rub);

  // ---------------- cover spots around the vehicles (enemy AI) ----------------
  arena.coverSpots = [];
  for (const v of W.vehicles) {
    for (const b of v.boxes) {
      if (b.top < 0.95 || b.bottom > 0.5) continue;
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      const ax = { x: s, z: c }, side = { x: c, z: -s };
      const hl = b.d / 2, hw = b.w / 2;
      const push = (u, v2, nx, nz) => {
        let off = 0.85;
        for (let k = 0; k < 4; k++, off += 0.25) {
          const px = b.cx + ax.x * u + side.x * v2 + nx * off, pz = b.cz + ax.z * u + side.z * v2 + nz * off;
          if (Math.abs(px) > BRIDGE.halfWidth - 0.5 || pz < BRIDGE.minZ + 16 || pz > BRIDGE.maxZ - 4) return;
          if (!arena.isBlocked(px, pz, 0.45)) { arena.coverSpots.push({ x: px, z: pz, nx, nz, veh: v, top: b.top, taken: null }); return; }
        }
      };
      for (let u = -hl + 0.8; u <= hl - 0.6; u += 1.5) { push(u, hw, side.x, side.z); push(u, -hw, -side.x, -side.z); }
      push(hl, 0, ax.x, ax.z); push(-hl, 0, -ax.x, -ax.z);
    }
  }

  // ---------------- quality + per-frame animation ----------------
  W.setQuality = (q) => {
    W.quality = q;
    W.lampPool.setActive(q === 'ultra' ? 10 : q === 'medium' ? 6 : 4);
    W.strobePool.setActive(q === 'ultra' ? 4 : q === 'medium' ? 2 : 1);
    W.firePool.setActive(q === 'ultra' ? 3 : q === 'medium' ? 2 : 1);
    for (const L of W.lamps) L.cone.visible = q !== 'low';
    poolMat.opacity = q === 'low' ? 0.5 : q === 'medium' ? 0.36 : 0.3;
    W.poolT = 0;
  };
  /** Where the player is (lights follow); ahead = +1 when looking toward Sector B. */
  W.setFocus = (x, z, ahead = 1) => { W.focus.set(x, 0, z); W.ahead = ahead; };

  W.update = (dt) => {
    W.t += dt;
    const t = W.t, fx = W.fx;
    for (const L of W.lamps) {
      let k = 1;
      if (L.flicker) {
        L.ft -= dt;
        if (L.ft <= 0) { L.ft = 0.04 + Math.random() * (Math.random() < 0.15 ? 1.2 : 0.12); L.fk = Math.random() < 0.6 ? 1 : 0.15 + Math.random() * 0.25; }
        k = L.fk === undefined ? 1 : L.fk;
        L.cone.material.uniforms.uOpacity.value = 0.16 * k;
        L.halo.material.opacity = 0.9 * k;
      }
      L.k = k;
    }
    for (const S of W.strobes) {
      const ph = (t * 1.6 + S.phase) % 1;
      const flash = (a) => (ph > a && ph < a + 0.09) || (ph > a + 0.16 && ph < a + 0.25);
      S.lights.forEach((l, i) => {
        const on = flash(i === 0 ? 0 : 0.5);
        l.glow.material.opacity = on ? 1 : 0.06;
        l.glow.scale.setScalar(on ? 3.4 : 1.6);
        l.lens.material.color.copy(l.color).multiplyScalar(on ? 3 : 0.25);
        l.on = on;
      });
    }
    for (const B of W.beacons) B.sprite.material.opacity = ((t * 0.7 + B.phase) % 1) < 0.18 ? 1 : 0.08;
    for (const F of W.fires) { F.t += dt; F.k = 0.7 + 0.3 * Math.sin(F.t * 13) * Math.sin(F.t * 7.3 + 1) + Math.random() * 0.15; }
    for (const M of W.mist) { M.tex.offset.x += M.sp * dt * 10; M.tex.offset.y += M.sp * dt * 6; }

    // ---- pooled real lights ----
    W.poolT -= dt;
    if (W.poolT <= 0) {
      W.poolT = 0.2;
      const f = W.focus;
      W.lampPool.assign(W.lamps, f.x, f.z, W.ahead);
      W.strobePool.assign(W.strobes, f.x, f.z, W.ahead);
      W.firePool.assign(W.fires, f.x, f.z, 0);
      for (const P of W.lampPool.lights) if (P.src) {
        P.light.position.set(P.src.x, P.src.y, P.src.z);
        P.light.target.position.set(P.src.x * 0.45, 0, P.src.z);
        P.light.target.updateMatrixWorld();
      }
      for (const P of W.firePool.lights) if (P.src) P.light.position.set(P.src.x, P.src.y, P.src.z);
      for (const P of W.strobePool.lights) if (P.src) P.light.position.set(P.src.x, P.src.y, P.src.z);
    }
    for (const P of W.lampPool.lights) P.light.intensity = P.src && P.light.visible ? LAMP_I * P.src.k : 0;
    for (const P of W.firePool.lights) P.light.intensity = P.src && P.light.visible ? P.src.base * P.src.k : 0;
    for (const P of W.strobePool.lights) {
      const lit = P.src && P.light.visible && P.src.lights.find((l) => l.on);
      P.light.intensity = lit ? 55 : 0;
      if (lit) P.light.color.copy(lit.color);
    }

    if (!fx) return;
    const rate = W.quality === 'ultra' ? 1 : W.quality === 'medium' ? 0.65 : 0.35;
    const Rr = Math.random, fz = W.focus.z;
    for (const S of W.smokes) {
      const far = Math.abs(S.pos.z - fz) > 95 ? 0.35 : 1;
      S.acc += dt * 9 * rate * far;
      while (S.acc >= 1) {
        S.acc -= 1;
        const c = 0.07 + Rr() * 0.06;
        fx.soft.emit(S.pos.x + (Rr() - 0.5) * 0.8, S.pos.y + Rr() * 0.3, S.pos.z + (Rr() - 0.5) * 0.8,
          (Rr() - 0.5) * 0.4 + 0.25, 1.4 + Rr() * 0.9, (Rr() - 0.5) * 0.4, c, c, c * 1.05, 0.7 + Rr() * 0.5, 5 + Rr() * 2.5, 0.12, 4.2, 0.62, 0.15);
      }
      S.fireAcc += dt * 26 * rate * far;
      while (S.fireAcc >= 1) {
        S.fireAcc -= 1;
        fx.glow.emit(S.pos.x + (Rr() - 0.5) * 0.9, S.pos.y - 0.1, S.pos.z + (Rr() - 0.5) * 0.9,
          (Rr() - 0.5) * 0.3, 1.2 + Rr() * 1.2, (Rr() - 0.5) * 0.3, 1, 0.42 + Rr() * 0.25, 0.08, 0.28 + Rr() * 0.28, 0.32 + Rr() * 0.25, 1.5, -0.4, 0.9, 0.5);
        if (Rr() < 0.06) fx.glow.emit(S.pos.x, S.pos.y + 0.4, S.pos.z, (Rr() - 0.5) * 1.2, 2.5 + Rr() * 2, (Rr() - 0.5) * 1.2, 1, 0.6, 0.2, 0.03, 1.6, -1, 0, 1, 0.2);
      }
    }
    for (const F of W.fires) {
      if (!F.barrel) continue;
      F.acc = (F.acc || 0) + dt * 18 * rate;
      while (F.acc >= 1) {
        F.acc -= 1;
        fx.glow.emit(F.barrel.x + (Rr() - 0.5) * 0.35, F.barrel.y, F.barrel.z + (Rr() - 0.5) * 0.35,
          (Rr() - 0.5) * 0.2, 0.9 + Rr() * 0.8, (Rr() - 0.5) * 0.2, 1, 0.45 + Rr() * 0.2, 0.1, 0.22 + Rr() * 0.2, 0.3 + Rr() * 0.2, 1.2, -0.3, 0.9, 0.5);
        if (Rr() < 0.25) {
          const c = 0.08 + Rr() * 0.05;
          fx.soft.emit(F.barrel.x, F.barrel.y + 0.5, F.barrel.z, (Rr() - 0.5) * 0.3, 1 + Rr() * 0.6, (Rr() - 0.5) * 0.3, c, c, c, 0.35, 3.5, 0.1, 3, 0.45, 0.2);
        }
      }
    }
  };

  /** Strongest light-bar flash near a point (used to tint the first-person viewmodel). */
  W.nearestStrobe = (x, z) => {
    let best = null, bd = 1e9;
    for (const S of W.strobes) {
      const d = Math.hypot(S.x - x, S.z - z);
      if (d < bd) { bd = d; best = S; }
    }
    return best ? { strobe: best, dist: bd } : null;
  };

  W.setQuality('medium');
  return W;
}

/** Oriented rectangle -> a few axis-aligned colliders (tight fit even when the wreck is rotated). */
function addOBBColliders(arena, cx, cz, w, d, yaw, top) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const n = Math.max(1, Math.ceil(d / 1.5));
  const seg = d / n;
  for (let i = 0; i < n; i++) {
    const u = -d / 2 + seg * (i + 0.5);
    const mx = cx + s * u, mz = cz + c * u;
    const ex = Math.abs(c) * w / 2 + Math.abs(s) * seg / 2;
    const ez = Math.abs(s) * w / 2 + Math.abs(c) * seg / 2;
    arena.colliders.push({ minX: mx - ex, maxX: mx + ex, minZ: mz - ez, maxZ: mz + ez, bottom: 0, top });
  }
}
