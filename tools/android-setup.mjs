// Gets the Android project (made by `npx cap add android`) ready to build:
// the game's icon and splash screen, landscape and full screen, the
// version from package.json. Run after `npx cap add android`:
//
//   node tools/android-setup.mjs
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { iconPng } from './make-icon.mjs';

const root = 'android/app';
const res = join(root, 'src/main/res');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const BG = '#1d2430';

const edit = (file, fn) => {
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`Nothing changed in ${file}`);
  writeFileSync(file, after);
};

// Landscape only, like a console game.
const manifest = join(root, 'src/main/AndroidManifest.xml');
if (!readFileSync(manifest, 'utf8').includes('screenOrientation')) edit(manifest, (s) => s.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"'));

// Full screen (swipe from the edge to see the status bar) and the screen
// stays on while you play.
writeFileSync(
  join(root, 'src/main/java/io/github/blockfire/game/MainActivity.java'),
  `package io.github.blockfire.game;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    private void hideBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
`,
);

// The version players see, and a number that goes up with every release.
const [maj, min, pat] = pkg.version.split('.').map(Number);
const gradle = join(root, 'build.gradle');
writeFileSync(gradle, readFileSync(gradle, 'utf8').replace(/versionCode \d+/, `versionCode ${maj * 10000 + min * 100 + pat}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`));

// Icons: the grass block on a dark background (and as an adaptive icon, the
// block in the safe middle of the layer).
const size = (file) => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
for (const dir of readdirSync(res)) {
  const d = join(res, dir);
  if (dir.startsWith('mipmap-') && !dir.includes('anydpi')) {
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      const f = join(d, name);
      if (existsSync(f)) writeFileSync(f, iconPng(...size(f), { pad: 0.12, bg: BG }));
    }
    const fg = join(d, 'ic_launcher_foreground.png');
    if (existsSync(fg)) writeFileSync(fg, iconPng(...size(fg), { pad: 0.27 }));
  }
  // Splash screens: the icon in the middle of the dark background.
  if (dir.startsWith('drawable')) {
    const f = join(d, 'splash.png');
    if (existsSync(f)) {
      const [w, h] = size(f);
      const side = Math.min(w, h);
      writeFileSync(f, iconPng(w, h, { pad: Math.max(0, (side - side * 0.35) / 2 / side), bg: BG }));
    }
  }
}
const bgFile = join(res, 'values/ic_launcher_background.xml');
if (existsSync(bgFile)) writeFileSync(bgFile, readFileSync(bgFile, 'utf8').replace(/#[0-9A-Fa-f]{6}/, BG.toUpperCase()));
else rmSync(join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });

console.log(`Android project ready: Blockfire ${pkg.version}`);
