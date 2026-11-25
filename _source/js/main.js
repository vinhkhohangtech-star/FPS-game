// =========================================================
// main.js — entry point: renderer, scenes, asset loading, input,
// game state machine (menu / playing / paused / shop / gameover) and loop
// =========================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Arena } from './Arena.js';
import { makeNightEnvScene } from './Bridge.js';
import { House, HOUSE_CONFIG } from './House.js';
import { Effects } from './Effects.js';
import { Player } from './Player.js';
import { WeaponManager, WEAPON_DEFS, SHOP_WEAPONS, RED_DOT_PRICE, canTakeRedDot } from './Weapon.js';
import { setBotTemplate, BOT_MODELS } from './Enemy.js';
import { WaveManager } from './WaveManager.js';
import { AudioManager } from './AudioManager.js';
import { UIManager } from './UIManager.js';

window.__gameBooted = true;
/** play-offline.html embeds models & sounds as data: URLs (file:// pages cannot fetch files). */
const embedded = (url) => (window.__EMBED && window.__EMBED[url]) || url;
/**
 * Big optional assets (Armory guns, extra maps) live in side files for the offline build:
 * window.__SIDECAR maps an asset url -> a .js file that adds it to window.__EMBED when loaded
 * (a <script src> works from file:// where fetch() does not). In server mode the url is used directly.
 */
const _sidecarLoads = {};
window.__assetURL = async (url) => {
  if (window.__EMBED && window.__EMBED[url]) return window.__EMBED[url];
  const js = window.__SIDECAR && window.__SIDECAR[url];
  if (js) {
    if (!_sidecarLoads[js]) {
      _sidecarLoads[js] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = js; s.onload = res; s.onerror = () => rej(new Error('missing ' + js));
        document.head.appendChild(s);
      });
    }
    await _sidecarLoads[js];
    if (window.__EMBED && window.__EMBED[url]) return window.__EMBED[url];
  }
  return url;
};

/** Selectable maps. 'yard' is built in; others are a single .glb used as the whole level. */
const LEVELS = {
  yard: { name: 'TRAINING YARD', desc: 'Walled 100 m yard with the tower house in the middle' },
  city: {
    name: 'GHOST CITY', desc: 'Abandoned city streets, courtyards and rooftops',
    url: 'assets/models/maps/web/ghost_city.glb', navStep: 0.5,
    start: [26, 6], startYaw: Math.PI / 2, crate: [23.5, 9.5],
  },
  bridge: {
    name: 'HIGHWAY BRIDGE (ENDLESS)', desc: 'Night siege on a 220 m highway bridge — escalating non-stop horde, hold Sector A',
    builtin: 'bridge',
  },
};
/** Graphics presets: render scale, shadow map, dynamic lights, particle budget. */
const GFX = {
  low: { pixelRatio: 1, shadow: 1024, shadowType: THREE.PCFShadowMap },
  medium: { pixelRatio: 1.5, shadow: 2048, shadowType: THREE.PCFSoftShadowMap },
  ultra: { pixelRatio: 2, shadow: 4096, shadowType: THREE.PCFSoftShadowMap },
};
const STREAK_WINDOW = 4.5;       // seconds between kills to keep a killstreak alive
const MULTI_WINDOW = 1.4;        // kills this close together = multi-kill
const MILESTONES = [10, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500];   // 25 / 60 have their own threat banners

const PARAMS = new URLSearchParams(location.search);
const FORCE_FALLBACK = PARAMS.has('fallback');   // ?fallback  -> ignore .glb files
const START_CASH = 250;
const PRICES = { ammo: 250, armor: 500, grenades: 300, reddot: RED_DOT_PRICE };
const START_GRENADES = 2, MAX_GRENADES = 4;
/** Armory hotkeys: supplies 1-4, weapons 5..9, 0, -, = */
const SHOP_WEAPON_KEYS = ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
const SHOP_WEAPON_LABELS = ['5', '6', '7', '8', '9', '0', '-', '='];

// Each sound lists candidate file names; the first one found in assets/audio/ is used.
const A = (...names) => names.map((n) => `assets/audio/${n}`);
const AUDIO_FILES = [
  ['single', A('1 bullet.wav', '1 bullet_1.MP3', '1 bullet.MP3')],
  ['auto', A('auto bullet.MP3', 'auto bullet_1.MP3', 'auto bullet.mp3')],
  ['reload', A('gun reload.mp3', 'reload weapon.MP3')],
  ['hit', A('hitmarker.mp3', 'hitmarker.wav')],
  ['explosion', ['assets/effects/explosion/freesound_community-hq-explosion-6288.mp3']],
];

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('specops-settings') || '{}');
    return { sens: typeof s.sens === 'number' ? s.sens : 1, vol: typeof s.vol === 'number' ? s.vol : 0.8, map: LEVELS[s.map] ? s.map : 'yard',
      gfx: GFX[s.gfx] ? s.gfx : 'medium', best: typeof s.best === 'number' ? s.best : 0, bestKills: typeof s.bestKills === 'number' ? s.bestKills : 0 };
  } catch (e) { return { sens: 1, vol: 0.8, map: 'yard', gfx: 'medium', best: 0, bestKills: 0 }; }
}
function saveSettings(s) {
  try { localStorage.setItem('specops-settings', JSON.stringify(s)); } catch (e) { /* storage blocked */ }
}

class Game {
  constructor() {
    this.ui = new UIManager();
    this.audio = new AudioManager();
    this.state = 'loading';
    this.time = 0;
    this.cash = START_CASH;
    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.settings = loadSettings();
    this.input = { fireHeld: false, firePressed: false, adsHeld: false, mouseDX: 0, mouseDY: 0 };
    this._targets = [];
    this.losRay = new THREE.Raycaster();
    this.worldRay = new THREE.Raycaster();
    this._setupRenderer();
    this._setupScenes();
  }

  _setupRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = false;
    document.getElementById('game-container').appendChild(r.domElement);
    this.renderer = r;
  }

  _setupScenes() {
    // world
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9b4bc);
    scene.fog = new THREE.Fog(0xa9b4bc, 45, 200);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 600);
    this.camera.rotation.order = 'YXZ';

    this.hemi = new THREE.HemisphereLight(0xdfe8f0, 0x5a5040, 1.15);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(35, 70, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;
    // tactical weapon light (night maps): a subtle forward cone from the gun, follows the camera; [L] toggles
    this.flashlight = new THREE.SpotLight(0xe4ecff, 0, 48, 0.36, 0.55, 1.5);
    this.flashlight.castShadow = false;
    this.flashlight.visible = false;
    this.flashlightOn = true;
    scene.add(this.flashlight, this.flashlight.target);

    // viewmodel (separate scene, drawn after a depth clear -> never clips into walls)
    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 10);
    this.vmHemi = new THREE.HemisphereLight(0xe8eef5, 0x40382c, 0.9);
    this.weaponScene.add(this.vmHemi);
    const vmSun = new THREE.DirectionalLight(0xfff1dc, 1.7);
    vmSun.position.set(-0.6, 1, 0.5);
    this.weaponScene.add(vmSun);
    this.vmSun = vmSun;
    // night lighting for the viewmodel: police strobes + street lamps are mirrored onto the gun
    this.vmStrobe = new THREE.PointLight(0xff2020, 0, 4, 2);
    this.vmLamp = new THREE.PointLight(0xffb562, 0, 4, 2);
    this.vmLamp.position.set(0.25, 0.9, -0.2);
    this.weaponScene.add(this.vmStrobe, this.vmLamp);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.dayEnv = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    this.nightEnv = pmrem.fromScene(makeNightEnvScene(), 0.02).texture;
    this.weaponScene.environment = this.dayEnv;
    pmrem.dispose();
    this.dayLook = {
      bg: scene.background.clone(), fog: scene.fog, hemi: [this.hemi.color.clone(), this.hemi.groundColor.clone(), this.hemi.intensity],
      sun: [this.sun.color.clone(), this.sun.intensity], exposure: this.renderer.toneMappingExposure,
    };
  }

  async init() {
    this.ui.showScreen('loading');
    this.ui.setSettings(this.settings.sens, this.settings.vol);
    this.audio.setVolume(this.settings.vol);

    const total = 4 + AUDIO_FILES.length;
    let done = 0;
    const tick = (label) => { done++; this.ui.setLoading(done / total, `Loading ${label}...`); };

    const loader = new GLTFLoader();
    this.loader = loader;
    const [akGLTF, botGLTF, textures, audioReport, houseGLTF] = await Promise.all([
      Promise.resolve(null).then((r) => { tick('weapon'); return r; }),   // AK-47 now comes from GUN_GLB (textured rig)
      (FORCE_FALLBACK ? Promise.resolve(null) : this._loadBot(loader)).then((r) => { tick('enemies'); return r; }),
      this._loadTextures().then((r) => { tick('textures'); return r; }),
      this.audio.loadAll(AUDIO_FILES, (n) => tick(`audio: ${n}`)),
      (PARAMS.has('nohouse') ? Promise.resolve(null) : loader.loadAsync(embedded(HOUSE_CONFIG.url)).catch(() => null)).then((r) => { tick('house'); return r; }),
    ]);

    this.ui.setLoading(1, 'Building arena...');
    this.arena = new Arena(this.scene);
    this.arena.build(textures);
    this.house = null;
    if (houseGLTF) {
      this.ui.setLoading(1, 'Building house...');
      try {
        this.house = new House(this.scene);
        this.house.build(houseGLTF);
        this.arena.attachHouse(this.house);
      } catch (e) { console.warn('[House] failed:', e); this.house = null; }
    }
    this.levels = { yard: { arena: this.arena, house: this.house } };
    this.levelId = 'yard';
    this.effects = new Effects(this.scene);
    this.applyGraphics(this.settings.gfx);
    if (botGLTF) setBotTemplate(botGLTF.gltf, botGLTF.cfg);
    this.player = new Player(this);
    this.player.controls.pointerSpeed = this.settings.sens;
    this.weapons = new WeaponManager(this);
    this.weapons.init(akGLTF);
    if (!FORCE_FALLBACK) {
      this.ui.setLoading(1, 'Loading AK-47...');
      await this.weapons.ensure('ak47', true);
    }
    this.grenades = START_GRENADES;
    this.timeScale = 1; this.slowT = 0;
    this.waveManager = new WaveManager(this);

    this.ui.setAssetReport([
      ['AK-47 viewmodel', !!(this.weapons.weapons.ak47 && this.weapons.weapons.ak47.model.fromGunGLB), 'textured .glb', 'procedural fallback'],
      ['Enemy model', !!botGLTF, botGLTF ? botGLTF.cfg.url.split('/').pop() : '', 'procedural soldier (add assets/models/terrorist.glb)'],
      ['Gun sounds', audioReport.single && audioReport.auto, 'your audio files', 'synthesized fallback'],
      ['Reload / hitmarker', audioReport.reload && audioReport.hit, 'your audio files', 'synthesized fallback'],
      ['Centre house', !!houseGLTF, 'Tower House (3DHaupt)', 'open yard (add assets/models/house.glb)'],
      ['Textures', Object.keys(textures).length > 0, 'custom textures', 'procedural concrete'],
    ]);

    this._bindInput();
    this._bindUI();
    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    if (this.settings.map !== 'yard') {
      try { await this.setLevel(this.settings.map); } catch (e) { console.warn('[Map] failed:', e); this.settings.map = 'yard'; }
    }
    this.ui.setMaps(LEVELS, this.settings.map);
    this.state = 'menu';
    this.ui.showScreen('menu');
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._loop());
    // Armory weapons stream in while you are in the menu (explosions are fully procedural now: no model to load)
    setTimeout(() => this.weapons.preloadAll(), 400);
  }

  /** Day (yard / city) or night (bridge) look: sky, fog, ambient, moon, exposure, reflections. */
  _applyAtmosphere(arena) {
    const A = arena.atmosphere, D = this.dayLook, s = this.scene;
    if (A) {
      s.background = new THREE.Color(A.background);
      s.fog = new THREE.FogExp2(A.fogExp2[0], A.fogExp2[1]);
      this.hemi.color.set(A.hemi[0]); this.hemi.groundColor.set(A.hemi[1]); this.hemi.intensity = A.hemi[2];
      this.sun.color.set(A.sun[0]); this.sun.intensity = A.sun[1];
      this.renderer.toneMappingExposure = A.exposure;
      s.environment = this.nightEnv;
      this.weaponScene.environment = this.nightEnv;
      this.vmHemi.intensity = 0.32; this.vmSun.intensity = 0.45; this.vmSun.color.set(0xa8bce0);
      this.effects.nightBoost = 1.6;
      this.flashlight.visible = true;            // stays in the light count; [L] only changes intensity (no shader rebuild)
    } else {
      s.background = D.bg.clone(); s.fog = D.fog;
      this.hemi.color.copy(D.hemi[0]); this.hemi.groundColor.copy(D.hemi[1]); this.hemi.intensity = D.hemi[2];
      this.sun.color.copy(D.sun[0]); this.sun.intensity = D.sun[1];
      this.renderer.toneMappingExposure = D.exposure;
      s.environment = null;
      this.weaponScene.environment = this.dayEnv;
      this.vmHemi.intensity = 0.9; this.vmSun.intensity = 1.7; this.vmSun.color.set(0xfff1dc);
      this.vmStrobe.intensity = 0; this.vmLamp.intensity = 0;
      this.effects.nightBoost = 1;
      this.flashlight.visible = false;
    }
  }

  /** Weapon light + (bridge) shadow camera and pooled street lights follow the player. */
  _updateNightRig() {
    const A = this.arena, cam = this.camera, p = this.player;
    const fl = this.flashlight;
    if (fl.visible) {
      _tmpDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
      _tmpV.set(0.18, -0.16, 0).applyQuaternion(cam.quaternion);
      fl.position.copy(cam.position).add(_tmpV);
      fl.target.position.copy(cam.position).addScaledVector(_tmpDir, 12);
      fl.target.updateMatrixWorld();
      fl.intensity = this.flashlightOn ? 70 * (this.weapons && this.weapons.sprintT ? 1 - this.weapons.sprintT * 0.4 : 1) : 0;
    }
    if (!A.atmosphere || !A.atmosphere.followShadow) return;
    _tmpDir.set(0, 0, -1).applyQuaternion(p.look.quaternion);
    A.setFocus(p.position.x, p.position.z, _tmpDir.z >= 0 ? 1 : -1);
    // keep shadow resolution where the fight is: an ortho box around (and ahead of) the player
    const tx = p.position.x * 0.3, tz = p.position.z + _tmpDir.z * 14;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx, 0, tz).addScaledVector(A.atmosphere.sun[2], 90);
    this.sun.target.updateMatrixWorld();
  }

  /** LOW / MEDIUM / ULTRA: render scale, shadow resolution, active point lights, particle limits. */
  applyGraphics(q) {
    const G = GFX[q] || GFX.medium;
    this.settings.gfx = GFX[q] ? q : 'medium';
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.pixelRatio));
    if (r.shadowMap.type !== G.shadowType) { r.shadowMap.type = G.shadowType; r.shadowMap.needsUpdate = true; }
    if (this.sun.shadow.mapSize.x !== G.shadow) {
      this.sun.shadow.mapSize.set(G.shadow, G.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (this.effects) this.effects.setQuality(this.settings.gfx);
    for (const lv of Object.values(this.levels || {})) if (lv.arena.bridge) lv.arena.bridge.setQuality(this.settings.gfx);
    // material programs depend on the number of lights / shadow type -> rebuild them once
    this.scene.traverse((o) => { if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true; });
    if (this.ui) this.ui.setGraphics(this.settings.gfx);
    this._onResize && this.renderer.domElement.parentNode && this._onResize();
  }

  /** Load (once) and switch to a level. */
  async setLevel(id) {
    if (!LEVELS[id]) return;
    if (!this.levels[id] && LEVELS[id].builtin === 'bridge') {
      this.ui.setLoading(0.5, 'Building HIGHWAY BRIDGE...');
      await new Promise((r) => setTimeout(r, 30));
      const arena = new Arena(this.scene, 'bridge');
      arena.buildBridge();
      arena.bridge.fx = this.effects;
      arena.bridge.setQuality(this.settings.gfx);
      this.levels[id] = { arena, house: null };
      console.info(`[Map] bridge: ${arena.colliders.length} colliders, ${arena.coverSpots.length} cover spots`);
    }
    if (!this.levels[id]) {
      const L = LEVELS[id];
      this.ui.setLoading(0.3, `Loading map: ${L.name}...`);
      const gltf = await this.loader.loadAsync(await window.__assetURL(L.url));
      this.ui.setLoading(0.7, `Building ${L.name} (collision + navigation)...`);
      await new Promise((r) => setTimeout(r, 30));
      const house = new House(this.scene, { navStep: L.navStep || 0.5, virtualGround: false, navMargin: 0 });
      house.build(gltf, { scale: L.scale || 1, center: null });
      house.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const arena = new Arena(this.scene, 'city');
      arena.buildCity(house, L);
      this.levels[id] = { arena, house };
      console.info(`[Map] ${id}: nav ${house.navStats.reachable}/${house.navStats.nodes} nodes, ${arena.spawnPoints.length} spawns`);
    }
    for (const [k, lv] of Object.entries(this.levels)) lv.arena.setVisible(k === id);
    this.levelId = id;
    this.arena = this.levels[id].arena;
    this.house = this.levels[id].house;
    this._applyAtmosphere(this.arena);
    this.ui.setEndless(!!this.arena.endless);
    this.sun.target.position.copy(this.arena.center);
    this.sun.position.copy(this.arena.center).add(new THREE.Vector3(35, 70, 25));
    const sc = this.sun.shadow.camera, R = this.arena.atmosphere && this.arena.atmosphere.followShadow ? 42 : Math.max(62, this.arena.viewRadius * 1.6);
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.far = 200; sc.updateProjectionMatrix();
    if (this.arena.atmosphere && this.arena.atmosphere.followShadow) this.arena.setFocus(this.arena.playerStart.x, this.arena.playerStart.z, 1);
    if (this.player) this.player.reset();
  }

  async chooseMap(id) {
    if (this.state !== 'menu' || this._mapBusy || id === this.levelId) { this.ui.setMaps(LEVELS, this.levelId); return; }
    this._mapBusy = true;
    this.state = 'loading';
    this.ui.showScreen('loading');
    try {
      await this.setLevel(id);
      this.settings.map = id; saveSettings(this.settings);
    } catch (e) {
      console.warn('[Map] failed:', e);
      this.ui.setLoading(1, 'Could not load that map.');
    }
    this._mapBusy = false;
    this.ui.setMaps(LEVELS, this.levelId);
    this.state = 'menu';
    this.ui.showScreen('menu');
  }

  async _loadBot(loader) {
    for (const cfg of BOT_MODELS) {
      try { return { gltf: await loader.loadAsync(embedded(cfg.url)), cfg }; } catch (e) { /* try the next model */ }
    }
    console.info('[Enemy] No bot model found — using procedural soldiers.');
    return null;
  }

  async _loadTextures() {
    const tl = new THREE.TextureLoader();
    const out = {};
    await Promise.all(['ground', 'wall', 'cover'].map(async (name) => {
      for (const ext of ['jpg', 'png']) {
        try {
          const t = await tl.loadAsync(`assets/textures/${name}.${ext}`);
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = 8;
          out[name] = t;
          return;
        } catch (e) { /* not present */ }
      }
    }));
    return out;
  }

  // ---------------- input ----------------
  _requestLock() {
    this.audio.resume();
    try {
      const p = this.renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* handled by pointerlockerror */ }
  }

  _clearInput() {
    this.input.fireHeld = false; this.input.firePressed = false; this.input.adsHeld = false;
    for (const k in this.player.keys) this.player.keys[k] = false;
    this.audio.stopAuto();
    if (this.weapons) this.weapons.autoSoundActive = false;
  }

  _bindInput() {
    const pc = this.player.controls;
    pc.addEventListener('lock', () => {
      if (this.state === 'paused' || this.state === 'menu' || this.state === 'shop') {
        this.state = 'playing';
        this.ui.showScreen(null);
        this.ui.setPauseHint('');
      }
    });
    pc.addEventListener('unlock', () => {
      if (this.state === 'playing') {
        this.state = 'paused';
        this._clearInput();
        this.ui.showScreen('pause');
      }
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.state === 'menu') return;
      if (this.state !== 'gameover') {
        this.state = 'paused';
        this.ui.showScreen('pause');
        this.ui.setPauseHint('The browser blocked mouse capture for a moment — click RESUME again.');
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing' || !pc.isLocked) return;
      if (e.button === 0) { this.input.fireHeld = true; this.input.firePressed = true; }
      if (e.button === 2) this.input.adsHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.fireHeld = false;
      if (e.button === 2) this.input.adsHeld = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (pc.isLocked) {
        this.input.mouseDX += e.movementX || 0; this.input.mouseDY += e.movementY || 0;
        if (this.state === 'playing') this.player.onMouseMoveY(e.movementY || 0);
      }
    });
    document.addEventListener('wheel', (e) => {
      if (this.state === 'playing' && pc.isLocked) this.weapons.cycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'paused') this._requestLock();
    });

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => { this.player.keys[e.code] = false; });
    window.addEventListener('blur', () => this._clearInput());
  }

  _onKeyDown(e) {
    const code = e.code;
    const inGame = this.state === 'playing' || this.state === 'paused' || this.state === 'shop';
    if (inGame && (code === 'F5' || code === 'Space' || code === 'Tab' || (e.ctrlKey && code !== 'KeyW'))) e.preventDefault();

    if (this.state === 'shop') {
      if (e.repeat) return;
      if (code === 'KeyE' || code === 'Escape') this.closeShop();
      else if (code === 'Digit1') this.buy('ammo');
      else if (code === 'Digit2') this.buy('armor');
      else if (code === 'Digit3') this.buy('grenades');
      else if (code === 'Digit4') this.buy('reddot');
      else { const i = SHOP_WEAPON_KEYS.indexOf(code); if (i >= 0 && SHOP_WEAPONS[i]) this.buy('w:' + SHOP_WEAPONS[i]); }
      return;
    }
    if (this.state === 'menu' && code === 'Enter') { this.startGame(); return; }
    if (this.state !== 'playing') return;

    this.player.keys[code] = true;
    if (e.repeat) return;
    switch (code) {
      case 'KeyR': this.weapons.startReload(); break;
      case 'KeyE': if (this._nearCrate()) this.openShop(); break;
      case 'KeyT': if (this._nearCrate()) this.quickResupply(); break;
      case 'KeyB': case 'KeyV': this.weapons.toggleFireMode(); break;
      case 'Digit1': { const id = this.weapons.primaryId(); if (id) this.weapons.switchTo(id); break; }
      case 'Digit2': { const id = this.weapons.secondaryId(); if (id) this.weapons.switchTo(id); break; }
      case 'Digit4': case 'KeyG': this.throwGrenade(); break;
      case 'KeyF': this.pickUpWeapon(); break;
      case 'KeyL': if (this.arena.atmosphere) { this.flashlightOn = !this.flashlightOn; this.audio.ui('click'); this.ui.killPopup(this.flashlightOn ? 'WEAPON LIGHT ON' : 'WEAPON LIGHT OFF', 'info'); } break;
      case 'KeyQ': this.weapons.cycle(1); break;
      case 'Enter': case 'F5': case 'NumpadEnter': this.waveManager.skipIntermission(); break;
      case 'KeyC': this.player.toggleCrouch(); break;
      default: break;
    }
  }

  _bindUI() {
    this.ui.on('start', () => this.startGame());
    this.ui.on('resume', () => { if (this.state === 'paused') this._requestLock(); });
    this.ui.on('restart', () => this.restart());
    this.ui.on('closeShop', () => this.closeShop());
    this.ui.on('buy', (item) => this.buy(item));
    this.ui.on('map', (id) => this.chooseMap(id));
    this.ui.on('menu', () => this.toMenu());
    this.ui.on('sensitivity', (v) => { this.settings.sens = v; this.player.controls.pointerSpeed = v; saveSettings(this.settings); });
    this.ui.on('volume', (v) => { this.settings.vol = v; this.audio.setVolume(v); saveSettings(this.settings); });
    this.ui.on('gfx', (q) => { this.applyGraphics(q); saveSettings(this.settings); });
  }

  // ---------------- game flow ----------------
  resetGame() {
    this.cash = START_CASH;
    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.time = 0;
    this.streak = 0; this.bestStreak = 0; this.lastKillT = -99; this.multi = 0;
    this.waveManager.reset();
    this.player.reset();
    this.grenades = START_GRENADES;
    this.timeScale = 1; this.slowT = 0;
    this.weapons.reset();
    this.effects.reset();
    this.ui.resetHUD();
    this._clearInput();
  }

  startGame() {
    if (this.state !== 'menu') return;
    this.resetGame();
    this.waveManager.start();
    this.player.update(0, { ads: false, firing: false });
    this._requestLock();
  }

  /** Back to the lobby (to pick another map). */
  toMenu() {
    if (this.state === 'menu' || this.state === 'loading') return;
    this.resetGame();
    this.state = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.setMaps(LEVELS, this.levelId);
    this.ui.showScreen('menu');
  }

  restart() {
    this.resetGame();
    this.waveManager.start();
    this.player.update(0, { ads: false, firing: false });
    this.state = 'paused';
    this.ui.showScreen('pause');
    this.ui.setPauseHint('');
    this._requestLock();
  }

  _nearCrate() {
    const c = this.arena.crate.position, p = this.player.position;
    return Math.hypot(c.x - p.x, c.z - p.z) < 2.6;
  }

  /** [T] at the crate: instant ammo refill without opening the menu (fast resupply under fire). */
  quickResupply() {
    if (this.cash < PRICES.ammo) { this.audio.ui('deny'); this.ui.killPopup(`NEED ${'$' + PRICES.ammo} FOR AMMO`, 'info'); return; }
    this.cash -= PRICES.ammo;
    this.weapons.refillAll();
    this.audio.ui('buy');
    this.ui.killPopup('AMMO RESUPPLIED  -$' + PRICES.ammo, 'info');
  }

  openShop() {
    this.state = 'shop';
    this._clearInput();
    this._renderShop();
    this.ui.showScreen('shop');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeShop() {
    if (this.state !== 'shop') return;
    this.ui.showScreen(null);
    this._requestLock();   // 'lock' event resumes play; on failure the pause menu appears
  }

  _renderShop() {
    const W = this.weapons;
    const guns = SHOP_WEAPONS.map((id) => ({
      id, def: WEAPON_DEFS[id], price: WEAPON_DEFS[id].price,
      owned: W.owns(id), ready: W.isLoaded(id), loading: W.isLoading(id),
      replaces: W.slots.find((sid) => (WEAPON_DEFS[sid].slot === 'secondary') === (WEAPON_DEFS[id].slot === 'secondary')),
    }));
    const cur = W.current;
    this.ui.renderShop({ cash: this.cash, armor: this.player.armor, prices: PRICES, guns, defs: WEAPON_DEFS,
      grenades: this.grenades, maxGrenades: MAX_GRENADES, keys: SHOP_WEAPON_LABELS,
      redDot: { name: cur.def.shortName, can: canTakeRedDot(cur.id) && !!cur.model.dot, owned: !!cur.redDot } });
    // keep the list fresh while weapons are still streaming in
    clearTimeout(this._shopTimer);
    if (this.state === 'shop' && guns.some((g) => !g.ready)) this._shopTimer = setTimeout(() => this.state === 'shop' && this._renderShop(), 700);
  }

  buy(item) {
    const W = this.weapons;
    if (item.startsWith('w:')) {
      const id = item.slice(2), def = WEAPON_DEFS[id];
      if (!def || W.owns(id) || this.cash < def.price || !W.isLoaded(id)) {
        if (def && !W.isLoaded(id)) W.ensure(id).then(() => this.state === 'shop' && this._renderShop());
        this.audio.ui('deny'); this.ui.denyShopItem(item); return;
      }
      this.cash -= def.price;
      W.giveWeapon(id);
      this.audio.ui('buy');
      this._renderShop();
      return;
    }
    const price = PRICES[item];
    const cur = W.current;
    const owned = (item === 'armor' && this.player.armor >= 100) || (item === 'grenades' && this.grenades >= MAX_GRENADES) ||
      (item === 'reddot' && (!canTakeRedDot(cur.id) || !cur.model.dot || cur.redDot));
    if (price === undefined || owned || this.cash < price) {
      this.audio.ui('deny');
      this.ui.denyShopItem(item);
      return;
    }
    this.cash -= price;
    if (item === 'ammo') W.refillAll();
    else if (item === 'armor') this.player.armor = 100;
    else if (item === 'grenades') this.grenades = Math.min(MAX_GRENADES, this.grenades + 2);
    else if (item === 'reddot') W.setRedDot(cur.id, true);
    this.audio.ui('buy');
    this._renderShop();
  }

  // ---------------- grenades ----------------
  throwGrenade() {
    if (this.grenades <= 0) { this.audio.ui('deny'); this.ui.killPopup('NO GRENADES — BUY AT THE ARMORY', 'info'); return; }
    const ok = this.weapons.startThrow(() => {
      const cam = this.camera, p = this.player;
      cam.updateMatrixWorld();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const from = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.45).addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.08, 0));
      const dir = fwd.clone().add(new THREE.Vector3(0, 0.22, 0)).normalize();
      const vel = dir.multiplyScalar(18).add(new THREE.Vector3(p.velocity.x * 0.6, 0, p.velocity.z * 0.6));
      this.waveManager.throwPlayerGrenade(from, vel);
    });
    if (ok) this.grenades--;
  }

  // ---------------- weapon pickups ----------------
  pickUpWeapon() {
    const d = this.waveManager.lookedDrop();
    if (!d) return;
    const W = this.weapons, p = this.player;
    if (!W.isLoaded(d.id)) return;
    if (W.owns(d.id)) {              // same gun: just take its bullets
      const w = W.weapons[d.id], room = w.def.reserveMax - w.reserve;
      if (room <= 0 || d.mag + d.reserve <= 0) { this.audio.ui('deny'); return; }
      const take = Math.min(room, d.mag + d.reserve);
      w.reserve += take;
      this.waveManager._removeDrop(d);
      this.ui.killPopup(`+${take} ${w.def.shortName} AMMO`, 'info'); this.audio.ui('pickup');
      return;
    }
    const rival = W.slotRival(d.id);
    if (rival) {
      // the weapon in that slot goes on the ground where the new one was
      const rw = W.weapons[rival];
      const spot = d.mesh.position.clone();
      const carry = { mag: d.mag, reserve: d.reserve, redDot: d.redDot };
      this.waveManager._removeDrop(d);
      if (!W.giveWeapon(d.id, carry)) return;
      this.waveManager.spawnWeaponDrop(spot.setY(p.position.y), rival, rw.mag, rw.reserve, !!rw.redDot);
      W.setRedDot(rival, false);
    } else {
      this.waveManager._removeDrop(d);
      W.giveWeapon(d.id, { mag: d.mag, reserve: d.reserve, redDot: d.redDot });
    }
    this.audio.ui('pickup');
    this.ui.killPopup(`PICKED UP ${WEAPON_DEFS[d.id].name}`, 'info');
  }

  /** Brief slow motion (the damage grace cue). */
  slowMo(dur, scale) { this.slowT = dur; this.timeScale = scale; }

  addCash(amount, label) {
    this.cash += amount;
    this.score += amount;
    if (label) this.ui.killPopup(label, 'bonus');
  }

  registerKill(headshot, enemy) {
    const type = enemy && enemy.type;
    const bonus = type === 'jugg' ? 600 : type === 'sniper' ? 200 : type === 'bomber' ? 150 : 0;
    let pts = (headshot ? 150 : 100) + bonus;
    this.kills++;
    if (headshot) this.headshots++;
    let label = type === 'jugg' ? `+${pts} JUGGERNAUT DOWN` : type === 'sniper' ? `+${pts} SNIPER KILLED` : type === 'bomber' ? `+${pts} BOMBER DOWN`
      : headshot ? '+150 HEADSHOT' : '+100 ENEMY KILLED';
    if (this.arena.endless) {
      // killstreak: kills chained within a few seconds of each other; multi-kills inside ~1.4 s
      const t = this.time;
      this.streak = t - this.lastKillT <= STREAK_WINDOW ? this.streak + 1 : 1;
      this.multi = t - this.lastKillT <= MULTI_WINDOW ? this.multi + 1 : 1;
      this.lastKillT = t;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (this.streak >= 3) { const sb = Math.min(10, this.streak) * 10; pts += sb; label += `  x${this.streak} +${sb}`; }
      if (this.multi >= 2) {
        const name = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'MEGA KILL'][Math.min(5, this.multi)];
        this.ui.killPopup(name, 'multi'); this.audio.ui('streak');
      }
      this.ui.flashStreak(this.streak, this.multi >= 2);
      if (MILESTONES.includes(this.kills) || (this.kills > 500 && this.kills % 100 === 0)) {
        this.ui.milestone(`${this.kills} KILLS`); this.audio.ui('milestone');
        this.addCash(this.kills * 4, null);
      }
    }
    this.cash += pts;
    this.score += pts;
    this.ui.killPopup(label, headshot ? 'head' : bonus ? 'bonus' : 'kill');
  }

  onEnemyHit(enemy, res) {
    this.ui.hitmarker(res.headshot, res.killed);
    this.audio.hit(res.headshot);
  }

  onPlayerDeath() {
    this.state = 'gameover';
    this._clearInput();
    if (document.pointerLockElement) document.exitPointerLock();
    const w = this.weapons;
    const wm = this.waveManager;
    if (this.arena.endless) {
      const t = wm.elapsed, newBest = t > this.settings.best;
      if (newBest) this.settings.best = t;
      this.settings.bestKills = Math.max(this.settings.bestKills || 0, this.kills);
      saveSettings(this.settings);
      this.ui.showGameOver({
        endless: true, time: t, best: this.settings.best, newBest, kills: this.kills, bestStreak: this.bestStreak,
        headshots: this.headshots, accuracy: w.shotsFired ? Math.round((w.shotsHit / w.shotsFired) * 100) : 0, score: this.score,
      });
      return;
    }
    this.ui.showGameOver({
      wavesSurvived: Math.max(0, wm.state === 'intermission' ? wm.wave : wm.wave - 1),
      kills: this.kills,
      headshots: this.headshots,
      accuracy: w.shotsFired ? Math.round((w.shotsHit / w.shotsFired) * 100) : 0,
      score: this.score,
    });
  }

  // ---------------- queries used by AI / weapons ----------------
  checkLOS(from, to) {
    _tmpDir.subVectors(to, from);
    const dist = _tmpDir.length();
    if (dist < 0.01) return true;
    _tmpDir.divideScalar(dist);
    this.losRay.set(from, _tmpDir);
    this.losRay.far = dist;
    return this.losRay.intersectObjects(this.arena.losMeshes, false).length === 0;
  }

  raycastWorld(origin, dir, far) {
    this.worldRay.set(origin, dir);
    this.worldRay.far = far;
    const hits = this.worldRay.intersectObjects(this.arena.raycastMeshes, false);
    return hits.length ? hits[0] : null;
  }

  getHitTargets() {
    const t = this._targets;
    t.length = 0;
    for (const m of this.arena.raycastMeshes) t.push(m);
    for (const e of this.waveManager.enemies) if (!e.dead) t.push(e.body, e.head);
    return t;
  }

  // ---------------- loop ----------------
  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h; this.weaponCamera.updateProjectionMatrix();
  }

  _updateHUD() {
    const ui = this.ui, p = this.player, wm = this.waveManager, W = this.weapons, w = W.current;
    ui.setWave(wm.wave);
    ui.setEnemiesLeft(wm.enemiesLeft);
    if (wm.endless) {
      if (this.streak && this.time - this.lastKillT > STREAK_WINDOW) { this.streak = 0; ui.flashStreak(0, false); }
      ui.setEndlessStats(this.kills, this.streak, wm.elapsed, wm.threatName, wm.aliveCount);
    }
    ui.setCash(this.cash);
    ui.setScore(this.score);
    ui.setHealth(p.health, p.maxHealth, p.armor);
    ui.setAmmo(w.mag, w.reserve, w.def.name, w.mode, w.def.magSize);
    const row = (id) => (id ? { name: WEAPON_DEFS[id].shortName + (W.weapons[id].redDot ? ' ·RDS' : ''), mag: W.weapons[id].mag, reserve: W.weapons[id].reserve } : null);
    const pid = W.primaryId(), sid = W.secondaryId();
    ui.setLoadout({
      primary: row(pid), secondary: row(sid), grenades: this.grenades,
      active: W.throwing ? 'grenade' : (W.currentId === pid ? 'primary' : W.currentId === sid ? 'secondary' : ''),
      mode: w.mode,
    });
    const ads = W.adsT;
    ui.setCrosshair(W.spread, Math.max(0, (1 - ads * 1.4)) * (1 - W.sprintT) * (W.switchState ? 0.4 : 1));
    if (W.reloading) ui.setReloadHint('RELOADING...', false);
    else if (w.mag === 0 && w.reserve === 0) ui.setReloadHint('NO AMMO — VISIT THE ARMORY', true);
    else if (w.mag <= Math.ceil(w.def.magSize * 0.25) && w.reserve > 0) ui.setReloadHint('PRESS [R] TO RELOAD', w.mag === 0);
    else ui.setReloadHint('', false);
    ui.setWaveMessage(wm.statusText && wm.state === 'intermission' ? wm.statusText : '');
    const drop = this.waveManager.lookedDrop();
    if (drop) {
      const d = WEAPON_DEFS[drop.id], W2 = this.weapons;
      ui.setPrompt(W2.owns(drop.id) ? `Press [F] to take ${d.shortName} ammo`
        : `Press [F] to pick up ${d.name} (swaps ${d.slot === 'secondary' ? 'SECONDARY' : 'PRIMARY'})`);
    } else ui.setPrompt(this._nearCrate() ? (this.arena.endless ? 'Press [E] ARMORY  ·  [T] quick ammo $250 — the fight does not stop' : 'Press [E] to open the ARMORY') : '');
  }

  /** Police strobes / street lamps near the player tint the first-person gun in real time. */
  _viewmodelNightLight() {
    const B = this.arena.bridge;
    if (!B) return;
    const p = this.player.position, cam = this.camera;
    const ns = B.nearestStrobe(p.x, p.z);
    let si = 0;
    if (ns) {
      const lit = ns.strobe.lights.find((l) => l.on);
      if (lit) {
        si = 9 * Math.max(0, 1 - ns.dist / 18);
        this.vmStrobe.color.copy(lit.color);
        // direction to the light bar in camera space -> place the viewmodel light on that side
        _tmpDir.set(lit.lens.position.x - cam.position.x, lit.lens.position.y - cam.position.y, lit.lens.position.z - cam.position.z).normalize();
        _tmpDir.applyQuaternion(_tmpQ.copy(cam.quaternion).invert());
        this.vmStrobe.position.copy(_tmpDir).multiplyScalar(0.8);
      }
    }
    this.vmStrobe.intensity = si;
    this.vmLamp.intensity = 3.2 * B.lampAt(p.x, p.z);
  }

  _loop() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.slowT > 0) { this.slowT -= dt; dt *= this.timeScale; if (this.slowT <= 0) this.timeScale = 1; }
    const realT = this.clock.elapsedTime;

    // on the endless bridge the Armory is "live": the siege keeps going while you shop
    const live = this.state === 'playing' || (this.state === 'shop' && this.arena.endless);
    if (live) {
      this.time += dt;
      this.player.update(dt, { ads: this.weapons.adsT > 0.5, firing: this.input.fireHeld });
      this.waveManager.update(dt);
      this.weapons.setSwayInput(this.input.mouseDX, this.input.mouseDY);
      this.weapons.update(dt, this.input);
      this.effects.update(dt);
      this.arena.update(dt);
      this._updateHUD();
      this._viewmodelNightLight();
      this._updateNightRig();
      if (this.arena.crateLamp) this.arena.crateLamp.material.emissiveIntensity = 1.8 + Math.sin(realT * 4) * 0.8;
    } else if (this.state === 'menu') {
      this.arena.update(dt);
      this.effects.update(dt);
      const a = realT * 0.06, C = this.arena.center, R = this.arena.viewRadius;
      this.camera.position.set(C.x + Math.cos(a) * R, C.y + 13 + R * 0.15, C.z + Math.sin(a) * R);
      this.camera.lookAt(C.x, C.y + 1, C.z);
      if (this.camera.fov !== 75) { this.camera.fov = 75; this.camera.updateProjectionMatrix(); }
    }
    this.input.firePressed = false;
    this.input.mouseDX = 0;
    this.input.mouseDY = 0;

    if (this.player) this.player.controls.pointerSpeed = this.settings.sens * (1 - 0.35 * (this.weapons ? this.weapons.adsT : 0));
    this.effects.setViewport(this.renderer.domElement.height, this.camera.fov);
    this.camera.updateMatrixWorld();
    this.audio.updateListener(this.camera);

    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state !== 'menu' && this.state !== 'loading' && this.state !== 'gameover') {
      r.clearDepth();
      r.render(this.weaponScene, this.weaponCamera);
    }
  }
}

const _tmpDir = new THREE.Vector3();
const _tmpV = new THREE.Vector3();
const _tmpQ = new THREE.Quaternion();

const game = new Game();
window.game = game; // handy for debugging in the console
game.init().catch((err) => {
  console.error(err);
  game.ui.showFatal(`Failed to start: ${err && err.message ? err.message : err}<br>See the browser console (F12).`);
});
