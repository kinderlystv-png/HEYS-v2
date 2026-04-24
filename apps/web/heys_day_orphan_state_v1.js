// heys_day_orphan_state_v1.js — orphan products state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useOrphanState(params) {
        const { React, day, date, HEYS: HEYSRef } = params || {};
        if (!React) return { orphanCount: 0 };

        const ctx = HEYSRef || HEYS;

        const [orphanVersion, setOrphanVersion] = React.useState(0);

        React.useEffect(() => {
            const handleOrphanUpdated = () => {
                setOrphanVersion(v => v + 1);
            };
            window.addEventListener('heys:orphan-updated', handleOrphanUpdated);
            // Также слушаем heysProductsUpdated — когда продукты обновились
            const handleProductsUpdated = () => {
                if (ctx?.orphanProducts?.recalculate) {
                    ctx.orphanProducts.recalculate();
                }
            };
            window.addEventListener('heysProductsUpdated', handleProductsUpdated);
            return () => {
                window.removeEventListener('heys:orphan-updated', handleOrphanUpdated);
                window.removeEventListener('heysProductsUpdated', handleProductsUpdated);
            };
        }, [ctx]);

        // После смены даты / загрузки приёмов пересчитываем карту сирот против актуального каталога
        // (иначе после restore на одном дне при переходе на другой снова всплывают ложные «не в базе»).
        React.useEffect(() => {
            if (!date || !day || day.date !== date) return;
            const id = window.requestAnimationFrame(() => {
                try {
                    if (ctx?.orphanProducts?.recalculate) {
                        ctx.orphanProducts.recalculate();
                    }
                } catch (_) { /* noop */ }
            });
            return () => window.cancelAnimationFrame(id);
        }, [date, day?.date, day?.meals, ctx]);

        const orphanCount = React.useMemo(() => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            void orphanVersion; // Зависимость для пересчёта
            // Только сироты текущего календарного дня — глобальная карта накапливает все отсканированные дни
            if (date && typeof ctx?.orphanProducts?.countForDate === 'function') {
                return ctx.orphanProducts.countForDate(date) || 0;
            }
            return ctx?.orphanProducts?.count?.() || 0;
        }, [orphanVersion, day?.meals, date, ctx]);

        return { orphanCount };
    }

    HEYS.dayOrphanState = {
        useOrphanState
    };
})(window);
