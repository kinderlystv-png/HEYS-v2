// heys_app_runtime_effects_v1.js — runtime UI effects
(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const CONSENT_VALIDATION_CACHE_VERSION = 1;

    const getRequiredConsentVersions = () => {
        const versions = HEYS.LegalVersions || {};
        const required = Array.isArray(versions.required)
            ? versions.required
            : ['user_agreement', 'personal_data', 'health_data'];
        return required.reduce((result, type) => {
            result[type] = String(versions[type] || '');
            return result;
        }, {});
    };

    const getConsentValidationCacheKey = (clientId) => `heys_${clientId}_consent_validation_v1`;

    const writeConsentValidationCache = (clientId) => {
        if (!clientId) return;
        try {
            localStorage.setItem(getConsentValidationCacheKey(clientId), JSON.stringify({
                version: CONSENT_VALIDATION_CACHE_VERSION,
                clientId,
                requiredVersions: getRequiredConsentVersions(),
                validatedAt: Date.now(),
            }));
        } catch (_) { /* localStorage may be unavailable */ }
    };

    const clearConsentValidationCache = (clientId) => {
        if (!clientId) return;
        try { localStorage.removeItem(getConsentValidationCacheKey(clientId)); } catch (_) { /* noop */ }
    };

    const hasCurrentConsentValidationCache = (clientId) => {
        if (!clientId) return false;
        try {
            const raw = localStorage.getItem(getConsentValidationCacheKey(clientId));
            if (!raw) return false;
            const cached = JSON.parse(raw);
            return cached?.version === CONSENT_VALIDATION_CACHE_VERSION
                && cached?.clientId === clientId
                && JSON.stringify(cached?.requiredVersions || {}) === JSON.stringify(getRequiredConsentVersions());
        } catch (_) {
            return false;
        }
    };

    const useWidgetsEditMode = ({ React }) => {
        const [widgetsEditMode, setWidgetsEditMode] = React.useState(false);

        React.useEffect(() => {
            const handleEditEnter = () => setWidgetsEditMode(true);
            const handleEditExit = () => setWidgetsEditMode(false);

            const unsubEnter = window.HEYS?.Widgets?.on?.('editmode:enter', handleEditEnter);
            const unsubExit = window.HEYS?.Widgets?.on?.('editmode:exit', handleEditExit);

            setWidgetsEditMode(window.HEYS?.Widgets?.state?.isEditMode?.() || false);

            return () => {
                unsubEnter?.();
                unsubExit?.();
            };
        }, []);

        return { widgetsEditMode, setWidgetsEditMode };
    };

    const useConsentCheck = ({
        React, clientId, cloudUser,
        setNeedsConsent, setCheckingConsent,
        // Compliance overhaul 2026-05-20 — optional setters. Если родитель их не
        // передал — расширенная логика skip'ается, legacy flow остаётся.
        setOutdatedTypes,
        setGraceExpiresAt,
        setMustBlockReconsent,
        setNeedsAgeGate,
        setConsentCheckError,
    }) => {
        React.useEffect(() => {
            if (!clientId) {
                setNeedsConsent(false);
                setCheckingConsent(false);
                setOutdatedTypes && setOutdatedTypes([]);
                setGraceExpiresAt && setGraceExpiresAt(null);
                setMustBlockReconsent && setMustBlockReconsent(false);
                setNeedsAgeGate && setNeedsAgeGate(false);
                setConsentCheckError && setConsentCheckError(null);
                HEYS._consentsChecked = false;
                HEYS._consentsValid = false;
                HEYS._consentsCheckError = null;
                return;
            }
            if (window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled) {
                // Landing demo runs against a synthetic demo-client and a no-op API.
                // Do not show legal consent gates inside the public iframe.
                setNeedsConsent(false);
                setCheckingConsent(false);
                setOutdatedTypes && setOutdatedTypes([]);
                setGraceExpiresAt && setGraceExpiresAt(null);
                setMustBlockReconsent && setMustBlockReconsent(false);
                setNeedsAgeGate && setNeedsAgeGate(false);
                setConsentCheckError && setConsentCheckError(null);
                HEYS._consentsChecked = true;
                HEYS._consentsValid = true;
                HEYS._consentsCheckError = null;
                try {
                    window.dispatchEvent(new CustomEvent('heys:consents-state-changed', {
                        detail: { valid: true, needsConsent: false, source: 'demo-mode' }
                    }));
                } catch (_) { /* noop */ }
                return;
            }
            const isPinSessionActive = () => {
                try {
                    return !!HEYS.cloud?.isPinAuthClient?.()
                        || !!HEYS.auth?.getSessionToken?.()
                        || !!localStorage.getItem('heys_session_token')
                        || !!localStorage.getItem('heys_pin_auth_client')
                        || !!localStorage.getItem('heys_pin_cookie_session_hint');
                } catch (_) {
                    return false;
                }
            };

            if (cloudUser && !isPinSessionActive()) {
                setNeedsConsent(false);
                setCheckingConsent(false);
                setConsentCheckError && setConsentCheckError(null);
                HEYS._consentsChecked = true;
                HEYS._consentsValid = true;
                HEYS._consentsCheckError = null;
                return;
            }

            let cancelled = false;
            let retryTimer = null;
            let onlineRecheckBound = false;
            const CONSENT_CHECK_RETRY_MS = 8000;

            // Утилита: нормализовать legacy-ответ в shape v2.
            const legacyAsV2 = (clientIdArg, legacyFn) => legacyFn(clientIdArg).then(r => ({
                valid: r.valid, missing: r.missing || [],
                outdated: [], graceExpiresAt: null, graceStatus: 'none',
                mustBlock: false, ageConfirmed: true,
            }));

            const normalizeCheckError = (err, source) => {
                const message = String(err?.message || err || 'Не удалось проверить согласия');
                return {
                    source,
                    message,
                    at: Date.now(),
                    retryMs: CONSENT_CHECK_RETRY_MS,
                };
            };

            const scheduleCheckRetry = () => {
                if (retryTimer) clearTimeout(retryTimer);
                retryTimer = setTimeout(() => {
                    retryTimer = null;
                    runCheck(0);
                }, CONSENT_CHECK_RETRY_MS);
            };

            const dispatchConsentState = (detail) => {
                try {
                    window.dispatchEvent(new CustomEvent('heys:consents-state-changed', { detail }));
                } catch (_) { /* noop */ }
            };

            const applyCachedConsent = (source) => {
                setNeedsConsent(false);
                setCheckingConsent(false);
                setOutdatedTypes && setOutdatedTypes([]);
                setGraceExpiresAt && setGraceExpiresAt(null);
                setMustBlockReconsent && setMustBlockReconsent(false);
                setNeedsAgeGate && setNeedsAgeGate(false);
                setConsentCheckError && setConsentCheckError(null);
                HEYS._consentsChecked = true;
                HEYS._consentsValid = true;
                HEYS._consentsCheckError = null;
                dispatchConsentState({ valid: true, needsConsent: false, source });
            };

            const failConsentCheck = (err, source) => {
                if (cancelled) return;
                if (hasCurrentConsentValidationCache(clientId)) {
                    console.warn('[CONSENTS] Consent re-check failed — using current version-matched proof');
                    applyCachedConsent('consent-cache-fallback');
                    scheduleCheckRetry();
                    return;
                }
                const checkError = normalizeCheckError(err, source);
                console.warn('[CONSENTS] Consent check failed — keeping consent form closed:', checkError.message);
                setNeedsConsent(false);
                setCheckingConsent(false);
                setOutdatedTypes && setOutdatedTypes([]);
                setGraceExpiresAt && setGraceExpiresAt(null);
                setMustBlockReconsent && setMustBlockReconsent(false);
                setNeedsAgeGate && setNeedsAgeGate(false);
                setConsentCheckError && setConsentCheckError(checkError);
                HEYS._consentsChecked = false;
                HEYS._consentsValid = false;
                HEYS._consentsCheckError = checkError;
                try {
                    window.dispatchEvent(new CustomEvent('heys:consents-state-changed', {
                        detail: {
                            valid: false,
                            needsConsent: false,
                            checkError: true,
                            source,
                        }
                    }));
                } catch (_) { /* noop */ }
                scheduleCheckRetry();
            };

            const runCheck = (attempt = 0) => {
                if (retryTimer) {
                    clearTimeout(retryTimer);
                    retryTimer = null;
                }
                const hasCachedValidation = hasCurrentConsentValidationCache(clientId);
                if (navigator.onLine === false && hasCachedValidation) {
                    applyCachedConsent('offline-consent-cache');
                    if (!onlineRecheckBound) {
                        onlineRecheckBound = true;
                        window.addEventListener('online', handleOnlineRecheck, { once: true });
                    }
                    return;
                }
                if (hasCachedValidation) {
                    // A successful version-bound proof is enough to keep the
                    // authenticated UI stable while the server revalidates it.
                    // An explicit invalid/outdated server response below still
                    // clears the proof and opens the legal gate immediately.
                    applyCachedConsent('consent-cache-revalidate');
                } else {
                    setCheckingConsent(true);
                    setNeedsConsent(false);
                    setConsentCheckError && setConsentCheckError(null);
                    HEYS._consentsChecked = false;
                    HEYS._consentsValid = false;
                    HEYS._consentsCheckError = null;
                }

                const versioned = HEYS.Consents?.api?.checkRequiredVersioned;
                const legacy = HEYS.Consents?.api?.checkRequired;

                if (!versioned && !legacy) {
                    if (attempt < 40) {
                        retryTimer = setTimeout(() => runCheck(attempt + 1), 250);
                    } else {
                        failConsentCheck('Consent API is not ready', 'consent-api-timeout');
                    }
                    return;
                }

                const pinSessionActive = isPinSessionActive();
                const promise = versioned
                    ? versioned().then(r => {
                        if (r?.error) {
                            if (pinSessionActive) {
                                return {
                                    valid: false,
                                    missing: [],
                                    outdated: [],
                                    graceExpiresAt: null,
                                    graceStatus: 'none',
                                    mustBlock: false,
                                    ageConfirmed: true,
                                    checkFailed: true,
                                    error: r.error,
                                };
                            }
                            if (legacy) {
                                console.log('[CONSENTS] versioned failed (' + r.error + ') — fallback to legacy');
                                return legacyAsV2(clientId, legacy);
                            }
                        }
                        return r;
                    })
                    : (pinSessionActive
                        ? Promise.resolve({
                            valid: false,
                            missing: [],
                            outdated: [],
                            graceExpiresAt: null,
                            graceStatus: 'none',
                            mustBlock: false,
                            ageConfirmed: true,
                            checkFailed: true,
                            error: 'versioned consent API not ready',
                        })
                        : legacyAsV2(clientId, legacy));

                promise.then((r) => {
                    if (cancelled) return;
                    if (r?.checkFailed) {
                        failConsentCheck(r.error || 'Consent check failed', 'consent-check-error');
                        return;
                    }
                    const outdated = Array.isArray(r.outdated) ? r.outdated : [];
                    const effectiveConsentValid = !!r.valid && outdated.length === 0 && !r.mustBlock;
                    const needs = !effectiveConsentValid;
                    if (effectiveConsentValid) writeConsentValidationCache(clientId);
                    else clearConsentValidationCache(clientId);
                    setNeedsConsent(needs);
                    setCheckingConsent(false);
                    setOutdatedTypes && setOutdatedTypes(outdated);
                    setGraceExpiresAt && setGraceExpiresAt(r.graceExpiresAt || null);
                    setMustBlockReconsent && setMustBlockReconsent(!!r.mustBlock);
                    setConsentCheckError && setConsentCheckError(null);
                    // Age-gate показываем только когда основные согласия в порядке —
                    // иначе сначала ConsentScreen, потом age.
                    setNeedsAgeGate && setNeedsAgeGate(!r.ageConfirmed && effectiveConsentValid);
                    HEYS._consentsChecked = true;
                    HEYS._consentsValid = effectiveConsentValid;
                    HEYS._consentsCheckError = null;
                    try {
                        window.dispatchEvent(new CustomEvent('heys:consents-state-changed', {
                            detail: { valid: effectiveConsentValid, needsConsent: needs, source: 'consent-check' }
                        }));
                    } catch (_) { /* noop */ }
                    if (outdated.length) {
                        console.log('[CONSENTS] ⚠ Outdated docs, grace until:', r.graceExpiresAt);
                    } else if (needs) {
                        console.log('[CONSENTS] Client needs to accept consents:', r.missing, 'outdated:', outdated);
                    } else {
                        console.log('[CONSENTS] ✅ All consents are valid');
                    }
                }).catch((err) => {
                    if (cancelled) return;
                    console.error('[CONSENTS] Error checking consents:', err);
                    failConsentCheck(err, 'consent-check-error');
                });
            };

            const handleOnlineRecheck = () => {
                onlineRecheckBound = false;
                if (!cancelled) runCheck(0);
            };

            const handleConsentsReady = () => runCheck(0);
            window.addEventListener('heys:consents-ready', handleConsentsReady);
            runCheck(0);

            return () => {
                cancelled = true;
                if (retryTimer) clearTimeout(retryTimer);
                if (onlineRecheckBound) window.removeEventListener('online', handleOnlineRecheck);
                window.removeEventListener('heys:consents-ready', handleConsentsReady);
            };
        }, [clientId, cloudUser, setNeedsConsent, setCheckingConsent,
            setOutdatedTypes, setGraceExpiresAt, setMustBlockReconsent, setNeedsAgeGate,
            setConsentCheckError]);
    };

    const useBadgeSync = ({ React }) => {
        React.useEffect(() => {
            const initialUpdate = setTimeout(() => {
                window.HEYS?.badge?.updateFromStreak();
            }, 2000);

            const handleDataChange = () => {
                setTimeout(() => {
                    window.HEYS?.badge?.updateFromStreak();
                }, 500);
            };

            window.addEventListener('heysSyncCompleted', handleDataChange);
            window.addEventListener('heys:data-saved', handleDataChange);

            return () => {
                clearTimeout(initialUpdate);
                window.removeEventListener('heysSyncCompleted', handleDataChange);
                window.removeEventListener('heys:data-saved', handleDataChange);
            };
        }, []);
    };

    const useCalendarSync = ({ React, setCalendarVer }) => {
        const calendarDebounceRef = React.useRef(null);
        // 🛡️ v64 FIX: Трекинг последнего calendarVer increment timestamp
        // Предотвращает двойной increment от двух heysSyncCompleted событий
        const lastIncrementRef = React.useRef(0);

        React.useEffect(() => {
            const handleCycleUpdate = (detail) => {
                const source = detail?.source;
                const field = detail?.field;

                // Обновляем календарь при: cycleDay changes ИЛИ cloud-sync/force-sync/merge
                const isCycleUpdate = field === 'cycleDay' || (source && source.startsWith('cycle'));
                const isSyncUpdate = source === 'cloud-sync' || source === 'force-sync' || source === 'merge';
                if (!isCycleUpdate && !isSyncUpdate) return;

                if (calendarDebounceRef.current) {
                    clearTimeout(calendarDebounceRef.current);
                }
                calendarDebounceRef.current = setTimeout(() => {
                    setCalendarVer((v) => v + 1);
                    calendarDebounceRef.current = null;
                }, isSyncUpdate ? 800 : 500); // Sync — дольше ждём (много событий подряд)
            };

            // Также слушаем heysSyncCompleted для гарантированного обновления после sync
            const handleSyncComplete = (e) => {
                const now = Date.now();
                const sinceLastIncrement = now - lastIncrementRef.current;
                window.console.info('[HEYS.calendar] 🔔 heysSyncCompleted получен, clientId=', e?.detail?.clientId?.slice(0, 8), 'sinceLastIncrement=' + sinceLastIncrement + 'ms');

                // 🛡️ v64 FIX: Игнорируем дублирующееся событие (< 2 сек после предыдущего increment)
                // Два sync path (syncClientViaRPC + bootstrapClientSync) могут оба стрелять heysSyncCompleted
                if (sinceLastIncrement < 2000) {
                    window.console.info('[HEYS.calendar] ⏭️ SKIP duplicate heysSyncCompleted (debounce=' + sinceLastIncrement + 'ms < 2000ms)');
                    return;
                }

                if (calendarDebounceRef.current) {
                    clearTimeout(calendarDebounceRef.current);
                }
                calendarDebounceRef.current = setTimeout(() => {
                    lastIncrementRef.current = Date.now();
                    setCalendarVer((v) => {
                        window.console.info('[HEYS.calendar] 📈 calendarVer', v, '→', v + 1);
                        return v + 1;
                    });
                    calendarDebounceRef.current = null;
                }, 500); // 🛡️ v64: Увеличен с 300 до 500ms для лучшего debounce
            };

            // PERF NEW-1: миграция handleCycleUpdate на dispatcher next-frame lane.
            // Calendar update уже debounced 500-800мс внутри — defer на frame дешёво.
            // heysSyncCompleted остаётся на window (отдельный event, не часть dispatcher).
            const dispatcher = window.HEYS?.events?.dayUpdated;
            let unsubDayUpdated;
            if (dispatcher && typeof dispatcher.subscribe === 'function') {
                unsubDayUpdated = dispatcher.subscribe(handleCycleUpdate, { priority: 'next-frame' });
            } else {
                const wrap = (e) => handleCycleUpdate(e?.detail || {});
                window.addEventListener('heys:day-updated', wrap);
                unsubDayUpdated = () => window.removeEventListener('heys:day-updated', wrap);
            }
            window.addEventListener('heysSyncCompleted', handleSyncComplete);
            return () => {
                if (unsubDayUpdated) unsubDayUpdated();
                window.removeEventListener('heysSyncCompleted', handleSyncComplete);
                if (calendarDebounceRef.current) {
                    clearTimeout(calendarDebounceRef.current);
                }
            };
        }, [setCalendarVer]);

        return { calendarDebounceRef };
    };

    HEYS.AppRuntimeEffects = {
        useWidgetsEditMode,
        useConsentCheck,
        useBadgeSync,
        useCalendarSync,
    };
})();
