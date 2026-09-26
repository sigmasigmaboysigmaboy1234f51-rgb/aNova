import { inArtifactViewer } from './util.js';

// The web version (GitHub Pages or any web host) can be installed like an
// app: "Add to Home Screen" on iPhone, iPad and Android, "Install" in Chrome
// and Edge on computers and Chromebooks. It then works offline too.
export function setupWebApp() {
  try {
    const web = /^https?:$/.test(location.protocol) && !inArtifactViewer() && !window.Capacitor && location.hostname !== 'localhost';
    if (!web) return;
    const link = (rel, href) => {
      const l = document.createElement('link');
      l.rel = rel;
      l.href = href;
      document.head.appendChild(l);
    };
    link('manifest', 'manifest.webmanifest');
    link('icon', 'build/icon-192.png');
    link('apple-touch-icon', 'build/icon-180.png');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  } catch {
    // Not a normal web page: nothing to install.
  }
}
