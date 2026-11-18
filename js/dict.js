// 📖 Словарик в свободном месте слева (Яна 18.11: «важно, чтобы показывал транскрипцию и формы глаголов»).
// Перевод - Google (варианты по частям речи), транскрипция - сначала из её карточек, потом dictionaryapi.dev (британская),
// формы глагола - свой список неправильных глаголов, у правильных - по правилам (+ed).
import * as S from './store.js';
import { esc } from './ui.js';
import { say } from './study.js';

const IRR = `arise arose arisen|awake awoke awoken|be was/were been|bear bore born|beat beat beaten|become became become|begin began begun|bend bent bent|bet bet bet|bind bound bound|bite bit bitten|bleed bled bled|blow blew blown|break broke broken|breed bred bred|bring brought brought|broadcast broadcast broadcast|build built built|burn burnt/burned burnt/burned|burst burst burst|buy bought bought|catch caught caught|choose chose chosen|cling clung clung|come came come|cost cost cost|creep crept crept|cut cut cut|deal dealt dealt|dig dug dug|do did done|draw drew drawn|dream dreamt/dreamed dreamt/dreamed|drink drank drunk|drive drove driven|eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found|flee fled fled|fly flew flown|forbid forbade forbidden|forecast forecast forecast|forget forgot forgotten|forgive forgave forgiven|freeze froze frozen|get got got|give gave given|go went gone|grind ground ground|grow grew grown|hang hung hung|have had had|hear heard heard|hide hid hidden|hit hit hit|hold held held|hurt hurt hurt|keep kept kept|kneel knelt knelt|know knew known|lay laid laid|lead led led|lean leant/leaned leant/leaned|leap leapt/leaped leapt/leaped|learn learnt/learned learnt/learned|leave left left|lend lent lent|let let let|lie lay lain|light lit lit|lose lost lost|make made made|mean meant meant|meet met met|mistake mistook mistaken|overcome overcame overcome|pay paid paid|prove proved proven/proved|put put put|quit quit quit|read read read|rid rid rid|ride rode ridden|ring rang rung|rise rose risen|run ran run|saw sawed sawn|say said said|see saw seen|seek sought sought|sell sold sold|send sent sent|set set set|sew sewed sewn|shake shook shaken|shine shone shone|shoot shot shot|show showed shown|shrink shrank shrunk|shut shut shut|sing sang sung|sink sank sunk|sit sat sat|sleep slept slept|slide slid slid|smell smelt/smelled smelt/smelled|speak spoke spoken|speed sped sped|spell spelt/spelled spelt/spelled|spend spent spent|spill spilt/spilled spilt/spilled|spin spun spun|spit spat spat|split split split|spoil spoilt/spoiled spoilt/spoiled|spread spread spread|spring sprang sprung|stand stood stood|steal stole stolen|stick stuck stuck|sting stung stung|stink stank stunk|strike struck struck|strive strove striven|swear swore sworn|sweep swept swept|swell swelled swollen|swim swam swum|swing swung swung|take took taken|teach taught taught|tear tore torn|tell told told|think thought thought|throw threw thrown|tread trod trodden|understand understood understood|undertake undertook undertaken|upset upset upset|wake woke woken|wear wore worn|weave wove woven|weep wept wept|win won won|wind wound wound|withdraw withdrew withdrawn|write wrote written|rediscover rediscovered rediscovered`;
const IRREG = Object.fromEntries(IRR.split('|').map(l => { const [a, b, c] = l.split(' '); return [a, [b, c]]; }));
delete IRREG.rediscover;
// «went», «taken» → начальная форма (чтобы и по второй/третьей форме показывать все три)
const BASE = {};
for (const [a, [b, c]] of Object.entries(IRREG)) for (const x of [...b.split('/'), ...c.split('/')]) if (x !== a && !BASE[x]) BASE[x] = a;

// правильный глагол: stop → stopped, try → tried, like → liked, travel → travelled (брит.)
function ed(v) {
  if (/e$/.test(v)) return v + 'd';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
  if (/(?:^|[^aeiou])[aeiou][bdgklmnprt]$/.test(v) && (v.length <= 4 || /el$/.test(v))) return v + v.slice(-1) + 'ed';
  return v + 'ed';
}
function ing(v) {
  if (/ie$/.test(v)) return v.slice(0, -2) + 'ying';
  if (/[^e]e$/.test(v) && v !== 'be') return v.slice(0, -1) + 'ing';
  if (/(?:^|[^aeiou])[aeiou][bdgklmnprt]$/.test(v) && (v.length <= 4 || /el$/.test(v))) return v + v.slice(-1) + 'ing';
  return v + 'ing';
}
function forms(v) {
  let w = v.replace(/^to\s+/, '');
  w = IRREG[w] ? w : (BASE[w] || w);
  if (/\s/.test(w)) return null;
  const [p, pp] = IRREG[w] || [ed(w), ed(w)];
  return { v1: w, v2: p, v3: pp, ing: ing(w), irr: !!IRREG[w] };
}

const cache = new Map();
async function lookup(q) {
  q = q.trim();
  if (cache.has(q)) return cache.get(q);
  const ru = /[а-яё]/i.test(q);
  const g = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&hl=en&sl=${ru ? 'ru' : 'en'}&tl=${ru ? 'en' : 'ru'}&dt=t&dt=bd&q=${encodeURIComponent(q)}`)
    .then(r => r.json()).catch(() => null);
  const en = (ru ? (g?.[0]?.[0]?.[0] || '') : q).toLowerCase().replace(/[.!?]$/, '');
  const parts = !ru && Array.isArray(g?.[1]) ? g[1].map(p => ({ pos: p[0], ru: p[1].slice(0, 5) })) : [];
  const main = ru ? q : (g?.[0]?.[0]?.[0] || '');
  // транскрипция: своя карточка → словарь (британская, если есть)
  const cards = await S.allCards().catch(() => []);
  const mine = cards.find(c => !c.deleted && c.en && c.en.toLowerCase().replace(/^to\s+/, '') === en.replace(/^to\s+/, ''));
  let tr = mine?.tr || '';
  let pos = parts.map(p => p.pos);
  if (en && !/\s/.test(en)) {
    const d = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(en)}`).then(r => r.ok ? r.json() : null).catch(() => null);
    if (d && !tr) {
      const ph = d.flatMap(e => e.phonetics || []).filter(p => p.text);
      tr = (ph.find(p => /-uk\.mp3$/.test(p.audio || '')) || ph[0] || {}).text || d[0]?.phonetic || '';
    }
    if (d && !pos.length) pos = [...new Set(d.flatMap(e => (e.meanings || []).map(m => m.partOfSpeech)))];
  }
  const verb = pos.includes('verb') || /^to\s/.test(en) || !!BASE[en];
  const res = { q, en, main, parts, tr, mineRu: mine?.ru, f: verb ? forms(en) : null };
  cache.set(q, res);
  return res;
}

const POS = { verb: 'глагол', noun: 'сущ.', adjective: 'прил.', adverb: 'нареч.', preposition: 'предлог', pronoun: 'местоим.', conjunction: 'союз', interjection: 'межд.', phrase: 'фраза' };

function view(r) {
  if (!r.en) return '<div class="dict-empty">Не нашла 🤔</div>';
  const f = r.f;
  return `
    <div class="dict-w"><b>${esc(r.en)}</b> <button type="button" class="icon dict-say" data-say="${esc(r.en)}" aria-label="Произнести">🔊</button></div>
    ${r.tr ? `<div class="dict-tr">${esc(r.tr.startsWith('/') || r.tr.startsWith('[') ? r.tr : '/' + r.tr + '/')}</div>` : ''}
    ${f ? `<div class="dict-f${f.irr ? ' irr' : ''}">${esc(f.v1)} – ${esc(f.v2)} – ${esc(f.v3)}<small>${f.irr ? 'неправильный' : 'правильный'} · ${esc(f.ing)}</small></div>` : ''}
    <div class="dict-ru">${esc(r.main)}</div>
    ${r.mineRu && r.mineRu !== r.main ? `<div class="dict-mine">в твоих словах: ${esc(r.mineRu)}</div>` : ''}
    ${r.parts.map(p => `<div class="dict-p"><i>${esc(POS[p.pos] || p.pos)}</i> ${esc(p.ru.join(', '))}</div>`).join('')}`;
}

// поиск + результат внутри box (стикер или страница «Словарик»)
function bind(box) {
  const inp = box.querySelector('.dictq'), out = box.querySelector('.dictr');
  let t = 0, n = 0;
  const go = async () => {
    const q = inp.value.trim();
    if (!q) { out.innerHTML = ''; return; }
    const my = ++n;
    out.innerHTML = '<div class="dict-empty">ищу…</div>';
    const r = await lookup(q).catch(() => null);
    if (my === n) out.innerHTML = r ? view(r) : '<div class="dict-empty">нет интернета 😕</div>';
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 450); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(t); go(); } });
  out.addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) say(b.dataset.say); });
  return { inp, go };
}
const FORM = `<input class="dictq" placeholder="слово по-английски или по-русски" autocapitalize="off" autocorrect="off" spellcheck="false"><div class="dictr"></div>`;
const wide = matchMedia('(min-width: 1001px)');
const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };

// Стикер: на ПК - открыт, таскается за заголовок (место запоминается); на телефоне - свёрнут, как «Фиксить»:
// щелчок по «📖 Словарик» разворачивает, «Раздел» открывает отдельную страницу (Яна 18.11).
export function mountDict() {
  const box = document.createElement('section');
  box.className = 'dict';
  box.innerHTML = `<div class="dict-h" title="на ПК - потяни, чтобы переставить">📖 Словарик</div><div class="dict-body">${FORM}
    <button type="button" class="talkBtn dict-go">📋 Раздел</button></div>`;
  document.body.appendChild(box);
  bind(box);
  const head = box.querySelector('.dict-h');
  box.querySelector('.dict-go').onclick = () => { box.classList.remove('open'); location.hash = '#/dict'; };
  const place = () => {
    const p = ls('dictPos');
    if (wide.matches && p) {
      const x = Math.min(Math.max(0, p.x), innerWidth - 120), y = Math.min(Math.max(0, p.y), innerHeight - 50);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', bottom: 'auto' });
    } else box.removeAttribute('style');
  };
  place();
  addEventListener('resize', place);
  wide.addEventListener?.('change', place);
  let drag = null, moved = false;
  head.addEventListener('pointerdown', e => {
    if (!wide.matches) return;
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; moved = false;
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', e => {
    if (!drag) return;
    moved = true;
    const x = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - 120), y = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - 50);
    Object.assign(box.style, { left: x + 'px', top: y + 'px', bottom: 'auto' });
  });
  head.addEventListener('pointerup', () => {
    if (drag && moved) { const r = box.getBoundingClientRect(); ls('dictPos', { x: r.left, y: r.top }); }
    drag = null;
  });
  head.addEventListener('click', () => { if (!wide.matches) { box.classList.toggle('open'); if (box.classList.contains('open')) box.querySelector('.dictq').focus(); } });
}

// Отдельная страница «Словарик» (#/dict)
export function dictView() {
  const app = document.getElementById('app');
  app.innerHTML = `<header class="top"><a class="back" href="#/">‹</a><h1>📖 Словарик</h1></header><section class="dict-page">${FORM}</section>`;
  const { inp } = bind(app.querySelector('.dict-page'));
  const q = document.querySelector('.dict .dictq')?.value;
  if (q) { inp.value = q; inp.dispatchEvent(new Event('input')); }
  inp.focus();
}
