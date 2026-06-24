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
      title: 'Warm-up revisited: the RAMP method of optimising warm-ups', keyFinding: 'Структура разминки Raise → Activate → Mobilise → Potentiate.' },
    behm2016: { id: 'behm2016', author: 'Behm et al.', year: 2016, type: 'peer-reviewed', strength: 'A', url: '', topics: ['rom', 'warmup', 'safety'],
      title: 'Acute effects of muscle stretching on physical performance, ROM and injury', keyFinding: 'Динамика перед нагрузкой предпочтительнее; длинная статика (>60 с) даёт малый обратимый дефицит силы.' },
    blazevich2014: { id: 'blazevich2014', author: 'Blazevich', year: 2014, type: 'peer-reviewed', strength: 'A', url: '', topics: ['mechanisms', 'rom'],
      title: 'Neuromuscular and mechanical factors in stretch-induced ROM change', keyFinding: 'При хроническом тренинге снижается жёсткость мышечно-сухожильного блока (механическая школа).' },
    warneke2025delphi: { id: 'warneke2025delphi', author: 'Warneke, Behm, Blazevich et al.', year: 2025, type: 'guideline', strength: 'A', url: '', topics: ['rom', 'safety'],
      title: 'Practical recommendations on stretching exercise: a Delphi consensus', keyFinding: 'Единые определения методов растяжки и рекомендации по 8 областям применения.' },
    warneke2024posture: { id: 'warneke2024posture', author: 'Warneke et al.', year: 2024, type: 'peer-reviewed', strength: 'A', url: '', topics: ['mechanisms'],
      title: 'Stretching and posture: a systematic review', keyFinding: 'Изолированная растяжка не исправляет осанку (23 исследования).' },
    jospt2017neck: { id: 'jospt2017neck', author: 'Blanpied et al.', year: 2017, type: 'guideline', strength: 'A', url: 'https://www.jospt.org/doi/10.2519/jospt.2017.0302', topics: ['posture', 'safety'],
      title: 'Neck Pain: Revision 2017 Clinical Practice Guidelines', keyFinding: 'Для шеи полезны ROM, глубокие сгибатели, лопаточно-грудная выносливость и постепенное укрепление.' },
    warneke2024strengthposture: { id: 'warneke2024strengthposture', author: 'Warneke, Lohmann & Wilke', year: 2024, type: 'peer-reviewed', strength: 'A', url: 'https://pubmed.ncbi.nlm.nih.gov/38834878/', topics: ['posture', 'mechanisms'],
      title: 'Effects of stretching or strengthening exercise on spinal and lumbopelvic posture', keyFinding: 'Для осанки приоритет у укрепления ослабленных мышц; одной растяжки недостаточно.' },
    konrad2023: { id: 'konrad2023', author: 'Konrad et al.', year: 2023, type: 'peer-reviewed', strength: 'A', url: '', topics: ['rom'],
      title: 'Acute effects of stretching techniques on ROM: a meta-analysis', keyFinding: 'Статика и PNF дают больший острый прирост ROM, чем баллистика.' },
    cook_boyle_jbj: { id: 'cook_boyle_jbj', author: 'Cook & Boyle', year: 2010, type: 'practitioner', strength: 'B', url: '', topics: ['assessment'],
      title: 'Joint-by-joint approach / Functional Movement Screen', keyFinding: 'Суставы чередуют потребность в подвижности и стабильности; лимитер локален.' },
    spina_frc: { id: 'spina_frc', author: 'Spina', year: 2017, type: 'practitioner', strength: 'C', url: '', topics: ['rom', 'assessment'],
      title: 'Functional Range Conditioning (CARs / PAILs-RAILs)', keyFinding: 'Контролируемые вращения и изометрия в конечном диапазоне для здоровья и контроля сустава.' },
    behmwilke2019: { id: 'behmwilke2019', author: 'Behm & Wilke', year: 2019, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery', 'mechanisms'],
      title: 'Do self-myofascial release devices release myofascia? Mechanisms', keyFinding: 'Эффект МФР во многом нейральный (gate control / DNIC), а не «расправление фасции»; есть non-local.' },
    dupuy2018: { id: 'dupuy2018', author: 'Dupuy et al.', year: 2018, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery'],
      title: 'An evidence-based approach for choosing post-exercise recovery techniques (meta-analysis)', keyFinding: 'Массаж и активное восстановление — сильнейшие против DOMS и усталости.' },
    vanhooren2018: { id: 'vanhooren2018', author: 'Van Hooren & Peake', year: 2018, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery'],
      title: 'Do we need a cool-down after exercise? A narrative review', keyFinding: 'Активная заминка по большинству маркеров восстановления неэффективна.' },
    roberts2015: { id: 'roberts2015', author: 'Roberts et al.', year: 2015, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery', 'safety'],
      title: 'Post-exercise cold water immersion attenuates training adaptations', keyFinding: 'Холод сразу после силовой притупляет долгосрочную адаптацию — важен тайминг.' },
    eccflex2022: { id: 'eccflex2022', author: 'Систематический обзор', year: 2022, type: 'peer-reviewed', strength: 'A', url: '', topics: ['rom'],
      title: 'Eccentric exercise improves joint flexibility: a meta-analysis', keyFinding: 'Эксцентрика растит ROM сопоставимо со статикой и добавляет силу в удлинённой позиции.' },
    fifa11plus: { id: 'fifa11plus', author: 'Bizzini & Dvorak', year: 2015, type: 'guideline', strength: 'A', url: '', topics: ['safety', 'warmup'],
      title: 'FIFA 11+ injury prevention programme', keyFinding: 'Динамическая разминка + эксцентрика снижают травмы (в отличие от одной статики).' },
    slowbreath2022: { id: 'slowbreath2022', author: 'Laborde et al.', year: 2022, type: 'peer-reviewed', strength: 'A', url: '', topics: ['breath', 'recovery'],
      title: 'Effects of slow-paced breathing on heart rate variability: a meta-analysis', keyFinding: 'Медленное дыхание ~6/мин с удлинённым выдохом повышает вагусный тонус и ВСР.' },
    spiegel2023: { id: 'spiegel2023', author: 'Balban, Spiegel, Huberman et al.', year: 2023, type: 'peer-reviewed', strength: 'A', url: '', topics: ['breath'],
      title: 'Brief structured respiration practices enhance mood and reduce arousal', keyFinding: 'Циклический вздох 5 мин/день обходит медитацию по настроению и снижению возбуждения.' },
    bisconti2020: { id: 'bisconti2020', author: 'Bisconti et al.', year: 2020, type: 'peer-reviewed', strength: 'A', url: '', topics: ['vascular'],
      title: 'Chronic passive stretching improves vascular function', keyFinding: 'Хроническая пассивная растяжка снижает жёсткость артерий и улучшает функцию эндотелия.' },
    magnusson1996: { id: 'magnusson1996', author: 'Magnusson et al.', year: 1996, type: 'peer-reviewed', strength: 'A', url: '', topics: ['mechanisms', 'rom'],
      title: 'A mechanism for altered flexibility: stretch tolerance', keyFinding: 'Острый рост ROM объясняется ростом толерантности к растяжению (сенсорная школа).' },
    aaos_rom: { id: 'aaos_rom', author: 'AAOS', year: 1965, type: 'guideline', strength: 'C', url: '', topics: ['assessment'],
      title: 'Joint Motion: Method of Measuring and Recording', keyFinding: 'Нормативные значения амплитуды суставов — референс для §8.1.1.' },
    cook2009: { id: 'cook2009', author: 'Cook & Purdam', year: 2009, type: 'peer-reviewed', strength: 'A', url: '', topics: ['recovery', 'safety'],
      title: 'Is tendon pathology a continuum? Load management model', keyFinding: 'Ткань отвечает на дозированную нагрузку; полный покой снижает несущую способность.' },
    rio2015: { id: 'rio2015', author: 'Rio et al.', year: 2015, type: 'peer-reviewed', strength: 'B', url: '', topics: ['recovery', 'safety'],
      title: 'Isometric exercise induces analgesia in tendinopathy', keyFinding: 'Изометрия даёт анальгезию и снижает торможение — стартовая ступень реабилитации.' }
  };

  const EFFECT_MAP = {
    rom: { id: 'rom', verdict: 'positive', confidence: 'A', msg: 'ROM растёт остро и хронически; методы сопоставимы по приросту амплитуды' },
    acute_strength: { id: 'acute_strength', verdict: 'caution', confidence: 'A', msg: 'длинная статика перед мощностью может дать малый обратимый дефицит' },
    chronic_strength: { id: 'chronic_strength', verdict: 'limited', confidence: 'A', msg: 'для силы нужен силовой тренинг; растяжка слабый инструмент силы' },
    hypertrophy: { id: 'hypertrophy', verdict: 'no_practical_effect', confidence: 'B', msg: 'при практических человеческих дозах рост мышц от растяжки не обещаем' },
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
      title: 'Источники и методология',
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
