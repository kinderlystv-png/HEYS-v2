// heys_app_shortcuts_v1.js — PWA deep-link/shortcut handling
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const openShareDB = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('heys-share-db', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('shared-images')) {
                db.createObjectStore('shared-images', { keyPath: 'id' });
            }
        };
    });

    const getAllFromStore = (store) => new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });

    const handleShortcuts = ({ setTab, setNotification, skipTabSwitchRef }) => {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const tabParam = params.get('tab');
        const shareReceived = params.get('share-received');

        // Очищаем URL в любом случае
        const url = new URL(window.location.href);
        let needsUrlCleanup = false;

        // 💳 Обработка возврата с ЮKassa (/payment-result?clientId=...)
        if (window.location.pathname === '/payment-result') {
            console.info('[HEYS.shortcuts] ✅ Payment result redirect detected');
            // Очищаем pathname → корень
            window.history.replaceState({}, '', '/' + window.location.search);

            // Запускаем проверку pending payment
            const checkPayment = async () => {
                const Subs = HEYS.Subscriptions;
                if (!Subs?.checkPendingPayment) {
                    // Модуль ещё не загружен — ждём
                    setTimeout(checkPayment, 300);
                    return;
                }
                try {
                    const result = await Subs.checkPendingPayment();
                    if (result.success) {
                        console.info('[HEYS.shortcuts] ✅ Payment confirmed:', result.plan);
                        if (typeof setNotification === 'function') {
                            setNotification({
                                message: '✅ Подписка успешно активирована!',
                                type: 'success',
                                duration: 5000,
                            });
                        }
                        // Обновляем статус подписки
                        if (HEYS.cloud?.syncClient) {
                            const clientId = params.get('clientId') || HEYS.currentClientId;
                            if (clientId) HEYS.cloud.syncClient(clientId);
                        }
                    } else if (result.pending) {
                        // Платёж ещё обрабатывается — запускаем polling
                        Subs.waitForPayment?.(
                            (res) => {
                                console.info('[HEYS.shortcuts] ✅ Payment polling success:', res.plan);
                                if (typeof setNotification === 'function') {
                                    setNotification({
                                        message: '✅ Подписка успешно активирована!',
                                        type: 'success',
                                        duration: 5000,
                                    });
                                }
                            },
                            (err) => {
                                console.error('[HEYS.shortcuts] ❌ Payment polling failed:', err);
                                if (typeof setNotification === 'function') {
                                    setNotification({
                                        message: '❌ Не удалось подтвердить оплату. Обратитесь в поддержку.',
                                        type: 'error',
                                        duration: 8000,
                                    });
                                }
                            }
                        );
                    } else {
                        console.warn('[HEYS.shortcuts] ⚠️ Payment not found or failed:', result);
                    }
                } catch (err) {
                    console.error('[HEYS.shortcuts] ❌ checkPendingPayment error:', err);
                }
            };

            setTimeout(checkPayment, 500);
            return; // Не продолжаем обработку других shortcut-ов
        }

        if (action === 'add-meal') {
            // Блокируем переключение вкладки при смене clientId
            if (skipTabSwitchRef) skipTabSwitchRef.current = true;
            needsUrlCleanup = true;

            // Переключаемся на вкладку stats (там DayTab)
            setTab('stats');

            // Ждём пока DayTab смонтируется и вызываем addMeal
            const tryAddMeal = () => {
                if (window.HEYS?.Day?.addMeal) {
                    window.HEYS.Day.addMeal();
                    // Вибрация при успешном открытии
                    if (navigator.vibrate) navigator.vibrate(15);
                    // Сбрасываем флаг после небольшой задержки
                    setTimeout(() => { if (skipTabSwitchRef) skipTabSwitchRef.current = false; }, 500);
                } else {
                    // Повторяем через 100ms если DayTab ещё не готов
                    setTimeout(tryAddMeal, 100);
                }
            };
            // Даём время на рендер
            setTimeout(tryAddMeal, 150);
        } else if (action === 'add-water') {
            // 🆕 Shortcut для добавления воды
            if (skipTabSwitchRef) skipTabSwitchRef.current = true;
            needsUrlCleanup = true;
            setTab('stats');

            const tryAddWater = () => {
                if (window.HEYS?.Day?.addWater) {
                    window.HEYS.Day.addWater(250); // Добавляем 250мл по умолчанию
                    if (navigator.vibrate) navigator.vibrate(15);
                    setTimeout(() => { if (skipTabSwitchRef) skipTabSwitchRef.current = false; }, 500);
                } else {
                    setTimeout(tryAddWater, 100);
                }
            };
            setTimeout(tryAddWater, 150);
        } else if (shareReceived === 'true') {
            // 🆕 Share Target API — обработка поделённых изображений
            needsUrlCleanup = true;

            // Открываем IndexedDB и получаем поделённые изображения
            const processSharedImages = async () => {
                try {
                    const db = await openShareDB();
                    const tx = db.transaction('shared-images', 'readonly');
                    const store = tx.objectStore('shared-images');
                    const images = await getAllFromStore(store);

                    if (images.length > 0) {
                        // Вибрация при получении
                        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

                        // Показываем уведомление пользователю
                        if (typeof setNotification === 'function') {
                            setNotification({
                                message: `📤 Получено ${images.length} фото`,
                                type: 'success',
                                duration: 3000,
                            });
                        }

                        // Переходим на вкладку дня для добавления еды
                        if (skipTabSwitchRef) skipTabSwitchRef.current = true;
                        setTab('stats');
                        setTimeout(() => {
                            if (skipTabSwitchRef) skipTabSwitchRef.current = false;
                            // TODO: Открыть модал добавления еды с превью изображения
                            if (window.HEYS?.Day?.addMeal) {
                                window.HEYS.Day.addMeal();
                            }
                        }, 500);

                        // Очищаем использованные изображения
                        const clearTx = db.transaction('shared-images', 'readwrite');
                        const clearStore = clearTx.objectStore('shared-images');
                        for (const img of images) {
                            clearStore.delete(img.id);
                        }
                    }
                } catch (err) {
                    HEYS.analytics?.trackError?.(err, { context: 'share-target' });
                }
            };

            processSharedImages();
        } else if (tabParam) {
            // 🆕 Shortcut для переключения вкладок: ?tab=day, ?tab=stats и т.д.
            needsUrlCleanup = true;
            const validTabs = ['stats', 'ration', 'user', 'day'];
            const mappedTab = tabParam === 'day' ? 'stats' : tabParam;
            if (validTabs.includes(mappedTab)) {
                if (skipTabSwitchRef) skipTabSwitchRef.current = true;
                setTab(mappedTab);
                setTimeout(() => { if (skipTabSwitchRef) skipTabSwitchRef.current = false; }, 500);
            }
        }

        // Чистим URL параметры
        if (needsUrlCleanup) {
            url.searchParams.delete('action');
            url.searchParams.delete('tab');
            url.searchParams.delete('share-received');
            window.history.replaceState({}, '', url.pathname + url.search);
        }

        return undefined;
    };

    HEYS.AppShortcuts = {
        handleShortcuts,
    };
})();
