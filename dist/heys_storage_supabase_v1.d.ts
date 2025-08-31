import type { HEYSGlobal } from './types/heys';
declare global {
    interface Window {
        HEYS: HEYSGlobal;
        supabase: any;
        localStorage: Storage;
    }
}
//# sourceMappingURL=heys_storage_supabase_v1.d.ts.map