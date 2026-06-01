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
    const onClick = props && props.onClick;
    return React.createElement('span', {
      className: 'fingers-source-badge' + (onClick ? ' fingers-source-badge--clickable' : ''),
      role: onClick ? 'button' : undefined,
      tabIndex: onClick ? 0 : undefined,
      onClick: onClick ? function (e) {
        try { onClick(src, e); } catch (err) { console.warn('[Fingers.SourceBadge] onClick failed', err); }
      } : undefined,
      onKeyDown: onClick ? function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          try { onClick(src, e); } catch (err) { console.warn('[Fingers.SourceBadge] onKeyDown failed', err); }
        }
      } : undefined
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

  /**
   * Модалка «Источники и методология».
   * @param {{onClose:Function}} props
   */
  function BibliographyModal(props) {
    if (!React) return null;
    const onClose = (props && props.onClose) || function () {};

    const queryState = React.useState('');
    const query = queryState[0];
    const setQuery = queryState[1];

    const topicState = React.useState(null);
    const activeTopic = topicState[0];
    const setActiveTopic = topicState[1];

    const filtered = React.useMemo(function () {
      const q = String(query || '').trim().toLowerCase();
      return BIBLIOGRAPHY.filter(function (src) {
        if (activeTopic && src.topics.indexOf(activeTopic) < 0) return false;
        if (!q) return true;
        const hay = (src.title + ' ' + src.keyFinding + ' ' + src.author).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }, [query, activeTopic]);

    return React.createElement('div', {
      className: 'fingers-fs-bib-modal-backdrop',
      onClick: function (e) { if (e.target === e.currentTarget) onClose(); },
      style: {
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(15,23,42,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16
      }
    },
      React.createElement('div', {
        className: 'fingers-fs-bib-modal',
        style: {
          background: 'var(--card,#fff)', borderRadius: 16,
          maxWidth: 720, width: '100%', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }
      },
        // Header
        React.createElement('div', {
          style: {
            padding: '16px 20px', borderBottom: '1px solid var(--border,#e5e7eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
          }
        },
          React.createElement('div', { style: { fontSize: 18, fontWeight: 700 } }, 'Источники и методология'),
          React.createElement('button', {
            type: 'button',
            'aria-label': 'Закрыть',
            onClick: onClose,
            style: {
              background: 'transparent', border: 'none', fontSize: 22,
              cursor: 'pointer', color: 'var(--text-muted,#64748b)', padding: 4
            }
          }, '✕')
        ),
        // Search + topic chips
        React.createElement('div', { style: { padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 } },
          React.createElement('input', {
            type: 'search',
            placeholder: 'Поиск по названию или находке…',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            style: {
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border,#e5e7eb)',
              fontSize: 14, outline: 'none', width: '100%'
            }
          }),
          React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            React.createElement('button', {
              type: 'button',
              onClick: function () { setActiveTopic(null); },
              style: chipStyle(activeTopic == null)
            }, 'Все'),
            Object.keys(TOPIC_LABELS).map(function (topic) {
              return React.createElement('button', {
                key: topic,
                type: 'button',
                onClick: function () { setActiveTopic(activeTopic === topic ? null : topic); },
                style: chipStyle(activeTopic === topic)
              }, TOPIC_LABELS[topic]);
            })
          )
        ),
        // List
        React.createElement('div', {
          style: {
            padding: '8px 20px 20px', overflowY: 'auto', flex: 1,
            display: 'flex', flexDirection: 'column', gap: 12
          }
        },
          filtered.length === 0
            ? React.createElement('div', {
                style: { textAlign: 'center', color: 'var(--text-muted,#64748b)', padding: '32px 0' }
              }, 'Ничего не найдено')
            : filtered.map(function (src) { return renderCard(src); })
        )
      )
    );
  }

  function chipStyle(active) {
    return {
      padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
      fontSize: 12, fontWeight: 600,
      background: active ? 'var(--accent,#3b82f6)' : 'var(--bg-soft,rgba(148,163,184,0.15))',
      color: active ? '#fff' : 'var(--text,#1e293b)'
    };
  }

  function renderCard(src) {
    const typeMeta = TYPE_LABELS[src.type] || { label: src.type, color: '#64748b' };
    return React.createElement('div', {
      key: src.id,
      style: {
        padding: 12, borderRadius: 10, background: 'var(--bg-soft,rgba(148,163,184,0.08))',
        display: 'flex', flexDirection: 'column', gap: 6
      }
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        React.createElement('span', { style: { fontWeight: 700 } }, src.author, ' ', src.year),
        React.createElement('span', {
          style: {
            fontSize: 11, fontWeight: 600, padding: '2px 6px',
            borderRadius: 4, background: typeMeta.color, color: '#fff'
          }
        }, typeMeta.label)
      ),
      React.createElement('div', { style: { fontSize: 14, fontWeight: 500 } }, src.title),
      React.createElement('div', { style: { fontSize: 13, color: 'var(--text-muted,#64748b)', lineHeight: 1.4 } }, src.keyFinding),
      src.url
        ? React.createElement('a', {
            href: src.url, target: '_blank', rel: 'noopener noreferrer',
            style: { fontSize: 12, color: 'var(--accent,#3b82f6)', textDecoration: 'none', wordBreak: 'break-all' }
          }, src.url)
        : null
    );
  }

  // === Экспорт ===
  Fingers.BIBLIOGRAPHY = BIBLIOGRAPHY;
  Fingers.getSourceById = getSourceById;
  Fingers.SourceBadge = SourceBadge;
  Fingers.BibliographyModal = BibliographyModal;
})(typeof window !== 'undefined' ? window : globalThis);
