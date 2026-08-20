#!/usr/bin/env node
/**
 * Generate ui-v4-canvas-brief.html from ui-v4-canvas-brief.md (§ legend + §0–§3).
 * Single source of truth: md. Do not edit the html by hand.
 *
 * Usage: pnpm docs:ui-v4-brief
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(__dirname, 'ui-v4-canvas-brief.md');
const outPath = path.join(__dirname, 'ui-v4-canvas-brief.html');

/** @type {Record<string, { labels: string[], cols: string[], wClass: string }>} */
const TABLE_LAYOUTS = {
  blocked: {
    labels: ['Зона', 'Канвас / пакет', 'Макет', 'Контракт', 'Порядок', 'Статус'],
    cols: ['zone', 'canvas', 'xs', 'xs', 'order', 'xs'],
    wClass: 'w6',
  },
  infra: {
    labels: ['#', 'Работа', 'Протокол', 'Сложн.', 'Часы', 'Стр.', 'Кр.', 'Статус / остаток'],
    cols: ['n', 'work', 'proto', 'xs', 'sm', 'xs', 'xs', 'status'],
    wClass: 'w8',
  },
  contracts: {
    labels: ['#', 'Канвас', 'Экр.', 'Протокол', 'Сложн.', 'Ч', 'Стр.', 'Кр.', 'Статус / остаток'],
    cols: ['n', 'work', 'xs', 'proto', 'xs', 'xs', 'xs', 'xs', 'status'],
    wClass: 'w9',
  },
  tabs: {
    labels: ['#', 'Канвас / зона', 'Экр.', 'Документ', 'Сложн.', 'Ч', 'Стр.', 'Кр.', 'Статус / остаток'],
    cols: ['n', 'work', 'xs', 'proto', 'xs', 'xs', 'xs', 'xs', 'status'],
    wClass: 'w9',
  },
};

const md = fs.readFileSync(mdPath, 'utf8');

const start = md.indexOf('## Как читать');
const endMatch = md.match(/\n---\r?\n\r?\n## 4\./);
if (start === -1 || !endMatch) {
  console.error('Could not find § legend or §4 boundary in md');
  process.exit(1);
}
const end = endMatch.index;

const slice = md.slice(start, end).trim();

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMd(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  return s;
}

function isNoteLine(text) {
  return (
    (text.startsWith('*') && text.endsWith('*') && !text.startsWith('**')) ||
    (text.startsWith('_') && text.endsWith('_'))
  );
}

function noteInner(text) {
  if (text.startsWith('*') && text.endsWith('*')) return text.slice(1, -1);
  if (text.startsWith('_') && text.endsWith('_')) return text.slice(1, -1);
  return text;
}

function pipeTableToHtml(block) {
  const lines = block.trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return `<p>${inlineMd(block)}</p>`;
  const rows = lines
    .filter((l) => !/^\|[\s\-:|]+\|$/.test(l.trim()))
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim())
    );
  if (rows.length === 0) return '';
  const head = rows[0];
  const body = rows.slice(1);
  const ths = head.map((c) => `<th scope="col">${inlineMd(c)}</th>`).join('');
  const trs = body
    .map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table class="legend"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

function resolveLayout(labels) {
  for (const [name, layout] of Object.entries(TABLE_LAYOUTS)) {
    if (
      layout.labels.length === labels.length &&
      layout.labels.every((label, i) => label === labels[i])
    ) {
      return { name, ...layout };
    }
  }
  console.error('Unknown table layout. Headers:', labels.join(' | '));
  console.error('Expected one of:', Object.keys(TABLE_LAYOUTS).join(', '));
  process.exit(1);
}

function cellClass(colClass) {
  return ['n', 'xs', 'sm'].includes(colClass) ? ` class="${colClass}"` : '';
}

function colgroupHtml(cols) {
  return `<colgroup>${cols.map((c) => `<col class="${c}">`).join('')}</colgroup>`;
}

function enhanceDataTable(html) {
  const thRow = html.match(/<thead>\s*<tr>([\s\S]*?)<\/tr>/i);
  if (!thRow) return `<div class="scroll">${html}</div>`;
  const labels = [...thRow[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim()
  );
  const layout = resolveLayout(labels);

  let t = html.replace(/<colgroup>[\s\S]*?<\/colgroup>/gi, '');
  t = t.replace(
    /<table\b[^>]*>/i,
    `<table class="brief ${layout.wClass}">\n${colgroupHtml(layout.cols)}`
  );

  t = t.replace(/<thead>\s*<tr>([\s\S]*?)<\/tr>/i, (match, row) => {
    let colIdx = 0;
    const newRow = row.replace(/<th([^>]*)>([\s\S]*?)<\/th>/gi, (full, attrs, content) => {
      const cls = cellClass(layout.cols[colIdx++]);
      return `<th scope="col"${cls}>${content}</th>`;
    });
    return `<thead><tr>${newRow}</tr>`;
  });

  t = t.replace(/<tbody>([\s\S]*?)<\/tbody>/i, (match, body) => {
    const newBody = body.replace(/<tr>([\s\S]*?)<\/tr>/gi, (trMatch, trInner) => {
      let colIdx = 0;
      const newTr = trInner.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (full, attrs, content) => {
        const cls = cellClass(layout.cols[colIdx++]);
        return `<td${cls}>${content}</td>`;
      });
      return `<tr>${newTr}</tr>`;
    });
    return `<tbody>${newBody}</tbody>`;
  });

  return `<div class="scroll">${t}</div>`;
}

function mdSliceToHtml(source) {
  const parts = source.split(/(<table[\s\S]*?<\/table>)/gi);
  const out = [];

  for (const part of parts) {
    if (/^<table/i.test(part)) {
      out.push(enhanceDataTable(part));
      continue;
    }
    const lines = part.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        i += 1;
        continue;
      }
      if (trimmed === '---') {
        i += 1;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        const m = trimmed.match(/^## (\d+)\.\s*(.+)$/);
        if (m) {
          out.push(`<h2 id="s${m[1]}">${m[1]}. ${inlineMd(m[2])}</h2>`);
        } else {
          out.push(`<h2>${inlineMd(trimmed.slice(3))}</h2>`);
        }
        i += 1;
        continue;
      }
      if (trimmed.startsWith('|')) {
        const tableLines = [trimmed];
        i += 1;
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i += 1;
        }
        out.push(pipeTableToHtml(tableLines.join('\n')));
        continue;
      }
      if (isNoteLine(trimmed)) {
        out.push(`<p class="note"><em>${inlineMd(noteInner(trimmed))}</em></p>`);
        i += 1;
        continue;
      }
      const paraLines = [trimmed];
      i += 1;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (
          !next ||
          next === '---' ||
          next.startsWith('## ') ||
          next.startsWith('|') ||
          next.startsWith('<table') ||
          isNoteLine(next)
        ) {
          break;
        }
        paraLines.push(next);
        i += 1;
      }
      out.push(`<p>${inlineMd(paraLines.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

const bodyContent = mdSliceToHtml(slice);

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UI v4 · бриф контрактов канвасов</title>
  <style>
    :root { color-scheme: light dark; --meta: #555; --link: #0969da; }
    body {
      font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif;
      max-width: 1400px;
      margin: 24px auto;
      padding: 0 16px 48px;
    }
    h1 { font-size: 1.35rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #8884; padding-bottom: 0.25rem; }
    .meta { color: var(--meta); font-size: 13px; margin-bottom: 0.5rem; }
    .meta a { color: var(--link); }
    .meta code { font-size: 12px; }
    .gen { font-size: 12px; color: var(--meta); margin-bottom: 1.5rem; }
    code { font-size: 12px; }
    p.note { color: var(--meta); font-size: 13px; }
    .scroll { overflow-x: auto; margin: 12px 0 16px; -webkit-overflow-scrolling: touch; }
    table.legend { border-collapse: collapse; font-size: 13px; margin: 12px 0 16px; max-width: 720px; }
    table.legend th, table.legend td { border: 1px solid #8885; padding: 6px 10px; vertical-align: top; text-align: left; }
    table.legend th { background: #8882; font-weight: 600; }
    table.brief {
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 13px;
      line-height: 1.35;
      width: 100%;
    }
    table.brief.w6 { min-width: 640px; }
    table.brief.w8 { min-width: 1080px; }
    table.brief.w9 { min-width: 1180px; }
    table.brief col.n { width: 48px; }
    table.brief col.xs { width: 56px; }
    table.brief col.sm { width: 52px; }
    table.brief col.zone { width: 88px; }
    table.brief col.canvas { width: 200px; }
    table.brief col.order { width: 180px; }
    table.brief col.work { width: 200px; }
    table.brief col.proto { width: 150px; }
    table.brief col.status { width: 42%; }
    table.brief th, table.brief td {
      border: 1px solid #8885;
      padding: 5px 8px;
      vertical-align: top;
      text-align: left;
      word-wrap: break-word;
    }
    table.brief th { background: #8882; font-weight: 600; }
    table.brief th.n, table.brief td.n,
    table.brief th.xs, table.brief td.xs,
    table.brief th.sm, table.brief td.sm { text-align: center; }
    @media (prefers-color-scheme: dark) {
      :root { --meta: #aaa; --link: #58a6ff; }
      body { background: #1e1e1e; color: #ddd; }
      table.brief th, table.legend th { background: #ffffff12; }
      table.brief th, table.brief td, table.legend th, table.legend td { border-color: #ffffff22; }
    }
    @media print {
      @page { size: landscape; margin: 8mm; }
      .scroll { overflow: visible; }
      table.brief { min-width: 0 !important; width: 100%; font-size: 9px; }
      table.brief col.n { width: 4%; }
      table.brief col.xs, table.brief col.sm { width: 5%; }
      table.brief col.zone { width: 8%; }
      table.brief col.canvas, table.brief col.work { width: 14%; }
      table.brief col.order { width: 12%; }
      table.brief col.proto { width: 10%; }
      table.brief col.status { width: 32%; }
    }
  </style>
</head>
<body>
  <h1>UI v4 · бриф контрактов канвасов</h1>
  <p class="meta">heys/90efc3 · 2026-08-20 · <a href="ui-v4-canvas-brief.md">полный бриф (md)</a> · §4–§11 только там</p>
  <p class="gen">Сгенерировано <code>build-ui-v4-canvas-brief-html.mjs</code> (<code>pnpm docs:ui-v4-brief</code>) — не править вручную.</p>
${bodyContent}
</body>
</html>
`;

fs.writeFileSync(outPath, html, 'utf8');
console.log(`Wrote ${outPath}`);
