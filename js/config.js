export const GAME_VERSION = 3;

export const PLANES = [
  {
    id: 'bushhawk', name: 'Bush Hawk', tier: 1, price: 0, minLevel: 1,
    role: 'Vintage Prop', era: '1954',
    desc: 'A cheerful single-engine taildragger. Light on the stick and built for grass strips.',
    base: { speed: 0.38, handling: 0.68, fuel: 0.52, accel: 0.58 },
    visual: {
      kind: 'prop', fuselageLen: 7.4, fuselageR: 0.78, noseR: 0.62,
      body: '#f2e3bd', accent: '#e2662f', wingColor: '#f7f1de', trim: '#3b4750',
      wing: { span: 10.6, chord: 2.5, sweep: 0.2, dihedral: 0.1, y: 0.5, tip: 0.55, high: true },
      tail: { type: 'round', size: 1.0 },
      engines: [{ type: 'prop', x: 0, y: 0.02, z: -3.55, size: 0.7, blades: 2 }],
      gear: 'fixed', canopy: 'bubble', window: '#9fd6e8'
    }
  },
  {
    id: 'skycourier', name: 'Sky Courier', tier: 2, price: 1400, minLevel: 2,
    role: 'Sport Prop', era: '1968',
    desc: 'A slippery low-wing tourer with a three-blade prop and a taste for long coastlines.',
    base: { speed: 0.5, handling: 0.78, fuel: 0.6, accel: 0.68 },
    visual: {
      kind: 'prop', fuselageLen: 8.2, fuselageR: 0.72, noseR: 0.5,
      body: '#e9f7f6', accent: '#0f9f9b', wingColor: '#f7fbfa', trim: '#183c4b',
      wing: { span: 10.2, chord: 2.2, sweep: 0.35, dihedral: 0.06, y: -0.25, tip: 0.42, low: true },
      tail: { type: 'swept', size: 1.1 },
      engines: [{ type: 'prop', x: 0, y: 0.02, z: -4.0, size: 0.68, blades: 3 }],
      gear: 'retract', canopy: 'bubble', window: '#a9e7ef'
    }
  },
  {
    id: 'twinotter', name: 'Twin Otter', tier: 3, price: 4200, minLevel: 4,
    role: 'Utility Twin', era: '1976',
    desc: 'Two dependable engines, a roomy cabin, and enough lift to clear any ridge on the map.',
    base: { speed: 0.55, handling: 0.66, fuel: 0.78, accel: 0.7 },
    visual: {
      kind: 'prop', fuselageLen: 10.4, fuselageR: 1.02, noseR: 0.7,
      body: '#ffd95e', accent: '#df5b2a', wingColor: '#fff7df', trim: '#3d3a33',
      wing: { span: 15.2, chord: 2.9, sweep: 0.08, dihedral: 0.04, y: 0.65, tip: 0.7, high: true },
      tail: { type: 'twin', size: 1.15 },
      engines: [
        { type: 'prop', x: -3.7, y: 0.55, z: -2.2, size: 0.66, blades: 3 },
        { type: 'prop', x: 3.7, y: 0.55, z: -2.2, size: 0.66, blades: 3 }
      ],
      gear: 'fixed', canopy: 'airliner', window: '#9ed8e8'
    }
  },
  {
    id: 'jetsparrow', name: 'Jet Sparrow', tier: 4, price: 11000, minLevel: 6,
    role: 'Early Jet', era: '1982',
    desc: 'A silver dart from the first jet age. Swept wings, twin intakes, and a hungry afterburner.',
    base: { speed: 0.68, handling: 0.75, fuel: 0.66, accel: 0.8 },
    visual: {
      kind: 'jet', fuselageLen: 9.6, fuselageR: 0.82, noseR: 0.34,
      body: '#d9e2e8', accent: '#d33b3b', wingColor: '#c7d2da', trim: '#3d4a55',
      wing: { span: 9.4, chord: 2.8, sweep: 1.4, dihedral: 0.02, y: -0.15, tip: 0.22, low: true },
      tail: { type: 'swept', size: 1.25 },
      engines: [
        { type: 'jet', x: 0, y: 0.02, z: 3.2, size: 0.62, twin: true },
        { type: 'intake', x: -0.85, y: -0.05, z: -1.5, size: 0.4 },
        { type: 'intake', x: 0.85, y: -0.05, z: -1.5, size: 0.4 }
      ],
      gear: 'retract', canopy: 'fighter', window: '#7ed7ef', afterburner: true
    }
  },
  {
    id: 'cometliner', name: 'Comet Liner', tier: 5, price: 26000, minLevel: 8,
    role: 'Regional Jet', era: '1994',
    desc: 'The workhorse of the golden skyways. Efficient, smooth, and unmistakably a passenger jet.',
    base: { speed: 0.72, handling: 0.62, fuel: 0.86, accel: 0.75 },
    visual: {
      kind: 'jet', fuselageLen: 14.6, fuselageR: 1.1, noseR: 0.72,
      body: '#f6f9fc', accent: '#2563d8', wingColor: '#eef3f8', trim: '#26394d',
      wing: { span: 17.2, chord: 3.0, sweep: 1.5, dihedral: 0.05, y: -0.4, tip: 0.3, low: true },
      tail: { type: 'airliner', size: 1.35 },
      engines: [
        { type: 'jet', x: -4.4, y: -0.4, z: 0.4, size: 0.74, pod: true },
        { type: 'jet', x: 4.4, y: -0.4, z: 0.4, size: 0.74, pod: true }
      ],
      gear: 'retract', canopy: 'airliner', window: '#77c7ee', livery: true
    }
  },
  {
    id: 'falconx', name: 'Falcon X', tier: 6, price: 58000, minLevel: 11,
    role: 'Private Jet', era: '2008',
    desc: 'Carbon-black business jet with gold trim, T-tail, and a velvet-smooth cruise.',
    base: { speed: 0.83, handling: 0.74, fuel: 0.72, accel: 0.86 },
    visual: {
      kind: 'jet', fuselageLen: 12.2, fuselageR: 0.92, noseR: 0.5,
      body: '#20242d', accent: '#e2b45b', wingColor: '#2c323d', trim: '#c99a48',
      wing: { span: 14.4, chord: 2.5, sweep: 1.8, dihedral: 0.03, y: -0.3, tip: 0.26, low: true },
      tail: { type: 't', size: 1.2 },
      engines: [
        { type: 'jet', x: -1.25, y: 0.15, z: 2.7, size: 0.62 },
        { type: 'jet', x: 1.25, y: 0.15, z: 2.7, size: 0.62 }
      ],
      gear: 'retract', canopy: 'airliner', window: '#f0cf83', afterburner: true
    }
  },
  {
    id: 'horizon800', name: 'Horizon 800', tier: 7, price: 120000, minLevel: 14,
    role: 'Widebody', era: '2020',
    desc: 'A long-haul queen with four engines, a sunset livery, and room for the whole sky.',
    base: { speed: 0.88, handling: 0.6, fuel: 1.0, accel: 0.8 },
    visual: {
      kind: 'jet', fuselageLen: 18.4, fuselageR: 1.35, noseR: 0.9,
      body: '#fbfbff', accent: '#7a4dd6', wingColor: '#f2effa', trim: '#352a4d',
      wing: { span: 22.4, chord: 3.4, sweep: 1.9, dihedral: 0.05, y: -0.5, tip: 0.34, low: true },
      tail: { type: 'airliner', size: 1.55 },
      engines: [
        { type: 'jet', x: -5.6, y: -0.5, z: 0.5, size: 0.7, pod: true },
        { type: 'jet', x: -3.2, y: -0.5, z: 1.0, size: 0.7, pod: true },
        { type: 'jet', x: 3.2, y: -0.5, z: 1.0, size: 0.7, pod: true },
        { type: 'jet', x: 5.6, y: -0.5, z: 0.5, size: 0.7, pod: true }
      ],
      gear: 'retract', canopy: 'airliner', window: '#86b8f2', livery: true
    }
  },
  {
    id: 'aurorax', name: 'Aurora X', tier: 8, price: 250000, minLevel: 18,
    role: 'Hyperjet', era: '2045',
    desc: 'A blended-wing hyperjet with ion-assisted engines. The horizon is only the beginning.',
    base: { speed: 1.0, handling: 0.9, fuel: 0.9, accel: 0.95 },
    visual: {
      kind: 'jet', fuselageLen: 15.2, fuselageR: 1.0, noseR: 0.35,
      body: '#e9fbff', accent: '#00d9d0', wingColor: '#c9f5f3', trim: '#0b3a4a',
      wing: { span: 20.4, chord: 4.2, sweep: 2.6, dihedral: 0.02, y: -0.15, tip: 0.12, low: true, delta: true },
      tail: { type: 'twin', size: 0.9 },
      engines: [
        { type: 'jet', x: -1.45, y: 0.1, z: 3.0, size: 0.78, glow: true },
        { type: 'jet', x: 1.45, y: 0.1, z: 3.0, size: 0.78, glow: true }
      ],
      gear: 'retract', canopy: 'fighter', window: '#8ff5f2', afterburner: true, futuristic: true
    }
  }
];

export const UPGRADE_KEYS = [
  { key: 'speed', name: 'Engine', icon: 'engine', desc: 'Top speed and cruise thrust' },
  { key: 'accel', name: 'Throttle', icon: 'throttle', desc: 'Acceleration and boost response' },
  { key: 'handling', name: 'Airframe', icon: 'wing', desc: 'Turn rate and roll agility' },
  { key: 'fuel', name: 'Fuel Tank', icon: 'fuel', desc: 'Burn efficiency and range' }
];

export const ROUTES = [
  {
    id: 'coast', name: 'Coastal Haven', region: 'Seaside International', from: 'Haven Field', to: 'Coral Point',
    biome: 'coast', seed: 17, destX: 190, destZ: -2850, rings: 11, level: 1, baseReward: 320,
    desc: 'Warm updrafts, grass fields, and a glittering coastline. The perfect first route.',
    features: ['fields', 'ocean', 'trees', 'hills'],
    theme: {
      skyTop: '#2e7fd4', skyBottom: '#c5ecff', fog: '#b9e3f5', sun: '#fff1c9',
      land: '#6ea84f', landDark: '#4e853d', water: '#1f78a4', waterDeep: '#125f8c',
      sunPos: [-0.35, 0.55, 0.75], ambient: 0.65, clouds: 22, rain: false, dusk: false
    }
  },
  {
    id: 'alpine', name: 'Alpine Ridge', region: 'North Ridge Airfield', from: 'Pine Valley', to: 'Summit Gate',
    biome: 'alpine', seed: 43, destX: -230, destZ: -3100, rings: 12, level: 2, baseReward: 480,
    desc: 'Snow-capped peaks and tight valley turns. Watch your altitude on the ridge line.',
    features: ['mountains', 'snow', 'trees', 'hills'],
    theme: {
      skyTop: '#3f6fae', skyBottom: '#d9ecf7', fog: '#c9ddea', sun: '#fff4d6',
      land: '#5c8457', landDark: '#3f6644', water: '#2f6f8c', waterDeep: '#1b5470',
      sunPos: [0.45, 0.62, 0.5], ambient: 0.7, clouds: 30, rain: false, dusk: false
    }
  },
  {
    id: 'desert', name: 'Desert Mirage', region: 'Sirocco Airbase', from: 'Dune Field', to: 'Mirage Strip',
    biome: 'desert', seed: 71, destX: 280, destZ: -3050, rings: 12, level: 4, baseReward: 620,
    desc: 'Heat shimmer, red mesas, and long empty air. Keep the engine cool and the fuel topped.',
    features: ['mesas', 'desert', 'city'], 
    theme: {
      skyTop: '#4f86c6', skyBottom: '#fbe3bd', fog: '#efd5ad', sun: '#ffe0a3',
      land: '#cfa563', landDark: '#b18448', water: '#2f8f9e', waterDeep: '#1a6b7c',
      sunPos: [-0.5, 0.5, -0.4], ambient: 0.75, clouds: 12, rain: false, dusk: false
    }
  },
  {
    id: 'isles', name: 'Emerald Isles', region: 'Lagoon International', from: 'Palm Cay', to: 'Jade Atoll',
    biome: 'isles', seed: 108, destX: -270, destZ: -3300, rings: 13, level: 6, baseReward: 820,
    desc: 'Turquoise lagoons and volcanic islands. The whole route is a postcard at 160 knots.',
    features: ['islands', 'ocean', 'palms'],
    theme: {
      skyTop: '#1e8bd8', skyBottom: '#c4f4ff', fog: '#b8edf6', sun: '#fff5cd',
      land: '#63b55d', landDark: '#3f8f4b', water: '#1aa9b8', waterDeep: '#0b6f8d',
      sunPos: [0.2, 0.6, 0.8], ambient: 0.7, clouds: 20, rain: false, dusk: false
    }
  },
  {
    id: 'neon', name: 'Neon City', region: 'Skyline Metro', from: 'West Harbor', to: 'Downtown Spire',
    biome: 'city', seed: 152, destX: 20, destZ: -3250, rings: 14, level: 9, baseReward: 1100,
    desc: 'A twilight run over a glowing metropolis. Skyscraper canyons, light trails, and rain.',
    features: ['city', 'trees', 'hills'],
    theme: {
      skyTop: '#101a44', skyBottom: '#ef6f9c', fog: '#6d5b8f', sun: '#ffb27a',
      land: '#34475c', landDark: '#223144', water: '#1a4f6e', waterDeep: '#0d3550',
      sunPos: [-0.6, 0.25, 0.3], ambient: 0.52, clouds: 18, rain: true, dusk: true
    }
  },
  {
    id: 'stratos', name: 'Stratos Edge', region: 'Aurora Skyport', from: 'Cloudbreak', to: 'Aurora Station',
    biome: 'stratos', seed: 201, destX: 0, destZ: -3550, rings: 15, level: 12, baseReward: 1600,
    desc: 'High-altitude crystal air above a violet horizon. Home of the Aurora hyperjet trials.',
    features: ['mountains', 'snow', 'city', 'hills'],
    theme: {
      skyTop: '#241a5e', skyBottom: '#ff9f7c', fog: '#9b7ab8', sun: '#ffd9a8',
      land: '#5b6689', landDark: '#3c476b', water: '#2c4373', waterDeep: '#182b54',
      sunPos: [-0.4, 0.35, -0.55], ambient: 0.6, clouds: 26, rain: false, dusk: true
    }
  }
];

export const MISSIONS = {
  coast: [
    { id: 'rings', icon: 'ring', name: 'Thread the Needle', desc: 'Pass 8 sky rings', target: 8, type: 'rings', reward: 220, tech: 1 },
    { id: 'coins', icon: 'coin', name: 'Pocket Change', desc: 'Collect 24 sky coins', target: 24, type: 'coins', reward: 180, tech: 0 },
    { id: 'landing', icon: 'landing', name: 'Soft Touchdown', desc: 'Land gently at Coral Point', target: 1, type: 'softLanding', reward: 300, tech: 1 }
  ],
  alpine: [
    { id: 'rings', icon: 'ring', name: 'Ridge Runner', desc: 'Pass 9 sky rings', target: 9, type: 'rings', reward: 280, tech: 1 },
    { id: 'fuel', icon: 'fuel', name: 'Cold Start', desc: 'Collect 2 fuel cells', target: 2, type: 'fuel', reward: 240, tech: 0 },
    { id: 'landing', icon: 'landing', name: 'Summit Arrival', desc: 'Land gently at Summit Gate', target: 1, type: 'softLanding', reward: 380, tech: 1 }
  ],
  desert: [
    { id: 'rings', icon: 'ring', name: 'Heat Wave', desc: 'Pass 10 sky rings', target: 10, type: 'rings', reward: 360, tech: 1 },
    { id: 'coins', icon: 'coin', name: 'Mirage Money', desc: 'Collect 32 sky coins', target: 32, type: 'coins', reward: 300, tech: 0 },
    { id: 'landing', icon: 'landing', name: 'Dust Settler', desc: 'Land gently at Mirage Strip', target: 1, type: 'softLanding', reward: 460, tech: 1 }
  ],
  isles: [
    { id: 'rings', icon: 'ring', name: 'Island Hopper', desc: 'Pass 11 sky rings', target: 11, type: 'rings', reward: 460, tech: 1 },
    { id: 'coins', icon: 'coin', name: 'Treasure Trail', desc: 'Collect 40 sky coins', target: 40, type: 'coins', reward: 360, tech: 0 },
    { id: 'tech', icon: 'tech', name: 'Salvage Run', desc: 'Collect 2 tech cores', target: 2, type: 'tech', reward: 500, tech: 2 }
  ],
  neon: [
    { id: 'rings', icon: 'ring', name: 'Canyon Glide', desc: 'Pass 12 sky rings', target: 12, type: 'rings', reward: 600, tech: 2 },
    { id: 'boost', icon: 'boost', name: 'Afterburner', desc: 'Spend 6s at boost speed', target: 6, type: 'boostTime', reward: 520, tech: 1 },
    { id: 'landing', icon: 'landing', name: 'Downtown Touchdown', desc: 'Land gently at Downtown Spire', target: 1, type: 'softLanding', reward: 700, tech: 2 }
  ],
  stratos: [
    { id: 'rings', icon: 'ring', name: 'Edge of Space', desc: 'Pass 13 sky rings', target: 13, type: 'rings', reward: 800, tech: 2 },
    { id: 'fuel', icon: 'fuel', name: 'Cold Fusion', desc: 'Collect 3 fuel cells', target: 3, type: 'fuel', reward: 660, tech: 1 },
    { id: 'landing', icon: 'landing', name: 'Aurora Arrival', desc: 'Land gently at Aurora Station', target: 1, type: 'softLanding', reward: 950, tech: 3 }
  ]
};

export const XP_LEVELS = [
  0, 600, 1500, 2800, 4500, 6800, 9800, 13500, 18000, 23500,
  30000, 38000, 48000, 60000, 75000, 94000, 118000, 148000, 185000, 230000,
  290000, 365000, 460000, 580000, 730000, 920000
];

export function levelFromXp(xp) {
  let lvl = 1;
  for (let i = 0; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) lvl = i + 1;
  return lvl;
}
export function xpForLevel(level) {
  return XP_LEVELS[Math.max(0, Math.min(XP_LEVELS.length - 1, level - 1))] || 0;
}
export function planeById(id) {
  return PLANES.find(p => p.id === id) || PLANES[0];
}
export function routeById(id) {
  return ROUTES.find(r => r.id === id) || ROUTES[0];
}
export function upgradeCost(plane, level) {
  const tier = plane.tier;
  return Math.round((140 + tier * 95) * Math.pow(1.62, level) / 10) * 10;
}
export function upgradeTech(level) {
  return level < 2 ? 0 : level < 4 ? 1 : 2;
}
export function planeStats(plane, up = {}) {
  const boost = k => Math.min(1, (plane.base[k] || 0.5) + (up[k] || 0) * 0.052);
  return {
    speed: 96 + boost('speed') * 92,
    accel: 0.34 + boost('accel') * 0.7,
    handling: 0.72 + boost('handling') * 0.9,
    fuelEconomy: 1.5 - boost('fuel') * 0.62,
    raw: {
      speed: boost('speed'), handling: boost('handling'),
      fuel: boost('fuel'), accel: boost('accel')
    }
  };
}
export function totalUpgradeLevels(up = {}) {
  return UPGRADE_KEYS.reduce((s, u) => s + (up[u.key] || 0), 0);
}
export function evolvePrice(plane) {
  const idx = PLANES.findIndex(p => p.id === plane.id);
  const next = PLANES[idx + 1];
  return next ? Math.round(next.price * 0.5) : 0;
}

export const ACHIEVEMENTS = [
  { id: 'firstLanding', name: 'Wheels Down', desc: 'Land at any destination', icon: 'landing', stat: 'landings', target: 1 },
  { id: 'ringMaster', name: 'Ring Master', desc: 'Pass 100 sky rings', icon: 'ring', stat: 'rings', target: 100 },
  { id: 'coinTycoon', name: 'Coin Tycoon', desc: 'Collect 1,000 sky coins', icon: 'coin', stat: 'coins', target: 1000 },
  { id: 'fleetBuilder', name: 'Fleet Builder', desc: 'Unlock 4 aircraft', icon: 'hangar', stat: 'planes', target: 4 },
  { id: 'softTouch', name: 'Feather Touch', desc: 'Make 10 perfect landings', icon: 'star', stat: 'perfectLandings', target: 10 },
  { id: 'evoPilot', name: 'Evolution Pilot', desc: 'Evolve an aircraft', icon: 'evolve', stat: 'evolutions', target: 1 },
  { id: 'globeTrotter', name: 'Globe Trotter', desc: 'Complete all 6 routes', icon: 'globe', stat: 'routesCompleted', target: 6 },
  { id: 'skyVeteran', name: 'Sky Veteran', desc: 'Complete 25 flights', icon: 'wings', stat: 'flights', target: 25 }
];
