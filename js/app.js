import * as S from './store.js';
import { parseText, readFileRows, guessColumns } from './importer.js';
import { esc, plural, words, toast, load, save } from './ui.js';
import { learnView, reviewView } from './study.js';
import { syncConfig, syncStatus, syncNow, connect, disconnect, startSync } from './sync.js';
import { startPalette } from './palette.js';
import { trainerList, trainerRun } from './trainer.js';
import { hwList, hwRun } from './hw.js';
import { statsView, computeStats, statsBanner } from './stats.js';
import { storyView } from './story.js';
import { duelView } from './duel.js';
import { startUpdates, refreshApp } from './update.js';

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

// «Сколько слов сейчас?» — порция по силам, а не все 60 разом. extra — доп. поля над выбором (темы для микса).
function howMany(title, max, extra = '') {
  return new Promise(resolve => {
    const opts = [5, 10, 15, 20, 30].filter(n => !max || n < max);
    const d = dialog(`<h3>${title}</h3>${extra}<p class="muted">Сколько слов сейчас?</p>
      <div class="chips">${opts.map(n => `<button value="${n}" class="btn">${n}</button>`).join('')}${max ? `<button value="${max}" class="btn">все ${max}</button>` : ''}</div>
      <div class="row rev"><button value="cancel" class="btn ghost" formnovalidate>Отмена</button></div>`);
    d.addEventListener('close', () => resolve(+d.returnValue ? { n: +d.returnValue, d } : null));
  });
}

// 🎲 Микс: случайные слова из выбранных тем (сначала те, что пора повторить).
async function mixDialog(decks, stats) {
  const chosen = new Set(load('mixDecks', null) || decks.map(d => d.id));
  const r = await howMany('🎲 Микс из разных тем', 0, `<div class="mixdecks">${decks.map(d =>
    `<label><input type="checkbox" value="${d.id}"${chosen.has(d.id) ? ' checked' : ''}> ${esc(d.name)} <span class="muted">(${(stats[d.id] || {}).total || 0})</span></label>`).join('')}</div>`);
  if (!r) return;
  const ids = [...r.d.querySelectorAll('.mixdecks input:checked')].map(i => i.value);
  if (!ids.length) { toast('Отметь хотя бы одну тему'); return; }
  save('mixDecks', ids);
  location.hash = `#/review/mix/${r.n}`;
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
  const [decks, stats, st] = await Promise.all([S.listDecks(), S.allStats(), computeStats()]);
  const sum = Object.values(stats).reduce((a, s) => ({ total: a.total + s.total, due: a.due + s.due }), { total: 0, due: 0 });
  $app.innerHTML = `
    <header class="top"><h1 class="fh"><img src="icons/fox-words.png" alt="">Мои слова</h1></header>
    ${statsBanner(st)}
    ${decks.length ? `<p class="muted">${words(sum.total)} в ${decks.length} ${plural(decks.length, 'теме', 'темах', 'темах')}${sum.due ? ` · <b>🔁 ${sum.due} пора повторить</b>` : ''}</p>`
      : `<div class="empty">Пока нет ни одной темы.<br>Создай тему или загрузи слова 👇</div>`}
    ${sum.due ? `<a class="btn primary wide" href="#/review/all" id="revAll">🔁 Повторить всё (${sum.due})</a>` : ''}
    ${decks.length ? '<button class="btn wide" id="mix">🎲 Микс из разных тем</button>' : ''}
    <div class="decks">${decks.map(d => deckTile(d, stats[d.id])).join('')}</div>
    <div class="row">
      <button class="btn" data-act="new">➕ Новая тема</button>
      <a class="btn" href="#/import">⬇️ Импорт</a>
    </div>`;
  $app.querySelector('#revAll')?.addEventListener('click', async e => {
    e.preventDefault();
    const r = await howMany('🔁 Повторить всё', sum.due);
    if (r) location.hash = `#/review/all/${r.n}`;
  });
  $app.querySelector('#mix')?.addEventListener('click', () => mixDialog(decks, stats));
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

  // «Учить» и «Повторить» — сначала выбрать, сколько слов сейчас
  const pick = (btn, title, route, count) => btn.addEventListener('click', async e => {
    e.preventDefault();
    if (btn.classList.contains('off')) return;
    const r = await howMany(title, count());
    if (r) location.hash = `${route}/${id}/${r.n}`;
  });
  const t0 = () => Date.now();
  pick($app.querySelector('#learnBtn'), '🎓 Учить новые', '#/learn', () => cards.filter(c => !c.box).length);
  pick($app.querySelector('#revBtn'), '🔁 Повторить', '#/review', () => cards.filter(c => c.box >= 1 && c.box < S.LEARNED_BOX && c.due && c.due <= t0()).length);

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

  const cfg = syncConfig(), ss = syncStatus();
  const when = t => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  $app.innerHTML = `
    <header class="top"><h1>⚙️ Настройки</h1></header>
    <section class="card">
      <h2>☁️ Синхронизация</h2>
      ${cfg ? `<p class="muted">${ss ? (ss.ok ? `✅ Всё сохранено в облаке · ${when(ss.at)}` : `⚠️ Не получилось (${esc(ss.msg)}) · ${when(ss.at)}. Попробую ещё раз сама.`) : 'Подключено, сейчас синхронизирую…'}</p>
        <div class="row"><button class="btn" id="syncNow">🔄 Синхронизировать сейчас</button><button class="btn" id="syncAll">⬇️ Загрузить всё заново</button><button class="btn ghost" id="syncOff">Отключить</button></div>`
      : '<p class="muted">Не подключена. Открой на этом устройстве ссылку подключения — и слова появятся здесь сами.</p>'}
    </section>
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

  $app.querySelector('#syncNow')?.addEventListener('click', async () => {
    toast(await syncNow() ? 'Синхронизировано ☁️' : 'Не получилось, проверь интернет');
    settingsView();
  });
  $app.querySelector('#syncAll')?.addEventListener('click', async () => {
    connect(syncConfig());
    toast(await syncNow() ? 'Всё загружено из облака ☁️' : 'Облако не ответило, попробуй ещё раз');
    settingsView();
  });
  $app.querySelector('#syncOff')?.addEventListener('click', async () => {
    if (await confirmBox('Отключить синхронизацию на этом устройстве? Слова останутся здесь, но перестанут обмениваться с облаком.', 'Отключить')) {
      disconnect(); settingsView();
    }
  });

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

// ---------- 📌 «Фиксить»: что ушло и что ответил Claude (как в штабе) ----------

let fixAll = false;
async function fixView() {
  const when = t => t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const dm = t => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const all = await S.listFixes();
  const num = new Map([...all].sort((a, b) => (a.at || 0) - (b.at || 0)).map((f, i) => [f.id, i + 1]));
  const vis = fixAll ? all : all.filter(f => !f.seen);
  const answered = vis.filter(f => f.status === 'done').sort((a, b) => (!!a.viewed - !!b.viewed) || (b.doneAt || 0) - (a.doneAt || 0));
  const waiting = vis.filter(f => f.status !== 'done').sort((a, b) => (a.at || 0) - (b.at || 0));
  const toClose = all.filter(f => f.status === 'done' && !f.seen);
  const card = f => {
    const c = f.seen ? 'd' : f.status === 'done' ? 'g' : f.status === 'work' ? 'b' : 'y';
    const days = Math.max(0, Math.floor((Date.now() - (f.at || Date.now())) / 864e5));
    return `<div class="fxcard fx-${c}${f.viewed && !f.seen ? ' fx-v' : ''}" data-fx="${esc(f.id)}">
      <div class="fxmeta"><span class="tno">№${String(num.get(f.id)).padStart(3, '0')}</span>${f.status === 'done' ? `<span class="tick${f.viewed ? ' rd' : ''}" title="${f.viewed ? 'прочитано' : 'не прочитано'}">${f.viewed ? '✓✓' : '✓'}</span>` : ''}
        <span class="fxage">с ${dm(f.at || Date.now())} · ${days} дн.</span></div>
      <a class="fxexp" data-fxexp>▾ развернуть</a>
      <p class="pre fxtext">${esc(f.text || '')}</p>
      <div class="fxmore">
        ${f.answer ? `<div class="fxans"><span class="by">Claude · ${when(f.doneAt)}</span><div class="pre">${esc(f.answer)}</div></div>` : ''}
        ${f.status === 'done' && !f.seen ? `<div class="fxrow"><input data-fxre="${esc(f.id)}" placeholder="Дописать Claude по этой задаче…"><button class="talkBtn" data-fxsend="${esc(f.id)}">Отправить</button></div>` : ''}
      </div>
      ${f.status === 'done' && !f.seen ? `<div class="fxrow"><button class="talkBtn fxok" data-fxok="${esc(f.id)}">✓ Отработано</button></div>` : ''}
      ${f.seen ? `<div class="fxrow"><button class="talkBtn" data-fxback="${esc(f.id)}">↩ вернуть</button></div>` : ''}
    </div>`;
  };
  $app.innerHTML = `
    <header class="top"><h1>📌 Фиксить</h1></header>
    <div class="fxadd"><input id="fxnew" placeholder="＋ Что пофиксить / что нужно от Claude (Enter — добавить)"><button class="talkBtn" id="fxnewbtn">Добавить</button></div>
    <div class="fxbar">
      <span>Ждут тебя: <b>${answered.filter(f => !f.viewed && !f.seen).length}</b></span>
      <span class="fxlegend"><span class="fxl y">ждёт Claude</span><span class="fxl b">Claude делает</span><span class="fxl g">Claude ответил — проверь и нажми «✓ Отработано»</span><span class="fxl d">закрыто (видно в «Все»)</span></span>
      ${toClose.length ? `<button class="talkBtn fxok" id="fxcloseall">🧹 Убрать все отвеченные (${toClose.length})</button>` : ''}
      <span class="fxseg"><button data-fxall="0" class="${fixAll ? '' : 'on'}">Не сделано</button><button data-fxall="1" class="${fixAll ? 'on' : ''}">Все</button></span>
    </div>
    <div class="fxcols">
      <section class="fxcol fxcol-g"><h3>Claude ответил — посмотри</h3><div class="fxgrid">${answered.map(card).join('') || '<p class="muted">Пусто 🎉</p>'}</div></section>
      <section class="fxcol fxcol-b"><h3>Ждёт Claude / Claude делает</h3><div class="fxgrid">${waiting.map(card).join('') || '<p class="muted">Пусто</p>'}</div></section>
    </div>`;
  $app.querySelectorAll('[data-fxall]').forEach(b => b.onclick = () => { fixAll = b.dataset.fxall === '1'; fixView(); });
  const byId = id => all.find(f => f.id === id);
  const save = (f, ch) => { const { id, ...v } = f; return S.setMeta(id, { ...v, ...ch }); };
  const addNew = async () => {
    const inp = $app.querySelector('#fxnew'), text = inp.value.trim();
    if (!text) { inp.focus(); return; }
    await S.setMeta('fix:' + S.uid(), { text, status: 'new', at: Date.now() });
    toast('✓ ушло в «Фиксить»'); fixView(); fixStickers();
  };
  $app.querySelector('#fxnewbtn').onclick = addNew;
  $app.querySelector('#fxnew').onkeydown = e => { if (e.key === 'Enter') addNew(); };
  // нажатие в любом месте стикера раскрывает его; открыла ответ — ✓ становится ✓✓ (прочитано), как в Telegram
  $app.querySelectorAll('.fxcard').forEach(c => c.onclick = async e => {
    if (e.target.closest('button, input, textarea')) return;
    c.classList.toggle('open');
    c.querySelector('[data-fxexp]').textContent = c.classList.contains('open') ? '▴ свернуть' : '▾ развернуть';
    const f = byId(c.dataset.fx);
    if (c.classList.contains('open') && f.status === 'done' && !f.viewed) {
      f.viewed = Date.now();
      const t = c.querySelector('.tick'); t.textContent = '✓✓'; t.classList.add('rd'); t.title = 'прочитано';
      const n = $app.querySelector('.fxbar b'); n.textContent = Math.max(0, +n.textContent - 1);
      await save(f, { viewed: f.viewed });
      fixStickers();
    }
  });
  $app.querySelector('#fxcloseall')?.addEventListener('click', async () => {
    for (const f of toClose) await save(f, { seen: Date.now() });
    fixView(); fixStickers();
  });
  $app.querySelectorAll('[data-fxok]').forEach(b => b.onclick = async () => { await save(byId(b.dataset.fxok), { seen: Date.now() }); fixView(); fixStickers(); });
  $app.querySelectorAll('[data-fxback]').forEach(b => b.onclick = async () => { await save(byId(b.dataset.fxback), { seen: 0 }); fixView(); fixStickers(); });
  // ответ по задаче уходит новой задачей со ссылкой на старую - Claude видит прошлые задачи и поймёт, к чему это
  $app.querySelectorAll('[data-fxsend]').forEach(b => b.onclick = async () => {
    const f = byId(b.dataset.fxsend), inp = $app.querySelector(`[data-fxre="${CSS.escape(f.id)}"]`), tx = inp.value.trim();
    if (!tx) { inp.focus(); return; }
    await S.setMeta('fix:' + S.uid(), { text: `К задаче «${(f.text || '').slice(0, 80)}»: ${tx}`, status: 'new', at: Date.now() });
    await save(f, { seen: Date.now() });
    toast('✓ ушло в «Фиксить»'); fixView(); fixStickers();
  });
}

// Сколько ответов Claude ждут Яну — кружок на пункте меню «Фиксить» и на кнопке «📋 Раздел».
async function fixStickers() {
  const n = (await S.listFixes()).filter(f => f.status === 'done' && !f.seen && !f.viewed).length;
  const badge = document.getElementById('fxbadge');
  badge.hidden = !n; badge.textContent = n;
  document.getElementById('fixngo').textContent = '📋 Раздел' + (n ? ` (${n})` : '');
}

// ---------- Подключение устройства по ссылке #/connect/<код> ----------

async function connectView(code) {
  try {
    const cfg = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(code)))));
    if (!cfg.url || !cfg.key) throw new Error();
    connect({ url: cfg.url, key: cfg.key });
    $app.innerHTML = '<div class="empty">☁️ Подключаюсь к облаку…</div>';
    const ok = await syncNow();
    toast(ok ? 'Подключено! Слова загружены ☁️' : 'Подключено, но облако пока не ответило — попробую ещё');
  } catch {
    toast('Ссылка подключения неверная');
  }
  history.replaceState(null, '', location.pathname + '#/');
  router();
}

// Пришли изменения с другого устройства — обновляем экран, если это не занятие.
window.addEventListener('synced', () => {
  const h = location.hash || '#/';
  if (/^#?\/?$|^#\/deck\/|^#\/fix$|^#\/trainer$|^#\/hw$/.test(h)) router();
  fixStickers();
});

// ---------- Переходы между экранами ----------

const routes = [
  [/^#?\/?$/, home],
  [/^#\/deck\/([^/]+)$/, deckView],
  [/^#\/import(?:\/([^/]+))?$/, importView],
  [/^#\/settings$/, settingsView],
  [/^#\/fix$/, fixView],
  [/^#\/learn\/([^/]+)(?:\/(\d+))?$/, learnView],
  [/^#\/review\/([^/]+)(?:\/(\d+))?$/, reviewView],
  [/^#\/connect\/(.+)$/, connectView],
  [/^#\/trainer$/, trainerList],
  [/^#\/trainer\/([^/]+)$/, trainerRun],
  [/^#\/hw$/, hwList],
  [/^#\/stats$/, statsView],
  [/^#\/story\/(\d+)$/, storyView],
  [/^#\/duel\/(\w+)$/, duelView],
  [/^#\/hw\/([^/]+)$/, hwRun],
];

async function router() {
  const h = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      const section = h.startsWith('#/settings') ? '#/settings' : h.startsWith('#/trainer') ? '#/trainer' : h.startsWith('#/hw') ? '#/hw' : (h.startsWith('#/stats') || h.startsWith('#/story') || h.startsWith('#/duel')) ? '#/stats' : h === '#/fix' ? '#/fix' : '#/';
      document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === section));
      document.body.classList.toggle('wide', h === '#/fix');
      await fn(...m.slice(1));
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', router);
router();
startSync();
startPalette();
startUpdates();

// 📌 Стикер «Фиксить» (как в штабе): пишешь или говоришь → «Отправить» → отдельный Claude на ПК.
const fixn = document.getElementById('fixn'), fixst = document.getElementById('fixnst');
document.querySelector('.fixhead').onclick = () => document.getElementById('stickers').classList.toggle('open');
document.getElementById('fixnsend').onclick = async () => {
  const text = fixn.value.trim();
  if (!text) { fixn.focus(); return; }
  await S.setMeta('fix:' + S.uid(), { text, status: 'new', at: Date.now() });
  fixn.value = '';
  fixst.textContent = '✓ ушло в «Фиксить»';
  setTimeout(() => { fixst.textContent = ''; }, 4000);
  if (location.hash === '#/fix') fixView();
  fixStickers();
};
fixStickers();
document.getElementById('fixngo').onclick = () => { location.hash = '#/fix'; document.getElementById('stickers').classList.remove('open'); };
// Слева в нижней полоске — когда сверялись с облаком (как «сверено с Google» в штабе).
const statusEl = document.getElementById('status');
const showStatus = () => {
  const st = syncStatus();
  const hm = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  statusEl.textContent = !syncConfig() ? 'Облако не подключено' : st ? (st.ok ? `Сверено с облаком в ${hm(st.at)}` : `Облако не ответило в ${hm(st.at)}, повторю сама`) : 'Сверяюсь с облаком…';
};
showStatus();
setInterval(showStatus, 10000);
// 🎤 голосом — распознавание речи браузера (Chrome).
document.getElementById('fixmic').onclick = () => {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { toast('Голосовой ввод в этом браузере не работает'); return; }
  const r = new R();
  r.lang = 'ru-RU';
  r.onresult = e => { fixn.value = (fixn.value ? fixn.value + ' ' : '') + e.results[0][0].transcript; };
  const mic = document.getElementById('fixmic');
  r.onend = () => { fixst.textContent = ''; mic.classList.remove('rec'); };
  mic.classList.add('rec');
  fixst.textContent = 'слушаю…';
  r.start();
};



navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
