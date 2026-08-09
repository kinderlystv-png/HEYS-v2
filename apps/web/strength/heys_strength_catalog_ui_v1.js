// heys_strength_catalog_ui_v1.js — каталог упражнений и создание своего.
//
// Экраны 03 (каталог, фильтр по мышцам) и 25 (новое упражнение) из
// STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md.
//
// Оба экрана — интерфейс к справочнику (HEYS.exerciseMeta): группы, единицы и
// коэффициенты живут там как данные. UI ничего не выдумывает: где коэффициент
// неизвестен, упражнение создаётся явной кнопкой «Создать · без тоннажа», и в
// итогах стоит строка «не посчитали».

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Cat = HEYS.StrengthCatalogUI = HEYS.StrengthCatalogUI || {};
  if (Cat.__registered) return;
  Cat.__registered = true;

  const React = global.React;
  if (!React) return;
  const h = React.createElement;

  function metaApi() {
    return HEYS.exerciseMeta || null;
  }

  /** Каталог с фильтром по группе и поиском (экран 03). */
  function CatalogScreen(props) {
    const { onPick, onCreate, onBack } = props;
    const [query, setQuery] = React.useState('');
    const [group, setGroup] = React.useState('all');
    const api = metaApi();
    const groups = api ? api.groups : [];

    const rows = React.useMemo(function () {
      const fn = HEYS.getExerciseSuggestions;
      const list = typeof fn === 'function' ? fn(query, 60) : [];
      if (!api) return list;
      return list.filter(function (r) {
        if (group === 'all') return true;
        if (group === 'fav') return !!r.favorite;
        const m = api.get(r.name);
        if (!m) return false;
        return m.primaryGroup === group || (m.secondaryGroups || []).indexOf(group) >= 0;
      });
    }, [query, group, api]);

    const groupLabel = group === 'all' ? 'Все группы'
      : group === 'fav' ? 'Избранное'
        : (api ? api.groupLabel(group) : '');

    return h('div', { className: 'sb-root sb-screen' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onBack, 'aria-label': 'Назад'
        }, '‹'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Каталог упражнений'),
          h('div', { className: 'sb-head-sub' }, groupLabel + ' · ' + rows.length + ' упр.')
        )
      ),
      h('div', { className: 'sb-search' },
        h('span', null, '🔍'),
        h('input', {
          type: 'search',
          value: query,
          placeholder: 'Поиск по названию',
          onChange: function (e) { setQuery(e.target.value); },
          'aria-label': 'Поиск по названию'
        })
      ),
      h('div', { className: 'sb-chips' },
        h('button', {
          type: 'button',
          className: 'sb-chip' + (group === 'all' ? ' is-on' : ''),
          onClick: function () { setGroup('all'); }
        }, 'Все'),
        h('button', {
          type: 'button',
          className: 'sb-chip' + (group === 'fav' ? ' is-on' : ''),
          onClick: function () { setGroup('fav'); },
          'aria-label': 'Избранное'
        }, '★'),
        groups.map(function (g) {
          return h('button', {
            key: g.id,
            type: 'button',
            className: 'sb-chip' + (group === g.id ? ' is-on' : ''),
            onClick: function () { setGroup(g.id); }
          }, g.label);
        })
      ),
      h('div', { className: 'sb-list' },
        rows.map(function (r) {
          const m = api ? api.get(r.name) : null;
          const sub = m && api
            ? api.groupLabel(m.primaryGroup)
            : 'своё упражнение';
          return h('div', { className: 'sb-cat-row', key: r.norm },
            h('button', {
              type: 'button',
              className: 'sb-star' + (r.favorite ? ' is-on' : ''),
              onClick: function () {
                if (typeof HEYS.toggleExerciseFavorite === 'function') {
                  HEYS.toggleExerciseFavorite(r.name);
                  setQuery(query);
                  setGroup(group);
                }
              },
              'aria-label': r.favorite ? 'Убрать из избранного' : 'В избранное'
            }, '★'),
            h('div', { className: 'sb-cat-title' },
              h('b', null, r.name),
              h('span', null, sub)
            ),
            h('button', {
              type: 'button',
              className: 'sb-cat-add',
              onClick: function () { onPick(r.name); },
              'aria-label': 'Добавить ' + r.name
            }, '+')
          );
        }),
        // Каталог подсказывает, но не запрещает.
        h('button', {
          type: 'button',
          className: 'sb-cat-create',
          onClick: function () { onCreate(query); }
        },
          h('span', { className: 'sb-cat-add' }, '+'),
          h('div', { className: 'sb-cat-title' },
            h('b', null, query.trim() ? 'Создать «' + query.trim() + '»' : 'Создать своё упражнение'),
            h('span', null, 'Каталог подсказывает, но не запрещает')
          )
        )
      )
    );
  }

  /**
   * Новое упражнение (экран 25). Единица измерения — первое обязательное поле:
   * от неё зависит и тоннаж, и вид карточки подхода. Коэффициент спрашивается
   * только у своего веса и не числом, а вопросом «на что похоже движение».
   */
  function NewExerciseScreen(props) {
    const { initialName, onDone, onCancel } = props;
    const api = metaApi();
    const [name, setName] = React.useState(initialName || '');
    const [unit, setUnit] = React.useState('');
    const [primary, setPrimary] = React.useState('');
    const [secondary, setSecondary] = React.useState([]);
    const [likeNorm, setLikeNorm] = React.useState('');

    if (!api) return null;
    const refs = api.bodyweightReferences();
    const needsFactor = unit === 'bodyweight';
    const factor = needsFactor && likeNorm
      ? (refs.filter(function (r) { return r.norm === likeNorm; })[0] || {}).bodyweightFactor
      : null;
    const ready = !!String(name).trim() && !!unit && !!primary;

    function toggleGroup(id) {
      if (id === primary) { setPrimary(''); return; }
      if (secondary.indexOf(id) >= 0) {
        setSecondary(secondary.filter(function (x) { return x !== id; }));
        return;
      }
      if (!primary) { setPrimary(id); return; }
      setSecondary(secondary.concat([id]));
    }

    function save(withFactor) {
      const res = api.save(name, {
        primaryGroup: primary,
        secondaryGroups: secondary,
        unit: unit,
        bodyweightFactor: withFactor ? factor : null
      });
      if (res.ok) onDone(String(name).trim());
    }

    return h('div', { className: 'sb-root sb-screen' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onCancel, 'aria-label': 'Отменить'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Новое упражнение'),
          h('div', { className: 'sb-head-sub' }, 'Три поля, третье — только иногда')
        )
      ),
      h('div', { className: 'sb-list' },
        h('input', {
          className: 'sb-ap-field sb-ex-name',
          type: 'text',
          value: name,
          placeholder: 'Название упражнения',
          onChange: function (e) { setName(e.target.value); },
          'aria-label': 'Название упражнения'
        }),

        h('div', { className: 'sb-step' },
          h('span', null, '1 · Что меряем'),
          h('i', null, 'обязательно')
        ),
        api.units.map(function (u) {
          return h('button', {
            key: u.id,
            type: 'button',
            className: 'sb-radio' + (unit === u.id ? ' is-on' : ''),
            onClick: function () { setUnit(u.id); if (u.id !== 'bodyweight') setLikeNorm(''); }
          },
            h('span', { className: 'sb-radio-dot' }),
            h('div', { className: 'sb-cat-title' },
              h('b', null, u.label),
              h('span', null, unitHint(u.id))
            )
          );
        }),

        h('div', { className: 'sb-step' },
          h('span', null, '2 · Группы мышц'),
          h('i', null, 'обязательно')
        ),
        h('div', { className: 'sb-step-hint' },
          primary
            ? 'Основная «' + api.groupLabel(primary) + '» берёт полный вес упражнения, синергист — половину'
            : 'Первая выбранная станет основной, следующие — синергистами'
        ),
        h('div', { className: 'sb-chips' },
          api.groups.map(function (g) {
            const isPrimary = g.id === primary;
            const isSecondary = secondary.indexOf(g.id) >= 0;
            return h('button', {
              key: g.id,
              type: 'button',
              className: 'sb-chip' + (isPrimary ? ' is-primary' : (isSecondary ? ' is-on' : '')),
              onClick: function () { toggleGroup(g.id); }
            }, isPrimary ? g.label + ' · основная' : g.label);
          })
        ),

        needsFactor && h('div', { className: 'sb-step' },
          h('span', null, '3 · На что похоже движение'),
          h('i', null, 'можно пропустить')
        ),
        needsFactor && h('div', { className: 'sb-step-hint' },
          'Коэффициент — физический факт про движение, а не настройка. Выберите похожее, и он подставится сам.'
        ),
        needsFactor && refs.map(function (r) {
          return h('button', {
            key: r.norm,
            type: 'button',
            className: 'sb-radio' + (likeNorm === r.norm ? ' is-on' : ''),
            onClick: function () { setLikeNorm(r.norm); }
          },
            h('span', { className: 'sb-radio-dot' }),
            h('div', { className: 'sb-cat-title' },
              h('b', null, 'Как ' + r.name.toLowerCase()),
              h('span', null, Math.round(r.bodyweightFactor * 100) + '% массы тела')
            )
          );
        })
      ),

      h('div', { className: 'sb-panel sb-panel-column' },
        h('button', {
          type: 'button',
          className: 'sb-finish',
          disabled: !ready || (needsFactor && !likeNorm),
          onClick: function () { save(true); }
        }, 'Создать упражнение'),
        // Дефолт не выдумываем: без ответа упражнение живёт, но без тоннажа.
        needsFactor && h('button', {
          type: 'button',
          className: 'sb-btn',
          disabled: !ready,
          onClick: function () { save(false); }
        }, 'Создать · без тоннажа')
      )
    );
  }

  function unitHint(id) {
    if (id === 'weight_reps') return 'Штанга, гантели, тренажёр';
    if (id === 'bodyweight') return 'Подтягивания, отжимания, брусья';
    if (id === 'time') return 'Планка, вис, статика';
    return 'Прогулка фермера, санки';
  }

  Cat.CatalogScreen = CatalogScreen;
  Cat.NewExerciseScreen = NewExerciseScreen;
})(typeof window !== 'undefined' ? window : globalThis);
