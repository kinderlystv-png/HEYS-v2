import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

/**
 * Связь личной карточки с общей базой (`shared_origin_id`) — единственное, что
 * не даёт одной и той же еде существовать двумя независимыми карточками.
 *
 * До 21.08 бэкфилл этой связи стоял под условием «карточке не хватает
 * нутриентов»: совпадение по имени находилось, счётчик `matchedByName` его
 * считал, но заполненная карточка связь не получала никогда. Отсюда дубли в
 * каталоге и `ambiguous_product` там, где выбора на самом деле нет.
 *
 * Здесь фиксируется разделение: связывание не зависит от полноты карточки, а
 * дозаполнение значений — отдельная задача под своим условием.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) {
      return Function(`"use strict"; return (${source.slice(start, i + 1)});`)();
    }
  }
  throw new Error(`Function ${name} body is not closed`);
}

const coreSource = read('apps/web/heys_core_v12.js');
const needsSharedLink = extractFunction(coreSource, 'needsSharedLink');

const FULL_CARD = {
  id: 'own-bread',
  name: 'Хлеб тостовый Премиум суперсемечковый',
  kcal100: 276.7,
  protein100: 9.4,
  harm: 4,
};
const SHARED_ROW = { id: '10652bdc-e36d-4167-b646-e42fad074ee8', name: 'Хлеб тостовый Премиум суперсемечковый', kcal100: 274 };

describe('связь с общей базой не зависит от полноты карточки', () => {
  it('заполненная карточка без связи её получает', () => {
    expect(needsSharedLink(FULL_CARD, SHARED_ROW)).toBe(true);
  });

  it('уже связанная карточка второй раз не переписывается', () => {
    expect(needsSharedLink({ ...FULL_CARD, shared_origin_id: 'other-id' }, SHARED_ROW)).toBe(false);
  });

  it('пустая строка в связи считается отсутствием связи', () => {
    expect(needsSharedLink({ ...FULL_CARD, shared_origin_id: '' }, SHARED_ROW)).toBe(true);
  });

  it('без строки общей базы связывать нечем', () => {
    expect(needsSharedLink(FULL_CARD, null)).toBe(false);
    expect(needsSharedLink(FULL_CARD, { name: 'Без id' })).toBe(false);
    expect(needsSharedLink(null, SHARED_ROW)).toBe(false);
  });
});

describe('связывание отделено от дозаполнения', () => {
  const loopStart = coreSource.indexOf('const updatedProducts = currentProducts.map');
  const loopEnd = coreSource.indexOf("debugLog('update-scan'", loopStart);
  const loop = coreSource.slice(loopStart, loopEnd);

  it('связь ставится в ветке, где дозаполнение не нужно', () => {
    expect(loopStart).toBeGreaterThan(-1);
    expect(loop).toContain('!shouldUpdate && needsSharedLink(localP, sharedP)');
  });

  it('в этой ветке переносится только связь, без единого значения из общей базы', () => {
    const branchStart = loop.indexOf('!shouldUpdate && needsSharedLink');
    const branchEnd = loop.indexOf('// Проверяем нужно ли обновлять', branchStart);
    const branch = loop.slice(branchStart, branchEnd);

    expect(branch).toContain('shared_origin_id: sharedP.id');
    // Ни одно значение из общей базы сюда попасть не должно: заполненная
    // карточка иначе молча получила бы чужой штрихкод или порции.
    expect(branch).not.toContain('mergeFromShared');
    for (const field of ['kcal100', 'harm', 'barcode', 'portions', 'protein100']) {
      expect(branch).not.toContain(field);
    }
  });

  it('новые связи видны в диагностике — иначе эффект не проверить', () => {
    expect(coreSource).toContain('linkedByName: linkedCount');
  });
});

/**
 * Ключ похожести один на все слои. Раньше MCP вырезал пунктуацию, а веб и SQL
 * — нет, и «Хлеб тостовый «Премиум»» для склейки был другой едой, чем «Хлеб
 * тостовый Премиум», а для поиска — той же. Дубль в такой паре не мог
 * самоисправиться никогда.
 */
describe('ключ похожести названий', () => {
  const modelsSource = read('apps/web/heys_models_v1.js');
  const productMatchKey = extractFunction(modelsSource, 'productMatchKey');

  it('кавычки и знаки не делают из одной еды две', () => {
    expect(productMatchKey('Хлеб тостовый «Премиум суперсемечковый»'))
      .toBe(productMatchKey('Хлеб тостовый Премиум суперсемечковый'));
    expect(productMatchKey('Творог 5%')).toBe(productMatchKey('творог 5 %'));
    expect(productMatchKey('Йогурт «Активиа», клубника')).toBe(productMatchKey('Йогурт Активиа клубника'));
  });

  it('ё и регистр не различают', () => {
    expect(productMatchKey('Свёкла варёная')).toBe(productMatchKey('свекла вареная'));
  });

  it('разная еда остаётся разной', () => {
    expect(productMatchKey('Творог 5%')).not.toBe(productMatchKey('Творог 9%'));
    expect(productMatchKey('Хлеб ржаной')).not.toBe(productMatchKey('Хлеб пшеничный'));
  });

  it('совпадает с нормализацией MCP — иначе слои снова разъедутся', () => {
    const mcpSource = read('yandex-cloud-functions/heys-mcp/lib/products.js');
    const normalizeText = extractFunction(mcpSource, 'normalizeText');
    for (const name of [
      'Хлеб тостовый «Премиум суперсемечковый»',
      'Творог 5%',
      'Йогурт «Активиа», клубника',
      'Свёкла варёная',
      'Кофе  американо',
    ]) {
      expect(productMatchKey(name)).toBe(normalizeText(name));
    }
  });

  it('строгая нормализация не тронута — на ней контракт с сервером', () => {
    // Её результат уходит в name_norm при публикации и обязан совпадать с тем,
    // что считает SQL: пунктуацию она не трогает и трогать не должна.
    const start = modelsSource.indexOf('function normalizeProductName(');
    const body = modelsSource.slice(start, modelsSource.indexOf('_normalizeNameCache.set(name, result);', start));
    expect(body).not.toContain('\\p{L}');
    expect(body).toContain(".replace(/\\s+/g, ' ')");
    expect(modelsSource).toContain('M.normalizeProductName = normalizeProductName;');
  });
});
