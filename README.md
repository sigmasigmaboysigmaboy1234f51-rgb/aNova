# Blockfire

A blocky first-person shooter on a small voxel island, with online multiplayer and a skin editor that makes real Minecraft skins.

Everything is drawn by code: the block textures, the characters, the sounds. There are no image or audio files.

## Get it

- **Windows app:** open the repo's **Actions** tab on GitHub, click the latest **Build Windows app** run, and download **Blockfire-Windows** under *Artifacts*. Inside the zip:
  - `Blockfire-Setup-<version>.exe` installs the game with a desktop shortcut.
  - `Blockfire-<version>-portable.exe` runs without installing.

  Windows may warn that the app is from an unknown publisher, because it isn't code-signed. Click **More info → Run anyway**.
- **In a browser:** download `index.html` and double-click it, or put it online with GitHub Pages (see below).

You need a keyboard and mouse to play. The skin editor also works on phones and tablets.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Space | Jump (hold in water to swim up) |
| Shift | Crouch. You move slower, aim steadier, and won't walk off edges |
| Double-tap W (or Ctrl in the app) | Sprint |
| Left click | Shoot. Shots also break blocks |
| Right click | Place a block |
| 1–4 or scroll | Pick block type |
| R | Reload |
| V or F5 | Switch to third person to see your skin |
| T | Chat (multiplayer) |
| Tab (hold) | Player list and scores (multiplayer) |
| F11 | Full screen (app) |
| Esc | Pause |

## How it works

Waves of mobs rise out of the ground and come for you. Survive as long as you can.

- **Mosshead:** shambles toward you and slams down with both arms. Step back during the wind-up and it misses. If you hide behind a wall too long, it chews through.
- **Bonehead:** keeps its distance and fires glowing bolts. Its eyes light up and it pulls back just before it shoots. Beat it and it rattles apart.
- **Gloop:** a bouncy jelly cube that hops over walls two blocks high.

Shooting blocks cracks them and then breaks them, and every broken block goes into your inventory. Use right click to build cover. Headshots do double damage. Mobs sometimes drop hearts or bundles of blocks.

## Multiplayer

Up to 8 players share one island and fight the same waves. Waves get bigger with more players. When you die you come back after 5 seconds.

**Host from the app (easiest):**

1. Click **Multiplayer → Host game**.
2. The chat shows your address, like `192.168.1.23`. Friends on the same Wi-Fi type it into **Join a game**.
3. The first time, Windows asks whether Blockfire may use the network. Allow it on private networks.

**Run a dedicated server** on any computer with [Node.js](https://nodejs.org):

```sh
npm install
npm run server
```

It listens on port 25580. Everyone, including you, joins with that computer's address. To play with friends outside your Wi-Fi, forward TCP port 25580 on the server's router, or run the server on an online host.

**How it's built:** the server is **JavaScript running on Node.js**, talking to the game over **WebSockets**. The game is JavaScript too, so both sides share code. For example, every player builds the identical island from one shared number (the seed), so the whole world never has to be sent over the network. The server itself stays small (`server/server.cjs`). The first player in is the host: their game runs the mobs and waves, and the server passes messages between everyone. If the host leaves, the next player takes over and the game carries on.

The copy of the game hosted on claude.ai can't connect to servers, so use the app or the downloaded file for multiplayer.

## Skins

Click **Edit skin** on the title screen.

- Paint straight onto the 3D model, or onto the flat 64×64 texture.
- There are two layers: the **Skin** layer, and an **Outer layer** for hats, hair, hoods and jackets.
- Pick **Classic** (4 px) or **Slim** (3 px) arms.
- **Random outfit** makes a new character to start from.
- **Load .png** opens any Minecraft skin, including old 64×32 ones.
- **Save .png** downloads your skin.

In multiplayer, everyone sees your skin.

Skins use the same layout as Minecraft, so the saved file works there:

- **Java Edition:** Minecraft Launcher → Skins → New skin → Browse → pick the file. Choose Slim if you used slim arms.
- **Bedrock Edition** (Windows and phones): Dressing Room → Classic skins → Owned → Import → Choose new skin.

## Put it on GitHub Pages

1. On GitHub, open the repo's **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**.
3. Choose the branch that has `index.html` and the `/ (root)` folder, then **Save**.
4. After a minute the page shows your game's link.

GitHub Pages serves the game over `https`, and browsers only let those pages join `wss://` servers. For multiplayer with friends, the app or the downloaded `index.html` is simpler.

## Changing the game

The code lives in `src/`. `index.html` is built from it, so edit `src/` and then rebuild:

```sh
npm install
npm run build      # rebuild index.html
npm run app        # run the desktop app
npm run server     # run a multiplayer server
npm run dist:win   # build the Windows .exe (on Windows)
```

GitHub builds the Windows app automatically on every push (`.github/workflows/desktop.yml`). Pushing a tag like `v1.2.0` also attaches the .exe files to a GitHub Release.

| File | What it does |
| --- | --- |
| `src/main.js` | Game setup, screens, waves, scoring, respawns |
| `src/world.js` | Island generation, block meshes, block breaking |
| `src/textures.js` | Pixel-painted block textures |
| `src/player.js` | Movement, crouch, sprint, shooting, building, first-person view |
| `src/anim.js` | Smooth animation for players and mobs |
| `src/mobs.js` | Mob types, behavior, pickups, multiplayer copies of mobs |
| `src/flow.js` | Pathfinding, so mobs find their way around walls |
| `src/multiplayer.js`, `src/net.js`, `src/remote.js` | Multiplayer: networking, other players, chat |
| `server/server.cjs` | The multiplayer server (Node.js) |
| `desktop/` | The Windows/desktop app (Electron) |
| `src/skin.js` | Skin layout, outfit generator, mob skins, PNG loading |
| `src/model.js` | Blocky character and blaster models |
| `src/editor.js`, `src/preview.js` | The skin editor |
| `src/sound.js` | Synthesized sound effects |
| `src/hud.js`, `src/style.css`, `src/index.html` | Interface |

Built with [three.js](https://threejs.org/), [ws](https://github.com/websockets/ws) and [Electron](https://www.electronjs.org/) (all MIT licensed). The fonts, [Jersey 10](https://github.com/scfried/soft-type-jersey) and [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans), are under the SIL Open Font License (see `src/fonts`).
