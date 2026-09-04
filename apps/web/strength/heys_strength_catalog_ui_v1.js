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

  function exerciseCountLabel(count) {
    const n = Math.max(0, Math.round(+count || 0));
    const mod100 = n % 100;
    const mod10 = n % 10;
    const word = mod100 >= 11 && mod100 <= 14 ? 'упражнений'
      : mod10 === 1 ? 'упражнение'
        : mod10 >= 2 && mod10 <= 4 ? 'упражнения' : 'упражнений';
    return n + ' ' + word;
  }

  /** Canvas Б2 · мост канвас-ролей (--c2, --acs…) на v4 без правки CSS-модуля. */
  var CATALOG_V4_BRIDGE = {
    '--c1': 'var(--v4-c1, #f7efe2)',
    '--c2': 'var(--v4-hero, #efe3cf)',
    '--bg': 'var(--v4-bg, #fffaf3)',
    '--tx': 'var(--v4-ink, #201e1d)',
    '--ac': 'var(--v4-act-text, #8a4a20)',
    '--acs': 'var(--v4-act, #c67139)',
    '--on-acs': 'var(--v4-btn-on-act, #2b1608)',
    '--ink': 'var(--v4-ink-rgb, 32, 30, 29)',
    '--sb-card': 'var(--v4-c1, #f7efe2)',
    '--sb-bg': 'var(--v4-bg, #fffaf3)',
    '--sb-tx': 'var(--v4-ink, #201e1d)',
    '--sb-mut': 'var(--v4-ink-data, rgba(32, 30, 29, 0.56))',
    '--sb-soft': 'var(--v4-hero, #efe3cf)',
    '--sb-acc': 'var(--v4-act-text, #8a4a20)',
    '--sb-acc-strong': 'var(--v4-act, #c67139)',
    '--sb-accbg': 'var(--v4-accent-bg, #f6e6dd)',
    '--sb-accTx': 'var(--v4-act-text, #8a4a20)',
    '--tint': 'var(--v4-accent-bg, #f6e6dd)',
    '--ac2': 'var(--v4-warn-text, #a1471c)'
  };

  function formatFactorLabel(factor) {
    const api = metaApi();
    if (api && typeof api.formatBodyweightFactor === 'function') {
      return api.formatBodyweightFactor(factor);
    }
    const n = parseFloat(String(factor == null ? '' : factor).replace(',', '.'));
    if (!isFinite(n)) return '';
    return n.toFixed(1).replace('.', ',');
  }

  function formatVolumeKg(kg) {
    const api = metaApi();
    if (api && typeof api.formatVolumeKg === 'function') return api.formatVolumeKg(kg);
    const n = Math.round(+kg || 0);
    return n.toLocaleString('ru-RU').replace(/\u00A0/g, '\u202F') + ' кг';
  }

  /** Каталог с фильтром по группе и поиском (экран 03). */
  function CatalogScreen(props) {
    const { onPick, onCreate, onBack, historyFor } = props;
    const [query, setQuery] = React.useState('');
    const [group, setGroup] = React.useState('all');
    const api = metaApi();
    const groups = api ? api.groups : [];
    const lowerBodyGroups = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'];
    const commonGroupIds = ['chest', 'back', 'shoulders'];
    const groupChips = commonGroupIds.map(function (id) {
      return groups.find(function (candidate) { return candidate.id === id; });
    }).filter(Boolean);
    groupChips.splice(2, 0, { id: 'legs', label: 'Ноги' });
    groups.forEach(function (candidate) {
      if (commonGroupIds.indexOf(candidate.id) < 0) {
        groupChips.push(candidate);
      }
    });

    const rows = React.useMemo(function () {
      const fn = HEYS.getExerciseSuggestions;
      const list = typeof fn === 'function' ? fn(query, 60) : [];
      if (!api) return list;
      return list.filter(function (r) {
        if (group === 'all') return true;
        if (group === 'fav') return !!r.favorite;
        const m = api.get(r.name);
        if (!m) return false;
        if (group === 'legs') {
          return lowerBodyGroups.indexOf(m.primaryGroup) >= 0 || (m.secondaryGroups || [])
            .some(function (id) { return lowerBodyGroups.indexOf(id) >= 0; });
        }
        return m.primaryGroup === group || (m.secondaryGroups || []).indexOf(group) >= 0;
      });
    }, [query, group, api]);

    const groupLabel = group === 'all' ? 'Все группы'
      : group === 'fav' ? 'Избранное'
        : group === 'legs' ? 'Ноги'
        : (api ? api.groupLabel(group) : '');

    function previousResult(name) {
      if (typeof historyFor !== 'function') return '';
      const history = historyFor(name);
      const approaches = history && history.last && Array.isArray(history.last.approaches)
        ? history.last.approaches
        : [];
      const last = approaches.find(function (approach) {
        return approach && +approach.weightKg > 0 && +approach.reps > 0;
      });
      if (!last) return 'прошлый раз ещё не делали';
      return 'прошлый раз ' + String(last.weightKg).replace('.', ',') + ' × ' + last.reps;
    }

    const trimmedQuery = String(query || '').trim();
    const catalogMatches = React.useMemo(function () {
      const fn = HEYS.getExerciseSuggestions;
      return typeof fn === 'function' ? fn(trimmedQuery, 60) : [];
    }, [trimmedQuery]);
    const catalogHasExact = !trimmedQuery || catalogMatches.some(function (row) {
      return String(row.name || '').trim().toLowerCase() === trimmedQuery.toLowerCase()
        || String(row.norm || '').trim().toLowerCase() === trimmedQuery.toLowerCase();
    });
    const showCreateRow = !!trimmedQuery && !catalogHasExact;

    return h('div', {
      className: 'sb-root sb-screen sb-catalog-screen',
      style: CATALOG_V4_BRIDGE
    },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onBack, 'aria-label': 'Назад'
        }, '‹'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Каталог упражнений'),
          h('div', { className: 'sb-head-sub' }, groupLabel + ' · ' + exerciseCountLabel(rows.length))
        )
      ),
      h('div', { className: 'sb-catalog-scroll' },
        h('div', { className: 'sb-search' },
          h('span', { 'aria-hidden': 'true' }, '⌕'),
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
          groupChips.map(function (g) {
            return h('button', {
              key: g.id,
              type: 'button',
              className: 'sb-chip' + (group === g.id ? ' is-on' : ''),
              onClick: function () { setGroup(g.id); }
            }, g.label);
          })
        ),
        h('div', { className: 'sb-list' },
          h('div', { className: 'sb-cat-list' },
            rows.map(function (r) {
              const m = api ? api.get(r.name) : null;
              const groupName = m && api ? api.groupLabel(m.primaryGroup) : 'своё упражнение';
              const prior = previousResult(r.name);
              const sub = groupName + (prior ? ' · ' + prior : '');
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
            })
          ),
          showCreateRow && h('button', {
            type: 'button',
            className: 'sb-cat-create',
            onClick: function () { onCreate(trimmedQuery); }
          },
            h('span', { className: 'sb-cat-add', 'aria-hidden': 'true' }, '+'),
            h('div', { className: 'sb-cat-title' },
              h('b', null, 'Создать «' + trimmedQuery + '»'),
              h('span', null, 'каталог подсказывает, но не запрещает')
            )
          ),
          h('p', { className: 'sb-catalog-note' },
            'Строка создания появляется, когда в поиске набрано то, чего в каталоге нет. Прошлый результат стоит у каждого упражнения — по нему выбирают, а не по названию; у кого его нет, так и написано. Звезда слева — избранное: она же отдельным фильтром в ряду, чтобы свой короткий список открывался одним тапом.')
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

    return h('div', {
      className: 'sb-root sb-screen',
      style: CATALOG_V4_BRIDGE
    },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onCancel, 'aria-label': 'Отменить'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Новое упражнение'),
          h('div', { className: 'sb-head-sub' }, 'три поля, третье — только иногда')
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

        unit && !needsFactor && h('div', { className: 'sb-step' },
          h('span', null, '3 · Только для своего веса')
        ),
        unit && !needsFactor && h('div', { className: 'sb-block' },
          h('div', { className: 'sb-step-hint' },
            'Для «вес × повторы» третий вопрос не задаётся.')
        ),
        needsFactor && h('div', { className: 'sb-step' },
          h('span', null, '3 · На что похоже движение'),
          h('i', null, 'можно пропустить')
        ),
        needsFactor && h('div', { className: 'sb-block' },
          h('div', { className: 'sb-step-hint' },
            'У упражнений на своём весе спрашиваем «на что похоже» — отжимания, подтягивания, приседания — и коэффициент берём оттуда, а не числом.'),
          refs.map(function (r) {
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
        )
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
        }, 'Создать · без тоннажа'),
        unit && h('p', { className: 'sb-catalog-note' },
          'Без ответа на третий вопрос упражнение в объём не идёт — и об этом будет строка в итогах, а не тишина.')
      )
    );
  }

  /**
   * М2 · группы мышц упражнения: одна основная, синергисты, превью объёма.
   */
  function ExerciseMuscleGroupsScreen(props) {
    const {
      exerciseName, primaryGroup, secondaryGroups, previewTonnageKg, onSave, onBack
    } = props;
    const api = metaApi();
    const [primary, setPrimary] = React.useState(primaryGroup || '');
    const [secondary, setSecondary] = React.useState(Array.isArray(secondaryGroups)
      ? secondaryGroups.slice()
      : []);

    if (!api) return null;

    const share = typeof api.synergistShare === 'number' ? api.synergistShare : 0.5;
    const volumeRows = typeof api.muscleVolumePreviewRows === 'function'
      ? api.muscleVolumePreviewRows(previewTonnageKg, primary, secondary, share)
      : [];
    const titleName = String(exerciseName || '').trim() || 'Упражнение';

    function selectPrimary(id) {
      setPrimary(id);
      if (secondary.indexOf(id) >= 0) {
        setSecondary(secondary.filter(function (x) { return x !== id; }));
      }
    }

    function toggleSecondary(id) {
      if (id === primary) return;
      if (secondary.indexOf(id) >= 0) {
        setSecondary(secondary.filter(function (x) { return x !== id; }));
        return;
      }
      setSecondary(secondary.concat([id]));
    }

    function save() {
      if (!primary) return;
      if (typeof onSave === 'function') onSave(primary, secondary);
    }

    return h('div', {
      className: 'sb-root sb-screen sb-catalog-screen sb-ex-muscle-screen',
      style: CATALOG_V4_BRIDGE
    },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onBack, 'aria-label': 'Назад'
        }, '‹'),
        h('div', { className: 'sb-head-title' },
          h('b', null, titleName + ' · мышцы'),
          h('div', { className: 'sb-head-sub' }, 'одна основная, синергисты по желанию')
        )
      ),
      h('div', { className: 'sb-catalog-scroll' },
        h('div', { className: 'sb-tier' }, 'Основная — одна'),
        h('div', { className: 'sb-chips sb-ex-muscle-primary' },
          api.groups.map(function (g) {
            return h('button', {
              key: g.id,
              type: 'button',
              className: 'sb-chip' + (g.id === primary ? ' is-on' : ''),
              onClick: function () { selectPrimary(g.id); }
            }, g.label.toLowerCase());
          })
        ),
        h('div', { className: 'sb-tier' }, 'Синергисты — сколько нужно'),
        h('div', { className: 'sb-chips sb-ex-muscle-secondary' },
          api.groups.map(function (g) {
            if (g.id === primary) return null;
            const isOn = secondary.indexOf(g.id) >= 0;
            return h('button', {
              key: g.id,
              type: 'button',
              className: 'sb-chip' + (isOn ? ' is-secondary' : ''),
              style: isOn ? { background: 'var(--tint)', color: 'var(--ac)' } : undefined,
              onClick: function () { toggleSecondary(g.id); }
            }, g.label.toLowerCase());
          })
        ),
        primary && volumeRows.length > 0 && h('div', { className: 'sb-tier' }, 'Как это ляжет в объём'),
        primary && volumeRows.length > 0 && h('div', { className: 'sb-ex-card-cd sb-ex-muscle-volume' },
          volumeRows.map(function (row, idx) {
            return h('div', {
              key: row.groupId,
              className: 'sb-ex-card-row' + (idx === volumeRows.length - 1 ? ' is-last' : '')
            },
              h('span', { className: 'sb-ex-card-row-copy' },
                h('b', null, row.label)
              ),
              h('span', {
                className: 'sb-ex-muscle-kg' + (row.isPrimary ? ' is-primary' : '')
              }, formatVolumeKg(row.kg))
            );
          })
        ),
        h('p', { className: 'sb-catalog-note' },
          'Список закрыт одиннадцатью и своих групп не принимает: иначе объём по группам перестаёт складываться между людьми, а движок нагрузки — сравнивать неделю с неделей. Числа показаны сразу под выбором — видно, что синергист берёт ровно половину.'),
        primary && h('button', {
          type: 'button',
          className: 'sb-finish',
          onClick: save
        }, 'Сохранить группы')
      )
    );
  }

  /**
   * М3 · на что похоже: коэффициент своего веса выбором образца, не числом.
   */
  function ExerciseSimilarScreen(props) {
    const {
      exerciseName, bodyWeightKg, selectedKey, bodyweightFactor, onSave, onBack
    } = props;
    const api = metaApi();
    const options = api && typeof api.bodyweightSimilarOptions === 'function'
      ? api.bodyweightSimilarOptions()
      : [];
    const initialKey = selectedKey || (bodyweightFactor == null
      ? 'unknown'
      : (options.find(function (row) {
        return row.bodyweightFactor === bodyweightFactor;
      }) || {}).key || '');
    const [choiceKey, setChoiceKey] = React.useState(initialKey);

    if (!api) return null;

    const selected = options.filter(function (row) { return row.key === choiceKey; })[0] || null;
    const factor = selected ? selected.bodyweightFactor : null;
    const bw = +bodyWeightKg > 0 ? +bodyWeightKg : 0;
    const perRepKg = factor != null && bw > 0 ? Math.round(bw * factor) : null;
    const factorLabel = formatFactorLabel(factor);
    const titleName = String(exerciseName || '').trim() || 'Упражнение';

    function save() {
      if (typeof onSave === 'function') onSave(selected);
    }

    return h('div', {
      className: 'sb-root sb-screen sb-catalog-screen sb-ex-similar-screen',
      style: CATALOG_V4_BRIDGE
    },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onBack, 'aria-label': 'Назад'
        }, '‹'),
        h('div', { className: 'sb-head-title' },
          h('b', null, titleName + ' · свой вес'),
          h('div', { className: 'sb-head-sub' }, 'сколько тела поднимается')
        )
      ),
      h('div', { className: 'sb-catalog-scroll' },
        h('div', { className: 'sb-block sb-ex-similar-list' },
          options.map(function (row, idx) {
            const isOn = row.key === choiceKey;
            const isLast = idx === options.length - 1;
            return h('button', {
              key: row.key,
              type: 'button',
              className: 'sb-radio sb-ex-similar-row'
                + (isOn ? ' is-on' : '')
                + (isLast ? ' is-last' : ''),
              onClick: function () { setChoiceKey(row.key); }
            },
              h('div', { className: 'sb-cat-title' },
                h('b', null, row.label),
                h('span', {
                  className: row.isUnknown ? 'sb-ex-similar-warn' : '',
                  style: row.isUnknown ? { color: 'var(--ac2)' } : undefined
                }, row.hint)
              ),
              row.bodyweightFactor != null && h('span', {
                className: 'sb-ex-similar-factor' + (isOn ? ' is-on' : '')
              }, formatFactorLabel(row.bodyweightFactor))
            );
          })
        ),
        perRepKg != null && factorLabel && h('div', {
          className: 'sb-grp sb-ex-similar-preview',
          style: { marginTop: '10px', background: 'var(--c2)' }
        },
          h('b', null, bw + ' кг × ' + factorLabel + ' = ' + perRepKg + ' кг за повтор'),
          h('p', { className: 'sb-ex-similar-prose' },
            'Вес тела берётся из профиля на день тренировки и задним числом не меняется.')
        ),
        h('p', { className: 'sb-catalog-note' },
          'Спрашиваем не число, а образец: «на что похоже» человек ответит, а «0,64» — нет. Коэффициент при этом физический факт, а не настройка: он один для всех и правится только в справочнике.'),
        h('button', {
          type: 'button',
          className: 'sb-finish',
          onClick: save
        }, 'Сохранить')
      )
    );
  }

  function unitHint(id) {
    if (id === 'weight_reps') return 'Штанга, гантели, тренажёр';
    if (id === 'bodyweight') return 'Подтягивания, отжимания, брусья';
    if (id === 'time') return 'Планка, вис, статика';
    return 'Прогулка фермера, санки';
  }

  /**
   * Новая связка (экран 22). Суперсет, трисет и круговая — одно и то же,
   * отличаются только числом участников: отдельного режима нет.
   */
  function SupersetScreen(props) {
    const { exercises, startIndex, onCreate, onCancel } = props;
    const available = Math.max(0, (exercises || []).length - startIndex);
    const [count, setCount] = React.useState(Math.min(2, available));
    const [rounds, setRounds] = React.useState(3);

    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    let rest = 0;
    for (let i = startIndex; i < startIndex + count && i < exercises.length; i++) {
      const r = +(exercises[i] && exercises[i].restSec) || 0;
      if (r > rest) rest = r;
    }
    if (!rest) rest = 90;

    const kinds = [
      { n: 2, t: 'Суперсет', d: 'два упражнения подряд без паузы' },
      { n: 3, t: 'Трисет', d: 'три подряд — плотнее и тяжелее' },
      { n: 4, t: 'Круговая', d: 'четыре и больше, круг за кругом' }
    ];
    const restLabel = Math.floor(rest / 60) + ':' + (rest % 60 < 10 ? '0' : '') + (rest % 60);
    const totalApproaches = count * rounds;
    const estimatedMinutes = Math.ceil((totalApproaches * 45 + rounds * rest) / 60);
    const countWord = count === 2 ? '2 упражнения' : count === 3 ? '3 упражнения' : count + ' упражнений';

    return h('div', { className: 'sb-root sb-screen sb-superset-create-screen' },
      h('div', { className: 'sb-head' },
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Новая связка'),
          h('div', { className: 'sb-head-sub' }, 'упражнения подряд, отдых — после круга')
        ),
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onCancel, 'aria-label': 'Отменить'
        }, '✕')
      ),
      h('div', { className: 'sb-list' },
        h('div', { className: 'sb-step' }, h('span', null, 'Сколько упражнений')),
        h('div', { className: 'sb-superset-kinds' },
          kinds.map(function (k) {
            const disabled = k.n > available;
            return h('button', {
              key: k.n,
              type: 'button',
              className: 'sb-radio' + (count === k.n ? ' is-on' : ''),
              disabled: disabled,
              onClick: function () { setCount(k.n); }
            },
              h('span', { className: 'sb-ex-num' }, k.n === 4 ? '4+' : String(k.n)),
              h('div', { className: 'sb-cat-title' },
                h('b', null, k.t),
                h('span', null, disabled ? 'Не хватает упражнений ниже по списку' : k.d)
              ),
              count === k.n && h('span', { className: 'sb-radio-check', 'aria-hidden': 'true' }, '✓')
            );
          })
        ),

        h('div', { className: 'sb-superset-controls' },
          h('div', { className: 'sb-superset-control' },
            h('div', { className: 'sb-control-label' }, 'Раундов'),
            h('div', { className: 'sb-stepper' },
              h('button', {
                type: 'button', className: 'sb-btn',
                onClick: function () { setRounds(Math.max(1, rounds - 1)); }
              }, '−'),
              h('b', null, String(rounds)),
              h('button', {
                type: 'button', className: 'sb-btn is-accent',
                onClick: function () { setRounds(Math.min(20, rounds + 1)); }
              }, '+')
            )
          ),
          h('div', { className: 'sb-superset-control' },
            h('div', { className: 'sb-control-label' }, 'Отдых после круга'),
            h('div', { className: 'sb-rest-preview' }, restLabel),
            h('div', { className: 'sb-control-hint' }, 'максимум из значений участников')
          )
        ),

        h('div', { className: 'sb-step' }, h('span', null, 'Что получится')),
        h('div', { className: 'sb-block sb-superset-result' },
          h('div', { className: 'sb-step-hint' },
            countWord + ' подряд без паузы, затем отдых ' + restLabel + '. Так ' + rounds + ' раза.'),
          h('div', { className: 'sb-tiles' },
            h('div', { className: 'sb-tile' }, h('span', null, 'подходов'), h('b', null, String(totalApproaches))),
            h('div', { className: 'sb-tile' }, h('span', null, 'пауз'), h('b', null, String(rounds))),
            h('div', { className: 'sb-tile' }, h('span', null, 'время'), h('b', null, estimatedMinutes + ' мин'))
          )
        ),
        h('button', {
          type: 'button',
          className: 'sb-finish',
          disabled: !SK || count < 2 || count > available,
          onClick: function () { onCreate(SK.makeSuperset(exercises, startIndex, count, rounds, rest)); }
        }, 'Собрать связку · ' + totalApproaches + ' подходов'),
        h('div', { className: 'sb-superset-note' },
          'Суперсет, трисет и круговая — один объект с разным числом участников: жёсткой двойки нет нигде. Экран считает вперёд — подходы, паузы и время, — чтобы человек увидел цену связки до того, как её соберёт.')
      )
    );
  }

  /** Тост «Подход засчитан · … · Отменить» — общий для списка и режима порядка. */
  function ApproachUndoToast(props) {
    const toast = props && props.toast;
    if (!toast) return null;
    return h('div', { className: 'sb-order-toast', role: 'status' },
      h('span', { className: 'sb-order-toast-mark', 'aria-hidden': true }, '✓'),
      h('span', { className: 'sb-order-toast-copy' },
        h('b', null, toast.label || ''),
        toast.hint && h('span', null, toast.hint)
      ),
      h('button', {
        type: 'button',
        className: 'obtn sb-order-toast-undo',
        onClick: function () { if (typeof toast.onUndo === 'function') toast.onUndo(); }
      }, 'Отменить')
    );
  }

  /**
   * Ж1 · режим порядка: стрелки .sqb для пальца, ⠿ — перетаскивание мышью.
   * Связка двигается блоком; место вставки — полоса 2 px, не тень.
   */
  function OrderScreen(props) {
    const { exercises, onApply, onCancel, undoToast } = props;
    const [list, setList] = React.useState(exercises || []);
    const [dragFrom, setDragFrom] = React.useState(null);
    const [insertBefore, setInsertBefore] = React.useState(null);
    const listRef = React.useRef(null);
    const dragRef = React.useRef(null);
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    const Parts = HEYS.StrengthBuilderParts || {};
    const planExerciseSummary = typeof Parts.planExerciseSummary === 'function'
      ? Parts.planExerciseSummary
      : function () { return ''; };

    React.useEffect(function () {
      setList(exercises || []);
    }, [exercises]);

    if (!SK) return null;
    const blocks = SK.orderBlocks(list);

    function workApproaches(exercise) {
      const approaches = exercise && Array.isArray(exercise.approaches) ? exercise.approaches : [];
      return approaches.filter(function (approach) {
        return !(SK && SK.isWarmupApproach(approach));
      });
    }

    function groupLetter(block, blockIdx) {
      const gid = block && block.groupId;
      if (Number.isInteger(gid) && gid > 0 && gid <= 26) return String.fromCharCode(64 + gid);
      return String.fromCharCode(65 + blockIdx);
    }

    function blockMeta(block, blockIdx) {
      if (block.groupId > 0) {
        const names = block.indexes.map(function (i) { return list[i].name || 'Без названия'; });
        const totalApproaches = block.indexes.reduce(function (sum, i) {
          return sum + workApproaches(list[i]).length;
        }, 0);
        const approachWord = totalApproaches % 10 === 1 && totalApproaches % 100 !== 11
          ? 'подход'
          : totalApproaches % 10 >= 2 && totalApproaches % 10 <= 4 && !(totalApproaches % 100 >= 12 && totalApproaches % 100 <= 14)
            ? 'подхода'
            : 'подходов';
        return {
          isGroup: true,
          title: 'Связка ' + groupLetter(block, blockIdx),
          subtitle: names.join(' ⇄ ') + ' · ' + totalApproaches + ' ' + approachWord
        };
      }
      const ex = list[block.indexes[0]] || {};
      return {
        isGroup: false,
        title: ex.name || 'Без названия',
        subtitle: planExerciseSummary(ex)
      };
    }

    function applyInsert(fromIdx, beforeIdx) {
      if (fromIdx == null || beforeIdx == null) return;
      if (fromIdx === beforeIdx || fromIdx + 1 === beforeIdx) return;
      const order = blocks.slice();
      const moved = order.splice(fromIdx, 1)[0];
      let insertAt = beforeIdx;
      if (beforeIdx > fromIdx) insertAt -= 1;
      order.splice(insertAt, 0, moved);
      const out = [];
      order.forEach(function (block) {
        block.indexes.forEach(function (i) { out.push(list[i]); });
      });
      setList(out);
    }

    function move(blockIdx, dir) {
      setList(SK.moveBlock(list, blockIdx, dir));
    }

    function insertBeforeFromPointer(clientY) {
      const root = listRef.current;
      if (!root) return blocks.length;
      const rows = root.querySelectorAll('[data-order-row]');
      for (let i = 0; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
      }
      return rows.length;
    }

    function finishDrag() {
      const from = dragRef.current.from;
      const before = dragRef.current.before;
      dragRef.current = { from: null, before: null, active: false };
      setDragFrom(null);
      setInsertBefore(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      applyInsert(from, before);
    }

    function onPointerMove(e) {
      if (!dragRef.current.active) return;
      setInsertBefore(insertBeforeFromPointer(e.clientY));
    }

    function onPointerUp() {
      if (!dragRef.current.active) return;
      finishDrag();
    }

    function startDrag(blockIdx, e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { from: blockIdx, before: blockIdx, active: true };
      setDragFrom(blockIdx);
      setInsertBefore(blockIdx);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    }

    React.useEffect(function () {
      return function () {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };
    }, []);

    function renderRow(block, bi, opts) {
      const options = opts || {};
      const meta = blockMeta(block, bi);
      const isDragging = dragFrom === bi && !options.isPreview;
      const isDropTarget = options.isPreview;
      const rowClass = 'sb-order-row'
        + (meta.isGroup ? ' is-group' : '')
        + (isDropTarget ? ' is-drop-target' : '')
        + (isDragging ? ' is-dragging' : '');
      const subtitle = isDropTarget ? 'переносится сюда' : meta.subtitle;
      return h('div', {
        key: options.key || ('b' + bi),
        className: 'sb-order-ex',
        'data-order-row': true
      },
        h('div', { className: rowClass },
          h('span', {
            className: 'sb-order-handle' + (isDropTarget ? ' is-accent' : ''),
            onPointerDown: options.isPreview ? undefined : function (e) { startDrag(bi, e); },
            'aria-hidden': true
          }, '⠿'),
          h('span', {
            className: 'sb-ex-num'
              + (isDropTarget ? ' is-accent' : '')
              + (meta.isGroup && !isDropTarget ? ' is-group-num' : '')
          }, String(bi + 1)),
          h('div', { className: 'sb-cat-title' },
            h('b', null, meta.title),
            subtitle && h('span', { className: isDropTarget ? 'is-accent' : '' }, subtitle)
          ),
          !options.isPreview && h('div', { className: 'sb-order-arrows' },
            h('button', {
              type: 'button', className: 'sqb',
              disabled: bi === 0,
              onClick: function () { move(bi, -1); },
              'aria-label': 'Выше'
            }, '▲'),
            h('button', {
              type: 'button', className: 'sqb',
              disabled: bi === blocks.length - 1,
              onClick: function () { move(bi, 1); },
              'aria-label': 'Ниже'
            }, '▼')
          )
        )
      );
    }

    const rows = [];
    blocks.forEach(function (block, bi) {
      if (dragFrom !== null && insertBefore === bi) {
        rows.push(h('div', { key: 'ins-' + bi, className: 'sb-order-insert', 'aria-hidden': true }));
        rows.push(renderRow(blocks[dragFrom], bi, { isPreview: true, key: 'preview-' + bi }));
      }
      if (dragFrom === bi) return;
      rows.push(renderRow(block, bi));
    });
    if (dragFrom !== null && insertBefore === blocks.length) {
      rows.push(h('div', { key: 'ins-end', className: 'sb-order-insert', 'aria-hidden': true }));
    }

    return h('div', { className: 'sb-root sb-screen sb-order-screen' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button',
          className: 'sb-icon-btn sb-icon-btn--close',
          onClick: onCancel,
          'aria-label': 'Отменить'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Тот же список · режим порядка'),
          h('div', { className: 'sb-head-sub' }, 'стрелки для пальца, ⠿ — мышью')
        ),
        h('button', {
          type: 'button',
          className: 'obtn sb-order-done',
          onClick: function () { onApply(list); }
        }, 'Готово')
      ),
      h('div', { className: 'sb-list sb-order-list', ref: listRef },
        rows.length ? rows : null
      ),
      undoToast && h(ApproachUndoToast, { toast: undoToast }),
      h('p', { className: 'sb-order-foot' },
        'Связка перетаскивается целиком, как один блок: порядок внутри неё меняется в самой связке. '
        + 'Стрелки «выше / ниже» стоят рядом с ⠿ — пальцем тащить список в скролле невозможно. '
        + 'Случайная галочка снимается тостом, а не долгим тапом.')
    );
  }

  Cat.ApproachUndoToast = ApproachUndoToast;
  Cat.OrderScreen = OrderScreen;

  Cat.SupersetScreen = SupersetScreen;

  Cat.CatalogScreen = CatalogScreen;
  Cat.NewExerciseScreen = NewExerciseScreen;
  Cat.ExerciseMuscleGroupsScreen = ExerciseMuscleGroupsScreen;
  Cat.ExerciseSimilarScreen = ExerciseSimilarScreen;
})(typeof window !== 'undefined' ? window : globalThis);
