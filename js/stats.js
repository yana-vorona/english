// Мотивация: баллы (1 минута по оценке = 1 балл, 🔴 ×2), эта неделя против прошлой,
// серия дней (воскресенье — выходной, одна «заморозка» в неделю), босс «Фразовые глаголы» до 50%,
// план повторения на неделю (порции до ~10 минут в день).
import * as S from './store.js';
import { esc, plural } from './ui.js';
import * as db from './db.js';
import { storyCard } from './story.js';
import { duelCard } from './duel.js';

const $app = document.getElementById('app');
const DAY = 86400000;
const BOSS_DECK = 'фразовые глаголы';
const BOSS_GOAL = 50;
const WORDS_PER_MIN = 8;      // повторение: ~1 мин на 8 слов
const DAILY_CAP = 80;         // ~10 минут повторения в день

const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const weekStart = t => { const d = new Date(startOfDay(t)); const wd = (d.getDay() + 6) % 7; return d.getTime() - wd * DAY; };
const dayKey = t => new Date(t).toISOString().slice(0, 10);

// Баллы за одно событие журнала.
function eventPoints(e) {
  if (e.type === 'review') return 1 / WORDS_PER_MIN;
  if (e.type === 'learn') return 3 / 5;        // новые слова: ~3 мин на 5 слов
  if (e.type === 'trainer') return 0.25;       // ~15 секунд на вопрос
  return 0;
}

export async function computeStats() {
  const [events, hw, cards, decks] = await Promise.all([db.getAll('events'), S.listHw(), S.allCards(), S.listDecks()]);
  const now = Date.now();
  const wk = weekStart(now), prevWk = wk - 7 * DAY;
  let week = 0, prev = 0;
  const active = new Set();
  const add = (t, p) => {
    if (t >= wk) week += p; else if (t >= prevWk) prev += p;
    active.add(dayKey(startOfDay(t)));
  };
  for (const e of events) add(e.at, eventPoints(e));
  for (const h of hw) if (h.status === 'done' && h.doneAt) add(h.doneAt, (h.minutes || 0) * (h.difficulty === 'red' ? 2 : 1));

  // Серия: идём назад от сегодня (если сегодня ещё не занималась — от вчера).
  let streak = 0, d = startOfDay(now);
  const freezeUsedWeeks = new Set(), pending = [];
  if (!active.has(dayKey(d))) d -= DAY;
  for (let i = 0; i < 400; i++, d -= DAY) {
    if (active.has(dayKey(d))) { streak++; pending.splice(0).forEach(w => freezeUsedWeeks.add(w)); continue; }
    if (new Date(d).getDay() === 0) continue;               // воскресенье — выходной
    const w = weekStart(d);
    if (!freezeUsedWeeks.has(w) && !pending.includes(w)) { pending.push(w); continue; }   // заморозка — засчитаем, если спасла серию
    break;
  }
  const freezeLeft = freezeUsedWeeks.has(wk) ? 0 : 1;

  // Босс.
  const boss = decks.find(x => x.name.toLowerCase().includes(BOSS_DECK));
  let bossPct = 0;
  if (boss) {
    const bc = cards.filter(c => c.deckId === boss.id);
    bossPct = bc.length ? Math.round(bc.reduce((a, c) => a + Math.min(c.box || 0, S.LEARNED_BOX) / S.LEARNED_BOX, 0) / bc.length * 100) : 0;
  }

  // План повторения на 7 дней: что пора + что подойдёт, не больше ~10 минут в день.
  const today = startOfDay(now);
  const plan = [];
  let carry = cards.filter(c => c.box >= 1 && c.box < S.LEARNED_BOX && c.due && c.due < today + DAY).length;
  for (let i = 0; i < 7; i++) {
    const from = today + i * DAY;
    if (i > 0) carry += cards.filter(c => c.box >= 1 && c.box < S.LEARNED_BOX && c.due >= from && c.due < from + DAY).length;
    const take = Math.min(carry, DAILY_CAP);
    carry -= take;
    plan.push({ day: from, words: take, minutes: Math.ceil(take / WORDS_PER_MIN) });
  }
  const todayDone = active.has(dayKey(today));
  return { week: Math.round(week), prev: Math.round(prev), streak, freezeLeft, todayDone, boss: !!boss, bossPct, plan };
}

export function statsBanner(s) {
  return `<a class="banner" href="#/stats">
    <span>🔥 ${s.streak} ${plural(s.streak, 'день', 'дня', 'дней')}</span>
    <span>⭐ ${s.week} ${s.prev ? `<small>(прошлая ${s.prev})</small>` : ''}</span>
    ${s.boss ? `<span>👾 ${s.bossPct}%</span>` : ''}
  </a>`;
}

export async function statsView() {
  const s = await computeStats();
  const wd = t => new Date(t).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
  const diff = s.week - s.prev;
  $app.innerHTML = `
    <header class="top"><h1>🏆 Прогресс</h1></header>
    ${await storyCard()}
    ${await duelCard()}
    <section class="card">
      <h2>⭐ Баллы за неделю</h2>
      <p class="big-num">${s.week}</p>
      <p class="muted">Прошлая неделя: ${s.prev}. ${s.prev ? (diff >= 0 ? `Уже обгоняешь на ${diff} 💪` : `До прошлой недели ${-diff} — догонишь 😉`) : 'Это первая неделя — всё впереди 🌱'}</p>
      <p class="muted">1 минута занятий = 1 балл, 🔴 задания ×2.</p>
    </section>
    <section class="card">
      <h2>🔥 Серия: ${s.streak} ${plural(s.streak, 'день', 'дня', 'дней')}</h2>
      <p class="muted">${s.todayDone ? 'Сегодня уже занималась ✅' : 'Сегодня ещё не занималась — хватит и 5 минут.'}
      Воскресенье — выходной, и раз в неделю можно пропустить день (заморозка ❄️${s.freezeLeft ? ' пока не потрачена' : ' уже потрачена'}).</p>
    </section>
    ${s.boss ? `<section class="card">
      <h2>👾 Босс: «Фразовые глаголы» до ${BOSS_GOAL}%</h2>
      <div class="bar boss"><i style="width:${Math.min(100, s.bossPct / BOSS_GOAL * 100)}%"></i></div>
      <p class="muted">Сейчас ${s.bossPct}% из ${BOSS_GOAL}%. ${s.bossPct >= BOSS_GOAL ? 'Босс повержен 🏆' : 'Учи по 5 новых и повторяй — шкала растёт с каждой коробкой.'}</p>
    </section>` : ''}
    <section class="card">
      <h2>📅 План повторения на неделю</h2>
      <div class="plan">${s.plan.map((p, i) => `
        <div class="plan-row${i === 0 ? ' today' : ''}"><span>${i === 0 ? 'Сегодня' : esc(wd(p.day))}</span>
        <span>${p.words ? `🔁 ${p.words} · ~${p.minutes} мин` : '—'}</span></div>`).join('')}</div>
      <p class="muted">Не больше ~10 минут в день: если накопилось много, раскладываю на несколько дней.</p>
    </section>`;
}
