// heys_fingers_muscle_detail_v1.js — Wave 3-A (drill-down).
// HEYS.Fingers.MuscleDetailScreen({ muscleId, onClose })
//   — full-screen detail view для отдельной мышцы предплечья/кисти.
//   Открывается из anatomy tooltip → «Подробнее →».
//
// Public API:
//   HEYS.Fingers.MuscleDetailScreen(props)
//     props.muscleId : 'FDP'|'FDS'|'lumbricals'|'brachioradialis'|'ECR'|'FCR'|'adductor_pollicis'
//     props.onClose  : () => void
//
//   HEYS.Fingers.openMuscleDetail(muscleId)
//     — portal mount helper. Создаёт #muscle-detail-root в body если нет.
//
// Layout (по вертикали):
//   1) Headline (RU большим + latin subtle)
//   2) Enlarged AnatomyDiagram size=280, highlightMuscles=[muscleId]
//   3) «Что делает» — function из MUSCLE_INFO
//   4) «Травмы и риски» — карточки {name, description, severity, sourceId}
//   5) «Профилактика и рекомендации» — RU best-practices текст
//   6) «Источники» — SourceBadge для каждого sourceId из MUSCLE_INFO
//
// Идемпотентность: Fingers.MuscleDetailScreen__registered.
// z-index 2100 (выше main fullscreen 2000).

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.MuscleDetailScreen__registered) return;
  Fingers.MuscleDetailScreen__registered = true;

  const R = (typeof global.React !== 'undefined' && global.React) || null;
  const RD = (typeof global.ReactDOM !== 'undefined' && global.ReactDOM) || null;
  if (!R) {
    try { console.warn('[Fingers.MuscleDetailScreen] React not loaded — component unavailable until boot.'); } catch (_) {}
  }

  // ===== Локальные данные =====

  // Структурированные карточки травм per muscle (поверх MUSCLE_INFO.injuries: string[]).
  // sourceId: null если нет матча в bibliography.
  const INJURIES_DETAIL = Object.freeze({
    FDP: [
      Object.freeze({
        name: 'Разрыв блока A2 (A2 pulley rupture)',
        description: 'Самый частый pulley-injury у скалолазов. Резкая боль в основании пальца при full crimp, иногда слышен щелчок. Восстановление 4-6 недель (grade I) до 6 месяцев (grade IV, хирургия).',
        severity: 'high',
        sourceId: 'schoffl2021',
      }),
      Object.freeze({
        name: 'Тендинопатия сгибателей',
        description: 'Хронические перегрузки FDP вызывают воспаление сухожилия. Боль усиливается в середине сессии, утром скованность. Требует разгрузки 2-4 недели + эксцентрические упражнения.',
        severity: 'mid',
        sourceId: 'magnusson2010',
      }),
    ],
    FDS: [
      Object.freeze({
        name: 'Растяжение сухожилия FDS',
        description: 'Перенапряжение в half-crimp/open-hand. Локализованная боль в проксимальном межфаланговом суставе (PIP). Восстановление 2-3 недели разгрузки.',
        severity: 'mid',
        sourceId: 'schweizer2008',
      }),
      Object.freeze({
        name: 'PIP synovitis',
        description: 'Воспаление синовиальной оболочки PIP-сустава, типично для часто лазающих. Утренняя припухлость, ограничение разгибания. Лёд + 10-14 дней снижения объёма.',
        severity: 'mid',
        sourceId: 'schweizer2008',
      }),
    ],
    lumbricals: [
      Object.freeze({
        name: 'Lumbrical shift syndrome',
        description: 'Боль у основания безымянного пальца при back-3 / mono хватах. Возникает когда нагрузка распределяется неравномерно между пальцами и lumbrical вытягивается через FDS. Профилактика — симметричная нагрузка обеих рук.',
        severity: 'mid',
        sourceId: 'schweizer2008',
      }),
    ],
    brachioradialis: [
      Object.freeze({
        name: 'Растяжение / тендинопатия предплечья',
        description: 'Перегрузка при длинных висах и подтягиваниях. Тупая боль по лучевой стороне предплечья. Лечится эксцентрикой и снижением объёма висов на 2-3 недели.',
        severity: 'low',
        sourceId: 'horst_podcast10',
      }),
    ],
    ECR: [
      Object.freeze({
        name: 'Латеральный эпикондилит (climber\'s / tennis elbow)',
        description: 'Главная травма от дисбаланса сгибателей/разгибателей. Боль у наружного надмыщелка плеча, усиливается при разгибании запястья против сопротивления. Профилактика — обязательные resistance-band extensions.',
        severity: 'mid',
        sourceId: 'horst_podcast10',
      }),
    ],
    FCR: [
      Object.freeze({
        name: 'Медиальный эпикондилит (golfer\'s elbow)',
        description: 'Боль у внутреннего надмыщелка от перегрузки сгибателей запястья. Часто у лазающих на slopers и pinch-хватах без разгрузки. Снижение объёма + изометрика.',
        severity: 'mid',
        sourceId: 'schweizer2008',
      }),
    ],
    adductor_pollicis: [
      Object.freeze({
        name: 'Артрит CMC-сустава большого пальца',
        description: 'Хроническая перегрузка pinch-хватами повышает риск carpometacarpal arthritis в долгосрочной перспективе. Ранний признак — боль в основании большого пальца после сессии.',
        severity: 'low',
        sourceId: 'schweizer2008',
      }),
    ],
  });

  const PREVENTION_TEXT = Object.freeze({
    FDP: 'Сгибает дистальный сустав (DIP). Главный антагонист A2 при full crimp. Профилактика: укрепляй экстензоры запястья (банды, reverse curls), не злоупотребляй crimp-протоколами, делай разогрев 15-20 минут перед max-hangs.',
    FDS: 'Сгибает средний сустав (PIP). Активна в half-crimp и open-hand. Профилактика: альтернируй хваты, давай 48-72ч между интенсивными сессиями для collagen synthesis.',
    lumbricals: 'Мелкие мышцы ладони, активны в pocket-хватах (back-3, mono). При неправильной нагрузке — lumbrical shift syndrome (боль у основания безымянного пальца). Профилактика: симметричная нагрузка обеих рук, избегай чистых mono без подготовки.',
    brachioradialis: 'Сгибатель локтя в нейтральной позиции. Активна при висах и подтягиваниях. Травмы — golfer\'s elbow аналог. Профилактика: эксцентрические упражнения (slow lowering), массаж triggerpoints.',
    ECR: 'Разгибатель запястья — главный антагонист flexors. Слабые extensors = главный фактор tennis elbow у climbers. Профилактика: ОБЯЗАТЕЛЬНЫЕ resistance-band extensions 3×15 после каждой fingerboard сессии.',
    FCR: 'Сгибатель запястья и pronator. Активна в всех висах. Профилактика: forearm rolls, wrist mobility.',
    adductor_pollicis: 'Приводящая мышца большого пальца — критична для pinch-хватов. Травмы — base of thumb pain. Профилактика: pinch-block тренировки начинай с low intensity, давай адаптацию.',
  });

  const SEVERITY_META = Object.freeze({
    low:  { label: 'Низкий риск',  color: '#16a34a' },
    mid:  { label: 'Средний риск', color: '#d97706' },
    high: { label: 'Высокий риск', color: '#dc2626' },
  });

  // ===== Хелпер: tap-friendly close button =====

  function renderCloseButton(onClose) {
    return R.createElement('button', {
      type: 'button',
      className: 'fingers-fs__close',
      'aria-label': 'Закрыть детали мышцы',
      onClick: onClose,
      style: {
        width: 40, height: 40, minWidth: 40, minHeight: 40,
        border: 'none',
        background: 'rgba(120, 120, 128, 0.12)',
        fontSize: 20, cursor: 'pointer',
        color: 'var(--fingers-text, #1a1a1f)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        flexShrink: 0,
      },
    }, '✕');
  }

  // Backdrop + centered panel. Клик по backdrop'у — закрывает.
  // Панель — flex-column: sticky header (title+X) + scrollable body.
  const ST_BACKDROP = {
    position: 'fixed', inset: 0, zIndex: 2100,
    background: 'rgba(0, 0, 0, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 12,
    paddingTop: 'max(12px, env(safe-area-inset-top, 12px))',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
  };
  const ST_PANEL = {
    position: 'relative',
    width: '100%',
    maxWidth: 560,
    height: '80vh',
    maxHeight: 760,
    background: 'var(--fingers-bg, #fff)',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(0, 0, 0, 0.08)',
  };
  // Sticky header — название + крестик. Не скроллится.
  const ST_HEADER = {
    flexShrink: 0,
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 14px 14px 20px',
    borderBottom: '0.5px solid rgba(120, 120, 128, 0.18)',
    background: 'var(--fingers-bg, #fff)',
  };
  const ST_HEADER_TITLES = {
    flex: 1, minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: 4,
    paddingTop: 4,
  };
  const ST_HEADER_H1 = {
    margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.2,
    color: 'var(--fingers-text, #1a1a1f)',
    letterSpacing: '-0.01em',
  };
  const ST_HEADER_LATIN = {
    fontSize: 13, fontStyle: 'italic',
    color: 'var(--fingers-text-muted, #777)',
  };
  // Scrollable body.
  const ST_BODY = {
    flex: 1, minHeight: 0,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  };

  function renderInjuryCard(inj, idx) {
    const sev = SEVERITY_META[inj.severity] || SEVERITY_META.mid;
    const SourceBadge = Fingers.SourceBadge;
    return R.createElement('div', {
      key: 'inj-' + idx,
      className: 'fingers-fs-muscle-detail__injury',
      style: {
        padding: 12, borderRadius: 10,
        background: 'var(--fingers-card, rgba(148,163,184,0.08))',
        border: '1px solid var(--fingers-border, rgba(148,163,184,0.18))',
        display: 'flex', flexDirection: 'column', gap: 6,
      },
    },
      R.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        R.createElement('span', {
          style: { fontWeight: 600, fontSize: 15, color: 'var(--fingers-text, #1a1a1f)' },
        }, inj.name),
        R.createElement('span', {
          style: {
            fontSize: 11, fontWeight: 600, padding: '2px 8px',
            borderRadius: 4, background: sev.color, color: '#fff',
          },
        }, sev.label)
      ),
      R.createElement('div', {
        style: { fontSize: 13, lineHeight: 1.45, color: 'var(--fingers-text-muted, #555)' },
      }, inj.description),
      (inj.sourceId && SourceBadge)
        ? R.createElement('div', { style: { marginTop: 2 } },
            R.createElement(SourceBadge, { sourceId: inj.sourceId })
          )
        : null
    );
  }

  function renderSection(title, children) {
    return R.createElement('section', {
      className: 'fingers-fs-muscle-detail__section',
      style: { display: 'flex', flexDirection: 'column', gap: 10 },
    },
      R.createElement('h3', {
        style: {
          margin: 0, fontSize: 16, fontWeight: 700,
          color: 'var(--fingers-text, #1a1a1f)',
          letterSpacing: 0.2,
        },
      }, title),
      children
    );
  }

  // ===== Основной компонент =====

  Fingers.MuscleDetailScreen = function MuscleDetailScreen(props) {
    if (!R) return null;
    const p = props || {};
    const muscleId = p.muscleId;
    const onClose = typeof p.onClose === 'function' ? p.onClose : function () {};

    // Body scroll lock + Escape close
    R.useEffect(function () {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      function handleKey(e) {
        if (e.key === 'Escape') {
          try { onClose(); } catch (err) { try { console.warn('[Fingers.MuscleDetailScreen] onClose failed', err); } catch (_) {} }
        }
      }
      window.addEventListener('keydown', handleKey);
      return function () {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKey);
      };
    }, [onClose]);

    // Preload оставшихся 6 мышц — на случай если пользователь сразу откроет
    // соседнюю из списка под фото. Один раз за life-cycle модалки.
    // ~370KB суммарно, грузится фоном без блокировки UI.
    R.useEffect(function () {
      const ids = Fingers.MUSCLE_IDS || [];
      ids.forEach(function (mid) {
        if (mid === muscleId) return;
        try {
          const img = new Image();
          img.src = '/anatomy/' + String(mid).toLowerCase() + '.webp';
        } catch (_) {}
      });
    }, [muscleId]);

    const MUSCLE_INFO = Fingers.MUSCLE_INFO || {};
    const info = MUSCLE_INFO[muscleId];
    const SourceBadge = Fingers.SourceBadge;
    const AnatomyDiagram = Fingers.AnatomyDiagram;

    // Premium-фото мышцы в /public/anatomy/ (см. apps/web/public/anatomy/).
    // Если файл не загрузился — fallback на схематичный SVG AnatomyDiagram.
    const [anatomyImgFailed, setAnatomyImgFailed] = R.useState(false);
    const anatomyImgSrc = '/anatomy/' + String(muscleId).toLowerCase() + '.webp';

    // Клик по backdrop'у (вне панели) — закрывает.
    const handleBackdropClick = function (e) {
      if (e.target === e.currentTarget) {
        try { onClose(); } catch (_) {}
      }
    };

    // Fallback: muscleId не найден
    if (!info) {
      return R.createElement('div', {
        className: 'fingers-fs-muscle-detail-backdrop',
        onClick: handleBackdropClick,
        style: ST_BACKDROP,
      },
        R.createElement('div', {
          className: 'fingers-fs-muscle-detail',
          style: Object.assign({}, ST_PANEL, { height: 'auto' }),
        },
          R.createElement('div', { style: ST_HEADER },
            R.createElement('div', { style: ST_HEADER_TITLES },
              R.createElement('h1', { style: ST_HEADER_H1 }, 'Деталь мышцы'),
            ),
            renderCloseButton(onClose),
          ),
          R.createElement('div', {
            style: {
              padding: 24, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            },
          },
            R.createElement('div', {
              style: { fontSize: 16, color: 'var(--fingers-text-muted, #555)', textAlign: 'center' },
            }, 'Информация о мышце недоступна.'),
            R.createElement('button', {
              type: 'button',
              onClick: onClose,
              style: {
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: 'var(--fingers-accent, #0066ff)', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              },
            }, 'Закрыть')
          )
        )
      );
    }

    const injuriesDetail = INJURIES_DETAIL[muscleId] || [];
    const preventionText = PREVENTION_TEXT[muscleId] || '';
    const sourceIds = Array.isArray(info.sourceIds) ? info.sourceIds : [];

    return R.createElement('div', {
      className: 'fingers-fs-muscle-detail-backdrop',
      onClick: handleBackdropClick,
      style: ST_BACKDROP,
    },
     R.createElement('div', {
      className: 'fingers-fs-muscle-detail',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Подробно о мышце: ' + (info.name || muscleId),
      style: ST_PANEL,
    },
      // Sticky header: название + крестик. Не скроллится с контентом.
      R.createElement('div', { style: ST_HEADER },
        R.createElement('div', { style: ST_HEADER_TITLES },
          R.createElement('h1', { style: ST_HEADER_H1 }, info.name || muscleId),
          info.latin ? R.createElement('div', { style: ST_HEADER_LATIN }, info.latin) : null,
        ),
        renderCloseButton(onClose),
      ),
      // Scrollable body — всё остальное.
      R.createElement('div', { style: ST_BODY },
       R.createElement('div', {
        className: 'fingers-fs-muscle-detail__inner',
        style: {
          padding: '16px 20px 28px',
          display: 'flex', flexDirection: 'column', gap: 20,
        },
      },
        // 2) Anatomy — медицинская иллюстрация в карточке-«панели».
        //    Фото из /public/anatomy/{muscleId}.webp. Если 404 → fallback на SVG.
        R.createElement('div', {
          style: {
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: 16,
            background: 'linear-gradient(180deg, rgba(120, 120, 128, 0.04) 0%, rgba(120, 120, 128, 0.08) 100%)',
            borderRadius: 14,
            border: '0.5px solid rgba(120, 120, 128, 0.18)',
            minHeight: 280,
          },
        },
          !anatomyImgFailed
            ? R.createElement('img', {
                src: anatomyImgSrc,
                alt: 'Анатомия: ' + (info.name || muscleId),
                loading: 'eager',
                decoding: 'async',
                onError: function () { setAnatomyImgFailed(true); },
                style: {
                  display: 'block',
                  width: '100%',
                  maxWidth: 360,
                  height: 'auto',
                  borderRadius: 10,
                },
              })
            : (AnatomyDiagram
                ? R.createElement(AnatomyDiagram, {
                    highlightMuscles: [muscleId],
                    size: 240,
                  })
                : null)
        ),

        // 3) Function
        info.function
          ? renderSection('Что делает',
              R.createElement('p', {
                style: {
                  margin: 0, fontSize: 15, lineHeight: 1.55,
                  color: 'var(--fingers-text, #1a1a1f)',
                },
              }, info.function)
            )
          : null,

        // 4) Injuries
        injuriesDetail.length
          ? renderSection('Травмы и риски',
              R.createElement('div', {
                style: { display: 'flex', flexDirection: 'column', gap: 10 },
              }, injuriesDetail.map(renderInjuryCard))
            )
          : null,

        // 5) Prevention
        preventionText
          ? renderSection('Профилактика и рекомендации',
              R.createElement('p', {
                style: {
                  margin: 0, fontSize: 14, lineHeight: 1.6,
                  color: 'var(--fingers-text, #1a1a1f)',
                },
              }, preventionText)
            )
          : null,

        // 6) Sources
        (sourceIds.length && SourceBadge)
          ? renderSection('Источники',
              R.createElement('div', {
                style: { display: 'flex', flexWrap: 'wrap', gap: 8 },
              }, sourceIds.map(function (sid, i) {
                return R.createElement(SourceBadge, { key: 'src-' + i, sourceId: sid });
              }))
            )
          : null
      )
     )
     )
    );
  };

  // ===== Portal helper =====

  // Хранит активный root для cleanup на повторных вызовах.
  let activeRoot = null;
  let activeContainer = null;

  function ensureContainer() {
    let el = document.getElementById('muscle-detail-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'muscle-detail-root';
      document.body.appendChild(el);
    }
    return el;
  }

  function teardown() {
    try {
      if (activeRoot && typeof activeRoot.unmount === 'function') {
        activeRoot.unmount();
      }
    } catch (err) {
      try { console.warn('[Fingers.openMuscleDetail] unmount failed', err); } catch (_) {}
    }
    activeRoot = null;
    if (activeContainer && activeContainer.parentNode) {
      try { activeContainer.parentNode.removeChild(activeContainer); } catch (_) {}
    }
    activeContainer = null;
  }

  Fingers.openMuscleDetail = function openMuscleDetail(muscleId) {
    if (!R || !RD) {
      try { console.warn('[Fingers.openMuscleDetail] React or ReactDOM not loaded.'); } catch (_) {}
      return null;
    }
    if (typeof document === 'undefined') return null;

    // Teardown предыдущего instance если был открыт.
    if (activeRoot) teardown();

    const container = ensureContainer();
    activeContainer = container;

    const handleClose = function () { teardown(); };

    try {
      if (typeof RD.createRoot === 'function') {
        activeRoot = RD.createRoot(container);
        activeRoot.render(R.createElement(Fingers.MuscleDetailScreen, {
          muscleId: muscleId,
          onClose: handleClose,
        }));
      } else if (typeof RD.render === 'function') {
        // Legacy fallback (React 17 и старше).
        RD.render(R.createElement(Fingers.MuscleDetailScreen, {
          muscleId: muscleId,
          onClose: handleClose,
        }), container);
        activeRoot = { unmount: function () { try { RD.unmountComponentAtNode(container); } catch (_) {} } };
      } else {
        try { console.warn('[Fingers.openMuscleDetail] No render method on ReactDOM.'); } catch (_) {}
        return null;
      }
    } catch (err) {
      try { console.warn('[Fingers.openMuscleDetail] render failed', err); } catch (_) {}
      teardown();
      return null;
    }

    return { close: handleClose };
  };

})(typeof window !== 'undefined' ? window : globalThis);
