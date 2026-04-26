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
        const { useState, useEffect, useRef } = React;
        const [activeDays, setActiveDays] = useState(function () { return new Map(); });
        // cancellation token — each effect invocation gets its own object reference
        const tokenRef = useRef(null);

        useEffect(function () {
            var token = {};
            tokenRef.current = token;

            var readStoredValue = function (key, fallback) {
                try {
                    var value;
                    if (window.HEYS && window.HEYS.store && window.HEYS.store.get) {
                        value = window.HEYS.store.get(key, fallback);
                    } else if (U && U.lsGet) {
                        value = U.lsGet(key, fallback);
                    } else {
                        value = localStorage.getItem(key);
                    }
                    if (value == null) return fallback;
                    if (typeof value === 'string') {
                        if (value.startsWith('¤Z¤') && window.HEYS && window.HEYS.store && window.HEYS.store.decompress) {
                            try { value = window.HEYS.store.decompress(value.slice(3)); } catch (e) { }
                        }
                        try { return JSON.parse(value); } catch (e) { return value; }
                    }
                    return value;
                } catch (e) {
                    return fallback;
                }
            };

            // Early-out for clearly not-ready states — no timer needed
            if (isInitializing || !clientId) {
                setActiveDays(function () { return new Map(); });
                return;
            }

            // Defer the 30-day LS scan outside the React Scheduler message handler.
            // Calendar dots are cosmetic — 1-frame latency is invisible to the user.
            var timerId = setTimeout(function () {
                if (tokenRef.current !== token) return; // stale effect, abort

                try {
                    var effectiveProducts = (products && products.length > 0) ? products
                        : ((window.HEYS && window.HEYS.products && window.HEYS.products.getAll) ? window.HEYS.products.getAll() : []).length > 0
                            ? window.HEYS.products.getAll()
                            : (readStoredValue('heys_products', []) || []);

                    if (effectiveProducts.length === 0) {
                        if (tokenRef.current === token) setActiveDays(function () { return new Map(); });
                        return;
                    }

                    var getActiveDaysForMonth = window.HEYS && window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
                    if (!getActiveDaysForMonth) {
                        if (tokenRef.current === token) setActiveDays(function () { return new Map(); });
                        return;
                    }

                    var profile = readStoredValue('heys_profile', {});
                    var parts = selectedDate.split('-');
                    var year = parseInt(parts[0], 10);
                    var month = parseInt(parts[1], 10) - 1;

                    var result = getActiveDaysForMonth(year, month, profile, effectiveProducts);
                    window.console.info('[HEYS.calendar] 🗓️ useDatePickerActiveDays пересчёт: calendarVer=' + calendarVer + ' month=' + (month + 1) + ' activeDays=' + ((result && result.size) || 0) + ' products=' + effectiveProducts.length);

                    // 🔍 ДИАГНОСТИКА: Gated behind `calendar_diag` flag (plan gleaming-pondering-dewdrop.md).
                    var _diagEnabled = window.HEYS && window.HEYS.flags && window.HEYS.flags.isEnabled && window.HEYS.flags.isEnabled('calendar_diag');
                    if (_diagEnabled) try {
                        var cid = clientId || (window.HEYS && window.HEYS.currentClientId) || '';
                        var cidShort = cid ? cid.slice(0, 8) : 'none';
                        var daysInMonth = new Date(year, month + 1, 0).getDate();
                        var missingDays = [];
                        var lsDayCount = 0;
                        var lsNullCount = 0;
                        for (var d = 1; d <= daysInMonth; d++) {
                            var dd = String(d).padStart(2, '0');
                            var mm = String(month + 1).padStart(2, '0');
                            var dateStr = year + '-' + mm + '-' + dd;
                            var lsKey = cid ? ('heys_' + cid + '_dayv2_' + dateStr) : ('heys_dayv2_' + dateStr);
                            var lsVal = localStorage.getItem(lsKey);
                            if (lsVal) {
                                if (lsVal === 'null' || lsVal === 'undefined') {
                                    lsNullCount++;
                                    if (!result.has(dateStr)) missingDays.push(dateStr + '(null_value)');
                                    continue;
                                }
                                lsDayCount++;
                                if (!result.has(dateStr)) {
                                    var reason = '?';
                                    try {
                                        if (lsVal.startsWith('¤Z¤')) {
                                            var decomp = window.HEYS && window.HEYS.store && window.HEYS.store.decompress;
                                            if (decomp) {
                                                var parsed = decomp(lsVal.slice(3));
                                                reason = 'compressed meals=' + ((parsed && parsed.meals) || []).length + ' items=' + ((parsed && parsed.meals) || []).reduce(function (s, m) { return s + ((m && m.items) || []).length; }, 0);
                                            } else { reason = 'compressed_no_decompress'; }
                                        } else {
                                            var parsed2 = JSON.parse(lsVal);
                                            reason = parsed2 == null ? 'parsed_to_null' : 'meals=' + ((parsed2 && parsed2.meals) || []).length + ' items=' + ((parsed2 && parsed2.meals) || []).reduce(function (s, m) { return s + ((m && m.items) || []).length; }, 0);
                                        }
                                    } catch (pe) { reason = 'parse_error: ' + ((pe.message || '').slice(0, 50)); }
                                    missingDays.push(dateStr + '(' + reason + ')');
                                }
                            }
                        }
                        window.console.info('[HEYS.calendar] 📊 localStorage dayv2: ' + lsDayCount + ' keys' + (lsNullCount > 0 ? ', nulls=' + lsNullCount : '') + ', activeDays=' + ((result && result.size) || 0) + ', calendarVer=' + calendarVer);
                        if (missingDays.length > 0) {
                            window.console.warn('[HEYS.calendar] ⚠️ ПРОПУЩЕННЫЕ ДНИ: В localStorage=' + lsDayCount + ' в результате=' + result.size + ' пропущено=' + missingDays.length + ' productsCount=' + effectiveProducts.length + ' clientId=' + cidShort + '\n  → ' + missingDays.join(', '));
                        }
                    } catch (_diagErr) {
                        window.console.warn('[HEYS.calendar] diag error:', _diagErr && _diagErr.message);
                    }

                    if (tokenRef.current === token) setActiveDays(function () { return result || new Map(); });
                } catch (e) {
                    window.console.info('[HEYS.calendar] ❌ useDatePickerActiveDays ошибка:', e && e.message);
                    if (tokenRef.current === token) setActiveDays(function () { return new Map(); });
                }
            }, 0);

            return function () {
                tokenRef.current = null;
                clearTimeout(timerId);
            };
        }, [selectedDate, clientId, products, isInitializing, calendarVer, U]);

        return activeDays;
    };
})();
