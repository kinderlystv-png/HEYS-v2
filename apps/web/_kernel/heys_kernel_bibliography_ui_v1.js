// heys_kernel_bibliography_ui_v1.js — ОБЩЕЕ ЯДРО: UI библиографии (SourceBadge + Modal).
//
// Single source визуального компонента «Источники и методология» для всех режимов.
// Data-driven: домен передаёт sources + лейблы тем/типов + classPrefix; разметка
// и поведение — здесь. Меняем UI здесь → меняется у всех режимов.
//
// Item-схема источника (rich): { id, author, year, title, type, url, keyFinding, topics:[] }
//   type: 'peer-reviewed' | 'practitioner' | 'guideline'
//
// Public API (HEYS.TrainingKernel.bibliographyUI):
//   SourceBadge(props)        — props: { source, classPrefix?, icon?, onClick?, eventName? }
//   BibliographyModal(props)  — props: { sources, onClose, focusSourceId?, classPrefix?,
//                                titleIcon?, title?, subtitleText?, topicLabels, typeLabels,
//                                typeOrder?, typeGroupLabels?, typeIcon? }

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.bibliographyUI && TK.bibliographyUI.__registered) return; // idempotent

  const React = global.React;
  if (!React) {
    TK.bibliographyUI = { __registered: false, __missingReact: true };
    return;
  }

  const DEFAULT_TYPE_ORDER = ['peer-reviewed', 'practitioner', 'guideline'];

  function defaultTypeIcon(t) {
    return t === 'peer-reviewed' ? '🔬'
      : t === 'practitioner' ? '🧗'
      : t === 'guideline' ? '📋' : '📚';
  }

  // ─── SourceBadge ───────────────────────────────────────────────────────────
  function SourceBadge(props) {
    const src = props && props.source;
    if (!src) return null;
    const prefix = (props && props.classPrefix) || 'fingers-source-badge';
    const icon = (props && props.icon) || '📖';
    const eventName = (props && props.eventName) || 'fingers-open-bibliography';
    const customClick = props && props.onClick;
    const handleClick = customClick
      ? function (e) {
          try { customClick(src, e); } catch (err) { console.warn('[bibliographyUI.SourceBadge] onClick failed', err); }
        }
      : function () {
          try {
            window.dispatchEvent(new CustomEvent(eventName, { detail: { sourceId: src.id } }));
          } catch (_) {}
        };
    return React.createElement('span', {
      className: prefix + ' ' + prefix + '--clickable',
      role: 'button',
      tabIndex: 0,
      title: src.author + ' ' + src.year + ' — ' + src.title,
      onClick: handleClick,
      onKeyDown: function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); }
      }
    },
      React.createElement('span', { className: prefix + '__icon', 'aria-hidden': 'true' }, icon),
      React.createElement('span', { className: prefix + '__author' }, src.author),
      React.createElement('span', { className: prefix + '__year' }, src.year)
    );
  }

  // ─── Карточка источника ─────────────────────────────────────────────────────
  function renderSourceCard(prefix, typeLabels, topicLabels, src, expanded, onToggle) {
    const typeMeta = typeLabels[src.type] || { label: src.type, color: '#64748b' };
    return React.createElement('article', {
      key: src.id,
      'data-bib-source': src.id,
      'data-bib-type': src.type,
      className: prefix + '-source' + (expanded ? ' is-expanded' : ''),
      style: { flexShrink: 0 }
    },
      React.createElement('button', {
        type: 'button',
        className: prefix + '-source__head',
        onClick: onToggle,
        'aria-expanded': expanded ? 'true' : 'false',
        style: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
          gap: 12, padding: '15px 16px', width: '100%', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer' }
      },
        React.createElement('div', { className: prefix + '-source__main', style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 } },
          React.createElement('h3', { className: prefix + '-source__title', style: { margin: 0, fontSize: 15, fontWeight: 650, lineHeight: 1.32, letterSpacing: '-0.01em', color: '#1c1b19' } }, src.title),
          React.createElement('div', { className: prefix + '-source__author', style: { fontSize: 12.5, fontWeight: 500, color: 'rgba(60,60,67,0.6)' } },
            React.createElement('strong', { style: { color: 'rgba(60,60,67,0.85)', fontWeight: 600 } }, src.author),
            ' · ',
            React.createElement('span', { className: prefix + '-source__year' }, String(src.year)))
        ),
        React.createElement('span', { className: prefix + '-source__chevron', 'aria-hidden': 'true', style: { flexShrink: 0, opacity: 0.4, fontSize: 11 } }, expanded ? '▲' : '▼')
      ),
      expanded ? React.createElement('div', { className: prefix + '-source__body' },
        React.createElement('div', { className: prefix + '-source__finding-label' }, 'Главное открытие'),
        React.createElement('p', { className: prefix + '-source__finding' }, src.keyFinding),
        Array.isArray(src.topics) && src.topics.length > 0 ? React.createElement('div', {
          className: prefix + '-source__topics'
        },
          src.topics.map(function (t) {
            return React.createElement('span', { key: t, className: prefix + '-source__topic' }, topicLabels[t] || t);
          })
        ) : null,
        src.url ? React.createElement('a', {
          href: src.url, target: '_blank', rel: 'noopener noreferrer',
          className: prefix + '-source__link'
        },
          React.createElement('span', { 'aria-hidden': 'true' }, '🔗'),
          ' ',
          'Открыть оригинал',
          React.createElement('span', { className: prefix + '-source__link-arrow', 'aria-hidden': 'true' }, '→')
        ) : null
      ) : null
    );
  }

  function renderGroupedSources(prefix, typeLabels, topicLabels, typeOrder, typeGroupLabels, typeIcon, sources, expandedId, onToggleId) {
    const byType = {};
    sources.forEach(function (s) { (byType[s.type] = byType[s.type] || []).push(s); });
    const order = (typeOrder || DEFAULT_TYPE_ORDER).slice();
    Object.keys(byType).forEach(function (t) { if (order.indexOf(t) < 0) order.push(t); });
    return order.map(function (type) {
      const list = byType[type];
      if (!list || !list.length) return null;
      const meta = typeLabels[type] || { label: type, color: '#64748b' };
      return React.createElement('section', { key: type, className: prefix + '-group', 'data-bib-type': type },
        React.createElement('div', { className: prefix + '-group__header' },
          React.createElement('span', { className: prefix + '-group__icon', 'aria-hidden': 'true' }, typeIcon(type)),
          React.createElement('span', { className: prefix + '-group__label', style: { color: meta.color } },
            (typeGroupLabels && typeGroupLabels[type]) || meta.label),
          React.createElement('span', { className: prefix + '-group__count' }, list.length)
        ),
        React.createElement('div', { className: prefix + '-group__items' },
          list.map(function (src) {
            return renderSourceCard(prefix, typeLabels, topicLabels, src, expandedId === src.id, function () {
              onToggleId(expandedId === src.id ? null : src.id);
            });
          })
        )
      );
    });
  }

  // ─── BibliographyModal ──────────────────────────────────────────────────────
  function BibliographyModal(props) {
    const onClose = (props && props.onClose) || function () {};
    const focusSourceId = props && props.focusSourceId;
    const sources = (props && props.sources) || [];
    const prefix = (props && props.classPrefix) || 'fingers-bib';
    const titleIcon = (props && props.titleIcon) || '📚';
    const title = (props && props.title) || 'Источники и методология';
    const topicLabels = (props && props.topicLabels) || {};
    const typeLabels = (props && props.typeLabels) || {};
    const typeOrder = props && props.typeOrder;
    const typeGroupLabels = props && props.typeGroupLabels;
    const typeIcon = (props && props.typeIcon) || defaultTypeIcon;
    const subtitleText = (props && props.subtitleText)
      || (sources.length + ' источников — научные статьи, практики, гайдлайны');

    const [query, setQuery] = React.useState('');
    const [activeTopic, setActiveTopic] = React.useState(null);
    const [expandedId, setExpandedId] = React.useState(focusSourceId || null);

    React.useEffect(function () {
      function onKey(e) { if (e.key === 'Escape') onClose(); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, [onClose]);

    React.useEffect(function () {
      if (focusSourceId) {
        const t = setTimeout(function () {
          const el = document.querySelector('[data-bib-source="' + focusSourceId + '"]');
          if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
        return function () { clearTimeout(t); };
      }
      return undefined;
    }, [focusSourceId]);

    const filtered = React.useMemo(function () {
      const q = String(query || '').trim().toLowerCase();
      return sources.filter(function (src) {
        if (activeTopic && (src.topics || []).indexOf(activeTopic) < 0) return false;
        if (!q) return true;
        const hay = (src.title + ' ' + src.keyFinding + ' ' + src.author).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }, [query, activeTopic]);

    const counts = React.useMemo(function () {
      const c = { all: sources.length };
      Object.keys(topicLabels).forEach(function (t) {
        c[t] = sources.filter(function (s) { return (s.topics || []).indexOf(t) >= 0; }).length;
      });
      return c;
    }, []);

    return React.createElement('div', {
      className: prefix + '-modal__backdrop',
      onClick: function (e) { if (e.target === e.currentTarget) onClose(); },
      role: 'presentation'
    },
      React.createElement('div', {
        className: prefix + '-modal',
        role: 'dialog',
        'aria-label': title,
        onClick: function (e) { e.stopPropagation(); }
      },
        React.createElement('div', { className: prefix + '-modal__header' },
          React.createElement('div', { className: prefix + '-modal__header-text' },
            React.createElement('h2', { className: prefix + '-modal__title' },
              React.createElement('span', { 'aria-hidden': 'true' }, titleIcon),
              ' ' + title),
            React.createElement('p', { className: prefix + '-modal__sub' }, subtitleText)
          ),
          React.createElement('button', {
            type: 'button',
            className: prefix + '-modal__close',
            'aria-label': 'Закрыть',
            onClick: onClose
          },
            React.createElement('svg', { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
              React.createElement('path', { d: 'M5 5l10 10M15 5L5 15', strokeLinecap: 'round' })
            )
          )
        ),

        React.createElement('div', { className: prefix + '-modal__filters' },
          React.createElement('div', { className: prefix + '-modal__search' },
            React.createElement('span', { className: prefix + '-modal__search-icon', 'aria-hidden': 'true' }, '🔍'),
            React.createElement('input', {
              type: 'search',
              className: prefix + '-modal__search-input',
              placeholder: 'Поиск по находке, названию или автору…',
              value: query,
              onChange: function (e) { setQuery(e.target.value); },
              'aria-label': 'Поиск по источникам'
            })
          ),
          React.createElement('div', { className: prefix + '-modal__chips', role: 'tablist' },
            React.createElement('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': activeTopic == null,
              className: prefix + '-modal__chip' + (activeTopic == null ? ' is-active' : ''),
              onClick: function () { setActiveTopic(null); }
            }, 'Все ', React.createElement('span', { className: prefix + '-modal__chip-count' }, counts.all)),
            Object.keys(topicLabels).map(function (topic) {
              const active = activeTopic === topic;
              return React.createElement('button', {
                key: topic,
                type: 'button',
                role: 'tab',
                'aria-selected': active,
                className: prefix + '-modal__chip' + (active ? ' is-active' : ''),
                onClick: function () { setActiveTopic(active ? null : topic); }
              }, topicLabels[topic], ' ',
                 React.createElement('span', { className: prefix + '-modal__chip-count' }, counts[topic]));
            })
          )
        ),

        React.createElement('div', { className: prefix + '-modal__list' },
          filtered.length === 0
            ? React.createElement('div', { className: prefix + '-modal__empty' },
                React.createElement('div', { className: prefix + '-modal__empty-icon' }, '🔎'),
                React.createElement('div', { className: prefix + '-modal__empty-title' }, 'Ничего не найдено'),
                React.createElement('div', { className: prefix + '-modal__empty-hint' }, 'Попробуй очистить поиск или сменить категорию.'))
            : renderGroupedSources(prefix, typeLabels, topicLabels, typeOrder, typeGroupLabels, typeIcon, filtered, expandedId, setExpandedId)
        )
      )
    );
  }

  TK.bibliographyUI = {
    __registered: true,
    SourceBadge: SourceBadge,
    BibliographyModal: BibliographyModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
