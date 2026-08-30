// Реестр источников дневной части.
//
// Смысл реестра не в удобстве, а в том, что пропуск становится видимым:
// ссылка в разметке экрана не проверяется ничем, а ссылка через реестр
// проверяется этим тестом. Поэтому здесь и живёт правило «id, на который
// ссылается код, обязан быть в реестре».
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const KERNEL = fs.readFileSync(
  path.resolve(__dirname, '../_kernel/heys_kernel_bibliography_v1.js'), 'utf8');
const DATA = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_bibliography_v1.js'), 'utf8');
const ENGINE = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'), 'utf8');
const STATS = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
const BUNDLE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/legacy-bundle-config.mjs'), 'utf8');

// Все места, где код называет источник по id: экраны дня, инсайты, движок
// поправки. Реестр не должен содержать записей, к которым никто не обращается.
const CODE = [
  '../heys_day_stats_v1.js',
  '../heys_day_stats_vm_v1.js',
  '../heys_day_caloric_balance_v1.js',
  '../insights/pi_ui_dashboard.js',
  '../insights/pi_ui_rings.js',
  '../insights/pi_analytics_api.js',
  '../heys_norm_correction_v1.js',
].map((rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8')).join(' ');

let B;
beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(KERNEL);
  // eslint-disable-next-line no-eval
  (0, eval)(DATA);
  B = window.HEYS.DayBibliography;
});

describe('источники дневной части · реестр', () => {
  it('данные домена, механизм ядра — как у пальцев и мобильности', () => {
    expect(DATA).toContain('HEYS.TrainingKernel && HEYS.TrainingKernel.bibliography');
    expect(DATA).toContain('kernel.createRegistry');
    // Своего индекса домен не заводит.
    expect(DATA).not.toContain('function createRegistry');
  });

  it('ядро грузится раньше данных, иначе записи молча не регистрируются', () => {
    const kernelAt = BUNDLE.indexOf("'_kernel/heys_kernel_bibliography_v1.js'");
    const dataAt = BUNDLE.indexOf("'heys_day_bibliography_v1.js'");
    expect(kernelAt).toBeGreaterThan(-1);
    expect(dataAt).toBeGreaterThan(kernelAt);
  });

  it('у каждой записи есть автор, год и ссылка', () => {
    for (const src of B.SOURCES) {
      expect(src.author, src.id).toBeTruthy();
      expect(String(src.year), src.id).toMatch(/^\d{4}$/);
      expect(src.url, src.id).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
      // Название работы в коде не было — выдумывать его нельзя, и пустое
      // поле честнее восстановленного по памяти.
      expect(src).toHaveProperty('title');
    }
  });

  it('пропуск виден: missing возвращает id без записи', () => {
    expect(B.missing(['leibel1995'])).toEqual([]);
    // Работа из продукта, у которой в коде нет ни автора, ни года: PMID
    // 10365981 у сводки избытка. Записи нет — и это видно вызовом, а не
    // чтением разметки.
    expect(B.missing(['pmid10365981'])).toEqual(['pmid10365981']);
  });

  it('поправка ссылается на id реестра, а не на номер работы', () => {
    // Номер в двух местах — это две ссылки, которые разойдутся.
    expect(ENGINE).toContain("adaptation: 'rosenbaum2010'");
    expect(ENGINE).not.toContain("adaptation: '20107198'");
    // eslint-disable-next-line no-eval
    (0, eval)(ENGINE);
    const id = window.HEYS.NormCorrection.EVIDENCE.adaptation;
    expect(B.missing([id])).toEqual([]);
  });

  it('экраны берут ссылки из реестра, а не переписывают их', () => {
    expect(STATS).toContain("HEYS.DayBibliography?.resolve?.(['leibel1995', 'hall2011'])");
    expect(STATS).toContain('HEYS.DayBibliography?.get?.(');
    // В попапе долга адреса не осталось: он пришёл бы копией той же ссылки.
    const popup = STATS.slice(STATS.indexOf('showSciencePopup'),
      STATS.indexOf('showSciencePopup') + 1400);
    expect(popup).not.toMatch(/pubmed\.ncbi\.nlm\.nih\.gov\/\d/);
  });

  it('долг реестра не растёт молча', () => {
    // Осталcя один адрес в разметке: 10365981 у сводки избытка — единственная
    // ссылка дневной части, у которой в коде нет ни автора, ни года, так что
    // запись пришлось бы угадывать. Остальные разошлись по реестру.
    // Счётчик держит долг от роста — новая ссылка мимо реестра уронит тест.
    const FILES = [
      '../heys_day_stats_v1.js',
      '../heys_day_stats_vm_v1.js',
      '../insights/pi_ui_dashboard.js',
      '../insights/pi_ui_rings.js',
    ];
    const hard = FILES.reduce((sum, rel) => {
      const src = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
      return sum + (src.match(/pubmed\.ncbi\.nlm\.nih\.gov\/\d/g) || []).length;
    }, 0);
    expect(hard).toBeLessThanOrEqual(1);
  });

  it('в реестре только проверенные записи, а не все PMID разом', () => {
    // Записи заведены на источники, у которых автор и год стоят в коде: в
    // подписи ссылки, в структуре разбора баланса или в списке аналитики.
    // Остальные номера в продукте — голые, и завести их записями значило бы
    // выдумать метаданные. Долг остаётся долгом и виден через missing().
    expect(B.registry.size).toBe(25);
    // Каждая запись обязана быть достижима из кода по своему id — иначе
    // реестр начнёт копить работы, на которые никто не ссылается.
    const orphans = B.SOURCES.filter((s) => !CODE.includes("'" + s.id + "'"));
    expect(orphans.map((s) => s.id)).toEqual([]);
  });
});
