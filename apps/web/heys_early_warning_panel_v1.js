/**
 * HEYS Early Warning Panel v1.0
 * 
 * Modal panel для отображения Early Warning System детектированных предупреждений.
 * Показывает список warnings с группировкой по severity (HIGH/MEDIUM/LOW).
 * 
 * Features:
 * - Severity-based grouping (🚨 HIGH → ⚠️ MEDIUM → ℹ️ LOW)
 * - WarningCard component с pattern details + actionable advice
 * - Dismiss functionality (persisted to localStorage)
 * - Navigate to Pattern Debugger для deep dive анализа
 * 
 * Dependencies: React, heys_utils
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const { useState, useEffect, useCallback, useMemo } = React;
    const ReactDOM = global.ReactDOM;

    if (!React) {
        console.error('ews / panel ❌ React not found');
        return;
    }

    const h = React.createElement;

    // Local storage key for dismissed warnings
    const DISMISSED_WARNINGS_KEY = 'heys_dismissed_warnings';

    /**
     * Get dismissed warnings from localStorage
     * @returns {Set<string>} Set of dismissed warning IDs
     */
    function getDismissedWarnings() {
        try {
            const U = global.HEYS?.utils || {};
            const stored = U.lsGet ? U.lsGet(DISMISSED_WARNINGS_KEY) : localStorage.getItem(DISMISSED_WARNINGS_KEY);
            if (!stored) return new Set();

            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            return new Set(Array.isArray(parsed) ? parsed : []);
        } catch (err) {
            console.warn('ews / panel ⚠️ failed to load dismissed warnings:', err);
            return new Set();
        }
    }

    /**
     * Save dismissed warnings to localStorage
     * @param {Set<string>} dismissed
     */
    function saveDismissedWarnings(dismissed) {
        try {
            const U = global.HEYS?.utils || {};
            const arr = Array.from(dismissed);
            if (U.lsSet) {
                U.lsSet(DISMISSED_WARNINGS_KEY, arr);
            } else {
                localStorage.setItem(DISMISSED_WARNINGS_KEY, JSON.stringify(arr));
            }
        } catch (err) {
            console.error('ews / panel ❌ failed to save dismissed warnings:', err);
        }
    }

    /**
     * Generate unique ID for warning (for dismiss tracking)
     * @param {object} warning
     * @returns {string}
     */
    function getWarningId(warning) {
        if (!warning) return '';

        // Create ID from type, pattern, and current date (warnings reset daily)
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return `${warning.type}_${warning.pattern || 'generic'}_${date}`;
    }

    /**
     * Severity config (emoji, color, priority)
     */
    const SEVERITY_CONFIG = {
        high: {
            emoji: '🚨',
            label: 'Критично',
            color: '#dc2626',
            colorDark: '#fca5a5',
            bgColor: 'rgba(239, 68, 68, 0.1)',
            bgColorDark: 'rgba(239, 68, 68, 0.2)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            borderColorDark: 'rgba(239, 68, 68, 0.4)',
            priority: 1
        },
        medium: {
            emoji: '⚠️',
            label: 'Внимание',
            color: '#ea580c',
            colorDark: '#fdba74',
            bgColor: 'rgba(249, 115, 22, 0.1)',
            bgColorDark: 'rgba(249, 115, 22, 0.2)',
            borderColor: 'rgba(249, 115, 22, 0.3)',
            borderColorDark: 'rgba(249, 115, 22, 0.4)',
            priority: 2
        },
        low: {
            emoji: 'ℹ️',
            label: 'Рекомендация',
            color: '#2563eb',
            colorDark: '#93c5fd',
            bgColor: 'rgba(59, 130, 246, 0.1)',
            bgColorDark: 'rgba(59, 130, 246, 0.2)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
            borderColorDark: 'rgba(59, 130, 246, 0.4)',
            priority: 3
        }
    };

    /**
     * WarningCard Component
     * 
     * Displays single warning with severity badge, message, detail, and actions
     */
    function WarningCard({ warning, onDismiss, onViewDetails }) {
        const [showScience, setShowScience] = useState(false);
        const severity = warning.severity || 'low';
        const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;

        const handleDismiss = useCallback(() => {
            onDismiss(warning);
        }, [warning, onDismiss]);

        const toggleScience = useCallback(() => {
            setShowScience(prev => !prev);
        }, []);

        return h('div', {
            className: `early-warning-modal-card early-warning-modal-card--${severity}`
        },
            // Header (severity badge + pattern name + dismiss)
            h('div', { className: 'early-warning-modal-card__header' },
                h('div', { className: 'early-warning-modal-card__header-left' },
                    h('span', {
                        className: 'early-warning-modal-card__emoji',
                        'aria-label': config.label
                    }, config.emoji),
                    h('div', { className: 'early-warning-modal-card__header-text' },
                        warning.patternName && h('span', {
                            className: 'early-warning-modal-card__pattern-name'
                        }, warning.patternName),
                        h('span', {
                            className: 'early-warning-modal-card__severity-label'
                        }, config.label)
                    )
                ),
                h('button', {
                    className: 'early-warning-modal-card__dismiss',
                    onClick: handleDismiss,
                    title: 'Скрыть предупреждение',
                    'aria-label': 'Dismiss'
                }, '×')
            ),

            // Main message (дружелюбное описание)
            warning.detail && h('p', {
                className: 'early-warning-modal-card__message'
            }, warning.detail),

            // Insight (более подробное объяснение)
            warning.insight && h('p', {
                className: 'early-warning-modal-card__detail'
            }, warning.insight),

            // Score info (if available)
            warning.currentScore !== undefined && h('p', {
                className: 'early-warning-modal-card__score'
            }, `Текущий показатель: ${warning.currentScore} из 100`),

            // Science toggle button (show if science is available)
            warning.science && h('div', { className: 'early-warning-modal-card__actions' },
                h('button', {
                    className: 'early-warning-modal-card__action-btn',
                    onClick: toggleScience
                }, showScience ? '📖 Скрыть обоснование' : '🔬 Научное обоснование')
            ),

            // Science explanation (collapsible)
            showScience && warning.science && h('div', {
                className: 'early-warning-modal-card__science-content'
            }, warning.science)
        );
    }

    /**
     * EarlyWarningPanel Component
     * 
     * Modal panel for displaying Early Warning System detections
     * 
     * @param {object} props
     * @param {boolean} props.isOpen - Panel visibility
     * @param {function} props.onClose - Close handler
     * @param {array} props.warnings - Array of warning objects from earlyWarning.detect()
     * @param {string} props.mode - Detection mode: 'acute' (10 checks, 7d) or 'full' (25 checks, 30d)
     */
    function EarlyWarningPanel({ isOpen, onClose, warnings = [], mode = 'full' }) {
        const [dismissed, setDismissed] = useState(() => getDismissedWarnings());

        // Block body scroll when modal is open
        useEffect(() => {
            if (isOpen) {
                document.body.style.overflow = 'hidden';
                return () => {
                    document.body.style.overflow = '';
                };
            }
        }, [isOpen]);

        // Filter out dismissed warnings
        const activeWarnings = useMemo(() => {
            return warnings.filter(w => !dismissed.has(getWarningId(w)));
        }, [warnings, dismissed]);

        // Group warnings by severity
        const groupedWarnings = useMemo(() => {
            const groups = { high: [], medium: [], low: [] };

            activeWarnings.forEach(warning => {
                const severity = warning.severity || 'low';
                if (groups[severity]) {
                    groups[severity].push(warning);
                }
            });

            return groups;
        }, [activeWarnings]);

        // Close on Escape key
        useEffect(() => {
            if (!isOpen) return;

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    onClose();
                }
            };

            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }, [isOpen, onClose]);

        const handleDismiss = useCallback((warning) => {
            const warningId = getWarningId(warning);
            const newDismissed = new Set(dismissed);
            newDismissed.add(warningId);

            setDismissed(newDismissed);
            saveDismissedWarnings(newDismissed);

            console.info('ews / panel ✅ warning dismissed:', warningId);
        }, [dismissed]);

        const handleViewDetails = useCallback((warning) => {
            if (!warning.pattern) return;

            // Navigate to Pattern Debugger with hash
            window.location.hash = `#pattern-${warning.pattern}`;

            // Close panel
            onClose();

            console.info('ews / panel 🔍 navigate to pattern:', warning.pattern);
        }, [onClose]);

        const handleDismissAll = useCallback(() => {
            const newDismissed = new Set(dismissed);
            activeWarnings.forEach(w => {
                newDismissed.add(getWarningId(w));
            });

            setDismissed(newDismissed);
            saveDismissedWarnings(newDismissed);

            console.info('ews / panel ✅ all warnings dismissed');

            // Close panel after dismissing all
            setTimeout(onClose, 300);
        }, [activeWarnings, dismissed, onClose]);

        if (!isOpen) return null;

        const modalNode = h('div', {
            className: 'pattern-debug-modal early-warning-modal',
            onClick: onClose
        },
            h('div', {
                className: 'pattern-debug-modal__content early-warning-modal__content',
                onClick: (e) => e.stopPropagation()
            },
                // Header
                h('div', { className: 'pattern-debug-modal__header early-warning-modal__header' },
                    h('div', { className: 'pattern-debug-modal__title early-warning-modal__title' },
                        h('span', { className: 'pattern-debug-modal__emoji early-warning-modal__emoji' },
                            mode === 'acute' ? '⚡' : '📊'
                        ),
                        h('span', null,
                            mode === 'acute' ? 'Оперативные предупреждения' : 'Аудит за 30 дней'
                        )
                    ),
                    h('button', {
                        className: 'pattern-debug-modal__close early-warning-modal__close',
                        onClick: onClose,
                        'aria-label': 'Закрыть'
                    }, '✕')
                ),

                // Stats summary (как в Pattern Debugger)
                h('div', { className: 'pattern-debug-modal__stats early-warning-modal__stats' },
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--total' },
                        h('span', { className: 'pattern-debug-modal__stat-icon' }, '📊'),
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Всего'),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, activeWarnings.length)
                        )
                    ),
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--high' },
                        h('span', { className: 'pattern-debug-modal__stat-icon' }, '🚨'),
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Критичных'),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, groupedWarnings.high.length)
                        )
                    ),
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--medium' },
                        h('span', { className: 'pattern-debug-modal__stat-icon' }, '⚠️'),
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Внимание'),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, groupedWarnings.medium.length)
                        )
                    ),
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--low' },
                        h('span', { className: 'pattern-debug-modal__stat-icon' }, 'ℹ️'),
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Рекомендаций'),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, groupedWarnings.low.length)
                        )
                    )
                ),

                // Content (scrollable)
                h('div', { className: 'early-warning-modal__body' },
                    activeWarnings.length === 0
                        ? h('div', { className: 'early-warning-modal__empty' },
                            h('span', { className: 'early-warning-modal__empty-icon' }, '✅'),
                            h('p', { className: 'early-warning-modal__empty-title' }, 'Всё отлично!'),
                            h('p', { className: 'early-warning-modal__empty-subtitle' }, 'Нет активных предупреждений')
                        )
                        : h('div', { className: 'early-warning-modal__warnings' },
                            // High severity warnings
                            groupedWarnings.high.length > 0 && h('div', { className: 'early-warning-modal__section' },
                                h('h3', { className: 'early-warning-modal__section-title early-warning-modal__section-title--high' },
                                    '🚨 Критично'
                                ),
                                groupedWarnings.high.map((warning, idx) =>
                                    h(WarningCard, {
                                        key: idx,
                                        warning,
                                        onDismiss: handleDismiss,
                                        onViewDetails: handleViewDetails
                                    })
                                )
                            ),

                            // Medium severity warnings
                            groupedWarnings.medium.length > 0 && h('div', { className: 'early-warning-modal__section' },
                                h('h3', { className: 'early-warning-modal__section-title early-warning-modal__section-title--medium' },
                                    '⚠️ Внимание'
                                ),
                                groupedWarnings.medium.map((warning, idx) =>
                                    h(WarningCard, {
                                        key: idx,
                                        warning,
                                        onDismiss: handleDismiss,
                                        onViewDetails: handleViewDetails
                                    })
                                )
                            ),

                            // Low severity warnings
                            groupedWarnings.low.length > 0 && h('div', { className: 'early-warning-modal__section' },
                                h('h3', { className: 'early-warning-modal__section-title early-warning-modal__section-title--low' },
                                    'ℹ️ Рекомендации'
                                ),
                                groupedWarnings.low.map((warning, idx) =>
                                    h(WarningCard, {
                                        key: idx,
                                        warning,
                                        onDismiss: handleDismiss,
                                        onViewDetails: handleViewDetails
                                    })
                                )
                            )
                        )
                ),

                // Footer (actions)
                activeWarnings.length > 0 && h('div', { className: 'early-warning-modal__footer' },
                    h('button', {
                        className: 'early-warning-modal__footer-btn early-warning-modal__footer-btn--dismiss',
                        onClick: handleDismissAll
                    }, 'Скрыть всё'),
                    h('button', {
                        className: 'early-warning-modal__footer-btn early-warning-modal__footer-btn--primary',
                        onClick: onClose
                    }, 'Закрыть')
                )
            )
        );

        if (ReactDOM && typeof ReactDOM.createPortal === 'function' && global.document?.body) {
            return ReactDOM.createPortal(modalNode, global.document.body);
        }

        return modalNode;
    }

    // Global EWS Panel Manager — глобальный механизм управления панелью
    // Позволяет открывать панель из любого места приложения (header badge, виджеты и т.д.)
    let globalPanelState = {
        isOpen: false,
        warnings: null,
        mode: 'full',
        container: null
    };

    /**
     * Глобальная функция для открытия EWS панели с предупреждениями
     * @param {Array} warnings - массив предупреждений для отображения
     * @param {string} mode - 'acute' (10 checks, 7d badge) or 'full' (25 checks, 30d insights)
     */
    function showEWSPanel(warnings, mode = 'full') {
        if (!warnings || warnings.length === 0) {
            console.warn('ews / panel ⚠️ no warnings to display');
            return;
        }

        console.info('ews / panel 🚨 opening panel with', warnings.length, 'warnings, mode:', mode);
        globalPanelState.isOpen = true;
        globalPanelState.warnings = warnings;
        globalPanelState.mode = mode;
        renderGlobalPanel();
    }

    /**
     * Закрыть глобальную панель
     */
    function hideEWSPanel() {
        console.info('ews / panel closing panel');
        globalPanelState.isOpen = false;
        renderGlobalPanel();
    }

    /**
     * Рендер глобальной панели
     */
    function renderGlobalPanel() {
        if (!global.document || !ReactDOM) return;

        // Создаём контейнер если его нет
        if (!globalPanelState.container) {
            globalPanelState.container = global.document.getElementById('ews-panel-root');
            if (!globalPanelState.container) {
                globalPanelState.container = global.document.createElement('div');
                globalPanelState.container.id = 'ews-panel-root';
                global.document.body.appendChild(globalPanelState.container);
            }
        }

        // Рендерим панель
        const root = ReactDOM.createRoot || ((container) => ({
            render: (element) => ReactDOM.render(element, container)
        }));

        if (ReactDOM.createRoot && !globalPanelState.container.__reactRoot) {
            globalPanelState.container.__reactRoot = ReactDOM.createRoot(globalPanelState.container);
        }

        const rootInstance = globalPanelState.container.__reactRoot || root(globalPanelState.container);
        rootInstance.render(
            globalPanelState.isOpen
                ? h(EarlyWarningPanel, {
                    isOpen: true,
                    onClose: hideEWSPanel,
                    warnings: globalPanelState.warnings || [],
                    mode: globalPanelState.mode || 'full'
                })
                : null
        );
    }

    // Export
    HEYS.EarlyWarningPanel = EarlyWarningPanel;
    HEYS.showEWSPanel = showEWSPanel;
    HEYS.hideEWSPanel = hideEWSPanel;

    // Event listener для совместимости с существующим кодом
    if (global.window) {
        window.addEventListener('heysShowEWSPanel', function (event) {
            const warnings = event.detail?.warnings;
            const mode = event.detail?.mode || 'full';  // Default to 'full' for backward compat

            if (warnings && warnings.length > 0) {
                showEWSPanel(warnings, mode);
            } else {
                console.warn('ews / panel ⚠️ event received but no warnings in event.detail');
            }
        });
    }

    console.info('ews / panel ✅ component loaded + global panel manager');

})(typeof window !== 'undefined' ? window : global);
