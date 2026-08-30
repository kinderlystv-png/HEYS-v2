/**
 * HEYS Early Warning Panel v1.0
 * 
 * Modal panel для отображения Early Warning System детектированных предупреждений.
 * Показывает список warnings с группировкой по severity (HIGH/MEDIUM/LOW).
 * 
 * Features:
 * - Severity-based grouping (🚨 HIGH → ⚠️ MEDIUM → ℹ️ LOW)
 * - WarningCard component с pattern details + actionable advice
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

    /**
     * Ступени сигнала.
     *
     * Контракт «панель „Ещё N“»: три группы человеческими заголовками —
     * «Сначала важное», «Стоит знать», «Заметки на будущее» вместо high,
     * medium, low. Прежде здесь стояли «Критично», «Внимание» и
     * «Рекомендация» с эмодзи 🚨 ⚠️ ℹ️ и собственной палитрой красного,
     * оранжевого и синего — своя система тревоги поверх набора.
     *
     * Цвета сняты целиком: тон карточки в наборе задаётся ролью, а не
     * ступенью сигнала, и красный в нём значит разрушающее действие, а не
     * «важно». Порядок групп остался прежним — он же решает, кто попадает на
     * первый экран.
     */
    const SEVERITY_CONFIG = {
        high: { label: 'Сначала важное', priority: 1 },
        medium: { label: 'Стоит знать', priority: 2 },
        low: { label: 'Заметки на будущее', priority: 3 }
    };

    /**
     * WarningCard Component
     * 
     * Displays single warning with severity badge, message, detail, and actions
     */
    function WarningCard({ warning, onViewDetails }) {
        const [showScience, setShowScience] = useState(false);
        const severity = warning.severity || 'low';
        const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;

        const toggleScience = useCallback(() => {
            setShowScience(prev => !prev);
        }, []);

        return h('div', {
            className: `early-warning-modal-card early-warning-modal-card--${severity}`
        },
            // Шапка: имя паттерна и ступень словом. Эмодзи ступени снято —
            // в наборе эмодзи нет нигде, а 🚨 рядом с фразой о питании читается
            // тревогой там, где сигнал говорит «стоит знать».
            h('div', { className: 'early-warning-modal-card__header' },
                warning.patternName && h('span', {
                    className: 'early-warning-modal-card__pattern-name'
                }, warning.patternName),
                h('span', {
                    className: 'early-warning-modal-card__severity-label'
                }, config.label)
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
                }, showScience ? 'Скрыть обоснование' : 'На чём основано')
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
        // Block body scroll when modal is open
        useEffect(() => {
            if (isOpen) {
                document.body.style.overflow = 'hidden';
                return () => {
                    document.body.style.overflow = '';
                };
            }
        }, [isOpen]);

        const activeWarnings = warnings;

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

        const handleViewDetails = useCallback((warning) => {
            if (!warning.pattern) return;

            // Navigate to Pattern Debugger with hash
            window.location.hash = `#pattern-${warning.pattern}`;

            // Close panel
            onClose();

            console.info('ews / panel 🔍 navigate to pattern:', warning.pattern);
        }, [onClose]);

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
                // Ряд счётчиков называет группы теми же словами, что ярусы
                // ниже: прежде здесь стояли «Критичных», «Внимание» и
                // «Рекомендаций» с иконками 📊 🚨 ⚠️ — второй словарь для тех
                // же трёх ступеней, и человек сверял два набора слов.
                h('div', { className: 'pattern-debug-modal__stats early-warning-modal__stats' },
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--total' },
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, 'Всего'),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, activeWarnings.length)
                        )
                    ),
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--high' },
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, SEVERITY_CONFIG.high.label),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, groupedWarnings.high.length)
                        )
                    ),
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--medium' },
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, SEVERITY_CONFIG.medium.label),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, groupedWarnings.medium.length)
                        )
                    ),
                    h('div', { className: 'pattern-debug-modal__stat pattern-debug-modal__stat--low' },
                        h('div', { className: 'pattern-debug-modal__stat-content' },
                            h('span', { className: 'pattern-debug-modal__stat-label' }, SEVERITY_CONFIG.low.label),
                            h('span', { className: 'pattern-debug-modal__stat-value' }, groupedWarnings.low.length)
                        )
                    )
                ),

                // Content (scrollable)
                h('div', { className: 'early-warning-modal__body' },
                    activeWarnings.length === 0
                        // Пустота называет состояние, а не хвалит: зелёная
                        // галочка и «Всё отлично!» сообщали настроение, тогда
                        // как сказать надо, что сигналов нет и откуда они
                        // появятся.
                        ? h('div', { className: 'early-warning-modal__empty' },
                            h('p', { className: 'early-warning-modal__empty-title' }, 'Сигналов нет'),
                            h('p', { className: 'early-warning-modal__empty-subtitle' },
                                'Появятся, когда в записях наберётся то, о чём стоит сказать.')
                        )
                        : h('div', { className: 'early-warning-modal__warnings' },
                            // High severity warnings
                            groupedWarnings.high.length > 0 && h('div', { className: 'early-warning-modal__section' },
                                h('h3', { className: 'early-warning-modal__section-title early-warning-modal__section-title--high' },
                                    SEVERITY_CONFIG.high.label
                                ),
                                groupedWarnings.high.map((warning, idx) =>
                                    h(WarningCard, {
                                        key: idx,
                                        warning,
                                        onViewDetails: handleViewDetails
                                    })
                                )
                            ),

                            // Medium severity warnings
                            groupedWarnings.medium.length > 0 && h('div', { className: 'early-warning-modal__section' },
                                h('h3', { className: 'early-warning-modal__section-title early-warning-modal__section-title--medium' },
                                    SEVERITY_CONFIG.medium.label
                                ),
                                groupedWarnings.medium.map((warning, idx) =>
                                    h(WarningCard, {
                                        key: idx,
                                        warning,
                                        onViewDetails: handleViewDetails
                                    })
                                )
                            ),

                            // Low severity warnings
                            groupedWarnings.low.length > 0 && h('div', { className: 'early-warning-modal__section' },
                                h('h3', { className: 'early-warning-modal__section-title early-warning-modal__section-title--low' },
                                    SEVERITY_CONFIG.low.label
                                ),
                                groupedWarnings.low.map((warning, idx) =>
                                    h(WarningCard, {
                                        key: idx,
                                        warning,
                                        onViewDetails: handleViewDetails
                                    })
                                )
                            )
                        )
                ),

                // Footer (actions)
                activeWarnings.length > 0 && h('div', { className: 'early-warning-modal__footer' },
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
    // UI v4 (2026-08-10): карточка предупреждения переиспользуется как есть в
    // общей шторке советов (день/_advice.js) — группа предупреждений первой,
    // до всех категорий советов. См. dayAdviceListUI.renderManualAdviceList.
    HEYS.EWSWarningCard = WarningCard;

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
