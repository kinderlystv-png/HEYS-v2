// heys_day_edit_grams_state.js — edit grams modal state helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useEditGramsState(params) {
        const { React, haptic } = params || {};
        const { useState, useMemo, useRef } = React || {};

        const [editGramsTarget, setEditGramsTarget] = useState(null);
        const [editGramsValue, setEditGramsValue] = useState(100);
        const editGramsInputRef = useRef(null);

        const editPortions = useMemo(() => {
            if (!editGramsTarget?.product) return [];
            const product = editGramsTarget.product;
            if (product.portions?.length) return product.portions;
            const M = global.HEYS?.models;
            if (M?.getAutoPortions) {
                return M.getAutoPortions(product.name);
            }
            return [];
        }, [editGramsTarget?.product]);

        const editLastPortionGrams = useMemo(() => {
            if (!editGramsTarget?.product?.id) return null;
            const M = global.HEYS?.models;
            return M?.getLastPortion ? M.getLastPortion(editGramsTarget.product.id) : null;
        }, [editGramsTarget?.product?.id]);

        function handleEditGramsDrag(e) {
            e.preventDefault();
            const slider = e.currentTarget;
            const rect = slider.getBoundingClientRect();
            const minGrams = 10;
            const maxGrams = 500;

            const updateFromPosition = (clientX) => {
                const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
                const percent = x / rect.width;
                const grams = Math.round((minGrams + percent * (maxGrams - minGrams)) / 10) * 10;
                setEditGramsValue(Math.max(minGrams, Math.min(maxGrams, grams)));
                try { navigator.vibrate?.(3); } catch (e) { }
            };

            updateFromPosition(e.touches ? e.touches[0].clientX : e.clientX);

            const handleMove = (moveEvent) => {
                if (moveEvent.cancelable) moveEvent.preventDefault();
                updateFromPosition(moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX);
            };

            const handleEnd = () => {
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleEnd);
                document.removeEventListener('touchmove', handleMove);
                document.removeEventListener('touchend', handleEnd);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleEnd);
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleEnd);
        }

        return {
            editGramsTarget,
            setEditGramsTarget,
            editGramsValue,
            setEditGramsValue,
            editGramsInputRef,
            editPortions,
            editLastPortionGrams,
            handleEditGramsDrag
        };
    }

    HEYS.dayEditGramsState = {
        useEditGramsState
    };
})(window);
