import * as THREE from '../vendor/three.module.js';

const PI = Math.PI;

function wingGeometry(span, rootChord, tipChord, sweep, thickness) {
  const s = new THREE.Shape();
  const half = rootChord / 2;
  s.moveTo(0, half);
  s.lineTo(span, half - sweep - (rootChord - tipChord) * 0.5);
  s.lineTo(span, -half - sweep + (rootChord - tipChord) * 0.5);
  s.lineTo(0, -half);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-PI / 2);
  geo.translate(0, -thickness / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.42,
    metalness: opts.metalness ?? 0.28,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flat ?? false
  });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cylinder(rTop, rBot, h, seg, mat) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
}

export function createPlane(def, options = {}) {
  const v = def.visual;
  const detail = options.detail ?? 1;
  const group = new THREE.Group();
  group.name = 'plane-' + def.id;
  const model = new THREE.Group();
  group.add(model);
  group.userData.props = [];
  group.userData.fans = [];
  group.userData.exhausts = [];

  const bodyMat = makeMat(v.body, { metalness: 0.36, roughness: 0.34 });
  const accentMat = makeMat(v.accent, { metalness: 0.25, roughness: 0.4 });
  const wingMat = makeMat(v.wingColor, { metalness: 0.32, roughness: 0.38, side: THREE.DoubleSide });
  const trimMat = makeMat(v.trim, { metalness: 0.55, roughness: 0.3 });
  const glassMat = makeMat(v.window || '#8fd8f0', {
    metalness: 0.85, roughness: 0.08, transparent: true, opacity: 0.86,
    emissive: new THREE.Color(v.window || '#8fd8f0'), emissiveIntensity: 0.18
  });
  const darkMat = makeMat('#20262d', { metalness: 0.6, roughness: 0.35 });
  const metalMat = makeMat('#b9c2c9', { metalness: 0.9, roughness: 0.24 });
  const tireMat = makeMat('#16191d', { metalness: 0.0, roughness: 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({ color: v.accent });
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  const L = v.fuselageLen;
  const R = v.fuselageR;
  const bodyLen = L * 0.7;
  const noseLen = L * 0.3;

  const fuselage = cylinder(R * 0.78, R, bodyLen, detail > 0.6 ? 10 : 8, bodyMat);
  fuselage.rotation.x = PI / 2;
  fuselage.position.z = 0;
  model.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(R, noseLen, detail > 0.6 ? 10 : 8), bodyMat);
  nose.rotation.x = -PI / 2;
  nose.position.z = -bodyLen / 2 - noseLen / 2;
  model.add(nose);

  if (v.noseR < R * 0.85) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(v.noseR * 0.7, 8, 6), accentMat);
    tip.position.z = -bodyLen / 2 - noseLen + 0.08;
    model.add(tip);
  }

  const tailCap = new THREE.Mesh(new THREE.SphereGeometry(R * 0.78, 8, 6), bodyMat);
  tailCap.position.z = bodyLen / 2;
  tailCap.scale.z = 0.5;
  model.add(tailCap);

  if (v.kind === 'prop') {
    const propMat = makeMat(v.accent, { metalness: 0.7, roughness: 0.3 });
    for (const e of v.engines) {
      const nac = cylinder(e.size * 0.85, e.size * 0.95, 1.5 * e.size + 0.8, 8, bodyMat);
      nac.rotation.x = PI / 2;
      nac.position.set(e.x, e.y, e.z + 0.45);
      model.add(nac);
      const prop = new THREE.Group();
      prop.position.set(e.x, e.y, e.z - 0.55);
      const spinner = new THREE.Mesh(new THREE.ConeGeometry(e.size * 0.34, 0.7, 8), propMat);
      spinner.rotation.x = -PI / 2;
      prop.add(spinner);
      for (let i = 0; i < (e.blades || 3); i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, e.size * 1.75, 0.045), propMat);
        blade.position.y = 0;
        blade.rotation.z = i * (PI * 2 / (e.blades || 3));
        blade.geometry.translate(0, e.size * 0.82, 0);
        prop.add(blade);
      }
      const blur = new THREE.Mesh(new THREE.CircleGeometry(e.size * 1.55, 20), new THREE.MeshBasicMaterial({
        color: '#e8f4f7', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false
      }));
      blur.rotation.y = 0;
      blur.position.z = 0.02;
      prop.add(blur);
      prop.userData.blur = blur;
      model.add(prop);
      group.userData.props.push(prop);
    }
  }

  if (v.kind === 'jet') {
    for (const e of v.engines) {
      if (e.type === 'intake') {
        const intake = cylinder(e.size, e.size * 0.9, 0.55, 8, darkMat);
        intake.rotation.x = PI / 2;
        intake.position.set(e.x, e.y, e.z);
        model.add(intake);
        continue;
      }
      if (e.type !== 'jet') continue;
      const nac = cylinder(e.size * 0.88, e.size, e.size * 2.5, detail > 0.6 ? 12 : 8, metalMat);
      nac.rotation.x = PI / 2;
      nac.position.set(e.x, e.y, e.z);
      model.add(nac);
      const intake = new THREE.Mesh(new THREE.CircleGeometry(e.size * 0.84, 12), darkMat);
      intake.position.set(e.x, e.y, e.z - e.size * 1.25);
      model.add(intake);
      const fan = new THREE.Group();
      fan.position.set(e.x, e.y, e.z - e.size * 1.22);
      for (let i = 0; i < 8; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, e.size * 1.45, 0.05), metalMat);
        blade.geometry.translate(0, e.size * 0.7, 0);
        blade.rotation.z = i * PI / 4;
        fan.add(blade);
      }
      model.add(fan);
      group.userData.fans.push(fan);
      const exhaust = new THREE.Mesh(
        new THREE.CircleGeometry(e.size * 0.7, 12),
        new THREE.MeshBasicMaterial({ color: e.glow ? '#59fff2' : (v.afterburner ? '#ff9c4a' : '#8a99a5'), transparent: true, opacity: e.glow ? 0.9 : 0.55 })
      );
      exhaust.position.set(e.x, e.y, e.z + e.size * 1.26);
      model.add(exhaust);
      group.userData.exhausts.push(exhaust);
      if (e.pod) {
        const pylon = box(0.28, 0.85, 1.5, trimMat, e.x, e.y + 0.65, e.z + 0.1);
        model.add(pylon);
        const intakeDark = new THREE.Mesh(new THREE.CircleGeometry(e.size * 0.8, 12), darkMat);
        intakeDark.position.set(e.x, e.y, e.z - e.size * 1.23);
        model.add(intakeDark);
      }
    }
  }

  const wing = v.wing;
  const halfSpan = wing.span / 2 - R * 0.6;
  const wingGeo = wingGeometry(halfSpan, wing.chord, wing.chord * (wing.tip ?? 0.5), wing.sweep, 0.16);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.position.set(side * R * 0.62, wing.y, 0.1);
    w.scale.x = side;
    w.rotation.z = side * (wing.dihedral ?? 0.04);
    w.castShadow = true;
    model.add(w);
    if (wing.tip && wing.tip > 0.18) {
      const wl = box(0.1, 0.6 + wing.span * 0.012, wing.chord * wing.tip * 1.4, accentMat,
        side * (R * 0.62 + halfSpan), wing.y + 0.28 + (wing.dihedral ?? 0) * halfSpan, 0.1 + wing.sweep * 0.9 + wing.chord * wing.tip * 0.15);
      wl.rotation.z = side * 0.36;
      model.add(wl);
    }
  }

  const finH = v.tail.size * (v.kind === 'jet' ? 2.4 : 2.0) + L * 0.08;
  const finGeo = wingGeometry(finH, L * 0.2 * v.tail.size, L * 0.1 * v.tail.size, L * 0.1, 0.14);
  const finPositions = v.tail.type === 'twin' ? [-0.62, 0.62] : [0];
  for (const fx of finPositions) {
    const fin = new THREE.Mesh(finGeo, accentMat);
    fin.position.set(fx, R * 0.65, L * 0.44);
    fin.rotation.z = PI / 2 + (v.tail.type === 'twin' ? (fx < 0 ? -0.32 : 0.32) : 0);
    fin.castShadow = true;
    model.add(fin);
    if (v.tail.type === 'twin' || v.tail.type === 't') {
      const cap = box(0.1, 0.12, L * 0.16, trimMat, fx, R * 0.65 + finH, L * 0.44 + L * 0.06);
      model.add(cap);
    }
  }
  if (v.tail.type === 't') {
    const tbar = box(0.25, 0.13, L * 0.3, wingMat, 0, R * 0.65 + finH - 0.05, L * 0.49);
    model.add(tbar);
  }

  const hSpan = wing.span * 0.25;
  const hGeo = wingGeometry(hSpan, wing.chord * 0.62, wing.chord * 0.32, 0.35, 0.12);
  for (const side of [-1, 1]) {
    const h = new THREE.Mesh(hGeo, wingMat);
    h.position.set(side * R * 0.55, R * 0.2, L * 0.46);
    h.scale.x = side;
    model.add(h);
  }

  if (v.canopy === 'fighter') {
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(R * 0.72, 12, 8), glassMat);
    canopy.scale.set(0.85, 0.55, 1.7);
    canopy.position.set(0, R * 0.6, -L * 0.17);
    model.add(canopy);
  } else if (v.canopy === 'airliner') {
    const band = box(R * 1.02, R * 0.22, L * 0.09, glassMat, 0, R * 0.36, -bodyLen * 0.34);
    model.add(band);
    const stripe = box(R * 2.02, R * 0.11, bodyLen * 0.78, accentMat, 0, -R * 0.18, 0.1);
    model.add(stripe);
    for (const side of [-1, 1]) {
      const windows = box(0.02, R * 0.1, bodyLen * 0.58, glassMat, side * R * 0.94, R * 0.16, -0.1);
      model.add(windows);
    }
  } else {
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(R * 0.66, 12, 8), glassMat);
    canopy.scale.set(0.9, 0.62, 1.35);
    canopy.position.set(0, R * 0.55, -L * 0.2);
    model.add(canopy);
  }

  if (v.livery) {
    const noseStripe = box(R * 2.04, R * 0.2, L * 0.16, accentMat, 0, 0, -bodyLen * 0.28);
    model.add(noseStripe);
  }

  if (v.futuristic) {
    const ringGeo = new THREE.TorusGeometry(R * 0.75, 0.06, 6, 20);
    for (const z of [-bodyLen * 0.35, 0, bodyLen * 0.35]) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#3ef7ef', transparent: true, opacity: 0.55 }));
      ring.rotation.x = PI / 2;
      ring.position.set(0, 0, z);
      model.add(ring);
    }
    const canard = new THREE.Mesh(wingGeometry(R * 1.7, 1.3, 0.5, -0.2, 0.08), wingMat);
    canard.position.set(0, R * 0.3, -L * 0.32);
    canard.scale.x = -1;
    model.add(canard);
  }

  const gear = new THREE.Group();
  const gearParts = [];
  const addStrut = (x, z, len, wheelR) => {
    const strut = cylinder(0.055, 0.055, len, 6, metalMat);
    strut.position.set(x, -R - len / 2, z);
    gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.18, 10), tireMat);
    wheel.rotation.z = PI / 2;
    wheel.position.set(x, -R - len, z);
    gear.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.38, wheelR * 0.38, 0.2, 8), metalMat);
    hub.rotation.z = PI / 2;
    hub.position.set(x, -R - len, z);
    gear.add(hub);
    gearParts.push(strut, wheel, hub);
  };
  addStrut(0, -bodyLen * 0.24, Math.max(0.8, L * 0.09), 0.2);
  addStrut(-R * 0.95, bodyLen * 0.2, Math.max(0.9, L * 0.1), 0.26);
  addStrut(R * 0.95, bodyLen * 0.2, Math.max(0.9, L * 0.1), 0.26);
  if (v.gear === 'fixed') {
    gear.position.y = -0.1;
    model.add(gear);
  } else {
    gear.position.y = -0.2;
    model.add(gear);
  }

  const navLights = [];
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3b3b' }));
  navRed.position.set(-(R * 0.62 + halfSpan), wing.y + (wing.dihedral || 0) * halfSpan, 0.1 + wing.chord * 0.1);
  model.add(navRed); navLights.push(navRed);
  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: '#37ff7a' }));
  navGreen.position.set(R * 0.62 + halfSpan, wing.y + (wing.dihedral || 0) * halfSpan, 0.1 + wing.chord * 0.1);
  model.add(navGreen); navLights.push(navGreen);
  const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), lightMat);
  tailLight.position.set(0, R * 0.2, L * 0.51);
  model.add(tailLight); navLights.push(tailLight);

  if (v.kind === 'prop') {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 18), new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false
    }));
    disc.position.set(0, 0, -bodyLen / 2 - noseLen * 0.6);
    disc.rotation.y = PI;
    model.add(disc);
  }

  let glowLight = null;
  if (v.futuristic || v.afterburner) {
    const abl = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 2.2, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: v.futuristic ? '#4ffcf4' : '#ffae5a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    abl.rotation.x = PI / 2;
    abl.position.z = L * 0.52;
    model.add(abl);
    group.userData.afterburner = abl;
    if (v.futuristic) {
      glowLight = new THREE.PointLight('#3ef7ef', 0, 12);
      glowLight.position.set(0, 0, L * 0.48);
      model.add(glowLight);
    }
  }

  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = options.shadows !== false;
      o.receiveShadow = false;
    }
  });

  group.userData.gear = gear;
  group.userData.gearDown = v.gear === 'fixed' ? 1 : 0;
  group.userData.navLights = navLights;
  group.userData.model = model;
  group.userData.glowLight = glowLight;
  group.userData.planeDef = def;
  group.userData.size = { length: L, span: wing.span };

  group.userData.update = (dt, speedRatio = 0.7, boost = false, gearTarget = null, time = 0) => {
    if (gearTarget !== null && v.gear !== 'fixed') {
      const cur = group.userData.gearDown;
      group.userData.gearDown = cur + (gearTarget - cur) * Math.min(1, dt * 2.4);
      const g = 0.06 + group.userData.gearDown * 0.94;
      gear.scale.y = g;
      gear.position.y = -0.2 - (1 - g) * 0.7;
      gear.visible = g > 0.1;
    }
    const spin = 0.4 + speedRatio * 24;
    for (const p of group.userData.props) {
      p.rotation.z += spin * dt;
      if (p.userData.blur) p.userData.blur.material.opacity = 0.04 + Math.min(0.15, speedRatio * 0.12);
    }
    for (const f of group.userData.fans) f.rotation.z += (2 + speedRatio * 30) * dt;
    for (const ex of group.userData.exhausts) {
      ex.scale.setScalar(0.85 + Math.sin(time * 20) * 0.06 + (boost ? 0.25 : 0));
    }
    const blink = (Math.sin(time * 6) > 0.6) ? 1 : 0.25;
    navLights.forEach((l, i) => { l.material.opacity = 1; l.visible = i === 2 ? true : true; l.material.transparent = true; l.material.opacity = blink; });
    if (group.userData.afterburner) {
      const target = boost ? 0.75 : 0.12;
      const m = group.userData.afterburner.material;
      m.opacity += (target - m.opacity) * Math.min(1, dt * 6);
      group.userData.afterburner.scale.set(boost ? 1.15 : 0.7, boost ? 1.15 : 0.7, boost ? 1.8 : 0.6);
    }
    if (glowLight) glowLight.intensity = boost ? 2.2 : 0.35;
  };

  group.userData.setGear = (down) => { if (v.gear !== 'fixed') group.userData.gearTarget = down ? 1 : 0; };
  group.userData.dispose = () => {
    group.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material?.dispose?.();
      }
    });
  };

  return group;
}

export function createShowcasePlane(def) {
  const p = createPlane(def);
  p.userData.update = ((orig) => (dt, sr, b, g, t) => {
    orig(dt, 0.1, false, null, t);
    p.userData.props.forEach(prop => { prop.rotation.z += dt * 2.2; });
    p.userData.fans.forEach(fan => { fan.rotation.z += dt * 4; });
  })(p.userData.update);
  return p;
}
