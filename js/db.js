// Хранилище в браузере (IndexedDB). Каждое изменение записывается сразу.
const DB_NAME = 'english-app';
const DB_VERSION = 3; // 2: журнал занятий events; 3: домашка hw, настройки meta

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('cards')) {
          const s = db.createObjectStore('cards', { keyPath: 'id' });
          s.createIndex('deckId', 'deckId');
        }
        if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('hw')) db.createObjectStore('hw', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}

function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).getAll());
}

export async function getAllBy(store, index, value) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function get(store, id) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).get(id));
}

// Записать один или несколько объектов одной транзакцией.
// Своё изменение помечаем _dirty — его отправит синхронизация; пришедшее из облака (fromSync) — нет.
export async function put(store, items, { fromSync = false } = {}) {
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return;
  for (const it of list) {
    if (fromSync) delete it._dirty; else it._dirty = 1;
  }
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const it of list) s.put(it);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  if (!fromSync && typeof window !== 'undefined') window.dispatchEvent(new Event('localchange'));
}

// ---------- Для синхронизации ----------

const stamp = r => r.updatedAt || r.at || 0;

export async function getDirty(store) {
  return (await getAll(store)).filter(r => r._dirty);
}

// Облако приняло записи — снимаем пометку, если запись с тех пор не менялась.
export async function clearDirty(store, sent) {
  const done = [];
  for (const s of sent) {
    const cur = await get(store, s.id);
    if (cur && cur._dirty && stamp(cur) === stamp(s)) done.push(cur);
  }
  await put(store, done, { fromSync: true });
}

// Записи из облака: берём то, что новее нашего. Возвращает, сколько реально изменилось.
export async function merge(store, incoming) {
  const take = [];
  for (const r of incoming) {
    const cur = await get(store, r.id);
    if (!cur || stamp(r) > stamp(cur)) take.push(r);
  }
  await put(store, take, { fromSync: true });
  return take.length;
}
