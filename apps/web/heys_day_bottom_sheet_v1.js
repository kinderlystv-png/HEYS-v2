// heys_day_bottom_sheet_v1.js — BottomSheet swipe handlers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useBottomSheetHandlers(params) {
        const { React, haptic } = params || {};
        if (!React) {
            return {
                bottomSheetRef: { current: null },
                handleSheetTouchStart: () => { },
                handleSheetTouchMove: () => { },
                handleSheetTouchEnd: () => { }
            };
        }

        const bottomSheetRef = React.useRef(null);
        const sheetDragY = React.useRef(0);
        const sheetStartY = React.useRef(0);
        const isSheetDragging = React.useRef(false);

        const handleSheetTouchStart = (e) => {
            sheetStartY.current = e.touches[0].clientY;
            isSheetDragging.current = true;
            sheetDragY.current = 0;
        };

        const handleSheetTouchMove = (e) => {
            if (!isSheetDragging.current) return;
            const diff = e.touches[0].clientY - sheetStartY.current;
            if (diff > 0) {
                sheetDragY.current = diff;
                if (bottomSheetRef.current) {
                    bottomSheetRef.current.style.transform = `translateY(${diff}px)`;
                }
            }
        };

        const handleSheetTouchEnd = (closeCallback) => {
            if (!isSheetDragging.current) return;
            isSheetDragging.current = false;

            if (sheetDragY.current > 100) {
                // Закрываем если свайпнули > 100px
                haptic && haptic('light');
                if (bottomSheetRef.current) {
                    bottomSheetRef.current.classList.add('closing');
                }
                setTimeout(() => closeCallback(), 200);
            } else {
                // Возвращаем на место
                if (bottomSheetRef.current) {
                    bottomSheetRef.current.style.transform = '';
                }
            }
            sheetDragY.current = 0;
        };

        return {
            bottomSheetRef,
            handleSheetTouchStart,
            handleSheetTouchMove,
            handleSheetTouchEnd
        };
    }

    HEYS.dayBottomSheet = {
        useBottomSheetHandlers
    };
})(window);
