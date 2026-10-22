import * as THREE from '../vendor/three.module.js';

const PI = Math.PI;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildCourse(route) {
  const rnd = mulberry32(route.seed);
  const dest = V(route.destX, 0, route.destZ);
  const pts = [
    V(0, 44, -140),
    V(0, 104, -400)
  ];
  let x = 0;
  const midCount = 4;
  for (let i = 0; i < midCount; i++) {
    const f = (i + 1) / (midCount + 1);
    x += (rnd() - 0.5) * 480;
    x = THREE.MathUtils.clamp(x, -460, 460);
    const z = THREE.MathUtils.lerp(-400, route.destZ + 700, f);
    const y = 100 + Math.sin(f * PI) * 62 + (rnd() - 0.5) * 26;
    pts.push(V(x * (1 - f * 0.25), y, z));
  }
  pts.push(V(route.destX, 64, route.destZ + 700));
  pts.push(V(route.destX, 26, route.destZ + 440));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const rings = [];
  const n = route.rings;
  for (let i = 0; i < n; i++) {
    const t = 0.045 + (i / (n - 1)) * 0.895;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    rings.push({ pos, tangent, t });
  }
  const right = (t) => {
    const tan = curve.getTangentAt(t).normalize();
    return new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
  };
  const coins = [];
  const clusters = 20 + route.rings;
  for (let i = 0; i < clusters; i++) {
    const t = 0.055 + (i / (clusters - 1)) * 0.83;
    const base = curve.getPointAt(t);
    const r = right(t);
    const tan = curve.getTangentAt(t).normalize();
    const off = Math.sin(i * 1.25) * 26 + (rnd() - 0.5) * 8;
    const lift = Math.cos(i * 0.95) * 8;
    for (let k = 0; k < 3; k++) {
      const p = base.clone().addScaledVector(r, off).addScaledVector(tan, (k - 1) * 12);
      p.y += lift;
      coins.push(p);
    }
  }
  const fuels = [0.28, 0.58, 0.83].map((t, i) => {
    const p = curve.getPointAt(t);
    p.addScaledVector(right(t), (i % 2 ? -1 : 1) * 32);
    p.y += 4;
    return p;
  });
  const techs = [0.4, 0.72].map((t) => {
    const p = curve.getPointAt(t);
    p.addScaledVector(right(t), 26);
    p.y += 8;
    return p;
  });
  return { curve, rings, coins, fuels, techs, dest, points: pts };
}

function makeSky(theme) {
  const geo = new THREE.SphereGeometry(6500, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(theme.skyTop) },
      bottomColor: { value: new THREE.Color(theme.skyBottom) },
      offset: { value: 600 },
      exponent: { value: 0.75 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 bottomColor;
      uniform float offset; uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        vec3 c = mix(bottomColor, topColor, pow(max(h, 0.0), exponent));
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function makeSunSprite(theme) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, theme.sun);
  g.addColorStop(0.35, 'rgba(255,220,160,0.55)');
  g.addColorStop(0.7, 'rgba(255,200,140,0.12)');
  g.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(950);
  const dir = new THREE.Vector3(...theme.sunPos).normalize();
  sprite.position.copy(dir.multiplyScalar(3600));
  return { sprite, dir };
}

function makeOcean(theme) {
  const geo = new THREE.PlaneGeometry(8500, 8500, 48, 48);
  geo.rotateX(-PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      deep: { value: new THREE.Color(theme.waterDeep) },
      shallow: { value: new THREE.Color(theme.water) },
      sunDir: { value: new THREE.Vector3(...theme.sunPos).normalize() },
      fogColor: { value: new THREE.Color(theme.fog) },
      fogDensity: { value: 0.00024 }
    },
    fog: false,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        float w = sin(wp.x*0.035 + uTime*0.9)*0.22 + cos(wp.z*0.03 - uTime*0.7)*0.2;
        w += sin((wp.x+wp.z)*0.012 + uTime*0.4)*0.15;
        wp.y += w;
        vWorld = wp.xyz;
        vWave = w;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 deep; uniform vec3 shallow; uniform vec3 sunDir;
      uniform vec3 fogColor; uniform float fogDensity; uniform float uTime;
      varying vec3 vWorld; varying float vWave;
      void main(){
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(viewDir, vec3(0.0,1.0,0.0)), 0.0), 2.4);
        float sparkle = pow(max(0.0, sin(vWorld.x*0.55 + uTime*1.6) * cos(vWorld.z*0.43 - uTime*1.2)), 24.0);
        vec3 col = mix(deep, shallow, 0.42 + vWave*0.12 + fres*0.3);
        col += vec3(0.9,0.86,0.72) * sparkle * 0.35;
        col = mix(col, fogColor, clamp(fres*0.25, 0.0, 0.35));
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.55;
  mesh.receiveShadow = true;
  return mesh;
}

function createCloud(sharedGeo, mat, rnd, scale = 1) {
  const g = new THREE.Group();
  const puffs = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < puffs; i++) {
    const m = new THREE.Mesh(sharedGeo, mat);
    m.position.set((rnd() - 0.5) * 10, (rnd() - 0.5) * 1.8, (rnd() - 0.5) * 6);
    m.scale.set(1.4 + rnd() * 0.8, 0.8 + rnd() * 0.35, 1.3 + rnd() * 0.6);
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

function createTrees(scene, theme, rnd, count, avoid) {
  const geo = new THREE.ConeGeometry(2.4, 7.5, 5);
  geo.translate(0, 3.75, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.4, 0.55, 2.2, 4);
  trunkGeo.translate(0, 1.1, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: theme.landDark, roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4128', roughness: 1 });
  const leaves = new THREE.InstancedMesh(geo, leafMat, count);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  leaves.castShadow = false;
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let tries = 0; tries < count * 5 && placed < count; tries++) {
    const x = (rnd() - 0.5) * 3200;
    const z = -rnd() * 3600 + 200;
    let ok = true;
    for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < 190) { ok = false; break; }
    if (!ok) continue;
    const s = 0.7 + rnd() * 1.2;
    dummy.position.set(x, -0.4, z);
    dummy.rotation.y = rnd() * PI * 2;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    leaves.setMatrixAt(placed, dummy.matrix);
    trunks.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  leaves.count = placed; trunks.count = placed;
  leaves.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  return [leaves, trunks];
}

function createMountains(scene, theme, rnd, count, nearZ) {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: theme.landDark, roughness: 0.98, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: '#eef6fb', roughness: 0.9, flatShading: true });
  for (let i = 0; i < count; i++) {
    const h = 90 + rnd() * 230;
    const r = 60 + rnd() * 120;
    const geo = new THREE.ConeGeometry(r, h, 5 + Math.floor(rnd() * 2), 2);
    const m = new THREE.Mesh(geo, rockMat);
    const x = (rnd() - 0.5) * 2800;
    const z = nearZ + (rnd() - 0.5) * 1800;
    m.position.set(x, h / 2 - 2, z);
    m.rotation.y = rnd() * PI;
    group.add(m);
    if (h > 150) {
      const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.34, 5, 1), snowMat);
      snow.position.set(x, h - h * 0.17 - 2, z);
      snow.rotation.y = m.rotation.y;
      group.add(snow);
    }
  }
  return group;
}

function createMesas(theme, rnd, count, z0, z1) {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#a9583e', roughness: 1, flatShading: true });
  const bandMat = new THREE.MeshStandardMaterial({ color: '#c97a52', roughness: 1, flatShading: true });
  for (let i = 0; i < count; i++) {
    const h = 30 + rnd() * 80;
    const r = 22 + rnd() * 42;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, h, 7), rockMat);
    base.position.y = h / 2;
    g.add(base);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, h * 0.1, 7), bandMat);
    band.position.y = h * 0.62;
    g.add(band);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.84, r * 0.82, 2, 7), bandMat);
    top.position.y = h + 1;
    g.add(top);
    g.position.set((rnd() - 0.5) * 2600, -1, z0 + rnd() * (z1 - z0));
    g.rotation.y = rnd() * PI;
    group.add(g);
  }
  return group;
}

function createCity(theme, rnd, center, spread, count, neon = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: neon ? '#28324e' : '#5a6572', roughness: 0.7, metalness: 0.35, flatShading: true });
  const winMat = new THREE.MeshBasicMaterial({ color: neon ? '#ffcf7a' : '#8fc4e8' });
  const glowMat = new THREE.MeshBasicMaterial({ color: neon ? '#4ef7ff' : '#b9d7ea' });
  for (let i = 0; i < count; i++) {
    const w = 12 + rnd() * 18;
    const d = 12 + rnd() * 18;
    const h = 18 + rnd() * (neon ? 108 : 55);
    const x = center.x + (rnd() - 0.5) * spread;
    const z = center.z + (rnd() - 0.5) * spread;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    b.position.set(x, h / 2 - 0.5, z);
    group.add(b);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.15, h * 0.82, d + 0.15), winMat);
    strip.position.set(x - w * 0.28, h / 2, z);
    group.add(strip);
    if (neon && rnd() > 0.45) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.8, d * 0.9), glowMat);
      roof.position.set(x, h + 0.2, z);
      group.add(roof);
    }
    if (h > 80) {
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 18, 5), glowMat);
      spire.position.set(x, h + 9, z);
      group.add(spire);
    }
  }
  return group;
}

function makeRunwayTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#f5f5f0';
  ctx.font = 'bold 132px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('18', 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAirport(theme, opts = {}) {
  const group = new THREE.Group();
  const darkMat = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.92 });
  const asphaltMat = new THREE.MeshStandardMaterial({ color: '#3c424b', roughness: 0.95 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#edf2f2', roughness: 0.65 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: '#f5c84b', roughness: 0.65 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#79c6e6', roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.82 });
  const buildingMat = new THREE.MeshStandardMaterial({ color: '#d8dde3', roughness: 0.7, metalness: 0.15 });
  const roofMat = new THREE.MeshStandardMaterial({ color: theme.landDark, roughness: 0.85 });
  const islandMat = new THREE.MeshStandardMaterial({ color: theme.land, roughness: 1, flatShading: true });
  const sandMat = new THREE.MeshStandardMaterial({ color: '#e6d3a3', roughness: 1 });

  const island = new THREE.Mesh(new THREE.CylinderGeometry(430, 455, 3, 28), islandMat);
  island.position.y = -1.5;
  island.receiveShadow = true;
  group.add(island);
  if (opts.beach) {
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(458, 485, 1.2, 28), sandMat);
    beach.position.y = -2.4;
    group.add(beach);
  }

  const runway = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 360), asphaltMat);
  runway.position.y = 0.16;
  runway.receiveShadow = true;
  group.add(runway);

  for (let z = -160; z <= 160; z += 22) {
    if (Math.abs(z) < 24) continue;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 10), whiteMat);
    dash.position.set(0, 0.34, z);
    group.add(dash);
  }
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 352), whiteMat);
    edge.position.set(side * 13.6, 0.34, 0);
    group.add(edge);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 9), whiteMat);
        bar.position.set(side * (4 + j * 4.2), 0.335, (i + 1) * 18 * (i % 2 ? 1 : -1));
        bar.visible = false;
        group.add(bar);
      }
    }
  }
  for (const zEnd of [-170, 170]) {
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 12), whiteMat);
      stripe.position.set(-10.5 + i * 4.2, 0.335, zEnd + (zEnd > 0 ? -10 : 10));
      group.add(stripe);
    }
    const td = new THREE.Mesh(new THREE.BoxGeometry(4, 0.04, 4), whiteMat);
    td.position.set(-8, 0.335, zEnd * 0.92);
    group.add(td);
    const td2 = td.clone(); td2.position.x = 8; group.add(td2);
  }

  const tex = makeRunwayTexture();
  for (const zEnd of [148, -148]) {
    const numMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const num = new THREE.Mesh(new THREE.PlaneGeometry(9, 11), numMat);
    num.rotation.x = -PI / 2;
    num.rotation.z = zEnd > 0 ? PI : 0;
    num.position.set(0, 0.345, zEnd);
    group.add(num);
  }

  const taxi = new THREE.Mesh(new THREE.BoxGeometry(96, 0.25, 13), asphaltMat);
  taxi.position.set(66, 0.14, -48);
  taxi.receiveShadow = true;
  group.add(taxi);
  const taxiLine = new THREE.Mesh(new THREE.BoxGeometry(92, 0.03, 0.6), yellowMat);
  taxiLine.position.set(66, 0.29, -48);
  group.add(taxiLine);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(100, 0.25, 76), asphaltMat);
  apron.position.set(114, 0.14, -10);
  apron.receiveShadow = true;
  group.add(apron);

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(34, 18, 84), buildingMat);
  terminal.position.set(152, 9, -10);
  terminal.castShadow = true;
  terminal.receiveShadow = true;
  group.add(terminal);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 78), glassMat);
  glass.position.set(134.8, 9, -10);
  group.add(glass);
  const terminalRoof = new THREE.Mesh(new THREE.BoxGeometry(38, 2, 88), roofMat);
  terminalRoof.position.set(152, 19, -10);
  group.add(terminalRoof);
  for (let i = 0; i < 3; i++) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 3.5), buildingMat);
    bridge.position.set(121, 4.5, -32 + i * 22);
    group.add(bridge);
  }

  const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.4, 30, 8), buildingMat);
  towerBase.position.set(68, 15, 66);
  towerBase.castShadow = true;
  group.add(towerBase);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 6, 7, 8), glassMat);
  cab.position.set(68, 33, 66);
  group.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1.2, 8), roofMat);
  cabRoof.position.set(68, 37, 66);
  group.add(cabRoof);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 10, 4), whiteMat);
  antenna.position.set(68, 42.5, 66);
  group.add(antenna);
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff4d4d' });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), beaconMat);
  beacon.position.set(68, 47.7, 66);
  group.add(beacon);

  const hangar = new THREE.Group();
  const hb = new THREE.Mesh(new THREE.BoxGeometry(34, 13, 46), buildingMat);
  hb.position.y = 6.5;
  hangar.add(hb);
  const hr = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 46, 14, 1, false, 0, PI), roofMat);
  hr.rotation.x = PI / 2;
  hr.rotation.z = PI / 2;
  hr.position.set(0, 13, 0);
  hr.scale.y = 0.4;
  hangar.add(hr);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 30), darkMat);
  door.position.set(-17, 5.5, 0);
  hangar.add(door);
  hangar.position.set(92, 0, 94);
  group.add(hangar);

  for (const [x, z] of [[-90, 80], [-72, 80]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 12, 12), whiteMat);
    tank.position.set(x, 6, z);
    tank.castShadow = true;
    group.add(tank);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.8, 12), roofMat);
    cap.position.set(x, 12.2, z);
    group.add(cap);
  }

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 5), whiteMat);
  pole.position.set(-84, 4.5, 56);
  group.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#ff7a3d', side: THREE.DoubleSide, roughness: 0.9 }));
  sock.rotation.z = PI / 2;
  sock.position.set(-81, 8.4, 56);
  group.add(sock);

  const lightGeo = new THREE.SphereGeometry(0.42, 6, 4);
  const lightMat = new THREE.MeshBasicMaterial({ color: '#9fe8ff' });
  const edgeLights = new THREE.InstancedMesh(lightGeo, lightMat, 30);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 15; i++) {
      dummy.position.set(side * 15.6, 0.42, -168 + i * 24);
      dummy.updateMatrix();
      edgeLights.setMatrixAt(idx++, dummy.matrix);
    }
  }
  edgeLights.instanceMatrix.needsUpdate = true;
  group.add(edgeLights);

  const appMat = new THREE.MeshBasicMaterial({ color: '#ff5555' });
  for (let i = 0; i < 5; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 1.1), appMat);
    strip.position.set(0, 0.36, 185 + i * 6);
    group.add(strip);
  }

  if (opts.windsock !== false) {
    const beacon2 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), new THREE.MeshBasicMaterial({ color: '#4dff88' }));
    beacon2.position.set(0, 0.5, 198);
    group.add(beacon2);
  }

  group.userData.beacon = beacon;
  return group;
}

function createIslands(theme, rnd, count) {
  const group = new THREE.Group();
  const landMat = new THREE.MeshStandardMaterial({ color: theme.land, roughness: 1, flatShading: true });
  const sandMat = new THREE.MeshStandardMaterial({ color: '#e9d9ac', roughness: 1 });
  const palmLeaf = new THREE.MeshStandardMaterial({ color: '#3f8f4b', roughness: 0.9, flatShading: true });
  for (let i = 0; i < count; i++) {
    const x = (rnd() - 0.5) * 3000;
    const z = -rnd() * 3400;
    if (Math.hypot(x, z) < 420) continue;
    const r = 40 + rnd() * 130;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.32, 5, 9), sandMat);
    sand.position.set(x, -2, z);
    group.add(sand);
    const land = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, 5.5, 9), landMat);
    land.position.set(x, 0.2, z);
    land.receiveShadow = true;
    group.add(land);
    for (let p = 0; p < 4; p++) {
      const px = x + (rnd() - 0.5) * r * 1.1;
      const pz = z + (rnd() - 0.5) * r * 1.1;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 4), new THREE.MeshStandardMaterial({ color: '#7b5a33', roughness: 1 }));
      trunk.position.set(px, 7, pz);
      trunk.rotation.z = (rnd() - 0.5) * 0.2;
      group.add(trunk);
      for (let l = 0; l < 5; l++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5.5, 4), palmLeaf);
        leaf.position.set(px, 11.4, pz);
        leaf.rotation.z = PI / 2.3;
        leaf.rotation.y = (l / 5) * PI * 2;
        leaf.geometry = leaf.geometry.clone();
        leaf.translateY(2.2);
        group.add(leaf);
      }
    }
  }
  return group;
}

function createFields(theme, rnd, avoid) {
  const group = new THREE.Group();
  const colors = ['#8fbc56', '#74a84a', '#c9b25d', '#9ac36a', '#6b9a43', '#b7a658'];
  for (let i = 0; i < 42; i++) {
    const x = (rnd() - 0.5) * 2600;
    const z = -rnd() * 3300 + 150;
    let ok = true;
    for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < 260) { ok = false; break; }
    if (!ok) continue;
    const c = colors[Math.floor(rnd() * colors.length)];
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
    const size = 70 + rnd() * 150;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size * (0.6 + rnd())), mat);
    f.rotation.x = -PI / 2;
    f.rotation.z = rnd() * PI;
    f.position.set(x, -0.32, z);
    group.add(f);
  }
  return group;
}

function createRain() {
  const count = 600;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 260;
    pos[i * 3 + 1] = Math.random() * 140;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 260;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#b9e4ff', size: 0.55, transparent: true, opacity: 0.55, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

export function createWorld(route, course, opts = {}) {
  const group = new THREE.Group();
  const theme = route.theme;
  const rnd = mulberry32(route.seed + 7);
  const sky = makeSky(theme);
  group.add(sky);
  const { sprite: sunSprite, dir: sunDir } = makeSunSprite(theme);
  group.add(sunSprite);

  const hemi = new THREE.HemisphereLight(theme.skyTop, theme.landDark, theme.ambient);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun, 1.35);
  sun.position.copy(sunDir).multiplyScalar(420);
  sun.castShadow = opts.shadows !== false;
  sun.shadow.mapSize.set(opts.shadowSize || 1024, opts.shadowSize || 1024);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.bias = -0.0006;
  sun.target.position.set(0, 0, 0);
  group.add(sun);
  group.add(sun.target);

  const fog = new THREE.FogExp2(theme.fog, 0.00023);
  const baseOcean = route.biome === 'isles';
  let ocean = null;
  if (baseOcean) {
    ocean = makeOcean(theme);
    group.add(ocean);
  } else {
    const groundMat = new THREE.MeshStandardMaterial({ color: theme.land, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), groundMat);
    ground.rotation.x = -PI / 2;
    ground.position.y = -0.55;
    ground.receiveShadow = true;
    group.add(ground);
  }

  if (route.biome === 'coast') {
    ocean = makeOcean(theme);
    ocean.position.set(-3550, -0.55, -1200);
    ocean.scale.set(0.62, 1, 1);
    group.add(ocean);
    const beach = new THREE.Mesh(new THREE.BoxGeometry(36, 0.3, 3600), new THREE.MeshStandardMaterial({ color: '#e9d6a4', roughness: 1 }));
    beach.position.set(-850, -0.36, -1500);
    group.add(beach);
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 3600), new THREE.MeshStandardMaterial({ color: theme.landDark, roughness: 1, flatShading: true }));
    cliff.position.set(-867, 3.4, -1500);
    group.add(cliff);
  }

  const airports = {
    start: createAirport(theme, { beach: baseOcean || route.biome === 'coast' }),
    end: createAirport(theme, { beach: baseOcean || route.biome === 'coast' })
  };
  airports.start.position.set(0, 0, 0);
  airports.end.position.set(route.destX, 0, route.destZ);
  group.add(airports.start, airports.end);

  const avoid = [{ x: 0, z: 0 }, { x: route.destX, z: route.destZ }];
  if (route.features.includes('fields')) group.add(createFields(theme, rnd, avoid));
  if (route.features.includes('trees')) {
    const trees = createTrees(group, theme, rnd, route.biome === 'city' ? 60 : 110, avoid);
    trees.forEach(t => group.add(t));
  }
  if (route.features.includes('mountains')) {
    group.add(createMountains(group, theme, rnd, route.biome === 'alpine' ? 17 : 11, route.destZ * 0.55));
  }
  if (route.features.includes('mesas')) {
    group.add(createMesas(theme, rnd, 8, route.destZ * 0.5, route.destZ + 300));
  }
  if (route.features.includes('city')) {
    group.add(createCity(theme, rnd, { x: route.destX + (rnd() - 0.5) * 200, z: route.destZ + 220 }, 620, route.biome === 'city' ? 64 : 22, route.biome === 'city'));
    if (route.biome === 'city') group.add(createCity(theme, rnd, { x: 420, z: -900 }, 500, 26, true));
  }
  if (route.features.includes('islands')) {
    group.add(createIslands(theme, rnd, 9));
  }
  if (route.biome === 'stratos') {
    const floatMat = new THREE.MeshStandardMaterial({ color: theme.landDark, roughness: 1, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(18 + rnd() * 30, 0), floatMat);
      rock.position.set((rnd() - 0.5) * 1800, 120 + rnd() * 120, -rnd() * 2800);
      rock.scale.y = 0.6;
      group.add(rock);
    }
  }

  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#f4f9ff', roughness: 1, transparent: true, opacity: 0.92 });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 7);
  const cloudCount = Math.max(8, Math.round((theme.clouds || 18) * 0.62));
  for (let i = 0; i < cloudCount; i++) {
    const c = createCloud(cloudGeo, cloudMat, rnd, 9 + rnd() * 9);
    const low = rnd() < 0.08;
    c.position.set((rnd() - 0.5) * 2900, low ? 48 + rnd() * 30 : 105 + rnd() * 175, -rnd() * 3400 + 100);
    c.userData.baseX = c.position.x;
    c.userData.speed = 0.8 + rnd() * 2.2;
    clouds.push(c);
    group.add(c);
  }

  const rain = theme.rain ? createRain() : null;
  if (rain) group.add(rain);

  const landingLights = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 1.2), new THREE.MeshBasicMaterial({ color: '#59ff9d', transparent: true, opacity: 0.6 }));
    m.position.set(route.destX, 0.5, route.destZ + 235 + i * 26);
    group.add(m);
    landingLights.push(m);
  }

  const sunTarget = sun.target;
  const update = (time, dt, planePos) => {
    if (ocean) ocean.material.uniforms.uTime.value = time;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > c.userData.baseX + 420) c.position.x = c.userData.baseX - 420;
    }
    if (sun && planePos) {
      sun.position.set(planePos.x + sunDir.x * 420, planePos.y + sunDir.y * 420 + 160, planePos.z + sunDir.z * 420);
      sunTarget.position.set(planePos.x, 0, planePos.z);
    }
    if (rain && planePos) {
      const arr = rain.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= 130 * dt;
        arr[i] += 25 * dt;
        if (arr[i + 1] < -10) {
          arr[i + 1] = 120;
          arr[i] = (Math.random() - 0.5) * 260;
          arr[i + 2] = (Math.random() - 0.5) * 260;
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
      rain.position.set(planePos.x, Math.max(0, planePos.y - 40), planePos.z);
    }
    const blink = (Math.sin(time * 2.4) > 0.2) ? 1 : 0.18;
    for (const ap of [airports.start, airports.end]) {
      if (ap.userData.beacon) ap.userData.beacon.material.opacity = 1;
      if (ap.userData.beacon) ap.userData.beacon.scale.setScalar(blink);
    }
    landingLights.forEach((m, i) => {
      m.material.opacity = 0.3 + 0.5 * Math.abs(Math.sin(time * 2 + i * 0.8));
    });
    sunSprite.position.copy(planePos ? new THREE.Vector3(planePos.x, planePos.y, planePos.z) : new THREE.Vector3()).addScaledVector(sunDir, 3600);
  };

  return {
    group, sky, sun, fog, ocean, update, airports, clouds,
    dispose: () => {
      group.traverse(o => {
        if (o.isMesh || o.isPoints || o.isSprite) {
          o.geometry?.dispose?.();
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
          else { o.material?.map?.dispose?.(); o.material?.dispose?.(); }
        }
      });
    }
  };
}

export function createRing(color = '#36e4ff') {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.75, metalness: 0.6, roughness: 0.25 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(19, 1.35, 8, 30), mat);
  group.add(torus);
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(19, 4.2, 8, 26), glowMat);
  group.add(glow);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(17.5, 30), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  group.add(inner);
  for (let i = 0; i < 4; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.95, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const a = i * PI / 2 + PI / 4;
    dot.position.set(Math.cos(a) * 19, Math.sin(a) * 19, 0);
    group.add(dot);
  }
  group.userData.glow = glow;
  group.userData.inner = inner;
  return group;
}

export function createCoin() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.95, roughness: 0.22, emissive: '#7a5300', emissiveIntensity: 0.45 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 0.28, 22), gold);
  coin.rotation.x = PI / 2;
  group.add(coin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.16, 6, 22), gold);
  group.add(rim);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: '#fff3ba' }));
  star.scale.z = 0.25;
  star.position.z = 0.2;
  group.add(star);
  return group;
}

export function createFuel() {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#e5553d', metalness: 0.5, roughness: 0.35, emissive: '#5d0e06', emissiveIntensity: 0.5 });
  const can = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 3.2, 10), red);
  group.add(can);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.4, 10), new THREE.MeshStandardMaterial({ color: '#f3e8d2', metalness: 0.7, roughness: 0.3 }));
  cap.position.y = 1.7;
  group.add(cap);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.28, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#ffe9b0' }));
  band.position.y = -0.5;
  group.add(band);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), new THREE.MeshBasicMaterial({ color: '#ff7a56', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  group.add(glow);
  group.userData.glow = glow;
  return group;
}

export function createTech() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#b06bff', metalness: 0.75, roughness: 0.22, emissive: '#5c1cff', emissiveIntensity: 0.9 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.7, 0), mat);
  group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.09, 6, 28), new THREE.MeshBasicMaterial({ color: '#d9b6ff' }));
  ring.rotation.x = PI / 2;
  group.add(ring);
  const ring2 = ring.clone();
  ring2.rotation.set(PI / 2, 0, PI / 2.4);
  group.add(ring2);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(4.2, 20), new THREE.MeshBasicMaterial({ color: '#a45cff', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  group.add(glow);
  group.userData.core = core;
  group.userData.ring2 = ring2;
  return group;
}
