// heys_analytics_ui.js — интерфейс аналитики и экспорта метрик
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const { useState, useEffect, useCallback } = React;

  // Компонент аналитики
  function AnalyticsModal({ show, onHide }) {
    const [metrics, setMetrics] = useState(null);
    const [tab, setTab] = useState('summary');
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Загрузка метрик
    const loadMetrics = useCallback(() => {
      if (HEYS.analytics) {
        const data = HEYS.analytics.exportMetrics();
        setMetrics(data);
      }
    }, []);

    // Автообновление каждые 5 секунд
    useEffect(() => {
      if (show && autoRefresh) {
        loadMetrics();
        const interval = setInterval(loadMetrics, 5000);
        return () => clearInterval(interval);
      }
    }, [show, autoRefresh, loadMetrics]);

    // Копирование в буфер обмена
    const copyToClipboard = useCallback(() => {
      if (metrics) {
        const text = JSON.stringify(metrics, null, 2);
        navigator.clipboard.writeText(text).then(() => {
          alert('Метрики скопированы в буфер обмена!');
        }).catch(() => {
          // Fallback для старых браузеров
          const textArea = document.createElement('textarea');
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          alert('Метрики скопированы в буфер обмена!');
        });
      }
    }, [metrics]);

    // Скачивание файла
    const downloadMetrics = useCallback(() => {
      if (metrics) {
        const text = JSON.stringify(metrics, null, 2);
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heys-analytics-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }, [metrics]);

    if (!show) return null;

    return React.createElement('div', {
      className: 'analytics-modal-overlay',
      onClick: (e) => e.target === e.currentTarget && onHide()
    },
      React.createElement('div', { className: 'analytics-modal' },
        // Заголовок
        React.createElement('div', { className: 'analytics-header' },
          React.createElement('h2', null, '📊 Аналитика производительности HEYS'),
          React.createElement('div', { className: 'analytics-controls' },
            React.createElement('label', null,
              React.createElement('input', {
                type: 'checkbox',
                checked: autoRefresh,
                onChange: (e) => setAutoRefresh(e.target.checked)
              }),
              ' Автообновление'
            ),
            React.createElement('button', {
              onClick: loadMetrics,
              className: 'btn btn-sm'
            }, '🔄 Обновить'),
            React.createElement('button', {
              onClick: copyToClipboard,
              className: 'btn btn-sm btn-primary'
            }, '📋 Копировать'),
            React.createElement('button', {
              onClick: downloadMetrics,
              className: 'btn btn-sm btn-secondary'
            }, '💾 Скачать'),
            React.createElement('button', {
              onClick: onHide,
              className: 'btn btn-sm btn-danger'
            }, '✕')
          )
        ),

        // Вкладки
        React.createElement('div', { className: 'analytics-tabs' },
          ['summary', 'performance', 'user', 'data', 'errors', 'system'].map(tabName =>
            React.createElement('button', {
              key: tabName,
              className: `tab ${tab === tabName ? 'active' : ''}`,
              onClick: () => setTab(tabName)
            }, getTabTitle(tabName))
          )
        ),

        // Содержимое
        React.createElement('div', { className: 'analytics-content' },
          metrics ? renderTabContent(tab, metrics) : React.createElement('div', { className: 'loading' }, 'Загрузка метрик...')
        )
      )
    );
  }

  // Названия вкладок
  function getTabTitle(tab) {
    const titles = {
      summary: '📋 Сводка',
      performance: '⚡ Производительность',
      user: '👤 Активность',
      data: '💾 Данные',
      errors: '❌ Ошибки',
      system: '🖥️ Система'
    };
    return titles[tab] || tab;
  }

  // Рендер содержимого вкладок
  function renderTabContent(tab, metrics) {
    switch (tab) {
      case 'summary':
        return renderSummaryTab(metrics);
      case 'performance':
        return renderPerformanceTab(metrics);
      case 'user':
        return renderUserTab(metrics);
      case 'data':
        return renderDataTab(metrics);
      case 'errors':
        return renderErrorsTab(metrics);
      case 'system':
        return renderSystemTab(metrics);
      default:
        return React.createElement('div', null, 'Неизвестная вкладка');
    }
  }

  // Сводка
  function renderSummaryTab(metrics) {
    const { sessionInfo, summary } = metrics;
    const sessionHours = Math.round(sessionInfo.duration / 3600000 * 100) / 100;

    return React.createElement('div', { className: 'summary-tab' },
      React.createElement('div', { className: 'metrics-grid' },
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h3', null, '⏱️ Сессия'),
          React.createElement('p', null, `Длительность: ${sessionHours}ч`),
          React.createElement('p', null, `Начало: ${new Date(sessionInfo.started).toLocaleString()}`),
          React.createElement('p', null, `Экспорт: ${new Date(sessionInfo.exported).toLocaleString()}`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h3', null, '🚀 Производительность'),
          React.createElement('p', null, `Средний FPS: ${summary.avgFPS}`),
          React.createElement('p', null, `Память: ${summary.avgMemoryMB} МБ`),
          React.createElement('p', null, `Ошибки: ${summary.totalErrors}`),
          React.createElement('p', null, `Предупреждения: ${summary.totalWarnings}`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h3', null, '👤 Активность'),
          React.createElement('p', null, `Клики: ${summary.userActivity.totalClicks}`),
          React.createElement('p', null, `Нажатия клавиш: ${summary.userActivity.totalKeystrokes}`),
          React.createElement('p', null, `Прокрутки: ${summary.userActivity.totalScrolls}`),
          React.createElement('p', null, `Активное время: ${summary.userActivity.activeTimeMinutes} мин`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h3', null, '💾 Данные'),
          React.createElement('p', null, `Продукты загружены: ${summary.dataOperations.productsLoaded}`),
          React.createElement('p', null, `Приёмы пищи: ${summary.dataOperations.mealsCreated}`),
          React.createElement('p', null, `Дни просмотрены: ${summary.dataOperations.daysViewed}`),
          React.createElement('p', null, `Поисковые запросы: ${summary.dataOperations.searchQueries}`)
        )
      )
    );
  }

  // Производительность
  function renderPerformanceTab(metrics) {
    const { performance } = metrics.detailedMetrics;
    
    return React.createElement('div', { className: 'performance-tab' },
      React.createElement('h3', null, '⚡ Производительность'),
      
      React.createElement('div', { className: 'metrics-section' },
        React.createElement('h4', null, 'Время загрузки'),
        React.createElement('p', null, `Общее время загрузки: ${performance.loadTime}мс`)
      ),

      React.createElement('div', { className: 'metrics-section' },
        React.createElement('h4', null, 'Память (последние записи)'),
        React.createElement('div', { className: 'memory-list' },
          performance.memoryUsage.slice(-5).map((entry, i) =>
            React.createElement('p', { key: i },
              `${new Date(entry.timestamp).toLocaleTimeString()}: ${entry.used}/${entry.total} МБ`
            )
          )
        )
      ),

      React.createElement('div', { className: 'metrics-section' },
        React.createElement('h4', null, 'FPS (последние записи)'),
        React.createElement('div', { className: 'fps-list' },
          performance.fpsHistory.slice(-5).map((entry, i) =>
            React.createElement('p', { key: i },
              `${new Date(entry.timestamp).toLocaleTimeString()}: ${entry.fps} FPS`
            )
          )
        )
      ),

      React.createElement('div', { className: 'metrics-section' },
        React.createElement('h4', null, 'Сетевые запросы (последние)'),
        React.createElement('div', { className: 'network-list' },
          performance.networkRequests.slice(-5).map((req, i) =>
            React.createElement('p', { key: i },
              `${req.method} ${req.url.split('/').pop()} - ${req.status} (${req.duration}мс)`
            )
          )
        )
      )
    );
  }

  // Активность пользователя
  function renderUserTab(metrics) {
    const { userActivity } = metrics.detailedMetrics;
    const totalTime = userActivity.activeTime + userActivity.idleTime;
    const activePercent = totalTime > 0 ? Math.round(userActivity.activeTime / totalTime * 100) : 0;

    return React.createElement('div', { className: 'user-tab' },
      React.createElement('h3', null, '👤 Активность пользователя'),
      
      React.createElement('div', { className: 'metrics-grid' },
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Взаимодействия'),
          React.createElement('p', null, `Клики мышью: ${userActivity.clicks}`),
          React.createElement('p', null, `Нажатия клавиш: ${userActivity.keystrokes}`),
          React.createElement('p', null, `Прокрутки: ${userActivity.scrolls}`),
          React.createElement('p', null, `Переключения вкладок: ${userActivity.tabSwitches}`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Время'),
          React.createElement('p', null, `Активное время: ${Math.round(userActivity.activeTime / 60000)} мин`),
          React.createElement('p', null, `Время бездействия: ${Math.round(userActivity.idleTime / 60000)} мин`),
          React.createElement('p', null, `Активность: ${activePercent}%`),
          React.createElement('p', null, `Последняя активность: ${new Date(userActivity.lastActivity).toLocaleTimeString()}`)
        )
      )
    );
  }

  // Данные приложения
  function renderDataTab(metrics) {
    const { dataMetrics, timing } = metrics.detailedMetrics;
    const cacheHitRate = dataMetrics.cacheHits + dataMetrics.cacheMisses > 0 ? 
      Math.round(dataMetrics.cacheHits / (dataMetrics.cacheHits + dataMetrics.cacheMisses) * 100) : 0;

    return React.createElement('div', { className: 'data-tab' },
      React.createElement('h3', null, '💾 Данные приложения'),
      
      React.createElement('div', { className: 'metrics-grid' },
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Операции с данными'),
          React.createElement('p', null, `Продукты загружены: ${dataMetrics.productsLoaded}`),
          React.createElement('p', null, `Приёмы пищи созданы: ${dataMetrics.mealsCreated}`),
          React.createElement('p', null, `Дни просмотрены: ${dataMetrics.daysViewed}`),
          React.createElement('p', null, `Операции с хранилищем: ${dataMetrics.storageOps}`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Кэш и синхронизация'),
          React.createElement('p', null, `Попадания в кэш: ${dataMetrics.cacheHits}`),
          React.createElement('p', null, `Промахи кэша: ${dataMetrics.cacheMisses}`),
          React.createElement('p', null, `Процент попаданий: ${cacheHitRate}%`),
          React.createElement('p', null, `Синхронизации с облаком: ${dataMetrics.cloudSyncs}`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Поиск'),
          React.createElement('p', null, `Поисковых запросов: ${dataMetrics.searchQueries}`),
          React.createElement('p', null, `Последние поиски:`,
            timing.searchTimes.slice(-3).map((search, i) =>
              React.createElement('br', { key: i }, `${search.duration}мс (${search.resultsCount} результатов)`)
            )
          )
        )
      )
    );
  }

  // Ошибки
  function renderErrorsTab(metrics) {
    const { errors } = metrics.detailedMetrics;
    
    return React.createElement('div', { className: 'errors-tab' },
      React.createElement('h3', null, '❌ Ошибки и предупреждения'),
      
      React.createElement('div', { className: 'metrics-section' },
        React.createElement('h4', null, `JavaScript ошибки (${errors.jsErrors.length})`),
        React.createElement('div', { className: 'error-list' },
          errors.jsErrors.slice(-5).map((error, i) =>
            React.createElement('div', { key: i, className: 'error-item' },
              React.createElement('p', null, `${new Date(error.timestamp).toLocaleTimeString()}: ${error.message}`),
              error.filename && React.createElement('small', null, `${error.filename}:${error.lineno}:${error.colno}`)
            )
          )
        )
      ),

      React.createElement('div', { className: 'metrics-section' },
        React.createElement('h4', null, `Сетевые ошибки (${errors.networkErrors.length})`),
        React.createElement('div', { className: 'error-list' },
          errors.networkErrors.slice(-5).map((error, i) =>
            React.createElement('div', { key: i, className: 'error-item' },
              React.createElement('p', null, `${new Date(error.timestamp).toLocaleTimeString()}: ${error.method} ${error.url}`),
              React.createElement('small', null, error.error)
            )
          )
        )
      ),

      React.createElement('div', { className: 'metrics-section' },
        React.createElement('h4', null, `Ошибки консоли (${errors.consoleErrors.length})`),
        React.createElement('div', { className: 'error-list' },
          errors.consoleErrors.slice(-5).map((error, i) =>
            React.createElement('div', { key: i, className: 'error-item' },
              React.createElement('p', null, `${new Date(error.timestamp).toLocaleTimeString()}: [${error.type}] ${error.message}`)
            )
          )
        )
      )
    );
  }

  // Система
  function renderSystemTab(metrics) {
    const { system } = metrics.detailedMetrics;
    
    return React.createElement('div', { className: 'system-tab' },
      React.createElement('h3', null, '🖥️ Информация о системе'),
      
      React.createElement('div', { className: 'metrics-grid' },
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Браузер'),
          React.createElement('p', null, `Платформа: ${system.browser.platform}`),
          React.createElement('p', null, `Язык: ${system.browser.language}`),
          React.createElement('p', null, `Ядра процессора: ${system.browser.hardwareConcurrency}`),
          React.createElement('p', null, `Память устройства: ${system.browser.deviceMemory} ГБ`),
          React.createElement('p', null, `Онлайн: ${system.browser.onLine ? 'Да' : 'Нет'}`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Экран'),
          React.createElement('p', null, `Разрешение: ${system.screen.width}×${system.screen.height}`),
          React.createElement('p', null, `Viewport: ${system.screen.viewport.width}×${system.screen.viewport.height}`),
          React.createElement('p', null, `DPR: ${system.screen.devicePixelRatio}`),
          React.createElement('p', null, `Глубина цвета: ${system.screen.colorDepth} бит`)
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Соединение'),
          system.connection.supported ? [
            React.createElement('p', { key: 'type' }, `Тип: ${system.connection.effectiveType}`),
            React.createElement('p', { key: 'speed' }, `Скорость: ${system.connection.downlink} Мбит/с`),
            React.createElement('p', { key: 'latency' }, `Задержка: ${system.connection.rtt}мс`),
            React.createElement('p', { key: 'save' }, `Экономия трафика: ${system.connection.saveData ? 'Да' : 'Нет'}`)
          ] : React.createElement('p', null, 'Информация о соединении недоступна')
        ),
        React.createElement('div', { className: 'metric-card' },
          React.createElement('h4', null, 'Поддержка функций'),
          Object.entries(system.features).map(([feature, supported]) =>
            React.createElement('p', { key: feature }, 
              `${feature}: ${supported ? '✅' : '❌'}`
            )
          )
        )
      )
    );
  }

  // Кнопка аналитики для добавления в интерфейс
  function AnalyticsButton() {
    const [showModal, setShowModal] = useState(false);
    const [metricsCount, setMetricsCount] = useState(0);

    // Обновление счётчика метрик
    useEffect(() => {
      const updateCounter = () => {
        if (HEYS.analytics) {
          const metrics = HEYS.analytics.getMetrics();
          const count = (metrics.performance?.errorCount || 0) + 
                       (metrics.userActivity?.clicks || 0) + 
                       (metrics.dataMetrics?.searchQueries || 0);
          setMetricsCount(count);
        }
      };

      updateCounter();
      const interval = setInterval(updateCounter, 10000); // Каждые 10 секунд
      return () => clearInterval(interval);
    }, []);

    return React.createElement(React.Fragment, null,
      React.createElement('button', {
        className: 'analytics-button',
        onClick: () => setShowModal(true),
        title: 'Открыть аналитику производительности'
      },
        React.createElement('span', { className: 'analytics-icon' }, '📊'),
        metricsCount > 0 && React.createElement('span', { className: 'analytics-badge' }, metricsCount)
      ),
      React.createElement(AnalyticsModal, {
        show: showModal,
        onHide: () => setShowModal(false)
      })
    );
  }

  // Экспорт в HEYS namespace
  HEYS.analyticsUI = {
    AnalyticsModal,
    AnalyticsButton
  };

})(window);
