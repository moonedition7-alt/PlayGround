import * as THREE from '../vendor/three.module.js';
import {
  PLANES, ROUTES, MISSIONS, ACHIEVEMENTS, planeById, routeById,
  planeStats, levelFromXp, xpForLevel
} from './config.js';
import { createPlane, createShowcasePlane } from './plane.js';
import {
  buildCourse, createWorld, createRing, createCoin, createFuel, createTech, mulberry32
} from './world.js';

const PI = Math.PI;
const GROUND_TOP = 0.31;
const UP = new THREE.Vector3(0, 1, 0);

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
function dampV(vec, target, lambda, dt) {
  vec.lerp(target, 1 - Math.exp(-lambda * dt));
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function smoothAngle(a) {
  while (a > PI) a -= PI * 2;
  while (a < -PI) a += PI * 2;
  return a;
}

class ParticleField {
  constructor(scene, { count = 160, color = '#dff4ff', size = 1.1, opacity = 0.35, additive = true } = {}) {
    this.count = count;
    this.points = [];
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }
  spawn(p, vx, vy, vz, life) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] += 1.5 * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -9999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points.parent?.remove(this.points);
  }
}

export class Game {
  constructor({ canvas, save, audio }) {
    this.canvas = canvas;
    this.save = save;
    this.audio = audio;
    this.listeners = new Map();
    this.state = 'showcase';
    this.paused = false;
    this.time = 0;
    this.keys = {};
    this.steer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.dragging = false;
    this.pointerId = null;
    this.dragStart = { x: 0, y: 0 };
    this.manualBoost = false;
    this.manualBrake = false;
    this.showcaseMode = 'menu';
    this.showcasePivotRotation = 0;
    this.menuCamPos = new THREE.Vector3(7, 4, 12);
    this.menuCamLook = new THREE.Vector3(-2, 2.4, 0);
    this.shake = 0;
    this.resize();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor('#0b1320', 1);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.4, 14000);
    this.applyQuality();
    this.makeEnvironment();
    this.initShowcase();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());

    this.lastCountdown = 4;
    this.lastWarnAt = 0;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isPortrait = this.height > this.width * 1.05;
    if (this.renderer) {
      this.renderer.setSize(this.width, this.height, false);
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
    }
  }

  qualityLevel() {
    const q = this.save.data.settings.quality || 'auto';
    if (q !== 'auto') return q;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    return coarse ? 'medium' : 'high';
  }
  applyQuality() {
    const q = this.qualityLevel();
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    if (this.renderer) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.shadowMap.enabled = q !== 'low';
      this.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    }
  }

  makeEnvironment() {
    try {
      const envScene = new THREE.Scene();
      const geo = new THREE.SphereGeometry(120, 16, 12);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { top: { value: new THREE.Color('#7ec8ff') }, bottom: { value: new THREE.Color('#101b2c') } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(bottom, top, h),1.0); }'
      });
      envScene.add(new THREE.Mesh(geo, mat));
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ color: '#fff4dc' }));
        const a = i / 5 * PI * 2;
        p.position.set(Math.cos(a) * 55, 18 + (i % 3) * 8, Math.sin(a) * 55);
        p.lookAt(0, 12, 0);
        envScene.add(p);
      }
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envRT = pmrem.fromScene(envScene, 0.04);
      this.envTexture = this.envRT.texture;
      pmrem.dispose();
    } catch { this.envTexture = null; }
  }

  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, []);
    this.listeners.get(evt).push(fn);
  }
  emit(evt, data) {
    for (const fn of this.listeners.get(evt) || []) fn(data);
  }

  initShowcase() {
    if (this.sceneShowcase) this.disposeShowcase();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1220');
    scene.fog = new THREE.FogExp2('#0b1524', 0.012);
    if (this.envTexture) scene.environment = this.envTexture;

    const skyGeo = new THREE.SphereGeometry(260, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#050a18') },
        mid: { value: new THREE.Color('#163154') },
        bottom: { value: new THREE.Color('#d98a5e') }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(bottom, mid, smoothstep(-0.15, 0.12, h));
          c = mix(c, top, smoothstep(0.1, 0.75, h));
          gl_FragColor = vec4(c,1.0);
        }`
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = gridCanvas.height = 512;
    const g = gridCanvas.getContext('2d');
    g.fillStyle = '#0c1420'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(80,180,220,0.16)'; g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
    }
    g.strokeStyle = 'rgba(110,220,255,0.3)'; g.lineWidth = 4;
    g.beginPath(); g.arc(256, 256, 180, 0, PI * 2); g.stroke();
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(6, 6);
    gridTex.colorSpace = THREE.SRGBColorSpace;

    const floor = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshStandardMaterial({
      color: '#101b2a', roughness: 0.72, metalness: 0.2, map: gridTex
    }));
    floor.rotation.x = -PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const platform = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9.1, 0.7, 40), new THREE.MeshStandardMaterial({
      color: '#1c2a3c', roughness: 0.32, metalness: 0.7
    }));
    platform.position.y = 0.35;
    platform.receiveShadow = true;
    platform.castShadow = true;
    scene.add(platform);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8.65, 0.16, 8, 64), new THREE.MeshStandardMaterial({
      color: '#4fe6ff', emissive: '#2fd2ff', emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.2
    }));
    rim.rotation.x = PI / 2;
    rim.position.y = 0.72;
    scene.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(10.4, 0.05, 6, 64), new THREE.MeshBasicMaterial({ color: '#4fe6ff', transparent: true, opacity: 0.4 }));
    rim2.rotation.x = PI / 2;
    rim2.position.y = 0.12;
    scene.add(rim2);

    const hemi = new THREE.HemisphereLight('#bde6ff', '#1a2637', 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff1d6', 2.2);
    key.position.set(8, 16, 10);
    key.castShadow = this.quality !== 'low';
    key.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    key.shadow.camera.left = -16; key.shadow.camera.right = 16;
    key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
    key.shadow.camera.near = 1; key.shadow.camera.far = 50;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const blue = new THREE.SpotLight('#3fd4ff', 340, 60, 0.62, 0.8, 1.4);
    blue.position.set(-13, 12, -9);
    blue.target.position.set(0, 1.5, 0);
    scene.add(blue, blue.target);
    const warm = new THREE.SpotLight('#ff9a5e', 280, 80, 0.7, 0.9, 1.4);
    warm.position.set(14, 9, 8);
    warm.target.position.set(0, 1.5, 0);
    scene.add(warm, warm.target);
    const rimLight = new THREE.PointLight('#6ee7ff', 80, 24);
    rimLight.position.set(0, 3, -9);
    scene.add(rimLight);

    const rnd = mulberry32(99);
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      starPos[i * 3] = (rnd() - 0.5) * 160;
      starPos[i * 3 + 1] = rnd() * 60;
      starPos[i * 3 + 2] = (rnd() - 0.5) * 160;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#8ce9ff', size: 0.22, transparent: true, opacity: 0.6, depthWrite: false }));
    scene.add(stars);
    this.showcaseStars = stars;

    this.showcasePivot = new THREE.Group();
    scene.add(this.showcasePivot);
    this.showcasePlatformTop = 0.7;
    this.sceneShowcase = scene;
    this.refreshShowcasePlane();
  }

  refreshShowcasePlane() {
    if (this.showcasePlane) {
      this.showcasePivot.remove(this.showcasePlane);
      this.showcasePlane.userData.dispose?.();
      this.showcasePlane = null;
    }
    const def = planeById(this.save.data.selectedPlane);
    const p = createShowcasePlane(def);
    p.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(p);
    const minY = box.min.y;
    p.position.y = this.showcasePlatformTop - minY;
    p.rotation.y = 0;
    this.showcaseOffsetY = p.position.y;
    this.showcaseDef = def;
    this.showcasePlane = p;
    this.showcasePivot.add(p);
    this.showcasePivot.rotation.y = this.showcasePivotRotation;
  }

  setShowcasePlane(id) {
    this.refreshShowcasePlane();
  }

  setShowcaseMode(mode) {
    this.showcaseMode = mode;
  }

  menuLayout() {
    const def = this.showcaseDef || planeById(this.save.data.selectedPlane);
    const size = def.visual.fuselageLen;
    const wide = this.width > 760 && this.width > this.height;
    let cam, look, distMul = 0.82 + size / 24;
    if (wide) {
      if (this.showcaseMode === 'menu') {
        cam = new THREE.Vector3(9.5, 5.2, 14.5);
        look = new THREE.Vector3(-4.2, 3.1, 0);
      } else if (this.showcaseMode === 'garage') {
        cam = new THREE.Vector3(11, 6, 22);
        look = new THREE.Vector3(0, 3.2, 0);
      } else if (this.showcaseMode === 'upgrades') {
        cam = new THREE.Vector3(10, 5.4, 18);
        look = new THREE.Vector3(-1.4, 3.1, 0);
      } else {
        cam = new THREE.Vector3(11, 5.4, 16);
        look = new THREE.Vector3(0, 3.0, 0);
      }
    } else {
      if (this.showcaseMode === 'menu') {
        cam = new THREE.Vector3(9, 7.2, 27);
        look = new THREE.Vector3(0, 3.2, 0);
      } else if (this.showcaseMode === 'garage') {
        cam = new THREE.Vector3(10, 6.5, 27);
        look = new THREE.Vector3(0, -2.8, 0);
      } else if (this.showcaseMode === 'upgrades') {
        cam = new THREE.Vector3(10, 6.5, 28);
        look = new THREE.Vector3(0, -2.5, 0);
      } else {
        cam = new THREE.Vector3(10, 5.6, 16.5);
        look = new THREE.Vector3(0, 3.3, 0);
      }
    }
    cam.multiplyScalar(distMul);
    look.y += (size - 10) * 0.05;
    return { cam, look };
  }

  updateShowcase(dt) {
    this.showcasePivotRotation += dt * (this.showcaseMode === 'garage' ? 0.1 : 0.24);
    this.showcasePivot.rotation.y = this.showcasePivotRotation;
    if (this.showcasePlane) {
      this.showcasePlane.position.y = this.showcaseOffsetY + Math.sin(this.time * 1.1) * 0.05;
      this.showcasePlane.userData.update(dt, 0.1, false, null, this.time);
    }
    if (this.showcaseStars) this.showcaseStars.rotation.y += dt * 0.008;
    const { cam, look } = this.menuLayout();
    dampV(this.menuCamPos, cam, 2.5, dt);
    dampV(this.menuCamLook, look, 2.5, dt);
    this.camera.position.copy(this.menuCamPos);
    this.camera.fov = damp(this.camera.fov, 52, 3, dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.menuCamLook);
    this.renderer.render(this.sceneShowcase, this.camera);
  }

  disposeShowcase() {
    if (!this.sceneShowcase) return;
    this.showcasePlane?.userData.dispose?.();
    this.sceneShowcase.traverse(o => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach(m => { m.map?.dispose?.(); m.dispose?.(); });
        else { o.material?.map?.dispose?.(); o.material?.dispose?.(); }
      }
    });
    this.sceneShowcase = null;
  }

  bindInput() {
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      if (this.state === 'flight' && (e.code === 'KeyP' || e.code === 'Escape')) this.emit('pause');
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.dragging = false; this.steer.tx = 0; this.steer.ty = 0; });

    const isUi = (t) => t && t.closest && t.closest('button, .screen, .overlay, .no-steer, input');
    window.addEventListener('pointerdown', e => {
      if (this.state !== 'flight' || this.paused) return;
      if (isUi(e.target)) return;
      if (!e.isPrimary) return;
      this.dragging = true;
      this.pointerId = e.pointerId;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
    }, { passive: true });
    window.addEventListener('pointermove', e => {
      if (!this.dragging || e.pointerId !== this.pointerId || this.state !== 'flight') return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.steer.tx = clamp(dx / 95, -1, 1);
      this.steer.ty = clamp(-dy / 95, -1, 1);
    }, { passive: true });
    const endDrag = e => {
      if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = null;
      this.steer.tx = 0;
      this.steer.ty = 0;
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  setBoost(v) { this.manualBoost = v; }
  setBrake(v) { this.manualBrake = v; }
  setPaused(v) {
    if (this.state !== 'flight') return;
    this.paused = v;
    if (v) this.audio.updateEngine(0, 0.05, false);
  }

  startFlight(routeId) {
    this.disposeFlight();
    const route = routeById(routeId);
    this.route = route;
    this.save.data.selectedRoute = route.id;
    this.course = buildCourse(route);
    const scene = new THREE.Scene();
    if (this.envTexture) scene.environment = this.envTexture;
    const shadows = this.quality !== 'low';
    this.world = createWorld(route, this.course, {
      shadows,
      shadowSize: this.quality === 'high' ? 2048 : 1024
    });
    scene.add(this.world.group);
    scene.fog = this.world.fog;
    this.sceneGame = scene;

    this.planeDef = planeById(this.save.data.selectedPlane);
    this.stats = planeStats(this.planeDef, this.save.upgradesFor(this.planeDef.id));
    this.plane = createPlane(this.planeDef, { shadows });
    scene.add(this.plane);
    this.plane.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.plane);
    this.clearance = GROUND_TOP - box.min.y;
    this.planeLength = this.planeDef.visual.fuselageLen;
    this.plane.position.set(0, this.clearance, 132);
    this.plane.rotation.order = 'YXZ';
    this.plane.rotation.set(0, 0, 0);

    this.phase = 'ready';
    this.countdown = 3.9;
    this.lastCountdown = 4;
    this.speed = 0;
    this.throttle = 0.08;
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.vy = 0;
    this.fuel = 100;
    this.boost = false;
    this.gearTarget = 1;
    this.runwayTarget = new THREE.Vector3(route.destX, 0, route.destZ + 120);
    this.distanceFlown = 0;
    this.outsideTimer = 0;
    this.lowFuelWarn = false;
    this.emptyFuelWarn = false;
    this.lowAltWarn = false;
    this.missionsDone = [];
    this.flight = {
      coinPickups: 0, rings: 0, fuelPickups: 0, techPickups: 0,
      boostTime: 0, softLanding: 0, quality: 0, time: 0, missedRings: 0
    };

    this.buildEntities();
    this.trail = new ParticleField(scene, { count: 200, color: '#dff3ff', size: 0.9, opacity: 0.28 });
    this.burst = new ParticleField(scene, { count: 120, color: '#ffb066', size: 1.8, opacity: 0.9 });
    this.engineTimer = 0;

    const beamMat = new THREE.MeshBasicMaterial({
      color: '#66ffc2', transparent: true, opacity: 0.09, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.destBeam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 180, 10, 1, true), beamMat);
    this.destBeam.position.set(route.destX, 90, route.destZ + 120);
    scene.add(this.destBeam);
    const marker = new THREE.Mesh(new THREE.TorusGeometry(16, 0.5, 6, 28), new THREE.MeshBasicMaterial({
      color: '#66ffc2', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    marker.rotation.x = PI / 2;
    marker.position.set(route.destX, 1.2, route.destZ + 120);
    scene.add(marker);
    this.destMarker = marker;

    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.camPos = null;
    this.camLook = new THREE.Vector3();
    this.state = 'flight';
    this.paused = false;
    this.manualBoost = false;
    this.manualBrake = false;
    this.audio.startEngine();
    this.audio.updateEngine(0.12, 0.1, false);
    this.emit('flightstart', { route });
    this.emit('countdown', 4);
  }

  buildEntities() {
    this.rings = [];
    for (let i = 0; i < this.course.rings.length; i++) {
      const r = this.course.rings[i];
      const mesh = createRing();
      mesh.position.copy(r.pos);
      mesh.lookAt(r.pos.clone().add(r.tangent));
      this.sceneGame.add(mesh);
      const ent = { type: 'ring', mesh, data: r, index: i, passed: false };
      this.rings.push(ent);
      this.setRingStyle(ent, i === 0 ? 'current' : 'future');
    }
    this.collectibles = [];
    const add = (type, pos) => {
      let mesh;
      if (type === 'coin') mesh = createCoin();
      else if (type === 'fuel') mesh = createFuel();
      else mesh = createTech();
      mesh.position.copy(pos);
      this.sceneGame.add(mesh);
      this.collectibles.push({ type, mesh, baseY: pos.y, phase: Math.random() * PI * 2, pos: pos.clone(), collected: false });
    };
    for (const p of this.course.coins) add('coin', p);
    for (const p of this.course.fuels) add('fuel', p);
    for (const p of this.course.techs) add('tech', p);
    this.nextRing = 0;
  }

  setRingStyle(ent, style) {
    const m = ent.mesh;
    const torus = m.children[0];
    const glow = m.children[1];
    const inner = m.children[2];
    if (style === 'current') {
      torus.material.color.set('#5ff4ff');
      torus.material.emissive.set('#36dfff');
      torus.material.emissiveIntensity = 1.35;
      glow.material.color.set('#5ff4ff');
      glow.material.opacity = 0.26;
      inner.material.opacity = 0.09;
      m.scale.setScalar(1.05);
    } else if (style === 'passed') {
      torus.material.color.set('#46d68d');
      torus.material.emissive.set('#2fa963');
      torus.material.emissiveIntensity = 0.55;
      glow.material.color.set('#46d68d');
      glow.material.opacity = 0.08;
      inner.material.opacity = 0.02;
      m.scale.setScalar(0.9);
    } else {
      torus.material.color.set('#2f9db8');
      torus.material.emissive.set('#1a6780');
      torus.material.emissiveIntensity = 0.5;
      glow.material.color.set('#2f9db8');
      glow.material.opacity = 0.09;
      inner.material.opacity = 0.03;
      m.scale.setScalar(0.94);
    }
  }

  emitWarning(text, kind = 'warn') {
    const now = this.time;
    if (now - this.lastWarnAt < 3.2) return;
    this.lastWarnAt = now;
    this.emit('warning', { text, kind });
    this.audio.warn();
  }

  updateFlight(dt) {
    this.time += dt;
    const plane = this.plane;
    const route = this.route;
    const stats = this.stats;

    const inputX = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) || this.steer.tx;
    const inputY = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) || this.steer.ty;
    this.steer.x = damp(this.steer.x, clamp(inputX, -1, 1), 7, dt);
    this.steer.y = damp(this.steer.y, clamp(inputY, -1, 1), 7, dt);
    const boostHeld = this.manualBoost || this.keys.Space;
    const brakeHeld = this.manualBrake || this.keys.ShiftLeft || this.keys.ShiftRight;
    const canBoost = boostHeld && this.fuel > 1 && this.phase !== 'ready' && this.phase !== 'takeoff';
    this.boost = canBoost;

    const maxSpeed = stats.speed;
    const speedRatio = clamp(this.speed / maxSpeed, 0, 1.4);

    if (this.phase === 'ready') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCountdown) {
        this.lastCountdown = n;
        this.emit('countdown', Math.max(0, n));
        if (n > 0 && n <= 3) this.audio.tone(440 + (4 - n) * 100, 0.1, 'sine', 0.1);
      }
      this.throttle = damp(this.throttle, 0.12, 2, dt);
      plane.position.y = this.clearance;
      if (this.countdown <= 0) {
        this.phase = 'takeoff';
        this.audio.throttleBurst(true);
        this.emit('countdown', 0);
        this.emit('toast', { text: 'THROTTLE UP', kind: 'info' });
      }
    } else if (this.phase === 'takeoff') {
      this.throttle = damp(this.throttle, 1, 2.2, dt);
      this.speed = damp(this.speed, maxSpeed * 0.62, stats.accel * 1.5, dt);
      plane.position.z -= this.speed * dt;
      plane.position.y = this.clearance;
      this.distanceFlown += this.speed * dt;
      this.pitch = damp(this.pitch, this.speed > 34 ? 0.06 : 0, 2, dt);
      this.roll = damp(this.roll, 0, 3, dt);
      if (this.speed > 58 || plane.position.z < -140) {
        this.phase = 'climb';
        this.audio.whoosh();
        this.emit('toast', { text: 'AIRBORNE', kind: 'good' });
      }
    } else {
      this.throttle = damp(this.throttle, this.fuel <= 0 ? 0.32 : canBoost ? 1 : brakeHeld ? 0.42 : 0.8, 2.4, dt);
      const targetSpeed = maxSpeed * this.throttle * (canBoost ? 1.3 : 1);
      const accelRate = this.throttle > this.speed / maxSpeed ? stats.accel * 0.95 : stats.accel * 1.3;
      this.speed = damp(this.speed, targetSpeed, accelRate, dt);
    }

    if (this.phase === 'climb') {
      const autoPitch = plane.position.y - this.clearance < 42 ? 0.2 : 0.03;
      this.pitch = damp(this.pitch, clamp(autoPitch + this.steer.y * 0.32, -0.32, 0.42), 1.6, dt);
      this.roll = damp(this.roll, -this.steer.x * 0.5, 2.4, dt);
      this.yaw -= this.steer.x * stats.handling * 0.45 * dt;
      if (plane.position.y - this.clearance > 46) {
        this.phase = 'cruise';
        this.emit('toast', { text: 'CLIMB COMPLETE', kind: 'info' });
      }
      this.gearTarget = 0;
    } else if (this.phase === 'cruise' || this.phase === 'approach') {
      let targetPitch = this.steer.y * 0.4;
      if (this.fuel <= 0) targetPitch = Math.min(targetPitch, -0.06);
      const altitude = plane.position.y - this.clearance;
      if (altitude > 250) targetPitch = Math.min(targetPitch, -0.22);
      this.pitch = damp(this.pitch, targetPitch, 2.3, dt);
      this.roll = damp(this.roll, -this.steer.x * 0.72, 3, dt);
      this.yaw -= this.steer.x * stats.handling * dt * (0.45 + speedRatio * 0.55);
      const gearDown = this.phase === 'approach' ? 1 : (altitude < 42 ? 1 : 0);
      this.gearTarget = gearDown;
    }

    if (this.phase !== 'ready' && this.phase !== 'takeoff') {
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      plane.position.addScaledVector(forward, this.speed * dt);
      this.distanceFlown += this.speed * dt;
      this.vy = forward.y * this.speed;
    }

    plane.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    plane.userData.update(dt, speedRatio, this.boost, this.gearTarget, this.time);

    const altitude = plane.position.y - this.clearance;
    const dest = route;
    const onDestRunway = Math.abs(plane.position.x - dest.destX) < 17 && (plane.position.z - dest.destZ) > -178 && (plane.position.z - dest.destZ) < 178;
    const onStartRunway = Math.abs(plane.position.x) < 17 && plane.position.z < 180 && plane.position.z > -178;

    if (this.phase !== 'ready' && this.phase !== 'takeoff') {
      this.fuel = Math.max(0, this.fuel - stats.fuelEconomy * (0.42 + this.throttle * 0.72 + (canBoost ? 0.85 : 0)) * dt);
      if (this.fuel <= 22 && this.fuel > 0 && !this.lowFuelWarn) {
        this.lowFuelWarn = true;
        this.emitWarning('LOW FUEL — FIND A CANISTER', 'warn');
      }
      if (this.fuel <= 0 && !this.emptyFuelWarn) {
        this.emptyFuelWarn = true;
        this.emitWarning('ENGINE FLAMEOUT — GLIDE TO THE RUNWAY', 'danger');
        this.audio.warn();
      }
      if (this.boost) this.flight.boostTime += dt;
    }

    this.updateCollectibles(dt);
    this.updateRings();

    if (this.phase === 'cruise' || this.phase === 'approach') {
      if (this.nextRing >= this.rings.length && this.phase !== 'approach') {
        this.phase = 'approach';
        this.gearTarget = 1;
        this.destBeam.material.opacity = 0.22;
        this.emit('toast', { text: 'FINAL APPROACH — LAND AT THE RUNWAY', kind: 'good' });
        this.audio.ring();
      }
      if (altitude < 1.05) {
        if (onDestRunway) this.finishLanding();
        else if (altitude < 0.4) this.crash('You hit the ground short of the runway');
      } else if (altitude < 12 && !this.lowAltWarn) {
        this.lowAltWarn = true;
        this.emitWarning('PULL UP — LOW ALTITUDE', 'danger');
      } else if (altitude > 30) this.lowAltWarn = false;

      if (this.phase === 'approach' && plane.position.z < dest.destZ - 230) {
        this.crash('You overflew the destination runway');
      }
    }

    if (onDestRunway && this.phase === 'approach' && altitude > 1.05 && altitude < 45) {
      this.emit('landing-guide', { height: altitude, distance: plane.position.z - (dest.destZ + 120) });
    }

    const target = this.getTarget();
    if (target) {
      const dist = target.distanceTo(plane.position);
      if (dist > 720) {
        this.outsideTimer += dt;
        if (this.outsideTimer > 1.5) this.emitWarning('RETURN TO THE FLIGHT CORRIDOR', 'warn');
        if (this.outsideTimer > 11) this.crash('You left the flight corridor');
      } else this.outsideTimer = Math.max(0, this.outsideTimer - dt * 2);
    }

    if (this.phase === 'takeoff' && plane.position.z < -200) {
      plane.position.z = -200;
    }
    if (this.phase === 'takeoff' && plane.position.z < -120) {
      this.phase = 'climb';
    }

    this.particleUpdate(dt, speedRatio);
    this.world.update(this.time, dt, plane.position);
    this.audio.updateEngine(speedRatio, this.throttle, this.boost);
    this.updateCamera(dt);
    this.flight.time += dt;
    this.emit('tick');
  }

  getTarget() {
    if (this.phase === 'approach' || this.nextRing >= this.rings.length) {
      return new THREE.Vector3(this.route.destX, 0, this.route.destZ + 120);
    }
    return this.rings[this.nextRing]?.data.pos.clone() || null;
  }

  updateCollectibles(dt) {
    const planePos = this.plane.position;
    const collectR = 7 + this.planeLength * 0.13;
    for (const c of this.collectibles) {
      if (c.collected) continue;
      const mesh = c.mesh;
      mesh.rotation.y += dt * (c.type === 'coin' ? 2.4 : 1.2);
      if (c.type === 'tech') {
        mesh.userData.core.rotation.y += dt * 1.6;
        mesh.userData.ring2.rotation.z += dt * 1.1;
      }
      mesh.position.y = c.baseY + Math.sin(this.time * 1.8 + c.phase) * 1.2;
      if (c.type === 'coin' || c.type === 'tech') {
        const d = mesh.position.distanceTo(planePos);
        if (d < 22) {
          const dir = planePos.clone().sub(mesh.position).normalize();
          mesh.position.addScaledVector(dir, dt * 30);
        }
      }
      const d2 = mesh.position.distanceToSquared(planePos);
      if (d2 < collectR * collectR) {
        c.collected = true;
        this.sceneGame.remove(mesh);
        this.collect(c.type);
      }
    }
  }

  collect(type) {
    if (type === 'coin') {
      this.flight.coinPickups++;
      this.audio.coin(this.flight.coinPickups);
      this.emit('pickup', { type, text: '+8' });
    } else if (type === 'fuel') {
      this.flight.fuelPickups++;
      this.fuel = Math.min(100, this.fuel + 34);
      this.audio.fuel();
      this.lowFuelWarn = false;
      this.emptyFuelWarn = false;
      this.emit('pickup', { type, text: '+FUEL' });
      this.emit('toast', { text: 'FUEL +34', kind: 'good' });
    } else {
      this.flight.techPickups++;
      this.audio.tech();
      this.emit('pickup', { type, text: '+TECH' });
      this.emit('toast', { text: 'TECH CORE COLLECTED', kind: 'tech' });
    }
  }

  updateRings() {
    if (this.nextRing >= this.rings.length) return;
    const ent = this.rings[this.nextRing];
    const pos = ent.data.pos;
    const dist = pos.distanceTo(this.plane.position);
    const tangent = ent.data.tangent;
    const dot = this.plane.position.clone().sub(pos).dot(tangent);
    if (dist < 27) {
      ent.passed = true;
      this.nextRing++;
      this.flight.rings++;
      this.setRingStyle(ent, 'passed');
      this.audio.ring();
      this.emit('ring', { index: this.flight.rings, total: this.rings.length });
      this.emit('pickup', { type: 'ring', text: '+15' });
      if (this.nextRing < this.rings.length) this.setRingStyle(this.rings[this.nextRing], 'current');
      if (this.nextRing >= this.rings.length) {
        this.phase = 'approach';
        this.gearTarget = 1;
        this.destBeam.material.opacity = 0.25;
        this.emit('toast', { text: 'FINAL APPROACH — LAND AT THE RUNWAY', kind: 'good' });
      }
    } else if (dot > 26 && dist > 32) {
      ent.passed = true;
      this.flight.missedRings++;
      this.nextRing++;
      this.setRingStyle(ent, 'passed');
      this.emit('toast', { text: 'RING MISSED', kind: 'warn' });
      if (this.nextRing < this.rings.length) this.setRingStyle(this.rings[this.nextRing], 'current');
      if (this.nextRing >= this.rings.length) {
        this.phase = 'approach';
        this.gearTarget = 1;
        this.destBeam.material.opacity = 0.25;
        this.emit('toast', { text: 'FINAL APPROACH — LAND AT THE RUNWAY', kind: 'good' });
      }
    }
  }

  particleUpdate(dt, speedRatio) {
    if (this.trail) {
      this.engineTimer -= dt;
      if (this.engineTimer <= 0 && this.phase !== 'ready') {
        this.engineTimer = this.boost ? 0.018 : 0.045;
        const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(this.pitch * 0.4, this.yaw, 0, 'YXZ'));
        const p = this.plane.position.clone().addScaledVector(back, this.planeLength * 0.52);
        p.x += (Math.random() - 0.5) * 1.4;
        p.y += (Math.random() - 0.5) * 1.4;
        this.trail.spawn(p, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.8 + Math.random() * 0.7);
      }
      this.trail.update(dt);
    }
    if (this.burst) this.burst.update(dt);
  }

  updateCamera(dt) {
    const plane = this.plane;
    const speedRatio = clamp(this.speed / this.stats.speed, 0, 1.3);
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const sizeF = 0.85 + this.planeLength / 22;
    const dist = (this.phase === 'ready' || this.phase === 'takeoff' ? 20 : 24) * sizeF;
    const height = (this.phase === 'ready' || this.phase === 'takeoff' ? 5.2 : 7.4) * sizeF;
    const desired = plane.position.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, height, 0));
    if (desired.y < 3.2) desired.y = 3.2;
    const look = plane.position.clone().addScaledVector(forward, 30).add(new THREE.Vector3(0, 2.4 + this.planeLength * 0.06, 0));
    if (!this.camPos) {
      this.camPos = desired.clone();
      this.camLook.copy(look);
    }
    dampV(this.camPos, desired, 3.6, dt);
    dampV(this.camLook, look, 5.2, dt);
    const targetFov = 58 + speedRatio * 10 + (this.boost ? 4 : 0);
    this.camera.fov = damp(this.camera.fov, targetFov, 3, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.02, dt);
    }
    this.camera.lookAt(this.camLook);
  }

  crash(reason) {
    if (this.phase === 'crashed' || this.phase === 'landed') return;
    this.phase = 'crashed';
    this.crashReason = reason;
    this.speed = 0;
    this.boost = false;
    this.shake = 2.2;
    this.audio.stopEngine();
    this.audio.crash();
    if (this.burst) {
      const p = this.plane.position.clone();
      for (let i = 0; i < 80; i++) {
        this.burst.spawn(
          p, (Math.random() - 0.5) * 34, Math.random() * 26, (Math.random() - 0.5) * 34,
          0.5 + Math.random() * 0.9
        );
      }
    }
    this.plane.rotation.z = 0.7;
    this.plane.position.y += 0.4;
    this.emit('toast', { text: reason, kind: 'danger' });
    setTimeout(() => { if (this.state === 'flight' && this.phase === 'crashed') this.completeFlight(false); }, 1700);
  }

  finishLanding() {
    if (this.phase === 'landed') return;
    const route = this.route;
    const stats = this.stats;
    const plane = this.plane;
    const altitude = plane.position.y - this.clearance;
    const centerErr = Math.abs(plane.position.x - route.destX) / 17;
    const speedRatio = this.speed / stats.speed;
    const descent = Math.abs(this.vy);
    const quality = clamp(
      0.38 * (1 - clamp(centerErr, 0, 1)) +
      0.34 * (1 - clamp((speedRatio - 0.3) / 0.62, 0, 1)) +
      0.28 * (1 - clamp(descent / 26, 0, 1)),
      0.12, 1
    );
    this.flight.quality = quality;
    this.flight.softLanding = quality >= 0.62 ? 1 : 0;
    this.phase = 'landed';
    this.speed = 0;
    this.boost = false;
    this.plane.position.y = this.clearance;
    this.plane.rotation.x = 0;
    this.plane.rotation.z = 0;
    this.yaw = Math.round(this.yaw / PI) * PI;
    this.gearTarget = 1;
    this.audio.stopEngine();
    this.audio.softLanding();
    if (this.burst) {
      const p = plane.position.clone(); p.y = 0.7;
      for (let i = 0; i < 26; i++) {
        this.burst.spawn(p, (Math.random() - 0.5) * 12, Math.random() * 4, (Math.random() - 0.5) * 12, 0.5 + Math.random() * 0.5);
      }
    }
    this.emit('toast', { text: quality >= 0.78 ? 'BUTTER! PERFECT LANDING' : 'TOUCHDOWN — WELCOME', kind: 'good' });
    setTimeout(() => { if (this.state === 'flight' && this.phase === 'landed') this.completeFlight(true); }, 1500);
  }

  completeFlight(success) {
    if (this.state === 'result') return;
    const route = this.route;
    const save = this.save.data;
    const f = this.flight;
    const firstClear = success && !save.stars[route.id];
    const quality = success ? f.quality : 0;
    let stars = 0;
    if (success) {
      stars = 1;
      if (f.rings >= this.rings.length * 0.7) stars++;
      if (quality >= 0.68) stars++;
    }
    const coinPickups = f.coinPickups;
    const ringCoins = success ? f.rings * 15 : Math.floor(f.rings * 6);
    const landingCoins = success ? Math.round(150 + quality * 280) : 0;
    const routeBonus = success ? Math.round(route.baseReward * (firstClear ? 1 : 0.35)) : 0;
    let missionCoins = 0;
    let missionTech = 0;
    const missionResults = [];
    const defs = MISSIONS[route.id] || [];
    const claims = save.missionClaims[route.id] || {};
    for (const m of defs) {
      let val = 0;
      if (m.type === 'rings') val = f.rings;
      else if (m.type === 'coins') val = f.coinPickups;
      else if (m.type === 'fuel') val = f.fuelPickups;
      else if (m.type === 'tech') val = f.techPickups;
      else if (m.type === 'boostTime') val = f.boostTime;
      else if (m.type === 'softLanding') val = f.softLanding;
      const complete = val >= m.target;
      let claimed = !!claims[m.id];
      if (success && complete && !claimed) {
        claims[m.id] = true;
        missionCoins += m.reward;
        missionTech += m.tech;
        claimed = true;
        this.audio.mission();
      }
      missionResults.push({ id: m.id, name: m.name, desc: m.desc, val: Math.min(val, m.target), target: m.target, complete, claimed, reward: m.reward, tech: m.tech, icon: m.icon });
    }
    save.missionClaims[route.id] = claims;

    const achUnlocked = [];
    const statSnapshot = {
      coins: save.stats.coins + coinPickups,
      rings: save.stats.rings + f.rings,
      landings: save.stats.landings + (success ? 1 : 0),
      perfectLandings: save.stats.perfectLandings + (success && quality >= 0.78 ? 1 : 0),
      planes: save.unlockedPlanes.length,
      evolutions: save.stats.evolutions,
      routesCompleted: Object.keys(save.stars).length + (success && !save.stars[route.id] ? 1 : 0),
      flights: save.stats.flights + 1
    };
    let achievementCoins = 0;
    for (const a of ACHIEVEMENTS) {
      if (!save.achievements[a.id] && (statSnapshot[a.stat] || 0) >= a.target) {
        save.achievements[a.id] = Date.now();
        achievementCoins += 150;
        achUnlocked.push(a);
      }
    }

    const totalCoins = coinPickups * 8 + ringCoins + landingCoins + routeBonus + missionCoins + achievementCoins;
    const xpGain = success ? Math.round(110 + f.rings * 11 + coinPickups * 2 + quality * 90 + (firstClear ? 130 : 25) + f.techPickups * 20) : Math.round(25 + coinPickups);
    save.coins += totalCoins;
    save.tech += f.techPickups + missionTech;
    save.xp += xpGain;
    save.stats.coins += coinPickups;
    save.stats.rings += f.rings;
    save.stats.flights += 1;
    save.stats.distance += Math.round(this.distanceFlown);
    save.stats.fuel += f.fuelPickups;
    save.stats.tech += f.techPickups;
    if (success) {
      save.stats.landings += 1;
      if (quality >= 0.78) save.stats.perfectLandings += 1;
      save.stars[route.id] = Math.max(save.stars[route.id] || 0, stars);
      save.best[route.id] = Math.max(save.best[route.id] || 0, Math.round(quality * 100));
    }
    save.stats.routesCompleted = Object.keys(save.stars).length;
    const routeIndex = ROUTES.findIndex(r => r.id === route.id);
    const nextRoute = ROUTES[routeIndex + 1] || null;
    if (success && nextRoute) {
      save.routeUnlocks[nextRoute.id] = true;
      save.selectedRoute = nextRoute.id;
    }
    save.selectedRoute = success ? (nextRoute ? nextRoute.id : route.id) : route.id;
    this.save.save();
    this.audio.updateEngine(0, 0, false);
    this.result = {
      success, route: route.id, routeName: route.name, stars, quality,
      rings: f.rings, ringsTotal: this.rings.length, coinPickups, fuelPickups: f.fuelPickups,
      techPickups: f.techPickups, coins: totalCoins, xp: xpGain, time: f.time,
      firstClear, missionCoins, missionTech, achievementCoins, missions: missionResults,
      achievements: achUnlocked, nextRoute: nextRoute ? nextRoute.id : null,
      newLevel: levelFromXp(save.xp), reason: this.crashReason || '',
      perfect: quality >= 0.78
    };
    this.state = 'result';
    this.emit('result', this.result);
  }

  quitFlight() {
    this.disposeFlight();
    this.state = 'showcase';
    this.showcaseMode = 'menu';
    this.audio.stopEngine();
    this.refreshShowcasePlane();
    this.menuCamPos.set(9, 5, 15);
    this.emit('quit');
  }

  disposeFlight() {
    this.audio.stopEngine();
    this.trail?.dispose(); this.trail = null;
    this.burst?.dispose(); this.burst = null;
    if (this.plane) {
      this.sceneGame?.remove(this.plane);
      this.plane.userData.dispose?.();
      this.plane = null;
    }
    if (this.world) {
      this.sceneGame?.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    if (this.rings) {
      for (const r of this.rings) r.mesh.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
    }
    if (this.collectibles) {
      for (const c of this.collectibles) c.mesh.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
    }
    this.rings = []; this.collectibles = [];
    this.sceneGame = null;
    this.camPos = null;
  }

  getHUD() {
    if (this.state !== 'flight' && this.state !== 'result') return null;
    if (!this.plane || !this.route) return null;
    const route = this.route;
    const altitude = Math.max(0, this.plane.position.y - this.clearance);
    const target = this.getTarget();
    let targetDist = 0, targetAngle = 0;
    if (target) {
      const dx = target.x - this.plane.position.x;
      const dz = target.z - this.plane.position.z;
      targetDist = Math.hypot(dx, dz);
      const worldAngle = Math.atan2(-dx, -dz);
      targetAngle = smoothAngle(worldAngle - this.yaw);
    }
    const missions = (MISSIONS[route.id] || []).map(m => {
      const claims = this.save.data.missionClaims[route.id] || {};
      let val = 0;
      if (m.type === 'rings') val = this.flight.rings;
      else if (m.type === 'coins') val = this.flight.coinPickups;
      else if (m.type === 'fuel') val = this.flight.fuelPickups;
      else if (m.type === 'tech') val = this.flight.techPickups;
      else if (m.type === 'boostTime') val = this.flight.boostTime;
      else if (m.type === 'softLanding') val = this.flight.softLanding;
      return { ...m, val: Math.min(val, m.target), complete: val >= m.target, claimed: !!claims[m.id] };
    });
    return {
      phase: this.phase, route, speed: Math.round(this.speed * 3.1),
      maxSpeed: Math.round(this.stats.speed * 3.1),
      altitude: Math.round(altitude * 8), fuel: this.fuel, throttle: this.throttle,
      boost: this.boost, rings: this.flight.rings, ringsTotal: this.rings.length,
      nextRing: this.nextRing, coins: this.flight.coinPickups * 8 + this.flight.rings * 15,
      coinPickups: this.flight.coinPickups, techPickups: this.flight.techPickups,
      targetDist: Math.round(targetDist), targetAngle,
      progress: this.flight.rings / this.rings.length,
      missionProgress: missions,
      countdown: this.phase === 'ready' ? Math.max(0, Math.ceil(this.countdown)) : 0,
      gearDown: this.gearTarget === 1,
      quality: this.flight.quality,
      landingPhase: this.phase === 'approach',
      offCourse: this.outsideTimer > 0.5
    };
  }

  tick(dt) {
    dt = Math.min(dt, 0.05);
    if (this.state === 'showcase') {
      this.time += dt;
      this.updateShowcase(dt);
      return;
    }
    if (this.state === 'flight' || this.state === 'result') {
      if (this.state === 'result') {
        this.updatePostFlight(dt);
        this.world?.update(this.time, dt, this.plane?.position);
        if (this.plane) this.plane.userData.update(dt, 0.05, false, 1, this.time);
        this.updateCamera(dt);
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);
        this.renderer.render(this.sceneGame, this.camera);
        return;
      }
      if (!this.paused) {
        this.time += dt;
        this.updateFlight(dt);
        this.renderer.render(this.sceneGame, this.camera);
        return;
      }
      this.renderer.render(this.sceneGame, this.camera);
    }
  }

  updatePostFlight(dt) {
    if (!this.plane) return;
    if (this.phase === 'crashed') {
      this.plane.rotation.z = damp(this.plane.rotation.z, 1.2, 2, dt);
      this.plane.position.y = Math.max(this.clearance, this.plane.position.y - dt * 2);
    } else if (this.phase === 'landed') {
      this.plane.rotation.z = damp(this.plane.rotation.z, 0, 4, dt);
    }
    this.plane.userData.update(dt, 0.02, false, 1, this.time);
    this.burst?.update(dt);
  }
}
