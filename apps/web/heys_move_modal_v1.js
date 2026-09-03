// heys_move_modal_v1.js — Универсальная модалка переноса/копирования
// Режимы:
//   'product-move' / 'product-copy' — выбор целевого приёма из 3 дней (Сегодня/Вчера/Позавчера)
//   'meal-move'                     — выбор целевого дня и приёма для переноса целого приёма
// Pattern совместим с heys_day_copy_meal_modal_v1.js (createRoot + setModalState + ModalManager).
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const ReactDOM = global.ReactDOM;

    if (!React || !ReactDOM) {
        console.error('[MoveModal] React/ReactDOM not found');
        return;
    }

    let setModalState = null;
    let modalRoot = null;
    let modalRootInstance = null;
    let modalCleanup = null;

    const MONTH_RU_GENITIVE = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];

    function formatDateLabel(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const day = parseInt(parts[2], 10);
        const monthIdx = parseInt(parts[1], 10) - 1;
        if (!Number.isFinite(day) || !Number.isFinite(monthIdx) || monthIdx < 0 || monthIdx > 11) {
            return dateStr;
        }
        return `${day} ${MONTH_RU_GENITIVE[monthIdx]}`;
    }

    function CloseIcon() {
        return React.createElement('svg', {
            width: 15,
            height: 15,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2.75,
            strokeLinecap: 'round',
            'aria-hidden': 'true',
        }, React.createElement('path', { d: 'M6 6l12 12M18 6L6 18' }));
    }

    function CalendarIcon() {
        return React.createElement('svg', {
            width: 15,
            height: 15,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': 'true',
        },
            React.createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 4 }),
            React.createElement('path', { d: 'M8 3v4M16 3v4M3 11h18' }),
        );
    }

    function ChevronIcon() {
        return React.createElement('svg', {
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2.75,
            strokeLinecap: 'round',
            'aria-hidden': 'true',
        }, React.createElement('path', { d: 'M9 6l6 6-6 6' }));
    }

    function pluralRu(n, one, few, many) {
        const abs = Math.abs(n) % 100;
        const last = abs % 10;
        if (abs > 10 && abs < 20) return many;
        if (last === 1) return one;
        if (last >= 2 && last <= 4) return few;
        return many;
    }

    function calcMealKcal(meal, pIndex, getProductFromItem) {
        if (!meal || !Array.isArray(meal.items)) return 0;
        let sum = 0;
        for (const it of meal.items) {
            const g = +it.grams || 0;
            if (!g) continue;
            const product = (typeof getProductFromItem === 'function')
                ? (getProductFromItem(it, pIndex) || {})
                : (it || {});
            const kcal100 = +product.kcal100 || +it.kcal100 || 0;
            sum += kcal100 * g / 100;
        }
        return Math.round(sum);
    }

    function MoveModalShell() {
        const [state, setState] = React.useState(null);

        React.useEffect(() => {
            setModalState = setState;
            return () => { setModalState = null; };
        }, []);

        React.useEffect(() => {
            if (!state) return;
            const onKey = (e) => { if (e.key === 'Escape') hide(); };
            document.addEventListener('keydown', onKey);
            return () => document.removeEventListener('keydown', onKey);
        }, [state]);

        if (!state) return null;
        if (state.mode === 'meal-move') return React.createElement(MealMoveView, state);
        return React.createElement(ProductMoveView, state);
    }

    // Лист выбора приёма для копирования и переноса продукта.
    //
    // Сведено с канвасом 03.09 по строке nutrition-tab.v4.dc.html «копирование
    // продукта · что править в коде»: лист сидел на собственном каркасе в чужой
    // палитре — слейт-литералы (#f8fafc, #0f172a, #dbeafe, #94a3b8, #e2e8f0),
    // эмодзи приёмов, аккордеон по дням с ▾/▸, радиусы 8 и 10. Теперь это тот
    // же лист, что и перенос приёма (meal-transfer-v4__sheet--move): роли
    // набора, радиус 16, дата — одной строкой вместо аккордеона.
    //
    // Механика не менялась: тап по приёму выполняет операцию сразу, как и
    // раньше. Лист переноса приёма спрашивает подтверждение, потому что там
    // выбирают ещё и режим цели; здесь выбор один, и добавлять второй шаг
    // значило бы менять то, что человек может делать, а не то, как это
    // выглядит.
    function ProductMoveView(state) {
        const {
            mode, sourceDate, sourceMealIndex,
            daysWithMeals, onPick, pIndex, getProductFromItem,
            todayDateStr,
        } = state;

        const isCopy = mode === 'product-copy';
        // Заголовок листа называет операцию; вопрос ушёл в ярус ниже.
        const title = isCopy ? 'скопировать' : 'переместить';
        const tier = isCopy ? 'Куда скопировать' : 'Куда переместить';

        const days = Array.isArray(daysWithMeals) ? daysWithMeals : [];
        const initialDate = (days.find(day => day.dateStr === sourceDate) || days[0] || {}).dateStr || '';
        const [dstDate, setDstDate] = React.useState(initialDate);
        const selectedDay = days.find(day => day.dateStr === dstDate) || days[0] || null;
        const meals = Array.isArray(selectedDay && selectedDay.meals) ? selectedDay.meals : [];
        const isToday = !!(todayDateStr && selectedDay && selectedDay.dateStr === todayDateStr);

        const handleBackdropClick = (event) => {
            if (event.target === event.currentTarget) hide();
        };

        const handlePick = (dstMealIndex, dstMealId) => {
            hide();
            if (typeof onPick === 'function') {
                onPick({ dstDate: selectedDay.dateStr, dstMealIndex, dstMealId });
            }
        };

        const handleCreateNew = () => {
            hide();
            if (typeof onPick === 'function') {
                onPick({ dstDate: selectedDay.dateStr, createNewMeal: true });
            }
        };

        const dateLabel = selectedDay
            ? (selectedDay.dateLabel || '') + (selectedDay.dateLabel ? ', ' : '') + formatDateLabel(selectedDay.dateStr)
            : 'Нет доступной даты';

        const mealRows = meals.map((meal, index) => {
            const isSource = selectedDay.dateStr === sourceDate && index === sourceMealIndex;
            const kcal = calcMealKcal(meal, pIndex, getProductFromItem);
            const itemCount = (meal.items || []).length;
            const name = meal.name || 'Приём';
            return React.createElement('button', {
                key: meal.id || (selectedDay.dateStr + '_' + index),
                type: 'button',
                disabled: isSource,
                onClick: isSource ? undefined : () => handlePick(index, meal.id),
                className: 'meal-transfer-v4__target meal-transfer-v4__target--pick'
                    + (isSource ? ' is-source' : ''),
            },
                React.createElement('span', { className: 'meal-transfer-v4__target-text' },
                    React.createElement('span', { className: 'meal-transfer-v4__target-label' },
                        (meal.time ? meal.time + ' · ' : '') + name + (isSource ? ' (откуда)' : ''),
                    ),
                    React.createElement('span', { className: 'meal-transfer-v4__target-meta' },
                        itemCount + ' ' + pluralRu(itemCount, 'продукт', 'продукта', 'продуктов')
                        + (kcal > 0 ? ' · ~' + kcal + ' ккал' : ''),
                    ),
                ),
                !isSource && React.createElement('span', { className: 'meal-transfer-v4__chevron' },
                    React.createElement(ChevronIcon)),
            );
        });

        const newMealRow = isToday
            ? React.createElement('button', {
                key: '_new_meal_',
                type: 'button',
                onClick: handleCreateNew,
                className: 'meal-transfer-v4__target meal-transfer-v4__target--pick',
            },
                React.createElement('span', { className: 'meal-transfer-v4__target-text' },
                    React.createElement('span', { className: 'meal-transfer-v4__target-label' }, '+ Создать новый приём'),
                    React.createElement('span', { className: 'meal-transfer-v4__target-meta' }, 'выбрать время и оценки'),
                ),
                React.createElement('span', { className: 'meal-transfer-v4__chevron' },
                    React.createElement(ChevronIcon)),
            )
            : null;

        return React.createElement('div', {
            className: 'meal-transfer-v4__backdrop',
            onClick: handleBackdropClick,
        }, React.createElement('div', {
            className: 'move-modal meal-transfer-v4__sheet meal-transfer-v4__sheet--move',
            onClick: event => event.stopPropagation(),
        },
            React.createElement('div', { className: 'meal-transfer-v4__top' },
                React.createElement('div', { className: 'meal-transfer-v4__title' }, title),
                React.createElement('button', {
                    type: 'button',
                    onClick: () => hide(),
                    className: 'meal-transfer-v4__close',
                    'aria-label': 'Закрыть',
                }, React.createElement(CloseIcon)),
            ),
            React.createElement('div', { className: 'meal-transfer-v4__move-content' },
                React.createElement('div', { className: 'meal-transfer-v4__tier' }, tier),
                React.createElement('label', { className: 'meal-transfer-v4__date' },
                    React.createElement('span', { className: 'meal-transfer-v4__calendar' }, React.createElement(CalendarIcon)),
                    React.createElement('span', { className: 'meal-transfer-v4__date-label' }, dateLabel),
                    React.createElement('span', { className: 'meal-transfer-v4__chevron' }, React.createElement(ChevronIcon)),
                    React.createElement('select', {
                        className: 'meal-transfer-v4__date-select',
                        value: selectedDay ? selectedDay.dateStr : '',
                        onChange: event => setDstDate(event.target.value),
                        'aria-label': isCopy ? 'Дата копирования' : 'Дата переноса',
                        disabled: days.length === 0,
                    }, days.map(day => React.createElement('option', {
                        key: day.dateStr,
                        value: day.dateStr,
                    }, (day.dateLabel ? day.dateLabel + ', ' : '') + formatDateLabel(day.dateStr)))),
                ),
                React.createElement('div', { className: 'meal-transfer-v4__tier meal-transfer-v4__tier--move-target' }, 'В какой приём'),
                (mealRows.length === 0 && !newMealRow)
                    ? React.createElement('div', { className: 'meal-transfer-v4__empty' }, 'Приёмов нет')
                    : React.createElement('div', { className: 'meal-transfer-v4__target-list' },
                        ...mealRows, newMealRow),
            ),
            React.createElement('div', { className: 'meal-transfer-v4__footer' },
                React.createElement('div', { className: 'meal-transfer-v4__actions' },
                    React.createElement('button', {
                        type: 'button',
                        onClick: () => hide(),
                        className: 'meal-transfer-v4__button meal-transfer-v4__button--cancel',
                    }, 'Отмена'),
                ),
            ),
        ));
    }

    function MealMoveView(state) {
        const { sourceDate, daysWithMeals, onPick } = state;
        const destinationDays = (daysWithMeals || []).filter(day => day.dateStr !== sourceDate);
        const initialDay = destinationDays[0] || null;
        const initialMeal = Array.isArray(initialDay?.meals) ? initialDay.meals[0] : null;
        const [dstDate, setDstDate] = React.useState(initialDay?.dateStr || '');
        const [targetMode, setTargetMode] = React.useState(initialMeal ? 'existing' : 'new');
        const [dstMealId, setDstMealId] = React.useState(initialMeal?.id || null);
        const selectedDay = destinationDays.find(day => day.dateStr === dstDate) || destinationDays[0] || null;
        const selectedDayMeals = Array.isArray(selectedDay?.meals) ? selectedDay.meals : [];

        const handlePick = () => {
            if (!dstDate || dstDate === sourceDate) return;
            if (targetMode === 'existing' && !dstMealId) return;
            hide();
            if (typeof onPick === 'function') {
                onPick({
                    dstDate,
                    targetMode,
                    ...(targetMode === 'existing' ? { dstMealId } : {}),
                });
            }
        };

        const handleDateChange = (nextDate) => {
            const nextDay = destinationDays.find(day => day.dateStr === nextDate) || null;
            const nextMeals = Array.isArray(nextDay?.meals) ? nextDay.meals : [];
            const firstMeal = nextMeals[0] || null;
            setDstDate(nextDate);
            setTargetMode(firstMeal ? 'existing' : 'new');
            setDstMealId(firstMeal?.id || null);
        };

        const handleBackdropClick = (event) => {
            if (event.target === event.currentTarget) hide();
        };
        const dateLabel = selectedDay
            ? `${selectedDay.dateLabel || ''}${selectedDay.dateLabel ? ', ' : ''}${formatDateLabel(selectedDay.dateStr)}`
            : 'Нет доступной даты';

        return React.createElement('div', {
            className: 'meal-transfer-v4__backdrop',
            onClick: handleBackdropClick,
        }, React.createElement('div', {
            className: 'move-modal meal-transfer-v4__sheet meal-transfer-v4__sheet--move',
            onClick: event => event.stopPropagation(),
        },
            React.createElement('div', { className: 'meal-transfer-v4__top' },
                React.createElement('div', { className: 'meal-transfer-v4__title' }, 'перенести'),
                React.createElement('button', {
                    type: 'button',
                    onClick: hide,
                    className: 'meal-transfer-v4__close',
                    'aria-label': 'Закрыть',
                }, React.createElement(CloseIcon)),
            ),
            React.createElement('div', { className: 'meal-transfer-v4__move-content' },
                React.createElement('div', { className: 'meal-transfer-v4__tier' }, 'Куда перенести'),
                React.createElement('label', { className: 'meal-transfer-v4__date' },
                    React.createElement('span', { className: 'meal-transfer-v4__calendar' }, React.createElement(CalendarIcon)),
                    React.createElement('span', { className: 'meal-transfer-v4__date-label' }, dateLabel),
                    React.createElement('span', { className: 'meal-transfer-v4__chevron' }, React.createElement(ChevronIcon)),
                    React.createElement('select', {
                        className: 'meal-transfer-v4__date-select',
                        value: dstDate,
                        onChange: event => handleDateChange(event.target.value),
                        'aria-label': 'Дата переноса',
                        disabled: destinationDays.length === 0,
                    }, destinationDays.map(day => React.createElement('option', {
                        key: day.dateStr,
                        value: day.dateStr,
                    }, `${day.dateLabel ? day.dateLabel + ', ' : ''}${formatDateLabel(day.dateStr)}`))),
                ),
                React.createElement('div', { className: 'meal-transfer-v4__tier meal-transfer-v4__tier--move-target' }, 'В какой приём'),
                React.createElement('div', { className: 'meal-transfer-v4__target-list' },
                    selectedDayMeals.map((meal, index) => React.createElement('label', {
                        key: meal.id || index,
                        'data-move-meal-target': meal.id || String(index),
                        className: `meal-transfer-v4__target${targetMode === 'existing' && dstMealId === meal.id ? ' is-selected' : ''}`,
                    },
                        React.createElement('input', {
                            type: 'radio',
                            name: 'move-meal-target',
                            checked: targetMode === 'existing' && dstMealId === meal.id,
                            onChange: () => { setTargetMode('existing'); setDstMealId(meal.id); },
                            className: 'meal-transfer-v4__native-control',
                        }),
                        React.createElement('span', { className: 'meal-transfer-v4__radio', 'aria-hidden': 'true' }),
                        React.createElement('span', { className: 'meal-transfer-v4__target-label' }, `${meal.name || 'Приём'}${meal.time ? ' · ' + meal.time : ''}`),
                    )),
                    React.createElement('label', {
                        'data-move-meal-target': 'new-meal',
                        className: `meal-transfer-v4__target${targetMode === 'new' ? ' is-selected' : ''}`,
                    },
                        React.createElement('input', {
                            type: 'radio',
                            name: 'move-meal-target',
                            checked: targetMode === 'new',
                            onChange: () => { setTargetMode('new'); setDstMealId(null); },
                            className: 'meal-transfer-v4__native-control',
                        }),
                        React.createElement('span', { className: 'meal-transfer-v4__radio', 'aria-hidden': 'true' }),
                        React.createElement('span', { className: 'meal-transfer-v4__target-label' }, '+ Создать новый приём'),
                    ),
                ),
                React.createElement('div', { className: 'meal-transfer-v4__warning' },
                    'Приём уйдёт из сегодняшнего дня целиком — итоги обоих дней пересчитаются.',
                ),
            ),
            React.createElement('div', { className: 'meal-transfer-v4__footer' },
                React.createElement('div', { className: 'meal-transfer-v4__actions' },
                    React.createElement('button', {
                        type: 'button',
                        onClick: hide,
                        className: 'meal-transfer-v4__button meal-transfer-v4__button--cancel',
                    }, 'Отмена'),
                    React.createElement('button', {
                        type: 'button',
                        onClick: handlePick,
                        disabled: !dstDate || (targetMode === 'existing' && !dstMealId),
                        className: 'meal-transfer-v4__button meal-transfer-v4__button--primary',
                    }, 'Перенести'),
                ),
            ),
        ));
    }

    function ensureRoot() {
        if (!modalRoot) {
            modalRoot = document.createElement('div');
            modalRoot.id = 'move-modal-root';
            document.body.appendChild(modalRoot);
        }
        if (!modalRootInstance) {
            modalRootInstance = ReactDOM.createRoot(modalRoot);
        }
        modalRootInstance.render(React.createElement(MoveModalShell));
    }

    // ensureAnimations снят 03.09 вместе со старым каркасом. Он вставлял в
    // <head> два кадра (moveModalFadeIn / moveModalSlideUp) и заплатку тёмной
    // темы для листа, у которого нет класса общего листа переноса. Оба вида
    // теперь на классах meal-transfer-v4, у них свои кадры (copyMealFadeIn /
    // copyMealScaleIn) и свои роли набора в 610-aps-meal-flow.css — селектор
    // заплатки больше не совпадает ни с чем, а кадры никто не звал.

    function show(options = {}) {
        ensureRoot();
        if (HEYS.ModalManager) {
            modalCleanup = HEYS.ModalManager.register('move-modal', () => hide(true));
        }
        const apply = () => {
            if (setModalState) setModalState(options);
            else setTimeout(apply, 16);
        };
        apply();
    }

    function hide(skipManagerNotify = false) {
        if (modalCleanup && !skipManagerNotify) {
            modalCleanup();
            modalCleanup = null;
        }
        if (setModalState) setModalState(null);
    }

    HEYS.MoveModal = { show, hide, close: hide };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { ensureRoot(); });
    } else {
        ensureRoot();
    }
})(window);
