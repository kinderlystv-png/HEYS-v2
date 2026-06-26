// heys_mobility_bibliography_v1.js — источники (rich) + honest effect map.
//
// Механизм реестра и UI («Источники и методология») — из ОБЩЕГО ЯДРА:
//   _kernel/heys_kernel_bibliography_v1.js (реестр) + _kernel/heys_kernel_bibliography_ui_v1.js (UI).
// Здесь — только ДОМЕННЫЕ данные: записи источников (rich-схема, как у пальцев),
// EFFECT_MAP (методология §2.5) и доменные лейблы тем/типов. Один экран на все режимы.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__bibliographyRegistered) return;
  Mobility.__bibliographyRegistered = true;

  const React = global.React;

  // Rich-схема (как у пальцев): { id, author, year, title, type, url, keyFinding, topics:[], strength }
  const BIBLIOGRAPHY = {
    jeffreys2007: { id: 'jeffreys2007', author: 'Jeffreys', year: 2007, type: 'practitioner', strength: 'B', url: '', topics: ['warmup'],
      title: 'Как выстроить разминку перед нагрузкой', keyFinding: 'Разминка должна постепенно поднять пульс, включить нужные мышцы, раскрыть движение и подготовить к основной работе.' },
    behm2016: { id: 'behm2016', author: 'Behm et al.', year: 2016, type: 'peer-reviewed', strength: 'A', url: '', topics: ['rom', 'warmup', 'safety'],
      title: 'Как растяжка влияет на движение, силу и риск травм', keyFinding: 'Перед нагрузкой лучше динамическая работа; долгую статику стоит оставлять на спокойные дни или конец занятия.' },
    blazevich2014: { id: 'blazevich2014', author: 'Blazevich', year: 2014, type: 'peer-reviewed', strength: 'A', url: '', topics: ['mechanisms', 'rom'],
      title: 'Почему регулярная работа расширяет движение', keyFinding: 'При регулярной практике ткани и нервная система постепенно легче допускают больший диапазон движения.' },
    warneke2025delphi: { id: 'warneke2025delphi', author: 'Warneke, Behm, Blazevich et al.', year: 2025, type: 'guideline', strength: 'A', url: '', topics: ['rom', 'safety'],
      title: 'Практические рекомендации по растяжке', keyFinding: 'Растяжка работает по-разному в разминке, восстановлении и развитии диапазона, поэтому план разделяет эти задачи.' },
    warneke2024posture: { id: 'warneke2024posture', author: 'Warneke et al.', year: 2024, type: 'peer-reviewed', strength: 'A', url: '', topics: ['mechanisms'],
      title: 'Почему одной растяжки мало для осанки', keyFinding: 'Изолированная растяжка сама по себе не исправляет осанку, поэтому курс сочетает контроль, силу и восстановление.' },
    jospt2017neck: { id: 'jospt2017neck', author: 'Blanpied et al.', year: 2017, type: 'guideline', strength: 'A', url: 'https://www.jospt.org/doi/10.2519/jospt.2017.0302', topics: ['posture', 'safety'],
      title: 'Рекомендации по безопасной работе с шеей', keyFinding: 'Для шеи важны мягкий диапазон движения, глубокие сгибатели, выносливость лопаток и постепенное укрепление.' },
    warneke2024strengthposture: { id: 'warneke2024strengthposture', author: 'Warneke, Lohmann & Wilke', year: 2024, type: 'peer-reviewed', strength: 'A', url: 'https://pubmed.ncbi.nlm.nih.gov/38834878/', topics: ['posture', 'mechanisms'],
      title: 'Растяжка и укрепление в работе над осанкой', keyFinding: 'Для осанки приоритет у укрепления слабых звеньев; растяжка помогает, но не должна быть единственным инструментом.' },
    konrad2023: { id: 'konrad2023', author: 'Konrad et al.', year: 2023, type: 'peer-reviewed', strength: 'A', url: '', topics: ['rom'],
      title: 'Какие методы быстрее расширяют движение', keyFinding: 'Спокойная статика и формат «напрячь-расслабить» дают быстрый прирост диапазона лучше, чем резкие пружинящие движения.' },
    cook_boyle_jbj: { id: 'cook_boyle_jbj', author: 'Cook & Boyle', year: 2010, type: 'practitioner', strength: 'B', url: '', topics: ['assessment'],
      title: 'Подход по суставам: где нужна подвижность, а где контроль', keyFinding: 'Разные зоны тела требуют разного акцента: где-то нужен диапазон, где-то стабильность и контроль.' },
    spina_frc: { id: 'spina_frc', author: 'Spina', year: 2017, type: 'practitioner', strength: 'C', url: '', topics: ['rom', 'assessment'],
      title: 'Контроль сустава в доступном диапазоне', keyFinding: 'Медленные вращения и мягкая изометрия помогают удерживать контроль в крайних положениях без рывков.' },
    behmwilke2019: { id: 'behmwilke2019', author: 'Behm & Wilke', year: 2019, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery', 'mechanisms'],
      title: 'Как массажёр и ролл влияют на ощущения', keyFinding: 'Ролл и массажёр чаще помогают через нервную систему и снижение чувствительности, а не через «разбивание» тканей.' },
    dupuy2018: { id: 'dupuy2018', author: 'Dupuy et al.', year: 2018, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery'],
      title: 'Какие методы восстановления лучше снижают усталость', keyFinding: 'Массаж и лёгкое активное восстановление лучше всего помогают субъективной усталости и мышечной болезненности.' },
    vanhooren2018: { id: 'vanhooren2018', author: 'Van Hooren & Peake', year: 2018, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery'],
      title: 'Нужна ли заминка после тренировки', keyFinding: 'Заминка может дать комфорт, но сама по себе не гарантирует более быстрое восстановление.' },
    roberts2015: { id: 'roberts2015', author: 'Roberts et al.', year: 2015, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery', 'safety'],
      title: 'Когда холод может мешать адаптации', keyFinding: 'Холод сразу после силовой работы может ослабить долгосрочную адаптацию, поэтому важен момент применения.' },
    eccflex2022: { id: 'eccflex2022', author: 'Систематический обзор', year: 2022, type: 'peer-reviewed', strength: 'A', url: '', topics: ['rom'],
      title: 'Силовая работа в удлинённом положении', keyFinding: 'Контролируемая силовая работа в удлинённой позиции расширяет диапазон и одновременно добавляет силу.' },
    fifa11plus: { id: 'fifa11plus', author: 'Bizzini & Dvorak', year: 2015, type: 'guideline', strength: 'A', url: '', topics: ['safety', 'warmup'],
      title: 'Профилактическая разминка перед спортом', keyFinding: 'Динамическая разминка вместе с силовой работой снижает риск травм лучше, чем одна статическая растяжка.' },
    slowbreath2022: { id: 'slowbreath2022', author: 'Laborde et al.', year: 2022, type: 'peer-reviewed', strength: 'A', url: '', topics: ['breath', 'recovery'],
      title: 'Медленное дыхание и восстановление', keyFinding: 'Медленное дыхание около 6 циклов в минуту с длинным выдохом помогает успокоить нервную систему.' },
    spiegel2023: { id: 'spiegel2023', author: 'Balban, Spiegel, Huberman et al.', year: 2023, type: 'peer-reviewed', strength: 'A', url: '', topics: ['breath'],
      title: 'Короткие дыхательные практики для снижения возбуждения', keyFinding: 'Короткие структурированные дыхательные практики могут улучшать настроение и снижать возбуждение.' },
    bisconti2020: { id: 'bisconti2020', author: 'Bisconti et al.', year: 2020, type: 'peer-reviewed', strength: 'A', url: '', topics: ['vascular'],
      title: 'Регулярная пассивная растяжка и сосуды', keyFinding: 'Регулярная пассивная растяжка может улучшать сосудистые показатели, но это не заменяет тренировку.' },
    magnusson1996: { id: 'magnusson1996', author: 'Magnusson et al.', year: 1996, type: 'peer-reviewed', strength: 'A', url: '', topics: ['mechanisms', 'rom'],
      title: 'Почему движение быстро становится свободнее', keyFinding: 'Быстрый прирост диапазона часто связан с тем, что нервная система спокойнее переносит растяжение.' },
    aaos_rom: { id: 'aaos_rom', author: 'AAOS', year: 1965, type: 'guideline', strength: 'C', url: '', topics: ['assessment'],
      title: 'Как измерять движение суставов', keyFinding: 'Нормативы амплитуды помогают сравнить текущие замеры с понятным ориентиром.' },
    cook2009: { id: 'cook2009', author: 'Cook & Purdam', year: 2009, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery', 'safety'],
      title: 'Почему тканям нужна дозированная нагрузка', keyFinding: 'Полный покой не всегда помогает: ткани лучше адаптируются к аккуратной, дозированной нагрузке.' },
    rio2015: { id: 'rio2015', author: 'Rio et al.', year: 2015, type: 'peer-reviewed', strength: 'B', url: '', topics: ['recovery', 'safety'],
      title: 'Изометрия как мягкий старт при раздражении тканей', keyFinding: 'Удержания без движения могут временно снижать боль и подходят как осторожный старт.' }
  };

  const EFFECT_MAP = {
    rom: { id: 'rom', verdict: 'positive', confidence: 'A', msg: 'амплитуда движения растёт и быстро, и при регулярной практике' },
    acute_strength: { id: 'acute_strength', verdict: 'caution', confidence: 'A', msg: 'длинная статика перед мощностью может дать малый обратимый дефицит' },
    chronic_strength: { id: 'chronic_strength', verdict: 'limited', confidence: 'A', msg: 'для силы нужен силовой тренинг; растяжка слабый инструмент силы' },
    hypertrophy: { id: 'hypertrophy', verdict: 'no_practical_effect', confidence: 'B', msg: 'при обычных тренировочных объёмах рост мышц от растяжки не обещаем' },
    tissue_stiffness: { id: 'tissue_stiffness', verdict: 'positive', confidence: 'A', msg: 'хроническая растяжка может снижать пассивную жёсткость' },
    injury: { id: 'injury', verdict: 'caution', confidence: 'A', msg: 'одна статика ненадёжна; динамическая разминка + эксцентрика сильнее' },
    recovery: { id: 'recovery', verdict: 'limited', confidence: 'A', msg: 'заминка даёт комфорт, но не ускоряет суперкомпенсацию' },
    posture: { id: 'posture', verdict: 'no_effect', confidence: 'A', msg: 'изолированная растяжка не исправляет осанку' },
    vascular: { id: 'vascular', verdict: 'positive', confidence: 'A', msg: 'пассивная растяжка может улучшать сосудистые маркеры' }
  };

  // Лейблы тем/типов — ДОМЕННЫЕ (передаются в общий UI-компонент).
  const TOPIC_LABELS = {
    warmup: 'Разминка', rom: 'Амплитуда', recovery: 'Восстановление', breath: 'Дыхание',
    posture: 'Осанка',
    safety: 'Безопасность', mechanisms: 'Механизмы', assessment: 'Тесты', vascular: 'Сосуды'
  };
  const TYPE_LABELS = {
    'peer-reviewed': { label: 'Научная статья', color: '#16a34a' },
    practitioner: { label: 'Практик-методист', color: '#2563eb' },
    guideline: { label: 'Гайдлайн', color: '#d97706' }
  };
  const TYPE_ORDER = ['peer-reviewed', 'practitioner', 'guideline'];
  const TYPE_GROUP_LABELS = {
    'peer-reviewed': 'Научные статьи', practitioner: 'Практики и методисты', guideline: 'Гайдлайны и стандарты'
  };

  // Реестр-механизм — из ОБЩЕГО ЯДРА (single source).
  const KB = HEYS.TrainingKernel && HEYS.TrainingKernel.bibliography;
  if (!KB || typeof KB.createRegistry !== 'function') {
    throw new Error('[mobility.bibliography] требуется HEYS.TrainingKernel.bibliography — загрузите _kernel/heys_kernel_bibliography_v1.js раньше');
  }
  const reg = KB.createRegistry(BIBLIOGRAPHY);

  function getSource(id) { return reg.get(id); }
  function resolveSources(ids) { return reg.resolve(ids); }
  function missingSources(ids) { return reg.missing(ids); }
  function getEffect(id) { return EFFECT_MAP[id] || null; }

  // UI — из ОБЩЕГО ЯДРА (single source). classPrefix 'fingers-bib'/'fingers-source-badge'
  // — переиспользуем существующий CSS, чтобы экран выглядел так же, как у пальцев.
  function _kui() { return HEYS.TrainingKernel && HEYS.TrainingKernel.bibliographyUI; }

  function SourceBadge(props) {
    const kui = _kui();
    if (!kui || !React) return null;
    const src = reg.get(props && props.sourceId);
    if (!src) return null;
    return kui.SourceBadge({
      source: src,
      classPrefix: 'fingers-source-badge',
      icon: '📖',
      eventName: 'mobility-open-bibliography',
      onClick: props && props.onClick
    });
  }

  function BibliographyModal(props) {
    const kui = _kui();
    if (!kui || !React) return null;
    return kui.BibliographyModal({
      sources: reg.all(),
      onClose: props && props.onClose,
      focusSourceId: props && props.focusSourceId,
      classPrefix: 'fingers-bib',
      title: 'Обоснование плана',
      titleIcon: '▤',
      subtitleText: reg.all().length + ' исследований и рекомендаций, на которых основаны план и ограничения',
      topicLabels: TOPIC_LABELS,
      typeLabels: TYPE_LABELS,
      typeOrder: TYPE_ORDER,
      typeGroupLabels: TYPE_GROUP_LABELS
    });
  }

  Mobility.bibliography = {
    __registered: true,
    BIBLIOGRAPHY: BIBLIOGRAPHY,
    EFFECT_MAP: EFFECT_MAP,
    TOPIC_LABELS: TOPIC_LABELS,
    TYPE_LABELS: TYPE_LABELS,
    getSource: getSource,
    resolveSources: resolveSources,
    missingSources: missingSources,
    strengthOf: reg.strengthOf,
    getEffect: getEffect,
    SourceBadge: SourceBadge,
    BibliographyModal: BibliographyModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
