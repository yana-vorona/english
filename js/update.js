// Новая версия на сайте → жёлтая плашка «🔄 Есть обновление» (как в штабе). Версия = имя кэша в sw.js.
let loaded = null;

async function siteVersion() {
  const t = await (await fetch('sw.js', { cache: 'no-cache' })).text();
  return (t.match(/CACHE = '([^']+)'/) || [])[1];
}

export async function refreshApp() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map(r => r.update()));
  } catch {}
  location.reload();
}

async function check() {
  try {
    const v = await siteVersion();
    if (!loaded) loaded = v;
    else if (v && v !== loaded && !document.getElementById('upd')) {
      const b = document.createElement('button');
      b.id = 'upd';
      b.className = 'upd';
      b.textContent = '🔄 Есть обновление — нажми';
      b.onclick = refreshApp;
      document.body.append(b);
    }
  } catch {}
}

export function startUpdates() {
  check();
  setInterval(check, 3 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
