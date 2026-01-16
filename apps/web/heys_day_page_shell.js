// heys_day_page_shell.js — DayTab page shell renderer

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

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
            displayedAdvice,
            adviceExpanded,
            toastSwiped,
            toastSwipeX,
            toastDetailsOpen,
            toastAppearedAtRef,
            toastScheduledConfirm,
            haptic,
            setToastDetailsOpen,
            setAdviceExpanded,
            setAdviceTrigger,
            handleToastTouchStart,
            handleToastTouchMove,
            handleToastTouchEnd,
            handleToastUndo,
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

        return React.createElement(React.Fragment, null,
            React.createElement('div', {
                className: 'page page-day'
            },
                isReadOnly && HEYS.Paywall?.ReadOnlyBanner && React.createElement(HEYS.Paywall.ReadOnlyBanner, {
                    compact: false,
                    onClick: () => HEYS.Paywall?.showPaywall?.('trial_expired')
                }),

                (pullProgress > 0 || isRefreshing) && React.createElement('div', {
                    className: 'pull-indicator'
                        + (isRefreshing ? ' refreshing' : '')
                        + (refreshStatus === 'ready' ? ' ready' : '')
                        + (refreshStatus === 'success' ? ' success' : ''),
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
                    },
                        refreshStatus === 'success' ? 'Готово!'
                            : refreshStatus === 'error' ? 'Ошибка синхронизации'
                                : refreshStatus === 'syncing' ? 'Синхронизация...'
                                    : refreshStatus === 'ready' ? 'Отпустите для обновления'
                                        : 'Потяните для обновления'
                    )
                ),

                (!isMobile || mobileSubTab === 'stats') && orphanAlert,
                (!isMobile || mobileSubTab === 'stats') && statsBlock,
                (!isMobile || mobileSubTab === 'stats') && waterCard,
                (!isMobile || mobileSubTab === 'stats') && compactActivity,
                (!isMobile || mobileSubTab === 'stats') && sideBlock,
                (!isMobile || mobileSubTab === 'stats') && cycleCard,
                (!isMobile || mobileSubTab === 'stats') && HEYS.Supplements && HEYS.Supplements.renderCard({
                    dateKey: date,
                    dayData: day,
                    onForceUpdate: () => {
                        window.dispatchEvent(new CustomEvent('heys:day-updated', {
                            detail: { date, source: 'supplements-update', forceReload: true }
                        }));
                    }
                }),
                (!isMobile || mobileSubTab === 'stats') && day.isRefeedDay && HEYS.Refeed && HEYS.Refeed.renderRefeedCard({
                    isRefeedDay: day.isRefeedDay,
                    refeedReason: day.refeedReason,
                    caloricDebt,
                    eatenKcal,
                    optimum
                }),

                isMobile && (mobileSubTab === 'stats' || mobileSubTab === 'diary') && React.createElement('div', {
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
                        onClick: () => addWater(200),
                        'aria-label': 'Добавить стакан воды'
                    }, '🥛')
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
                    toastScheduledConfirm,
                    haptic,
                    setToastDetailsOpen,
                    setAdviceExpanded,
                    setAdviceTrigger,
                    handleToastTouchStart,
                    handleToastTouchMove,
                    handleToastTouchEnd,
                    handleToastUndo,
                    handleToastSchedule
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
