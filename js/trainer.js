// Тренажёр: подсказка по-русски, предложение с пропуском, варианты кнопками.
// Ошибка или 🔵 → в конец ещё пример с той же парой (🔁), пара уходит в повторение по коробкам.
// Наборы — файлы sets/*.json (список в sets/index.json), формат описан в README.
import * as S from './store.js';
import { esc, plural } from './ui.js';

const $app = document.getElementById('app');

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const pairOf = it => it.pair || it.answer;

// ---------- Список наборов ----------

export async function trainerList() {
  let sets = [];
  try { sets = await getJSON('sets/index.json'); } catch {}
  const topics = await S.listTopics();
  $app.innerHTML = `
    <header class="top"><h1 class="fh"><img src="icons/fox-trainer.png" alt="">Тренажёр</h1></header>
    <section class="card">
      <h2>✍️ Что хочу подтянуть</h2>
      <p class="muted">Напиши своими словами, например «путаю Past simple и Present perfect» или «когда ставить the». Claude придумает упражнения, через пару минут они появятся здесь.</p>
      <div class="fxadd"><input id="ttnew" placeholder="Что подтянуть…"><button class="talkBtn" id="ttadd">Добавить</button></div>
    </section>
    <div class="decks">${topics.map(t => t.set ? `
      <a class="deck" href="#/trainer/${encodeURIComponent(t.id)}">
        <div class="deck-head"><span class="deck-name">${esc(t.set.title || t.text)}</span><button class="icon" data-ttdel="${esc(t.id)}" title="убрать">✕</button></div>
        <div class="deck-meta">✍️ моя тема · ${(t.set.items || []).length} ${plural((t.set.items || []).length, 'вопрос', 'вопроса', 'вопросов')}</div>
      </a>` : `
      <div class="deck"><div class="deck-head"><span class="deck-name">${esc(t.text)}</span><button class="icon" data-ttdel="${esc(t.id)}" title="убрать">✕</button></div>
        <div class="deck-meta">⏳ Claude готовит упражнения…</div></div>`).join('')}
    ${sets.map(s => `
      <a class="deck" href="#/trainer/${encodeURIComponent(s.file)}">
        <div class="deck-head"><span class="deck-name">${esc(s.title)}</span></div>
      </a>`).join('')}</div>
    <p class="muted">Ошибки и «🔵 не уверена» сами попадают в тему «🎯 Тренажёр» и приходят на повторение. Твои темы идут и в мини-задания, если урок отменили.</p>`;
  const add = async () => {
    const inp = $app.querySelector('#ttnew'), text = inp.value.trim();
    if (!text) { inp.focus(); return; }
    await S.setMeta('tt:' + S.uid(), { text, status: 'new', at: Date.now() });
    trainerList();
  };
  $app.querySelector('#ttadd').onclick = add;
  $app.querySelector('#ttnew').onkeydown = e => { if (e.key === 'Enter') add(); };
  $app.querySelectorAll('[data-ttdel]').forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    const t = topics.find(x => x.id === b.dataset.ttdel);
    const { id, ...v } = t;
    await S.setMeta(id, { ...v, deleted: Date.now() });
    trainerList();
  });
}

// ---------- Раунд ----------

export async function trainerRun(file, onlyPairs = null) {
  const back = '#/trainer';
  let set;
  const name = decodeURIComponent(file);
  try { set = name.startsWith('tt:') ? (await S.getMeta(name)).set : await getJSON('sets/' + name); if (!set) throw 0; }
  catch { $app.innerHTML = `<div class="empty">Не получилось открыть набор 😕</div><a class="btn wide" href="${back}">Назад</a>`; return; }

  const byPair = new Map();
  for (const it of set.items || []) {
    const p = pairOf(it);
    if (!byPair.has(p)) byPair.set(p, []);
    byPair.get(p).push(it);
  }
  const used = new Map();
  // Берём ещё не показанное предложение этой пары; кончились — по новому кругу.
  const take = p => {
    const list = byPair.get(p);
    const u = used.get(p) || new Set();
    used.set(p, u);
    let free = list.filter((_, i) => !u.has(i));
    if (!free.length) { u.clear(); free = list; }
    const it = free[Math.floor(Math.random() * free.length)];
    u.add(list.indexOf(it));
    return it;
  };

  const pairs = (onlyPairs || [...byPair.keys()]).filter(p => byPair.has(p));
  const queue = shuffle(pairs).map(p => ({ p, it: take(p), again: false }));
  const hard = new Map(); // пара → подсказка
  let bad = 0, blue = 0, done = 0;

  const markHard = async (p, it) => {
    hard.set(p, it.hint || '');
    await S.addHard(p, it.hint);
  };

  const next = () => {
    if (!queue.length) return finish();
    const cur = queue.shift();
    const { it, p } = cur;
    const [before, after = ''] = it.sentence.split('___');
    $app.innerHTML = `
      <header class="top study-top">
        <a class="back close" href="${back}" aria-label="Закрыть">✕</a>
        <div class="grow bar"><i style="width:${Math.round(done / (done + queue.length + 1) * 100)}%"></i></div>
        <span class="counters">❌ ${bad} 🔵 ${blue}</span>
      </header>
      <div class="hintbox">${cur.again ? '<span class="badge box">🔁</span> ' : ''}${esc(it.hint || '')}</div>
      <div class="flash sentence">${esc(before)}<span class="gap" id="gap">___</span>${esc(after)}</div>
      <div class="opts">${shuffle(it.options).map(o => `<button class="opt">${esc(o)}</button>`).join('')}</div>
      <div id="after"></div>`;
    let answered = false;
    $app.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
      if (answered) return;
      answered = true;
      const right = b.textContent === it.answer;
      $app.querySelectorAll('.opt').forEach(x => { if (x.textContent === it.answer) x.classList.add('ok'); });
      const gap = $app.querySelector('#gap');
      gap.textContent = it.answer;
      gap.classList.add('good');
      done++;
      if (!right) {
        b.classList.add('bad');
        bad++;
        queue.push({ p, it: take(p), again: true });
        markHard(p, it);
      }
      const counters = () => { $app.querySelector('.counters').textContent = `❌ ${bad} 🔵 ${blue}`; };
      counters();
      S.logEvent('trainer', p, right);
      const after = $app.querySelector('#after');
      after.innerHTML = `
        ${it.rule ? `<p class="rule">💡 ${esc(it.rule)}</p>` : ''}
        <div class="row">
          ${right ? '<button class="btn blue" id="blue" aria-label="Не уверена, дай ещё пример">🔵</button>' : ''}
          <button class="btn primary grow" id="nx">Дальше</button>
        </div>`;
      after.querySelector('#nx').onclick = next;
      after.querySelector('#nx').focus();
      after.querySelector('#blue')?.addEventListener('click', () => {
        blue++;
        queue.push({ p, it: take(p), again: true });
        markHard(p, it);
        next();
      });
    });
  };

  const finish = () => {
    const list = [...hard.entries()];
    $app.innerHTML = `
      <header class="top study-top"><a class="back close" href="${back}" aria-label="Закрыть">✕</a><h2 class="grow">🎉 Раунд готов!</h2></header>
      <div class="done-box">
        <p class="big-num">❌ ${bad} &nbsp; 🔵 ${blue}</p>
        <p>${list.length ? `${list.length} ${plural(list.length, 'трудная пара', 'трудные пары', 'трудных пар')} — уже в повторении (тема «🎯 Тренажёр»).` : 'Ни одной трудной пары 🔥'}</p>
        ${list.length ? `<ul class="done-list">${list.map(([p, h]) => `<li><b>${esc(p)}</b>${h ? ` — ${esc(h)}` : ''}</li>`).join('')}</ul>` : ''}
      </div>
      ${list.length ? '<button class="btn primary wide" id="again">🔁 Повторить трудные</button>' : ''}
      <a class="btn wide" href="${back}">К наборам</a>`;
    $app.querySelector('#again')?.addEventListener('click', () => trainerRun(file, list.map(([p]) => p)));
  };

  next();
}
