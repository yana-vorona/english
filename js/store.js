// Темы (колоды) и карточки. Удаление = пометка deleted (пригодится для синхронизации с облаком).
import * as db from './db.js';

// Коробки повторения: 0 = новое (ещё не изучали), 1..7 = коробки, 8 = выучено.
export const LEARNED_BOX = 8;
// Через сколько дней повторять слово, попавшее в коробку N.
export const INTERVALS = [0, 1, 2, 3, 7, 14, 30, 90];
const DAY = 86400000;

const now = () => Date.now();

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function nextDue(box, t = now()) {
  return box >= LEARNED_BOX ? null : startOfDay(t) + INTERVALS[box] * DAY;
}

// Прогресс из Lexilize → наша коробка. level = сколько раз ответила верно (5 режимов изучения + повторы).
export function boxFromLexilize({ done, level, last }) {
  if (!done) return { box: 0, due: null };
  const box = Math.min(LEARNED_BOX, Math.max(1, (level || 0) - 5));
  return { box, due: nextDue(box, last || now()) };
}

async function log(type, cardId, ok) {
  await db.put('events', { id: uid(), type, cardId, ok, at: now() });
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (en, ru) => clean(en).toLowerCase() + '|' + clean(ru).toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });

// ---------- Темы ----------

export async function listDecks() {
  return (await db.getAll('decks')).filter(d => !d.deleted).sort(byName);
}

export async function getDeck(id) {
  const d = await db.get('decks', id);
  return d && !d.deleted ? d : null;
}

export async function createDeck(name) {
  const t = now();
  const d = { id: uid(), name: clean(name), createdAt: t, updatedAt: t };
  await db.put('decks', d);
  return d;
}

export async function findOrCreateDeck(name) {
  const n = clean(name).toLowerCase();
  const found = (await listDecks()).find(d => d.name.toLowerCase() === n);
  return found || createDeck(name);
}

export async function renameDeck(id, name) {
  const d = await db.get('decks', id);
  d.name = clean(name);
  d.updatedAt = now();
  await db.put('decks', d);
}

export async function deleteDeck(id) {
  const t = now();
  const d = await db.get('decks', id);
  d.deleted = true;
  d.updatedAt = t;
  const cards = (await db.getAllBy('cards', 'deckId', id)).filter(c => !c.deleted);
  for (const c of cards) { c.deleted = true; c.updatedAt = t; }
  await db.put('cards', cards);
  await db.put('decks', d);
}

// Статистика по всем темам: { deckId: { total, learned, due, fresh } }
export async function allStats() {
  const t = now();
  const out = {};
  for (const c of await db.getAll('cards')) {
    if (c.deleted) continue;
    const s = out[c.deckId] ||= { total: 0, learned: 0, due: 0, fresh: 0, score: 0, last: 0 };
    s.total++;
    if (c.box > 0) s.last = Math.max(s.last, c.updatedAt || 0); // когда последний раз учила/повторяла
    s.score += Math.min(c.box || 0, LEARNED_BOX) / LEARNED_BOX; // каждая коробка — шаг к 100%
    if (c.box >= LEARNED_BOX) s.learned++;
    else if (c.box === 0) s.fresh++;
    else if (c.due && c.due <= t) s.due++;
  }
  return out;
}

// ---------- Карточки ----------

export async function listCards(deckId) {
  return (await db.getAllBy('cards', 'deckId', deckId))
    .filter(c => !c.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// pairs: [{en, ru}]. Дубли (то же слово с тем же переводом в этой теме) пропускаем.
export async function addCards(deckId, pairs) {
  const seen = new Set((await listCards(deckId)).map(c => key(c.en, c.ru)));
  const t = now();
  const fresh = [];
  let skipped = 0;
  pairs.forEach((p, i) => {
    const en = clean(p.en), ru = clean(p.ru);
    if (!en || !ru) { skipped++; return; }
    const k = key(en, ru);
    if (seen.has(k)) { skipped++; return; }
    seen.add(k);
    fresh.push({ id: uid(), deckId, en, ru, box: p.box || 0, due: p.due ?? null, createdAt: t + i, updatedAt: t });
  });
  await db.put('cards', fresh);
  return { added: fresh.length, skipped };
}

export async function allCards() {
  return (await db.getAll('cards')).filter(c => !c.deleted);
}

// Слова, которые пора повторить (в одной теме или во всех).
export async function dueCards(deckId = null) {
  const t = now();
  const list = deckId ? await listCards(deckId) : await allCards();
  return list.filter(c => c.box >= 1 && c.box < LEARNED_BOX && c.due && c.due <= t).sort((a, b) => a.due - b.due);
}

// Порция изучена → коробка 1, повтор завтра.
export async function markLearned(ids) {
  const t = now();
  const cards = [];
  for (const id of ids) {
    const c = await db.get('cards', id);
    if (!c || c.box) continue;
    Object.assign(c, { box: 1, due: nextDue(1, t), updatedAt: t });
    cards.push(c);
  }
  await db.put('cards', cards);
  for (const c of cards) await log('learn', c.id, true);
}

// Ответ при повторении. Верно → следующая коробка, ошибка → коробка 1. Раньше срока слово не двигаем.
// ⭐ Сложное слово возвращается чаще: срок — как у коробки на ступень ниже (но не меньше дня).
export async function answerReview(id, ok) {
  const t = now();
  const c = await db.get('cards', id);
  if (!c || !c.due || c.due > t || c.box < 1 || c.box >= LEARNED_BOX) return c;
  c.box = ok ? c.box + 1 : 1;
  c.due = c.hard && c.box < LEARNED_BOX ? startOfDay(t) + Math.max(1, INTERVALS[c.box - 1]) * DAY : nextDue(c.box, t);
  c.updatedAt = t;
  await db.put('cards', c);
  await log('review', id, ok);
  return c;
}

export async function updateCard(id, fields) {
  const c = await db.get('cards', id);
  const oldEn = c.en;
  Object.assign(c, fields, { updatedAt: now() });
  if ('en' in fields) c.en = clean(c.en);
  if ('ru' in fields) c.ru = clean(c.ru);
  // транскрипцию стёрли руками — больше не подбираем; поменяли слово — подберём заново
  if ('tr' in fields) { c.tr = clean(c.tr); c.trNone = !c.tr; }
  else if (c.en !== oldEn) { delete c.tr; delete c.trNone; }
  await db.put('cards', c);
  return c;
}

export async function deleteCard(id) {
  await updateCard(id, { deleted: true });
}

// ---------- Транскрипция ----------
// Не всем словам: юниты 8 и 9 и всё, что добавлено с 26.10.2026. Берём из бесплатного словаря
// dictionaryapi.dev; не нашлось — помечаем trNone, чтобы не спрашивать снова. Поправить можно в карточке слова.
const TR_SINCE = new Date(2026, 9, 26).getTime();
const TR_DECKS = /(unit|юнит)\s*0*[89](?!\d)/i;
const trCache = new Map();

async function ipaOf(word) {
  if (trCache.has(word)) return trCache.get(word);
  let ipa = null;
  try {
    const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), { signal: AbortSignal.timeout(10000) });
    if (res.status === 404) ipa = '';
    else if (res.ok) {
      const list = await res.json();
      const ph = list.flatMap(e => [e.phonetic, ...(e.phonetics || []).map(p => p.text)]).filter(Boolean);
      ipa = (ph.find(p => /ˈ|ɒ|ə/.test(p)) || ph[0] || '').replace(/^[\/\[]|[\/\]]$/g, '');
    }
  } catch {}
  trCache.set(word, ipa);
  return ipa; // null — словарь недоступен, попробуем в другой раз
}

// «to interact» → interact; фраза до 4 слов — транскрипция каждого слова через пробел.
async function transcribe(en) {
  const ws = en.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/^to\s+/, '').split(/[\s\/,]+/).filter(w => /^[a-z'’-]+$/.test(w));
  if (!ws.length || ws.length > 4) return '';
  const parts = [];
  for (const w of ws) {
    const p = await ipaOf(w);
    if (!p) return p;
    parts.push(p);
  }
  return '/' + parts.join(' ') + '/';
}

let filling = false;
export async function fillTranscriptions() {
  if (filling || !navigator.onLine) return 0;
  filling = true;
  let n = 0;
  try {
    const decks = new Set((await listDecks()).filter(d => TR_DECKS.test(d.name)).map(d => d.id));
    const todo = (await allCards()).filter(c => !c.tr && !c.trNone && (decks.has(c.deckId) || c.createdAt >= TR_SINCE));
    for (const c of todo) {
      const tr = await transcribe(c.en);
      if (tr === null) break;
      await updateCard(c.id, tr ? { tr } : { trNone: true });
      if (tr) n++;
    }
  } finally {
    filling = false;
  }
  return n;
}

// ---------- Резервная копия (перенос между устройствами, пока нет облака) ----------

export async function exportAll() {
  return {
    app: 'english-app',
    version: 1,
    exportedAt: new Date().toISOString(),
    decks: await db.getAll('decks'),
    cards: await db.getAll('cards'),
    events: await db.getAll('events'),
    hw: await db.getAll('hw'),
    meta: await db.getAll('meta'),
  };
}

// Слияние: берём запись из файла, если её нет или она новее нашей.
export async function importBackup(data) {
  if (!data || data.app !== 'english-app' || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
    throw new Error('Это не файл копии этого приложения');
  }
  const res = { decks: 0, cards: 0 };
  for (const store of ['decks', 'cards', 'events', 'hw', 'meta']) {
    const mine = new Map((await db.getAll(store)).map(x => [x.id, x]));
    const take = (data[store] || []).filter(x => x && x.id && (!mine.has(x.id) || (x.updatedAt || 0) > (mine.get(x.id).updatedAt || 0)));
    await db.put(store, take);
    res[store] = take.length;
  }
  return res;
}

// ---------- Тренажёр ----------

export async function logEvent(type, cardId, ok) {
  await log(type, cardId, ok);
}

// Трудная пара из тренажёра → карточка в теме «🎯 Тренажёр», коробка 1, повтор завтра.
export async function addHard(pair, hint) {
  const deck = await findOrCreateDeck('🎯 Тренажёр');
  const found = (await listCards(deck.id)).find(c => c.en.toLowerCase() === clean(pair).toLowerCase());
  if (found) return updateCard(found.id, { box: 1, due: nextDue(1) });
  await addCards(deck.id, [{ en: pair, ru: hint || pair, box: 1, due: nextDue(1) }]);
}

// ---------- Домашка ----------

export async function listHw() {
  return (await db.getAll('hw')).filter(h => !h.deleted);
}

export async function getHw(id) {
  const h = await db.get('hw', id);
  return h && !h.deleted ? h : null;
}

export async function saveHw(h) {
  h.updatedAt = now();
  await db.put('hw', h);
  return h;
}

export async function addHw({ book, page, ex, lesson }) {
  const t = now();
  const h = { id: uid(), book, page, ex, lesson, content: null, status: 'todo', answers: [], createdAt: t, updatedAt: t };
  await db.put('hw', h);
  return h;
}

export async function getMeta(id, fallback = null) {
  const m = await db.get('meta', id);
  return m ? m.value : fallback;
}

// задачи «Фиксить» (meta 'fix:<id>'), новые сверху
export async function listFixes() {
  return (await db.getAll('meta')).filter(m => String(m.id).startsWith('fix:') && m.value)
    .map(m => ({ id: m.id, ...m.value })).sort((a, b) => (b.at || 0) - (a.at || 0));
}

// темы тренажёра «что хочу подтянуть» (meta 'tt:<id>'): Claude на ПК готовит по ним упражнения (value.set)
export async function listTopics() {
  return (await db.getAll('meta')).filter(m => String(m.id).startsWith('tt:') && m.value && !m.value.deleted)
    .map(m => ({ id: m.id, ...m.value })).sort((a, b) => (b.at || 0) - (a.at || 0));
}

export async function setMeta(id, value) {
  await db.put('meta', { id, value, updatedAt: now() });
}
