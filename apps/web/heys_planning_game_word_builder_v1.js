// heys_planning_game_word_builder_v1.js — lazy Word Builder game for Planning

(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const PlanningGames = HEYS.PlanningGames = HEYS.PlanningGames || {};
    PlanningGames.modules = PlanningGames.modules || {};

    function makeWord(id, parts, distractorText) {
        const correctSyllables = parts.map((text, index) => Object.freeze({
            id: `${id}-${index + 1}`,
            text,
        }));

        return Object.freeze({
            id,
            answer: parts.join(''),
            correctSyllables: Object.freeze(correctSyllables),
            distractor: Object.freeze({ id: `${id}-x`, text: distractorText }),
        });
    }

    const WORD_BANK = Object.freeze([
        makeWord('mama', ['МА', 'МА'], 'ЛУ'),
        makeWord('papa', ['ПА', 'ПА'], 'РО'),
        makeWord('luna', ['ЛУ', 'НА'], 'КИ'),
        makeWord('ryba', ['РЫ', 'БА'], 'СО'),
        makeWord('vaza', ['ВА', 'ЗА'], 'МУ'),
        makeWord('roza', ['РО', 'ЗА'], 'КЕ'),
        makeWord('lisa', ['ЛИ', 'СА'], 'ВО'),
        makeWord('sova', ['СО', 'ВА'], 'РУ'),
        makeWord('koza', ['КО', 'ЗА'], 'ЛЕ'),
        makeWord('noga', ['НО', 'ГА'], 'СЫ'),
        makeWord('ruka', ['РУ', 'КА'], 'МО'),
        makeWord('zima', ['ЗИ', 'МА'], 'ПО'),
        makeWord('leto', ['ЛЕ', 'ТО'], 'КУ'),
        makeWord('more', ['МО', 'РЕ'], 'ТА'),
        makeWord('pole', ['ПО', 'ЛЕ'], 'ЖУ'),
        makeWord('kasha', ['КА', 'ША'], 'НИ'),
        makeWord('dynya', ['ДЫ', 'НЯ'], 'ЛО'),
        makeWord('mukha', ['МУ', 'ХА'], 'СЕ'),
        makeWord('raketa', ['РА', 'КЕ', 'ТА'], 'МУ'),
        makeWord('mashina', ['МА', 'ШИ', 'НА'], 'КО'),
        makeWord('koleso', ['КО', 'ЛЕ', 'СО'], 'ЖА'),
        makeWord('soroka', ['СО', 'РО', 'КА'], 'МЕ'),
        makeWord('vorona', ['ВО', 'РО', 'НА'], 'СУ'),
        makeWord('moloko', ['МО', 'ЛО', 'КО'], 'РА'),
        makeWord('doroga', ['ДО', 'РО', 'ГА'], 'СИ'),
        makeWord('beryoza', ['БЕ', 'РЁ', 'ЗА'], 'КУ'),
        makeWord('korova', ['КО', 'РО', 'ВА'], 'ЛИ'),
        makeWord('sobaka', ['СО', 'БА', 'КА'], 'РУ'),
        makeWord('lopata', ['ЛО', 'ПА', 'ТА'], 'МИ'),
        makeWord('pogoda', ['ПО', 'ГО', 'ДА'], 'КЕ'),
        makeWord('kubiki', ['КУ', 'БИ', 'КИ'], 'РО'),
        makeWord('shariki', ['ША', 'РИ', 'КИ'], 'ЛУ'),
        makeWord('sapogi', ['СА', 'ПО', 'ГИ'], 'НЕ'),
        makeWord('panama', ['ПА', 'НА', 'МА'], 'СО'),
        makeWord('pirogi', ['ПИ', 'РО', 'ГИ'], 'ВУ'),
        makeWord('ozero', ['О', 'ЗЕ', 'РО'], 'КА'),
        makeWord('ulitsa', ['У', 'ЛИ', 'ЦА'], 'МО'),
        makeWord('akula', ['А', 'КУ', 'ЛА'], 'СИ'),
        makeWord('bumaga', ['БУ', 'МА', 'ГА'], 'РО'),
    ]);

    function hashSeed(seed) {
        const text = String(seed == null ? 'word-builder-default' : seed);
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function createRng(seed) {
        let state = hashSeed(seed) || 0x6d2b79f5;
        return function nextRandom() {
            state += 0x6d2b79f5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffled(items, random) {
        const result = items.slice();
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            const current = result[index];
            result[index] = result[swapIndex];
            result[swapIndex] = current;
        }
        return result;
    }

    function validateContent(content) {
        const words = Array.isArray(content) ? content : WORD_BANK;
        const errors = [];
        const wordIds = new Set();
        let repeatedTextWordCount = 0;
        let hasYo = false;

        words.forEach((word, wordIndex) => {
            const prefix = `word[${wordIndex}]`;
            if (!word || typeof word !== 'object') {
                errors.push(`${prefix}: invalid word`);
                return;
            }
            if (!word.id || wordIds.has(word.id)) errors.push(`${prefix}: duplicate or missing id`);
            wordIds.add(word.id);

            const syllables = Array.isArray(word.correctSyllables) ? word.correctSyllables : [];
            if (syllables.length < 2 || syllables.length > 3) errors.push(`${prefix}: expected 2–3 syllables`);
            const optionIds = new Set();
            const texts = [];
            syllables.forEach((option) => {
                if (!option?.id || optionIds.has(option.id)) errors.push(`${prefix}: duplicate or missing option id`);
                optionIds.add(option?.id);
                if (!/^[А-ЯЁ]+$/u.test(option?.text || '')) errors.push(`${prefix}: non-Cyrillic syllable`);
                texts.push(option?.text || '');
            });
            if (new Set(texts).size < texts.length) repeatedTextWordCount += 1;
            if (!/^[А-ЯЁ]+$/u.test(word.answer || '')) errors.push(`${prefix}: non-Cyrillic answer`);
            if ((word.answer || '').includes('Ё')) hasYo = true;
            if (word.answer !== texts.join('')) errors.push(`${prefix}: answer mismatch`);

            if (word.distractor) {
                if (!word.distractor.id || optionIds.has(word.distractor.id)) errors.push(`${prefix}: invalid distractor id`);
                if (!/^[А-ЯЁ]+$/u.test(word.distractor.text || '')) errors.push(`${prefix}: non-Cyrillic distractor`);
                if (texts.includes(word.distractor.text)) errors.push(`${prefix}: distractor duplicates a correct syllable`);
            }

            const visibleCount = syllables.length + (word.distractor ? 1 : 0);
            if (visibleCount < 2 || visibleCount > 4) errors.push(`${prefix}: expected 2–4 visible options`);
        });

        return Object.freeze({
            valid: errors.length === 0,
            errors: Object.freeze(errors),
            wordCount: words.length,
            repeatedTextWordCount,
            hasYo,
        });
    }

    function buildRound(word, roundNumber, includeDistractor, random) {
        const correctSyllables = word.correctSyllables.map((option) => ({ ...option }));
        const options = correctSyllables.slice();
        if (includeDistractor && word.distractor) options.push({ ...word.distractor, distractor: true });

        return Object.freeze({
            id: `word-round-${roundNumber}`,
            roundNumber,
            wordId: word.id,
            answer: word.answer,
            correctSyllables: Object.freeze(correctSyllables),
            distractor: includeDistractor && word.distractor ? Object.freeze({ ...word.distractor }) : null,
            options: Object.freeze(shuffled(options, random).map((option) => Object.freeze(option))),
        });
    }

    function createSession(options) {
        const seed = options && Object.prototype.hasOwnProperty.call(options, 'seed')
            ? options.seed
            : 'word-builder-default';
        const random = createRng(seed);
        const twoSyllable = shuffled(WORD_BANK.filter((word) => word.correctSyllables.length === 2), random);
        const threeSyllable = shuffled(WORD_BANK.filter((word) => word.correctSyllables.length === 3), random);
        const chosen = [
            twoSyllable[0],
            twoSyllable[1],
            threeSyllable[0],
            threeSyllable[1],
            twoSyllable[2],
            threeSyllable[2],
        ];
        const rounds = chosen.map((word, index) => buildRound(word, index + 1, index >= 4, random));

        return Object.freeze({
            id: `word-builder-${hashSeed(seed).toString(36)}`,
            seed: String(seed),
            rounds: Object.freeze(rounds),
        });
    }

    function evaluateSelection(round, selectedOptionIds) {
        const selectedIds = Array.isArray(selectedOptionIds) ? selectedOptionIds.slice() : [];
        const expectedCount = Array.isArray(round?.correctSyllables) ? round.correctSyllables.length : 0;
        const optionsById = new Map((round?.options || []).map((option) => [option.id, option]));
        const uniqueIds = new Set(selectedIds);
        const hasUnknownOption = selectedIds.some((id) => !optionsById.has(id));
        const hasDuplicateOption = uniqueIds.size !== selectedIds.length;
        const isComplete = expectedCount > 0 && selectedIds.length >= expectedCount;
        const selectedText = selectedIds.slice(0, expectedCount).map((id) => optionsById.get(id)?.text || '').join('');
        const usesOnlyCorrectOptions = selectedIds.slice(0, expectedCount).every((id) =>
            round.correctSyllables.some((option) => option.id === id));
        const isCorrect = isComplete
            && selectedIds.length === expectedCount
            && !hasUnknownOption
            && !hasDuplicateOption
            && usesOnlyCorrectOptions
            && selectedText === round.answer;

        return Object.freeze({
            isComplete,
            isCorrect,
            status: isCorrect ? 'correct' : (isComplete ? 'incorrect' : 'incomplete'),
            selectedText,
            firstCorrectOptionId: round?.correctSyllables?.[0]?.id || null,
        });
    }

    const React = window.React;
    const h = React && React.createElement;

    function WordBuilderGame({ onExit, reducedMotion, seed } = {}) {
        if (!React || !h) return null;

        const { useEffect, useRef, useState } = React;
        const baseSeedRef = useRef(seed == null ? `${Date.now()}-${Math.random()}` : String(seed));
        const replayRef = useRef(0);
        const mountedRef = useRef(true);
        const resetTimeoutRef = useRef(null);
        const [session, setSession] = useState(() => createSession({ seed: baseSeedRef.current }));
        const [roundIndex, setRoundIndex] = useState(0);
        const [selectedIds, setSelectedIds] = useState([]);
        const [attempts, setAttempts] = useState(0);
        const [feedback, setFeedback] = useState('');

        useEffect(() => {
            mountedRef.current = true;
            return () => {
                mountedRef.current = false;
                if (resetTimeoutRef.current != null) window.clearTimeout(resetTimeoutRef.current);
                resetTimeoutRef.current = null;
            };
        }, []);

        const round = session.rounds[roundIndex];
        const isFinished = roundIndex >= session.rounds.length;
        const firstCorrectId = round?.correctSyllables?.[0]?.id;

        const clearPendingReset = () => {
            if (resetTimeoutRef.current != null) window.clearTimeout(resetTimeoutRef.current);
            resetTimeoutRef.current = null;
        };

        const chooseOption = (optionId) => {
            if (!round || feedback === 'Готово' || selectedIds.includes(optionId)) return;
            const nextSelectedIds = selectedIds.concat(optionId);
            setSelectedIds(nextSelectedIds);
            if (nextSelectedIds.length < round.correctSyllables.length) return;

            const result = evaluateSelection(round, nextSelectedIds);
            if (result.isCorrect) {
                clearPendingReset();
                setAttempts(0);
                setFeedback('Готово');
                return;
            }

            setAttempts((current) => current + 1);
            setFeedback('Попробуй ещё');
            clearPendingReset();
            resetTimeoutRef.current = window.setTimeout(() => {
                if (!mountedRef.current) return;
                setSelectedIds([]);
                setFeedback('');
                resetTimeoutRef.current = null;
            }, 650);
        };

        const goNext = () => {
            clearPendingReset();
            setSelectedIds([]);
            setAttempts(0);
            setFeedback('');
            setRoundIndex((current) => current + 1);
        };

        const startAgain = () => {
            clearPendingReset();
            replayRef.current += 1;
            setSession(createSession({ seed: `${baseSeedRef.current}-replay-${replayRef.current}` }));
            setRoundIndex(0);
            setSelectedIds([]);
            setAttempts(0);
            setFeedback('');
        };

        if (isFinished) {
            return h('section', {
                className: `planning-word-builder${reducedMotion ? ' planning-word-builder--reduced-motion' : ''}`,
                'aria-labelledby': 'planning-word-builder-result-title',
            },
                h('div', { className: 'planning-word-builder__result' },
                    h('span', { className: 'planning-word-builder__result-mark', 'aria-hidden': 'true' }, '✓'),
                    h('p', { className: 'planning-word-builder__eyebrow' }, 'Сессия завершена'),
                    h('h1', { id: 'planning-word-builder-result-title' }, 'Шесть слов собрано'),
                    h('p', null, 'Можно сыграть ещё раз или вернуться к играм.'),
                    h('div', { className: 'planning-word-builder__result-actions' },
                        h('button', { type: 'button', className: 'planning-word-builder__primary', onClick: startAgain }, 'Сыграть ещё'),
                        h('button', { type: 'button', className: 'planning-word-builder__secondary', onClick: onExit }, 'Вернуться к играм'),
                    ),
                ),
            );
        }

        const selectedOptions = selectedIds.map((id) => round.options.find((option) => option.id === id)).filter(Boolean);
        const hintVisible = attempts >= 2 && feedback !== 'Готово';

        return h('section', {
            className: `planning-word-builder${reducedMotion ? ' planning-word-builder--reduced-motion' : ''}`,
            'aria-labelledby': 'planning-word-builder-title',
        },
            h('div', { className: 'planning-word-builder__topline' },
                h('span', null, `Слово ${roundIndex + 1} из ${session.rounds.length}`),
                h('span', { 'aria-hidden': 'true' }, `${String(roundIndex + 1).padStart(2, '0')} / 06`),
            ),
            h('div', { className: 'planning-word-builder__card' },
                h('p', { className: 'planning-word-builder__eyebrow' }, 'Собери слово по слогам'),
                h('h1', { id: 'planning-word-builder-title' }, round.answer),
                h('p', { className: 'planning-word-builder__instruction' }, 'Нажимай на слоги по порядку.'),
                h('div', {
                    className: `planning-word-builder__answer${feedback === 'Готово' ? ' is-correct' : ''}${feedback === 'Попробуй ещё' ? ' is-retry' : ''}`,
                    'aria-label': `Собрано слогов: ${selectedOptions.length} из ${round.correctSyllables.length}`,
                }, Array.from({ length: round.correctSyllables.length }, (_, index) =>
                    h('span', { key: `slot-${index}` }, selectedOptions[index]?.text || ''))),
                h('div', { className: 'planning-word-builder__options', role: 'group', 'aria-label': 'Слоги' },
                    round.options.map((option) => h('button', {
                        key: option.id,
                        type: 'button',
                        className: `planning-word-builder__syllable${hintVisible && option.id === firstCorrectId ? ' is-hint' : ''}`,
                        disabled: selectedIds.includes(option.id) || feedback === 'Готово' || feedback === 'Попробуй ещё',
                        onClick: () => chooseOption(option.id),
                        'aria-label': `Выбрать слог ${option.text}`,
                        'data-option-id': option.id,
                    }, option.text)),
                ),
                h('div', { className: 'planning-word-builder__feedback', 'aria-live': 'polite', 'aria-atomic': 'true' },
                    feedback && h('p', { className: feedback === 'Готово' ? 'is-correct' : 'is-retry' }, feedback),
                    hintVisible && h('p', { className: 'planning-word-builder__hint' },
                        `Подсказка: начни со слога «${round.correctSyllables[0].text}».`),
                ),
                feedback === 'Готово' && h('button', {
                    type: 'button',
                    className: 'planning-word-builder__primary planning-word-builder__next',
                    onClick: goNext,
                }, roundIndex === session.rounds.length - 1 ? 'Посмотреть результат' : 'Дальше'),
            ),
        );
    }

    PlanningGames.modules['word-builder'] = Object.freeze({
        Component: WordBuilderGame,
        api: Object.freeze({
            version: 1,
            validateContent,
            createSession,
            evaluateSelection,
        }),
    });
})();
