import {
  PLANES, ROUTES, MISSIONS, ACHIEVEMENTS, UPGRADE_KEYS,
  planeById, routeById, planeStats, levelFromXp, xpForLevel,
  upgradeCost, upgradeTech, evolvePrice, totalUpgradeLevels
} from './config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const MAX_UP = 5;
const ICONS = {
  ring: 'i-ring', coin: 'i-coin', fuel: 'i-fuel', tech: 'i-tech', boost: 'i-boost',
  landing: 'i-landing', star: 'i-star', globe: 'i-globe', hangar: 'i-hangar',
  evolve: 'i-evolve', wings: 'i-wings'
};
const icon = (id, cls = '') => `<svg class="${cls}"><use href="#${ICONS[id] || id}"/></svg>`;

export class UI {
  constructor(game, save, audio) {
    this.game = game;
    this.save = save;
    this.audio = audio;
    this.activeScreen = null;
    this.selectedRoute = this.save.data.selectedRoute || 'coast';
    if (!this.routeUnlocked(this.selectedRoute)) this.selectedRoute = this.firstUnlockedRoute();
    this.garagePlane = this.save.data.selectedPlane;
    this.missionRoute = this.selectedRoute;
    this.pendingLaunch = null;
    this.hudCache = { speed: -1, alt: -1, fuel: -1, throttle: -1, coins: -1, tech: -1, ring: -1, targetDist: -1, angle: 0 };
    this.hudMissionEls = [];
    this.bind();
    this.renderMenu();
    this.refreshWallets();
    this.renderGarage();
    this.renderUpgrades();
    this.renderMissions();
    this.renderSettings();
    this.subscribe();
    this.applyAudioSettings();
  }

  routeUnlocked(id) { return !!this.save.data.routeUnlocks[id]; }
  firstUnlockedRoute() {
    return ROUTES.find(r => this.routeUnlocked(r.id))?.id || 'coast';
  }
  rankName(lvl) {
    if (lvl >= 18) return 'LEGEND';
    if (lvl >= 14) return 'ACE';
    if (lvl >= 10) return 'COMMANDER';
    if (lvl >= 6) return 'CAPTAIN';
    if (lvl >= 3) return 'PILOT';
    return 'ROOKIE';
  }

  subscribe() {
    const g = this.game;
    g.on('flightstart', () => this.onFlightStart());
    g.on('countdown', n => this.showCountdown(n));
    g.on('pickup', p => this.showPickup(p));
    g.on('toast', t => this.showBanner(t.text, t.kind));
    g.on('warning', w => this.showBanner(w.text, w.kind));
    g.on('ring', r => this.onRing(r));
    g.on('result', r => this.showResult(r));
    g.on('pause', () => this.togglePause());
    g.on('quit', () => this.onQuit());
  }

  bind() {
    document.addEventListener('pointerdown', () => this.initAudio(), { once: true, passive: true });
    document.addEventListener('keydown', () => this.initAudio(), { once: true });
    document.addEventListener('click', e => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        this.audio.click();
        this.openScreen(nav.dataset.nav);
        return;
      }
      const back = e.target.closest('[data-back]');
      if (back) {
        this.audio.back();
        this.closeScreen();
      }
    });

    $('#btn-fly').addEventListener('click', () => {
      this.audio.click();
      this.openScreen('fly');
    });

    $('#btn-launch').addEventListener('click', () => this.launchSelected());
    $('#route-list').addEventListener('click', e => {
      const card = e.target.closest('[data-route]');
      if (!card) return;
      this.selectedRoute = card.dataset.route;
      this.missionRoute = this.selectedRoute;
      this.audio.click();
      this.renderFly();
    });

    $('#plane-list').addEventListener('click', e => {
      const item = e.target.closest('[data-plane]');
      if (!item) return;
      this.garagePlane = item.dataset.plane;
      this.audio.click();
      this.game.setShowcasePlane(this.garagePlane);
      this.renderGarage();
    });

    $('#garage-info').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this.handleGarageAction(btn.dataset.action);
    });

    $('#upgrade-panel').addEventListener('click', e => {
      const btn = e.target.closest('[data-up]');
      if (!btn) return;
      this.buyUpgrade(btn.dataset.up);
    });

    $('#mission-tabs').addEventListener('click', e => {
      const tab = e.target.closest('[data-mroute]');
      if (!tab) return;
      this.missionRoute = tab.dataset.mroute;
      this.audio.click();
      this.renderMissions();
    });

    $('#set-sound').addEventListener('change', e => {
      this.save.data.settings.sound = e.target.checked;
      this.save.save();
      this.applyAudioSettings();
      this.audio.click();
    });
    $('#set-music').addEventListener('change', e => {
      this.save.data.settings.music = e.target.checked;
      this.save.save();
      this.applyAudioSettings();
      this.audio.click();
    });
    $('#quality-seg').addEventListener('click', e => {
      const btn = e.target.closest('[data-q]');
      if (!btn) return;
      this.save.data.settings.quality = btn.dataset.q;
      this.save.save();
      this.game.applyQuality();
      this.game.initShowcase();
      this.renderSettings();
      this.audio.click();
      this.toast(`Graphics set to ${btn.dataset.q.toUpperCase()}`, 'good');
    });
    $('#btn-controls-help').addEventListener('click', () => {
      this.audio.click();
      $('#overlay-help').classList.remove('hidden');
    });
    $('#btn-help-ok').addEventListener('click', () => {
      this.audio.back();
      $('#overlay-help').classList.add('hidden');
    });
    $('#btn-reset').addEventListener('click', () => {
      this.audio.click();
      $('#overlay-confirm').classList.remove('hidden');
    });
    $('#btn-reset-cancel').addEventListener('click', () => {
      this.audio.back();
      $('#overlay-confirm').classList.add('hidden');
    });
    $('#btn-reset-confirm').addEventListener('click', () => this.resetProgress());

    $('#btn-pause').addEventListener('click', () => {
      this.audio.click();
      this.togglePause(true);
    });
    $('#btn-resume').addEventListener('click', () => this.togglePause(false));
    $('#btn-restart').addEventListener('click', () => {
      this.audio.click();
      $('#overlay-pause').classList.add('hidden');
      this.launchRoute(this.game.route.id, true);
    });
    $('#btn-quit').addEventListener('click', () => {
      this.audio.back();
      $('#overlay-pause').classList.add('hidden');
      this.game.quitFlight();
    });

    $('#btn-tutorial-ok').addEventListener('click', () => {
      this.audio.click();
      this.save.data.settings.tutorial = false;
      this.save.save();
      $('#overlay-tutorial').classList.add('hidden');
      const pending = this.pendingLaunch;
      this.pendingLaunch = null;
      if (pending) this.launchRoute(pending);
    });

    $('#btn-boost').addEventListener('pointerdown', e => { e.preventDefault(); this.game.setBoost(true); $('#btn-boost').classList.add('active'); });
    $('#btn-brake').addEventListener('pointerdown', e => { e.preventDefault(); this.game.setBrake(true); $('#btn-brake').classList.add('active'); });
    const release = (id, fn) => {
      const el = $(id);
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => {
        fn(false);
        el.classList.remove('active');
      }));
    };
    release('#btn-boost', v => this.game.setBoost(v));
    release('#btn-brake', v => this.game.setBrake(v));

    $('#result-card').addEventListener('click', e => {
      const btn = e.target.closest('[data-result]');
      if (!btn) return;
      this.handleResultAction(btn.dataset.result);
    });

    document.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        if (!$('#overlay-help').classList.contains('hidden')) { $('#overlay-help').classList.add('hidden'); return; }
        if (!$('#overlay-confirm').classList.contains('hidden')) { $('#overlay-confirm').classList.add('hidden'); return; }
        if (this.activeScreen) this.closeScreen();
      }
    });
  }

  initAudio() {
    this.audio.init();
    this.audio.setSettings(this.save.data.settings.sound, this.save.data.settings.music);
    if (this.save.data.settings.music) this.audio.startMusic();
  }
  applyAudioSettings() {
    this.audio.setSettings(this.save.data.settings.sound, this.save.data.settings.music);
  }

  /* ---------- navigation ---------- */
  openScreen(name) {
    this.activeScreen = name;
    $('#menu-ui').classList.add('hidden');
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $(`#screen-${name}`);
    if (el) el.classList.add('active');
    this.game.setShowcaseMode(name === 'garage' || name === 'upgrades' ? name : 'menu');
    if (name === 'fly') { this.renderFly(); }
    if (name === 'garage') { this.garagePlane = this.save.data.selectedPlane; this.game.setShowcasePlane(this.garagePlane); this.renderGarage(); }
    if (name === 'upgrades') { this.game.setShowcasePlane(this.save.data.selectedPlane); this.renderUpgrades(); }
    if (name === 'missions') { this.renderMissions(); }
    if (name === 'settings') { this.renderSettings(); }
    this.refreshWallets();
  }
  closeScreen() {
    if (this.routeUnlocked(this.save.data.selectedRoute)) this.selectedRoute = this.save.data.selectedRoute;
    this.activeScreen = null;
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#menu-ui').classList.remove('hidden');
    this.game.setShowcaseMode('menu');
    this.game.setShowcasePlane(this.save.data.selectedPlane);
    this.refreshWallets();
    this.renderMenu();
  }

  refreshWallets() {
    const d = this.save.data;
    const lvl = levelFromXp(d.xp);
    $$('[data-coins]').forEach(el => el.textContent = fmt(d.coins));
    $$('[data-tech]').forEach(el => el.textContent = fmt(d.tech));
    $('#menu-coins').textContent = fmt(d.coins);
    $('#menu-tech').textContent = fmt(d.tech);
    $('#menu-level').textContent = lvl;
  }

  renderMenu() {
    const d = this.save.data;
    const def = planeById(d.selectedPlane);
    const lvl = levelFromXp(d.xp);
    const xpA = xpForLevel(lvl);
    const xpB = xpForLevel(Math.min(lvl + 1, 25)) || xpA + 1;
    const pct = Math.max(0, Math.min(100, ((d.xp - xpA) / Math.max(1, xpB - xpA)) * 100));
    $('#menu-xp').style.width = pct + '%';
    $('#menu-plane-tier').textContent = 'T' + def.tier;
    $('#menu-plane-name').textContent = def.name;
    $('#menu-plane-role').textContent = `${def.role} · ${def.era}`;
    const st = planeStats(def, this.save.upgradesFor(def.id));
    const bars = $$('#menu-selected-plane .sp-bar i');
    if (bars.length >= 3) {
      bars[0].style.setProperty('--v', st.raw.speed.toFixed(2));
      bars[1].style.setProperty('--v', st.raw.handling.toFixed(2));
      bars[2].style.setProperty('--v', st.raw.fuel.toFixed(2));
    }
    $('#menu-rank').textContent = this.rankName(lvl);
    const stars = Object.keys(d.stars).length;
    $('#menu-routes').textContent = `${stars} / 6`;
    $('#menu-fleet').textContent = `${d.unlockedPlanes.length} / 8`;

    let route = routeById(d.selectedRoute);
    if (!this.routeUnlocked(route.id)) route = routeById(this.firstUnlockedRoute());
    $('#menu-route-name').textContent = route.name;
    $('#menu-route-sub').textContent = `${route.region} · ${route.rings} rings`;
  }

  /* ---------- FLY ---------- */
  renderFly() {
    const list = $('#route-list');
    list.innerHTML = ROUTES.map((r, i) => {
      const unlocked = this.routeUnlocked(r.id);
      const stars = this.save.data.stars[r.id] || 0;
      const active = r.id === this.selectedRoute;
      const art = `linear-gradient(120deg, ${r.theme.skyTop}, ${r.theme.skyBottom} 58%, ${r.theme.water})`;
      return `<button class="route-card ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-route="${r.id}" style="--art:${art}">
        <span class="route-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="route-info"><b>${r.name}</b><span>${r.region}</span></span>
        <span class="route-side">
          <span class="route-stars">${[1,2,3].map(s => `<svg class="${s <= stars ? 'on' : ''}"><use href="#i-star"/></svg>`).join('')}</span>
          <small>${unlocked ? `${r.rings} RINGS · ${fmt(r.baseReward)} COINS` : 'LOCKED'}</small>
          ${unlocked ? '' : '<span class="lock-mini"><svg><use href="#i-lock"/></svg></span>'}
        </span>
      </button>`;
    }).join('');
    this.renderFlyDetail();
  }

  renderFlyDetail() {
    const r = routeById(this.selectedRoute);
    const unlocked = this.routeUnlocked(r.id);
    const stars = this.save.data.stars[r.id] || 0;
    const art = `linear-gradient(155deg, ${r.theme.skyTop}, ${r.theme.skyBottom} 60%, ${r.theme.land})`;
    $('#fd-art').style.background = art;
    $('#fd-region').textContent = r.region.toUpperCase();
    $('#fd-name').textContent = r.name;
    $('#fd-lvl').textContent = `LV ${r.level} REC.`;
    $('#fd-desc').textContent = r.desc;
    const dist = Math.round(Math.abs(r.destZ) / 100);
    $('#fd-meta').innerHTML = `
      <span>${r.rings} RINGS</span><span>${dist} KM</span><span>${fmt(r.baseReward)} BONUS</span>
      <span>${[1,2,3].map(s => s <= stars ? '★' : '☆').join('')}</span>`;
    const claims = this.save.data.missionClaims[r.id] || {};
    $('#fd-missions').innerHTML = (MISSIONS[r.id] || []).map(m => {
      const done = !!claims[m.id];
      return `<div class="fd-mission ${done ? 'done' : ''}">${icon(m.icon)}<span><b>${m.name}</b> — ${m.desc}</span><span class="fdm-reward">+${fmt(m.reward)}</span></div>`;
    }).join('');
    const btn = $('#btn-launch');
    btn.disabled = !unlocked;
    btn.innerHTML = unlocked
      ? `START FLIGHT ${icon('play')}`
      : `${icon('lock')} COMPLETE PREVIOUS ROUTE`;
  }

  launchSelected() {
    if (!this.routeUnlocked(this.selectedRoute)) {
      this.toast('Finish the previous route to unlock this airport', 'warn');
      this.audio.warn();
      return;
    }
    this.launchRoute(this.selectedRoute);
  }

  launchRoute(routeId, skipTutorial = false) {
    const d = this.save.data;
    if (!this.routeUnlocked(routeId)) return;
    this.selectedRoute = routeId;
    if (!d.unlockedPlanes.includes(d.selectedPlane)) {
      this.toast('Select an owned aircraft in the Garage first', 'warn');
      return;
    }
    this.audio.init();
    this.audio.setSettings(d.settings.sound, d.settings.music);
    if (d.settings.tutorial && !skipTutorial) {
      this.pendingLaunch = routeId;
      $('#overlay-tutorial').classList.remove('hidden');
      return;
    }
    this.activeScreen = null;
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#menu-ui').classList.add('hidden');
    $('#overlay-tutorial').classList.add('hidden');
    $('#overlay-result').classList.add('hidden');
    $('#overlay-pause').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    this.game.startFlight(routeId);
    this.refreshWallets();
  }

  /* ---------- GARAGE ---------- */
  renderGarage() {
    const d = this.save.data;
    const def = planeById(this.garagePlane);
    const owned = d.unlockedPlanes.includes(def.id);
    const selected = d.selectedPlane === def.id;
    const up = this.save.upgradesFor(def.id);
    const st = planeStats(def, up);
    const ups = totalUpgradeLevels(up);
    const lvl = levelFromXp(d.xp);
    const prevDef = PLANES[def.tier - 2];
    const prevUp = prevDef ? this.save.upgradesFor(prevDef.id) : null;
    const canEvolve = prevDef && !owned && prevUp && Object.values(prevUp).every(v => v >= MAX_UP) && d.coins >= evolvePrice(def) && lvl >= def.minLevel;

    let actions = '';
    if (owned) {
      if (selected) {
        actions = `<button class="btn primary wide" disabled>${icon('check')} SELECTED AIRCRAFT</button>`;
      } else {
        actions = `<button class="btn primary wide" data-action="select">SELECT AIRCRAFT ${icon('play')}</button>`;
      }
      actions += `<button class="btn ghost wide" data-action="upgrades">${icon('upgrade')} TUNE IN AERO LAB</button>`;
    } else {
      const affordable = d.coins >= def.price;
      const levelOk = lvl >= def.minLevel;
      actions = `<button class="btn primary wide" data-action="buy" ${affordable && levelOk ? '' : 'disabled'}>
        ${levelOk ? `UNLOCK · ${icon('coin')} ${fmt(def.price)}` : `${icon('lock')} NEED PILOT LEVEL ${def.minLevel}`}
      </button>`;
      if (prevDef) {
        actions += `<button class="btn ghost wide" data-action="evolve" ${canEvolve ? '' : 'disabled'}>
          ${icon('evolve')} EVOLVE FROM ${prevDef.name.toUpperCase()}${canEvolve ? ` · ${fmt(evolvePrice(def))}` : ''}
        </button>`;
      }
    }

    $('#garage-info').innerHTML = `
      <div class="gi-head">
        <div class="gi-tier"><span>TIER ${def.tier}</span><em>${def.role.toUpperCase()} · ${def.era}</em></div>
        <h3>${def.name}</h3>
        <p>${def.desc}</p>
      </div>
      <div class="gi-stats">
        ${this.statLine('Top Speed', st.raw.speed)}
        ${this.statLine('Handling', st.raw.handling)}
        ${this.statLine('Fuel Economy', st.raw.fuel)}
        ${this.statLine('Acceleration', st.raw.accel)}
      </div>
      <div class="gi-body">
        <div class="gi-note">${icon('star')} ${owned ? `${ups} / 20 upgrade points installed` : `Locked · reach pilot level ${def.minLevel}`}</div>
        <div class="gi-actions">${actions}</div>
        ${!owned && prevDef ? `<div class="gi-lock">Evolve requires ${prevDef.name} with all four systems at level 5.</div>` : ''}
      </div>`;

    $('#garage-count').textContent = `${d.unlockedPlanes.length} / ${PLANES.length}`;
    $('#plane-list').innerHTML = PLANES.map(p => {
      const isOwned = d.unlockedPlanes.includes(p.id);
      const isSel = d.selectedPlane === p.id;
      const isView = this.garagePlane === p.id;
      return `<button class="plane-item ${isView ? 'active' : ''} ${isOwned ? '' : 'locked'}" data-plane="${p.id}">
        <span class="pi-thumb">${icon(isOwned ? 'plane' : 'lock')}</span>
        <span class="pi-info"><b>${p.name}</b><span>${p.role}</span></span>
        <span class="pi-side">
          <span class="mini-tier">T${p.tier}</span>
          ${isSel ? '<span style="color:var(--green)">ACTIVE</span>' : isOwned ? '<span>OWNED</span>' : `<span>${fmt(p.price)}</span>`}
        </span>
      </button>`;
    }).join('');
    this.refreshWallets();
  }

  statLine(label, value) {
    return `<div class="stat-line"><span>${label}</span><span class="stat-track"><i style="width:${Math.round(value * 100)}%"></i></span><b>${Math.round(value * 100)}</b></div>`;
  }

  handleGarageAction(action) {
    const d = this.save.data;
    const def = planeById(this.garagePlane);
    const lvl = levelFromXp(d.xp);
    if (action === 'select') {
      if (!d.unlockedPlanes.includes(def.id)) return;
      d.selectedPlane = def.id;
      this.save.save();
      this.game.setShowcasePlane(def.id);
      this.audio.click();
      this.toast(`${def.name} is now your active aircraft`, 'good');
      this.renderGarage();
      this.renderMenu();
      this.renderUpgrades();
      return;
    }
    if (action === 'upgrades') {
      this.audio.click();
      this.openScreen('upgrades');
      return;
    }
    if (action === 'buy') {
      if (d.unlockedPlanes.includes(def.id)) return;
      if (lvl < def.minLevel) { this.toast(`Reach pilot level ${def.minLevel} to unlock`, 'warn'); return; }
      if (d.coins < def.price) { this.toast('Not enough coins — fly another route!', 'warn'); this.audio.warn(); return; }
      d.coins -= def.price;
      d.unlockedPlanes.push(def.id);
      d.selectedPlane = def.id;
      this.save.save();
      this.audio.unlock();
      this.toast(`${def.name} unlocked and ready for takeoff`, 'good');
      this.game.setShowcasePlane(def.id);
      this.renderGarage(); this.renderMenu(); this.renderUpgrades(); this.refreshWallets();
      return;
    }
    if (action === 'evolve') {
      const prevDef = PLANES[def.tier - 2];
      if (!prevDef) return;
      const prevUp = this.save.upgradesFor(prevDef.id);
      const ready = Object.values(prevUp).every(v => v >= MAX_UP);
      const cost = evolvePrice(def);
      if (!ready) { this.toast(`${prevDef.name} must be fully upgraded first`, 'warn'); return; }
      if (lvl < def.minLevel) { this.toast(`Reach pilot level ${def.minLevel} to evolve`, 'warn'); return; }
      if (d.coins < cost) { this.toast('Not enough coins for evolution', 'warn'); this.audio.warn(); return; }
      d.coins -= cost;
      d.unlockedPlanes.push(def.id);
      d.selectedPlane = def.id;
      d.upgrades[def.id] = { speed: 1, handling: 1, fuel: 1, accel: 1 };
      d.stats.evolutions = (d.stats.evolutions || 0) + 1;
      this.save.save();
      this.audio.unlock();
      this.toast(`EVOLUTION COMPLETE — ${def.name} joins the fleet`, 'good');
      this.garagePlane = def.id;
      this.game.setShowcasePlane(def.id);
      this.renderGarage(); this.renderMenu(); this.renderUpgrades(); this.refreshWallets();
    }
  }

  /* ---------- UPGRADES ---------- */
  renderUpgrades() {
    const d = this.save.data;
    const def = planeById(d.selectedPlane);
    const up = this.save.upgradesFor(def.id);
    const st = planeStats(def, up);
    const lvl = levelFromXp(d.xp);
    const rows = UPGRADE_KEYS.map(u => {
      const level = up[u.key] || 0;
      const cost = upgradeCost(def, level);
      const tech = upgradeTech(level + 1);
      const maxed = level >= MAX_UP;
      const canAfford = d.coins >= cost && d.tech >= tech;
      const iconId = u.key === 'speed' ? 'i-boost' : u.key === 'accel' ? 'i-upgrade' : u.key === 'handling' ? 'i-wings' : 'i-fuel';
      return `<div class="up-row ${maxed ? 'maxed' : ''}">
        <span class="up-ico"><svg><use href="#${iconId}"/></svg></span>
        <span class="up-mid">
          <span class="up-name">${u.name}<em>${maxed ? 'MAX' : `LV ${level}/${MAX_UP}`}</em></span>
          <span class="pips">${Array.from({ length: MAX_UP }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</span>
        </span>
        ${maxed ? `<span class="up-buy" style="opacity:.6">MAX</span>` : `<button class="up-buy" data-up="${u.key}" ${canAfford ? '' : 'disabled'}>
          ${icon('coin')} ${fmt(cost)}${tech ? `<small>+ ${tech} TECH</small>` : '<small>UPGRADE</small>'}
        </button>`}
      </div>`;
    }).join('');
    const allMax = UPGRADE_KEYS.every(u => (up[u.key] || 0) >= MAX_UP);
    const nextDef = PLANES[def.tier];
    $('#upgrade-panel').innerHTML = `
      <div class="up-head"><h3>${def.name}</h3><span>TIER ${def.tier} · ${totalUpgradeLevels(up)} / 20 POINTS</span></div>
      <div class="up-rows">${rows}</div>
      <div class="up-foot">
        <div class="gi-note">${icon('coin')} Upgrades cost coins and tech cores. Tech is collected in flight.</div>
      </div>`;
    $('#upgrade-plane-label').textContent = def.name.toUpperCase();
    $('#perf-panel').innerHTML = `
      <div class="panel-head"><h3>Performance</h3><span>LV ${lvl}</span></div>
      <div class="perf-bars">
        ${this.perfRow('Top Speed', st.speed * 3.1, 420, `${Math.round(st.speed * 3.1)} KM/H`)}
        ${this.perfRow('Handling', st.handling * 100, 200, `${Math.round(st.handling * 100)}%`)}
        ${this.perfRow('Fuel Range', (2.2 - st.fuelEconomy) * 62, 100, `${Math.round((2.2 - st.fuelEconomy) * 62)} KM`)}
        ${this.perfRow('Acceleration', st.accel * 100, 100, `${Math.round(st.accel * 100)}%`)}
      </div>
      <div class="perf-summary">
        <h4>Flight Notes</h4>
        <p>${def.role} airframe. ${allMax ? 'All systems are maxed out — this aircraft is ready to evolve.' : 'Install upgrades to push speed, agility, economy, and acceleration higher.'}</p>
      </div>
      ${nextDef ? `<div class="evo-card">
        <b>${allMax ? 'EVOLUTION READY' : 'EVOLUTION PATH'}</b>
        <p>${allMax ? `All four systems maxed. Visit the Garage to evolve into the ${nextDef.name} at half price.` : `Max all four systems to unlock a discounted evolution into the ${nextDef.name}.`}</p>
        <div class="evo-pips">${Array.from({ length: 4 }, (_, i) => `<i class="${(up[UPGRADE_KEYS[i].key] || 0) >= MAX_UP ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn ghost small ui-block" data-nav="garage">OPEN GARAGE</button>
      </div>` : ''}`;
    this.refreshWallets();
  }
  perfRow(label, value, max, text) {
    const pct = Math.max(4, Math.min(100, value / max * 100));
    return `<div class="perf-row"><div class="pl"><b>${label}</b><span>${text}</span></div><div class="perf-track"><i style="width:${pct}%"></i></div></div>`;
  }

  buyUpgrade(key) {
    const d = this.save.data;
    const def = planeById(d.selectedPlane);
    const up = this.save.upgradesFor(def.id);
    const level = up[key] || 0;
    if (level >= MAX_UP) return;
    const cost = upgradeCost(def, level);
    const tech = upgradeTech(level + 1);
    if (d.coins < cost) { this.toast('Not enough coins', 'warn'); this.audio.warn(); return; }
    if (d.tech < tech) { this.toast(`Need ${tech} more tech core${tech > 1 ? 's' : ''}`, 'warn'); this.audio.warn(); return; }
    d.coins -= cost;
    d.tech -= tech;
    up[key] = level + 1;
    this.save.save();
    this.audio.upgrade();
    this.toast(`${UPGRADE_KEYS.find(u => u.key === key).name} upgraded to level ${level + 1}`, 'good');
    this.renderUpgrades(); this.renderGarage(); this.renderMenu(); this.refreshWallets();
  }

  /* ---------- MISSIONS ---------- */
  renderMissions() {
    const d = this.save.data;
    const route = routeById(this.missionRoute);
    if (!this.routeUnlocked(route.id)) this.missionRoute = this.firstUnlockedRoute();
    const active = routeById(this.missionRoute);
    $('#mission-route-label').textContent = active.name.toUpperCase();
    $('#mission-tabs').innerHTML = ROUTES.map(r => {
      const unlocked = this.routeUnlocked(r.id);
      return `<button class="mission-tab ${r.id === this.missionRoute ? 'active' : ''}" data-mroute="${r.id}" ${unlocked ? '' : 'style="opacity:.4"'}>${r.name.split(' ')[0]}</button>`;
    }).join('');
    const claims = d.missionClaims[active.id] || {};
    $('#mission-list').innerHTML = (MISSIONS[active.id] || []).map(m => {
      const done = !!claims[m.id];
      return `<div class="mission-card ${done ? 'done' : ''}">
        <span class="mission-ico">${icon(m.icon)}</span>
        <span class="mission-main">
          <b>${m.name}</b>
          <p>${m.desc}</p>
          <span class="mission-progress"><span class="mp-track"><i style="width:${done ? 100 : 6}%"></i></span><span>${done ? 'COMPLETE' : 'IN PROGRESS'}</span></span>
        </span>
        <span class="mission-reward">${icon('coin')} ${fmt(m.reward)}${m.tech ? ` +${m.tech}T` : ''}</span>
      </div>`;
    }).join('') + `<button class="btn ghost wide ui-block" id="mission-fly-btn" style="margin-top:4px">FLY THIS ROUTE ${icon('play')}</button>`;
    const flyBtn = $('#mission-fly-btn');
    if (flyBtn) flyBtn.onclick = () => { this.selectedRoute = active.id; this.audio.click(); this.openScreen('fly'); };
    const achs = ACHIEVEMENTS;
    const stats = {
      coins: d.stats.coins, rings: d.stats.rings, landings: d.stats.landings,
      perfectLandings: d.stats.perfectLandings, planes: d.unlockedPlanes.length,
      evolutions: d.stats.evolutions, routesCompleted: Object.keys(d.stars).length, flights: d.stats.flights
    };
    const unlockedCount = achs.filter(a => d.achievements[a.id]).length;
    $('#ach-count').textContent = `${unlockedCount} / ${achs.length}`;
    $('#ach-list').innerHTML = achs.map(a => {
      const val = stats[a.stat] || 0;
      const on = val >= a.target;
      return `<div class="ach-card ${on ? 'on' : ''}">
        <span class="ach-ico">${icon(a.icon)}</span>
        <span class="ach-copy"><b>${a.name}</b><span>${a.desc} · ${Math.min(val, a.target)}/${a.target}</span></span>
      </div>`;
    }).join('');
    $('#career-stats').innerHTML = `
      <div><b>${fmt(stats.flights)}</b><span>FLIGHTS</span></div>
      <div><b>${fmt(stats.landings)}</b><span>LANDINGS</span></div>
      <div><b>${fmt(stats.rings)}</b><span>RINGS</span></div>
      <div><b>${fmt(stats.coins)}</b><span>COINS</span></div>
      <div><b>${fmt(stats.perfectLandings)}</b><span>PERFECT</span></div>
      <div><b>${fmt(stats.evolutions)}</b><span>EVOLUTIONS</span></div>`;
  }

  /* ---------- SETTINGS ---------- */
  renderSettings() {
    const s = this.save.data.settings;
    const d = this.save.data;
    $('#set-sound').checked = !!s.sound;
    $('#set-music').checked = !!s.music;
    $$('#quality-seg button').forEach(b => b.classList.toggle('active', b.dataset.q === s.quality));
    $('#settings-data').innerHTML = `
      <div><b>${fmt(d.stats.flights)}</b><span>Flights</span></div>
      <div><b>${fmt(d.stats.landings)}</b><span>Landings</span></div>
      <div><b>${fmt(d.stats.rings)}</b><span>Rings passed</span></div>
      <div><b>${fmt(d.stats.coins)}</b><span>Coins collected</span></div>
      <div><b>${Math.round(d.stats.distance / 100)}</b><span>Km flown</span></div>
      <div><b>${Object.keys(d.stars).length} / 6</b><span>Routes</span></div>`;
  }

  resetProgress() {
    this.save.reset();
    this.selectedRoute = 'coast';
    this.garagePlane = 'bushhawk';
    this.missionRoute = 'coast';
    $('#overlay-confirm').classList.add('hidden');
    this.game.setShowcasePlane('bushhawk');
    this.game.setShowcaseMode('menu');
    this.renderMenu(); this.renderGarage(); this.renderUpgrades(); this.renderMissions(); this.renderSettings(); this.refreshWallets();
    this.toast('Progress reset — a fresh logbook awaits', 'gold');
    this.audio.back();
  }

  /* ---------- FLIGHT EVENTS ---------- */
  onFlightStart() {
    $('#hud').classList.remove('hidden');
    $('#menu-ui').classList.add('hidden');
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#overlay-result').classList.add('hidden');
    $('#overlay-pause').classList.add('hidden');
    this.activeScreen = null;
    this.hudCache = { speed: -1, alt: -1, fuel: -1, throttle: -1, coins: -1, tech: -1, ring: -1, targetDist: -1, angle: 0 };
    const hud = this.game.getHUD();
    if (hud) this.buildHudMissions(hud);
    $('#hud-route-name').textContent = this.game.route.name;
    $('#btn-boost').classList.remove('active');
    $('#btn-brake').classList.remove('active');
    $('#hud').classList.remove('hidden');
  }

  buildHudMissions(hud) {
    const wrap = $('#hud-missions');
    wrap.innerHTML = hud.missionProgress.map(m => `<div class="hud-mission-row" data-m="${m.id}">${icon(m.icon)}<span>${m.name}</span><span class="hm-val">0/${m.target}</span></div>`).join('');
    this.hudMissionEls = $$('.hud-mission-row', wrap);
  }

  onRing(r) {
    this.showBanner(`RING ${r.index} / ${r.total}`, 'good');
  }

  showCountdown(n) {
    const el = $('#countdown');
    if (n <= 0) {
      if (el.dataset.go === '1') return;
      el.dataset.go = '1';
      el.textContent = 'GO';
      el.classList.remove('hidden');
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'countPop .55s ease both';
      setTimeout(() => el.classList.add('hidden'), 700);
      return;
    }
    el.dataset.go = '0';
    el.textContent = n;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'countPop .5s ease both';
    this.audio.tone(420, 0.1, 'sine', 0.07);
  }

  showBanner(text, kind = 'info') {
    const el = $('#hud-banner');
    el.textContent = text;
    el.className = `hud-banner ${kind === 'info' ? '' : kind}`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'bannerIn .3s ease both';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.add('hidden'), 2300);
  }

  showPickup(p) {
    const feed = $('#pickup-feed');
    const div = document.createElement('div');
    div.className = `pickup-item ${p.type}`;
    div.textContent = p.text;
    feed.appendChild(div);
    setTimeout(() => div.remove(), 1000);
    while (feed.children.length > 4) feed.firstChild.remove();
  }

  toast(text, kind = '') {
    const wrap = $('#toasts');
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.textContent = text;
    wrap.appendChild(div);
    setTimeout(() => {
      div.style.transition = 'opacity .3s, transform .3s';
      div.style.opacity = '0';
      div.style.transform = 'translateX(20px)';
      setTimeout(() => div.remove(), 320);
    }, 2600);
    while (wrap.children.length > 4) wrap.firstChild.remove();
  }

  togglePause(force) {
    if (this.game.state !== 'flight') return;
    const target = typeof force === 'boolean' ? force : !this.game.paused;
    this.game.setPaused(target);
    if (target) {
      const hud = this.game.getHUD();
      $('#pause-stats').innerHTML = `
        <div><b>${fmt(hud.speed)}</b><span>KM/H</span></div>
        <div><b>${hud.rings}/${hud.ringsTotal}</b><span>RINGS</span></div>
        <div><b>${fmt(hud.coinPickups * 8 + hud.rings * 15)}</b><span>COINS</span></div>
        <div><b>${Math.round(hud.fuel)}%</b><span>FUEL</span></div>`;
      $('#overlay-pause').classList.remove('hidden');
      this.audio.back();
    } else {
      $('#overlay-pause').classList.add('hidden');
      this.audio.click();
    }
  }

  onQuit() {
    $('#hud').classList.add('hidden');
    $('#overlay-pause').classList.add('hidden');
    $('#overlay-result').classList.add('hidden');
    $('#menu-ui').classList.remove('hidden');
    this.closeScreen();
  }

  updateHud() {
    if (this.game.state !== 'flight') return;
    const hud = this.game.getHUD();
    if (!hud) return;
    const c = this.hudCache;
    if (hud.speed !== c.speed) {
      $('#hud-speed').textContent = hud.speed;
      $('#speedo').style.setProperty('--p', Math.min(1, hud.speed / Math.max(1, hud.maxSpeed)).toFixed(3));
      c.speed = hud.speed;
    }
    if (hud.altitude !== c.alt) { $('#hud-alt').textContent = `${fmt(hud.altitude)} m`; c.alt = hud.altitude; }
    if (Math.abs(hud.fuel - c.fuel) > 0.4) {
      const pct = Math.max(0, hud.fuel);
      const fill = $('#hud-fuel-fill');
      fill.style.width = pct + '%';
      fill.classList.toggle('low', pct < 22);
      $('#hud-fuel-label').textContent = `FUEL ${Math.round(pct)}%`;
      c.fuel = hud.fuel;
    }
    if (Math.abs(hud.throttle - c.throttle) > 0.02) {
      $('#hud-throttle-fill').style.width = Math.round(hud.throttle * 100) + '%';
      c.throttle = hud.throttle;
    }
    if (hud.coins !== c.coins) { $('#hud-coins').textContent = fmt(hud.coins); c.coins = hud.coins; }
    if (hud.techPickups !== c.tech) { $('#hud-tech').textContent = hud.techPickups; c.tech = hud.techPickups; }
    if (hud.rings !== c.ring) {
      $('#hud-ring-count').textContent = `${hud.rings} / ${hud.ringsTotal} RINGS`;
      $('#hud-ring-fill').style.width = Math.round(hud.progress * 100) + '%';
      $('#hud-phase').textContent = this.phaseLabel(hud.phase);
      c.ring = hud.rings;
    }
    const arrow = $('#target-arrow');
    const deg = -hud.targetAngle * 180 / Math.PI;
    arrow.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    if (hud.targetDist !== c.targetDist) {
      $('#target-dist').textContent = hud.targetDist > 999 ? `${(hud.targetDist / 1000).toFixed(1)} km` : `${hud.targetDist} m`;
      $('#target-label').textContent = hud.landingPhase ? 'RUNWAY' : 'NEXT RING';
      $('#hud-target').classList.toggle('off', hud.offCourse);
      c.targetDist = hud.targetDist;
    }
    if (hud.boost) $('#btn-boost').classList.add('active'); 
    if (this.hudMissionEls.length) {
      hud.missionProgress.forEach((m, i) => {
        const el = this.hudMissionEls[i];
        if (!el) return;
        el.classList.toggle('done', m.complete);
        const v = el.querySelector('.hm-val');
        if (v && v.textContent !== `${m.val}/${m.target}`) v.textContent = `${m.val}/${m.target}`;
      });
    }
  }

  phaseLabel(phase) {
    return {
      ready: 'ENGINE START', takeoff: 'TAKEOFF', climb: 'CLIMBING',
      cruise: 'CRUISE', approach: 'FINAL APPROACH', landed: 'LANDED', crashed: 'CRASHED'
    }[phase] || phase.toUpperCase();
  }

  /* ---------- RESULT ---------- */
  showResult(result) {
    $('#hud').classList.add('hidden');
    const prevLvl = levelFromXp(this.save.data.xp - result.xp);
    const levelUp = result.newLevel > prevLvl;
    const stars = [1, 2, 3].map(i => `<span class="rs ${i <= result.stars ? 'on' : ''}">${icon('star')}</span>`).join('');
    const missionRows = result.missions.map(m => `
      <div class="result-mission ${m.complete ? 'done' : ''}">
        ${icon(m.complete ? 'check' : m.icon)}
        <span>${m.name} <small style="color:var(--dim)">${m.val}/${m.target}</small></span>
        <span class="rm-reward">${m.complete ? `+${fmt(m.reward)}` : ''}</span>
      </div>`).join('');
    const achRows = result.achievements.map(a => `<span>${icon(a.icon)} ${a.name}</span>`).join('');
    const actions = result.success
      ? `${result.nextRoute ? `<button class="btn primary" data-result="next">NEXT ROUTE ${icon('play')}</button>` : ''}
         <button class="btn ghost" data-result="retry">FLY AGAIN</button>
         <button class="btn ghost" data-result="hangar">HANGAR</button>`
      : `<button class="btn primary" data-result="retry">TRY AGAIN ${icon('play')}</button>
         <button class="btn ghost" data-result="hangar">HANGAR</button>`;
    $('#result-card').innerHTML = `
      <div class="result-head ${result.success ? '' : 'fail'}">
        <span class="overlay-kicker">${result.success ? 'FLIGHT COMPLETE' : 'FLIGHT REPORT'}</span>
        <div class="result-stars">${stars}</div>
        <div class="result-title">${result.success ? (result.perfect ? 'BUTTER <span>LANDING</span>' : 'TOUCHDOWN AT <span>'+result.routeName.toUpperCase()+'</span>') : 'MISSION <span>ABORTED</span>'}</div>
        <div class="result-sub">${result.success ? `${result.routeName} · ${result.perfect ? 'PERFECT' : Math.round(result.quality * 100) + '%'} LANDING` : result.reason || 'The aircraft could not complete the route'}</div>
        ${levelUp ? `<div class="result-levelup">${icon('upgrade')} PILOT LEVEL ${result.newLevel} REACHED</div>` : ''}
      </div>
      <div class="result-body">
        <div class="result-rewards">
          <div class="reward"><b>${icon('coin')} ${fmt(result.coins)}</b><span>Coins earned</span></div>
          <div class="reward"><b>${fmt(result.xp)}</b><span>Pilot XP</span></div>
          <div class="reward"><b>${result.rings}/${result.ringsTotal}</b><span>Rings passed</span></div>
        </div>
        <div class="result-stats">
          <span>${result.coinPickups} coins collected</span>
          <span>${result.fuelPickups} fuel cells</span>
          <span>${result.techPickups} tech cores</span>
          <span>Landing ${Math.round(result.quality * 100)}%</span>
          <span>${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')} flight time</span>
        </div>
        ${missionRows ? `<div class="result-missions">${missionRows}</div>` : ''}
        ${achRows ? `<div class="result-ach">${achRows}</div>` : ''}
        ${result.success && result.nextRoute ? `<div class="result-next">${icon('check')} New airport unlocked — ${routeById(result.nextRoute).name}</div>` : ''}
        <div class="result-actions">${actions}</div>
      </div>`;
    $('#overlay-result').classList.remove('hidden');
    if (result.success) this.audio.mission(); else this.audio.warn();
    this.game.setPaused(true);
    this.result = result;
  }

  handleResultAction(action) {
    const result = this.result;
    if (!result) return;
    this.audio.click();
    if (action === 'retry') {
      $('#overlay-result').classList.add('hidden');
      this.launchRoute(result.route, true);
    } else if (action === 'hangar') {
      $('#overlay-result').classList.add('hidden');
      this.game.quitFlight();
    } else if (action === 'next' && result.nextRoute) {
      $('#overlay-result').classList.add('hidden');
      this.launchRoute(result.nextRoute, true);
    }
  }
}
