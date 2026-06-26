// heys_training_focus_ui_v1.js — shared focus-mode UI primitives for training modes.
//
// Domain modules pass labels/data/actions; this layer owns the common modal
// layout used by current and future training modes.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.TrainingFocus && HEYS.TrainingFocus.__registered) return;

  const React = global.React;
  if (!React) {
    HEYS.TrainingFocus = HEYS.TrainingFocus || {};
    HEYS.TrainingFocus.__registered = false;
    HEYS.TrainingFocus.__missingReact = true;
    return;
  }

  const h = React.createElement;

  function cx() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
  }

  function prefixClass(prefix, suffix) {
    return prefix ? prefix + suffix : suffix;
  }

  function Header(props) {
    const prefix = props.classPrefix || 'training-focus';
    const actions = Array.isArray(props.actions) ? props.actions : [];
    return h('div', { className: cx(prefixClass(prefix, '__header'), props.premium !== false && prefixClass(prefix, '__header--premium')) },
      h('h1', { className: prefixClass(prefix, '__title') },
        h('span', { className: prefixClass(prefix, '__title-text') }, props.title || 'Тренировка')
      ),
      h('div', { className: prefixClass(prefix, '__header-actions') },
        actions.map(function (action) {
          return h('button', {
            key: action.id || action.label,
            type: 'button',
            className: cx(prefixClass(prefix, '__icon-btn'), action.kind === 'close' && prefixClass(prefix, '__icon-btn--close')),
            onClick: action.onClick,
            'aria-label': action.ariaLabel || action.title || action.label,
            title: action.title || action.label
          }, action.icon || action.label);
        })
      )
    );
  }

  function Tabs(props) {
    const prefix = props.classPrefix || 'training-focus';
    const items = Array.isArray(props.items) ? props.items : [];
    return h('div', { className: prefixClass(prefix, '-tabs'), role: 'tablist', 'aria-label': props.ariaLabel || 'Разделы тренировки' },
      items.map(function (item, idx) {
        const active = item.id === props.value;
        return h('button', {
          key: item.id,
          role: 'tab',
          type: 'button',
          'aria-selected': active,
          className: prefixClass(prefix, '-tab') + (active ? ' ' + prefixClass(prefix, '-tab--active') : ''),
          style: { animationDelay: (idx * 40) + 'ms' },
          onClick: function () { props.onChange && props.onChange(item.id); }
        },
          h('span', { key: 'i', className: prefixClass(prefix, '-tab__icon') }, item.icon),
          h('span', { key: 'l', className: prefixClass(prefix, '-tab__label') }, item.label)
        );
      })
    );
  }

  function EquipmentBar(props) {
    const prefix = props.classPrefix || 'training-focus';
    const items = Array.isArray(props.items) ? props.items : [];
    const selected = Array.isArray(props.value) ? props.value : [];
    return h('div', { className: prefixClass(prefix, '-equipment'), role: 'group', 'aria-label': props.ariaLabel || 'Оборудование' },
      items.map(function (item) {
        const active = selected.indexOf(item.id) >= 0;
        return h('button', {
          key: item.id,
          type: 'button',
          className: prefixClass(prefix, '-equipment-chip') + (active ? ' is-available' : ''),
          'data-equipment': item.id,
          onClick: function () { props.onToggle && props.onToggle(item.id); }
        },
          h('span', { 'aria-hidden': 'true' }, active ? '✓' : '+'),
          item.icon ? h('span', { 'aria-hidden': 'true' }, item.icon) : null,
          h('span', null, item.label || item.id)
        );
      })
    );
  }

  function GoalSelector(props) {
    const prefix = props.classPrefix || 'training-focus';
    const items = Array.isArray(props.items) ? props.items : [];
    return h('div', { className: prefixClass(prefix, '-goalsel') },
      h('div', { className: prefixClass(prefix, '-goalsel__label') }, props.label || 'Цель тренировки'),
      h('div', { className: prefixClass(prefix, '-goalsel__grid'), role: 'tablist', 'aria-label': props.label || 'Цель тренировки' },
        items.map(function (item) {
          const active = props.value === item.id;
          const count = Number(item.count) || 0;
          const countLabel = item.countLabel || item.statusLabel || String(count);
          const empty = item.empty === true || count === 0;
          return h('button', {
            key: item.id,
            type: 'button',
            role: 'tab',
            'aria-selected': active,
            className: prefixClass(prefix, '-goalsel__btn') + (active ? ' is-active' : '') + (empty ? ' is-empty' : '') + (item.statusLabel ? ' has-status' : ''),
            'data-goal': item.id,
            title: item.title || (count ? count + ' планов' : undefined),
            onClick: function () { props.onChange && props.onChange(item.id); }
          },
            h('span', { className: prefixClass(prefix, '-goalsel__emoji'), 'aria-hidden': 'true' }, item.icon || '🎯'),
            h('span', { className: prefixClass(prefix, '-goalsel__text') }, item.label || item.id),
            h('span', { className: prefixClass(prefix, '-goalsel__count'), 'aria-label': item.statusLabel || count + ' планов' }, countLabel)
          );
        })
      )
    );
  }

  function ReadinessCard(props) {
    const prefix = props.classPrefix || 'training-focus';
    const color = props.color || '#16a66a';
    const score = props.score == null ? null : String(props.score);
    const reasons = Array.isArray(props.reasons) ? props.reasons.slice(0, 3) : [];
    return h('div', {
      className: prefixClass(prefix, '-today__hero'),
      style: {
        padding: '18px 18px 16px',
        borderRadius: 16,
        marginBottom: 16,
        background: 'linear-gradient(135deg, ' + color + '1f 0%, ' + color + '08 100%)',
        border: '1px solid ' + color + '33'
      }
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        score != null
          ? h('div', {
              style: {
                flex: '0 0 auto',
                width: 60,
                height: 60,
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: color + '1f',
                border: '2.5px solid ' + color,
                color: color
              }
            },
              h('span', { style: { fontSize: 19, fontWeight: 800, lineHeight: 1 } }, score),
              h('span', { style: { fontSize: 10, opacity: 0.7, marginTop: 1, fontWeight: 600 } }, '/ 100')
            )
          : h('span', { style: { flex: '0 0 auto', fontSize: 36 }, 'aria-hidden': 'true' }, props.icon || '◌'),
        h('div', { style: { minWidth: 0 } },
          h('h2', { style: { margin: 0, fontSize: 19, fontWeight: 700, color: color, lineHeight: 1.2 } }, props.title || 'Сегодня'),
          props.subtitle ? h('div', { style: { fontSize: 13, opacity: 0.7, marginTop: 3 } }, props.subtitle) : null
        )
      ),
      reasons.length ? h('div', {
        style: {
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid ' + color + '22',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }
      }, reasons.map(function (reason, idx) {
        return h('div', { key: idx, style: { fontSize: 13, opacity: 0.85, display: 'flex', gap: 8 } },
          h('span', { style: { color: color, flex: '0 0 auto', fontWeight: 700 } }, '•'),
          h('span', null, reason)
        );
      })) : null
    );
  }

  function GuidedRunnerPanel(props) {
    const prefix = props.classPrefix || 'training-focus';
    const metrics = Array.isArray(props.metrics) ? props.metrics : [];
    const controls = Array.isArray(props.controls) ? props.controls : [];
    const steps = Array.isArray(props.steps) ? props.steps : [];
    const phases = Array.isArray(props.phases) ? props.phases : [];
    const progress = Math.max(0, Math.min(100, Number(props.progress) || 0));
    return h('section', {
      className: cx(
        prefixClass(prefix, '-panel'),
        prefixClass(prefix, '-execution'),
        prefixClass(prefix, '-guided'),
        props.className
      ),
      'data-training-runner': 'guided',
      'aria-label': props.ariaLabel || 'Тренировка с сопровождением'
    },
      h('div', { className: prefixClass(prefix, '-guided__hero') },
        h('div', { className: prefixClass(prefix, '-guided__visual') },
          props.image
            ? h('img', {
                src: props.image,
                alt: props.imageAlt || props.title || 'Фото упражнения',
                loading: 'lazy',
                decoding: 'async'
              })
            : h('div', { className: prefixClass(prefix, '-guided__fallback'), 'aria-hidden': 'true' }, props.fallbackIcon || '•')
        ),
        h('div', { className: prefixClass(prefix, '-guided__body') },
          h('div', { className: prefixClass(prefix, '-guided__kicker') }, props.kicker || 'Тренировка с сопровождением'),
          h('h3', { className: prefixClass(prefix, '-guided__title') }, props.title || 'Упражнение'),
          props.instruction ? h('p', { className: prefixClass(prefix, '-guided__instruction') }, props.instruction) : null,
          metrics.length ? h('div', { className: prefixClass(prefix, '-guided__metric') },
            metrics.map(function (metric, idx) {
              return h('div', { key: metric.id || idx },
                h('strong', null, metric.value == null ? '—' : String(metric.value)),
                h('span', null, metric.label || '')
              );
            })
          ) : null,
          h('div', { className: prefixClass(prefix, '-guided__progress'), 'aria-label': props.progressLabel || 'Прогресс тренировки' },
            h('span', { style: { width: progress + '%' } })
          ),
          phases.length ? h('ol', { className: prefixClass(prefix, '-breath-phases'), 'aria-label': props.phasesLabel || 'Фазы дыхания' },
            phases.map(function (phase, idx) {
              return h('li', { key: (phase.type || 'phase') + idx, 'data-phase': phase.type || null },
                phase.label || phase.type || 'Фаза',
                phase.durationSec != null ? ' ' + phase.durationSec + ' сек' : ''
              );
            })
          ) : null,
          controls.length ? h('div', { className: prefixClass(prefix, '-guided__controls') },
            controls.filter(Boolean).map(function (control, idx) {
              return h('button', {
                key: control.id || idx,
                type: 'button',
                disabled: !!control.disabled,
                onClick: control.onClick,
                'aria-label': control.ariaLabel || control.label
              }, control.label || control.id || 'Действие');
            })
          ) : null
        )
      ),
      h('div', {
        className: prefixClass(prefix, '-execution__status'),
        'data-status': props.status || 'idle',
        style: { display: 'none' }
      }),
      steps.length ? h('div', { className: prefixClass(prefix, '-guided__list'), 'aria-label': props.stepsLabel || 'Шаги тренировки' },
        steps.map(function (step, idx) {
          return h('div', {
            key: step.id || idx,
            className: cx(
              prefixClass(prefix, '-guided-step'),
              step.current && 'is-current',
              step.done && 'is-done'
            )
          },
            h('span', null, step.title || step.label || 'Шаг'),
            h('span', null, step.metric || '')
          );
        })
      ) : null
    );
  }

  function LiveRoadmap(props) {
    const rows = Array.isArray(props.items) ? props.items : Array.isArray(props.steps) ? props.steps : [];
    if (!rows.length) return null;
    // Domain supplies its own BEM base (e.g. its catalog-styled class); the
    // kernel stays free of domain literals and defaults to a neutral base.
    const base = props.baseClass || 'heys-training-roadmap';
    const currentIndex = Math.max(0, Math.min(rows.length - 1, Number(props.currentIndex) || 0));
    const densityClass = rows.length > 8 ? ' is-ultra-dense' : rows.length > 4 ? ' is-dense' : '';
    return h('section', {
      className: cx(base + densityClass, props.className),
      'aria-label': props.ariaLabel || 'Этапы тренировки'
    },
      h('div', { className: base + '__head' },
        h('span', null, props.title || 'Этапы тренировки'),
        h('strong', null, (currentIndex + 1) + '/' + rows.length)
      ),
      h('ol', { className: base + '__list' },
        rows.map(function (item, idx) {
          const isCurrent = idx === currentIndex || item.current;
          const isDone = idx < currentIndex || item.done;
          return h('li', {
            key: item.id || idx,
            className: cx(
              base + '__item',
              props.itemClassName,
              isCurrent && 'is-current',
              isDone && 'is-done'
            ),
            'aria-current': isCurrent ? 'step' : undefined
          },
            h('span', { className: base + '__index' }, isDone ? '✓' : String(idx + 1)),
            h('span', { className: base + '__body' },
              h('span', { className: base + '__title' }, item.title || item.label || 'Упражнение'),
              h('span', { className: base + '__meta' }, item.meta || item.metric || '')
            )
          );
        })
      )
    );
  }

  function LiveRunnerShell(props) {
    const base = props.baseClass || 'heys-training-live';
    const roadmap = props.roadmap || h(LiveRoadmap, {
      items: props.items || props.steps || [],
      currentIndex: props.currentIndex,
      baseClass: props.roadmapBaseClass,
      className: props.roadmapClassName,
      itemClassName: props.roadmapItemClassName,
      title: props.roadmapTitle,
      ariaLabel: props.roadmapLabel
    });
    return h('div', {
      className: cx(base, props.className),
      'data-training-runner': props.trainingRunner || 'guided',
      role: props.role || undefined,
      'aria-label': props.ariaLabel || undefined
    },
      props.ariaLabel ? h('span', {
        style: {
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0
        }
      }, props.ariaLabel) : null,
      props.runner || props.children || null,
      roadmap
    );
  }

  function LiveCountdownDisplay(props) {
    const controls = Array.isArray(props.controls) ? props.controls.filter(Boolean) : [];
    const chips = Array.isArray(props.chips) ? props.chips.filter(Boolean) : [];
    const ringRadius = Number(props.ringRadius) || 86;
    const ringCircum = 2 * Math.PI * ringRadius;
    const ratio = Math.max(0, Math.min(1, Number(props.ratio) || 0));
    const digit = props.digit == null ? '' : String(props.digit);
    const finalCount = !!props.finalCount;
    // Domain passes its catalog-styled base/continuous classes; kernel default
    // is neutral so this runtime file carries no domain literals.
    const base = props.baseClass || 'heys-training-countdown';
    const continuousClass = props.continuousClass || 'heys-training-continuous';
    return h('div', {
      className: cx(base, props.continuous && continuousClass, props.className),
      'data-phase': props.phaseKey || 'idle'
    },
      h('div', { className: base + '__counter' }, props.counter || ''),
      props.title ? h('h2', { className: base + '__grip' }, props.title) : null,
      props.image ? h('div', { className: base + '__hero' },
        h('img', {
          src: props.image,
          alt: props.imageAlt || props.title || 'Упражнение',
          loading: props.imageLoading || 'eager',
          decoding: 'async',
          // Домен может передать свой обработчик (напр. tier-fallback фото);
          // дефолт — схлопнуть контейнер при 404.
          onError: typeof props.imageErrorHandler === 'function'
            ? props.imageErrorHandler
            : function (e) {
                try { e.currentTarget.parentNode.style.display = 'none'; } catch (_) {}
              }
        })
      ) : null,
      chips.length ? h('div', { className: base + '__chips' },
        chips.map(function (chip, idx) {
          return h('div', {
            key: chip.id || idx,
            className: cx(base + '__chip', chip.className),
            'data-weight-sign': chip.weightSign || undefined
          },
            h('span', { className: base + '__chip-label' }, chip.label || ''),
            h('span', { className: base + '__chip-value' }, chip.value == null ? '—' : String(chip.value))
          );
        })
      ) : null,
      h('div', { className: base + '__phase-badge' }, props.phaseLabel || ''),
      h('div', { className: base + '__ring-wrap' },
        h('svg', {
          className: base + '__ring',
          width: 200,
          height: 200,
          viewBox: '0 0 200 200',
          'aria-hidden': 'true'
        },
          h('circle', { className: base + '__ring-track', cx: 100, cy: 100, r: ringRadius, fill: 'none' }),
          h('circle', {
            className: base + '__ring-fill',
            cx: 100,
            cy: 100,
            r: ringRadius,
            fill: 'none',
            strokeDasharray: ringCircum,
            strokeDashoffset: ringCircum * (1 - ratio),
            transform: 'rotate(-90 100 100)'
          })
        ),
        h('div', { className: base + '__digit' + (finalCount ? ' is-final-count' : '') }, digit)
      ),
      props.afterRing || null,
      (controls.length || props.beforeControls) ? h('div', { className: base + '__controls' },
        props.beforeControls || null,
        controls.map(function (control, idx) {
          return h('button', {
            key: control.id || idx,
            type: 'button',
            className: cx(base + '__btn', control.abort && base + '__btn--abort', control.className),
            disabled: !!control.disabled,
            onClick: control.onClick,
            'aria-label': control.ariaLabel || control.label,
            title: control.title
          }, control.label || control.id || 'Действие');
        })
      ) : null
    );
  }

  function RegistryGrid(props) {
    const prefix = props.classPrefix || 'training-focus';
    const items = Array.isArray(props.items) ? props.items : [];
    const selected = Array.isArray(props.selectedIds) ? props.selectedIds : [];
    return h('div', { className: prefixClass(prefix, '-registry__grid') },
      items.map(function (item) {
        const active = selected.indexOf(item.id) >= 0;
        return h('article', {
          key: item.id,
          className: prefixClass(prefix, '-registry-card') + (active ? ' is-selected' : '')
        },
          h('button', {
            type: 'button',
            className: prefixClass(prefix, '-registry-card__pick'),
            onClick: function () { props.onOpenItem ? props.onOpenItem(item.id, item) : props.onToggle && props.onToggle(item.id, item); },
            'aria-label': item.title || item.id
          },
            h('span', { className: prefixClass(prefix, '-registry-card__photo') },
              item.image ? h('img', {
                className: prefixClass(prefix, '-registry-card__img'),
                src: item.image,
                alt: item.imageAlt || item.title || item.id,
                loading: 'lazy',
                decoding: 'async',
                onError: function (e) {
                  e.currentTarget.remove();
                }
              }) : null,
              h('span', { className: prefixClass(prefix, '-registry-card__fallback'), 'aria-hidden': 'true' }, item.icon || '•')
            ),
            h('span', { className: prefixClass(prefix, '-registry-card__body') },
              h('span', { className: prefixClass(prefix, '-registry-card__name') }, item.title || item.id),
              item.meta ? h('span', { className: prefixClass(prefix, '-registry-card__meta') }, item.meta) : null,
              Array.isArray(item.chips) && item.chips.length
                ? h('span', { className: prefixClass(prefix, '-registry-card__chips') },
                    item.chips.map(function (chip, idx) {
                      return h('span', { key: idx, className: prefixClass(prefix, '-registry__pill') }, chip);
                    })
                  )
                : null,
              item.actionHint ? h('span', { className: prefixClass(prefix, '-registry-card__action') }, item.actionHint) : null
            )
          ),
          props.onToggle ? h('button', {
            type: 'button',
            className: prefixClass(prefix, '-registry-card__action-btn'),
            onClick: function () { props.onToggle && props.onToggle(item.id, item); }
          }, active ? (props.removeLabel || 'Убрать') : (props.addLabel || 'Добавить')) : null
        );
      })
    );
  }

  function itemSearchText(item) {
    const chips = Array.isArray(item && item.chips) ? item.chips.join(' ') : '';
    return [
      item && item.id,
      item && item.title,
      item && item.meta,
      chips
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function Shell(props) {
    const prefix = props.classPrefix || 'training-focus';
    return h('section', {
      className: cx(prefix, props.compact && prefixClass(prefix, '--compact')),
      role: props.role || 'dialog',
      'aria-label': props.ariaLabel || props.title || 'Тренировка'
    },
      h(Header, {
        classPrefix: prefix,
        title: props.title,
        actions: props.actions,
        premium: props.premium
      }),
      props.tabs ? h(Tabs, {
        classPrefix: prefix,
        items: props.tabs,
        value: props.activeTab,
        onChange: props.onTabChange,
        ariaLabel: props.tabsLabel
      }) : null,
      h('main', { className: prefixClass(prefix, '__body') }, props.children),
      props.footer ? h('footer', { className: prefixClass(prefix, '__footer') }, props.footer) : null
    );
  }

  function ViewContainer(props) {
    const prefix = props.classPrefix || 'training-focus';
    const view = props.view || 'view';
    return h('section', {
      className: cx(prefixClass(prefix, '-view'), prefixClass(prefix, '-view--' + view)),
      'data-training-view': view,
      'aria-label': props.ariaLabel || props.title || view
    },
      (props.title || props.subtitle || props.toolbar) ? h('div', { className: prefixClass(prefix, '-view__head') },
        h('div', { className: prefixClass(prefix, '-view__titlebox') },
          props.title ? h('h2', { className: prefixClass(prefix, '-view__title') }, props.title) : null,
          props.subtitle ? h('p', { className: prefixClass(prefix, '-view__sub') }, props.subtitle) : null
        ),
        props.toolbar ? h('div', { className: prefixClass(prefix, '-view__toolbar') }, props.toolbar) : null
      ) : null,
      h('div', { className: prefixClass(prefix, '-view__content') }, props.children)
    );
  }

  function EmptyState(props) {
    const prefix = props.classPrefix || 'training-focus';
    return h('div', { className: prefixClass(prefix, '-empty') },
      props.icon ? h('span', { className: prefixClass(prefix, '-empty__icon'), 'aria-hidden': 'true' }, props.icon) : null,
      h('div', { className: prefixClass(prefix, '-empty__body') },
        h('h3', { className: prefixClass(prefix, '-empty__title') }, props.title || 'Пока пусто'),
        props.text ? h('p', { className: prefixClass(prefix, '-empty__text') }, props.text) : null,
        props.action ? h('button', {
          type: 'button',
          className: prefixClass(prefix, '-empty__action'),
          onClick: props.action.onClick
        }, props.action.label) : null
      )
    );
  }

  function Registry(props) {
    const prefix = props.classPrefix || 'training-focus';
    const items = Array.isArray(props.items) ? props.items : [];
    const selected = Array.isArray(props.selectedIds) ? props.selectedIds : [];
    const title = props.title || 'Реестр упражнений';
    const subtitle = props.subtitle || (items.length + ' упражнений');
    const searchable = props.searchable !== false;
    const useState = React.useState;
    const queryState = useState ? useState('') : ['', function () {}];
    const query = String(queryState[0] || '').trim().toLowerCase();
    const setQuery = queryState[1];
    const visibleItems = query
      ? items.filter(function (item) { return itemSearchText(item).indexOf(query) >= 0; })
      : items;
    return h('div', {
      className: prefixClass(prefix, '-registry__backdrop'),
      role: 'presentation',
      onMouseDown: function (e) {
        if (e.target === e.currentTarget) props.onClose && props.onClose();
      }
    },
      h('section', {
        className: prefixClass(prefix, '-registry'),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title
      },
        h('div', { className: prefixClass(prefix, '-registry__header') },
          h('div', { className: prefixClass(prefix, '-registry__header-text') },
            h('h2', { className: prefixClass(prefix, '-registry__title') }, title),
            h('p', { className: prefixClass(prefix, '-registry__sub') }, subtitle)
          ),
          h('button', {
            type: 'button',
            className: prefixClass(prefix, '-registry__close'),
            onClick: props.onClose,
            'aria-label': props.closeLabel || 'Закрыть реестр упражнений'
          }, props.closeIcon || '×')
        ),
        searchable ? h('div', { className: prefixClass(prefix, '-registry__filters') },
          h('label', { className: prefixClass(prefix, '-registry__search') },
            h('span', { className: prefixClass(prefix, '-registry__search-icon'), 'aria-hidden': 'true' }, props.searchIcon || '🔍'),
            h('input', {
              type: 'search',
              className: prefixClass(prefix, '-registry__search-input'),
              placeholder: props.searchPlaceholder || 'Поиск по упражнениям',
              value: queryState[0],
              onChange: function (e) { setQuery(e && e.target ? e.target.value : ''); },
              'aria-label': props.searchLabel || 'Поиск по упражнениям'
            })
          )
        ) : null,
        visibleItems.length
          ? h(RegistryGrid, Object.assign({}, props, { items: visibleItems }))
          : h('div', { className: prefixClass(prefix, '-registry__empty') }, props.emptyText || 'Ничего не найдено'),
        h('div', { className: prefixClass(prefix, '-registry__footer') },
          props.footerAction ? h('button', {
            type: 'button',
            onClick: props.footerAction.onClick
          }, props.footerAction.label) : null,
          props.footerText ? h('span', { className: prefixClass(prefix, '-registry__footer-text') }, props.footerText) : null
        )
      )
    );
  }

  HEYS.TrainingFocus = {
    __registered: true,
    Shell: Shell,
    ViewContainer: ViewContainer,
    EmptyState: EmptyState,
    Header: Header,
    Tabs: Tabs,
    EquipmentBar: EquipmentBar,
    GoalSelector: GoalSelector,
    ReadinessCard: ReadinessCard,
    GuidedRunnerPanel: GuidedRunnerPanel,
    LiveRoadmap: LiveRoadmap,
    LiveRunnerShell: LiveRunnerShell,
    LiveCountdownDisplay: LiveCountdownDisplay,
    RegistryGrid: RegistryGrid,
    Registry: Registry
  };
})(typeof window !== 'undefined' ? window : globalThis);
