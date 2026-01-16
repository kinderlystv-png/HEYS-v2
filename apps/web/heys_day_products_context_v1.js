// heys_day_products_context_v1.js — products fallback + index context

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useProductsContext(params) {
        const { React, propsProducts, productsSignature, buildProductIndex, HEYS: HEYSRef } = params || {};
        if (!React) return { products: [], prodSig: '', pIndex: { byId: new Map(), byName: new Map() } };

        const ctx = HEYSRef || HEYS;
        const safePropsProducts = Array.isArray(propsProducts) ? propsProducts : [];

        const products = React.useMemo(() => {
            if (safePropsProducts.length > 0) return safePropsProducts;
            // Fallback: берём из глобального хранилища
            const fromStore = ctx.products?.getAll?.() || [];
            if (Array.isArray(fromStore) && fromStore.length > 0) return fromStore;
            // Последний fallback: из localStorage напрямую
            const U = ctx.utils || {};
            const lsData = U.lsGet?.('heys_products', []) || [];
            return Array.isArray(lsData) ? lsData : [];
        }, [safePropsProducts]);

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
