// heys_app_date_state_v1.js — date selection + calendar active days state

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppDateState = HEYS.AppDateState || {};

    const getTodayISO = () => {
        const d = new Date();
        const hour = d.getHours();
        if (hour < 3) {
            d.setDate(d.getDate() - 1);
        }
        return d.getFullYear()
            + '-' + String(d.getMonth() + 1).padStart(2, '0')
            + '-' + String(d.getDate()).padStart(2, '0');
    };

    HEYS.AppDateState.useDateSelectionState = function ({ React }) {
        const { useState } = React;
        const [selectedDate, setSelectedDate] = useState(getTodayISO());
        return { todayISO: getTodayISO, selectedDate, setSelectedDate };
    };

    HEYS.AppDateState.useDatePickerActiveDays = function ({
        React,
        selectedDate,
        clientId,
        products,
        isInitializing,
        calendarVer,
        U,
    }) {
        const { useMemo } = React;
        return useMemo(() => {
            const readStoredValue = (key, fallback) => {
                try {
                    let value;
                    if (window.HEYS?.store?.get) {
                        value = window.HEYS.store.get(key, fallback);
                    } else if (U?.lsGet) {
                        value = U.lsGet(key, fallback);
                    } else {
                        value = localStorage.getItem(key);
                    }

                    if (value == null) return fallback;

                    if (typeof value === 'string') {
                        if (value.startsWith('¤Z¤') && window.HEYS?.store?.decompress) {
                            try {
                                value = window.HEYS.store.decompress(value.slice(3));
                            } catch (e) { }
                        }
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                            return value;
                        }
                    }

                    return value;
                } catch (e) {
                    return fallback;
                }
            };

            // Fallback chain для products: props → HEYS.products.getAll() → localStorage
            const effectiveProducts = (products && products.length > 0) ? products
                : (window.HEYS.products?.getAll?.() || [])
                    .length > 0 ? window.HEYS.products.getAll()
                    : (readStoredValue('heys_products', []) || []);

            // Не вычисляем пока идёт инициализация или нет продуктов
            if (isInitializing || effectiveProducts.length === 0) {
                return new Map();
            }

            const getActiveDaysForMonth = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
            if (!getActiveDaysForMonth || !clientId) {
                return new Map();
            }

            // Получаем profile из localStorage
            const profile = readStoredValue('heys_profile', {});

            // Парсим selectedDate для определения месяца
            const parts = selectedDate.split('-');
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed

            try {
                // Передаём effectiveProducts (с fallback) в функцию
                const result = getActiveDaysForMonth(year, month, profile, effectiveProducts);
                window.console.info('[HEYS.calendar] 🗓️ useDatePickerActiveDays пересчёт: calendarVer=' + calendarVer + ' month=' + (month + 1) + ' activeDays=' + (result?.size || 0) + ' products=' + effectiveProducts.length);

                // 🔍 ДИАГНОСТИКА: Сравниваем результат с localStorage напрямую.
                // Gated behind `calendar_diag` flag — full 30-day decompress+parse loop costs
                // 200-400ms per dep change. Default off in prod (plan gleaming-pondering-dewdrop.md).
                const _diagEnabled = window.HEYS?.flags?.isEnabled?.('calendar_diag');
                if (_diagEnabled) try {
                    const cid = clientId || window.HEYS?.currentClientId || '';
                    const cidShort = cid ? cid.slice(0, 8) : 'none';
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const missingDays = [];
                    let lsDayCount = 0;
                    let lsNullCount = 0;

                    for (let d = 1; d <= daysInMonth; d++) {
                        const dd = String(d).padStart(2, '0');
                        const mm = String(month + 1).padStart(2, '0');
                        const dateStr = year + '-' + mm + '-' + dd;
                        const lsKey = cid ? ('heys_' + cid + '_dayv2_' + dateStr) : ('heys_dayv2_' + dateStr);
                        const lsVal = localStorage.getItem(lsKey);

                        if (lsVal) {
                            // Проверяем на "null"/"undefined" значения (баг cloud sync)
                            if (lsVal === 'null' || lsVal === 'undefined') {
                                lsNullCount++;
                                if (!result.has(dateStr)) {
                                    missingDays.push(dateStr + '(null_value)');
                                }
                                continue;
                            }

                            lsDayCount++;
                            if (!result.has(dateStr)) {
                                // День есть в localStorage но НЕТ в результате!
                                let reason = '?';
                                try {
                                    let valStr = lsVal;
                                    // Обработка сжатых данных
                                    if (valStr.startsWith('¤Z¤')) {
                                        const decomp = window.HEYS?.store?.decompress;
                                        if (decomp) {
                                            const parsed = decomp(valStr.slice(3));
                                            const mealsCount = (parsed?.meals || []).length;
                                            const itemsCount = (parsed?.meals || []).reduce((s, m) => s + ((m && m.items) || []).length, 0);
                                            reason = 'compressed meals=' + mealsCount + ' items=' + itemsCount;
                                        } else {
                                            reason = 'compressed_no_decompress';
                                        }
                                    } else {
                                        const parsed = JSON.parse(valStr);
                                        if (parsed == null) {
                                            reason = 'parsed_to_null';
                                        } else {
                                            const mealsCount = (parsed?.meals || []).length;
                                            const itemsCount = (parsed?.meals || []).reduce((s, m) => s + ((m && m.items) || []).length, 0);
                                            reason = 'meals=' + mealsCount + ' items=' + itemsCount;
                                        }
                                    }
                                } catch (pe) {
                                    reason = 'parse_error: ' + (pe.message || '').slice(0, 50);
                                }
                                missingDays.push(dateStr + '(' + reason + ')');
                            }
                        }
                    }

                    // Всегда логируем localStorage count для диагностики
                    window.console.info('[HEYS.calendar] 📊 localStorage dayv2: ' + lsDayCount + ' keys'
                        + (lsNullCount > 0 ? ', nulls=' + lsNullCount : '')
                        + ', activeDays=' + (result?.size || 0)
                        + ', calendarVer=' + calendarVer);

                    if (missingDays.length > 0) {
                        window.console.warn('[HEYS.calendar] ⚠️ ПРОПУЩЕННЫЕ ДНИ: В localStorage=' + lsDayCount
                            + ' в результате=' + result.size + ' пропущено=' + missingDays.length
                            + ' productsCount=' + effectiveProducts.length
                            + ' clientId=' + cidShort
                            + '\n  → ' + missingDays.join(', '));
                    }
                } catch (_diagErr) {
                    window.console.warn('[HEYS.calendar] diag error:', _diagErr?.message);
                }

                return result;
            } catch (e) {
                // Тихий fallback — activeDays для календаря не критичны
                window.console.info('[HEYS.calendar] ❌ useDatePickerActiveDays ошибка:', e?.message);
                return new Map();
            }
        }, [selectedDate, clientId, products, isInitializing, calendarVer, U]);
    };
})();
