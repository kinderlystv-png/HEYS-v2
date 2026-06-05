import { describe, expect, it } from 'vitest';

/**
 * Реплика reload-решения из `cloud.switchClient` finally-блока
 * (apps/web/heys_storage_supabase_v1.js, "Layer 3 / first-activation optimization").
 *
 * Контракт:
 *  - Layer 3 (incident 2026-06-02): свитч МЕЖДУ клиентами делает location.reload()
 *    чтобы in-memory state (React, module caches, debounce timers) старого клиента
 *    не протёк в новый scope.
 *  - first-activation optimization: САМАЯ ПЕРВАЯ активация клиента в рамках этой
 *    загрузки страницы (anonymous boot → client) reload НЕ делает — старого клиента
 *    в памяти нет, чистить нечего, а Stage 2 уже смонтировал AppShell in-place.
 *  - Сигнал «первая активация» = module-level `_clientActivatedThisPage` ещё не
 *    выставлен И `oldClientId` пуст. Флаг сбрасывается только реальным reload
 *    (новый module instance), поэтому logout (который трёт heys_client_current, но
 *    НЕ перезагружает страницу) не открывает дыру: ре-логин под другим клиентом в
 *    той же странице видит флаг=true и reload'ит как раньше.
 *  - `heys_disable_switch_reload='1'` (reloadDisabled) — глобальный выключатель,
 *    выигрывает у всего.
 */
function createSwitchReloadDecider() {
    // Эмулирует module-singleton `cloud` в рамках одной загрузки страницы.
    const cloud = { _clientActivatedThisPage: undefined };
    return function decide({ oldClientId = null, reloadDisabled = false } = {}) {
        const hadPriorClientThisPage = cloud._clientActivatedThisPage === true;
        cloud._clientActivatedThisPage = true;
        const firstActivationNoReload = !hadPriorClientThisPage && !oldClientId;
        const willReload = !reloadDisabled && !firstActivationNoReload;
        return { willReload, firstActivationNoReload };
    };
}

describe('switchClient reload guard (first-activation optimization)', () => {
    it('cold PIN-login (fresh page, no oldClientId) — НЕ перезагружает', () => {
        const decide = createSwitchReloadDecider();
        const r = decide({ oldClientId: null });
        expect(r.firstActivationNoReload).toBe(true);
        expect(r.willReload).toBe(false);
    });

    it('следующий свитч в той же странице (curator client→client) — перезагружает', () => {
        const decide = createSwitchReloadDecider();
        decide({ oldClientId: null }); // первый логин — skip
        const second = decide({ oldClientId: 'aaaaaaaa-old' });
        expect(second.willReload).toBe(true);
    });

    it('SAFETY: logout→ре-логин под другим клиентом в той же странице — перезагружает', () => {
        // logout трёт heys_client_current → oldClientId снова null, НО страница та же
        // (флаг остался true). Без флага этот кейс протёк бы React-state клиента A в B.
        const decide = createSwitchReloadDecider();
        const first = decide({ oldClientId: null }); // вход под A
        expect(first.willReload).toBe(false);
        const relogin = decide({ oldClientId: null }); // logout (client_current стёрт) → вход под B
        expect(relogin.firstActivationNoReload).toBe(false);
        expect(relogin.willReload).toBe(true);
    });

    it('defense-in-depth: первая активация со стейл oldClientId — перезагружает', () => {
        const decide = createSwitchReloadDecider();
        const r = decide({ oldClientId: 'stale-cid' });
        expect(r.firstActivationNoReload).toBe(false);
        expect(r.willReload).toBe(true);
    });

    it('heys_disable_switch_reload=1 выигрывает всегда (даже при реальном свитче)', () => {
        const decide = createSwitchReloadDecider();
        decide({ oldClientId: null, reloadDisabled: true });
        const second = decide({ oldClientId: 'aaaaaaaa-old', reloadDisabled: true });
        expect(second.willReload).toBe(false);
    });

    it('curator client↔client (oldClientId всегда задан) — перезагружает на каждом свитче', () => {
        const decide = createSwitchReloadDecider();
        expect(decide({ oldClientId: 'cid-A' }).willReload).toBe(true);
        expect(decide({ oldClientId: 'cid-B' }).willReload).toBe(true);
        expect(decide({ oldClientId: 'cid-C' }).willReload).toBe(true);
    });
});
