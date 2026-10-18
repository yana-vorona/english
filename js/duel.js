// «Лисья дуэль» с Енотом Бруно. Каждая сделанная за неделю ДЗ = набор из 3 карт (слова, которые Яна уже учила).
// У Бруно — наборы за все уроки недели (вт/чт/сб). 5 раундов: выбираешь карту, отвечаешь перевод —
// верно: сила ×2, неверно: карта сгорает. Бруно играет свою карту. Настоящая дуэль — в воскресенье, с недели 19.10.
import * as S from './store.js';
import { esc, toast } from './ui.js';

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
  const done = (await S.listHw()).filter(h => h.status === 'done' && h.doneAt >= ws).length;
  const played = await S.getMeta('duel:' + ws);
  return { ws, sets: done, real: ws >= FIRST_WEEK, sunday: new Date().getDay() === 0, played };
}

export async function duelCard() {
  const d = await duelState();
  const when = !d.real ? 'Первая настоящая дуэль — в воскресенье 25.10.' :
    d.played ? `На этой неделе уже сыграли: ${d.played.win ? 'ты победила 🏆' : 'победил Бруно 🦝'}.` :
    d.sunday ? 'Сегодня воскресенье — Бруно ждёт! 🦝' : 'Дуэль — в воскресенье.';
  return `<section class="card">
    <h2>🃏 Лисья дуэль с Енотом Бруно</h2>
    <p class="muted">У тебя на этой неделе: ${d.sets * 3} карт (${d.sets} из ${LESSONS_PER_WEEK} ДЗ). ${when}</p>
    <div class="row">
      ${d.real && d.sunday && !d.played ? '<a class="btn primary grow" href="#/duel/real">⚔️ В бой!</a>' : ''}
      <a class="btn grow" href="#/duel/practice">🎲 Пробная дуэль</a>
    </div>
  </section>`;
}

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
  const deck = pick(all, mySets * 3 + LESSONS_PER_WEEK * 3, r);
  let hand = deck.slice(0, mySets * 3);
  let bruno = deck.slice(mySets * 3);
  let me = 0, him = 0, round = 1, line = say('start');

  const render = () => {
    $app.innerHTML = `
      <header class="top study-top"><a class="back close" href="#/stats">✕</a>
        <h2 class="grow">🃏 ${real ? 'Дуэль' : 'Пробная дуэль'}</h2><span class="counters">Ты ${me} : ${him} 🦝</span></header>
      <p class="muted center">Раунд ${round} из ${ROUNDS}</p>
      <div class="bubble">🦝 ${esc(line)}</div>
      <div id="table"></div>
      <h3>Твои карты</h3>
      <div class="hand">${hand.length ? hand.map((c, i) => `<button class="pcard" data-i="${i}"><b>${esc(c.en)}</b><span>⚡${c.power}</span></button>`).join('')
        : '<p class="muted">Карт нет 😅</p>'}</div>
      ${hand.length ? '' : '<button class="btn primary wide" id="pass">Пропустить раунд</button>'}`;
    $app.querySelectorAll('.pcard').forEach(b => b.onclick = () => play(+b.dataset.i));
    $app.querySelector('#pass')?.addEventListener('click', () => brunoMove(0));
  };

  const play = i => {
    const c = hand[i];
    const opts = pick([c.ru, ...pick(all.filter(x => x.ru !== c.ru), 3, Math.random).map(x => x.ru)], 4, Math.random);
    $app.querySelector('#table').innerHTML = `
      <div class="flash"><div class="ex-word">${esc(c.en)}</div><p class="muted">Что это значит? Верно — сила ×2!</p></div>
      <div class="opts">${opts.map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>`;
    $app.querySelectorAll('.pcard').forEach(b => { b.disabled = true; });
    $app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const ok = b.textContent === c.ru;
      $app.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (x.textContent === c.ru) x.classList.add('ok'); });
      if (!ok) b.classList.add('bad');
      hand.splice(i, 1);
      setTimeout(() => brunoMove(ok ? c.power * 2 : 0), 900);
    });
  };

  const brunoMove = mine => {
    const bc = bruno.splice(Math.floor(Math.random() * bruno.length), 1)[0];
    const his = bc ? bc.power : 0;
    me += mine; him += his;
    line = mine === 0 && !hand.length && mine === his ? say('empty') : mine > his ? say('herRound') : mine < his ? say('hisRound') : 'Поровну. Скучно.';
    if (bc) toast(`Бруно сыграл «${bc.en}» ⚡${his}`);
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
