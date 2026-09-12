// Стенды зоны strength-builder: конструктор, связки, каталог, программа.
// Экран открывается настоящими компонентами продукта (BuilderScreen,
// CatalogScreen, CycleScreen и т.д.) и настоящими действиями — кликами и
// вводом; подменяются только данные, часы и ответы хранилища.
//
// Сценарий состояния лежит здесь, а не веткой на каждый кадр в общем
// ui-v4-visual-capture.mjs: там одна ветка `demo-strength-zone`, которая
// выполняет `sbReady` / `sbSetup` / `sbSteps` этого файла.

/**
 * Собирает исходник функции монтажа для page.evaluate.
 * fn получает { HEYS, React, h, opts, host } и возвращает React-элемент.
 */
function setupSource(hostId, themeId, fn) {
  // Строка, а не функция: Playwright, получив строку, ВЫЧИСЛЯЕТ выражение и
  // аргумент не передаёт — функцию пришлось бы звать самому. Поэтому обёртка
  // самовызывающаяся, а тема зашита при сборке кейса.
  return `(() => {
    const HEYS = window.HEYS;
    const React = window.React;
    const h = React.createElement;
    const themeId = ${JSON.stringify(themeId || null)};
    if (themeId && HEYS && HEYS.Theme && HEYS.Theme.setThemeId) HEYS.Theme.setThemeId(themeId);
    const id = ${JSON.stringify(hostId)};
    let host = document.getElementById(id);
    if (!host) {
      host = document.createElement('main');
      host.id = id;
      Object.assign(host.style, {
        position: 'fixed', top: '0', left: '0', zIndex: '20000',
        width: '375px', height: '100vh', overflow: 'hidden',
        background: 'var(--v4-bg, #fffaf3)',
      });
      document.body.appendChild(host);
    }
    window.__sbRoots = window.__sbRoots || {};
    if (!window.__sbRoots[id]) window.__sbRoots[id] = window.ReactDOM.createRoot(host);
    const element = (${fn.toString()})({ HEYS, React, h, host });
    window.__sbRoots[id].render(element);
    return id;
  })()`;
}

/**
 * Выражение готовности: React + перечисленные пути в window.HEYS.
 * Тоже строка-выражение (см. setupSource), поэтому без стрелки.
 */
function readySource(paths) {
  const checks = paths
    .map((p) => `typeof window.${p.split('.').join('?.')} === 'function'`)
    .join(' && ');
  return `!!window.React && !!window.ReactDOM && !!window.ReactDOM.createRoot && ${checks}`;
}

function sbCase(spec) {
  const hostId = `ui-v4-sb-${spec.slug}-host`;
  return {
    id: spec.id,
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-zone',
    themeId: spec.themeId || 'sand',
    viewport: { width: 375, height: spec.height || 812 },
    rootSelector: `#${hostId}`,
    captureSelector: spec.captureSelector
      ? `#${hostId} ${spec.captureSelector}`
      : `#${hostId} > .sb-root`,
    sbReady: readySource(spec.ready),
    sbSetup: setupSource(hostId, spec.themeId || 'sand', spec.mount),
    sbSteps: (spec.steps || []).map((step) => {
      const next = { ...step };
      if (next.wait) next.wait = `#${hostId} ${next.wait}`;
      if (next.click) next.click = `#${hostId} ${next.click}`;
      if (next.fill) next.fill = [`#${hostId} ${next.fill[0]}`, next.fill[1]];
      if (next.text) next.text = [`#${hostId} ${next.text[0]}`, next.text[1]];
      return next;
    }),
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: spec.label,
      oid: spec.oid,
      palette: spec.themeId || 'sand',
      ...(spec.canvasCapture ? { captureSelector: spec.canvasCapture } : {}),
    },
  };
}

export const STRENGTH_BUILDER_VISUAL_CASES = [
  // Б1, вторая ветка: план назначен. Первая ветка («плана нет») снимается
  // кейсом strength-builder-empty-sand — у кадров общий oid, различает метка.
  sbCase({
    id: 'strength-empty-plan-sand',
    slug: 'empty-plan',
    label: 'Конструктор · пусто · план назначен',
    // В канвасе оба кадра пустого дня несут один и тот же data-oid Б1:
    // «плана нет» и «план назначен» различаются только меткой.
    oid: 'Б1',
    height: 640,
    ready: ['HEYS.StrengthBuilder.BuilderScreen'],
    mount: ({ HEYS, h }) => {
      const plan = [
        ['Приседания со штангой', 4, 8],
        ['Жим лёжа', 4, 8],
        ['Тяга в наклоне', 3, 10],
        ['Жим гантелей сидя', 3, 12],
        ['Подтягивания', 3, 8],
        ['Разгибание на блоке', 3, 12],
        ['Планка', 3, 10],
      ].map(([name, sets, reps]) => ({
        name,
        approaches: Array.from({ length: sets }, () => ({ weightKg: '40', reps, done: false })),
      }));
      return h(HEYS.StrengthBuilder.BuilderScreen, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: { exercises: [] },
          plan: {
            id: 'visual-plan-b',
            status: 'assigned',
            dayLabel: 'День B',
            assignedBy: 'Артём',
            assignedAt: new Date('2026-08-28T08:00:00+03:00').getTime(),
          },
          planSnapshot: { exercises: plan },
        },
        dateKey: '2026-08-28',
        profile: { weight: 80 },
        lastSessionFor: () => ({
          dateKey: '2026-08-05',
          exercises: plan.map((row) => ({ name: row.name, approaches: [] })),
        }),
        onStartPlan: async () => [],
        onStartCustom: async () => false,
        onRepeatLast: async () => [],
        onPatch: () => {},
        onPatchSession: () => {},
        onClose: () => {},
      });
    },
    steps: [{ wait: '.sb-empty-card' }, { text: ['.sb-empty-action', 'Начать по плану'] }],
  }),

  // А3: разминка и дроп-сет. В кадре это отдельный экран с шапкой сессии —
  // в продукте это вид 'warmup-drop', вход из раскрытой карточки упражнения.
  sbCase({
    id: 'strength-warmup-drop-sand',
    slug: 'warmup-drop',
    label: 'Конструктор · разминка и дроп-сет',
    oid: 'А3',
    height: 720,
    ready: [
      'HEYS.StrengthBuilder.BuilderScreen',
      'HEYS.StrengthBuilderParts.WarmupDropScreen',
    ],
    mount: ({ HEYS, h }) => {
      const caseNow = new Date('2026-08-28T19:27:12+03:00').getTime();
      window.Date.now = () => caseNow;
      return h(HEYS.StrengthBuilder.BuilderScreen, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          time: '18:40',
          workoutLog: {
            title: 'Силовая · ноги',
            startedAt: new Date('2026-08-28T18:40:00+03:00').getTime(),
            exercises: [
              {
                name: 'Приседания',
                restSec: 120,
                approaches: [
                  { weightKg: '40', reps: 10, done: true, type: 'warmup' },
                  { weightKg: '80', reps: 8, done: true },
                  { weightKg: '80', reps: 8, done: true },
                  {
                    weightKg: '80',
                    reps: 6,
                    done: true,
                    drops: [
                      { weightKg: '60', reps: 8, done: true },
                      { weightKg: '40', reps: 10, done: true },
                    ],
                  },
                ],
              },
            ],
          },
        },
        dateKey: '2026-08-28',
        profile: { weight: 80 },
        historyFor: () => null,
        historyDetailFor: () => ({ usages: [], record: null }),
        onPatch: () => {},
        onPatchSession: () => {},
        onClose: () => {},
      });
    },
    steps: [
      { wait: '.sb-ex-warmup-drop' },
      { click: '.sb-ex-warmup-drop' },
      { wait: '.sb-warmup-drop-screen' },
    ],
    captureSelector: '> .sb-root.sb-warmup-drop-screen',
  }),

  // В3: своё упражнение. Экран открывается из каталога строкой создания —
  // как у человека: набрать название, которого в каталоге нет, и нажать её.
  sbCase({
    id: 'strength-new-exercise-sand',
    slug: 'new-exercise',
    label: 'Своё упражнение',
    oid: 'В3',
    height: 860,
    ready: ['HEYS.StrengthCatalogUI.CatalogScreen'],
    mount: ({ HEYS, h }) => {
      HEYS.getExerciseSuggestions = () => [
        { name: 'Тяга штанги в наклоне', norm: 'тяга штанги в наклоне', rank: 1, favorite: true },
        { name: 'Подтягивания', norm: 'подтягивания', rank: 2, favorite: false },
      ];
      return h(HEYS.StrengthCatalogUI.CatalogScreen, {
        onPick: () => {},
        onBack: () => {},
        historyFor: () => ({ last: null, record: null }),
      });
    },
    steps: [
      { wait: 'input[aria-label="Поиск по названию"]' },
      { fill: ['input[aria-label="Поиск по названию"]', 'Тяга Т-грифа'] },
      { wait: '.sb-cat-create' },
      { click: '.sb-cat-create' },
      { text: ['.sb-head-title b', 'Новое упражнение'] },
    ],
  }),

  // И2: шторка ⋯ поверх идущей сессии.
  sbCase({
    id: 'strength-sheet-sand',
    slug: 'sheet',
    label: 'Шторка ⋯',
    oid: 'И2',
    height: 900,
    ready: ['HEYS.StrengthBuilder.BuilderScreen', 'HEYS.StrengthBuilderParts.sheetRows'],
    mount: ({ HEYS, h }) => {
      const caseNow = new Date('2026-08-28T19:27:12+03:00').getTime();
      window.Date.now = () => caseNow;
      const set = (weightKg, reps, done) => ({ weightKg: String(weightKg), reps, done: !!done });
      return h(HEYS.StrengthBuilder.BuilderScreen, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          time: '18:40',
          workoutLog: {
            title: 'Силовая · грудь, спина, плечи',
            startedAt: new Date('2026-08-28T18:40:00+03:00').getTime(),
            exercises: [
              { name: 'Жим гантелей сидя', restSec: 90, approaches: [set(24, 12, true), set(24, 10, true), set(24, 10, false)] },
              { name: 'Подтягивания', restSec: 120, approaches: [set(0, 9, false), set(0, 9, false), set(0, 8, false)] },
              { name: 'Тяга блока', restSec: 90, approaches: [set(55, 10, false), set(55, 10, false), set(55, 10, false)] },
            ],
          },
        },
        dateKey: '2026-08-28',
        profile: { weight: 80 },
        historyFor: () => null,
        historyDetailFor: () => ({ usages: [], record: null }),
        onPatch: () => {},
        onPatchSession: () => {},
        onClose: () => {},
      });
    },
    steps: [
      { wait: '.sb-head .sb-icon-btn[aria-label="Ещё"]' },
      { click: '.sb-head .sb-icon-btn[aria-label="Ещё"]' },
      { wait: '.sb-sheet-menu' },
    ],
    captureSelector: '.sb-sheet',
  }),
];
