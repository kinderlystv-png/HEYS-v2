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

    function readReaderPreferences() {
        try {
            const stored = JSON.parse(localStorage.getItem(READER_PREFERENCES_KEY) || '{}');
            return {
                fontSize: Math.min(22, Math.max(16, Number(stored.fontSize) || 18)),
                theme: stored.theme === 'dark' ? 'dark' : 'light',
            };
        } catch (_) {
            return { fontSize: 18, theme: 'light' };
        }
    }

    function writeReaderPreferences(preferences) {
        try { localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(preferences)); } catch (_) { /* local preference is optional */ }
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

    function renderBlock(block, book, onNavigate) {
        const key = block.id;
        const sourceRefs = renderSourceRefs(block, book, onNavigate);
        if (block.type === 'heading') return h('h2', { key, id: getSectionId(book, block) }, block.text);
        if (block.type === 'lead') return h('p', { key, className: 'reading-block reading-block--lead' }, block.text, sourceRefs);
        if (block.type === 'quote') return h('blockquote', { key, className: 'reading-block reading-block--quote' },
            h('p', null, '«' + block.text + '»'),
            h('footer', null, block.attribution && '— ' + block.attribution, sourceRefs),
        );
        if (block.type === 'example') return h('aside', { key, className: 'reading-block reading-block--example' },
            h('strong', null, block.title || 'Авторский пример'), h('p', null, block.text, sourceRefs),
        );
        if (block.type === 'details') return h('details', { key, className: 'reading-block reading-block--details' },
            h('summary', null,
                h('span', { className: 'reading-block--details__title' }, block.title),
                h('span', { className: 'reading-block--details__summary' }, block.summary, sourceRefs),
            ),
            h('div', { className: 'reading-block--details__body' }, h('p', null, block.text)),
        );
        if (block.type === 'callout') return h('aside', { key, className: 'reading-block reading-block--callout reading-block--' + block.tone },
            block.title && h('strong', null, block.title), h('p', null, block.text, sourceRefs),
        );
        if (block.type === 'list') {
            const Tag = block.ordered ? 'ol' : 'ul';
            return h(Tag, { key, className: 'reading-block reading-block--list' },
                block.items.map((item) => h('li', { key: item }, item)),
                sourceRefs && h('li', { className: 'reading-block__source-row' }, sourceRefs),
            );
        }
        if (block.type === 'verdict') return h('aside', { key, className: 'reading-block reading-block--verdict' },
            block.title && h('strong', null, block.title), h('p', null, block.text, sourceRefs),
        );
        return h('p', { key, className: 'reading-block' }, block.text, sourceRefs);
    }

    function BookReader({ book, onRequestClose, onProgressChange, returnFocusRef, scrollPositionsRef }) {
        const rootRef = useRef(null);
        const closeRef = useRef(null);
        const initialProgress = Number(readReadingProgress()[book.id]?.percent) || 0;
        const [progress, setProgress] = useState(initialProgress);
        const [preferences, setPreferences] = useState(readReaderPreferences);
        const latestProgressRef = useRef(initialProgress);
        const latestPositionRef = useRef(readReaderPosition(book.id));
        const progressSaveTimerRef = useRef(0);
        const progressChangeRef = useRef(onProgressChange);
        progressChangeRef.current = onProgressChange;

        const updateProgress = (root) => {
            const max = root.scrollHeight - root.clientHeight;
            const next = max > 0 ? Math.min(100, Math.round((root.scrollTop / max) * 100)) : 100;
            latestProgressRef.current = next;
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
                    root.scrollTop = savedScrollPosition;
                    updateProgress(root);
                    restored = true;
                });
            });
            closeRef.current?.focus();

            return () => {
                window.cancelAnimationFrame(restoreFrame);
                window.cancelAnimationFrame(layoutFrame);
                window.clearTimeout(progressSaveTimerRef.current);
                const finalPosition = restored || root.scrollTop > 0 ? root.scrollTop : savedScrollPosition;
                scrollPositionsRef?.current?.set(book.id, finalPosition);
                const saved = writeReaderPosition(book.id, finalPosition, latestProgressRef.current);
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
            const handleKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
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
        });

        const handleScroll = (event) => {
            const root = event.currentTarget;
            updateProgress(root);
            latestPositionRef.current = root.scrollTop;
            if (!progressSaveTimerRef.current) {
                progressSaveTimerRef.current = window.setTimeout(() => {
                    progressSaveTimerRef.current = 0;
                    writeReaderPosition(book.id, latestPositionRef.current, latestProgressRef.current);
                }, 500);
            }
        };

        const headings = book.blocks.filter((block) => block.type === 'heading');

        const reader = h('div', {
            ref: rootRef,
            className: 'reading-reader reading-reader--' + preferences.theme,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'reading-reader-title',
            onScroll: handleScroll,
            style: { '--reading-reader-font-size': preferences.fontSize + 'px' },
        },
            h('header', { className: 'reading-reader__header' },
                h('button', { ref: closeRef, type: 'button', className: 'reading-reader__close', onClick: onRequestClose, 'aria-label': 'Закрыть саммари' }, h(CloseIcon)),
                h('span', { className: 'reading-reader__header-title' }, book.title),
                h('span', { className: 'reading-reader__progress-label', 'aria-hidden': 'true' }, progress + '%'),
                h('div', { className: 'reading-reader__progress', 'aria-hidden': 'true' }, h('span', { style: { width: progress + '%' } })),
            ),
            h('article', { className: 'reading-reader__article' },
                h('div', { className: 'reading-reader__eyebrow' }, book.author + ' · ' + book.year + ' · ' + HEYS.Reading.estimateReadingMinutes(book) + ' мин'),
                h('h1', { id: 'reading-reader-title' }, book.title),
                h('p', { className: 'reading-reader__practical' }, book.practicalValue),
                h('details', { className: 'reading-toc' },
                    h('summary', null, h('span', null, 'Содержание'), h('span', null, headings.length + ' разделов')),
                    h('nav', { 'aria-label': 'Содержание книги' }, headings.map((heading, index) => h('a', {
                        key: heading.id,
                        href: '#' + getSectionId(book, heading),
                        onClick: (event) => navigateWithinReader(event, getSectionId(book, heading)),
                    }, h('span', null, index + 1), heading.text))),
                ),
                book.blocks.map((block) => renderBlock(block, book, navigateWithinReader)),
                h('section', { className: 'reading-sources', 'aria-labelledby': 'reading-sources-title' },
                    h('h2', { id: 'reading-sources-title' }, 'Источники и ссылки'),
                    h('ol', null, book.sources.map((source, index) => h('li', { key: source.url, id: getSourceId(book, index + 1) },
                        h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.label),
                    ))),
                ),
            ),
            h('div', { className: 'reading-reader__toolbar', role: 'group', 'aria-label': 'Настройки чтения' },
                h('label', { className: 'reading-reader__font-control' },
                    h('span', { className: 'reading-reader__font-small', 'aria-hidden': 'true' }, 'А'),
                    h('input', {
                        type: 'range', min: 16, max: 22, step: 1,
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
                    className: 'reading-reader__theme-toggle',
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
                'aria-label': (isStarted ? 'Продолжить' : 'Открыть') + ' «' + book.title + '», ' + book.author,
            },
                h('span', { className: 'reading-cover reading-cover--' + book.coverTone, 'aria-hidden': 'true' },
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

    function ReadingScreen() {
        const books = useMemo(() => HEYS.Reading?.getPublishedBooks?.() || [], []);
        const [query, setQuery] = useState('');
        const deferredQuery = useDeferredValue ? useDeferredValue(query) : query;
        const [topic, setTopic] = useState('all');
        const [selectedTags, setSelectedTags] = useState([]);
        const [tagsExpanded, setTagsExpanded] = useState(false);
        const [sortBy, setSortBy] = useState('recommended');
        const [activeBook, setActiveBook] = useState(() => HEYS.Reading.getBookById(getReadingBookIdFromUrl(), books));
        const [readingProgress, setReadingProgress] = useState(readReadingProgress);
        const cardRefs = useRef(new Map());
        const scrollPositionsRef = useRef(new Map());
        const returnFocusRef = useRef(null);

        const topics = useMemo(() => ['all', ...Array.from(new Set(books.flatMap((book) => book.topics)))], [books]);
        const availableTags = useMemo(() => Array.from(new Set(books.flatMap((book) => book.tags))), [books]);
        const filteredBooks = useMemo(() => HEYS.Reading.sortBooks(
            HEYS.Reading.filterBooks(books, { query: deferredQuery, topic, tags: selectedTags }),
            sortBy,
        ), [books, deferredQuery, topic, selectedTags, sortBy]);
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
                h('label', { className: 'reading-sort' },
                    h('span', null, 'Сортировка'),
                    h('select', { value: sortBy, onChange: (event) => setSortBy(event.target.value) },
                        h('option', { value: 'recommended' }, 'Рекомендуемые'),
                        h('option', { value: 'author' }, 'По автору'),
                        h('option', { value: 'reading-time' }, 'По времени чтения'),
                    ),
                ),
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
                onRequestClose: closeBook,
                onProgressChange: (bookId, entry) => setReadingProgress((current) => ({ ...current, [bookId]: entry })),
                returnFocusRef,
                scrollPositionsRef,
            }),
        );
    }

    HEYS.PlanningReading = Object.assign(HEYS.PlanningReading || {}, { ReadingIcon, ReadingScreen, BookReader, readReaderPreferences, readReadingProgress, getReadingBookIdFromUrl });
})();
