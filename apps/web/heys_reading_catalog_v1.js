(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const Reading = HEYS.Reading = HEYS.Reading || {};

    const SCHEMA_VERSION = 3;
    const PERSONALIZATION_SCHEMA_VERSION = 2;
    const PERSONALIZATION_PROJECT_IDS = Object.freeze(['kinderly', 'heys']);
    const GENERIC_PERSONALIZATION_QUESTIONS = new Set([
        'как эту идею можно применить',
        'как применить эту идею',
        'как это можно применить',
        'что можно улучшить',
    ]);
    const WORDS_PER_MINUTE = 180;
    const DEPTH_PROFILES = Object.freeze({
        compact: Object.freeze({ minWords: 1200, maxWords: 1700 }),
        standard: Object.freeze({ minWords: 1700, maxWords: 2400 }),
        deep: Object.freeze({ minWords: 2400, maxWords: 3400 }),
    });
    const REVIEW_BLOCKS_MIN = 3;
    const REVIEW_WORDS_MIN = 180;
    const QUICK_SUMMARY_ITEMS_MIN = 5;
    const QUICK_SUMMARY_ITEMS_MAX = 7;
    const QUICK_SUMMARY_WORDS_MIN = 180;
    const QUICK_SUMMARY_WORDS_MAX = 300;
    const APPLICABILITY_WORDS_MIN = 180;
    const APPLICABILITY_FIELD_WORDS_MIN = 30;
    const LONG_SECTION_WORDS_MIN = 260;
    const OPEN_BLOCKS_RUN_MAX = 5;
    const STATUSES = new Set(['draft', 'published']);
    const BLOCK_TYPES = new Set(['lead', 'heading', 'quick-summary', 'applicability', 'paragraph', 'details', 'quote', 'example', 'callout', 'list', 'verdict']);
    const CALLOUT_TONES = new Set(['insight', 'practice', 'caution']);
    const PARAGRAPH_VOICES = new Set(['retelling', 'review']);
    const HIGHLIGHT_TARGETS = Object.freeze({
        lead: Object.freeze(['text']),
        applicability: Object.freeze(['strength', 'worksWhen', 'limitations', 'experiment']),
        paragraph: Object.freeze(['text']),
        details: Object.freeze(['text']),
        example: Object.freeze(['text']),
        callout: Object.freeze(['text']),
        verdict: Object.freeze(['text']),
    });
    const HIGHLIGHT_FRAGMENTS_MAX = 2;
    const HIGHLIGHT_COVERAGE_WARN_MIN = 8;
    const HIGHLIGHT_COVERAGE_WARN_MAX = 18;
    const HIGHLIGHT_COVERAGE_ERROR_MAX = 25;
    const SECTION_ROLES = new Set([
        'overview', 'context', 'core-ideas', 'decision-process', 'application',
        'critique', 'audience', 'original-verdict',
    ]);
    const REQUIRED_SECTION_ROLES = ['overview', 'core-ideas', 'critique', 'audience', 'original-verdict'];

    const TOPICS = Object.freeze([
        { id: 'thinking', label: 'Мышление' },
        { id: 'work', label: 'Работа' },
        { id: 'management', label: 'Управление' },
        { id: 'service', label: 'Сервис' },
    ]);
    const TAGS = Object.freeze([
        { id: 'decisions', label: 'решения' },
        { id: 'mistakes', label: 'ошибки' },
        { id: 'systems', label: 'системность' },
        { id: 'teams', label: 'команды' },
        { id: 'customers', label: 'клиенты' },
        { id: 'loyalty', label: 'лояльность' },
        { id: 'feedback', label: 'обратная связь' },
    ]);
    const COVER_TONES = Object.freeze(['violet', 'blue', 'green', 'rose']);
    const EDITORIAL_ROLES = Object.freeze({
        'popular-canon': Object.freeze({
            id: 'popular-canon',
            label: 'Популярный канон',
            description: 'Книга включена из-за широкой известности и влияния. Плашка не означает редакционную рекомендацию.',
        }),
    });
    const TOPIC_MAP = new Map(TOPICS.map((item) => [item.id, item]));
    const TAG_MAP = new Map(TAGS.map((item) => [item.id, item]));
    const BOOKS = [];
    const DRAFTS = [];
    const ATTEMPTS = [];

    function normalizeReadingText(value) {
        return String(value == null ? '' : value)
            .toLocaleLowerCase('ru-RU')
            .replace(/ё/g, 'е')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenizeReadingText(value) {
        return normalizeReadingText(value).match(/[\p{L}\p{N}]+/gu) || [];
    }

    function countWords(value) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
    }

    function getBlockText(block) {
        return [
            block?.text,
            block?.title,
            block?.summary,
            block?.attribution,
            block?.strength,
            block?.worksWhen,
            block?.limitations,
            block?.experiment,
            ...(Array.isArray(block?.items) ? block.items : []),
        ]
            .filter(Boolean)
            .join(' ');
    }

    function getBookWordCount(book) {
        return (book?.blocks || []).reduce((total, block) => total + countWords(getBlockText(block)), 0);
    }

    function getHighlightTargets(block) {
        return HIGHLIGHT_TARGETS[block?.type] || [];
    }

    function countExactOccurrences(text, fragment) {
        if (!fragment) return 0;
        let count = 0;
        let offset = 0;
        while (offset <= text.length - fragment.length) {
            const index = text.indexOf(fragment, offset);
            if (index < 0) break;
            count += 1;
            offset = index + Math.max(1, fragment.length);
        }
        return count;
    }

    function getBookHighlightStats(book) {
        let eligibleFields = 0;
        let markedFields = 0;
        let eligibleWords = 0;
        let highlightedWords = 0;
        (book?.blocks || []).forEach((block) => {
            getHighlightTargets(block).forEach((target) => {
                const text = String(block?.[target] || '').trim();
                if (!text) return;
                eligibleFields += 1;
                eligibleWords += countWords(text);
                const fragments = block?.highlights?.[target];
                if (!Array.isArray(fragments) || !fragments.length) return;
                markedFields += 1;
                highlightedWords += fragments.reduce((sum, fragment) => sum + countWords(fragment), 0);
            });
        });
        const coveragePercent = eligibleWords > 0 ? Math.round((highlightedWords / eligibleWords) * 1000) / 10 : 0;
        return {
            eligibleFields,
            markedFields,
            eligibleWords,
            highlightedWords,
            coveragePercent,
            readingMinutes: Math.max(1, Math.ceil(highlightedWords / WORDS_PER_MINUTE)),
        };
    }

    function estimateReadingMinutes(book) {
        return Math.max(1, Math.ceil(getBookWordCount(book) / WORDS_PER_MINUTE));
    }

    function getTopicLabel(id) {
        return TOPIC_MAP.get(id)?.label || id;
    }

    function getTagLabel(id) {
        return TAG_MAP.get(id)?.label || id;
    }

    function getEditorialRole(id) {
        return EDITORIAL_ROLES[id] || null;
    }

    function getBookSearchText(book) {
        const editorialRole = getEditorialRole(book?.editorialRole);
        return normalizeReadingText([
            book?.title,
            book?.author,
            book?.verdict,
            book?.practicalValue,
            book?.editorialRole,
            editorialRole?.label,
            editorialRole?.description,
            ...(book?.topics || []).flatMap((id) => [id, getTopicLabel(id)]),
            ...(book?.tags || []).flatMap((id) => [id, getTagLabel(id)]),
            ...(book?.blocks || []).map(getBlockText),
        ].filter(Boolean).join(' '));
    }

    function filterBooks(books, filters = {}) {
        const queryTokens = tokenizeReadingText(filters.query);
        const topic = filters.topic || 'all';
        const tags = Array.isArray(filters.tags) ? filters.tags : [];
        return (Array.isArray(books) ? books : []).filter((book) => {
            if (topic !== 'all' && topic !== 'Все' && !(book.topics || []).includes(topic)) return false;
            if (tags.some((tag) => !(book.tags || []).includes(tag))) return false;
            const searchTokens = new Set(tokenizeReadingText(getBookSearchText(book)));
            const titleAndAuthorTokens = tokenizeReadingText([book?.title, book?.author].filter(Boolean).join(' '));
            return queryTokens.every((token) => (
                searchTokens.has(token)
                || titleAndAuthorTokens.some((candidate) => candidate.startsWith(token))
            ));
        });
    }

    function getBookSearchExcerpt(book, query, maxLength = 170) {
        const tokens = normalizeReadingText(query).split(/\s+/).filter(Boolean);
        if (!tokens.length) return '';
        const candidates = [book?.verdict, book?.practicalValue, ...(book?.blocks || []).map(getBlockText)].filter(Boolean);
        const ranked = candidates.map((text) => {
            const normalized = normalizeReadingText(text);
            return { text: String(text), normalized, score: tokens.reduce((sum, token) => sum + (normalized.includes(token) ? 1 : 0), 0) };
        }).sort((left, right) => right.score - left.score || left.text.length - right.text.length);
        const selected = ranked[0];
        if (!selected || selected.score === 0) return String(book?.verdict || '');
        const firstMatch = Math.min(...tokens.map((token) => selected.normalized.indexOf(token)).filter((index) => index >= 0));
        let start = Math.max(0, firstMatch - 48);
        if (start > 0) start = selected.text.indexOf(' ', start) + 1 || start;
        let excerpt = selected.text.slice(start, start + maxLength).trim();
        if (start > 0) excerpt = '…' + excerpt;
        if (start + maxLength < selected.text.length) excerpt = excerpt.replace(/\s+\S*$/, '') + '…';
        return excerpt;
    }

    function sortBooks(books, order = 'recommended') {
        const result = (Array.isArray(books) ? books : []).slice();
        if (order === 'author') {
            return result.sort((left, right) => left.author.localeCompare(right.author, 'ru') || left.title.localeCompare(right.title, 'ru'));
        }
        if (order === 'reading-time') {
            return result.sort((left, right) => estimateReadingMinutes(left) - estimateReadingMinutes(right) || left.title.localeCompare(right.title, 'ru'));
        }
        return result.sort((left, right) => left.editorialRank - right.editorialRank || left.title.localeCompare(right.title, 'ru'));
    }

    function formatBookCount(count) {
        const absolute = Math.abs(Number(count) || 0);
        const mod100 = absolute % 100;
        const mod10 = absolute % 10;
        const label = mod100 >= 11 && mod100 <= 14
            ? 'книг'
            : mod10 === 1
                ? 'книга'
                : mod10 >= 2 && mod10 <= 4
                    ? 'книги'
                    : 'книг';
        return absolute + ' ' + label;
    }

    function issue(book, severity, code, path, message) {
        const bookId = String(book?.id || 'unknown');
        return { bookId, severity, code, path: bookId + '.' + path, message };
    }

    function personalizationIssue(overlay, code, path, message) {
        const profileId = String(overlay?.profileId || 'unknown');
        return { profileId, severity: 'error', code, path: profileId + '.' + path, message };
    }

    function hasRawMarkup(value) {
        const text = String(value == null ? '' : value);
        return /<\/?[a-z][^>]*>/i.test(text) || /\[[^\]]+\]\([^)]+\)/.test(text);
    }

    function hasPublishedPlaceholder(value) {
        return /\b(?:TODO|TBD)\b|\?\?\?|\[заполнить\]|\[уточнить\]/i.test(String(value == null ? '' : value));
    }

    function duplicateValues(values) {
        const seen = new Set();
        const duplicates = new Set();
        values.forEach((value) => {
            const normalized = normalizeReadingText(value);
            if (seen.has(normalized)) duplicates.add(value);
            seen.add(normalized);
        });
        return Array.from(duplicates);
    }

    function validateBookSummary(book, catalog = []) {
        const errors = [];
        const warnings = [];
        const addError = (code, path, message) => errors.push(issue(book, 'error', code, path, message));
        const addWarning = (code, path, message) => warnings.push(issue(book, 'warning', code, path, message));
        const isPublished = book?.status === 'published';
        const depthProfile = DEPTH_PROFILES[book?.depthProfile];
        const addPublicationIssue = (errorCode, warningCode, path, message) => {
            if (isPublished) addError(errorCode, path, message);
            else addWarning(warningCode, path, message);
        };

        if (book?.schemaVersion !== SCHEMA_VERSION) addError('E_SCHEMA_VERSION', 'schemaVersion', 'Ожидается schemaVersion ' + SCHEMA_VERSION);
        if (!STATUSES.has(book?.status)) addError('E_STATUS', 'status', 'Допустимы только draft и published');
        if (!depthProfile) addError('E_DEPTH_PROFILE', 'depthProfile', 'Допустимые профили глубины: compact, standard, deep');
        ['id', 'title', 'author', 'verdict', 'practicalValue', 'coverTone'].forEach((field) => {
            if (!String(book?.[field] || '').trim()) addError('E_REQUIRED', field, 'Обязательное поле не заполнено');
        });
        if (isPublished) {
            ['title', 'author', 'verdict', 'practicalValue'].forEach((field) => {
                if (hasPublishedPlaceholder(book?.[field])) addError('E_PLACEHOLDER', field, 'В опубликованной книге остался маркер заполнения');
            });
        }
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(book?.id || ''))) addError('E_ID_FORMAT', 'id', 'id должен быть в kebab-case');
        if (!Number.isInteger(book?.year)) addError('E_YEAR', 'year', 'Год должен быть целым числом');
        if (!Number.isInteger(book?.editorialRank) || book.editorialRank < 1) addError('E_EDITORIAL_RANK', 'editorialRank', 'Редакционный порядок должен быть целым числом от 1');
        if (!COVER_TONES.includes(book?.coverTone)) addError('E_COVER_TONE', 'coverTone', 'Неизвестная тема обложки');
        if (book?.editorialRole != null && !getEditorialRole(book.editorialRole)) addError('E_EDITORIAL_ROLE', 'editorialRole', 'Допустима только редакционная роль popular-canon');

        if (!Array.isArray(book?.topics) || book.topics.length < 1 || book.topics.length > 3) addError('E_TOPICS_COUNT', 'topics', 'У книги должно быть от 1 до 3 тем');
        (book?.topics || []).forEach((id, index) => {
            if (!TOPIC_MAP.has(id)) addError('E_TOPIC_UNKNOWN', 'topics[' + index + ']', 'Неизвестная тема: ' + id);
        });
        duplicateValues(book?.topics || []).forEach((id) => addError('E_TOPIC_DUPLICATE', 'topics', 'Тема повторяется: ' + id));

        if (!Array.isArray(book?.tags) || book.tags.length < 3 || book.tags.length > 6) addError('E_TAGS_COUNT', 'tags', 'У книги должно быть от 3 до 6 тегов');
        (book?.tags || []).forEach((id, index) => {
            if (!TAG_MAP.has(id)) addError('E_TAG_UNKNOWN', 'tags[' + index + ']', 'Неизвестный тег: ' + id);
        });
        duplicateValues(book?.tags || []).forEach((id) => addError('E_TAG_DUPLICATE', 'tags', 'Тег повторяется: ' + id));

        if (!Array.isArray(book?.sources) || !book.sources.length) addError('E_SOURCES_EMPTY', 'sources', 'Нужен хотя бы один источник');
        const sourceIds = new Set();
        const sourceUrls = [];
        (book?.sources || []).forEach((source, index) => {
            const path = 'sources[' + index + ']';
            if (!String(source?.id || '').trim()) addError('E_SOURCE_ID', path + '.id', 'Источник должен иметь id');
            if (sourceIds.has(source?.id)) addError('E_SOURCE_ID_DUPLICATE', path + '.id', 'Повторяющийся source id: ' + source?.id);
            sourceIds.add(source?.id);
            if (!String(source?.label || '').trim()) addError('E_SOURCE_LABEL', path + '.label', 'Источник должен иметь подпись');
            if (!/^https:\/\//i.test(String(source?.url || ''))) addError('E_SOURCE_HTTPS', path + '.url', 'Источник должен использовать HTTPS');
            if (isPublished && (hasPublishedPlaceholder(source?.id) || hasPublishedPlaceholder(source?.label) || hasPublishedPlaceholder(source?.url) || /example\.com|replace-before-publishing/i.test(String(source?.url || '')))) {
                addError('E_PLACEHOLDER', path, 'В опубликованной книге осталась заглушка источника');
            }
            sourceUrls.push(source?.url || '');
        });
        duplicateValues(sourceUrls).forEach((url) => addError('E_SOURCE_URL_DUPLICATE', 'sources', 'URL источника повторяется: ' + url));

        if (!Array.isArray(book?.blocks) || !book.blocks.length) addError('E_BLOCKS_EMPTY', 'blocks', 'Саммари должно содержать блоки');
        if (book?.blocks?.[0]?.type !== 'lead') addError('E_LEAD_POSITION', 'blocks[0]', 'Первым блоком должен быть lead');
        if (book?.blocks?.[1]?.type !== 'verdict') addError('E_VERDICT_POSITION', 'blocks[1]', 'Вторым блоком должен быть короткий verdict');
        if (book?.blocks?.[2]?.type !== 'quick-summary') addPublicationIssue('E_QUICK_SUMMARY_POSITION', 'W_QUICK_SUMMARY_POSITION_DRAFT', 'blocks[2]', 'После начального verdict должен идти блок quick-summary');
        if (book?.blocks?.[3]?.type !== 'applicability') addPublicationIssue('E_APPLICABILITY_POSITION', 'W_APPLICABILITY_POSITION_DRAFT', 'blocks[3]', 'После quick-summary должен идти блок applicability');

        const blockIds = new Set();
        const headingRoles = [];
        let hasRetelling = false;
        let hasReview = false;
        let reviewBlockCount = 0;
        let reviewWordCount = 0;
        let consecutiveParagraphs = 0;
        let calloutCount = 0;
        let quoteCount = 0;
        let quickSummaryWordCount = 0;
        let applicabilityWordCount = 0;
        const headingTexts = [];
        const proseTexts = [];
        const quickSummaryItems = [];
        const quickSummaryIndexes = [];
        const applicabilityIndexes = [];
        (book?.blocks || []).forEach((block, index) => {
            const path = 'blocks[' + index + ']';
            if (!String(block?.id || '').trim()) addError('E_BLOCK_ID', path + '.id', 'Блок должен иметь стабильный id');
            if (blockIds.has(block?.id)) addError('E_BLOCK_ID_DUPLICATE', path + '.id', 'Повторяющийся block id: ' + block?.id);
            blockIds.add(block?.id);
            if (!BLOCK_TYPES.has(block?.type)) addError('E_BLOCK_TYPE', path + '.type', 'Неизвестный тип блока: ' + block?.type);

            const textValues = [
                block?.text,
                block?.title,
                block?.summary,
                block?.attribution,
                block?.strength,
                block?.worksWhen,
                block?.limitations,
                block?.experiment,
                ...(Array.isArray(block?.items) ? block.items : []),
            ];
            textValues.filter(Boolean).forEach((value) => {
                if (hasRawMarkup(value)) addError('E_RAW_MARKUP', path, 'HTML и Markdown-ссылки в контенте запрещены');
                if (isPublished && hasPublishedPlaceholder(value)) addError('E_PLACEHOLDER', path, 'В опубликованной книге остался маркер заполнения');
            });
            const allowedHighlightTargets = getHighlightTargets(block);
            const highlightMap = block?.highlights;
            if (highlightMap != null && (typeof highlightMap !== 'object' || Array.isArray(highlightMap))) {
                addError('E_HIGHLIGHT_FORMAT', path + '.highlights', 'highlights должен быть объектом с точными фрагментами текста');
            }
            Object.keys(highlightMap && typeof highlightMap === 'object' && !Array.isArray(highlightMap) ? highlightMap : {}).forEach((target) => {
                if (!allowedHighlightTargets.includes(target)) addError('E_HIGHLIGHT_TARGET', path + '.highlights.' + target, 'Поле ' + target + ' нельзя размечать у блока ' + block?.type);
            });
            allowedHighlightTargets.forEach((target) => {
                const targetPath = path + '.highlights.' + target;
                const targetText = String(block?.[target] || '').trim();
                if (!targetText) return;
                const fragments = highlightMap?.[target];
                if (!Array.isArray(fragments) || fragments.length < 1 || fragments.length > HIGHLIGHT_FRAGMENTS_MAX) {
                    addPublicationIssue('E_HIGHLIGHT_REQUIRED', 'W_HIGHLIGHT_REQUIRED_DRAFT', targetPath, 'Нужен массив из одного или двух ключевых фрагментов');
                    return;
                }
                const ranges = [];
                fragments.forEach((rawFragment, fragmentIndex) => {
                    const fragmentPath = targetPath + '[' + fragmentIndex + ']';
                    const fragment = String(rawFragment || '').trim();
                    if (!fragment) {
                        addError('E_HIGHLIGHT_EMPTY', fragmentPath, 'Ключевой фрагмент не должен быть пустым');
                        return;
                    }
                    if (fragment !== rawFragment) addError('E_HIGHLIGHT_TRIM', fragmentPath, 'Ключевой фрагмент не должен начинаться или заканчиваться пробелом');
                    if (hasRawMarkup(fragment)) addError('E_RAW_MARKUP', fragmentPath, 'HTML и Markdown в ключевом фрагменте запрещены');
                    if (isPublished && hasPublishedPlaceholder(fragment)) addError('E_PLACEHOLDER', fragmentPath, 'В ключевом фрагменте остался маркер заполнения');
                    const occurrences = countExactOccurrences(targetText, fragment);
                    if (occurrences === 0) {
                        addError('E_HIGHLIGHT_NOT_FOUND', fragmentPath, 'Ключевой фрагмент должен дословно входить в исходный текст');
                        return;
                    }
                    if (occurrences > 1) {
                        addError('E_HIGHLIGHT_AMBIGUOUS', fragmentPath, 'Ключевой фрагмент встречается в исходном тексте больше одного раза');
                        return;
                    }
                    const start = targetText.indexOf(fragment);
                    const end = start + fragment.length;
                    if (ranges.some((range) => start < range.end && end > range.start)) addError('E_HIGHLIGHT_OVERLAP', fragmentPath, 'Ключевые фрагменты не должны пересекаться');
                    ranges.push({ start, end });
                });
            });
            if ((block?.voice === 'review' || block?.type === 'applicability' || block?.type === 'verdict') && /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:\/|из)\s*(?:5|10)(?!\d)/i.test(getBlockText(block))) {
                addError('E_REVIEW_RATING', path, 'Числовые оценки книг в review запрещены');
            }

            if (block?.type === 'list') {
                if (!Array.isArray(block.items) || !block.items.length || block.items.some((item) => !String(item || '').trim())) addError('E_LIST_EMPTY', path + '.items', 'Список должен содержать непустые элементы');
                if (typeof block.ordered !== 'boolean') addError('E_LIST_ORDERED', path + '.ordered', 'ordered должен быть boolean');
            } else if (!['quick-summary', 'applicability'].includes(block?.type) && !String(block?.text || '').trim()) {
                addError('E_BLOCK_TEXT', path + '.text', 'Текст блока не заполнен');
            }

            if (block?.type === 'heading') {
                headingTexts.push(block.text);
                headingRoles.push(block.sectionRole);
                if (!SECTION_ROLES.has(block.sectionRole)) addError('E_SECTION_ROLE', path + '.sectionRole', 'Неизвестная роль раздела: ' + block.sectionRole);
            }
            if (block?.type === 'quick-summary') {
                consecutiveParagraphs = 0;
                quickSummaryIndexes.push(index);
                if (!String(block.title || '').trim()) addError('E_QUICK_SUMMARY_TITLE', path + '.title', 'Быстрому слою нужен заголовок');
                if (block.voice !== 'retelling') addError('E_QUICK_SUMMARY_VOICE', path + '.voice', 'quick-summary должен иметь voice: retelling');
                if (!Array.isArray(block.items) || block.items.length < QUICK_SUMMARY_ITEMS_MIN || block.items.length > QUICK_SUMMARY_ITEMS_MAX || block.items.some((item) => !String(item || '').trim())) {
                    addError('E_QUICK_SUMMARY_ITEMS', path + '.items', 'quick-summary должен содержать от ' + QUICK_SUMMARY_ITEMS_MIN + ' до ' + QUICK_SUMMARY_ITEMS_MAX + ' непустых тезисов');
                }
                quickSummaryWordCount += countWords((block.items || []).join(' '));
                quickSummaryItems.push(...(block.items || []));
                hasRetelling = true;
                if (quickSummaryWordCount < QUICK_SUMMARY_WORDS_MIN || quickSummaryWordCount > QUICK_SUMMARY_WORDS_MAX) {
                    addPublicationIssue('E_QUICK_SUMMARY_VOLUME', 'W_QUICK_SUMMARY_VOLUME_DRAFT', path + '.items', 'Быстрый слой должен содержать ' + QUICK_SUMMARY_WORDS_MIN + '–' + QUICK_SUMMARY_WORDS_MAX + ' слов, сейчас: ' + quickSummaryWordCount);
                }
            } else if (block?.type === 'applicability') {
                consecutiveParagraphs = 0;
                applicabilityIndexes.push(index);
                if (!String(block.title || '').trim()) addError('E_APPLICABILITY_TITLE', path + '.title', 'Проверке применимости нужен заголовок');
                if (block.voice !== 'review') addError('E_APPLICABILITY_VOICE', path + '.voice', 'applicability должен иметь voice: review');
                const fieldNames = ['strength', 'worksWhen', 'limitations', 'experiment'];
                fieldNames.forEach((field) => {
                    const words = countWords(block[field]);
                    if (!String(block[field] || '').trim()) addError('E_APPLICABILITY_FIELD', path + '.' + field, 'Поле ' + field + ' обязательно');
                    else if (words < APPLICABILITY_FIELD_WORDS_MIN) addPublicationIssue('E_APPLICABILITY_FIELD_DEPTH', 'W_APPLICABILITY_FIELD_DEPTH_DRAFT', path + '.' + field, 'Поле ' + field + ' должно содержать минимум ' + APPLICABILITY_FIELD_WORDS_MIN + ' слов, сейчас: ' + words);
                });
                applicabilityWordCount += countWords(fieldNames.map((field) => block[field]).join(' '));
                if (applicabilityWordCount < APPLICABILITY_WORDS_MIN) addPublicationIssue('E_APPLICABILITY_VOLUME', 'W_APPLICABILITY_VOLUME_DRAFT', path, 'Проверка применимости должна содержать минимум ' + APPLICABILITY_WORDS_MIN + ' слов, сейчас: ' + applicabilityWordCount);
                if (applicabilityWordCount > 420) addWarning('W_APPLICABILITY_LONG', path, 'Проверка применимости длиннее 420 слов и перегружает быстрый слой');
                hasReview = true;
                reviewBlockCount += 1;
                reviewWordCount += applicabilityWordCount;
                proseTexts.push(...fieldNames.map((field) => block[field]));
            } else if (block?.type === 'paragraph') {
                consecutiveParagraphs += 1;
                if (!PARAGRAPH_VOICES.has(block.voice)) addError('E_PARAGRAPH_VOICE', path + '.voice', 'Укажите voice: retelling или review');
                hasRetelling = hasRetelling || block.voice === 'retelling';
                hasReview = hasReview || block.voice === 'review';
                if (block.voice === 'review') {
                    reviewBlockCount += 1;
                    reviewWordCount += countWords(getBlockText(block));
                }
                if (countWords(block.text) > 150) addWarning('W_PARAGRAPH_LONG', path + '.text', 'Абзац длиннее 150 слов');
                if (consecutiveParagraphs > 5) addWarning('W_PARAGRAPH_RUN', path, 'Более пяти абзацев подряд без смысловой паузы');
                proseTexts.push(block.text);
            } else if (block?.type === 'details') {
                consecutiveParagraphs = 0;
                if (!String(block.title || '').trim()) addError('E_DETAILS_TITLE', path + '.title', 'Аккордеону нужен короткий заголовок');
                if (!String(block.summary || '').trim()) addError('E_DETAILS_SUMMARY', path + '.summary', 'Аккордеону нужна краткая видимая мысль');
                if (countWords(block.summary) > 30) addError('E_DETAILS_SUMMARY_LENGTH', path + '.summary', 'Краткая мысль аккордеона не должна превышать 30 слов');
                if (!PARAGRAPH_VOICES.has(block.voice)) addError('E_DETAILS_VOICE', path + '.voice', 'Укажите voice: retelling или review');
                hasRetelling = hasRetelling || block.voice === 'retelling';
                hasReview = hasReview || block.voice === 'review';
                if (block.voice === 'review') {
                    reviewBlockCount += 1;
                    reviewWordCount += countWords(getBlockText(block));
                }
                if (countWords(block.text) > 180) addWarning('W_DETAILS_LONG', path + '.text', 'Раскрываемая часть длиннее 180 слов');
                proseTexts.push(block.text);
            } else {
                consecutiveParagraphs = 0;
            }
            if (block?.type === 'quote') {
                quoteCount += 1;
                if (!String(block.attribution || '').trim()) addError('E_QUOTE_ATTRIBUTION', path + '.attribution', 'Цитате нужна атрибуция');
                if (!Array.isArray(block.sourceIds) || !block.sourceIds.length) addError('E_QUOTE_SOURCE', path + '.sourceIds', 'Цитате нужен sourceIds');
                if (countWords(block.text) > 25) addError('E_QUOTE_LENGTH', path + '.text', 'Цитата не должна превышать 25 слов');
            }
            if (block?.type === 'example' && block.origin !== 'reviewer') addError('E_EXAMPLE_ORIGIN', path + '.origin', 'Авторский пример должен иметь origin: reviewer');
            if (block?.type === 'callout') {
                calloutCount += 1;
                if (!CALLOUT_TONES.has(block.tone)) addError('E_CALLOUT_TONE', path + '.tone', 'Неизвестный tone: ' + block.tone);
            }
            if (block?.requiresSource && (!Array.isArray(block.sourceIds) || !block.sourceIds.length)) addError('E_FACT_SOURCE', path + '.sourceIds', 'Проверяемому факту нужен sourceIds');
            (block?.sourceIds || []).forEach((sourceId, sourceIndex) => {
                if (!sourceIds.has(sourceId)) addError('E_SOURCE_REF', path + '.sourceIds[' + sourceIndex + ']', 'Неизвестный источник: ' + sourceId);
            });
        });

        if (quickSummaryIndexes.length !== 1) addPublicationIssue('E_QUICK_SUMMARY_REQUIRED', 'W_QUICK_SUMMARY_REQUIRED_DRAFT', 'blocks', 'Саммари должно содержать ровно один блок quick-summary, сейчас: ' + quickSummaryIndexes.length);
        if (applicabilityIndexes.length !== 1) addPublicationIssue('E_APPLICABILITY_REQUIRED', 'W_APPLICABILITY_REQUIRED_DRAFT', 'blocks', 'Саммари должно содержать ровно один блок applicability, сейчас: ' + applicabilityIndexes.length);

        REQUIRED_SECTION_ROLES.forEach((role) => {
            const matches = headingRoles.filter((item) => item === role).length;
            if (matches !== 1) addError('E_REQUIRED_SECTION', 'blocks', 'Раздел ' + role + ' должен встречаться ровно один раз');
        });
        const applicationIndex = headingRoles.indexOf('application');
        const critiqueIndex = headingRoles.indexOf('critique');
        if (applicationIndex < 0) addError('E_APPLICATION_MISSING', 'blocks', 'Нужен хотя бы один раздел application');
        if (applicationIndex >= 0 && critiqueIndex >= 0 && applicationIndex > critiqueIndex) addError('E_SECTION_ORDER', 'blocks', 'Практическое применение должно идти до критики');
        let previousRoleIndex = -1;
        REQUIRED_SECTION_ROLES.forEach((role) => {
            const roleIndex = headingRoles.indexOf(role);
            if (roleIndex >= 0 && roleIndex < previousRoleIndex) addError('E_SECTION_ORDER', 'blocks', 'Нарушен порядок обязательных разделов');
            if (roleIndex >= 0) previousRoleIndex = roleIndex;
        });
        if (!hasRetelling) addError('E_RETELLING_MISSING', 'blocks', 'Нужен хотя бы один paragraph с voice: retelling');
        if (!hasReview) addError('E_REVIEW_MISSING', 'blocks', 'Нужен хотя бы один paragraph с voice: review');
        const critiqueHeadingIndex = (book?.blocks || []).findIndex((block) => block.type === 'heading' && block.sectionRole === 'critique');
        const critiqueEndIndex = critiqueHeadingIndex < 0
            ? -1
            : (book?.blocks || []).findIndex((block, index) => index > critiqueHeadingIndex && block.type === 'heading');
        const critiqueBlocks = critiqueHeadingIndex < 0
            ? []
            : (book?.blocks || []).slice(critiqueHeadingIndex + 1, critiqueEndIndex < 0 ? undefined : critiqueEndIndex);
        const hasVisibleCritiqueReview = critiqueBlocks.some((block) => block.type === 'paragraph' && block.voice === 'review');
        const audienceHeadingIndex = (book?.blocks || []).findIndex((block) => block.type === 'heading' && block.sectionRole === 'audience');
        const audienceEndIndex = audienceHeadingIndex < 0
            ? -1
            : (book?.blocks || []).findIndex((block, index) => index > audienceHeadingIndex && block.type === 'heading');
        const audienceBlocks = audienceHeadingIndex < 0
            ? []
            : (book?.blocks || []).slice(audienceHeadingIndex + 1, audienceEndIndex < 0 ? undefined : audienceEndIndex);
        const hasAudienceGuidance = audienceBlocks.some((block) => block.type === 'paragraph' && block.voice === 'review');
        const originalHeadingIndex = (book?.blocks || []).findIndex((block) => block.type === 'heading' && block.sectionRole === 'original-verdict');
        const originalBlocks = originalHeadingIndex < 0 ? [] : (book?.blocks || []).slice(originalHeadingIndex + 1);
        const originalVerdictText = originalBlocks.filter((block) => block.type === 'verdict').map(getBlockText).join(' ');
        if (isPublished && reviewBlockCount < REVIEW_BLOCKS_MIN) addError('E_REVIEW_DEPTH', 'blocks', 'Собственное ревью должно быть встроено минимум в ' + REVIEW_BLOCKS_MIN + ' смысловых блока, сейчас: ' + reviewBlockCount);
        if (!isPublished && reviewBlockCount < REVIEW_BLOCKS_MIN) addWarning('W_REVIEW_DEPTH_DRAFT', 'blocks', 'До публикации нужно минимум ' + REVIEW_BLOCKS_MIN + ' смысловых блока собственного ревью, сейчас: ' + reviewBlockCount);
        if (isPublished && reviewWordCount < REVIEW_WORDS_MIN) addError('E_REVIEW_VOLUME', 'blocks', 'Собственное ревью должно содержать минимум ' + REVIEW_WORDS_MIN + ' слов, сейчас: ' + reviewWordCount);
        if (!isPublished && reviewWordCount < REVIEW_WORDS_MIN) addWarning('W_REVIEW_VOLUME_DRAFT', 'blocks', 'До публикации нужно минимум ' + REVIEW_WORDS_MIN + ' слов собственного ревью, сейчас: ' + reviewWordCount);
        if (critiqueHeadingIndex >= 0 && !hasVisibleCritiqueReview) addError('E_CRITIQUE_REVIEW', 'blocks[' + critiqueHeadingIndex + ']', 'Раздел critique должен содержать открытый paragraph с voice: review');
        if (audienceHeadingIndex >= 0 && !hasAudienceGuidance) addPublicationIssue('E_AUDIENCE_GUIDANCE', 'W_AUDIENCE_GUIDANCE_DRAFT', 'blocks[' + audienceHeadingIndex + ']', 'Раздел audience должен содержать открытый paragraph с voice: review');
        if (originalHeadingIndex >= 0 && (!originalVerdictText || !/оригинал/i.test(originalVerdictText) || !/(стоит|достаточно|нужен|нужна|читать)/i.test(originalVerdictText))) {
            addPublicationIssue('E_ORIGINAL_VERDICT', 'W_ORIGINAL_VERDICT_DRAFT', 'blocks[' + originalHeadingIndex + ']', 'Финальный verdict должен прямо отвечать, стоит ли читать оригинал');
        }
        duplicateValues(headingTexts).forEach((heading) => addWarning('W_HEADING_DUPLICATE', 'blocks', 'Повторяется заголовок: ' + heading));
        headingTexts.forEach((heading, index) => {
            const normalized = normalizeReadingText(heading);
            if (headingTexts.some((candidate, candidateIndex) => {
                if (candidateIndex >= index) return false;
                const previous = normalizeReadingText(candidate);
                return normalized !== previous && Math.min(normalized.length, previous.length) >= 8 && (normalized.includes(previous) || previous.includes(normalized));
            })) addWarning('W_HEADING_SIMILAR', 'blocks', 'Заголовки слишком похожи: ' + heading);
        });
        duplicateValues(proseTexts).forEach(() => addWarning('W_THESIS_REPEAT', 'blocks', 'Один и тот же абзац повторяется в нескольких разделах'));
        quickSummaryItems.forEach((item) => {
            const normalized = normalizeReadingText(item);
            if (proseTexts.some((text) => normalizeReadingText(text) === normalized)) addWarning('W_QUICK_SUMMARY_DUPLICATE', 'blocks', 'Тезис быстрого слоя дословно повторён в полном тексте');
        });
        if (quoteCount > 3 || quoteCount > Math.max(2, Math.floor((book?.blocks?.length || 0) * 0.12))) addWarning('W_QUOTE_DENSITY', 'blocks', 'В саммари слишком много цитат');
        if (calloutCount > Math.max(3, Math.floor((book?.blocks?.length || 0) * 0.3))) addWarning('W_CALLOUT_DENSITY', 'blocks', 'Слишком большая доля текста оформлена callout-блоками');

        const sectionWordCounts = [];
        let currentSection = null;
        (book?.blocks || []).forEach((block, index) => {
            if (block.type === 'heading') {
                currentSection = { index, role: block.sectionRole, words: 0, details: 0, openRun: 0, maxOpenRun: 0, firstContentType: '' };
                sectionWordCounts.push(currentSection);
            } else if (currentSection) {
                currentSection.words += countWords(getBlockText(block));
                if (!currentSection.firstContentType) currentSection.firstContentType = block.type;
                if (block.type === 'details') {
                    currentSection.details += 1;
                    currentSection.openRun = 0;
                } else {
                    currentSection.openRun += 1;
                    currentSection.maxOpenRun = Math.max(currentSection.maxOpenRun, currentSection.openRun);
                }
            }
        });
        const sectionWordsTotal = sectionWordCounts.reduce((sum, section) => sum + section.words, 0);
        sectionWordCounts.forEach((section) => {
            if (section.words > 500 && section.words > sectionWordsTotal * 0.45) addWarning('W_SECTION_LONG', 'blocks[' + section.index + ']', 'Раздел занимает непропорционально большую часть саммари');
            if (section.firstContentType === 'details') addPublicationIssue('E_SECTION_OPENING', 'W_SECTION_OPENING_DRAFT', 'blocks[' + section.index + ']', 'Раздел должен начинаться с открытого тезиса до аккордеона');
            if (section.words >= LONG_SECTION_WORDS_MIN && !['audience', 'original-verdict'].includes(section.role) && section.details === 0) {
                addPublicationIssue('E_SECTION_DISCLOSURE', 'W_SECTION_DISCLOSURE_DRAFT', 'blocks[' + section.index + ']', 'В длинном разделе нужен хотя бы один details-блок для вторичного контекста');
            }
            if (section.words >= LONG_SECTION_WORDS_MIN && section.maxOpenRun > OPEN_BLOCKS_RUN_MAX) {
                addPublicationIssue('E_DISCLOSURE_RHYTHM', 'W_DISCLOSURE_RHYTHM_DRAFT', 'blocks[' + section.index + ']', 'Более ' + OPEN_BLOCKS_RUN_MAX + ' открытых блоков подряд нарушают переход от общего к частному');
            }
        });

        const highlightStats = getBookHighlightStats(book);
        if (highlightStats.eligibleFields > 0 && highlightStats.markedFields > 0) {
            if (highlightStats.coveragePercent > HIGHLIGHT_COVERAGE_ERROR_MAX) {
                addError('E_HIGHLIGHT_DENSITY', 'blocks', 'Маркер покрывает ' + highlightStats.coveragePercent + '% eligible-текста; максимум — ' + HIGHLIGHT_COVERAGE_ERROR_MAX + '%');
            } else if (highlightStats.coveragePercent < HIGHLIGHT_COVERAGE_WARN_MIN || highlightStats.coveragePercent > HIGHLIGHT_COVERAGE_WARN_MAX) {
                addWarning('W_HIGHLIGHT_DENSITY', 'blocks', 'Ориентир покрытия маркером — ' + HIGHLIGHT_COVERAGE_WARN_MIN + '–' + HIGHLIGHT_COVERAGE_WARN_MAX + '%, сейчас: ' + highlightStats.coveragePercent + '%');
            }
        }
        const words = getBookWordCount(book);
        if (depthProfile && (words < depthProfile.minWords || words > depthProfile.maxWords)) {
            const expected = depthProfile.minWords + '–' + depthProfile.maxWords;
            if (isPublished) addError('E_WORD_COUNT', 'blocks', 'Профиль ' + book.depthProfile + ' требует объём ' + expected + ' слов, сейчас: ' + words);
            else addWarning('W_WORD_COUNT_DRAFT', 'blocks', 'До публикации профиль ' + book.depthProfile + ' требует объём ' + expected + ' слов, сейчас: ' + words);
        }
        if (countWords(book?.verdict) < 10) addWarning('W_VERDICT_SHORT', 'verdict', 'Вердикт слишком короткий');
        if (!/(читать|полез|стоит|взять|примен|огранич)/i.test(String(book?.verdict || ''))) addWarning('W_VERDICT_ABSTRACT', 'verdict', 'Вердикт не даёт достаточно конкретной оценки');
        if (countWords(book?.practicalValue) < 6) addWarning('W_PRACTICAL_SHORT', 'practicalValue', 'Практическая ценность сформулирована слишком кратко');
        if (!/(журнал|поиск|правил|вести|запис|провер|сравн|использ|созда|определ|обсуж)/i.test(String(book?.practicalValue || ''))) addWarning('W_PRACTICAL_ABSTRACT', 'practicalValue', 'Практическая ценность не содержит понятного действия');

        if (Array.isArray(catalog) && catalog.filter((item) => item?.id === book?.id).length > 1) addError('E_BOOK_ID_DUPLICATE', 'id', 'Повторяющийся id книги: ' + book?.id);
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            wordCount: words,
            depthProfile: book?.depthProfile || null,
            wordCountMin: depthProfile?.minWords ?? null,
            wordCountMax: depthProfile?.maxWords ?? null,
            quickSummaryWordCount,
            applicabilityWordCount,
            reviewBlockCount,
            reviewWordCount,
            highlightStats,
        };
    }

    function lintBookSummary(book) {
        return validateBookSummary(book, [book]).warnings;
    }

    function validateReadingCatalog(books) {
        const catalog = Array.isArray(books) ? books : [];
        const results = catalog.map((book) => ({ book, result: validateBookSummary(book, catalog) }));
        return {
            valid: results.every((entry) => entry.result.valid),
            errors: results.flatMap((entry) => entry.result.errors),
            warnings: results.flatMap((entry) => entry.result.warnings),
            results,
        };
    }

    function validatePersonalizationOverlay(overlay, books = getPublishedBooks()) {
        const errors = [];
        const addError = (code, path, message) => errors.push(personalizationIssue(overlay, code, path, message));
        const catalog = Array.isArray(books) ? books : [];
        const publishedIds = new Set(catalog.map((book) => book?.id).filter(Boolean));
        const overlayBooks = overlay?.books && typeof overlay.books === 'object' && !Array.isArray(overlay.books)
            ? overlay.books
            : null;

        if (overlay?.schemaVersion !== PERSONALIZATION_SCHEMA_VERSION) addError('E_PERSONALIZATION_SCHEMA', 'schemaVersion', 'Ожидается schemaVersion ' + PERSONALIZATION_SCHEMA_VERSION);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(overlay?.profileId || ''))) addError('E_PERSONALIZATION_PROFILE', 'profileId', 'profileId должен быть в kebab-case');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(overlay?.clientId || ''))) addError('E_PERSONALIZATION_CLIENT', 'clientId', 'Нужен корректный clientId');
        if (!String(overlay?.label || '').trim()) addError('E_PERSONALIZATION_LABEL', 'label', 'Нужна нейтральная подпись персонального слоя');
        if (!overlayBooks) addError('E_PERSONALIZATION_BOOKS', 'books', 'Нужен объект books');

        if (overlayBooks) {
            Object.entries(overlayBooks).forEach(([bookId, entry]) => {
                const path = 'books.' + bookId;
                if (!publishedIds.has(bookId)) addError('E_PERSONALIZATION_BOOK_UNKNOWN', path, 'Персональный слой ссылается на неизвестную опубликованную книгу');
                if (!String(entry?.summary || '').trim() || countWords(entry?.summary) < 18) addError('E_PERSONALIZATION_SUMMARY', path + '.summary', 'Краткая применимость должна содержать минимум 18 слов');
                if (!Array.isArray(entry?.projects) || entry.projects.length < 1 || entry.projects.length > PERSONALIZATION_PROJECT_IDS.length) {
                    addError('E_PERSONALIZATION_PROJECTS', path + '.projects', 'Нужен один или два проекта с содержательной связью');
                    return;
                }
                const projectIds = entry.projects.map((project) => project?.id);
                duplicateValues(projectIds).forEach((projectId) => addError('E_PERSONALIZATION_PROJECT_DUPLICATE', path + '.projects', 'Проект повторяется: ' + projectId));
                entry.projects.forEach((project, index) => {
                    const projectPath = path + '.projects[' + index + ']';
                    if (!PERSONALIZATION_PROJECT_IDS.includes(project?.id)) addError('E_PERSONALIZATION_PROJECT_UNKNOWN', projectPath + '.id', 'Допустимы только kinderly и heys');
                    if (!String(project?.title || '').trim()) addError('E_PERSONALIZATION_PROJECT_TITLE', projectPath + '.title', 'Нужно название проекта');
                    if (!String(project?.relevance || '').trim() || countWords(project?.relevance) < 20) addError('E_PERSONALIZATION_RELEVANCE', projectPath + '.relevance', 'Связь с проектом должна содержать минимум 20 слов');
                    const questions = Array.isArray(project?.questions) ? project.questions : [];
                    const hasWeakQuestion = questions.some((question) => {
                        const value = String(question || '').trim();
                        const normalized = normalizeReadingText(value.replace(/\?+$/, ''));
                        return !value.endsWith('?') || countWords(value) < 6 || GENERIC_PERSONALIZATION_QUESTIONS.has(normalized);
                    });
                    if (questions.length < 1 || questions.length > 8 || hasWeakQuestion) {
                        addError('E_PERSONALIZATION_QUESTIONS', projectPath + '.questions', 'Нужно от одного до восьми содержательных открытых вопросов, связанных с идеями книги');
                    }
                    if (!String(project?.caution || '').trim() || countWords(project?.caution) < 12) addError('E_PERSONALIZATION_CAUTION', projectPath + '.caution', 'Нужно существенное ограничение минимум из 12 слов');
                    [project?.title, project?.relevance, project?.caution, ...(project?.questions || [])].filter(Boolean).forEach((value) => {
                        if (hasRawMarkup(value)) addError('E_PERSONALIZATION_MARKUP', projectPath, 'HTML и Markdown-ссылки в персональном слое запрещены');
                        if (hasPublishedPlaceholder(value)) addError('E_PERSONALIZATION_PLACEHOLDER', projectPath, 'В персональном слое остался маркер заполнения');
                    });
                });
                if (hasRawMarkup(entry?.summary)) addError('E_PERSONALIZATION_MARKUP', path + '.summary', 'HTML и Markdown-ссылки в персональном слое запрещены');
                if (hasPublishedPlaceholder(entry?.summary)) addError('E_PERSONALIZATION_PLACEHOLDER', path + '.summary', 'В персональном слое остался маркер заполнения');
            });
        }

        return { valid: errors.length === 0, errors, bookCount: overlayBooks ? Object.keys(overlayBooks).length : 0 };
    }

    function getPersonalizedBookOverlay(overlay, bookId, books = getPublishedBooks()) {
        const result = validatePersonalizationOverlay(overlay, books);
        if (!result.valid) return null;
        return overlay.books?.[bookId] || null;
    }

    function assertPublishedCatalog(books = getPublishedBooks()) {
        const result = validateReadingCatalog(books);
        if (!result.valid) {
            const details = result.errors.map((entry) => entry.code + ' ' + entry.path + ': ' + entry.message).join('\n');
            throw new Error('Reading catalog validation failed\n' + details);
        }
        return result;
    }

    function cloneBook(book) {
        if (typeof structuredClone === 'function') return structuredClone(book);
        return JSON.parse(JSON.stringify(book));
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.freeze(value);
        Object.values(value).forEach(deepFreeze);
        return value;
    }

    function registerBook(input) {
        const book = deepFreeze(cloneBook(input));
        const existing = BOOKS.concat(DRAFTS).map((item) => item.book);
        const result = validateBookSummary(book, existing.concat(book));
        const attempt = { book, result };
        ATTEMPTS.push(attempt);
        if (!result.valid) {
            if (typeof console !== 'undefined' && console.error) console.error('[HEYS.Reading] Книга не зарегистрирована:', book.id, result.errors);
            return { registered: false, ...result };
        }
        const target = book.status === 'published' ? BOOKS : DRAFTS;
        target.push({ book, result });
        return { registered: true, ...result };
    }

    function getPublishedBooks() {
        return BOOKS.map((entry) => entry.book);
    }

    function getDraftBooks() {
        return DRAFTS.map((entry) => entry.book);
    }

    function getBookById(id, books) {
        const source = Array.isArray(books) ? books : getPublishedBooks();
        return source.find((book) => book.id === id) || null;
    }

    function getCatalogDiagnostics() {
        return {
            published: getPublishedBooks(),
            drafts: getDraftBooks(),
            attempts: ATTEMPTS.slice(),
            errors: ATTEMPTS.flatMap((entry) => entry.result.errors),
            warnings: ATTEMPTS.flatMap((entry) => entry.result.warnings),
        };
    }

    Object.assign(Reading, {
        SCHEMA_VERSION,
        PERSONALIZATION_SCHEMA_VERSION,
        PERSONALIZATION_PROJECT_IDS: PERSONALIZATION_PROJECT_IDS.slice(),
        WORDS_PER_MINUTE,
        DEPTH_PROFILES,
        REVIEW_BLOCKS_MIN,
        REVIEW_WORDS_MIN,
        QUICK_SUMMARY_ITEMS_MIN,
        QUICK_SUMMARY_ITEMS_MAX,
        QUICK_SUMMARY_WORDS_MIN,
        QUICK_SUMMARY_WORDS_MAX,
        APPLICABILITY_WORDS_MIN,
        APPLICABILITY_FIELD_WORDS_MIN,
        LONG_SECTION_WORDS_MIN,
        OPEN_BLOCKS_RUN_MAX,
        HIGHLIGHT_COVERAGE_WARN_MIN,
        HIGHLIGHT_COVERAGE_WARN_MAX,
        HIGHLIGHT_COVERAGE_ERROR_MAX,
        TOPICS,
        TAGS,
        COVER_TONES,
        EDITORIAL_ROLES,
        REQUIRED_SECTION_ROLES: REQUIRED_SECTION_ROLES.slice(),
        ALLOWED_BLOCK_TYPES: Array.from(BLOCK_TYPES),
        registerBook,
        getPublishedBooks,
        getDraftBooks,
        getCatalogDiagnostics,
        validateBookSummary,
        validateReadingCatalog,
        validatePersonalizationOverlay,
        getPersonalizedBookOverlay,
        assertPublishedCatalog,
        lintBookSummary,
        normalizeReadingText,
        getBookSearchText,
        getBookSearchExcerpt,
        filterBooks,
        sortBooks,
        formatBookCount,
        getBookWordCount,
        getBookHighlightStats,
        getHighlightTargets,
        estimateReadingMinutes,
        getBookById,
        getTopicLabel,
        getTagLabel,
        getEditorialRole,
    });

    Object.defineProperty(Reading, 'BOOKS', { configurable: true, enumerable: true, get: getPublishedBooks });
})();
