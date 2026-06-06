// heys_fingers_bibliography_v1.js — Источники и методология модуля «Тренировка пальцев».
// Wave 2-A: каталог библиографии + React SourceBadge chip + Modal со списком.
//
// Public API:
//   HEYS.Fingers.BIBLIOGRAPHY                 — массив источников (см. формат ниже)
//   HEYS.Fingers.getSourceById(sourceId)      — lookup по id
//   HEYS.Fingers.SourceBadge({sourceId,onClick}) — inline chip «📚 author year»
//   HEYS.Fingers.BibliographyModal({onClose}) — модалка со списком + фильтрами
//
// Каждый источник:
//   { id, author, year, title, type, url, keyFinding, topics: [] }
//   type:   'peer-reviewed' | 'practitioner' | 'guideline'
//   topics: 'biomechanics' | 'protocols' | 'safety' | 'recovery' | 'calibration'
//
// Topic chips нужны для пользовательской фильтрации в Modal.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__bibliographyRegistered) return; // idempotent
  Fingers.__bibliographyRegistered = true;

  const React = global.React;

  /** @type {Array<{id:string,author:string,year:number,title:string,type:string,url:string,keyFinding:string,topics:string[]}>} */
  const BIBLIOGRAPHY = [
    {
      id: 'schweizer2008',
      author: 'Schweizer',
      year: 2008,
      title: 'Biomechanical properties of the crimp grip position in rock climbers',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/18495151/',
      keyFinding: 'В crimp-позиции нагрузка на блок A2 в ~31.5 раза выше, чем при открытом хвате. Это объясняет, почему full crimp — главная причина разрывов пальцевых блоков.',
      topics: ['biomechanics', 'safety']
    },
    {
      id: 'schoffl2021',
      author: 'Schöffl et al.',
      year: 2021,
      title: 'Pulley Injuries in Rock Climbers: A Systematic Review',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/34197338/',
      keyFinding: 'A2 — самый травмируемый блок (~70% всех pulley injuries). Восстановление: grade I — 4-6 недель, grade III-IV — хирургия + 3-6 месяцев.',
      topics: ['safety', 'recovery']
    },
    {
      // Силовая методология Лопес (MAW vs MED). Sports Technology НЕ индексируется
      // в PubMed — ссылка на издательский DOI (Taylor & Francis), не на pubmed.
      // Раньше эта запись жила под id 'lopez2019' с year:2019 и битым PubMed-URL
      // (PMID 30975050 = статья про гипсы при переломах ладьевидной кости, не по теме).
      id: 'lopez2012',
      author: 'López-Rivera & González-Badillo',
      year: 2012,
      title: 'The effects of two maximum grip strength training methods using the same effort duration and different edge depth on grip endurance in elite climbers',
      type: 'peer-reviewed',
      url: 'https://doi.org/10.1080/19346182.2012.716061',
      keyFinding: 'Сравнила два метода максимальной силы пальцев при равной длительности усилия у элитных лазунов (8a+): MAW (ребро 18 мм + максимальный добавочный вес) и MED (минимальное ребро под весом тела). Вывод: MED — рабочая альтернатива добавочному весу и щадит сухожилия/шкивы. Методику позже подтвердило исследование López 2016 (≈28% прироста максимальной силы).',
      topics: ['protocols', 'calibration', 'safety']
    },
    {
      // Истинная статья 2019 года (peer-reviewed, PubMed). Про силовую ВЫНОСЛИВОСТЬ
      // хвата, не про максимальную силу — поэтому из max-протоколов на неё больше
      // не ссылаемся (они теперь на lopez2012); подключена к repeaters_7_3.
      id: 'lopez2019',
      author: 'López-Rivera & González-Badillo',
      year: 2019,
      title: 'Comparison of the Effects of Three Hangboard Strength and Endurance Training Programs on Grip Endurance in Sport Climbers',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30988852/',
      keyFinding: '8 недель, 26 опытных лазунов (7c+/8a). Прерывистые висы (intermittent dead-hangs, как repeaters) на минимальном ребре дали наибольший прирост силовой выносливости хвата (+45%), максимальные висы — +34%, комбинация — лишь +7%. Для выносливости хвата прерывистый метод эффективнее.',
      topics: ['protocols']
    },
    {
      id: 'giles2019',
      author: 'Giles et al.',
      year: 2019,
      title: 'A Novel Approach to Determining Critical Force in Rock Climbers',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/31436481/',
      keyFinding: 'Тест Critical Force на edge 20 мм воспроизводим (ICC > 0.9) и предсказывает performance лучше, чем разовое MVC.',
      topics: ['calibration', 'protocols']
    },
    {
      id: 'horst_podcast10',
      author: 'Hörst',
      year: 2022,
      title: 'Training For Climbing Podcast #10 — Max Hangs Protocol',
      type: 'practitioner',
      url: 'https://trainingforclimbing.com/podcast/',
      keyFinding: 'Max Hangs: 10 секунд виса с добавочным весом, 4-5 подходов, отдых 3 минуты между подходами. База ≥1 год лазания обязательна.',
      topics: ['protocols']
    },
    {
      id: 'horst_753',
      author: 'Hörst',
      year: 2016,
      title: '7-53 Repeaters Routine (Training for Climbing)',
      type: 'practitioner',
      url: 'https://trainingforclimbing.com/7-53-repeater-routine/',
      keyFinding: 'Классические repeaters 7 с виса / 3 с отдыха × 6 = 1 подход. 6 подходов, отдых 3 минуты. Лучший конструктор силовой выносливости.',
      topics: ['protocols']
    },
    {
      id: 'nelson_camp4',
      author: 'Nelson (Camp4HumanPerformance)',
      year: 2020,
      title: 'No-Hangs Protocol — Isometric Finger Loading Without Hanging',
      type: 'practitioner',
      url: 'https://www.camp4humanperformance.com/no-hangs',
      keyFinding: 'Изометрическое нагружение пальцев сидя с грузом 30-50% RPE. Безопасно для новичков и для дней с низкой готовностью.',
      topics: ['protocols', 'safety']
    },
    {
      id: 'bechtel_climbstrong',
      author: 'Bechtel (ClimbStrong)',
      year: 2018,
      title: 'Base Fitness: The Climbing Athlete Foundation',
      type: 'practitioner',
      url: 'https://www.climbstrong.com/education-center/base-fitness/',
      keyFinding: 'Сначала база общей физподготовки (8-12 недель), только потом — целевые fingerboard-протоколы. Иначе риск травмы вырастает многократно.',
      topics: ['safety', 'protocols']
    },
    {
      id: 'beastmaker_1000',
      author: 'Beastmaker',
      year: 2015,
      title: 'Beastmaker 1000 Beginner Loop',
      type: 'practitioner',
      url: 'https://www.beastmaker.co.uk/training/',
      keyFinding: 'Стартовая программа: repeaters 7/3 × 6 на jugs/sloper/edge 20 мм. 3 подхода, отдых 2-3 минуты. Подходит для V1-V4.',
      topics: ['protocols']
    },
    {
      id: 'beastmaker_2000',
      author: 'Beastmaker',
      year: 2015,
      title: 'Beastmaker 2000 Pro Loop',
      type: 'practitioner',
      url: 'https://www.beastmaker.co.uk/training/',
      keyFinding: 'Продвинутая программа на мелких щёчках (15 мм и меньше), включая mono. Только для V7+ с минимум 2 годами регулярных тренировок.',
      topics: ['protocols']
    },
    {
      id: 'uiaa_medcom',
      author: 'UIAA Medical Commission',
      year: 2018,
      title: 'Consensus Statement: Youth Climbing Recommendations',
      type: 'guideline',
      url: 'https://www.theuiaa.org/medical_advice/',
      keyFinding: 'До 14 лет — никакого fingerboard и campus. 14-15 — открытый и полузамок без веса. До 16 лет — без full crimp. До 18 — без максимальных протоколов.',
      topics: ['safety']
    },
    {
      id: 'bmc_u18',
      author: 'British Mountaineering Council',
      year: 2019,
      title: 'BMC Youth Climbing Guidance — Fingerboarding & Campus Under 18',
      type: 'guideline',
      url: 'https://www.thebmc.co.uk/youth-climbing',
      keyFinding: 'Эпифизарные зоны роста закрываются к 16-18 годам. Преждевременный fingerboard может вызвать стресс-переломы фаланг (видны на МРТ через годы).',
      topics: ['safety']
    },
    {
      id: 'physivantage_collagen',
      author: 'Shaw et al. (Physivantage)',
      year: 2017,
      title: 'Vitamin C-enriched gelatin supplementation before intermittent activity augments collagen synthesis',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/27852613/',
      keyFinding: 'Синтез коллагена в сухожилиях занимает 48-72 часа после нагрузки. Это окно — обоснование 48-часового перерыва между max-сессиями на пальцы.',
      topics: ['recovery']
    },
    {
      id: 'magnusson2010',
      author: 'Magnusson, Langberg & Kjaer',
      year: 2010,
      title: 'The pathogenesis of tendinopathy: balancing the response to loading',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/20308995/',
      keyFinding: 'Сухожилия адаптируются медленнее мышц (×3-5). Перетренированность по пальцам — главная причина хронических тендинопатий у скалолазов.',
      topics: ['recovery', 'safety']
    },
    {
      id: 'lattice_critical_force',
      author: 'Lattice Training',
      year: 2020,
      title: 'Critical Force & Bodyweight Hang Standards for V5-V11',
      type: 'practitioner',
      url: 'https://latticetraining.com/critical-force/',
      keyFinding: 'BW-стандарты на 20 мм: V5 ≈ +25% BW (10 с), V7 ≈ +50%, V9 ≈ +80%, V11 ≈ +100%+. Хорошая reference-точка для калибровки стартового веса.',
      topics: ['calibration']
    },
    {
      id: 'balas2024_cf',
      author: 'Baláš et al.',
      year: 2024,
      title: 'Measuring critical force in sport climbers: a validation study of the 4 min all-out test on finger flexors',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/38668851/',
      keyFinding: '4-минутный all-out тест на полузамке валиден для оценки Critical Force пальцев (CF ≈ 20.1 кг; время до отказа на CF ≈ 440 с). Важно: CF как «среднее последних 3 повторов» — это тренд/ориентир, а не точный абсолютный потолок (end-force точнее). Ретест раз в 4-6 недель.',
      topics: ['calibration', 'protocols']
    },
    {
      id: 'kellawan2014',
      author: 'Kellawan & Tschakovsky',
      year: 2014,
      title: 'The single-bout forearm critical force test: a new method to establish forearm aerobic metabolic exercise intensity and capacity',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24699366/',
      keyFinding: 'Тест Critical Force предплечья за один подход воспроизводим (ICC 0.94) и предсказывает время до отказа (r=0.97). Ключ: разовый MVC НЕ предсказывает CF/W′ — нагрузку на выносливость надо привязывать к CF, а не к проценту от MVC.',
      topics: ['calibration']
    },
    {
      id: 'devise2022',
      author: 'Devise et al.',
      year: 2022,
      title: 'Effects of Different Hangboard Training Intensities on Finger Grip Strength, Stamina, and Endurance',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/35498522/',
      keyFinding: '4 недели, 54 лазуна, доска с датчиками силы. 100% MFS поднимает максимальную силу, но не выносливость; 60-80% MFS поднимает stamina/endurance. Адаптация intensity-специфична — сбалансированная тренировка должна задевать ≥2 зоны интенсивности.',
      topics: ['protocols', 'calibration']
    },
    {
      id: 'abrahangs2024',
      author: 'Gilmore et al.',
      year: 2024,
      title: 'Effects of Different Loading Programs on Finger Strength in Rock Climbers',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/39560837/',
      keyFinding: '10-минутные низкоинтенсивные висы («Abrahangs», ~40% усилия, длинные холды) дали такой же прирост силы хвата, как Max Hangs, а в комбинации — аддитивный эффект. Низкая нагрузка щадит сухожилия и вписывается в любую программу. Соавторы — Abrahamsson и Baar.',
      topics: ['protocols', 'recovery']
    }
  ];

  /** Lookup-индекс id → объект для O(1) доступа в SourceBadge. */
  const BY_ID = Object.create(null);
  BIBLIOGRAPHY.forEach((src) => { BY_ID[src.id] = src; });

  function getSourceById(sourceId) {
    return BY_ID[sourceId] || null;
  }

  /**
   * Inline chip-бейдж с автором и годом источника.
   * @param {{sourceId:string,onClick?:Function}} props
   */
  function SourceBadge(props) {
    if (!React) return null;
    const src = getSourceById(props && props.sourceId);
    if (!src) return null;
    const customClick = props && props.onClick;
    // Default behavior: dispatch event 'fingers-open-bibliography' с source id
    // → SessionUI слушает и открывает BibliographyModal с focus на этой записи.
    const handleClick = customClick
      ? function (e) {
          try { customClick(src, e); } catch (err) { console.warn('[Fingers.SourceBadge] onClick failed', err); }
        }
      : function () {
          try {
            window.dispatchEvent(new CustomEvent('fingers-open-bibliography', {
              detail: { sourceId: src.id }
            }));
          } catch (_) {}
        };
    return React.createElement('span', {
      className: 'fingers-source-badge fingers-source-badge--clickable',
      role: 'button',
      tabIndex: 0,
      title: src.author + ' ' + src.year + ' — ' + src.title,
      onClick: handleClick,
      onKeyDown: function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }
    },
      React.createElement('span', { className: 'fingers-source-badge__icon', 'aria-hidden': 'true' }, '📖'),
      React.createElement('span', { className: 'fingers-source-badge__author' }, src.author),
      React.createElement('span', { className: 'fingers-source-badge__year' }, src.year)
    );
  }

  const TOPIC_LABELS = {
    biomechanics: 'Биомеханика',
    protocols: 'Протоколы',
    safety: 'Безопасность',
    recovery: 'Восстановление',
    calibration: 'Калибровка'
  };

  const TYPE_LABELS = {
    'peer-reviewed': { label: 'Научная статья', color: '#16a34a' },
    practitioner: { label: 'Практик-методист', color: '#2563eb' },
    guideline: { label: 'Гайдлайн', color: '#d97706' }
  };
  // Группировка списка по типу: заголовок группы вместо бейджа в каждой карточке.
  const TYPE_ORDER = ['peer-reviewed', 'practitioner', 'guideline'];
  const TYPE_GROUP_LABELS = {
    'peer-reviewed': 'Научные статьи',
    practitioner: 'Практики и методисты',
    guideline: 'Гайдлайны и стандарты'
  };

  // Маппинг type → emoji-иконка для visual quick-recognition.
  function _typeIcon(t) {
    return t === 'peer-reviewed' ? '🔬'
      : t === 'practitioner' ? '🧗'
      : t === 'guideline' ? '📋' : '📚';
  }

  /**
   * Премиум-модалка «Источники и методология».
   * @param {{onClose:Function, focusSourceId?:string}} props
   *   focusSourceId — если передан, открывается с этим источником в expanded
   *   состоянии и со скроллом к нему. Используется когда SourceBadge клацнули.
   */
  function BibliographyModal(props) {
    if (!React) return null;
    const onClose = (props && props.onClose) || function () {};
    const focusSourceId = props && props.focusSourceId;

    const [query, setQuery] = React.useState('');
    const [activeTopic, setActiveTopic] = React.useState(null);
    // Раскрытая карточка (для key finding deep-read). По default — focusSourceId.
    const [expandedId, setExpandedId] = React.useState(focusSourceId || null);

    // Escape close + scroll to focused.
    React.useEffect(function () {
      function onKey(e) { if (e.key === 'Escape') onClose(); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, [onClose]);

    React.useEffect(function () {
      if (focusSourceId) {
        // Defer чтобы render успел положить узлы.
        const t = setTimeout(function () {
          const el = document.querySelector('[data-bib-source="' + focusSourceId + '"]');
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 60);
        return function () { clearTimeout(t); };
      }
      return undefined;
    }, [focusSourceId]);

    const filtered = React.useMemo(function () {
      const q = String(query || '').trim().toLowerCase();
      return BIBLIOGRAPHY.filter(function (src) {
        if (activeTopic && src.topics.indexOf(activeTopic) < 0) return false;
        if (!q) return true;
        const hay = (src.title + ' ' + src.keyFinding + ' ' + src.author).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }, [query, activeTopic]);

    // Counts per topic для бейджей в filter chips.
    const counts = React.useMemo(function () {
      const c = { all: BIBLIOGRAPHY.length };
      Object.keys(TOPIC_LABELS).forEach(function (t) {
        c[t] = BIBLIOGRAPHY.filter(function (s) { return s.topics.indexOf(t) >= 0; }).length;
      });
      return c;
    }, []);

    return React.createElement('div', {
      className: 'fingers-bib-modal__backdrop',
      onClick: function (e) { if (e.target === e.currentTarget) onClose(); },
      role: 'presentation'
    },
      React.createElement('div', {
        className: 'fingers-bib-modal',
        role: 'dialog',
        'aria-label': 'Источники и методология',
        onClick: function (e) { e.stopPropagation(); }
      },
        // Header — sticky
        React.createElement('div', { className: 'fingers-bib-modal__header' },
          React.createElement('div', { className: 'fingers-bib-modal__header-text' },
            React.createElement('h2', { className: 'fingers-bib-modal__title' },
              React.createElement('span', { 'aria-hidden': 'true' }, '📚'),
              ' Источники и методология'),
            React.createElement('p', { className: 'fingers-bib-modal__sub' },
              BIBLIOGRAPHY.length + ' источников — научные статьи, практики, гайдлайны')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'fingers-bib-modal__close',
            'aria-label': 'Закрыть',
            onClick: onClose
          },
            React.createElement('svg', { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.6 },
              React.createElement('path', { d: 'M5 5l10 10M15 5L5 15', strokeLinecap: 'round' })
            )
          )
        ),

        // Search + topic chips
        React.createElement('div', { className: 'fingers-bib-modal__filters' },
          React.createElement('div', { className: 'fingers-bib-modal__search' },
            React.createElement('span', { className: 'fingers-bib-modal__search-icon', 'aria-hidden': 'true' }, '🔍'),
            React.createElement('input', {
              type: 'search',
              className: 'fingers-bib-modal__search-input',
              placeholder: 'Поиск по находке, названию или автору…',
              value: query,
              onChange: function (e) { setQuery(e.target.value); },
              'aria-label': 'Поиск по источникам'
            })
          ),
          React.createElement('div', { className: 'fingers-bib-modal__chips', role: 'tablist' },
            React.createElement('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': activeTopic == null,
              className: 'fingers-bib-modal__chip' + (activeTopic == null ? ' is-active' : ''),
              onClick: function () { setActiveTopic(null); }
            }, 'Все ', React.createElement('span', { className: 'fingers-bib-modal__chip-count' }, counts.all)),
            Object.keys(TOPIC_LABELS).map(function (topic) {
              const active = activeTopic === topic;
              return React.createElement('button', {
                key: topic,
                type: 'button',
                role: 'tab',
                'aria-selected': active,
                className: 'fingers-bib-modal__chip' + (active ? ' is-active' : ''),
                onClick: function () { setActiveTopic(active ? null : topic); }
              }, TOPIC_LABELS[topic], ' ',
                 React.createElement('span', { className: 'fingers-bib-modal__chip-count' }, counts[topic]));
            })
          )
        ),

        // List
        React.createElement('div', { className: 'fingers-bib-modal__list' },
          filtered.length === 0
            ? React.createElement('div', { className: 'fingers-bib-modal__empty' },
                React.createElement('div', { className: 'fingers-bib-modal__empty-icon' }, '🔎'),
                React.createElement('div', { className: 'fingers-bib-modal__empty-title' }, 'Ничего не найдено'),
                React.createElement('div', { className: 'fingers-bib-modal__empty-hint' },
                  'Попробуй очистить поиск или сменить категорию.'))
            : _renderGroupedSources(filtered, expandedId, setExpandedId)
        )
      )
    );
  }

  function _renderSourceCard(src, expanded, onToggle) {
    const typeMeta = TYPE_LABELS[src.type] || { label: src.type, color: '#64748b' };
    return React.createElement('article', {
      key: src.id,
      'data-bib-source': src.id,
      'data-bib-type': src.type,
      className: 'fingers-bib-source' + (expanded ? ' is-expanded' : ''),
      // flex-shrink:0 — иначе в scrollable flex-колонке списка карточки сжимаются
      // по высоте (default shrink:1) и overflow:hidden обрезает текст.
      style: { flexShrink: 0 }
    },
      React.createElement('button', {
        type: 'button',
        className: 'fingers-bib-source__head',
        onClick: onToggle,
        'aria-expanded': expanded ? 'true' : 'false',
        // Тип вынесен в заголовок группы — здесь только контент. grid 1fr auto.
        style: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
          gap: 12, padding: '15px 16px', width: '100%', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer' }
      },
        React.createElement('div', { className: 'fingers-bib-source__main', style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 } },
          React.createElement('h3', { className: 'fingers-bib-source__title', style: { margin: 0, fontSize: 15, fontWeight: 650, lineHeight: 1.32, letterSpacing: '-0.01em', color: '#1c1b19' } }, src.title),
          React.createElement('div', { className: 'fingers-bib-source__author', style: { fontSize: 12.5, fontWeight: 500, color: 'rgba(60,60,67,0.6)' } },
            React.createElement('strong', { style: { color: 'rgba(60,60,67,0.85)', fontWeight: 600 } }, src.author),
            ' · ',
            React.createElement('span', { className: 'fingers-bib-source__year' }, String(src.year)))
        ),
        React.createElement('span', { className: 'fingers-bib-source__chevron', 'aria-hidden': 'true', style: { flexShrink: 0, opacity: 0.4, fontSize: 11 } }, expanded ? '▲' : '▼')
      ),
      expanded ? React.createElement('div', { className: 'fingers-bib-source__body' },
        React.createElement('div', { className: 'fingers-bib-source__finding-label' }, 'Главное открытие'),
        React.createElement('p', { className: 'fingers-bib-source__finding' }, src.keyFinding),
        Array.isArray(src.topics) && src.topics.length > 0 ? React.createElement('div', {
          className: 'fingers-bib-source__topics'
        },
          src.topics.map(function (t) {
            return React.createElement('span', { key: t, className: 'fingers-bib-source__topic' },
              TOPIC_LABELS[t] || t);
          })
        ) : null,
        src.url ? React.createElement('a', {
          href: src.url, target: '_blank', rel: 'noopener noreferrer',
          className: 'fingers-bib-source__link'
        },
          React.createElement('span', { 'aria-hidden': 'true' }, '🔗'),
          ' ',
          'Открыть оригинал',
          React.createElement('span', { className: 'fingers-bib-source__link-arrow', 'aria-hidden': 'true' }, '→')
        ) : null
      ) : null
    );
  }

  // Группирует (уже отфильтрованные) источники по типу и рендерит секции с
  // заголовком группы — тип не дублируется в каждой карточке.
  function _renderGroupedSources(sources, expandedId, onToggleId) {
    const byType = {};
    sources.forEach(function (s) { (byType[s.type] = byType[s.type] || []).push(s); });
    const order = TYPE_ORDER.slice();
    Object.keys(byType).forEach(function (t) { if (order.indexOf(t) < 0) order.push(t); });
    return order.map(function (type) {
      const list = byType[type];
      if (!list || !list.length) return null;
      const meta = TYPE_LABELS[type] || { label: type, color: '#64748b' };
      return React.createElement('section', { key: type, className: 'fingers-bib-group', 'data-bib-type': type },
        React.createElement('div', { className: 'fingers-bib-group__header' },
          React.createElement('span', { className: 'fingers-bib-group__icon', 'aria-hidden': 'true' }, _typeIcon(type)),
          React.createElement('span', { className: 'fingers-bib-group__label', style: { color: meta.color } },
            TYPE_GROUP_LABELS[type] || meta.label),
          React.createElement('span', { className: 'fingers-bib-group__count' }, list.length)
        ),
        React.createElement('div', { className: 'fingers-bib-group__items' },
          list.map(function (src) {
            return _renderSourceCard(src, expandedId === src.id, function () {
              onToggleId(expandedId === src.id ? null : src.id);
            });
          })
        )
      );
    });
  }

  // === Экспорт ===
  Fingers.BIBLIOGRAPHY = BIBLIOGRAPHY;
  Fingers.getSourceById = getSourceById;
  Fingers.SourceBadge = SourceBadge;
  Fingers.BibliographyModal = BibliographyModal;
})(typeof window !== 'undefined' ? window : globalThis);
