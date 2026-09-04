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

    return h('div', { className: 'sb-root sb-screen sb-catalog-screen' },
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

  /**
   * Режим порядка (экран 06): тот же список, не отдельное место. Стрелки для
   * пальца — перетаскивание мышью остаётся в обычном режиме конструктора.
   * Связка двигается блоком целиком: разорвать её здесь нельзя.
   */
  function OrderScreen(props) {
    const { exercises, onApply, onCancel } = props;
    const [list, setList] = React.useState(exercises || []);
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    if (!SK) return null;
    const blocks = SK.orderBlocks(list);

    function move(blockIdx, dir) {
      setList(SK.moveBlock(list, blockIdx, dir));
    }

    return h('div', { className: 'sb-root sb-screen' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onCancel, 'aria-label': 'Отменить'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Тот же список · режим порядка'),
          h('div', { className: 'sb-head-sub' }, 'Стрелки двигают блок целиком')
        ),
        h('button', {
          type: 'button', className: 'sb-order-done',
          onClick: function () { onApply(list); }
        }, 'Готово')
      ),
      h('div', { className: 'sb-list' },
        blocks.map(function (block, bi) {
          const isGroup = block.groupId > 0;
          const names = block.indexes.map(function (i) { return list[i].name || 'Без названия'; });
          return h('div', {
            key: bi,
            className: 'sb-order-row' + (isGroup ? ' is-group' : '')
          },
            h('span', { className: 'sb-ex-num' }, String(bi + 1)),
            h('div', { className: 'sb-cat-title' },
              h('b', null, isGroup ? 'Связка ' + names.join(' ⇄ ') : names[0]),
              isGroup && h('span', null, block.indexes.length + ' упражнения подряд')
            ),
            h('div', { className: 'sb-order-arrows' },
              h('button', {
                type: 'button', className: 'sb-icon-btn',
                disabled: bi === 0,
                onClick: function () { move(bi, -1); },
                'aria-label': 'Выше'
              }, '▲'),
              h('button', {
                type: 'button', className: 'sb-icon-btn',
                disabled: bi === blocks.length - 1,
                onClick: function () { move(bi, 1); },
                'aria-label': 'Ниже'
              }, '▼')
            )
          );
        })
      )
    );
  }

  Cat.OrderScreen = OrderScreen;

  Cat.SupersetScreen = SupersetScreen;

  Cat.CatalogScreen = CatalogScreen;
  Cat.NewExerciseScreen = NewExerciseScreen;
})(typeof window !== 'undefined' ? window : globalThis);
