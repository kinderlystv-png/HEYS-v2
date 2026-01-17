// heys_app_swipe_nav_v1.js — Swipe navigation helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useSwipeNavigation = ({ React, tab, setTab }) => {
        // === SWIPE NAVIGATION ===
        // Свайп работает только между 4 вкладками переключателя (по кругу)
        // widgets исключаются из свайпа когда editMode активен (drag & drop)
        const SWIPEABLE_TABS = ['widgets', 'stats', 'diary', 'insights'];
        const touchRef = React.useRef({ startX: 0, startY: 0, startTime: 0 });
        const MIN_SWIPE_DISTANCE = 60;
        const MAX_SWIPE_TIME = 500; // ms — увеличено для более плавного свайпа

        // Slide animation state
        const [slideDirection, setSlideDirection] = React.useState(null); // 'left' | 'right' | null
        const [edgeBounce, setEdgeBounce] = React.useState(null); // 'left' | 'right' | null

        const onTouchStart = React.useCallback((e) => {
            // Игнорируем свайпы на интерактивных элементах, модалках, слайдерах и тостах
            const target = e.target;
            if (target.closest('input, textarea, select, button, .swipeable-container, table, .tab-switch-group, .advice-list-overlay, .macro-toast, .no-swipe-zone, [type="range"]')) {
                return;
            }
            // Защита от конфликта свайпа и drag & drop в режиме редактирования виджетов
            if (window.HEYS?.Widgets?.state?.isEditMode?.() || target.closest('.widgets-grid--editing')) {
                return;
            }
            const touch = e.touches[0];
            touchRef.current = {
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: Date.now()
            };
        }, []);

        const onTouchEnd = React.useCallback((e) => {
            if (!touchRef.current.startTime) return; // Не было валидного touchStart

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchRef.current.startX;
            const deltaY = touch.clientY - touchRef.current.startY;
            const deltaTime = Date.now() - touchRef.current.startTime;

            // Сбрасываем для следующего свайпа
            touchRef.current.startTime = 0;

            // Игнорируем если:
            // - свайп слишком медленный
            // - вертикальный скролл больше горизонтального
            // - расстояние слишком маленькое
            if (deltaTime > MAX_SWIPE_TIME) return;
            if (Math.abs(deltaY) > Math.abs(deltaX) * 0.7) return; // Более мягкое условие
            if (Math.abs(deltaX) < MIN_SWIPE_DISTANCE) return;

            // Свайп работает между 4 вкладками переключателя (по кругу)
            const currentIndex = SWIPEABLE_TABS.indexOf(tab);

            // Если текущая вкладка не в свайпабельных — игнорируем
            if (currentIndex === -1) return;

            if (deltaX < 0) {
                // Свайп влево → следующая вкладка (по кругу)
                const nextIndex = (currentIndex + 1) % SWIPEABLE_TABS.length;
                const nextTab = SWIPEABLE_TABS[nextIndex];

                // Фаза 1: выход старого контента
                setSlideDirection('out-left');
                if (navigator.vibrate) navigator.vibrate(10);
                setTimeout(() => {
                    // Фаза 2: смена вкладки + вход нового контента
                    setTab(nextTab);
                    setSlideDirection('in-left');
                    setTimeout(() => setSlideDirection(null), 220);
                }, 120);
            } else if (deltaX > 0) {
                // Свайп вправо → предыдущая вкладка (по кругу)
                const prevIndex = (currentIndex - 1 + SWIPEABLE_TABS.length) % SWIPEABLE_TABS.length;
                const prevTab = SWIPEABLE_TABS[prevIndex];

                setSlideDirection('out-right');
                if (navigator.vibrate) navigator.vibrate(10);
                setTimeout(() => {
                    setTab(prevTab);
                    setSlideDirection('in-right');
                    setTimeout(() => setSlideDirection(null), 220);
                }, 120);
            }
        }, [tab, setTab]);

        return {
            slideDirection,
            edgeBounce,
            onTouchStart,
            onTouchEnd,
        };
    };

    HEYS.AppSwipeNav = {
        useSwipeNavigation,
    };
})();
