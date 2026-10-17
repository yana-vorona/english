// Хранилище в браузере (IndexedDB). Каждое изменение записывается сразу.
const DB_NAME = 'english-app';
const DB_VERSION = 2; // 2: журнал занятий events

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
export async function put(store, items) {
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return;
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const it of list) s.put(it);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
