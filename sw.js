// ═══════════════════════════════════════════════════════════════════════════
//  SAKLAR MATI service worker — fitur offline SUDAH TIDAK DIPAKAI
// ═══════════════════════════════════════════════════════════════════════════
//  LATAR BELAKANG (25 Sep 2026)
//  Service worker dulu dipasang untuk "mode offline" / mode langsung ke AP:
//  dashboard HTTPS memakai SW untuk mem-proxy permintaan HTTP ke kontroler
//  lokal (menghindari mixed-content/CORS). Jalur itu terkendala CORS, dan untuk
//  kontrol langsung kini cukup membuka webserver di filesystem ESP32
//  (http://192.168.4.1) — jadi offline + proxy SW tidak diperlukan lagi.
//
//  MENGAPA BERKAS INI MASIH ADA
//  Pengguna yang pernah membuka versi lama masih PUNYA service worker versi
//  cache di browser-nya. Selama `sw.js` masih bisa diambil, browser akan
//  memeriksa perubahannya setiap navigasi. Berkas ini membuat SW lama:
//    1) mengambil alih segera (skipWaiting),
//    2) MENGHAPUS semua cache milik aplikasi,
//    3) MELEPAS dirinya sendiri (unregister).
//  Setelah itu halaman berjalan tanpa SW dan selalu mengambil berkas terbaru
//  dari server (tidak ada lagi "UI basi" setelah deploy).
//
//  `index.html` BARU tidak lagi memanggil serviceWorker.register().
//  Handler `fetch` kosong di bawah hanya supaya SW tetap sah selama proses
//  pelepasan (tanpa respondWith, semua permintaan langsung ke jaringan).
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Cache Storage tidak tersedia — tidak masalah, tujuan utamanya
      // adalah melepas SW.
    }
    try {
      await self.registration.unregister();
    } catch {
      // Sudah dilepas oleh konteks lain.
    }
  })());
});

// Tanpa respondWith → tidak ada cache, permintaan langsung ke jaringan.
self.addEventListener('fetch', () => {});
