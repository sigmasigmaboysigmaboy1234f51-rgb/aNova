import { BOSSES } from './boss.js';
import { BOSS_CAST } from './storydata.js';

// 16x16 pixel portraits for the story's talking heads.

function grid(canvas) {
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 16, 16);
  const rect = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  return { ctx, rect, px: (x, y, c) => rect(x, y, 1, 1, c) };
}

function gran(canvas) {
  const { rect, px } = grid(canvas);
  rect(0, 0, 16, 16, '#3a2a20');
  rect(5, 0, 6, 2, '#c8c8cc');
  rect(3, 2, 10, 3, '#d8d8dc');
  rect(3, 2, 10, 1, '#e8e8ec');
  rect(3, 5, 10, 7, '#e0ac85');
  rect(3, 5, 1, 4, '#d8d8dc');
  rect(12, 5, 1, 4, '#d8d8dc');
  // Glasses.
  rect(4, 7, 3, 3, '#2a2a2a');
  rect(9, 7, 3, 3, '#2a2a2a');
  rect(5, 8, 1, 1, '#8fd0ff');
  rect(10, 8, 1, 1, '#8fd0ff');
  rect(7, 8, 2, 1, '#2a2a2a');
  px(8, 10, '#c68e6a');
  rect(6, 11, 4, 1, '#a8503a');
  px(4, 11, '#f0a8a0');
  px(11, 11, '#f0a8a0');
  rect(4, 12, 8, 1, '#e0ac85');
  // Orange apron and collar.
  rect(1, 13, 14, 3, '#e0752d');
  rect(6, 13, 4, 2, '#f3efe6');
  px(8, 15, '#ffd23f');
}

function pip(canvas) {
  const { rect, px } = grid(canvas);
  rect(0, 0, 16, 16, '#1d2a3a');
  rect(7, 1, 2, 2, '#8f8f93');
  rect(6, 0, 4, 1, '#ffd23f');
  rect(4, 3, 8, 1, '#5a5a62');
  rect(3, 4, 10, 8, '#ffb040');
  rect(4, 5, 8, 6, '#ffd36b');
  rect(5, 6, 6, 3, '#fff2b0');
  rect(5, 7, 2, 2, '#1a1a1a');
  rect(9, 7, 2, 2, '#1a1a1a');
  px(5, 7, '#9fe8ff');
  px(9, 7, '#9fe8ff');
  rect(7, 10, 2, 1, '#8a4a1a');
  rect(4, 12, 8, 1, '#5a5a62');
  rect(6, 13, 4, 2, '#3a3a42');
  rect(1, 6, 2, 3, '#8f8f93');
  rect(13, 6, 2, 3, '#8f8f93');
}

// The player's own face, straight from their skin.
function you(canvas, skin) {
  const { ctx, rect } = grid(canvas);
  rect(0, 0, 16, 16, '#2a3a2a');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(skin, 8, 8, 8, 8, 3, 2, 10, 10);
  ctx.drawImage(skin, 40, 8, 8, 8, 2, 1, 12, 12);
  ctx.drawImage(skin, 20, 20, 8, 4, 1, 12, 14, 4);
}

// Bosses: tiny head, huge traps, glowing eyes.
function boss(canvas, index) {
  const b = BOSSES[index];
  const L = b.look;
  const { rect, px } = grid(canvas);
  const skin = '#' + L.skin.getHexString();
  const dark = '#' + L.skinDark.getHexString();
  const light = '#' + L.skinLight.getHexString();
  rect(0, 0, 16, 16, '#241e1a');
  // Shoulders and traps fill the bottom of the frame.
  rect(0, 11, 16, 5, skin);
  rect(0, 11, 16, 1, light);
  rect(2, 10, 12, 2, skin);
  rect(7, 13, 2, 3, dark);
  // Head.
  rect(5, 3, 6, 7, skin);
  rect(5, 3, 6, 1, light);
  rect(5, 5, 6, 1, dark);
  px(6, 6, L.eyes);
  px(9, 6, L.eyes);
  rect(6, 8, 4, 1, '#f4f1ea');
  px(7, 8, '#d8d2c0');
  rect(6, 9, 4, 1, dark);
  if (L.hair) rect(5, 2, 6, 2, '#' + L.hair.getHexString());
  if (L.mask) {
    rect(5, 7, 6, 3, '#3a4a2c');
    px(6, 8, '#141414');
    px(9, 8, '#141414');
  }
  if (b.id === 'kinggloop' || b.id === 'overlord') {
    rect(5, 1, 6, 2, '#f2c230');
    px(5, 0, '#f2c230');
    px(8, 0, '#f2c230');
    px(10, 0, '#f2c230');
    px(7, 1, '#d8392b');
  }
  if (b.id === 'magma') {
    rect(4, 1, 1, 3, '#ff7a2f');
    rect(11, 1, 1, 3, '#ff7a2f');
    px(3, 12, '#ff7a2f');
    px(12, 13, '#ff7a2f');
    px(8, 14, '#ff7a2f');
  }
  if (b.id === 'shadow') {
    rect(4, 2, 8, 2, '#121018');
    rect(4, 2, 1, 7, '#121018');
    rect(11, 2, 1, 7, '#121018');
  }
  if (b.id === 'storm') {
    rect(5, 4, 6, 1, '#d8392b');
    px(2, 13, '#fff6a0');
    px(3, 12, '#fff6a0');
    px(12, 12, '#fff6a0');
  }
  if (b.id === 'colossus') {
    for (let x = 1; x < 15; x += 2) px(x, 14, dark);
  }
}

export function drawPortrait(canvas, who, skinCanvas) {
  // Anyone with their own skin (the people of Blockton).
  if (who && typeof who === 'object') you(canvas, who.skin || skinCanvas);
  else if (who === 'gran') gran(canvas);
  else if (who === 'pip') pip(canvas);
  else if (who === 'you') you(canvas, skinCanvas);
  else {
    const i = BOSS_CAST.indexOf(who);
    boss(canvas, i >= 0 ? i : 9);
  }
}
