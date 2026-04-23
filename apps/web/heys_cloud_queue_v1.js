// heys_cloud_queue_v1.js — persistent queues and upload scheduling
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const cloud = HEYS.cloud = HEYS.cloud || {};

  function getLogger() {
    const logger = cloud._log || {};
    return {
      log: logger.log || function () { },
      logCritical: logger.logCritical || function () { }
    };
  }

  HEYS.CloudQueue = HEYS.CloudQueue || {};

  HEYS.CloudQueue.init = function () {
    const { log, logCritical } = getLogger();
    const trackError = (err, context) => HEYS.analytics?.trackError?.(err, context);

    const storageUtils = cloud._storageUtils || {};
    const loadPendingQueue = storageUtils.loadPendingQueue || function () { return []; };
    const savePendingQueue = storageUtils.savePendingQueue || function () { };

    const PENDING_QUEUE_KEY = 'heys_pending_sync_queue';
    const PENDING_CLIENT_QUEUE_KEY = 'heys_pending_client_sync_queue';

    let clientUpsertQueue = loadPendingQueue(PENDING_CLIENT_QUEUE_KEY);
    let clientUpsertTimer = null;
    let _uploadInProgress = false;
    let _uploadInFlightCount = 0;

    let upsertQueue = loadPendingQueue(PENDING_QUEUE_KEY);
    let upsertTimer = null;

    const getInternal = () => cloud._internal || {};

    function getUser() {
      return getInternal().getUser ? getInternal().getUser() : null;
    }

    function getRpcOnlyMode() {
      return getInternal().getRpcOnlyMode ? getInternal().getRpcOnlyMode() : false;
    }

    function getPinAuthClientId() {
      return getInternal().getPinAuthClientId ? getInternal().getPinAuthClientId() : null;
    }

    function getRetryDelay() {
      return getInternal().getRetryDelay ? getInternal().getRetryDelay() : 1000;
    }

    function resetRetry() {
      if (getInternal().resetRetry) getInternal().resetRetry();
    }

    function incrementRetry() {
      if (getInternal().incrementRetry) getInternal().incrementRetry();
    }

    function notifyPendingChange() {
      if (getInternal().notifyPendingChange) getInternal().notifyPendingChange();
    }

    function notifySyncCompletedIfDrained() {
      if (getInternal().notifySyncCompletedIfDrained) getInternal().notifySyncCompletedIfDrained();
    }

    function notifySyncError(error, retryIn) {
      if (getInternal().notifySyncError) getInternal().notifySyncError(error, retryIn);
    }

    function isAuthError(error) {
      if (getInternal().isAuthError) return getInternal().isAuthError(error);
      return false;
    }

    function handleAuthFailure(err) {
      if (getInternal().handleAuthFailure) getInternal().handleAuthFailure(err);
    }

    function setSyncProgressDone(count) {
      if (getInternal().addSyncProgressDone) getInternal().addSyncProgressDone(count);
    }

    async function doClientUpload(batch) {
      if (!batch.length) {
        _uploadInProgress = false;
        _uploadInFlightCount = 0;
        notifySyncCompletedIfDrained();
        return;
      }

      _uploadInProgress = true;
      _uploadInFlightCount = batch.length;

      // Sync trace for dayv2 items in batch
      const _dayItems = batch.filter(it => it?.k?.includes('dayv2_'));
      if (_dayItems.length > 0) {
        _dayItems.forEach(it => {
          const _v = it.v;
          const _mCnt = Array.isArray(_v?.meals) ? _v.meals.length : '?';
          const _iCnt = Array.isArray(_v?.meals) ? _v.meals.reduce((s, m) => s + (m.items?.length || 0), 0) : '?';
          (window.console || console).info('[HEYS.syncTrace] UPLOAD_START_dayv2', { key: it.k, meals: _mCnt, items: _iCnt, updatedAt: _v?.updatedAt, batchTotal: batch.length });
        });
      }

      const canSync = getRpcOnlyMode();
      log('🔐 [UPLOAD] canSync check:', { _rpcOnlyMode: getRpcOnlyMode(), hasUser: !!getUser(), batchLen: batch.length, canSync });
      if (!canSync) {
        log('⚠️ [UPLOAD] canSync=false, returning batch to queue');
        if (_dayItems.length > 0) {
          (window.console || console).warn('[HEYS.syncTrace] UPLOAD_BLOCKED_canSync', { dayKeys: _dayItems.map(it => it.k), reason: 'canSync=false' });
        }
        clientUpsertQueue.push(...batch);
        _uploadInProgress = false;
        _uploadInFlightCount = 0;
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        notifySyncCompletedIfDrained();
        return;
      }

      if (!navigator.onLine) {
        clientUpsertQueue.push(...batch);
        _uploadInProgress = false;
        _uploadInFlightCount = 0;
        incrementRetry();
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        scheduleClientPush();
        notifySyncCompletedIfDrained();
        return;
      }

      const uniqueBatch = [];
      const seenKeys = new Set();
      for (let i = batch.length - 1; i >= 0; i--) {
        const item = batch[i];
        const key = `${item.client_id}:${item.k}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueBatch.unshift(item);
        }
      }

      try {
        if (getRpcOnlyMode()) {
          const byClientId = {};
          uniqueBatch.forEach(item => {
            const cid = item.client_id;
            if (!byClientId[cid]) byClientId[cid] = [];
            byClientId[cid].push({ k: item.k, v: item.v, updated_at: item.updated_at });
          });

          log('🔐 [UPLOAD] RPC mode: grouped by clientId:', Object.keys(byClientId).map(c => c.slice(0, 8)));

          let totalSaved = 0;
          let anyError = null;
          let isAuthErrorFlag = false;
          for (const [clientId, items] of Object.entries(byClientId)) {
            const result = await cloud.saveClientViaRPC(clientId, items);
            if (result.success) {
              totalSaved += result.saved || items.length;
            } else {
              anyError = result.error;
              if (anyError === 'No auth token available' || anyError === 'No session token') {
                isAuthErrorFlag = true;
              }
              items.forEach(item => clientUpsertQueue.push({ ...item, client_id: clientId }));
            }
          }

          if (anyError) {
            incrementRetry();
            savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
            notifyPendingChange();

            if (_dayItems.length > 0) {
              (window.console || console).warn('[HEYS.syncTrace] UPLOAD_FAIL_dayv2', { dayKeys: _dayItems.map(it => it.k), error: String(anyError), isAuth: isAuthErrorFlag });
            }

            if (isAuthErrorFlag) {
              log('⚠️ [UPLOAD] Auth error, NOT retrying — waiting for login');
            } else if ((getInternal().retryAttempt || 0) < (getInternal().maxRetryAttempts || 5)) {
              scheduleClientPush();
            } else {
              log('⚠️ [UPLOAD] Max retries reached, data saved locally');
            }
          } else {
            resetRetry();
            logCritical(`☁️ [YANDEX] Сохранено в облако: ${totalSaved} записей`);
            if (_dayItems.length > 0) {
              _dayItems.forEach(it => {
                (window.console || console).info('[HEYS.syncTrace] UPLOAD_OK_dayv2', { key: it.k, saved: totalSaved });
              });
            }
          }

          // FIX: если во время загрузки в очередь добавились новые элементы — запланировать следующую отправку
          if (clientUpsertQueue.length > 0) scheduleClientPush();

          savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
          notifyPendingChange();

          _uploadInProgress = false;
          _uploadInFlightCount = 0;
          notifySyncCompletedIfDrained();
          return;
        }

        if (!getUser()) {
          log('⚠️ [SAVE] No user session, returning items to queue');
          clientUpsertQueue.push(...uniqueBatch);
          savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
          notifyPendingChange();
          _uploadInProgress = false;
          _uploadInFlightCount = 0;
          notifySyncCompletedIfDrained();
          return;
        }

        const promises = uniqueBatch.map(item => {
          const itemWithUser = item.user_id ? item : { ...item, user_id: getUser()?.id };
          return cloud.upsert('client_kv_store', itemWithUser, 'client_id,k')
            .then(() => ({ success: true, item: itemWithUser }))
            .catch(err => {
              trackError(err || new Error('Upsert error'), { source: 'heys_cloud_queue_v1.js', key: itemWithUser?.k });
              log('⚠️ [UPLOAD] Upsert error for key:', itemWithUser?.k);
              return { success: false, item: itemWithUser, error: err };
            });
        });

        const results = await Promise.all(promises);
        const failedItems = results.filter(r => !r.success).map(r => r.item);
        const successItems = results.filter(r => r.success).map(r => r.item);

        if (failedItems.length > 0) {
          clientUpsertQueue.push(...failedItems);
          incrementRetry();
          savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
          notifyPendingChange();

          const authError = results.find(r => !r.success && isAuthError(r.error))?.error;
          if (authError) {
            handleAuthFailure(authError);
            _uploadInProgress = false;
            _uploadInFlightCount = 0;
            notifySyncCompletedIfDrained();
            return;
          }

          scheduleClientPush();
        } else {
          resetRetry();
        }

        if (successItems.length > 0) {
          const types = {};
          const otherKeys = [];
          successItems.forEach(item => {
            const t = item.k.includes('dayv2_') ? 'day' :
              item.k.includes('products') ? 'products' :
                item.k.includes('profile') ? 'profile' : 'other';
            types[t] = (types[t] || 0) + 1;
            if (t === 'other') otherKeys.push(item.k);
          });
          const summary = Object.entries(types).map(([k, v]) => `${k}:${v}`).join(' ');
          logCritical('☁️ Сохранено в облако:', summary);
          if (otherKeys.length > 0) {
            logCritical('  └ other keys:', otherKeys.join(', '));
          }

          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('heys:data-uploaded', { detail: { saved: successItems.length } }));
          }
        }

        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
      } catch (e) {
        clientUpsertQueue.push(...uniqueBatch);
        incrementRetry();
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        trackError(e instanceof Error ? e : new Error(String(e)), { source: 'heys_cloud_queue_v1.js', stage: 'doClientUpload' });
        logCritical('❌ Ошибка сохранения в облако:', e.message || e);

        if (isAuthError(e)) {
          handleAuthFailure(e);
          _uploadInProgress = false;
          _uploadInFlightCount = 0;
          notifySyncCompletedIfDrained();
          return;
        }

        if (typeof window !== 'undefined' && window.dispatchEvent) {
          const retryIn = Math.min(5, Math.ceil(getRetryDelay() / 1000));
          notifySyncError(e, retryIn);
        }

        scheduleClientPush();
      }

      // FIX: если во время загрузки в очередь добавились новые элементы — запланировать следующую отправку
      if (clientUpsertQueue.length > 0) scheduleClientPush();

      setSyncProgressDone(uniqueBatch.length);

      _uploadInProgress = false;
      _uploadInFlightCount = 0;

      notifySyncCompletedIfDrained();
    }

    async function doImmediateClientUpload() {
      if (clientUpsertTimer) {
        clearTimeout(clientUpsertTimer);
        clientUpsertTimer = null;
      }

      const batch = clientUpsertQueue.splice(0, clientUpsertQueue.length);
      savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
      notifyPendingChange();

      await doClientUpload(batch);
    }

    function scheduleClientPush() {
      if (clientUpsertTimer) return;

      savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
      notifyPendingChange();

      const delay = navigator.onLine ? 500 : getRetryDelay();

      clientUpsertTimer = setTimeout(async () => {
        const batch = clientUpsertQueue.splice(0, clientUpsertQueue.length);
        clientUpsertTimer = null;
        await doClientUpload(batch);
      }, delay);
    }

    function schedulePush() {
      if (upsertTimer) return;

      savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
      notifyPendingChange();

      const delay = navigator.onLine ? 300 : getRetryDelay();

      upsertTimer = setTimeout(async () => {
        const batch = upsertQueue.splice(0, upsertQueue.length);
        upsertTimer = null;
        if (!cloud.client || !getUser() || !batch.length) {
          savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
          notifyPendingChange();
          return;
        }

        if (!navigator.onLine) {
          upsertQueue.push(...batch);
          incrementRetry();
          savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
          notifyPendingChange();
          schedulePush();
          return;
        }

        const uniqueBatch = [];
        const seenKeys = new Set();
        for (let i = batch.length - 1; i >= 0; i--) {
          const item = batch[i];
          const key = `${item.user_id}:${item.k}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueBatch.unshift(item);
          }
        }

        try {
          const { error } = await YandexAPI.from('kv_store').upsert(uniqueBatch, { onConflict: 'user_id,k' });
          if (error) {
            upsertQueue.push(...uniqueBatch);
            incrementRetry();
            savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
            notifyPendingChange();
            if (isAuthError(error)) {
              handleAuthFailure(error);
              return;
            }
            notifySyncError(error, Math.min(5, Math.ceil(getRetryDelay() / 1000)));
            schedulePush();
            return;
          }
          resetRetry();
          savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
          notifyPendingChange();
        } catch (e) {
          upsertQueue.push(...uniqueBatch);
          incrementRetry();
          savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
          notifyPendingChange();
          if (isAuthError(e)) {
            handleAuthFailure(e);
            return;
          }
          notifySyncError(e, Math.min(5, Math.ceil(getRetryDelay() / 1000)));
          schedulePush();
        }

        setSyncProgressDone(uniqueBatch.length);
        notifySyncCompletedIfDrained();
      }, delay);
    }

    cloud.getPendingCount = function () {
      const isClientOnlyMode = getRpcOnlyMode() && getPinAuthClientId();
      const userQueueLen = isClientOnlyMode ? 0 : upsertQueue.length;
      return clientUpsertQueue.length + userQueueLen + (_uploadInProgress ? _uploadInFlightCount : 0);
    };

    cloud.isUploadInProgress = function () {
      return _uploadInProgress;
    };

    cloud.getPendingDetails = function () {
      const details = { days: 0, products: 0, profile: 0, other: 0 };

      const allItems = [...clientUpsertQueue, ...upsertQueue];
      allItems.forEach(item => {
        const k = item.k || '';
        if (k.includes('dayv2_')) details.days++;
        else if (k.includes('products')) details.products++;
        else if (k.includes('profile')) details.profile++;
        else details.other++;
      });

      return details;
    };

    cloud.flushPendingQueue = async function (timeoutMs = 5000) {
      const isClientOnlyMode = getRpcOnlyMode() && getPinAuthClientId();
      const clientQueueLen = clientUpsertQueue.length;
      const userQueueLen = isClientOnlyMode ? 0 : upsertQueue.length;
      const queueLen = clientQueueLen + userQueueLen;
      const inFlight = _uploadInProgress ? _uploadInFlightCount : 0;
      const total = queueLen + inFlight;

      log(`🔄 [FLUSH] Check: clientQueue=${clientQueueLen}, userQueue=${upsertQueue.length}${isClientOnlyMode ? ' (ignored in PIN mode)' : ''}, inFlight=${inFlight}`);

      if (queueLen === 0 && !_uploadInProgress) {
        log('✅ [FLUSH] Queue already empty and no uploads in progress');
        return true;
      }

      log(`🔄 [FLUSH] Need to upload ${total} pending items IMMEDIATELY...`);

      if (queueLen > 0) {
        log('🔄 [FLUSH] Starting IMMEDIATE upload (no debounce)...');
        try {
          await doImmediateClientUpload();
          log('✅ [FLUSH] Immediate upload completed');
        } catch (e) {
          trackError(e instanceof Error ? e : new Error(String(e)), { source: 'heys_cloud_queue_v1.js', stage: 'flushPendingQueue' });
          log('❌ [FLUSH] Immediate upload failed');
        }
      }

      const stillClientQueue = clientUpsertQueue.length;
      const stillUserQueue = isClientOnlyMode ? 0 : upsertQueue.length;
      const stillInQueue = stillClientQueue + stillUserQueue;
      if (stillInQueue === 0 && !_uploadInProgress) {
        log('✅ [FLUSH] All uploaded after immediate push');
        return true;
      }

      log(`🔄 [FLUSH] ${stillInQueue} items still pending (client=${stillClientQueue}, user=${stillUserQueue}), waiting for queue-drained event...`);

      return new Promise((resolve) => {
        const startTime = Date.now();

        const timeoutId = setTimeout(() => {
          const stillPending = cloud.getPendingCount();
          log(`⚠️ [FLUSH] Timeout after ${timeoutMs}ms, ${stillPending} items still pending, inFlight=${_uploadInProgress}`);
          window.removeEventListener('heys:queue-drained', handler);
          resolve(false);
        }, timeoutMs);

        const handler = () => {
          if (_uploadInProgress) {
            log('🔄 [FLUSH] queue-drained fired but upload still in progress, waiting...');
            return;
          }
          clearTimeout(timeoutId);
          const elapsed = Date.now() - startTime;
          log(`✅ [FLUSH] Queue drained in ${elapsed}ms`);
          window.removeEventListener('heys:queue-drained', handler);
          resolve(true);
        };
        window.addEventListener('heys:queue-drained', handler);

        if (stillInQueue === 0 && _uploadInProgress) {
          log('🔄 [FLUSH] Queue empty but upload in progress, waiting for completion...');
        }
      });
    };

    /**
     * Статус синка для конкретного ключа в client upsert queue.
     * Не вызывать без key как «глобальный» статус — для UI используйте getPendingCount / isUploadInProgress.
     */
    cloud.getSyncStatus = function (key) {
      if (clientUpsertQueue.some(item => item.k === key)) {
        return 'pending';
      }
      return 'synced';
    };

    cloud.waitForSync = function (key, timeout = 5000) {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const checkSync = () => {
          if (cloud.getSyncStatus(key) === 'synced' || (Date.now() - startTime) > timeout) {
            resolve(cloud.getSyncStatus(key));
          } else {
            setTimeout(checkSync, 100);
          }
        };
        checkSync();
      });
    };

    cloud._queue = {
      getClientQueue: () => clientUpsertQueue,
      getUserQueue: () => upsertQueue,
      scheduleClientPush,
      schedulePush,
      doImmediateClientUpload
    };
  };
})(window);
