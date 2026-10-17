import * as S from './store.js';
import { parseText, readFileRows, guessColumns } from './importer.js';
import { esc, plural, words, toast } from './ui.js';
import { learnView, reviewView } from './study.js';

const $app = document.getElementById('app');

// ---------- Мелочи интерфейса ----------

// Окно поверх экрана. Кнопка «ОК» стоит первой в разметке, чтобы Enter нажимал именно её.
function dialog(inner) {
  const d = document.createElement('dialog');
  d.className = 'dlg';
  d.innerHTML = `<form method="dialog">${inner}</form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d) d.close('cancel'); });
  d.showModal();
  return d;
}

function ask(title, value = '', ok = 'Сохранить') {
  return new Promise(resolve => {
    const d = dialog(`<h3>${esc(title)}</h3>
      <input name="v" value="${esc(value)}" autocomplete="off">
      <div class="row rev"><button value="ok" class="btn primary">${ok}</button><button value="cancel" class="btn ghost" formnovalidate>Отмена</button></div>`);
    const inp = d.querySelector('input');
    inp.focus(); inp.select();
    d.addEventListener('close', () => resolve(d.returnValue === 'ok' && inp.value.trim() ? inp.value.trim() : null));
  });
}

function confirmBox(text, ok = 'Удалить') {
  return new Promise(resolve => {
    const d = dialog(`<p>${text}</p>
      <div class="row rev"><button value="ok" class="btn danger">${ok}</button><button value="cancel" class="btn ghost">Отмена</button></div>`);
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'));
  });
}

function boxBadge(c) {
  if (c.box >= S.LEARNED_BOX) return '<span class="badge ok">✅</span>';
  if (!c.box) return '<span class="badge">новое</span>';
  return `<span class="badge box">📦${c.box}</span>`;
}

// ---------- Экран «Мои слова» ----------

async function home() {
  const [decks, stats] = await Promise.all([S.listDecks(), S.allStats()]);
  const sum = Object.values(stats).reduce((a, s) => ({ total: a.total + s.total, due: a.due + s.due }), { total: 0, due: 0 });
  $app.innerHTML = `
    <header class="top"><h1>📚 Мои слова</h1></header>
    ${decks.length ? `<p class="muted">${words(sum.total)} в ${decks.length} ${plural(decks.length, 'теме', 'темах', 'темах')}${sum.due ? ` · <b>🔁 ${sum.due} пора повторить</b>` : ''}</p>`
      : `<div class="empty">Пока нет ни одной темы.<br>Создай тему или загрузи слова 👇</div>`}
    ${sum.due ? `<a class="btn primary wide" href="#/review/all">🔁 Повторить всё (${sum.due})</a>` : ''}
    <div class="decks">${decks.map(d => deckTile(d, stats[d.id])).join('')}</div>
    <div class="row">
      <button class="btn" data-act="new">➕ Новая тема</button>
      <a class="btn" href="#/import">⬇️ Импорт</a>
    </div>`;
  $app.querySelector('[data-act=new]').onclick = async () => {
    const name = await ask('Название новой темы', '', 'Создать');
    if (name) location.hash = '#/deck/' + (await S.createDeck(name)).id;
  };
}

function deckTile(d, s = { total: 0, learned: 0, due: 0, score: 0 }) {
  const pct = s.total ? Math.round(s.score / s.total * 100) : 0;
  return `<a class="deck" href="#/deck/${d.id}">
    <div class="deck-head"><span class="deck-name">${esc(d.name)}</span>${s.due ? `<span class="due">🔁 ${s.due}</span>` : ''}</div>
    <div class="deck-meta">${words(s.total)} · ${pct}% выучено</div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </a>`;
}

// ---------- Экран темы ----------

async function deckView(id) {
  const deck = await S.getDeck(id);
  if (!deck) { location.hash = '#/'; return; }
  let cards = await S.listCards(id);
  let filter = '';

  $app.innerHTML = `
    <header class="top">
      <a class="back" href="#/" aria-label="Назад">‹</a>
      <h1 class="grow">${esc(deck.name)}</h1>
      <button class="icon" data-act="rename" aria-label="Переименовать">✏️</button>
      <button class="icon" data-act="delete" aria-label="Удалить тему">🗑</button>
    </header>
    <div class="study-btns">
      <a class="btn primary" id="learnBtn" href="#/learn/${id}"></a>
      <a class="btn" id="revBtn" href="#/review/${id}"></a>
    </div>
    <form class="add" autocomplete="off">
      <input name="en" placeholder="English" lang="en" autocapitalize="off">
      <input name="ru" placeholder="Перевод" lang="ru">
      <button class="btn primary">➕ Добавить</button>
    </form>
    <div class="row">
      <input class="search grow" type="search" placeholder="🔍 Найти слово">
      <a class="btn" href="#/import/${id}">⬇️ Импорт</a>
    </div>
    <p class="muted" id="count"></p>
    <div class="cards" id="list"></div>`;

  const list = $app.querySelector('#list');
  const render = () => {
    const t = Date.now();
    const fresh = cards.filter(c => !c.box).length;
    const due = cards.filter(c => c.box >= 1 && c.box < S.LEARNED_BOX && c.due && c.due <= t).length;
    const lb = $app.querySelector('#learnBtn'), rb = $app.querySelector('#revBtn');
    lb.textContent = fresh ? `🎓 Учить новые (${fresh})` : '🎓 Новых нет';
    lb.classList.toggle('off', !fresh);
    rb.textContent = due ? `🔁 Повторить (${due})` : '🔁 Повторять рано';
    rb.classList.toggle('off', !due);
    const f = filter.toLowerCase();
    const shown = f ? cards.filter(c => c.en.toLowerCase().includes(f) || c.ru.toLowerCase().includes(f)) : cards;
    $app.querySelector('#count').textContent = f ? `Найдено: ${shown.length} из ${cards.length}` : words(cards.length);
    list.innerHTML = shown.length
      ? shown.map(c => `<button class="card-row" data-id="${c.id}"><span class="en">${esc(c.en)}</span><span class="ru">${esc(c.ru)}</span>${boxBadge(c)}</button>`).join('')
      : `<div class="empty">${cards.length ? 'Ничего не нашлось 🤷' : 'Слов пока нет. Добавь вручную или через импорт.'}</div>`;
  };
  render();

  const form = $app.querySelector('form.add');
  form.onsubmit = async e => {
    e.preventDefault();
    const en = form.en.value.trim(), ru = form.ru.value.trim();
    if (!en || !ru) { (en ? form.ru : form.en).focus(); return; }
    const r = await S.addCards(id, [{ en, ru }]);
    if (!r.added) toast('Такое слово уже есть 🙂');
    form.reset(); form.en.focus();
    cards = await S.listCards(id); render();
  };
  $app.querySelector('.search').oninput = e => { filter = e.target.value.trim(); render(); };

  list.onclick = async e => {
    const row = e.target.closest('.card-row');
    if (!row) return;
    const c = cards.find(x => x.id === row.dataset.id);
    const res = await editCard(c);
    if (res === 'del') { await S.deleteCard(c.id); toast('Слово удалено'); }
    else if (res) await S.updateCard(c.id, res);
    else return;
    cards = await S.listCards(id); render();
  };

  $app.querySelector('[data-act=rename]').onclick = async () => {
    const name = await ask('Новое название темы', deck.name);
    if (name) { await S.renameDeck(id, name); deckView(id); }
  };
  $app.querySelector('[data-act=delete]').onclick = async () => {
    if (await confirmBox(`Удалить тему «${esc(deck.name)}» и ${words(cards.length)} в ней?`)) {
      await S.deleteDeck(id); toast('Тема удалена'); location.hash = '#/';
    }
  };
}

function editCard(c) {
  return new Promise(resolve => {
    const d = dialog(`<h3>Слово</h3>
      <label>English<input name="en" value="${esc(c.en)}" lang="en" autocapitalize="off"></label>
      <label>Перевод<input name="ru" value="${esc(c.ru)}" lang="ru"></label>
      <p class="muted">Коробка: ${c.box >= S.LEARNED_BOX ? 'выучено ✅' : c.box ? c.box : 'новое, ещё не изучали'}</p>
      <div class="row rev"><button value="ok" class="btn primary">Сохранить</button><button value="cancel" class="btn ghost">Отмена</button><button value="del" class="btn danger-ghost">🗑</button></div>`);
    d.addEventListener('close', () => {
      const en = d.querySelector('[name=en]').value.trim(), ru = d.querySelector('[name=ru]').value.trim();
      if (d.returnValue === 'del') resolve('del');
      else if (d.returnValue === 'ok' && en && ru && (en !== c.en || ru !== c.ru)) resolve({ en, ru });
      else resolve(null);
    });
  });
}

// ---------- Импорт ----------

async function importView(deckId) {
  const decks = await S.listDecks();
  const st = { mode: 'text', pairs: [], errors: [], rows: null, cols: null };

  $app.innerHTML = `
    <header class="top"><a class="back" href="${deckId ? '#/deck/' + deckId : '#/'}" aria-label="Назад">‹</a><h1>⬇️ Импорт слов</h1></header>
    <label class="field">Куда добавить
      <select id="target">
        ${decks.map(d => `<option value="${d.id}" ${d.id === deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        <option value="" ${!deckId ? 'selected' : ''}>➕ Новая тема…</option>
      </select>
    </label>
    <input id="newName" placeholder="Название новой темы" class="${deckId ? 'hidden' : ''}">
    <div class="tabs">
      <button class="tab on" data-mode="text">📝 Вставить текст</button>
      <button class="tab" data-mode="file">📄 Файл</button>
    </div>
    <div id="pane-text">
      <textarea id="text" rows="9" placeholder="apple - яблоко&#10;take off - взлетать&#10;entrepreneur — предприниматель"></textarea>
      <p class="muted">Каждое слово с новой строки. Между словом и переводом: тире, Tab или «;». Порядок неважен, где русский, я пойму сама 😉</p>
    </div>
    <div id="pane-file" class="hidden">
      <input type="file" id="file" accept=".lxf,.csv,.txt,.xlsx,.xls,text/csv">
      <p class="muted">Файл Lexilize (.lxf — сразу все темы), CSV или Excel.</p>
      <div id="cols"></div>
    </div>
    <div id="preview"></div>
    <button class="btn primary wide" id="go" disabled>Добавить</button>`;

  const $ = s => $app.querySelector(s);
  const target = $('#target'), newName = $('#newName');
  target.onchange = () => newName.classList.toggle('hidden', !!target.value);

  $app.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    st.mode = b.dataset.mode;
    $app.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
    $('#pane-text').classList.toggle('hidden', st.mode !== 'text');
    $('#pane-file').classList.toggle('hidden', st.mode !== 'file');
    refresh();
  });

  $('#text').oninput = refresh;

  $('#file').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await readFileRows(f);
      st.lxf = null;
      if (r.lxf) {
        st.lxf = r.lxf;
        st.lxfOn = new Set(r.lxf.map((_, i) => i));
        st.rows = null;
        renderLxf();
        return;
      }
      if (r.text != null) { // .txt — как вставленный текст
        $('#text').value = r.text;
        $app.querySelector('[data-mode=text]').click();
        return;
      }
      st.rows = r.rows;
      st.cols = { ...guessColumns(r.rows), deck: r.sheetCol ? Math.max(...r.rows.map(x => x.length)) - 1 : -1 };
      renderCols();
    } catch (err) {
      toast('Не получилось прочитать файл: ' + err.message);
    }
  };

  function renderCols() {
    const { width, en, ru, deck, header } = st.cols;
    const opts = sel => Array.from({ length: width }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>Колонка ${i + 1}: ${esc((st.rows[header ? 1 : 0] || [])[i] || '').slice(0, 25)}</option>`).join('');
    $('#cols').innerHTML = `
      <label class="field">English<select data-k="en">${opts(en)}</select></label>
      <label class="field">Перевод<select data-k="ru">${opts(ru)}</select></label>
      <label class="field">Тема из колонки (если в файле много тем)<select data-k="deck"><option value="-1">— нет, всё в выбранную тему —</option>${opts(deck)}</select></label>
      <label class="check"><input type="checkbox" data-k="header" ${header ? 'checked' : ''}> Первая строка — заголовки</label>`;
    $('#cols').querySelectorAll('[data-k]').forEach(el => el.onchange = () => {
      st.cols[el.dataset.k] = el.type === 'checkbox' ? el.checked : +el.value;
      refresh();
    });
    refresh();
  }

  // Файл Lexilize: список тем с галочками + что делать с прогрессом.
  function renderLxf() {
    const learned = d => d.cards.filter(c => c.done).length;
    $('#cols').innerHTML = `
      <p>📦 В файле <b>${st.lxf.length}</b> ${plural(st.lxf.length, 'тема', 'темы', 'тем')}. Отметь, какие загрузить:</p>
      <div class="lxf">${st.lxf.map((d, i) => `
        <label class="check"><input type="checkbox" data-i="${i}" ${st.lxfOn.has(i) ? 'checked' : ''}>
          <span class="grow">${esc(d.name)}</span><span class="muted">${d.cards.length}${learned(d) ? ` · изучено ${learned(d)}` : ''}</span></label>`).join('')}
      </div>
      <h2>Прогресс из Lexilize</h2>
      <label class="check"><input type="radio" name="prog" value="keep" ${st.keepProgress !== false ? 'checked' : ''}> Перенести: изученные слова встанут в повторение, где были</label>
      <label class="check"><input type="radio" name="prog" value="zero" ${st.keepProgress === false ? 'checked' : ''}> Начать с нуля: все слова будут новыми</label>`;
    $('#cols').querySelectorAll('[data-i]').forEach(el => el.onchange = () => {
      el.checked ? st.lxfOn.add(+el.dataset.i) : st.lxfOn.delete(+el.dataset.i);
      refresh();
    });
    $('#cols').querySelectorAll('[name=prog]').forEach(el => el.onchange = () => { st.keepProgress = el.value === 'keep'; });
    refresh();
  }

  function collect() {
    if (st.mode === 'file' && st.lxf) {
      st.pairs = st.lxf.filter((_, i) => st.lxfOn.has(i)).flatMap(d => d.cards.map(c => ({ ...c, deck: d.name })));
      st.errors = [];
      return;
    }
    if (st.mode === 'text') {
      const r = parseText($('#text').value);
      st.pairs = r.pairs; st.errors = r.errors;
      return;
    }
    st.pairs = []; st.errors = [];
    if (!st.rows) return;
    const { en, ru, deck, header } = st.cols;
    for (const r of st.rows.slice(header ? 1 : 0)) {
      const p = { en: (r[en] || '').trim(), ru: (r[ru] || '').trim(), deck: deck >= 0 ? (r[deck] || '').trim() : '' };
      if (p.en && p.ru) st.pairs.push(p); else st.errors.push(r.join(' | '));
    }
  }

  function refresh() {
    collect();
    const n = st.pairs.length;
    const byDeck = st.mode === 'file' && (st.lxf || (st.cols && st.cols.deck >= 0));
    const decksInFile = byDeck ? [...new Set(st.pairs.map(p => p.deck || 'Без темы'))] : [];
    $('#preview').innerHTML = (n || st.errors.length) ? `
      <div class="preview">
        <p>✅ Распознано: <b>${n}</b>${byDeck ? ` · тем: ${decksInFile.length} (${esc(decksInFile.slice(0, 5).join(', '))}${decksInFile.length > 5 ? '…' : ''})` : ''}</p>
        ${st.pairs.slice(0, 5).map(p => `<div class="pv"><span class="en">${esc(p.en)}</span><span class="ru">${esc(p.ru)}</span></div>`).join('')}
        ${n > 5 ? `<p class="muted">…и ещё ${n - 5}</p>` : ''}
        ${st.errors.length ? `<p class="warn">⚠️ Не поняла ${st.errors.length} ${plural(st.errors.length, 'строку', 'строки', 'строк')}:</p>
          <ul class="errs">${st.errors.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      </div>` : '';
    target.disabled = byDeck;
    $('#go').disabled = !n;
    $('#go').textContent = n ? `Добавить ${words(n)}` : 'Добавить';
  }

  $('#go').onclick = async () => {
    const byDeck = st.mode === 'file' && (st.lxf || (st.cols && st.cols.deck >= 0));
    let added = 0, skipped = 0, lastDeck = null;
    if (byDeck) {
      const groups = new Map();
      for (let p of st.pairs) {
        if (st.lxf) p = { en: p.en, ru: p.ru, deck: p.deck, ...(st.keepProgress !== false ? S.boxFromLexilize(p) : {}) };
        const k = p.deck || 'Без темы';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(p);
      }
      for (const [name, pairs] of groups) {
        const d = await S.findOrCreateDeck(name);
        const r = await S.addCards(d.id, pairs);
        added += r.added; skipped += r.skipped; lastDeck = groups.size === 1 ? d.id : null;
      }
    } else {
      let id = target.value;
      if (!id) {
        const name = newName.value.trim();
        if (!name) { newName.focus(); toast('Напиши название новой темы'); return; }
        id = (await S.findOrCreateDeck(name)).id;
      }
      const r = await S.addCards(id, st.pairs);
      added = r.added; skipped = r.skipped; lastDeck = id;
    }
    toast(`Добавлено: ${added}${skipped ? `, пропущено повторов: ${skipped}` : ''} 🎉`);
    location.hash = lastDeck ? '#/deck/' + lastDeck : '#/';
  };

  refresh();
}

// ---------- Настройки ----------

function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('theme', t); } catch {}
}

async function settingsView() {
  let theme = 'auto';
  try { theme = localStorage.getItem('theme') || 'auto'; } catch {}
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;

  $app.innerHTML = `
    <header class="top"><h1>⚙️ Настройки</h1></header>
    <section class="card">
      <h2>Оформление</h2>
      <div class="seg">${[['auto', '🌗 Как в системе'], ['light', '☀️ Светлая'], ['dark', '🌙 Тёмная']]
        .map(([v, l]) => `<button data-theme="${v}" class="${v === theme ? 'on' : ''}">${l}</button>`).join('')}</div>
    </section>
    <section class="card">
      <h2>Резервная копия</h2>
      <p class="muted">Пока облака нет, слова живут на этом устройстве. Чтобы перенести их на телефон или подстраховаться, сохрани копию файлом и загрузи её на другом устройстве. Ничего не затрётся: возьмётся то, что новее.</p>
      <div class="row">
        <button class="btn" id="exp">💾 Сохранить копию</button>
        <label class="btn">📂 Загрузить копию<input type="file" id="imp" accept=".json,application/json" hidden></label>
      </div>
    </section>
    <section class="card">
      <h2>Хранилище</h2>
      <p class="muted">${persisted ? '🔒 Браузер обещал не удалять данные приложения.' : 'Браузер может почистить данные, если на устройстве мало места. Подстрахуйся копией 💾 или установи приложение на главный экран.'}</p>
    </section>`;

  $app.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    applyTheme(b.dataset.theme);
    $app.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('on', x === b));
  });

  $app.querySelector('#exp').onclick = async () => {
    const data = await S.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `english-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  $app.querySelector('#imp').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await S.importBackup(JSON.parse(await f.text()));
      toast(`Загружено: тем ${r.decks}, слов ${r.cards} 👍`);
    } catch (err) {
      toast('Не получилось: ' + err.message);
    }
    e.target.value = '';
  };
}

// ---------- Переходы между экранами ----------

const routes = [
  [/^#?\/?$/, home],
  [/^#\/deck\/([^/]+)$/, deckView],
  [/^#\/import(?:\/([^/]+))?$/, importView],
  [/^#\/settings$/, settingsView],
  [/^#\/learn\/([^/]+)$/, learnView],
  [/^#\/review\/([^/]+)$/, reviewView],
];

async function router() {
  const h = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on',
        a.getAttribute('href') === '#/settings' ? h === '#/settings' : a.getAttribute('href') === '#/' && h !== '#/settings'));
      await fn(...m.slice(1));
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', router);
router();

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
