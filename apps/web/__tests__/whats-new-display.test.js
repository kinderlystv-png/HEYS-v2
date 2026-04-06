import { beforeEach, describe, expect, it } from 'vitest';

const LEGACY_SEEN_KEY = 'heys_whats_new_last_seen';
const ACK_KEY = 'heys_whats_new_last_acknowledged';
const UPDATE_LOCK_TIMEOUT_MS = 30000;

let mockLocalStorage;
let mockSessionStorage;
let mockNow;

function getStorageValue(storage, key) {
    return storage[key] || '';
}

function resolveSeenVersion(data) {
    const acknowledgedVersion = getStorageValue(mockLocalStorage, ACK_KEY);
    if (acknowledgedVersion) return acknowledgedVersion;

    const legacySeenVersion = getStorageValue(mockLocalStorage, LEGACY_SEEN_KEY);
    if (!legacySeenVersion) return '';

    const latestVersion = data?.releases?.[0]?.version || '';
    if (latestVersion && legacySeenVersion === latestVersion) {
        return '';
    }

    return legacySeenVersion;
}

function getUnseenReleases(data) {
    if (!data || !Array.isArray(data.releases) || data.releases.length === 0) return [];

    const resolvedSeenVersion = resolveSeenVersion(data);
    if (!resolvedSeenVersion) {
        return [data.releases[0]];
    }

    const seenIndex = data.releases.findIndex((release) => release.version === resolvedSeenVersion);
    if (seenIndex === 0) return [];
    if (seenIndex > 0) return data.releases.slice(0, seenIndex);
    return [data.releases[0]];
}

function extractBuildHash(version) {
    if (!version || typeof version !== 'string') return '';
    const parts = version.split('.').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '';
}

function inspectWhatsNewState({
    data,
    runningVersion = '',
    buildMetaVersion = '',
} = {}) {
    if (!data || !Array.isArray(data.releases) || data.releases.length === 0) {
        return { ok: false, hasUnseen: false, reason: 'invalid_data' };
    }

    const latestReleaseBuildHash = data.releases[0]?.buildHash || '';
    const runningBuildHash = extractBuildHash(runningVersion);
    if (latestReleaseBuildHash && runningBuildHash && latestReleaseBuildHash !== runningBuildHash) {
        return { ok: false, hasUnseen: false, reason: 'code_update_pending' };
    }

    if (buildMetaVersion && runningVersion && buildMetaVersion !== runningVersion) {
        return { ok: false, hasUnseen: false, reason: 'code_update_pending' };
    }

    const unseenReleases = getUnseenReleases(data);
    return {
        ok: true,
        hasUnseen: unseenReleases.length > 0,
        reason: unseenReleases.length > 0 ? 'has_unseen' : 'up_to_date',
    };
}

function getWhatsNewBlockReason({
    isInitializing = false,
    isConsentBlocking = false,
    isMorningCheckinBlocking = false,
    showSyncLockOverlay = false,
    moduleReady = true,
} = {}) {
    if (isInitializing) return 'app-initializing';
    if (isConsentBlocking) return 'consent-blocking';
    if (isMorningCheckinBlocking) return 'morning-checkin-blocking';
    if (showSyncLockOverlay) return 'sync-lock-overlay';
    if (mockSessionStorage.heys_pending_update) return 'pending-update';

    const lockRaw = mockLocalStorage.heys_update_in_progress;
    if (lockRaw) {
        const lock = JSON.parse(lockRaw);
        if (lock?.timestamp && (mockNow - lock.timestamp) < UPDATE_LOCK_TIMEOUT_MS) {
            return 'update-lock';
        }
    }

    if (!moduleReady) return 'module-not-ready';
    return '';
}

function shouldClearPendingUpdateFlag({
    pendingUpdate = false,
    inspection = null,
} = {}) {
    if (!pendingUpdate) return false;
    if (!inspection?.ok) return false;
    return true;
}

describe('What\'s New display guarantees', () => {
    beforeEach(() => {
        mockLocalStorage = {};
        mockSessionStorage = {};
        mockNow = Date.now();
    });

    const releases = {
        releases: [
            { version: '2026.04.04.9c35ee01', buildHash: '9c35ee01' },
            { version: '2026.04.04.9f37f3bc', buildHash: '9f37f3bc' },
            { version: '2026.04.01.81bb72a9', buildHash: '81bb72a9' },
        ],
    };

    it('shows the latest release on a fresh device', () => {
        const unseen = getUnseenReleases(releases);

        expect(unseen).toHaveLength(1);
        expect(unseen[0].version).toBe('2026.04.04.9c35ee01');
    });

    it('does not rely on legacy seen state for the latest release without explicit acknowledgement', () => {
        mockLocalStorage[LEGACY_SEEN_KEY] = '2026.04.04.9c35ee01';

        const unseen = getUnseenReleases(releases);

        expect(unseen).toHaveLength(1);
        expect(unseen[0].version).toBe('2026.04.04.9c35ee01');
    });

    it('uses the acknowledged key as the real per-device source of truth', () => {
        mockLocalStorage[ACK_KEY] = '2026.04.04.9c35ee01';
        mockLocalStorage[LEGACY_SEEN_KEY] = '2026.04.04.9c35ee01';

        const unseen = getUnseenReleases(releases);

        expect(unseen).toHaveLength(0);
    });

    it('keeps older acknowledged history and shows only newer releases above it', () => {
        mockLocalStorage[ACK_KEY] = '2026.04.04.9f37f3bc';

        const unseen = getUnseenReleases(releases);

        expect(unseen).toHaveLength(1);
        expect(unseen[0].version).toBe('2026.04.04.9c35ee01');
    });

    it('defers the modal while a PWA update is still pending', () => {
        mockSessionStorage.heys_pending_update = 'true';

        expect(getWhatsNewBlockReason()).toBe('pending-update');
    });

    it('defers the modal while the sync lock overlay is visible', () => {
        expect(getWhatsNewBlockReason({ showSyncLockOverlay: true })).toBe('sync-lock-overlay');
    });

    it('waits for an active update lock but ignores an expired one', () => {
        mockLocalStorage.heys_update_in_progress = JSON.stringify({ timestamp: mockNow });
        expect(getWhatsNewBlockReason()).toBe('update-lock');

        mockLocalStorage.heys_update_in_progress = JSON.stringify({ timestamp: mockNow - UPDATE_LOCK_TIMEOUT_MS - 1 });
        expect(getWhatsNewBlockReason()).toBe('');
    });

    it('does not show What\'s New on old runtime code even if the release feed is newer', () => {
        const inspection = inspectWhatsNewState({
            data: releases,
            runningVersion: '2026.04.04.1200.9f37f3bc',
            buildMetaVersion: '2026.04.04.1200.9f37f3bc',
        });

        expect(inspection.ok).toBe(false);
        expect(inspection.reason).toBe('code_update_pending');
    });

    it('shows What\'s New only after the runtime hash matches the latest release hash', () => {
        const inspection = inspectWhatsNewState({
            data: releases,
            runningVersion: '2026.04.04.1200.9c35ee01',
            buildMetaVersion: '2026.04.04.1200.9c35ee01',
        });

        expect(inspection.ok).toBe(true);
        expect(inspection.reason).toBe('has_unseen');
        expect(inspection.hasUnseen).toBe(true);
    });

    it('still defers if build-meta is ahead of the currently running runtime version', () => {
        const inspection = inspectWhatsNewState({
            data: releases,
            runningVersion: '2026.04.04.1200.9c35ee01',
            buildMetaVersion: '2026.04.04.1300.abcd1234',
        });

        expect(inspection.ok).toBe(false);
        expect(inspection.reason).toBe('code_update_pending');
    });

    it('clears a stale pending-update flag after the runtime has already caught up', () => {
        const inspection = inspectWhatsNewState({
            data: releases,
            runningVersion: '2026.04.04.1200.9c35ee01',
            buildMetaVersion: '2026.04.04.1200.9c35ee01',
        });

        expect(shouldClearPendingUpdateFlag({ pendingUpdate: true, inspection })).toBe(true);
    });

    it('keeps the pending-update flag while code update is still actually pending', () => {
        const inspection = inspectWhatsNewState({
            data: releases,
            runningVersion: '2026.04.04.1200.9f37f3bc',
            buildMetaVersion: '2026.04.04.1200.9f37f3bc',
        });

        expect(inspection.reason).toBe('code_update_pending');
        expect(shouldClearPendingUpdateFlag({ pendingUpdate: true, inspection })).toBe(false);
    });
});