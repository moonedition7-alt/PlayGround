import { Game } from './game.js';
import { SaveManager } from './save.js';
import { AudioFX } from './audio.js';
import { UI } from './ui.js';

const canvas = document.getElementById('game-canvas');
const save = new SaveManager();
const audio = new AudioFX();
const game = new Game({ canvas, save, audio });
const ui = new UI(game, save, audio);

window.__AERO = { game, save, audio, ui };

const boot = document.getElementById('boot');
const fill = document.getElementById('boot-fill');
const status = document.getElementById('boot-status');
const messages = [
  'PREPARING FLIGHT DECK',
  'FUELING AIRCRAFT',
  'CALIBRATING AVIONICS',
  'GENERATING SKY ROUTES',
  'CLEARED FOR TAKEOFF'
];
let progress = 0;
let idx = 0;
const statusTimer = setInterval(() => {
  idx = Math.min(idx + 1, messages.length - 1);
  status.textContent = messages[idx];
}, 240);
const bootTimer = setInterval(() => {
  progress = Math.min(100, progress + 8 + Math.random() * 10);
  fill.style.width = progress + '%';
  if (progress >= 100) {
    clearInterval(bootTimer);
    clearInterval(statusTimer);
    setTimeout(() => {
      boot.classList.add('done');
      document.getElementById('menu-ui').classList.remove('hidden');
      ui.renderMenu();
      ui.refreshWallets();
      setTimeout(() => boot.remove(), 850);
    }, 320);
  }
}, 70);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  try {
    game.tick(dt);
    ui.updateHud();
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'flight' && !game.paused) ui.togglePause(true);
});
