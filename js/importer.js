// Разбор списков слов: текст «english - русский», CSV, XLSX.
const CYR = /[А-Яа-яЁё]/;
const LAT = /[A-Za-z]/;
const SEP = /\s+[-–—]\s+|\t|\s*;\s*|\s+=\s+/;
const TRAIL = /[\s\-–—:=]+$/;

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// Одна строка → {en, ru} или {error}
export function parseLine(line) {
  const s = line.trim().replace(/^\d+[.)]\s+/, '');
  if (!s) return null;
  let a, b;
  const m = s.match(SEP);
  if (m) {
    a = s.slice(0, m.index);
    b = s.slice(m.index + m[0].length);
  } else {
    // Без разделителя: режем там, где латиница сменяется кириллицей (или наоборот).
    const k = s.search(CYR), j = s.search(LAT);
    if (k > 0 && j === 0) { a = s.slice(0, k).replace(TRAIL, ''); b = s.slice(k); }
    else if (j > 0 && k === 0) { a = s.slice(0, j).replace(TRAIL, ''); b = s.slice(j); }
    else return { error: line.trim() };
  }
  a = clean(a); b = clean(b);
  if (!a || !b) return { error: line.trim() };
  if (CYR.test(a) && !CYR.test(b)) [a, b] = [b, a];
  return { en: a, ru: b };
}

export function parseText(text) {
  const pairs = [], errors = [];
  for (const line of text.split(/\r?\n/)) {
    const r = parseLine(line);
    if (!r) continue;
    if (r.error) errors.push(r.error); else pairs.push(r);
  }
  return { pairs, errors };
}

// CSV с кавычками; разделитель угадываем по первой строке.
export function parseCSV(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].sort((x, y) => first.split(y).length - first.split(x).length)[0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => clean(c)));
}

// ---------- Lexilize .lxf (внутри protobuf) ----------
// Тема: 3 = короткое имя, 4 = полное имя, 15 = карточки.
// Карточка: 4 = слово {2: текст}, 5 = перевод {2: текст}, 6 = прогресс
//   {2: время последнего занятия, 3: пройденные режимы «0,1,2,3,4,5,100», 5: уровень}.

function pb(bytes) {
  const out = new Map();
  let i = 0;
  const varint = () => {
    let r = 0, m = 1, c;
    do { c = bytes[i++]; r += (c & 0x7f) * m; m *= 128; } while (c & 0x80);
    return r;
  };
  while (i < bytes.length) {
    const key = varint(), f = Math.floor(key / 8), wt = key % 8;
    let v;
    if (wt === 0) v = varint();
    else if (wt === 2) { const n = varint(); v = bytes.subarray(i, i + n); i += n; }
    else if (wt === 1) { i += 8; continue; }
    else if (wt === 5) { i += 4; continue; }
    else throw new Error('файл .lxf повреждён или другого формата');
    if (!out.has(f)) out.set(f, []);
    out.get(f).push(v);
  }
  return out;
}

const utf8 = new TextDecoder('utf-8');
const str = v => (v instanceof Uint8Array ? utf8.decode(v) : '');

export function parseLxf(buf) {
  const top = pb(new Uint8Array(buf));
  return (top.get(1) || []).map(deckBytes => {
    const d = pb(deckBytes);
    const name = clean(str(d.get(4)?.[0]) || str(d.get(3)?.[0])) || 'Без названия';
    const cards = (d.get(15) || []).map(cardBytes => {
      const c = pb(cardBytes);
      const text = k => (c.get(k) ? str(pb(c.get(k)[0]).get(2)?.[0]) : '');
      let en = clean(text(4)), ru = clean(text(5));
      if (CYR.test(en) && !CYR.test(ru)) [en, ru] = [ru, en];
      let done = false, level = 0, last = null;
      if (c.get(6)) {
        const p = pb(c.get(6)[0]);
        done = /(^|,)(5|100)(,|$)/.test(str(p.get(3)?.[0]));
        level = p.get(5)?.[0] || 0;
        last = p.get(2)?.[0] || null;
      }
      return { en, ru, done, level, last };
    }).filter(c => c.en && c.ru);
    return { name, cards };
  });
}

// Файл → строки таблицы (массив массивов). У Excel с несколькими листами добавляем колонку «Лист».
export async function readFileRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.lxf')) return { lxf: parseLxf(await file.arrayBuffer()) };
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
    const wb = XLSX.read(await file.arrayBuffer());
    const many = wb.SheetNames.length > 1;
    const rows = [];
    for (const sn of wb.SheetNames) {
      const part = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })
        .map(r => r.map(c => String(c)))
        .filter(r => r.some(c => clean(c)));
      rows.push(...(many ? part.map(r => [...r, sn]) : part));
    }
    return { rows, sheetCol: many };
  }
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buf);
  text = text.replace(/^﻿/, '');
  if (name.endsWith('.txt')) return { text };
  return { rows: parseCSV(text), sheetCol: false };
}

// Угадать колонки: английская — больше всего латиницы, русская — больше всего кириллицы.
export function guessColumns(rows) {
  const width = Math.max(0, ...rows.map(r => r.length));
  const lat = Array(width).fill(0), cyr = Array(width).fill(0);
  for (const r of rows.slice(0, 50)) {
    r.forEach((c, i) => {
      if (CYR.test(c)) cyr[i]++;
      else if (LAT.test(c)) lat[i]++;
    });
  }
  const best = arr => arr.reduce((bi, v, i) => (v > arr[bi] ? i : bi), 0);
  const en = best(lat);
  let ru = best(cyr);
  if (ru === en) ru = width > 1 ? (en === 0 ? 1 : 0) : en;
  const header = rows[0] && /word|term|translat|front|back|english|russian|слово|перевод|англ|рус/i.test(rows[0].join(' '));
  return { width, en, ru, header: !!header };
}
