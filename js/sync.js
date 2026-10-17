// Синхронизация с облаком (программа «English sync» в Google владельца).
// Отправляем свои изменения (_dirty), получаем чужие — всё, что изменилось в облаке после прошлого раза.
import * as db from './db.js';
import { load, save, forget } from './ui.js';

const STORES = ['decks', 'cards', 'events', 'hw', 'meta'];
let running = null, timer = null;

export const syncConfig = () => load('sync', null); // {url, key}

export function connect(cfg) {
  save('sync', cfg);
  save('syncSince', 0);
}

export function disconnect() {
  forget('sync');
  forget('syncSince');
  forget('syncStatus');
}

export const syncStatus = () => load('syncStatus', null); // {at, ok, msg}

export function syncSoon(ms = 2000) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

export function syncNow() {
  const cfg = syncConfig();
  if (!cfg || !navigator.onLine) return Promise.resolve(false);
  if (running) return running;
  running = (async () => {
    try {
      const changes = {};
      for (const s of STORES) changes[s] = await db.getDirty(s);
      const res = await fetch(cfg.url, {
        method: 'POST',
        body: JSON.stringify({ key: cfg.key, since: load('syncSince', 0), changes }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      let pulled = 0;
      for (const s of STORES) {
        // Отправленным считаем только то, что облако вернуло как сохранённое.
        const saved = new Set((data.changes[s] || []).map(r => r.id));
        await db.clearDirty(s, changes[s].filter(r => saved.has(r.id)));
        pulled += await db.merge(s, data.changes[s] || []);
      }
      save('syncSince', data.now);
      save('syncStatus', { at: Date.now(), ok: true });
      if (pulled) window.dispatchEvent(new Event('synced'));
      return true;
    } catch (e) {
      save('syncStatus', { at: Date.now(), ok: false, msg: e.message });
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

// Запускаем: при открытии, после изменений, при возврате в приложение, раз в минуту.
export function startSync() {
  window.addEventListener('localchange', () => syncSoon());
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(syncNow, 60000);
  syncNow();
}
