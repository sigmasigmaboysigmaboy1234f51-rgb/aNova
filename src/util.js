export const $ = (sel) => document.querySelector(sel);

// localStorage can be missing or throw (private windows, sandboxed frames),
// so every read and write goes through here and falls back quietly.
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('blockfire.' + key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('blockfire.' + key, String(value));
    } catch {
      /* storage blocked: the game still works, it just forgets */
    }
  },
};

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = src;
  });
}

// Inside the claude.ai viewer, plain download links are blocked, so saving
// goes through the viewer's downloads capability. Everywhere else a normal
// <a download> works.
let downloadsPromise = null;
export function inArtifactViewer() {
  return !!(window.claude && typeof window.claude.use === 'function');
}

export async function saveBlob(filename, blob) {
  if (inArtifactViewer()) {
    downloadsPromise = downloadsPromise || window.claude.use('downloads');
    const downloads = await downloadsPromise;
    if (!downloads) return { ok: false, reason: 'unavailable' };
    try {
      await downloads.save({ filename, data: blob });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err && err.code) || 'unavailable' };
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { ok: true };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
