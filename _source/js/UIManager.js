// =========================================================
// UIManager — DOM HUD, hitmarkers, popups, menus, Armory modal
// =========================================================
const $ = (id) => document.getElementById(id);

/** Procedural blood splatter (data URL) used for the on-screen blood. */
function screenSplat(seed) {
  let x = seed * 9301 + 49297;
  const R = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const blob = (px, py, r, a) => {
    const grd = g.createRadialGradient(px, py, 0, px, py, r);
    grd.addColorStop(0, `rgba(60,0,0,${a})`); grd.addColorStop(0.7, `rgba(90,0,0,${a * 0.95})`); grd.addColorStop(1, 'rgba(115,0,2,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
  };
  for (let i = 0; i < 12; i++) blob(128 + (R() - 0.5) * 70, 128 + (R() - 0.5) * 70, 18 + R() * 34, 0.97);
  for (let i = 0; i < 9; i++) {                 // drips running down
    const px = 80 + R() * 96, py = 120 + R() * 30, len = 20 + R() * 70, w = 2 + R() * 3;
    const lg = g.createLinearGradient(0, py, 0, py + len);
    lg.addColorStop(0, 'rgba(95,0,0,0.85)'); lg.addColorStop(1, 'rgba(95,0,0,0.5)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(px - w, py); g.lineTo(px + w, py); g.lineTo(px + w * 0.6, py + len); g.lineTo(px - w * 0.6, py + len); g.fill();
    blob(px, py + len, w * 1.6, 0.9);
  }
  for (let i = 0; i < 30; i++) { const a = R() * 6.283, d = 60 + R() * 60; blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + R() * 6, 0.8); }
  return c.toDataURL();
}
export const formatMoney = (n) => '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US');

export class UIManager {
  constructor() {
    this.e = {
      hud: $('hud'), wave: $('wave-num'), enemies: $('enemies-left'), cash: $('cash'), score: $('score'),
      healthSegs: $('health-segments'), healthText: $('health-text'),
      armorWrap: $('armor-wrap'), armorFill: $('armor-fill'), armorText: $('armor-text'),
      weaponName: $('weapon-name'), mag: $('ammo-mag'), reserve: $('ammo-reserve'), fireMode: $('fire-mode'), slots: $('weapon-slots'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), killFeed: $('kill-feed'),
      waveMsg: $('wave-message'), banner: $('wave-banner'), prompt: $('interact-prompt'), reloadHint: $('reload-hint'),
      grenade: $('grenade-ind'), grenadeArrow: $('grenade-arrow'),
      dmgFlash: $('damage-flash'), lowHealth: $('low-health'), dmgInd: $('damage-indicators'),
      loadingBar: $('loading-bar'), loadingText: $('loading-text'), bootError: $('boot-error'),
      assetReport: $('asset-report'), shopCash: $('shop-cash'), pauseHint: $('pause-hint'), goStats: $('gameover-stats'),
    };
    this.screens = {
      loading: $('loading-screen'), menu: $('menu-screen'), pause: $('pause-screen'),
      shop: $('shop-screen'), gameover: $('gameover-screen'),
    };
    this.cache = Object.create(null);
    this.handlers = Object.create(null);

    // COD-style blood on the screen edges (procedural splatter images)
    this.screenBlood = [];
    const holder = document.createElement('div');
    holder.id = 'screen-blood';
    this.e.hud.insertBefore(holder, this.e.hud.firstChild);
    const spots = [['left', '-9%', '6%'], ['right', '-9%', '10%'], ['left', '-7%', '50%'], ['right', '-7%', '46%'], ['left', '9%', '72%'], ['right', '8%', '70%']];
    spots.forEach(([side, x, y], i) => {
      const d = document.createElement('div');
      d.className = 'blood-splat';
      d.style[side] = x; d.style.top = y;
      d.style.backgroundImage = `url(${screenSplat(i + 1)})`;
      d.style.transform = `rotate(${(i * 67) % 360}deg) scale(${1 + (i % 3) * 0.2})`;
      holder.appendChild(d);
      this.screenBlood.push(d);
    });
    this.segs = [];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('div');
      s.className = 'seg on';
      this.e.healthSegs.appendChild(s);
      this.segs.push(s);
    }
    this._bind();
  }

  on(name, fn) { this.handlers[name] = fn; }
  _emit(name, ...args) { const h = this.handlers[name]; if (h) h(...args); }

  _bind() {
    $('btn-start').addEventListener('click', () => this._emit('start'));
    $('btn-resume').addEventListener('click', () => this._emit('resume'));
    $('btn-restart-pause').addEventListener('click', () => this._emit('restart'));
    $('btn-restart').addEventListener('click', () => this._emit('restart'));
    $('btn-menu-pause').addEventListener('click', () => this._emit('menu'));
    $('btn-menu-go').addEventListener('click', () => this._emit('menu'));
    $('btn-close-shop').addEventListener('click', () => this._emit('closeShop'));
    $('shop-items').addEventListener('click', (ev) => {
      const b = ev.target.closest('.shop-item');
      if (b) this._emit('buy', b.dataset.item);
    });
    $('map-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('.map-btn');
      if (b) this._emit('map', b.dataset.map);
    });
    document.querySelectorAll('.sens-input').forEach((inp) =>
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); this.setSettings(v, null); this._emit('sensitivity', v); }));
    document.querySelectorAll('.gfx-btn').forEach((b) => b.addEventListener('click', () => this._emit('gfx', b.dataset.gfx)));
    document.querySelectorAll('.vol-input').forEach((inp) =>
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); this.setSettings(null, v); this._emit('volume', v); }));
  }

  // cached setters avoid DOM thrash every frame
  _text(key, el, value) { if (this.cache[key] !== value) { this.cache[key] = value; el.textContent = value; } }
  _class(key, el, cls, on) { const k = key + cls; if (this.cache[k] !== on) { this.cache[k] = on; el.classList.toggle(cls, on); } }

  showScreen(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    const hudVisible = !(name === 'loading' || name === 'menu' || name === 'gameover');
    this.e.hud.classList.toggle('hidden', !hudVisible);
  }

  setLoading(frac, label) {
    this.e.loadingBar.style.width = `${Math.round(frac * 100)}%`;
    if (label) this.e.loadingText.textContent = label;
  }
  showFatal(msg) {
    this.e.bootError.innerHTML = msg;
    this.e.bootError.classList.remove('hidden');
  }

  setAssetReport(lines) {
    this.e.assetReport.innerHTML = lines
      .map(([label, ok, okText, fbText]) => `${label}: <span class="${ok ? 'ok' : 'fb'}">${ok ? okText : fbText}</span>`)
      .join('<br>');
  }

  setSettings(sens, vol) {
    if (sens != null) {
      document.querySelectorAll('.sens-input').forEach((i) => { i.value = sens; });
      document.querySelectorAll('.sens-val').forEach((s) => { s.textContent = sens.toFixed(2); });
    }
    if (vol != null) {
      document.querySelectorAll('.vol-input').forEach((i) => { i.value = vol; });
      document.querySelectorAll('.vol-val').forEach((s) => { s.textContent = `${Math.round(vol * 100)}%`; });
    }
  }

  setGraphics(q) {
    document.querySelectorAll('.gfx-btn').forEach((b) => b.classList.toggle('active', b.dataset.gfx === q));
  }

  // ---------- endless (Highway Bridge) HUD ----------
  setEndless(on) {
    this._class('endlessMode', this.e.hud, 'endless', on);
    $('wave-rows').classList.toggle('hidden', on);
    $('endless-rows').classList.toggle('hidden', !on);
  }

  setEndlessStats(kills, streak, seconds, threat, alive) {
    const t = Math.floor(seconds), mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
    this._text('esKills', $('es-kills'), String(kills));
    this._text('esStreak', $('es-streak'), streak > 0 ? 'x' + streak : '—');
    this._text('esTime', $('es-time'), `${mm}:${ss}`);
    this._text('esThreat', $('es-threat'), threat);
    this._text('esAlive', $('es-alive'), String(alive));
    this._class('esHot', $('es-streak'), 'hot', streak >= 5);
  }

  /** Pulse the KILLSTREAK counter (bigger flash on multi-kills). */
  flashStreak(n, multi) {
    const el = $('es-streak-row');
    if (!el || n <= 0) return;
    el.classList.remove('pulse', 'multi'); void el.offsetWidth;
    el.classList.add('pulse'); if (multi) el.classList.add('multi');
  }

  milestone(text) {
    const el = $('es-milestone');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // ---------- HUD ----------
  setWave(n) { this._text('wave', this.e.wave, String(n)); }
  setEnemiesLeft(n) { this._text('enemies', this.e.enemies, String(n)); }
  setCash(n) { this._text('cash', this.e.cash, formatMoney(n)); }
  setScore(n) { this._text('score', this.e.score, Math.floor(n).toLocaleString('en-US')); }

  setHealth(hp, max, armor) {
    const pct = hp / max;
    const on = Math.ceil(pct * 10 - 0.001);
    const low = pct <= 0.4;
    const key = `${on}|${low}`;
    if (this.cache.hpKey !== key) {
      this.cache.hpKey = key;
      this.segs.forEach((s, i) => { s.classList.toggle('on', i < on); s.classList.toggle('low', low); });
    }
    this._text('hp', this.e.healthText, String(Math.ceil(hp)));
    const hasArmor = armor > 0;
    this._class('armorWrap', this.e.armorWrap, 'hidden', !hasArmor);
    if (hasArmor) {
      const a = Math.ceil(armor);
      if (this.cache.armor !== a) { this.cache.armor = a; this.e.armorFill.style.width = `${a}%`; this.e.armorText.textContent = String(a); }
    }
    const lowAlpha = Math.max(0, Math.min(1, (0.55 - pct) / 0.55));
    const la = lowAlpha.toFixed(2);
    if (this.cache.lowA !== la) { this.cache.lowA = la; this.e.lowHealth.style.opacity = la; }
  }

  setAmmo(mag, reserve, name, mode, magSize) {
    this._text('wname', this.e.weaponName, name);
    this._text('mag', this.e.mag, String(mag));
    this._text('res', this.e.reserve, String(reserve));
    this._text('mode', this.e.fireMode, mode.toUpperCase());
    this._class('magLow', this.e.mag, 'low', mag <= Math.ceil(magSize * 0.25));
    this._class('resEmpty', this.e.reserve, 'empty', reserve === 0);
  }

  setSlots(slots, currentId, defs) {
    const key = slots.join(',') + '|' + currentId;
    if (this.cache.slots === key) return;
    this.cache.slots = key;
    this.e.slots.innerHTML = slots
      .map((id, i) => `<div class="slot ${id === currentId ? 'active' : ''}">${i + 1} ${defs[id].shortName}</div>`)
      .join('');
  }

  /** Bottom-right loadout box: [1] primary, [2] secondary, [4] grenades — active row highlighted. */
  setLoadout({ primary, secondary, grenades, active }) {
    const r = (x) => (x ? `${x.name}|${x.mag}|${x.reserve}` : '-');
    const key = [r(primary), r(secondary), grenades, active].join('#');
    if (this.cache.loadout === key) return;
    this.cache.loadout = key;
    const gunRow = (k, slot, x) => x
      ? `<div class="lo-row ${active === slot ? 'active' : ''}"><span class="lo-key">${k}</span><span class="lo-name">${x.name}</span>` +
        `<span class="lo-ammo"><b class="${x.mag === 0 ? 'empty' : ''}">${x.mag}</b>/${x.reserve}</span></div>`
      : `<div class="lo-row off"><span class="lo-key">${k}</span><span class="lo-name">${slot === 'secondary' ? 'NO SIDEARM' : 'EMPTY'}</span><span class="lo-ammo"></span></div>`;
    const pips = Array.from({ length: Math.max(grenades, 0) }, () => '<i></i>').join('');
    this.e.slots.innerHTML = gunRow(1, 'primary', primary) + gunRow(2, 'secondary', secondary) +
      `<div class="lo-row ${active === 'grenade' ? 'active' : ''} ${grenades ? '' : 'off'}"><span class="lo-key">4</span>` +
      `<span class="lo-name">FRAG <span class="lo-pips">${pips}</span></span><span class="lo-ammo">x${grenades}</span></div>`;
  }

  /** White flash when a blast goes off in view. */
  blastFlash(k) {
    const el = this._fxEl('blast-flash');
    el.style.transition = 'none'; el.style.opacity = String(Math.min(0.85, 0.25 + k * 0.6));
    void el.offsetWidth;
    el.style.transition = 'opacity 0.35s ease-out'; 
    clearTimeout(this._bfT); this._bfT = setTimeout(() => { el.style.opacity = '0'; }, 80);
  }

  /** Dirt / debris smeared on the screen edges after a close explosion. */
  dirtVignette(k) {
    const el = this._fxEl('dirt-vignette');
    el.style.transition = 'none'; el.style.opacity = String(Math.min(1, 0.35 + k * 0.75));
    void el.offsetWidth;
    el.style.transition = 'opacity 2.6s ease-in';
    clearTimeout(this._dvT); this._dvT = setTimeout(() => { el.style.opacity = '0'; }, 400);
  }

  _fxEl(id) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; this.e.hud.appendChild(el); }
    return el;
  }

  setCrosshair(spread, alpha) {
    const gap = Math.round(5 + spread * 650);
    if (this.cache.chGap !== gap) { this.cache.chGap = gap; this.e.crosshair.style.setProperty('--gap', `${gap}px`); }
    const a = alpha.toFixed(2);
    if (this.cache.chA !== a) { this.cache.chA = a; this.e.crosshair.style.opacity = a; }
  }

  hitmarker(headshot, kill) {
    const h = this.e.hitmarker;
    h.classList.remove('show', 'head', 'kill');
    void h.offsetWidth; // restart CSS animation
    h.classList.add('show');
    if (headshot) h.classList.add('head');
    if (kill) h.classList.add('kill');
  }

  killPopup(text, type = 'kill') {
    const d = document.createElement('div');
    d.className = `kill-pop ${type}`;
    d.textContent = text;
    this.e.killFeed.appendChild(d);
    while (this.e.killFeed.children.length > 4) this.e.killFeed.firstChild.remove();
    setTimeout(() => d.remove(), 1650);
  }

  /** Splash blood on a random edge of the screen; amount 0..1. */
  screenBloodHit(amount) {
    const n = amount > 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const d = this.screenBlood[Math.floor(Math.random() * this.screenBlood.length)];
      d.style.transition = 'none';
      d.style.opacity = String(Math.min(1, 0.6 + amount * 0.5));
      void d.offsetWidth;
      d.style.transition = 'opacity 2.2s ease-in 0.4s';
      d.style.opacity = '0';
    }
  }

  damageFlash(strength = 1) {
    const el = this.e.dmgFlash;
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(1, 0.45 + strength * 0.5));
    void el.offsetWidth;
    el.style.transition = 'opacity .7s ease-out';
    el.style.opacity = '0';
  }

  damageIndicator(angleRad) {
    const d = document.createElement('div');
    d.className = 'dmg-ind';
    d.style.transform = `rotate(${angleRad}rad)`;
    this.e.dmgInd.appendChild(d);
    while (this.e.dmgInd.children.length > 6) this.e.dmgInd.firstChild.remove();
    setTimeout(() => d.remove(), 1350);
  }

  /** angle (radians, 0 = straight ahead) of the nearest live grenade, or null to hide the warning. */
  setGrenadeWarning(angle, dist = 0) {
    const show = angle !== null && angle !== undefined;
    this._class('gren', this.e.grenade, 'hidden', !show);
    if (!show) return;
    this.e.grenadeArrow.style.transform = `rotate(${angle.toFixed(3)}rad)`;
    this._class('grenNear', this.e.grenade, 'danger', dist < 5);
  }

  setWaveMessage(text) {
    this._class('wmHidden', this.e.waveMsg, 'hidden', !text);
    if (text) this._text('wm', this.e.waveMsg, text);
  }

  banner(title, sub = '') {
    const b = this.e.banner;
    b.innerHTML = `<div class="t">${title}</div><div class="s">${sub}</div>`;
    b.classList.toggle('long', title.length > 12);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  setPrompt(text) { this._text('prompt', this.e.prompt, text); }

  setReloadHint(text, warn) {
    this._text('rh', this.e.reloadHint, text);
    this._class('rhw', this.e.reloadHint, 'warn', !!warn);
  }

  setPauseHint(text) { this.e.pauseHint.textContent = text || ''; }

  // ---------- Armory ----------
  setMaps(levels, current) {
    $('map-list').innerHTML = Object.entries(levels).map(([id, L]) =>
      `<button class="map-btn ${id === current ? 'active' : ''}" data-map="${id}"><b>${L.name}</b><span>${L.desc}</span></button>`).join('');
  }

  renderShop({ cash, armor, prices, guns, defs, grenades, maxGrenades, keys, redDot }) {
    this.e.shopCash.textContent = formatMoney(cash);
    const row = (item, key, name, desc, priceText, cls) =>
      `<button class="shop-item ${cls}" data-item="${item}"><span class="key">${key}</span><span class="name">${name}</span>` +
      `<span class="desc">${desc}</span><span class="price">${priceText}</span></button>`;
    let h = '<div class="shop-section">SUPPLIES</div>';
    h += row('ammo', 1, 'REFILL AMMO', 'Full magazines + max reserve for your weapons', formatMoney(prices.ammo), cash < prices.ammo ? 'disabled' : '');
    const armorFull = armor >= 100;
    h += row('armor', 2, 'BODY ARMOR', '+100 armor shield, absorbs incoming fire', armorFull ? 'FULL' : formatMoney(prices.armor),
      armorFull ? 'owned disabled' : cash < prices.armor ? 'disabled' : '');
    const gFull = grenades >= maxGrenades;
    h += row('grenades', 3, 'FRAG GRENADES', `+2 frag grenades (you have ${grenades}/${maxGrenades}) — throw with [4] or [G]`,
      gFull ? 'FULL' : formatMoney(prices.grenades), gFull ? 'owned disabled' : cash < prices.grenades ? 'disabled' : '');
    const rdTxt = redDot.owned ? `Already fitted to your ${redDot.name}` : redDot.can ? `Fit a red dot sight to your ${redDot.name} (weapon in hand)`
      : `Not for the ${redDot.name} — switch to a rifle, SMG or shotgun without an optic`;
    h += row('reddot', 4, 'RED DOT SIGHT', rdTxt, redDot.owned ? 'FITTED' : formatMoney(prices.reddot),
      redDot.owned ? 'owned disabled' : (!redDot.can || cash < prices.reddot) ? 'disabled' : '');
    h += '<div class="shop-section">WEAPONS — buying replaces the weapon in that slot</div>';
    guns.forEach((g, i) => {
      const d = g.def, key = keys[i] || '';
      const stats = `${d.pellets ? d.pellets + '×' : ''}${d.damage} dmg · ${d.rpm} rpm · ${d.magSize} rnd`;
      const desc = `<span class="stats">${stats}</span> — ${d.desc || ''}` + (g.replaces && !g.owned ? ` <i>(replaces ${defs[g.replaces] ? defs[g.replaces].shortName : g.replaces})</i>` : '');
      let price = formatMoney(g.price), cls = '';
      if (g.owned) { price = 'OWNED'; cls = 'owned equipped disabled'; }
      else if (!g.ready) { price = g.loading ? 'LOADING…' : 'LOAD'; cls = 'disabled'; }
      else if (cash < g.price) cls = 'disabled';
      h += row('w:' + g.id, key, `${d.name}<span class="tag">${d.cls || ''}${d.slot === 'secondary' ? ' · SECONDARY' : ''}</span>`, desc, price, cls);
    });
    $('shop-items').innerHTML = h;
  }
  denyShopItem(item) {
    const b = document.querySelector(`.shop-item[data-item="${item}"]`);
    if (!b) return;
    b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  }

  showGameOver(s) {
    if (s.endless) {
      const f = (x) => { const t = Math.floor(x); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
      this.e.goStats.innerHTML = `
      <span>Survived time</span><b>${f(s.time)}${s.newBest ? ' <i class="newbest">NEW BEST</i>' : ''}</b>
      <span>Best time</span><b>${f(s.best)}</b>
      <span>Total kills</span><b>${s.kills}</b>
      <span>Best killstreak</span><b>x${s.bestStreak}</b>
      <span>Headshots</span><b>${s.headshots}</b>
      <span>Accuracy</span><b>${s.accuracy}%</b>
      <span>Final score</span><b>${s.score.toLocaleString('en-US')}</b>`;
      this.showScreen('gameover');
      return;
    }
    this.e.goStats.innerHTML = `
      <span>Waves survived</span><b>${s.wavesSurvived}</b>
      <span>Enemies killed</span><b>${s.kills}</b>
      <span>Headshots</span><b>${s.headshots}</b>
      <span>Accuracy</span><b>${s.accuracy}%</b>
      <span>Final score</span><b>${s.score.toLocaleString('en-US')}</b>`;
    this.showScreen('gameover');
  }

  resetHUD() {
    this.e.killFeed.innerHTML = '';
    this.e.dmgInd.innerHTML = '';
    this.e.dmgFlash.style.opacity = '0';
    this.setWaveMessage('');
    this.setPrompt('');
    this.setReloadHint('', false);
    this.setGrenadeWarning(null);
  }
}
