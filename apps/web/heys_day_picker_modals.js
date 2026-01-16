// heys_day_picker_modals.js — Picker modals state + helpers
// Phase 13B of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    if (!React) {
        throw new Error('[heys_day_picker_modals] React is required');
    }

    function usePickerModalsState(deps) {
        const {
            day,
            date,
            isMobile,
            setDay,
            expandOnlyMeal,
            sortMealsByTime,
            haptic,
            updateMealTimeRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            calculateDayAverages,
            U,
            pad2,
            uid,
            lsGet
        } = deps;

        if (!U) {
            throw new Error('[heys_day_picker_modals] dayUtils (U) is required');
        }

        const { useState, useMemo } = React;

        // === iOS-style Time Picker Modal (mobile only) ===
        const [showTimePicker, setShowTimePicker] = useState(false);
        const [pendingMealTime, setPendingMealTime] = useState({ hours: 12, minutes: 0 });
        const [editingMealIndex, setEditingMealIndex] = useState(null); // null = новый, число = редактирование
        const [editMode, setEditMode] = useState('new'); // 'new' | 'time' | 'mood'

        // === Training Picker Modal ===
        const [showTrainingPicker, setShowTrainingPicker] = useState(false);
        const [trainingPickerStep, setTrainingPickerStep] = useState(1); // 1 = тип+время, 2 = зоны, 3 = оценки
        const [editingTrainingIndex, setEditingTrainingIndex] = useState(null);
        const [pendingTrainingTime, setPendingTrainingTime] = useState({ hours: 10, minutes: 0 });
        const [pendingTrainingType, setPendingTrainingType] = useState('cardio');
        const [pendingTrainingZones, setPendingTrainingZones] = useState([0, 0, 0, 0]); // индексы для zoneMinutesValues
        const [pendingTrainingQuality, setPendingTrainingQuality] = useState(0); // 0-10
        const [pendingTrainingFeelAfter, setPendingTrainingFeelAfter] = useState(0); // 0-10
        const [pendingTrainingComment, setPendingTrainingComment] = useState('');

        // === Тренировки: количество видимых блоков ===
        const [visibleTrainings, setVisibleTrainings] = useState(() => {
            // Автоопределяем сколько тренировок показывать на основе данных
            const tr = day.trainings || [];
            const hasData = (t) => t && t.z && t.z.some(v => +v > 0);
            if (tr[2] && hasData(tr[2])) return 3;
            if (tr[1] && hasData(tr[1])) return 2;
            if (tr[0] && hasData(tr[0])) return 1;
            return 0; // Если нет тренировок — не показываем пустые блоки
        });

        // === Период графиков (7, 14, 30 дней) ===
        const [chartPeriod, setChartPeriod] = useState(7);
        const [chartTransitioning, setChartTransitioning] = useState(false);

        // Плавная смена периода с transition
        const handlePeriodChange = (period) => {
            if (chartPeriod !== period) {
                setChartTransitioning(true);
                if (typeof haptic === 'function') haptic('light');
                setTimeout(() => {
                    setChartPeriod(period);
                    setChartTransitioning(false);
                }, 150);
            }
        };

        // === Zone Minutes Picker Modal ===
        const [showZonePicker, setShowZonePicker] = useState(false);
        const [zonePickerTarget, setZonePickerTarget] = useState(null); // {trainingIndex, zoneIndex}
        const [pendingZoneMinutes, setPendingZoneMinutes] = useState(0);
        // Значения минут: 0-120
        const zoneMinutesValues = useMemo(() => Array.from({ length: 121 }, (_, i) => String(i)), []);

        // === Zone Formula Popup ===
        const [zoneFormulaPopup, setZoneFormulaPopup] = useState(null); // {ti, zi, x, y}

        // === Household Formula Popup ===
        const [householdFormulaPopup, setHouseholdFormulaPopup] = useState(null); // {hi, x, y}

        // === Sleep Quality Picker Modal ===
        const [showSleepQualityPicker, setShowSleepQualityPicker] = useState(false);
        const [pendingSleepQuality, setPendingSleepQuality] = useState(0);
        const [pendingSleepNote, setPendingSleepNote] = useState(''); // временный комментарий
        const sleepQualityValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);

        // === Day Score Picker Modal ===
        const [showDayScorePicker, setShowDayScorePicker] = useState(false);
        const [pendingDayScore, setPendingDayScore] = useState(0);
        const [pendingDayComment, setPendingDayComment] = useState(''); // временный комментарий
        const dayScoreValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);

        // === Weight/Deficit Picker flags (compat for uiState) ===
        const [showWeightPicker, setShowWeightPicker] = useState(false);
        const [showDeficitPicker, setShowDeficitPicker] = useState(false);

        // Используем глобальный WheelColumn
        const WheelColumn = HEYS.WheelColumn;

        // Типы тренировок для Training Picker Modal
        const trainingTypes = [
            { id: 'cardio', icon: '🏃', label: 'Кардио' },
            { id: 'strength', icon: '🏋️', label: 'Силовая' },
            { id: 'hobby', icon: '⚽', label: 'Активное хобби' }
        ];

        // Импортируем константы из dayUtils (единый источник правды)
        const NIGHT_HOUR_THRESHOLD = U.NIGHT_HOUR_THRESHOLD || 3;
        const HOURS_ORDER = U.HOURS_ORDER || (() => {
            const order = [];
            for (let h = 3; h < 24; h++) order.push(h);
            for (let h = 0; h < 3; h++) order.push(h);
            return order;
        })();

        // Значения для колеса (с подписями для ночных часов)
        const hoursValues = useMemo(() => {
            return HOURS_ORDER.map(h => pad2(h));
        }, [HOURS_ORDER, pad2]);

        // Конвертация: индекс колеса → реальные часы
        const wheelIndexToHour = U.wheelIndexToHour || ((idx) => HOURS_ORDER[idx] ?? idx);
        // Конвертация: реальные часы → индекс колеса
        const hourToWheelIndex = U.hourToWheelIndex || ((hour) => {
            const normalizedHour = hour >= 24 ? hour - 24 : hour;
            const idx = HOURS_ORDER.indexOf(normalizedHour);
            return idx >= 0 ? idx : 0;
        });

        // Проверка: выбранный час относится к ночным (00-02)
        const isNightHourSelected = useMemo(() => {
            const realHour = wheelIndexToHour(pendingMealTime.hours);
            return realHour >= 0 && realHour < NIGHT_HOUR_THRESHOLD;
        }, [pendingMealTime.hours, wheelIndexToHour, NIGHT_HOUR_THRESHOLD]);

        // Форматированная дата для отображения
        const currentDateLabel = useMemo(() => {
            const d = new Date(date);
            const dayNum = d.getDate();
            const month = d.toLocaleDateString('ru-RU', { month: 'short' });
            return `${dayNum} ${month}`;
        }, [date]);

        const minutesValues = WheelColumn?.presets?.minutes || [];
        const ratingValues = WheelColumn?.presets?.rating || [];

        // Состояние для второго слайда (самочувствие)
        const [pickerStep, setPickerStep] = useState(1); // 1 = время, 2 = самочувствие
        const [pendingMealMood, setPendingMealMood] = useState({ mood: 5, wellbeing: 5, stress: 5 });
        // Состояние для типа приёма в модалке создания
        const [pendingMealType, setPendingMealType] = useState(null); // null = авто

        // Направление анимации: 'forward' или 'back'
        const [animDirection, setAnimDirection] = useState('forward');

        // === Emoji анимация в рейтинг модалке ===
        const [emojiAnimating, setEmojiAnimating] = useState({ mood: '', wellbeing: '', stress: '' });

        // Helper: получить градиент цвета по оценке 1-10
        function getScoreGradient(score) {
            if (!score || score === 0) return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; // серый
            if (score <= 2) return 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)'; // красный
            if (score <= 4) return 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)'; // оранжевый
            if (score <= 5) return 'linear-gradient(135deg, #fef08a 0%, #fde047 100%)'; // жёлтый
            if (score <= 7) return 'linear-gradient(135deg, #d9f99d 0%, #bef264 100%)'; // лайм
            if (score <= 9) return 'linear-gradient(135deg, #bbf7d0 0%, #86efac 100%)'; // зелёный
            return 'linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%)'; // изумрудный (10)
        }

        function getScoreTextColor(score) {
            if (!score || score === 0) return '#9ca3af'; // серый
            if (score <= 2) return '#dc2626'; // красный
            if (score <= 4) return '#ea580c'; // оранжевый
            if (score <= 5) return '#ca8a04'; // жёлтый
            if (score <= 7) return '#65a30d'; // лайм
            if (score <= 9) return '#16a34a'; // зелёный
            return '#059669'; // изумрудный
        }

        // Helper: emoji по оценке 1-10
        function getScoreEmoji(score) {
            if (!score || score === 0) return '';
            if (score <= 2) return '😫';
            if (score <= 4) return '😕';
            if (score <= 5) return '😐';
            if (score <= 6) return '🙂';
            if (score <= 7) return '😊';
            if (score <= 8) return '😄';
            if (score <= 9) return '🤩';
            return '🌟'; // 10 = идеально
        }

        // Helper: получить данные вчера
        function getYesterdayData() {
            const yesterday = new Date(date);
            yesterday.setDate(yesterday.getDate() - 1);
            const yStr = yesterday.toISOString().split('T')[0];
            return lsGet('heys_dayv2_' + yStr, null);
        }

        // Helper: сравнение с вчера (↑ / ↓ / =)
        function getCompareArrow(todayVal, yesterdayVal) {
            if (!todayVal || !yesterdayVal) return null;
            const diff = todayVal - yesterdayVal;
            if (diff > 0) return { icon: '↑', diff: '+' + diff, color: '#16a34a' };
            if (diff < 0) return { icon: '↓', diff: String(diff), color: '#dc2626' };
            return { icon: '=', diff: '0', color: '#6b7280' };
        }

        // === Sleep Quality Picker functions ===
        function openSleepQualityPicker() {
            const currentQuality = day.sleepQuality || 0;
            // Находим индекс: 0='—', 1='1', 2='1.5', 3='2', ...
            const idx = currentQuality === 0 ? 0 : sleepQualityValues.indexOf(String(currentQuality));
            setPendingSleepQuality(idx >= 0 ? idx : 0);
            setShowSleepQualityPicker(true);
        }

        function confirmSleepQualityPicker() {
            const value = pendingSleepQuality === 0 ? 0 : parseInt(sleepQualityValues[pendingSleepQuality]);
            setDay(prevDay => {
                let newSleepNote = prevDay.sleepNote || '';
                if (pendingSleepNote.trim()) {
                    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    const entry = `[${time}] ${pendingSleepNote.trim()}`;
                    newSleepNote = newSleepNote ? newSleepNote + '\n' + entry : entry;
                }
                return { ...prevDay, sleepQuality: value, sleepNote: newSleepNote, updatedAt: Date.now() };
            });
            setPendingSleepNote('');
            setShowSleepQualityPicker(false);
        }

        function cancelSleepQualityPicker() {
            setPendingSleepNote('');
            setShowSleepQualityPicker(false);
        }

        // === Day Score Picker functions ===
        function openDayScorePicker() {
            const currentScore = day.dayScore || 0;
            const idx = currentScore === 0 ? 0 : dayScoreValues.indexOf(String(currentScore));
            setPendingDayScore(idx >= 0 ? idx : 0);
            setShowDayScorePicker(true);
        }

        function confirmDayScorePicker() {
            const value = pendingDayScore === 0 ? 0 : parseInt(dayScoreValues[pendingDayScore]);
            setDay(prevDay => {
                const autoScore = calculateDayAverages(prevDay.meals, prevDay.trainings, prevDay).dayScore;
                const isManual = value !== 0 && value !== autoScore;
                let newDayComment = prevDay.dayComment || '';
                if (pendingDayComment.trim()) {
                    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    const entry = `[${time}] ${pendingDayComment.trim()}`;
                    newDayComment = newDayComment ? newDayComment + '\n' + entry : entry;
                }
                return { ...prevDay, dayScore: value, dayScoreManual: isManual, dayComment: newDayComment, updatedAt: Date.now() };
            });
            setPendingDayComment('');
            setShowDayScorePicker(false);
        }

        function cancelDayScorePicker() {
            setPendingDayComment('');
            setShowDayScorePicker(false);
        }

        function goToMoodStep() {
            setAnimDirection('forward');
            setPickerStep(2);
        }

        function goBackToTimeStep() {
            setAnimDirection('back');
            setPickerStep(1);
        }

        // Открыть модалку для нового приёма
        function openTimePickerForNewMeal() {
            const now = new Date();
            // Конвертируем реальные часы в индекс колеса
            setPendingMealTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });

            // Оценки: если есть предыдущие приёмы — берём от последнего, иначе 5
            const meals = day.meals || [];
            if (meals.length > 0) {
                // Берём последний приём по времени (они отсортированы)
                const lastMeal = meals[meals.length - 1];
                setPendingMealMood({
                    mood: lastMeal.mood || 5,
                    wellbeing: lastMeal.wellbeing || 5,
                    stress: lastMeal.stress || 5
                });
            } else {
                // Первый приём в день — дефолт 5
                setPendingMealMood({ mood: 5, wellbeing: 5, stress: 5 });
            }

            setPendingMealType(null); // Сбрасываем на авто
            setEditingMealIndex(null);
            setEditMode('new');
            setPickerStep(1);
            setShowTimePicker(true);
        }

        // Открыть модалку для редактирования времени и типа (новая модульная)
        function openTimeEditor(mealIndex) {
            const meal = day.meals[mealIndex];
            if (!meal) return;

            // Используем новую модульную модалку если доступна
            if (isMobile && HEYS.MealStep?.showEditMeal) {
                HEYS.MealStep.showEditMeal({
                    meal,
                    mealIndex,
                    dateKey: date,
                    onComplete: ({ mealIndex: idx, time, mealType, name }) => {
                        // Обновляем приём
                        const newUpdatedAt = Date.now();
                        if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        setDay(prevDay => {
                            const updatedMeals = (prevDay.meals || []).map((m, i) =>
                                i === idx ? { ...m, time, mealType, name } : m
                            );
                            // Сортируем по времени
                            const sortedMeals = sortMealsByTime(updatedMeals);
                            return { ...prevDay, meals: sortedMeals, updatedAt: newUpdatedAt };
                        });

                        if (window.HEYS?.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-time-updated');
                        }
                        // Success toast
                        HEYS.Toast?.success('Приём сохранён');
                    }
                });
            } else {
                // Fallback на старую модалку
                const timeParts = (meal.time || '').split(':');
                const hours = parseInt(timeParts[0]) || new Date().getHours();
                const minutes = parseInt(timeParts[1]) || 0;

                // Конвертируем реальные часы в индекс колеса
                setPendingMealTime({ hours: hourToWheelIndex(hours), minutes });
                setEditingMealIndex(mealIndex);
                setEditMode('time');
                setPickerStep(1);
                setShowTimePicker(true);
            }
        }

        // Открыть модалку для редактирования только оценок
        function openMoodEditor(mealIndex) {
            const meal = day.meals[mealIndex];
            if (!meal) return;

            // Используем новую модульную модалку если доступна
            if (isMobile && HEYS.MealStep?.showEditMood) {
                HEYS.MealStep.showEditMood({
                    meal,
                    mealIndex,
                    dateKey: date,
                    onComplete: ({ mealIndex: idx, mood, wellbeing, stress, comment }) => {
                        // Обновляем приём
                        const newUpdatedAt = Date.now();
                        if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        setDay(prevDay => {
                            const updatedMeals = (prevDay.meals || []).map((m, i) =>
                                i === idx ? { ...m, mood, wellbeing, stress, comment } : m
                            );
                            return { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };
                        });

                        if (window.HEYS?.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-mood-updated');
                        }
                        // Success toast
                        HEYS.Toast?.success('Оценки сохранены');
                    }
                });
            } else {
                // Fallback на старую модалку
                setPendingMealMood({
                    mood: meal.mood ? ratingValues.indexOf(String(meal.mood)) : 5,
                    wellbeing: meal.wellbeing ? ratingValues.indexOf(String(meal.wellbeing)) : 5,
                    stress: meal.stress ? ratingValues.indexOf(String(meal.stress)) : 5
                });
                setEditingMealIndex(mealIndex);
                setEditMode('mood');
                setPickerStep(2);
                setShowTimePicker(true);
            }
        }

        // Подтверждение только времени (для редактирования)
        function confirmTimeEdit() {
            // Конвертируем индекс колеса в реальные часы
            let realHours = wheelIndexToHour(pendingMealTime.hours);
            // Ночные часы (00-02) записываем как 24-26
            if (realHours < NIGHT_HOUR_THRESHOLD) {
                realHours += 24;
            }
            const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
            // Используем функцию с автосортировкой
            const updateMealTime = updateMealTimeRef?.current;
            if (typeof updateMealTime === 'function') {
                updateMealTime(editingMealIndex, timeStr);
            }
            setShowTimePicker(false);
            setEditingMealIndex(null);
        }

        // Подтверждение только оценок (для редактирования)
        function confirmMoodEdit() {
            const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
            const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
            const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;
            setDay(prevDay => {
                const updatedMeals = (prevDay.meals || []).map((m, i) =>
                    i === editingMealIndex ? { ...m, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal } : m
                );
                return { ...prevDay, meals: updatedMeals, updatedAt: Date.now() };
            });
            setShowTimePicker(false);
            setEditingMealIndex(null);
        }

        function confirmMealCreation() {
            // Конвертируем индекс колеса в реальные часы
            let realHours = wheelIndexToHour(pendingMealTime.hours);
            // Ночные часы (00-02) записываем как 24-26
            if (realHours < NIGHT_HOUR_THRESHOLD) {
                realHours += 24;
            }
            const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
            const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
            const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
            const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;

            if (editingMealIndex !== null) {
                setDay(prevDay => {
                    const updatedMeals = (prevDay.meals || []).map((m, i) =>
                        i === editingMealIndex
                            ? { ...m, time: timeStr, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal }
                            : m
                    );
                    const sortedMeals = sortMealsByTime(updatedMeals);
                    return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
                });
            } else {
                // Создание нового
                const newMeal = {
                    id: uid('m_'),
                    name: 'Приём',
                    time: timeStr,
                    mood: moodVal,
                    wellbeing: wellbeingVal,
                    stress: stressVal,
                    items: []
                };
                let newIndex = -1;
                let newMealsLen = 0;
                setDay(prevDay => {
                    const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
                    newIndex = newMeals.findIndex(m => m.id === newMeal.id);
                    newMealsLen = newMeals.length;
                    return { ...prevDay, meals: newMeals, updatedAt: Date.now() };
                });
                expandOnlyMeal(newIndex >= 0 ? newIndex : Math.max(0, newMealsLen - 1));
            }

            setShowTimePicker(false);
            setPickerStep(1);
            setEditingMealIndex(null);
            if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation(editingMealIndex !== null ? 'meal-updated' : 'meal-created');
            }
        }

        function cancelTimePicker() {
            setShowTimePicker(false);
            setPickerStep(1);
            setEditingMealIndex(null);
            setEditMode('new');
        }

        return {
            // State for pickers
            showTimePicker,
            pendingMealTime,
            setPendingMealTime,
            editingMealIndex,
            editMode,
            showTrainingPicker,
            setShowTrainingPicker,
            trainingPickerStep,
            setTrainingPickerStep,
            editingTrainingIndex,
            setEditingTrainingIndex,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            visibleTrainings,
            setVisibleTrainings,
            chartPeriod,
            chartTransitioning,
            handlePeriodChange,
            showZonePicker,
            setShowZonePicker,
            zonePickerTarget,
            setZonePickerTarget,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            zoneMinutesValues,
            zoneFormulaPopup,
            setZoneFormulaPopup,
            householdFormulaPopup,
            setHouseholdFormulaPopup,
            showSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            dayScoreValues,
            showWeightPicker,
            setShowWeightPicker,
            showDeficitPicker,
            setShowDeficitPicker,
            pickerStep,
            animDirection,
            pendingMealMood,
            setPendingMealMood,
            pendingMealType,
            setPendingMealType,
            emojiAnimating,
            setEmojiAnimating,

            // Helpers
            getScoreGradient,
            getScoreTextColor,
            getScoreEmoji,
            getYesterdayData,
            getCompareArrow,

            // Picker data
            WheelColumn,
            trainingTypes,
            hoursValues,
            minutesValues,
            ratingValues,
            isNightHourSelected,
            currentDateLabel,
            wheelIndexToHour,
            hourToWheelIndex,

            // Actions
            openSleepQualityPicker,
            confirmSleepQualityPicker,
            cancelSleepQualityPicker,
            openDayScorePicker,
            confirmDayScorePicker,
            cancelDayScorePicker,
            openTimePickerForNewMeal,
            openTimeEditor,
            openMoodEditor,
            goToMoodStep,
            goBackToTimeStep,
            confirmTimeEdit,
            confirmMoodEdit,
            confirmMealCreation,
            cancelTimePicker
        };
    }

    HEYS.dayPickerModals = {
        usePickerModalsState
    };

})(window);
