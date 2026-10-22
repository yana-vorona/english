// Питомец: растёт от бонусов. ДЗ — 3 бонуса, каждые 2 новые главы — 2 бонуса, каждые 30 повторённых слов — 2 бонуса.
// Набрала порог — новый облик (какой — сюрприз). Грустит, если к прошедшему уроку ДЗ не сделано.
// Картинки — icons/pet/0..N.png (Microsoft Fluent Emoji 3D, MIT).
import { lessonStreak, getCfg, lessonDates, lessonStatus, ymd } from './lessons.js';
import * as S from './store.js';
import * as db from './db.js';

const DAY = 86400000;
const FIRST_WEEK = new Date(2026, 9, 19).getTime();   // пн 19.10 — с этой недели питомец растёт
const FORMS = 7;
const HW_PTS = 3, READ_N = 2, READ_PTS = 2, WORDS_N = 30, WORDS_PTS = 2;
// Сколько всего бонусов нужно для облика 2, 3, … 7. Шаги растут понемногу: первые облики быстрее.
const STEPS = [15, 40, 75, 120, 180, 250];
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export async function petState() {
  const now = Date.now(), today0 = dayStart(now);
  const [events, hw, cfg] = await Promise.all([db.getAll('events'), S.listHw(), getCfg()]);
  const chapters = new Set();
  let words = 0, fedToday = false;
  for (const e of events) {
    if (e.at < FIRST_WEEK) continue;
    if (e.type === 'read') chapters.add(e.cardId);                       // перечитанная глава второй раз не считается
    else if (e.type === 'review' || e.type === 'learn') words++;
    else continue;
    if (e.at >= today0) fedToday = true;
  }
  const hwDone = hw.filter(h => h.status === 'done' && (h.doneAt || 0) >= FIRST_WEEK);
  if (hwDone.some(h => h.doneAt >= today0)) fedToday = true;
  const pts = {
    hw: hwDone.length * HW_PTS,
    read: Math.floor(chapters.size / READ_N) * READ_PTS,
    words: Math.floor(words / WORDS_N) * WORDS_PTS,
  };
  const total = pts.hw + pts.read + pts.words;
  const level = Math.min(STEPS.filter(s => total >= s).length, FORMS - 1);
  const next = STEPS[level] ?? null;
  // грустит: последний прошедший урок остался без сделанного ДЗ
  const todayY = ymd(new Date());
  const last = lessonDates(cfg, ymd(new Date(now - 14 * DAY)), ymd(new Date(now - DAY))).reverse()
    .find(L => lessonStatus(L, hw, cfg) !== 'none');
  const sad = !!last && lessonStatus(last, hw, cfg) === 'todo' && last < todayY;
  return {
    level, maxed: level >= FORMS - 1, sad, fedToday, streak: await lessonStreak(), total, next, pts,
    hwCount: hwDone.length, chapters: chapters.size, words,
  };
}

export async function petCard() {
  const p = await petState();
  const mood = p.sad ? 'Грустит: к прошлому уроку ДЗ не сделано 🥺 Сделаешь — повеселеет.'
    : p.fedToday ? 'Сегодня покормлен — доволен 💛'
    : p.streak ? 'Доволен и сыт 💛' : 'Ждёт первую домашку, слова или главу 🙂';
  // остаток до следующей «порции»: сколько глав / слов ещё до бонуса
  const readLeft = READ_N - p.chapters % READ_N, wordsLeft = WORDS_N - p.words % WORDS_N;
  const how = `<p class="muted"><b>Как растёт:</b> за занятия даются бонусы 🍪</p>
    <p class="muted">📚 1 сделанное ДЗ — ${HW_PTS} 🍪 (у тебя ${p.hwCount} → ${p.pts.hw} 🍪)<br>
      📖 2 прочитанные главы — ${READ_PTS} 🍪 (прочитано ${p.chapters} → ${p.pts.read} 🍪; до следующих ещё ${readLeft} ${readLeft === 1 ? 'глава' : 'главы'})<br>
      🔁 30 повторённых слов — ${WORDS_PTS} 🍪 (повторено ${p.words} → ${p.pts.words} 🍪; до следующих ещё ${wordsLeft})</p>
    <p class="muted">${p.maxed ? 'Это самый последний облик — ты дошла до конца 🏆'
      : `Всего ${p.total} 🍪. Новый облик — на ${p.next} 🍪, осталось ${p.next - p.total} 🍪.`}</p>`;
  return `<section class="card pet">
    <img class="petimg${p.sad ? ' sad' : ''}" src="icons/pet/${p.level}.png" alt="">
    <div><h2>🐾 Питомец · облик ${p.level + 1} из ${FORMS}</h2>
      <p class="muted">${mood}</p>${how}</div>
  </section>`;
}
