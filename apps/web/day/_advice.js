// day/_advice.js — Advice UI + State bundle for DayTab
// Aggregates: AdviceCard, manual list, toast UI, and advice state

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const ADVICE_SWIPE_HORIZONTAL_LOCK_THRESHOLD = 18;
    const ADVICE_SWIPE_VERTICAL_LOCK_THRESHOLD = 10;

    // Курaторская сессия: read-only режим. Auto-toast не показывается,
    // dropdown показывает историю outcomes клиента, outcome-tracking
    // gated на стороне advice/_core.js. Helper duplicated для разделения
    // bundle scope (advice vs day) — оба бандла загружаются отдельно.
    function isCuratorReadOnlyMode() {
        try {
            return !!(HEYS && HEYS.auth && typeof HEYS.auth.isCuratorSession === 'function' && HEYS.auth.isCuratorSession());
        } catch (_) {
            return false;
        }
    }

    function isAdviceStillRelevant(advice, advices) {
        if (!advice?.id || !Array.isArray(advices)) return false;
        return advices.some(item => item?.id === advice.id);
    }

    function hasExpertContent(advice) {
        return !!(
            advice?.confidence ||
            advice?.evidenceSummary ||
            advice?.expertMeta?.whyNow ||
            advice?.expertMeta?.actionNow?.label ||
            advice?.expertMeta?.science ||
            advice?.expertMeta?.uncertainty ||
            advice?.expertMeta?.causal ||
            advice?.expertMeta?.responseMemory
        );
    }

    function getConfidenceNarrative(confidence) {
        if (confidence === 'high') return 'Сигнал уверенный: тут есть несколько независимых подтверждений, поэтому совет стоит считать приоритетным.';
        if (confidence === 'medium') return 'Сигнал хороший: это не жёсткая догма, но направление выглядит достаточно сильным.';
        if (confidence === 'low') return 'Сигнал мягкий: это скорее бережная подсказка, чем срочная команда.';
        return '';
    }

    function humanizeAdviceInsight(text) {
        if (!text || typeof text !== 'string') return text || '';

        const trimmed = text.trim();
        const rules = [
            [/^белок ниже цели (\d+)\/7 дн$/i, (_, days) => `Белок регулярно не дотягивал до цели: это повторялось ${days} дней из последних 7.`],
            [/^клетчатка проседает (\d+)\/7 дн$/i, (_, days) => `Клетчатки было маловато уже ${days} дней из последних 7.`],
            [/^вода ниже цели (\d+)\/7 дн$/i, (_, days) => `С водой есть повторяющийся недобор: ${days} дней из последних 7 цель не набиралась.`],
            [/^поздние приёмы (\d+)\/7 дн$/i, (_, days) => `Поздние приёмы пищи повторялись ${days} дней из последних 7 и уже стали паттерном.`],
            [/^недосып (\d+)\/7 дн$/i, (_, days) => `Недосып повторялся ${days} дней из последних 7, поэтому он уже влияет на аппетит и самоконтроль.`],
            [/^стресс высокий (\d+)\/7 дн$/i, (_, days) => `Высокий стресс держался ${days} дней из последних 7 — это уже заметный фон для тяги к еде и усталости.`],
            [/^энергия ниже цели (\d+)\/7 дн$/i, (_, days) => `Калорий регулярно не хватало: ${days} дней из последних 7 были ниже цели.`],
            [/^нагрузка без восстановления (\d+) дн$/i, (_, days) => `Нагрузка накапливалась без достаточного восстановления уже ${days} дня.`],
            [/^простые углеводы высокие (\d+)\/7 дн$/i, (_, days) => `Простые углеводы были высокими ${days} дней из последних 7, так что это уже не разовый эпизод.`],
            [/^за неделю белок стал хуже относительно прошлой$/i, () => 'По сравнению с прошлой неделей белок просел — это уже не случайность одного дня.'],
            [/^за неделю клетчатка снизилась$/i, () => 'По сравнению с прошлой неделей клетчатки стало меньше.'],
            [/^за неделю вода просела$/i, () => 'По сравнению с прошлой неделей воды стало заметно меньше.'],
            [/^за неделю поздние приёмы участились$/i, () => 'Поздние приёмы стали случаться чаще, чем на прошлой неделе.'],
            [/^за неделю стресс усилился$/i, () => 'Стресс по неделе усилился, поэтому организм сейчас уязвимее к тяге и перееданию.'],
            [/^за неделю быстрые углеводы выросли$/i, () => 'За неделю стало больше быстрых углеводов — это может усиливать тягу и качели энергии.'],
            [/^подтверждено фенотипом insulin resistant$/i, () => 'Совет дополнительно согласуется с твоим метаболическим профилем и чувствительностью к углеводам.'],
            [/^учтён вечерний циркадный тип$/i, () => 'Совет подстроен под твой вечерний ритм, а не взят из общего шаблона.'],
            [/^учтён низкий satiety-профиль$/i, () => 'Совет учитывает, что для тебя особенно важно насыщение и устойчивость к перекусам.'],
            [/^учтён stress-eating паттерн$/i, () => 'Совет учитывает твою склонность тянуться к еде на фоне стресса.'],
            [/^pattern meal timing: (\d+)\/100$/i, (_, score) => `Ритм питания сейчас держится неидеально (${score}/100), поэтому мягкая коррекция к месту.`],
            [/^pattern circadian: (\d+)\/100$/i, (_, score) => `Ритм еды и биологические часы сейчас согласованы неидеально (${score}/100).`],
            [/^pattern sleep→hunger: (\d+)\/100$/i, (_, score) => `Связка «сон → голод» сейчас выглядит заметной (${score}/100).`],
            [/^pattern hydration: (\d+)\/100$/i, (_, score) => `Паттерн по воде просел (${score}/100), так что совет появился не случайно.`],
            [/^pattern stress-eating подтверждает риск$/i, () => 'Паттерн стрессового переедания тоже подтверждает, что совет сейчас вовремя.'],
            [/^pattern insulin sensitivity: (\d+)\/100$/i, (_, score) => `Чувствительность к углеводам сейчас выглядит слабее обычного (${score}/100).`],
            [/^высокий crash-risk 24ч$/i, () => 'На ближайшие сутки система видит высокий риск срыва, поэтому лучше подстелить соломку заранее.'],
            [/^средний crash-risk 24ч$/i, () => 'На ближайшие сутки есть умеренный риск срыва, поэтому лучше слегка скорректировать курс заранее.'],
            [/^EWS: (.+)$/i, (_, label) => `Система ранних сигналов тоже подсвечивает похожий риск: ${label}.`],
            [/^EWS подтверждает ещё (\d+) связ\. сигн\.$/i, (_, count) => `Кроме основного сигнала, есть ещё ${count} связанных подтверждения.`],
            [/^EWS risk (\d+)\/100$/i, (_, score) => `Система ранних сигналов оценивает общий риск на ${score}/100.`],
            [/^causal root: (.+)$/i, (_, name) => `Совет бьёт не по симптому, а по корневой причине: ${name}.`],
            [/^causal path: (.+)$/i, (_, name) => `Совет вмешивается в механизм, который сейчас толкает ситуацию в плохую сторону: ${name}.`],
            [/^causal outcome: (.+)$/i, (_, name) => `Совет помогает сдержать уже заметное последствие: ${name}.`],
            [/^response memory: (.+)$/i, (_, label) => `Похожие советы в похожем контексте раньше реагировали так: ${label}.`],
        ];

        for (const [pattern, formatter] of rules) {
            if (pattern.test(trimmed)) {
                return trimmed.replace(pattern, formatter);
            }
        }

        return trimmed
            .replace(/root cause/gi, 'корневую причину')
            .replace(/outcome/gi, 'последствие')
            .replace(/response memory/gi, 'реакцию на похожие советы')
            .replace(/\bEWS\b/g, 'система ранних сигналов');
    }

    function getScienceEvidenceLabel(level) {
        if (level === 'A') return 'сильная научная опора';
        if (level === 'B') return 'хорошая научная опора';
        if (level === 'C') return 'рабочая научная опора';
        return 'научная опора';
    }

    function getSourceSupportLabel(count) {
        if (!count || count <= 1) return 'Опора идёт хотя бы из одного надёжного слоя данных текущего дня.';
        if (count === 2) return 'Совет подтверждён минимум двумя независимыми слоями данных.';
        if (count === 3) return 'Совет опирается сразу на три слоя данных, а не на один показатель.';
        return `Совет опирается сразу на ${count} независимых слоя данных.`;
    }

    function getAdviceTechnicalFacts(advice) {
        const expertMeta = advice?.expertMeta || {};
        return {
            summary: [
                advice?.id ? `id: ${advice.id}` : null,
                advice?.category ? `category: ${advice.category}` : null,
                advice?.confidenceLabel ? `confidence: ${advice.confidenceLabel}` : null,
                typeof expertMeta.evidenceScore === 'number' ? `score: ${expertMeta.evidenceScore}` : null,
                typeof expertMeta.sourceCount === 'number' ? `sources: ${expertMeta.sourceCount}` : null,
            ].filter(Boolean),
            drivers: Array.isArray(expertMeta.drivers) ? expertMeta.drivers : [],
            crossConfirmedBy: Array.isArray(expertMeta.crossConfirmedBy) ? expertMeta.crossConfirmedBy : [],
            contradictions: Array.isArray(expertMeta.contradictions) ? expertMeta.contradictions : [],
            actionNow: expertMeta.actionNow || null,
            science: expertMeta.science || null,
            causal: expertMeta.causal || null,
            responseMemory: expertMeta.responseMemory || null,
            uncertainty: expertMeta.uncertainty || null,
        };
    }

    function getHumanWhyNowParts(advice) {
        const expertMeta = advice?.expertMeta || {};
        const parts = [];

        if (advice?.evidenceSummary) {
            advice.evidenceSummary
                .split('•')
                .map(part => humanizeAdviceInsight(part))
                .filter(Boolean)
                .forEach(part => parts.push(part));
        }

        if (parts.length === 0 && expertMeta.whyNow) {
            parts.push(humanizeAdviceInsight(expertMeta.whyNow));
        }

        return parts.slice(0, 3);
    }

    function getAdviceCategoryRu(advice, categoryNames = {}) {
        const category = advice?.category || advice?.ruleCategory || '';
        if (category && categoryNames[category]) return categoryNames[category];
        if (typeof category === 'string' && category.trim()) {
            const normalized = category.trim();
            return normalized.charAt(0).toUpperCase() + normalized.slice(1);
        }
        return 'Совет';
    }

    function getAdviceHeroText(advice) {
        if (!advice) return '';

        const actionNowLabel = advice?.expertMeta?.actionNow?.label;
        if (typeof actionNowLabel === 'string' && actionNowLabel.trim()) {
            return actionNowLabel.trim();
        }

        const scienceRationale = advice?.expertMeta?.science?.rationale;
        if (typeof scienceRationale === 'string' && scienceRationale.trim()) {
            const firstSentence = scienceRationale.trim().match(/[^.!?…]+[.!?…]?/);
            if (firstSentence?.[0]) return firstSentence[0].trim();
        }

        const whyNowParts = getHumanWhyNowParts(advice);
        if (whyNowParts.length > 0) return whyNowParts[0];

        return '';
    }

    function getAdviceDescription(advice) {
        if (!advice) return '';

        if (typeof advice.details === 'string' && advice.details.trim()) {
            return advice.details.trim();
        }

        const whyNowParts = getHumanWhyNowParts(advice);
        if (whyNowParts.length > 0) {
            return whyNowParts[0];
        }

        const actionNowLabel = advice?.expertMeta?.actionNow?.label;
        if (typeof actionNowLabel === 'string' && actionNowLabel.trim()) {
            return actionNowLabel.trim();
        }

        return '';
    }

    function getAdviceScienceBlurb(advice) {
        const scienceRationale = advice?.expertMeta?.science?.rationale;
        if (typeof scienceRationale === 'string' && scienceRationale.trim()) {
            return scienceRationale.trim();
        }
        return getAdviceScienceSummary(advice);
    }

    function getAdviceScienceSummary(advice) {
        if (!advice) return '';

        const scienceRationale = advice?.expertMeta?.science?.rationale;
        const baseText = typeof scienceRationale === 'string' && scienceRationale.trim()
            ? scienceRationale.trim()
            : getAdviceDescription(advice);

        if (!baseText) return '';

        const normalizedText = baseText.replace(/\s+/g, ' ').trim();
        const sentences = normalizedText
            .match(/[^.!?…]+[.!?…]?/g)
            ?.map(part => part.trim())
            .filter(Boolean) || [];

        if (sentences.length === 0) return normalizedText;
        return sentences.slice(0, 3).join(' ');
    }

    const ADVICE_UNDO_SECONDS = 3;

    // Строка «панель оценки»: свайп влево сужает карточку на 96 px справа — сама
    // она не сдвигается, и в освободившемся месте встаёт панель «Полезно?».
    // Порог открытия — половина панели: карточка уже сузилась настолько, что
    // намерение видно, а до конца жест дотягивать не нужно.
    const ADVICE_RATING_PANEL_WIDTH = 96;
    const ADVICE_RATING_OPEN_THRESHOLD = ADVICE_RATING_PANEL_WIDTH / 2;
    // Строка «повторный тап»: защита стоит на оценке совета; на «прочитано» и
    // «скрыть» её нет — эти состояния идемпотентны.
    const ADVICE_RATE_REPEAT_GUARD_MS = 350;
    // Строка «панель оценки»: после ответа кнопки исчезают, карточка
    // возвращается на место за 180 мс.
    const ADVICE_RATING_RETURN_MS = 180;

    // Строка «офлайн»: советы считаются на устройстве, поэтому отдельного
    // состояния «нет связи» у списка нет. Пропадает только оценка совета — она
    // уходит на сервер и в офлайне копится. Копится она в heys_advice_outcomes_v1
    // (advice/_core.js rateAdvice → advice/_outcomes.js), поэтому плашку
    // «не сохранено» поднимает именно этот ключ в очереди облака, а не отметки
    // прочтения: они локальные и «не ушедшими» для человека не бывают.
    const ADVICE_RATING_SYNC_KEY = 'heys_advice_outcomes_v1';

    function hasPendingAdviceRatingSync() {
        try {
            const cloud = (typeof HEYS !== 'undefined' && HEYS?.cloud) || window.HEYS?.cloud;
            const detail = cloud?.getPendingItemsDetail?.();
            const queue = [
                ...(Array.isArray(detail?.queue) ? detail.queue : []),
                ...(Array.isArray(detail?.inflight) ? detail.inflight : []),
            ];
            return queue.some((item) => String(item?.k || '').includes(ADVICE_RATING_SYNC_KEY));
        } catch (_) {
            return false;
        }
    }

    function renderAdviceV4Icon(React, kind) {
        const common = {
            className: 'advice-v4-icon',
            fill: 'none',
            stroke: 'currentColor',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
        };
        if (kind === 'check') {
            return React.createElement('svg', {
                ...common,
                className: 'advice-v4-icon advice-v4-icon--check',
                width: 17,
                height: 17,
                viewBox: '0 0 24 24',
                strokeWidth: 3.2,
            }, React.createElement('path', { d: 'M5 13l4 4L19 7' }));
        }
        if (kind === 'thumb-up') {
            return React.createElement('svg', {
                ...common,
                width: 15,
                height: 15,
                viewBox: '0 0 24 24',
                strokeWidth: 2.5,
            }, React.createElement('path', { d: 'M7 11v9H4v-9zM7 11l4.5-8A2 2 0 0115 5v4h4a2 2 0 012 2.4l-1.4 7A2 2 0 0117.6 20H7' }));
        }
        if (kind === 'thumb-down') {
            return React.createElement('svg', {
                ...common,
                width: 15,
                height: 15,
                viewBox: '0 0 24 24',
                strokeWidth: 2.5,
            }, React.createElement('path', { d: 'M17 13V4h3v9zM17 13l-4.5 8A2 2 0 019 19v-4H5a2 2 0 01-2-2.4l1.4-7A2 2 0 016.4 4H17' }));
        }
        if (kind === 'cloud-off') {
            return React.createElement('svg', {
                ...common,
                className: 'advice-v4-icon advice-v4-icon--cloud-off',
                width: 19,
                height: 19,
                viewBox: '0 0 24 24',
                strokeWidth: 2.5,
            },
                React.createElement('path', { d: 'M18 16.5A3.5 3.5 0 0016.5 10a5.5 5.5 0 00-10.6 1.4A3 3 0 006.5 17' }),
                React.createElement('path', { d: 'M12 20v-7M9 16l3 3 3-3' })
            );
        }
        if (kind === 'chevron-left') {
            return React.createElement('svg', {
                ...common,
                width: 17,
                height: 17,
                viewBox: '0 0 24 24',
                strokeWidth: 2.75,
            }, React.createElement('path', { d: 'M15 18l-6-6 6-6' }));
        }
        if (kind === 'chevron-right') {
            return React.createElement('svg', {
                ...common,
                width: 14,
                height: 14,
                viewBox: '0 0 24 24',
                strokeWidth: 2.75,
            }, React.createElement('path', { d: 'M9 6l6 6-6 6' }));
        }
        if (kind === 'close') {
            return React.createElement('svg', {
                ...common,
                width: 14,
                height: 14,
                viewBox: '0 0 24 24',
                strokeWidth: 2.75,
            },
                React.createElement('path', { d: 'M6 6l12 12' }),
                React.createElement('path', { d: 'M18 6L6 18' })
            );
        }
        return null;
    }

    function renderAdviceHideRing(React, secondsLeft) {
        const radius = 15;
        const circumference = 2 * Math.PI * radius;
        const safeSeconds = Math.max(0, Math.min(ADVICE_UNDO_SECONDS, Number(secondsLeft) || 0));
        const progress = safeSeconds / ADVICE_UNDO_SECONDS;
        const dashOffset = circumference * (1 - progress);

        return React.createElement('div', { className: 'advice-v4-hide-ring', 'aria-hidden': true },
            React.createElement('svg', { className: 'advice-v4-hide-ring__svg', viewBox: '0 0 36 36' },
                React.createElement('circle', {
                    className: 'advice-v4-hide-ring__track',
                    cx: 18,
                    cy: 18,
                    r: radius,
                }),
                React.createElement('circle', {
                    className: 'advice-v4-hide-ring__progress',
                    cx: 18,
                    cy: 18,
                    r: radius,
                    strokeDasharray: `${circumference} ${circumference}`,
                    strokeDashoffset: dashOffset,
                })
            ),
            React.createElement('span', { className: 'advice-v4-hide-ring__num' }, String(Math.max(safeSeconds, 1)))
        );
    }

    // Панель оценки всплывающего совета (свайп по плашке на Главной). Оценка
    // карточки в шторке живёт не здесь: строка «панель оценки» описывает её как
    // две кнопки под самой карточкой (см. AdviceCard). Эту, тостовую, контракт
    // не описывает — строка «всплывающий совет и тосты» отдаёт дизайну только
    // вид плашки, — поэтому она оставлена как была.
    function renderAdviceReadFeedbackPanel(React, {
        onRatePositive,
        onRateNegative,
        onSkip,
    }) {
        return React.createElement('div', { className: 'advice-v4-panel advice-v4-panel--read' },
            React.createElement('div', { className: 'advice-v4-panel__head' },
                renderAdviceV4Icon(React, 'check'),
                React.createElement('span', { className: 'advice-v4-panel__title' }, 'Прочитано')
            ),
            React.createElement('div', { className: 'advice-v4-panel__hint' },
                'Ответ влияет на то, какие советы вы увидите дальше — с двух оценок совет начинает подниматься или уходить вниз.'
            ),
            React.createElement('div', { className: 'advice-v4-panel__actions' },
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-v4-panel__btn advice-v4-panel__btn--useful',
                    onClick: onRatePositive,
                }, renderAdviceV4Icon(React, 'thumb-up'), 'Полезно'),
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-v4-panel__btn advice-v4-panel__btn--miss',
                    onClick: onRateNegative,
                }, renderAdviceV4Icon(React, 'thumb-down'), 'Мимо')
            ),
            React.createElement('button', {
                type: 'button',
                className: 'advice-v4-panel__skip',
                onClick: onSkip,
            }, 'Пропустить')
        );
    }

    function renderAdviceHideUndoPanel(React, {
        advice,
        secondsLeft,
        onUndo,
    }) {
        return React.createElement('div', { className: 'advice-v4-panel advice-v4-panel--hide' },
            React.createElement('div', { className: 'advice-v4-hide-row' },
                renderAdviceHideRing(React, secondsLeft),
                React.createElement('div', { className: 'advice-v4-hide-copy' },
                    React.createElement('span', { className: 'advice-v4-hide-copy__title' }, 'Совет скрыт до завтра'),
                    React.createElement('span', { className: 'advice-v4-hide-copy__subtitle' }, advice?.text || '')
                ),
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-v4-hide-return',
                    onClick: onUndo,
                }, 'Вернуть')
            )
        );
    }

    // Строка «не сохранено»: плашка --tint радиусом 18 с полями 13/15 px, иконка
    // облака 19 px тоном --red, заголовок «Оценка не ушла — нет связи» и под ним
    // успокаивающая строка. Кнопки «Повторить» у плашки нет намеренно: повтор
    // ничего не ускорит — отправка уже в очереди, — а её наличие заставляет
    // человека решать задачу, которой у него нет.
    function renderAdviceSyncBanner(React, { pending }) {
        if (!pending) return null;

        return React.createElement('div', { className: 'advice-v4-panel advice-v4-panel--sync', role: 'status' },
            renderAdviceV4Icon(React, 'cloud-off'),
            React.createElement('div', { className: 'advice-v4-sync-copy' },
                React.createElement('div', { className: 'advice-v4-panel__title' },
                    'Оценка не ушла — нет связи'
                ),
                React.createElement('div', { className: 'advice-v4-panel__hint advice-v4-panel__hint--sync' },
                    'Она сохранена на телефоне и отправится сама. Ничего делать не нужно.'
                )
            )
        );
    }

    function renderAdviceServiceScreen(React, {
        onClose,
        onOpenTechLog,
        onOpenDiagnostics,
        onOpenRulesPool,
    }) {
        return React.createElement('div', {
            className: 'advice-service-overlay',
            onClick: (e) => e.stopPropagation(),
        },
            React.createElement('div', { className: 'advice-service-header' },
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-service-back',
                    onClick: onClose,
                    'aria-label': 'Назад',
                }, renderAdviceV4Icon(React, 'chevron-left')),
                React.createElement('span', { className: 'advice-service-title' }, 'Служебное')
            ),
            React.createElement('div', { className: 'advice-service-body' },
                React.createElement('div', { className: 'advice-service-note' },
                    'Раздел виден только по входу куратора. Клиент сюда не попадает ни из шапки, ни из настроек.'
                ),
                React.createElement('div', { className: 'advice-service-section-label' }, 'Советы'),
                React.createElement('div', { className: 'advice-service-list' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-service-row',
                        onClick: onOpenTechLog,
                    },
                        React.createElement('span', null,
                            React.createElement('span', { className: 'advice-service-row__title' }, 'Техлог'),
                            React.createElement('span', { className: 'advice-service-row__hint' }, 'Что и почему сработало за день')
                        ),
                        React.createElement('span', { className: 'advice-service-row__chevron', 'aria-hidden': true },
                            renderAdviceV4Icon(React, 'chevron-right')
                        )
                    ),
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-service-row',
                        onClick: onOpenDiagnostics,
                    },
                        React.createElement('span', null,
                            React.createElement('span', { className: 'advice-service-row__title' }, 'Диагностика'),
                            React.createElement('span', { className: 'advice-service-row__hint' }, 'Почему совет не показался')
                        ),
                        React.createElement('span', { className: 'advice-service-row__chevron', 'aria-hidden': true },
                            renderAdviceV4Icon(React, 'chevron-right')
                        )
                    ),
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-service-row',
                        onClick: onOpenRulesPool,
                    },
                        React.createElement('span', null,
                            React.createElement('span', { className: 'advice-service-row__title' }, 'Пул правил'),
                            React.createElement('span', { className: 'advice-service-row__hint' }, 'Какие правила активны сейчас')
                        ),
                        React.createElement('span', { className: 'advice-service-row__chevron', 'aria-hidden': true },
                            renderAdviceV4Icon(React, 'chevron-right')
                        )
                    )
                ),
                React.createElement('div', { className: 'advice-service-footer-note' },
                    'Раньше эти три кнопки стояли в шапке шторки советов рядом с «Прочитать все» — на одном уровне с клиентским действием.'
                )
            ),
            React.createElement('div', { className: 'advice-service-footer-tag' }, 'служебный раздел')
        );
    }

    function AdviceRulesPoolModal({
        React,
        diagnostics,
        onClose,
    }) {
        if (!diagnostics) return null;
        const moduleReport = Array.isArray(diagnostics.moduleReport) ? diagnostics.moduleReport : [];
        const sortedModules = [...moduleReport].sort((a, b) => (b.withOutput || 0) - (a.withOutput || 0));

        return React.createElement('div', {
            className: 'advice-service-overlay advice-rules-pool-overlay',
            onClick: (e) => e.stopPropagation(),
        },
            React.createElement('div', { className: 'advice-service-header' },
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-service-back',
                    onClick: onClose,
                    'aria-label': 'Назад',
                }, renderAdviceV4Icon(React, 'chevron-left')),
                React.createElement('span', { className: 'advice-service-title' }, 'Пул правил')
            ),
            React.createElement('div', { className: 'advice-service-body' },
                React.createElement('div', { className: 'advice-service-note' },
                    `Снимок за ${diagnostics.date || 'сегодня'} · модулей ${moduleReport.length}`
                ),
                sortedModules.length === 0
                    ? React.createElement('div', { className: 'advice-rules-pool-empty' },
                        'За день ещё нет данных по модулям правил.'
                    )
                    : React.createElement('div', { className: 'advice-service-list advice-rules-pool-list' },
                        sortedModules.map((item) => React.createElement('div', {
                            key: item.module,
                            className: `advice-rules-pool-row${(item.withOutput || 0) > 0 ? ' advice-rules-pool-row--active' : ''}`,
                        },
                            React.createElement('span', null,
                                React.createElement('span', { className: 'advice-service-row__title' }, item.module),
                                React.createElement('span', { className: 'advice-service-row__hint' },
                                    (item.withOutput || 0) > 0
                                        ? `Выдал советы · запусков ${item.runs || 0}`
                                        : `Без выхода · запусков ${item.runs || 0}`
                                )
                            ),
                            (item.withOutput || 0) > 0 && React.createElement('span', { className: 'advice-rules-pool-badge' }, 'активен')
                        ))
                    )
            ),
            React.createElement('div', { className: 'advice-service-footer-tag' }, 'служебный раздел')
        );
    }

    const ADVICE_SETTINGS_GROUPS = [
        {
            id: 'nutrition_meals',
            label: 'Питание и режим приёмов',
            keys: ['nutrition', 'timing', 'hydration'],
        },
        {
            id: 'training_activity',
            label: 'Тренировки и активность',
            keys: ['training', 'correlation'],
        },
        {
            id: 'sleep_wellness',
            label: 'Сон и самочувствие',
            keys: ['sleep', 'emotional', 'lifestyle'],
        },
        {
            id: 'motivation',
            label: 'Мотивация и достижения',
            keys: ['achievement'],
        },
    ];

    function shouldShowMedicalDisclaimerGate(adviceTrigger, toastVisible, sessionDismissed) {
        if (isMedicalDisclaimerAccepted() || sessionDismissed) return false;
        if (!toastVisible || !adviceTrigger) return false;
        return true;
    }

    function formatAdviceSourceCitation(source) {
        if (!source || typeof source !== 'object') return null;
        const org = source.org || source.title || 'Источник';
        const year = source.year ? `, ${source.year}` : '';
        const metaParts = [];
        if (source.type) metaParts.push(source.type);
        if (source.n) {
            const count = Number(source.n);
            const noun = count === 1 ? 'участник' : (count >= 2 && count <= 4 ? 'участника' : 'участников');
            metaParts.push(`${count.toLocaleString('ru-RU')} ${noun}`);
        }
        return {
            title: `${org}${year}`,
            meta: metaParts.join(' · '),
        };
    }

    function AdviceMedicalDisclaimerGate({ React, onContinue, neverShow, onNeverShowChange }) {
        return React.createElement('div', {
            className: 'advice-v4-disclaimer-overlay',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': 'Первый совет',
            onClick: (e) => e.stopPropagation(),
        },
            React.createElement('div', { className: 'advice-v4-disclaimer-card' },
                // Кадр «Оговорка», элемент 22: лист поднимается снизу и несёт
                // ручку, как остальные листы советов. Без неё карточка стояла
                // по центру экрана и читалась как окно, а не как лист.
                React.createElement('div', { className: 'advice-v4-disclaimer-card__handle' }),
                React.createElement('div', { className: 'advice-v4-disclaimer-card__title' }, 'Первый совет'),
                React.createElement('p', { className: 'advice-v4-disclaimer-card__lead' },
                    'Дальше приложение будет замечать закономерности в ваших данных'
                ),
                // Элемент 25: оговорка врача живёт в своей карточке на первой
                // поверхности — она отдельное предупреждение, а не продолжение
                // фразы над ней.
                React.createElement('div', { className: 'advice-v4-disclaimer-card__note' },
                    React.createElement('p', { className: 'advice-v4-disclaimer-card__text' },
                        'Это наблюдения по вашим записям, а не назначение врача. При заболеваниях, беременности и приёме лекарств решения принимает врач — приложение их не заменяет.'
                    )
                ),
                React.createElement('label', { className: 'advice-v4-disclaimer-card__check' },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: !!neverShow,
                        onChange: (e) => onNeverShowChange && onNeverShowChange(e.target.checked),
                    }),
                    React.createElement('span', null, 'Больше не показывать')
                ),
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-v4-disclaimer-card__primary',
                    onClick: onContinue,
                }, 'Показать совет')
            )
        );
    }

    // Решение владельца 24.08.2026: частный тумблер «Звук советов» остаётся.
    // Человеку, которому мешают советы, не нужно ради этого глушить воду и всё
    // остальное. Общий переключатель звука в профиле работает поверх: он гасит
    // HEYS.audio.masterEnabled, а этот — только советы (гейты в playAdviceSound
    // и в показе тоста; политика отклика читает тот же ключ).
    // Основное место тумблера теперь — ярус «Звуки» внутри «Оформления»
    // (heys_app_shell_v1.js), рядом с каплей воды: строка «звук · правило
    // продукта». Ряд здесь остаётся вторым входом в ту же настройку — оба
    // пишут `heys_advice_settings.adviceSoundEnabled` и `soundEnabled`.
    function renderAdviceSettingsScreen(React, {
        onClose,
        toastsEnabled,
        adviceSoundEnabled,
        onToggleToasts,
        onToggleSound,
        categorySettings,
        onToggleCategoryGroup,
    }) {
        return React.createElement('div', {
            className: 'advice-v4-settings-overlay',
            role: 'presentation',
            onClick: onClose,
        },
            React.createElement('div', {
                className: 'advice-v4-settings',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': 'Настройки советов',
                onClick: (e) => e.stopPropagation(),
            },
                React.createElement('div', { className: 'advice-v4-settings__header' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-v4-settings__back',
                        onClick: onClose,
                        'aria-label': 'Назад',
                    }, '←'),
                    React.createElement('span', { className: 'advice-v4-settings__title' }, 'Советы')
                ),
                React.createElement('div', { className: 'advice-v4-settings__body' },
                    React.createElement('p', { className: 'advice-v4-settings__intro' },
                        'Единственное место, где это настраивается. В шторке советов тумблеров нет — там только чтение.'
                    ),
                    React.createElement('div', { className: 'advice-v4-settings__section-label' }, 'Как приходят'),
                    React.createElement('div', { className: 'advice-v4-settings__group' },
                        React.createElement('div', { className: 'advice-v4-settings__row' },
                            React.createElement('div', { className: 'advice-v4-settings__row-copy' },
                                React.createElement('span', { className: 'advice-v4-settings__row-title' }, 'Показывать советы сами'),
                                React.createElement('span', { className: 'advice-v4-settings__row-hint' },
                                    'Всплывают поверх экрана, когда система что-то замечает. Выключено — ждут в лампочке.'
                                )
                            ),
                            React.createElement('button', {
                                type: 'button',
                                className: 'advice-v4-settings__toggle' + (toastsEnabled ? ' is-on' : ''),
                                onClick: onToggleToasts,
                                'aria-pressed': toastsEnabled ? 'true' : 'false',
                            }, React.createElement('span', { className: 'advice-v4-settings__toggle-thumb' }))
                        ),
                        React.createElement('div', { className: 'advice-v4-settings__row' },
                            React.createElement('div', { className: 'advice-v4-settings__row-copy' },
                                React.createElement('span', { className: 'advice-v4-settings__row-title' }, 'Звук'),
                                React.createElement('span', { className: 'advice-v4-settings__row-hint' },
                                    'Только у советов. Остальные звуки приложения не затрагивает.'
                                )
                            ),
                            React.createElement('button', {
                                type: 'button',
                                className: 'advice-v4-settings__toggle' + (adviceSoundEnabled ? ' is-on' : ''),
                                onClick: onToggleSound,
                                'aria-pressed': adviceSoundEnabled ? 'true' : 'false',
                            }, React.createElement('span', { className: 'advice-v4-settings__toggle-thumb' }))
                        )
                    ),
                    React.createElement('div', { className: 'advice-v4-settings__section-label' }, 'О чём'),
                    React.createElement('div', { className: 'advice-v4-settings__group' },
                        ADVICE_SETTINGS_GROUPS.map((group) => {
                            const enabled = group.keys.every((key) => categorySettings?.[key] !== false);
                            return React.createElement('div', { key: group.id, className: 'advice-v4-settings__row' },
                                React.createElement('div', { className: 'advice-v4-settings__row-copy' },
                                    React.createElement('span', { className: 'advice-v4-settings__row-title' }, group.label)
                                ),
                                React.createElement('button', {
                                    type: 'button',
                                    className: 'advice-v4-settings__toggle' + (enabled ? ' is-on' : ''),
                                    onClick: () => onToggleCategoryGroup && onToggleCategoryGroup(group.keys, !enabled),
                                    'aria-pressed': enabled ? 'true' : 'false',
                                }, React.createElement('span', { className: 'advice-v4-settings__toggle-thumb' }))
                            );
                        })
                    ),
                    React.createElement('p', { className: 'advice-v4-settings__footnote' },
                        'Предупреждения приходят всегда. Наблюдения по вашим записям — тоже: это не тема, а способ подачи.'
                    )
                )
            )
        );
    }

    function renderAdviceEvidence(advice, options = {}) {
        if (!hasExpertContent(advice)) return null;

        const expertMeta = advice?.expertMeta || {};
        const confidenceLabel = advice.confidenceLabel || (
            advice.confidence === 'high' ? 'высокая'
                : advice.confidence === 'medium' ? 'средняя'
                    : advice.confidence === 'low' ? 'базовая'
                        : ''
        );

        const parts = getHumanWhyNowParts(advice);
        const showWhyNow = options.showWhyNow !== false;
        const showActionNow = options.showActionNow !== false;
        const showCausal = options.showCausal !== false;

        if (
            (!showWhyNow || parts.length === 0) &&
            (!showActionNow || !expertMeta.actionNow?.label) &&
            !expertMeta.science?.rationale &&
            (!showCausal || !expertMeta.causal?.mechanism) &&
            !expertMeta.uncertainty?.message
        ) {
            return null;
        }

        return React.createElement('div', {
            className: 'advice-expert-evidence advice-expert-evidence--human'
        },
            showWhyNow && parts.length > 0 && React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'advice-expert-evidence__title' }, 'Почему этот совет сейчас к месту'),
                React.createElement('ul', { className: 'advice-expert-evidence__list' },
                    parts.slice(0, 3).map((part, index) => React.createElement('li', {
                        key: `human_${index}`,
                        className: 'advice-expert-evidence__list-item'
                    }, part))
                )
            ),
            showActionNow && expertMeta.actionNow?.label && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Что лучше сделать сейчас'),
                React.createElement('div', { className: 'advice-expert-evidence__text is-accent' }, expertMeta.actionNow.label)
            ),
            expertMeta.science?.rationale && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Почему это обычно работает'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, expertMeta.science.rationale)
            ),
            showCausal && expertMeta.causal?.mechanism && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Какой механизм здесь важен'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, expertMeta.causal.mechanism)
            ),
            expertMeta.science && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'На что опирается совет'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, `${getScienceEvidenceLabel(expertMeta.science.evidenceLevel)} · ${expertMeta.science.topic}`),
                // 🔬 Phase 1.3 (2026-05-30): peer-reviewed sources list из _evidence.js KB.
                // Видимо только если populate'ено (Tier-A 30 советов). Compact rendering:
                // "Sources: ESPEN-2022 guideline, Morton-2018 meta (n=1863, Br J Sports Med)"
                Array.isArray(expertMeta.science.sources) && expertMeta.science.sources.length > 0 &&
                    React.createElement('div', {
                        className: 'advice-expert-evidence__sources',
                        style: { marginTop: '6px', fontSize: '12px', opacity: 0.85 }
                    },
                        '📚 Sources: ',
                        expertMeta.science.sources.slice(0, 3).map((src, i) => {
                            const parts = [];
                            if (src.org) parts.push(src.org);
                            if (src.year) parts.push(src.year);
                            const main = parts.join('-');
                            const meta = [];
                            if (src.type) meta.push(src.type);
                            if (src.n) meta.push(`n=${src.n}`);
                            if (src.journal) meta.push(src.journal);
                            const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
                            // 🔬 Phase A.+ (2026-05-31): PubMed search link на каждый source.
                            // Honest approach — search query вместо fabricated DOI.
                            // Tooltip native browser title с full citation.
                            // Pattern reuse из apps/web/insights/pi_ui_rings.js:112.
                            const searchTerm = [src.org, src.year, src.journal, src.topic, src.title]
                                .filter(Boolean).join(' ');
                            const url = src.doi
                                ? `https://doi.org/${src.doi}`
                                : `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(searchTerm)}`;
                            const tooltipFull = `${main}${metaStr}${src.title ? ' — ' + src.title : ''}\n🔗 Открыть в PubMed / DOI`;
                            return React.createElement(React.Fragment, { key: `src_${i}` },
                                (i > 0 ? '; ' : ''),
                                React.createElement('a', {
                                    href: url,
                                    target: '_blank',
                                    rel: 'noopener noreferrer',
                                    title: tooltipFull,
                                    onClick: (e) => e.stopPropagation(),
                                    className: 'advice-expert-evidence__source-link',
                                    style: {
                                        color: 'inherit',
                                        textDecoration: 'underline',
                                        textDecorationStyle: 'dotted',
                                        textUnderlineOffset: '2px',
                                        cursor: 'pointer'
                                    }
                                }, main + metaStr + ' 🔗')
                            );
                        })
                    )
            ),
            // 🔬 Phase 1.3: "Не подходит когда" — edge cases / contraindications.
            // Populate'ено только для Tier-A 30 советов (Phase 6 расширит).
            Array.isArray(expertMeta.science?.not_apply_when) && expertMeta.science.not_apply_when.length > 0 &&
                React.createElement('div', { className: 'advice-expert-evidence__block advice-expert-evidence__block--caution' },
                    React.createElement('div', { className: 'advice-expert-evidence__label' }, '⚠️ Когда совет не подходит'),
                    React.createElement('ul', { className: 'advice-expert-evidence__list' },
                        expertMeta.science.not_apply_when.slice(0, 3).map((case_, i) =>
                            React.createElement('li', {
                                key: `caution_${i}`,
                                className: 'advice-expert-evidence__list-item'
                            }, case_)
                        )
                    )
                ),
            (expertMeta.sourceCount || confidenceLabel) && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Насколько это надёжно'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, [
                    getConfidenceNarrative(advice.confidence),
                    expertMeta.uncertainty?.message,
                    expertMeta.sourceCount ? getSourceSupportLabel(expertMeta.sourceCount) : null
                ].filter(Boolean).join(' '))
            )
        );
    }

    function formatPercentValue(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
        return `${Math.round(value * 100)}%`;
    }

    function formatDiagnosticsMetricValue(metric, value, options = {}) {
        if (metric === 'precision' && options.hasEvidence === false) return 'нет данных';
        return formatPercentValue(value);
    }

    function getQualityGradeLabel(grade) {
        if (grade === 'strong') return 'сильный';
        if (grade === 'good') return 'хороший';
        if (grade === 'mixed') return 'смешанный';
        if (grade === 'weak') return 'слабый';
        return '—';
    }

    function getQualityGradeClass(grade) {
        if (grade === 'strong') return 'is-strong';
        if (grade === 'good') return 'is-good';
        if (grade === 'mixed') return 'is-mixed';
        if (grade === 'weak') return 'is-weak';
        return 'is-neutral';
    }

    function AdviceDiagnosticsModal({
        React,
        diagnostics,
        onClose,
    }) {
        if (!diagnostics) return null;

        const summary = diagnostics.executiveSummary || {};
        const quality = diagnostics.quality || {};
        const effect = diagnostics.analyticsEffectiveness || {};
        const lastSnapshot = diagnostics.lastSnapshot || null;
        const eventFunnel = effect.eventFunnel || quality.eventFunnel || {};
        const moduleReport = Array.isArray(diagnostics.moduleReport) ? diagnostics.moduleReport : [];
        const silentModules = Array.isArray(summary.topSilentModules) && summary.topSilentModules.length > 0
            ? summary.topSilentModules
            : (Array.isArray(quality.silentModules) ? quality.silentModules : []);
        const topReasons = Array.isArray(diagnostics.blockerReport?.topReasons)
            ? diagnostics.blockerReport.topReasons.slice(0, 4)
            : [];
        const findings = Array.isArray(summary.topIssues) && summary.topIssues.length > 0
            ? summary.topIssues
            : (Array.isArray(quality.findings) ? quality.findings : []);
        const activeModules = moduleReport.filter(item => (item?.withOutput || 0) > 0).slice(0, 4);
        const manualEventsExceedShown = (eventFunnel.manualOpen || 0) > 0 && (eventFunnel.click || 0) > (eventFunnel.shown || 0);
        const blockerLabels = {
            trigger_mismatch: 'триггер не совпал',
            global_cooldown: 'глобальный cooldown',
            expert_conflict_resolution: 'конфликт сигналов',
            category_limit: 'лимит категории',
            manual_mode_no_auto_toast: 'ручной режим не запускает auto-toast',
            already_shown_in_session: 'уже показывали в этой сессии',
            ui_busy: 'интерфейс был занят',
            missing_trigger: 'триггер не был передан',
            session_limit: 'лимит за сессию',
        };
        const getBlockerMeta = (key, count) => {
            return HEYS?.advice?.getBlockerHumanMeta?.(key, count) || {
                label: blockerLabels[key] || key,
                message: null,
                shortReason: null
            };
        };
        const isInformationalBlocker = (key) => {
            return HEYS?.advice?.isInformationalBlocker?.(key) === true || key === 'manual_mode_no_auto_toast';
        };
        const humanizeBlocker = (key, count) => {
            const meta = getBlockerMeta(key, count);
            return meta?.label || blockerLabels[key] || key;
        };
        const topReasonsForDisplay = (() => {
            const filtered = topReasons.filter(item => !isInformationalBlocker(item?.key));
            return filtered.length > 0 ? filtered : topReasons;
        })();
        const getDisplayBlocker = (blockers) => {
            const safeBlockers = Array.isArray(blockers) ? blockers : [];
            return safeBlockers.find(item => !isInformationalBlocker(item?.key)) || null;
        };
        const hasPrecisionEvidence = ((effect.positiveSignals || 0) + (effect.negativeSignals || 0)) > 0;
        const getKpiStatusClass = (metric, value, options = {}) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) return 'is-neutral';
            if (metric === 'precision' && options.hasEvidence === false) return 'is-neutral';
            if (metric === 'coverage') return value >= 0.7 ? 'is-good' : value >= 0.45 ? 'is-mixed' : 'is-weak';
            if (metric === 'precision') return value >= 0.6 ? 'is-good' : value >= 0.35 ? 'is-mixed' : 'is-weak';
            if (metric === 'ignored') return value <= 0.35 ? 'is-good' : value <= 0.6 ? 'is-mixed' : 'is-weak';
            if (metric === 'cooldown') return value <= 0.35 ? 'is-good' : value <= 0.65 ? 'is-mixed' : 'is-weak';
            return 'is-neutral';
        };

        return React.createElement('div', {
            className: 'advice-diagnostics-modal-overlay',
            role: 'presentation',
            onClick: (e) => {
                e.stopPropagation();
                onClose && onClose();
            }
        },
            React.createElement('div', {
                className: 'advice-diagnostics-modal',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': 'Диагностика advice engine',
                onClick: (e) => e.stopPropagation()
            },
                React.createElement('div', { className: 'advice-diagnostics-modal__header' },
                    React.createElement('div', { className: 'advice-diagnostics-modal__title-wrap' },
                        React.createElement('div', { className: 'advice-diagnostics-modal__eyebrow' }, 'Advice diagnostics'),
                        React.createElement('div', { className: 'advice-diagnostics-modal__title' }, 'Что реально происходило сегодня'),
                        React.createElement('div', { className: 'advice-diagnostics-modal__subtitle' },
                            `Лог за ${diagnostics.date || 'сегодня'} · snapshots ${diagnostics.snapshotCount || 0} · events ${diagnostics.eventCount || 0}`
                        )
                    ),
                    React.createElement('button', {
                        className: 'advice-diagnostics-modal__close',
                        onClick: onClose,
                        type: 'button',
                        'aria-label': 'Закрыть диагностику'
                    }, '×')
                ),

                React.createElement('div', { className: 'advice-diagnostics-modal__body' },
                    React.createElement('div', { className: 'advice-diagnostics-summary-card' },
                        React.createElement('div', { className: 'advice-diagnostics-summary-card__row' },
                            React.createElement('div', null,
                                React.createElement('div', { className: 'advice-diagnostics-summary-card__score' }, summary.qualityScore ?? '—'),
                                React.createElement('div', { className: 'advice-diagnostics-summary-card__score-label' }, 'качество дня')
                            ),
                            React.createElement('div', {
                                className: `advice-diagnostics-grade ${getQualityGradeClass(summary.qualityGrade || quality.grade)}`
                            }, getQualityGradeLabel(summary.qualityGrade || quality.grade))
                        ),
                        summary.dominantIssue?.key && React.createElement('div', { className: 'advice-diagnostics-summary-card__issue' },
                            summary.dominantIssue?.message
                                ? summary.dominantIssue.message
                                : `Главный блокер: ${summary.dominantIssue?.label || humanizeBlocker(summary.dominantIssue.key)} · ${summary.dominantIssue.count || 0}`
                        )
                    ),

                    React.createElement('div', { className: 'advice-diagnostics-stat-grid' },
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('coverage', effect.coverage)}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Покрытие'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatPercentValue(effect.coverage))
                        ),
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('precision', effect.precisionProxy, { hasEvidence: hasPrecisionEvidence })}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Точность сигнала'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatDiagnosticsMetricValue('precision', effect.precisionProxy, { hasEvidence: hasPrecisionEvidence }))
                        ),
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('ignored', effect.ignoredRate)}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Проигнорировано'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatPercentValue(effect.ignoredRate))
                        ),
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('cooldown', effect.suppressedByCooldownRate)}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Подавлено cooldown'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatPercentValue(effect.suppressedByCooldownRate))
                        )
                    ),

                    React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'События взаимодействий'),
                        React.createElement('div', { className: 'advice-diagnostics-chip-grid' },
                            [
                                ['shown', 'shown'],
                                ['read', 'read'],
                                ['click', 'click'],
                                ['hidden', 'hidden'],
                                ['positive', 'positive'],
                                ['negative', 'negative'],
                                ['manualOpen', 'manual open']
                            ].map(([key, label]) => React.createElement('div', {
                                key,
                                className: 'advice-diagnostics-chip'
                            },
                                React.createElement('span', { className: 'advice-diagnostics-chip__label' }, label),
                                React.createElement('span', { className: 'advice-diagnostics-chip__value' }, eventFunnel[key] || 0)
                            ))
                        ),
                        manualEventsExceedShown && React.createElement('div', {
                            className: 'advice-diagnostics-section__hint'
                        }, 'Клики могут приходить из manual drawer, поэтому это не strict toast funnel.')
                    ),

                    findings.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Что бросается в глаза'),
                        React.createElement('ul', { className: 'advice-diagnostics-list' },
                            findings.slice(0, 4).map((item, index) => React.createElement('li', {
                                key: `finding_${index}`,
                                className: 'advice-diagnostics-list__item'
                            }, humanizeAdviceInsight(item)))
                        )
                    ),

                    silentModules.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Модули без выдачи'),
                        React.createElement('div', { className: 'advice-diagnostics-tags' },
                            silentModules.map(moduleName => React.createElement('span', {
                                key: moduleName,
                                className: 'advice-diagnostics-tag is-muted'
                            }, moduleName))
                        )
                    ),

                    topReasonsForDisplay.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Главные блокеры'),
                        React.createElement('div', { className: 'advice-diagnostics-tags' },
                            topReasonsForDisplay.map(item => React.createElement('span', {
                                key: item.key,
                                className: 'advice-diagnostics-tag'
                            }, `${humanizeBlocker(item.key, item.count || 0)} · ${item.count || 0}`))
                        )
                    ),

                    activeModules.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Активные модули'),
                        React.createElement('div', { className: 'advice-diagnostics-module-list' },
                            activeModules.map(item => {
                                const displayBlocker = getDisplayBlocker(item.topBlockers);
                                return React.createElement('div', {
                                    key: item.module,
                                    className: 'advice-diagnostics-module-row'
                                },
                                    React.createElement('div', { className: 'advice-diagnostics-module-row__name' }, item.module),
                                    React.createElement('div', { className: 'advice-diagnostics-module-row__meta' }, `${item.withOutput}/${item.runs} запусков дали совет`),
                                    React.createElement('div', { className: 'advice-diagnostics-module-row__sub' },
                                        displayBlocker
                                            ? `главный блокер: ${humanizeBlocker(displayBlocker.key, displayBlocker.count || 0)} · ${displayBlocker.count || 0}`
                                            : `средняя выдача: ${item.avgOutputCount ?? 0}`
                                    )
                                );
                            })
                        )
                    ),

                    lastSnapshot && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Последний snapshot'),
                        React.createElement('div', { className: 'advice-diagnostics-last-snapshot' },
                            React.createElement('div', { className: 'advice-diagnostics-last-snapshot__row' },
                                React.createElement('span', null, `trigger: ${lastSnapshot.trigger || '—'}`),
                                React.createElement('span', null, `видно вручную: ${lastSnapshot.visibleForManualCount || 0}`)
                            ),
                            React.createElement('div', { className: 'advice-diagnostics-last-snapshot__row' },
                                React.createElement('span', null, `подходит для auto-toast: ${lastSnapshot.eligibleForAutoToastCount || 0}`),
                                React.createElement('span', null, `primary: ${lastSnapshot.primaryId || '—'}`)
                            )
                        )
                    )
                ),

                React.createElement('div', { className: 'advice-diagnostics-modal__footer' },
                    React.createElement('button', {
                        className: 'advice-diagnostics-modal__action advice-diagnostics-modal__action--secondary',
                        onClick: onClose,
                        type: 'button'
                    }, 'Закрыть')
                )
            )
        );
    }

    function AdviceTechnicalModal({
        React,
        advice,
        onClose,
    }) {
        if (!advice) return null;

        const scienceBlurb = getAdviceScienceBlurb(advice);
        const sources = Array.isArray(advice?.expertMeta?.science?.sources)
            ? advice.expertMeta.science.sources
            : [];

        return React.createElement('div', {
            className: 'advice-v4-science-overlay',
            role: 'presentation',
            onClick: (e) => {
                e.stopPropagation();
                onClose && onClose();
            }
        },
            React.createElement('div', {
                className: 'advice-v4-science',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': 'Научное описание',
                onClick: (e) => e.stopPropagation()
            },
                React.createElement('div', { className: 'advice-v4-science__header' },
                    React.createElement('span', { className: 'advice-v4-science__title' }, 'Научное описание'),
                    React.createElement('button', {
                        className: 'advice-v4-science__close',
                        onClick: onClose,
                        type: 'button',
                        'aria-label': 'Закрыть'
                    }, '×')
                ),
                React.createElement('div', { className: 'advice-v4-science__body' },
                    React.createElement('h2', { className: 'advice-v4-science__advice-title' }, advice.text || 'Совет'),
                    scienceBlurb && React.createElement('section', { className: 'advice-v4-science__section' },
                        React.createElement('div', { className: 'advice-v4-science__section-label' }, 'Что за этим стоит'),
                        React.createElement('p', { className: 'advice-v4-science__text' }, scienceBlurb)
                    ),
                    sources.length > 0 && React.createElement('section', { className: 'advice-v4-science__section' },
                        React.createElement('div', { className: 'advice-v4-science__section-label' }, 'Исследования'),
                        React.createElement('div', { className: 'advice-v4-science__sources' },
                            sources.slice(0, 5).map((source, index) => {
                                const citation = formatAdviceSourceCitation(source);
                                if (!citation) return null;
                                return React.createElement('div', {
                                    key: `source_${index}`,
                                    className: 'advice-v4-science__source',
                                },
                                    React.createElement('div', { className: 'advice-v4-science__source-title' }, citation.title),
                                    citation.meta && React.createElement('div', { className: 'advice-v4-science__source-meta' }, citation.meta)
                                );
                            })
                        )
                    ),
                    React.createElement('p', { className: 'advice-v4-science__footnote' },
                        'Общие выводы исследований. Ваш случай может отличаться — при заболеваниях решения принимает врач.'
                    )
                ),
                React.createElement('div', { className: 'advice-v4-science__footer' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-v4-science__primary',
                        onClick: onClose,
                    }, 'Понятно')
                )
            )
        );
    }

    function AdviceDetailModal({
        React,
        advice,
        onClose,
        onOpenTechnicalDetails,
        onMarkRead,
        onHideUntilTomorrow,
        ADVICE_CATEGORY_NAMES,
    }) {
        if (!advice) return null;

        const adviceDescription = getAdviceDescription(advice);
        const heroText = getAdviceHeroText(advice);
        const scienceBlurb = getAdviceScienceBlurb(advice);
        const hasEvidence = hasExpertContent(advice);
        const categoryRu = getAdviceCategoryRu(advice, ADVICE_CATEGORY_NAMES || {});

        return React.createElement('div', {
            className: 'advice-v4-detail-overlay',
            role: 'presentation',
            onClick: (e) => {
                e.stopPropagation();
                onClose && onClose();
            }
        },
            // Тот же запертый фокус, что у шторки. Без него строка «доступность»
            // не закрывается: деталь рисуется соседом шторки, фокус остаётся на
            // карточке внутри шторки, а ловушка шторки не выпускает Tab наружу —
            // и до новых кнопок «Прочитано» и «Скрыть до завтра» с клавиатуры
            // просто не дойти. Компонент ещё и возвращает фокус на строку-вход
            // «Детали», когда деталь закрывают.
            React.createElement(AdviceModalDialog, {
                className: 'advice-v4-detail',
                label: 'Детали совета',
                onClick: (e) => e.stopPropagation()
            },
                React.createElement('div', { className: 'advice-v4-detail__header' },
                    React.createElement('div', { className: 'advice-v4-detail__heading' },
                        React.createElement('span', { className: 'advice-v4-detail__eyebrow' },
                            `Совет · ${String(categoryRu).toLowerCase()}`
                        ),
                        React.createElement('h2', { className: 'advice-v4-detail__title' }, advice.text || 'Совет')
                    ),
                    React.createElement('button', {
                        className: 'advice-v4-detail__close',
                        onClick: onClose,
                        type: 'button',
                        'aria-label': 'Закрыть совет'
                    }, renderAdviceV4Icon(React, 'close'))
                ),
                React.createElement('div', { className: 'advice-v4-detail__body' },
                    heroText && React.createElement('section', { className: 'advice-v4-detail__hero' },
                        React.createElement('div', { className: 'advice-v4-detail__hero-label' }, 'Что важно сейчас'),
                        React.createElement('p', { className: 'advice-v4-detail__hero-text' }, heroText)
                    ),
                    adviceDescription && React.createElement('section', { className: 'advice-v4-detail__section' },
                        React.createElement('div', { className: 'advice-v4-detail__section-title' }, 'Детали'),
                        React.createElement('p', { className: 'advice-v4-detail__text' }, adviceDescription)
                    ),
                    hasEvidence && scienceBlurb && React.createElement('section', { className: 'advice-v4-detail__section' },
                        React.createElement('div', { className: 'advice-v4-detail__section-title' }, 'Научное описание'),
                        React.createElement('div', { className: 'advice-v4-detail__science-box' }, scienceBlurb)
                    ),
                    // Строка «служебные модалки»: техлог, диагностика и
                    // технические детали клиенту недоступны — их вход живёт в
                    // служебной створке настроек, «которая открывается только с
                    // ролью куратора или разработчика». Строка «деталь» держит
                    // вход в технические детали в ярусе «Научное описание»,
                    // поэтому он не удалён, а закрыт ролью: обе строки сходятся
                    // ровно на этом. Роли разработчика в коде нет — гейт пока
                    // только кураторский.
                    hasEvidence && isCuratorReadOnlyMode() && React.createElement('button', {
                        type: 'button',
                        className: 'advice-v4-detail__tech-link',
                        onClick: (e) => {
                            e.stopPropagation();
                            onOpenTechnicalDetails && onOpenTechnicalDetails(advice, e);
                        },
                    }, 'Технические детали', renderAdviceV4Icon(React, 'chevron-right'))
                ),
                React.createElement('div', { className: 'advice-v4-detail__footer' },
                    // Строка контракта tips «доступность»: «жесты влево и вправо
                    // дублируются действиями в детали совета — свайп не
                    // единственный способ». Свайпнуть нельзя с клавиатуры и со
                    // скринридером, поэтому здесь настоящие <button> в потоке
                    // фокуса с подписями жестов из строки «жесты» (влево —
                    // прочитано, вправо — скрыть до завтра), а не div с
                    // обработчиком. Кадр «Совет · деталь» рисует в подвале одну
                    // «Понятно» — отступление от кадра в пользу контракта.
                    (typeof onMarkRead === 'function' || typeof onHideUntilTomorrow === 'function')
                    && React.createElement('div', {
                        className: 'advice-v4-detail__actions',
                        // Геометрия инлайном: строка «вид детали совета» подвал
                        // не описывает, а править продуктовый CSS эта задача не
                        // может. Цвет и высота 44 — из общего класса кнопки.
                        style: { display: 'flex', gap: '8px', marginBottom: '10px' },
                    },
                        typeof onMarkRead === 'function' && React.createElement('button', {
                            key: 'read',
                            type: 'button',
                            className: 'advice-v4-panel__btn advice-v4-panel__btn--miss advice-v4-detail__action advice-v4-detail__action--read',
                            onClick: (e) => {
                                e.stopPropagation();
                                onMarkRead(advice, e);
                            },
                        }, renderAdviceV4Icon(React, 'check'), 'Прочитано'),
                        typeof onHideUntilTomorrow === 'function' && React.createElement('button', {
                            key: 'hide',
                            type: 'button',
                            className: 'advice-v4-panel__btn advice-v4-panel__btn--miss advice-v4-detail__action advice-v4-detail__action--hide',
                            onClick: (e) => {
                                e.stopPropagation();
                                onHideUntilTomorrow(advice, e);
                            },
                        }, renderAdviceV4Icon(React, 'thumb-down'), 'Скрыть до завтра')
                    ),
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-v4-detail__primary',
                        onClick: () => setTimeout(onClose, 0),
                    }, 'Понятно')
                )
            )
        );
    }

    // Строка «доступность»: шторка советов — модальный диалог с запертым
    // фокусом; деталь совета берёт ту же ловушку. Отдельный компонент нужен ради
    // хука: renderManualAdviceList — обычная функция, хуки в ней недопустимы.
    const ADVICE_FOCUSABLE_SELECTOR =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function AdviceModalDialog({ className, label, onClick, onTouchStart, onTouchMove, onTouchEnd, children }) {
        const nodeRef = React.useRef(null);

        React.useEffect(() => {
            const node = nodeRef.current;
            if (!node) return undefined;
            const previouslyFocused = document.activeElement;
            try { node.focus({ preventScroll: true }); } catch (_) { /* noop */ }

            const handleKeyDown = (e) => {
                if (e.key !== 'Tab') return;
                const items = Array.from(node.querySelectorAll(ADVICE_FOCUSABLE_SELECTOR))
                    .filter((el) => el.offsetParent !== null);
                if (items.length === 0) { e.preventDefault(); return; }
                const first = items[0];
                const last = items[items.length - 1];
                const active = document.activeElement;
                if (e.shiftKey && (active === first || active === node || !node.contains(active))) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && (active === last || !node.contains(active))) {
                    e.preventDefault();
                    first.focus();
                }
            };

            node.addEventListener('keydown', handleKeyDown);
            return () => {
                node.removeEventListener('keydown', handleKeyDown);
                if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                    try { previouslyFocused.focus({ preventScroll: true }); } catch (_) { /* noop */ }
                }
            };
        }, []);

        return React.createElement('div', {
            ref: nodeRef,
            className,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': label,
            tabIndex: -1,
            onClick,
            onTouchStart,
            onTouchMove,
            onTouchEnd,
        }, children);
    }

    // --- AdviceCard component ---
    const AdviceCard = React.memo(function AdviceCard({
        advice,
        globalIndex,
        isDismissed,
        isHidden,
        swipeState,
        isExpanded,
        isLastDismissed,
        lastDismissedAction,
        onUndo,
        onClearLastDismissed,
        onSchedule,
        trackClick,
        onRate,
        onSwipeStart,
        onSwipeMove,
        onSwipeEnd,
        onLongPressStart,
        onLongPressEnd,
        registerCardRef,
        onOpenDetails,
    }) {
        const adviceDescription = getAdviceScienceSummary(advice);
        const hasTechnicalDetails = hasExpertContent(advice);
        const hasExpandedContent = !!(adviceDescription || hasTechnicalDetails);

        const swipeX = swipeState?.x || 0;
        const swipeDirection = swipeState?.direction;
        const swipeProgress = Math.min(1, Math.abs(swipeX) / 100);
        const showUndo = isLastDismissed && (isDismissed || isHidden);

        // Строка «панель оценки»: свайп влево сужает карточку на 96 px справа —
        // сама она не сдвигается. Поэтому влево едет только правая граница
        // (margin-right), а translateX остаётся жестом «скрыть» вправо: если
        // сдвинуть карточку, первые 96 px уходят под край и человек оценивает
        // совет, которого не видит. Полоса состояния и текст этим не двигаются
        // вовсе — они привязаны к левому краю карточки (15 px и 30 px).
        const ratingOpen = !!swipeState?.rating;
        const ratingWidth = ratingOpen
            ? ADVICE_RATING_PANEL_WIDTH
            : Math.min(ADVICE_RATING_PANEL_WIDTH, Math.max(0, -swipeX));
        const isDraggingCard = !ratingOpen && !!swipeDirection;
        const rateLockRef = React.useRef(0);

        if ((isDismissed || isHidden) && !showUndo) return null;
        if (showUndo) return null;

        const rate = (isPositive, e) => {
            e?.stopPropagation?.();
            // Строка «повторный тап»: 350 мс защиты там, где повтор создаёт
            // лишнюю сущность. Вторая оценка того же совета — именно такой
            // случай, поэтому окно закрывается до того, как панель успеет уйти.
            const now = Date.now();
            if (now - rateLockRef.current < ADVICE_RATE_REPEAT_GUARD_MS) return;
            rateLockRef.current = now;
            if (onRate) onRate(advice, isPositive, e);
            // Строка «панель оценки»: после ответа кнопки исчезают, карточка
            // возвращается на место. Совет остаётся в списке — ни «Помогло», ни
            // «Не показывать такие» его отсюда не убирают.
            onSwipeEnd(advice.id);
        };

        return React.createElement('div', {
            className: 'advice-list-item-wrapper' + (ratingOpen ? ' advice-list-item-wrapper--rating' : ''),
            'data-advice-category': advice.category || advice.ruleCategory || 'general',
            style: {
                animationDelay: `${globalIndex * 50}ms`,
                '--stagger-delay': `${globalIndex * 50}ms`,
                position: 'relative',
            },
        },
            React.createElement('div', { className: 'advice-list-item-frame' },
                // Строка «панель оценки»: в освободившемся месте открывается
                // панель шириной 96 с подписью «Полезно?».
                ratingWidth > 0 && React.createElement('div', {
                    className: 'advice-v4-rate-panel',
                    'aria-hidden': !ratingOpen,
                }, React.createElement('span', { className: 'advice-v4-rate-panel__label' }, 'Полезно?')),
                React.createElement('div', {
                    className: 'advice-list-item-bg advice-list-item-bg-right',
                    style: { opacity: swipeDirection === 'right' ? swipeProgress : 0 },
                }, React.createElement('span', { className: 'advice-list-item-bg__label' },
                    renderAdviceV4Icon(React, 'thumb-down'),
                    'Скрыть'
                )),
                React.createElement('div', {
                    ref: (el) => registerCardRef(advice.id, el),
                    className: `advice-list-item advice-list-item-v4 advice-list-item-${advice.type}${isExpanded ? ' expanded' : ''}`,
                    style: {
                        transform: `translateX(${Math.max(0, swipeX)}px)`,
                        marginRight: `${ratingWidth}px`,
                        transition: isDraggingCard
                            ? 'none'
                            : `margin-right ${ADVICE_RATING_RETURN_MS}ms ease, transform ${ADVICE_RATING_RETURN_MS}ms ease`,
                        touchAction: 'pan-y',
                    },
                    onClick: (e) => {
                        // Панель оценки открыта — тап по карточке её закрывает, а
                        // не проваливается в деталь: иначе единственный способ
                        // отказаться от ответа это свайп обратно.
                        if (ratingOpen) {
                            e.stopPropagation();
                            onSwipeEnd(advice.id);
                            return;
                        }
                        if (Math.abs(swipeX) > 10) return;
                        e.stopPropagation();
                    // 🚀 PERF R38: defer heavy details open (167–184ms → ~0ms click)
                    setTimeout(() => {
                        if (trackClick) trackClick(advice);
                        onOpenDetails && onOpenDetails(advice, e);
                    }, 0);
                },
                onTouchStart: (e) => {
                    onSwipeStart(advice.id, e);
                    onLongPressStart(advice.id);
                },
                onTouchMove: (e) => {
                    onSwipeMove(advice.id, e);
                    onLongPressEnd();
                },
                onTouchEnd: () => {
                    setTimeout(() => { onSwipeEnd(advice.id); onLongPressEnd(); }, 0);
                },
            },
                React.createElement('span', { className: 'advice-list-icon' }, advice.icon),
                React.createElement('div', { className: 'advice-list-content' },
                    React.createElement('span', { className: 'advice-list-text' }, advice.text),
                    // Строка «вид карточки совета»: «Детали» — строка-вход с
                    // шевроном 14 px, а не раскрытие пояснения в карточке.
                    // Пояснение и «Технические детали» живут в детали совета.
                    hasExpandedContent && React.createElement('div', { className: 'advice-list-card-actions' },
                        React.createElement('button', {
                            type: 'button',
                            className: 'advice-card-footnote-link',
                            onClick: (e) => {
                                e.stopPropagation();
                                // 🚀 PERF R38: тот же отложенный вход, что и по тапу карточки
                                setTimeout(() => {
                                    if (trackClick) trackClick(advice);
                                    onOpenDetails && onOpenDetails(advice, e);
                                }, 0);
                            }
                        }, 'Детали', renderAdviceV4Icon(React, 'chevron-right'))
                    ),
                    // 🎯 Phase B.3 (2026-05-31): in-card action buttons в drawer.
                    // Если rule имеет advice.action.primary — render 2 кнопки
                    // (primary + snooze) под текстом совета. Видимы всегда
                    // (не только expanded), чтобы юзер мог быстро действовать.
                    advice.action?.primary && React.createElement('div', {
                        className: 'advice-card-actions-row',
                        style: {
                            display: 'flex', gap: '8px', marginTop: '8px',
                            paddingTop: '6px', borderTop: '1px solid rgba(148,163,184,0.18)'
                        }
                    },
                        React.createElement('button', {
                            type: 'button',
                            onClick: (e) => {
                                e.stopPropagation();
                                const ok = window.HEYS?.adviceActions?.execute?.(advice);
                                if (onRate && ok !== false) onRate(advice, true, e);
                            },
                            style: {
                                flex: '1 1 65%',
                                padding: '8px 10px',
                                border: 'none',
                                borderRadius: '12px',
                                background: 'rgba(22, 163, 74, 0.16)',
                                color: '#15803d',
                                fontSize: '13px', fontWeight: 600,
                                cursor: 'pointer', lineHeight: 1.15,
                                textAlign: 'center'
                            }
                        }, advice.action.primary.label || '✓ Сделать'),
                        advice.action.snooze && React.createElement('button', {
                            type: 'button',
                            onClick: (e) => {
                                e.stopPropagation();
                                const minutes = Number(advice.action.snooze.remindAfterMinutes) || 120;
                                if (onSchedule) onSchedule(advice, minutes);
                            },
                            style: {
                                flex: '1 1 35%',
                                padding: '8px 10px',
                                border: 'none',
                                borderRadius: '12px',
                                background: 'rgba(59, 130, 246, 0.14)',
                                color: '#2563eb',
                                fontSize: '13px', fontWeight: 600,
                                cursor: 'pointer', lineHeight: 1.15,
                                textAlign: 'center'
                            }
                        }, advice.action.snooze.label || '⏰ Позже')
                    )
                )
                )
            ),
            // Строка «панель оценки»: под карточкой ряд из двух кнопок высотой 44
            // и радиусом 999 — «Помогло» заливкой --gr2 (flex 1) и «Не показывать
            // такие» фоном --c2 (flex 1,5). Третьей кнопки нет: «Нет» было бы
            // кнопкой в никуда, а главный полезный ответ здесь — «не советуй мне
            // это». Кнопки живут снаружи рамки карточки, поэтому и вынесены из
            // .advice-list-item-frame с его overflow.
            ratingOpen && React.createElement('div', { className: 'advice-v4-rate-actions' },
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-v4-rate-btn advice-v4-rate-btn--helped',
                    onClick: (e) => rate(true, e),
                }, 'Помогло'),
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-v4-rate-btn advice-v4-rate-btn--mute',
                    onClick: (e) => rate(false, e),
                }, 'Не показывать такие')
            ),
            ratingOpen && React.createElement('div', { className: 'advice-v4-rate-note' },
                'Оба ответа меняют, что вы увидите дальше. Совет остаётся в списке.'
            )
        );
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.AdviceCard = AdviceCard;

    // --- Curator read-only advice history ---
    // Курaтор открыл клиента → дроп-down 💡 показывает не live-карточки, а
    // историю outcomes (heys_advice_outcomes_v1 в LS клиента, downloaded
    // bootstrap'ом). Tap по карточке raises её tally, но ничего не пишется
    // (track* в advice/_core.js gate'нуты).
    function humanizeAdviceId(adviceId) {
        if (!adviceId || typeof adviceId !== 'string') return '—';
        return adviceId.replace(/^advice[_-]/i, '').replace(/[_-]/g, ' ');
    }
    function formatHistoryTime(ts) {
        if (!ts || typeof ts !== 'number') return '—';
        const d = new Date(ts);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        if (sameDay) return `сегодня ${hh}:${mm}`;
        const yest = new Date(now); yest.setDate(now.getDate() - 1);
        if (d.toDateString() === yest.toDateString()) return `вчера ${hh}:${mm}`;
        const dd = String(d.getDate()).padStart(2, '0');
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}.${mo} ${hh}:${mm}`;
    }
    // Категории совета: словарь id → читаемое русское имя группы. Параллелен
     // ADVICE_CATEGORY_NAMES (heys_advice_rules_v1), но локальный — здесь
     // используется как мелкая подпись к каждой строке истории.
    const CURATOR_HISTORY_CATEGORY_RU = {
        protein: 'белок', water: 'вода', sleep: 'сон', stress: 'стресс',
        carbs: 'углеводы', fats: 'жиры', fiber: 'клетчатка', kcal: 'калории',
        training: 'тренировка', meal: 'приёмы пищи', timing: 'тайминг',
        achievement: 'достижение', streak: 'streak', weight: 'вес',
        recovery: 'восстановление', mood: 'настроение', insulin: 'инсулин',
        gi: 'ГИ', deficit: 'дефицит', surplus: 'профицит', general: 'общее',
        weekly: 'неделя', daily: 'день', macro: 'макросы', micro: 'микро',
        hydration: 'гидратация', evening: 'вечер', morning: 'утро',
        first: 'первое', best: 'достижение',
    };
    function curatorHistoryCategoryRu(category) {
        if (!category || typeof category !== 'string') return '';
        return CURATOR_HISTORY_CATEGORY_RU[category] || category;
    }
    // Эвристика: достать категорию из advice-id когда live match отсутствует.
    // ID советов следуют паттерну `{topic}_{detail}_{detail}` или `{prefix}_{topic}`
    // (примеры из реальных outcomes: protein_low, water_reminder, streak_hint,
    // training_type_strength, deficit_fiber_satiety, weight_forecast_on_track).
    // Перебираем токены до первого матча в словаре — даёт чистую подпись без archive-шума.
    function inferCategoryFromAdviceId(id) {
        if (!id || typeof id !== 'string') return '';
        const tokens = id.toLowerCase().split(/[_\-\s]+/).filter(Boolean);
        for (const tok of tokens) {
            if (CURATOR_HISTORY_CATEGORY_RU[tok]) return tok;
        }
        return '';
    }

    function renderCuratorAdviceHistory({
        React, dismissToast, handleAdviceListTouchStart, handleAdviceListTouchMove, handleAdviceListTouchEnd,
        adviceRelevant,
    }) {
        let profiles = null;
        try {
            const storage = HEYS && HEYS.adviceOutcomeStorage;
            if (storage && typeof storage.getAdviceOutcomeProfiles === 'function') {
                profiles = storage.getAdviceOutcomeProfiles();
            }
        } catch (_) { profiles = null; }
        const adviceMap = (profiles && profiles.advice && typeof profiles.advice === 'object') ? profiles.advice : {};

        // Live catalog: id → { text, icon, category } из adviceRelevant.
        // Покрывает только активные сейчас советы; для устаревших ID — humanized fallback.
        const liveById = new Map();
        if (Array.isArray(adviceRelevant)) {
            for (const a of adviceRelevant) {
                if (a && a.id) liveById.set(a.id, a);
            }
        }

        const rows = Object.entries(adviceMap)
            .map(([id, stats]) => ({
                id,
                shown: (stats && stats.shown) || 0,
                read: (stats && stats.read) || 0,
                click: (stats && stats.click) || 0,
                positive: (stats && stats.positive) || 0,
                negative: (stats && stats.negative) || 0,
                hidden: (stats && stats.hidden) || 0,
                lastUpdated: (stats && stats.lastUpdated) || 0,
            }))
            .sort((a, b) => b.lastUpdated - a.lastUpdated)
            .slice(0, 50);

        return React.createElement('div', {
            className: 'advice-list-overlay',
            onClick: () => setTimeout(dismissToast, 0),
        },
            React.createElement('div', {
                className: 'advice-list-container',
                onClick: e => e.stopPropagation(),
                onTouchStart: handleAdviceListTouchStart,
                onTouchMove: handleAdviceListTouchMove,
                onTouchEnd: handleAdviceListTouchEnd,
            },
                React.createElement('div', { className: 'advice-list-header' },
                    React.createElement('div', { className: 'advice-list-header-top' },
                        React.createElement('span', null, `📜 История советов клиента (${rows.length})`),
                        React.createElement('span', { style: { fontSize: '0.78em', opacity: 0.7 } }, 'read-only')
                    )
                ),
                React.createElement('div', { className: 'advice-list-items', style: { padding: '8px 12px' } },
                    rows.length === 0
                        ? React.createElement('div', { style: { padding: '16px 0', textAlign: 'center', opacity: 0.6, fontSize: '0.9em' } },
                            'У клиента пока нет истории показанных советов.')
                        : rows.map((r) => {
                            const live = liveById.get(r.id) || null;
                            const icon = (live && live.icon) || '💡';
                            const humanTitle = (live && (live.text || live.title))
                                ? (live.text || live.title)
                                : humanizeAdviceId(r.id);
                            // Категория: предпочитаем live.category/theme, иначе heuristic
                            // по id (топик из токенов). Так для большинства советов
                            // покажется русская группа без шумного 'archive · ...'.
                            const liveCategory = live ? (live.category || live?.expertMeta?.theme || '') : '';
                            const inferredCategory = liveCategory || inferCategoryFromAdviceId(r.id);
                            const categoryLabel = inferredCategory ? curatorHistoryCategoryRu(inferredCategory) : '';
                            const isStale = !live;
                            return React.createElement('div', {
                                key: r.id,
                                style: {
                                    display: 'flex', flexDirection: 'column', gap: '3px',
                                    padding: '10px 8px', borderBottom: '1px solid var(--heys-border, rgba(0,0,0,0.08))',
                                    opacity: isStale ? 0.78 : 1,  // легче приглушить, не помечать словом
                                }
                            },
                                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' } },
                                    React.createElement('div', { style: { fontWeight: 500, fontSize: '0.92em', flex: 1, lineHeight: 1.3 } },
                                        `${icon} ${humanTitle}`),
                                    React.createElement('div', { style: { fontSize: '0.72em', opacity: 0.55, whiteSpace: 'nowrap', paddingTop: '2px' } },
                                        formatHistoryTime(r.lastUpdated))
                                ),
                                categoryLabel && React.createElement('div', {
                                    style: { fontSize: '0.72em', opacity: 0.55, fontStyle: 'italic' }
                                }, categoryLabel),
                                React.createElement('div', { style: { fontSize: '0.76em', opacity: 0.75, display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' } },
                                    r.shown > 0 && React.createElement('span', null, `👁 ${r.shown}`),
                                    r.read > 0 && React.createElement('span', null, `✓ ${r.read}`),
                                    r.click > 0 && React.createElement('span', null, `▶ ${r.click}`),
                                    r.positive > 0 && React.createElement('span', { style: { color: 'var(--heys-color-success, #2e7d32)' } }, `👍 ${r.positive}`),
                                    r.negative > 0 && React.createElement('span', { style: { color: 'var(--heys-color-warning, #d32f2f)' } }, `👎 ${r.negative}`),
                                    r.hidden > 0 && React.createElement('span', { style: { opacity: 0.5 } }, `✕ ${r.hidden}`)
                                )
                            );
                        })
                )
            )
        );
    }

    // --- Manual advice list UI ---
    const dayAdviceListUI = {};

    // ═════════════════════════════════════════════════════════════════
    // ⚕️ Phase 6 (2026-05-30): Medical disclaimer (one-time, synced)
    //
    // Юзер должен один раз acknowledge что советы основаны на
    // peer-reviewed research, но не заменяют врача. После accept'a —
    // не показывается и синкается как advice-key.
    // ═════════════════════════════════════════════════════════════════

    const MEDICAL_DISCLAIMER_KEY = 'heys_advice_disclaimer_accepted_v1';

    function isMedicalDisclaimerAcceptedValue(value) {
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function isMedicalDisclaimerAccepted() {
        try {
            if (HEYS.store?.get) {
                const fromStore = HEYS.store.get(MEDICAL_DISCLAIMER_KEY, null);
                if (fromStore !== null && fromStore !== undefined) {
                    return isMedicalDisclaimerAcceptedValue(fromStore);
                }
            }
            if (HEYS.utils?.lsGet) {
                const fromLs = HEYS.utils.lsGet(MEDICAL_DISCLAIMER_KEY, null);
                if (fromLs !== null && fromLs !== undefined) {
                    return isMedicalDisclaimerAcceptedValue(fromLs);
                }
            }
            const raw = localStorage.getItem(MEDICAL_DISCLAIMER_KEY);
            if (raw == null) return false;
            try { return isMedicalDisclaimerAcceptedValue(JSON.parse(raw)); }
            catch (_) { return isMedicalDisclaimerAcceptedValue(raw); }
        } catch (e) {
            return true; /* on error — assume accepted, не блокируем UI */
        }
    }

    function acceptMedicalDisclaimer() {
        try {
            if (HEYS.store?.set) {
                HEYS.store.set(MEDICAL_DISCLAIMER_KEY, true);
            } else if (HEYS.utils?.lsSet) {
                HEYS.utils.lsSet(MEDICAL_DISCLAIMER_KEY, true);
            } else {
                localStorage.setItem(MEDICAL_DISCLAIMER_KEY, 'true');
            }
        } catch (e) { /* noop */ }
    }

    function renderMedicalDisclaimer() {
        return null;
    }

    dayAdviceListUI.renderAdviceSharedOverlays = function renderAdviceSharedOverlays({
        React,
        adviceTrigger,
        toastVisible,
        medicalDisclaimerSessionDismissed,
        medicalDisclaimerNeverShow,
        onMedicalDisclaimerNeverShowChange,
        onMedicalDisclaimerContinue,
        adviceSettingsOpen,
        closeAdviceSettings,
        toastsEnabled,
        toggleToastsEnabled,
        adviceSoundEnabled,
        toggleAdviceSoundEnabled,
        adviceCategorySettings,
        toggleAdviceCategoryGroup,
    }) {
        const showDisclaimer = shouldShowMedicalDisclaimerGate(
            adviceTrigger,
            toastVisible,
            medicalDisclaimerSessionDismissed
        );

        if (!showDisclaimer && !adviceSettingsOpen) return null;

        return React.createElement(React.Fragment, null,
            showDisclaimer && React.createElement(AdviceMedicalDisclaimerGate, {
                React,
                neverShow: medicalDisclaimerNeverShow,
                onNeverShowChange: onMedicalDisclaimerNeverShowChange,
                onContinue: onMedicalDisclaimerContinue,
            }),
            adviceSettingsOpen && renderAdviceSettingsScreen(React, {
                onClose: closeAdviceSettings,
                toastsEnabled,
                adviceSoundEnabled,
                onToggleToasts: toggleToastsEnabled,
                onToggleSound: toggleAdviceSoundEnabled,
                categorySettings: adviceCategorySettings,
                onToggleCategoryGroup: toggleAdviceCategoryGroup,
            })
        );
    };

    dayAdviceListUI.renderManualAdviceList = function renderManualAdviceList({
        React,
        adviceTrigger,
        adviceRelevant,
        badgeAdvices,
        totalAdviceCount,
        toastVisible,
        dismissToast,
        getSortedGroupedAdvices,
        dismissedAdvices,
        hiddenUntilTomorrow,
        lastDismissedAdvice,
        adviceSwipeState,
        expandedAdviceId,
        trackClick,
        rateAdvice,
        handleAdviceSwipeStart,
        handleAdviceSwipeMove,
        handleAdviceSwipeEnd,
        handleAdviceLongPressStart,
        handleAdviceLongPressEnd,
        registerAdviceCardRef,
        handleAdviceListTouchStart,
        handleAdviceListTouchMove,
        handleAdviceListTouchEnd,
        handleDismissAll,
        dismissAllAnimation,
        toastsEnabled,
        toggleToastsEnabled,
        scheduleAdvice,
        undoLastDismiss,
        clearLastDismissed,
        copyAdviceTrace,
        adviceDiagnostics,
        adviceDiagnosticsOpen,
        openAdviceDiagnostics,
        closeAdviceDiagnostics,
        adviceDetailModalOpen,
        adviceDetailModalAdvice,
        openAdviceDetailModal,
        closeAdviceDetailModal,
        markAdviceDetailRead,
        hideAdviceDetailUntilTomorrow,
        adviceTechnicalDetails,
        adviceTechnicalDetailsOpen,
        openAdviceTechnicalDetails,
        closeAdviceTechnicalDetails,
        ADVICE_CATEGORY_NAMES,
        ewsWarnings,
        AdviceCard,
        undoCountdownSeconds,
        adviceServiceOpen,
        closeAdviceService,
        openAdviceRulesPool,
        closeAdviceRulesPool,
        adviceRulesPoolOpen,
        medicalDisclaimerSessionDismissed,
    }) {
        // 2026-05-31: Кураторская сессия видит советы так же как клиент при
        // нажатии на 💡 (manual mode), но auto-toast принудительно выключен
        // (см. forceCuratorToastsOff ниже + disabled toggle). Раньше был
        // отдельный renderCuratorAdviceHistory с read-only history client'a —
        // убрано чтобы курaтор видел текущие live-карточки точно как клиент.
        // Курaтор всё равно не пишет outcomes (гейчено в advice/_core.js
        // recordAdviceOutcomeEvent + track*).
        const drawerAdvices = Array.isArray(badgeAdvices) && badgeAdvices.length > 0
            ? badgeAdvices
            : adviceRelevant;
        const displayAdviceCount = typeof totalAdviceCount === 'number' ? totalAdviceCount : 0;

        const safeEwsWarnings = Array.isArray(ewsWarnings) ? ewsWarnings : [];
        const showDisclaimer = shouldShowMedicalDisclaimerGate(
            adviceTrigger,
            toastVisible,
            medicalDisclaimerSessionDismissed
        );
        if (showDisclaimer) return null;

        // Строка «служебные модалки»: вход в служебное живёт в служебной
        // створке настроек, а не в шапке шторки советов. Значит служебные слои
        // должны открываться и при закрытой шторке — рисуем их отдельным
        // куском, общим для обеих веток.
        const serviceOverlays = React.createElement(React.Fragment, { key: 'advice-service-layers' },
            adviceServiceOpen && renderAdviceServiceScreen(React, {
                onClose: closeAdviceService,
                onOpenTechLog: (e) => {
                    e?.stopPropagation?.();
                    closeAdviceService();
                    copyAdviceTrace();
                },
                onOpenDiagnostics: (e) => {
                    e?.stopPropagation?.();
                    closeAdviceService();
                    openAdviceDiagnostics(e);
                },
                onOpenRulesPool: (e) => {
                    e?.stopPropagation?.();
                    openAdviceRulesPool(e);
                },
            }),
            adviceDiagnosticsOpen && React.createElement(AdviceDiagnosticsModal, {
                React,
                diagnostics: adviceDiagnostics,
                onClose: closeAdviceDiagnostics
            }),
            adviceRulesPoolOpen && React.createElement(AdviceRulesPoolModal, {
                React,
                diagnostics: adviceDiagnostics,
                onClose: closeAdviceRulesPool,
            })
        );
        const serviceLayersOpen = !!(adviceServiceOpen || adviceDiagnosticsOpen || adviceRulesPoolOpen);

        if (!(adviceTrigger === 'manual' && toastVisible && (drawerAdvices?.length > 0 || safeEwsWarnings.length > 0))) {
            return serviceLayersOpen ? serviceOverlays : null;
        }

        const { sorted, groups } = getSortedGroupedAdvices(drawerAdvices);
        const groupKeys = Object.keys(groups);
        const feedbackAdvice = lastDismissedAdvice?.id
            ? (sorted.find((item) => item?.id === lastDismissedAdvice.id)
                || drawerAdvices.find((item) => item?.id === lastDismissedAdvice.id)
                || null)
            : null;
        const showSwipeFeedback = !!lastDismissedAdvice && !!feedbackAdvice;
        const adviceRatingSyncPending = hasPendingAdviceRatingSync();

        return React.createElement('div', {
            className: 'advice-list-overlay',
            // 🚀 PERF R32: defer dismissToast — 15 setState calls cascade (115ms → ~0ms click)
            onClick: () => setTimeout(dismissToast, 0),
        },
            React.createElement(AdviceModalDialog, {
                className: `advice-list-container advice-list-container--v4${dismissAllAnimation ? ' shake-warning' : ''}${showSwipeFeedback ? ' advice-list-container--feedback-open' : ''}`,
                label: displayAdviceCount > 0 ? `Советы, ${displayAdviceCount}` : 'Советы',
                onClick: e => e.stopPropagation(),
                onTouchStart: handleAdviceListTouchStart,
                onTouchMove: handleAdviceListTouchMove,
                onTouchEnd: handleAdviceListTouchEnd,
            },
                React.createElement('div', { className: 'advice-list-handle', 'aria-hidden': true }),
                React.createElement('div', { className: 'advice-list-header advice-list-header--v4' },
                    React.createElement('div', { className: 'advice-list-header-top' },
                        React.createElement('span', { className: 'advice-list-title' }, 'Советы',
                            // Строка «вид шапки шторки»: через пробел счётчик тем же
                            // кеглем весом 600 тоном чернил 42 % табличными цифрами.
                            displayAdviceCount > 0 && React.createElement('span', {
                                className: 'advice-list-title__count n',
                                'aria-hidden': 'true',
                            }, ' ' + displayAdviceCount)
                        ),
                        React.createElement('div', { className: 'advice-list-header-actions' },
                            // Строка «служебные модалки»: вход в служебное унесён
                            // в служебную створку настроек — створку диагностики
                            // (см. hdr-settings-sheet__diag-panel в
                            // heys_app_shell_v1.js). Здесь, рядом с клиентским
                            // «Прочитать все», его больше нет; гейт остался
                            // кураторским, а сам экран открывается событием
                            // heys:open-advice-service.
                            displayAdviceCount > 1 && React.createElement('button', {
                                className: 'advice-list-header-link advice-list-header-link--read-all',
                                onClick: handleDismissAll,
                                disabled: dismissAllAnimation,
                                title: 'Пометить все советы прочитанными',
                            }, 'Прочитать все')
                        )
                    )
                ),
                // Строка «не сохранено»: плашка встаёт в шторке НАД списком.
                // Кадр «Советы · не сохранено» рисует её сразу под ручкой, без
                // шапки шторки вовсе; верна строка — шапка остаётся, плашка
                // садится между ней и списком.
                renderAdviceSyncBanner(React, { pending: adviceRatingSyncPending }),
                React.createElement('div', { className: 'advice-list-items' },
                    // Группа предупреждений EWS — первой, до всех категорий советов,
                    // визуально плотнее и не сворачивается (UI v4, 2026-08-10).
                    safeEwsWarnings.length > 0 && React.createElement('div', {
                        key: 'ews-group',
                        className: 'advice-group advice-group--ews'
                    },
                        React.createElement('div', { className: 'advice-group-header advice-group-header--ews' },
                            'Предупреждения'
                        ),
                        safeEwsWarnings.map((warning, idx) =>
                            HEYS.EWSWarningCard
                                ? React.createElement(HEYS.EWSWarningCard, { key: warning.id || idx, warning })
                                : null
                        )
                    ),
                    groupKeys.length > 1
                        // 🚀 PERF A1: removed redundant .filter() — sorted already excludes dismissed/hidden
                        ? groupKeys.map(category => {
                            const categoryAdvices = groups[category];
                            if (categoryAdvices.length === 0) return null;

                            return React.createElement('div', { key: category, className: 'advice-group' },
                                React.createElement('div', { className: 'advice-group-header' },
                                    ADVICE_CATEGORY_NAMES[category] || category
                                ),
                                categoryAdvices.map((advice) =>
                                    React.createElement(AdviceCard, {
                                        key: advice.id,
                                        advice,
                                        globalIndex: sorted.indexOf(advice),
                                        isDismissed: dismissedAdvices.has(advice.id),
                                        isHidden: hiddenUntilTomorrow.has(advice.id),
                                        swipeState: adviceSwipeState[advice.id] || { x: 0, direction: null },
                                        isExpanded: expandedAdviceId === advice.id,
                                        isLastDismissed: lastDismissedAdvice?.id === advice.id,
                                        lastDismissedAction: lastDismissedAdvice?.action,
                                        onUndo: undoLastDismiss,
                                        onClearLastDismissed: clearLastDismissed,
                                        onSchedule: scheduleAdvice,
                                        trackClick,
                                        onRate: rateAdvice,
                                        onSwipeStart: handleAdviceSwipeStart,
                                        onSwipeMove: handleAdviceSwipeMove,
                                        onSwipeEnd: handleAdviceSwipeEnd,
                                        onLongPressStart: handleAdviceLongPressStart,
                                        onLongPressEnd: handleAdviceLongPressEnd,
                                        registerCardRef: registerAdviceCardRef,
                                        onOpenDetails: openAdviceDetailModal,
                                    })
                                )
                            );
                        })
                        // 🚀 PERF A1: removed redundant .filter() — sorted already excludes dismissed/hidden
                        : sorted.map((advice, index) => React.createElement(AdviceCard, {
                            key: advice.id,
                            advice,
                            globalIndex: index,
                            isDismissed: dismissedAdvices.has(advice.id),
                            isHidden: hiddenUntilTomorrow.has(advice.id),
                            swipeState: adviceSwipeState[advice.id] || { x: 0, direction: null },
                            isExpanded: expandedAdviceId === advice.id,
                            isLastDismissed: lastDismissedAdvice?.id === advice.id,
                            lastDismissedAction: lastDismissedAdvice?.action,
                            onUndo: undoLastDismiss,
                            onClearLastDismissed: clearLastDismissed,
                            onSchedule: scheduleAdvice,
                            trackClick,
                            onRate: rateAdvice,
                            onSwipeStart: handleAdviceSwipeStart,
                            onSwipeMove: handleAdviceSwipeMove,
                            onSwipeEnd: handleAdviceSwipeEnd,
                            onLongPressStart: handleAdviceLongPressStart,
                            onLongPressEnd: handleAdviceLongPressEnd,
                            registerCardRef: registerAdviceCardRef,
                            onOpenDetails: openAdviceDetailModal,
                        }))
                ),
                // Строка «жесты» отдаёт текст этой строки коду («дословно из
                // кода, без эмодзи»), поэтому она следует за жестом, а не за
                // прежней подписью: свайп влево теперь открывает панель оценки
                // (строка «панель оценки»), а не помечает прочитанным.
                displayAdviceCount > 0 && React.createElement('div', { className: 'advice-list-hints' },
                    React.createElement('span', { className: 'advice-list-hint-item' }, '← оценить'),
                    React.createElement('span', { className: 'advice-list-hint-divider' }, '·'),
                    React.createElement('span', { className: 'advice-list-hint-item' }, 'скрыть →'),
                    React.createElement('span', { className: 'advice-list-hint-divider' }, '·'),
                    React.createElement('span', { className: 'advice-list-hint-item' }, 'тап — открыть')
                ),
                showSwipeFeedback && lastDismissedAdvice.action === 'hidden' && renderAdviceHideUndoPanel(React, {
                    advice: feedbackAdvice,
                    secondsLeft: undoCountdownSeconds,
                    onUndo: (e) => {
                        e?.stopPropagation?.();
                        undoLastDismiss();
                    },
                })
            ),
            serviceOverlays,
            adviceDetailModalOpen && React.createElement(AdviceDetailModal, {
                React,
                advice: adviceDetailModalAdvice,
                onClose: closeAdviceDetailModal,
                onOpenTechnicalDetails: openAdviceTechnicalDetails,
                // Строка «доступность»: свайп не единственный способ.
                onMarkRead: markAdviceDetailRead,
                onHideUntilTomorrow: hideAdviceDetailUntilTomorrow,
                ADVICE_CATEGORY_NAMES,
            }),
            // Диагностика и пул правил живут в serviceOverlays выше: они
            // открываются и из служебного экрана при закрытой шторке.
            adviceTechnicalDetailsOpen && React.createElement(AdviceTechnicalModal, {
                React,
                advice: adviceTechnicalDetails,
                onClose: closeAdviceTechnicalDetails
            })
        );
    };

    // Строка «пустое состояние» (решение владельца 25 августа): плашка гаснет
    // тапом в любое место экрана, не только по себе. Слушатель на документе, а
    // не прозрачная подложка: подложка съела бы тап по нижнему меню и заперла
    // бы прокрутку, а промах должен гасить плашку, не отнимая следующий шаг.
    // Авто-таймера нет — гасит только тап (таймер здесь запрещён тестом
    // advice-menu-open «keeps empty advice drawer open until user dismisses it»).
    function EmptyAdviceToast({ React, dismissToast }) {
        const dismissRef = React.useRef(dismissToast);
        dismissRef.current = dismissToast;
        React.useEffect(() => {
            if (typeof document === 'undefined') return undefined;
            // Тап, открывший плашку, может ещё догорать в том же событии —
            // вооружаемся следующей задачей, иначе плашка гаснет мгновенно.
            let armed = false;
            let fired = false;
            const armId = setTimeout(() => { armed = true; }, 0);
            const onTap = () => {
                if (!armed || fired) return;
                fired = true;
                const fn = dismissRef.current;
                // 🚀 PERF R32: defer dismissToast — каскад setState бьёт по клику
                if (typeof fn === 'function') setTimeout(fn, 0);
            };
            // Два события, одно гашение: iOS не доводит click до документа при
            // тапе по неинтерактивному месту, а pointerdown есть не везде.
            document.addEventListener('pointerdown', onTap, true);
            document.addEventListener('click', onTap, true);
            return () => {
                clearTimeout(armId);
                document.removeEventListener('pointerdown', onTap, true);
                document.removeEventListener('click', onTap, true);
            };
        }, []);
        return React.createElement('div', {
            className: 'advice-v4-empty-toast',
            role: 'status',
            'aria-live': 'polite',
        },
            renderAdviceV4Icon(React, 'check'),
            React.createElement('span', { className: 'advice-v4-empty-toast__text' },
                'Пока всё по плану — советов нет'
            )
        );
    }

    dayAdviceListUI.renderEmptyAdviceToast = function renderEmptyAdviceToast({
        React,
        adviceTrigger,
        toastVisible,
        dismissToast,
        medicalDisclaimerSessionDismissed,
    }) {
        if (shouldShowMedicalDisclaimerGate(adviceTrigger, toastVisible, medicalDisclaimerSessionDismissed)) {
            return null;
        }
        if (!(adviceTrigger === 'manual_empty' && toastVisible)) return null;

        // Строка «пустое состояние»: шторка не открывается — показывается
        // всплывающая плашка над нижним меню. Гашение по тапу в любое место
        // экрана живёт в EmptyAdviceToast выше.
        return React.createElement(EmptyAdviceToast, { React, dismissToast });
    };

    HEYS.dayAdviceListUI = dayAdviceListUI;

    // --- Auto advice toast UI ---
    const dayAdviceToastUI = {};

    dayAdviceToastUI.renderAutoAdviceToast = function renderAutoAdviceToast({
        React,
        adviceTrigger,
        displayedAdvice,
        toastVisible,
        toastSwiped,
        toastSwipeX,
        toastRatedState,
        haptic,
        dismissToast,
        handleToastRate,
        handleToastTouchStart,
        handleToastTouchMove,
        handleToastTouchEnd,
        openAdviceDetailModal,
        medicalDisclaimerSessionDismissed,
        ADVICE_CATEGORY_NAMES,
        adviceTechnicalDetailsOpen,
        adviceTechnicalDetails,
        closeAdviceTechnicalDetails,
    }) {
        if (adviceTrigger === 'manual' || adviceTrigger === 'manual_empty') return null;
        if (!displayedAdvice || !toastVisible) return null;
        if (shouldShowMedicalDisclaimerGate(adviceTrigger, toastVisible, medicalDisclaimerSessionDismissed)) {
            return null;
        }

        const categoryRu = getAdviceCategoryRu(displayedAdvice, ADVICE_CATEGORY_NAMES || {});

        return React.createElement('div', {
            className: 'advice-v4-toast-wrap' + (toastSwiped ? ' advice-v4-toast-wrap--swiped' : ''),
            role: 'alert',
            'aria-live': 'polite',
            onTouchStart: handleToastTouchStart,
            onTouchMove: handleToastTouchMove,
            onTouchEnd: handleToastTouchEnd,
            style: toastSwiped ? undefined : {
                transform: `translateX(${toastSwipeX || 0}px)`,
                opacity: 1 - Math.abs(toastSwipeX || 0) / 150,
            },
        },
            toastSwiped && (toastRatedState
                ? React.createElement('div', { className: 'advice-v4-panel advice-v4-panel--toast-confirm' },
                    React.createElement('div', { className: 'advice-v4-panel__title advice-v4-panel__title--inline' },
                        renderAdviceV4Icon(React, toastRatedState === 'positive' ? 'thumb-up' : 'thumb-down'),
                        toastRatedState === 'positive' ? 'Учту как полезный' : 'Учту как мимо'
                    )
                )
                : renderAdviceReadFeedbackPanel(React, {
                    onRatePositive: (e) => handleToastRate && handleToastRate(true, e),
                    onRateNegative: (e) => handleToastRate && handleToastRate(false, e),
                    onSkip: (e) => {
                        e?.stopPropagation?.();
                        dismissToast && dismissToast();
                    },
                })),
            !toastSwiped && React.createElement('div', { className: 'advice-v4-toast-card' },
                // Кадр «Совет · всплывающий»: полоса состояния, текст с подписью
                // и крестик одним рядом — та же тройка, что у карточки в шторке.
                // Полоса несёт состояние, не категорию (строка «полоса слева»).
                React.createElement('div', { className: 'advice-v4-toast-card__row' },
                    React.createElement('span', {
                        className: 'advice-v4-toast-card__stripe'
                            + (displayedAdvice.type === 'success' ? ' advice-v4-toast-card__stripe--ok' : ''),
                        'aria-hidden': 'true',
                    }),
                    React.createElement('div', { className: 'advice-v4-toast-card__body' },
                        React.createElement('p', { className: 'advice-v4-toast-card__text' }, displayedAdvice.text),
                        React.createElement('p', { className: 'advice-v4-toast-card__meta' },
                            `${categoryRu} · тап — подробнее`
                        )
                    ),
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-v4-toast-card__close',
                        'aria-label': 'Убрать совет',
                        onClick: (e) => {
                            e.stopPropagation();
                            dismissToast && dismissToast();
                        },
                    }, renderAdviceV4Icon(React, 'close'))
                ),
                React.createElement('div', { className: 'advice-v4-toast-card__actions' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-v4-toast-card__secondary',
                        onClick: (e) => {
                            e.stopPropagation();
                            dismissToast && dismissToast();
                        },
                    }, 'Позже'),
                    React.createElement('button', {
                        type: 'button',
                        className: 'advice-v4-toast-card__primary',
                        onClick: (e) => {
                            e.stopPropagation();
                            openAdviceDetailModal && openAdviceDetailModal(displayedAdvice, e);
                        },
                    }, 'Открыть')
                )
            ),
            adviceTechnicalDetailsOpen && React.createElement(AdviceTechnicalModal, {
                React,
                advice: adviceTechnicalDetails,
                onClose: closeAdviceTechnicalDetails
            })
        );
    };

    HEYS.dayAdviceToastUI = dayAdviceToastUI;

    // --- Advice state hook ---
    const dayAdviceState = {};

    dayAdviceState.useAdviceState = function useAdviceState({
        React,
        day,
        date,
        prof,
        pIndex,
        prodSig,
        dayTot,
        normAbs,
        optimum,
        waterGoal,
        uiState,
        haptic,
        U,
        lsGet,
        currentStreak,
        currentMinute,
        setShowConfetti,
        HEYS: heysGlobal,
    }) {
        const { useState, useEffect, useMemo, useRef, useCallback } = React;
        const HEYSRef = heysGlobal || HEYS;
        const utils = U || HEYSRef.utils || {};

        const readStoredValue = useCallback((key, fallback) => {
            if (HEYSRef.store?.get) return HEYSRef.store.get(key, fallback);
            if (utils.lsGet) return utils.lsGet(key, fallback);
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return fallback;
                if (raw === 'true') return true;
                if (raw === 'false') return false;
                const first = raw[0];
                if (first === '{' || first === '[') return JSON.parse(raw);
                return raw;
            } catch (e) {
                return fallback;
            }
        }, [HEYSRef.store, utils.lsGet]);

        const setStoredValue = useCallback((key, value) => {
            if (HEYSRef.store?.set) {
                HEYSRef.store.set(key, value);
                return;
            }
            if (utils.lsSet) {
                utils.lsSet(key, value);
                return;
            }
            try {
                if (value && typeof value === 'object') {
                    localStorage.setItem(key, JSON.stringify(value));
                } else {
                    localStorage.setItem(key, String(value));
                }
            } catch (e) { }
        }, [HEYSRef.store, utils.lsSet]);

        const [toastVisible, setToastVisible] = useState(false);
        const [toastDismissed, setToastDismissed] = useState(false);
        const toastTimeoutRef = useRef(null);
        const [toastSwipeX, setToastSwipeX] = useState(0);
        const [toastSwiped, setToastSwiped] = useState(false);
        const [toastRatedState, setToastRatedState] = useState(null);
        const [toastScheduledConfirm, setToastScheduledConfirm] = useState(false);
        const [toastDetailsOpen, setToastDetailsOpen] = useState(false);
        const toastTouchStart = useRef(0);
        const toastInteractionTrackedRef = useRef(false);
        // Контракт «повторный тап · правило продукта»: второе нажатие оценки
        // совета в течение 350 мс после первого игнорируется — иначе дребезг
        // пальца или гонка событий на тач-устройстве засчитывает вторую оценку
        // за то же прочтение (см. tips.v4.dc.html, «safe-area и кнопка назад»
        // соседняя строка «повторный тап»).
        const toastRateLockRef = useRef(0);
        const autoSuppressionTrackedRef = useRef(new Set());

        const [adviceTrigger, setAdviceTrigger] = useState(null);
        const [adviceExpanded, setAdviceExpanded] = useState(false);
        const toastAppearedAtRef = useRef(0);
        const lastToastPresentationKeyRef = useRef('');
        const [displayedAdvice, setDisplayedAdvice] = useState(null);
        const [displayedAdviceList, setDisplayedAdviceList] = useState([]);
        const getCurrentAdviceClientId = useCallback(() => {
            try {
                const fromRuntime = HEYSRef?.currentClientId || window.HEYS?.currentClientId;
                if (fromRuntime && /^[0-9a-f-]{36}$/i.test(String(fromRuntime))) return String(fromRuntime);
                const fromPin = localStorage.getItem('heys_pin_auth_client');
                if (fromPin && /^[0-9a-f-]{36}$/i.test(String(fromPin))) return String(fromPin);
                const fromLast = localStorage.getItem('heys_last_client_id');
                if (fromLast && /^[0-9a-f-]{36}$/i.test(String(fromLast))) return String(fromLast);
            } catch (_) { }
            return '';
        }, [HEYSRef]);
        const parseAdviceSettingsRaw = useCallback((raw) => {
            if (!raw) return null;
            try {
                if (typeof raw === 'string' && raw.startsWith('¤Z¤') && HEYSRef.store?.decompress) {
                    return HEYSRef.store.decompress(raw);
                }
                return JSON.parse(raw);
            } catch (_) {
                return null;
            }
        }, [HEYSRef.store]);
        const readRawAdviceSettings = useCallback((allowUnscoped = false) => {
            try {
                const clientId = getCurrentAdviceClientId();
                if (clientId) {
                    const scopedRaw = localStorage.getItem(`heys_${clientId}_advice_settings`);
                    const scoped = parseAdviceSettingsRaw(scopedRaw);
                    if (scoped && typeof scoped === 'object' && !Array.isArray(scoped)) return scoped;
                    if (!allowUnscoped) return null;
                }
                if (allowUnscoped) {
                    const raw = localStorage.getItem('heys_advice_settings');
                    const parsed = parseAdviceSettingsRaw(raw);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                }
            } catch (_) { }
            return null;
        }, [getCurrentAdviceClientId, parseAdviceSettingsRaw]);
        const readAdviceSettings = useCallback(() => {
            try {
                const fromScopedRaw = readRawAdviceSettings(false);
                if (fromScopedRaw !== null) {
                    console.info('[HEYS.advice] ✅ readAdviceSettings: source=scopedLocalStorage', fromScopedRaw);
                    return fromScopedRaw;
                }
                const hasClientScope = !!getCurrentAdviceClientId();
                if (hasClientScope) {
                    console.info('[HEYS.advice] readAdviceSettings: scoped settings missing for current client, returning {}');
                    return {};
                }
                // 1. Try store for global/no-client bootstrap only. With a current
                // client, Store.get may migrate stale unscoped advice settings.
                if (HEYSRef.store?.get) {
                    const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                    if (fromStore !== null) {
                        console.info('[HEYS.advice] ✅ readAdviceSettings: source=store', fromStore);
                        return fromStore;
                    }
                    console.info('[HEYS.advice] ⚠️ readAdviceSettings: store returned null, trying lsGet');
                }
                // 2. Fallback to lsGet (encrypted localStorage, always available locally)
                if (utils.lsGet) {
                    const fromLs = utils.lsGet('heys_advice_settings', null);
                    if (fromLs !== null) {
                        console.info('[HEYS.advice] ✅ readAdviceSettings: source=lsGet', fromLs);
                        return fromLs;
                    }
                    console.info('[HEYS.advice] ⚠️ readAdviceSettings: lsGet returned null, trying raw localStorage');
                }
                // 3. Last resort: direct unscoped localStorage only before client scope exists.
                const fromRaw = readRawAdviceSettings(true);
                if (fromRaw !== null) {
                    console.info('[HEYS.advice] ✅ readAdviceSettings: source=rawLocalStorage', fromRaw);
                    return fromRaw;
                }
            } catch (e) { }
            console.info('[HEYS.advice] readAdviceSettings: no settings found, returning {}');
            return {};
        }, [HEYSRef.store, getCurrentAdviceClientId, readRawAdviceSettings, utils.lsGet]);
        // Два имени поля намеренно: `adviceSoundEnabled` пишет этот тумблер,
        // `soundEnabled` — исторический ключ (и галочка «Звук» в профиле →
        // «Настройки советов»). Терять запасное имя нельзя: у людей со старым
        // сохранённым значением тумблер иначе сбросится в дефолт.
        const getAdviceSoundEnabled = useCallback((settings) => {
            if (Object.prototype.hasOwnProperty.call(settings, 'adviceSoundEnabled')) {
                return settings.adviceSoundEnabled !== false;
            }
            if (Object.prototype.hasOwnProperty.call(settings, 'soundEnabled')) {
                return settings.soundEnabled !== false;
            }
            return null;
        }, []);

        const [toastsEnabled, setToastsEnabled] = useState(() => {
            try {
                const settings = readAdviceSettings();
                // Если в settings явно есть ключ — берём его значение.
                if (Object.prototype.hasOwnProperty.call(settings, 'toastsEnabled')) {
                    return settings.toastsEnabled !== false;
                }
                // Settings пусты. Различаем returning user (есть session/pin/last_client_id
                // в LS — sync скоро принесёт настройки) и нового юзера (никаких маркеров).
                // Для returning — стартуем с false чтобы не показывать toasts до прихода
                // реальных настроек; handleSyncCompleted позже подымет до true если у юзера ON.
                // Для нового — оставляем default true (исторический friendly behavior).
                let isReturning = false;
                try {
                    isReturning = !!localStorage.getItem('heys_pin_auth_client') ||
                                  !!localStorage.getItem('heys_session_token') ||
	                                  !!localStorage.getItem('heys_last_client_id') ||
	                                  !!localStorage.getItem('heys_curator_cookie_session_hint');
                } catch (_) { }
                return !isReturning;
            } catch (e) {
                return true;
            }
        });
        const [adviceSoundEnabled, setAdviceSoundEnabled] = useState(() => {
            try {
                const settings = readAdviceSettings();
                const soundVal = getAdviceSoundEnabled(settings);
                if (soundVal !== null) return soundVal;
                // Аналогично toastsEnabled: returning user → false до прихода sync.
                let isReturning = false;
                try {
                    isReturning = !!localStorage.getItem('heys_pin_auth_client') ||
                                  !!localStorage.getItem('heys_session_token') ||
	                                  !!localStorage.getItem('heys_last_client_id') ||
	                                  !!localStorage.getItem('heys_curator_cookie_session_hint');
                } catch (_) { }
                if (isReturning) return false;
                return true;
            } catch (e) {
                return true;
            }
        });
        const [adviceTraceCopyState, setAdviceTraceCopyState] = useState('idle');
        const [adviceDiagnosticsOpen, setAdviceDiagnosticsOpen] = useState(false);
        const [adviceDetailModalOpen, setAdviceDetailModalOpen] = useState(false);
        const [adviceDetailModalAdvice, setAdviceDetailModalAdvice] = useState(null);
        const [adviceTechnicalDetailsOpen, setAdviceTechnicalDetailsOpen] = useState(false);
        const [adviceTechnicalDetails, setAdviceTechnicalDetails] = useState(null);

        // On mount: re-read settings early (before 1500ms tab_open timer) in case
        // store was not ready during useState initializer (slow network race condition)
        useEffect(() => {
            const settings = readAdviceSettings();
            const newToastsEnabled = Object.prototype.hasOwnProperty.call(settings, 'toastsEnabled')
                ? settings.toastsEnabled !== false
                : null;
            const newSoundEnabled = getAdviceSoundEnabled(settings);
            console.info('[HEYS.advice] 🔍 mount useEffect: settings read', {
                settings,
                newToastsEnabled,
                newSoundEnabled,
                hasStore: !!HEYSRef.store?.get,
                hasLsGet: !!utils.lsGet,
            });
            if (newToastsEnabled !== null) setToastsEnabled(newToastsEnabled);
            if (newSoundEnabled !== null) setAdviceSoundEnabled(newSoundEnabled);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        useEffect(() => {
            const applyAdviceSettingsState = () => {
                try {
                    const settings = readAdviceSettings();
                    setToastsEnabled((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(settings, 'toastsEnabled')) return prev;
                        const cloudVal = settings.toastsEnabled !== false;
                        return prev !== cloudVal ? cloudVal : prev;
                    });
                    setAdviceSoundEnabled((prev) => {
                        const cloudVal = getAdviceSoundEnabled(settings);
                        if (cloudVal === null) return prev;
                        return prev !== cloudVal ? cloudVal : prev;
                    });
                } catch (e) {
                    HEYSRef.analytics?.trackError?.(e, { context: 'advice_settings_sync' });
                }
            };
            const handleSyncCompleted = () => applyAdviceSettingsState();
            const handleAdviceSettingsChanged = () => applyAdviceSettingsState();

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);
            window.addEventListener('heysAdviceSettingsChanged', handleAdviceSettingsChanged);
            return () => {
                window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
                window.removeEventListener('heysAdviceSettingsChanged', handleAdviceSettingsChanged);
            };
        }, [HEYSRef.analytics, getAdviceSoundEnabled, readAdviceSettings]);

        const [dismissedAdvices, setDismissedAdvices] = useState(() => {
            try {
                const saved = readStoredValue('heys_advice_read_today', null);
                if (saved) {
                    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                    if (parsed.date === new Date().toISOString().slice(0, 10)) {
                        return new Set(parsed.ids);
                    }
                }
            } catch (e) { }
            return new Set();
        });
        const [hiddenUntilTomorrow, setHiddenUntilTomorrow] = useState(() => {
            try {
                const saved = readStoredValue('heys_advice_hidden_today', null);
                if (saved) {
                    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                    if (parsed.date === new Date().toISOString().slice(0, 10)) {
                        return new Set(parsed.ids);
                    }
                }
            } catch (e) { }
            return new Set();
        });
        const [adviceSwipeState, setAdviceSwipeState] = useState({});
        const [expandedAdviceId, setExpandedAdviceId] = useState(null);
        const [dismissAllAnimation, setDismissAllAnimation] = useState(false);
        const [lastDismissedAdvice, setLastDismissedAdvice] = useState(null);
        const [undoFading, setUndoFading] = useState(false);
        const [adviceServiceOpen, setAdviceServiceOpen] = useState(false);
        const [adviceRulesPoolOpen, setAdviceRulesPoolOpen] = useState(false);
        const [adviceSettingsOpen, setAdviceSettingsOpen] = useState(false);
        const [medicalDisclaimerSessionDismissed, setMedicalDisclaimerSessionDismissed] = useState(false);
        const [medicalDisclaimerNeverShow, setMedicalDisclaimerNeverShow] = useState(false);
        const [adviceCategorySettings, setAdviceCategorySettings] = useState({});
        const [undoCountdownSeconds, setUndoCountdownSeconds] = useState(ADVICE_UNDO_SECONDS);
        const adviceSwipeStart = useRef({});
        const adviceCardRefs = useRef({});
        const dismissToastRef = useRef(null);
        const registerAdviceCardRef = useCallback((adviceId, el) => {
            if (el) adviceCardRefs.current[adviceId] = el;
        }, []);

        const adviceListTouchStartY = useRef(null);
        const adviceListTouchLastY = useRef(null);
        const adviceListTouchCanDismiss = useRef(false);
        const handleAdviceListTouchStart = useCallback((e) => {
            if (!e.touches?.length) return;
            const scrollContainer = e.currentTarget?.querySelector?.('.advice-list-items');
            const startedFromHeader = !!e.target?.closest?.('.advice-list-header');
            const startedInsideList = !!e.target?.closest?.('.advice-list-items');
            const isListAtTop = !scrollContainer || scrollContainer.scrollTop <= 0;
            adviceListTouchStartY.current = e.touches[0].clientY;
            adviceListTouchLastY.current = e.touches[0].clientY;
            adviceListTouchCanDismiss.current = startedFromHeader || (startedInsideList && isListAtTop);
        }, []);
        const handleAdviceListTouchMove = useCallback((e) => {
            if (!e.touches?.length || adviceListTouchStartY.current === null) return;
            const scrollContainer = e.currentTarget?.querySelector?.('.advice-list-items');
            if (scrollContainer && scrollContainer.scrollTop > 0) {
                adviceListTouchCanDismiss.current = false;
            }
            adviceListTouchLastY.current = e.touches[0].clientY;
        }, []);
        const handleAdviceListTouchEnd = useCallback(() => {
            if (adviceListTouchStartY.current === null || adviceListTouchLastY.current === null) return;
            const diff = adviceListTouchLastY.current - adviceListTouchStartY.current;
            adviceListTouchStartY.current = null;
            adviceListTouchLastY.current = null;
            const canDismiss = adviceListTouchCanDismiss.current;
            adviceListTouchCanDismiss.current = false;
            if (canDismiss && diff > 50 && typeof dismissToastRef.current === 'function') {
                dismissToastRef.current();
            }
        }, []);

        const ADVICE_PRIORITY = { warning: 0, insight: 1, tip: 2, achievement: 3, info: 4 };
        const ADVICE_CATEGORY_NAMES = {
            nutrition: 'Питание',
            training: 'Тренировки',
            weight: 'Вес',
            lifestyle: 'Режим',
            hydration: 'Вода',
            emotional: 'Психология',
            achievement: 'Достижения',
            motivation: 'Мотивация',
            personalized: 'Персональное',
            correlation: 'Корреляции',
            timing: 'Тайминг',
            sleep: 'Сон',
            activity: 'Активность',
        };

        // 🚀 PERF A1: compute activeCount inline to avoid extra .filter() on sorted
        const getSortedGroupedAdvices = useCallback((advices) => {
            if (!advices?.length) return { sorted: [], groups: {}, activeCount: 0 };
            const filtered = advices.filter(a =>
                (!dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id)) ||
                (lastDismissedAdvice?.id === a.id)
            );
            const sorted = [...filtered].sort((a, b) =>
                (ADVICE_PRIORITY[a.type] ?? 99) - (ADVICE_PRIORITY[b.type] ?? 99)
            );
            const groups = {};
            let activeCount = 0;
            sorted.forEach(advice => {
                const cat = advice.category || 'other';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(advice);
                if (!dismissedAdvices.has(advice.id)) activeCount++;
            });
            return { sorted, groups, activeCount };
        }, [dismissedAdvices, hiddenUntilTomorrow, lastDismissedAdvice]);

        const handleAdviceSwipeStart = useCallback((adviceId, e) => {
            const touch = e.touches?.[0];
            if (!touch) return;
            adviceSwipeStart.current[adviceId] = {
                startX: touch.clientX,
                startY: touch.clientY,
                lock: null,
                isSwiping: false,
            };
        }, []);
        const handleAdviceSwipeMove = useCallback((adviceId, e) => {
            const touch = e.touches?.[0];
            const gesture = adviceSwipeStart.current[adviceId];
            if (!touch || !gesture) return;

            const diffX = touch.clientX - gesture.startX;
            const diffY = touch.clientY - gesture.startY;
            const absX = Math.abs(diffX);
            const absY = Math.abs(diffY);

            if (!gesture.lock) {
                if (absX < ADVICE_SWIPE_VERTICAL_LOCK_THRESHOLD && absY < ADVICE_SWIPE_VERTICAL_LOCK_THRESHOLD) return;
                if (absY >= absX) {
                    gesture.lock = 'vertical';
                    setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: 0, direction: null } }));
                    return;
                }
                if (absX < ADVICE_SWIPE_HORIZONTAL_LOCK_THRESHOLD) return;
                gesture.lock = 'horizontal';
                gesture.isSwiping = true;
            }

            if (gesture.lock !== 'horizontal') return;

            const effectiveDistance = Math.max(0, absX - ADVICE_SWIPE_HORIZONTAL_LOCK_THRESHOLD);
            const diff = effectiveDistance === 0 ? 0 : Math.sign(diffX) * effectiveDistance;
            const direction = diff < 0 ? 'left' : 'right';
            setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: diff, direction } }));
        }, []);

        // Гейтов два, и они складываются: этот — частный («Звук» в настройках
        // советов), общий — HEYS.audio.masterEnabled из профиля. Без локальной
        // проверки тумблер был бы декоративным: HEYS.audio про советы не знает.
        const playAdviceSound = useCallback(() => {
            if (!adviceSoundEnabled) return;
            HEYS.feedback?.emit?.('advice.shown');
        }, [adviceSoundEnabled]);

        // Звука у скрытия совета нет: строка «звук · правило продукта» знает
        // один звук совета, а не пару «появился / убрали». Остаётся отклик
        // 10 мс — строка tips «вибрация 10 мс на скрытие совета свайпом».
        const emitAdviceHidden = useCallback(() => {
            HEYS.feedback?.emit?.('advice.hidden');
        }, []);

        const toggleToastsEnabled = useCallback(() => {
            setToastsEnabled(prev => {
                const newVal = !prev;
                try {
                    const settings = readAdviceSettings();
                    settings.toastsEnabled = newVal;
                    settings.updatedAt = Date.now();
                    if (HEYSRef.store?.set) {
                        HEYSRef.store.set('heys_advice_settings', settings);
                    } else if (utils.lsSet) {
                        utils.lsSet('heys_advice_settings', settings);
                    }
                    window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
                } catch (e) { }
                if (typeof haptic === 'function') haptic('light');
                return newVal;
            });
        }, [HEYSRef.store, haptic, readAdviceSettings, utils.lsSet]);

        // Пишем оба имени поля: `adviceSoundEnabled` читает этот тумблер,
        // `soundEnabled` — галочка «Звук» в профиле → «Настройки советов»,
        // чтобы два экрана не расходились.
        const toggleAdviceSoundEnabled = useCallback(() => {
            setAdviceSoundEnabled(prev => {
                const newVal = !prev;
                try {
                    const settings = readAdviceSettings();
                    settings.adviceSoundEnabled = newVal;
                    settings.soundEnabled = newVal;
                    settings.updatedAt = Date.now();
                    if (HEYSRef.store?.set) {
                        HEYSRef.store.set('heys_advice_settings', settings);
                    } else if (utils.lsSet) {
                        utils.lsSet('heys_advice_settings', settings);
                    }
                    window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
                } catch (e) { }
                if (typeof haptic === 'function') haptic('light');
                return newVal;
            });
        }, [HEYSRef.store, haptic, readAdviceSettings, utils.lsSet]);

        const [adviceModuleReady, setAdviceModuleReady] = useState(!!HEYSRef?.advice?.useAdviceEngine);

        useEffect(() => {
            if (adviceModuleReady) return;
            const checkInterval = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                if (HEYSRef?.advice?.useAdviceEngine) {
                    setAdviceModuleReady(true);
                    clearInterval(checkInterval);
                }
            }, 100);
            const timeout = setTimeout(() => clearInterval(checkInterval), 5000);
            return () => {
                clearInterval(checkInterval);
                clearTimeout(timeout);
            };
        }, [adviceModuleReady, HEYSRef]);

        const adviceEngine = adviceModuleReady ? HEYSRef.advice.useAdviceEngine : null;

        const hasClient = !!(HEYSRef?.currentClientId);
        const emptyAdviceResultRef = useRef({
            primary: null,
            relevant: [],
            adviceCount: 0,
            allAdvices: [],
            badgeAdvices: [],
            trace: null,
            markShown: null,
            markRead: null,
            markHidden: null,
            trackClick: null,
            rateAdvice: null,
            scheduleAdvice: null,
            scheduledCount: 0
        });
        const emptyAdviceResult = emptyAdviceResultRef.current;

        // Advice engine is a heavy pure calculation despite its historical
        // `useAdviceEngine` name. Running it on every local UI state update
        // returned fresh arrays/callbacks, which retriggered the toast effect
        // and caused a self-sustaining DayTab render loop. Recompute only when
        // an actual engine input changes. currentMinute keeps time-based rules
        // fresh without tying them to unrelated renders.
        const adviceInputKey = (() => {
            try {
                return JSON.stringify({
                    day,
                    date,
                    dayTot,
                    normAbs,
                    optimum,
                    waterGoal,
                    currentStreak,
                    adviceTrigger,
                    uiState,
                    prof,
                    prodSig,
                    currentMinute
                });
            } catch (_) {
                return [date, day?.updatedAt, optimum, waterGoal, currentStreak, adviceTrigger, prodSig, currentMinute].join('|');
            }
        })();

        const adviceDayIso = typeof date === 'string' ? date : '';
        const adviceTodayIso = (() => {
            try {
                return HEYSRef?.dayUtils?.todayISO?.() || new Date().toISOString().slice(0, 10);
            } catch (_) {
                return new Date().toISOString().slice(0, 10);
            }
        })();
        const adviceIsToday = !adviceDayIso || adviceDayIso === adviceTodayIso;

        const adviceResult = useMemo(() => {
            if (!adviceEngine || !hasClient || !adviceIsToday || isCuratorReadOnlyMode()) return emptyAdviceResult;
            return adviceEngine({
                dayTot,
                normAbs,
                optimum,
                displayOptimum: null,
                caloricDebt: null,
                day,
                pIndex,
                currentStreak,
                trigger: adviceTrigger,
                uiState,
                prof,
                waterGoal,
            });
        }, [
            adviceEngine,
            hasClient,
            adviceInputKey,
            emptyAdviceResult
        ]);

        const safeAdviceResult = adviceResult || emptyAdviceResult;
        const {
            primary: advicePrimary = null,
            relevant: adviceRelevant = [],
            adviceCount = 0,
            allAdvices = [],
            badgeAdvices = [],
            trace: adviceTrace = null,
            markShown = null,
            markRead = null,
            markHidden = null,
            rateAdvice = null,
            trackClick = null,
            scheduleAdvice = null,
            scheduledCount = 0,
        } = safeAdviceResult || {};

        const copyTextFallback = useCallback((text) => {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', 'true');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.pointerEvents = 'none';
                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
                const copied = document.execCommand('copy');
                document.body.removeChild(textarea);
                return copied;
            } catch (e) {
                return false;
            }
        }, []);

        const copyAdviceTrace = useCallback(async () => {
            if (!adviceTrace) {
                setAdviceTraceCopyState('error');
                return false;
            }

            const dailyLog = HEYSRef?.advice?.getDailyAdviceTraceLog?.(date);
            const dailyFormatter = HEYSRef?.advice?.formatDailyAdviceTraceForClipboard;
            const formatter = HEYSRef?.advice?.formatAdviceTraceForClipboard;
            const payload = (dailyLog && typeof dailyFormatter === 'function')
                ? dailyFormatter(dailyLog, { mode: 'clipboard', timelineLimit: 8 })
                : typeof formatter === 'function'
                    ? formatter(adviceTrace, { mode: 'clipboard' })
                    : JSON.stringify(adviceTrace, null, 2);

            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(payload);
                } else {
                    const copied = copyTextFallback(payload);
                    if (!copied) throw new Error('clipboard fallback failed');
                }

                setAdviceTraceCopyState('success');
                if (typeof haptic === 'function') haptic('light');
                HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'trace_exported', {
                    source: dailyLog ? 'daily_log' : 'single_trace',
                    trigger: adviceTrace?.trigger || null,
                    visibleForManualCount: adviceTrace?.outputs?.visibleForManualCount || 0,
                    eligibleForAutoToastCount: adviceTrace?.outputs?.eligibleForAutoToastCount || 0
                });
                console.info('[HEYS.advice] trace copied to clipboard');
                return true;
            } catch (e) {
                setAdviceTraceCopyState('error');
                console.error('[HEYS.advice] failed to copy trace:', e?.message || e);
                return false;
            }
        }, [adviceTrace, HEYSRef, copyTextFallback, haptic]);

        const adviceDiagnostics = useMemo(() => {
            try {
                if (!date || typeof HEYSRef?.advice?.getDailyAdviceTraceDiagnostics !== 'function') return null;
                return HEYSRef.advice.getDailyAdviceTraceDiagnostics(date);
            } catch (e) {
                console.error('[HEYS.advice] failed to build diagnostics modal payload:', e?.message || e);
                return null;
            }
        }, [date, HEYSRef, adviceTrace, toastVisible, adviceTrigger, adviceTraceCopyState]);

        const openAdviceDiagnostics = useCallback((e) => {
            if (e?.stopPropagation) e.stopPropagation();
            setAdviceDiagnosticsOpen(true);
            if (typeof haptic === 'function') haptic('light');
        }, [haptic]);

        const closeAdviceDiagnostics = useCallback((e) => {
            if (e?.stopPropagation) e.stopPropagation();
            setAdviceDiagnosticsOpen(false);
        }, []);

        const openAdviceDetailModal = useCallback((advice, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            if (!advice) return;
            setAdviceDetailModalAdvice(advice);
            setAdviceDetailModalOpen(true);
            if (typeof haptic === 'function') haptic('light');
        }, [haptic]);

        const closeAdviceDetailModal = useCallback((e) => {
            if (e?.stopPropagation) e.stopPropagation();
            setAdviceDetailModalOpen(false);
            setAdviceDetailModalAdvice(null);
        }, []);

        const openAdviceTechnicalDetails = useCallback((advice, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            if (!advice) return;
            setAdviceTechnicalDetails(advice);
            setAdviceTechnicalDetailsOpen(true);
            if (typeof haptic === 'function') haptic('light');
        }, [haptic]);

        const closeAdviceTechnicalDetails = useCallback((e) => {
            if (e?.stopPropagation) e.stopPropagation();
            setAdviceTechnicalDetailsOpen(false);
            setAdviceTechnicalDetails(null);
        }, []);

        useEffect(() => {
            if (adviceTraceCopyState === 'idle') return undefined;
            const timer = setTimeout(() => setAdviceTraceCopyState('idle'), 2200);
            return () => clearTimeout(timer);
        }, [adviceTraceCopyState]);

        useEffect(() => {
            if (!adviceDiagnosticsOpen && !adviceDetailModalOpen && !adviceTechnicalDetailsOpen) return undefined;
            const handleEscape = (event) => {
                if (event?.key === 'Escape') {
                    setAdviceDiagnosticsOpen(false);
                    setAdviceDetailModalOpen(false);
                    setAdviceDetailModalAdvice(null);
                    setAdviceTechnicalDetailsOpen(false);
                }
            };
            window.addEventListener('keydown', handleEscape);
            return () => window.removeEventListener('keydown', handleEscape);
        }, [adviceDiagnosticsOpen, adviceDetailModalOpen, adviceTechnicalDetailsOpen]);

        useEffect(() => {
            if (!adviceTrace) return;
            HEYSRef?.advice?.appendDailyAdviceTraceSnapshot?.(adviceTrace);
        }, [adviceTrace, HEYSRef]);

        const safeAdviceRelevant = Array.isArray(adviceRelevant) ? adviceRelevant : [];
        const safeBadgeAdvices = Array.isArray(badgeAdvices) ? badgeAdvices : [];
        const safeDismissedAdvices = dismissedAdvices instanceof Set ? dismissedAdvices : new Set();
        const safeHiddenUntilTomorrow = hiddenUntilTomorrow instanceof Set ? hiddenUntilTomorrow : new Set();

        const adviceOnlyCount = useMemo(() => {
            if (!Array.isArray(safeBadgeAdvices) || safeBadgeAdvices.length === 0) return 0;
            try {
                return safeBadgeAdvices.filter(a =>
                    a && a.id && !safeDismissedAdvices.has(a.id) && !safeHiddenUntilTomorrow.has(a.id)
                ).length;
            } catch (e) {
                return 0;
            }
        }, [safeBadgeAdvices, safeDismissedAdvices, safeHiddenUntilTomorrow]);

        // EWS слит со счётчиком лампочки советов (UI v4, 2026-08-10): app_shell
        // публикует свежий ewsData через window.HEYS.ewsSummary + событие
        // heysEWSSummaryUpdated (см. apps/web/heys_app_shell_v1.js). Лампочка
        // одна, счётчик = советы + предупреждения.
        const [ewsSummary, setEwsSummary] = useState(() => (typeof window !== 'undefined' ? window.HEYS?.ewsSummary : null) || null);
        useEffect(() => {
            const onUpdate = (e) => setEwsSummary(e.detail || null);
            window.addEventListener('heysEWSSummaryUpdated', onUpdate);
            return () => window.removeEventListener('heysEWSSummaryUpdated', onUpdate);
        }, []);
        const ewsWarnings = ewsSummary?.warnings || [];
        const totalAdviceCount = adviceOnlyCount + (ewsSummary?.count || 0);

        useEffect(() => {
            const badge = document.getElementById('nav-advice-badge');
            if (badge) {
                badge.textContent = totalAdviceCount > 0 ? totalAdviceCount : '';
                badge.style.display = totalAdviceCount > 0 ? 'flex' : 'none';
                // Строка «доступность»: счётчик не читается отдельным узлом —
                // лампочка и число озвучиваются одной фразой «Советы, 5».
                // Число живёт здесь, поэтому имя кнопки ставит тот же владелец.
                const lampButton = badge.closest('button');
                if (lampButton) {
                    lampButton.setAttribute(
                        'aria-label',
                        totalAdviceCount > 0 ? `Советы, ${totalAdviceCount}` : 'Советы'
                    );
                }
            }
        }, [totalAdviceCount]);

        useEffect(() => {
            const handleShowAdvice = () => {
                if (isCuratorReadOnlyMode()) return;
                const _runUpdate = () => {
                    if (totalAdviceCount > 0) {
                        const engineVisibleAdviceCount = Array.isArray(safeBadgeAdvices)
                            ? safeBadgeAdvices.length
                            : 0;
                        setAdviceTrigger('manual');
                        setAdviceExpanded(true);
                        setToastVisible(true);
                        setToastDismissed(false);
                        HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'manual_open', {
                            trigger: 'manual',
                            visibleAdviceCount: totalAdviceCount,
                            displayedAdviceCount: totalAdviceCount,
                            engineVisibleAdviceCount,
                            badgeCount: Array.isArray(safeBadgeAdvices) ? safeBadgeAdvices.length : 0,
                            filteredOutCount: Math.max(0, engineVisibleAdviceCount - totalAdviceCount),
                        });
                        haptic('light');
                    } else {
                        setAdviceTrigger('manual_empty');
                        setToastVisible(true);
                        setToastDismissed(false);
                        HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'manual_empty', {
                            trigger: 'manual_empty',
                            visibleAdviceCount: 0,
                            badgeCount: 0
                        });
                    }
                };
                // Manual menu open must be synchronous for all sessions. Otherwise
                // adviceTrigger/toastVisible can be deprioritized behind day sync
                // updates and the 💡 drawer stays visually closed.
                _runUpdate();
            };
            window.addEventListener('heysShowAdvice', handleShowAdvice);
            // Expose globally чтобы shell IIFE listener мог вызвать напрямую
            // в обход event mechanism (заметено что dispatch иногда не доходит
            // до listener'а в курaторской сессии — race condition / sync issue).
            window.__heysShowAdviceHandler = handleShowAdvice;
            return () => {
                window.removeEventListener('heysShowAdvice', handleShowAdvice);
                if (window.__heysShowAdviceHandler === handleShowAdvice) {
                    window.__heysShowAdviceHandler = null;
                }
            };
        }, [totalAdviceCount, haptic, HEYSRef, date, safeBadgeAdvices, adviceTrace]);

        useEffect(() => {
            const handleProductAdded = () => {
                if (HEYSRef.advice?.invalidateAdviceCache) {
                    HEYSRef.advice.invalidateAdviceCache();
                }
                setTimeout(() => setAdviceTrigger('product_added'), 500);
            };
            window.addEventListener('heysProductAdded', handleProductAdded);
            return () => window.removeEventListener('heysProductAdded', handleProductAdded);
        }, [HEYSRef.advice]);

        useEffect(() => {
            const checkScheduled = () => {
                try {
                    const rawScheduled = readStoredValue('heys_scheduled_advices', []) || [];
                    const scheduled = Array.isArray(rawScheduled) ? rawScheduled : [];
                    const now = Date.now();
                    const ready = scheduled.filter(s => s.showAt <= now);
                    if (ready.length > 0) {
                        setAdviceTrigger('scheduled');
                    }
                } catch (e) { }
            };
            const tick = () => {
                if (typeof document !== 'undefined' && document.hidden) return;
                checkScheduled();
            };
            const intervalId = setInterval(tick, 30000);
            const onVis = () => {
                if (typeof document !== 'undefined' && !document.hidden) checkScheduled();
            };
            document.addEventListener('visibilitychange', onVis);
            return () => {
                clearInterval(intervalId);
                document.removeEventListener('visibilitychange', onVis);
            };
        }, [readStoredValue]);

        useEffect(() => {
            // Cold-start guard (v1.0): if heys_advice_settings is absent from localStorage
            // (incognito / first visit), the user's toastsEnabled=false setting hasn't loaded
            // yet at 1500ms. Wait for Phase B sync (which carries CLIENT_SPECIFIC_KEYS incl.
            // heys_advice_settings) before firing tab_open.
            // Phase A is explicitly ignored — it has no dayv2 or advice settings.
            // Fallback: 5s if sync never arrives (offline, error, new user with no cloud data).
            const isColdStart = (() => {
                try {
                    const settings = readAdviceSettings();
                    return settings == null || Object.keys(settings).length === 0;
                } catch (_) {
                    return false;
                }
            })();

            if (!isColdStart) {
                // Normal path: settings already in localStorage (returning user)
                const timer = setTimeout(() => {
                    setToastsEnabled((currentVal) => {
                        console.info('[HEYS.advice] 🔔 tab_open timer fired: toastsEnabled =', currentVal);
                        return currentVal;
                    });
                    setAdviceTrigger('tab_open');
                }, 1500);
                return () => clearTimeout(timer);
            }

            // Cold-start path: wait for Phase B before triggering tab_open toast
            console.info('[HEYS.advice] 🛡️ cold-start guard: waiting for Phase B sync before tab_open');
            let fired = false;
            let fallbackTimer;

            const fireTabOpen = () => {
                if (fired) return;
                fired = true;
                clearTimeout(fallbackTimer);
                setToastsEnabled((currentVal) => {
                    console.info('[HEYS.advice] 🔔 tab_open (cold-start) fired: toastsEnabled =', currentVal);
                    return currentVal;
                });
                setAdviceTrigger('tab_open');
            };

            // Re-check that heys_advice_settings actually landed in LS.
            // Bootstrap completes BEFORE HOT-sync brings advice_settings, so
            // the first non-phaseA `heysSyncCompleted` event may still see
            // settings absent — keep listening for the next event.
            const adviceSettingsLanded = () => {
                try {
                    return Object.keys(readAdviceSettings()).length > 0;
                } catch (_) { return false; }
            };

            const handlePhaseB = (e) => {
                if (e && e.detail && e.detail.phaseA) return; // Phase A has no heys_advice_settings
                if (!adviceSettingsLanded()) {
                    console.info('[HEYS.advice] 🛡️ cold-start guard: settings still missing, waiting for next sync');
                    return;
                }
                // 100ms buffer so setToastsEnabled from the sibling heysSyncCompleted
                // listener has time to commit before advicePrimary effect evaluates it
                setTimeout(fireTabOpen, 100);
            };

            window.addEventListener('heysSyncCompleted', handlePhaseB);

            // Fallback: offline / error / new user with zero cloud data
            fallbackTimer = setTimeout(() => {
                // If offline and settings never loaded — don't show advice (conservative default)
                if (!navigator.onLine) {
                    console.info('[HEYS.advice] 🛡️ cold-start fallback (5s): offline — skipping tab_open');
                    const onOnlineResume = () => {
                        window.removeEventListener('online', onOnlineResume);
                        // Wait for Phase B after reconnect, then fire
                        const onSyncAfterOnline = (e) => {
                            if (e && e.detail && e.detail.phaseA) return;
                            window.removeEventListener('heysSyncCompleted', onSyncAfterOnline);
                            setTimeout(fireTabOpen, 100);
                        };
                        window.addEventListener('heysSyncCompleted', onSyncAfterOnline);
                        // Safety fallback: fire after 8s even if sync doesn't arrive
                        setTimeout(() => {
                            window.removeEventListener('heysSyncCompleted', onSyncAfterOnline);
                            fireTabOpen();
                        }, 8000);
                    };
                    window.addEventListener('online', onOnlineResume);
                    return;
                }
                console.info('[HEYS.advice] 🛡️ cold-start fallback (5s): firing tab_open');
                fireTabOpen();
            }, 5000);

            return () => {
                window.removeEventListener('heysSyncCompleted', handlePhaseB);
                clearTimeout(fallbackTimer);
            };
        }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

        useEffect(() => {
            if (!toastVisible) return;

            if (adviceTrigger === 'manual') {
                // Курaторский режим: НЕ даунгрейдим в manual_empty даже если
                // live советов 0 — history view не зависит от safeAdviceRelevant.
                if (safeAdviceRelevant.length === 0 && !isCuratorReadOnlyMode()) {
                    setExpandedAdviceId(null);
                    setAdviceTrigger('manual_empty');
                } else if (expandedAdviceId && !safeAdviceRelevant.some(item => item?.id === expandedAdviceId)) {
                    setExpandedAdviceId(null);
                }
                return;
            }

            if (adviceTrigger !== 'manual_empty' && displayedAdvice) {
                if (safeAdviceRelevant.length === 0) {
                    setToastVisible(false);
                    setDisplayedAdvice(null);
                    setDisplayedAdviceList([]);
                    setToastDetailsOpen(false);
                    setToastSwiped(false);
                    setToastRatedState(null);
                    setToastScheduledConfirm(false);
                    setAdviceTrigger(null);
                    return;
                }

                if (!isAdviceStillRelevant(displayedAdvice, safeAdviceRelevant)) {
                    setDisplayedAdvice(safeAdviceRelevant[0] || null);
                    setDisplayedAdviceList(safeAdviceRelevant);
                    setToastDetailsOpen(false);
                    setToastSwiped(false);
                    setToastRatedState(null);
                    setToastScheduledConfirm(false);
                }
            }
        }, [toastVisible, adviceTrigger, safeAdviceRelevant, displayedAdvice, expandedAdviceId]);

        useEffect(() => {
            if (!advicePrimary) return;

            const isManualTrigger = adviceTrigger === 'manual' || adviceTrigger === 'manual_empty';
            // This effect presents advice and fires one-shot side effects (sound,
            // haptic, markShown). Some callers pass unstable callback/array
            // references, so React can legitimately re-run it without a semantic
            // advice change. Guard the presentation itself to avoid a setter loop.
            const toastPresentationKey = JSON.stringify({
                date,
                adviceId: advicePrimary.id || null,
                trigger: adviceTrigger || null,
                relevantIds: safeAdviceRelevant.map((item) => item?.id || null),
                dismissed: dismissedAdvices.has(advicePrimary.id),
                hidden: hiddenUntilTomorrow.has(advicePrimary.id),
                toastsEnabled: !!toastsEnabled,
                curator: isCuratorReadOnlyMode()
            });
            if (lastToastPresentationKeyRef.current === toastPresentationKey) return;
            lastToastPresentationKeyRef.current = toastPresentationKey;

            // Курaтор НЕ видит auto-toast popup'ов. Manual клик по 💡 — открывает
            // history dropdown через renderManualAdviceList ниже.
            if (!isManualTrigger && isCuratorReadOnlyMode()) {
                setToastVisible(false);
                setDisplayedAdvice(null);
                setDisplayedAdviceList([]);
                return;
            }

            if (!isManualTrigger && dismissedAdvices.has(advicePrimary.id)) {
                const suppressionKey = `${date || 'unknown'}|${adviceTrigger || 'unknown'}|${advicePrimary.id}`;
                if (!autoSuppressionTrackedRef.current.has(suppressionKey)) {
                    autoSuppressionTrackedRef.current.add(suppressionKey);
                    HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'auto_suppressed_ui', {
                        adviceId: advicePrimary.id,
                        trigger: adviceTrigger || null,
                        reason: hiddenUntilTomorrow.has(advicePrimary.id)
                            ? 'hidden_until_tomorrow'
                            : 'dismissed_today',
                        module: advicePrimary?.__traceModule || null,
                        category: advicePrimary?.category || null
                    });
                }
                return;
            }

            // 2026-05-31: для куратора auto-toast принудительно выключен —
            // он смотрит данные клиента, советы только manual (через 💡).
            const _toastsBlockedForCurator = isCuratorReadOnlyMode();
            if (!isManualTrigger && (!toastsEnabled || _toastsBlockedForCurator)) {
                console.info('[HEYS.advice] 🚫 Toast BLOCKED: toastsEnabled=' + toastsEnabled +
                    ', curator=' + _toastsBlockedForCurator + ', adviceTrigger=' + adviceTrigger);
                setDisplayedAdvice(advicePrimary);
                setDisplayedAdviceList(safeAdviceRelevant);
                setToastVisible(false);
                return;
            }

            console.info('[HEYS.advice] ✅ Toast SHOWN: toastsEnabled=' + toastsEnabled + ', adviceTrigger=' + adviceTrigger);
            setDisplayedAdvice(advicePrimary);
            setDisplayedAdviceList(safeAdviceRelevant);
            setAdviceExpanded(false);
            setToastVisible(true);
            toastAppearedAtRef.current = Date.now();
            setToastDismissed(false);
            setToastDetailsOpen(false);
            setToastRatedState(null);

            // Звук совета один на все виды: три разных (успех / предупреждение /
            // появление) были тремя из десяти снятых. Вибрации на появлении нет
            // — совет не запись в данные.
            if (adviceSoundEnabled) HEYS.feedback?.emit?.('advice.shown');

            if (advicePrimary.onShow) advicePrimary.onShow();

            if (!isManualTrigger && markShown) markShown(advicePrimary);
        }, [advicePrimary?.id, adviceTrigger, adviceSoundEnabled, dismissedAdvices, hiddenUntilTomorrow, markShown, toastsEnabled, haptic, HEYSRef, safeAdviceRelevant, date]);

        useEffect(() => {
            setAdviceTrigger(null);
            setAdviceExpanded(false);
            setToastVisible(false);
            setDisplayedAdvice(null);
            setDisplayedAdviceList([]);
            setToastDetailsOpen(false);
            if (HEYSRef?.advice?.resetSessionAdvices) HEYSRef.advice.resetSessionAdvices();
        }, [date, HEYSRef]);

        useEffect(() => {
            if (uiState.showTimePicker || uiState.showWeightPicker ||
                uiState.showDeficitPicker || uiState.showZonePicker) {
                setAdviceExpanded(false);
            }
        }, [uiState.showTimePicker, uiState.showWeightPicker,
        uiState.showDeficitPicker, uiState.showZonePicker]);

        useEffect(() => {
            if (adviceTrigger !== 'manual') {
                setAdviceSwipeState({});
                setExpandedAdviceId(null);
                setDismissAllAnimation(false);
                setAdviceDiagnosticsOpen(false);
                setAdviceDetailModalOpen(false);
                setAdviceDetailModalAdvice(null);
                setAdviceTechnicalDetailsOpen(false);
                setAdviceTechnicalDetails(null);
            }
        }, [adviceTrigger]);

        useEffect(() => {
            const isManualAdviceDrawerOpen = adviceTrigger === 'manual' && toastVisible;
            const isAdviceOverlayOpen = isManualAdviceDrawerOpen || adviceDetailModalOpen || adviceTechnicalDetailsOpen || adviceDiagnosticsOpen || adviceRulesPoolOpen || adviceServiceOpen;
            if (!isAdviceOverlayOpen || typeof document === 'undefined') return undefined;

            const { body, documentElement } = document;
            if (!body || !documentElement) return undefined;

            const previousBodyOverflow = body.style.overflow;
            const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
            const previousDocumentOverflow = documentElement.style.overflow;
            const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

            body.style.overflow = 'hidden';
            body.style.overscrollBehavior = 'none';
            documentElement.style.overflow = 'hidden';
            documentElement.style.overscrollBehavior = 'none';

            console.info('[HEYS.advice] advice overlay scroll-lock enabled');

            return () => {
                body.style.overflow = previousBodyOverflow;
                body.style.overscrollBehavior = previousBodyOverscrollBehavior;
                documentElement.style.overflow = previousDocumentOverflow;
                documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
                console.info('[HEYS.advice] advice overlay scroll-lock released');
            };
        }, [adviceTrigger, toastVisible, adviceDetailModalOpen, adviceTechnicalDetailsOpen, adviceDiagnosticsOpen]);

        useEffect(() => {
            const timer = setTimeout(() => {
                try {
                    const value = new Date().toISOString().slice(0, 10);
                    setStoredValue('heys_last_visit', value);
                } catch (e) { }
            }, 3000);
            return () => clearTimeout(timer);
        }, [setStoredValue]);

        const handleToastTouchStart = (e) => {
            if (toastSwiped) return;
            e.stopPropagation();
            toastTouchStart.current = e.touches[0].clientX;
        };
        const handleToastTouchMove = (e) => {
            if (toastSwiped) return;
            e.stopPropagation();
            const diff = e.touches[0].clientX - toastTouchStart.current;
            if (diff < 0) {
                setToastSwipeX(diff);
            }
        };
        const handleToastTouchEnd = (e) => {
            if (toastSwiped) return;
            e.stopPropagation();
            if (toastSwipeX < -80) {
                setToastSwiped(true);
                setToastRatedState(null);
                setToastScheduledConfirm(false);
                if (toastTimeoutRef.current) {
                    clearTimeout(toastTimeoutRef.current);
                    toastTimeoutRef.current = null;
                }
            }
            setToastSwipeX(0);
        };

        const handleToastUndo = () => {
            setToastSwiped(false);
            setToastRatedState(null);
            setToastScheduledConfirm(false);
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = null;
            }
        };

        const handleToastInteraction = useCallback((source, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            if (!displayedAdvice || !trackClick) return;
            if (toastInteractionTrackedRef.current) return;
            trackClick(displayedAdvice, { source: source || 'toast_interaction' });
            toastInteractionTrackedRef.current = true;
        }, [displayedAdvice, trackClick]);

        const handleToastRate = (isPositive, e) => {
            e && e.stopPropagation();
            const now = Date.now();
            if (now - toastRateLockRef.current < ADVICE_RATE_REPEAT_GUARD_MS) return;
            toastRateLockRef.current = now;
            if (displayedAdvice && rateAdvice) {
                rateAdvice(displayedAdvice, isPositive);
                setToastRatedState(isPositive ? 'positive' : 'negative');
                setToastScheduledConfirm(false);
                // Оценка совета — не запись в данные дня и не необратимое
                // действие: отклика нет.
                setTimeout(() => {
                    dismissToast();
                }, 900);
            }
        };

        const handleToastSchedule = (e) => {
            e && e.stopPropagation();
            if (displayedAdvice && scheduleAdvice) {
                scheduleAdvice(displayedAdvice, 120);
                setToastRatedState(null);
                setToastScheduledConfirm(true);
                setTimeout(() => {
                    dismissToast();
                }, 1500);
            }
        };

        const undoLastDismiss = useCallback(() => {
            if (!lastDismissedAdvice) return;
            const { id, action, hideTimeout } = lastDismissedAdvice;

            if (hideTimeout) clearTimeout(hideTimeout);

            if (action === 'read' || action === 'hidden') {
                setDismissedAdvices(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(id);
                    try {
                        const saveData = {
                            date: new Date().toISOString().slice(0, 10),
                            ids: [...newSet],
                        };
                        setStoredValue('heys_advice_read_today', saveData);
                    } catch (e) { }
                    return newSet;
                });
            }
            if (action === 'hidden') {
                setHiddenUntilTomorrow(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(id);
                    try {
                        const saveData = {
                            date: new Date().toISOString().slice(0, 10),
                            ids: [...newSet],
                        };
                        setStoredValue('heys_advice_hidden_today', saveData);
                    } catch (e) { }
                    return newSet;
                });
            }

            setLastDismissedAdvice(null);
            haptic('light');
        }, [haptic, lastDismissedAdvice, setStoredValue]);

        const clearLastDismissed = useCallback(() => {
            if (lastDismissedAdvice?.hideTimeout) {
                clearTimeout(lastDismissedAdvice.hideTimeout);
            }
            setLastDismissedAdvice(null);
        }, [lastDismissedAdvice]);

        useEffect(() => {
            if (!lastDismissedAdvice) {
                setUndoCountdownSeconds(ADVICE_UNDO_SECONDS);
                return undefined;
            }
            setUndoCountdownSeconds(ADVICE_UNDO_SECONDS);
            const startedAt = Date.now();
            const tick = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                setUndoCountdownSeconds(Math.max(0, ADVICE_UNDO_SECONDS - elapsed));
            }, 250);
            return () => clearInterval(tick);
        }, [lastDismissedAdvice?.id, lastDismissedAdvice?.action]);

        const openAdviceService = useCallback((e) => {
            e?.stopPropagation?.();
            setAdviceServiceOpen(true);
        }, []);

        const closeAdviceService = useCallback(() => {
            setAdviceServiceOpen(false);
        }, []);

        const openAdviceSettings = useCallback(() => {
            setAdviceSettingsOpen(true);
        }, []);

        const closeAdviceSettings = useCallback(() => {
            setAdviceSettingsOpen(false);
        }, []);

        useEffect(() => {
            const handleOpenAdviceSettings = () => setAdviceSettingsOpen(true);
            window.addEventListener('heys:open-advice-settings', handleOpenAdviceSettings);
            return () => window.removeEventListener('heys:open-advice-settings', handleOpenAdviceSettings);
        }, []);

        // Строка «служебные модалки»: вход в служебное живёт в служебной створке
        // настроек. Створка кураторская, но гейт держим и здесь — событие
        // глобальное, и клиентская сессия не должна открывать служебный экран.
        useEffect(() => {
            const handleOpenAdviceService = () => {
                if (!isCuratorReadOnlyMode()) return;
                setAdviceServiceOpen(true);
            };
            window.addEventListener('heys:open-advice-service', handleOpenAdviceService);
            return () => window.removeEventListener('heys:open-advice-service', handleOpenAdviceService);
        }, []);

        useEffect(() => {
            const syncCategorySettings = () => {
                try {
                    const settings = readAdviceSettings();
                    if (settings?.categories) {
                        setAdviceCategorySettings({ ...settings.categories });
                    }
                } catch (_) { }
            };
            window.addEventListener('heysAdviceSettingsChanged', syncCategorySettings);
            window.addEventListener('heysSyncCompleted', syncCategorySettings);
            return () => {
                window.removeEventListener('heysAdviceSettingsChanged', syncCategorySettings);
                window.removeEventListener('heysSyncCompleted', syncCategorySettings);
            };
        }, [readAdviceSettings]);

        const toggleAdviceCategoryGroup = useCallback((keys, enabled) => {
            try {
                const settings = readAdviceSettings();
                const categories = { ...(settings.categories || {}) };
                keys.forEach((key) => {
                    if (key !== 'health') categories[key] = enabled;
                });
                settings.categories = categories;
                settings.updatedAt = Date.now();
                if (HEYSRef.store?.set) {
                    HEYSRef.store.set('heys_advice_settings', settings);
                } else if (utils.lsSet) {
                    utils.lsSet('heys_advice_settings', settings);
                }
                window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
                setAdviceCategorySettings(categories);
            } catch (_) { }
        }, [HEYSRef.store, readAdviceSettings, utils.lsSet]);

        const dismissMedicalDisclaimerGate = useCallback(() => {
            if (medicalDisclaimerNeverShow) acceptMedicalDisclaimer();
            setMedicalDisclaimerSessionDismissed(true);
        }, [medicalDisclaimerNeverShow]);

        const openAdviceRulesPool = useCallback((e) => {
            e?.stopPropagation?.();
            setAdviceServiceOpen(false);
            setAdviceRulesPoolOpen(true);
            if (typeof haptic === 'function') haptic('light');
        }, [haptic]);

        const closeAdviceRulesPool = useCallback((e) => {
            e?.stopPropagation?.();
            setAdviceRulesPoolOpen(false);
        }, []);

        // Строка контракта tips «доступность»: «жесты влево и вправо дублируются
        // действиями в детали совета — свайп не единственный способ». Тела обоих
        // жестов вынесены сюда, чтобы кнопка в детали приводила ровно к тому же
        // состоянию (LS, markRead/markHidden, звук, отмена с таймером), а не к
        // своей копии логики, которая со временем разъедется со свайпом.
        const applyAdviceRead = useCallback((adviceId) => {
            if (!adviceId) return;
            if (lastDismissedAdvice?.hideTimeout) clearTimeout(lastDismissedAdvice.hideTimeout);

            setDismissedAdvices(prev => {
                const newSet = new Set([...prev, adviceId]);
                const saveData = {
                    date: new Date().toISOString().slice(0, 10),
                    ids: [...newSet],
                };
                try {
                    setStoredValue('heys_advice_read_today', saveData);
                } catch (e) { }
                return newSet;
            });

            if (HEYSRef?.game?.addXP) {
                const cardEl = adviceCardRefs.current[adviceId];
                HEYSRef.game.addXP(0, 'advice_read', cardEl);
            }

            const advice = safeAdviceRelevant.find(item => item?.id === adviceId) || safeBadgeAdvices.find(item => item?.id === adviceId);
            if (advice && markRead) markRead(advice);

            playAdviceSound();
            haptic('light');

            setUndoFading(false);
            const hideTimeout = setTimeout(() => {
                setLastDismissedAdvice(null);
                setUndoFading(false);
            }, 3000);
            setLastDismissedAdvice({ id: adviceId, action: 'read', hideTimeout });
        }, [HEYSRef, haptic, lastDismissedAdvice, playAdviceSound, safeAdviceRelevant, safeBadgeAdvices, markRead, setStoredValue]);

        const applyAdviceHideUntilTomorrow = useCallback((adviceId) => {
            if (!adviceId) return;
            if (lastDismissedAdvice?.hideTimeout) clearTimeout(lastDismissedAdvice.hideTimeout);

            setHiddenUntilTomorrow(prev => {
                const newSet = new Set([...prev, adviceId]);
                try {
                    const saveData = {
                        date: new Date().toISOString().slice(0, 10),
                        ids: [...newSet],
                    };
                    setStoredValue('heys_advice_hidden_today', saveData);
                } catch (e) { }
                return newSet;
            });
            setDismissedAdvices(prev => {
                const newSet = new Set([...prev, adviceId]);
                try {
                    const saveData = {
                        date: new Date().toISOString().slice(0, 10),
                        ids: [...newSet],
                    };
                    setStoredValue('heys_advice_read_today', saveData);
                } catch (e) { }
                return newSet;
            });

            const advice = safeAdviceRelevant.find(item => item?.id === adviceId) || safeBadgeAdvices.find(item => item?.id === adviceId);
            if (advice && markHidden) markHidden(advice);

            emitAdviceHidden();

            setUndoFading(false);
            const hideTimeout = setTimeout(() => {
                setLastDismissedAdvice(null);
                setUndoFading(false);
            }, 3000);
            setLastDismissedAdvice({ id: adviceId, action: 'hidden', hideTimeout });
        }, [lastDismissedAdvice, emitAdviceHidden, safeAdviceRelevant, safeBadgeAdvices, markHidden, setStoredValue]);

        // Деталь совета закрывается после действия: карточка уходит из списка, а
        // отмена живёт панелью в самой шторке (строка «отмена с таймером») — под
        // открытой деталью её не видно и не нажать.
        const markAdviceDetailRead = useCallback((advice, e) => {
            e?.stopPropagation?.();
            const adviceId = typeof advice === 'string' ? advice : advice?.id;
            if (!adviceId) return;
            applyAdviceRead(adviceId);
            closeAdviceDetailModal();
        }, [applyAdviceRead, closeAdviceDetailModal]);

        const hideAdviceDetailUntilTomorrow = useCallback((advice, e) => {
            e?.stopPropagation?.();
            const adviceId = typeof advice === 'string' ? advice : advice?.id;
            if (!adviceId) return;
            applyAdviceHideUntilTomorrow(adviceId);
            closeAdviceDetailModal();
        }, [applyAdviceHideUntilTomorrow, closeAdviceDetailModal]);

        const handleAdviceSwipeEnd = useCallback((adviceId) => {
            const gesture = adviceSwipeStart.current[adviceId];
            const state = adviceSwipeState[adviceId];
            const closeCard = () => {
                setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: 0, direction: null } }));
                delete adviceSwipeStart.current[adviceId];
            };

            if (gesture?.lock === 'vertical') {
                closeCard();
                return;
            }

            // Панель оценки уже открыта: этот вызов — ответ на кнопку или тап по
            // карточке, и он её закрывает. Карточка возвращается на место
            // (переход 180 мс живёт на самой карточке), совет остаётся в списке.
            if (state?.rating) {
                closeCard();
                return;
            }

            const swipeX = state?.x || 0;

            if (lastDismissedAdvice?.hideTimeout) clearTimeout(lastDismissedAdvice.hideTimeout);

            // Строка «панель оценки»: свайп влево открывает панель оценки, а не
            // помечает совет прочитанным. Само «прочитано» никуда не делось —
            // оно живёт кнопкой в детали совета и строкой «Прочитать все».
            if (swipeX < -ADVICE_RATING_OPEN_THRESHOLD) {
                setAdviceSwipeState(prev => ({
                    ...prev,
                    [adviceId]: { x: -ADVICE_RATING_PANEL_WIDTH, direction: 'left', rating: true },
                }));
                delete adviceSwipeStart.current[adviceId];
                haptic('light');
                return;
            }

            if (swipeX > 100) {
                applyAdviceHideUntilTomorrow(adviceId);
            }

            closeCard();
        }, [adviceSwipeState, haptic, lastDismissedAdvice, applyAdviceHideUntilTomorrow]);

        const adviceLongPressTimer = useRef(null);
        const handleAdviceLongPressStart = useCallback((adviceId) => {
            adviceLongPressTimer.current = setTimeout(() => {
                const longPressAdvice = safeAdviceRelevant.find(item => item?.id === adviceId) || safeBadgeAdvices.find(item => item?.id === adviceId) || null;
                if (longPressAdvice) {
                    setExpandedAdviceId(adviceId);
                    setAdviceDetailModalAdvice(longPressAdvice);
                    setAdviceDetailModalOpen(true);
                }
                haptic('light');
            }, 500);
        }, [haptic, safeAdviceRelevant, safeBadgeAdvices]);
        const handleAdviceLongPressEnd = useCallback(() => {
            if (adviceLongPressTimer.current) {
                clearTimeout(adviceLongPressTimer.current);
                adviceLongPressTimer.current = null;
            }
        }, []);

        const handleAdviceToggleExpand = useCallback((adviceId) => {
            // 2026-05-28: dropped startTransition wrapper (discarded в курaторе → expand не работал)
            haptic('light');
            setExpandedAdviceId(prev => (prev === adviceId ? null : (adviceId || null)));
        }, [haptic]);

        const handleDismissAll = () => {
            setDismissAllAnimation(true);
            haptic('medium');

            const advices = safeAdviceRelevant.filter(a => !dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id));

            advices.forEach((advice, index) => {
                setTimeout(() => {
                    setDismissedAdvices(prev => {
                        const newSet = new Set([...prev, advice.id]);
                        if (index === advices.length - 1) {
                            try {
                                const saveData = {
                                    date: new Date().toISOString().slice(0, 10),
                                    ids: [...newSet],
                                };
                                setStoredValue('heys_advice_read_today', saveData);
                            } catch (e) { }
                        }
                        return newSet;
                    });
                    if (index < 3) haptic('light');
                }, index * 80);
            });

            setTimeout(() => {
                setDismissAllAnimation(false);
                dismissToast();
            }, advices.length * 80 + 300);
        };

        const dismissToast = () => {
            if (displayedAdvice?.id) {
                setDismissedAdvices(prev => {
                    const newSet = new Set([...prev, displayedAdvice.id]);
                    const saveData = {
                        date: new Date().toISOString().slice(0, 10),
                        ids: [...newSet],
                    };
                    try {
                        setStoredValue('heys_advice_read_today', saveData);
                    } catch (e) { }
                    return newSet;
                });

                if (markRead) markRead(displayedAdvice);

                if (HEYSRef?.game?.addXP) {
                    HEYSRef.game.addXP(0, 'advice_read', null);
                }
            }

            setToastVisible(false);
            setToastDismissed(true);
            setToastSwiped(false);
            setToastRatedState(null);
            setToastScheduledConfirm(false);
            setAdviceExpanded(false);
            setAdviceTrigger(null);
            setDisplayedAdvice(null);
            setDisplayedAdviceList([]);
            toastInteractionTrackedRef.current = false;
            setAdviceDetailModalOpen(false);
            setAdviceDetailModalAdvice(null);
            setAdviceTechnicalDetails(null);
            setAdviceTechnicalDetailsOpen(false);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };

        useEffect(() => {
            toastInteractionTrackedRef.current = false;
        }, [displayedAdvice?.id, toastVisible, adviceTrigger]);

        useEffect(() => {
            autoSuppressionTrackedRef.current = new Set();
        }, [date]);

        dismissToastRef.current = dismissToast;

        return {
            toastVisible,
            setToastVisible,
            toastDismissed,
            setToastDismissed,
            toastTimeoutRef,
            toastSwipeX,
            setToastSwipeX,
            toastSwiped,
            setToastSwiped,
            toastRatedState,
            setToastRatedState,
            toastScheduledConfirm,
            setToastScheduledConfirm,
            toastDetailsOpen,
            setToastDetailsOpen,
            toastAppearedAtRef,
            toastTouchStart,
            handleToastTouchStart,
            handleToastTouchMove,
            handleToastTouchEnd,
            handleToastUndo,
            handleToastInteraction,
            handleToastRate,
            handleToastSchedule,
            adviceTrigger,
            setAdviceTrigger,
            adviceExpanded,
            setAdviceExpanded,
            displayedAdvice,
            setDisplayedAdvice,
            displayedAdviceList,
            setDisplayedAdviceList,
            advicePrimary,
            adviceRelevant: safeAdviceRelevant,
            adviceCount,
            allAdvices,
            badgeAdvices: safeBadgeAdvices,
            adviceTrace,
            adviceTraceAvailable: !!adviceTrace,
            adviceTraceCopyState,
            markShown,
            markRead,
            markHidden,
            rateAdvice,
            trackClick,
            scheduleAdvice,
            copyAdviceTrace,
            adviceDiagnostics,
            adviceDiagnosticsOpen,
            openAdviceDiagnostics,
            closeAdviceDiagnostics,
            adviceDetailModalOpen,
            adviceDetailModalAdvice,
            openAdviceDetailModal,
            closeAdviceDetailModal,
            // Строка «доступность»: дубли свайпов внутри детали совета.
            markAdviceDetailRead,
            hideAdviceDetailUntilTomorrow,
            adviceTechnicalDetails,
            adviceTechnicalDetailsOpen,
            openAdviceTechnicalDetails,
            closeAdviceTechnicalDetails,
            scheduledCount,
            dismissedAdvices,
            setDismissedAdvices,
            hiddenUntilTomorrow,
            setHiddenUntilTomorrow,
            adviceSwipeState,
            setAdviceSwipeState,
            expandedAdviceId,
            setExpandedAdviceId,
            dismissAllAnimation,
            setDismissAllAnimation,
            lastDismissedAdvice,
            setLastDismissedAdvice,
            undoFading,
            setUndoFading,
            adviceCardRefs,
            dismissToastRef,
            registerAdviceCardRef,
            handleAdviceListTouchStart,
            handleAdviceListTouchMove,
            handleAdviceListTouchEnd,
            getSortedGroupedAdvices,
            handleAdviceSwipeStart,
            handleAdviceSwipeMove,
            handleAdviceSwipeEnd,
            handleAdviceLongPressStart,
            handleAdviceLongPressEnd,
            handleAdviceToggleExpand,
            handleDismissAll,
            toggleToastsEnabled,
            toastsEnabled,
            toggleAdviceSoundEnabled,
            adviceSoundEnabled,
            undoLastDismiss,
            clearLastDismissed,
            undoCountdownSeconds,
            adviceServiceOpen,
            openAdviceService,
            closeAdviceService,
            openAdviceRulesPool,
            closeAdviceRulesPool,
            adviceRulesPoolOpen,
            totalAdviceCount,
            dismissToast,
            ADVICE_CATEGORY_NAMES,
            ewsWarnings,
            adviceSettingsOpen,
            openAdviceSettings,
            closeAdviceSettings,
            adviceCategorySettings,
            toggleAdviceCategoryGroup,
            medicalDisclaimerSessionDismissed,
            medicalDisclaimerNeverShow,
            setMedicalDisclaimerNeverShow,
            dismissMedicalDisclaimerGate,
        };
    };

    HEYS.dayAdviceState = dayAdviceState;
})(window);
