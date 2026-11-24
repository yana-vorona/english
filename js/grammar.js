// Правила-подсказки (Яна 24.11: «тема в задании — синяя подчёркнутая ссылка, нажала — вышло правило, не всегда показывать»).
// Тема ищется в тексте задания; правило — по Language bank учебника. Новые правила — добавлять в RULES (длинные названия выше коротких).
import { esc } from './ui.js';

const RULES = [
  { id: 'ppp', re: /present perfect passive|present perfect (в )?(страдательн|пассив)\S*/i, title: 'Present perfect passive', html: `<p class="muted">Учебник, Grammar Reference, стр. 141 (9.4)</p>
<p>Действие <b>уже случилось</b> к сейчас, и важно не <i>кто</i> сделал, а <i>что</i> с предметом произошло.</p>
<div class="f">has / have + been + 3-я форма глагола</div>
<p>has — для одного (it, he, she, the car), have — для многих (they, the plans).</p>
<ul>
<li>✅ <b class="en">The room has been tidied.</b> — Комнату убрали.</li>
<li>❌ <b class="en">The room hasn't been tidied.</b> — Комнату не убрали.</li>
<li>❓ <b class="en">Has the room been tidied?</b> — <b class="en">Yes, it has. / No, it hasn't.</b></li>
</ul>
<p>Пример из ДЗ: <b class="en">Our car has been stolen.</b> — Нашу машину угнали.</p>
<p>С <b class="en">ever</b>: <b class="en">Have you ever been bitten by a mosquito?</b> — ever ставим между has/have и been.</p>
<p>3-я форма: у правильных глаголов +ed (painted), у неправильных — третья колонка (stolen, built, sold). Все — в теме «Неправильные глаголы».</p>` },
  { id: 'fp', re: /future passive|will passive/i, title: 'Future passive (will)', html: `<p class="muted">Учебник, Grammar Reference, стр. 141 (9.5)</p>
<p>То, что <b>будет сделано</b> в будущем.</p>
<div class="f">will / won't + be + 3-я форма глагола</div>
<ul>
<li>✅ <b class="en">Teachers will be replaced by robots.</b> — Учителей заменят роботы.</li>
<li>❌ <b class="en">Teachers won't be replaced by robots.</b></li>
<li>❓ <b class="en">Will teachers be replaced by robots?</b> — <b class="en">Yes, they will. / No, they won't.</b></li>
</ul>
<p>Форма одна для всех: will be — и с it, и с they.</p>` },
  { id: 'pass', re: /\bpassive\b|страдательн\S* залог\S*/i, title: 'Passive — страдательный залог', html: `<p class="muted">Учебник, Grammar Reference, стр. 141 (9.1–9.3)</p>
<p>Passive — когда главное <b>что сделали с предметом</b>, а не кто сделал (не знаем или не важно).</p>
<div class="f">be (в нужном времени) + 3-я форма глагола</div>
<ul>
<li>сейчас/обычно: <b class="en">These cars are made in China.</b></li>
<li>в прошлом: <b class="en">This computer was made in Japan.</b></li>
<li>уже случилось: <b class="en">has / have been made</b></li>
<li>в будущем: <b class="en">will be made</b></li>
</ul>
<p>Кто сделал — через <b class="en">by</b>: <b class="en">My house was designed by a famous architect.</b></p>
<p>Как переделать: <b class="en">Robots will clean the rooms.</b> → кто/что «страдает» (the rooms) ставим вперёд → <b class="en">The rooms will be cleaned by robots.</b></p>
<p>Наречия (often, probably) — прямо перед 3-й формой: <b class="en">It was probably discovered by the Ancient Greeks.</b></p>` },
];

// Текст задания → html, где названия тем — ссылки. Одним проходом: длинное название (present perfect passive)
// забирает текст раньше короткого (passive). Каждая тема — один раз.
export function linkify(text) {
  const rs = RULES.filter(r => r.html);
  const html = esc(text);
  if (!rs.length) return html;
  const all = new RegExp(rs.map(r => `(${r.re.source.replace(/\((?!\?)/g, '(?:')})`).join('|'), 'gi');
  const used = new Set();
  return html.replace(all, (m, ...g) => {
    const r = rs[g.slice(0, rs.length).findIndex(x => x !== undefined)];
    if (!r || used.has(r.id)) return m;
    used.add(r.id);
    return `<a href="#" class="gram" data-g="${r.id}" title="нажми — правило">${m}</a>`;
  });
}

// ПК (Яна 24.11): правило — окошком справа, чтобы смотреть и делать упражнение одновременно; «—» свернуть, «✕» закрыть.
// Телефон: места нет — окно поверх, кнопка «Понятно».
const wide = matchMedia('(min-width: 1001px)');
let side = null;
function show(id) {
  const r = RULES.find(x => x.id === id);
  if (!r) return;
  if (wide.matches) {
    if (!side) {
      side = document.createElement('section');
      side.className = 'gram-side';
      document.body.appendChild(side);
      side.addEventListener('click', e => {
        if (e.target.closest('.gs-min')) side.classList.toggle('mini');
        else if (e.target.closest('.gs-x')) { side.remove(); side = null; }
      });
    }
    side.classList.remove('mini');
    side.innerHTML = `<div class="gs-h"><b>📘 ${esc(r.title)}</b><span class="gs-btns"><button type="button" class="gs-min" title="свернуть / развернуть">—</button><button type="button" class="gs-x" title="закрыть">✕</button></span></div><div class="gram-body">${r.html}</div>`;
    return;
  }
  const d = document.createElement('dialog');
  d.className = 'gram-dlg';
  d.innerHTML = `<h3>📘 ${esc(r.title)}</h3><div class="gram-body">${r.html}</div><form method="dialog"><button class="btn primary wide">Понятно</button></form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.showModal();
}
// ушла со страницы ДЗ — окошко правила закрываем
addEventListener('hashchange', () => { if (side && !location.hash.startsWith('#/hw/')) { side.remove(); side = null; } });

document.addEventListener('click', e => {
  const a = e.target.closest('a.gram');
  if (!a) return;
  e.preventDefault();
  show(a.dataset.g);
});
