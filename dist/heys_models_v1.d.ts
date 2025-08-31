import type { HEYSGlobal } from './types/heys';
declare global {
    interface Window {
        HEYS: HEYSGlobal;
    }
}
export interface DerivedProduct {
    readonly carbs100: number;
    readonly fat100: number;
    readonly kcal100: number;
}
//# sourceMappingURL=heys_models_v1.d.ts.map