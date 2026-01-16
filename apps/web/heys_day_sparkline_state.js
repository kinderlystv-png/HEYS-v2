// heys_day_sparkline_state.js — sparkline state + render data helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useSparklineState(params) {
        const { React } = params || {};
        const { useState, useRef } = React || {};

        const [sliderPoint, setSliderPoint] = useState(null);
        const sliderPrevPointRef = useRef(null);

        const [sparklineZoom, setSparklineZoom] = useState(1);
        const [sparklinePan, setSparklinePan] = useState(0);
        const sparklineZoomRef = useRef({ initialDistance: 0, initialZoom: 1 });

        const [sparklineRefreshKey, setSparklineRefreshKey] = useState(0);

        const [brushRange, setBrushRange] = useState(null);
        const [brushing, setBrushing] = useState(false);
        const brushStartRef = useRef(null);

        return {
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            sparklineZoom,
            setSparklineZoom,
            sparklinePan,
            setSparklinePan,
            sparklineZoomRef,
            sparklineRefreshKey,
            setSparklineRefreshKey,
            brushRange,
            setBrushRange,
            brushing,
            setBrushing,
            brushStartRef
        };
    }

    function computeSparklineRenderData(params) {
        const {
            React,
            date,
            day,
            eatenKcal,
            chartPeriod,
            optimum,
            prof,
            products,
            dayTot,
            sparklineRefreshKey,
            fmtDate,
            HEYS: heysCtx
        } = params || {};

        const sparklineData = heysCtx?.daySparklineData?.computeSparklineData?.({
            React,
            date,
            day,
            eatenKcal,
            chartPeriod,
            optimum,
            prof,
            products,
            dayTot,
            sparklineRefreshKey,
            fmtDate,
            HEYS: heysCtx
        }) || [];

        const sparklineRenderData = React.useMemo(() => {
            const isTourActive = heysCtx?.OnboardingTour && heysCtx.OnboardingTour.isActive();
            const demo = isTourActive ? heysCtx.OnboardingTour.getDemoData('sparkline') : null;
            if (!demo) return sparklineData;
            const today = new Date();
            return demo.map((pt, i) => {
                const d = new Date(today);
                d.setDate(d.getDate() - (6 - i));
                const dateStr = d.getDate().toString().padStart(2, '0') + '.' + (d.getMonth() + 1).toString().padStart(2, '0');
                const dayOfWeek = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
                return {
                    date: dayOfWeek,
                    fullDate: dateStr,
                    kcal: pt.kcal,
                    target: pt.target,
                    isRefeed: false
                };
            });
        }, [sparklineData]);

        return {
            sparklineData,
            sparklineRenderData
        };
    }

    function buildSparklineRenderers(params) {
        const {
            React,
            haptic,
            openExclusivePopup,
            sparklineState,
            prof
        } = params || {};

        const {
            sparklineZoom,
            setSparklineZoom,
            sparklineZoomRef,
            sparklinePan,
            setSparklinePan,
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            brushing,
            setBrushing,
            brushRange,
            setBrushRange,
            brushStartRef
        } = sparklineState || {};

        const renderSparkline = (data, goal) => HEYS.daySparklines?.renderSparkline?.({
            data,
            goal,
            React,
            haptic,
            openExclusivePopup,
            sparklineZoom,
            setSparklineZoom,
            sparklineZoomRef,
            sparklinePan,
            setSparklinePan,
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            brushing,
            setBrushing,
            brushRange,
            setBrushRange,
            brushStartRef
        });

        const renderWeightSparkline = (data) => HEYS.daySparklines?.renderWeightSparkline?.({
            data,
            React,
            prof,
            openExclusivePopup,
            haptic
        });

        return {
            renderSparkline,
            renderWeightSparkline
        };
    }

    HEYS.daySparklineState = {
        useSparklineState,
        computeSparklineRenderData,
        buildSparklineRenderers
    };
})(window);
