// day/_advice.js — Advice UI + State bundle for DayTab
// Aggregates: AdviceCard, manual list, toast UI, and advice state

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

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

    function renderAdviceEvidence(advice) {
        if (!hasExpertContent(advice)) return null;

        const confidenceLabel = advice.confidenceLabel || (
            advice.confidence === 'high' ? 'высокая'
                : advice.confidence === 'medium' ? 'средняя'
                    : advice.confidence === 'low' ? 'базовая'
                        : ''
        );

        const parts = [];
        if (confidenceLabel) parts.push(`Уверенность: ${confidenceLabel}`);
        if (advice.evidenceSummary) parts.push(advice.evidenceSummary);

        if (parts.length === 0) return null;

        return React.createElement('div', {
            className: 'advice-expert-evidence'
        },
            React.createElement('div', null, '🧠 ' + parts.join(' · ')),
            advice?.expertMeta?.whyNow && React.createElement('div', {
                style: { marginTop: '4px', opacity: 0.9 }
            }, 'Почему сейчас: ' + advice.expertMeta.whyNow),
            advice?.expertMeta?.actionNow?.label && React.createElement('div', {
                style: { marginTop: '4px', opacity: 0.92, fontWeight: 500 }
            }, 'Следующий шаг: ' + advice.expertMeta.actionNow.label),
            advice?.expertMeta?.science && React.createElement('div', {
                style: { marginTop: '4px', opacity: 0.86 }
            }, `Научная опора: ${advice.expertMeta.science.evidenceLevel} · ${advice.expertMeta.science.topic}`),
            advice?.expertMeta?.causal && React.createElement('div', {
                style: { marginTop: '4px', opacity: 0.84 }
            }, `Причинная цепочка: ${advice.expertMeta.causal.relevance === 'root' ? 'бьём в root cause' : advice.expertMeta.causal.relevance === 'mechanism' ? 'работаем по механизму' : 'сдерживаем outcome'} · ${advice.expertMeta.causal.name}`),
            advice?.expertMeta?.causal?.mechanism && React.createElement('div', {
                style: { marginTop: '4px', fontSize: '12px', opacity: 0.72 }
            }, advice.expertMeta.causal.mechanism),
            advice?.expertMeta?.responseMemory && React.createElement('div', {
                style: { marginTop: '4px', opacity: 0.82 }
            }, `Response memory: ${advice.expertMeta.responseMemory.label}`),
            advice?.expertMeta?.responseMemory?.message && React.createElement('div', {
                style: { marginTop: '4px', fontSize: '12px', opacity: 0.72 }
            }, advice.expertMeta.responseMemory.message),
            advice?.expertMeta?.uncertainty && React.createElement('div', {
                style: { marginTop: '4px', opacity: 0.82 }
            }, `Статус вывода: ${advice.expertMeta.uncertainty.label}`),
            advice?.expertMeta?.uncertainty?.message && React.createElement('div', {
                style: { marginTop: '4px', fontSize: '12px', opacity: 0.72 }
            }, advice.expertMeta.uncertainty.message),
            (advice?.expertMeta?.sourceCount || advice?.expertMeta?.evidenceScore) && React.createElement('div', {
                style: { marginTop: '4px', fontSize: '12px', opacity: 0.72 }
            }, [
                advice?.expertMeta?.sourceCount ? `источников: ${advice.expertMeta.sourceCount}` : null,
                advice?.expertMeta?.evidenceScore ? `score: ${advice.expertMeta.evidenceScore}` : null,
                advice?.expertMeta?.science?.confidenceScore ? `science: ${Math.round(advice.expertMeta.science.confidenceScore * 100)}%` : null,
                advice?.expertMeta?.responseMemory?.sampleCount ? `feedback: ${advice.expertMeta.responseMemory.sampleCount}` : null
            ].filter(Boolean).join(' · '))
        );
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
        onToggleExpand,
        trackClick,
        onRate,
        onSwipeStart,
        onSwipeMove,
        onSwipeEnd,
        onLongPressStart,
        onLongPressEnd,
        registerCardRef,
    }) {
        const [scheduledConfirm, setScheduledConfirm] = React.useState(false);
        const [ratedState, setRatedState] = React.useState(null); // 'positive' | 'negative' | null
        const hasExpandedContent = !!(advice?.details || hasExpertContent(advice));

        const swipeX = swipeState?.x || 0;
        const swipeDirection = swipeState?.direction;
        const swipeProgress = Math.min(1, Math.abs(swipeX) / 100);
        const showUndo = isLastDismissed && (isDismissed || isHidden);
        const showReadFeedback = showUndo && lastDismissedAction === 'read';

        const handleSchedule = React.useCallback((e) => {
            e.stopPropagation();
            if (onSchedule) {
                onSchedule(advice, 120);
                setScheduledConfirm(true);
                if (navigator.vibrate) navigator.vibrate(50);
                setTimeout(() => {
                    onClearLastDismissed && onClearLastDismissed();
                }, 1500);
            }
        }, [advice, onSchedule, onClearLastDismissed]);

        const handleRate = React.useCallback((isPositive, e) => {
            e.stopPropagation();
            if (!onRate) return;
            onRate(advice, isPositive);
            setRatedState(isPositive ? 'positive' : 'negative');
            if (navigator.vibrate) navigator.vibrate(30);
            setTimeout(() => {
                onClearLastDismissed && onClearLastDismissed();
            }, 900);
        }, [advice, onRate, onClearLastDismissed]);

        React.useEffect(() => {
            if (!showUndo) {
                setScheduledConfirm(false);
                setRatedState(null);
            }
        }, [showUndo]);

        if ((isDismissed || isHidden) && !showUndo) return null;

        return React.createElement('div', {
            className: 'advice-list-item-wrapper',
            style: {
                animationDelay: `${globalIndex * 50}ms`,
                '--stagger-delay': `${globalIndex * 50}ms`,
                position: 'relative',
                overflow: 'hidden',
            },
        },
            showUndo && React.createElement('div', {
                className: `advice-undo-overlay advice-list-item-${advice.type}`,
                style: {
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--advice-bg, #ecfdf5)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    color: 'var(--color-slate-700, #334155)',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    zIndex: 10,
                },
            },
                showReadFeedback
                    ? React.createElement(React.Fragment, null,
                        React.createElement('button', {
                            onClick: (e) => {
                                e.stopPropagation();
                                onClearLastDismissed && onClearLastDismissed();
                            },
                            style: {
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                border: 'none',
                                background: 'rgba(0,0,0,0.05)',
                                borderRadius: '999px',
                                width: '24px',
                                height: '24px',
                                cursor: 'pointer',
                                color: '#64748b'
                            }
                        }, '×'),
                        scheduledConfirm
                            ? React.createElement('span', {
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: '#3b82f6',
                                    animation: 'fadeIn 0.3s ease',
                                },
                            }, '⏰ Напомню через 2 часа ✓')
                            : ratedState
                                ? React.createElement('span', {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: ratedState === 'positive' ? '#16a34a' : '#dc2626',
                                        animation: 'fadeIn 0.2s ease',
                                    }
                                }, ratedState === 'positive' ? '👍 Учту как полезный' : '👎 Учту как слабый / вредный')
                                : React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'stretch',
                                        justifyContent: 'stretch',
                                        gap: '10px',
                                        width: '100%',
                                        height: '100%',
                                        padding: '8px 10px',
                                        boxSizing: 'border-box',
                                    }
                                },
                                    React.createElement('button', {
                                        onClick: (e) => handleRate(false, e),
                                        style: {
                                            border: 'none',
                                            background: 'rgba(220, 38, 38, 0.16)',
                                            color: '#b91c1c',
                                            padding: '10px 14px',
                                            borderRadius: '18px',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            flex: '1 1 40%',
                                            minWidth: '0',
                                            minHeight: '72px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            boxShadow: 'inset 0 0 0 1px rgba(220, 38, 38, 0.06)'
                                        }
                                    }, '👎 Вредный'),
                                    onSchedule && React.createElement('button', {
                                        onClick: handleSchedule,
                                        style: {
                                            border: 'none',
                                            background: 'rgba(59, 130, 246, 0.14)',
                                            color: '#2563eb',
                                            padding: '10px 8px',
                                            borderRadius: '18px',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            flex: '0 0 20%',
                                            minWidth: '70px',
                                            minHeight: '72px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.06)'
                                        }
                                    }, '⏰ 2ч'),
                                    React.createElement('button', {
                                        onClick: (e) => handleRate(true, e),
                                        style: {
                                            border: 'none',
                                            background: 'rgba(22, 163, 74, 0.16)',
                                            color: '#15803d',
                                            padding: '10px 14px',
                                            borderRadius: '18px',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            flex: '1 1 40%',
                                            minWidth: '0',
                                            minHeight: '72px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            boxShadow: 'inset 0 0 0 1px rgba(22, 163, 74, 0.06)'
                                        }
                                    }, '👍 Полезный')
                                )
                    )
                    : React.createElement(React.Fragment, null,
                        scheduledConfirm
                            ? React.createElement('span', {
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: '#3b82f6',
                                    animation: 'fadeIn 0.3s ease',
                                },
                            }, '⏰ Напомню через 2 часа ✓')
                            : React.createElement(React.Fragment, null,
                                React.createElement('span', {
                                    style: { color: '#f97316' },
                                }, '🔕 Скрыто'),
                                React.createElement('div', { style: { display: 'flex', gap: '8px' } },
                                    React.createElement('span', {
                                        onClick: (e) => { e.stopPropagation(); onUndo(); },
                                        style: {
                                            background: 'rgba(0,0,0,0.08)',
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                        },
                                    }, 'Отменить'),
                                    onSchedule && React.createElement('span', {
                                        onClick: handleSchedule,
                                        style: {
                                            background: 'rgba(0,0,0,0.06)',
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        },
                                    }, 'Напомнить через 2ч.')
                                )
                            )
                    ),
                !showReadFeedback && !scheduledConfirm && React.createElement('div', {
                    style: {
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: '3px',
                        background: 'rgba(0,0,0,0.15)',
                        width: '100%',
                        animation: 'undoProgress 3s linear forwards',
                    },
                })
            ),
            !showUndo && React.createElement('div', {
                className: 'advice-list-item-bg advice-list-item-bg-left',
                style: { opacity: swipeDirection === 'left' ? swipeProgress : 0 },
            }, React.createElement('span', null, '✓ Прочитано')),
            !showUndo && React.createElement('div', {
                className: 'advice-list-item-bg advice-list-item-bg-right',
                style: { opacity: swipeDirection === 'right' ? swipeProgress : 0 },
            }, React.createElement('span', null, '🔕 До завтра')),
            React.createElement('div', {
                ref: (el) => registerCardRef(advice.id, el),
                className: `advice-list-item advice-list-item-${advice.type}${isExpanded ? ' expanded' : ''}`,
                style: {
                    transform: showUndo ? 'none' : `translateX(${swipeX}px)`,
                    opacity: showUndo ? 0.1 : (1 - swipeProgress * 0.3),
                    pointerEvents: showUndo ? 'none' : 'auto',
                },
                onClick: (e) => {
                    if (showUndo || Math.abs(swipeX) > 10) return;
                    e.stopPropagation();
                    if (!isExpanded && trackClick) trackClick(advice);
                    onToggleExpand && onToggleExpand(advice.id);
                },
                onTouchStart: (e) => {
                    if (showUndo) return;
                    onSwipeStart(advice.id, e);
                    onLongPressStart(advice.id);
                },
                onTouchMove: (e) => {
                    if (showUndo) return;
                    onSwipeMove(advice.id, e);
                    onLongPressEnd();
                },
                onTouchEnd: () => {
                    if (showUndo) return;
                    onSwipeEnd(advice.id);
                    onLongPressEnd();
                },
            },
                React.createElement('span', { className: 'advice-list-icon' }, advice.icon),
                React.createElement('div', { className: 'advice-list-content' },
                    React.createElement('span', { className: 'advice-list-text' }, advice.text),
                    hasExpandedContent && React.createElement('span', {
                        className: 'advice-expand-arrow',
                        style: {
                            marginLeft: '6px',
                            fontSize: '10px',
                            opacity: 0.5,
                            transition: 'transform 0.2s',
                            display: 'inline-block',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        },
                    }, '▼'),
                    isExpanded && hasExpandedContent && React.createElement('div', {
                        className: 'advice-list-details',
                    },
                        advice.details && React.createElement('div', null, advice.details),
                        renderAdviceEvidence(advice)
                    )
                )
            )
        );
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.AdviceCard = AdviceCard;

    // --- Manual advice list UI ---
    const dayAdviceListUI = {};

    dayAdviceListUI.renderManualAdviceList = function renderManualAdviceList({
        React,
        adviceTrigger,
        adviceRelevant,
        toastVisible,
        dismissToast,
        getSortedGroupedAdvices,
        dismissedAdvices,
        hiddenUntilTomorrow,
        lastDismissedAdvice,
        adviceSwipeState,
        expandedAdviceId,
        trackClick,
        handleAdviceToggleExpand,
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
        adviceSoundEnabled,
        toggleAdviceSoundEnabled,
        scheduleAdvice,
        undoLastDismiss,
        clearLastDismissed,
        ADVICE_CATEGORY_NAMES,
        AdviceCard,
    }) {
        if (!(adviceTrigger === 'manual' && adviceRelevant?.length > 0 && toastVisible)) return null;

        const { sorted, groups } = getSortedGroupedAdvices(adviceRelevant);
        const activeCount = sorted.filter(a => !dismissedAdvices.has(a.id)).length;
        const groupKeys = Object.keys(groups);

        return React.createElement('div', {
            className: 'advice-list-overlay',
            onClick: dismissToast,
        },
            React.createElement('div', {
                className: `advice-list-container${dismissAllAnimation ? ' shake-warning' : ''}`,
                onClick: e => e.stopPropagation(),
                onTouchStart: handleAdviceListTouchStart,
                onTouchMove: handleAdviceListTouchMove,
                onTouchEnd: handleAdviceListTouchEnd,
            },
                React.createElement('div', { className: 'advice-list-header' },
                    React.createElement('div', { className: 'advice-list-header-top' },
                        React.createElement('span', null, `💡 Советы (${activeCount})`),
                        activeCount > 1 && React.createElement('button', {
                            className: 'advice-list-dismiss-all',
                            onClick: handleDismissAll,
                            disabled: dismissAllAnimation,
                            title: 'Пометить все советы прочитанными',
                        }, 'Прочитать все')
                    ),
                    React.createElement('div', { className: 'advice-list-header-left' },
                        React.createElement('div', { className: 'advice-list-toggles' },
                            React.createElement('label', {
                                className: 'ios-toggle-label',
                                title: toastsEnabled ? 'Отключить всплывающие советы' : 'Включить всплывающие советы',
                            },
                                React.createElement('div', {
                                    className: `ios-toggle ${toastsEnabled ? 'ios-toggle-on' : ''}`,
                                    onClick: toggleToastsEnabled,
                                }, React.createElement('div', { className: 'ios-toggle-thumb' })),
                                React.createElement('div', { className: 'advice-toggle-text-group' },
                                    React.createElement('span', { className: 'ios-toggle-text' }, '🔔'),
                                    React.createElement('span', { className: 'advice-toggle-hint' }, 'Автопоказ всплывающих советов')
                                )
                            ),
                            React.createElement('label', {
                                className: 'ios-toggle-label',
                                title: adviceSoundEnabled ? 'Выключить звук советов' : 'Включить звук советов',
                            },
                                React.createElement('div', {
                                    className: `ios-toggle ${adviceSoundEnabled ? 'ios-toggle-on' : ''}`,
                                    onClick: toggleAdviceSoundEnabled,
                                }, React.createElement('div', { className: 'ios-toggle-thumb' })),
                                React.createElement('div', { className: 'advice-toggle-text-group' },
                                    React.createElement('span', { className: 'ios-toggle-text' }, adviceSoundEnabled ? '🔊' : '🔇'),
                                    React.createElement('span', { className: 'advice-toggle-hint' }, adviceSoundEnabled ? 'Звук советов включён' : 'Звук советов выключен')
                                )
                            )
                        )
                    )
                ),
                React.createElement('div', { className: 'advice-list-items' },
                    groupKeys.length > 1
                        ? groupKeys.map(category => {
                            const categoryAdvices = groups[category];
                            const activeCategoryAdvices = categoryAdvices.filter(a =>
                                !dismissedAdvices.has(a.id) || lastDismissedAdvice?.id === a.id
                            );
                            if (activeCategoryAdvices.length === 0) return null;

                            return React.createElement('div', { key: category, className: 'advice-group' },
                                React.createElement('div', { className: 'advice-group-header' },
                                    ADVICE_CATEGORY_NAMES[category] || category
                                ),
                                activeCategoryAdvices.map((advice) =>
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
                                        onToggleExpand: handleAdviceToggleExpand,
                                        trackClick,
                                        onRate: rateAdvice,
                                        onSwipeStart: handleAdviceSwipeStart,
                                        onSwipeMove: handleAdviceSwipeMove,
                                        onSwipeEnd: handleAdviceSwipeEnd,
                                        onLongPressStart: handleAdviceLongPressStart,
                                        onLongPressEnd: handleAdviceLongPressEnd,
                                        registerCardRef: registerAdviceCardRef,
                                    })
                                )
                            );
                        })
                        : sorted.filter(a => !dismissedAdvices.has(a.id) || lastDismissedAdvice?.id === a.id)
                            .map((advice, index) => React.createElement(AdviceCard, {
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
                                onToggleExpand: handleAdviceToggleExpand,
                                trackClick,
                                onRate: rateAdvice,
                                onSwipeStart: handleAdviceSwipeStart,
                                onSwipeMove: handleAdviceSwipeMove,
                                onSwipeEnd: handleAdviceSwipeEnd,
                                onLongPressStart: handleAdviceLongPressStart,
                                onLongPressEnd: handleAdviceLongPressEnd,
                                registerCardRef: registerAdviceCardRef,
                            }))
                ),
                activeCount > 0 && React.createElement('div', { className: 'advice-list-hints' },
                    React.createElement('span', { className: 'advice-list-hint-item' }, '← прочитано'),
                    React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
                    React.createElement('span', { className: 'advice-list-hint-item' }, 'скрыть →'),
                    React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
                    React.createElement('span', { className: 'advice-list-hint-item' }, 'удерживать = детали')
                )
            )
        );
    };

    dayAdviceListUI.renderEmptyAdviceToast = function renderEmptyAdviceToast({
        React,
        adviceTrigger,
        toastVisible,
        dismissToast,
    }) {
        if (!(adviceTrigger === 'manual_empty' && toastVisible)) return null;

        return React.createElement('div', {
            className: 'macro-toast macro-toast-success visible',
            role: 'alert',
            onClick: dismissToast,
            style: { transform: 'translateX(-50%) translateY(0)' },
        },
            React.createElement('div', { className: 'macro-toast-main' },
                React.createElement('span', { className: 'macro-toast-icon' }, '✨'),
                React.createElement('span', { className: 'macro-toast-text' }, 'Всё отлично! Советов нет'),
                React.createElement('button', {
                    className: 'macro-toast-close',
                    onClick: (e) => { e.stopPropagation(); dismissToast(); },
                }, '×')
            )
        );
    };

    HEYS.dayAdviceListUI = dayAdviceListUI;

    // --- Auto advice toast UI ---
    const dayAdviceToastUI = {};

    dayAdviceToastUI.renderAutoAdviceToast = function renderAutoAdviceToast({
        React,
        adviceTrigger,
        displayedAdvice,
        toastVisible,
        adviceExpanded,
        toastSwiped,
        toastSwipeX,
        toastDetailsOpen,
        toastAppearedAtRef,
        toastRatedState,
        toastScheduledConfirm,
        haptic,
        dismissToast,
        handleToastRate,
        setToastDetailsOpen,
        setAdviceExpanded,
        setAdviceTrigger,
        handleToastTouchStart,
        handleToastTouchMove,
        handleToastTouchEnd,
        handleToastUndo,
        handleToastSchedule,
    }) {
        if (adviceTrigger === 'manual' || adviceTrigger === 'manual_empty') return null;
        if (!displayedAdvice || !toastVisible) return null;
        const hasDetailsContent = !!(displayedAdvice.details || hasExpertContent(displayedAdvice));

        return React.createElement('div', {
            className: 'macro-toast macro-toast-' + displayedAdvice.type +
                ' visible' +
                (adviceExpanded ? ' expanded' : '') +
                (toastSwiped ? ' swiped' : '') +
                (displayedAdvice.animationClass ? ' anim-' + displayedAdvice.animationClass : '') +
                (displayedAdvice.id?.startsWith('personal_best') ? ' personal-best' : ''),
            role: 'alert',
            'aria-live': 'polite',
            onClick: () => {
                if (toastSwiped) return;
                if (Math.abs(toastSwipeX) < 10 && hasDetailsContent) {
                    haptic && haptic('light');
                    setToastDetailsOpen(!toastDetailsOpen);
                }
            },
            onTouchStart: handleToastTouchStart,
            onTouchMove: handleToastTouchMove,
            onTouchEnd: handleToastTouchEnd,
            style: {
                transform: toastSwiped
                    ? 'translateX(-50%) translateY(0)'
                    : `translateX(calc(-50% + ${toastSwipeX}px)) translateY(0)`,
                opacity: toastSwiped ? 1 : 1 - Math.abs(toastSwipeX) / 150,
            },
        },
            toastSwiped && React.createElement('div', {
                className: 'advice-undo-overlay',
                style: {
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    background: 'var(--toast-bg, #ecfdf5)',
                    borderRadius: '10px',
                    color: 'var(--color-slate-700, #334155)',
                    fontWeight: 600,
                    fontSize: '14px',
                    zIndex: 10,
                },
            },
                React.createElement('button', {
                    onClick: (e) => {
                        e.stopPropagation();
                        dismissToast && dismissToast();
                    },
                    style: {
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        border: 'none',
                        background: 'rgba(0,0,0,0.05)',
                        borderRadius: '999px',
                        width: '24px',
                        height: '24px',
                        cursor: 'pointer',
                        color: '#64748b'
                    }
                }, '×'),
                toastScheduledConfirm
                    ? React.createElement('span', {
                        style: { display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' },
                    }, '⏰ Напомню через 2 часа ✓')
                    : toastRatedState
                        ? React.createElement('span', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: toastRatedState === 'positive' ? '#16a34a' : '#dc2626',
                                animation: 'fadeIn 0.2s ease',
                            }
                        }, toastRatedState === 'positive' ? '👍 Учту как полезный' : '👎 Учту как слабый / вредный')
                        : React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'stretch',
                                justifyContent: 'stretch',
                                gap: '10px',
                                width: '100%',
                                height: '100%',
                                padding: '8px 10px',
                                boxSizing: 'border-box',
                            }
                        },
                            React.createElement('button', {
                                onClick: (e) => handleToastRate && handleToastRate(false, e),
                                style: {
                                    border: 'none',
                                    background: 'rgba(220, 38, 38, 0.16)',
                                    color: '#b91c1c',
                                    padding: '10px 14px',
                                    borderRadius: '18px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: '1 1 40%',
                                    minWidth: '0',
                                    minHeight: '72px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    lineHeight: 1.1,
                                    boxShadow: 'inset 0 0 0 1px rgba(220, 38, 38, 0.06)'
                                },
                            }, '👎 Вредный'),
                            React.createElement('button', {
                                onClick: handleToastSchedule,
                                style: {
                                    border: 'none',
                                    background: 'rgba(59, 130, 246, 0.14)',
                                    color: '#2563eb',
                                    padding: '10px 8px',
                                    borderRadius: '18px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: '0 0 20%',
                                    minWidth: '70px',
                                    minHeight: '72px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    lineHeight: 1.1,
                                    boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.06)'
                                },
                            }, '⏰ 2ч'),
                            React.createElement('button', {
                                onClick: (e) => handleToastRate && handleToastRate(true, e),
                                style: {
                                    border: 'none',
                                    background: 'rgba(22, 163, 74, 0.16)',
                                    color: '#15803d',
                                    padding: '10px 14px',
                                    borderRadius: '18px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: '1 1 40%',
                                    minWidth: '0',
                                    minHeight: '72px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    lineHeight: 1.1,
                                    boxShadow: 'inset 0 0 0 1px rgba(22, 163, 74, 0.06)'
                                },
                            }, '👍 Полезный')
                        )
            ),
            React.createElement('div', {
                className: 'macro-toast-main',
                style: { visibility: toastSwiped ? 'hidden' : 'visible' },
            },
                React.createElement('span', { className: 'macro-toast-icon' }, displayedAdvice.icon),
                React.createElement('span', { className: 'macro-toast-text' }, displayedAdvice.text),
                React.createElement('div', {
                    className: 'macro-toast-expand',
                    onClick: (e) => {
                        e.stopPropagation();
                        const timeSinceAppear = Date.now() - toastAppearedAtRef.current;
                        if (timeSinceAppear < 500) return;
                        haptic && haptic('light');
                        setAdviceExpanded(true);
                        setAdviceTrigger('manual');
                    },
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        opacity: 0.7,
                        transition: 'opacity 0.2s',
                        lineHeight: 1.1,
                    },
                },
                    React.createElement('span', { style: { fontSize: '14px' } }, '▲'),
                    React.createElement('span', { style: { fontSize: '9px' } }, 'все'),
                    React.createElement('span', { style: { fontSize: '9px' } }, 'советы')
                )
            ),
            React.createElement('div', {
                style: {
                    display: 'flex',
                    visibility: toastSwiped ? 'hidden' : 'visible',
                    alignItems: 'center',
                    justifyContent: hasDetailsContent ? 'space-between' : 'flex-end',
                    padding: '6px 0 2px 0',
                    marginTop: '2px',
                },
            },
                hasDetailsContent && React.createElement('div', {
                    onClick: (e) => {
                        e.stopPropagation();
                        haptic && haptic('light');
                        setToastDetailsOpen(!toastDetailsOpen);
                    },
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: 'rgba(100, 100, 100, 0.8)',
                        fontWeight: 500,
                    },
                },
                    React.createElement('span', {
                        style: {
                            display: 'inline-block',
                            transition: 'transform 0.2s',
                            transform: toastDetailsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        },
                    }, '▼'),
                    toastDetailsOpen ? 'Скрыть' : 'Детали'
                ),
                React.createElement('span', {
                    style: {
                        fontSize: '11px',
                        color: 'rgba(128, 128, 128, 0.6)',
                    },
                }, '← свайп — прочитано')
            ),
            !toastSwiped && toastDetailsOpen && hasDetailsContent && React.createElement('div', {
                style: {
                    padding: '8px 12px',
                    fontSize: '13px',
                    lineHeight: '1.4',
                    color: 'rgba(80, 80, 80, 0.9)',
                    background: 'rgba(0, 0, 0, 0.03)',
                    borderRadius: '8px',
                    marginTop: '4px',
                    marginBottom: '4px',
                },
            },
                displayedAdvice.details && React.createElement('div', null, displayedAdvice.details),
                renderAdviceEvidence(displayedAdvice)
            )
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
        dayTot,
        normAbs,
        optimum,
        waterGoal,
        uiState,
        haptic,
        U,
        lsGet,
        currentStreak,
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

        const [adviceTrigger, setAdviceTrigger] = useState(null);
        const [adviceExpanded, setAdviceExpanded] = useState(false);
        const toastAppearedAtRef = useRef(0);
        const [displayedAdvice, setDisplayedAdvice] = useState(null);
        const [displayedAdviceList, setDisplayedAdviceList] = useState([]);
        const readAdviceSettings = useCallback(() => {
            try {
                // 1. Try store (may return null if cloud sync not yet complete)
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
                // 3. Last resort: direct localStorage (for non-encrypted fallback)
                try {
                    const raw = localStorage.getItem('heys_advice_settings');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        console.info('[HEYS.advice] ✅ readAdviceSettings: source=rawLocalStorage', parsed);
                        return parsed;
                    }
                } catch (_) { }
            } catch (e) { }
            console.warn('[HEYS.advice] ⚠️ readAdviceSettings: no settings found, returning {}');
            return {};
        }, [HEYSRef.store, utils.lsGet]);

        const [toastsEnabled, setToastsEnabled] = useState(() => {
            try {
                const settings = (() => {
                    try {
                        if (HEYSRef.store?.get) {
                            const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                            if (fromStore !== null) return fromStore;
                        }
                        if (utils.lsGet) {
                            const fromLs = utils.lsGet('heys_advice_settings', null);
                            if (fromLs !== null) return fromLs;
                        }
                        const raw = localStorage.getItem('heys_advice_settings');
                        if (raw) return JSON.parse(raw);
                    } catch (_) { }
                    return {};
                })();
                return settings.toastsEnabled !== false;
            } catch (e) {
                return true;
            }
        });
        const [adviceSoundEnabled, setAdviceSoundEnabled] = useState(() => {
            try {
                const settings = (() => {
                    try {
                        if (HEYSRef.store?.get) {
                            const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                            if (fromStore !== null) return fromStore;
                        }
                        if (utils.lsGet) {
                            const fromLs = utils.lsGet('heys_advice_settings', null);
                            if (fromLs !== null) return fromLs;
                        }
                        const raw = localStorage.getItem('heys_advice_settings');
                        if (raw) return JSON.parse(raw);
                    } catch (_) { }
                    return {};
                })();
                return settings.adviceSoundEnabled !== false;
            } catch (e) {
                return true;
            }
        });

        // On mount: re-read settings early (before 1500ms tab_open timer) in case
        // store was not ready during useState initializer (slow network race condition)
        useEffect(() => {
            const settings = readAdviceSettings();
            const newToastsEnabled = Object.prototype.hasOwnProperty.call(settings, 'toastsEnabled')
                ? settings.toastsEnabled !== false
                : null;
            const newSoundEnabled = Object.prototype.hasOwnProperty.call(settings, 'adviceSoundEnabled')
                ? settings.adviceSoundEnabled !== false
                : null;
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
            const handleSyncCompleted = () => {
                try {
                    const settings = readAdviceSettings();
                    setToastsEnabled((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(settings, 'toastsEnabled')) return prev;
                        const cloudVal = settings.toastsEnabled !== false;
                        return prev !== cloudVal ? cloudVal : prev;
                    });
                    setAdviceSoundEnabled((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(settings, 'adviceSoundEnabled')) return prev;
                        const cloudVal = settings.adviceSoundEnabled !== false;
                        return prev !== cloudVal ? cloudVal : prev;
                    });
                } catch (e) {
                    HEYSRef.analytics?.trackError?.(e, { context: 'advice_settings_sync' });
                }
            };

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);
            return () => window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
        }, [HEYSRef.analytics, readAdviceSettings]);

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
        const adviceSwipeStart = useRef({});
        const adviceCardRefs = useRef({});
        const dismissToastRef = useRef(null);
        const registerAdviceCardRef = useCallback((adviceId, el) => {
            if (el) adviceCardRefs.current[adviceId] = el;
        }, []);

        const adviceListTouchStartY = useRef(null);
        const adviceListTouchLastY = useRef(null);
        const handleAdviceListTouchStart = useCallback((e) => {
            if (!e.touches?.length) return;
            adviceListTouchStartY.current = e.touches[0].clientY;
            adviceListTouchLastY.current = e.touches[0].clientY;
        }, []);
        const handleAdviceListTouchMove = useCallback((e) => {
            if (!e.touches?.length || adviceListTouchStartY.current === null) return;
            adviceListTouchLastY.current = e.touches[0].clientY;
        }, []);
        const handleAdviceListTouchEnd = useCallback(() => {
            if (adviceListTouchStartY.current === null || adviceListTouchLastY.current === null) return;
            const diff = adviceListTouchLastY.current - adviceListTouchStartY.current;
            adviceListTouchStartY.current = null;
            adviceListTouchLastY.current = null;
            if (diff > 50 && typeof dismissToastRef.current === 'function') {
                dismissToastRef.current();
            }
        }, []);

        const ADVICE_PRIORITY = { warning: 0, insight: 1, tip: 2, achievement: 3, info: 4 };
        const ADVICE_CATEGORY_NAMES = {
            nutrition: '🍎 Питание',
            training: '💪 Тренировки',
            lifestyle: '🌙 Режим',
            hydration: '💧 Вода',
            emotional: '🧠 Психология',
            achievement: '🏆 Достижения',
            motivation: '✨ Мотивация',
            personalized: '👤 Персональное',
            correlation: '🔗 Корреляции',
            timing: '⏰ Тайминг',
            sleep: '😴 Сон',
            activity: '🚶 Активность',
        };

        const getSortedGroupedAdvices = useCallback((advices) => {
            if (!advices?.length) return { sorted: [], groups: {} };
            const filtered = advices.filter(a =>
                (!dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id)) ||
                (lastDismissedAdvice?.id === a.id)
            );
            const sorted = [...filtered].sort((a, b) =>
                (ADVICE_PRIORITY[a.type] ?? 99) - (ADVICE_PRIORITY[b.type] ?? 99)
            );
            const groups = {};
            sorted.forEach(advice => {
                const cat = advice.category || 'other';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(advice);
            });
            return { sorted, groups };
        }, [dismissedAdvices, hiddenUntilTomorrow, lastDismissedAdvice]);

        const handleAdviceSwipeStart = useCallback((adviceId, e) => {
            adviceSwipeStart.current[adviceId] = e.touches[0].clientX;
        }, []);
        const handleAdviceSwipeMove = useCallback((adviceId, e) => {
            const startX = adviceSwipeStart.current[adviceId];
            if (startX === undefined) return;
            const diff = e.touches[0].clientX - startX;
            const direction = diff < 0 ? 'left' : 'right';
            setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: diff, direction } }));
        }, []);

        const playAdviceSound = useCallback(() => {
            if (adviceSoundEnabled && HEYSRef?.sounds) {
                HEYSRef.sounds.ding();
            }
        }, [adviceSoundEnabled, HEYSRef]);

        const playAdviceHideSound = useCallback(() => {
            if (adviceSoundEnabled && HEYSRef?.sounds) {
                HEYSRef.sounds.whoosh();
            }
        }, [adviceSoundEnabled, HEYSRef]);

        const toggleToastsEnabled = useCallback(() => {
            setToastsEnabled(prev => {
                const newVal = !prev;
                try {
                    const settings = HEYSRef.store?.get
                        ? (HEYSRef.store.get('heys_advice_settings', null) || {})
                        : (utils.lsGet ? utils.lsGet('heys_advice_settings', {}) : {});
                    settings.toastsEnabled = newVal;
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
        }, [haptic, utils.lsGet, utils.lsSet]);

        const toggleAdviceSoundEnabled = useCallback(() => {
            setAdviceSoundEnabled(prev => {
                const newVal = !prev;
                try {
                    const settings = HEYSRef.store?.get
                        ? (HEYSRef.store.get('heys_advice_settings', null) || {})
                        : (utils.lsGet ? utils.lsGet('heys_advice_settings', {}) : {});
                    settings.adviceSoundEnabled = newVal;
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
        }, [haptic, utils.lsGet, utils.lsSet]);

        const [adviceModuleReady, setAdviceModuleReady] = useState(!!HEYSRef?.advice?.useAdviceEngine);

        useEffect(() => {
            if (adviceModuleReady) return;
            const checkInterval = setInterval(() => {
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
        const emptyAdviceResult = {
            primary: null,
            relevant: [],
            adviceCount: 0,
            allAdvices: [],
            badgeAdvices: [],
            markShown: null,
            markRead: null,
            markHidden: null,
            trackClick: null,
            rateAdvice: null,
            scheduleAdvice: null,
            scheduledCount: 0
        };

        const adviceResult = (adviceEngine && hasClient) ? adviceEngine({
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
        }) : emptyAdviceResult;

        const safeAdviceResult = adviceResult || emptyAdviceResult;
        const {
            primary: advicePrimary = null,
            relevant: adviceRelevant = [],
            adviceCount = 0,
            allAdvices = [],
            badgeAdvices = [],
            markShown = null,
            markRead = null,
            markHidden = null,
            rateAdvice = null,
            trackClick = null,
            scheduleAdvice = null,
            scheduledCount = 0,
        } = safeAdviceResult || {};

        const safeAdviceRelevant = Array.isArray(adviceRelevant) ? adviceRelevant : [];
        const safeBadgeAdvices = Array.isArray(badgeAdvices) ? badgeAdvices : [];
        const safeDismissedAdvices = dismissedAdvices instanceof Set ? dismissedAdvices : new Set();
        const safeHiddenUntilTomorrow = hiddenUntilTomorrow instanceof Set ? hiddenUntilTomorrow : new Set();

        const totalAdviceCount = useMemo(() => {
            if (!Array.isArray(safeBadgeAdvices) || safeBadgeAdvices.length === 0) return 0;
            try {
                return safeBadgeAdvices.filter(a =>
                    a && a.id && !safeDismissedAdvices.has(a.id) && !safeHiddenUntilTomorrow.has(a.id)
                ).length;
            } catch (e) {
                return 0;
            }
        }, [safeBadgeAdvices, safeDismissedAdvices, safeHiddenUntilTomorrow]);

        useEffect(() => {
            const badge = document.getElementById('nav-advice-badge');
            if (badge) {
                badge.textContent = totalAdviceCount > 0 ? totalAdviceCount : '';
                badge.style.display = totalAdviceCount > 0 ? 'flex' : 'none';
            }
        }, [totalAdviceCount]);

        useEffect(() => {
            const handleShowAdvice = () => {
                if (totalAdviceCount > 0) {
                    setAdviceTrigger('manual');
                    setAdviceExpanded(true);
                    setToastVisible(true);
                    setToastDismissed(false);
                    haptic('light');
                } else {
                    setAdviceTrigger('manual_empty');
                    setToastVisible(true);
                    setToastDismissed(false);
                    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                    toastTimeoutRef.current = setTimeout(() => {
                        setToastVisible(false);
                        setAdviceTrigger(null);
                    }, 2000);
                }
            };
            window.addEventListener('heysShowAdvice', handleShowAdvice);
            return () => window.removeEventListener('heysShowAdvice', handleShowAdvice);
        }, [totalAdviceCount, haptic]);

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
            const intervalId = setInterval(checkScheduled, 30000);
            return () => clearInterval(intervalId);
        }, [readStoredValue]);

        useEffect(() => {
            const handleCelebrate = () => {
                setShowConfetti(true);
                if (typeof haptic === 'function') haptic('success');
                setTimeout(() => setShowConfetti(false), 2500);
            };
            window.addEventListener('heysCelebrate', handleCelebrate);
            return () => window.removeEventListener('heysCelebrate', handleCelebrate);
        }, [haptic, setShowConfetti]);

        useEffect(() => {
            // Cold-start guard (v1.0): if heys_advice_settings is absent from localStorage
            // (incognito / first visit), the user's toastsEnabled=false setting hasn't loaded
            // yet at 1500ms. Wait for Phase B sync (which carries CLIENT_SPECIFIC_KEYS incl.
            // heys_advice_settings) before firing tab_open.
            // Phase A is explicitly ignored — it has no dayv2 or advice settings.
            // Fallback: 5s if sync never arrives (offline, error, new user with no cloud data).
            const isColdStart = (() => {
                try {
                    if (HEYSRef.store?.get) {
                        const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                        if (fromStore !== null) return false;
                    }
                    const raw = localStorage.getItem('heys_advice_settings');
                    return raw === null;
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

            const handlePhaseB = (e) => {
                if (e && e.detail && e.detail.phaseA) return; // Phase A has no heys_advice_settings
                // 100ms buffer so setToastsEnabled from the sibling heysSyncCompleted
                // listener has time to commit before advicePrimary effect evaluates it
                setTimeout(fireTabOpen, 100);
            };

            window.addEventListener('heysSyncCompleted', handlePhaseB);

            // Fallback: offline / error / new user with zero cloud data
            fallbackTimer = setTimeout(() => {
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
                if (safeAdviceRelevant.length === 0) {
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
            if (!isManualTrigger && dismissedAdvices.has(advicePrimary.id)) {
                return;
            }

            if (!isManualTrigger && !toastsEnabled) {
                console.info('[HEYS.advice] 🚫 Toast BLOCKED: toastsEnabled=false, adviceTrigger=' + adviceTrigger);
                setDisplayedAdvice(advicePrimary);
                setDisplayedAdviceList(safeAdviceRelevant);
                setToastVisible(false);
                if (markShown) markShown(advicePrimary);
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

            if (adviceSoundEnabled && HEYSRef?.sounds) {
                if (advicePrimary.type === 'achievement' || advicePrimary.showConfetti) {
                    HEYSRef.sounds.success();
                } else if (advicePrimary.type === 'warning') {
                    HEYSRef.sounds.warning();
                } else {
                    HEYSRef.sounds.pop();
                }
            }

            if ((advicePrimary.type === 'achievement' || advicePrimary.type === 'warning') && typeof haptic === 'function') {
                haptic('light');
            }
            if (advicePrimary.onShow) advicePrimary.onShow();
            if (advicePrimary.showConfetti) {
                setShowConfetti(true);
                if (typeof haptic === 'function') haptic('success');
                setTimeout(() => setShowConfetti(false), 2000);
            }

            if (markShown) markShown(advicePrimary);
        }, [advicePrimary?.id, adviceTrigger, adviceSoundEnabled, dismissedAdvices, markShown, toastsEnabled, setShowConfetti, haptic, HEYSRef, safeAdviceRelevant]);

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
            }
        }, [adviceTrigger]);

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

        const handleToastRate = (isPositive, e) => {
            e && e.stopPropagation();
            if (displayedAdvice && rateAdvice) {
                rateAdvice(displayedAdvice, isPositive);
                setToastRatedState(isPositive ? 'positive' : 'negative');
                setToastScheduledConfirm(false);
                if (navigator.vibrate) navigator.vibrate(30);
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
                if (navigator.vibrate) navigator.vibrate(50);
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

        const handleAdviceSwipeEnd = useCallback((adviceId) => {
            const state = adviceSwipeState[adviceId];
            const swipeX = state?.x || 0;

            if (lastDismissedAdvice?.hideTimeout) clearTimeout(lastDismissedAdvice.hideTimeout);

            if (swipeX < -100) {
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

            } else if (swipeX > 100) {
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

                playAdviceHideSound();
                haptic('medium');

                setUndoFading(false);
                const hideTimeout = setTimeout(() => {
                    setLastDismissedAdvice(null);
                    setUndoFading(false);
                }, 3000);
                setLastDismissedAdvice({ id: adviceId, action: 'hidden', hideTimeout });
            }

            setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: 0, direction: null } }));
            delete adviceSwipeStart.current[adviceId];
        }, [adviceSwipeState, haptic, lastDismissedAdvice, playAdviceSound, playAdviceHideSound, safeAdviceRelevant, safeBadgeAdvices, markRead, markHidden, setStoredValue]);

        const adviceLongPressTimer = useRef(null);
        const handleAdviceLongPressStart = useCallback((adviceId) => {
            adviceLongPressTimer.current = setTimeout(() => {
                setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
                haptic('light');
            }, 500);
        }, [haptic]);
        const handleAdviceLongPressEnd = useCallback(() => {
            if (adviceLongPressTimer.current) {
                clearTimeout(adviceLongPressTimer.current);
                adviceLongPressTimer.current = null;
            }
        }, []);

        const handleAdviceToggleExpand = useCallback((adviceId) => {
            setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
            haptic('light');
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
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };

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
            markShown,
            markRead,
            markHidden,
            rateAdvice,
            trackClick,
            scheduleAdvice,
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
            totalAdviceCount,
            dismissToast,
            ADVICE_CATEGORY_NAMES,
        };
    };

    HEYS.dayAdviceState = dayAdviceState;
})(window);
