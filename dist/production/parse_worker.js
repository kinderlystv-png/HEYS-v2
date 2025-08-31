// parse_worker.js — Web Worker для тяжёлого парсинга pasted текста
self.onmessage = function(e) {
  const { text } = e.data;
  // Вставляем синхронную логику парсинга из heys_core_v12.js
  function isHeaderLine(line){ const l=line.toLowerCase(); return l.includes('название') && (l.includes('ккал') || l.includes('калори') || l.includes('углевод')); }
  function normalizeLine(raw){ let s = raw.replace(/[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g,' '); s = s.replace(/[\u060C]/g, ',').replace(/[\u066B]/g, ',').replace(/[\u066C]/g, ',').replace(/[\u201A]/g, ','); s = s.replace(/[\u00B7]/g, '.').replace(/[–—−]/g, '-').replace(/%/g, ''); s = s.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim(); return s; }
  const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;
  function findTokenPositions(s, tokens){ const positions=[]; let start=0; for(const tok of tokens){ const idx=s.indexOf(tok, start); positions.push(idx===-1?null:idx); if(idx!==-1) start=idx+tok.length; } return positions; }
  function toNum(x) { if (x===undefined || x===null) return 0; if (typeof x === 'number') return x; const s = String(x).trim().replace(',', '.'); const n = Number(s); return Number.isFinite(n) ? n : 0; }
  function round1(v) { return Math.round(v*10)/10; }
  function extractRow(raw){ const clean = normalizeLine(raw); const tokens = clean.match(NUM_RE) || []; if (!tokens.length) return null; let last = tokens.slice(-12); if (last.length<12) last = Array(12-last.length).fill('0').concat(last); const positions = findTokenPositions(clean, last); const firstPos = positions[0] ?? clean.length; const name = clean.slice(0, firstPos).trim() || 'Без названия'; const nums = last.map(toNum); return { name, nums }; }
  function computeDerived(p){ const carbs100 = toNum(p.simple100) + toNum(p.complex100); const fat100 = toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100); const kcal100 = 4*(toNum(p.protein100) + carbs100) + 8*fat100; return { carbs100: round1(carbs100), fat100: round1(fat100), kcal100: round1(kcal100) }; }
  function parsePastedSync(text){
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0 && !isHeaderLine(l));
    const rows=[];
    for(const raw of lines){
      const st = extractRow(raw); if(!st) continue;
      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = st.nums;
      const base = { id: Math.random().toString(36).slice(2,10), name: st.name, simple100:simple, complex100:complex, protein100:protein, badFat100:bad, goodFat100:good, trans100:trans, fiber100:fiber, gi:gi, harmScore:harm };
      const d = computeDerived(base);
      rows.push({ id: base.id, name: base.name, ...base, carbs100: d.carbs100, fat100: d.fat100, kcal100: d.kcal100 });
    }
    return rows;
  }
  let result = { rows: parsePastedSync(text) };
  self.postMessage({ result });
};
