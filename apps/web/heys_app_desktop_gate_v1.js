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
            // PERF: убран setInterval(5s) — он будил CPU даже на скрытых вкладках.
            // Состояние curator меняется только в моменты login/logout/restore session,
            // которые сопровождаются явными событиями. Достаточно реагировать на:
            //  • visibilitychange → visible (возврат на вкладку)
            //  • focus (мог пройти flow в другой вкладке)
            //  • heys:auth-changed / storage event (cross-tab login/logout)
            const onVis = () => {
                if (typeof document !== 'undefined' && !document.hidden) checkCurator();
            };
            const onStorage = (e) => {
                const k = e?.key || '';
                if (k.includes('curator') || k.includes('session') || k === 'heys_user') checkCurator();
            };
            document.addEventListener('visibilitychange', onVis);
            window.addEventListener('focus', checkCurator);
            window.addEventListener('heys:auth-changed', checkCurator);
            window.addEventListener('storage', onStorage);
            return () => {
                document.removeEventListener('visibilitychange', onVis);
                window.removeEventListener('focus', checkCurator);
                window.removeEventListener('heys:auth-changed', checkCurator);
                window.removeEventListener('storage', onStorage);
            };
        }, []);

        return { isDesktop, isCurator };
    };

    HEYS.AppDesktopGate = {
        useDesktopGateState,
    };
})();
