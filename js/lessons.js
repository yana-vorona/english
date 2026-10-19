// Уроки и серия по домашкам. Настройки в облаке (meta 'lessons'):
//   days  — дни уроков (0=вс … 6=сб), по умолчанию вт/чт/сб;
//   moved — разовый перенос { 'было': 'стало' } (даты YYYY-MM-DD);
//   skip  — { дата: 'cancel' | 'nohw' } — урок отменили / ДЗ не задали: серия не сгорает, вместо ДЗ мини-задание.
// Серия: подряд уроки, к которым сделаны все ДЗ (или мини-задание вместо отменённого).
import * as S from './store.js';
import { esc, plural, toast } from './ui.js';

const DAY = 86400000;
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const label = s => { const d = parse(s); return `${WD[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

export async function getCfg() {
  const c = await S.getMeta('lessons', null);
  return { days: [2, 4, 6], moved: {}, skip: {}, ...(c || {}) };
}
const saveCfg = c => S.setMeta('lessons', c);

// Даты уроков в промежутке [from, to] (строки YYYY-MM-DD) с учётом переносов.
export function lessonDates(cfg, from, to) {
  const out = new Set();
  for (let d = parse(from); ymd(d) <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const k = ymd(d);
    if (cfg.days.includes(d.getDay()) && !cfg.moved[k]) out.add(k);
  }
  for (const v of Object.values(cfg.moved)) if (v >= from && v <= to) out.add(v);
  return [...out].sort();
}

// Ближайший урок после сегодня — для новой домашки.
export function nextLessonOf(cfg) {
  const t = new Date();
  return lessonDates(cfg, ymd(new Date(t.getTime() + DAY)), ymd(new Date(t.getTime() + 21 * DAY)))[0] || '';
}

// done — все ДЗ к уроку сделаны (или мини-задание вместо отменённого); todo — есть несделанные; skip — отменено без мини; none — ДЗ не внесены.
export function lessonStatus(L, hw, cfg) {
  const list = hw.filter(h => h.lesson === L && !h.mini);
  const mini = hw.filter(h => h.lesson === L && h.mini);
  if (cfg.skip[L]) return mini.some(h => h.status === 'done') ? 'done' : 'skip';
  if (!list.length) return 'none';
  return list.every(h => h.status === 'done') ? 'done' : 'todo';
}

export async function lessonStreak() {
  const [cfg, hw] = await Promise.all([getCfg(), S.listHw()]);
  const today = ymd(new Date());
  const dates = lessonDates(cfg, ymd(new Date(Date.now() - 200 * DAY)), ymd(new Date(Date.now() + 21 * DAY))).reverse();
  let n = 0;
  for (const L of dates) {
    const st = lessonStatus(L, hw, cfg);
    if (L > today && st !== 'done') continue;    // будущий урок: сделанное заранее идёт в серию, остальное ещё не срок
    if (st === 'done') n++;
    else if (st === 'todo' && L < today) break;   // к прошедшему уроку ДЗ не сделано — серия с нуля
  }
  return n;
}

// Для дуэли: уроки недели (кроме отменённых) и сколько из них «закрыто».
export async function weekLessons(ws) {
  const [cfg, hw] = await Promise.all([getCfg(), S.listHw()]);
  const dates = lessonDates(cfg, ymd(new Date(ws)), ymd(new Date(ws + 6 * DAY)));
  const done = dates.filter(L => lessonStatus(L, hw, cfg) === 'done').length;
  return { total: dates.filter(L => !cfg.skip[L]).length, done };
}

// ---------- Карточка в «Прогрессе» ----------

export async function lessonsCard() {
  const [cfg, hw, streak] = await Promise.all([getCfg(), S.listHw(), lessonStreak()]);
  const today = ymd(new Date());
  const past = lessonDates(cfg, ymd(new Date(Date.now() - 14 * DAY)), ymd(new Date(Date.now() - DAY))).slice(-2);
  const next = lessonDates(cfg, today, ymd(new Date(Date.now() + 21 * DAY))).slice(0, 3);
  const row = L => {
    const st = lessonStatus(L, hw, cfg);
    const left = hw.filter(h => h.lesson === L && !h.mini && h.status !== 'done').length;
    const text = st === 'done' ? '✅ сделано' : st === 'skip' ? (cfg.skip[L] === 'cancel' ? '🚫 урок отменили' : '🚫 ДЗ не задали') + ' · мини-задание в «Домашке»'
      : st === 'todo' ? (L < today ? '❌ не успела' : `⏳ осталось ${left} ДЗ`) : (L < today ? '— ДЗ не внесено' : '— ДЗ пока нет');
    return `<div class="lrow${L === today ? ' today' : ''}"><span class="ld">${esc(label(L))}</span><span class="ls">${text}</span>
      <span class="lb">${L >= today ? `<button class="talkBtn" data-lmove="${L}" title="перенести урок">📅</button>` : ''}${cfg.skip[L]
        ? `<button class="talkBtn" data-lunskip="${L}" title="вернуть урок">↩</button>` : `<button class="talkBtn" data-lskip="${L}" title="урок отменили / ДЗ не задали">🚫</button>`}</span></div>`;
  };
  return `<section class="card" id="lessons">
    <h2>🔥 Серия домашек: ${streak} ${plural(streak, 'урок', 'урока', 'уроков')} подряд</h2>
    <p class="muted">Сделала все ДЗ к уроку — серия +1. Не успела к уроку — серия с нуля. Урок отменили или ДЗ не задали — нажми 🚫: серия не сгорит, а вместо ДЗ будет мини-задание по твоим темам из тренажёра.</p>
    <div class="lessons">${[...past, ...next].map(row).join('')}</div>
    <p class="muted" style="margin-bottom:4px">Дни уроков:</p>
    <div class="ldays">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="talkBtn${cfg.days.includes(d) ? ' on' : ''}" data-lday="${d}">${WD[d]}</button>`).join('')}</div>
  </section>`;
}

function choose(title, body) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.innerHTML = `<form method="dialog"><h3>${title}</h3>${body}</form>`;
    document.body.append(d);
    d.addEventListener('close', () => { resolve(d.returnValue && d.returnValue !== 'cancel' ? { v: d.returnValue, d } : null); d.remove(); });
    d.showModal();
  });
}

// Кнопки карточки; after — перерисовать экран.
export function bindLessons(root, after) {
  root.querySelectorAll('[data-lday]').forEach(b => b.onclick = async () => {
    const cfg = await getCfg(), d = +b.dataset.lday;
    cfg.days = cfg.days.includes(d) ? cfg.days.filter(x => x !== d) : [...cfg.days, d].sort();
    await saveCfg(cfg); after();
  });
  root.querySelectorAll('[data-lmove]').forEach(b => b.onclick = async () => {
    const L = b.dataset.lmove;
    const r = await choose(`📅 Перенести урок ${esc(label(L))}`, `<label>Новая дата<input name="to" type="date" value="${L}"></label>
      <div class="row rev"><button value="ok" class="btn primary">Перенести</button><button value="cancel" class="btn ghost" formnovalidate>Отмена</button></div>`);
    const to = r && r.d.querySelector('[name=to]').value;
    if (!to || to === L) return;
    const cfg = await getCfg();
    const orig = Object.keys(cfg.moved).find(k => cfg.moved[k] === L) || L;   // урок уже переносили — двигаем исходный
    if (orig === to) delete cfg.moved[orig]; else cfg.moved[orig] = to;
    if (cfg.skip[L]) { cfg.skip[to] = cfg.skip[L]; delete cfg.skip[L]; }
    await saveCfg(cfg);
    for (const h of await S.listHw()) if (h.lesson === L) { h.lesson = to; await S.saveHw(h); }
    toast(`Урок перенесён на ${label(to)}`); after();
  });
  root.querySelectorAll('[data-lskip]').forEach(b => b.onclick = async () => {
    const L = b.dataset.lskip;
    const r = await choose(`🚫 Урок ${esc(label(L))}`, `<p class="muted">Серия не сгорит. Вместо ДЗ будет мини-задание на 5–10 минут по твоим темам из тренажёра — сделаешь, и оно засчитается.</p>
      <div class="chips"><button value="cancel_lesson" class="btn">Урок отменили</button><button value="nohw" class="btn">ДЗ не задали</button></div>
      <div class="row rev"><button value="cancel" class="btn ghost" formnovalidate>Отмена</button></div>`);
    if (!r) return;
    const cfg = await getCfg();
    cfg.skip[L] = r.v === 'nohw' ? 'nohw' : 'cancel';
    await saveCfg(cfg);
    const hw = await S.listHw();
    if (!hw.some(h => h.lesson === L && h.mini)) {
      const topics = (await S.listTopics()).map(t => t.text);
      const topic = topics.length ? topics[Math.floor(Math.random() * topics.length)] : '';
      const h = await S.addHw({ book: 'free', page: '', ex: '', lesson: L });
      Object.assign(h, { title: 'Мини-задание' + (topic ? ': ' + topic : ' вместо урока'), mini: 1, topic, chat: [], tutor: { status: 'new', at: Date.now() } });
      await S.saveHw(h);
    }
    toast('Готово. Мини-задание появится в «Домашке» через минуту-две 🎯'); after();
  });
  root.querySelectorAll('[data-lunskip]').forEach(b => b.onclick = async () => {
    const cfg = await getCfg();
    delete cfg.skip[b.dataset.lunskip];
    await saveCfg(cfg); after();
  });
}
