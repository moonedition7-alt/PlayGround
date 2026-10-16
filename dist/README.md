# APEX RUSH — 3D Car Racing

Playable 3D arcade racing prototype built with **Three.js (WebGL)**. No build step — just open in a browser.

## Features (prototype)
- 3 supercars (Lambo / Ferrari / Bugatti style) + 8 paint colors
- Open city: highway loop, downtown buildings, tunnel with lights, overpass bridge, mountains, trees, street lights, guard rails, start gantry
- Driving: accelerate / brake / reverse / steering / drift (SPACE) / nitro boost (SHIFT)
- 3 cameras: chase, cockpit, cinematic (key `C` or 📷 button)
- Modes: Free Roam, Time Trial (3 laps), Traffic Rush (90 s + near-miss scoring)
- HUD: speedometer, RPM bar, gear (incl. R), nitro bar, timer, lap/score, live minimap
- Traffic AI (8 cars on the racing line, brake near player)
- Collisions: buildings (AABB), traffic, world bounds; off-road slowdown
- Sound (procedural WebAudio, no assets): RPM engine, skid, crash, UI beeps
- Mobile: touch buttons for ◀ ▶ GAS BRAKE ⚡ + DRIFT, responsive HUD

## Run locally
Any static server works (needed so ES modules + CDN imports load):

```bash
cd racing-game
python3 -m http.server 8000
# open http://localhost:8000/
```

Or with node:
```bash
npx serve .
```

Direct `file://` open will be blocked by the browser module CORS policy — use the server above.

## Deploy
Drop the `racing-game/` folder on any static host:
- GitHub Pages / Netlify / Vercel / itch.io — no build required.
- Internet required at runtime for the Three.js CDN (`cdn.jsdelivr.net`).

## Controls
| Action | Desktop | Mobile |
|---|---|---|
| Steer | A/D or ←/→ | ◀ ▶ |
| Gas / Brake | W/S or ↑/↓ | GAS / BRAKE |
| Drift | SPACE | DRIFT |
| Nitro | SHIFT / N | ⚡ |
| Camera | C | 📷 |
| Reset | R | ↺ |
| Pause | P / Esc | ⏸ |

## Structure
```
racing-game/
  index.html      UI screens, HUD, touch controls, importmap
  css/style.css   menu + HUD + touch styling
  js/main.js      game loop, physics, cameras, modes, HUD, minimap
  js/world.js     city/track/tunnel/bridge/mountains, colliders, road utils
  js/car.js       3 supercar builders + brake light/glow
  js/input.js     keyboard + touch bindings
  js/audio.js     procedural engine/skid/crash/beeps
```

## Performance notes (Android)
- Pixel ratio clamped to 2, single 2048px shadow map, ~10 real lights (rest emissive)
- Low-poly cars/city; shared geometries where hot; smoke pool capped at 60
- If a low-end device stutters: lower `renderer.setPixelRatio` to 1 and disable shadows in `main.js`.

## Next steps
- Skid marks, rear-view mirror, damage model
- More tracks / checkpoint races, ghost car, online leaderboard
- Real engine samples + music tracks
