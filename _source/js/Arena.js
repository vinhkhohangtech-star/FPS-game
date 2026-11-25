// =========================================================
// Arena — symmetrical 100m x 100m military combat yard
//  * concrete ground, 4.5m perimeter barrier walls
//  * 12 chest-high (1.2m) cover blocks with >=15m lanes
//  * sandbag rows flush against the walls (no wedges / sticking spots)
//  * Armory crate in the centre
//  * axis-aligned colliders + circle-vs-AABB resolution
// Textures are procedural unless assets/textures/{ground,wall,cover}.jpg|png exist.
// =========================================================
import * as THREE from 'three';
import { buildBridgeWorld, BRIDGE } from './Bridge.js';

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, count, alphaMax, R) {
  for (let i = 0; i < count; i++) {
    const v = R() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${R() * alphaMax})`;
    const s = 1 + R() * 2.5;
    g.fillRect(R() * w, R() * h, s, s);
  }
}

function stains(g, w, h, count, R, color = '0,0,0', strength = 0.12) {
  for (let i = 0; i < count; i++) {
    const x = R() * w, y = R() * h, r = 20 + R() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${color},${strength * R()})`);
    grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function makeGroundTex(R) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7f7c74'; g.fillRect(0, 0, w, h);
    stains(g, w, h, 16, R, '40,36,30', 0.22);
    stains(g, w, h, 8, R, '200,195,180', 0.08);
    speckle(g, w, h, 12000, 0.13, R);
    // slab seams (2x2 slabs per tile)
    g.fillStyle = 'rgba(30,28,24,0.55)';
    g.fillRect(0, 0, w, 3); g.fillRect(0, h / 2, w, 3);
    g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 3, h);
    // cracks
    g.strokeStyle = 'rgba(25,22,18,0.45)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      let x = R() * w, y = R() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

function makeWallTex(R) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8f8b82'; g.fillRect(0, 0, w, h);
    stains(g, w, h, 12, R, '50,45,38', 0.2);
    speckle(g, w, h, 10000, 0.12, R);
    // vertical drips
    for (let i = 0; i < 28; i++) {
      const x = R() * w, len = 60 + R() * 220;
      const grd = g.createLinearGradient(0, 40, 0, 40 + len);
      grd.addColorStop(0, 'rgba(40,36,30,0.25)'); grd.addColorStop(1, 'rgba(40,36,30,0)');
      g.fillStyle = grd; g.fillRect(x, 40, 2 + R() * 5, len);
    }
    // panel seams
    g.fillStyle = 'rgba(25,23,20,0.7)';
    g.fillRect(0, 0, 4, h); g.fillRect(w / 2, 0, 4, h);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(4, 0, 2, h); g.fillRect(w / 2 + 4, 0, 2, h);
    // top darker band
    g.fillStyle = 'rgba(30,28,24,0.35)'; g.fillRect(0, 0, w, 28);
    // hazard stripes at the bottom
    const sh = 54, y0 = h - sh;
    g.save(); g.beginPath(); g.rect(0, y0, w, sh); g.clip();
    g.fillStyle = '#c99a1c'; g.fillRect(0, y0, w, sh);
    g.fillStyle = '#1b1a17';
    for (let x = -sh; x < w + sh; x += 48) {
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + sh, y0); g.lineTo(x + sh, y0); g.closePath(); g.fill();
    }
    speckle(g, w, h, 3000, 0.25, R);
    g.restore();
    // bolt holes
    g.fillStyle = 'rgba(20,18,15,0.8)';
    for (const x of [40, 216, 296, 472]) for (const y of [70, 380]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  });
}

function makeCoverTex(R) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a29e93'; g.fillRect(0, 0, w, h);
    stains(g, w, h, 8, R, '60,55,45', 0.25);
    speckle(g, w, h, 5000, 0.14, R);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(0,0,0,0.15)'); grd.addColorStop(0.15, 'rgba(0,0,0,0)');
    grd.addColorStop(0.85, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200,150,30,0.75)'; g.fillRect(0, 34, w, 12);
    g.fillStyle = 'rgba(25,23,20,0.5)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  });
}

function makeSandbagTex(R) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f5340'; g.fillRect(0, 0, w, h);
    const bw = 128, bh = 64;
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * bw + (row % 2) * (bw / 2) + 3, y = row * bh + 3;
        const grd = g.createLinearGradient(0, y, 0, y + bh - 6);
        grd.addColorStop(0, '#a8966f'); grd.addColorStop(0.5, '#8c7b58'); grd.addColorStop(1, '#5e5240');
        g.fillStyle = grd;
        g.beginPath();
        const r = 22;
        g.moveTo(x + r, y); g.lineTo(x + bw - 6 - r, y); g.quadraticCurveTo(x + bw - 6, y, x + bw - 6, y + r);
        g.lineTo(x + bw - 6, y + bh - 6 - r); g.quadraticCurveTo(x + bw - 6, y + bh - 6, x + bw - 6 - r, y + bh - 6);
        g.lineTo(x + r, y + bh - 6); g.quadraticCurveTo(x, y + bh - 6, x, y + bh - 6 - r);
        g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
        g.fill();
        g.strokeStyle = 'rgba(50,40,28,0.5)'; g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(x + 10, y + 8); g.lineTo(x + 10, y + bh - 14); g.stroke();
        g.setLineDash([]);
      }
    }
    speckle(g, w, h, 4000, 0.16, R);
  });
}

function makeCrateTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#4b5233'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 3, h); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
    g.fillStyle = '#2b2e22';
    g.fillRect(0, 0, 40, 40); g.fillRect(w - 40, 0, 40, 40); g.fillRect(0, h - 40, 40, 40); g.fillRect(w - 40, h - 40, 40, 40);
    g.fillStyle = '#e8d9a0';
    g.font = 'bold 86px Rajdhani, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ARMORY', w / 2, h / 2 - 16);
    g.font = 'bold 30px Rajdhani, Arial, sans-serif';
    g.fillStyle = '#c9c08a';
    g.fillText('AMMO  •  ARMOR  •  WEAPONS', w / 2, h / 2 + 50);
  });
}

function texFor(base, rx, ry) {
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/** Armory crate: in front of the house (the house occupies the centre). */
export const CRATE_POS = [0, -12.5];
export const PLAYER_START = [0, -16];

export class Arena {
  constructor(scene, mode = 'yard') {
    this.scene = scene;
    this.mode = mode;
    this.root = new THREE.Group();
    this.root.name = 'arena-' + mode;
    scene.add(this.root);
    this.bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    this.playerStart = new THREE.Vector3(PLAYER_START[0], 0, PLAYER_START[1]);
    this.playerYaw = Math.PI;            // facing +Z
    this.center = new THREE.Vector3(0, 0, 0);
    this.viewRadius = 38;
    this._safe = new WeakMap();
    this.colliders = [];     // {minX,maxX,minZ,maxZ,top,bottom}
    this.raycastMeshes = []; // bullets (includes ground)
    this.losMeshes = [];     // line-of-sight blockers (no ground)
    this.spawnPoints = [];
    this.crate = null;
    this.house = null;
  }

  setVisible(v) {
    this.root.visible = v;
    if (this.house && this.house.root) this.house.root.visible = v;
  }

  /** Hook up the centre house: its meshes stop bullets / sight, its triangles collide. */
  attachHouse(house) {
    this.house = house;
    for (const m of house.meshes) { this.raycastMeshes.push(m); this.losMeshes.push(m); }
    house.setArenaBlocker((x, z, r) => this._boxBlocked(x, z, r));
  }

  /** Floor height under (x,z) for something at height y (0 = the yard). */
  floorAt(x, z, y = 0) {
    if (this.mode === 'city') {
      const h = this.house ? this.house.floorAt(x, z, y + 0.3) : -Infinity;
      return h === -Infinity ? 0 : h;
    }
    let g = 0;
    if (this.house) g = Math.max(g, this.house.floorAt(x, z, y + 0.3));
    return g;
  }

  build(userTex = {}) {
    const R = rng(1337);
    const base = {
      ground: userTex.ground || makeGroundTex(R),
      wall: userTex.wall || makeWallTex(R),
      cover: userTex.cover || makeCoverTex(R),
      sandbag: makeSandbagTex(R),
      crate: makeCrateTex(),
    };

    // ---------- ground ----------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ map: texFor(base.ground, 25, 25), roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.raycastMeshes.push(ground);

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({ color: 0x6b6352, roughness: 1 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.03;
    outer.receiveShadow = true;
    this.root.add(outer);

    // ---------- perimeter walls ----------
    const H = 4.5, T = 1.2, L = 100 + T * 2;
    const wallMat = (len) => new THREE.MeshStandardMaterial({ map: texFor(base.wall, len / 6, 1), roughness: 0.9 });
    this._box(0, -50 - T / 2, L, H, T, wallMat(L));
    this._box(0, 50 + T / 2, L, H, T, wallMat(L));
    this._box(-50 - T / 2, 0, T, H, 100, wallMat(100));
    this._box(50 + T / 2, 0, T, H, 100, wallMat(100));
    const capMat = new THREE.MeshStandardMaterial({ color: 0x55524b, roughness: 0.85 });
    this._box(0, -50 - T / 2, L + 0.2, 0.18, T + 0.2, capMat, { y: H, collide: false });
    this._box(0, 50 + T / 2, L + 0.2, 0.18, T + 0.2, capMat, { y: H, collide: false });
    this._box(-50 - T / 2, 0, T + 0.2, 0.18, 100, capMat, { y: H, collide: false });
    this._box(50 + T / 2, 0, T + 0.2, 0.18, 100, capMat, { y: H, collide: false });

    // ---------- 12 chest-high cover blocks (symmetrical, wide lanes) ----------
    const CH = 1.2;
    const covers = [
      [15, 15, 4, 1.2], [-15, 15, 4, 1.2], [15, -15, 4, 1.2], [-15, -15, 4, 1.2],
      [0, 30, 5.5, 1.2], [0, -30, 5.5, 1.2], [30, 0, 1.2, 5.5], [-30, 0, 1.2, 5.5],
      [32, 32, 3, 3], [-32, 32, 3, 3], [32, -32, 3, 3], [-32, -32, 3, 3],
    ];
    for (const [x, z, w, d] of covers) {
      const mat = new THREE.MeshStandardMaterial({ map: texFor(base.cover, Math.max(w, d) / 2.5, 1), roughness: 0.92 });
      this._box(x, z, w, CH, d, mat);
    }

    // ---------- sandbag rows hugging the walls ----------
    const SB = 0.95, depth = 0.8, inner = 50 - depth / 2;
    const rows = [
      [20, -inner, 8, depth], [-20, -inner, 8, depth], [20, inner, 8, depth], [-20, inner, 8, depth],
      [inner, 20, depth, 8], [inner, -20, depth, 8], [-inner, 20, depth, 8], [-inner, -20, depth, 8],
    ];
    this._sandbags(rows, SB, base.sandbag, R);

    // ---------- Armory crate (centre) ----------
    this._makeCrate(CRATE_POS[0], 0, CRATE_POS[1], base.crate);

    // ---------- spawn points ----------
    for (const [x, z] of [[44, 44], [-44, 44], [44, -44], [-44, -44], [0, 44], [0, -44], [44, 0], [-44, 0]]) {
      this.spawnPoints.push(new THREE.Vector3(x, 0, z));
    }

    // ---------- backdrop (non-colliding) ----------
    this._backdrop(R);
  }

  _makeCrate(x, y, z, crateTex) {
    const crate = new THREE.Group();
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.8 });
    const crateSide = new THREE.MeshStandardMaterial({ color: 0x454b2f, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 1.0),
      [crateSide, crateSide, crateSide, crateSide, crateMat, crateMat]);
    body.position.y = 0.475;
    body.castShadow = body.receiveShadow = true;
    crate.add(body);
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x1f2118, roughness: 0.6, metalness: 0.4 });
    for (const x of [-0.55, 0.55]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.97, 1.02), strapMat);
      s.position.set(x, 0.475, 0); s.castShadow = true; crate.add(s);
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x55ff77, emissive: 0x33ff66, emissiveIntensity: 2.5 }));
    lamp.position.set(0, 1.0, 0);
    crate.add(lamp);
    const crateLight = new THREE.PointLight(0x55ff77, 4, 7, 2);
    crateLight.position.set(0, 1.3, 0);
    crate.add(crateLight);
    crate.position.set(x, y, z);
    this.root.add(crate);
    this.crate = crate;
    this.crateLamp = lamp;
    this._addCollider(x, z, 1.6, 0.95, 1.0, y);
    this.raycastMeshes.push(body);
    this.losMeshes.push(body);

  }

  /**
   * City level: the whole map is one triangle-collision mesh (House instance).
   * No yard / walls / cover — just the Armory crate, spawn points and bounds.
   */
  buildCity(house, opts) {
    this.attachHouse(house);
    const b = house.bounds;
    this.bounds = { minX: b.minX + 0.5, maxX: b.maxX - 0.5, minZ: b.minZ + 0.5, maxZ: b.maxZ - 0.5 };
    this.center.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.viewRadius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.45;
    const snap = (x, z) => { const n = house.nearestNode(x, 0, z); return n ? new THREE.Vector3(n.x, n.y, n.z) : new THREE.Vector3(x, 0, z); };
    this.playerStart.copy(snap(opts.start[0], opts.start[1]));
    this.playerYaw = opts.startYaw || 0;
    const c = snap(opts.crate[0], opts.crate[1]);
    this._makeCrate(c.x, c.y, c.z, makeCrateTex());
    // spawn points: reachable street-level nodes far from the start, spread apart (farthest-point sampling)
    const nodes = house.navNodes.filter((n) => n.ok && !house.blocked(n.x, n.z, 0.6, n.y));
    const pts = [];
    if (opts.spawns) for (const [x, z] of opts.spawns) pts.push(snap(x, z));
    else {
      const far = nodes.filter((n) => Math.hypot(n.x - this.playerStart.x, n.z - this.playerStart.z) > 26);
      let pick = far.reduce((a, n) => (!a || Math.hypot(n.x - this.playerStart.x, n.z - this.playerStart.z) > Math.hypot(a.x - this.playerStart.x, a.z - this.playerStart.z) ? n : a), null);
      while (pick && pts.length < 10) {
        pts.push(new THREE.Vector3(pick.x, pick.y, pick.z));
        let best = null, bestD = 0;
        for (const n of far) {
          let d = Infinity;
          for (const p of pts) d = Math.min(d, Math.hypot(n.x - p.x, n.z - p.z));
          if (d > bestD) { bestD = d; best = n; }
        }
        if (bestD < 12) break;
        pick = best;
      }
    }
    this.spawnPoints = pts;
  }

  /**
   * HIGHWAY BRIDGE // ENDLESS DEFENSE: 220 m suspension bridge (Z -100..+120), ~34 wrecks in jams and
   * accident zones, Sector A stronghold (south, Z -90..-95: player + Armory) and Sector B staging zone (north).
   */
  buildBridge() {
    this.endless = true;
    const R = rng(4242);
    const A0 = BRIDGE.minZ;                 // -100: rear wall of Sector A
    this.bounds = { minX: -BRIDGE.halfWidth, maxX: BRIDGE.halfWidth, minZ: BRIDGE.minZ, maxZ: BRIDGE.maxZ };
    this.center.set(0, 0, A0 + 30);
    this.viewRadius = 30;
    this.playerStart.set(-0.8, 0, A0 + 7.2);     // z -92.8, inside the bunker
    this.playerYaw = Math.PI;                    // looking north, straight down the highway

    // ---- Sector A stronghold: U-shaped sandbag perimeter (instanced) + concrete barriers ----
    const sbTex = makeSandbagTex(R);
    this._sandbags([
      [0, A0 + 11.6, 8.6, 0.8],                      // front wall (z -88.4)
      [-4.3, A0 + 8.8, 0.8, 4.8], [4.3, A0 + 8.8, 0.8, 4.8],   // side walls
      [-5.45, A0 + 16.2, 1.5, 0.8], [5.4, A0 + 15.4, 1.6, 0.8],   // forward fighting positions
    ], 1.0, sbTex, R);
    const conc = new THREE.MeshStandardMaterial({ map: texFor(makeCoverTex(R), 1, 1), roughness: 0.9, color: 0xb0aca2 });
    const blocks = [[-5.5, A0 + 3.7, 1.3, 1.25, 2.6, 0], [5.5, A0 + 3.7, 1.3, 1.25, 2.6, 0],
      [-2.3, A0 + 18.4, 1.9, 1.05, 0.75, 0.05], [2.6, A0 + 19.2, 1.9, 1.05, 0.75, -0.04]];
    for (let x = -5.4; x <= 5.5; x += 1.8) blocks.push([x, A0 + 1.1, 1.75, 1.15, 0.7, 0]);   // rear wall
    this._instancedBlocks(blocks, conc);
    // ARMORY crate right beside the player's start, inside cover
    this._makeCrate(1.4, 0, A0 + 6.6, makeCrateTex());

    // ---- Sector B: spawn points behind the debris barricade at the far end ----
    this.spawnPoints = [];
    for (const z of [BRIDGE.maxZ - 6.5, BRIDGE.maxZ - 3.6]) for (const x of [-5.0, -3.1, -1.1, 0.9, 2.7, 4.9]) this.spawnPoints.push(new THREE.Vector3(x, 0, z));

    this.bridge = buildBridgeWorld(this);
    // "forward" spawns: the far side of wrecks deep down the bridge (used only when the player can't see them)
    this.forwardSpawns = this.coverSpots.filter((s) => s.nz > 0.6 && s.z > 20).map((s) => new THREE.Vector3(s.x, 0, s.z));
    this.atmosphere = {
      background: BRIDGE.fogColor, fogExp2: [BRIDGE.fogColor, BRIDGE.fogDensity],
      hemi: [0x5d6e8c, 0x171a20, 0.85],
      // moonlight from behind Sector A: lights the front of hostiles walking toward the player
      sun: [0xb4c6ea, 0.95, new THREE.Vector3(-0.38, 0.78, -0.5).normalize()],
      exposure: 1.3, night: true, followShadow: true,
    };
  }

  /** Concrete barrier blocks as ONE InstancedMesh: [x, z, w, h, d, yaw]. Colliders + bullets + line of sight. */
  _instancedBlocks(list, material) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, z, w, h, d, ry = 0], i) => {
      m.compose(new THREE.Vector3(x, h / 2, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(w, h, d));
      mesh.setMatrixAt(i, m);
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      this._addCollider(x, z, w * c + d * s, h, w * s + d * c, 0);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.surface = 'concrete';
    mesh.computeBoundingSphere();
    this.root.add(mesh);
    this.raycastMeshes.push(mesh);
    this.losMeshes.push(mesh);
    return mesh;
  }

  /** Per-frame level animation (lights, strobes, smoke). */
  update(dt) { if (this.bridge) this.bridge.update(dt); }

  /** Bridge: pooled lamps / strobes follow this point (the player, or the menu camera target). */
  setFocus(x, z, ahead = 1) { if (this.bridge) this.bridge.setFocus(x, z, ahead); }

  _addCollider(x, z, w, h, d, y = 0) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, bottom: y, top: y + h });
  }

  _box(x, z, w, h, d, material, { y = 0, collide = true, los = true, cast = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    if (collide) {
      this._addCollider(x, z, w, h, d, y);
      this.raycastMeshes.push(mesh);
      if (los) this.losMeshes.push(mesh);
    }
    return mesh;
  }

  _sandbags(rows, height, tex, R) {
    const bagL = 0.9, bagH = 0.24;
    const layers = Math.round(height / bagH);
    const transforms = [];
    for (const [x, z, w, d] of rows) {
      const alongX = w > d;
      const len = alongX ? w : d;
      const thick = alongX ? d : w;
      for (let layer = 0; layer < layers; layer++) {
        const offset = (layer % 2) * bagL * 0.5;
        const n = Math.floor((len - offset) / bagL);
        for (let i = 0; i < n; i++) {
          const a = -len / 2 + offset + bagL * (i + 0.5);
          const m = new THREE.Matrix4();
          const pos = new THREE.Vector3(alongX ? x + a : x, bagH * (layer + 0.5), alongX ? z : z + a);
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.05, (alongX ? 0 : Math.PI / 2) + (R() - 0.5) * 0.12, (R() - 0.5) * 0.05));
          const s = new THREE.Vector3(bagL * (0.96 + R() * 0.06), bagH * (0.92 + R() * 0.1), thick * (0.92 + R() * 0.06));
          m.compose(pos, q, s);
          transforms.push(m);
        }
      }
      this._addCollider(x, z, w, height, d, 0);
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: texFor(tex, 1, 1), roughness: 1 });
    const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
    transforms.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.root.add(inst);
    this.raycastMeshes.push(inst);
    this.losMeshes.push(inst);
  }

  _backdrop(R) {
    const colors = [0x6e6a62, 0x77705f, 0x5f5c57, 0x847b69, 0x6a675c];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + (R() - 0.5) * 0.2;
      const r = 85 + R() * 60;
      const w = 14 + R() * 18, d = 14 + R() * 18, h = 10 + R() * 28;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 1 }));
      m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      m.rotation.y = R() * Math.PI;
      this.root.add(m);
    }
    // floodlight poles outside the corners
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.5 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xfff0c0, emissiveIntensity: 1.5 });
    for (const [x, z] of [[54, 54], [-54, 54], [54, -54], [-54, -54]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 8), poleMat);
      pole.position.set(x, 7, z); pole.castShadow = true;
      this.root.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.5), lampMat);
      head.position.set(x * 0.97, 14, z * 0.97);
      head.lookAt(0, 0, 0);
      this.root.add(head);
    }
  }

  /** Push a circle (XZ) out of every collider. Returns the supporting ground height. */
  resolveCircle(pos, radius, feetY) {
    const cs = this.colliders;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (feetY >= c.top - 0.3) continue;        // above it — may stand on it
        if (feetY + 1.8 < c.bottom) continue;
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          pos.x += dx * push; pos.z += dz * push;
        } else {
          const pl = pos.x - c.minX, pr = c.maxX - pos.x, pb = pos.z - c.minZ, pf = c.maxZ - pos.z;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) pos.x = c.minX - radius;
          else if (m === pr) pos.x = c.maxX + radius;
          else if (m === pb) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
      }
    }
    let ground = this.mode === 'city' ? -Infinity : 0;
    const r2 = (radius * 0.75) * (radius * 0.75);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (feetY < c.top - 0.3) continue;
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      if (dx * dx + dz * dz < r2 && c.top > ground) ground = c.top;
    }
    if (this.house) {
      this.house.pushOut(pos, radius, feetY);
      const hg = this.house.groundAt(pos.x, pos.z, feetY, radius);
      if (hg > ground) ground = hg;
    }
    // hard bounds safety net
    const B = this.bounds;
    pos.x = Math.max(B.minX + radius, Math.min(B.maxX - radius, pos.x));
    pos.z = Math.max(B.minZ + radius, Math.min(B.maxZ - radius, pos.z));
    if (this.mode === 'city') {
      // never walk off the edge of the map into the void
      let safe = this._safe.get(pos);
      if (ground === -Infinity && this.house) ground = this.house.groundAt(pos.x, pos.z, feetY, radius);
      if (ground === -Infinity) {
        if (safe) { pos.x = safe.x; pos.z = safe.z; ground = safe.y; }
        else ground = 0;
      } else {
        if (!safe) { safe = { x: 0, z: 0, y: 0 }; this._safe.set(pos, safe); }
        safe.x = pos.x; safe.z = pos.z; safe.y = ground;
      }
    }
    return ground;
  }

  /** Is a ground-level circle at (x,z) overlapping any obstacle? */
  isBlocked(x, z, radius, feetY = 0) {
    const B = this.bounds;
    if (x < B.minX + radius || x > B.maxX - radius || z < B.minZ + radius || z > B.maxZ - radius) return true;
    if (this.mode === 'city' && this.house && this.house.floorAt(x, z, feetY + 0.7) < feetY - 3.5) return true;   // void / big drop
    if (this.house && this.house.blocked(x, z, Math.min(radius, 0.45), feetY)) return true;
    if (feetY > 1.3) return false;
    return this._boxBlocked(x, z, radius);
  }

  _boxBlocked(x, z, radius) {
    const r2 = radius * radius;
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }
}
