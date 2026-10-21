// Домашка: список ДЗ с оценкой времени и сложности + интерактивные упражнения.
// Содержимое упражнения (hw.content):
//   { instruction, type, items: [{ text }], words?, text?, choices?, answers: [...], kind? }
// Разметка в items[].text:  {a|b} — выбор прямо в предложении;  {#} — выпадающий список из words;
//                           {=sh} — дописать слово, начинается на «sh».
// type 'textab': сверху text с пропусками {1}, {2}…, под ним строки «1: [a] [b]» из choices.
// answers — правильные ответы по порядку всех мест выбора.
import * as S from './store.js';
import { esc, toast } from './ui.js';
import { syncNow } from './sync.js';
import { getCfg, nextLessonOf } from './lessons.js';

const $app = document.getElementById('app');
const BOOK = { 'РТ': 'РТ', 'Уч': 'Уч' };

// ---------- Разбор упражнения на «места выбора» ----------

const RE = /\{([^{}]*)\}/g;

function slotsOf(c) {
  const slots = [];
  if (c.type === 'textab') {
    (c.choices || []).forEach(opts => slots.push({ kind: 'ab', opts }));
  }
  (c.items || []).forEach((it, i) => {
    for (const m of it.text.matchAll(RE)) {
      const v = m[1];
      if (v === '#') slots.push({ kind: 'list', item: i });
      else if (v.startsWith('=')) slots.push({ kind: v.length > 1 ? 'letter' : 'write', start: v.slice(1), item: i });
      else if (v.includes('|')) slots.push({ kind: 'inline', opts: v.split('|'), item: i });
    }
  });
  return slots;
}

// Минуты на одно место (стартовые формулы Яны), потом умножаем на её поправку.
const RATE = { inline: 0.5, list: 0.5, ab: 0.7, letter: 0.7, write: 1 };
const FORMAT = {
  inline: 'выбрать слово в предложении, писать не нужно',
  list: 'вставить слова из списка, писать не нужно',
  ab: 'текст с пропусками: выбрать a или b',
  letter: 'дописать слово по первой букве',
  write: 'вписать слово или форму глагола',
};

function estimate(c, factor = 1) {
  const slots = slotsOf(c);
  const per = c.kind === 'new' ? 1 : null; // новые слова, надо понять смысл — ~1 мин на пропуск
  const raw = slots.reduce((a, s) => a + (per || RATE[s.kind] || 0.5), 0);
  return Math.max(1, Math.round(raw * factor));
}

function formatOf(c) {
  const kinds = [...new Set(slotsOf(c).map(s => s.kind))];
  return kinds.map(k => FORMAT[k]).join('; ');
}

function defaultDifficulty(c) {
  if (c.kind === 'new') return 'red';
  return slotsOf(c).some(s => s.kind === 'letter' || s.kind === 'write' || s.kind === 'ab') ? 'yellow' : 'green';
}

const DIFF = { green: '🟢', yellow: '🟡', red: '🔴' };
const title = h => h.book === 'free' ? `✍️ ${h.title || 'Своё задание'}` : `${BOOK[h.book] || h.book} стр. ${h.page} упр. ${h.ex}`;
const norm = s => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', weekday: 'short' }) : '';


// ---------- Бот в Telegram: забираем пересланную домашку прямо из приложения (без ПК) ----------

// «РТ стр. 76 упр. 1, 2; учебник с. 120 ex 3-4» → [{book, page, ex}]
function parseHw(text) {
  const t = text.toLowerCase().replace(/ё/g, 'е');
  const B = '(?<![а-яa-z])', E = '(?![а-яa-z])';
  const tokens = [];
  const add = (re, type, f) => { for (const m of t.matchAll(re)) tokens.push({ pos: m.index, type, val: f(m) }); };
  add(new RegExp(String.raw`(рабоч\S*\s+тетрад\S*|${B}тетрад\S*|${B}р\.?\s?т${E}\.?|${B}wb${E}|workbook)`, 'g'), 'book', () => 'РТ');
  add(new RegExp(String.raw`(${B}учебн\S*|${B}уч${E}\.?|${B}sb${E}|student'?s?\s?book)`, 'g'), 'book', () => 'Уч');
  add(new RegExp(String.raw`(?:${B}стр\S*|${B}с${E}|${B}p${E}|${B}page|${B}pg${E})\.?\s*(\d{1,3})`, 'g'), 'page', m => m[1]);
  add(new RegExp(String.raw`${B}(\d{1,3})\s*(?=упр|ex|№)`, 'g'), 'page', m => m[1]); // «рт 76 упр 1» — число перед «упр» = страница
  add(new RegExp(String.raw`(?:${B}упр\S*|${B}ex\S*|${B}№)\.?\s*(\d{1,2}(?:\s*(?:,|и|-|–)\s*\d{1,2})*)`, 'g'), 'ex', m => m[1]);
  tokens.sort((a, b) => a.pos - b.pos);
  let book = 'РТ', page = null;
  const out = [], seen = {};
  for (const k of tokens) {
    if (k.type === 'book') book = k.val;
    else if (k.type === 'page') page = k.val;
    else if (k.type === 'ex' && page) {
      for (const n of expandEx(k.val)) {
        const key = book + page + '/' + n;
        if (!seen[key]) { seen[key] = 1; out.push({ book, page, ex: String(n) }); }
      }
    }
  }
  return out;
}

function expandEx(s) {
  const out = [];
  for (const part of s.split(/\s*(?:,|и)\s*/)) {
    const m = part.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m) for (let i = +m[1]; i <= +m[2] && i - +m[1] < 15; i++) out.push(i);
    else if (/^\d+$/.test(part.trim())) out.push(+part.trim());
  }
  return out;
}


// Ближайший урок после сегодня: вторник, четверг, суббота.
const nextLesson = async () => nextLessonOf(await getCfg());

async function pullBot() {
  const token = await S.getMeta('tgToken');
  if (!token || !navigator.onLine) return 0;
  const api = (m, p) => fetch(`https://api.telegram.org/bot${token}/${m}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
  }).then(r => r.json());
  let up;
  try { up = await api('getUpdates', { offset: await S.getMeta('tgOffset', 0), timeout: 0, allowed_updates: ['message'] }); }
  catch { return 0; }
  if (!up.ok) return 0;
  let owner = await S.getMeta('tgOwner');
  let added = 0;
  for (const u of up.result) {
    await S.setMeta('tgOffset', u.update_id + 1);
    const m = u.message;
    if (!m) continue;
    const chat = String(m.chat.id);
    if (!owner) { owner = chat; await S.setMeta('tgOwner', owner); }
    if (chat !== owner) continue;
    const text = m.text || m.caption || '';
    if (/^\/start/.test(text)) {
      api('sendMessage', { chat_id: chat, text: 'Привет! Пересылай мне домашку от Юли — добавлю её в «Домашку» приложения 📝' });
      continue;
    }
    const found = parseHw(text);
    if (!found.length) {
      api('sendMessage', { chat_id: chat, text: 'Не нашла тут домашку 🤔 Понимаю так: «РТ стр. 76 упр. 1, 2» или «Уч стр. 120 упр. 3»' });
      continue;
    }
    const have = await S.listHw();
    const fresh = found.filter(f => !have.some(h => h.status !== 'done' && h.book === f.book && String(h.page) === f.page && String(h.ex) === f.ex));
    for (const f of fresh) await S.addHw({ ...f, lesson: nextLesson() });
    added += fresh.length;
    api('sendMessage', {
      chat_id: chat,
      text: fresh.length
        ? ['Добавила в «Домашку» ✅', ...fresh.map(f => `${f.book} стр. ${f.page} упр. ${f.ex}`)].join('\n')
        : 'Это уже есть в «Домашке» 👌',
    });
  }
  return added;
}

// Подсказка только про те цвета, что есть в списке.
const HINT = { green: '🟢 легко — можно делать уставшей', yellow: '🟡 средне — не на совсем уставшую голову', red: '🔴 сложно — лучше на свежую голову' };
function legend(list) {
  const have = new Set(list.filter(h => h.content).map(h => h.difficulty || defaultDifficulty(h.content)));
  return ['green', 'yellow', 'red'].filter(k => have.has(k)).map(k => HINT[k]).join('<br>');
}

// ---------- Список ДЗ ----------

export async function hwList() {
  const fromBot = await pullBot();
  if (fromBot) toast(`Из бота: +${fromBot} ДЗ 📥`);
  const factor = await S.getMeta('hwFactor', 1);
  const all = await S.listHw();
  const todo = all.filter(h => h.status !== 'done').sort((a, b) => (a.lesson || '').localeCompare(b.lesson || '') || a.createdAt - b.createdAt);
  const done = all.filter(h => h.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 10);
  const mins = h => h.minutes || (h.content ? estimate(h.content, factor) : 0);
  const total = todo.reduce((a, h) => a + mins(h), 0);

  const card = h => {
    const c = h.content;
    const diff = h.difficulty || (c ? defaultDifficulty(c) : null);
    return `<a class="deck hw" href="#/hw/${h.id}">
      <div class="deck-head"><span class="deck-name">${esc(title(h))}</span>
        <span>${c ? `⏱ ~${mins(h)} мин ${DIFF[diff] || ''}` : (h.book === 'free' ? '✍️' : '⏳')}</span></div>
      <div class="deck-meta">${h.lesson ? `к уроку ${esc(fmtDate(h.lesson))} · ` : ''}${c ? esc(formatOf(c)) : (h.book === 'free' ? (h.tutor?.answer ? '🦊 Claude ответил' : 'своё задание: разбор с Claude') : 'жду содержимого — разложу упражнение по кнопкам')}</div>
      ${h.status === 'done' ? `<div class="deck-meta">✅ ${h.result ? `${h.result.right} из ${h.result.total}` : 'сделано'}</div>` : ''}
    </a>`;
  };

  $app.innerHTML = `
    <header class="top"><h1 class="fh"><img src="icons/fox-hw.png" alt="">Домашка</h1></header>
    ${todo.length ? `<p class="muted">Осталось ${todo.length} · итого <b>⏱ ~${total} мин</b><br>${legend(todo)}</p>`
      : '<div class="empty">Всё сделано 🎉</div>'}
    <div class="decks">${todo.map(card).join('')}</div>
    <button class="btn primary wide" id="add">➕ Добавить ДЗ</button>
    ${done.length ? `<h2 class="sub">Сделано</h2><div class="decks done">${done.map(card).join('')}</div>` : ''}`;
  $app.querySelector('#add').onclick = addDialog;
}

async function addDialog() {
  const d = document.createElement('dialog');
  d.className = 'dlg';
  const today = await nextLesson();
  d.innerHTML = `<form method="dialog">
    <h3>Новое ДЗ</h3>
    <div class="seg book three"><button type="button" data-b="РТ" class="on">📒 РТ</button><button type="button" data-b="Уч">📘 Учебник</button><button type="button" data-b="free">✍️ Своё</button></div>
    <div class="bookonly"><label>Страница<input name="page" inputmode="numeric"></label>
    <label>Упражнения (можно несколько: 1, 3)<input name="ex"></label></div>
    <label class="freeonly hidden">Что задано (например: разобрать видео)<input name="title"></label>
    <label>К уроку<input name="lesson" type="date" value="${today}"></label>
    <div class="row rev"><button value="ok" class="btn primary">Добавить</button><button value="cancel" class="btn ghost" formnovalidate>Отмена</button></div>
  </form>`;
  document.body.append(d);
  let book = 'РТ';
  d.querySelectorAll('[data-b]').forEach(b => b.onclick = () => {
    book = b.dataset.b;
    d.querySelectorAll('[data-b]').forEach(x => x.classList.toggle('on', x === b));
    d.querySelector('.bookonly').classList.toggle('hidden', book === 'free');
    d.querySelector('.freeonly').classList.toggle('hidden', book !== 'free');
  });
  d.addEventListener('close', async () => {
    const f = d.querySelector('form');
    if (d.returnValue === 'ok' && book === 'free') {
      const h = await S.addHw({ book: 'free', page: '', ex: '', lesson: f.lesson.value });
      h.title = f.title.value.trim() || 'Своё задание';
      await S.saveHw(h);
      hwList();
    } else if (d.returnValue === 'ok' && f.page.value.trim() && f.ex.value.trim()) {
      const exs = f.ex.value.split(/[,\s]+/).filter(Boolean);
      for (const ex of exs) await S.addHw({ book, page: f.page.value.trim(), ex, lesson: f.lesson.value });
      toast(`Добавлено: ${exs.length}. Разложу по кнопкам ⏳`);
      hwList();
    }
    d.remove();
  });
  d.showModal();
}

// ---------- Упражнение ----------

export async function hwRun(id) {
  const h = await S.getHw(id);
  if (!h) { location.hash = '#/hw'; return; }
  const back = '#/hw';
  const c = h.content;
  const factor = await S.getMeta('hwFactor', 1);

  if (h.book === 'free') return freeRun(h);
  if (!c) {
    $app.innerHTML = `
      <header class="top"><a class="back" href="${back}">‹</a><h1 class="grow">${esc(title(h))}</h1><button class="icon" id="del">🗑</button></header>
      <div class="empty">⏳ Упражнение ещё не разложено по кнопкам.<br>Как только будет готово, оно появится здесь само.</div>
      ${h.status === 'done' ? '<p class="center">✅ Сделано</p>' : '<button class="btn primary wide" id="manual">✓ Сделала (в тетради, видео…)</button>'}`;
    bindDelete(h);
    bindManual(h);
    return;
  }

  const slots = slotsOf(c);
  const answers = h.answers || [];
  const checked = h.status === 'done' && !!h.result; // отмеченное «✓ Сделала» без проверки — открываем как обычное упражнение
  const manualDone = h.status === 'done' && !h.result;
  const mins = h.minutes || estimate(c, factor);
  const diff = h.difficulty || defaultDifficulty(c);

  // Виджет одного места выбора.
  const widget = i => {
    const s = slots[i], v = answers[i] ?? '';
    const st = checked ? (norm(v) === norm(c.answers[i]) ? ' ok' : ' bad') : '';
    if (s.kind === 'inline') {
      return `<span class="slot${st}" data-s="${i}">${s.opts.map(o =>
        `<button type="button" class="ch${norm(v) === norm(o) ? ' sel' : ''}" data-s="${i}" data-v="${esc(o)}"${checked ? ' disabled' : ''}>${esc(o)}</button>`).join('')}</span>`;
    }
    if (s.kind === 'list') {
      return `<select class="slot${st}" data-s="${i}"${checked ? ' disabled' : ''}><option value="">…</option>${(c.words || []).map(w =>
        `<option${norm(v) === norm(w) ? ' selected' : ''}>${esc(w)}</option>`).join('')}<option value="не знаю"${v === 'не знаю' ? ' selected' : ''}>🤷 не знаю</option></select>`;
    }
    if (s.kind === 'letter' || s.kind === 'write') {
      const rest = v.toLowerCase().startsWith(s.start.toLowerCase()) ? v.slice(s.start.length) : '';
      return `<span class="slot letter${st}" data-s="${i}">${s.start ? `<b>${esc(s.start)}</b>` : ''}<input data-s="${i}" value="${esc(rest)}" autocapitalize="off" autocorrect="off" spellcheck="false"${checked ? ' disabled' : ''}></span>`;
    }
    return `<span class="slot${st}" data-s="${i}">${s.opts.map((o, k) =>
      `<button type="button" class="ch${norm(v) === norm(o) ? ' sel' : ''}" data-s="${i}" data-v="${esc(o)}"${checked ? ' disabled' : ''}>${'abcd'[k]} ${esc(o)}</button>`).join('')}</span>`;
  };
  const fix = i => (checked && norm(answers[i]) !== norm(c.answers[i]) ? `<span class="fix">→ ${esc(c.answers[i])}</span>` : '');

  const render = () => {
    let n = 0;
    const abCount = c.type === 'textab' ? (c.choices || []).length : 0;
    const textBlock = c.type === 'textab'
      ? `<div class="flash hwtext">${esc(c.text).replace(/\{(\d+)\}/g, (_, k) => {
          const i = +k - 1, v = answers[i];
          const st = checked ? (norm(v) === norm(c.answers[i]) ? 'good' : 'wrong') : (v ? 'filled' : '');
          return `<span class="gap ${st}">${v ? esc(v) : `___${k}`}</span>`;
        })}</div>
        <div class="ablines">${(c.choices || []).map((_, i) => `<div class="abline"><b>${i + 1}:</b> ${widget(i)} ${fix(i)}</div>`).join('')}</div>`
      : '';
    n = abCount;
    const items = (c.items || []).map((it, k) => {
      const html = esc(it.text).replace(/\{([^{}]*)\}/g, () => { const i = n++; return widget(i) + fix(i); });
      return `<li>${html}</li>`;
    }).join('');

    $app.innerHTML = `
      <header class="top"><a class="back" href="${back}">‹</a><h1 class="grow">${esc(title(h))}</h1><button class="icon" id="del">🗑</button></header>
      <p class="muted">⏱ ~${mins} мин · ${DIFF[diff]} · ${esc(formatOf(c))}${h.lesson ? ` · к уроку ${esc(fmtDate(h.lesson))}` : ''}</p>
      ${manualDone ? '<p class="card">✅ Отмечено, что сделала (в тетради). Можно посмотреть или пройти здесь с проверкой.</p>' : ''}
      ${c.instruction ? `<p class="instr">${esc(c.instruction)}</p>` : ''}
      ${textBlock}
      ${items ? `<ol class="hwitems">${items}</ol>` : ''}
      <p class="warn" id="left"></p>
      ${checked ? afterCheck() : '<button class="btn primary wide" id="check">✅ Проверить</button>'}
      <button class="btn wide" id="copy">📋 Скопировать ответы</button>
      ${checked || manualDone ? '' : '<button class="btn ghost wide" id="manual">✓ Уже сделала (в тетради)</button>'}
      ${checked ? '<button class="btn ghost wide" id="redo">🔄 Пройти заново</button>' : ''}`;
    bind();
  };

  const afterCheck = () => `
    <div class="card result">
      <p class="big-num">✅ ${h.result.right} из ${h.result.total}</p>
      <p class="muted">${h.result.right === h.result.total ? 'Без единой ошибки 🔥' : 'Ошибки уже в тренажёре — в теме «🎯 Тренажёр».'}</p>
      <p><b>Как по времени?</b></p>
      <div class="seg tune">${[['fast', '⚡ Быстрее'], ['ok', '👌 Так'], ['slow', '🐢 Дольше']].map(([k, l]) =>
        `<button data-t="${k}" class="${h.timeTune === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <p><b>Сложность</b></p>
      <div class="seg tune">${Object.entries(DIFF).map(([k, e]) => `<button data-d="${k}" class="${diff === k ? 'on' : ''}">${e}</button>`).join('')}</div>
    </div>`;

  const saveAnswer = async (i, v) => {
    answers[i] = v;
    h.answers = answers;
    await S.saveHw(h);
  };

  const bind = () => {
    bindDelete(h);
    bindManual(h);
    if (!checked) {
      $app.querySelectorAll('button.ch').forEach(b => b.onclick = async () => {
        await saveAnswer(+b.dataset.s, b.dataset.v);
        render();
      });
      $app.querySelectorAll('select.slot').forEach(sel => sel.onchange = () => {
        saveAnswer(+sel.dataset.s, sel.value);
        sel.classList.remove('missing');
      });
      $app.querySelectorAll('.letter input').forEach(inp => inp.oninput = () => {
        const i = +inp.dataset.s;
        saveAnswer(i, inp.value.trim() ? slots[i].start + inp.value.trim() : '');
        inp.parentElement.classList.remove('missing');
      });
      $app.querySelector('#check').onclick = check;
    } else {
      $app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => tune(b.dataset.t));
      $app.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
        h.difficulty = b.dataset.d;
        await S.saveHw(h);
        hwRun(id);
      });
      $app.querySelector('#redo').onclick = async () => {
        h.answers = []; h.status = 'todo'; h.result = null;
        await S.saveHw(h);
        hwRun(id);
      };
    }
    $app.querySelector('#copy').onclick = copyAnswers;
  };

  const check = async () => {
    const missing = slots.map((_, i) => i).filter(i => !String(answers[i] ?? '').trim());
    if (missing.length) {
      missing.forEach(i => $app.querySelectorAll(`.slot[data-s="${i}"]`).forEach(el => el.classList.add('missing')));
      $app.querySelector('#left').textContent = `Осталось выбрать: ${missing.length}`;
      $app.querySelector(`.slot[data-s="${missing[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    let right = 0;
    for (let i = 0; i < slots.length; i++) {
      const ok = norm(answers[i]) === norm(c.answers[i]);
      if (ok) right++;
      else if (slots[i].opts) {
        const it = c.items?.[slots[i].item];
        const hint = it ? it.text.replace(RE, '___') : (c.text || '').slice(0, 80);
        await S.addHard(slots[i].opts.join(' / '), hint);
      }
      await S.logEvent('hw', h.id, ok);
    }
    Object.assign(h, { status: 'done', doneAt: Date.now(), result: { right, total: slots.length }, minutes: mins, difficulty: diff });
    await S.saveHw(h);
    hwRun(id);
  };

  // Поправка времени: формулы подстраиваются под Яну.
  const tune = async t => {
    const k = { fast: 0.85, ok: 1, slow: 1.2 }[t];
    await S.setMeta('hwFactor', Math.min(3, Math.max(0.3, (await S.getMeta('hwFactor', 1)) * k)));
    h.timeTune = t;
    if (t !== 'ok') h.minutes = Math.max(1, Math.round(mins * k));
    await S.saveHw(h);
    toast(t === 'ok' ? 'Отлично, формула попала 👌' : 'Запомнила, следующие оценки подстрою');
    hwRun(id);
  };

  const copyAnswers = async () => {
    const lines = [title(h)];
    let n = 0;
    if (c.type === 'textab') (c.choices || []).forEach((_, i) => { lines.push(`${i + 1}. ${answers[n++] || '—'}`); });
    (c.items || []).forEach((it, k) => {
      const cnt = [...it.text.matchAll(RE)].length;
      const a = [];
      for (let j = 0; j < cnt; j++) a.push(answers[n++] || '—');
      if (cnt) lines.push(`${k + 1}. ${a.join(', ')}`);
    });
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Ответы скопированы 📋'); }
    catch { toast('Не получилось скопировать'); }
  };

  render();
}

// «Своё» задание — диалог с Claude прямо на сайте (h.chat): Яна пишет → Claude на ПК отвечает → Яна отвечает новым сообщением.
let freePoll = null;
function freeRun(h) {
  const t = h.tutor || {};
  // старый вид (заметки + один ответ) превращаем в начало переписки
  if (!h.chat) {
    h.chat = [];
    if (h.notes) h.chat.push({ me: 1, text: h.notes, at: t.at || h.doneAt || Date.now() });
    if (t.answer) h.chat.push({ me: 0, text: t.answer, at: t.at || Date.now() });
  }
  const waiting = t.status === 'new' || t.status === 'work';
  const hm = at => new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  $app.innerHTML = `
    <header class="top"><a class="back" href="#/hw">‹</a><h1 class="grow">${esc(title(h))}</h1><button class="icon" id="del">🗑</button></header>
    ${h.lesson ? `<p class="muted">к уроку ${esc(fmtDate(h.lesson))}</p>` : ''}
    <div class="chat">
      ${h.chat.map(m => `<div class="msg ${m.me ? 'me' : 'cl'}">${m.me ? '' : '<b>🦊 Claude</b>'}<div class="pre">${esc(m.text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div><span class="when">${hm(m.at)}</span></div>`).join('')
        || '<p class="muted center">Напиши, что сделала и что поняла — Claude дополнит и задаст пару вопросов.</p>'}
      ${waiting ? '<div class="msg cl wait">🦊 Claude пишет… (минута-две)</div>' : ''}
    </div>
    <div class="chatin">
      <textarea id="msg" rows="3" placeholder="${h.chat.length ? 'Ответить Claude…' : 'Например: посмотрела видео про Past perfect. Поняла, что…'}">${esc(h.draft || '')}</textarea>
      <button class="btn primary" id="send"${waiting ? ' disabled title="Подожди ответ Claude"' : ''}>Отправить</button>
    </div>
    ${h.status === 'done' ? '' : '<button class="btn ghost wide" id="manual">✓ Сделала (без разбора с Claude)</button>'}`;
  bindDelete(h);
  bindManual(h);
  const box = $app.querySelector('#msg');
  box.oninput = () => { h.draft = box.value; S.saveHw(h); };
  $app.querySelector('#send').onclick = async () => {
    const text = box.value.trim();
    if (!text) { box.focus(); return; }
    h.chat.push({ me: 1, text, at: Date.now() });
    Object.assign(h, { draft: '', status: 'done', doneAt: h.doneAt || Date.now(), minutes: h.minutes || 15,
      tutor: { status: 'new', at: Date.now() } });
    await S.saveHw(h);
    freeRun(h);
  };
  // пока ждём ответ — сверяемся с облаком почаще и перерисовываем, когда ответ пришёл
  clearInterval(freePoll);
  if (waiting) {
    const here = location.hash;
    freePoll = setInterval(async () => {
      if (location.hash !== here) return clearInterval(freePoll);
      await syncNow();
      const nh = await S.getHw(h.id);
      if (nh && (nh.tutor || {}).status === 'done') { clearInterval(freePoll); freeRun(nh); }
    }, 15000);
  }
  $app.querySelector('.chat').lastElementChild?.scrollIntoView({ block: 'end' });
}

// Сделала без приложения: засчитываем (серия, баллы, глава истории), без проверки.
function bindManual(h) {
  const b = $app.querySelector('#manual');
  if (!b) return;
  b.onclick = async () => {
    Object.assign(h, { status: 'done', doneAt: Date.now(), manual: true, result: h.result || null,
      minutes: h.minutes || (h.content ? estimate(h.content) : h.book === 'free' ? 15 : 5) });
    await S.saveHw(h);
    toast('Засчитано ✅ Открылась новая глава 📖');
    location.hash = '#/hw';
  };
}

function bindDelete(h) {
  const b = $app.querySelector('#del');
  if (!b) return;
  b.onclick = async () => {
    if (!confirm(`Удалить «${title(h)}»?`)) return;
    h.deleted = true;
    await S.saveHw(h);
    location.hash = '#/hw';
  };
}
