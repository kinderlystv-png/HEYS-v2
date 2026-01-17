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
            // Fallback chain для products: props → HEYS.products.getAll() → localStorage
            const effectiveProducts = (products && products.length > 0) ? products
                : (window.HEYS.products?.getAll?.() || [])
                    .length > 0 ? window.HEYS.products.getAll()
                    : (U?.lsGet?.('heys_products', []) || []);

            // Не вычисляем пока идёт инициализация или нет продуктов
            if (isInitializing || effectiveProducts.length === 0) {
                return new Map();
            }

            const getActiveDaysForMonth = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
            if (!getActiveDaysForMonth || !clientId) {
                return new Map();
            }

            // Получаем profile из localStorage
            const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};

            // Парсим selectedDate для определения месяца
            const parts = selectedDate.split('-');
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed

            try {
                // Передаём effectiveProducts (с fallback) в функцию
                return getActiveDaysForMonth(year, month, profile, effectiveProducts);
            } catch (e) {
                // Тихий fallback — activeDays для календаря не критичны
                return new Map();
            }
        }, [selectedDate, clientId, products, isInitializing, calendarVer, U]);
    };
})();
