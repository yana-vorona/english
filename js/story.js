// История-сериал: первая глава открыта сразу, каждая сделанная домашка открывает следующую.
// Главы — app/story/night-library.json; незнакомые слова нажимаются и показывают перевод.
import * as S from './store.js';
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

// Слова из словарика главы превращаем в кнопки (сначала длинные фразы, чтобы «by itself» не разбилось).
function withWords(text, words) {
  let html = esc(text);
  const keys = Object.keys(words || {}).sort((a, b) => b.length - a.length);
  keys.forEach((w, i) => {
    const re = new RegExp(`(^|[^A-Za-z])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![A-Za-z])`, 'i');
    html = html.replace(re, (_, pre, word) => `${pre}<button class="w" data-i="${i}">${word}</button>`);
  });
  return { html: html.replace(/\n/g, '<br><br>'), keys };
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
  const { html, keys } = withWords(ch.text, ch.words);
  $app.innerHTML = `
    <header class="top"><a class="back" href="#/stats">‹</a><h1 class="grow">📖 ${n}. ${esc(ch.title)}</h1></header>
    <article class="flash story">${html}</article>
    <p class="muted center">Нажми на подчёркнутое слово — увидишь перевод.</p>
    <div class="row">
      ${n > 1 ? `<a class="btn" href="#/story/${n - 1}">‹ Глава ${n - 1}</a>` : ''}
      ${n < s.chapters.length ? (n < p.open ? `<a class="btn primary grow" href="#/story/${n + 1}">Глава ${n + 1} ›</a>`
        : `<a class="btn grow" href="#/hw">🔒 Глава ${n + 1} — после следующей домашки</a>`) : '<p class="muted">Новые главы скоро будут ✍️</p>'}
    </div>`;
  $app.querySelectorAll('.w').forEach(b => b.onclick = () => toast(`${keys[+b.dataset.i]} — ${ch.words[keys[+b.dataset.i]]}`));
}
