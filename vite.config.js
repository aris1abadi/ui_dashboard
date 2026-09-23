import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Script klasik (non-module) + service worker TIDAK ikut di-bundle oleh Vite,
// padahal GitHub Pages hanya menyajikan folder dist/. Tanpa ini halaman hasil
// build tidak punya app.js/alpine.min.js/mqtt.min.js/sw.js sama sekali.
// File disalin apa adanya dari root repo supaya tetap satu sumber kebenaran
// (hosting dari branch root juga tetap jalan).
const STATIC_FILES = ['mqtt.min.js', 'alpine.min.js', 'chart.umd.min.js', 'app.js', 'sw.js', 'offline.html', 'manifest.webmanifest', 'icon.svg'];

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
      // sedangkan `icons[].src` di dalamnya ditulis relatif ("icon.svg") sehingga
      // browser meminta /assets/icon.svg. Salin juga ke /assets/ supaya ikon PWA
      // tidak 404 (isi manifest tidak diubah oleh Vite).
      const iconSrc = resolve(root, 'icon.svg');
      if (existsSync(iconSrc)) {
        mkdirSync(resolve(target, 'assets'), { recursive: true });
        copyFileSync(iconSrc, resolve(target, 'assets', 'icon.svg'));
      }
    },
  };
}

export default defineConfig({
  plugins: [copyStaticFiles()],
});
