import * as THREE from 'three';

// Supercar factory: styles veloce (Lambo), rossa (Ferrari), noir (Bugatti)
export const CAR_STATS = {
  veloce: { name: 'VELOCE GT', topSpeed: 60, accel: 24, grip: 2.6, driftGrip: 0.55 },
  rossa:  { name: 'ROSSA S',   topSpeed: 57, accel: 22, grip: 3.2, driftGrip: 0.62 },
  noir:   { name: 'NOIR W16',  topSpeed: 65, accel: 26, grip: 2.8, driftGrip: 0.58 },
};

function paint(color) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.85, roughness: 0.28,
    envMapIntensity: 1.2,
  });
}
function darkMat(c = 0x0b0e16, r = 0.8) {
  return new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: r });
}
function glassMat() {
  return new THREE.MeshStandardMaterial({ color: 0x0e1a2a, metalness: 0.9, roughness: 0.08 });
}

export function createCar(style = 'veloce', color = '#ffd400') {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const P = paint(color);
  const D = darkMat();
  const G = glassMat();

  // Chassis variants
  if (style === 'veloce') {
    // Angular wedge
    const lower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.4), P);
    lower.position.y = 0.55; body.add(lower);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 3, 1), P);
    nose.rotation.y = Math.PI; nose.scale.set(1, 1, 1.4);
    nose.position.set(0, 0.55, 2.6); nose.rotation.x = 0; body.add(nose);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 1.9), G);
    cabin.position.set(0, 1.0, -0.2); cabin.rotation.x = -0.08; body.add(cabin);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), D);
    wing.position.set(0, 1.25, -2.1); body.add(wing);
    for (const x of [-0.8, 0.8]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.5), D);
      fin.position.set(x, 1.05, -2.1); body.add(fin);
    }
  } else if (style === 'rossa') {
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.45, 4.3), P);
    lower.position.y = 0.52; body.add(lower);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), P);
    hood.scale.set(0.98, 0.35, 2.15); hood.position.set(0, 0.6, 0.1); body.add(hood);
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), G);
    cabin.scale.set(0.9, 0.55, 1.3); cabin.position.set(0, 0.7, -0.3); body.add(cabin);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.4), D);
    wing.position.set(0, 1.0, -2.0); body.add(wing);
  } else {
    // noir — Bugatti round + C line
    const lower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.5), P);
    lower.position.y = 0.55; body.add(lower);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), P);
    top.scale.set(0.95, 0.42, 2.0); top.position.set(0, 0.65, -0.1); body.add(top);
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), G);
    cabin.scale.set(0.85, 0.45, 1.1); cabin.position.set(0, 1.0, -0.2); body.add(cabin);
    // C-line trim
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d8, metalness: 1, roughness: 0.2 });
    for (const s of [-1, 1]) {
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 20, Math.PI), trimMat);
      trim.position.set(s * 0.99, 0.7, -0.2); trim.rotation.y = s * Math.PI / 2; body.add(trim);
    }
  }

  // Front splitter + rear diffuser
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.4), D);
  splitter.position.set(0, 0.28, 2.2); body.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.4), D);
  diffuser.position.set(0, 0.3, -2.25); body.add(diffuser);

  // Headlights
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfefff, emissiveIntensity: 2.5 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.1), hlMat);
    hl.position.set(s * 0.65, 0.68, 2.21); body.add(hl);
  }
  // Taillight bar (brake glow controlled via userData)
  const tlMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0.7 });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.08), tlMat);
  tl.position.set(0, 0.78, -2.26); body.add(tl);

  // Wheels
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd7dde8, metalness: 1, roughness: 0.25 });
  const tireMat = darkMat(0x0a0a0c, 0.95);
  const wheelPos = [[-0.95, 2.85 - 1.35], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]];
  // front z = +1.5, rear z = -1.5
  const positions = [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]];
  positions.forEach(([x, z], i) => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    w.add(tire, rim);
    w.position.set(x, 0.36, z);
    w.userData.front = i < 2;
    g.add(w);
    wheels.push(w);
  });

  // Underglow
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.6), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; g.add(glow);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  return { group: g, body, wheels, tailMat: tlMat, glowMat, style };
}

export function setBrakeLight(car, braking) {
  if (car.tailMat) car.tailMat.emissiveIntensity = braking ? 4 : 0.7;
}
