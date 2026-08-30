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
// отсутствующих — они выглядят обоснованием и им не являются. Поэтому в реестре
// двадцать пять записей, а не сто шесть: у остальных PMID в коде стоит голый
// номер, и восстанавливать по нему автора значит выдумывать. Долг остаётся
// видимым через missing() и счётчик в тесте, а не прячется за правдоподобием.
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
      id: 'aragon2013',
      author: 'Aragon',
      year: 2013,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '23360586/',
      pmid: '23360586',
      strength: 'high',
      keyFinding: 'Нутриент-тайминг вокруг тренировки: недоедание в тренировочный день стоит результата.',
      topics: ['training', 'timing']
    },
    {
      id: 'defronzo1979',
      author: 'DeFronzo',
      year: 1979,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '510806/',
      pmid: '510806',
      strength: 'high',
      keyFinding: 'С возрастом растёт инсулинорезистентность — та же еда обходится дороже.',
      topics: ['age', 'insulin']
    },
    {
      id: 'epel2001',
      author: 'Epel',
      year: 2001,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '11070333/',
      pmid: '11070333',
      strength: 'high',
      keyFinding: 'Кортизол при стрессе смещает выбор еды и повышает риск переедания.',
      topics: ['stress', 'binge']
    },
    {
      id: 'garaulet2013',
      author: 'Garaulet',
      year: 2013,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '23357955/',
      pmid: '23357955',
      strength: 'high',
      keyFinding: 'Позднее время основного приёма пищи связано с худшим результатом снижения веса.',
      topics: ['circadian', 'timing']
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
      id: 'herman1984',
      author: 'Herman & Polivy',
      year: 1984,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '6727817/',
      pmid: '6727817',
      strength: 'high',
      keyFinding: 'Жёсткое ограничение само по себе провоцирует срыв: запрет усиливает тягу.',
      topics: ['restraint', 'binge']
    },
    {
      id: 'ivy1998',
      author: 'Ivy & Kuo',
      year: 1998,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '9694422/',
      pmid: '9694422',
      strength: 'high',
      keyFinding: 'Восполнение гликогена быстрее в первые часы после нагрузки.',
      topics: ['training', 'recovery']
    },
    {
      id: 'jakubowicz2013',
      author: 'Jakubowicz',
      year: 2013,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '23512957/',
      pmid: '23512957',
      strength: 'high',
      keyFinding: 'Перенос калорий на первую половину дня улучшает результат при том же суточном итоге.',
      topics: ['circadian', 'timing']
    },
    {
      id: 'kahn2000',
      author: 'Kahn & Flier',
      year: 2000,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '10953022/',
      pmid: '10953022',
      strength: 'high',
      keyFinding: 'Ожирение и инсулинорезистентность связаны механизмом, а не только статистикой.',
      topics: ['bmi', 'insulin']
    },
    {
      id: 'laforgia2006',
      author: 'LaForgia',
      year: 2006,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '16825252/',
      pmid: '16825252',
      strength: 'high',
      keyFinding: 'Дожигание после нагрузки добавляет к затратам тренировки заметную долю.',
      topics: ['training', 'epoc']
    },
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
      id: 'leidy2011',
      author: 'Leidy',
      year: 2011,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '21123467/',
      pmid: '21123467',
      strength: 'high',
      keyFinding: 'Белок на завтрак снижает тягу к еде в течение дня.',
      topics: ['protein', 'satiety']
    },
    {
      id: 'magkos2008',
      author: 'Magkos',
      year: 2008,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '18583478/',
      pmid: '18583478',
      strength: 'high',
      keyFinding: 'Расход остаётся повышенным и на следующий день после нагрузки.',
      topics: ['training', 'epoc']
    },
    {
      id: 'mettler2010',
      author: 'Mettler',
      year: 2010,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '20095013/',
      pmid: '20095013',
      strength: 'high',
      keyFinding: 'Белок сохраняет мышцы при дефиците — его доля важнее общего снижения калорий.',
      topics: ['protein', 'deficit']
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
    },
    {
      id: 'simopoulos2008',
      author: 'Simopoulos',
      year: 2008,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '18408140/',
      pmid: '18408140',
      strength: 'high',
      keyFinding: 'Соотношение омега-6 к омега-3 в рационе влияет на воспалительный фон.',
      topics: ['nutrition', 'fats']
    },
    {
      id: 'spiegel2004',
      author: 'Spiegel',
      year: 2004,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '15602591/',
      pmid: '15602591',
      strength: 'high',
      keyFinding: 'Недосып смещает гормоны голода и усиливает аппетит.',
      topics: ['sleep', 'appetite']
    },
    {
      id: 'tomiyama2018',
      author: 'Tomiyama',
      year: 2018,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '29866473/',
      pmid: '29866473',
      strength: 'high',
      keyFinding: 'Хронический стресс диеты сам становится фактором набора веса.',
      topics: ['stress', 'restraint']
    },
    {
      id: 'vancauter1997',
      author: 'Van Cauter',
      year: 1997,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '9331550/',
      pmid: '9331550',
      strength: 'high',
      keyFinding: 'Чувствительность к инсулину подчинена суточному ритму: поздняя еда усваивается хуже.',
      topics: ['circadian', 'insulin']
    },
    {
      id: 'westerterp2004',
      author: 'Westerterp',
      year: 2004,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '15507147/',
      pmid: '15507147',
      strength: 'high',
      keyFinding: 'Термический эффект пищи зависит от состава: больше белка — выше траты на переваривание.',
      topics: ['tef', 'nutrition']
    },
    {
      id: 'borbely1982',
      author: 'Borbély',
      year: 1982,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '6128309/',
      pmid: '6128309',
      strength: 'high',
      keyFinding: 'Сон управляется двумя процессами: накопленной усталостью и суточным ритмом — их рассогласование и даёт плохой сон.',
      topics: ['sleep', 'circadian']
    },
    // Инсайты: методы разбора рядов, а не физиология. Живут в том же реестре —
    // источник у них такой же проверяемый, и пропуск считается тем же missing().
    {
      id: 'granger1969',
      author: 'Granger',
      year: 1969,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '7608935/',
      pmid: '7608935',
      strength: 'high',
      keyFinding: 'Проверка причинности во временных рядах: один ряд предсказывает другой лучше, чем тот сам себя.',
      topics: ['analytics', 'causality']
    },
    {
      id: 'mcewen1998',
      author: 'McEwen',
      year: 1998,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '9428090/',
      pmid: '9428090',
      strength: 'high',
      keyFinding: 'Накопленная нагрузка стрессовых систем объясняет отложенные последствия.',
      topics: ['stress', 'load']
    },
    {
      id: 'monnier2006',
      author: 'Monnier',
      year: 2006,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '16936182/',
      pmid: '16936182',
      strength: 'high',
      keyFinding: 'Колебания глюкозы вредят сильнее ровно повышенного уровня.',
      topics: ['glucose', 'variability']
    },
    {
      id: 'scheffer2009',
      author: 'Scheffer',
      year: 2009,
      title: '',
      type: 'peer-reviewed',
      url: PUBMED + '19727193/',
      pmid: '19727193',
      strength: 'high',
      keyFinding: 'Перед резким переходом система подаёт ранние признаки потери устойчивости.',
      topics: ['analytics', 'early-warning']
    }  ];

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
