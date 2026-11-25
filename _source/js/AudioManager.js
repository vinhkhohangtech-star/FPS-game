// =========================================================
// AudioManager — Web Audio engine
//  * loads the user's sound files (1 bullet.wav, auto bullet.MP3, gun reload.mp3, hitmarker.mp3)
//  * spatial (HRTF) playback for bot gunfire & footsteps
//  * procedural synth fallbacks for every sound, so the game is never silent
// =========================================================
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = {};
    this.volume = 0.8;
    this.autoLoop = null;
    this.voices = [];          // every one-shot source currently playing
    this.pools = {};           // per-sound voice pools (overlapping shots, tails never cut abruptly)
    this.maxVoicesPerSound = 12;
    this.autoInfo = null;      // loop points detected in the full-auto recording
  }

  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { console.warn('[Audio] AudioContext unavailable', e); return false; }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.knee.value = 12; this.comp.ratio.value = 5;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.15;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.comp);
    this.comp.connect(c.destination);
    // 1 s of white noise reused by all synth sounds
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  resume() {
    if (!this.init()) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  async loadAll(list, onEach) {
    const report = {};
    if (!this.init()) { list.forEach(([n]) => { report[n] = false; if (onEach) onEach(n); }); return report; }
    await Promise.all(list.map(async ([name, url]) => {
      report[name] = await this.load(name, url);
      if (onEach) onEach(name);
    }));
    return report;
  }

  /** `urls` may be a single path or a list of candidate file names (first one that loads wins). */
  async load(name, urls) {
    const list = Array.isArray(urls) ? urls : [urls];
    for (const url of list) {
      try {
        const res = await fetch((window.__EMBED && window.__EMBED[url]) || encodeURI(url));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        const buf = await new Promise((resolve, reject) => {
          const p = this.ctx.decodeAudioData(ab, resolve, reject);
          if (p && p.catch) p.catch(reject);
        });
        this.buffers[name] = buf;
        if (name === 'auto') this.autoInfo = this._analyseAuto(buf);
        console.info(`[Audio] ${name}: ${url} (${buf.duration.toFixed(2)}s)`);
        return true;
      } catch (e) { /* try the next candidate */ }
    }
    console.warn(`[Audio] ${name}: none of [${list.join(', ')}] could be loaded — using synthesized fallback`);
    return false;
  }

  /** Finds individual shot transients in a full-auto recording so it can be looped seamlessly
   *  (loop from one shot onset to a later onset) and so a natural tail can be played on release. */
  _analyseAuto(buf) {
    if (buf.duration < 0.4) return { loop: false };
    const data = buf.getChannelData(0), sr = buf.sampleRate;
    const win = Math.max(1, Math.round(sr * 0.004));
    const env = [];
    for (let i = 0; i + win <= data.length; i += win) {
      let s = 0;
      for (let k = i; k < i + win; k++) s += data[k] * data[k];
      env.push(Math.sqrt(s / win));
    }
    const max = Math.max(...env) || 1;
    const onsets = [];
    let last = -1;
    for (let i = 2; i < env.length; i++) {
      const t = (i * win) / sr;
      // rising edge above 45% of peak, at least 60 ms after the previous shot
      if (env[i] > max * 0.45 && env[i] > env[i - 2] * 1.6 && (last < 0 || t - last > 0.06)) { onsets.push(t); last = t; }
    }
    if (onsets.length < 4) return { loop: true, loopStart: 0, loopEnd: buf.duration, tail: buf.duration };
    const usable = onsets.filter((t) => t < buf.duration - 0.25);
    const start = onsets[1] - 0.006;
    const end = usable[usable.length - 1] - 0.006;
    return {
      loop: true,
      loopStart: Math.max(0, start),
      loopEnd: end > start + 0.3 ? end : buf.duration,
      tail: Math.min(buf.duration - 0.05, onsets[onsets.length - 1] + 0.07),
      rpm: Math.round(60 / ((end - start) / Math.max(1, usable.length - 2))),
    };
  }

  // ---------------- low level ----------------
  _fadeStop(v, time = 0.03) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + time);
      v.src.stop(t + time + 0.01);
    } catch (e) { /* already stopped */ }
  }

  /** Voice pool: up to `maxVoicesPerSound` overlapping copies of each sound (32 overall).
   *  When full, the oldest voice is faded out over 30 ms instead of being cut. */
  _track(name, v) {
    const pool = this.pools[name] || (this.pools[name] = []);
    pool.push(v);
    this.voices.push(v);
    v.src.onended = () => {
      let i = pool.indexOf(v); if (i >= 0) pool.splice(i, 1);
      i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1);
    };
    if (pool.length > this.maxVoicesPerSound) this._fadeStop(pool.shift());
    if (this.voices.length > 32) this._fadeStop(this.voices.shift());
  }

  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.maxDistance = 150;
    p.rolloffFactor = 1.15;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  _out(position) { return position ? this._panner(position) : this.master; }

  play(name, { volume = 1, rate = 1, position = null, loop = false, lowpass = 0, offset = 0, when = 0, fadeIn = 0 } = {}) {
    const buf = this.buffers[name];
    if (!buf || !this.ctx) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.loop = loop;
    const g = c.createGain();
    const t0 = c.currentTime + when;
    if (fadeIn > 0) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(volume, t0 + fadeIn); }
    else g.gain.value = volume;
    let node = src;
    if (lowpass) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass;
      node.connect(f); node = f;
    }
    node.connect(g);
    g.connect(this._out(position));
    const v = { src, gain: g };
    if (loop && this.autoInfo && name === 'auto' && this.autoInfo.loop) {
      src.loopStart = this.autoInfo.loopStart;
      src.loopEnd = this.autoInfo.loopEnd;
    }
    src.start(t0, Math.min(offset, buf.duration - 0.01));
    if (!loop) this._track(name, v);
    return v;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) {
      l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // ---------------- synth fallbacks ----------------
  _noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; return s; }

  synthShot({ volume = 1, pitch = 1, position = null } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, out = this._out(position);
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(7000 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(350, t + 0.2);
    const g = c.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    n.connect(f); f.connect(g); g.connect(out);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const og = c.createGain();
    og.gain.setValueAtTime(volume * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og); og.connect(out);
    n.start(t, Math.random() * 0.6, 0.3);
    o.start(t); o.stop(t + 0.22);
  }

  _click(when, freq, vol, dur, type = 'bandpass') {
    const c = this.ctx;
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    n.connect(f); f.connect(g); g.connect(this.master);
    n.start(when, Math.random() * 0.5, dur + 0.02);
  }

  /** Fallback reload foley, timed to the same phases as the reload animation (see Weapon.js). */
  synthReload(duration = 2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._click(t + duration * 0.20, 2400, 0.5, 0.05);   // mag release
    this._click(t + duration * 0.25, 900, 0.45, 0.12);   // old mag out
    this._click(t + duration * 0.62, 1300, 0.65, 0.08);  // new mag in
    this._click(t + duration * 0.64, 3200, 0.55, 0.04);  // latch click
    this._click(t + duration * 0.72, 1800, 0.55, 0.06);  // charging handle back
    this._click(t + duration * 0.745, 2600, 0.65, 0.05); // bolt slams forward
  }

  synthHit(headshot) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(headshot ? 2600 : 1900, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.06);
    this._click(t, 5000, 0.35, 0.03, 'highpass');
  }

  synthBeep(freq, dur = 0.12, vol = 0.15, type = 'sine', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------------- high level API ----------------
  singleShot(def) {
    const rate = def.soundRate * (0.96 + Math.random() * 0.08);
    if (this.buffers.single) this.play('single', { volume: def.volume, rate });
    else this.synthShot({ volume: def.volume, pitch: def.soundRate });
  }

  /** Called every AK round in full-auto.
   *  A long "auto bullet" recording is looped between two detected shot onsets while the trigger
   *  is held (seamless, no gaps); a short one is treated as a single round and layered per shot. */
  autoShot(def) {
    const b = this.buffers.auto;
    if (!b) return this.singleShot(def);
    if (this.autoInfo && this.autoInfo.loop) {
      if (!this.autoLoop) this.autoLoop = this.play('auto', { volume: 0.9, loop: true });
    } else {
      this.play('auto', { volume: 0.9, rate: 0.97 + Math.random() * 0.06 });
    }
  }

  stopAuto() {
    if (!this.autoLoop || !this.ctx) { this.autoLoop = null; return; }
    this._fadeStop(this.autoLoop, 0.04);
    this.autoLoop = null;
    // natural echo / tail of the recording so the burst doesn't end with a hard cut
    if (this.autoInfo && this.autoInfo.tail) this.play('auto', { volume: 0.7, offset: this.autoInfo.tail, fadeIn: 0.02 });
  }

  /** Reload foley. The recording is played from the start of the reload and time-stretched (within
   *  ±25 %) so its mag-out / mag-in / bolt events line up with the 3-stage animation, whose phases
   *  are fractions of the reload time (mag out ≈25 %, mag in ≈62 %, bolt release ≈75 %). */
  reload(duration) {
    const b = this.buffers.reload;
    if (b) {
      const rate = Math.min(1.25, Math.max(0.8, b.duration / (duration * 0.756)));
      this.play('reload', { volume: 0.95, rate });
    } else this.synthReload(duration);
  }

  hit(headshot) {
    if (this.buffers.hit) this.play('hit', { volume: headshot ? 1 : 0.8, rate: headshot ? 1.2 : 1 });
    else this.synthHit(headshot);
  }

  enemyShot(pos, weapon) {
    // a little variety per enemy weapon: pistols crack higher, the sniper / LMG boom lower
    const v = weapon === 'sniper' ? [0.9, 0.62, 2600] : weapon === 'lmg' ? [0.65, 0.74, 3000] : weapon === 'usp45' ? [0.45, 1.08, 4600]
      : weapon === 'ump45' ? [0.5, 0.95, 3600] : [0.55, 0.88, 3800];
    if (this.buffers.single) {
      this.play('single', { volume: v[0], rate: v[1] + Math.random() * 0.08, position: pos, lowpass: v[2] });
    } else this.synthShot({ volume: v[0] * 0.9, pitch: v[1] * 0.9, position: pos });
  }

  /** Bullet glancing off a car body: metallic ping + clank, spatialised. Rate limited. */
  ricochet(pos) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (t - (this._ricT || 0) < 0.06) return;
    this._ricT = t;
    const out = this._out(pos);
    const o = c.createOscillator(); o.type = 'triangle';
    const f0 = 2200 + Math.random() * 1600;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + 0.22);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.28);
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200 + Math.random() * 1500; f.Q.value = 6;
    const g = c.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.5, 0.12);
  }

  /** Supersonic crack of a round passing close by (suppression). */
  whiz(heavy) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (t - (this._whizT || 0) < 0.07) return;
    this._whizT = t;
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = heavy ? 1400 : 2600;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(heavy ? 0.5 : 0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.16 : 0.09));
    n.connect(f); f.connect(g);
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    n.start(t, Math.random() * 0.6, 0.2);
  }

  /** Suicide-bomber vest beep (spatial, gets frantic up close). */
  bomberBeep(pos, listenerPos) {
    if (!this.ctx) return;
    const d = listenerPos ? Math.hypot(pos.x - listenerPos.x, pos.z - listenerPos.z) : 10;
    const v = 0.2 * Math.max(0, 1 - d / 40);
    if (v < 0.005) return;
    const c = this.ctx, t = c.currentTime, out = this._out(pos);
    const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(1850, t);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 4, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.08);
  }

  footstep(pos, vol = 0.3) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280 + Math.random() * 180;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(f); f.connect(g); g.connect(this._out(pos));
    n.start(t, Math.random() * 0.8, 0.12);
  }

  hurt(armorOnly) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(armorOnly ? 420 : 110, t);
    o.frequency.exponentialRampToValueAtTime(armorOnly ? 200 : 45, t + 0.2);
    const g = c.createGain();
    g.gain.setValueAtTime(armorOnly ? 0.25 : 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.27);
    this._click(t, armorOnly ? 3500 : 600, 0.4, 0.08);
  }

  /** Grenade explosion: low boom + crack + noisy rumble tail, spatialised. */
  explosion(pos) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, out = this._out(pos);
    if (this.buffers.explosion) {
      // recorded blast through a low-shelf boost for extra weight, plus a sub-bass thump
      const src = c.createBufferSource(); src.buffer = this.buffers.explosion;
      src.playbackRate.value = 0.94 + Math.random() * 0.1;
      const shelf = c.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 160; shelf.gain.value = 7;
      const g = c.createGain(); g.gain.value = 1.5;
      src.connect(shelf); shelf.connect(g); g.connect(out);
      src.start(t);
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(24, t + 0.7);
      const og = c.createGain(); og.gain.setValueAtTime(1.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.85);
      return;
    }
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const og = c.createGain(); og.gain.setValueAtTime(2.2, t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 1.2);
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    const g = c.createGain(); g.gain.setValueAtTime(2.0, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    n.loop = true; n.connect(f); f.connect(g); g.connect(out);
    n.start(t); n.stop(t + 1.9);
  }

  /** Low thump-thump when the player is in trouble. */
  heartbeat() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const [dt, v] of [[0, 0.9], [0.24, 0.6]]) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.16);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(v, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.2);
      o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.22);
    }
  }

  /** Grenade fuse beep, quieter with distance. */
  grenadeBeep(pos, listenerPos) {
    if (!this.ctx) return;
    const d = listenerPos ? Math.hypot(pos.x - listenerPos.x, pos.y - listenerPos.y, pos.z - listenerPos.z) : 5;
    const v = 0.16 * Math.max(0, 1 - d / 25);
    if (v > 0.005) this.synthBeep(2300, 0.05, v, 'square');
  }

  dry() { if (this.ctx) this._click(this.ctx.currentTime, 3000, 0.5, 0.03); }

  ui(type) {
    switch (type) {
      case 'buy': this.synthBeep(880, 0.08, 0.12, 'triangle'); this.synthBeep(1320, 0.12, 0.12, 'triangle', 0.07); break;
      case 'deny': this.synthBeep(180, 0.18, 0.14, 'square'); break;
      case 'pickup': this.synthBeep(660, 0.07, 0.1, 'triangle'); this.synthBeep(990, 0.09, 0.1, 'triangle', 0.06); break;
      case 'wave': this.synthBeep(220, 0.5, 0.16, 'sawtooth'); this.synthBeep(330, 0.6, 0.12, 'sawtooth', 0.15); break;
      case 'waveDone': this.synthBeep(523, 0.15, 0.12, 'triangle'); this.synthBeep(659, 0.15, 0.12, 'triangle', 0.12); this.synthBeep(784, 0.3, 0.12, 'triangle', 0.24); break;
      case 'switch': if (this.ctx) this._click(this.ctx.currentTime, 1500, 0.35, 0.05); break;
      case 'click': if (this.ctx) this._click(this.ctx.currentTime, 2500, 0.4, 0.03); break;
      case 'streak': this.synthBeep(988, 0.08, 0.13, 'square'); this.synthBeep(1319, 0.14, 0.13, 'square', 0.07); break;
      case 'milestone':
        this.synthBeep(392, 0.18, 0.15, 'sawtooth'); this.synthBeep(523, 0.18, 0.15, 'sawtooth', 0.12);
        this.synthBeep(659, 0.18, 0.15, 'sawtooth', 0.24); this.synthBeep(784, 0.45, 0.17, 'sawtooth', 0.36); break;
      case 'pin': if (this.ctx) { this._click(this.ctx.currentTime, 4200, 0.45, 0.02); this._click(this.ctx.currentTime + 0.12, 1800, 0.35, 0.04); } break;
      default: break;
    }
  }
}
