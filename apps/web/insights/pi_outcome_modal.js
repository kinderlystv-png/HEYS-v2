/**
 * HEYS Predictive Insights — Outcome Tracking Modal v1.0
 * 
 * Модальное окно для сбора feedback о результатах рекомендации через 3/7/14 дней.
 * Собирает: satiety (насыщение), energy (энергия), mood (настроение) по шкале 1-5.
 * 
 * Integration: вызывается через HEYS.InsightsPI.outcomeModal.show(recId)
 * Dependencies: ModalManager, feedbackLoop
 */
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const { React, ReactDOM } = global;
    if (!React || !ReactDOM) {
        console.warn('[OutcomeModal] React/ReactDOM not available');
        return;
    }

    const h = React.createElement;
    const { useState, useEffect } = React;

    const MODAL_ID = 'outcome-tracking-modal';
    const LOG_PREFIX = '[HEYS.outcomeModal]';

    /**
     * Slider Component для оценки по шкале 1-5
     */
    function RatingSlider({ label, emoji, value, onChange, name }) {
        const labels = ['Плохо', 'Неважно', 'Нормально', 'Хорошо', 'Отлично'];

        return h('div', { className: 'outcome-modal__field' },
            h('label', { className: 'outcome-modal__label' },
                h('span', { className: 'outcome-modal__emoji' }, emoji),
                ' ',
                label
            ),
            h('div', { className: 'outcome-modal__slider-container' },
                h('input', {
                    type: 'range',
                    min: 1,
                    max: 5,
                    step: 1,
                    value: value,
                    onChange: (e) => onChange(name, parseInt(e.target.value)),
                    className: 'outcome-modal__slider'
                }),
                h('div', { className: 'outcome-modal__value' },
                    h('span', { className: 'outcome-modal__value-number' }, value),
                    ' — ',
                    h('span', { className: 'outcome-modal__value-label' }, labels[value - 1])
                )
            )
        );
    }

    /**
     * Outcome Modal Component
     */
    function OutcomeModal({ recId, onSubmit, onClose }) {
        const [values, setValues] = useState({
            satiety: 3,
            energy: 3,
            mood: 3
        });
        const [submitting, setSubmitting] = useState(false);

        // Register with ModalManager
        useEffect(() => {
            const cleanup = global.HEYS.ModalManager?.register?.(MODAL_ID, onClose);
            return cleanup;
        }, [onClose]);

        // Handle keyboard events
        useEffect(() => {
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') onClose();
            };
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }, [onClose]);

        const handleChange = (name, value) => {
            setValues(prev => ({ ...prev, [name]: value }));
        };

        const handleSubmit = async () => {
            if (submitting) return;

            setSubmitting(true);
            console.info(`[MEALREC]${LOG_PREFIX} ✅ Submitting outcome:`, { recId, values });

            try {
                await onSubmit(recId, values);

                // Show success briefly
                setTimeout(() => {
                    onClose();
                }, 800);
            } catch (error) {
                console.error(`[MEALREC]${LOG_PREFIX} ❌ Submit failed:`, error);
                setSubmitting(false);
            }
        };

        const handleBackdropClick = (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                onClose();
            }
        };

        return h('div', {
            className: 'modal-backdrop outcome-modal-backdrop',
            onClick: handleBackdropClick
        },
            h('div', { className: 'modal-content outcome-modal' },
                // Header
                h('div', { className: 'outcome-modal__header' },
                    h('h3', { className: 'outcome-modal__title' },
                        '🌟 Как прошёл день?'
                    ),
                    h('button', {
                        className: 'outcome-modal__close-btn',
                        onClick: onClose,
                        'aria-label': 'Закрыть'
                    }, '×')
                ),

                // Description
                h('p', { className: 'outcome-modal__description' },
                    'Помогите нам улучшить рекомендации! Оцените, как прошёл ваш день после того, как вы следовали нашему совету.'
                ),

                // Form
                h('div', { className: 'outcome-modal__form' },
                    h(RatingSlider, {
                        label: 'Насыщение',
                        emoji: '😋',
                        name: 'satiety',
                        value: values.satiety,
                        onChange: handleChange
                    }),
                    h(RatingSlider, {
                        label: 'Энергия',
                        emoji: '⚡',
                        name: 'energy',
                        value: values.energy,
                        onChange: handleChange
                    }),
                    h(RatingSlider, {
                        label: 'Настроение',
                        emoji: '😊',
                        name: 'mood',
                        value: values.mood,
                        onChange: handleChange
                    })
                ),

                // Footer
                h('div', { className: 'outcome-modal__footer' },
                    h('button', {
                        className: 'btn outcome-modal__btn outcome-modal__btn--cancel',
                        onClick: onClose,
                        disabled: submitting
                    }, 'Отмена'),
                    h('button', {
                        className: 'btn acc outcome-modal__btn outcome-modal__btn--submit',
                        onClick: handleSubmit,
                        disabled: submitting
                    }, submitting ? 'Отправка...' : 'Отправить ✓')
                )
            )
        );
    }

    /**
     * Show outcome modal
     * @param {string} recId - Recommendation ID
     * @param {object} profile - User profile
     * @returns {Promise<object|null>} - Submitted values or null if cancelled
     */
    function show(recId, profile) {
        return new Promise((resolve) => {
            const container = document.createElement('div');
            container.id = 'outcome-modal-container';
            document.body.appendChild(container);

            const handleClose = () => {
                console.info(`[MEALREC]${LOG_PREFIX} ⏹️ Modal closed without submission`);
                ReactDOM.unmountComponentAtNode(container);
                document.body.removeChild(container);
                resolve(null);
            };

            const handleSubmit = async (recId, values) => {
                console.info(`[MEALREC]${LOG_PREFIX} 📤 Submitting outcome feedback:`, { recId, values });

                // Submit to feedback loop
                if (global.HEYS.InsightsPI?.feedbackLoop?.submitFeedback) {
                    try {
                        await global.HEYS.InsightsPI.feedbackLoop.submitFeedback(recId, values, profile);
                        console.info(`[MEALREC]${LOG_PREFIX} ✅ Feedback submitted successfully`);
                    } catch (error) {
                        console.error(`[MEALREC]${LOG_PREFIX} ❌ Feedback submission failed:`, error);
                        throw error;
                    }
                }

                // Trigger cloud sync
                if (global.HEYS.InsightsPI?.mealRecFeedback?.syncWithCloud) {
                    global.HEYS.InsightsPI.mealRecFeedback.syncWithCloud({
                        reason: 'outcome_submit',
                        clientId: profile?.id
                    }).catch(err => {
                        console.warn(`[MEALREC]${LOG_PREFIX} ⚠️ Cloud sync failed:`, err);
                    });
                }

                ReactDOM.unmountComponentAtNode(container);
                document.body.removeChild(container);
                resolve(values);
            };

            ReactDOM.render(
                h(OutcomeModal, { recId, onSubmit: handleSubmit, onClose: handleClose }),
                container
            );
        });
    }

    /**
     * Check if it's time to show reminder for a recommendation
     * @param {object} record - Feedback record
     * @param {number} daysThreshold - Days since recommendation (3, 7, or 14)
     * @returns {boolean}
     */
    function shouldShowReminder(record, daysThreshold) {
        if (!record || record.outcome) return false; // Already has outcome
        if (!record.followed) return false; // Didn't follow recommendation

        const recDate = new Date(record.timestamp);
        const now = new Date();
        const daysDiff = Math.floor((now - recDate) / (1000 * 60 * 60 * 24));

        return daysDiff >= daysThreshold;
    }

    /**
     * Check for pending reminders and show modal if needed
     * Called on app startup/page load
     * @param {object} profile - User profile
     */
    async function checkPendingReminders(profile) {
        if (!profile?.id) return;

        console.info(`[MEALREC]${LOG_PREFIX} 🔔 Checking pending reminders for client ${profile.id}`);

        // Get feedback history
        const feedbackLoop = global.HEYS.InsightsPI?.feedbackLoop;
        if (!feedbackLoop) {
            console.warn(`[MEALREC]${LOG_PREFIX} ⚠️ FeedbackLoop module not available`);
            return;
        }

        const history = feedbackLoop.getRecommendationHistory?.(profile);
        if (!history || history.length === 0) return;

        // Check for records needing reminder (3/7/14 days)
        const thresholds = [14, 7, 3]; // Check in reverse order (oldest first)

        for (const threshold of thresholds) {
            const needsReminder = history.find(record =>
                shouldShowReminder(record, threshold) && !record.reminderShown
            );

            if (needsReminder) {
                console.info(`[MEALREC]${LOG_PREFIX} 📬 Showing ${threshold}-day reminder for:`, needsReminder.id);

                // Mark reminder as shown (prevent duplicate prompts)
                feedbackLoop.markReminderShown?.(needsReminder.id, threshold);

                // Show modal
                await show(needsReminder.id, profile);

                // Show only one reminder at a time
                break;
            }
        }
    }

    // Export API
    HEYS.InsightsPI.outcomeModal = {
        show,
        checkPendingReminders,
        shouldShowReminder,
        MODAL_ID
    };

    console.info(`[MEALREC]${LOG_PREFIX} ✅ Outcome Modal v1.0 loaded`);

    // Auto-check reminders on app ready (after profile loads)
    // Wait 10 seconds to ensure profile and all dependencies are loaded
    setTimeout(() => {
        const profile = global.HEYS?.profile;
        if (profile) {
            checkPendingReminders(profile).catch(err => {
                console.warn(`[MEALREC]${LOG_PREFIX} ⚠️ Auto-check reminders failed:`, err);
            });
        } else {
            console.info(`[MEALREC]${LOG_PREFIX} ℹ️ Profile not loaded yet, skipping auto-check reminders`);
        }
    }, 10000); // 10 seconds after module load

})(window);
