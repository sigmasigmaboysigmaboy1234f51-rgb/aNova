# Blockfire VR (Unity)

Blockfire in virtual reality, made in Unity. Stand on the island, hold the guns in your hands, and fight off the Mossheads wave after wave. Every 5th wave the huge **Moss King** comes, wearing his crown. Build walls with your left hand to hold them back.

It's the Endless Waves mode of Blockfire:

- The blocky island, with trees and old ruins, is different every time you open the game.
- Five kinds of mob: **Mossheads**, fast **Minis**, **Bones** skeletons, big **Giants**, and the **Moss King** boss.
- Two guns: the **Ember Blaster** (hold the trigger) and the **Boom Shotgun**. Headshots do double damage.
- Build and break blocks, with 10 kinds of block to build with.
- Hearts, score and wave number are on a watch on your left wrist.

Like the rest of Blockfire, everything is made by code: the island, the textures, the mobs, the guns and the sounds. There are no model, picture or sound files.

It works on a **Meta Quest** (2, 3, 3S or Pro), on its own or through Quest Link. It also works on other PC headsets through OpenXR. With no headset, you can try it with a keyboard and mouse.

## What you need

- **Unity Hub** and **Unity 6** (free). Unity 2022.3 works too.
- For playing on the Quest by itself: a USB cable, and the Quest in **developer mode**.
- For Quest Link: a Windows PC. Quest Link doesn't work on a Mac, but a Mac can put the game on the Quest.

## Step by step

### 1. Get Unity

1. Download **Unity Hub** from [unity.com/download](https://unity.com/download), install it and sign in. A free Personal licence is fine.
2. In Unity Hub, go to **Installs → Install Editor** and pick the newest **Unity 6 (LTS)**.
3. On the next page, tick **Android Build Support** and the two boxes under it (**OpenJDK** and **Android SDK & NDK Tools**). You need these to put games on a Quest.

If Unity is already installed without Android: in **Installs**, click the gear next to it, choose **Add modules**, and tick **Android Build Support**.

### 2. Make the project

1. In Unity Hub, go to **Projects → New project**.
2. Pick the **VR** template. If it has a download button, click it first. The VR template comes with OpenXR and Meta Quest support already set up.
3. Call it **Blockfire VR** and click **Create project**. The first time takes a few minutes.

### 3. Put Blockfire in it

1. Download **BlockfireVR.unitypackage** from the [latest release](https://github.com/sigmasigmaboysigmaboy1234f51-rgb/aNova/releases/latest), under *Assets*.
2. With the project open in Unity, double-click the file. You can also use **Assets → Import Package → Custom Package…** and pick it.
3. Click **Import**.
4. A box asks **"Make the game scene now?"**: click **Make it**.

You'll get a **Blockfire** menu at the top of Unity, next to *Help*. **Blockfire → Make the game scene** does step 4 again whenever you like.

You can also use this folder instead of the package: copy `unity/BlockfireVR` into your project's `Assets` folder.

### 4. Play

**With Quest Link or Air Link** (Windows):

1. Open the **Meta Quest Link** app on the PC.
2. Connect the Quest with a Link cable, or with Air Link from the headset's Quick Settings.
3. Press **Play ▶** at the top of Unity and put the headset on.

**On the Quest by itself:**

1. Turn on developer mode. In the **Meta Horizon** app on your phone, go to **Devices → your headset → Headset settings → Developer mode**.
   - This needs a (free) developer account. Under-13 accounts can't turn it on, so ask a grown-up to do it on theirs.
2. Plug the Quest into the computer with a USB cable. Put the headset on and click **Allow** for USB debugging.
3. In Unity, click **Blockfire → Set up for Meta Quest**. It switches Unity to Android, which takes a few minutes the first time.
4. In the settings window that opens, check the Android tab (the little robot):
   - **OpenXR** is ticked.
   - Under OpenXR, **Meta Quest Support** is ticked.
5. Click **Blockfire → Build and run on Quest**. The first build is slow (5 to 15 minutes); later ones are much quicker.
6. The game starts on the Quest. Next time, find it under **Library → Unknown Sources**.

**No headset:** just press **Play ▶**. Click the game view to grab the mouse. Esc lets go of it.

## Controls

| Meta Quest controllers | | Keyboard and mouse |
| --- | --- | --- |
| **Right trigger** | shoot (hold it with the Ember Blaster) | left click |
| **B** | reload | R |
| **Right stick** left or right | turn | mouse |
| **Right stick click** | swap guns | Q |
| **Left stick** | walk where you're looking | W A S D |
| **Left stick click** | run | Shift |
| **A** | jump; hold it to swim up | Space |
| **Left trigger** | put a block where your left hand points | right click |
| **Left grip** | break the block your left hand points at | F |
| **X** | change which block you're holding | E |
| **Y** | wrist watch on or off | H |
| **Menu** (left controller) | pause | Esc |

Pull the trigger to start, and again to play again after you get cubed. Turning goes in quick 45° snaps, which is kinder on your tummy than smooth turning. Your best score is saved.

## If something's wrong

- **There's no Blockfire menu.** Unity couldn't read the scripts. Open **Window → General → Console** and look for red errors.
- **Everything is pink.** Unity couldn't find the Blockfire shader. Import the package again, then use **Blockfire → Make the game scene**.
- **You're in the floor, or giant.** Hold the **Meta button** on the right controller to recentre. Stand up when you start the game.
- **The controllers don't do anything.** Open **Edit → Project Settings → XR Plug-in Management → OpenXR**. Under **Interaction Profiles**, add **Oculus Touch Controller Profile**; for Quest 3 you can add **Meta Quest Touch Plus** too. Do it on both the PC tab and the Android tab.
- **"Build and run" says no device.** Unplug the cable and plug it in again. Put the headset on and look for the *Allow USB debugging* box.
- **It says Android Build Support is missing.** See step 1.

## How it's made

| File | What it does |
| --- | --- |
| `Scripts/Game.cs` | Starts everything: the title screen, the waves, the score, the wrist watch and the messages. |
| `Scripts/VoxelWorld.cs` | The 64 × 64 × 32 island: making it, drawing it in 16 × 16 chunks with soft shadows in the corners, and finding blocks. |
| `Scripts/Atlas.cs`, `Blocks.cs` | The block textures, painted pixel by pixel, and the list of blocks. |
| `Scripts/Player.cs`, `Controls.cs` | You: your head, your hands, walking, jumping, swimming, and reading the controllers. |
| `Scripts/Gun.cs`, `Builder.cs` | The guns in your right hand, and building with your left. |
| `Scripts/Mob.cs` | The mobs: their blocky bodies, walking and hopping after you, and hitting you. |
| `Scripts/Boxes.cs`, `PixelFont.cs`, `Fx.cs`, `Sfx.cs`, `Noise.cs` | Box models, pixel writing, bits and bullet lines, the sounds, and random numbers. |
| `Shaders/BlockfireVoxel.shader` | The one shader. It has fog and no lighting, so it's quick on a Quest, and it works in both eyes. |
| `Editor/BlockfireMenu.cs` | The Blockfire menu in Unity. |

`tools/unity-package.mjs` packs this folder into `BlockfireVR.unitypackage`. The **Build apps** workflow puts the package on every release.

Not in the VR version yet: Adventure, cars, story mode and online multiplayer.

Copyright © 2026 sigmasigmaboysigmaboy1234f51-rgb. All rights reserved.
