// Каталог, не принятый из облака, должен быть слышен.
//
// До 2026-08-22 несобравшаяся пара «строки + манифест» выбрасывалась молча:
// `if (!assembled.ok) return out;`. Для приложения это выглядело так же, как
// «каталога в облаке нет», и именно поэтому инцидент 21.08 прожил часы
// незамеченным (apps/web/BUGS_HISTORY.md). Разница принципиальна: данные есть,
// но мы им не доверяем.
//
// Тест читает исходник и проверяет поведение функции-репортёра на настоящих
// вызовах, а не наличие подстроки: важно, что сообщение выходит один раз на
// пару «клиент + причина» и несёт, куда идти чинить.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, '..', 'heys_storage_supabase_v1.js'), 'utf8').replace(/\r\n/g, '\n');

// Вырезаем репортёр вместе с его дедуп-множеством и оживляем в песочнице:
// тащить сюда весь storage-модуль ради одной функции незачем.
function loadReporter(logCritical) {
  const setStart = source.indexOf('const overlayAssemblyReported = new Set();');
  const fnStart = source.indexOf('function reportOverlayAssemblyFailure(');
  const fnEnd = source.indexOf('\n  }', fnStart) + '\n  }'.length;
  expect(setStart, 'дедуп-множество репортёра не найдено').toBeGreaterThan(0);
  expect(fnStart, 'репортёр не найден').toBeGreaterThan(0);

  const body = `${source.slice(setStart, source.indexOf('\n', setStart))}\n${source.slice(fnStart, fnEnd)}\nreturn reportOverlayAssemblyFailure;`;
  // eslint-disable-next-line no-new-func
  return new Function('logCritical', body)(logCritical);
}

describe('несобравшийся каталог продуктов слышен', () => {
  it('сообщает причину, клиента и куда идти чинить', () => {
    const said = [];
    const report = loadReporter((message) => said.push(message));

    report({ ok: false, status: 'generation_mismatch' }, 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', 'raw-rows');

    expect(said).toHaveLength(1);
    expect(said[0]).toContain('generation_mismatch');
    expect(said[0]).toContain('ccfe6ea3');
    expect(said[0]).toContain('Scenario 9');
    // Формулировка обязана отличать «не доверяем» от «нет данных».
    expect(said[0]).toMatch(/разошлись/i);
  });

  it('не заливает консоль: одна и та же беда сообщается один раз', () => {
    const said = [];
    const report = loadReporter((message) => said.push(message));

    for (let i = 0; i < 20; i += 1) {
      report({ ok: false, status: 'generation_mismatch' }, 'client-a', 'raw-rows');
    }

    expect(said).toHaveLength(1);
  });

  it('другая причина или другой клиент — отдельное сообщение', () => {
    const said = [];
    const report = loadReporter((message) => said.push(message));

    report({ ok: false, status: 'generation_mismatch' }, 'client-a', 'raw-rows');
    report({ ok: false, status: 'row_count_mismatch' }, 'client-a', 'raw-rows');
    report({ ok: false, status: 'generation_mismatch' }, 'client-b', 'deduped');

    expect(said).toHaveLength(3);
  });

  it('неизвестный статус не превращается в пустую строку', () => {
    const said = [];
    const report = loadReporter((message) => said.push(message));

    report(null, 'client-a', 'raw-rows');

    expect(said[0]).toContain('unknown');
  });
});

describe('тихих выбрасываний каталога не осталось', () => {
  it('обе точки сборки сообщают о провале', () => {
    // Прямая защита от возврата к прежнему поведению при будущих правках.
    expect(source).not.toContain('if (!assembled.ok) return out;');
    // Только вызовы: объявление функции под тот же шаблон подходить не должно.
    const reports = source.match(/^\s+reportOverlayAssemblyFailure\(/gm) || [];
    expect(reports).toHaveLength(2);
  });
});
