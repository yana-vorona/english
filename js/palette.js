// Цвета из «Палитры» Яны (программа на ПК, отдаёт их serve.py по адресу /palette).
// Кнопки и прогресс — в обеих темах, фон и карточки — только в светлой.
// Последние цвета запоминаем, чтобы они были и когда помощник на ПК не запущен.
import { load, save } from './ui.js';

const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const URL_ = local ? '/palette' : 'http://127.0.0.1:8770/palette';
let last = '';

function apply(p) {
  if (!p) return;
  const root = document.documentElement.style;
  if (p.eng_accent) root.setProperty('--accent', p.eng_accent);
  if (p.eng_ok) root.setProperty('--ok', p.eng_ok);
  const light = `${p.eng_bg ? `--bg:${p.eng_bg};` : ''}${p.eng_card ? `--surface:${p.eng_card};` : ''}`;
  let st = document.getElementById('palette-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'palette-style';
    document.head.append(st);
  }
  st.textContent = light
    ? `@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${light}}} :root[data-theme="light"]{${light}}`
    : '';
  const bg = p.eng_bg && !matchMedia('(prefers-color-scheme: dark)').matches ? p.eng_bg : null;
  if (bg) document.body.style.background = '';
}

async function poll() {
  let ok = false;
  try {
    const r = await fetch(URL_, { cache: 'no-store' });
    const p = await r.json();
    const s = JSON.stringify(p);
    if (s !== last) { last = s; apply(p); save('palette', p); }
    ok = true;
  } catch {}
  // Помощник на ПК отвечает — проверяем часто; нет (телефон) — редко.
  setTimeout(poll, ok ? 2500 : 60000);
}

export function startPalette() {
  apply(load('palette', null));
  poll();
}
