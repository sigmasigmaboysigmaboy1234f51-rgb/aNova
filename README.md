# Blockfire

A blocky first-person shooter on a small voxel island, with a skin editor that makes real Minecraft skins.

Everything is drawn by code: the block textures, the characters, the sounds. There are no image or audio files.

## Play it

- **Easiest:** download `index.html` and double-click it. It runs in any modern browser, no install.
- **Online:** turn on GitHub Pages for this repo (see below) and share the link.

You need a keyboard and mouse to play. The skin editor also works on phones and tablets.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Space | Jump (hold in water to swim up) |
| Shift | Sprint |
| Left click | Shoot. Shots also break blocks |
| Right click | Place a block |
| 1–4 or scroll | Pick block type |
| R | Reload |
| V or F5 | Switch to third person to see your skin |
| Esc | Pause |

## How it works

Waves of mobs rise out of the ground and come for you. Survive as long as you can.

- **Mosshead:** walks straight at you and hits hard up close. If you hide behind a wall too long, it chews through.
- **Bonehead:** keeps its distance and fires glowing bolts. Its eyes light up just before it shoots.
- **Gloop:** a bouncy jelly cube that hops over walls two blocks high.

Shooting blocks cracks them and then breaks them, and every broken block goes into your inventory. Use right click to build cover. Headshots do double damage. Mobs sometimes drop hearts or bundles of blocks.

## Skins

Click **Edit skin** on the title screen.

- Paint straight onto the 3D model, or onto the flat 64×64 texture.
- There are two layers: the **Skin** layer, and an **Outer layer** for hats, hair, hoods and jackets.
- Pick **Classic** (4 px) or **Slim** (3 px) arms.
- **Random outfit** makes a new character to start from.
- **Load .png** opens any Minecraft skin, including old 64×32 ones.
- **Save .png** downloads your skin.

Skins use the same layout as Minecraft, so the saved file works there:

- **Java Edition:** Minecraft Launcher → Skins → New skin → Browse → pick the file. Choose Slim if you used slim arms.
- **Bedrock Edition** (Windows and phones): Dressing Room → Classic skins → Owned → Import → Choose new skin.

## Put it on GitHub Pages

1. On GitHub, open the repo's **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**.
3. Choose the branch that has `index.html` and the `/ (root)` folder, then **Save**.
4. After a minute the page shows your game's link.

## Changing the game

The code lives in `src/`. `index.html` is built from it, so edit `src/` and then rebuild:

```sh
npm install
npm run build
```

| File | What it does |
| --- | --- |
| `src/main.js` | Game setup, screens, waves, scoring |
| `src/world.js` | Island generation, block meshes, block breaking |
| `src/textures.js` | Pixel-painted block textures |
| `src/player.js` | Movement, shooting, building, first-person view |
| `src/mobs.js` | Mob types, behavior and pickups |
| `src/flow.js` | Pathfinding, so mobs find their way around walls |
| `src/skin.js` | Skin layout, outfit generator, mob skins, PNG loading |
| `src/model.js` | Blocky character and blaster models |
| `src/editor.js`, `src/preview.js` | The skin editor |
| `src/sound.js` | Synthesized sound effects |
| `src/hud.js`, `src/style.css`, `src/index.html` | Interface |

Built with [three.js](https://threejs.org/) (MIT license). The build uses [esbuild](https://esbuild.github.io/).
