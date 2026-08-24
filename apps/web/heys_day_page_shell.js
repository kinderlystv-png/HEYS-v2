// heys_day_page_shell.js — DayTab page shell renderer
if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();
; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // ─── Знак ожидания в жесте обновления ──────────────────────────────────
    // Форма одна на весь продукт (контракт «Спиннеры» → «форма» и «вид знака»):
    // viewBox 24, дуга 26 px обводкой 2,75, скругление концов, хвост той же дуги
    // под .22. Исходов три — ожидание, успех, ошибка; таймаут показывается тем же
    // знаком ошибки, разводит их только строка под знаком.
    const PULL_ARC = [
        { key: 'tail', d: 'M21 12a9 9 0 11-9-9', opacity: 0.22 },
        { key: 'arc', d: 'M12 3a9 9 0 019 9' },
    ];

    function pullSign(refreshStatus, pullProgress, pullThreshold) {
        const svg = (extra, tone, children, style) => React.createElement('svg', {
            className: 'pull-spinner-ring' + (extra ? ' ' + extra : ''),
            viewBox: '0 0 24 24',
            fill: 'none',
            style: Object.assign({}, tone ? { stroke: tone } : null, style || null),
        }, children);
        const arc = () => PULL_ARC.map((p) => React.createElement('path', p));

        if (refreshStatus === 'success') {
            return svg('ready', 'var(--success)',
                React.createElement('path', { d: 'M5 13l4 4L19 7' }));
        }
        if (refreshStatus === 'error' || refreshStatus === 'timeout') {
            return svg(null, 'var(--err, #ef4444)', [
                React.createElement('path', { key: 'bang', d: 'M12 7v6M12 17h.01' }),
                React.createElement('circle', { key: 'ring', cx: 12, cy: 12, r: 9 }),
            ]);
        }
        if (refreshStatus === 'syncing') {
            return svg('spinning', null, arc());
        }
        // Тяга: знак не меняет форму и тон, он доворачивается вслед за жестом —
        // половина оборота к порогу. Определённого кольца-прогресса больше нет:
        // это была вторая форма ожидания.
        return svg(null, null, arc(), {
            transform: `rotate(${-90 + Math.min(pullProgress / pullThreshold, 1) * 180}deg)`,
            transition: 'transform 0.1s ease-out',
        });
    }

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
            React.createElement('div', { className: 'offline-nodata-title' }, 'Данные за сегодня не загрузились'),
            React.createElement('div', { className: 'offline-nodata-text' },
                'Нет связи, а на этом устройстве дня ещё нет. Прошлые дни открываются — они сохранены.'
            ),
            React.createElement('button', {
                className: 'offline-nodata-retry',
                onClick: handleRetry
            }, 'Обновить')
        );
    }

    function portalAdviceOverlay(node) {
        if (!node) return null;
        const ReactDOM = global.ReactDOM;
        const body = typeof document !== 'undefined' ? document.body : null;
        if (body && ReactDOM && typeof ReactDOM.createPortal === 'function') {
            return ReactDOM.createPortal(node, body);
        }
        return node;
    }

    function renderFabNavIcon(name, emojiFallback, size) {
        const NavIcon = HEYS.AppNavIcons?.NavIcon;
        if (NavIcon) {
            return React.createElement(NavIcon, { name, size: size || 20 });
        }
        return emojiFallback;
    }

    const FAB_SLOT_KEYS = ['activity', 'message', 'hunger', 'water', 'meal'];

    // Строки контракта settings-system «когда применяется» и «снятый прогон»:
    // «Анимации перестройки на экране нет», прогон стопки снят 24 августа и
    // помечен data-demo="protocol" — то есть не реализуется. Вместе с ним из
    // продуктового CSS ушли правила .fab-group--layout-animate для этой группы:
    // класс перестал что-либо анимировать, а выдержка 688 мс (52×4 + 400 + 80)
    // держала его впустую и отодвигала смену состояния на два кадра.
    // Единственное оставшееся движение — появление и исчезновение самой кнопки,
    // и оно живёт у .fab-group--messenger-only (heys_app_shell_v1.js).
    function useFabVisibilityState() {
        const readFabVisibility = () => (
            HEYS.FabVisibility && typeof HEYS.FabVisibility.read === 'function'
                ? HEYS.FabVisibility.read()
                : { water: true, hunger: true, message: true, activity: true, meal: true }
        );
        const [fabVisibility, setFabVisibility] = React.useState(readFabVisibility);

        React.useEffect(() => {
            const onCommitted = (event) => {
                setFabVisibility(event?.detail?.visibility || readFabVisibility());
            };
            window.addEventListener('heys:fab-visibility-changed', onCommitted);
            return () => window.removeEventListener('heys:fab-visibility-changed', onCommitted);
        }, []);

        const isFabVisible = (key) => fabVisibility[key] !== false;
        return { fabVisibility, isFabVisible };
    }

    const WATER_FAB_VOL_CHIP_MS = 180;
    const WaterCustomVolumeHost = HEYS.WaterCustomVolume?.WaterCustomVolumeHost;
    const useWaterLongPress = HEYS.WaterCustomVolume.useLongPress350;

    function WaterFabVolButton({ className, disabled, onShortClick, onLongPress, children, 'aria-disabled': ariaDisabled }) {
        const press = useWaterLongPress(onLongPress, { onShortClick, disabled });
        return React.createElement('button', {
            type: 'button',
            className,
            disabled,
            'aria-disabled': ariaDisabled,
            onPointerDown: press.onPointerDown,
            onPointerMove: press.onPointerMove,
            onPointerUp: press.onPointerUp,
            onClick: press.onClick
        }, children);
    }

    /**
     * Подпись кнопки воды для диктора — строка «доступность»:
     * «Вода, 1,7 из 2,7 литра». Норма берётся оттуда же, откуда её берёт
     * плитка; если её нет, называем только выпитое, а не выдумываем цель.
     */
    function waterAriaValue(ml) {
        const liters = (n) => (Math.round(n / 100) / 10).toFixed(1).replace('.', ',');
        const drunk = liters(Number(ml) || 0);
        const target = Number(HEYS.Widgets?.data?.getWaterData?.()?.target) || 0;
        return target > 0 ? `${drunk} из ${liters(target)} литра` : `${drunk} литра`;
    }

    function WaterFabButton({ onAddWater, onRemoveWater, waterMl: waterMlProp }) {
        const [chipsOpen, setChipsOpen] = React.useState(false);
        const [waterMl, setWaterMl] = React.useState(() => (
            typeof waterMlProp === 'number'
                ? waterMlProp
                : (HEYS.Widgets?.data?.getWaterData?.()?.drunk
                    || Number(HEYS.DayData?.getCurrentDay?.()?.waterMl)
                    || 0)
        ));
        const wrapRef = React.useRef(null);

        React.useEffect(() => {
            if (typeof waterMlProp === 'number') setWaterMl(waterMlProp);
        }, [waterMlProp]);

        React.useEffect(() => {
            const onWater = (event) => {
                const total = event?.detail?.total;
                if (typeof total === 'number') setWaterMl(total);
            };
            window.addEventListener('heysWaterAdded', onWater);
            return () => window.removeEventListener('heysWaterAdded', onWater);
        }, []);

        React.useEffect(() => {
            HEYS.waterFeedback?.setVolumeChipsOpen?.(chipsOpen);
        }, [chipsOpen]);

        React.useEffect(() => {
            if (!chipsOpen) return undefined;
            const onPointerDown = (event) => {
                if (wrapRef.current && wrapRef.current.contains(event.target)) return;
                setChipsOpen(false);
            };
            document.addEventListener('pointerdown', onPointerDown, true);
            return () => document.removeEventListener('pointerdown', onPointerDown, true);
        }, [chipsOpen]);

        const pickVolume = (ml) => (event) => {
            event.stopPropagation();
            HEYS.waterFeedback?.markVolumeChipsClosing?.(WATER_FAB_VOL_CHIP_MS);
            setChipsOpen(false);
            onAddWater(ml, event);
        };

        const pickRemove = (ml) => (event) => {
            event.stopPropagation();
            HEYS.waterFeedback?.markVolumeChipsClosing?.(WATER_FAB_VOL_CHIP_MS);
            setChipsOpen(false);
            onRemoveWater?.(ml, event);
        };

        const openCustomVolume = React.useCallback((event) => {
            event?.stopPropagation?.();
            HEYS.waterFeedback?.markVolumeChipsClosing?.(WATER_FAB_VOL_CHIP_MS);
            setChipsOpen(false);
            HEYS.WaterCustomVolume?.open?.({
                onAdd: (ml) => onAddWater(ml, event)
            });
        }, [onAddWater]);

        const fabLongPress = useWaterLongPress(openCustomVolume, {
            onShortClick: (event) => {
                event.stopPropagation();
                setChipsOpen((open) => !open);
            }
        });

        return React.createElement('div', {
            ref: wrapRef,
            className: 'water-fab-wrap' + (chipsOpen ? ' is-chips-open' : ''),
        },
            chipsOpen && React.createElement('div', {
                className: 'water-fab-vols animate-always',
                role: 'group',
                'aria-label': 'Объём воды',
            },
                React.createElement(WaterFabVolButton, {
                    className: 'water-fab-vol water-fab-vol--minus',
                    disabled: waterMl <= 0,
                    'aria-disabled': waterMl <= 0 ? 'true' : 'false',
                    'aria-label': 'убрать 200 миллилитров',
                    onShortClick: pickRemove(200),
                    onLongPress: openCustomVolume
                }, '−200'),
                React.createElement(WaterFabVolButton, {
                    className: 'water-fab-vol',
                    'aria-label': 'добавить 200 миллилитров',
                    onShortClick: pickVolume(200),
                    onLongPress: openCustomVolume
                }, '+200'),
                React.createElement(WaterFabVolButton, {
                    className: 'water-fab-vol',
                    'aria-label': 'добавить 500 миллилитров',
                    onShortClick: pickVolume(500),
                    onLongPress: openCustomVolume
                }, '+500')
            ),
            React.createElement('button', {
                type: 'button',
                className: 'water-fab',
                // Строка «доступность»: кнопка озвучивается со значением —
                // «Вода, 1,7 из 2,7 литра». Без него диктор называет действие,
                // но не состояние, ради которого на кнопку и смотрят.
                'aria-label': chipsOpen
                    ? 'Скрыть объёмы воды'
                    : `Вода, ${waterAriaValue(waterMl)}`,
                'aria-expanded': chipsOpen ? 'true' : 'false',
                onPointerDown: fabLongPress.onPointerDown,
                onPointerMove: fabLongPress.onPointerMove,
                onPointerUp: fabLongPress.onPointerUp,
                onClick: fabLongPress.onClick
            }, renderFabNavIcon('water', '🥛', 18))
        );
    }

    function renderQuickActionFabButton(key, { onAddWater, onRemoveWater, waterMl, onAddMeal, onAddActivity, hungerContext }) {
        const HungerFabButton = HEYS.HungerEnergyStatusModal?.FabButton;
        const MessageFabButton = HEYS.Messenger?.FabButton;

        if (key === 'water') {
            return React.createElement(WaterFabButton, { onAddWater, onRemoveWater, waterMl });
        }
        if (key === 'meal') {
            return React.createElement('button', {
                className: 'meal-fab',
                onClick: onAddMeal,
                'aria-label': 'Добавить приём пищи',
            }, renderFabNavIcon('meal', '🍽️', 22));
        }
        if (key === 'hunger') {
            return HungerFabButton
                ? React.createElement(HungerFabButton, { context: hungerContext })
                : React.createElement('button', {
                    className: 'hunger-energy-fab',
                    onClick: () => HEYS.HungerEnergyStatusModal?.show?.(hungerContext),
                    'aria-label': 'Открыть оценку голода',
                }, React.createElement('svg', {
                    className: 'hes-fab-icon',
                    viewBox: '0 0 24 24',
                    width: 19,
                    height: 19,
                    focusable: 'false',
                    'aria-hidden': 'true',
                },
                    React.createElement('defs', null,
                        React.createElement('clipPath', { id: 'hes-fab-fill-two-thirds-fallback' },
                            React.createElement('rect', { x: 0, y: 9, width: 24, height: 15 })
                        )
                    ),
                    React.createElement('circle', { className: 'hes-fab-icon__ring', cx: 12, cy: 12, r: 8.5 }),
                    React.createElement('circle', {
                        className: 'hes-fab-icon__fill',
                        cx: 12, cy: 12, r: 8.5,
                        clipPath: 'url(#hes-fab-fill-two-thirds-fallback)',
                    })
                ));
        }
        if (key === 'activity') {
            return React.createElement('button', {
                className: 'activity-fab',
                onClick: onAddActivity,
                'aria-label': 'Добавить активность',
            }, renderFabNavIcon('activity', '📈', 18));
        }
        if (key === 'message') {
            return MessageFabButton
                ? React.createElement(MessageFabButton, { key: 'msg-fab' })
                : React.createElement('button', {
                    className: 'message-fab',
                    onClick: () => HEYS.Messenger?.openModal?.(),
                    'aria-label': 'Написать куратору',
                }, '💬');
        }
        return null;
    }

    function QuickActionsFabGroup({ id, onAddWater, onRemoveWater, waterMl, onAddMeal, onAddActivity, hungerContext = {}, hideMealFab = false }) {
        const { fabVisibility } = useFabVisibilityState();

        return React.createElement('div', {
            className: 'fab-group',
            ...(id ? { id } : {}),
        },
            FAB_SLOT_KEYS.map((key) => {
                if (hideMealFab && key === 'meal') return null;
                const on = fabVisibility[key] !== false;
                return React.createElement('div', {
                    key,
                    className: 'fab-slot fab-slot--' + key + (on ? ' fab-slot--on' : ' fab-slot--off'),
                    'data-fab-key': key,
                    'aria-hidden': on ? undefined : 'true',
                },
                    React.createElement('div', { className: 'fab-slot__inner' },
                        renderQuickActionFabButton(key, { onAddWater, onRemoveWater, waterMl, onAddMeal, onAddActivity, hungerContext })
                    )
                );
            })
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
            isTabActive = true,
            orphanAlert,
            lowCalBanner,
            statsBlock,
            compactActivity,
            compactNutrition,
            sideBlock,
            cycleCard,
            reportsOverviewCard,
            reportsFullscreenModal,
            date,
            day,
            caloricDebt,
            eatenKcal,
            optimum,
            displayOptimum,
            tdee,
            addMeal,
            addWater,
            removeWater,
            diarySection,
            adviceTrigger,
            adviceRelevant,
            badgeAdvices,
            totalAdviceCount,
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
            undoCountdownSeconds,
            adviceServiceOpen,
            openAdviceService,
            closeAdviceService,
            openAdviceRulesPool,
            closeAdviceRulesPool,
            adviceRulesPoolOpen,
            retryAdviceMarksSync,
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
            markAdviceDetailRead,
            hideAdviceDetailUntilTomorrow,
            adviceTechnicalDetails,
            adviceTechnicalDetailsOpen,
            openAdviceTechnicalDetails,
            closeAdviceTechnicalDetails,
            ADVICE_CATEGORY_NAMES,
            ewsWarnings,
            AdviceCard,
            adviceSettingsOpen,
            closeAdviceSettings,
            adviceCategorySettings,
            toggleAdviceCategoryGroup,
            medicalDisclaimerSessionDismissed,
            medicalDisclaimerNeverShow,
            setMedicalDisclaimerNeverShow,
            dismissMedicalDisclaimerGate,
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

        // Экспорт addActivity — тем же приёмом, что HEYS.Day.addMeal в
        // heys_day_effects.js. Нужен карточке быстрых действий на Главной:
        // строка контракта «набор действий» требует, чтобы «Активность»
        // открывала добавление активности, а сам подборщик живёт здесь и
        // наружу выведен не был.
        React.useEffect(() => {
            if (typeof openHouseholdPicker !== 'function') return undefined;
            const addActivity = () => openHouseholdPicker('add');
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addActivity = addActivity;
            return () => {
                if (HEYS.Day && HEYS.Day.addActivity === addActivity) {
                    delete HEYS.Day.addActivity;
                }
            };
        }, [openHouseholdPicker]);

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
                    onClick: () => HEYS.Paywall?.show?.('trial_expired')
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
                        // Один знак ожидания на весь продукт (контракт «Спиннеры» →
                        // «форма»). Свои фигуры жеста сняты: кольцо-гейдж со своей
                        // дугой 45/20, крест ошибки, треугольник таймаута. Осталась
                        // геометрия знака — дуга 26 обводкой 2,75 с хвостом .22,
                        // и его же глифы галочки и ошибки.
                        // Отступление названо вслух: контракт «жест обновления»
                        // просит системное кольцо платформы, но его здесь нет —
                        // см. отчёт, строка «жест обновления».
                        pullSign(refreshStatus, pullProgress, pullThreshold)
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

                (!isMobile || mobileSubTab === 'stats') && isTabActive && orphanAlert,
                (!isMobile || mobileSubTab === 'stats') && isTabActive && lowCalBanner,
                (!isMobile || mobileSubTab === 'stats') && isTabActive && statsBlock,
                (!isMobile || mobileSubTab === 'activity') && isTabActive && compactActivity,
                (!isMobile || mobileSubTab === 'diary') && isTabActive && compactNutrition,
                (!isMobile || mobileSubTab === 'stats') && isTabActive && sideBlock,
                (!isMobile || mobileSubTab === 'stats') && isTabActive && cycleCard,
                (!isMobile || mobileSubTab === 'stats') && isTabActive && reportsOverviewCard,

                isTabActive && reportsFullscreenModal,

                isMobile && isTabActive && (mobileSubTab === 'stats' || mobileSubTab === 'diary' || mobileSubTab === 'activity') && !offlineColdStart && React.createElement(QuickActionsFabGroup, {
                    id: 'tour-fab-buttons',
                    hideMealFab: mobileSubTab === 'diary',
                    waterMl: day?.waterMl || 0,
                    onAddWater: (ml, e) => addWater(ml, {
                        source: 'day-fab',
                        sourceEl: e.currentTarget
                    }),
                    onRemoveWater: (ml) => removeWater(ml),
                    // Скрытого легаси-блока #diary-heading больше нет: раньше FAB
                    // скроллил к display:none-элементу и всё равно ждал 800 мс
                    // перед шторкой. Теперь шторка открывается сразу.
                    onAddMeal: () => {
                        if (mobileSubTab !== 'diary' && window.HEYS?.App?.setTab) {
                            window.HEYS.App.setTab('diary');
                            setTimeout(() => addMeal(), 200);
                            return;
                        }
                        addMeal();
                    },
                    onAddActivity: () => {
                        if (mobileSubTab !== 'activity' && window.HEYS?.App?.setTab) {
                            window.HEYS.App.setTab('activity');
                            setTimeout(() => {
                                if (typeof openHouseholdPicker === 'function') openHouseholdPicker('add');
                            }, 350);
                        } else if (typeof openHouseholdPicker === 'function') {
                            openHouseholdPicker('add');
                        }
                    },
                    hungerContext: {
                        source: 'day-fab',
                        date,
                        day,
                        prof,
                        eatenKcal,
                        optimum: displayOptimum || optimum,
                        tdee,
                        caloricDebt
                    }
                }),

                diarySection,

                portalAdviceOverlay(HEYS.dayAdviceListUI?.renderAdviceSharedOverlays?.({
                    React,
                    adviceTrigger,
                    toastVisible,
                    medicalDisclaimerSessionDismissed,
                    medicalDisclaimerNeverShow,
                    onMedicalDisclaimerNeverShowChange: setMedicalDisclaimerNeverShow,
                    onMedicalDisclaimerContinue: dismissMedicalDisclaimerGate,
                    adviceSettingsOpen,
                    closeAdviceSettings,
                    toastsEnabled,
                    toggleToastsEnabled,
                    adviceSoundEnabled,
                    toggleAdviceSoundEnabled,
                    adviceCategorySettings,
                    toggleAdviceCategoryGroup,
                })),

                portalAdviceOverlay(HEYS.dayAdviceListUI?.renderManualAdviceList?.({
                    React,
                    adviceTrigger,
                    adviceRelevant,
                    badgeAdvices,
                    totalAdviceCount,
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
                    undoCountdownSeconds,
                    adviceServiceOpen,
                    openAdviceService,
                    closeAdviceService,
                    openAdviceRulesPool,
                    closeAdviceRulesPool,
                    adviceRulesPoolOpen,
                    retryAdviceMarksSync,
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
                    // Строка контракта tips «доступность»: действия «прочитано»
                    // и «скрыть до завтра» дублируют свайпы внутри детали совета.
                    markAdviceDetailRead,
                    hideAdviceDetailUntilTomorrow,
                    adviceTechnicalDetails,
                    adviceTechnicalDetailsOpen,
                    openAdviceTechnicalDetails,
                    closeAdviceTechnicalDetails,
                    ADVICE_CATEGORY_NAMES,
                    ewsWarnings,
                    AdviceCard,
                    medicalDisclaimerSessionDismissed,
                })),

                portalAdviceOverlay(HEYS.dayAdviceListUI?.renderEmptyAdviceToast?.({
                    React,
                    adviceTrigger,
                    toastVisible,
                    dismissToast,
                    medicalDisclaimerSessionDismissed,
                })),

                portalAdviceOverlay(HEYS.dayAdviceToastUI?.renderAutoAdviceToast?.({
                    React,
                    adviceTrigger,
                    displayedAdvice,
                    toastVisible,
                    toastSwiped,
                    toastSwipeX,
                    toastRatedState,
                    dismissToast,
                    handleToastRate,
                    handleToastTouchStart,
                    handleToastTouchMove,
                    handleToastTouchEnd,
                    openAdviceDetailModal,
                    medicalDisclaimerSessionDismissed,
                    ADVICE_CATEGORY_NAMES,
                    adviceTechnicalDetails,
                    adviceTechnicalDetailsOpen,
                    closeAdviceTechnicalDetails,
                })),

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
            }),
            WaterCustomVolumeHost ? React.createElement(WaterCustomVolumeHost) : null
        );
    }

    HEYS.dayPageShell = {
        renderDayPage,
        QuickActionsFabGroup
    };
})(window);
