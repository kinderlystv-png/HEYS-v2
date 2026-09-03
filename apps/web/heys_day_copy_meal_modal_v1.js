// heys_day_copy_meal_modal_v1.js — Модалка копирования продуктов между приёмами пищи
// Собственный modal-shell (не через ConfirmModal): centered v4-sheet 375×706
// with a scrollable body. Pattern совместим с
// heys_confirm_modal_v1.js (createRoot + setModalState + ModalManager).
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const ReactDOM = global.ReactDOM;

    if (!React || !ReactDOM) {
        console.error('[CopyMealModal] React/ReactDOM not found');
        return;
    }

    // === Singleton state ===
    let setModalState = null;
    let modalRoot = null;
    let modalRootInstance = null;
    let modalCleanup = null;

    // === Внутренний компонент: Shell ===
    function CopyMealModalShell() {
        const [state, setState] = React.useState(null);

        React.useEffect(() => {
            setModalState = setState;
            return () => { setModalState = null; };
        }, []);

        React.useEffect(() => {
            if (!state) return;
            const onKey = (e) => {
                if (e.key === 'Escape') hide();
            };
            document.addEventListener('keydown', onKey);
            return () => document.removeEventListener('keydown', onKey);
        }, [state]);

        if (!state) return null;
        if (state.mode === 'recent-list') {
            return React.createElement(RecentMealsListView, state);
        }
        return React.createElement(CopyMealView, state);
    }

    // === Helper: emoji для типа приёма ===
    function getMealEmoji(meal) {
        if (!meal) return '🍽️';
        if (meal.mealType === 'breakfast') return '🌅';
        if (meal.mealType === 'lunch') return '🌞';
        if (meal.mealType === 'dinner') return '🌆';
        if (meal.mealType === 'snack') return '🍎';
        const t = (meal.time || '').split(':')[0];
        const h = parseInt(t, 10);
        if (Number.isFinite(h)) {
            if (h >= 6 && h < 11) return '🌅';
            if (h >= 11 && h < 16) return '🌞';
            if (h >= 16 && h < 21) return '🌆';
        }
        return '🍎';
    }

    // === UI: список недавних приёмов ===
    function RecentMealsListView({ recentEntries, onPick }) {
        const entries = (recentEntries || []);

        const handleBackdropClick = (e) => {
            if (e.target === e.currentTarget) hide();
        };

        const handlePick = (entry) => {
            hide();
            if (typeof onPick === 'function') onPick(entry.meal, entry.dateStr);
        };

        const header = React.createElement('div', {
            style: {
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '14px 20px 12px',
                borderBottom: '1px solid var(--border, #e2e8f0)',
                flexShrink: 0,
            },
        },
            React.createElement('div', {
                style: {
                    flex: '1 1 auto', minWidth: 0,
                    fontSize: '16px', fontWeight: 600,
                    color: 'var(--text, #111827)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                },
            }, 'Повторить недавний приём'),
            React.createElement('button', {
                type: 'button',
                onClick: () => hide(),
                'aria-label': 'Закрыть',
                style: {
                    flexShrink: 0, width: '32px', height: '32px',
                    borderRadius: '50%', border: 'none',
                    background: 'var(--border, #f1f5f9)',
                    color: 'var(--muted, #64748b)',
                    fontSize: '16px', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                },
            }, '✕'),
        );

        const body = React.createElement('div', {
            style: {
                flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
                padding: '12px 20px 16px',
                display: 'flex', flexDirection: 'column', gap: '10px',
            },
        },
            entries.length === 0
                ? React.createElement('div', {
                    style: { padding: '24px 12px', fontSize: '14px', color: 'var(--muted, #94a3b8)', fontStyle: 'italic', textAlign: 'center' },
                }, 'За последние 2 дня нет приёмов с продуктами')
                : entries.map((entry, idx) => {
                    const m = entry.meal;
                    const items = m.items || [];
                    const totalKcal = items.reduce((s, it) => s + Math.round(((Number(it.kcal100) || 0) * (Number(it.grams) || 0)) / 100), 0);
                    const emoji = getMealEmoji(m);
                    const previewItems = items.slice(0, 5);
                    const moreCount = items.length - previewItems.length;
                    const headerLine = `${emoji} ${m.name || 'Приём'}${m.time ? ' · ' + m.time : ''} · ${entry.dateLabel}`;
                    return React.createElement('button', {
                        key: `${entry.dateStr}_${m.id || idx}`,
                        type: 'button',
                        onClick: () => handlePick(entry),
                        style: {
                            display: 'flex', flexDirection: 'column', gap: '6px',
                            padding: '12px 14px',
                            borderRadius: '14px',
                            border: '1px solid var(--border, #e2e8f0)',
                            background: 'var(--card, #fff)',
                            cursor: 'pointer', textAlign: 'left', minWidth: 0,
                            transition: 'background 0.15s, border 0.15s',
                        },
                    },
                        React.createElement('div', {
                            style: {
                                display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '14px', fontWeight: 600,
                                color: 'var(--text, #111827)',
                            },
                        },
                            React.createElement('span', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, headerLine),
                            React.createElement('span', {
                                style: { flexShrink: 0, fontSize: '12px', color: 'var(--muted, #64748b)', fontVariantNumeric: 'tabular-nums' },
                            }, `${totalKcal}к · ${items.length} прод.`),
                        ),
                        React.createElement('div', {
                            style: { display: 'flex', flexDirection: 'column', gap: '2px' },
                        },
                            previewItems.map((it, i) => {
                                const g = Number(it.grams) || 0;
                                const k = Math.round(((Number(it.kcal100) || 0) * g) / 100);
                                return React.createElement('div', {
                                    key: it.id || i,
                                    style: { display: 'flex', gap: '6px', fontSize: '12px', color: 'var(--muted, #64748b)' },
                                },
                                    React.createElement('span', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, it.name || '—'),
                                    React.createElement('span', { style: { flexShrink: 0, fontVariantNumeric: 'tabular-nums' } }, `${g}г · ${k}к`),
                                );
                            }),
                            moreCount > 0 && React.createElement('div', {
                                style: { fontSize: '11px', color: 'var(--muted, #94a3b8)', fontStyle: 'italic' },
                            }, `и ещё ${moreCount} продукта(ов)`),
                        ),
                        React.createElement('div', {
                            style: { fontSize: '12px', fontWeight: 600, color: 'var(--acc, #3b82f6)', alignSelf: 'flex-end' },
                        }, 'Повторить →'),
                    );
                }),
        );

        return React.createElement('div', {
            className: 'copy-meal-modal-backdrop',
            onClick: handleBackdropClick,
            style: {
                position: 'fixed', inset: 0,
                background: 'rgba(0, 0, 0, 0.55)',
                backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'calc(20px + var(--safe-area-top, 0px)) calc(16px + var(--safe-area-right, 0px)) calc(32px + var(--safe-area-bottom, 0px)) calc(16px + var(--safe-area-left, 0px))',
                zIndex: 10000,
                animation: 'copyMealFadeIn 0.15s ease-out',
            },
        },
            React.createElement('div', {
                className: 'copy-meal-modal',
                onClick: (e) => e.stopPropagation(),
                style: {
                    width: '100%', maxWidth: '480px',
                    height: '100%', maxHeight: 'calc(100dvh - 52px - var(--safe-area-top, 0px) - var(--safe-area-bottom, 0px))',
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--card, #fff)',
                    borderRadius: '20px',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                    animation: 'copyMealScaleIn 0.18s ease-out',
                },
            }, header, body),
        );
    }

    // === UI ===
    // Тысячи разделяются узким пробелом, как в остальных числах флоу.
    const fmtKcal = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

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
        },
            React.createElement('path', { d: 'M6 6l12 12M18 6L6 18' }),
        );
    }

    function StepIcon({ direction }) {
        const path = direction === 'minus' ? 'M6 12h12' : 'M12 6v12M6 12h12';
        return React.createElement('svg', {
            width: 12,
            height: 12,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 3,
            strokeLinecap: 'round',
            'aria-hidden': 'true',
        }, React.createElement('path', { d: path }));
    }

    function CopyMealView({ sourceMeal, sourceMealIndex, sourceDate, targetDate, targetMeals, onCopyToExisting, onCopyToNew }) {
        const allItems = (sourceMeal && sourceMeal.items) || [];
        const sameDay = sourceDate && targetDate && sourceDate === targetDate;
        const candidateMeals = ((targetMeals) || [])
            .map((m, i) => ({ meal: m, index: i }))
            .filter(({ index }) => !sameDay || index !== sourceMealIndex);

        // Строка «ноль, пустое и дефект — три состояния, не одно». Number(x) || 0
        // склеивал их в одно число, и «нет данных» показывалось нулём — то есть
        // враньём. Настоящий ноль (вода, чёрный кофе, взвешено 0 г) остаётся
        // обычным значением и копируется как все.
        const itemState = React.useCallback((it) => {
            const kcal100 = Number(it.kcal100);
            if (!Number.isFinite(kcal100)) return 'defect';
            const raw = it.grams;
            const hasGrams = raw !== null && raw !== undefined && raw !== ''
                && Number.isFinite(Number(raw));
            return hasGrams ? 'ok' : 'empty';
        }, []);

        const copyableIds = React.useMemo(
            () => allItems.filter((it) => itemState(it) === 'ok').map((it) => it.id),
            [allItems, itemState],
        );

        const [selectedIds, setSelectedIds] = React.useState(() => new Set(copyableIds));
        const [targetType, setTargetType] = React.useState(candidateMeals.length > 0 ? 'existing' : 'new');
        const [dstMealIndex, setDstMealIndex] = React.useState(candidateMeals.length > 0 ? candidateMeals[0].index : null);
        const [itemGrams, setItemGrams] = React.useState(() => {
            const m = {};
            allItems.forEach(it => { m[it.id] = HEYS.models.normalizeItemGrams(it.grams, 100); });
            return m;
        });

        const adjustGrams = React.useCallback((id, delta) => {
            setItemGrams(prev => {
                const cur = prev[id] ?? 100;
                return { ...prev, [id]: Math.max(5, Math.min(500, cur + delta)) };
            });
        }, []);

        // «Выбрать всё» — про то, что вообще можно скопировать: непосчитанное в
        // набор не входит, иначе кнопка обещала бы то, чего не сделает.
        const allSelected = selectedIds.size === copyableIds.length && copyableIds.length > 0;

        const toggleAll = () => {
            if (allSelected) setSelectedIds(new Set());
            else setSelectedIds(new Set(copyableIds));
        };

        const toggleItem = (id) => {
            if (!copyableIds.includes(id)) return;
            const next = new Set(selectedIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelectedIds(next);
        };

        const canSubmit = selectedIds.size > 0 &&
            (targetType === 'new' || (targetType === 'existing' && dstMealIndex !== null));

        const handleCopy = () => {
            if (!canSubmit) return;
            const ids = Array.from(selectedIds);
            const gramsMap = {};
            ids.forEach(id => { gramsMap[id] = itemGrams[id] ?? (allItems.find(it => it.id === id)?.grams) ?? 100; });
            hide();
            if (targetType === 'new') {
                if (typeof onCopyToNew === 'function') onCopyToNew(ids, gramsMap);
            } else {
                if (typeof onCopyToExisting === 'function') onCopyToExisting(ids, dstMealIndex, gramsMap);
            }
        };

        const handleBackdropClick = (e) => {
            if (e.target === e.currentTarget) hide();
        };

        const titleText = candidateMeals.length > 0 ? 'копировать' : 'копировать без целей';

        // === Header ===
        const header = React.createElement('div', { className: 'meal-transfer-v4__top' },
            React.createElement('div', { className: 'meal-transfer-v4__title' }, titleText),
            React.createElement('button', {
                type: 'button',
                onClick: () => hide(),
                'aria-label': 'Закрыть',
                className: 'meal-transfer-v4__close',
            }, React.createElement(CloseIcon)),
        );

        // === Items section ===
        const uncountable = allItems.length - copyableIds.length;
        const pluralProducts = (n) => {
            const mod10 = n % 10;
            const mod100 = n % 100;
            if (mod10 === 1 && mod100 !== 11) return 'продукт';
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'продукта';
            return 'продуктов';
        };
        const itemsSection = React.createElement('div', { className: 'meal-transfer-v4__items' },
            React.createElement('div', { className: 'meal-transfer-v4__tier-row' },
                React.createElement('span', null, `Продукты ${selectedIds.size}/${allItems.length}`),
                React.createElement('button', {
                    type: 'button',
                    onClick: toggleAll,
                    className: 'meal-transfer-v4__select-all',
                }, allSelected ? 'Снять всё' : 'Выбрать всё'),
            ),
            React.createElement('div', { className: 'meal-transfer-v4__product-list' },
                allItems.map((it) => {
                    const state = itemState(it);
                    const isSelected = state === 'ok' && selectedIds.has(it.id);
                    const currentGrams = itemGrams[it.id] ?? Number(it.grams) ?? 0;
                    const kcal = Math.round((Number(it.kcal100) * currentGrams) / 100);
                    // Правая колонка называет состояние, а не подставляет ноль:
                    // пустое — прочерками, дефект — словами и тоном плохого
                    // значения (строка «вид · неизвестное в листе копирования»).
                    const metaText = state === 'empty'
                        ? '— г · — ккал'
                        : (state === 'defect'
                            ? `${currentGrams} г · нет калорийности`
                            : `${currentGrams} г · ${kcal} ккал`);
                    const reasonText = state === 'empty'
                        ? 'Граммы ещё не введены — не копируется'
                        : (state === 'defect'
                            ? 'В карточке продукта нет калорийности — не копируется'
                            : null);
                    return React.createElement('div', {
                        key: it.id,
                        className: `meal-transfer-v4__product${isSelected ? ' is-selected' : ''}`
                            + (state === 'empty' ? ' meal-transfer-v4__product--empty' : '')
                            + (state === 'defect' ? ' meal-transfer-v4__product--defect' : ''),
                    },
                        React.createElement('label', { className: 'meal-transfer-v4__product-main' },
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: isSelected,
                                onChange: () => toggleItem(it.id),
                                disabled: state !== 'ok',
                                className: 'meal-transfer-v4__native-control',
                            }),
                            React.createElement('span', { className: 'meal-transfer-v4__check', 'aria-hidden': 'true' }, '✓'),
                            React.createElement('span', { className: 'meal-transfer-v4__product-name' }, it.name || 'Без названия'),
                            React.createElement('span', { className: 'meal-transfer-v4__product-meta' }, metaText),
                        ),
                        reasonText && React.createElement('div', {
                            className: 'meal-transfer-v4__product-reason',
                        },
                            React.createElement('span', null, reasonText),
                            // «Заполнить» ведёт туда, где дефект и чинится: калорийности
                            // нет в карточке продукта, а не в этом приёме.
                            state === 'defect' && React.createElement('button', {
                                type: 'button',
                                className: 'meal-transfer-v4__product-fix',
                                onClick: (e) => {
                                    e.stopPropagation();
                                    const api = HEYS.AddProductStep;
                                    if (api?.showEditProduct) api.showEditProduct(it);
                                    else HEYS.Toast?.warning?.('Редактор продукта недоступен');
                                },
                            }, 'Заполнить'),
                        ),
                        isSelected && React.createElement('div', {
                            className: 'meal-transfer-v4__grams',
                            onClick: e => e.stopPropagation(),
                        },
                            React.createElement('button', { type: 'button', onClick: () => adjustGrams(it.id, -10), className: 'meal-transfer-v4__gram-step', 'aria-label': `Уменьшить ${it.name || 'продукт'}` }, React.createElement(StepIcon, { direction: 'minus' })),
                            React.createElement('span', { className: 'meal-transfer-v4__gram-value' }, `${currentGrams} г`),
                            React.createElement('button', { type: 'button', onClick: () => adjustGrams(it.id, +10), className: 'meal-transfer-v4__gram-step', 'aria-label': `Увеличить ${it.name || 'продукт'}` }, React.createElement(StepIcon, { direction: 'plus' })),
                            React.createElement('input', {
                                type: 'range', min: 5, max: 500, step: 5,
                                value: currentGrams,
                                onChange: e => setItemGrams(prev => ({ ...prev, [it.id]: +e.target.value })),
                                className: 'meal-transfer-v4__range',
                                'aria-label': `Количество ${it.name || 'продукта'}`,
                                style: { '--meal-transfer-progress': `${Math.max(0, Math.min(100, ((currentGrams - 5) / 495) * 100))}%` },
                            }),
                        ),
                    );
                }),
            ),
            // Строка «сумма не имеет права занижать»: число под списком всегда
            // посчитано целиком, потому что непосчитанное отметить нельзя. Строка
            // полноты появляется только когда что-то осталось за бортом — при
            // полном списке её нет.
            uncountable > 0 && React.createElement('div', {
                className: 'meal-transfer-v4__completeness',
            }, `${uncountable} ${pluralProducts(uncountable)} из ${allItems.length} не копируются — сумма считает только отмеченные`),
        );

        // === Targets section ===
        const targetItem = (label, isActive, onChange, key) =>
            React.createElement('label', {
                key,
                'data-copy-meal-target': key,
                className: `meal-transfer-v4__target${isActive ? ' is-selected' : ''}`,
            },
                React.createElement('input', {
                    type: 'radio',
                    name: 'copy-meal-target',
                    checked: isActive,
                    onChange,
                    className: 'meal-transfer-v4__native-control',
                }),
                React.createElement('span', { className: 'meal-transfer-v4__radio', 'aria-hidden': 'true' }),
                React.createElement('span', {
                    'data-copy-meal-target-label': key,
                    className: 'meal-transfer-v4__target-label',
                }, label),
            );

        const targetsSection = React.createElement('div', { className: 'meal-transfer-v4__targets' },
            React.createElement('div', { className: 'meal-transfer-v4__tier' }, candidateMeals.length > 0 ? 'Куда копировать · сегодня' : 'Куда копировать'),
            candidateMeals.length === 0 && React.createElement('div', {
                className: 'meal-transfer-v4__empty',
            }, 'На сегодня приёмов ещё нет — создадим новый.'),
            React.createElement('div', { className: 'meal-transfer-v4__target-list' },
                ...candidateMeals.map(({ meal, index }) =>
                    targetItem(
                        `${meal.name || 'Приём'}${meal.time ? ' · ' + meal.time : ''}`,
                        targetType === 'existing' && dstMealIndex === index,
                        () => { setTargetType('existing'); setDstMealIndex(index); },
                        `meal-${meal.id || index}`,
                    ),
                ),
                targetItem(
                    '+ Создать новый приём',
                    targetType === 'new',
                    () => { setTargetType('new'); setDstMealIndex(null); },
                    'new-meal',
                ),
            ),
        );

        // === Live KBJU preview (existing target only) ===
        const kbjuPreview = React.useMemo(() => {
            if (targetType !== 'existing' || dstMealIndex === null || selectedIds.size === 0) return null;
            const dstMeal = (targetMeals || []).find((_, i) => i === dstMealIndex);
            if (!dstMeal) return null;
            const dstKcal = (dstMeal.items || []).reduce((s, it) =>
                s + Math.round(((Number(it.kcal100) || 0) * (Number(it.grams) || 0)) / 100), 0);
            // Отмечено может быть только посчитанное, поэтому kcal100 здесь
            // заведомо число и подстраховка «|| 0» больше не нужна: она бы
            // вернула ту же ложь, от которой ушли в списке.
            const addedKcal = allItems.reduce((s, it) => {
                if (!selectedIds.has(it.id)) return s;
                const g = itemGrams[it.id] ?? Number(it.grams) ?? 0;
                return s + Math.round((Number(it.kcal100) * g) / 100);
            }, 0);
            return { dstName: dstMeal.name || 'Приём', dstKcal, addedKcal, totalKcal: dstKcal + addedKcal };
        }, [targetType, dstMealIndex, targetMeals, selectedIds, itemGrams, allItems]);

        // === Footer (buttons + optional KBJU preview) ===
        const footer = React.createElement('div', { className: 'meal-transfer-v4__footer' },
            kbjuPreview && React.createElement('div', {
                className: 'meal-transfer-v4__summary',
            // Строка «итог копирования» пишет величины как на остальных экранах:
            // «Перекус: 17 → 1 610 ккал (+1 593)». Стояло «17к → 1610к (+1593к)» —
            // сокращение «к» больше нигде во флоу не встречается, а тысячи шли
            // без разделителя, и четырёхзначные числа читались сплошняком.
            }, `${kbjuPreview.dstName}: ${fmtKcal(kbjuPreview.dstKcal)} → `
              + `${fmtKcal(kbjuPreview.totalKcal)} ккал (+${fmtKcal(kbjuPreview.addedKcal)})`),
            React.createElement('div', { className: 'meal-transfer-v4__actions' },
                React.createElement('button', {
                    type: 'button',
                    onClick: () => hide(),
                    className: 'meal-transfer-v4__button meal-transfer-v4__button--cancel',
                }, 'Отмена'),
                React.createElement('button', {
                    type: 'button',
                    onClick: handleCopy,
                    disabled: !canSubmit,
                    className: 'meal-transfer-v4__button meal-transfer-v4__button--primary',
                }, `Копировать (${selectedIds.size})`),
            ),
        );

        // === Backdrop + centered sheet с воздухом со всех сторон ===
        // Паттерн совпадает с .mc-modal (StepModal/heys_add_product_step_v1) — модалка центрирована,
        // занимает почти весь экран (calc(100dvh - 32px)), но с padding-зоной от backdrop.
        return React.createElement('div', {
            className: 'copy-meal-modal-backdrop meal-transfer-v4__backdrop',
            onClick: handleBackdropClick,
        },
            React.createElement('div', {
                className: `copy-meal-modal meal-transfer-v4__sheet${candidateMeals.length === 0 ? ' meal-transfer-v4__sheet--empty-targets' : ''}`,
                onClick: (e) => e.stopPropagation(),
            },
                header,
                itemsSection,
                targetsSection,
                footer,
            ),
        );
    }

    // === DOM root + render ===
    function ensureRoot() {
        if (!modalRoot) {
            modalRoot = document.createElement('div');
            modalRoot.id = 'copy-meal-modal-root';
            document.body.appendChild(modalRoot);
        }
        if (!modalRootInstance) {
            modalRootInstance = ReactDOM.createRoot(modalRoot);
        }
        modalRootInstance.render(React.createElement(CopyMealModalShell));
    }

    // === Animations (одноразовая инжекция) ===
    function ensureAnimations() {
        if (document.getElementById('copy-meal-modal-anim')) return;
        const style = document.createElement('style');
        style.id = 'copy-meal-modal-anim';
        style.textContent = `
@keyframes copyMealFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes copyMealScaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
[data-theme$="dark"] .copy-meal-modal:not(.meal-transfer-v4__sheet) { background: #1e293b; color: #f1f5f9; }
[data-theme$="dark"] .copy-meal-modal:not(.meal-transfer-v4__sheet) label { color: #f1f5f9; }
`;
        document.head.appendChild(style);
    }

    // === Public API ===
    function show(options = {}) {
        ensureRoot();
        ensureAnimations();

        if (HEYS.ModalManager) {
            modalCleanup = HEYS.ModalManager.register('copy-meal-modal', () => hide(true));
        }

        // setState may be unset if shell hasn't mounted yet — defer slightly.
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

    function showRecentList(options = {}) {
        ensureRoot();
        ensureAnimations();
        if (HEYS.ModalManager) {
            modalCleanup = HEYS.ModalManager.register('copy-meal-modal', () => hide(true));
        }
        const apply = () => {
            if (setModalState) setModalState({ mode: 'recent-list', ...options });
            else setTimeout(apply, 16);
        };
        apply();
    }

    HEYS.CopyMealModal = { show, showRecentList, hide, close: hide };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { ensureRoot(); ensureAnimations(); });
    } else {
        setTimeout(() => { ensureRoot(); ensureAnimations(); }, 0);
    }
})(typeof window !== 'undefined' ? window : global);
