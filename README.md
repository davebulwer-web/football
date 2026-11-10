# Touchline

A side-on, 11-a-side pixel-art football game for the browser, built around one-button directional passing: hold kick for power and let go, and the direction you hold picks the angle.

This is the playable demo: a friendly between two national sides (1 player vs CPU, 2 players, or CPU vs CPU), plus Practice, where your side plays against just a goalkeeper and every restart is yours.

## Play locally

```sh
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

## Controls

| Action | 1 player | Gamepad |
| --- | --- | --- |
| Move | Arrows or WASD | Left stick or D-pad |
| Kick (hold for power) | Space | A |
| Sprint | Shift | B or RT |
| Pause | Esc | Start |

In 2-player mode player 1 uses WASD + Space + Left Shift and player 2 uses the arrows + Enter + Right Shift. Gamepad 1 and 2 also work.

**Kicking.** Hold kick to build power, then let go. With nothing held the ball goes the way you are running. Push sideways while running for a diagonal cross-field ball. Push diagonally back for a square pass. Pull right back to loft the ball forward. Kick toward goal in range to shoot. Up or down aims at the far or near post, and shots drift off line depending on the shooter's skill, the power and how close the nearest defender is. Without the ball, kick next to the man on the ball to tackle, or as a high ball arrives to head it.

## Build and deploy

`npm run build` writes the static site to `dist/`.

GitHub Pages: the workflow in `.github/workflows/pages.yml` builds and deploys on every push to `main`. In the repo's Settings → Pages, set Source to **GitHub Actions**.

Cloudflare Pages settings: build command `npm run build`, output directory `dist`, Node 20 or newer.

## Art

Player sprites come from [pixellab.ai](https://pixellab.ai). `tools/pixellab-player.mjs` generates a footballer in a white, blue and red reference kit, and `tools/pack-player.py` packs it into `public/sprites/player.png`. The game recolours that sheet for every kit and skin tone at load time. The scripts need `PIXELLAB_API_KEY` in the environment and are only run on a dev machine; the key never ships with the game.

## Layout

- `src/core`: input (keyboard, gamepads) and placeholder sound
- `src/match`: ball physics, rules, kicking, player control and AI
- `src/render`: projection, pitch and stadium drawing, sprites, pixel text
- `src/ui`: menus
- `src/data`: national sides and player skills
