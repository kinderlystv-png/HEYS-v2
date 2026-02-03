// heys_day_products_context_v1.js — products fallback + index context

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useProductsContext(params) {
        const { React, propsProducts, productsSignature, buildProductIndex, HEYS: HEYSRef } = params || {};
        if (!React) return { products: [], prodSig: '', pIndex: { byId: new Map(), byName: new Map() } };

        const ctx = HEYSRef || HEYS;
        const safePropsProducts = Array.isArray(propsProducts) ? propsProducts : [];

        // 🔧 FIX: Подписка на обновления локальных продуктов (порции и т.д.)
        // При обновлении локального продукта, перезагружаем products из localStorage
        const [localProductsOverride, setLocalProductsOverride] = React.useState(null);

        React.useEffect(() => {
            const handleLocalProductUpdated = (event) => {
                const detail = event?.detail || {};
                console.log('[useProductsContext] 🔄 Local product updated, forcing refresh', {
                    productId: detail.productId,
                    sharedId: detail.sharedId,
                    portionsCount: detail.portions?.length
                });

                // Загружаем свежие данные из localStorage
                const freshProducts = ctx.products?.getAll?.() || [];
                if (Array.isArray(freshProducts) && freshProducts.length > 0) {
                    setLocalProductsOverride([...freshProducts]); // Новый массив чтобы триггернуть React
                }
            };

            window.addEventListener('heys:local-product-updated', handleLocalProductUpdated);
            return () => window.removeEventListener('heys:local-product-updated', handleLocalProductUpdated);
        }, [ctx]);

        const products = React.useMemo(() => {
            // 🔧 FIX: Если есть override от event — используем его (самые свежие данные)
            if (localProductsOverride && localProductsOverride.length > 0) {
                return localProductsOverride;
            }
            if (safePropsProducts.length > 0) return safePropsProducts;
            // Fallback: берём из глобального хранилища
            const fromStore = ctx.products?.getAll?.() || [];
            if (Array.isArray(fromStore) && fromStore.length > 0) return fromStore;
            // Последний fallback: из localStorage напрямую
            const U = ctx.utils || {};
            const lsData = U.lsGet?.('heys_products', []) || [];
            return Array.isArray(lsData) ? lsData : [];
        }, [safePropsProducts, localProductsOverride]); // 🔧 FIX: добавлена зависимость от localProductsOverride

        const prodSig = React.useMemo(() => productsSignature(products), [products]);
        const pIndex = React.useMemo(() => buildProductIndex(products), [prodSig]);

        // Debug info (minimal)
        ctx.debug = ctx.debug || {};
        ctx.debug.dayProducts = products;
        ctx.debug.dayProductIndex = pIndex;

        return { products, prodSig, pIndex };
    }

    HEYS.dayProductsContext = {
        useProductsContext
    };
})(window);
