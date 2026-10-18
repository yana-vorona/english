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

function say(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

const sayBtn = en => `<button type="button" class="icon say" data-say="${esc(en)}" aria-label="Произнести">🔊</button>`;

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
    </header>
    <h2 class="mode">${title}</h2>
    <div id="ex"></div>`;
  const ex = $app.querySelector('#ex');
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) say(b.dataset.say);
  });
  return ex;
}

// Слова по очереди; done(true) — слово возвращается в конец списка.
function runQueue(ex, batch, renderOne) {
  return new Promise(resolve => {
    const q = [...batch];
    const next = () => {
      if (!q.length) return resolve(true);
      const c = q.shift();
      renderOne(c, again => { if (again) q.push(c); next(); }, q.length + 1);
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
        <div class="flash"><div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div><div class="ex-tr">${esc(c.ru)}</div></div>
        <p class="muted center">${i + 1} из ${batch.length}</p>
        <button class="btn primary wide" id="nx">Дальше</button>`;
      ex.querySelector('#nx').onclick = () => (++i < batch.length ? render() : resolve(true));
    };
    render();
  }),

  pair: (ex, batch) => new Promise(resolve => {
    const btn = (c, side) => `<button class="pb" data-side="${side}" data-id="${c.id}">${esc(c[side])}</button>`;
    ex.innerHTML = `<div class="pairs">
      <div>${shuffle(batch).map(c => btn(c, 'en')).join('')}</div>
      <div>${shuffle(batch).map(c => btn(c, 'ru')).join('')}</div></div>`;
    let sel = null, left = batch.length;
    ex.onclick = e => {
      const b = e.target.closest('.pb');
      if (!b || b.disabled) return;
      if (sel === b) { b.classList.remove('sel'); sel = null; return; }
      if (!sel || sel.dataset.side === b.dataset.side) {
        sel?.classList.remove('sel');
        sel = b; b.classList.add('sel');
        if (b.dataset.side === 'en') say(b.textContent);
        return;
      }
      const a = sel; sel = null; a.classList.remove('sel');
      if (a.dataset.id === b.dataset.id) {
        [a, b].forEach(x => { x.classList.add('ok'); x.disabled = true; });
        if (--left === 0) setTimeout(() => resolve(true), 500);
      } else {
        [a, b].forEach(x => x.classList.add('bad'));
        setTimeout(() => [a, b].forEach(x => x.classList.remove('bad')), 600);
      }
    };
  }),

  guess: (ex, batch, pool) => runQueue(ex, batch, (c, done, left) => {
    ex.innerHTML = `
      <div class="flash"><div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div></div>
      <div class="opts">${options(c, pool).map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>
      <div id="after"></div><p class="muted center">Осталось: ${left}</p>`;
    let answered = false;
    ex.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (answered) return;
      answered = true;
      const right = b.textContent === c.ru;
      ex.querySelectorAll('.opt').forEach(x => { if (x.textContent === c.ru) x.classList.add('ok'); });
      if (right) setTimeout(() => done(false), 600);
      else { b.classList.add('bad'); nextButton(ex.querySelector('#after'), () => done(true)); }
    });
  }),

  recall: (ex, batch) => runQueue(ex, batch, (c, done, left) => {
    ex.innerHTML = `
      <div class="flash"><div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div><div class="ex-tr hide" id="tr">${esc(c.ru)}</div></div>
      <div class="two" id="btns"><button class="btn big" id="no">🤔 Не знаю</button><button class="btn primary big" id="yes">✅ Знаю</button></div>
      <p class="muted center">Осталось: ${left}</p>`;
    const tr = ex.querySelector('#tr');
    ex.querySelector('#yes').onclick = () => {
      tr.classList.remove('hide'); tr.classList.add('good');
      ex.querySelector('#btns').innerHTML = '';
      setTimeout(() => done(false), 900);
    };
    ex.querySelector('#no').onclick = () => {
      tr.classList.remove('hide');
      nextButton(ex.querySelector('#btns'), () => done(true));
    };
  }),

  type: (ex, batch) => runQueue(ex, batch, (c, done, left) => {
    ex.innerHTML = `
      <div class="flash"><div class="ex-word ru-big">${esc(c.ru)}</div></div>
      <form class="typeform" autocomplete="off">
        <input id="ans" lang="en" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="по-английски">
        <div class="two" id="btns"><button type="button" class="btn" id="hint">💡 Подсказка</button><button class="btn primary">Проверить</button></div>
      </form>
      <div id="res"></div><p class="muted center">Осталось: ${left}</p>`;
    const inp = ex.querySelector('#ans');
    let hints = 0, checked = false;
    inp.focus();
    ex.querySelector('#hint').onclick = () => {
      hints = Math.min(c.en.length, Math.max(hints, inp.value.length) + 1);
      inp.value = c.en.slice(0, hints);
      inp.focus();
    };
    ex.querySelector('form').onsubmit = e => {
      e.preventDefault();
      if (checked) return;
      checked = true;
      if (typedRight(inp.value, c.en)) {
        inp.classList.add('ok');
        say(c.en);
        setTimeout(() => done(false), 700);
      } else {
        inp.classList.add('bad');
        ex.querySelector('#btns').innerHTML = '';
        ex.querySelector('#res').innerHTML = `<p class="answer">Правильно: <b>${esc(c.en)}</b> ${sayBtn(c.en)}</p><div id="nxp"></div>`;
        nextButton(ex.querySelector('#nxp'), () => done(true));
      }
    };
  }),
};

// ---------- Изучение новых ----------

export async function learnView(deckId, n) {
  const portion = +n || PORTION_NEW;
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
  if (!batch.length) batch = all.filter(c => !c.box).slice(0, portion);

  if (!batch.length) {
    frame(back, '🎓 Новых слов нет', 1).innerHTML = `
      <div class="empty">Все слова темы «${esc(deck.name)}» уже изучены 🎉</div>
      <a class="btn primary wide" href="${back}">К теме</a>`;
    return;
  }

  for (; mode < MODES.length; mode++) {
    save(key, { ids: batch.map(c => c.id), mode });
    const [kind, title] = MODES[mode];
    const ex = frame(back, title, mode / MODES.length, `<span class="muted">${mode + 1}/${MODES.length}</span>`);
    await RUN[kind](ex, batch, pool);
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
    ${more ? `<a class="btn primary wide" href="#" id="again">Ещё ${Math.min(portion, more)} ${plural(Math.min(portion, more), 'слово', 'слова', 'слов')}</a>` : ''}
    <a class="btn wide" href="${back}">Хватит на сегодня</a>`;
  $app.querySelector('#again')?.addEventListener('click', e => { e.preventDefault(); learnView(deckId, portion); });
}

// ---------- Повторение ----------

export async function reviewView(scope, n) {
  const mix = scope === 'mix';
  const deckId = scope === 'all' || mix ? null : scope;
  const back = deckId ? '#/deck/' + deckId : '#/';
  const N = +n || PORTION_REVIEW;
  const isDue = c => c.box >= 1 && c.box < S.LEARNED_BOX && c.due && c.due <= Date.now();
  // 🎲 микс: случайные слова из отмеченных тем — сначала пора повторить, потом начатые, новые, выученные
  const mixPool = async () => {
    const ids = load('mixDecks', null);
    const rank = c => isDue(c) ? 0 : c.box >= 1 && c.box < S.LEARNED_BOX ? 1 : !c.box ? 2 : 3;
    return shuffle((await S.allCards()).filter(c => !ids || ids.includes(c.deckId))).sort((a, b) => rank(a) - rank(b));
  };
  const due = mix ? await mixPool() : await S.dueCards(deckId);

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

  const portion = due.slice(0, N);
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
          <div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div></div>
        <div id="area"></div><div id="after"></div>
        <p class="muted center">Осталось: ${queue.length + 1}</p>`;
      ex.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        if (answered) return;
        save('reviewMode', b.dataset.m);
        render();
      });
      const area = ex.querySelector('#area');
      if (!lazy && !revealed) {
        area.innerHTML = `<p class="muted center">Вспомни перевод сама, потом проверь 🙂</p>
          <button class="btn primary wide" id="show">👀 Показать варианты</button>`;
        area.querySelector('#show').onclick = () => { revealed = true; render(); };
        return;
      }
      area.innerHTML = `<div class="opts">${opts.map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>`;
      area.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
        if (answered) return;
        answered = true;
        const right = b.textContent === c.ru;
        area.querySelectorAll('.opt').forEach(x => { if (x.textContent === c.ru) x.classList.add('ok'); });
        if (!item.retry) {
          // слово, которому ещё рано повторяться (микс), коробку не меняет, но баллы за занятие идут
          if (isDue(c)) await S.answerReview(c.id, right); else await S.logEvent('review', c.id, right);
          if (right) ok++; else { bad++; wrong.push(c); }
        }
        if (right) { setTimeout(nextCard, 600); return; }
        b.classList.add('bad');
        queue.push({ c, retry: true });
        nextButton(ex.querySelector('#after'), nextCard);
      });
    };
    render();
  };

  const finish = async () => {
    const left = mix ? N : (await S.dueCards(deckId)).length;
    frame(back, '🎉 Порция готова!', 1).innerHTML = `
      <div class="done-box">
        <p class="big-num">✅ ${ok} &nbsp; ❌ ${bad}</p>
        <p>Повторено ${words(total)}.${bad ? ' Ошибки вернулись в коробку 1 — завтра встретимся с ними снова.' : ' Без единой ошибки 🔥'}</p>
        ${wrong.length ? `<p class="muted">Трудные:</p><ul class="done-list">${wrong.map(c => `<li><b>${esc(c.en)}</b> — ${esc(c.ru)}</li>`).join('')}</ul>` : ''}
      </div>
      ${left ? `<a class="btn primary wide" href="#" id="again">Ещё ${Math.min(N, left)} ${plural(Math.min(N, left), 'слово', 'слова', 'слов')}</a>` : '<p class="center">На сегодня всё повторено 💪</p>'}
      <a class="btn wide" href="${back}">Хватит на сегодня</a>`;
    $app.querySelector('#again')?.addEventListener('click', e => { e.preventDefault(); reviewView(scope, N); });
  };

  nextCard();
}
