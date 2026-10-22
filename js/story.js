// История-сериал: первая глава открыта сразу, каждая сделанная домашка открывает следующую.
// Главы — app/story/night-library.json; незнакомые слова нажимаются и показывают перевод.
import * as S from './store.js';
import * as db from './db.js';
import { esc, toast } from './ui.js';

const $app = document.getElementById('app');
const FILE = 'story/night-library.json';
let cache = null;

async function story() {
  if (!cache) cache = await (await fetch(FILE, { cache: 'no-cache' })).json();
  return cache;
}

export async function storyProgress() {
  const s = await story();
  const done = (await S.listHw()).filter(h => h.status === 'done').length;
  return { title: s.title, total: s.chapters.length, open: Math.min(s.chapters.length, 1 + done) };
}

export async function storyCard() {
  try {
    const p = await storyProgress();
    return `<a class="card story-card" href="#/story/${p.open}">
      <h2>📖 ${esc(p.title)}</h2>
      <p class="muted">Открыто глав: ${p.open} из ${p.total}. Каждая сделанная домашка открывает следующую.</p>
    </a>`;
  } catch { return ''; }
}

// Абзац → предложения. Внутри кавычек не режем, и «"I saw the thief!" it says» — одно предложение.
function sentences(par) {
  const t = par.match(/\S+\s*/g) || [];
  const out = [];
  let cur = '', q = 0;
  t.forEach((tok, i) => {
    cur += tok; q += (tok.match(/"/g) || []).length;
    const next = t[i + 1];
    if (q % 2 === 0 && /[.!?…]"?\s*$/.test(tok) && (!next || /^["A-Z]/.test(next))) { out.push(cur.trim()); cur = ''; q = 0; }
  });
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Слова из словарика главы превращаем в кнопки (сначала длинные фразы, чтобы «by itself» не разбилось),
// в конце каждого предложения — кнопка «ru» с переводом предложения (ch.tr: по абзацам, по предложениям).
function withWords(text, words, tr) {
  const keys = Object.keys(words || {}).sort((a, b) => b.length - a.length);
  const used = new Set();
  const mark = s => {
    let h = esc(s);
    keys.forEach((w, i) => {
      if (used.has(i)) return;
      const re = new RegExp(`(^|[^A-Za-z])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![A-Za-z])`, 'i');
      h = h.replace(re, (_, pre, word) => { used.add(i); return `${pre}<button class="w" data-i="${i}">${word}</button>`; });
    });
    return h;
  };
  const ru = r => `<button class="tr" title="Перевод предложения">ru</button><span class="ru" hidden>${esc(r)}</span>`;
  const html = text.split('\n').map((p, pi) => {
    const ss = sentences(p), rr = (tr || [])[pi] || [];
    const each = rr.length === ss.length;   // не совпало число предложений — один перевод на весь абзац
    return `<p>${ss.map((s, si) => mark(s) + (each ? ru(rr[si]) : '')).join(' ')}${!each && rr.length ? ru(rr.join(' ')) : ''}</p>`;
  }).join('');
  return { html, keys };
}

export async function storyView(n) {
  const s = await story();
  const p = await storyProgress();
  n = Math.max(1, Math.min(+n || p.open, s.chapters.length));
  const ch = s.chapters[n - 1];
  if (n > p.open) {
    $app.innerHTML = `
      <header class="top"><a class="back" href="#/stats">‹</a><h1 class="grow">📖 Глава ${n}</h1></header>
      <div class="empty">🔒 Глава ${n} откроется, когда сделаешь следующую домашку.<br>Интересно, что будет дальше? 😉</div>
      <a class="btn primary wide" href="#/hw">📝 К домашке</a>`;
    return;
  }
  const { html, keys } = withWords(ch.text, ch.words, ch.tr);
  // «Прочитала» — событие 'read' в журнал: кормит питомца (2 новые главы — бонусы) и идёт в статистику. Раз в день на главу.
  const id = 'ch' + n, today = new Date().setHours(0, 0, 0, 0);
  const reads = (await db.getAll('events')).filter(e => e.type === 'read' && e.cardId === id);
  const readToday = reads.some(e => e.at >= today);
  $app.innerHTML = `
    <header class="top"><a class="back" href="#/stats">‹</a><h1 class="grow">📖 ${n}. ${esc(ch.title)}</h1></header>
    <article class="flash story">${html}</article>
    <p class="muted center">Подчёркнутое слово — перевод слова. «ru» в конце — перевод всего предложения.</p>
    <button class="btn wide${readToday ? '' : ' primary'}" id="readDone"${readToday ? ' disabled' : ''}>${readToday ? '✓ Сегодня прочитано — питомец сыт 🐾' : '✓ Прочитала главу'}</button>
    <div class="row">
      ${n > 1 ? `<a class="btn" href="#/story/${n - 1}">‹ Глава ${n - 1}</a>` : ''}
      ${n < s.chapters.length ? (n < p.open ? `<a class="btn primary grow" href="#/story/${n + 1}">Глава ${n + 1} ›</a>`
        : `<a class="btn grow" href="#/hw">🔒 Глава ${n + 1} — после следующей домашки</a>`) : '<p class="muted">Новые главы скоро будут ✍️</p>'}
    </div>`;
  $app.querySelector('#readDone').onclick = async e => {
    const b = e.currentTarget;
    b.disabled = true;
    await S.logEvent('read', id, true);
    b.classList.remove('primary');
    b.textContent = '✓ Сегодня прочитано — питомец сыт 🐾';
    toast('Глава засчитана 🐾 Каждые 2 прочитанные главы — 2 🍪 питомцу');
  };
  $app.querySelectorAll('.w').forEach(b => b.onclick = () => toast(`${keys[+b.dataset.i]} — ${ch.words[keys[+b.dataset.i]]}`));
  $app.querySelectorAll('.tr').forEach(b => b.onclick = () => {
    const r = b.nextElementSibling;
    r.hidden = !r.hidden;
    b.classList.toggle('on', !r.hidden);
  });
}
