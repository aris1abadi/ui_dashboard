import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Ikon PWA/favicon (dibuat oleh tools/make_icons.py dari karjoAgroGHUIapp.png).
// Disalin ke dist/ (root, karena di-precache sw.js) DAN dist/assets/ (manifest
// ber-hash berada di /assets/ dan `icons[].src` di dalamnya ditulis relatif,
// jadi berkasnya harus ada di sana — lihat catatan 404 ikon PWA di README).
const ICON_FILES = [
  'icon.svg',
  'favicon.ico',
  'favicon-16.png',
  'favicon-32.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

// Script klasik (non-module) + service worker TIDAK ikut di-bundle oleh Vite,
// padahal GitHub Pages hanya menyajikan folder dist/. Tanpa ini halaman hasil
// build tidak punya app.js/alpine.min.js/mqtt.min.js/sw.js sama sekali.
// File disalin apa adanya dari root repo supaya tetap satu sumber kebenaran
// (hosting dari branch root juga tetap jalan).
const STATIC_FILES = ['mqtt.min.js', 'alpine.min.js', 'chart.umd.min.js', 'app.js', 'sw.js', 'manifest.webmanifest', ...ICON_FILES];

function copyStaticFiles() {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'karjo-copy-static-files',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const target = resolve(root, outDir);
      mkdirSync(target, { recursive: true });
      for (const file of STATIC_FILES) {
        const src = resolve(root, file);
        if (!existsSync(src)) {
          this.warn(`Static file tidak ditemukan: ${file}`);
          continue;
        }
        copyFileSync(src, resolve(target, file));
      }

      // Vite memindahkan manifest.webmanifest ke /assets/<nama>-<hash>.webmanifest,
      // sedangkan `icons[].src` di dalamnya ditulis relatif ("icon-192.png") sehingga
      // browser meminta /assets/icon-192.png. Salin juga ke /assets/ supaya ikon PWA
      // tidak 404 (isi manifest tidak diubah oleh Vite).
      const assetsDir = resolve(target, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      for (const file of ICON_FILES) {
        const src = resolve(root, file);
        if (!existsSync(src)) {
          this.warn(`Ikon tidak ditemukan: ${file}`);
          continue;
        }
        copyFileSync(src, resolve(assetsDir, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [copyStaticFiles()],
});
