import type { HEYSGlobal } from './types/heys';
declare global {
    interface Window {
        HEYS: HEYSGlobal;
        performance: Performance;
        PerformanceObserver?: any;
    }
}
//# sourceMappingURL=heys_performance_monitor.d.ts.map