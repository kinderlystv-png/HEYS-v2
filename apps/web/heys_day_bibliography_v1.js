// heys_day_bibliography_v1.js — источники дневной части: данные для реестра ядра.
//
// Механизм общий (HEYS.TrainingKernel.bibliography.createRegistry) — здесь
// только записи. Домен отдаёт данные, ядро отдаёт индекс и поиск пропусков:
// то же разделение, что у пальцев и мобильности.
//
// Зачем реестр, когда PMID можно написать прямо в экране. Их в дневной части
// 106 штук, разбросанных по десяти файлам. Пока ссылка живёт в разметке, её
// нельзя ни пересчитать, ни проверить: экран с двумя ссылками и соседний без
// них выглядят одинаково правдоподобно. Реестр делает пропуск видимым —
// registry.missing(ids) возвращает id, для которых записи нет, и это ловит
// тест вместо человека.
//
// Правило наполнения: запись заводится только на источник, у которого автор и
// год подтверждены кодом или показаны пользователю. Выдуманные метаданные хуже
// отсутствующих — они выглядят обоснованием и им не являются. Поэтому реестр
// начинается с трёх записей, а не со ста шести: остальные PMID остаются
// долгом, и долг этот виден, а не спрятан.
;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const kernel = HEYS.TrainingKernel && HEYS.TrainingKernel.bibliography;
  if (!kernel || !kernel.createRegistry) {
    console.warn('[HEYS.dayBibliography] реестр ядра не загружен — источники недоступны');
    return;
  }

  const PUBMED = 'https://pubmed.ncbi.nlm.nih.gov/';

  /**
   * Записи. Схема ядра: { id, author, year, title, type, url, keyFinding, topics }.
   *
   * title оставлен пустым намеренно: названия работ в коде нет, а
   * восстанавливать его по памяти — тот же вымысел, что выдуманная ссылка.
   * Бейдж показывает «автор год» и ведёт на PubMed, где название и стоит.
   */
  const SOURCES = [
    {
      id: 'leibel1995',
      author: 'Leibel',
      year: 1995,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '7632212/',
      pmid: '7632212',
      strength: 'high',
      keyFinding: 'При дефиците обмен адаптируется примерно на 15 % — компенсировать весь долг калорий перебор.',
      topics: ['adaptation', 'debt']
    },
    {
      id: 'hall2011',
      author: 'Hall',
      year: 2011,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '21872751/',
      pmid: '21872751',
      strength: 'high',
      keyFinding: 'Постепенные изменения дают устойчивый результат надёжнее резких; трёх-пяти дней хватает, чтобы увидеть тренд.',
      topics: ['adaptation', 'debt', 'trend']
    },
    {
      id: 'rosenbaum2010',
      author: 'Rosenbaum & Leibel',
      year: 2010,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '20107198/',
      pmid: '20107198',
      strength: 'high',
      keyFinding: 'При хроническом дефиците расход падает сильнее, чем предсказывает формула по массе — поэтому расчёт расходится с фактом и нуждается в поправке.',
      topics: ['adaptation', 'norm-correction']
    }
  ];

  const registry = kernel.createRegistry(SOURCES);

  HEYS.DayBibliography = {
    SOURCES,
    registry,
    /** Источники по id, в порядке запроса; несуществующие молча выпадают. */
    resolve: (ids) => registry.resolve(ids),
    /** id, для которых записи нет: долг реестра, а не ошибка вызова. */
    missing: (ids) => registry.missing(ids),
    get: (id) => registry.get(id)
  };
})(typeof window !== 'undefined' ? window : globalThis);
