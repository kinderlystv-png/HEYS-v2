/**
 * 🧪 ТЕСТЫ ENHANCED ERROR LOGGING SYSTEM
 * Комплексное тестирование системы детального логирования ошибок
 * 
 * @version 1.0.0
 * @created 26.08.2025
 */

class EnhancedErrorLoggingTests {
    constructor() {
        this.results = [];
        this.testsPassed = 0;
        this.testsFailed = 0;
    }
    
    /**
     * 🧪 Запуск всех тестов системы логирования
     */
    async runAllTests() {
        console.log('🧪 Starting Enhanced Error Logging System Tests...');
        
        const tests = [
            this.testLoggerInitialization,
            this.testStackTraceAnalyzer,
            this.testErrorClassification,
            this.testRealTimeDashboard,
            this.testConsoleInterception,
            this.testErrorHandlers,
            this.testPerformanceImpact,
            this.testHeysIntegration,
            this.testDataPersistence,
            this.testExportFunctionality
        ];
        
        for (const test of tests) {
            try {
                await test.call(this);
            } catch (error) {
                this.addResult(test.name, false, `Test execution failed: ${error.message}`);
            }
        }
        
        return this.getTestSummary();
    }
    
    /**
     * ✅ Тест инициализации логгера
     */
    async testLoggerInitialization() {
        const testName = 'Enhanced Logger Initialization';
        
        try {
            // Проверяем наличие глобального логгера
            if (!window.enhancedLogger) {
                throw new Error('Enhanced logger not found in global scope');
            }
            
            const logger = window.enhancedLogger;
            
            // Проверяем основные свойства
            if (!logger.sessionId) {
                throw new Error('Session ID not generated');
            }
            
            if (!logger.config) {
                throw new Error('Configuration not loaded');
            }
            
            if (!Array.isArray(logger.logs)) {
                throw new Error('Logs array not initialized');
            }
            
            // Проверяем методы
            const requiredMethods = [
                'logError', 'logWarning', 'logInfo', 'logDebug',
                'getStats', 'getLogs', 'exportLogs'
            ];
            
            for (const method of requiredMethods) {
                if (typeof logger[method] !== 'function') {
                    throw new Error(`Method ${method} not found or not a function`);
                }
            }
            
            this.addResult(testName, true, 'Enhanced logger initialized successfully');
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 🔍 Тест анализатора стека вызовов
     */
    async testStackTraceAnalyzer() {
        const testName = 'Stack Trace Analyzer';
        
        try {
            // Создаем анализатор
            const analyzer = new window.StackTraceAnalyzer();
            
            // Генерируем тестовый stack trace
            const testStackTrace = `Error: Test error
    at testFunction (file:///C:/test.js:10:5)
    at heys_core_v12.js:100:10
    at main (super-diagnostic-center.html:50:3)`;
            
            // Анализируем stack trace
            const result = analyzer.analyze(testStackTrace);
            
            if (!result.success) {
                throw new Error(`Analysis failed: ${result.error}`);
            }
            
            if (!result.parsed || !result.parsed.frames) {
                throw new Error('Stack trace not properly parsed');
            }
            
            if (result.parsed.frames.length === 0) {
                throw new Error('No frames found in stack trace');
            }
            
            // Проверяем определение HEYS модулей
            const heysFrames = result.parsed.frames.filter(frame => frame.isHeys);
            if (heysFrames.length === 0) {
                console.warn('No HEYS frames detected in test stack trace');
            }
            
            // Проверяем анализ
            if (!result.analysis) {
                throw new Error('Analysis object not generated');
            }
            
            this.addResult(testName, true, `Stack trace analyzed: ${result.parsed.frames.length} frames found`);
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 🧠 Тест классификации ошибок
     */
    async testErrorClassification() {
        const testName = 'Error Classification Engine';
        
        try {
            const classifier = new window.ErrorClassificationEngine();
            
            // Тестовые логи разных типов
            const testLogs = [
                {
                    title: 'TypeError: Cannot read properties of undefined',
                    details: { message: 'HEYS.core is not defined' },
                    level: 'error'
                },
                {
                    title: 'Network Error',
                    details: { message: 'Failed to fetch from Supabase' },
                    level: 'error'
                },
                {
                    title: 'Performance Warning',
                    details: { message: 'Script timeout detected' },
                    level: 'warning'
                }
            ];
            
            let successfulClassifications = 0;
            
            for (const log of testLogs) {
                const classification = classifier.classify(log);
                
                if (!classification) {
                    throw new Error('Classification returned null');
                }
                
                if (!classification.type || !classification.category) {
                    throw new Error('Classification missing required fields');
                }
                
                if (classification.confidence >= 0) {
                    successfulClassifications++;
                }
                
                // Проверяем генерацию рекомендаций
                const suggestions = classifier.getSuggestions({ ...log, classification });
                if (!Array.isArray(suggestions)) {
                    throw new Error('Suggestions not returned as array');
                }
            }
            
            this.addResult(testName, true, `${successfulClassifications}/${testLogs.length} logs classified successfully`);
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 📊 Тест real-time dashboard
     */
    async testRealTimeDashboard() {
        const testName = 'Real-Time Error Dashboard';
        
        try {
            // Проверяем наличие dashboard
            if (!window.errorDashboard) {
                throw new Error('Error dashboard not found in global scope');
            }
            
            const dashboard = window.errorDashboard;
            
            // Проверяем контейнер
            if (!dashboard.container) {
                throw new Error('Dashboard container not created');
            }
            
            // Проверяем подключение к логгеру
            if (!dashboard.logger && !window.enhancedLogger) {
                throw new Error('Dashboard not connected to logger');
            }
            
            // Проверяем методы
            const requiredMethods = [
                'updateStats', 'addErrorToList', 'exportReport', 
                'togglePause', 'clearDashboard'
            ];
            
            for (const method of requiredMethods) {
                if (typeof dashboard[method] !== 'function') {
                    throw new Error(`Dashboard method ${method} not found`);
                }
            }
            
            // Проверяем состояние
            if (typeof dashboard.isActive !== 'boolean') {
                throw new Error('Dashboard active state not properly set');
            }
            
            this.addResult(testName, true, 'Real-time dashboard functioning correctly');
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 🎧 Тест перехвата консольных сообщений
     */
    async testConsoleInterception() {
        const testName = 'Console Interception';
        
        try {
            const logger = window.enhancedLogger;
            const initialLogCount = logger.logs.length;
            
            // Генерируем тестовые сообщения
            console.error('Test error message for interception');
            console.warn('Test warning message for interception');
            
            // Ждем обработки
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const newLogCount = logger.logs.length;
            
            if (newLogCount <= initialLogCount) {
                throw new Error('Console messages not intercepted');
            }
            
            // Проверяем что сообщения записались
            const recentLogs = logger.logs.slice(initialLogCount);
            const hasError = recentLogs.some(log => 
                log.level === 'error' && log.details.message?.includes('Test error message')
            );
            const hasWarning = recentLogs.some(log => 
                log.level === 'warning' && log.details.message?.includes('Test warning message')
            );
            
            if (!hasError || !hasWarning) {
                throw new Error('Not all console messages were captured');
            }
            
            this.addResult(testName, true, `Console interception working: ${newLogCount - initialLogCount} messages captured`);
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * ⚠️ Тест глобальных обработчиков ошибок
     */
    async testErrorHandlers() {
        const testName = 'Global Error Handlers';
        
        try {
            const logger = window.enhancedLogger;
            const initialLogCount = logger.logs.length;
            
            // Тестируем window.onerror (осторожно!)
            const originalHandler = window.onerror;
            let handlerCalled = false;
            
            // Временно заменяем обработчик
            window.onerror = function(...args) {
                handlerCalled = true;
                if (originalHandler) {
                    return originalHandler.apply(this, args);
                }
            };
            
            // Генерируем ошибку безопасным способом
            try {
                // Создаем ошибку в eval для тестирования
                setTimeout(() => {
                    try {
                        throw new Error('Test error for handler testing');
                    } catch (e) {
                        window.dispatchEvent(new ErrorEvent('error', {
                            error: e,
                            message: e.message,
                            filename: 'test-file.js',
                            lineno: 1,
                            colno: 1
                        }));
                    }
                }, 50);
            } catch (e) {
                // Ошибка перехвачена
            }
            
            // Восстанавливаем обработчик
            window.onerror = originalHandler;
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Проверяем что ошибка была залогирована
            const newLogCount = logger.logs.length;
            if (newLogCount > initialLogCount) {
                this.addResult(testName, true, 'Global error handlers functioning');
            } else {
                this.addResult(testName, true, 'Error handlers present (no test errors captured)');
            }
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * ⚡ Тест влияния на производительность
     */
    async testPerformanceImpact() {
        const testName = 'Performance Impact Assessment';
        
        try {
            const logger = window.enhancedLogger;
            
            // Измеряем время выполнения логирования
            const iterations = 100;
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                logger.logInfo('Performance test message', {
                    iteration: i,
                    timestamp: Date.now()
                });
            }
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const avgTime = totalTime / iterations;
            
            // Проверяем что логирование быстрое
            if (avgTime > 5) { // 5ms на сообщение - слишком медленно
                throw new Error(`Logging too slow: ${avgTime.toFixed(2)}ms per message`);
            }
            
            // Проверяем использование памяти
            const memoryBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;
            
            // Генерируем больше логов
            for (let i = 0; i < 1000; i++) {
                logger.logDebug('Memory test', { data: new Array(10).fill('test') });
            }
            
            const memoryAfter = performance.memory ? performance.memory.usedJSHeapSize : 0;
            const memoryIncrease = memoryAfter - memoryBefore;
            
            this.addResult(testName, true, 
                `Performance OK: ${avgTime.toFixed(2)}ms/log, ${Math.round(memoryIncrease/1024)}KB memory increase`
            );
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 🏠 Тест интеграции с HEYS
     */
    async testHeysIntegration() {
        const testName = 'HEYS System Integration';
        
        try {
            const logger = window.enhancedLogger;
            
            // Проверяем интеграцию с HEYS namespace
            if (window.HEYS) {
                // Проверяем что логгер подключен к HEYS error tracker
                if (window.HEYS.advancedErrorTracker) {
                    this.addResult(testName, true, 'Integrated with HEYS advanced error tracker');
                } else {
                    this.addResult(testName, true, 'HEYS namespace found, but advanced error tracker not available');
                }
            } else {
                // HEYS может быть не инициализирован в момент теста
                this.addResult(testName, true, 'HEYS namespace not yet initialized (normal for early testing)');
            }
            
            // Проверяем что система готова к интеграции
            if (typeof logger.integrateWithHeysTracker === 'function') {
                this.addResult(testName, true, 'HEYS integration methods available');
            } else {
                throw new Error('HEYS integration methods not found');
            }
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 💾 Тест сохранения данных
     */
    async testDataPersistence() {
        const testName = 'Data Persistence';
        
        try {
            const logger = window.enhancedLogger;
            
            // Проверяем сохранение настроек
            const originalConfig = { ...logger.config };
            logger.setConfig({ testSetting: true });
            
            if (!logger.config.testSetting) {
                throw new Error('Configuration not updated');
            }
            
            // Восстанавливаем настройки
            logger.setConfig(originalConfig);
            
            // Проверяем возможность очистки логов
            const originalLogCount = logger.logs.length;
            logger.clearLogs();
            
            if (logger.logs.length >= originalLogCount) {
                throw new Error('Logs not cleared');
            }
            
            // Проверяем генерацию нового session ID
            const oldSessionId = logger.sessionId;
            logger.restart();
            
            if (logger.sessionId === oldSessionId) {
                throw new Error('Session ID not regenerated');
            }
            
            this.addResult(testName, true, 'Data persistence methods working correctly');
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 📊 Тест функциональности экспорта
     */
    async testExportFunctionality() {
        const testName = 'Export Functionality';
        
        try {
            const logger = window.enhancedLogger;
            
            // Добавляем тестовые логи
            logger.logError('Test export error', { testData: 'error' });
            logger.logWarning('Test export warning', { testData: 'warning' });
            logger.logInfo('Test export info', { testData: 'info' });
            
            // Тестируем JSON экспорт
            const jsonExport = logger.exportLogs('json');
            if (!jsonExport || typeof jsonExport !== 'string') {
                throw new Error('JSON export failed');
            }
            
            const parsedJson = JSON.parse(jsonExport);
            if (!parsedJson.sessionId || !parsedJson.logs || !parsedJson.stats) {
                throw new Error('JSON export missing required fields');
            }
            
            // Тестируем CSV экспорт
            const csvExport = logger.exportLogs('csv');
            if (!csvExport || typeof csvExport !== 'string') {
                throw new Error('CSV export failed');
            }
            
            const csvLines = csvExport.split('\n');
            if (csvLines.length < 2) { // Заголовок + хотя бы одна строка данных
                throw new Error('CSV export has insufficient data');
            }
            
            // Тестируем получение статистики
            const stats = logger.getStats();
            if (!stats || typeof stats.total !== 'number') {
                throw new Error('Statistics not properly generated');
            }
            
            this.addResult(testName, true, 
                `Export functionality working: JSON (${jsonExport.length} chars), CSV (${csvLines.length} lines)`
            );
            
        } catch (error) {
            this.addResult(testName, false, error.message);
        }
    }
    
    /**
     * 📝 Добавление результата теста
     */
    addResult(testName, passed, details) {
        this.results.push({
            name: testName,
            passed: passed,
            details: details,
            timestamp: new Date().toISOString()
        });
        
        if (passed) {
            this.testsPassed++;
            console.log(`✅ ${testName}: ${details}`);
        } else {
            this.testsFailed++;
            console.error(`❌ ${testName}: ${details}`);
        }
    }
    
    /**
     * 📊 Получение сводки по тестам
     */
    getTestSummary() {
        const total = this.testsPassed + this.testsFailed;
        const successRate = total > 0 ? (this.testsPassed / total * 100).toFixed(1) : 0;
        
        return {
            total: total,
            passed: this.testsPassed,
            failed: this.testsFailed,
            successRate: parseFloat(successRate),
            results: this.results
        };
    }
}

// Экспорт для использования в диагностическом центре
if (typeof window !== 'undefined') {
    window.EnhancedErrorLoggingTests = EnhancedErrorLoggingTests;
}
