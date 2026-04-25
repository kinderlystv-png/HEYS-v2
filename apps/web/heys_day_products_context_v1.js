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

        // 🚀 PERF: Compute candidate array first, then stabilize by signature.
        // When AppRoot re-renders due to sync indicator state changes, setProducts() may have been
        // called with a new array reference containing identical data (hot-sync refreshes same
        // 364 products). Without stabilization sparklineData recomputes on every sync event (~333ms).
        // Strategy: compute signature of candidate → if identical to previous, keep old stable ref.
        const _candidateProducts = React.useMemo(() => {
            if (localProductsOverride && localProductsOverride.length > 0) return localProductsOverride;
            if (safePropsProducts.length > 0) return safePropsProducts;
            const fromStore = ctx.products?.getAll?.() || [];
            if (Array.isArray(fromStore) && fromStore.length > 0) return fromStore;
            const U = ctx.utils || {};
            const lsData = U.lsGet?.('heys_products', []) || [];
            return Array.isArray(lsData) ? lsData : [];
        }, [safePropsProducts, localProductsOverride]);

        const _candidateSig = React.useMemo(() => productsSignature(_candidateProducts), [_candidateProducts]);

        // Stable ref: only updates when content actually changes (sig differs)
        const _stableProductsRef = React.useRef(_candidateProducts);
        const _stableSigRef = React.useRef(_candidateSig);
        if (_candidateSig !== _stableSigRef.current) {
            _stableProductsRef.current = _candidateProducts;
            _stableSigRef.current = _candidateSig;
        }
        const products = _stableProductsRef.current;

        const prodSig = _candidateSig;
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
