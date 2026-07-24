(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const Reading = HEYS.Reading = HEYS.Reading || {};

    const SCHEMA_VERSION = 1;
    const WORDS_PER_MINUTE = 180;
    const PUBLISHED_WORDS_MIN = 1800;
    const PUBLISHED_WORDS_MAX = 2200;
    const REVIEW_BLOCKS_MIN = 3;
    const REVIEW_WORDS_MIN = 180;
    const STATUSES = new Set(['draft', 'published']);
    const BLOCK_TYPES = new Set(['lead', 'heading', 'paragraph', 'details', 'quote', 'example', 'callout', 'list', 'verdict']);
    const CALLOUT_TONES = new Set(['insight', 'practice', 'caution']);
    const PARAGRAPH_VOICES = new Set(['retelling', 'review']);
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

    function countWords(value) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
    }

    function getBlockText(block) {
        return [block?.text, block?.title, block?.summary, block?.attribution, ...(Array.isArray(block?.items) ? block.items : [])]
            .filter(Boolean)
            .join(' ');
    }

    function getBookWordCount(book) {
        return (book?.blocks || []).reduce((total, block) => total + countWords(getBlockText(block)), 0);
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

    function getBookSearchText(book) {
        return normalizeReadingText([
            book?.title,
            book?.author,
            book?.verdict,
            book?.practicalValue,
            ...(book?.topics || []).flatMap((id) => [id, getTopicLabel(id)]),
            ...(book?.tags || []).flatMap((id) => [id, getTagLabel(id)]),
            ...(book?.blocks || []).map(getBlockText),
        ].filter(Boolean).join(' '));
    }

    function filterBooks(books, filters = {}) {
        const queryTokens = normalizeReadingText(filters.query).split(/\s+/).filter(Boolean);
        const topic = filters.topic || 'all';
        const tags = Array.isArray(filters.tags) ? filters.tags : [];
        return (Array.isArray(books) ? books : []).filter((book) => {
            if (topic !== 'all' && topic !== 'Все' && !(book.topics || []).includes(topic)) return false;
            if (tags.some((tag) => !(book.tags || []).includes(tag))) return false;
            const searchText = getBookSearchText(book);
            return queryTokens.every((token) => searchText.includes(token));
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

        if (book?.schemaVersion !== SCHEMA_VERSION) addError('E_SCHEMA_VERSION', 'schemaVersion', 'Ожидается schemaVersion ' + SCHEMA_VERSION);
        if (!STATUSES.has(book?.status)) addError('E_STATUS', 'status', 'Допустимы только draft и published');
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

        const blockIds = new Set();
        const headingRoles = [];
        let hasRetelling = false;
        let hasReview = false;
        let reviewBlockCount = 0;
        let reviewWordCount = 0;
        let consecutiveParagraphs = 0;
        let calloutCount = 0;
        let quoteCount = 0;
        const headingTexts = [];
        const proseTexts = [];
        (book?.blocks || []).forEach((block, index) => {
            const path = 'blocks[' + index + ']';
            if (!String(block?.id || '').trim()) addError('E_BLOCK_ID', path + '.id', 'Блок должен иметь стабильный id');
            if (blockIds.has(block?.id)) addError('E_BLOCK_ID_DUPLICATE', path + '.id', 'Повторяющийся block id: ' + block?.id);
            blockIds.add(block?.id);
            if (!BLOCK_TYPES.has(block?.type)) addError('E_BLOCK_TYPE', path + '.type', 'Неизвестный тип блока: ' + block?.type);

            const textValues = [block?.text, block?.title, block?.summary, block?.attribution, ...(Array.isArray(block?.items) ? block.items : [])];
            textValues.filter(Boolean).forEach((value) => {
                if (hasRawMarkup(value)) addError('E_RAW_MARKUP', path, 'HTML и Markdown-ссылки в контенте запрещены');
                if (isPublished && hasPublishedPlaceholder(value)) addError('E_PLACEHOLDER', path, 'В опубликованной книге остался маркер заполнения');
            });

            if (block?.type === 'list') {
                if (!Array.isArray(block.items) || !block.items.length || block.items.some((item) => !String(item || '').trim())) addError('E_LIST_EMPTY', path + '.items', 'Список должен содержать непустые элементы');
                if (typeof block.ordered !== 'boolean') addError('E_LIST_ORDERED', path + '.ordered', 'ordered должен быть boolean');
            } else if (!String(block?.text || '').trim()) {
                addError('E_BLOCK_TEXT', path + '.text', 'Текст блока не заполнен');
            }

            if (block?.type === 'heading') {
                headingTexts.push(block.text);
                headingRoles.push(block.sectionRole);
                if (!SECTION_ROLES.has(block.sectionRole)) addError('E_SECTION_ROLE', path + '.sectionRole', 'Неизвестная роль раздела: ' + block.sectionRole);
            }
            if (block?.type === 'paragraph') {
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
        if (isPublished && reviewBlockCount < REVIEW_BLOCKS_MIN) addError('E_REVIEW_DEPTH', 'blocks', 'Собственное ревью должно быть встроено минимум в ' + REVIEW_BLOCKS_MIN + ' смысловых блока, сейчас: ' + reviewBlockCount);
        if (!isPublished && reviewBlockCount < REVIEW_BLOCKS_MIN) addWarning('W_REVIEW_DEPTH_DRAFT', 'blocks', 'До публикации нужно минимум ' + REVIEW_BLOCKS_MIN + ' смысловых блока собственного ревью, сейчас: ' + reviewBlockCount);
        if (isPublished && reviewWordCount < REVIEW_WORDS_MIN) addError('E_REVIEW_VOLUME', 'blocks', 'Собственное ревью должно содержать минимум ' + REVIEW_WORDS_MIN + ' слов, сейчас: ' + reviewWordCount);
        if (!isPublished && reviewWordCount < REVIEW_WORDS_MIN) addWarning('W_REVIEW_VOLUME_DRAFT', 'blocks', 'До публикации нужно минимум ' + REVIEW_WORDS_MIN + ' слов собственного ревью, сейчас: ' + reviewWordCount);
        if (critiqueHeadingIndex >= 0 && !hasVisibleCritiqueReview) addError('E_CRITIQUE_REVIEW', 'blocks[' + critiqueHeadingIndex + ']', 'Раздел critique должен содержать открытый paragraph с voice: review');
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
        if (quoteCount > 3 || quoteCount > Math.max(2, Math.floor((book?.blocks?.length || 0) * 0.12))) addWarning('W_QUOTE_DENSITY', 'blocks', 'В саммари слишком много цитат');
        if (calloutCount > Math.max(3, Math.floor((book?.blocks?.length || 0) * 0.3))) addWarning('W_CALLOUT_DENSITY', 'blocks', 'Слишком большая доля текста оформлена callout-блоками');

        const sectionWordCounts = [];
        let currentSection = null;
        (book?.blocks || []).forEach((block, index) => {
            if (block.type === 'heading') {
                currentSection = { index, words: 0 };
                sectionWordCounts.push(currentSection);
            } else if (currentSection) currentSection.words += countWords(getBlockText(block));
        });
        const sectionWordsTotal = sectionWordCounts.reduce((sum, section) => sum + section.words, 0);
        sectionWordCounts.forEach((section) => {
            if (section.words > 500 && section.words > sectionWordsTotal * 0.45) addWarning('W_SECTION_LONG', 'blocks[' + section.index + ']', 'Раздел занимает непропорционально большую часть саммари');
        });

        const words = getBookWordCount(book);
        if (isPublished && (words < PUBLISHED_WORDS_MIN || words > PUBLISHED_WORDS_MAX)) addError('E_WORD_COUNT', 'blocks', 'Опубликованное саммари должно содержать 1800–2200 слов, сейчас: ' + words);
        if (!isPublished && (words < PUBLISHED_WORDS_MIN || words > PUBLISHED_WORDS_MAX)) addWarning('W_WORD_COUNT_DRAFT', 'blocks', 'До публикации нужен объём 1800–2200 слов, сейчас: ' + words);
        if (countWords(book?.verdict) < 10) addWarning('W_VERDICT_SHORT', 'verdict', 'Вердикт слишком короткий');
        if (!/(читать|полез|стоит|взять|примен|огранич)/i.test(String(book?.verdict || ''))) addWarning('W_VERDICT_ABSTRACT', 'verdict', 'Вердикт не даёт достаточно конкретной оценки');
        if (countWords(book?.practicalValue) < 6) addWarning('W_PRACTICAL_SHORT', 'practicalValue', 'Практическая ценность сформулирована слишком кратко');
        if (!/(журнал|поиск|правил|вести|запис|провер|сравн|использ|созда|определ|обсуж)/i.test(String(book?.practicalValue || ''))) addWarning('W_PRACTICAL_ABSTRACT', 'practicalValue', 'Практическая ценность не содержит понятного действия');

        if (Array.isArray(catalog) && catalog.filter((item) => item?.id === book?.id).length > 1) addError('E_BOOK_ID_DUPLICATE', 'id', 'Повторяющийся id книги: ' + book?.id);
        return { valid: errors.length === 0, errors, warnings, wordCount: words };
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
        WORDS_PER_MINUTE,
        PUBLISHED_WORDS_MIN,
        PUBLISHED_WORDS_MAX,
        REVIEW_BLOCKS_MIN,
        REVIEW_WORDS_MIN,
        TOPICS,
        TAGS,
        COVER_TONES,
        REQUIRED_SECTION_ROLES: REQUIRED_SECTION_ROLES.slice(),
        ALLOWED_BLOCK_TYPES: Array.from(BLOCK_TYPES),
        registerBook,
        getPublishedBooks,
        getDraftBooks,
        getCatalogDiagnostics,
        validateBookSummary,
        validateReadingCatalog,
        assertPublishedCatalog,
        lintBookSummary,
        normalizeReadingText,
        getBookSearchText,
        getBookSearchExcerpt,
        filterBooks,
        sortBooks,
        formatBookCount,
        getBookWordCount,
        estimateReadingMinutes,
        getBookById,
        getTopicLabel,
        getTagLabel,
    });

    Object.defineProperty(Reading, 'BOOKS', { configurable: true, enumerable: true, get: getPublishedBooks });
})();
