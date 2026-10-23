// «21 у Бруно» — настоящая карточная игра (очко / блэкджек) на фишки 🪙.
// Фишки — ресурс из занятий: столько же, сколько бонусов 🍪 у питомца (ДЗ, главы, слова), + 10 в подарок.
// Выигрыши и проигрыши копятся в meta 'chips' (питомец от игры не худеет). Бруно добирает до 17.
import * as S from './store.js';
import { esc, toast } from './ui.js';
import { petState } from './pet.js';

const $app = document.getElementById('app');
const GIFT = 10, PEEK = 1;
const BETS = [1, 3, 5, 10];

const BRUNO = {
  start: ['Садись, лисичка. Фишки на стол 🦝', 'О, пришла проигрывать? Шучу. Почти.', 'Колода свежая, я её даже не трогал. Честно 😇'],
  deal: ['Ну, посмотрим, что тебе выпало…', 'Думай-думай. Я не тороплюсь.', 'Ещё карту? Или боишься? 😏'],
  bust: ['Перебор! Хи-хи, жадность до добра не доводит 🦝', 'Двадцать два, двадцать три… это уже не 21, лиса.'],
  win: ['Да как так-то?! 😤', 'Ладно, твоя взяла. Не привыкай.', 'Ты что, карты считаешь? Это запрещено! 😠'],
  lose: ['Енот всегда в выигрыше 😎', 'Спасибо за фишки, они мне очень нужны 🦝', 'Ещё разок? Я сегодня добрый.'],
  push: ['Ничья. Скучно, но честно.', 'Поровну. Деньги назад, обиды при себе.'],
  bj: ['ОЧКО?! С двух карт?! 😱', 'Это нечестно, у тебя туз в хвосте!'],
  his21: ['Очко! Ха-ха! 🃏🦝'],
  peek: ['Эй! Не подглядывай! …ладно, за фишку можно.'],
  broke: ['Фишек нет? Иди сделай домашку, я подожду 😏'],
};
const say = k => BRUNO[k][Math.floor(Math.random() * BRUNO[k].length)];

export async function chips() {
  const [p, delta] = await Promise.all([petState(), S.getMeta('chips', 0)]);
  return { earned: p.total + GIFT, balance: Math.max(0, p.total + GIFT + delta) };
}
export const addChips = async n => S.setMeta('chips', (await S.getMeta('chips', 0)) + n);

export async function gameCard() {
  const c = await chips();
  return `<section class="card">
    <h2>🎰 Игра «21» с Енотом Бруно</h2>
    <p class="muted">Настоящая карточная игра на фишки. Наберёшь ближе к 21, чем Бруно, но не больше, и фишки твои.
      Фишки даёт учёба: ДЗ, главы и слова (столько же, сколько 🍪 у питомца).</p>
    <p><b>У тебя ${c.balance} 🪙</b></p>
    <a class="btn primary wide" href="#/game">🃏 Сесть за стол</a>
  </section>`;
}

const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const newDeck = () => {
  const d = SUITS.flatMap(s => RANKS.map(r => ({ r, s })));
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
// туз — 11, а если перебор, то 1
const score = h => {
  let t = 0, aces = 0;
  for (const c of h) { t += c.r === 'A' ? 11 : 'JQK'.includes(c.r) ? 10 : +c.r; if (c.r === 'A') aces++; }
  while (t > 21 && aces--) t -= 10;
  return t;
};
const cardHtml = (c, hidden) => hidden ? '<div class="pc back flipin">🦝</div>'
  : `<div class="pc flipin${c.s === '♥' || c.s === '♦' ? ' red' : ''}"><b>${c.r}</b><i>${c.s}</i></div>`;

export async function gameView() {
  let deck = newDeck(), me = [], him = [], bet = 0, line = say('start'), peeked = false, over = false, busy = false;
  let { balance } = await chips();

  const draw = () => { if (deck.length < 10) deck = newDeck(); return deck.pop(); };

  const table = () => {
    const showHis = over || peeked;
    $app.innerHTML = `
      <header class="top study-top"><a class="back close" href="#/stats">✕</a>
        <h2 class="grow">🎰 21 у Бруно</h2><span class="counters">${balance} 🪙</span></header>
      <div class="bubble">🦝 ${esc(line)}</div>
      ${bet ? `
        <div class="felt">
          <small>Бруно${showHis ? ` · ${score(him)}` : ''}</small>
          <div class="row21">${him.map((c, i) => cardHtml(c, i === 1 && !showHis)).join('')}</div>
          <div class="pot">ставка ${bet} 🪙</div>
          <div class="row21">${me.map(c => cardHtml(c)).join('')}</div>
          <small>Ты · <b>${score(me)}</b></small>
        </div>
        ${over ? `<button class="btn primary wide" id="again">🃏 Ещё раздача</button>` : `
          <div class="row">
            <button class="btn primary grow" id="hit">➕ Ещё карту</button>
            <button class="btn grow" id="stand">✋ Хватит</button>
          </div>
          <div class="row">
            ${me.length === 2 && balance >= bet ? `<button class="btn grow" id="dbl">✖️2 Удвоить</button>` : ''}
            ${!peeked && balance >= PEEK ? `<button class="btn grow" id="peek">👀 Подсмотреть (${PEEK} 🪙)</button>` : ''}
          </div>`}`
      : balance ? `
        <h3>Сколько ставишь?</h3>
        <div class="bets">${BETS.map(b => `<button class="btn" data-b="${b}" ${b > balance ? 'disabled' : ''}>${b} 🪙</button>`).join('')}
          <button class="btn" data-b="${balance}">Всё (${balance})</button></div>
        <details class="muted"><summary>Правила</summary>
          <p>Карты 2-10 — по числу, J Q K — 10, туз — 11 или 1. Цель — набрать ближе к 21, чем Бруно, но не больше.
          Больше 21 — перебор, ставка сгорела. Бруно берёт карты, пока у него меньше 17.
          Выиграла — получаешь ставку ×2. Очко (21 с двух карт) — ставка ×2,5.
          «Удвоить» — ставка ×2, но получишь ровно одну карту. «Подсмотреть» — увидеть закрытую карту Бруно.</p></details>`
      : `<div class="empty">Фишек нет 😅<br>Сделай ДЗ (+5 🪙), прочитай 2 главы (+2) или повтори 30 слов (+2) — и возвращайся.</div>
        <a class="btn wide" href="#/stats">К прогрессу</a>`}`;
    $app.querySelectorAll('.bets [data-b]').forEach(b => b.onclick = () => deal(+b.dataset.b));
    $app.querySelector('#hit')?.addEventListener('click', hit);
    $app.querySelector('#stand')?.addEventListener('click', stand);
    $app.querySelector('#dbl')?.addEventListener('click', double);
    $app.querySelector('#peek')?.addEventListener('click', peek);
    $app.querySelector('#again')?.addEventListener('click', () => { bet = 0; me = []; him = []; over = false; peeked = false; line = say('deal'); table(); });
  };

  // ставку списываем сразу, чтобы выход посреди раздачи не спасал от проигрыша
  const pay = async n => { balance += n; await addChips(n); };

  const deal = async b => {
    if (busy) return;
    bet = b; await pay(-b);
    me = [draw(), draw()]; him = [draw(), draw()];
    line = say('deal');
    if (score(me) === 21) return end(score(him) === 21 ? 'push' : 'bj');
    table();
  };

  const hit = () => {
    if (busy) return;
    me.push(draw());
    const s = score(me);
    if (s > 21) return end('bust');
    if (s === 21) return stand();
    table();
  };

  const double = async () => {
    if (busy) return;
    await pay(-bet); bet *= 2;
    me.push(draw());
    if (score(me) > 21) return end('bust');
    stand();
  };

  const peek = async () => {
    if (busy) return;
    await pay(-PEEK); peeked = true; line = say('peek'); table();
  };

  // Бруно открывает карту и добирает до 17 — по одной, с паузой, чтобы было видно
  const stand = async () => {
    if (busy) return;
    busy = true; over = true; line = 'Моя очередь… 🦝'; table();
    while (score(him) < 17) {
      await new Promise(r => setTimeout(r, 700));
      if (!$app.querySelector('.felt')) return;   // ушла со стола
      him.push(draw()); table();
    }
    await new Promise(r => setTimeout(r, 500));
    busy = false;
    const m = score(me), h = score(him);
    end(h > 21 || m > h ? 'win' : m === h ? 'push' : 'lose');
  };

  const end = async res => {
    over = true; busy = false;
    const win = { bj: Math.ceil(bet * 2.5), win: bet * 2, push: bet }[res] || 0;
    if (win) await pay(win);
    line = res === 'lose' && score(him) === 21 && him.length === 2 ? say('his21') : say(res);
    table();
    toast(res === 'bj' ? `Очко! +${win - bet} 🪙` : res === 'win' ? `Победа! +${bet} 🪙` : res === 'push' ? 'Ничья — ставка вернулась'
      : `−${bet} 🪙`);
  };

  if (!balance) line = say('broke');
  table();
}
