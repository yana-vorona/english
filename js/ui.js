// Общие мелочи интерфейса.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

export const words = n => `${n} ${plural(n, 'слово', 'слова', 'слов')}`;

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// Настройки этого устройства (localStorage может быть недоступен — тогда просто не запоминаем).
export function load(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
export function forget(key) {
  try { localStorage.removeItem(key); } catch {}
}

// Окошки на ПК можно таскать за заголовок; место запоминается (Яна 24.11: «правило для всех окон справа, как словарик»).
// box — окно (position: fixed), handle — заголовок, key — где помнить место. На телефоне не таскаем.
const wideScr = matchMedia('(min-width: 1001px)');
let topZ = 18;
export function movable(box, handle, key) {
  const fit = () => { if (wideScr.matches && box.style.top) box.style.maxHeight = Math.max(120, innerHeight - box.getBoundingClientRect().top - 14) + 'px'; };
  const place = () => {
    const p = load(key);
    if (!wideScr.matches || !p) return;
    const x = Math.min(Math.max(0, p.x), innerWidth - 120), y = Math.min(Math.max(0, p.y), innerHeight - 40);
    Object.assign(box.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    fit();
  };
  place();
  // щёлкнула по окну — оно сверху остальных
  box.addEventListener('pointerdown', () => { box.style.zIndex = ++topZ; });
  handle.style.cursor = 'grab';
  handle.style.touchAction = 'none';
  let drag = null, moved = false;
  handle.addEventListener('pointerdown', e => {
    if (!wideScr.matches || e.button !== 0 || e.target.closest('button, a, input, .dict-x, .dict-hx')) return;
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY }; moved = false;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 4) return;
    moved = true;
    const x = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - 120), y = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - 40);
    Object.assign(box.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
  });
  handle.addEventListener('pointerup', () => {
    if (drag && moved) { const r = box.getBoundingClientRect(); save(key, { x: r.left, y: r.top }); fit(); }
    drag = null;
  });
  // перетащила — это не щелчок (не сворачиваем <details>)
  handle.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}
