// heys_day_orphan_state_v1.js — orphan products state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useOrphanState(params) {
        const { React, day, HEYS: HEYSRef } = params || {};
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

        const orphanCount = React.useMemo(() => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            void orphanVersion; // Зависимость для пересчёта
            return ctx?.orphanProducts?.count?.() || 0;
        }, [orphanVersion, day?.meals]);

        return { orphanCount };
    }

    HEYS.dayOrphanState = {
        useOrphanState
    };
})(window);
