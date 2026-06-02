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
      id: 'lopez2019',
      author: 'López-Rivera & González-Badillo',
      year: 2019,
      title: 'The effects of two maximum grip strength training methods using the same effort duration and different edge depth on grip endurance in elite climbers',
      type: 'peer-reviewed',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30975050/',
      keyFinding: 'За 8 недель Max Hangs (MR) и Min Edge (MED) дают сопоставимый прирост силы пальцев у элитных лазунов, но MED безопаснее по сухожилиям.',
      topics: ['protocols', 'calibration']
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
            : filtered.map(function (src) {
                return _renderSourceCard(src, expandedId === src.id, function () {
                  setExpandedId(expandedId === src.id ? null : src.id);
                });
              })
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
      className: 'fingers-bib-source' + (expanded ? ' is-expanded' : '')
    },
      React.createElement('button', {
        type: 'button',
        className: 'fingers-bib-source__head',
        onClick: onToggle,
        'aria-expanded': expanded ? 'true' : 'false'
      },
        React.createElement('div', { className: 'fingers-bib-source__type', 'aria-hidden': 'true' },
          React.createElement('span', { className: 'fingers-bib-source__type-icon' }, _typeIcon(src.type)),
          React.createElement('span', { className: 'fingers-bib-source__type-label' }, typeMeta.label)
        ),
        React.createElement('div', { className: 'fingers-bib-source__main' },
          React.createElement('div', { className: 'fingers-bib-source__author' },
            React.createElement('strong', null, src.author),
            ' · ',
            React.createElement('span', { className: 'fingers-bib-source__year' }, String(src.year))),
          React.createElement('h3', { className: 'fingers-bib-source__title' }, src.title)
        ),
        React.createElement('span', { className: 'fingers-bib-source__chevron', 'aria-hidden': 'true' }, expanded ? '▲' : '▼')
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

  // === Экспорт ===
  Fingers.BIBLIOGRAPHY = BIBLIOGRAPHY;
  Fingers.getSourceById = getSourceById;
  Fingers.SourceBadge = SourceBadge;
  Fingers.BibliographyModal = BibliographyModal;
})(typeof window !== 'undefined' ? window : globalThis);
