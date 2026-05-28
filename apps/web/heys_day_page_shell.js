// heys_day_page_shell.js — DayTab page shell renderer
if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();
; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Offline cold-start overlay: warns user when today has no local cache and no network
    function OfflineNoDataOverlay() {
        const [dismissed, setDismissed] = React.useState(false);

        React.useEffect(() => {
            const onOnline = () => setDismissed(true);
            const onSync = (e) => {
                if (e && e.detail && e.detail.phaseA) return;
                setDismissed(true);
            };
            window.addEventListener('online', onOnline);
            window.addEventListener('heysSyncCompleted', onSync);
            return () => {
                window.removeEventListener('online', onOnline);
                window.removeEventListener('heysSyncCompleted', onSync);
            };
        }, []);

        if (dismissed) return null;

        const handleRetry = () => {
            if (navigator.onLine) {
                const clientId = HEYS.utils?.getCurrentClientId?.() || '';
                const cloud = HEYS.cloud;
                if (cloud && clientId && typeof cloud.bootstrapClientSync === 'function') {
                    cloud.bootstrapClientSync(clientId);
                }
            } else {
                window.location.reload();
            }
        };

        return React.createElement('div', { className: 'offline-nodata-overlay' },
            React.createElement('div', { className: 'offline-nodata-icon' }, '⚠️'),
            React.createElement('div', { className: 'offline-nodata-title' }, 'Данные за сегодня не загружены'),
            React.createElement('div', { className: 'offline-nodata-text' },
                'Подключитесь к интернету для синхронизации'
            ),
            React.createElement('button', {
                className: 'offline-nodata-retry',
                onClick: handleRetry
            }, 'Обновить')
        );
    }

    function renderDayPage(params) {
        const {
            isReadOnly,
            pullProgress,
            isRefreshing,
            refreshStatus,
            pullThreshold,
            isMobile,
            mobileSubTab,
            orphanAlert,
            lowCalBanner,
            statsBlock,
            waterCard,
            compactActivity,
            sideBlock,
            cycleCard,
            date,
            day,
            caloricDebt,
            eatenKcal,
            optimum,
            addMeal,
            addWater,
            diarySection,
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
            handleAdviceToggleExpand,
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
            adviceSoundEnabled,
            toggleAdviceSoundEnabled,
            scheduleAdvice,
            undoLastDismiss,
            clearLastDismissed,
            copyAdviceTrace,
            adviceTraceAvailable,
            adviceTraceCopyState,
            adviceDiagnostics,
            adviceDiagnosticsOpen,
            openAdviceDiagnostics,
            closeAdviceDiagnostics,
            adviceDetailModalOpen,
            adviceDetailModalAdvice,
            openAdviceDetailModal,
            closeAdviceDetailModal,
            adviceTechnicalDetails,
            adviceTechnicalDetailsOpen,
            openAdviceTechnicalDetails,
            closeAdviceTechnicalDetails,
            ADVICE_CATEGORY_NAMES,
            AdviceCard,
            displayedAdvice,
            adviceExpanded,
            toastSwiped,
            toastSwipeX,
            toastDetailsOpen,
            toastAppearedAtRef,
            toastRatedState,
            toastScheduledConfirm,
            haptic,
            setToastDetailsOpen,
            setAdviceExpanded,
            setAdviceTrigger,
            handleToastTouchStart,
            handleToastTouchMove,
            handleToastTouchEnd,
            handleToastUndo,
            handleToastRate,
            handleToastSchedule,
            showTimePicker,
            cancelTimePicker,
            bottomSheetRef,
            handleSheetTouchStart,
            handleSheetTouchMove,
            handleSheetTouchEnd,
            pickerStep,
            animDirection,
            editMode,
            confirmTimeEdit,
            goToMoodStep,
            hoursValues,
            pendingMealTime,
            setPendingMealTime,
            minutesValues,
            isNightHourSelected,
            currentDateLabel,
            pendingMealType,
            setPendingMealType,
            WheelColumn,
            goBackToTimeStep,
            confirmMoodEdit,
            confirmMealCreation,
            pendingMealMood,
            setPendingMealMood,
            showConfetti,
            setShowConfetti,
            emojiAnimating,
            setEmojiAnimating,
            prof,
            pIndex,
            lsGet,
            fmtDate,
            getProductFromItem,
            getMealType,
            getMealQualityScore,
            editGramsTarget,
            editGramsValue,
            editPortions,
            editLastPortionGrams,
            editGramsInputRef,
            setEditGramsValue,
            confirmEditGramsModal,
            cancelEditGramsModal,
            handleEditGramsDrag,
            zoneFormulaPopup,
            closeZoneFormula,
            householdFormulaPopup,
            closeHouseholdFormula,
            showZonePicker,
            cancelZonePicker,
            confirmZonePicker,
            zonePickerTarget,
            zoneMinutesValues,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            showTrainingPicker,
            cancelTrainingPicker,
            confirmTrainingPicker,
            trainingPickerStep,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            trainingTypes,
            kcalMin,
            TR,
            mets,
            zoneNames,
            weight,
            kcalPerMin,
            r0,
            householdActivities,
            openTrainingPicker,
            openHouseholdPicker,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            showSleepQualityPicker,
            cancelSleepQualityPicker,
            confirmSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            cancelDayScorePicker,
            confirmDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            calculateDayAverages,
            mealQualityPopup,
            setMealQualityPopup,
            getSmartPopupPosition,
            createSwipeHandlers,
            M
        } = params || {};

        // Detect offline cold-start: today + offline + sync not done + no local snapshot
        const today = new Date().toISOString().slice(0, 10);
        const isToday = date === today;
        const offlineColdStart = isToday && !navigator.onLine && !HEYS.cloud?.isInitialSyncCompleted?.() && (() => {
            try {
                const raw = localStorage.getItem('heys_dayv2_' + date);
                if (!raw) return true;
                const v = JSON.parse(raw);
                return !(v && v.date);
            } catch (e) { return true; }
        })();

        // Expose flag for contextual offline banner text in AppOverlays
        if (!HEYS.Day) HEYS.Day = {};
        HEYS.Day.__offlineColdStart = offlineColdStart;

        return React.createElement(React.Fragment, null,
            React.createElement('div', {
                className: 'page page-day'
            },
                isReadOnly && HEYS.Paywall?.ReadOnlyBanner && React.createElement(HEYS.Paywall.ReadOnlyBanner, {
                    compact: false,
                    onClick: () => HEYS.Paywall?.showPaywall?.('trial_expired')
                }),

                // Offline cold-start warning overlay (only for today without local cache)
                offlineColdStart && React.createElement(OfflineNoDataOverlay),

                (pullProgress > 0 || isRefreshing || refreshStatus !== 'idle') && React.createElement('div', {
                    className: 'pull-indicator'
                        + (isRefreshing ? ' refreshing' : '')
                        + (refreshStatus === 'ready' ? ' ready' : '')
                        + (refreshStatus === 'success' ? ' success' : '')
                        + ' status-' + refreshStatus,
                    style: {
                        height: isRefreshing ? 56 : Math.max(pullProgress, 0),
                        opacity: isRefreshing ? 1 : Math.min(pullProgress / 35, 1)
                    }
                },
                    React.createElement('div', { className: 'pull-spinner' },
                        refreshStatus === 'success'
                            ? React.createElement('svg', {
                                className: 'pull-spinner-ring ready',
                                viewBox: '0 0 28 28',
                                style: { stroke: 'var(--success)' }
                            },
                                React.createElement('path', {
                                    d: 'M7 14l5 5 9-9',
                                    strokeWidth: 3,
                                    fill: 'none',
                                    strokeLinecap: 'round',
                                    strokeLinejoin: 'round'
                                })
                            )
                            : refreshStatus === 'error'
                                ? React.createElement('svg', {
                                    className: 'pull-spinner-ring',
                                    viewBox: '0 0 28 28',
                                    style: { stroke: 'var(--err, #ef4444)' }
                                },
                                    React.createElement('path', {
                                        d: 'M8 8l12 12M20 8l-12 12',
                                        strokeWidth: 3,
                                        fill: 'none',
                                        strokeLinecap: 'round'
                                    })
                                )
                                : refreshStatus === 'timeout'
                                    ? React.createElement('svg', {
                                        className: 'pull-spinner-ring',
                                        viewBox: '0 0 28 28',
                                        style: { stroke: 'var(--warn, #f59e0b)' }
                                    },
                                        React.createElement('path', {
                                            d: 'M14 7v8m0 4h.01',
                                            strokeWidth: 3,
                                            fill: 'none',
                                            strokeLinecap: 'round',
                                            strokeLinejoin: 'round'
                                        }),
                                        React.createElement('circle', {
                                            cx: 14,
                                            cy: 14,
                                            r: 10,
                                            strokeWidth: 2,
                                            fill: 'none'
                                        })
                                    )
                                    : refreshStatus === 'syncing'
                                        ? React.createElement('svg', {
                                            className: 'pull-spinner-ring spinning',
                                            viewBox: '0 0 28 28'
                                        },
                                            React.createElement('circle', {
                                                cx: 14, cy: 14, r: 10,
                                                strokeDasharray: '45 20',
                                                strokeDashoffset: 0
                                            })
                                        )
                                        : React.createElement('svg', {
                                            className: 'pull-spinner-ring' + (refreshStatus === 'ready' ? ' ready' : ''),
                                            viewBox: '0 0 28 28',
                                            style: {
                                                transform: `rotate(${-90 + Math.min(pullProgress / pullThreshold, 1) * 180}deg)`,
                                                transition: 'transform 0.1s ease-out'
                                            }
                                        },
                                            React.createElement('circle', {
                                                cx: 14, cy: 14, r: 10,
                                                strokeDasharray: 63,
                                                strokeDashoffset: 63 - (Math.min(pullProgress / pullThreshold, 1) * 63)
                                            })
                                        )
                    ),
                    React.createElement('span', {
                        className: 'pull-text'
                            + (refreshStatus === 'ready' ? ' ready' : '')
                            + (refreshStatus === 'syncing' ? ' syncing' : '')
                            + ' status-' + refreshStatus
                    },
                        refreshStatus === 'success' ? 'Готово!'
                            : refreshStatus === 'timeout' ? 'Синхронизация заняла слишком долго'
                                : refreshStatus === 'error' ? 'Ошибка синхронизации'
                                    : refreshStatus === 'syncing' ? 'Синхронизация...'
                                        : refreshStatus === 'ready' ? 'Отпустите для обновления'
                                            : 'Потяните для обновления'
                    )
                ),

                (!isMobile || mobileSubTab === 'stats') && orphanAlert,
                (!isMobile || mobileSubTab === 'stats') && lowCalBanner,
                (!isMobile || mobileSubTab === 'stats') && statsBlock,
                (!isMobile || mobileSubTab === 'stats') && waterCard,
                (!isMobile || mobileSubTab === 'stats') && compactActivity,
                (!isMobile || mobileSubTab === 'stats') && sideBlock,
                (!isMobile || mobileSubTab === 'stats') && cycleCard,

                isMobile && (mobileSubTab === 'stats' || mobileSubTab === 'diary') && !offlineColdStart && React.createElement('div', {
                    className: 'fab-group',
                    id: 'tour-fab-buttons'
                },
                    React.createElement('button', {
                        className: 'meal-fab',
                        onClick: () => {
                            if (mobileSubTab === 'stats' && window.HEYS?.App?.setTab) {
                                window.HEYS.App.setTab('diary');
                                setTimeout(() => {
                                    const heading = document.getElementById('diary-heading');
                                    if (heading) {
                                        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                    setTimeout(() => addMeal(), 800);
                                }, 200);
                            } else {
                                const heading = document.getElementById('diary-heading');
                                if (heading) {
                                    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                                setTimeout(() => addMeal(), 800);
                            }
                        },
                        'aria-label': 'Добавить приём пищи'
                    }, '🍽️'),
                    React.createElement('button', {
                        className: 'water-fab',
                        onClick: (e) => addWater(200, {
                            source: 'day-fab',
                            sourceEl: e.currentTarget
                        }),
                        'aria-label': 'Добавить стакан воды'
                    }, '🥛'),
                    window.HEYS?.Messenger?.FabButton
                        ? React.createElement(window.HEYS.Messenger.FabButton, { key: 'msg-fab' })
                        : React.createElement('button', {
                            className: 'message-fab',
                            onClick: () => window.HEYS?.Messenger?.openModal?.(),
                            'aria-label': 'Написать куратору'
                        }, '💬')
                ),

                diarySection,

                HEYS.dayAdviceListUI?.renderManualAdviceList?.({
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
                    copyAdviceTrace,
                    adviceTraceAvailable,
                    adviceTraceCopyState,
                    adviceDiagnostics,
                    adviceDiagnosticsOpen,
                    openAdviceDiagnostics,
                    closeAdviceDiagnostics,
                    adviceDetailModalOpen,
                    adviceDetailModalAdvice,
                    openAdviceDetailModal,
                    closeAdviceDetailModal,
                    adviceTechnicalDetails,
                    adviceTechnicalDetailsOpen,
                    openAdviceTechnicalDetails,
                    closeAdviceTechnicalDetails,
                    ADVICE_CATEGORY_NAMES,
                    AdviceCard
                }) || null,

                HEYS.dayAdviceListUI?.renderEmptyAdviceToast?.({
                    React,
                    adviceTrigger,
                    toastVisible,
                    dismissToast
                }) || null,

                HEYS.dayAdviceToastUI?.renderAutoAdviceToast?.({
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
                    handleToastSchedule
                    ,
                    adviceTechnicalDetails,
                    adviceTechnicalDetailsOpen,
                    openAdviceTechnicalDetails,
                    closeAdviceTechnicalDetails
                }) || null,

                null,

                HEYS.dayTimeMoodPicker?.renderTimeMoodPicker?.({
                    showTimePicker,
                    cancelTimePicker,
                    bottomSheetRef,
                    handleSheetTouchStart,
                    handleSheetTouchMove,
                    handleSheetTouchEnd,
                    pickerStep,
                    animDirection,
                    editMode,
                    confirmTimeEdit,
                    goToMoodStep,
                    hoursValues,
                    pendingMealTime,
                    setPendingMealTime,
                    minutesValues,
                    isNightHourSelected,
                    currentDateLabel,
                    pendingMealType,
                    setPendingMealType,
                    day,
                    WheelColumn,
                    goBackToTimeStep,
                    confirmMoodEdit,
                    confirmMealCreation,
                    pendingMealMood,
                    setPendingMealMood,
                    showConfetti,
                    setShowConfetti,
                    emojiAnimating,
                    setEmojiAnimating,
                    prof,
                    pIndex,
                    lsGet,
                    fmtDate,
                    optimum,
                    getProductFromItem,
                    getMealType,
                    getMealQualityScore
                }) || null,

                HEYS.dayEditGramsModal?.renderEditGramsModal?.({
                    editGramsTarget,
                    editGramsValue,
                    editPortions,
                    editLastPortionGrams,
                    editGramsInputRef,
                    setEditGramsValue,
                    confirmEditGramsModal,
                    cancelEditGramsModal,
                    handleSheetTouchStart,
                    handleSheetTouchMove,
                    handleSheetTouchEnd,
                    handleEditGramsDrag,
                    haptic
                }) || null,

                HEYS.dayTrainingPopups?.renderTrainingPopups?.({
                    zoneFormulaPopup,
                    closeZoneFormula,
                    householdFormulaPopup,
                    closeHouseholdFormula,
                    showZonePicker,
                    cancelZonePicker,
                    confirmZonePicker,
                    zonePickerTarget,
                    zoneMinutesValues,
                    pendingZoneMinutes,
                    setPendingZoneMinutes,
                    showTrainingPicker,
                    cancelTrainingPicker,
                    confirmTrainingPicker,
                    trainingPickerStep,
                    pendingTrainingZones,
                    setPendingTrainingZones,
                    pendingTrainingTime,
                    setPendingTrainingTime,
                    pendingTrainingType,
                    setPendingTrainingType,
                    trainingTypes,
                    hoursValues,
                    minutesValues,
                    kcalMin,
                    TR,
                    mets,
                    zoneNames,
                    weight,
                    kcalPerMin,
                    r0,
                    householdActivities,
                    openTrainingPicker,
                    openHouseholdPicker,
                    WheelColumn,
                    haptic,
                    handleSheetTouchStart,
                    handleSheetTouchMove,
                    handleSheetTouchEnd,
                    pendingTrainingQuality,
                    setPendingTrainingQuality,
                    pendingTrainingFeelAfter,
                    setPendingTrainingFeelAfter,
                    pendingTrainingComment,
                    setPendingTrainingComment
                }) || null,

                HEYS.daySleepScorePopups?.renderSleepScorePopups?.({
                    showSleepQualityPicker,
                    cancelSleepQualityPicker,
                    confirmSleepQualityPicker,
                    pendingSleepQuality,
                    setPendingSleepQuality,
                    pendingSleepNote,
                    setPendingSleepNote,
                    sleepQualityValues,
                    showDayScorePicker,
                    cancelDayScorePicker,
                    confirmDayScorePicker,
                    pendingDayScore,
                    setPendingDayScore,
                    pendingDayComment,
                    setPendingDayComment,
                    day,
                    calculateDayAverages,
                    handleSheetTouchStart,
                    handleSheetTouchMove,
                    handleSheetTouchEnd
                }) || null
            ),
            HEYS.dayMealQualityPopup?.renderMealQualityPopup?.({
                mealQualityPopup,
                setMealQualityPopup,
                getSmartPopupPosition,
                createSwipeHandlers,
                M,
                pIndex,
                getProductFromItem,
                optimum,
                getMealType,
                getMealQualityScore
            })
        );
    }

    HEYS.dayPageShell = {
        renderDayPage
    };
})(window);
