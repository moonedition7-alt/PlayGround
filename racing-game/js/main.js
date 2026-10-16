import * as THREE from 'three';
import { buildWorld, distToRoad } from './world.js';
import { createCar, setBrakeLight, CAR_STATS } from './car.js';
import { input, initKeyboard, initTouch, resetInput } from './input.js';
import { GameAudio } from './audio.js';

// ---------- Setup ----------
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2000);

const world = buildWorld(scene);
const audio = new GameAudio();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- State ----------
const state = {
  started: false, paused: false,
  carStyle: 'veloce', carColor: '#ffd400', mode: 'freeroam',
  camMode: 0, // 0 chase, 1 cockpit, 2 cinematic
  time: 0, lap: 1, totalLaps: 3, lapStart: 0, bestLap: Infinity, lastLap: 0,
  score: 0, scoreTime: 90, nitro: 100,
  prevT: 0, cineTimer: 0,
};

const player = {
  mesh: null, car: null, stats: CAR_STATS.veloce,
  pos: new THREE.Vector3(), yaw: 0, speed: 0, steer: 0,
  vel: new THREE.Vector3(), driftAmt: 0,
};

// Headlight for player
let headlightL, headlightR;

// Traffic
const traffic = []; // {mesh,car,t,speed,lane,stats}
const TRAFFIC_COUNT = 8;

// Particles (drift smoke)
const smokePool = [];
function initSmoke() {
  const geo = new THREE.SphereGeometry(0.5, 6, 6);
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xcfd6e4, transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m);
    smokePool.push({ m, life: 0 });
  }
}
initSmoke();
function spawnSmoke(x, y, z) {
  const p = smokePool.find((s) => s.life <= 0);
  if (!p) return;
  p.life = 0.7; p.m.visible = true;
  p.m.position.set(x, y, z);
  p.m.scale.setScalar(0.6 + Math.random() * 0.6);
  p.m.material.opacity = 0.55;
}
function updateSmoke(dt) {
  for (const p of smokePool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.m.position.y += dt * 1.5;
    p.m.scale.multiplyScalar(1 + dt * 2);
    p.m.material.opacity = Math.max(0, p.life * 0.7);
    if (p.life <= 0) p.m.visible = false;
  }
}

// Nitro flames
let flameL, flameR;
function addFlames(group) {
  const g = new THREE.ConeGeometry(0.16, 0.9, 8);
  const m = new THREE.MeshBasicMaterial({ color: 0x33ccff });
  flameL = new THREE.Mesh(g, m); flameR = new THREE.Mesh(g, m.clone());
  flameL.rotation.x = -Math.PI / 2; flameR.rotation.x = -Math.PI / 2;
  flameL.position.set(-0.5, 0.55, -2.7); flameR.position.set(0.5, 0.55, -2.7);
  flameL.visible = flameR.visible = false;
  group.add(flameL, flameR);
}

// ---------- Build / reset cars ----------
function buildPlayer() {
  if (player.mesh) scene.remove(player.mesh);
  player.stats = CAR_STATS[state.carStyle];
  const c = createCar(state.carStyle, state.carColor);
  player.car = c; player.mesh = c.group;
  scene.add(player.mesh);
  addFlames(player.mesh);
  // headlights
  headlightL = new THREE.SpotLight(0xddf2ff, 180, 70, 0.5, 0.5);
  headlightR = headlightL.clone();
  scene.add(headlightL, headlightR, headlightL.target, headlightR.target);
  resetCarToStart();
}

function resetCarToStart() {
  const { pos, yaw } = world.startPose;
  // offset behind line slightly, right lane
  player.pos.copy(pos);
  player.yaw = yaw;
  player.speed = 0; player.steer = 0; player.vel.set(0, 0, 0);
  state.nitro = 100;
  state.prevT = world.curve ? 0 : 0;
  syncMesh();
}

function buildTraffic() {
  for (const t of traffic) scene.remove(t.mesh);
  traffic.length = 0;
  const styles = ['veloce', 'rossa', 'noir'];
  const colors = ['#ff5a5a', '#38e1ff', '#c0c8d8', '#7CFC00', '#ff9a1f', '#b06bff', '#ffffff', '#222831'];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const s = styles[i % 3];
    const c = createCar(s, colors[i % colors.length]);
    scene.add(c.group);
    traffic.push({
      mesh: c.group, car: c, t: i / TRAFFIC_COUNT,
      speed: 13 + Math.random() * 9, lane: (i % 2 === 0 ? 3.2 : -3.2),
      stats: CAR_STATS[s],
    });
  }
}

function syncMesh() {
  player.mesh.position.copy(player.pos);
  player.mesh.position.y = 0;
  player.mesh.rotation.set(0, player.yaw, 0);
}

// ---------- UI refs ----------
const $ = (id) => document.getElementById(id);
const menu = $('menu'), hud = $('hud'), pauseEl = $('pause'), resultEl = $('result');
const speedEl = $('speed'), rpmEl = document.querySelector('#rpm-bar i');
const nitroEl = document.querySelector('#nitro-bar i'), gearEl = $('gear');
const timerEl = $('timer'), lapEl = $('lap-info'), scoreEl = $('score-info');
const msgEl = $('message'), mmap = $('minimap').getContext('2d');

function showMessage(text, ms = 1600) {
  msgEl.textContent = text;
  msgEl.style.opacity = 1;
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => (msgEl.style.opacity = 0), ms);
}
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}

// Menu wiring
document.querySelectorAll('.car-card').forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll('.car-card').forEach((e) => e.classList.remove('selected'));
    el.classList.add('selected');
    state.carStyle = el.dataset.car;
    audio.init(); audio.beep(520);
    previewCar();
  };
});
document.querySelectorAll('.color-dot').forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll('.color-dot').forEach((e) => e.classList.remove('selected'));
    el.classList.add('selected');
    state.carColor = el.dataset.color;
    audio.init(); audio.beep(660);
    previewCar();
  };
});
document.querySelectorAll('.mode-btn').forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll('.mode-btn').forEach((e) => e.classList.remove('selected'));
    el.classList.add('selected');
    state.mode = el.dataset.mode;
    audio.init(); audio.beep(440);
  };
});

// Preview car behind menu (simple orbit while in menu)
let preview = null;
function previewCar() {
  if (preview) scene.remove(preview.group);
  preview = createCar(state.carStyle, state.carColor);
  preview.group.position.set(world.startPose.pos.x, 0, world.startPose.pos.z);
  preview.group.rotation.y = world.startPose.yaw + 0.5;
  scene.add(preview.group);
}

// ---------- Game flow ----------
$('start-btn').onclick = () => {
  audio.init();
  audio.beep(880, 0.2);
  if (preview) { scene.remove(preview.group); preview = null; }
  buildPlayer();
  buildTraffic();
  resetInput();
  state.started = true; state.paused = false;
  state.time = 0; state.lap = 1; state.score = 0; state.scoreTime = 90;
  state.lapStart = 0; state.bestLap = Infinity; state.prevT = 0.0;
  state.camMode = 0;
  menu.classList.add('hidden'); resultEl.classList.add('hidden');
  hud.classList.remove('hidden');
  initTouch();
  $('touch').classList.toggle('hidden', !('ontouchstart' in window || navigator.maxTouchPoints > 0) && innerWidth > 820);
  lapEl.classList.toggle('hidden', state.mode === 'traffic');
  scoreEl.classList.toggle('hidden', state.mode !== 'traffic');
  if (state.mode === 'freeroam') lapEl.textContent = 'FREE ROAM';
  else if (state.mode === 'timetrial') lapEl.textContent = `LAP 1/${state.totalLaps}`;
  showMessage(state.mode === 'freeroam' ? 'FREE ROAM — DRIVE!' : 'GO!', 1500);
  audio.beep(880, 0.3);
};
$('pause-btn').onclick = togglePause;
$('resume-btn').onclick = togglePause;
$('quit-btn').onclick = () => {
  state.started = false; pauseEl.classList.add('hidden');
  hud.classList.add('hidden'); menu.classList.remove('hidden');
  previewCar();
};
$('again-btn').onclick = () => { resultEl.classList.add('hidden'); $('start-btn').click(); };
$('menu-btn').onclick = () => {
  resultEl.classList.add('hidden'); state.started = false;
  hud.classList.add('hidden'); menu.classList.remove('hidden');
  previewCar();
};
$('reset-btn').onclick = () => { resetCarToStart(); showMessage('RESET', 800); };
$('cam-btn').onclick = cycleCam;
$('mute-btn').onclick = (e) => {
  audio.init();
  const m = audio.toggleMute();
  e.target.textContent = m ? '🔇' : '🔊';
};
function togglePause() {
  if (!state.started) return;
  state.paused = !state.paused;
  pauseEl.classList.toggle('hidden', !state.paused);
}
function cycleCam() {
  state.camMode = (state.camMode + 1) % 3;
  showMessage(['CHASE CAM', 'COCKPIT CAM', 'CINEMATIC CAM'][state.camMode], 900);
}

initKeyboard((code, down) => {
  if (!down) return;
  if (code === 'KeyC') cycleCam();
  if (code === 'KeyR' && state.started) { resetCarToStart(); }
  if (code === 'KeyP' || code === 'Escape') togglePause();
  if (code === 'Enter' && !state.started && !menu.classList.contains('hidden')) $('start-btn').click();
});

// ---------- Physics ----------
const fwd = new THREE.Vector3();
function updatePlayer(dt) {
  const s = player.stats;
  const offroad = distToRoad(world.curve, player.pos.x, player.pos.z).dist > world.roadWidth / 2 + 1.5;
  const throttle = input.up ? 1 : 0;
  const braking = input.down ? 1 : 0;
  const wantNitro = input.nitro && state.nitro > 1 && throttle > 0;

  let accel = 0;
  if (throttle) accel += s.accel * (wantNitro ? 1.9 : 1);
  if (braking) {
    if (player.speed > 1) accel -= 34; // brake
    else accel -= 12; // reverse
  }
  // drag
  accel -= player.speed * 0.32;
  accel -= Math.sign(player.speed) * (offroad ? 9 : 2.2);
  if (wantNitro) {
    state.nitro = Math.max(0, state.nitro - dt * 28);
    if (Math.random() < 0.6) spawnSmoke(player.pos.x, 0.5, player.pos.z);
  } else {
    state.nitro = Math.min(100, state.nitro + dt * 7);
  }
  const maxSpd = s.topSpeed * (wantNitro ? 1.32 : 1) * (offroad ? 0.55 : 1);
  player.speed += accel * dt;
  player.speed = THREE.MathUtils.clamp(player.speed, -16, maxSpd);
  if (!throttle && !braking && Math.abs(player.speed) < 0.4) player.speed = 0;

  // steering
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  player.steer += (steerTarget * 0.9 - player.steer) * Math.min(1, dt * 8);
  const drifting = input.drift && Math.abs(player.speed) > 8;
  const grip = drifting ? s.driftGrip : s.grip;
  const spdF = THREE.MathUtils.clamp(Math.abs(player.speed) / 12, 0, 1);
  const turnRate = player.steer * (1.9 - spdF * 0.9) * Math.min(1, Math.abs(player.speed) / 6);
  player.yaw += turnRate * grip * 0.55 * dt * Math.sign(player.speed || 1);
  player.driftAmt += ((drifting ? 1 : 0) - player.driftAmt) * Math.min(1, dt * 6);

  fwd.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  player.pos.addScaledVector(fwd, player.speed * dt);

  // building collisions (circle vs AABB on XZ)
  const r = 1.4;
  for (const box of world.colliders) {
    if (Math.abs(player.pos.y) > 0 && false) continue;
    const cx = THREE.MathUtils.clamp(player.pos.x, box.min.x, box.max.x);
    const cz = THREE.MathUtils.clamp(player.pos.z, box.min.z, box.max.z);
    const dx = player.pos.x - cx, dz = player.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && player.pos.y < box.max.y) {
      const d = Math.sqrt(d2) || 0.001;
      const push = (r - d);
      player.pos.x += (dx / d) * push;
      player.pos.z += (dz / d) * push;
      const impact = Math.abs(player.speed);
      if (impact > 8) {
        audio.crash(impact / 30);
        showMessage('CRASH!', 700);
        spawnSmoke(player.pos.x, 1, player.pos.z);
      }
      player.speed *= 0.35;
    }
  }
  // world bounds
  const R = 640;
  if (player.pos.length() > R) {
    player.pos.setLength(R);
    player.speed *= 0.5;
  }

  // traffic collisions
  for (const t of traffic) {
    const dx = player.pos.x - t.mesh.position.x, dz = player.pos.z - t.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.2) {
      const impact = Math.abs(player.speed - t.speed);
      audio.crash(0.5 + impact / 40);
      const nx = dx / (d || 1), nz = dz / (d || 1);
      player.pos.x += nx * (3.2 - d); player.pos.z += nz * (3.2 - d);
      player.speed *= 0.55;
      if (state.mode === 'traffic') { state.score = Math.max(0, state.score - 25); showMessage('-25 CRASH', 700); }
      spawnSmoke(player.pos.x, 1, player.pos.z);
    } else if (state.mode === 'traffic' && d < 7 && Math.abs(player.speed) > 25 && !t.counted) {
      t.counted = true; state.score += 50;
      showMessage('NEAR MISS +50', 700);
      setTimeout(() => (t.counted = false), 3000);
    }
  }

  syncMesh();

  // visuals: body roll/pitch, wheels, brake light, flames
  const b = player.car.body;
  b.rotation.z = -player.steer * spdF * 0.12 - player.driftAmt * player.steer * 0.25;
  b.rotation.x = THREE.MathUtils.clamp(-accel * 0.004, -0.05, 0.06);
  b.position.y = Math.sin(performance.now() * 0.02) * 0.008 * Math.min(1, Math.abs(player.speed) / 20);
  for (const w of player.car.wheels) {
    w.rotation.x += (player.speed / 0.36) * dt;
    if (w.userData.front) w.rotation.y = player.steer * 0.45;
  }
  setBrakeLight(player.car, braking);
  const flames = wantNitro && Math.abs(player.speed) > 2;
  flameL.visible = flameR.visible = flames;
  if (flames) {
    const f = 0.7 + Math.random() * 0.7;
    flameL.scale.set(1, 1, f); flameR.scale.set(1, 1, f);
  }

  // drift smoke + audio
  if (drifting || (Math.abs(player.steer) > 0.7 && Math.abs(player.speed) > 24)) {
    spawnSmoke(player.pos.x - fwd.x * 1.8, 0.4, player.pos.z - fwd.z * 1.8);
    audio.skid(0.8);
  } else audio.skid(0);

  // headlights follow
  const hl = new THREE.Vector3(player.pos.x + fwd.x * 2, 0.7, player.pos.z + fwd.z * 2);
  const tgt = new THREE.Vector3(player.pos.x + fwd.x * 30, 0, player.pos.z + fwd.z * 30);
  headlightL.position.copy(hl); headlightR.position.copy(hl);
  headlightL.target.position.copy(tgt); headlightR.target.position.copy(tgt);

  // audio engine: gear + rpm from speed
  const gear = player.speed < -0.5 ? 'R' : String(Math.min(6, 1 + Math.floor(Math.abs(player.speed) / 10)));
  const rpm01 = player.speed < 0 ? 0.25 : (Math.abs(player.speed) % 10) / 10;
  audio.engine(rpm01, throttle, true);

  return { throttle, braking, gear, rpm01, offroad, wantNitro };
}

function updateTraffic(dt) {
  for (const t of traffic) {
    t.t = (t.t + (t.speed * dt) / world.curve.getLength()) % 1;
    const p = world.curve.getPointAt(t.t);
    const tan = world.curve.getTangentAt(t.t);
    const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    t.mesh.position.set(p.x + n.x * t.lane, 0, p.z + n.z * t.lane);
    t.mesh.rotation.y = Math.atan2(tan.x, tan.z);
    for (const w of t.car.wheels) w.rotation.x += (t.speed / 0.36) * dt;
    // slow near player to avoid overlapping
    const dx = player.pos.x - t.mesh.position.x, dz = player.pos.z - t.mesh.position.z;
    if (Math.hypot(dx, dz) < 12) t.speed = Math.max(8, t.speed - dt * 6);
    else t.speed = Math.min(22, t.speed + dt * 2);
  }
}

// ---------- Laps / modes ----------
function updateRace(dt) {
  state.time += dt;
  const { t } = distToRoad(world.curve, player.pos.x, player.pos.z);
  // crossing start line: wrap from high->low while near road
  if (state.prevT > 0.9 && t < 0.1) {
    const lapTime = state.time - state.lapStart;
    if (lapTime > 5) {
      state.lastLap = lapTime; state.bestLap = Math.min(state.bestLap, lapTime);
      state.lapStart = state.time;
      if (state.mode === 'timetrial') {
        if (state.lap >= state.totalLaps) return finishRace();
        state.lap++;
        lapEl.textContent = `LAP ${state.lap}/${state.totalLaps}`;
        showMessage(`LAP ${state.lap}!`, 1400);
        audio.beep(880, 0.25);
      } else {
        showMessage(`LAP ${fmtTime(lapTime)}`, 1400);
      }
    }
  }
  state.prevT = t;
  if (state.mode === 'traffic') {
    state.scoreTime -= dt;
    state.score += Math.abs(player.speed) * dt * 0.6;
    scoreEl.textContent = `SCORE ${Math.floor(state.score)} · ${Math.ceil(state.scoreTime)}s`;
    if (state.scoreTime <= 0) return finishRace();
  }
  timerEl.textContent = fmtTime(state.time);
}

function finishRace() {
  state.started = false;
  hud.classList.add('hidden');
  resultEl.classList.remove('hidden');
  audio.beep(660, 0.3);
  setTimeout(() => audio.beep(990, 0.4), 250);
  if (state.mode === 'timetrial') {
    $('result-title').textContent = 'RACE COMPLETE!';
    $('result-detail').textContent = `Total ${fmtTime(state.time)} · Best lap ${state.bestLap === Infinity ? '—' : fmtTime(state.bestLap)}`;
  } else if (state.mode === 'traffic') {
    $('result-title').textContent = 'TIME UP!';
    $('result-detail').textContent = `Final score: ${Math.floor(state.score)} — dodge traffic at speed for near-miss bonuses.`;
  }
}

// ---------- Cameras ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt) {
  fwd.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  if (state.camMode === 0) {
    camPos.copy(player.pos).addScaledVector(fwd, -8.5).add(new THREE.Vector3(0, 3.6, 0));
    // keep camera above ground / out of tunnel roof
    camPos.y = Math.max(camPos.y, 1.6);
    camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
    camLook.copy(player.pos).addScaledVector(fwd, 9).add(new THREE.Vector3(0, 1.4, 0));
    camera.lookAt(camLook);
  } else if (state.camMode === 1) {
    camera.position.copy(player.pos).addScaledVector(fwd, 0.6).add(new THREE.Vector3(0, 1.35, 0));
    camLook.copy(player.pos).addScaledVector(fwd, 30).add(new THREE.Vector3(0, 1.0, 0));
    camera.lookAt(camLook);
  } else {
    state.cineTimer += dt;
    if (state.cineTimer > 6) state.cineTimer = 0;
    const a = state.cineTimer * 0.5;
    camPos.set(player.pos.x + Math.cos(a) * 12, 3 + Math.sin(a * 0.7) * 1.5, player.pos.z + Math.sin(a) * 12);
    camera.position.lerp(camPos, 1 - Math.pow(0.01, dt));
    camera.lookAt(player.pos.x, 1, player.pos.z);
  }
}

// ---------- Minimap ----------
function drawMinimap() {
  const W = 160, H = 160;
  mmap.clearRect(0, 0, W, H);
  // fit world: track spans ~±160
  const toMap = (x, z) => [W / 2 + (x / 340) * W, H / 2 + (z / 340) * H];
  mmap.strokeStyle = 'rgba(0,229,255,.8)'; mmap.lineWidth = 5; mmap.beginPath();
  for (let i = 0; i <= 80; i++) {
    const p = world.curve.getPointAt(i / 80);
    const [mx, my] = toMap(p.x, p.z);
    if (i === 0) mmap.moveTo(mx, my); else mmap.lineTo(mx, my);
  }
  mmap.stroke();
  for (const t of traffic) {
    const [mx, my] = toMap(t.mesh.position.x, t.mesh.position.z);
    mmap.fillStyle = '#ff5a5a';
    mmap.fillRect(mx - 2, my - 2, 4, 4);
  }
  const [px, py] = toMap(player.pos.x, player.pos.z);
  mmap.fillStyle = '#7CFC00';
  mmap.beginPath(); mmap.arc(px, py, 5, 0, 7); mmap.fill();
  mmap.fillStyle = '#fff';
  mmap.font = 'bold 16px sans-serif'; mmap.textAlign = 'center';
  mmap.fillText('N', W / 2, 14);
}

// ---------- HUD ----------
function updateHUD(info) {
  const kmh = Math.abs(player.speed * 3.6);
  speedEl.textContent = Math.round(kmh);
  rpmEl.style.width = `${Math.round(info.rpm01 * 100)}%`;
  rpmEl.style.background = info.rpm01 > 0.85 ? '#e10600' : '';
  nitroEl.style.width = `${state.nitro}%`;
  gearEl.textContent = info.gear;
  gearEl.style.color = info.gear === 'R' ? '#ff9a1f' : '#00e5ff';
  if (state.mode === 'timetrial') timerEl.textContent = fmtTime(state.time);
  else if (state.mode === 'freeroam') timerEl.textContent = fmtTime(state.time);
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!state.started || state.paused) {
    // menu orbit preview
    if (!state.started && preview) preview.group.rotation.y += dt * 0.5;
    if (!state.started) {
      const t = performance.now() * 0.0001;
      camera.position.set(Math.sin(t) * 60 + world.startPose.pos.x, 22, Math.cos(t) * 60 + world.startPose.pos.z);
      camera.lookAt(world.startPose.pos.x, 1, world.startPose.pos.z);
    }
    renderer.render(scene, camera);
    return;
  }
  const info = updatePlayer(dt);
  updateTraffic(dt);
  updateRace(dt);
  if (!state.started) { renderer.render(scene, camera); return; } // finished mid-frame
  updateCamera(dt);
  updateSmoke(dt);
  updateHUD(info);
  drawMinimap();
  renderer.render(scene, camera);
}

// boot
previewCar();
menu.classList.remove('hidden');
document.getElementById('loading').style.display = 'none';
loop();
