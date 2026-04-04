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

describe('What\'s New display guarantees', () => {
    beforeEach(() => {
        mockLocalStorage = {};
        mockSessionStorage = {};
        mockNow = Date.now();
    });

    const releases = {
        releases: [
            { version: '2026.04.04.9c35ee01' },
            { version: '2026.04.04.9f37f3bc' },
            { version: '2026.04.01.81bb72a9' },
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
});