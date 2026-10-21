// Питомец: растёт от домашек, слов и чтения глав. Неделя, в которой сделаны ДЗ ко всем урокам, — новый облик (какой — сюрприз).
// Грустит, если к прошедшему уроку ДЗ не сделано. Картинки — icons/pet/0..N.png (Microsoft Fluent Emoji 3D, MIT).
import { weekLessons, lessonStreak, getCfg, lessonDates, lessonStatus, ymd } from './lessons.js';
import * as S from './store.js';
import * as db from './db.js';

const DAY = 86400000;
const FIRST_WEEK = new Date(2026, 9, 19).getTime();   // пн 19.10 — с этой недели питомец растёт
const FORMS = 7;
const weekStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; };

// Слова и чтение тоже кормят: неделя, в которой учила/повторяла слова или читала главу WORD_DAYS дней, — ещё +1 облик.
const WORD_DAYS = 3;
async function wordDaysByWeek() {
  const map = new Map();
  for (const e of await db.getAll('events')) {
    if (e.type !== 'review' && e.type !== 'learn' && e.type !== 'read') continue;
    const w = weekStart(e.at);
    if (!map.has(w)) map.set(w, new Set());
    map.get(w).add(Math.floor((e.at - w) / DAY));
  }
  return map;
}

export async function petState() {
  const now = Date.now(), ws = weekStart(now);
  const wd = await wordDaysByWeek();
  let level = 0, thisWeek = null;
  for (let w = FIRST_WEEK; w <= ws; w += 7 * DAY) {
    const wl = await weekLessons(w);
    if (w === ws) thisWeek = wl;
    if (wl.total && wl.done >= wl.total) level++;
    if ((wd.get(w)?.size || 0) >= WORD_DAYS) level++;
  }
  const wordDays = wd.get(ws)?.size || 0;
  const wordsToday = wd.get(ws)?.has(Math.floor((now - ws) / DAY)) || false;
  // грустит: последний прошедший урок остался без сделанного ДЗ
  const [cfg, hw] = await Promise.all([getCfg(), S.listHw()]);
  const today = ymd(new Date());
  const last = lessonDates(cfg, ymd(new Date(now - 14 * DAY)), ymd(new Date(now - DAY))).reverse()
    .find(L => lessonStatus(L, hw, cfg) !== 'none');
  const sad = !!last && lessonStatus(last, hw, cfg) === 'todo' && last < today;
  return { level: Math.min(level, FORMS - 1), maxed: level >= FORMS - 1, sad, week: thisWeek, streak: await lessonStreak(), wordDays, wordsToday };
}

export async function petCard() {
  const p = await petState();
  const w = p.week || { done: 0, total: 0 };
  const left = Math.max(0, w.total - w.done);
  const mood = p.sad ? 'Грустит: к прошлому уроку ДЗ не сделано 🥺 Сделаешь — повеселеет.'
    : p.wordsToday ? 'Сегодня покормлен словами или чтением — доволен 💛'
    : p.streak ? 'Доволен и сыт 💛' : 'Ждёт первую домашку, слова или главу 🙂';
  // Понятно по шагам: за неделю можно получить 2 новых облика — за ДЗ и за 3 дня занятий.
  const hwLine = !w.total ? '📚 Домашки: на этой неделе уроков нет.'
    : left ? `📚 Домашки ко всем урокам недели: сделано ${w.done} из ${w.total}.` : '📚 Домашки на этой неделе все сделаны — облик получен ✨';
  const wl = Math.max(0, WORD_DAYS - p.wordDays);
  const dayLine = wl ? `📖 3 разных дня со словами или главой: есть ${p.wordDays} из ${WORD_DAYS}.` : '📖 3 дня занятий на этой неделе есть — облик получен ✨';
  const todayLine = p.wordsToday ? 'Сегодня уже засчитан 👍 Можно читать и учить дальше, но в зачёт идёт день, а не количество глав — приходи завтра.' : '';
  const how = p.maxed ? '<p class="muted">Это самый последний облик — ты дошла до конца 🏆</p>'
    : `<p class="muted"><b>Как растёт:</b> каждую неделю можно получить до 2 новых обликов.</p>
      <p class="muted">${hwLine}<br>${dayLine}</p>${todayLine ? `<p class="muted">${todayLine}</p>` : ''}`;
  return `<section class="card pet">
    <img class="petimg${p.sad ? ' sad' : ''}" src="icons/pet/${p.level}.png" alt="">
    <div><h2>🐾 Питомец · облик ${p.level + 1} из ${FORMS}</h2>
      <p class="muted">${mood}</p>${how}</div>
  </section>`;
}
