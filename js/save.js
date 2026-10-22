import { GAME_VERSION, PLANES } from './config.js';

const KEY = 'aero-evolution-save-v3';

export const DEFAULT_SAVE = {
  version: GAME_VERSION,
  coins: 650,
  tech: 2,
  xp: 0,
  selectedPlane: 'bushhawk',
  selectedRoute: 'coast',
  unlockedPlanes: ['bushhawk'],
  upgrades: {},
  routeUnlocks: { coast: true },
  stars: {},
  missionClaims: {},
  achievements: {},
  settings: { sound: true, music: true, quality: 'auto', tutorial: true },
  stats: { coins: 0, rings: 0, flights: 0, landings: 0, perfectLandings: 0, fuel: 0, tech: 0, evolutions: 0, routesCompleted: 0, distance: 0 },
  best: {},
  createdAt: Date.now()
};

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(patch)) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], patch[k]);
    } else out[k] = patch[k];
  }
  return out;
}

export class SaveManager {
  constructor() {
    this.data = this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw);
      const data = deepMerge(structuredClone(DEFAULT_SAVE), parsed);
      data.version = GAME_VERSION;
      if (!data.unlockedPlanes.includes('bushhawk')) data.unlockedPlanes.unshift('bushhawk');
      if (!data.routeUnlocks.coast) data.routeUnlocks.coast = true;
      if (!PLANES.some(p => p.id === data.selectedPlane)) data.selectedPlane = 'bushhawk';
      return data;
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {}
  }
  reset() {
    this.data = structuredClone(DEFAULT_SAVE);
    this.save();
  }
  planeName(id) {
    return PLANES.find(p => p.id === id)?.name || 'Aircraft';
  }
  upgradesFor(id) {
    if (!this.data.upgrades[id]) this.data.upgrades[id] = { speed: 0, handling: 0, fuel: 0, accel: 0 };
    return this.data.upgrades[id];
  }
}
