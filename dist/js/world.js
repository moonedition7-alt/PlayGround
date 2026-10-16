import * as THREE from 'three';

// Builds city, highway loop, tunnel, bridge, mountains, lights.
// Exports: { group, curve, roadWidth, colliders[], roadPoints (for minimap), startPose, isOffRoad() }
export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = []; // {min:Vector3,max:Vector3}

  const addCollider = (mesh) => {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
  };

  // ---- Sky, fog, lights ----
  scene.background = new THREE.Color(0x0a1428);
  scene.fog = new THREE.Fog(0x0a1428, 120, 700);

  const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x1a1410, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x33415e, 0.6));

  // Sunset gradient sky dome
  {
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2b1b4d) }, mid: { value: new THREE.Color(0xff6a3d) }, bot: { value: new THREE.Color(0x0a1428) } },
      vertexShader: 'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vP; uniform vec3 top,mid,bot;
        void main(){ float h=normalize(vP).y; vec3 c=h>0.12?mix(mid,top,smoothstep(0.12,0.7,h)):mix(bot,mid,smoothstep(-0.1,0.12,h));
        gl_FragColor=vec4(c,1.);}`,
    });
    group.add(new THREE.Mesh(geo, mat));
  }

  // ---- Ground ----
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
  group.add(ground);

  // Grass patches (off-road = slow)
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x1d3a24, roughness: 1 });
  for (let i = 0; i < 30; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(20 + Math.random() * 40, 12), grassMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set((Math.random() - 0.5) * 700, 0.0, (Math.random() - 0.5) * 700);
    group.add(p);
  }

  // ---- Track curve (closed highway loop) ----
  const pts = [
    [120, 80], [40, 88], [-50, 88], [-120, 80], [-152, 45],
    [-155, 0], [-152, -45], [-120, -80], [-40, -88], [50, -88],
    [120, -80], [152, -45], [155, 0], [152, 45],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.6);
  const SEG = 400, ROAD_W = 15;

  // Road ribbon geometry
  {
    const pos = [], uv = [], idx = [];
    const left = new THREE.Vector3(), p = new THREE.Vector3(), tan = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      curve.getPointAt(t % 1, p);
      curve.getTangentAt(t % 1, tan);
      left.set(-tan.z, 0, tan.x).normalize();
      const lx = p.x + left.x * ROAD_W / 2, lz = p.z + left.z * ROAD_W / 2;
      const rx = p.x - left.x * ROAD_W / 2, rz = p.z - left.z * ROAD_W / 2;
      pos.push(lx, 0.02, lz, rx, 0.02, rz);
      uv.push(0, t * 120, 1, t * 120);
      if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const tex = makeRoadTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    group.add(road);
  }

  // Guard rails (low walls along edges)
  {
    const railMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, emissive: 0x223355, emissiveIntensity: 0.4, roughness: 0.5 });
    const railGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < SEG; i += 8) {
      const t = i / SEG;
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      for (const s of [1, -1]) {
        const m = new THREE.Mesh(railGeo, railMat);
        m.position.set(p.x + n.x * s * (ROAD_W / 2 + 0.8), 0.5, p.z + n.z * s * (ROAD_W / 2 + 0.8));
        m.scale.set(0.3, 0.9, 6);
        m.rotation.y = Math.atan2(tan.x, tan.z);
        group.add(m);
      }
    }
  }

  // Start gantry
  const startT = 0.0;
  const startPt = curve.getPointAt(startT);
  const startTan = curve.getTangentAt(startT);
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x11182a, metalness: 0.7, roughness: 0.4 });
    const pole = new THREE.BoxGeometry(1.2, 9, 1.2);
    const n = new THREE.Vector3(-startTan.z, 0, startTan.x);
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(pole, mat);
      p.position.set(startPt.x + n.x * s * 10, 4.5, startPt.z + n.z * s * 10);
      p.castShadow = true; group.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 1.6, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x0a0f1e, emissive: 0x00e5ff, emissiveIntensity: 0.8 }));
    beam.position.set(startPt.x, 9, startPt.z);
    beam.rotation.y = Math.atan2(startTan.x, startTan.z) + Math.PI / 2;
    group.add(beam);
  }

  // ---- Street lights along track ----
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.6, metalness: 0.6 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffdf8a, emissiveIntensity: 3 });
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.2, 7, 8);
    const armGeo = new THREE.BoxGeometry(0.25, 0.25, 3);
    const lampGeo = new THREE.SphereGeometry(0.35, 8, 8);
    for (let i = 0; i < SEG; i += 16) {
      const t = i / SEG;
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const s = i % 32 === 0 ? 1 : -1;
      const base = new THREE.Vector3(p.x + n.x * s * (ROAD_W / 2 + 2.5), 0, p.z + n.z * s * (ROAD_W / 2 + 2.5));
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(base.x, 3.5, base.z); group.add(pole);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(base.x - n.x * s * 1.4, 6.9, base.z - n.z * s * 1.4);
      arm.rotation.y = Math.atan2(n.x, n.z); group.add(arm);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(base.x - n.x * s * 2.6, 6.8, base.z - n.z * s * 2.6); group.add(lamp);
    }
    // A few real point lights near start for cinematic feel
    for (let k = -2; k <= 2; k++) {
      const t = (startT + k * 0.01 + 1) % 1;
      const p = curve.getPointAt(t);
      const pl = new THREE.PointLight(0xffdf8a, 60, 45);
      pl.position.set(p.x, 7, p.z); group.add(pl);
    }
  }

  // ---- City buildings (inside + outside loop) ----
  buildCity(group, colliders, curve, ROAD_W);

  // ---- Tunnel on west straight ----
  {
    const tTun = 0.36;
    const p = curve.getPointAt(tTun), tan = curve.getTangentAt(tTun);
    const yaw = Math.atan2(tan.x, tan.z);
    const tun = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4358, roughness: 0.85 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff9a1f, emissiveIntensity: 1.6 });
    for (const s of [1, -1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 46), wallMat);
      wall.position.set(s * (ROAD_W / 2 + 2), 4, 0); wall.castShadow = true; tun.add(wall); addColliderLater(wall, colliders, tun);
      for (let z = -20; z <= 20; z += 5) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.6), stripeMat);
        stripe.position.set(s * (ROAD_W / 2 + 0.9), 3, z); tun.add(stripe);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 8, 1.5, 46), wallMat);
    roof.position.y = 8.2; roof.castShadow = true; tun.add(roof);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 8, 1.2, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00e5ff, emissiveIntensity: 2 }));
    sign.position.set(0, 7, 23.2); tun.add(sign);
    // interior lights
    for (let z = -18; z <= 18; z += 6) {
      const pl = new THREE.PointLight(0xffc37a, 40, 30);
      pl.position.set(0, 7, z); tun.add(pl);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8),
        new THREE.MeshStandardMaterial({ emissive: 0xffc37a, emissiveIntensity: 3, color: 0x111111 }));
      bulb.position.set(0, 7.4, z); tun.add(bulb);
    }
    tun.position.set(p.x, 0, p.z); tun.rotation.y = yaw;
    group.add(tun);
    tun.updateMatrixWorld(true);
    // real colliders for tunnel walls (road itself stays open)
    tun.children.forEach((c) => {
      if (c.isMesh && c.geometry.type === 'BoxGeometry') {
        const w = c.geometry.parameters.width;
        if (w <= 2.5 && c.position.y < 6) colliders.push(new THREE.Box3().setFromObject(c));
      }
    });
  }

  // ---- Bridge / overpass over south straight ----
  {
    const tB = 0.68;
    const p = curve.getPointAt(tB), tan = curve.getTangentAt(tB);
    const yaw = Math.atan2(tan.x, tan.z);
    const b = new THREE.Group();
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.8 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(60, 1.6, 10), deckMat);
    deck.position.y = 8; deck.castShadow = true; b.add(deck);
    for (const x of [-24, -8, 8, 24]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 6), deckMat);
      pillar.position.set(x, 4, x % 16 === 0 ? 9 : -9); pillar.castShadow = true; b.add(pillar);
    }
    const railM = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.2 });
    for (const s of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(60, 0.5, 0.3), railM);
      rail.position.set(0, 9.2, s * 5); b.add(rail);
    }
    b.position.set(p.x, 0, p.z); b.rotation.y = yaw + Math.PI / 2;
    group.add(b);
    b.updateMatrixWorld(true);
    b.children.forEach((c) => {
      if (c.isMesh && c.geometry.type === 'BoxGeometry' && c.position.y < 6 && c.geometry.parameters.width <= 2.5) {
        colliders.push(new THREE.Box3().setFromObject(c));
      }
    });
  }

  // ---- Mountains + trees ----
  {
    const mMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 1 });
    const sMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 520 + Math.random() * 180;
      const h = 90 + Math.random() * 130;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(70 + Math.random() * 60, h, 6), mMat);
      cone.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
      group.add(cone);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(22 + Math.random() * 14, h * 0.32, 6), sMat);
      cap.position.set(cone.position.x, h - h * 0.16 - 4, cone.position.z);
      group.add(cap);
    }
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x1f5c2e, roughness: 1 });
    for (let i = 0; i < 90; i++) {
      const x = (Math.random() - 0.5) * 640, z = (Math.random() - 0.5) * 640;
      const tmp = new THREE.Vector3(x, 0, z);
      if (distToCurve(curve, tmp) < 26) continue;
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 6), trunkM);
      tr.position.set(x, 1.2, z); group.add(tr);
      const lf = new THREE.Mesh(new THREE.ConeGeometry(1.6 + Math.random(), 3.4 + Math.random() * 2, 7), leafM);
      lf.position.set(x, 3.8, z); group.add(lf);
    }
  }

  const startPose = {
    pos: startPt.clone().add(new THREE.Vector3(-startTan.z, 0, startTan.x).multiplyScalar(0)),
    yaw: Math.atan2(startTan.x, startTan.z),
  };

  return { group, curve, roadWidth: ROAD_W, colliders, startPose };
}

function addColliderLater(mesh, colliders, parent) {
  // resolved after positioning by caller via updateMatrixWorld
  mesh.userData.collider = true;
}

function distToCurve(curve, v) {
  // coarse sampling
  let best = 1e9;
  for (let i = 0; i < 60; i++) {
    const p = curve.getPointAt(i / 60);
    const d = (p.x - v.x) ** 2 + (p.z - v.z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function distToRoad(curve, x, z) {
  let best = 1e9, bestT = 0;
  for (let i = 0; i < 100; i++) {
    const t = i / 100;
    const p = curve.getPointAt(t);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) { best = d; bestT = t; }
  }
  return { dist: Math.sqrt(best), t: bestT };
}

function makeRoadTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#23262e'; x.fillRect(0, 0, 256, 256);
  // noise
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // edge lines
  x.fillStyle = '#e8ecf5'; x.fillRect(8, 0, 6, 256); x.fillRect(242, 0, 6, 256);
  // center dashes
  x.fillStyle = '#ffd400';
  x.fillRect(122, 20, 12, 90); x.fillRect(122, 150, 12, 90);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeWindowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#10141f'; x.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 16; r++) for (let col = 0; col < 4; col++) {
    const lit = Math.random() > 0.45;
    x.fillStyle = lit ? (Math.random() > 0.3 ? '#ffd98a' : '#9adcff') : '#1c2438';
    x.fillRect(8 + col * 30, 8 + r * 15, 20, 9);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function buildCity(group, colliders, curve, roadW) {
  const winTex = makeWindowTexture();
  const spots = [];
  // hand-placed downtown blocks inside loop + scattered outside
  for (let gx = -110; gx <= 110; gx += 34) {
    for (let gz = -60; gz <= 60; gz += 32) {
      if (Math.random() < 0.25) continue;
      spots.push([gx + (Math.random() - 0.5) * 10, gz + (Math.random() - 0.5) * 8]);
    }
  }
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = 210 + Math.random() * 140;
    spots.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const tmp = new THREE.Vector3();
  for (const [bx, bz] of spots) {
    tmp.set(bx, 0, bz);
    if (distToCurve(curve, tmp) < roadW / 2 + 16) continue;
    const w = 10 + Math.random() * 14, d = 10 + Math.random() * 14;
    const h = 14 + Math.random() * (Math.abs(bx) < 120 && Math.abs(bz) < 100 ? 70 : 34);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.6 + Math.random() * 0.1, 0.25, 0.12 + Math.random() * 0.1),
      emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9,
      roughness: 0.85,
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(bx, h / 2, bz);
    b.rotation.y = Math.random() > 0.7 ? Math.PI / 4 : 0;
    group.add(b);
    b.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(b));
    // rooftop beacon
    if (h > 45) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2244, emissiveIntensity: 3 }));
      beacon.position.set(bx, h + 1, bz); group.add(beacon);
    }
  }
}
