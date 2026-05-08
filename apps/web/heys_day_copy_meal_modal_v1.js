// heys_day_copy_meal_modal_v1.js — Модалка копирования продуктов между приёмами пищи
// Собственный modal-shell (не через ConfirmModal): bottom-sheet ~92vh высоты с
// scrollable body. Pattern совместим с heys_confirm_modal_v1.js (createRoot + setModalState + ModalManager).
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
        return React.createElement(CopyMealView, state);
    }

    // === UI ===
    function CopyMealView({ sourceMeal, sourceMealIndex, sourceDate, targetDate, targetMeals, onCopyToExisting, onCopyToNew }) {
        const allItems = (sourceMeal && sourceMeal.items) || [];
        const sameDay = sourceDate && targetDate && sourceDate === targetDate;
        const candidateMeals = ((targetMeals) || [])
            .map((m, i) => ({ meal: m, index: i }))
            .filter(({ index }) => !sameDay || index !== sourceMealIndex);

        const [selectedIds, setSelectedIds] = React.useState(() => new Set(allItems.map((it) => it.id)));
        const [targetType, setTargetType] = React.useState(candidateMeals.length > 0 ? 'existing' : 'new');
        const [dstMealIndex, setDstMealIndex] = React.useState(candidateMeals.length > 0 ? candidateMeals[0].index : null);
        const [itemGrams, setItemGrams] = React.useState(() => {
            const m = {};
            allItems.forEach(it => { m[it.id] = Number(it.grams) || 100; });
            return m;
        });

        const adjustGrams = React.useCallback((id, delta) => {
            setItemGrams(prev => {
                const cur = prev[id] ?? 100;
                return { ...prev, [id]: Math.max(1, Math.min(999, cur + delta)) };
            });
        }, []);

        const allSelected = selectedIds.size === allItems.length && allItems.length > 0;

        const toggleAll = () => {
            if (allSelected) setSelectedIds(new Set());
            else setSelectedIds(new Set(allItems.map((it) => it.id)));
        };

        const toggleItem = (id) => {
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

        const sourceLabel = (sourceMeal && sourceMeal.name)
            ? `«${sourceMeal.name}»${sourceMeal.time ? ' · ' + sourceMeal.time : ''}`
            : 'приём';
        const titleText = sameDay
            ? `Копировать из ${sourceLabel}`
            : `Копировать из ${sourceLabel} в сегодня`;

        // === Header ===
        const header = React.createElement('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 20px 12px',
                borderBottom: '1px solid var(--border, #e2e8f0)',
                flexShrink: 0,
            },
        },
            React.createElement('div', {
                style: {
                    flex: '1 1 auto',
                    minWidth: 0,
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text, #111827)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                },
            }, titleText),
            React.createElement('button', {
                type: 'button',
                onClick: () => hide(),
                'aria-label': 'Закрыть',
                style: {
                    flexShrink: 0,
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--border, #f1f5f9)',
                    color: 'var(--muted, #64748b)',
                    fontSize: '16px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                },
            }, '✕'),
        );

        // === Items section ===
        const itemsSection = React.createElement('div', {
            style: {
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                flex: '1 1 auto',
                padding: '12px 20px 0',
            },
        },
            React.createElement('div', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--muted, #64748b)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    gap: '8px',
                    flexShrink: 0,
                },
            },
                React.createElement('span', null, `Продукты ${selectedIds.size}/${allItems.length}`),
                React.createElement('button', {
                    type: 'button',
                    onClick: toggleAll,
                    style: {
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--acc, #3b82f6)',
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'none',
                        letterSpacing: 0,
                        cursor: 'pointer',
                        padding: '2px 4px',
                    },
                }, allSelected ? 'Снять всё' : 'Выбрать всё'),
            ),
            React.createElement('div', {
                style: {
                    flex: '1 1 auto',
                    minHeight: '120px',
                    overflowY: 'auto',
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: '12px',
                    background: 'var(--card, #fff)',
                },
            },
                allItems.map((it) => {
                    const isSelected = selectedIds.has(it.id);
                    const currentGrams = itemGrams[it.id] ?? Number(it.grams) ?? 0;
                    const kcal = Math.round(((Number(it.kcal100) || 0) * currentGrams) / 100);
                    const adjBtnStyle = {
                        width: '28px', height: '28px', borderRadius: '8px',
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'var(--bg, #f8fafc)', color: 'var(--text, #374151)',
                        fontSize: '16px', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, padding: 0, lineHeight: 1,
                    };
                    return React.createElement('div', {
                        key: it.id,
                        style: { borderBottom: '1px solid var(--border, #f1f5f9)' },
                    },
                        React.createElement('label', {
                            style: {
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: isSelected ? '10px 14px 6px' : '10px 14px',
                                cursor: 'pointer', minWidth: 0,
                            },
                        },
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: isSelected,
                                onChange: () => toggleItem(it.id),
                                style: { cursor: 'pointer', flexShrink: 0, width: '18px', height: '18px', margin: 0 },
                            }),
                            React.createElement('span', {
                                style: { flex: '1 1 auto', minWidth: 0, fontSize: '14px', color: 'var(--text, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                            }, it.name || 'Без названия'),
                            React.createElement('span', {
                                style: { fontSize: '12px', color: 'var(--muted, #64748b)', whiteSpace: 'nowrap', flexShrink: 0 },
                            }, `${currentGrams}г · ${kcal}к`),
                        ),
                        isSelected && React.createElement('div', {
                            style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px 8px 44px' },
                            onClick: e => e.stopPropagation(),
                        },
                            React.createElement('button', { type: 'button', onClick: () => adjustGrams(it.id, -10), style: adjBtnStyle }, '−'),
                            React.createElement('span', {
                                style: { fontSize: '12px', minWidth: '38px', textAlign: 'center', color: 'var(--text, #111827)', fontVariantNumeric: 'tabular-nums' },
                            }, `${currentGrams}г`),
                            React.createElement('button', { type: 'button', onClick: () => adjustGrams(it.id, +10), style: adjBtnStyle }, '+'),
                            React.createElement('input', {
                                type: 'range', min: 5, max: 500, step: 5,
                                value: currentGrams,
                                onChange: e => setItemGrams(prev => ({ ...prev, [it.id]: +e.target.value })),
                                style: { flex: '1 1 auto', cursor: 'pointer', accentColor: 'var(--acc, #3b82f6)', margin: 0 },
                            }),
                        ),
                    );
                }),
            ),
        );

        // === Targets section ===
        const targetItem = (label, isActive, onChange, key) =>
            React.createElement('label', {
                key,
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: isActive ? 'var(--acc-bg, #eff6ff)' : 'var(--card, #fff)',
                    border: '1px solid ' + (isActive ? 'var(--acc, #3b82f6)' : 'var(--border, #e2e8f0)'),
                    transition: 'background 0.15s, border 0.15s',
                    minWidth: 0,
                },
            },
                React.createElement('input', {
                    type: 'radio',
                    name: 'copy-meal-target',
                    checked: isActive,
                    onChange,
                    style: { cursor: 'pointer', flexShrink: 0, width: '18px', height: '18px', margin: 0 },
                }),
                React.createElement('span', {
                    style: { flex: '1 1 auto', minWidth: 0, fontSize: '14px', color: 'var(--text, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                }, label),
            );

        const targetsSection = React.createElement('div', {
            style: {
                padding: '12px 20px 0',
                flexShrink: 0,
            },
        },
            React.createElement('div', {
                style: {
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--muted, #64748b)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '8px',
                },
            }, sameDay ? 'Куда копировать' : 'Куда копировать (сегодня)'),
            candidateMeals.length === 0 && React.createElement('div', {
                style: { fontSize: '12px', color: 'var(--muted, #94a3b8)', marginBottom: '8px', fontStyle: 'italic' },
            }, 'На сегодня приёмов ещё нет — создадим новый.'),
            React.createElement('div', {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                },
            },
                ...candidateMeals.map(({ meal, index }) =>
                    targetItem(
                        `${meal.name || 'Приём'}${meal.time ? ' · ' + meal.time : ''}`,
                        targetType === 'existing' && dstMealIndex === index,
                        () => { setTargetType('existing'); setDstMealIndex(index); },
                        `meal-${meal.id || index}`,
                    ),
                ),
                targetItem(
                    '➕ Создать новый приём',
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
            const addedKcal = allItems.reduce((s, it) => {
                if (!selectedIds.has(it.id)) return s;
                const g = itemGrams[it.id] ?? Number(it.grams) ?? 0;
                return s + Math.round(((Number(it.kcal100) || 0) * g) / 100);
            }, 0);
            return { dstName: dstMeal.name || 'Приём', dstKcal, addedKcal, totalKcal: dstKcal + addedKcal };
        }, [targetType, dstMealIndex, targetMeals, selectedIds, itemGrams, allItems]);

        // === Footer (buttons + optional KBJU preview) ===
        const footer = React.createElement('div', {
            style: {
                borderTop: '1px solid var(--border, #e2e8f0)',
                flexShrink: 0,
                background: 'var(--card, #fff)',
            },
        },
            kbjuPreview && React.createElement('div', {
                style: {
                    padding: '10px 20px 0',
                    fontSize: '12px',
                    color: 'var(--muted, #64748b)',
                    textAlign: 'center',
                    letterSpacing: '0.01em',
                },
            }, `${kbjuPreview.dstName}: ${kbjuPreview.dstKcal}к → ${kbjuPreview.totalKcal}к (+${kbjuPreview.addedKcal}к)`),
            React.createElement('div', {
                style: { display: 'flex', gap: '8px', padding: '12px 20px 16px' },
            },
                React.createElement('button', {
                    type: 'button',
                    onClick: () => hide(),
                    style: {
                        flex: '0 0 auto',
                        padding: '12px 20px',
                        borderRadius: '12px',
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'var(--card, #fff)',
                        color: 'var(--text, #111827)',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: 'pointer',
                    },
                }, 'Отмена'),
                React.createElement('button', {
                    type: 'button',
                    onClick: handleCopy,
                    disabled: !canSubmit,
                    style: {
                        flex: '1 1 auto',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: 'none',
                        background: canSubmit ? 'var(--acc, #3b82f6)' : 'var(--border, #cbd5e1)',
                        color: '#fff',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: canSubmit ? 'pointer' : 'not-allowed',
                        transition: 'background 0.15s',
                    },
                }, `Копировать (${selectedIds.size})`),
            ),
        );

        // === Backdrop + centered sheet с воздухом со всех сторон ===
        // Паттерн совпадает с .mc-modal (StepModal/heys_add_product_step_v1) — модалка центрирована,
        // занимает почти весь экран (calc(100dvh - 32px)), но с padding-зоной от backdrop.
        return React.createElement('div', {
            className: 'copy-meal-modal-backdrop',
            onClick: handleBackdropClick,
            style: {
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.55)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'calc(20px + var(--safe-area-top, 0px)) calc(16px + var(--safe-area-right, 0px)) calc(32px + var(--safe-area-bottom, 0px)) calc(16px + var(--safe-area-left, 0px))',
                zIndex: 10000,
                animation: 'copyMealFadeIn 0.15s ease-out',
            },
        },
            React.createElement('div', {
                className: 'copy-meal-modal',
                onClick: (e) => e.stopPropagation(),
                style: {
                    width: '100%',
                    maxWidth: '480px',
                    height: '100%',
                    maxHeight: 'calc(100dvh - 52px - var(--safe-area-top, 0px) - var(--safe-area-bottom, 0px))',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--card, #fff)',
                    borderRadius: '20px',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                    animation: 'copyMealScaleIn 0.18s ease-out',
                },
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
[data-theme="dark"] .copy-meal-modal { background: #1e293b; color: #f1f5f9; }
[data-theme="dark"] .copy-meal-modal label { color: #f1f5f9; }
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

    HEYS.CopyMealModal = { show, hide, close: hide };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { ensureRoot(); ensureAnimations(); });
    } else {
        setTimeout(() => { ensureRoot(); ensureAnimations(); }, 0);
    }
})(typeof window !== 'undefined' ? window : global);
