// Офлайн-режим: сначала пробуем свежую версию из сети, без сети берём сохранённую.
const CACHE = 'english-app-v52';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/game.js', './js/arcade.js','./js/app.js', './js/store.js', './js/db.js', './js/importer.js', './js/ui.js', './js/study.js', './js/sync.js', './js/palette.js', './js/trainer.js', './js/hw.js', './js/stats.js', './js/story.js', './js/update.js', './js/duel.js', './js/lessons.js', './js/pet.js', './sets/index.json',
  './icons/icon-192.png', './icons/fox-words.png', './icons/fox-trainer.png', './icons/fox-hw.png', './icons/fox-progress.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: всегда спрашиваем у сайта свежую версию, а не старую копию браузера
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
