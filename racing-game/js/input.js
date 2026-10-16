// Keyboard + touch input state
export const input = {
  left: false, right: false, up: false, down: false,
  nitro: false, drift: false,
};

const keyMap = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
  Space: 'drift',
};

export function initKeyboard(onKey) {
  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.code];
    if (k) { input[k] = true; e.preventDefault(); }
    if (onKey) onKey(e.code, true);
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.code];
    if (k) { input[k] = false; e.preventDefault(); }
    if (onKey) onKey(e.code, false);
  });
}

export function initTouch() {
  const bind = (id, prop) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); input[prop] = true; };
    const off = (e) => { e.preventDefault(); input[prop] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };
  bind('t-left', 'left');
  bind('t-right', 'right');
  bind('t-gas', 'up');
  bind('t-brake', 'down');
  bind('t-nitro', 'nitro');
  bind('t-drift', 'drift');
  // Show touch UI on touch devices
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.getElementById('touch')?.classList.remove('hidden');
  }
}

export function resetInput() {
  for (const k of Object.keys(input)) input[k] = false;
}
