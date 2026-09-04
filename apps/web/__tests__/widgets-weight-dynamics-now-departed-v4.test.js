/**
 * Кадр «Динамика · как сейчас» уходит: чипы 7/14/30 сняты.
 * Продукт стоит на дефолте curve («Вес за месяц»). Не чинить под этот кадр.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const UI = path.join(WEB_DIR, 'heys_widgets_ui_v1.js');
const VARIANTS = path.join(WEB_DIR, 'heys_widgets_variants_v4.js');

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

describe('Динамика · как сейчас — уходящий кадр', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const uiSrc = fs.readFileSync(UI, 'utf8');
  const variantsSrc = fs.readFileSync(VARIANTS, 'utf8');

  const bodyAt = uiSrc.indexOf('function renderWeightDynamicsBody');
  const tileAt = uiSrc.indexOf('function CrashRiskDynamicsVariantTile', bodyAt);
  const body = uiSrc.slice(bodyAt, tileAt > bodyAt ? tileAt : bodyAt + 2500);
  const crashBlock = variantsSrc.match(/crashRisk:\s*\[([\s\S]*?)\n\s*\]/)?.[1] || '';

  it('читает семь строк кадра и пометку «уходит»', () => {
    expect(contractValue(canvas, 'Динамика · как сейчас · 01')).toBe('плитка');
    expect(contractValue(canvas, 'Динамика · как сейчас · 02'))
      .toBe('распределение space-between, выравнивание center');
    expect(contractValue(canvas, 'Динамика · как сейчас · 03'))
      .toBe('«Динамика веса» — ключ');
    expect(contractValue(canvas, 'Динамика · как сейчас · 04'))
      .toBe('«−1,8» — моноцифры: шрифт 600 12px/1 Figtree');
    expect(contractValue(canvas, 'Динамика · как сейчас · 05'))
      .toBe('моноцифры: зазор 10px, отступ сверху auto, шрифт 700 9.5px/1 Figtree');
    expect(contractValue(canvas, 'Динамика · как сейчас · 06'))
      .toBe('«7» — цвет rgba(var(--ink),.56)');
    expect(contractValue(canvas, 'Динамика · как сейчас · 07'))
      .toBe('«14» — цвет var(--ac), разделитель 2px solid var(--acs)');
    const board = canvas.slice(canvas.indexOf('data-screen-label="Динамика · как сейчас"'));
    expect(board).toContain('как сейчас, уходит');
  });

  it('держит дефолт curve и не рисует чипы 7/14/30 на плитке', () => {
    expect(crashBlock).toMatch(/id:\s*'curve'[\s\S]*?isDefault:\s*true/);
    expect(crashBlock).toMatch(/id:\s*'number_only'[\s\S]*?sheet:\s*false/);
    expect(crashBlock).toMatch(/id:\s*'chart'[\s\S]*?sheet:\s*true/);
    expect(body).toContain("windowLabel = dyn?.window?.label || 'Вес за месяц'");
    expect(body).toContain("'Вес по неделям'");
    expect(body).toContain('weightDynamicsDeltaKicker');
    expect(body).toContain('// curve (default)');
    expect(body).not.toContain('Динамика веса');
    expect(body).not.toMatch(/7\s*,\s*14\s*,\s*30/);
    expect(body).not.toContain('border-bottom: 2px solid');
    expect(uiSrc).toContain('function weightDynamicsDeltaKicker');
    expect(uiSrc).toContain('Сброшено за ${short}');
  });
});
