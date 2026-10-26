// Изучение новых слов (порции по 5, 4 режима) и повторение по коробкам.
import * as S from './store.js';
import { esc, plural, words, load, save, forget } from './ui.js';

const $app = document.getElementById('app');
const PORTION_NEW = 5;
const PORTION_REVIEW = 20;

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 🔇 в углу экрана занятия выключает озвучку (запоминается).
const muted = () => load('mute', false);
const canSpeak = 'speechSynthesis' in window;
// Телефон не даёт странице говорить самой, пока голос не «разбудили» касанием:
// первым касанием в приложении говорим беззвучную фразу — дальше слова звучат сами.
if (canSpeak) {
  const unlock = () => {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  };
  addEventListener('pointerdown', unlock, { once: true, capture: true });
  addEventListener('keydown', unlock, { once: true, capture: true });
}
const enVoice = () => {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => /^en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
};
function say(text) {
  if (muted() || !canSpeak) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  const v = enVoice();
  if (v) u.voice = v;
  // Chrome глотает фразу, сказанную сразу после cancel(), и иногда «засыпает» на паузе — отсюда задержка и resume().
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy) speechSynthesis.cancel();
  speechSynthesis.resume();
  if (busy) setTimeout(() => speechSynthesis.speak(u), 80);
  else speechSynthesis.speak(u);
}

const sayBtn = en => `<button type="button" class="icon say" data-say="${esc(en)}" aria-label="Произнести">🔊</button>`;
// транскрипция под словом (есть не у всех слов — см. fillTranscriptions)
const ipa = c => (c.tr ? `<div class="ex-ipa">${esc(c.tr)}</div>` : '');

// Варианты ответа: сначала из той же темы, потом из остальных.
function options(card, pool, field = 'ru', n = 4) {
  const right = card[field];
  const seen = new Set([right.toLowerCase()]);
  const wrong = [];
  for (const c of shuffle(pool)) {
    const v = c[field];
    if (seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    wrong.push(v);
    if (wrong.length === n - 1) break;
  }
  return shuffle([right, ...wrong]);
}

// Сравнение напечатанного: без регистра, лишних пробелов, точек; годится любой вариант через «,» или «/».
const norm = s => s.toLowerCase().replace(/[’`]/g, "'").replace(/\([^)]*\)/g, ' ').replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
function typedRight(input, en) {
  const a = norm(input);
  if (!a) return false;
  return [en, ...en.split(/[,/;]/)].map(norm).includes(a);
}

// Каркас экрана занятия: ✕ слева, полоса прогресса, заголовок режима.
function frame(back, title, part, extra = '') {
  $app.innerHTML = `
    <header class="top study-top">
      <a class="back close" href="${back}" aria-label="Закрыть">✕</a>
      <div class="grow bar"><i style="width:${Math.round(part * 100)}%"></i></div>
      ${extra}
      <button type="button" class="icon" id="mute" aria-label="Звук">${muted() ? '🔇' : '🔊'}</button>
    </header>
    <h2 class="mode">${title}</h2>
    <div id="ex"></div>`;
  $app.querySelector('#mute').onclick = e => {
    save('mute', !muted());
    if (muted()) speechSynthesis?.cancel();
    e.currentTarget.textContent = muted() ? '🔇' : '🔊';
  };
  const ex = $app.querySelector('#ex');
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) say(b.dataset.say);
  });
  return ex;
}

// Слова по очереди; done(true) — слово возвращается в конец списка.
// mark(c, right) — первый ответ по слову (для повторения: он двигает коробку)
function runQueue(ex, batch, renderOne, mark) {
  return new Promise(resolve => {
    const q = [...batch];
    const met = new Set();
    const next = () => {
      if (!q.length) return resolve(true);
      const c = q.shift();
      renderOne(c, again => {
        if (!met.has(c.id)) { met.add(c.id); mark?.(c, !again); }
        if (again) q.push(c);
        next();
      }, q.length + 1);
    };
    next();
  });
}

const nextButton = (place, onClick) => {
  place.innerHTML = '<button class="btn primary wide" id="nx">Дальше</button>';
  const b = place.querySelector('#nx');
  b.onclick = onClick;
  b.focus();
};

// ---------- Режимы изучения ----------

const MODES = [
  ['show', '👀 Знакомство'],
  ['pair', '🧩 Создай пару'],
  ['guess', '🤔 Догадайся'],
  ['recall', '💭 Вспомни'],
  ['type', '⌨️ Напечатай'],
];

const RUN = {
  show: (ex, batch) => new Promise(resolve => {
    let i = 0;
    const render = () => {
      const c = batch[i];
      ex.innerHTML = `
        <div class="flash"><div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div>${ipa(c)}<div class="ex-tr">${esc(c.ru)}</div></div>
        <p class="muted center">${i + 1} из ${batch.length}</p>
        <button class="btn primary wide" id="nx">Дальше</button>`;
      ex.querySelector('#nx').onclick = () => (++i < batch.length ? render() : resolve(true));
      say(c.en);
    };
    render();
  }),

  pair: (ex, batch, pool, mark) => new Promise(resolve => {
    const missed = new Set();
    const btn = (c, side) => `<button class="pb" data-side="${side}" data-id="${c.id}">${esc(c[side])}</button>`;
    ex.innerHTML = `<div class="pairs">
      <div>${shuffle(batch).map(c => btn(c, 'en')).join('')}</div>
      <div>${shuffle(batch).map(c => btn(c, 'ru')).join('')}</div></div>`;
    let sel = null, left = batch.length;
    ex.onclick = e => {
      const b = e.target.closest('.pb');
      if (!b || b.disabled) return;
      // английское слово звучит всегда — и первым нажатием, и вторым
      if (b.dataset.side === 'en') say(b.textContent);
      if (sel === b) { b.classList.remove('sel'); sel = null; return; }
      if (!sel || sel.dataset.side === b.dataset.side) {
        sel?.classList.remove('sel');
        sel = b; b.classList.add('sel');
        return;
      }
      const a = sel; sel = null; a.classList.remove('sel');
      if (a.dataset.id === b.dataset.id) {
        mark?.(batch.find(c => String(c.id) === a.dataset.id), !missed.has(a.dataset.id));
        // найденная пара исчезает, чтобы не мешалась
        [a, b].forEach(x => { x.classList.add('ok'); x.disabled = true; setTimeout(() => x.remove(), 400); });
        if (--left === 0) setTimeout(() => resolve(true), 500);
      } else {
        missed.add(a.dataset.id); missed.add(b.dataset.id);
        [a, b].forEach(x => x.classList.add('bad'));
        setTimeout(() => [a, b].forEach(x => x.classList.remove('bad')), 600);
      }
    };
  }),

  guess: (ex, batch, pool) => runQueue(ex, batch, (c, done, left) => {
    ex.innerHTML = `
      <div class="flash"><div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div>${ipa(c)}</div>
      <div class="opts">${options(c, pool).map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>
      <div id="after"></div><p class="muted center">Осталось: ${left}</p>`;
    say(c.en);
    // Ошибка: правильный не подсвечиваем — тыкаешь дальше, пока не найдёшь; слово с ошибкой вернётся в конец.
    let missed = false;
    ex.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (b.disabled) return;
      if (b.textContent !== c.ru) { missed = true; b.classList.add('bad'); b.disabled = true; return; }
      ex.querySelectorAll('.opt').forEach(x => { x.disabled = true; });
      b.classList.add('ok');
      setTimeout(() => done(missed), missed ? 900 : 600);
    });
  }),

  recall: (ex, batch, pool, mark) => runQueue(ex, batch, (c, done, left) => {
    ex.innerHTML = `
      <div class="flash"><div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div>${ipa(c)}<div class="ex-tr hide" id="tr">${esc(c.ru)}</div></div>
      <p class="muted center" id="ask">&nbsp;</p>
      <div class="two" id="btns"><button class="btn big" id="no">🤔 Не знаю</button><button class="btn primary big" id="yes">✅ Знаю</button></div>
      <p class="muted center">Осталось: ${left}</p>`;
    const tr = ex.querySelector('#tr');
    say(c.en);
    // «Знаю» — показываем перевод и спрашиваем, совпало ли: можно думать, что знаешь, а вспомнить не то.
    // Строка вопроса зарезервирована заранее, чтобы «Да, верно» встала ровно на место «Знаю».
    ex.querySelector('#yes').onclick = () => {
      tr.classList.remove('hide');
      tr.classList.add('good');
      ex.querySelector('#ask').textContent = 'Ты вспомнила так же?';
      ex.querySelector('#btns').innerHTML = `<button class="btn big" id="miss">❌ Нет, ошиблась</button><button class="btn primary big" id="hit">✅ Да, верно</button>`;
      ex.querySelector('#hit').onclick = () => {
        ex.querySelector('#btns').innerHTML = '';
        setTimeout(() => done(false), 700);
      };
      ex.querySelector('#miss').onclick = () => done(true);
    };
    ex.querySelector('#no').onclick = () => {
      tr.classList.remove('hide');
      nextButton(ex.querySelector('#btns'), () => done(true));
    };
  }, mark),

  type: (ex, batch, pool, mark) => runQueue(ex, batch, (c, done, left) => {
    ex.innerHTML = `
      <div class="flash"><div class="ex-word ru-big">${esc(c.ru)}</div></div>
      <form class="typeform" autocomplete="off">
        <input id="ans" lang="en" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="по-английски">
        <div class="two" id="btns"><button type="button" class="btn" id="hint">💡 Подсказка</button><button class="btn primary">Проверить</button></div>
      </form>
      <div id="res"></div><p class="muted center">Осталось: ${left}</p>`;
    const inp = ex.querySelector('#ans');
    const res = ex.querySelector('#res');
    // Ошибка: ответ не показываем — исправляешь сама; не выходит — 💡 подсказка по букве; после подсказки — «Показать ответ».
    let hints = 0, missed = false, finished = false;
    inp.focus();
    inp.oninput = () => inp.classList.remove('bad');
    const showAnswer = () => {
      finished = true;
      ex.querySelector('#btns').innerHTML = '';
      res.innerHTML = `<p class="answer">Правильно: <b>${esc(c.en)}</b> ${sayBtn(c.en)}</p>${ipa(c)}<div id="nxp"></div>`;
      say(c.en);
      nextButton(res.querySelector('#nxp'), () => done(true));
    };
    ex.querySelector('#hint').onclick = () => {
      hints = Math.min(c.en.length, Math.max(hints, inp.value.length) + 1);
      inp.value = c.en.slice(0, hints);
      inp.classList.remove('bad');
      inp.focus();
      if (!res.querySelector('#reveal')) {
        res.innerHTML = '<button type="button" class="btn wide" id="reveal">👀 Показать ответ</button>';
        res.querySelector('#reveal').onclick = showAnswer;
      }
    };
    ex.querySelector('form').onsubmit = e => {
      e.preventDefault();
      if (finished) return;
      if (typedRight(inp.value, c.en)) {
        finished = true;
        inp.classList.remove('bad');
        inp.classList.add('ok');
        say(c.en);
        setTimeout(() => done(missed), 700);
      } else {
        missed = true;
        inp.classList.add('bad');
        inp.focus();
      }
    };
  }, mark),
};

// ---------- Изучение новых ----------

// Порция новых: по 5, хвост не дробим — 6-7 одной порцией, 8 → 4+4, 9 → 4+5.
const portionOf = left => left <= 7 ? left : left < 10 ? Math.floor(left / 2) : PORTION_NEW;

export async function learnView(deckId) {
  const deck = await S.getDeck(deckId);
  if (!deck) { location.hash = '#/'; return; }
  const back = '#/deck/' + deckId;
  const all = await S.listCards(deckId);
  const pool = all.length >= 4 ? all : await S.allCards();

  // Незаконченная порция (закрыла приложение посреди занятия) — продолжаем с того же режима.
  const key = 'learn:' + deckId;
  const saved = load(key);
  let batch = [], mode = 0;
  if (saved) {
    batch = saved.ids.map(id => all.find(c => c.id === id)).filter(c => c && !c.box);
    if (batch.length === saved.ids.length) mode = saved.mode;
    else batch = [];
  }
  const fresh = all.filter(c => !c.box);
  if (!batch.length) batch = fresh.slice(0, portionOf(fresh.length));

  if (!batch.length) {
    frame(back, '🎓 Новых слов нет', 1).innerHTML = `
      <div class="empty">Все слова темы «${esc(deck.name)}» уже изучены 🎉</div>
      <a class="btn primary wide" href="${back}">К теме</a>`;
    return;
  }

  for (; mode < MODES.length; mode++) {
    save(key, { ids: batch.map(c => c.id), mode });
    const [kind, title] = MODES[mode];
    if (kind === 'type' && load('skipType', false)) continue;          // «без написания»
    const skip = kind === 'type' ? '<button class="btn ghost mini" id="skipType">⏭ Пропустить</button>' : '';
    const ex = frame(back, title, mode / MODES.length, `${skip}<span class="muted">${mode + 1}/${MODES.length}</span>`);
    const run = RUN[kind](ex, batch, pool);
    if (kind === 'type') await Promise.race([run, new Promise(r => { $app.querySelector('#skipType').onclick = r; })]);
    else await run;
  }

  await S.markLearned(batch.map(c => c.id));
  forget(key);
  const more = (await S.listCards(deckId)).filter(c => !c.box).length;
  frame(back, '🎉 Готово!', 1).innerHTML = `
    <div class="done-box">
      <p class="big-num">+${batch.length}</p>
      <p>${plural(batch.length, 'новое слово', 'новых слова', 'новых слов')} в коробке 1. Повторим завтра 😉</p>
      <ul class="done-list">${batch.map(c => `<li><b>${esc(c.en)}</b> — ${esc(c.ru)}</li>`).join('')}</ul>
    </div>
    ${more ? `<a class="btn primary wide" href="#" id="again">Ещё ${portionOf(more)} ${plural(portionOf(more), 'слово', 'слова', 'слов')}</a>` : ''}
    <a class="btn wide" href="${back}">Хватит на сегодня</a>
    <label class="skiptype"><input type="checkbox" id="noType"${load('skipType', false) ? ' checked' : ''}> Без написания (режим «⌨️ Напечатай» не показывать)</label>`;
  $app.querySelector('#again')?.addEventListener('click', e => { e.preventDefault(); learnView(deckId); });
  $app.querySelector('#noType').onchange = e => save('skipType', e.target.checked);
}

// ---------- Повторение ----------

// Чем повторять — выбирается в окне «Сколько слов сейчас?»
export const REVIEW_GAMES = [
  ['choice', '🔁 Выбор перевода'],
  ['pair', '🧩 Пары'],
  ['recall', '💭 Вспомни'],
  ['type', '⌨️ Напечатай'],
];
const reviewGame = () => { const g = load('reviewGame', 'choice'); return REVIEW_GAMES.some(x => x[0] === g) ? g : 'choice'; };

// В «Парах» большой выбор («все 57») — пачками по 20-30, поровну, без хвостика в 1-2 слова: 57 → 29+28.
// В остальных играх слова идут по одному — делить не нужно.
const packOf = n => n > 30 ? Math.ceil(n / Math.ceil(n / 30)) : n;

// seen — слова, уже пройденные в прошлых пачках этого захода (чтобы ручной повтор и микс не повторяли их)
export async function reviewView(scope, n, seen = new Set()) {
  // early-<id> — ручной повтор темы раньше срока (как микс: коробки не двигаются)
  const early = scope.startsWith('early-');
  const mix = scope === 'mix' || early;
  const deckId = scope === 'all' || scope === 'mix' ? null : early ? scope.slice(6) : scope;
  const back = deckId ? '#/deck/' + deckId : '#/';
  const N = +n || PORTION_REVIEW;
  const isDue = c => c.box >= 1 && c.box < S.LEARNED_BOX && c.due && c.due <= Date.now();
  // 🎲 микс: случайные слова из отмеченных тем — сначала пора повторить, потом ⭐ сложные, начатые, новые, выученные
  const mixPool = async () => {
    const ids = early ? [deckId] : load('mixDecks', null);
    const rank = c => isDue(c) ? 0 : c.hard ? 1 : c.box >= 1 && c.box < S.LEARNED_BOX ? 2 : !c.box ? 3 : 4;
    return shuffle((await S.allCards()).filter(c => (!ids || ids.includes(c.deckId)) && (!early || c.box >= 1))).sort((a, b) => rank(a) - rank(b));
  };
  const due = (mix ? await mixPool() : await S.dueCards(deckId)).filter(c => !seen.has(c.id));

  if (!due.length) {
    frame(back, '🔁 Повторение', 1).innerHTML = `
      <div class="empty">Повторять пока нечего 🎉<br>Слова сами появятся, когда подойдёт их день.</div>
      <a class="btn primary wide" href="${back}">Назад</a>`;
    return;
  }

  const all = await S.allCards();
  const byDeck = new Map();
  for (const c of all) {
    if (!byDeck.has(c.deckId)) byDeck.set(c.deckId, []);
    byDeck.get(c.deckId).push(c);
  }
  const poolFor = c => ((byDeck.get(c.deckId) || []).length >= 4 ? byDeck.get(c.deckId) : all);

  const game = reviewGame();
  const pack = n => (game === 'pair' ? packOf(n) : n);
  const portion = due.slice(0, pack(Math.min(N, due.length)));
  const total = portion.length;
  const queue = shuffle(portion).map(c => ({ c, retry: false }));
  const wrong = [];
  let ok = 0, bad = 0;

  const nextCard = () => {
    if (!queue.length) return finish();
    const item = queue.shift();
    const { c } = item;
    const opts = options(c, poolFor(c));
    let revealed = false, answered = false;

    const render = () => {
      const lazy = load('reviewMode', 'thorough') === 'lazy';
      const ex = frame(back, '🔁 Повторение', (ok + bad) / total,
        `<span class="counters">✅ ${ok} ❌ ${bad}</span>`);
      ex.innerHTML = `
        <div class="seg mini">
          <button data-m="thorough" class="${lazy ? '' : 'on'}">🧠 Основательно</button>
          <button data-m="lazy" class="${lazy ? 'on' : ''}">😌 Лениво</button>
        </div>
        <div class="flash">${item.retry ? '<span class="badge box">🔁 ещё раз</span>' : ''}
          <div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div>${ipa(c)}</div>
        <label class="check center"><input type="checkbox" id="hard" ${c.hard ? 'checked' : ''}> ⭐ Сложное слово — повторять чаще</label>
        <div id="area"></div><div id="after"></div>
        <p class="muted center">Осталось: ${queue.length + 1}</p>`;
      ex.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        if (answered) return;
        save('reviewMode', b.dataset.m);
        render();
      });
      // галку можно поставить и после ответа — она сразу запоминается у слова
      ex.querySelector('#hard').onchange = async e => {
        c.hard = e.target.checked;
        const saved = await S.updateCard(c.id, { hard: c.hard });
        if (answered && saved.box >= 1 && saved.box < S.LEARNED_BOX) await S.updateCard(c.id, { due: c.hard ? Math.min(saved.due, S.nextDue(Math.max(1, saved.box - 1))) : saved.due });
      };
      const area = ex.querySelector('#area');
      if (!lazy && !revealed) {
        area.innerHTML = `<p class="muted center">Вспомни перевод сама, потом проверь 🙂</p>
          <button class="btn primary wide" id="show">👀 Показать варианты</button>`;
        area.querySelector('#show').onclick = () => { revealed = true; render(); };
        return;
      }
      area.innerHTML = `<div class="opts">${opts.map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>`;
      // Ошибка: правильный не подсвечиваем — тыкаешь дальше, пока не найдёшь; засчитывается первый ответ.
      let missed = false;
      area.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
        if (b.disabled) return;
        const right = b.textContent === c.ru;
        if (!answered) {
          answered = true;
          if (!item.retry) {
            // слово, которому ещё рано повторяться (микс), коробку не меняет, но баллы за занятие идут
            if (isDue(c)) await S.answerReview(c.id, right); else await S.logEvent('review', c.id, right);
            if (right) ok++; else { bad++; wrong.push(c); }
          }
          if (!right) { missed = true; queue.push({ c, retry: true }); }
        }
        if (!right) { b.classList.add('bad'); b.disabled = true; return; }
        area.querySelectorAll('.opt').forEach(x => { x.disabled = true; });
        b.classList.add('ok');
        setTimeout(nextCard, missed ? 900 : 600);
      });
    };
    render();
    say(c.en);
  };

  const finish = async () => {
    portion.forEach(c => seen.add(c.id));
    // остаток выбранного числа — следующей пачкой; выбранное кончилось — как раньше, новая порция
    const avail = (mix ? await mixPool() : await S.dueCards(deckId)).filter(c => !seen.has(c.id)).length;
    const rest = Math.min(N - total, avail);
    const left = rest > 0 ? rest : mix ? N : (await S.dueCards(deckId)).length;
    const nextN = rest > 0 ? rest : N;
    frame(back, '🎉 Порция готова!', 1).innerHTML = `
      <div class="done-box">
        <p class="big-num">✅ ${ok} &nbsp; ❌ ${bad}</p>
        <p>Повторено ${words(total)}.${bad && mix ? ' Трудные слова — ниже, глянь на них ещё разок.' : bad ? ' Ошибки вернулись в коробку 1 — завтра встретимся с ними снова.' : ' Без единой ошибки 🔥'}</p>
        ${wrong.length ? `<p class="muted">Трудные:</p><ul class="done-list">${wrong.map(c => `<li><b>${esc(c.en)}</b> — ${esc(c.ru)}</li>`).join('')}</ul>` : ''}
      </div>
      ${left ? `<a class="btn primary wide" href="#" id="again">Ещё ${pack(Math.min(nextN, left))} ${plural(pack(Math.min(nextN, left)), 'слово', 'слова', 'слов')}</a>` : '<p class="center">На сегодня всё повторено 💪</p>'}
      <a class="btn wide" href="${back}">Хватит на сегодня</a>`;
    $app.querySelector('#again')?.addEventListener('click', e => { e.preventDefault(); rest > 0 ? reviewView(scope, rest, seen) : reviewView(scope, N); });
  };

  if (game === 'choice') return nextCard();

  // Пары / Вспомни / Напечатай: засчитывается первый ответ по слову, как в «Выборе перевода»
  const title = REVIEW_GAMES.find(g => g[0] === game)[1];
  const ex = frame(back, title, 0, `<span class="muted">${words(total)}</span>`);
  const saving = [];
  await RUN[game](ex, shuffle(portion), null, (c, right) => {
    if (!c) return;
    if (right) ok++; else { bad++; wrong.push(c); }
    saving.push(isDue(c) ? S.answerReview(c.id, right) : S.logEvent('review', c.id, right));
  });
  await Promise.all(saving);
  finish();
}
