import React from 'react';
import type { HEYSGlobal } from './types/heys';
declare global {
    interface Window {
        React: typeof React;
        HEYS: HEYSGlobal;
        ChartJS?: any;
    }
}
//# sourceMappingURL=heys_reports_v12.d.ts.map