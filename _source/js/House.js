// =========================================================
// House — "Tower House Design" by 3DHaupt (Sketchfab, CC BY-NC 4.0)
// placed in the centre of the arena.
//  * triangle-mesh collision (walls push, floors/stairs carry you)
//  * uniform XZ grid for fast triangle lookup
//  * automatic multi-level nav grid + A* so enemies can climb the stairs
// =========================================================
import * as THREE from 'three';

export const HOUSE_CONFIG = {
  url: 'assets/models/house.glb',
  scale: 60,          // model units -> metres (floor-to-floor 0.1 -> 6 m) — x2 size
  yaw: 0,
  center: [0, 0],     // where the building's footprint centre goes (x, z)
};

const CELL = 1.0;            // collision grid cell (m)
const STEP = 0.65;           // max step-up height (house x2: stair risers ~0.53 m)
const LIP = 0.6;             // wall parts lower than this above your feet are steppable
const FLOOR_NY = 0.6;        // |normal.y| above this = floor / ceiling
const NAV = 0.3;             // nav grid spacing (m)
const NAV_MARGIN = 5;        // nav grid extends this far beyond the building

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Vector3();

// closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5)
function closestPtTri(p, a, b, c, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return out.copy(a);
  const bpx = p.x - b.x, bpy = p.y - b.y, bpz = p.z - b.z;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return out.copy(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return out.set(a.x + abx * v, a.y + aby * v, a.z + abz * v); }
  const cpx = p.x - c.x, cpy = p.y - c.y, cpz = p.z - c.z;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return out.copy(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return out.set(a.x + acx * w, a.y + acy * w, a.z + acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return out.set(b.x + (c.x - b.x) * w, b.y + (c.y - b.y) * w, b.z + (c.z - b.z) * w);
  }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return out.set(a.x + abx * v + acx * w, a.y + aby * v + acy * w, a.z + abz * v + acz * w);
}

export class House {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.navStep = opts.navStep || NAV;           // nav grid spacing (m)
    this.virtualGround = opts.virtualGround !== false;   // the yard at y=0 counts as floor everywhere
    this.navMargin = opts.navMargin !== undefined ? opts.navMargin : NAV_MARGIN;
    this.root = null;
    this.meshes = [];      // solid meshes (bullets + LOS)
    this.ready = false;
    this.bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: 0 };
  }

  /** Add the loaded glTF to the scene and build collision + nav data. */
  build(gltf, cfg = HOUSE_CONFIG) {
    const root = gltf.scene;
    root.scale.setScalar(cfg.scale);
    root.rotation.y = cfg.yaw || 0;
    root.updateMatrixWorld(true);
    if (cfg.center) {
      // centre the building footprint (ignoring tiny parts) on cfg.center, floor on y=0
      const box = new THREE.Box3();
      root.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'building_02') box.expandByObject(o); });
      if (box.isEmpty()) box.setFromObject(root);
      const full = new THREE.Box3().setFromObject(root);
      root.position.set(cfg.center[0] - (box.min.x + box.max.x) / 2, -full.min.y, cfg.center[1] - (box.min.z + box.max.z) / 2);
    } else if (cfg.offset) root.position.set(...cfg.offset);
    root.updateMatrixWorld(true);
    this.scene.add(root);
    this.root = root;

    const tris = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const glass = mats.some((m) => m && (m.name === 'Gals' || (m.userData && m.userData.glass)));
      if (cfg.skip && cfg.skip.test(o.name + ' ' + mats.map((m) => m && m.name).join(' '))) { o.visible = false; return; }
      for (const m of mats) {
        if (!m) continue;
        m.side = THREE.DoubleSide;
        if (glass) { m.transparent = true; m.opacity = 0.28; m.depthWrite = false; m.roughness = 0.05; m.metalness = 0.6; }
      }
      o.castShadow = !glass; o.receiveShadow = true;
      if (glass) return;                 // glass: see-through, no collision / bullets pass (shattered)
      this.meshes.push(o);
      const g = o.geometry, pos = g.attributes.position, idx = g.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        _a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
        _b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
        _c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
        tris.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
      }
    });
    this._buildTriangles(tris);
    this.ready = true;
    // nav grid is built by Arena.attachHouse() once the yard obstacles are known
  }

  // ---------------- triangle store + grid ----------------
  _buildTriangles(list) {
    const nT = list.length / 9;
    const T = new Float32Array(list);
    const N = new Float32Array(nT * 3);
    const keep = new Uint8Array(nT);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = 0;
    for (let t = 0; t < nT; t++) {
      const o = t * 9;
      _a.set(T[o], T[o + 1], T[o + 2]); _b.set(T[o + 3], T[o + 4], T[o + 5]); _c.set(T[o + 6], T[o + 7], T[o + 8]);
      _p.subVectors(_b, _a); _q.subVectors(_c, _a); _p.cross(_q);
      const area = _p.length();
      if (area < 1e-6) continue;          // degenerate
      _p.divideScalar(area);
      N[t * 3] = _p.x; N[t * 3 + 1] = _p.y; N[t * 3 + 2] = _p.z;
      keep[t] = 1;
      for (let k = 0; k < 9; k += 3) {
        minX = Math.min(minX, T[o + k]); maxX = Math.max(maxX, T[o + k]);
        minZ = Math.min(minZ, T[o + k + 2]); maxZ = Math.max(maxZ, T[o + k + 2]);
        maxY = Math.max(maxY, T[o + k + 1]);
      }
    }
    this.T = T; this.N = N;
    this.bounds = { minX, maxX, minZ, maxZ, maxY };
    this.gx0 = Math.floor(minX / CELL) - 1; this.gz0 = Math.floor(minZ / CELL) - 1;
    this.gw = Math.ceil(maxX / CELL) - this.gx0 + 2; this.gh = Math.ceil(maxZ / CELL) - this.gz0 + 2;
    const cells = Array.from({ length: this.gw * this.gh }, () => []);
    for (let t = 0; t < nT; t++) {
      if (!keep[t]) continue;
      const o = t * 9;
      const x0 = Math.min(T[o], T[o + 3], T[o + 6]), x1 = Math.max(T[o], T[o + 3], T[o + 6]);
      const z0 = Math.min(T[o + 2], T[o + 5], T[o + 8]), z1 = Math.max(T[o + 2], T[o + 5], T[o + 8]);
      const cx0 = Math.floor(x0 / CELL) - this.gx0, cx1 = Math.floor(x1 / CELL) - this.gx0;
      const cz0 = Math.floor(z0 / CELL) - this.gz0, cz1 = Math.floor(z1 / CELL) - this.gz0;
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) cells[cz * this.gw + cx].push(t);
    }
    this.cells = cells.map((c) => Int32Array.from(c));
    this._stamp = new Uint32Array(nT); this._stampId = 1;
  }

  _cell(x, z) {
    const cx = Math.floor(x / CELL) - this.gx0, cz = Math.floor(z / CELL) - this.gz0;
    if (cx < 0 || cz < 0 || cx >= this.gw || cz >= this.gh) return null;
    return this.cells[cz * this.gw + cx];
  }

  inside(x, z, pad = 0) {
    const b = this.bounds;
    return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
  }

  /** Highest floor surface at (x,z) not higher than maxY. -Infinity if none. */
  floorAt(x, z, maxY) {
    let best = -Infinity;
    if (!this.ready || !this.inside(x, z)) return best;
    const cell = this._cell(x, z);
    if (!cell) return best;
    const T = this.T, N = this.N;
    for (let i = 0; i < cell.length; i++) {
      const t = cell[i];
      const ny = N[t * 3 + 1];
      if (Math.abs(ny) < FLOOR_NY) continue;
      const o = t * 9;
      const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
      // barycentric in XZ
      const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
      const den = v0x * v1z - v1x * v0z;
      if (Math.abs(den) < 1e-9) continue;
      const u = (v2x * v1z - v1x * v2z) / den, v = (v0x * v2z - v2x * v0z) / den;
      if (u < -1e-4 || v < -1e-4 || u + v > 1.0001) continue;
      const y = T[o + 1] + u * (T[o + 7] - T[o + 1]) + v * (T[o + 4] - T[o + 1]);
      if (y <= maxY && y > best) best = y;
    }
    return best;
  }

  /** Lowest ceiling (downward-facing surface) above y at (x,z). */
  ceilingAt(x, z, y) {
    let best = Infinity;
    if (!this.ready || !this.inside(x, z)) return best;
    const cell = this._cell(x, z);
    if (!cell) return best;
    const T = this.T, N = this.N;
    for (let i = 0; i < cell.length; i++) {
      const t = cell[i];
      if (Math.abs(N[t * 3 + 1]) < FLOOR_NY) continue;
      const o = t * 9;
      const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
      const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
      const den = v0x * v1z - v1x * v0z;
      if (Math.abs(den) < 1e-9) continue;
      const u = (v2x * v1z - v1x * v2z) / den, v = (v0x * v2z - v2x * v0z) / den;
      if (u < -1e-4 || v < -1e-4 || u + v > 1.0001) continue;
      const yy = T[o + 1] + u * (T[o + 7] - T[o + 1]) + v * (T[o + 4] - T[o + 1]);
      if (yy > y && yy < best) best = yy;
    }
    return best;
  }

  /** Ground under a circle: max floor of a few samples (so stair cracks don't drop you). */
  groundAt(x, z, feetY, radius = 0.35) {
    const maxY = feetY + STEP;
    let g = this.floorAt(x, z, maxY);
    const r = radius * 0.6;
    g = Math.max(g, this.floorAt(x + r, z, maxY), this.floorAt(x - r, z, maxY), this.floorAt(x, z + r, maxY), this.floorAt(x, z - r, maxY));
    return g;
  }

  /**
   * Push a vertical capsule (feet at feetY, given height) out of walls, horizontally.
   * Returns true if anything was touched.
   */
  pushOut(pos, radius, feetY, height = 1.75) {
    if (!this.ready || !this.inside(pos.x, pos.z, radius + 0.1)) return false;
    let touched = false;
    const T = this.T, N = this.N;
    const levels = [0.75, 1.1, Math.max(1.11, height - radius * 0.6)];
    for (let iter = 0; iter < 2; iter++) {
      const id = ++this._stampId;
      for (let gz = Math.floor((pos.z - radius) / CELL); gz <= Math.floor((pos.z + radius) / CELL); gz++) {
        for (let gx = Math.floor((pos.x - radius) / CELL); gx <= Math.floor((pos.x + radius) / CELL); gx++) {
          const cx = gx - this.gx0, cz = gz - this.gz0;
          if (cx < 0 || cz < 0 || cx >= this.gw || cz >= this.gh) continue;
          const cell = this.cells[cz * this.gw + cx];
          for (let i = 0; i < cell.length; i++) {
            const t = cell[i];
            if (this._stamp[t] === id) continue;
            this._stamp[t] = id;
            if (Math.abs(N[t * 3 + 1]) >= FLOOR_NY) continue;
            const o = t * 9;
            // quick vertical reject
            const ty0 = Math.min(T[o + 1], T[o + 4], T[o + 7]), ty1 = Math.max(T[o + 1], T[o + 4], T[o + 7]);
            if (ty1 < feetY + LIP || ty0 > feetY + height) continue;
            _a.set(T[o], T[o + 1], T[o + 2]); _b.set(T[o + 3], T[o + 4], T[o + 5]); _c.set(T[o + 6], T[o + 7], T[o + 8]);
            for (const lv of levels) {
              _p.set(pos.x, feetY + lv, pos.z);
              closestPtTri(_p, _a, _b, _c, _q);
              if (_q.y < feetY + LIP) continue;            // steppable lip
              const dx = _p.x - _q.x, dy = _p.y - _q.y, dz = _p.z - _q.z;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= radius * radius) continue;
              let hx = dx, hz = dz, hl = Math.hypot(hx, hz);
              if (hl < 1e-5) { hx = N[t * 3]; hz = N[t * 3 + 2]; hl = Math.hypot(hx, hz); if (hl < 1e-5) continue; }
              const push = radius - Math.sqrt(d2);
              pos.x += (hx / hl) * push; pos.z += (hz / hl) * push;
              touched = true;
            }
          }
        }
      }
    }
    return touched;
  }

  /** Would a capsule standing at (x, feetY, z) touch a wall? */
  blocked(x, z, radius, feetY = 0) {
    if (!this.ready || !this.inside(x, z, radius + 0.1)) return false;
    const t = this._bt || (this._bt = { x: 0, z: 0 });
    t.x = x; t.z = z;
    return this.pushOut(t, radius, feetY);
  }

  // ---------------- nav grid ----------------
  _buildNav() {
    const b = this.bounds, NAV = this.navStep, M = this.navMargin;
    const x0 = Math.floor((b.minX - M) / NAV) * NAV, z0 = Math.floor((b.minZ - M) / NAV) * NAV;
    const nx = Math.ceil((b.maxX + M - x0) / NAV) + 1, nz = Math.ceil((b.maxZ + M - z0) / NAV) + 1;
    this.nav = { x0, z0, nx, nz, cols: new Array(nx * nz) };
    const nodes = [];
    const R = 0.28;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + ix * NAV, z = z0 + iz * NAV;
        // candidate floor heights in this column (+ the yard at y=0)
        const hs = [];
        let top = Infinity;
        for (;;) {
          const y = this.floorAt(x, z, top - 0.05);
          if (y === -Infinity) break;
          hs.push(y); top = y;
          if (hs.length > 24) break;
        }
        if (this.virtualGround && !hs.some((h) => Math.abs(h) < 0.25)) hs.push(0);
        const col = [];
        for (const h of hs) {
          if (this.virtualGround && h < -0.3) continue;
          // head clearance
          const ceil = this.ceilingAt(x, z, h + 0.1);
          if (ceil - h < 1.8) continue;
          // walls
          if (this.blocked(x, z, R, h)) continue;
          if (this._arenaBlocked && h < 1.3 && this._arenaBlocked(x, z, R)) continue;
          const id = nodes.length;
          nodes.push({ id, x, z, y: h, ix, iz, nb: [] });
          col.push(id);
        }
        this.nav.cols[iz * nx + ix] = col;
      }
    }
    // links
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const n of nodes) {
      for (const [dx, dz] of dirs) {
        const jx = n.ix + dx, jz = n.iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        for (const mid of this.nav.cols[jz * nx + jx]) {
          const m = nodes[mid];
          if (Math.abs(m.y - n.y) > 0.65) continue;
          // midpoint must be supported and free
          const mx = (n.x + m.x) / 2, mz = (n.z + m.z) / 2, my = Math.max(n.y, m.y);
          let g = this.groundAt(mx, mz, my, 0.2);
          if (g === -Infinity && this.virtualGround && Math.min(n.y, m.y) < 0.25) g = 0;
          if (g < Math.min(n.y, m.y) - 0.3) continue;
          if (this.blocked(mx, mz, R, Math.min(n.y, m.y))) continue;
          const cost = Math.hypot(m.x - n.x, m.z - n.z, m.y - n.y);
          n.nb.push(mid, cost); m.nb.push(n.id, cost);
        }
      }
    }
    // keep only the largest connected component (drops unreachable islands, e.g. sealed rooms)
    const comp = new Int32Array(nodes.length).fill(-1);
    let bestC = -1, bestSize = 0;
    for (const s of nodes) {
      if (comp[s.id] !== -1) continue;
      const c = s.id; let size = 0;
      const st = [s.id]; comp[s.id] = c;
      while (st.length) { const k = st.pop(); size++; const nb = nodes[k].nb; for (let i = 0; i < nb.length; i += 2) if (comp[nb[i]] === -1) { comp[nb[i]] = c; st.push(nb[i]); } }
      if (size > bestSize) { bestSize = size; bestC = c; }
    }
    for (const n of nodes) n.ok = comp[n.id] === bestC;
    this.navNodes = nodes;
    this.navStats = { nodes: nodes.length, reachable: bestSize, maxY: Math.max(0, ...nodes.filter((n) => n.ok).map((n) => n.y)) };
  }

  setArenaBlocker(fn) { this._arenaBlocked = fn; this._buildNav(); }

  inNav(x, z) {
    const N = this.nav, NAV = this.navStep; if (!N) return false;
    return x >= N.x0 && z >= N.z0 && x <= N.x0 + (N.nx - 1) * NAV && z <= N.z0 + (N.nz - 1) * NAV;
  }

  /** Nearest reachable nav node to a point (prefers the same floor). */
  nearestNode(x, y, z) {
    const N = this.nav, NAV = this.navStep; if (!N) return null;
    const cix = Math.round((x - N.x0) / NAV), ciz = Math.round((z - N.z0) / NAV);
    let best = null, bestD = Infinity;
    for (let r = 0; r <= Math.ceil(2 / NAV) && !best; r++) {
      for (let iz = ciz - r; iz <= ciz + r; iz++) for (let ix = cix - r; ix <= cix + r; ix++) {
        if (ix < 0 || iz < 0 || ix >= N.nx || iz >= N.nz) continue;
        if (Math.max(Math.abs(ix - cix), Math.abs(iz - ciz)) !== r) continue;
        for (const id of N.cols[iz * N.nx + ix]) {
          const n = this.navNodes[id]; if (!n.ok) continue;
          const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 4;
          if (d < bestD) { bestD = d; best = n; }
        }
      }
    }
    return best;
  }

  /** A* between two world points. Returns array of {x,y,z} or null. */
  findPath(from, to) {
    const s = this.nearestNode(from.x, from.y, from.z), e = this.nearestNode(to.x, to.y, to.z);
    if (!s || !e) return null;
    if (s === e) return [{ x: e.x, y: e.y, z: e.z }];
    const nodes = this.navNodes, n = nodes.length;
    if (!this._g || this._g.length !== n) { this._g = new Float32Array(n); this._from = new Int32Array(n); this._seen = new Uint32Array(n); this._closed = new Uint32Array(n); this._run = 0; }
    const g = this._g, from_ = this._from, seen = this._seen, closed = this._closed;
    const run = ++this._run;
    const h = (k) => Math.hypot(nodes[k].x - e.x, nodes[k].z - e.z) + Math.abs(nodes[k].y - e.y);
    // binary heap
    const heap = [], f = [];
    const push = (k, fk) => { heap.push(k); f.push(fk); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[p] <= f[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [f[p], f[i]] = [f[i], f[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const lk = heap.pop(), lf = f.pop(); if (heap.length) { heap[0] = lk; f[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && f[l] < f[m]) m = l; if (r < heap.length && f[r] < f[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [f[m], f[i]] = [f[i], f[m]]; i = m; } } return top; };
    g[s.id] = 0; seen[s.id] = run; from_[s.id] = -1; push(s.id, h(s.id));
    let found = false, iter = 0;
    while (heap.length && iter++ < 80000) {
      const k = pop();
      if (closed[k] === run) continue;
      closed[k] = run;
      if (k === e.id) { found = true; break; }
      const nb = nodes[k].nb;
      for (let i = 0; i < nb.length; i += 2) {
        const m = nb[i]; if (closed[m] === run || !nodes[m].ok) continue;
        const ng = g[k] + nb[i + 1];
        if (seen[m] !== run || ng < g[m]) { seen[m] = run; g[m] = ng; from_[m] = k; push(m, ng + h(m)); }
      }
    }
    if (!found) return null;
    const out = [];
    for (let k = e.id; k !== -1; k = from_[k]) out.push(nodes[k]);
    out.reverse();
    // string-pull: drop intermediate nodes on the same level when the straight line is clear
    const path = [out[0]];
    let i = 0;
    while (i < out.length - 1) {
      let j = out.length - 1;
      for (; j > i + 1; j--) if (this._clearLine(out[i], out[j])) break;
      path.push(out[j]); i = j;
    }
    return path.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }

  _clearLine(a, b) {
    if (Math.abs(a.y - b.y) > 0.1) return false;
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / 0.35);
    if (Math.abs(a.y - b.y) > 0.1) return false;
    for (let s = 1; s < steps; s++) {
      const t = s / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      let g = this.floorAt(x, z, a.y + 0.3);
      if (g === -Infinity && this.virtualGround && a.y < 0.25) g = 0;
      if (Math.abs(g - a.y) > 0.1) return false;
      if (this.blocked(x, z, 0.28, a.y)) return false;
    }
    return true;
  }
}
