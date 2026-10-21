// «Лисья дуэль» с Енотом Бруно. Каждый урок недели, к которому сделаны все ДЗ, = набор из 3 карт (слова, которые Яна уже учила).
// У Бруно — наборы за все уроки недели (дни из настроек, отменённые не в счёт). 5 раундов: выбираешь карту, отвечаешь перевод —
// Бруно ходит первым (карта открыта), отвечаешь перевод за 7 секунд — верно: сила ×2 (+3 за скорость, + серия), неверно/не успела:
// карта сгорает. Особые карты 🔄/🛡 — см. KINDS. Настоящая дуэль — в воскресенье, с недели 19.10.
import * as S from './store.js';
import { esc, toast, load, save } from './ui.js';
import { weekLessons } from './lessons.js';

const $app = document.getElementById('app');
const DAY = 86400000;
const FIRST_WEEK = new Date(2026, 9, 19).getTime();
const LESSONS_PER_WEEK = 3;
const ROUNDS = 5;

const BRUNO = {
  start: ['Ну что, лисичка, проверим, чему тебя Юля научила? 🦝', 'О, пришла! А я уже карты в рукав разложил 😏', 'Садись. Только хвост убери со стола.'],
  herRound: ['Ой. Повезло. Бывает.', 'Хм. Неплохо. Для лисы.', 'Ладно, этот раунд твой. Запомню.', 'Ты что, словарь на завтрак ешь?'],
  hisRound: ['Ха! Учи слова, а не хвост расчёсывай!', 'Это было легко. Скучно даже.', 'Енот — один, лиса — ноль 🦝', 'Может, тебе подсказку? Шучу, не дам.'],
  empty: ['Лапы пустые? Надо было домашку делать 😏', 'Нет карт — нет веселья. Хи-хи.'],
  winHer: ['Ладно-ладно… Реванш в следующее воскресенье. Я буду готов.', 'Ты победила. Не привыкай.'],
  winHim: ['Хи-хи. Приходи, когда сделаешь все три домашки 😏', 'Енот всегда в выигрыше. Почти всегда.'],
  draw: ['Ничья?! Это заговор.'],
};
const say = k => BRUNO[k][Math.floor(Math.random() * BRUNO[k].length)];

const weekStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; };

// Детерминированный «случай», чтобы колода недели не менялась при каждом открытии.
function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}
const pick = (arr, n, r) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};

async function pool() {
  const cards = (await S.allCards()).filter(c => c.box >= 1 && c.en.length < 28 && c.ru.length < 40);
  return cards.map(c => ({ id: c.id, en: c.en, ru: c.ru, power: Math.max(2, 10 - Math.min(c.box, 8)) }));
}

export async function duelState() {
  const ws = weekStart(Date.now());
  const wl = await weekLessons(ws);   // набор карт = урок, к которому сделаны все ДЗ (или мини-задание)
  const played = await S.getMeta('duel:' + ws);
  return { ws, sets: wl.done, rival: wl.total || LESSONS_PER_WEEK, real: ws >= FIRST_WEEK, sunday: new Date().getDay() === 0, played };
}

export async function duelCard() {
  const d = await duelState();
  const when = !d.real ? 'Первая настоящая дуэль — в воскресенье 25.10.' :
    d.played ? `На этой неделе уже сыграли: ${d.played.win ? 'ты победила 🏆' : 'победил Бруно 🦝'}.` :
    d.sunday ? 'Сегодня воскресенье — Бруно ждёт! 🦝' : 'Дуэль — в воскресенье.';
  return `<section class="card">
    <h2>🃏 Лисья дуэль с Енотом Бруно</h2>
    <p class="muted">У тебя на этой неделе: ${d.sets * 3} карт (${d.sets} из ${d.rival} уроков). ${when}</p>
    <div class="row">
      ${d.real && d.sunday && !d.played ? '<a class="btn primary grow" href="#/duel/real">⚔️ В бой!</a>' : ''}
      <a class="btn grow" href="#/duel/practice">🎲 Пробная дуэль</a>
    </div>
  </section>`;
}

// Озвучка слова (тот же выключатель 🔇, что в занятиях).
const muted = () => load('mute', false);
function speak(text) {
  if (muted() || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// Особые карты: 🔄 — наоборот (видишь русское, ищешь английское), сила ×3; 🛡 — щит: верно — карта Бруно сгорает.
const KINDS = { flip: { icon: '🔄', hint: 'Наоборот: найди английское слово. Верно — сила ×3!' },
  shield: { icon: '🛡', hint: 'Щит: верно — карта Бруно сгорает!' } };
const TIME = 7000, FAST = 3500;

export async function duelView(mode) {
  const real = mode === 'real';
  const d = await duelState();
  const all = await pool();
  if (all.length < 12) {
    $app.innerHTML = '<div class="empty">Для дуэли нужно хотя бы 12 изученных слов 🙂</div><a class="btn wide" href="#/stats">Назад</a>';
    return;
  }
  const r = real ? rng(d.ws / DAY) : Math.random;
  const mySets = real ? d.sets : 2;
  const deck = pick(all, mySets * 3 + (real ? d.rival : LESSONS_PER_WEEK) * 3, r)
    .map(c => { const x = r(); return { ...c, kind: x < .2 ? 'flip' : x < .35 ? 'shield' : '' }; });
  let hand = deck.slice(0, mySets * 3);
  let bruno = deck.slice(mySets * 3);
  let me = 0, him = 0, round = 1, streak = 0, line = say('start'), bc = null, timer = 0;

  const cardHtml = (c, i) => `<button class="pcard${c.kind ? ' ' + c.kind : ''}" data-i="${i}">
    ${c.kind ? `<i class="kind">${KINDS[c.kind].icon}</i>` : ''}<b>${esc(c.en)}</b><span>⚡${c.power}</span></button>`;

  const render = () => {
    bc = bruno.splice(Math.floor(Math.random() * bruno.length), 1)[0] || null;   // Бруно ходит первым, карта открыта
    $app.innerHTML = `
      <header class="top study-top"><a class="back close" href="#/stats">✕</a>
        <h2 class="grow">🃏 ${real ? 'Дуэль' : 'Пробная дуэль'}</h2><span class="counters">Ты ${me} : ${him} 🦝</span>
        <button type="button" class="icon" id="mute" aria-label="Звук">${muted() ? '🔇' : '🔊'}</button></header>
      <p class="muted center">Раунд ${round} из ${ROUNDS}${streak >= 2 ? ` · 🔥 серия ${streak}` : ''}</p>
      <div class="bubble">🦝 ${esc(line)}</div>
      <div class="arena">
        <div class="slot">${bc ? `<div class="pcard bruno flipin"><b>${esc(bc.en)}</b><span>⚡${bc.power}</span></div>` : '<div class="pcard empty">пусто</div>'}<small>Бруно</small></div>
        <div class="vs">VS</div>
        <div class="slot" id="mine"><div class="pcard empty">?</div><small>Ты</small></div>
      </div>
      <p class="muted center">${bc ? `Бей ⚡${bc.power}! Верный ответ — сила ×2, быстрый — ещё +3.` : 'У Бруно кончились карты — лёгкие очки!'}</p>
      <div id="table"></div>
      <h3>Твои карты</h3>
      <div class="hand">${hand.length ? hand.map(cardHtml).join('') : '<p class="muted">Карт нет 😅</p>'}</div>
      ${hand.length ? '' : '<button class="btn primary wide" id="pass">Пропустить раунд</button>'}`;
    $app.querySelector('#mute').onclick = e => {
      save('mute', !muted());
      if (muted()) speechSynthesis?.cancel();
      e.currentTarget.textContent = muted() ? '🔇' : '🔊';
    };
    $app.querySelectorAll('.hand .pcard').forEach(b => b.onclick = () => play(+b.dataset.i));
    $app.querySelector('#pass')?.addEventListener('click', () => resolve(0, false, null));
  };

  const play = i => {
    const c = hand[i];
    const flip = c.kind === 'flip';
    const q = flip ? c.ru : c.en, right = flip ? c.en : c.ru, field = flip ? 'en' : 'ru';
    const opts = pick([right, ...pick(all.filter(x => x[field] !== right), 3, Math.random).map(x => x[field])], 4, Math.random);
    $app.querySelector('#mine').innerHTML = `<div class="pcard flipin${c.kind ? ' ' + c.kind : ''}"><b>${esc(c.en)}</b><span>⚡${c.power}</span></div><small>Ты</small>`;
    $app.querySelector('#table').innerHTML = `
      <div class="flash"><div class="ex-word">${esc(q)}</div><p class="muted">${c.kind ? KINDS[c.kind].hint : 'Что это значит?'}</p>
        <div class="tbar"><i></i></div></div>
      <div class="opts">${opts.map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>`;
    $app.querySelectorAll('.hand .pcard').forEach(b => { b.disabled = true; });
    if (!flip) speak(c.en);
    const bar = $app.querySelector('.tbar i');
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${TIME}ms linear`; bar.style.width = '0%'; }));
    const t0 = Date.now();
    let done = false;
    const answer = b => {
      if (done || !bar.isConnected) return;   // ушла с экрана — таймер молчит
      done = true;
      clearTimeout(timer);
      const ok = !!b && b.textContent === right;
      const fast = ok && Date.now() - t0 < FAST;
      $app.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (ok && x === b) x.classList.add('ok'); });
      if (b && !ok) b.classList.add('bad');
      if (flip && ok) speak(c.en);
      bar.style.transition = 'none';
      hand.splice(i, 1);
      streak = ok ? streak + 1 : 0;
      const pts = ok ? c.power * (flip ? 3 : 2) + (fast ? 3 : 0) + (streak >= 2 ? streak : 0) : 0;
      if (ok) toast(`+${pts}${fast ? ' ⚡ молния!' : ''}${streak >= 2 ? ` 🔥 серия ×${streak}` : ''}`);
      else toast(b ? 'Мимо — карта сгорела 🔥' : '⏰ Время вышло — карта сгорела');
      setTimeout(() => bar.isConnected && resolve(pts, ok && c.kind === 'shield'), 1000);
    };
    $app.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(b));
    timer = setTimeout(() => answer(null), TIME);
  };

  const resolve = (mine, shield) => {
    const his = bc && !shield ? bc.power : 0;
    me += mine; him += his;
    line = shield && bc ? 'Эй! Это нечестно, щиты запрещены! 😤' :
      mine === 0 && !hand.length && mine === his ? say('empty') : mine > his ? say('herRound') : mine < his ? say('hisRound') : 'Поровну. Скучно.';
    if (++round > ROUNDS) return finish();
    render();
  };

  const finish = async () => {
    const win = me > him;
    if (real) await S.setMeta('duel:' + d.ws, { you: me, bruno: him, win, at: Date.now() });
    $app.innerHTML = `
      <header class="top study-top"><a class="back close" href="#/stats">✕</a><h2 class="grow">🃏 ${win ? 'Победа!' : me === him ? 'Ничья' : 'Бруно выиграл'}</h2></header>
      <div class="done-box"><p class="big-num">${me} : ${him}</p>
        <div class="bubble">🦝 ${esc(say(win ? 'winHer' : me === him ? 'draw' : 'winHim'))}</div>
        ${real ? '' : '<p class="muted">Это была пробная дуэль — она не засчитывается.</p>'}</div>
      <a class="btn primary wide" href="#/duel/practice">🎲 Ещё пробную</a>
      <a class="btn wide" href="#/stats">К прогрессу</a>`;
  };

  render();
}
