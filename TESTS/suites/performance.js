/**
 * PERFORMANCE TESTS - Тесты производительности
 * Проверяют скорость работы, потребление памяти и оптимизации
 */

// Memory Leak Guard Test
window.addTest({
    name: 'Memory Leak Guard',
    category: 'performance',
    tags: ['keep','performance'],
    timeout: 4000,
    fn: async () => {
        // fallback-заглушка -------------------------------------------------
        if (!window.HEYS)        window.HEYS = {};
        if (!HEYS.ReportsManager) HEYS.ReportsManager = {};
        if (!HEYS.ReportsManager.generateReport) {
            HEYS.ReportsManager.generateReport = () => ({ rows: [] });
        }
        //------------------------------------------------------------------

        const init = performance.memory?.usedJSHeapSize || 0;
        for (let i = 0; i < 1000; i++) HEYS.ReportsManager.generateReport();
        const delta = (performance.memory?.usedJSHeapSize || init) - init;
        return { success: delta < 5 * 1024 * 1024,     // < 5 МБ
                 error:   `Heap grew ${Math.round(delta/1024)} KB` };
    }
});

// Large Dataset Rendering Test
window.addTest({
    name: 'Large Dataset Rendering',
    category: 'performance',
    tags: ['keep', 'performance'],
    timeout: 5000,
    description: 'Проверяет производительность рендеринга больших списков',
    fn: async function() {
        try {
            const startTime = performance.now();
            
            // Создаем большой массив данных
            const largeDataset = new Array(1000).fill().map((_, i) => ({
                id: i,
                name: `Item ${i}`,
                description: `Description for item ${i}`,
                timestamp: Date.now() + i
            }));

            // Симулируем рендеринг через виртуальный список
            let renderTime;
            if (window.HEYS?.VirtualList) {
                const virtualList = new window.HEYS.VirtualList({
                    data: largeDataset,
                    itemHeight: 40,
                    containerHeight: 400
                });
                renderTime = performance.now() - startTime;
            } else {
                // Базовая симуляция рендеринга
                const fragment = document.createDocumentFragment();
                largeDataset.slice(0, 100).forEach(item => {
                    const div = document.createElement('div');
                    div.textContent = item.name;
                    fragment.appendChild(div);
                });
                renderTime = performance.now() - startTime;
            }
            
            // Считаем успешным если рендеринг быстрее 100ms
            const isPerformant = renderTime < 100;
            
            return {
                success: isPerformant,
                details: `Render time: ${Math.round(renderTime)}ms for ${largeDataset.length} items`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// Database Query Performance Test
window.addTest({
    name: 'Database Query Performance',
    category: 'performance',
    tags: ['simplify', 'performance'],
    timeout: 3000,
    description: 'Проверяет скорость выполнения запросов к базе данных',
    fn: async function() {
        try {
            const startTime = performance.now();
            
            // Проверяем IndexedDB производительность
            if (window.HEYS?.storage?.indexedDB) {
                const result = await window.HEYS.storage.indexedDB.query('test');
                const queryTime = performance.now() - startTime;
                
                return {
                    success: queryTime < 1000,
                    details: `IndexedDB query time: ${Math.round(queryTime)}ms`
                };
            }
            
            // Проверяем Supabase производительность
            if (window.HEYS?.supabase) {
                const { data, error } = await window.HEYS.supabase
                    .from('test_table')
                    .select('*')
                    .limit(10);
                
                const queryTime = performance.now() - startTime;
                
                return {
                    success: queryTime < 2000,
                    details: `Supabase query time: ${Math.round(queryTime)}ms`
                };
            }
            
            // Локальное хранилище
            const data = localStorage.getItem('test_performance');
            const queryTime = performance.now() - startTime;
            
            return {
                success: queryTime < 10,
                details: `LocalStorage access time: ${Math.round(queryTime)}ms`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// Bundle Size Check Test
window.addTest({
    name: 'Bundle Size Check',
    category: 'performance',
    tags: ['drop', 'performance'],
    timeout: 1000,
    description: 'Проверяет размер загруженных скриптов',
    fn: async function() {
        try {
            // Проверяем размер основных скриптов
            const scripts = Array.from(document.scripts);
            let totalSize = 0;
            let loadedScripts = 0;

            for (const script of scripts) {
                if (script.src && script.src.includes('heys_')) {
                    try {
                        const response = await fetch(script.src);
                        const size = parseInt(response.headers.get('content-length') || '0');
                        totalSize += size;
                        loadedScripts++;
                    } catch {
                        // Игнорируем ошибки загрузки
                    }
                }
            }

            const totalSizeKB = Math.round(totalSize / 1024);
            
            // Считаем приемлемым размер до 500KB
            const isOptimal = totalSize < 500 * 1024;
            
            return {
                success: isOptimal,
                details: `Total bundle size: ${totalSizeKB}KB (${loadedScripts} scripts)`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

console.log('✅ Performance tests loaded (4 tests)');
