// heys_day_effects.js — DayTab side effects (sync, events)
// Phase 12 of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getReact() {
        const React = global.React;
        if (!React) {
            throw new Error('[heys_day_effects] React is required. Ensure React is loaded before heys_day_effects.js');
        }
        return React;
    }

    function useDaySyncEffects(deps) {
        const React = getReact();
        const {
            date,
            setIsHydrated,
            setDay,
            getProfile,
            ensureDay,
            loadMealsForDate,
            lsGet,
            lsSet,
            normalizeTrainings,
            cleanEmptyTrainings,
            prevDateRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            isSyncingRef
        } = deps || {};

        const isMeaningfulDayData = (data) => {
            if (!data || typeof data !== 'object') return false;
            const mealsCount = Array.isArray(data.meals) ? data.meals.length : 0;
            const trainingsCount = Array.isArray(data.trainings) ? data.trainings.length : 0;
            if (mealsCount > 0 || trainingsCount > 0) return true;
            if ((data.waterMl || 0) > 0) return true;
            if ((data.steps || 0) > 0) return true;
            if ((data.weightMorning || 0) > 0) return true;
            if (data.sleepStart || data.sleepEnd || data.sleepQuality || data.sleepNote) return true;
            if (data.dayScore || data.moodAvg || data.wellbeingAvg || data.stressAvg) return true;
            if (data.moodMorning || data.wellbeingMorning || data.stressMorning) return true;
            if (data.householdMin || (Array.isArray(data.householdActivities) && data.householdActivities.length > 0)) return true;
            if (data.isRefeedDay || data.refeedReason) return true;
            if (data.cycleDay !== null && data.cycleDay !== undefined) return true;
            if (data.deficitPct !== null && data.deficitPct !== undefined && data.deficitPct !== '') return true;
            if ((Array.isArray(data.supplementsPlanned) && data.supplementsPlanned.length > 0) ||
                (Array.isArray(data.supplementsTaken) && data.supplementsTaken.length > 0)) return true;
            return false;
        };

        // Подгружать данные дня из облака при смене даты
        React.useEffect(() => {
            let cancelled = false;

            // 🔴 КРИТИЧНО: Сохранить текущие данные ПЕРЕД сменой даты!
            // Иначе несохранённые изменения потеряются при переходе на другую дату
            const dateActuallyChanged = prevDateRef.current !== date;
            if (dateActuallyChanged && HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
                console.info(`[HEYS] 📅 Смена даты: ${prevDateRef.current} → ${date}, сохраняем предыдущий день...`);
                // Flush данные предыдущего дня синхронно
                // force=true — сохраняем предыдущий день даже если isHydrated=false
                HEYS.Day.requestFlush({ force: true });
            }
            prevDateRef.current = date;

            setIsHydrated(false); // Сброс: данные ещё не загружены для новой даты
            const clientId = global.HEYS && global.HEYS.currentClientId;
            const cloud = global.HEYS && global.HEYS.cloud;

            // Сбрасываем ref при смене даты
            lastLoadedUpdatedAtRef.current = 0;

            const doLocal = () => {
                if (cancelled) return;
                const profNow = getProfile();
                const key = 'heys_dayv2_' + date;
                HEYS?.store?.invalidate?.(key);
                const v = lsGet(key, null);
                if (v && v.date) {
                    // ЗАЩИТА: не перезаписываем более свежие данные
                    // handleDayUpdated может уже загрузить sync данные
                    if (v.updatedAt && lastLoadedUpdatedAtRef.current > 0 && v.updatedAt < lastLoadedUpdatedAtRef.current) {
                        return;
                    }
                    lastLoadedUpdatedAtRef.current = v.updatedAt || Date.now();

                    // Мигрируем оценки тренировок и очищаем пустые (только в памяти, НЕ сохраняем)
                    // Миграция сохранится автоматически при следующем реальном изменении данных
                    const normalizedTrainings = normalizeTrainings(v.trainings);
                    const cleanedTrainings = cleanEmptyTrainings(normalizedTrainings);
                    const cleanedDay = {
                        ...v,
                        trainings: cleanedTrainings
                    };
                    // 🔒 НЕ сохраняем миграцию сразу — это вызывает DAY SAVE и мерцание UI
                    // Данные сохранятся при следующем изменении (добавление еды, воды и т.д.)
                    const newDay = ensureDay(cleanedDay, profNow);
                    // 🔒 Оптимизация: не вызываем setDay если данные идентичны (предотвращает мерцание)
                    setDay(prevDay => {
                        // Сравниваем по КОНТЕНТУ, а не по метаданным (updatedAt может отличаться между локальной и облачной версией)
                        if (prevDay && prevDay.date === newDay.date) {
                            const prevMealsJson = JSON.stringify(prevDay.meals || []);
                            const newMealsJson = JSON.stringify(newDay.meals || []);
                            const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
                            const newTrainingsJson = JSON.stringify(newDay.trainings || []);
                            const isSameContent =
                                prevMealsJson === newMealsJson &&
                                prevTrainingsJson === newTrainingsJson &&
                                prevDay.waterMl === newDay.waterMl &&
                                prevDay.steps === newDay.steps &&
                                prevDay.weightMorning === newDay.weightMorning &&
                                prevDay.sleepStart === newDay.sleepStart &&
                                prevDay.sleepEnd === newDay.sleepEnd;
                            if (isSameContent) {
                                // Данные не изменились — оставляем предыдущий объект (без ре-рендера)
                                return prevDay;
                            }
                        }
                        return newDay;
                    });
                } else {
                    // create a clean default day for the selected date (don't inherit previous trainings)
                    const defaultDay = ensureDay({
                        date: date,
                        meals: (loadMealsForDate(date) || []),
                        trainings: [],
                        // Явно устанавливаем пустые значения для полей сна и оценки
                        sleepStart: '',
                        sleepEnd: '',
                        sleepQuality: '',
                        sleepNote: '',
                        dayScore: '',
                        moodAvg: '',
                        wellbeingAvg: '',
                        stressAvg: '',
                        dayComment: ''
                    }, profNow);
                    setDay(defaultDay);
                }

                // ВАЖНО: данные загружены, теперь можно сохранять
                // Продукты приходят через props.products, не нужно обновлять локально
                setIsHydrated(true);
            };

            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
                    // 🔒 Блокируем события heys:day-updated во время синхронизации
                    // Это предотвращает множественные setDay() и мерцание UI
                    isSyncingRef.current = true;
                    window.__heysPerfMark && window.__heysPerfMark('DayEffects: bootstrapClientSync called');
                    cloud.bootstrapClientSync(clientId)
                        .then(() => {
                            // После sync localStorage уже обновлён событиями heys:day-updated
                            // Просто загружаем финальные данные (без задержки!)
                            isSyncingRef.current = false;
                            window.__heysPerfMark && window.__heysPerfMark('DayEffects: sync done → setDay');
                            doLocal();
                        })
                        .catch((err) => {
                            // Нет сети или ошибка — загружаем из локального кэша
                            isSyncingRef.current = false;
                            console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                            doLocal();
                        });
                } else {
                    doLocal();
                }
            } else {
                doLocal();
            }

            return () => {
                cancelled = true;
                isSyncingRef.current = false; // Сброс при смене даты или размонтировании
            };
        }, [date]);

        // Слушаем событие обновления данных дня (от Morning Check-in или внешних изменений)
        // НЕ слушаем heysSyncCompleted — это вызывает бесконечный цикл при каждом сохранении
        // 🔧 v3.19.1: Защита от дублирующихся событий fetchDays
        const lastProcessedEventRef = React.useRef({ date: null, source: null, timestamp: 0 });

        React.useEffect(() => {
            const handleDayUpdated = (e) => {
                const updatedDate = e.detail?.date;
                const source = e.detail?.source || 'unknown';
                const forceReload = e.detail?.forceReload || false;
                window.__heysPerfMark && window.__heysPerfMark('DayEffects: heys:day-updated (source=' + source + ', date=' + updatedDate + ')');

                // 🔧 v3.19.1: Дедупликация событий — игнорируем одинаковые события в течение 100мс
                const now = Date.now();
                const last = lastProcessedEventRef.current;
                if (source === 'fetchDays' &&
                    last.date === updatedDate &&
                    last.source === source &&
                    now - last.timestamp < 100) {
                    return; // Пропускаем дубликат
                }
                lastProcessedEventRef.current = { date: updatedDate, source, timestamp: now };

                // 🔒 Игнорируем события во время начальной синхронизации
                // doLocal() в конце синхронизации загрузит все финальные данные
                if (isSyncingRef.current && (source === 'cloud' || source === 'merge')) {
                    return;
                }

                // 🔧 v4.9.0: Определяем внешние источники (cloud sync)
                const externalSources = ['cloud', 'cloud-sync', 'merge', 'fetchDays'];
                const isExternalSource = externalSources.includes(source);

                // 🔒 Блокируем ЛЮБЫЕ внешние обновления (включая forceReload)
                // на 3 секунды после локального изменения
                if (isExternalSource && Date.now() < blockCloudUpdatesUntilRef.current) {
                    console.info('[HEYS.day] 🔒 External update blocked', {
                        source,
                        forceReload,
                        remainingMs: blockCloudUpdatesUntilRef.current - Date.now()
                    });
                    return;
                }

                // Для внутренних источников (step-modal, training-step, morning-checkin)
                // forceReload обходит блокировку как раньше
                if (!isExternalSource && !forceReload && Date.now() < blockCloudUpdatesUntilRef.current) {
                    console.info('[HEYS.day] 🔒 Internal update blocked (no forceReload)');
                    return;
                }

                // Если date не указан или совпадает с текущим — перезагружаем
                if (!updatedDate || updatedDate === date) {
                    const profNow = getProfile();
                    const key = 'heys_dayv2_' + date;
                    HEYS?.store?.invalidate?.(key);
                    const v = lsGet(key, null);
                    if (v && v.date) {
                        const storageMeaningful = isMeaningfulDayData(v);
                        // Проверяем: данные из storage новее текущих?
                        const storageUpdatedAt = v.updatedAt || 0;
                        const currentUpdatedAt = lastLoadedUpdatedAtRef.current || 0;

                        // Двойная защита: по timestamp И по количеству meals
                        // Не откатываем если в storage меньше meals чем в текущем state
                        const storageMealsCount = (v.meals || []).length;
                        const isStaleStorage = storageUpdatedAt < currentUpdatedAt;

                        // Пропускаем проверку timestamp если forceReload
                        // ВАЖНО: используем < вместо <= чтобы обрабатывать первую загрузку (когда оба = 0)
                        if (!forceReload && isStaleStorage) {
                            console.info('[HEYS.day] ⏭️ Day update skipped (stale storage)', {
                                source,
                                updatedDate,
                                storageUpdatedAt,
                                currentUpdatedAt
                            });
                            return; // Не перезаписываем более новые данные старыми
                        }
                        const migratedTrainings = normalizeTrainings(v.trainings);
                        const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
                        const migratedDay = { ...v, trainings: cleanedTrainings };
                        // Сохраняем миграцию ТОЛЬКО если данные изменились
                        const trainingsChanged = JSON.stringify(v.trainings) !== JSON.stringify(cleanedTrainings);
                        if (trainingsChanged) {
                            lsSet(key, migratedDay);
                        }
                        const newDay = ensureDay(migratedDay, profNow);

                        // 🔒 Оптимизация: не вызываем setDay если контент идентичен (предотвращает мерцание)
                        setDay(prevDay => {
                            if (!storageMeaningful && isMeaningfulDayData(prevDay)) {
                                return prevDay;
                            }
                            const prevMealsCount = (prevDay?.meals || []).length;
                            const shouldSkipOverwrite = isStaleStorage && storageMealsCount < prevMealsCount;
                            if (shouldSkipOverwrite) {
                                console.warn('[HEYS.day] 🛡️ Skip overwrite (stale + meals down)', {
                                    source,
                                    updatedDate,
                                    storageUpdatedAt,
                                    currentUpdatedAt,
                                    prevMealsCount,
                                    storageMealsCount,
                                    forceReload
                                });
                                return prevDay;
                            }

                            // Обновляем ref только если приняли данные из storage
                            lastLoadedUpdatedAtRef.current = storageUpdatedAt;

                            if (prevDay && prevDay.date === newDay.date) {
                                const prevMealsJson = JSON.stringify(prevDay.meals || []);
                                const newMealsJson = JSON.stringify(newDay.meals || []);
                                const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
                                const newTrainingsJson = JSON.stringify(newDay.trainings || []);
                                const prevSupplementsPlanned = JSON.stringify(prevDay.supplementsPlanned || []);
                                const newSupplementsPlanned = JSON.stringify(newDay.supplementsPlanned || []);
                                const prevSupplementsTaken = JSON.stringify(prevDay.supplementsTaken || []);
                                const newSupplementsTaken = JSON.stringify(newDay.supplementsTaken || []);

                                const isSameContent =
                                    prevMealsJson === newMealsJson &&
                                    prevTrainingsJson === newTrainingsJson &&
                                    prevDay.waterMl === newDay.waterMl &&
                                    prevDay.steps === newDay.steps &&
                                    prevDay.weightMorning === newDay.weightMorning &&
                                    // Утренние оценки из чек-ина
                                    prevDay.moodMorning === newDay.moodMorning &&
                                    prevDay.wellbeingMorning === newDay.wellbeingMorning &&
                                    prevDay.stressMorning === newDay.stressMorning &&
                                    // Витамины/добавки
                                    prevSupplementsPlanned === newSupplementsPlanned &&
                                    prevSupplementsTaken === newSupplementsTaken;

                                if (isSameContent) {
                                    return prevDay;
                                }
                            }
                            return newDay;
                        });
                    }
                }
            };

            // Слушаем явное событие обновления дня (от StepModal, Morning Check-in)
            global.addEventListener('heys:day-updated', handleDayUpdated);

            return () => {
                global.removeEventListener('heys:day-updated', handleDayUpdated);
            };
        }, [date]);

        // 🆕 v4.8.0: Listen for product rename cascade updates
        // When product is renamed, meal item names are updated in localStorage
        // This effect reloads current day's data to show updated names
        React.useEffect(() => {
            const handleMealsUpdated = (e) => {
                const { reason, productId, oldName, newName } = e.detail || {};
                if (reason !== 'product-rename') return;

                // Reload current day data from localStorage
                const profNow = getProfile();
                const key = 'heys_dayv2_' + date;
                HEYS?.store?.invalidate?.(key);
                const v = lsGet(key, null);
                if (v && v.date) {
                    const newDay = ensureDay(v, profNow);
                    setDay(newDay);
                    window.DEV?.log?.(`[DAY_EFFECTS] Reloaded day after product rename: "${oldName}" → "${newName}"`);
                }
            };

            global.addEventListener('heys:meals-updated', handleMealsUpdated);
            return () => global.removeEventListener('heys:meals-updated', handleMealsUpdated);
        }, [date]);
    }

    function useDayBootEffects() {
        const React = getReact();
        // Twemoji: reparse emoji on mount only (subsequent reparses handled by useTwemojiEffect on tab change)
        React.useEffect(() => {
            if (global.scheduleTwemojiParse) global.scheduleTwemojiParse();
        }, []); // eslint-disable-line react-hooks/exhaustive-deps

        // Трекинг просмотра дня (только один раз)
        React.useEffect(() => {
            if (global.HEYS && global.HEYS.analytics) {
                global.HEYS.analytics.trackDataOperation('day-viewed');
            }
        }, []);
    }

    function useDayCurrentMinuteEffect(deps) {
        const React = getReact();
        const { setCurrentMinute } = deps || {};
        React.useEffect(() => {
            const intervalId = setInterval(() => {
                setCurrentMinute(Math.floor(Date.now() / 60000));
            }, 60000); // Обновляем каждую минуту
            return () => clearInterval(intervalId);
        }, []);
    }

    function useDayThemeEffect(deps) {
        const React = getReact();
        const { theme, resolvedTheme } = deps || {};
        React.useEffect(() => {
            document.documentElement.setAttribute('data-theme', resolvedTheme);
            try {
                const U = global.HEYS?.utils || {};
                U.lsSet ? U.lsSet('heys_theme', theme) : localStorage.setItem('heys_theme', theme);
            } catch (e) {
                // QuotaExceeded — игнорируем, тема применится через data-theme
            }

            if (theme !== 'auto') return;

            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => {
                document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
            };
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }, [theme, resolvedTheme]);
    }

    function useDayExportsEffects(deps) {
        const React = getReact();
        const {
            currentStreak,
            addMeal,
            addWater,
            addProductToMeal,
            day,
            pIndex,
            getMealType,
            getMealQualityScore,
            safeMeals
        } = deps || {};

        // Экспорт getStreak для использования в gamification модуле
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.getStreak = () => currentStreak;

            // Dispatch событие чтобы GamificationBar мог обновить streak
            window.dispatchEvent(new CustomEvent('heysDayStreakUpdated', {
                detail: { streak: currentStreak }
            }));

            // ✅ Проверяем streak-достижения при каждом обновлении streak
            // 🔒 v4.0: Не выдаём ачивки во время loading phase
            if (HEYS.game?.checkStreakAchievements && !HEYS.game?.isLoadingPhase) {
                HEYS.game.checkStreakAchievements(currentStreak);
            }

            // Confetti при streak 3, 5, 7
            // 🔒 v4.0: Не показываем конфетти при загрузке
            if ([3, 5, 7].includes(currentStreak) && HEYS.game && HEYS.game.celebrate && !HEYS.game?.isLoadingPhase) {
                HEYS.game.celebrate();
            }

            return () => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                    delete HEYS.Day.getStreak;
                }
            };
        }, [currentStreak]);

        // Экспорт addMeal для PWA shortcuts и внешних вызовов
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addMeal = addMeal;
            return () => {
                if (HEYS.Day && HEYS.Day.addMeal === addMeal) {
                    delete HEYS.Day.addMeal;
                }
            };
        }, [addMeal]);

        // Экспорт addWater для внешних вызовов (например, FAB на вкладке Виджеты)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addWater = addWater;
            return () => {
                if (HEYS.Day && HEYS.Day.addWater === addWater) {
                    delete HEYS.Day.addWater;
                }
            };
        }, [addWater]);

        // Экспорт addProductToMeal как публичный API
        // Позволяет добавлять продукт в приём извне: HEYS.Day.addProductToMeal(mealIndex, product, grams?)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addProductToMeal = (mi, product, grams) => {
                // Валидация
                if (typeof mi !== 'number' || mi < 0) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid meal index:', mi);
                    return false;
                }
                if (!product || !product.name) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid product:', product);
                    return false;
                }
                // Добавляем продукт
                const productWithGrams = grams ? { ...product, grams } : product;
                addProductToMeal(mi, productWithGrams);
                return true;
            };
            return () => {
                if (HEYS.Day) delete HEYS.Day.addProductToMeal;
            };
        }, [addProductToMeal]);

        // Экспорт getMealQualityScore и getMealType как публичный API для advice модуля
        // getMealTypeByMeal — wrapper с текущим контекстом (meals и pIndex)
        React.useEffect(() => {
            HEYS.getMealQualityScore = getMealQualityScore;
            // Wrapper: принимает meal объект, находит его индекс и вызывает с полным контекстом
            HEYS.getMealType = (meal) => {
                if (!meal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                const allMeals = day.meals || [];
                // Если передали только time (string), находим meal по времени
                if (typeof meal === 'string') {
                    const foundMeal = allMeals.find(m => m.time === meal);
                    if (!foundMeal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                    const idx = allMeals.indexOf(foundMeal);
                    return getMealType(idx, foundMeal, allMeals, pIndex);
                }
                // Если передали meal объект
                const idx = allMeals.findIndex(m => m.id === meal.id || m.time === meal.time);
                if (idx === -1) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                return getMealType(idx, meal, allMeals, pIndex);
            };
            return () => {
                delete HEYS.getMealQualityScore;
                delete HEYS.getMealType;
            };
        }, [safeMeals, pIndex]);
    }

    HEYS.dayEffects = {
        useDaySyncEffects,
        useDayBootEffects,
        useDayCurrentMinuteEffect,
        useDayThemeEffect,
        useDayExportsEffects
    };

})(window);
