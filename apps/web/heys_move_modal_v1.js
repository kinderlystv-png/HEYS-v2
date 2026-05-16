// heys_move_modal_v1.js — Универсальная модалка переноса/копирования
// Режимы:
//   'product-move' / 'product-copy' — выбор целевого приёма из 3 дней (Сегодня/Вчера/Позавчера)
//   'meal-move'                     — выбор целевого ДНЯ для переноса целого приёма
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

    function getMealEmoji(meal) {
        if (!meal) return '🍽️';
        if (meal.mealType === 'breakfast') return '🌅';
        if (meal.mealType === 'lunch') return '🌞';
        if (meal.mealType === 'dinner') return '🌆';
        if (meal.mealType === 'snack' || meal.mealType === 'snack1' || meal.mealType === 'snack2' || meal.mealType === 'snack3') return '🍎';
        const t = (meal.time || '').split(':')[0];
        const h = parseInt(t, 10);
        if (Number.isFinite(h)) {
            if (h >= 6 && h < 11) return '🌅';
            if (h >= 11 && h < 16) return '🌞';
            if (h >= 16 && h < 21) return '🌆';
        }
        return '🍎';
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

    function ModalShellWrap({ title, sourceLabel, onClose, children }) {
        const handleBackdropClick = (e) => {
            if (e.target === e.currentTarget) onClose();
        };
        return React.createElement('div', {
            onClick: handleBackdropClick,
            style: {
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(15, 23, 42, 0.55)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                animation: 'moveModalFadeIn 0.18s ease',
            },
        },
            React.createElement('div', {
                className: 'move-modal',
                style: {
                    width: '100%', maxWidth: '520px', maxHeight: '92vh',
                    background: '#fff', borderRadius: '16px 16px 0 0',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
                    animation: 'moveModalSlideUp 0.22s ease',
                    overflow: 'hidden',
                },
            },
                React.createElement('div', {
                    style: {
                        padding: '14px 20px 12px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
                        flexShrink: 0,
                    },
                },
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                        React.createElement('div', {
                            style: { fontSize: '16px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 },
                        }, title),
                        sourceLabel && React.createElement('div', {
                            style: { fontSize: '12px', color: '#475569', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis' },
                        }, sourceLabel),
                    ),
                    React.createElement('button', {
                        onClick: onClose,
                        style: {
                            border: 'none', background: '#f1f5f9', color: '#475569',
                            width: '32px', height: '32px', borderRadius: '8px',
                            cursor: 'pointer', fontSize: '18px', lineHeight: 1,
                            flexShrink: 0,
                        },
                        'aria-label': 'Закрыть',
                    }, '×'),
                ),
                React.createElement('div', {
                    style: { flex: 1, overflowY: 'auto', padding: '8px 16px 12px' },
                }, children),
                React.createElement('div', {
                    style: {
                        padding: '12px 16px', borderTop: '1px solid #f1f5f9',
                        flexShrink: 0, background: '#fff',
                    },
                },
                    React.createElement('button', {
                        onClick: onClose,
                        style: {
                            width: '100%', padding: '12px',
                            border: 'none', borderRadius: '10px',
                            background: '#f1f5f9', color: '#0f172a',
                            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                        },
                    }, 'Отмена'),
                ),
            ),
        );
    }

    function ProductMoveView(state) {
        const {
            mode, sourceDate, sourceMealIndex, sourceLabel,
            daysWithMeals, onPick, pIndex, getProductFromItem,
            todayDateStr,
        } = state;

        const isCopy = mode === 'product-copy';
        const title = isCopy ? 'Куда скопировать продукт?' : 'Куда переместить продукт?';

        const [expandedDates, setExpandedDates] = React.useState(() => {
            const init = {};
            (daysWithMeals || []).forEach(d => { init[d.dateStr] = d.dateStr === sourceDate; });
            if (Object.values(init).every(v => !v) && daysWithMeals && daysWithMeals.length > 0) {
                init[daysWithMeals[0].dateStr] = true;
            }
            return init;
        });

        const toggleDate = (dateStr) => {
            setExpandedDates(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
        };

        const handlePick = (dstDate, dstMealIndex, dstMealId) => {
            hide();
            if (typeof onPick === 'function') {
                onPick({ dstDate, dstMealIndex, dstMealId });
            }
        };

        const handleCreateNew = (dstDate) => {
            hide();
            if (typeof onPick === 'function') {
                onPick({ dstDate, createNewMeal: true });
            }
        };

        const sections = (daysWithMeals || []).map((day) => {
            const isExpanded = !!expandedDates[day.dateStr];
            const meals = Array.isArray(day.meals) ? day.meals : [];
            const isToday = todayDateStr && day.dateStr === todayDateStr;

            const header = React.createElement('button', {
                onClick: () => toggleDate(day.dateStr),
                style: {
                    width: '100%',
                    padding: '12px 14px',
                    border: 'none',
                    background: '#f8fafc',
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer',
                    marginBottom: '6px',
                    fontSize: '14px', fontWeight: 600, color: '#0f172a',
                },
            },
                React.createElement('span', null,
                    React.createElement('span', { style: { fontWeight: 700 } }, day.dateLabel),
                    React.createElement('span', { style: { color: '#94a3b8', fontWeight: 500, marginLeft: '6px' } },
                        '— ' + formatDateLabel(day.dateStr)),
                ),
                React.createElement('span', { style: { color: '#94a3b8', fontSize: '12px' } },
                    meals.length + ' ' + (meals.length === 1 ? 'приём' : (meals.length < 5 ? 'приёма' : 'приёмов')),
                    React.createElement('span', { style: { marginLeft: '8px' } }, isExpanded ? '▾' : '▸'),
                ),
            );

            const mealButtons = meals.map((meal, mi) => {
                const isSource = day.dateStr === sourceDate && mi === sourceMealIndex;
                const kcal = calcMealKcal(meal, pIndex, getProductFromItem);
                const itemCount = (meal.items || []).length;
                const emoji = getMealEmoji(meal);
                const name = meal.name || 'Приём';
                return React.createElement('button', {
                    key: meal.id || (day.dateStr + '_' + mi),
                    onClick: isSource ? undefined : () => handlePick(day.dateStr, mi, meal.id),
                    disabled: isSource,
                    style: {
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px',
                        border: '1px solid ' + (isSource ? '#e2e8f0' : '#dbeafe'),
                        background: isSource ? '#f8fafc' : '#fff',
                        borderRadius: '8px',
                        cursor: isSource ? 'not-allowed' : 'pointer',
                        opacity: isSource ? 0.5 : 1,
                        textAlign: 'left',
                        width: '100%',
                    },
                },
                    React.createElement('span', { style: { fontSize: '18px' } }, emoji),
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                        React.createElement('div', {
                            style: { fontSize: '14px', fontWeight: 600, color: '#0f172a' },
                        },
                            meal.time ? meal.time + ' · ' : '',
                            name,
                            isSource ? ' (откуда)' : '',
                        ),
                        React.createElement('div', {
                            style: { fontSize: '11px', color: '#64748b', marginTop: '2px' },
                        },
                            itemCount + ' ' + (itemCount === 1 ? 'продукт' : (itemCount < 5 ? 'продукта' : 'продуктов')),
                            kcal > 0 ? ' · ~' + kcal + ' ккал' : '',
                        ),
                    ),
                );
            });

            const emptyHint = (meals.length === 0 && !isToday)
                ? React.createElement('div', {
                    key: '_empty_',
                    style: { padding: '10px 14px', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' },
                }, 'Приёмов нет')
                : null;

            const newMealBtn = isToday
                ? React.createElement('button', {
                    key: '_new_meal_',
                    onClick: () => handleCreateNew(day.dateStr),
                    style: {
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px',
                        border: '1px dashed #3b82f6',
                        background: '#eff6ff',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        color: '#1d4ed8',
                    },
                },
                    React.createElement('span', { style: { fontSize: '18px' } }, '➕'),
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                        React.createElement('div', {
                            style: { fontSize: '14px', fontWeight: 600 },
                        }, 'Новый приём'),
                        React.createElement('div', {
                            style: { fontSize: '11px', color: '#64748b', marginTop: '2px' },
                        }, 'выбрать время и оценки'),
                    ),
                )
                : null;

            const list = isExpanded && React.createElement('div', {
                style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px', paddingLeft: '4px' },
            }, emptyHint, ...mealButtons, newMealBtn);

            return React.createElement('div', { key: day.dateStr }, header, list);
        });

        return React.createElement(ModalShellWrap, {
            title,
            sourceLabel,
            onClose: hide,
        }, sections);
    }

    function MealMoveView(state) {
        const { sourceDate, sourceLabel, daysWithMeals, onPick } = state;

        const handlePick = (dstDate) => {
            if (dstDate === sourceDate) return;
            hide();
            if (typeof onPick === 'function') onPick({ dstDate });
        };

        const cards = (daysWithMeals || []).map((day) => {
            const isSource = day.dateStr === sourceDate;
            const meals = Array.isArray(day.meals) ? day.meals : [];
            return React.createElement('button', {
                key: day.dateStr,
                onClick: isSource ? undefined : () => handlePick(day.dateStr),
                disabled: isSource,
                style: {
                    display: 'flex', alignItems: 'center', gap: '12px',
                    width: '100%', padding: '16px 18px',
                    border: '1px solid ' + (isSource ? '#e2e8f0' : '#dbeafe'),
                    background: isSource ? '#f8fafc' : '#fff',
                    borderRadius: '12px',
                    cursor: isSource ? 'not-allowed' : 'pointer',
                    opacity: isSource ? 0.5 : 1,
                    textAlign: 'left',
                    marginBottom: '10px',
                },
            },
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', {
                        style: { fontSize: '15px', fontWeight: 700, color: '#0f172a' },
                    },
                        day.dateLabel,
                        React.createElement('span', { style: { color: '#94a3b8', fontWeight: 500, marginLeft: '6px' } },
                            '— ' + formatDateLabel(day.dateStr)),
                        isSource ? React.createElement('span', { style: { fontSize: '11px', color: '#94a3b8', marginLeft: '8px' } }, '(откуда)') : null,
                    ),
                    React.createElement('div', {
                        style: { fontSize: '12px', color: '#64748b', marginTop: '4px' },
                    },
                        meals.length + ' ' + (meals.length === 1 ? 'приём' : (meals.length < 5 ? 'приёма' : 'приёмов')) +
                        (meals.length > 0 ? ' (' + meals.map(m => m.time || '?').filter(Boolean).slice(0, 4).join(', ') + (meals.length > 4 ? '…' : '') + ')' : ''),
                    ),
                ),
                !isSource && React.createElement('span', {
                    style: { fontSize: '20px', color: '#3b82f6' },
                }, '→'),
            );
        });

        return React.createElement(ModalShellWrap, {
            title: 'Куда переместить приём?',
            sourceLabel,
            onClose: hide,
        }, cards);
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

    function ensureAnimations() {
        if (document.getElementById('move-modal-anim')) return;
        const style = document.createElement('style');
        style.id = 'move-modal-anim';
        style.textContent = `
@keyframes moveModalFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes moveModalSlideUp { from { transform: translateY(20px); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } }
[data-theme="dark"] .move-modal { background: #1e293b; color: #f1f5f9; }
[data-theme="dark"] .move-modal button { color: #f1f5f9; }
`;
        document.head.appendChild(style);
    }

    function show(options = {}) {
        ensureRoot();
        ensureAnimations();
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
        document.addEventListener('DOMContentLoaded', () => { ensureRoot(); ensureAnimations(); });
    } else {
        ensureRoot();
        ensureAnimations();
    }
})(window);
