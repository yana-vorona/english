// «Ещё игры с Бруно» — 4 в ряд, Филлер, Дурак. Без слов: играешь на те же фишки 🪙, что и в «21» (их даёт учёба).
// Ставка списывается сразу (выход посреди партии не спасает от проигрыша); победа — ставка ×2, ничья — ставка назад.
import { esc, toast } from './ui.js';
import { chips, addChips } from './game.js';

const $app = document.getElementById('app');
const BETS = [1, 3, 5, 10];
const wait = ms => new Promise(r => setTimeout(r, ms));
const rnd = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gone = () => !$app.querySelector('#board');   // ушла с экрана игры

const BRUNO = {
  start: ['Садись, лисичка. Сыграем? 🦝', 'О, новая игра! Я в неё с детства играю. Честно 😇', 'Фишки на стол — и поехали.'],
  think: ['Хм-м… 🤔', 'Так-так-так…', 'Не подсматривай, я думаю!', 'А если вот так… 🦝'],
  win: ['Да как так-то?! 😤', 'Ладно, твоя взяла. Не привыкай.', 'Это была разминка! Реванш!'],
  lose: ['Енот всегда в выигрыше 😎', 'Спасибо за фишки 🦝', 'Ещё разок? Я сегодня добрый.'],
  push: ['Ничья. Скучно, но честно.', 'Поровну. Фишки назад, обиды при себе.'],
};
const say = k => rnd(BRUNO[k]);

const GAMES = {
  four: { icon: '🔴', title: '4 в ряд', play: fourGame,
    rules: 'Бросаете фишки в столбики по очереди, фишка падает вниз. Кто первым выстроит 4 своих подряд — по горизонтали, вертикали или наискосок, — тот выиграл. Твои — красные, у Бруно — жёлтые.' },
  filler: { icon: '🎨', title: 'Филлер', play: fillerGame,
    rules: 'Ты начинаешь в левом нижнем углу 🦊, Бруно — в правом верхнем 🦝. За ход выбираешь цвет: вся твоя область перекрашивается в него и забирает соседние клетки этого цвета. Свой цвет и цвет Бруно брать нельзя. Кто займёт больше половины поля — победил.' },
  durak: { icon: '🃏', title: 'Дурак', play: durakGame,
    rules: 'Подкидной дурак, колода 36 карт, по 6 на руках. Нижняя карта колоды — козырь. Ходящий кладёт карту, отбивающийся кроет её старшей той же масти или козырем. Подкидывать можно карты того же достоинства, что уже на столе (до 6). Не можешь отбиться — «Беру». Всё отбито — «Бито», и ход переходит. Кто остался с картами, когда колода кончилась, — дурак.' },
};

export function arcadeCard() {
  return `<section class="card">
    <h2>🎲 Ещё игры с Бруно</h2>
    <p class="muted">На те же фишки 🪙, что и «21». Победа — ставка ×2, ничья — ставка назад.</p>
    <div class="row">${Object.entries(GAMES).map(([k, g]) => `<a class="btn grow" href="#/play/${k}">${g.icon} ${g.title}</a>`).join('')}</div>
  </section>`;
}

export async function playView(key) {
  const g = GAMES[key];
  if (!g) { location.hash = '#/stats'; return; }
  let { balance } = await chips();
  const head = extra => `<header class="top study-top"><a class="back close" href="#/stats">✕</a>
    <h2 class="grow">${g.icon} ${g.title}</h2><span class="counters" id="cnt">${extra}</span></header>`;

  const lobby = line => {
    $app.innerHTML = `${head(balance + ' 🪙')}<div class="bubble">🦝 ${esc(line)}</div>
      ${balance ? `
        <h3>Сколько ставишь?</h3>
        <div class="bets">${BETS.map(b => `<button class="btn" data-b="${b}" ${b > balance ? 'disabled' : ''}>${b} 🪙</button>`).join('')}
          <button class="btn" data-b="${balance}">Всё (${balance})</button></div>
        <details class="muted" open><summary>Правила</summary><p>${g.rules}</p></details>`
      : `<div class="empty">Фишек нет 😅<br>Сделай ДЗ (+5 🪙), прочитай 2 главы (+2) или повтори 30 слов (+2) — и возвращайся.</div>
        <a class="btn wide" href="#/stats">К прогрессу</a>`}`;
    $app.querySelectorAll('.bets [data-b]').forEach(b => b.onclick = () => start(+b.dataset.b));
  };

  const start = async bet => {
    balance -= bet; await addChips(-bet);
    const res = await g.play({ head: () => head(`ставка ${bet} 🪙`), say });
    const win = { win: bet * 2, push: bet }[res] || 0;
    if (win) { balance += win; await addChips(win); }
    toast(res === 'win' ? `Победа! +${bet} 🪙` : res === 'push' ? 'Ничья — ставка вернулась' : `−${bet} 🪙`);
    if (gone()) return;
    $app.querySelector('#cnt').textContent = balance + ' 🪙';
    $app.querySelector('#bub').textContent = '🦝 ' + say(res);
    $app.querySelector('#ctl').innerHTML = `
      <div class="row"><button class="btn primary grow" id="again">${g.icon} Ещё партия</button>
        <a class="btn grow" href="#/stats">К прогрессу</a></div>`;
    $app.querySelector('#again').onclick = () => lobby(say('start'));
  };

  lobby(say('start'));
}

/* ---------- 4 в ряд ---------- */
const W4 = 7, H4 = 6, ORDER = [3, 2, 4, 1, 5, 0, 6];
const LINES = [];
for (let r = 0; r < H4; r++) for (let c = 0; c < W4; c++)
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const L = [0, 1, 2, 3].map(k => [r + dr * k, c + dc * k]);
    if (L.every(([y, x]) => y >= 0 && y < H4 && x >= 0 && x < W4)) LINES.push(L.map(([y, x]) => y * W4 + x));
  }
const drop4 = (b, c, p) => { for (let r = H4 - 1; r >= 0; r--) if (!b[r * W4 + c]) { b[r * W4 + c] = p; return r * W4 + c; } return -1; };
const line4 = (b, p) => LINES.find(L => L.every(i => b[i] === p));
// оценка позиции для Бруно (2): свои тройки/двойки в открытых линиях плюс, твои — минус, центр ценнее
const eval4 = b => {
  let s = 0;
  for (const L of LINES) {
    let a = 0, h = 0;
    for (const i of L) { if (b[i] === 2) a++; else if (b[i] === 1) h++; }
    if (a && h) continue;
    s += a === 3 ? 5 : a === 2 ? 2 : 0;
    s -= h === 3 ? 6 : h === 2 ? 2 : 0;
  }
  for (let r = 0; r < H4; r++) s += b[r * W4 + 3] === 2 ? 3 : b[r * W4 + 3] === 1 ? -3 : 0;
  return s;
};
function mm4(b, depth, alpha, beta, bruno) {
  if (line4(b, 2)) return 1000 + depth;
  if (line4(b, 1)) return -1000 - depth;
  if (!depth || b.every(Boolean)) return eval4(b);
  let best = bruno ? -Infinity : Infinity;
  for (const c of ORDER) {
    const i = drop4(b, c, bruno ? 2 : 1);
    if (i < 0) continue;
    const v = mm4(b, depth - 1, alpha, beta, !bruno);
    b[i] = 0;
    if (bruno) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return best;
}
const brunoCol = b => {
  let best = -Infinity, cols = [];
  for (const c of ORDER) {
    const i = drop4(b, c, 2);
    if (i < 0) continue;
    const v = mm4(b, 4, -Infinity, Infinity, false);
    b[i] = 0;
    if (v > best) { best = v; cols = [c]; } else if (v === best) cols.push(c);
  }
  return rnd(cols);
};

function fourGame({ head }) {
  return new Promise(done => {
    const b = Array(W4 * H4).fill(0);   // 1 — ты, 2 — Бруно
    let turn = Math.random() < .5 ? 1 : 2, last = -1, wins = [];
    const draw = line => {
      $app.innerHTML = `${head()}<div class="bubble" id="bub">🦝 ${esc(line)}</div>
        <div class="c4" id="board">${b.map((v, i) => `<button class="c4c${v ? ' p' + v : ''}${i === last ? ' drop' : ''}${wins.includes(i) ? ' win' : ''}" data-c="${i % W4}"></button>`).join('')}</div>
        <div id="ctl"><p class="muted center">${turn === 1 ? 'Твой ход: нажми на столбик 🔴' : 'Ходит Бруно 🟡…'}</p></div>`;
      $app.querySelectorAll('.c4c').forEach(x => x.onclick = () => mine(+x.dataset.c));
    };
    const over = () => {
      const w = line4(b, 1) || line4(b, 2);
      if (!w && !b.every(Boolean)) return false;
      wins = w || []; turn = 0; draw('');
      done(!w ? 'push' : b[w[0]] === 1 ? 'win' : 'lose');
      return true;
    };
    const mine = c => {
      if (turn !== 1) return;
      const i = drop4(b, c, 1);
      if (i < 0) return;
      last = i; turn = 2;
      if (!over()) { draw(say('think')); bruno(); }
    };
    const bruno = async () => {
      await wait(650);
      if (gone()) return;
      last = drop4(b, brunoCol(b), 2); turn = 1;
      if (!over()) draw(rnd(['Твой ход, лиса.', 'Ну-ну, посмотрим…', 'Попробуй-ка теперь 😏', 'Я тебя вижу насквозь 🦝']));
    };
    draw(turn === 1 ? 'Ходи первая, так и быть.' : 'Я первый! Енотам — вперёд 🦝');
    if (turn === 2) bruno();
  });
}

/* ---------- Филлер ---------- */
const FW = 8, FH = 7, FC = ['#E5484D', '#F28C28', '#F5C518', '#3BB273', '#3B8ED8', '#8E5BD8'];
const ME0 = (FH - 1) * FW, HIM0 = FW - 1;
const nb = i => [i % FW ? i - 1 : -1, i % FW < FW - 1 ? i + 1 : -1, i - FW, i + FW].filter(j => j >= 0 && j < FW * FH);
// перекрасить область p в цвет c и забрать соседние клетки этого цвета
const grow = (col, own, p, c) => {
  const q = [];
  own.forEach((o, i) => { if (o === p) { col[i] = c; q.push(i); } });
  while (q.length) for (const j of nb(q.pop())) if (!own[j] && col[j] === c) { own[j] = p; q.push(j); }
};
const cnt = (own, p) => own.filter(o => o === p).length;

function fillerGame({ head }) {
  return new Promise(done => {
    let col, own = Array(FW * FH).fill(0), busy = false;
    do {   // соседние клетки разного цвета, углы — тоже
      col = [];
      for (let i = 0; i < FW * FH; i++) col.push(rnd([0, 1, 2, 3, 4, 5].filter(c => (!(i % FW) || c !== col[i - 1]) && c !== col[i - FW])));
    } while (col[ME0] === col[HIM0]);
    own[ME0] = 1; own[HIM0] = 2;
    const half = FW * FH / 2;
    const draw = line => {
      const mc = col[ME0], hc = col[HIM0];
      $app.innerHTML = `${head()}<div class="bubble" id="bub">🦝 ${esc(line)}</div>
        <p class="center"><b>🦊 Ты ${cnt(own, 1)}</b> · 🦝 Бруно ${cnt(own, 2)} <span class="muted">· нужно ${half + 1}</span></p>
        <div class="fl" id="board">${col.map((c, i) => `<i class="${own[i] ? 'o' + own[i] : ''}" style="background:${FC[c]}">${i === ME0 ? '🦊' : i === HIM0 ? '🦝' : ''}</i>`).join('')}</div>
        <div id="ctl"><div class="flc">${FC.map((f, c) => `<button style="background:${f}" data-c="${c}" ${c === mc || c === hc || busy ? 'disabled' : ''} aria-label="цвет"></button>`).join('')}</div></div>`;
      $app.querySelectorAll('.flc button').forEach(x => x.onclick = () => mine(+x.dataset.c));
    };
    const over = () => {
      const m = cnt(own, 1), h = cnt(own, 2);
      if (m <= half && h <= half && m + h < FW * FH) return false;
      busy = true; draw('');
      $app.querySelector('#ctl').innerHTML = '';
      done(m > h ? 'win' : m < h ? 'lose' : 'push');
      return true;
    };
    const mine = async c => {
      if (busy) return;
      grow(col, own, 1, c);
      if (over()) return;
      busy = true; draw(say('think'));
      await wait(700);
      if (gone()) return;
      // Бруно жадный: берёт цвет, который даёт больше всего клеток
      let best = -1, opts = [];
      for (let k = 0; k < FC.length; k++) {
        if (k === col[ME0] || k === col[HIM0]) continue;
        const o2 = [...own]; grow([...col], o2, 2, k);
        const g = cnt(o2, 2);
        if (g > best) { best = g; opts = [k]; } else if (g === best) opts.push(k);
      }
      grow(col, own, 2, rnd(opts));
      busy = false;
      if (!over()) draw(rnd(['Твой ход 🦝', 'Ням, вкусные клеточки.', 'Это поле будет моим!', 'Хм, а ты неплохо держишься.']));
    };
    draw('Ты внизу слева 🦊, я вверху справа. Выбирай цвет!');
  });
}

/* ---------- Дурак ---------- */
const DS = ['♠', '♥', '♦', '♣'], DR = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const val = c => DR.indexOf(c.r);

function durakGame({ head }) {
  return new Promise(done => {
    const deck = shuffle(DS.flatMap(s => DR.map(r => ({ r, s }))));
    const trumpCard = deck[0], trump = trumpCard.s;   // нижняя карта — козырь, её берут последней
    const beats = (d, a) => d.s === a.s ? val(d) > val(a) : d.s === trump;
    const order = (a, b) => (a.s === trump) - (b.s === trump) || val(a) - val(b) || DS.indexOf(a.s) - DS.indexOf(b.s);
    const me = [], him = [];
    for (let k = 0; k < 6; k++) { me.push(deck.pop()); him.push(deck.pop()); }
    let table = [], att, mode, defStart, busy = false, line;
    const low = h => h.filter(c => c.s === trump).sort(order)[0];
    const lm = low(me), lh = low(him);
    att = lm && (!lh || val(lm) < val(lh)) ? 'me' : lh ? 'him' : rnd(['me', 'him']);

    const defHand = () => att === 'me' ? him : me;
    const open = () => table.find(p => !p.d);
    const canToss = c => table.length < Math.min(6, defStart) && table.filter(p => !p.d).length < defHand().length
      && (!table.length || table.some(p => p.a.r === c.r || p.d?.r === c.r));
    const playable = c => busy ? false
      : att === 'me' ? (mode === 'attack' || mode === 'taking') && canToss(c)
      : mode === 'defend' && !!open() && beats(c, open().a);
    const card = (c, cls = '') => `<div class="pc ${cls}${c.s === '♥' || c.s === '♦' ? ' red' : ''}"><b>${c.r}</b><i>${c.s}</i></div>`;

    const draw = () => {
      me.sort(order);
      const allBeaten = table.length && !open();
      const btn = busy ? '' : att === 'me' && mode === 'attack' && allBeaten ? '<button class="btn primary wide" id="bito">✋ Бито</button>'
        : att === 'me' && mode === 'taking' ? '<button class="btn primary wide" id="take">👐 Всё, забирай</button>'
        : att === 'him' && mode === 'defend' && open() ? '<button class="btn wide" id="take">😬 Беру</button>' : '';
      const hint = busy ? 'Бруно думает…' : att === 'me' ? (mode === 'taking' ? 'Бруно берёт. Можешь подкинуть ещё.' : table.length ? 'Подкинь карту того же достоинства или жми «Бито».' : 'Твой ход: положи карту.')
        : open() ? 'Отбивайся: нажми карту старше или козырь.' : '';
      $app.innerHTML = `${head()}<div class="bubble" id="bub">🦝 ${esc(line)}</div>
        <div class="felt" id="board">
          <small>Бруно · ${him.length} карт</small>
          <div class="row21 dk-him">${him.map(() => '<div class="pc back mini">🦝</div>').join('')}</div>
          <div class="dk-mid">
            <div class="dk-deck">${deck.length ? `${card(trumpCard, 'trump')}<span class="pot">${deck.length}</span>` : `<span class="pot">козырь ${trump}</span>`}</div>
            <div class="dk-table">${table.map(p => `<div class="dk-pair">${card(p.a)}${p.d ? card(p.d, 'cover') : ''}</div>`).join('') || '<small>стол пуст</small>'}</div>
          </div>
          <small>Ты · ${att === 'me' ? 'ходишь' : 'отбиваешься'}</small>
        </div>
        <div id="ctl"><p class="muted center">${hint}</p>
          <div class="row21 dk-hand">${me.map((c, i) => `<button class="pc${c.s === '♥' || c.s === '♦' ? ' red' : ''}${playable(c) ? ' on' : ''}" data-i="${i}" ${playable(c) ? '' : 'disabled'}><b>${c.r}</b><i>${c.s}</i></button>`).join('')}</div>
          ${btn}</div>`;
      $app.querySelectorAll('.dk-hand .pc').forEach(x => x.onclick = () => tap(+x.dataset.i));
      $app.querySelector('#bito')?.addEventListener('click', () => endRound(false));
      $app.querySelector('#take')?.addEventListener('click', () => att === 'me' ? endRound(true) : iTake());
    };

    const tap = i => {
      const c = me[i];
      if (!playable(c)) return;
      me.splice(i, 1);
      if (att === 'me') {
        table.push({ a: c });
        if (mode === 'attack') return brunoDefend();
        line = rnd(['Ещё?! Ну ты и жадина 😤', 'Давай-давай, мне не жалко.']);
        return draw();
      }
      open().d = c;
      if (!me.length && !deck.length) return endRound(false);
      brunoToss();
    };

    // Бруно отбивается самой младшей подходящей картой; сильный козырь рано не тратит
    const brunoDefend = async () => {
      busy = true; line = say('think'); draw();
      await wait(800);
      if (gone()) return;
      busy = false;
      const a = open().a;
      const d = him.filter(c => beats(c, a)).sort(order)[0];
      if (!d || (d.s === trump && a.s !== trump && val(d) >= 6 && deck.length > 8 && table.length === 1)) {
        mode = 'taking'; line = rnd(['Беру… 😤 Не радуйся раньше времени.', 'Ладно, забираю. Запомню!']);
        return draw();
      }
      him.splice(him.indexOf(d), 1); open().d = d;
      line = rnd(['Покрыл! 🦝', 'Ха, легко.', 'И это всё, что у тебя есть?']);
      if (!me.some(canToss)) { draw(); await wait(900); if (gone()) return; return endRound(false); }
      draw();
    };

    const tossable = () => him.filter(c => canToss(c) && (c.s !== trump || !deck.length)).sort(order);
    const brunoAttack = async () => {
      busy = true; draw();
      await wait(700);
      if (gone()) return;
      busy = false;
      const c = [...him].sort(order)[0];
      him.splice(him.indexOf(c), 1); table.push({ a: c });
      mode = 'defend'; line = rnd(['Лови! 🃏', 'А вот так?', 'Отбивайся, лиса 😏']);
      draw();
    };
    const brunoToss = async () => {
      busy = true; line = say('think'); draw();
      await wait(700);
      if (gone()) return;
      busy = false;
      const c = tossable()[0];
      if (!c) { line = 'Бито. Твоя взяла… пока.'; return endRound(false); }
      him.splice(him.indexOf(c), 1); table.push({ a: c });
      line = rnd(['Подкидываю! 🦝', 'А ещё вот эту!', 'Не расслабляйся.']);
      draw();
    };
    const iTake = async () => {
      busy = true; mode = 'taking';
      for (let c; (c = tossable()[0]);) { him.splice(him.indexOf(c), 1); table.push({ a: c }); }
      line = rnd(['Бери-бери, мне не жалко 😏', 'Хи-хи, держи ещё на память.']);
      draw();
      await wait(900);
      if (gone()) return;
      busy = false;
      endRound(true);
    };

    const endRound = took => {
      const cards = table.flatMap(p => p.d ? [p.a, p.d] : [p.a]);
      table = [];
      if (took) defHand().push(...cards);
      for (const h of att === 'me' ? [me, him] : [him, me]) while (h.length < 6 && deck.length) h.push(deck.pop());
      if (!took) att = att === 'me' ? 'him' : 'me';
      if (!deck.length && (!me.length || !him.length)) {
        busy = true; line = ''; draw();
        $app.querySelector('#ctl').innerHTML = '';
        return done(!me.length && !him.length ? 'push' : !me.length ? 'win' : 'lose');
      }
      defStart = defHand().length;
      if (att === 'me') { mode = 'attack'; line = took ? 'Ну и ладно, ходи.' : rnd(['Твой ход.', 'Ходи, лиса.']); draw(); }
      else { mode = 'defend'; line = say('think'); brunoAttack(); }
    };

    defStart = defHand().length;
    line = `Козырь — ${trump}. ${att === 'me' ? 'У тебя младший козырь, ходи первая.' : 'У меня младший козырь, хожу я 🦝'}`;
    if (att === 'me') { mode = 'attack'; draw(); } else { mode = 'defend'; brunoAttack(); }
  });
}
