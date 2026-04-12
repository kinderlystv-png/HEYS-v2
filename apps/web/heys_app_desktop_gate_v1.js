// heys_app_desktop_gate_v1.js — Desktop gate helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useDesktopGateState = ({ React }) => {
        const [isDesktop, setIsDesktop] = React.useState(() => window.innerWidth > 768);
        const [isCurator, setIsCurator] = React.useState(false);

        // Слушаем resize для обновления isDesktop
        React.useEffect(() => {
            const handleResize = () => setIsDesktop(window.innerWidth > 768);
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }, []);

        // Проверяем куратор ли (аналогично логике в heys_core_v12.js)
        // ✅ FIX v47: Проверяем наличие cloudUser (curator login создаёт user),
        // а не _rpcOnlyMode (который true для ВСЕХ после миграции на Yandex API)
        React.useEffect(() => {
            const checkCurator = () => {
                const isCuratorSession = window.HEYS?.auth?.isCuratorSession;
                if (typeof isCuratorSession === 'function') {
                    setIsCurator(isCuratorSession());
                    return;
                }
                const cloudUserLocal = window.HEYS?.cloud?.getUser?.();
                setIsCurator(cloudUserLocal != null);
            };
            checkCurator();
            const tick = () => {
                if (typeof document !== 'undefined' && document.hidden) return;
                checkCurator();
            };
            const interval = setInterval(tick, 5000);
            const onVis = () => {
                if (typeof document !== 'undefined' && !document.hidden) checkCurator();
            };
            document.addEventListener('visibilitychange', onVis);
            return () => {
                clearInterval(interval);
                document.removeEventListener('visibilitychange', onVis);
            };
        }, []);

        return { isDesktop, isCurator };
    };

    HEYS.AppDesktopGate = {
        useDesktopGateState,
    };
})();
