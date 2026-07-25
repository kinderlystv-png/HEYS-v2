(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const h = React.createElement;
    const { useDeferredValue, useEffect, useMemo, useRef, useState } = React;
    const READER_PREFERENCES_KEY = 'heys_reading_preferences_v1';
    const READING_PROGRESS_KEY = 'heys_reading_progress_v1';
    const READER_POSITION_PREFIX = 'heys_reading_position_v1:';
    const READING_QUERY_PARAM = 'reading';
    const PERSONALIZATION_KEY = 'heys_reading_personalization_v1';
    const READER_FONT_MIN = 14;
    const READER_FONT_MAX = 18;
    const READER_FONT_DEFAULT = 18;
    const MARKER_COLORS = Object.freeze([
        { id: 'yellow', label: 'Жёлтый' },
        { id: 'mint', label: 'Мятный' },
        { id: 'blue', label: 'Голубой' },
        { id: 'rose', label: 'Розовый' },
    ]);
    const MARKER_COLOR_IDS = new Set(MARKER_COLORS.map((color) => color.id));

    function readReaderPreferences() {
        try {
            const stored = JSON.parse(localStorage.getItem(READER_PREFERENCES_KEY) || '{}');
            return {
                fontSize: Math.min(READER_FONT_MAX, Math.max(READER_FONT_MIN, Number(stored.fontSize) || READER_FONT_DEFAULT)),
                theme: stored.theme === 'dark' ? 'dark' : 'light',
                markerEnabled: stored.markerEnabled !== false,
                markerColor: MARKER_COLOR_IDS.has(stored.markerColor) ? stored.markerColor : 'yellow',
            };
        } catch (_) {
            return { fontSize: READER_FONT_DEFAULT, theme: 'light', markerEnabled: true, markerColor: 'yellow' };
        }
    }

    function writeReaderPreferences(preferences) {
        try { localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(preferences)); } catch (_) { /* local preference is optional */ }
    }

    function getCurrentReadingClientId() {
        try {
            if (HEYS.currentClientId) return String(HEYS.currentClientId);
            if (HEYS.cloud && typeof HEYS.cloud.getClientId === 'function') return String(HEYS.cloud.getClientId() || '');
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') return String(HEYS.utils.lsGet('heys_client_current', '') || '');
            return String(localStorage.getItem('heys_client_current') || '').replace(/^"|"$/g, '');
        } catch (_) {
            return '';
        }
    }

    async function loadReadingPersonalization(clientId = getCurrentReadingClientId()) {
        const resolvedClientId = String(clientId || '');
        if (!resolvedClientId || !HEYS.YandexAPI || typeof HEYS.YandexAPI.getKV !== 'function') return null;
        try {
            const result = await HEYS.YandexAPI.getKV(resolvedClientId, PERSONALIZATION_KEY);
            const overlay = result?.data;
            if (!overlay || String(overlay.clientId || '') !== resolvedClientId) return null;
            const validation = HEYS.Reading.validatePersonalizationOverlay(overlay);
            if (!validation.valid) {
                console.warn('[HEYS.Reading] Персональный слой скрыт из-за ошибок контракта:', validation.errors);
                return null;
            }
            return overlay;
        } catch (error) {
            console.warn('[HEYS.Reading] Не удалось загрузить персональный слой:', error?.message || error);
            return null;
        }
    }

    function readReadingProgress() {
        try {
            const stored = JSON.parse(localStorage.getItem(READING_PROGRESS_KEY) || '{}');
            return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        } catch (_) {
            return {};
        }
    }

    function readReaderPosition(bookId) {
        const saved = readReadingProgress()[bookId];
        if (saved && Number.isFinite(Number(saved.position))) return Math.max(0, Number(saved.position));
        try { return Math.max(0, Number(sessionStorage.getItem(READER_POSITION_PREFIX + bookId)) || 0); } catch (_) { return 0; }
    }

    function writeReaderPosition(bookId, value, percent) {
        const entry = {
            position: Math.max(0, Math.round(value || 0)),
            percent: Math.min(100, Math.max(0, Math.round(percent || 0))),
            updatedAt: Date.now(),
        };
        try {
            const progress = readReadingProgress();
            progress[bookId] = entry;
            localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
            sessionStorage.removeItem(READER_POSITION_PREFIX + bookId);
        } catch (_) { /* local progress is optional */ }
        return entry;
    }

    function getReadingBookIdFromUrl() {
        try { return new URL(window.location.href).searchParams.get(READING_QUERY_PARAM); } catch (_) { return null; }
    }

    function getReadingUrl(bookId) {
        const url = new URL(window.location.href);
        if (bookId) url.searchParams.set(READING_QUERY_PARAM, bookId);
        else url.searchParams.delete(READING_QUERY_PARAM);
        url.hash = '';
        return url.pathname + url.search;
    }

    function ReadingIcon() {
        return h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            h('path', { d: 'M4.5 5.5A2.5 2.5 0 0 1 7 3h4a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H7a2.5 2.5 0 0 0-2.5 2.5z' }),
            h('path', { d: 'M19.5 5.5A2.5 2.5 0 0 0 17 3h-4v17a2 2 0 0 1 2-2h2a2.5 2.5 0 0 1 2.5 2.5z' }),
        );
    }

    function CloseIcon() {
        return h('svg', { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': 'true' },
            h('path', { d: 'm6 6 12 12M18 6 6 18' }),
        );
    }

    function SearchIcon() {
        return h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', 'aria-hidden': 'true' },
            h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'm16 16 4 4' }),
        );
    }

    function MarkerIcon() {
        return h('svg', { viewBox: '0 0 24 24', width: 19, height: 19, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            h('path', { d: 'm14.5 4.5 5 5-8.8 8.8-5.9 1 1-5.9z' }),
            h('path', { d: 'm12.8 6.2 5 5M4 21h9' }),
        );
    }

    function getSectionId(book, block) {
        return 'reading-section-' + book.id + '-' + block.id;
    }

    function getSourceId(book, number) {
        return 'reading-source-' + book.id + '-' + number;
    }

    function renderSourceRefs(block, book, onNavigate) {
        const references = (block.sourceIds || []).map((sourceId) => {
            const index = book.sources.findIndex((source) => source.id === sourceId);
            return index >= 0 ? { source: book.sources[index], number: index + 1 } : null;
        }).filter(Boolean);
        if (!references.length) return null;
        return h('sup', { className: 'reading-source-refs', 'aria-label': 'Источники' }, references.map(({ source, number }) => h('a', {
            key: source.id,
            href: '#' + getSourceId(book, number),
            onClick: (event) => onNavigate(event, getSourceId(book, number)),
            'aria-label': 'Источник ' + number + ': ' + source.label,
            title: source.label,
        }, '[' + number + ']')));
    }

    function getSafeHighlightRanges(text, fragments) {
        const ranges = [];
        (Array.isArray(fragments) ? fragments : []).forEach((fragment) => {
            const value = String(fragment || '');
            const start = value && text.indexOf(value);
            if (!value || start < 0 || text.indexOf(value, start + value.length) >= 0) return;
            const end = start + value.length;
            if (ranges.some((range) => start < range.end && end > range.start)) return;
            ranges.push({ start, end, value });
        });
        return ranges.sort((left, right) => left.start - right.start);
    }

    function renderHighlightedText(text, fragments, enabled, keyPrefix) {
        const value = String(text || '');
        if (!enabled) return value;
        const ranges = getSafeHighlightRanges(value, fragments);
        if (!ranges.length) return value;
        const nodes = [];
        let offset = 0;
        ranges.forEach((range, index) => {
            if (range.start > offset) nodes.push(value.slice(offset, range.start));
            nodes.push(h('mark', { key: keyPrefix + '-mark-' + index, className: 'reading-text-mark' }, range.value));
            offset = range.end;
        });
        if (offset < value.length) nodes.push(value.slice(offset));
        return nodes;
    }

    function getDisplayVoice(block) {
        if (block?.voice === 'review' || ['applicability', 'verdict', 'example'].includes(block?.type) || block?.origin === 'reviewer') return 'review';
        if (block?.voice === 'retelling' || block?.type === 'lead') return 'retelling';
        return 'context';
    }

    function buildKeySections(book) {
        const sections = [];
        let section = { id: 'opening', title: 'Суть книги', entries: [] };
        sections.push(section);
        book.blocks.forEach((block) => {
            if (block.type === 'heading') {
                section = { id: block.id, title: block.text, entries: [] };
                sections.push(section);
                return;
            }
            (HEYS.Reading.getHighlightTargets(block) || []).forEach((target) => {
                const fragments = block?.highlights?.[target];
                if (!Array.isArray(fragments) || !fragments.length) return;
                section.entries.push({
                    id: block.id + '-' + target,
                    fragments,
                    voice: getDisplayVoice(block),
                    sourceIds: block.sourceIds,
                });
            });
        });
        return sections.filter((item) => item.entries.length);
    }

    function renderBlock(block, book, onNavigate, markerEnabled) {
        const key = block.id;
        const sourceRefs = renderSourceRefs(block, book, onNavigate);
        const marked = (target, text) => renderHighlightedText(text, block?.highlights?.[target], markerEnabled, block.id + '-' + target);
        if (block.type === 'heading') return h('h2', { key, id: getSectionId(book, block) }, block.text);
        if (block.type === 'lead') return h('p', { key, className: 'reading-block reading-block--lead' }, marked('text', block.text), sourceRefs);
        if (block.type === 'quick-summary') return h('section', {
            key,
            id: getSectionId(book, block),
            className: 'reading-block reading-block--quick-summary',
            'aria-labelledby': getSectionId(book, block) + '-title',
        },
        h('p', { className: 'reading-block__eyebrow' }, 'Краткая выжимка · пересказ'),
        h('h2', { id: getSectionId(book, block) + '-title' }, block.title),
        h('ol', null, block.items.map((item, index) => h('li', { key: block.id + '-' + index }, h('span', null, item)))),
        sourceRefs,
        );
        if (block.type === 'applicability') {
            const fields = [
                ['strength', 'Что полезно'],
                ['worksWhen', 'Когда работает'],
                ['limitations', 'Где граница'],
                ['experiment', 'Как проверить'],
            ];
            return h('section', {
                key,
                id: getSectionId(book, block),
                className: 'reading-block reading-block--applicability',
                'aria-labelledby': getSectionId(book, block) + '-title',
            },
            h('p', { className: 'reading-block__eyebrow' }, 'Второе мнение · HEYS'),
            h('h2', { id: getSectionId(book, block) + '-title' }, block.title),
            h('div', { className: 'reading-applicability__grid' }, fields.map(([field, label]) => h('section', {
                key: field,
                className: 'reading-applicability__item reading-applicability__item--' + field,
            }, h('h3', null, label), h('p', null, marked(field, block[field]))))),
            sourceRefs,
            );
        }
        if (block.type === 'quote') return h('blockquote', { key, className: 'reading-block reading-block--quote' },
            h('p', null, '«' + block.text + '»'),
            h('footer', null, block.attribution && '— ' + block.attribution, sourceRefs),
        );
        if (block.type === 'example') return h('aside', { key, className: 'reading-block reading-block--example' },
            h('strong', null, block.title || 'Авторский пример'), h('p', null, marked('text', block.text), sourceRefs),
        );
        if (block.type === 'details') return h('details', { key, className: 'reading-block reading-block--details' },
            h('summary', null,
                h('span', { className: 'reading-block--details__title' }, block.title),
                h('span', { className: 'reading-block--details__summary' }, block.summary, sourceRefs),
            ),
            h('div', { className: 'reading-block--details__body' }, h('p', null, marked('text', block.text))),
        );
        if (block.type === 'callout') return h('aside', { key, className: 'reading-block reading-block--callout reading-block--' + block.tone },
            block.title && h('strong', null, block.title), h('p', null, marked('text', block.text), sourceRefs),
        );
        if (block.type === 'list') {
            const Tag = block.ordered ? 'ol' : 'ul';
            return h(Tag, { key, className: 'reading-block reading-block--list' },
                block.items.map((item) => h('li', { key: item }, item)),
                sourceRefs && h('li', { className: 'reading-block__source-row' }, sourceRefs),
            );
        }
        if (block.type === 'verdict') return h('aside', { key, className: 'reading-block reading-block--verdict' },
            block.title && h('strong', null, block.title), h('p', null, marked('text', block.text), sourceRefs),
        );
        return h('p', { key, className: 'reading-block' }, marked('text', block.text), sourceRefs);
    }

    function renderPersonalizedOverlay(overlay, book) {
        const entry = HEYS.Reading.getPersonalizedBookOverlay(overlay, book.id);
        if (!entry) return null;
        const titleId = 'reading-personalization-' + book.id;
        return h('section', {
            className: 'reading-personalization',
            'aria-labelledby': titleId,
        },
        h('p', { className: 'reading-block__eyebrow' }, 'Личный слой · только этот аккаунт'),
        h('h2', { id: titleId }, overlay.label || 'Для ваших проектов'),
        h('p', { className: 'reading-personalization__summary' }, entry.summary),
        h('div', { className: 'reading-personalization__projects' }, entry.projects.map((project) => h('details', {
            key: project.id,
            className: 'reading-personalization__project',
        },
        h('summary', null,
            h('span', { className: 'reading-personalization__project-title' }, project.title),
            h('span', { className: 'reading-personalization__project-relevance' }, project.relevance),
        ),
        h('div', { className: 'reading-personalization__project-body' },
            h('h3', null, 'Вопросы для размышления'),
            h('ul', null, project.questions.map((question) => h('li', { key: question }, question))),
            h('p', { className: 'reading-personalization__caution' }, h('strong', null, 'Граница: '), project.caution),
        ),
        ))),
        );
    }

    function renderBookRecap(book) {
        const quickSummary = book.blocks.find((block) => block.type === 'quick-summary');
        if (!quickSummary?.items?.length) return null;
        const thesisCount = quickSummary.items.length;
        return h('details', { className: 'reading-reader-recap' },
            h('summary', null,
                h('span', { className: 'reading-reader-recap__title' }, 'Книга в ' + thesisCount + ' тезисах'),
                h('span', { className: 'reading-reader-recap__hint' }, 'Повторить главное после полного разбора'),
            ),
            h('ol', null, quickSummary.items.map((item, index) => h('li', { key: quickSummary.id + '-recap-' + index }, item))),
        );
    }

    function renderEditorialRole(book) {
        const role = HEYS.Reading.getEditorialRole(book?.editorialRole);
        if (!role) return null;
        return h('aside', { className: 'reading-editorial-role', 'aria-label': 'Редакционная пометка' },
            h('strong', null, role.label),
            h('span', null, role.description),
        );
    }

    function renderKeySections(book, sections, onNavigate, markerEnabled) {
        return sections.map((section) => h('section', { key: section.id, className: 'reading-key-section' },
            h('h2', null, section.title),
            section.entries.map((entry) => h('div', {
                key: entry.id,
                className: 'reading-key-entry reading-key-entry--' + entry.voice,
            },
            h('span', { className: 'reading-key-entry__voice' }, entry.voice === 'review' ? 'HEYS' : entry.voice === 'retelling' ? 'Пересказ' : 'Контекст'),
            h('p', null, entry.fragments.map((fragment, index) => h(React.Fragment, { key: entry.id + '-' + index },
                index > 0 && ' … ',
                markerEnabled ? h('mark', { className: 'reading-text-mark' }, fragment) : fragment,
            )), renderSourceRefs(entry, book, onNavigate)),
            )),
        ));
    }

    function BookReader({ book, personalization, onRequestClose, onProgressChange, returnFocusRef, scrollPositionsRef }) {
        const rootRef = useRef(null);
        const closeRef = useRef(null);
        const colorButtonRef = useRef(null);
        const initialProgress = Number(readReadingProgress()[book.id]?.percent) || 0;
        const initialPosition = readReaderPosition(book.id);
        const [progress, setProgress] = useState(initialProgress);
        const [preferences, setPreferences] = useState(readReaderPreferences);
        const [viewMode, setViewMode] = useState('full');
        const [paletteOpen, setPaletteOpen] = useState(false);
        const latestProgressRef = useRef(initialProgress);
        const latestPositionRef = useRef(initialPosition);
        const fullProgressRef = useRef(initialProgress);
        const fullPositionRef = useRef(initialPosition);
        const viewModeRef = useRef('full');
        const initialRestorePendingRef = useRef(true);
        const viewModeEffectReadyRef = useRef(false);
        const progressSaveTimerRef = useRef(0);
        const progressChangeRef = useRef(onProgressChange);
        progressChangeRef.current = onProgressChange;
        viewModeRef.current = viewMode;

        const updateProgress = (root) => {
            const max = root.scrollHeight - root.clientHeight;
            const next = max > 0 ? Math.min(100, Math.round((root.scrollTop / max) * 100)) : 100;
            latestProgressRef.current = next;
            fullProgressRef.current = next;
            setProgress(next);
        };

        const navigateWithinReader = (event, targetId) => {
            event.preventDefault();
            document.getElementById(targetId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        };

        useEffect(() => {
            const root = rootRef.current;
            if (!root || typeof document === 'undefined') return undefined;
            const body = document.body;
            const siblings = Array.from(body.children).filter((node) => node !== root);
            const previous = siblings.map((node) => ({ node, inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') }));
            previous.forEach(({ node }) => {
                node.inert = true;
                node.setAttribute('aria-hidden', 'true');
            });
            body.classList.add('reading-reader-open');
            const savedScrollPosition = scrollPositionsRef?.current?.get(book.id) ?? readReaderPosition(book.id);
            let restored = false;
            let layoutFrame = 0;
            const restoreFrame = window.requestAnimationFrame(() => {
                layoutFrame = window.requestAnimationFrame(() => {
                    if (!initialRestorePendingRef.current) return;
                    root.scrollTop = savedScrollPosition;
                    fullPositionRef.current = savedScrollPosition;
                    latestPositionRef.current = savedScrollPosition;
                    updateProgress(root);
                    initialRestorePendingRef.current = false;
                    restored = true;
                });
            });
            closeRef.current?.focus();

            return () => {
                window.cancelAnimationFrame(restoreFrame);
                window.cancelAnimationFrame(layoutFrame);
                window.clearTimeout(progressSaveTimerRef.current);
                const fullViewActive = viewModeRef.current === 'full';
                const finalPosition = fullViewActive && (restored || root.scrollTop > 0) ? root.scrollTop : fullPositionRef.current;
                scrollPositionsRef?.current?.set(book.id, finalPosition);
                const saved = writeReaderPosition(book.id, finalPosition, fullProgressRef.current);
                window.setTimeout(() => progressChangeRef.current?.(book.id, saved), 0);
                previous.forEach(({ node, inert, ariaHidden }) => {
                    node.inert = inert;
                    if (ariaHidden == null) node.removeAttribute('aria-hidden');
                    else node.setAttribute('aria-hidden', ariaHidden);
                });
                body.classList.remove('reading-reader-open');
                window.requestAnimationFrame(() => returnFocusRef?.current?.focus?.());
            };
        }, [book.id, returnFocusRef, scrollPositionsRef]);

        useEffect(() => { writeReaderPreferences(preferences); }, [preferences]);

        useEffect(() => {
            if (!viewModeEffectReadyRef.current) {
                viewModeEffectReadyRef.current = true;
                return undefined;
            }
            const root = rootRef.current;
            if (!root) return undefined;
            const frame = window.requestAnimationFrame(() => {
                root.scrollTop = viewMode === 'full' ? fullPositionRef.current : 0;
                if (viewMode === 'full') updateProgress(root);
            });
            return () => window.cancelAnimationFrame(frame);
        }, [viewMode]);

        useEffect(() => {
            const handleKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    if (paletteOpen) {
                        setPaletteOpen(false);
                        window.requestAnimationFrame(() => colorButtonRef.current?.focus());
                        return;
                    }
                    onRequestClose();
                    return;
                }
                if (event.key !== 'Tab' || !rootRef.current) return;
                const focusable = Array.from(rootRef.current.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            };
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }, [onRequestClose, paletteOpen]);

        const handleScroll = (event) => {
            const root = event.currentTarget;
            if (viewModeRef.current !== 'full') return;
            initialRestorePendingRef.current = false;
            updateProgress(root);
            latestPositionRef.current = root.scrollTop;
            fullPositionRef.current = root.scrollTop;
            if (!progressSaveTimerRef.current) {
                progressSaveTimerRef.current = window.setTimeout(() => {
                    progressSaveTimerRef.current = 0;
                    writeReaderPosition(book.id, latestPositionRef.current, latestProgressRef.current);
                }, 500);
            }
        };

        const headings = book.blocks.filter((block) => block.type === 'heading');
        const quickLayerBlocks = book.blocks.slice(0, 4);
        const fullSummaryBlocks = book.blocks.slice(4);
        const keySections = buildKeySections(book);
        const highlightStats = HEYS.Reading.getBookHighlightStats(book);
        const activeMarkerColor = MARKER_COLORS.find((color) => color.id === preferences.markerColor) || MARKER_COLORS[0];
        const toggleViewMode = () => {
            if (viewModeRef.current === 'full' && rootRef.current) {
                fullPositionRef.current = rootRef.current.scrollTop;
                latestPositionRef.current = rootRef.current.scrollTop;
                fullProgressRef.current = latestProgressRef.current;
            }
            setPaletteOpen(false);
            setViewMode((current) => current === 'full' ? 'key' : 'full');
        };
        const renderSources = () => h('section', { className: 'reading-sources', 'aria-labelledby': 'reading-sources-title' },
            h('h2', { id: 'reading-sources-title' }, 'Источники и ссылки'),
            h('ol', null, book.sources.map((source, index) => h('li', { key: source.url, id: getSourceId(book, index + 1) },
                h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.label),
            ))),
        );

        const reader = h('div', {
            ref: rootRef,
            className: 'reading-reader reading-reader--' + preferences.theme + ' reading-reader--marker-' + preferences.markerColor + (viewMode === 'key' ? ' reading-reader--key-view' : ''),
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'reading-reader-title',
            onScroll: handleScroll,
            style: { '--reading-reader-font-size': preferences.fontSize + 'px' },
        },
            h('header', { className: 'reading-reader__header' },
                h('button', { ref: closeRef, type: 'button', className: 'reading-reader__close', onClick: onRequestClose, 'aria-label': 'Закрыть саммари' }, h(CloseIcon)),
                h('span', { className: 'reading-reader__header-title' }, book.title),
                h('span', { className: 'reading-reader__progress-label', 'aria-hidden': 'true' }, viewMode === 'key' ? 'Главное' : progress + '%'),
                h('div', { className: 'reading-reader__progress', 'aria-hidden': 'true' }, h('span', { style: { width: progress + '%' } })),
            ),
            viewMode === 'full'
                ? h('article', { className: 'reading-reader__article' },
                    h('div', { className: 'reading-reader__eyebrow' }, book.author + ' · ' + book.year + ' · ' + HEYS.Reading.estimateReadingMinutes(book) + ' мин'),
                    h('h1', { id: 'reading-reader-title' }, book.title),
                    h('p', { className: 'reading-reader__practical' }, book.practicalValue),
                    renderEditorialRole(book),
                    quickLayerBlocks.map((block) => renderBlock(block, book, navigateWithinReader, preferences.markerEnabled)),
                    renderPersonalizedOverlay(personalization, book),
                    h('p', { className: 'reading-reader__depth-label' }, 'Полный разбор'),
                    h('details', { className: 'reading-toc' },
                        h('summary', null, h('span', null, 'Содержание'), h('span', null, headings.length + ' разделов')),
                        h('nav', { 'aria-label': 'Содержание книги' }, headings.map((heading, index) => h('a', {
                            key: heading.id,
                            href: '#' + getSectionId(book, heading),
                            onClick: (event) => navigateWithinReader(event, getSectionId(book, heading)),
                        }, h('span', null, index + 1), heading.text))),
                    ),
                    fullSummaryBlocks.map((block) => renderBlock(block, book, navigateWithinReader, preferences.markerEnabled)),
                    renderBookRecap(book),
                    renderSources(),
                )
                : h('article', { className: 'reading-reader__article reading-reader__article--key' },
                    h('div', { className: 'reading-reader__eyebrow' }, book.author + ' · Главное · ' + highlightStats.readingMinutes + ' мин'),
                    h('h1', { id: 'reading-reader-title' }, book.title),
                    renderEditorialRole(book),
                    h('p', { className: 'reading-key-intro' }, 'Тезисы и ограничения без примеров и доказательств. Для контекста вернитесь к полному разбору.'),
                    renderKeySections(book, keySections, navigateWithinReader, preferences.markerEnabled),
                    renderSources(),
                ),
            h('div', { className: 'reading-reader__toolbar', role: 'group', 'aria-label': 'Настройки чтения' },
                h('label', { className: 'reading-reader__font-control' },
                    h('span', { className: 'reading-reader__font-small', 'aria-hidden': 'true' }, 'А'),
                    h('input', {
                        type: 'range', min: READER_FONT_MIN, max: READER_FONT_MAX, step: 1,
                        value: preferences.fontSize,
                        onChange: (event) => setPreferences((current) => ({ ...current, fontSize: Number(event.target.value) })),
                        'aria-label': 'Размер текста',
                        'aria-valuetext': preferences.fontSize + ' пикселей',
                    }),
                    h('span', { className: 'reading-reader__font-large', 'aria-hidden': 'true' }, 'А'),
                ),
                h('span', { className: 'reading-reader__font-value', 'aria-hidden': 'true' }, preferences.fontSize),
                h('button', {
                    type: 'button',
                    className: 'reading-reader__tool-button reading-reader__marker-toggle',
                    onClick: () => setPreferences((current) => ({ ...current, markerEnabled: !current.markerEnabled })),
                    'aria-label': preferences.markerEnabled ? 'Выключить маркер' : 'Включить маркер',
                    'aria-pressed': preferences.markerEnabled,
                }, h(MarkerIcon), h('span', null, 'Маркер')),
                h('button', {
                    ref: colorButtonRef,
                    type: 'button',
                    className: 'reading-reader__color-toggle',
                    onClick: () => setPaletteOpen((current) => !current),
                    'aria-label': 'Цвет маркера: ' + activeMarkerColor.label,
                    'aria-expanded': paletteOpen,
                    'aria-controls': 'reading-marker-palette',
                }, h('span', { className: 'reading-reader__color-swatch', 'aria-hidden': 'true' })),
                paletteOpen && h('div', {
                    id: 'reading-marker-palette',
                    className: 'reading-reader__palette',
                    role: 'radiogroup',
                    'aria-label': 'Цвет маркера',
                }, MARKER_COLORS.map((color) => h('button', {
                    key: color.id,
                    type: 'button',
                    className: 'reading-reader__palette-option reading-reader__palette-option--' + color.id,
                    role: 'radio',
                    'aria-checked': preferences.markerColor === color.id,
                    'aria-label': color.label,
                    onClick: () => {
                        setPreferences((current) => ({ ...current, markerColor: color.id }));
                        setPaletteOpen(false);
                        window.requestAnimationFrame(() => colorButtonRef.current?.focus());
                    },
                }, h('span', { 'aria-hidden': 'true' }), preferences.markerColor === color.id && h('b', { 'aria-hidden': 'true' }, '✓')))),
                h('button', {
                    type: 'button',
                    className: 'reading-reader__tool-button reading-reader__key-toggle',
                    onClick: toggleViewMode,
                    'aria-label': viewMode === 'key' ? 'Вернуться к полному тексту' : 'Показать только главное',
                    'aria-pressed': viewMode === 'key',
                }, h('span', { 'aria-hidden': 'true', className: 'reading-reader__key-icon' }, '≡'), h('span', null, viewMode === 'key' ? 'Полный' : 'Главное')),
                h('button', {
                    type: 'button',
                    className: 'reading-reader__tool-button reading-reader__theme-toggle',
                    onClick: () => setPreferences((current) => ({ ...current, theme: current.theme === 'dark' ? 'light' : 'dark' })),
                    'aria-label': 'Тёмная тема ридера',
                    'aria-pressed': preferences.theme === 'dark',
                }, h('span', { 'aria-hidden': 'true' }, preferences.theme === 'dark' ? '☀' : '☾'), h('span', null, preferences.theme === 'dark' ? 'Светлая' : 'Тёмная')),
            ),
        );

        return ReactDOM?.createPortal ? ReactDOM.createPortal(reader, document.body) : reader;
    }

    function BookCard({ book, query, progressEntry, selectedTags, onOpen, onToggleTag, buttonRef }) {
        const minutes = HEYS.Reading.estimateReadingMinutes(book);
        const editorialRole = HEYS.Reading.getEditorialRole(book.editorialRole);
        const percent = Math.min(100, Math.max(0, Number(progressEntry?.percent) || 0));
        const isStarted = percent > 0 && percent < 95;
        const isComplete = percent >= 95;
        const excerpt = query ? HEYS.Reading.getBookSearchExcerpt(book, query) : '';
        return h('article', { className: 'reading-card' },
            h('button', {
                ref: buttonRef,
                type: 'button',
                className: 'reading-card__open',
                onClick: onOpen,
                'aria-label': (isStarted ? 'Продолжить' : 'Открыть') + ' «' + book.title + '», ' + book.author + (editorialRole ? '. ' + editorialRole.label + ': ' + editorialRole.description : ''),
            },
                h('span', { className: 'reading-cover reading-cover--' + book.coverTone + (editorialRole ? ' reading-cover--has-role' : ''), 'aria-hidden': 'true' },
                    editorialRole && h('span', { className: 'reading-cover__editorial-role' }, editorialRole.label),
                    h('span', { className: 'reading-cover__author' }, book.author),
                    h('span', { className: 'reading-cover__title' }, book.title),
                    h('span', { className: 'reading-cover__mark' }, 'HEYS'),
                ),
                h('span', { className: 'reading-card__content' },
                    h('span', { className: 'reading-card__meta' }, book.author + ' · ' + minutes + ' мин', isStarted && ' · прочитано ' + percent + '%', isComplete && ' · прочитано'),
                    h('span', { className: 'reading-card__title' }, book.title),
                    h('span', { className: query ? 'reading-card__excerpt' : 'reading-card__verdict' }, excerpt || book.verdict),
                    percent > 0 && h('span', { className: 'reading-card__progress', 'aria-hidden': 'true' }, h('span', { style: { width: percent + '%' } })),
                ),
            ),
            h('div', { className: 'reading-card__tags', 'aria-label': 'Теги книги' }, book.tags.slice(0, 3).map((tag) => h('button', {
                key: tag,
                type: 'button',
                className: 'reading-tag' + (selectedTags.includes(tag) ? ' active' : ''),
                onClick: () => onToggleTag(tag),
                'aria-pressed': selectedTags.includes(tag),
            }, HEYS.Reading.getTagLabel(tag)))),
        );
    }

    function ReadingScreen({ personalization: personalizationOverride } = {}) {
        const books = useMemo(() => HEYS.Reading?.getPublishedBooks?.() || [], []);
        const [query, setQuery] = useState('');
        const deferredQuery = useDeferredValue ? useDeferredValue(query) : query;
        const [topic, setTopic] = useState('all');
        const [selectedTags, setSelectedTags] = useState([]);
        const [tagsExpanded, setTagsExpanded] = useState(false);
        const [activeBook, setActiveBook] = useState(() => HEYS.Reading.getBookById(getReadingBookIdFromUrl(), books));
        const [readingProgress, setReadingProgress] = useState(readReadingProgress);
        const [personalization, setPersonalization] = useState(() => personalizationOverride || null);
        const cardRefs = useRef(new Map());
        const scrollPositionsRef = useRef(new Map());
        const returnFocusRef = useRef(null);

        const topics = useMemo(() => ['all', ...Array.from(new Set(books.flatMap((book) => book.topics)))], [books]);
        const availableTags = useMemo(() => Array.from(new Set(books.flatMap((book) => book.tags))), [books]);
        const filteredBooks = useMemo(() => HEYS.Reading.sortBooks(
            HEYS.Reading.filterBooks(books, { query: deferredQuery, topic, tags: selectedTags }),
            'recommended',
        ), [books, deferredQuery, topic, selectedTags]);
        const continueBook = useMemo(() => books.map((book) => ({ book, entry: readingProgress[book.id] }))
            .filter(({ entry }) => entry && entry.percent > 0 && entry.percent < 95)
            .sort((left, right) => right.entry.updatedAt - left.entry.updatedAt)[0] || null, [books, readingProgress]);
        const hasFilters = Boolean(query || topic !== 'all' || selectedTags.length);
        const resetFilters = () => { setQuery(''); setTopic('all'); setSelectedTags([]); };
        const toggleTag = (tag) => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : current.concat(tag));
        const openBook = (book) => {
            returnFocusRef.current = cardRefs.current.get(book.id) || document.activeElement;
            history.pushState({ ...(history.state || {}), heysReadingBook: book.id, heysReadingOwned: true }, '', getReadingUrl(book.id));
            setActiveBook(book);
        };
        const closeBook = () => {
            if (history.state?.heysReadingOwned && getReadingBookIdFromUrl() === activeBook?.id) {
                setActiveBook(null);
                history.back();
                return;
            }
            const state = { ...(history.state || {}) };
            delete state.heysReadingBook;
            delete state.heysReadingOwned;
            history.replaceState(state, '', getReadingUrl(null));
            setActiveBook(null);
        };

        useEffect(() => {
            const syncBookFromUrl = () => setActiveBook(HEYS.Reading.getBookById(getReadingBookIdFromUrl(), books));
            window.addEventListener('popstate', syncBookFromUrl);
            return () => window.removeEventListener('popstate', syncBookFromUrl);
        }, [books]);

        useEffect(() => {
            if (personalizationOverride !== undefined) {
                setPersonalization(personalizationOverride || null);
                return undefined;
            }
            let active = true;
            loadReadingPersonalization().then((overlay) => {
                if (active) setPersonalization(overlay);
            });
            return () => { active = false; };
        }, [personalizationOverride]);

        return h('section', { className: 'planning-reading-screen', 'aria-labelledby': 'reading-library-title' },
            h('header', { className: 'planning-reading-screen__header' },
                h('p', { className: 'planning-reading-screen__eyebrow' }, 'HEYS · Книги'),
                h('h1', { id: 'reading-library-title' }, 'Библиотека'),
                h('p', null, 'Разборы книг о мышлении, работе и привычках'),
            ),
            continueBook && h('button', { type: 'button', className: 'reading-continue', onClick: () => openBook(continueBook.book) },
                h('span', { className: 'reading-continue__eyebrow' }, 'Продолжить чтение · ' + continueBook.entry.percent + '%'),
                h('strong', null, continueBook.book.title),
                h('span', null, continueBook.book.author),
                h('span', { className: 'reading-continue__progress', 'aria-hidden': 'true' }, h('span', { style: { width: continueBook.entry.percent + '%' } })),
            ),
            h('div', { className: 'reading-search' },
                h('label', { htmlFor: 'reading-library-search' }, 'Поиск по библиотеке'),
                h('div', { className: 'reading-search__field' }, h(SearchIcon), h('input', {
                    id: 'reading-library-search', type: 'search', value: query,
                    placeholder: 'Название, автор, идея или тег',
                    onChange: (event) => setQuery(event.target.value),
                })),
            ),
            h('div', { className: 'reading-library-controls' },
                h('div', { className: 'reading-topics', 'aria-label': 'Темы книг' }, topics.map((item) => h('button', {
                    key: item, type: 'button', className: 'reading-topic' + (topic === item ? ' active' : ''),
                    onClick: () => setTopic(item), 'aria-pressed': topic === item,
                }, item === 'all' ? 'Все' : HEYS.Reading.getTopicLabel(item)))),
            ),
            availableTags.length > 0 && h('div', { className: 'reading-tag-filter' },
                h('button', {
                    type: 'button',
                    className: 'reading-tag-filter__toggle',
                    onClick: () => setTagsExpanded((current) => !current),
                    'aria-expanded': tagsExpanded,
                    'aria-controls': 'reading-tag-filter-options',
                }, tagsExpanded ? 'Скрыть теги' : 'Все теги', selectedTags.length > 0 && h('span', null, selectedTags.length)),
                tagsExpanded && h('div', { id: 'reading-tag-filter-options', className: 'reading-tag-filter__options', 'aria-label': 'Фильтр по тегам' }, availableTags.map((tag) => h('button', {
                    key: tag,
                    type: 'button',
                    className: 'reading-tag' + (selectedTags.includes(tag) ? ' active' : ''),
                    onClick: () => toggleTag(tag),
                    'aria-pressed': selectedTags.includes(tag),
                    'aria-label': 'Фильтр по тегу ' + HEYS.Reading.getTagLabel(tag),
                }, HEYS.Reading.getTagLabel(tag)))),
            ),
            selectedTags.length > 0 && h('div', { className: 'reading-active-tags', 'aria-label': 'Выбранные теги' },
                selectedTags.map((tag) => h('button', { key: tag, type: 'button', onClick: () => toggleTag(tag), 'aria-label': 'Убрать тег ' + HEYS.Reading.getTagLabel(tag) }, HEYS.Reading.getTagLabel(tag) + ' ×')),
            ),
            books.length > 0 && h('div', { className: 'reading-results' },
                h('p', { className: 'reading-results-count', 'aria-live': 'polite', 'aria-atomic': 'true' }, HEYS.Reading.formatBookCount(filteredBooks.length)),
                hasFilters && h('button', { type: 'button', className: 'reading-reset', onClick: resetFilters }, 'Сбросить фильтры'),
            ),
            books.length === 0
                ? h('div', { className: 'reading-empty reading-empty--catalog' },
                    h('h2', null, 'Библиотека готовится'),
                    h('p', null, 'Опубликованные разборы скоро появятся здесь.'),
                )
                : filteredBooks.length > 0
                ? h('div', { className: 'reading-grid' }, filteredBooks.map((book) => h(BookCard, {
                    key: book.id,
                    book,
                    query: deferredQuery,
                    progressEntry: readingProgress[book.id],
                    selectedTags,
                    onOpen: () => openBook(book),
                    onToggleTag: toggleTag,
                    buttonRef: (node) => { if (node) cardRefs.current.set(book.id, node); else cardRefs.current.delete(book.id); },
                })))
                : h('div', { className: 'reading-empty' },
                    h('h2', null, 'Ничего не найдено'),
                    h('p', null, 'Измените запрос или сбросьте выбранные фильтры.'),
                ),
            activeBook && h(BookReader, {
                book: activeBook,
                personalization,
                onRequestClose: closeBook,
                onProgressChange: (bookId, entry) => setReadingProgress((current) => ({ ...current, [bookId]: entry })),
                returnFocusRef,
                scrollPositionsRef,
            }),
        );
    }

    HEYS.PlanningReading = Object.assign(HEYS.PlanningReading || {}, {
        MARKER_COLORS,
        PERSONALIZATION_KEY,
        ReadingIcon,
        ReadingScreen,
        BookReader,
        loadReadingPersonalization,
        readReaderPreferences,
        readReadingProgress,
        getReadingBookIdFromUrl,
        renderHighlightedText,
        buildKeySections,
    });
})();
