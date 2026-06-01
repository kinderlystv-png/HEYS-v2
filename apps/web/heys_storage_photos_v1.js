// heys_storage_photos_v1.js — Photo storage (Yandex backend + pending queue)
; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const Photos = HEYS.StoragePhotos = HEYS.StoragePhotos || {};

    const PENDING_PHOTOS_KEY = 'heys_pending_photos';
    const DEFAULT_BUCKET = 'meal-photos';
    let _cloud = null;

    const isDebug = () => {
        try {
            return global.__heysLogControl?.isEnabled?.('photos') === true ||
                global.localStorage.getItem('heys_debug_photos') === 'true' ||
                global.localStorage.getItem('heys_debug_sync') === 'true';
        } catch (_) {
            return false;
        }
    };

    function log() {
        if (!isDebug()) return;
        try {
            console.log.apply(console, ['[HEYS.photos]'].concat([].slice.call(arguments)));
        } catch (_) { }
    }

    function logCritical() {
        if (!isDebug()) return;
        try {
            console.info.apply(console, ['[HEYS.photos]'].concat([].slice.call(arguments)));
        } catch (_) { }
    }

    function getBucket() {
        return HEYS?.config?.photosBucket || DEFAULT_BUCKET;
    }

    function getSessionToken() {
        try {
            const fromAuth = HEYS?.Auth?.getSessionToken?.() || HEYS?.auth?.getSessionToken?.();
            if (fromAuth) return fromAuth;
            const raw = global.localStorage.getItem('heys_session_token');
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (_) {
                return raw;
            }
        } catch (_) {
            return null;
        }
    }

    function getCuratorToken() {
        try {
            const curatorSession = global.localStorage.getItem('heys_curator_session');
            if (curatorSession) return curatorSession;
            const supabaseAuth = global.localStorage.getItem('heys_supabase_auth_token');
            if (supabaseAuth) {
                const parsed = JSON.parse(supabaseAuth);
                return parsed?.access_token || null;
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    async function base64ToBlob(base64Data) {
        const response = await fetch(base64Data);
        return response.blob();
    }

    async function uploadViaYandex({ base64Data, clientId, date, mealId, blob }) {
        const api = HEYS?.YandexAPI;
        if (!api) {
            return { error: 'YandexAPI not available' };
        }

        if (typeof api.uploadPhoto === 'function') {
            return api.uploadPhoto({
                base64Data,
                clientId,
                date,
                mealId,
                bucket: getBucket()
            });
        }

        const apiBase = api.CONFIG?.API_URL || 'https://api.heyslab.ru';
        const sessionToken = getSessionToken();
        const curatorToken = getCuratorToken();

        const headers = {
            'Content-Type': 'application/json'
        };

        if (curatorToken) {
            headers['Authorization'] = `Bearer ${curatorToken}`;
        }

        const payload = {
            bucket: getBucket(),
            client_id: clientId,
            date,
            meal_id: mealId,
            session_token: sessionToken || undefined,
            data: base64Data
        };

        const response = await fetch(`${apiBase}/photos/upload`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        let result;
        try {
            result = await response.json();
        } catch (_) {
            result = null;
        }

        if (!response.ok || result?.error) {
            return { error: result?.error || `Upload failed (${response.status})` };
        }

        if (result?.uploadUrl) {
            const uploadHeaders = result?.uploadHeaders || { 'Content-Type': 'image/jpeg' };
            const uploadResponse = await fetch(result.uploadUrl, {
                method: result.uploadMethod || 'PUT',
                headers: uploadHeaders,
                body: blob
            });
            if (!uploadResponse.ok) {
                return { error: `Upload PUT failed (${uploadResponse.status})` };
            }
        }

        return {
            url: result?.url || result?.publicUrl || null,
            path: result?.path || result?.key || null
        };
    }

    async function deleteViaYandex(path) {
        const api = HEYS?.YandexAPI;
        if (!api) {
            return { error: 'YandexAPI not available' };
        }

        if (typeof api.deletePhoto === 'function') {
            return api.deletePhoto({ path, bucket: getBucket() });
        }

        const apiBase = api.CONFIG?.API_URL || 'https://api.heyslab.ru';
        const curatorToken = getCuratorToken();
        const sessionToken = getSessionToken();

        const headers = {
            'Content-Type': 'application/json'
        };

        if (curatorToken) {
            headers['Authorization'] = `Bearer ${curatorToken}`;
        }

        const payload = {
            bucket: getBucket(),
            path,
            session_token: sessionToken || undefined
        };

        const response = await fetch(`${apiBase}/photos/delete`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        let result;
        try {
            result = await response.json();
        } catch (_) {
            result = null;
        }

        if (!response.ok || result?.error) {
            return { error: result?.error || `Delete failed (${response.status})` };
        }

        return { success: true };
    }

    function savePendingPhoto(base64Data, clientId, date, mealId) {
        try {
            const pending = JSON.parse(global.localStorage.getItem(PENDING_PHOTOS_KEY) || '[]');
            const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

            pending.push({
                id: photoId,
                data: base64Data,
                clientId,
                date,
                mealId,
                createdAt: Date.now()
            });

            global.localStorage.setItem(PENDING_PHOTOS_KEY, JSON.stringify(pending));
            log('📷 Photo saved to pending:', photoId);

            return {
                id: photoId,
                data: base64Data,
                pending: true,
                uploaded: false
            };
        } catch (e) {
            logCritical('📷 savePendingPhoto error:', e?.message || e);
            return {
                data: base64Data,
                pending: true,
                uploaded: false
            };
        }
    }

    async function updatePhotoUrlInDay(clientId, date, photoId, newUrl) {
        const utils = HEYS?.utils;
        if (!utils?.lsGet || !utils?.lsSet) return;

        const dayKey = 'heys_dayv2_' + date;
        const day = utils.lsGet(dayKey, null);
        if (!day?.meals) return;

        let updated = false;
        day.meals = day.meals.map((meal) => {
            if (!meal.photos) return meal;
            meal.photos = meal.photos.map((photo) => {
                if (photo.id === photoId || photo.pending) {
                    updated = true;
                    return {
                        ...photo,
                        url: newUrl,
                        data: undefined,
                        pending: false,
                        uploaded: true
                    };
                }
                return photo;
            });
            return meal;
        });

        if (updated) {
            utils.lsSet(dayKey, day);
            log('📷 Updated photo URL in day:', date, photoId);
        }
    }

    Photos.uploadPhoto = async function (base64Data, clientId, date, mealId) {
        if (!clientId) {
            log('📷 uploadPhoto: нет клиента, сохраняем в pending');
            return savePendingPhoto(base64Data, clientId, date, mealId);
        }

        if (!navigator.onLine) {
            log('📷 uploadPhoto: offline, сохраняем в pending');
            return savePendingPhoto(base64Data, clientId, date, mealId);
        }

        try {
            const blob = await base64ToBlob(base64Data);
            const result = await uploadViaYandex({ base64Data, clientId, date, mealId, blob });

            if (result?.error) {
                logCritical('📷 uploadPhoto error:', result.error);
                return savePendingPhoto(base64Data, clientId, date, mealId);
            }

            log('📷 Photo uploaded:', result?.path || '(no path)');
            return {
                url: result?.url || null,
                path: result?.path || null,
                uploaded: true
            };
        } catch (e) {
            logCritical('📷 uploadPhoto exception:', e?.message || e);
            return savePendingPhoto(base64Data, clientId, date, mealId);
        }
    };

    // 🚮 Give-up policy для фоток которые не загружаются вечно (incident 2026-06-01:
    // 4 фотки × ~125KB застряли с 28 мая → 505KB в pending queue 5+ дней,
    // забивали LS budget до 95% emergency audit loop). Раньше любой fail просто
    // returning photo в queue без счётчика → бесконечный retry. Теперь:
    // - retryCount счётчик попыток uplo'a
    // - даём до MAX_RETRIES упорных попыток
    // - после стольки же ИЛИ возраст > MAX_AGE_MS → give up, удаляем из queue
    //   с console.warn (видно в client_log_trace для разбора)
    const MAX_RETRIES = 5;
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней — после этого даже свежие фотки losу

    Photos.uploadPendingPhotos = async function () {
        if (!navigator.onLine) return;

        try {
            const pending = JSON.parse(global.localStorage.getItem(PENDING_PHOTOS_KEY) || '[]');
            if (pending.length === 0) return;

            log('📷 Uploading', pending.length, 'pending photos...');

            const stillPending = [];
            const givenUp = [];
            const now = Date.now();

            for (const photo of pending) {
                const ageMs = now - (Number(photo.createdAt) || now);
                const retryCount = Number(photo.retryCount) || 0;

                // Give-up прямо тут до retry — старые/upstream-failed уже не спасти
                if (ageMs > MAX_AGE_MS || retryCount >= MAX_RETRIES) {
                    givenUp.push({ id: photo.id, ageH: Math.round(ageMs / 3600000), retries: retryCount });
                    continue; // не пушим в stillPending — выкидываем из queue
                }

                try {
                    const result = await Photos.uploadPhoto(
                        photo.data,
                        photo.clientId,
                        photo.date,
                        photo.mealId
                    );

                    if (result?.uploaded) {
                        await updatePhotoUrlInDay(photo.clientId, photo.date, photo.id, result.url);
                        log('📷 Pending photo uploaded:', photo.id);
                    } else {
                        stillPending.push({ ...photo, retryCount: retryCount + 1, lastTriedAt: now });
                    }
                } catch (err) {
                    // Раньше catch (_) silenced ошибку. Теперь log + bump retryCount,
                    // чтобы было видно почему фотки не уезжают.
                    console.warn('[HEYS.photos] upload failed for', photo.id, ':', err?.message || err);
                    stillPending.push({ ...photo, retryCount: retryCount + 1, lastTriedAt: now });
                }
            }

            global.localStorage.setItem(PENDING_PHOTOS_KEY, JSON.stringify(stillPending));

            if (givenUp.length > 0) {
                console.warn('[HEYS.photos] 🚮 Gave up on', givenUp.length, 'stuck photos:', givenUp);
            }
            if (stillPending.length < pending.length) {
                log('📷 Uploaded', pending.length - stillPending.length - givenUp.length, 'photos,',
                    stillPending.length, 'still pending,', givenUp.length, 'given up');
            }
        } catch (e) {
            logCritical('📷 uploadPendingPhotos error:', e?.message || e);
        }
    };

    Photos.deletePhoto = async function (path) {
        if (!path) {
            log('📷 deletePhoto: нет пути');
            return false;
        }

        if (!navigator.onLine) {
            log('📷 deletePhoto: offline');
            return false;
        }

        try {
            const result = await deleteViaYandex(path);
            if (result?.error) {
                logCritical('📷 deletePhoto error:', result.error);
                return false;
            }

            log('📷 Photo deleted from storage:', path);
            return true;
        } catch (e) {
            logCritical('📷 deletePhoto exception:', e?.message || e);
            return false;
        }
    };

    Photos.getPendingPhotos = function () {
        try {
            return JSON.parse(global.localStorage.getItem(PENDING_PHOTOS_KEY) || '[]');
        } catch (_) {
            return [];
        }
    };

    Photos.attachToCloud = function (cloud) {
        if (!cloud) return;
        _cloud = cloud;
        cloud.uploadPhoto = Photos.uploadPhoto;
        cloud.uploadPendingPhotos = Photos.uploadPendingPhotos;
        cloud.deletePhoto = Photos.deletePhoto;
        cloud.getPendingPhotos = Photos.getPendingPhotos;
    };

    if (HEYS.cloud) {
        Photos.attachToCloud(HEYS.cloud);
    }

    if (typeof global.addEventListener === 'function') {
        global.addEventListener('online', () => {
            log('🌐 Online detected, uploading pending photos...');
            setTimeout(() => Photos.uploadPendingPhotos(), 2000);
        });
    }
})(typeof window !== 'undefined' ? window : global);
