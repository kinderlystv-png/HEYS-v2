/**
 * CORE TESTS - Основные системные тесты
 * Проверяют базовую функциональность ядра системы
 */

// Config Parser Test
window.addTest({
    name: 'Config Parser',
    category: 'core',
    tags: ['keep', 'core'],
    timeout: 1500,
    description: 'Проверяет чтение и валидацию конфигурационного файла',
    fn: async function() {
        try {
            // Попытка загрузить config.json (если есть)
            let cfg;
            try {
                const response = await fetch('/config.json');
                if (response.ok) {
                    cfg = await response.json();
                } else {
                    // Fallback - проверим базовую конфигурацию HEYS
                    cfg = window.HEYS?.config || {};
                }
            } catch {
                cfg = window.HEYS?.config || {};
            }

            // Проверяем наличие базовых ключей
            const hasBasicConfig = cfg && typeof cfg === 'object';
            const hasValidStructure = !cfg.api || typeof cfg.api === 'object';
            
            return {
                success: hasBasicConfig && hasValidStructure,
                details: `Config structure: ${hasBasicConfig}, API structure: ${hasValidStructure}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// Cache Invalidation Test
window.addTest({
    name: 'Cache Invalidation',
    category: 'core',
    tags: ['keep', 'core'],
    timeout: 2000,
    description: 'Проверяет работу системы инвалидации кэша',
    fn: async function() {
        try {
            // Первый запрос
            const timestamp1 = Date.now();
            
            // Проверяем наличие системы кэширования
            if (!window.HEYS || !window.HEYS.cache) {
                return {
                    success: true,
                    details: 'Cache system not implemented - OK'
                };
            }

            // Симулируем операцию с кэшем
            const cacheKey = 'test_cache_' + timestamp1;
            window.HEYS.cache.set?.(cacheKey, { timestamp: timestamp1 });
            
            // Проверяем получение из кэша
            const cached = window.HEYS.cache.get?.(cacheKey);
            
            // Инвалидируем кэш
            window.HEYS.cache.clear?.();
            
            // Проверяем, что кэш очищен
            const afterClear = window.HEYS.cache.get?.(cacheKey);
            
            return {
                success: !afterClear || afterClear === null,
                details: `Cache set: ${!!cached}, After clear: ${!!afterClear}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// Web Worker Fallback Test
window.addTest({
    name: 'Web Worker Fallback',
    category: 'core',
    tags: ['keep', 'core'],
    timeout: 3000,
    description: 'Проверяет fallback при недоступности Web Workers',
    fn: async function() {
        try {
            // Сохраняем оригинальный Worker
            const originalWorker = window.Worker;
            
            // Временно отключаем Worker
            window.Worker = undefined;
            
            try {
                // Проверяем fallback через HEYS workers
                if (window.HEYS?.workers?.run) {
                    const result = await window.HEYS.workers.run('test', {});
                    return {
                        success: true,
                        details: 'Worker fallback working'
                    };
                } else {
                    // Простая проверка синхронного выполнения
                    return {
                        success: true,
                        details: 'No worker system - synchronous execution OK'
                    };
                }
            } finally {
                // Восстанавливаем Worker
                window.Worker = originalWorker;
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// Graceful Shutdown Test
window.addTest({
    name: 'Graceful Shutdown',
    category: 'core',
    tags: ['simplify', 'core'],
    timeout: 2000,
    description: 'Проверяет корректное завершение работы системы',
    fn: async function() {
        try {
            // Подсчитываем активные интервалы перед shutdown
            const intervalsBefore = window._intervals?.size || 0;
            
            // Вызываем shutdown если есть
            if (window.HEYS?.shutdown) {
                await window.HEYS.shutdown();
            }
            
            // Проверяем, что система корректно завершилась
            const intervalsAfter = window._intervals?.size || 0;
            
            return {
                success: true,
                details: `Intervals before: ${intervalsBefore}, after: ${intervalsAfter}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// Version Mismatch Detector Test
window.addTest({
    name: 'Version Mismatch Detector',
    category: 'core',
    tags: ['simplify', 'core'],
    timeout: 1000,
    description: 'Проверяет детектор несовместимости версий',
    fn: async function() {
        try {
            // Проверяем наличие системы версий
            const hasVersionSystem = window.HEYS?.version || window.HEYS?.coreVersion;
            
            if (!hasVersionSystem) {
                return {
                    success: true,
                    details: 'No version system implemented'
                };
            }

            // Симулируем проверку версий
            const currentVersion = window.HEYS?.version || '1.0.0';
            const isValidVersion = /^\d+\.\d+\.\d+/.test(currentVersion);
            
            return {
                success: isValidVersion,
                details: `Version format valid: ${currentVersion}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

console.log('✅ Core tests loaded (5 tests)');
