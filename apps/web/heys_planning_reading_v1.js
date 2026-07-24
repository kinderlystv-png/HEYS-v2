(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const h = React.createElement;
    const { useDeferredValue, useEffect, useMemo, useRef, useState } = React;

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

    function renderBlock(block, index) {
        const key = block.type + '-' + index;
        if (block.type === 'heading') return h('h2', { key }, block.text);
        if (block.type === 'lead') return h('p', { key, className: 'reading-block reading-block--lead' }, block.text);
        if (block.type === 'quote') return h('blockquote', { key, className: 'reading-block reading-block--quote' },
            h('p', null, '«' + block.text + '»'),
            block.attribution && h('footer', null, '— ' + block.attribution),
        );
        if (block.type === 'example') return h('aside', { key, className: 'reading-block reading-block--example' },
            h('strong', null, block.title || 'Авторский пример'), h('p', null, block.text),
        );
        if (block.type === 'callout') return h('aside', { key, className: 'reading-block reading-block--callout reading-block--' + block.tone },
            block.title && h('strong', null, block.title), h('p', null, block.text),
        );
        if (block.type === 'list') {
            const Tag = block.ordered ? 'ol' : 'ul';
            return h(Tag, { key, className: 'reading-block reading-block--list' }, block.items.map((item, itemIndex) => h('li', { key: itemIndex }, item)));
        }
        if (block.type === 'verdict') return h('aside', { key, className: 'reading-block reading-block--verdict' },
            block.title && h('strong', null, block.title), h('p', null, block.text),
        );
        return h('p', { key, className: 'reading-block' }, block.text);
    }

    function BookReader({ book, onClose, returnFocusRef }) {
        const rootRef = useRef(null);
        const closeRef = useRef(null);
        const historyOwnedRef = useRef(false);
        const [progress, setProgress] = useState(0);

        const requestClose = () => {
            if (typeof history !== 'undefined' && history.state?.heysReadingBook === book.id) {
                history.back();
                return;
            }
            onClose();
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
            closeRef.current?.focus();

            const baseState = { ...(history.state || {}) };
            delete baseState.heysReadingBook;
            history.replaceState(baseState, '');
            history.pushState({ ...baseState, heysReadingBook: book.id }, '');
            historyOwnedRef.current = true;
            const handlePopState = () => {
                historyOwnedRef.current = false;
                onClose();
            };
            window.addEventListener('popstate', handlePopState);

            return () => {
                window.removeEventListener('popstate', handlePopState);
                if (historyOwnedRef.current && history.state?.heysReadingBook === book.id) history.replaceState(baseState, '');
                previous.forEach(({ node, inert, ariaHidden }) => {
                    node.inert = inert;
                    if (ariaHidden == null) node.removeAttribute('aria-hidden');
                    else node.setAttribute('aria-hidden', ariaHidden);
                });
                body.classList.remove('reading-reader-open');
                window.requestAnimationFrame(() => returnFocusRef?.current?.focus?.());
            };
        }, [book.id, onClose, returnFocusRef]);

        useEffect(() => {
            const handleKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    requestClose();
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
            const node = event.currentTarget;
            const max = node.scrollHeight - node.clientHeight;
            setProgress(max > 0 ? Math.min(100, Math.round((node.scrollTop / max) * 100)) : 100);
        };

        const reader = h('div', {
            ref: rootRef,
            className: 'reading-reader',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'reading-reader-title',
            onScroll: handleScroll,
        },
            h('header', { className: 'reading-reader__header' },
                h('button', { ref: closeRef, type: 'button', className: 'reading-reader__close', onClick: requestClose, 'aria-label': 'Закрыть саммари' }, h(CloseIcon)),
                h('span', { className: 'reading-reader__header-title' }, book.title),
                h('span', { className: 'reading-reader__progress-label', 'aria-hidden': 'true' }, progress + '%'),
                h('div', { className: 'reading-reader__progress', 'aria-hidden': 'true' }, h('span', { style: { width: progress + '%' } })),
            ),
            h('article', { className: 'reading-reader__article' },
                h('div', { className: 'reading-reader__eyebrow' }, book.author + ' · ' + book.year + ' · ' + HEYS.Reading.estimateReadingMinutes(book) + ' мин'),
                h('h1', { id: 'reading-reader-title' }, book.title),
                h('p', { className: 'reading-reader__practical' }, book.practicalValue),
                book.blocks.map(renderBlock),
                h('section', { className: 'reading-sources', 'aria-labelledby': 'reading-sources-title' },
                    h('h2', { id: 'reading-sources-title' }, 'Источники и ссылки'),
                    h('ol', null, book.sources.map((source) => h('li', { key: source.url },
                        h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.label),
                    ))),
                ),
            ),
        );

        return ReactDOM?.createPortal ? ReactDOM.createPortal(reader, document.body) : reader;
    }

    function BookCard({ book, selectedTags, onOpen, onToggleTag, buttonRef }) {
        const minutes = HEYS.Reading.estimateReadingMinutes(book);
        return h('article', { className: 'reading-card' },
            h('button', {
                ref: buttonRef,
                type: 'button',
                className: 'reading-card__open',
                onClick: onOpen,
                'aria-label': 'Открыть «' + book.title + '», ' + book.author,
            },
                h('span', { className: 'reading-cover reading-cover--' + book.coverTone, 'aria-hidden': 'true' },
                    h('span', { className: 'reading-cover__author' }, book.author),
                    h('span', { className: 'reading-cover__title' }, book.title),
                    h('span', { className: 'reading-cover__mark' }, 'HEYS'),
                ),
                h('span', { className: 'reading-card__content' },
                    h('span', { className: 'reading-card__meta' }, book.author + ' · ' + minutes + ' мин'),
                    h('span', { className: 'reading-card__title' }, book.title),
                    h('span', { className: 'reading-card__verdict' }, book.verdict),
                ),
            ),
            h('div', { className: 'reading-card__tags', 'aria-label': 'Теги книги' }, book.tags.slice(0, 3).map((tag) => h('button', {
                key: tag,
                type: 'button',
                className: 'reading-tag' + (selectedTags.includes(tag) ? ' active' : ''),
                onClick: () => onToggleTag(tag),
                'aria-pressed': selectedTags.includes(tag),
            }, tag))),
        );
    }

    function ReadingScreen() {
        const books = HEYS.Reading?.BOOKS || [];
        const [query, setQuery] = useState('');
        const deferredQuery = useDeferredValue ? useDeferredValue(query) : query;
        const [topic, setTopic] = useState('Все');
        const [selectedTags, setSelectedTags] = useState([]);
        const [activeBook, setActiveBook] = useState(null);
        const cardRefs = useRef(new Map());
        const returnFocusRef = useRef(null);

        const topics = useMemo(() => ['Все', ...Array.from(new Set(books.flatMap((book) => book.topics))).sort((a, b) => a.localeCompare(b, 'ru'))], [books]);
        const filteredBooks = useMemo(() => HEYS.Reading.filterBooks(books, { query: deferredQuery, topic, tags: selectedTags }), [books, deferredQuery, topic, selectedTags]);
        const resetFilters = () => { setQuery(''); setTopic('Все'); setSelectedTags([]); };
        const toggleTag = (tag) => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : current.concat(tag));
        const openBook = (book) => {
            returnFocusRef.current = cardRefs.current.get(book.id) || document.activeElement;
            setActiveBook(book);
        };

        return h('section', { className: 'planning-reading-screen', 'aria-labelledby': 'reading-library-title' },
            h('header', { className: 'planning-reading-screen__header' },
                h('p', { className: 'planning-reading-screen__eyebrow' }, 'HEYS · Книги'),
                h('h1', { id: 'reading-library-title' }, 'Библиотека'),
                h('p', null, 'Разборы книг о мышлении, работе и привычках'),
            ),
            h('div', { className: 'reading-search' },
                h('label', { htmlFor: 'reading-library-search' }, 'Поиск по библиотеке'),
                h('div', { className: 'reading-search__field' }, h(SearchIcon), h('input', {
                    id: 'reading-library-search', type: 'search', value: query,
                    placeholder: 'Название, автор, идея или тег',
                    onChange: (event) => setQuery(event.target.value),
                })),
            ),
            h('div', { className: 'reading-topics', 'aria-label': 'Темы книг' }, topics.map((item) => h('button', {
                key: item, type: 'button', className: 'reading-topic' + (topic === item ? ' active' : ''),
                onClick: () => setTopic(item), 'aria-pressed': topic === item,
            }, item))),
            selectedTags.length > 0 && h('div', { className: 'reading-active-tags', 'aria-label': 'Выбранные теги' },
                selectedTags.map((tag) => h('button', { key: tag, type: 'button', onClick: () => toggleTag(tag), 'aria-label': 'Убрать тег ' + tag }, tag + ' ×')),
            ),
            h('p', { className: 'reading-results-count', 'aria-live': 'polite', 'aria-atomic': 'true' }, 'Найдено: ' + filteredBooks.length),
            filteredBooks.length > 0
                ? h('div', { className: 'reading-grid' }, filteredBooks.map((book) => h(BookCard, {
                    key: book.id,
                    book,
                    selectedTags,
                    onOpen: () => openBook(book),
                    onToggleTag: toggleTag,
                    buttonRef: (node) => { if (node) cardRefs.current.set(book.id, node); else cardRefs.current.delete(book.id); },
                })))
                : h('div', { className: 'reading-empty' },
                    h('h2', null, 'Ничего не найдено'),
                    h('p', null, 'Попробуйте другой запрос или сбросьте фильтры.'),
                    h('button', { type: 'button', onClick: resetFilters }, 'Сбросить фильтры'),
                ),
            activeBook && h(BookReader, { book: activeBook, onClose: () => setActiveBook(null), returnFocusRef }),
        );
    }

    HEYS.PlanningReading = Object.assign(HEYS.PlanningReading || {}, { ReadingIcon, ReadingScreen, BookReader });
})();
