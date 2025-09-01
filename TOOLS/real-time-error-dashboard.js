/**
 * 📊 REAL-TIME ERROR DASHBOARD
 * Live-мониторинг системы логирования ошибок с интерактивным интерфейсом
 *
 * Возможности:
 * - Real-time обновления списка ошибок
 * - Интерактивные графики и статистика
 * - Фильтрация и поиск по ошибкам
 * - Экспорт детальных отчетов
 * - Интеграция с HEYS диагностической системой
 *
 * @version 1.0.0
 * @created 26.08.2025
 */

class RealTimeErrorDashboard {
  constructor(containerId = 'error-dashboard') {
    this.containerId = containerId;
    this.container = null;
    this.logger = null;
    this.isActive = false;
    this.updateInterval = null;
    this.filters = {
      level: 'all',
      category: 'all',
      timeRange: '1h',
      searchText: '',
    };
    this.chartData = {
      timeline: [],
      byLevel: {},
      byCategory: {},
    };

    this.init();
  }

  init() {
    this.createContainer();
    this.setupEventListeners();
    this.connectToLogger();
    this.startRealTimeUpdates();
  }

  /**
   * 🏗️ Создание контейнера dashboard
   */
  createContainer() {
    this.container = document.getElementById(this.containerId);

    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = this.containerId;
      this.container.className = 'error-dashboard';
      document.body.appendChild(this.container);
    }

    this.container.innerHTML = this.generateDashboardHTML();
    this.applyStyles();
  }

  /**
   * 🎨 Генерация HTML структуры dashboard
   */
  generateDashboardHTML() {
    return `
            <div class="dashboard-header">
                <h2>🔍 Real-Time Error Dashboard</h2>
                <div class="dashboard-controls">
                    <button class="control-btn" onclick="errorDashboard.togglePause()">
                        <span id="pause-icon">⏸️</span> <span id="pause-text">Пауза</span>
                    </button>
                    <button class="control-btn" onclick="errorDashboard.clearDashboard()">
                        🗑️ Очистить
                    </button>
                    <button class="control-btn" onclick="errorDashboard.exportReport()">
                        📊 Экспорт
                    </button>
                    <button class="control-btn" onclick="errorDashboard.openSettings()">
                        ⚙️ Настройки
                    </button>
                </div>
            </div>
            
            <div class="dashboard-stats">
                <div class="stat-card">
                    <div class="stat-title">Всего ошибок</div>
                    <div class="stat-value" id="total-errors">0</div>
                    <div class="stat-change" id="total-change">+0</div>
                </div>
                <div class="stat-card critical">
                    <div class="stat-title">Критические</div>
                    <div class="stat-value" id="critical-errors">0</div>
                    <div class="stat-change" id="critical-change">+0</div>
                </div>
                <div class="stat-card high">
                    <div class="stat-title">Высокие</div>
                    <div class="stat-value" id="high-errors">0</div>
                    <div class="stat-change" id="high-change">+0</div>
                </div>
                <div class="stat-card medium">
                    <div class="stat-title">Средние</div>
                    <div class="stat-value" id="medium-errors">0</div>
                    <div class="stat-change" id="medium-change">+0</div>
                </div>
                <div class="stat-card low">
                    <div class="stat-title">Низкие</div>
                    <div class="stat-value" id="low-errors">0</div>
                    <div class="stat-change" id="low-change">+0</div>
                </div>
            </div>
            
            <div class="dashboard-filters">
                <div class="filter-group">
                    <label>Уровень:</label>
                    <select id="level-filter" onchange="errorDashboard.updateFilter('level', this.value)">
                        <option value="all">Все</option>
                        <option value="error">Ошибки</option>
                        <option value="warning">Предупреждения</option>
                        <option value="info">Информация</option>
                        <option value="debug">Отладка</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Категория:</label>
                    <select id="category-filter" onchange="errorDashboard.updateFilter('category', this.value)">
                        <option value="all">Все</option>
                        <option value="heys-core">HEYS Core</option>
                        <option value="heys-storage">HEYS Storage</option>
                        <option value="module">Модули</option>
                        <option value="network">Сеть</option>
                        <option value="performance">Производительность</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Период:</label>
                    <select id="time-filter" onchange="errorDashboard.updateFilter('timeRange', this.value)">
                        <option value="15m">15 минут</option>
                        <option value="1h" selected>1 час</option>
                        <option value="24h">24 часа</option>
                        <option value="all">Всё время</option>
                    </select>
                </div>
                <div class="filter-group search-group">
                    <label>Поиск:</label>
                    <input type="text" id="search-filter" placeholder="Поиск по ошибкам..." 
                           oninput="errorDashboard.updateFilter('searchText', this.value)">
                </div>
            </div>
            
            <div class="dashboard-content">
                <div class="content-section">
                    <h3>📈 График ошибок по времени</h3>
                    <div class="chart-container" id="timeline-chart">
                        <canvas id="timeline-canvas" width="800" height="200"></canvas>
                    </div>
                </div>
                
                <div class="content-section">
                    <h3>📋 Последние ошибки</h3>
                    <div class="errors-list" id="errors-list">
                        <!-- Список ошибок будет здесь -->
                    </div>
                </div>
            </div>
            
            <div class="dashboard-footer">
                <div class="footer-info">
                    <span>Последнее обновление: <span id="last-update">-</span></span>
                    <span>Статус: <span id="connection-status">🟢 Подключен</span></span>
                </div>
            </div>
        `;
  }

  /**
   * 🎨 Применение стилей
   */
  applyStyles() {
    if (document.getElementById('error-dashboard-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'error-dashboard-styles';
    styles.textContent = `
            .error-dashboard {
                position: fixed;
                top: 10px;
                right: 10px;
                width: 400px;
                max-height: 90vh;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                font-family: 'Segoe UI', sans-serif;
                font-size: 12px;
                z-index: 10000;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            
            .dashboard-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .dashboard-header h2 {
                margin: 0;
                font-size: 16px;
            }
            
            .dashboard-controls {
                display: flex;
                gap: 5px;
            }
            
            .control-btn {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                padding: 5px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
                transition: background 0.2s;
            }
            
            .control-btn:hover {
                background: rgba(255,255,255,0.3);
            }
            
            .dashboard-stats {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 1px;
                background: #f1f5f9;
                padding: 1px;
            }
            
            .stat-card {
                background: white;
                padding: 10px;
                text-align: center;
            }
            
            .stat-card.critical { border-top: 3px solid #dc2626; }
            .stat-card.high { border-top: 3px solid #ea580c; }
            .stat-card.medium { border-top: 3px solid #ca8a04; }
            .stat-card.low { border-top: 3px solid #16a34a; }
            
            .stat-title {
                font-size: 10px;
                color: #666;
                margin-bottom: 5px;
            }
            
            .stat-value {
                font-size: 18px;
                font-weight: bold;
                color: #2d3748;
            }
            
            .stat-change {
                font-size: 10px;
                color: #16a34a;
                margin-top: 2px;
            }
            
            .dashboard-filters {
                background: #f8fafc;
                padding: 10px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                border-bottom: 1px solid #e2e8f0;
            }
            
            .search-group {
                grid-column: span 2;
            }
            
            .filter-group label {
                display: block;
                font-size: 10px;
                color: #4a5568;
                margin-bottom: 3px;
                font-weight: 500;
            }
            
            .filter-group select,
            .filter-group input {
                width: 100%;
                padding: 4px 6px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 11px;
            }
            
            .dashboard-content {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
            }
            
            .content-section {
                margin-bottom: 15px;
            }
            
            .content-section h3 {
                margin: 0 0 10px 0;
                font-size: 14px;
                color: #2d3748;
            }
            
            .chart-container {
                height: 120px;
                background: #f8fafc;
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 15px;
            }
            
            .errors-list {
                max-height: 300px;
                overflow-y: auto;
            }
            
            .error-item {
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 8px;
                margin-bottom: 6px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .error-item:hover {
                border-color: #667eea;
                box-shadow: 0 2px 8px rgba(102,126,234,0.1);
            }
            
            .error-item.level-error { border-left: 4px solid #dc2626; }
            .error-item.level-warning { border-left: 4px solid #ca8a04; }
            .error-item.level-info { border-left: 4px solid #2563eb; }
            .error-item.level-debug { border-left: 4px solid #6b7280; }
            
            .error-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }
            
            .error-title {
                font-weight: 600;
                color: #2d3748;
                font-size: 11px;
            }
            
            .error-time {
                font-size: 10px;
                color: #6b7280;
            }
            
            .error-message {
                font-size: 10px;
                color: #4a5568;
                margin-bottom: 4px;
                line-height: 1.3;
            }
            
            .error-tags {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
            }
            
            .error-tag {
                background: #e2e8f0;
                color: #4a5568;
                padding: 2px 6px;
                border-radius: 12px;
                font-size: 9px;
            }
            
            .error-tag.heys { background: #dbeafe; color: #1e40af; }
            .error-tag.critical { background: #fee2e2; color: #dc2626; }
            
            .dashboard-footer {
                background: #f8fafc;
                padding: 8px 15px;
                border-top: 1px solid #e2e8f0;
                font-size: 10px;
                color: #6b7280;
            }
            
            .footer-info {
                display: flex;
                justify-content: space-between;
            }
            
            .minimized {
                height: auto !important;
                max-height: 60px !important;
            }
            
            .minimized .dashboard-content,
            .minimized .dashboard-stats,
            .minimized .dashboard-filters {
                display: none;
            }
            
            @media (max-width: 768px) {
                .error-dashboard {
                    width: 95%;
                    right: 2.5%;
                    left: 2.5%;
                }
                
                .dashboard-stats {
                    grid-template-columns: repeat(3, 1fr);
                }
                
                .dashboard-filters {
                    grid-template-columns: 1fr;
                }
                
                .search-group {
                    grid-column: span 1;
                }
            }
        `;

    document.head.appendChild(styles);
  }

  /**
   * 🔗 Подключение к логгеру
   */
  connectToLogger() {
    // Попытка подключения к глобальному логгеру
    if (window.enhancedLogger) {
      this.logger = window.enhancedLogger;
      this.logger.addListener(this.onNewLogEntry.bind(this));
      this.updateConnectionStatus('🟢 Подключен к Enhanced Logger');
    } else {
      // Слушаем событие инициализации логгера
      window.addEventListener('enhancedLogEntry', (event) => {
        this.onNewLogEntry(event.detail);
      });
      this.updateConnectionStatus('🟡 Ожидание подключения...');
    }

    // Проверка подключения каждые 5 секунд
    setInterval(() => {
      if (!this.logger && window.enhancedLogger) {
        this.connectToLogger();
      }
    }, 5000);
  }

  /**
   * 📝 Обработка новой записи лога
   */
  onNewLogEntry(logEntry) {
    if (!this.isActive) return;

    // Обновляем данные для графиков
    this.updateChartData(logEntry);

    // Обновляем статистику
    this.updateStats();

    // Добавляем в список ошибок
    this.addErrorToList(logEntry);

    // Обновляем время последнего обновления
    this.updateLastUpdateTime();
  }

  /**
   * 📊 Обновление данных для графиков
   */
  updateChartData(logEntry) {
    const now = Date.now();
    const timeSlot = Math.floor(now / (60 * 1000)) * 60 * 1000; // Минутные слоты

    // Обновляем timeline данные
    let timelineEntry = this.chartData.timeline.find((entry) => entry.time === timeSlot);
    if (!timelineEntry) {
      timelineEntry = { time: timeSlot, errors: 0, warnings: 0, info: 0, debug: 0 };
      this.chartData.timeline.push(timelineEntry);
    }

    timelineEntry[logEntry.level]++;

    // Очищаем старые данные (оставляем последние 60 минут)
    const cutoff = now - 60 * 60 * 1000;
    this.chartData.timeline = this.chartData.timeline.filter((entry) => entry.time > cutoff);

    // Обновляем данные по уровням
    this.chartData.byLevel[logEntry.level] = (this.chartData.byLevel[logEntry.level] || 0) + 1;

    // Обновляем данные по категориям
    if (logEntry.classification && logEntry.classification.category) {
      const category = logEntry.classification.category;
      this.chartData.byCategory[category] = (this.chartData.byCategory[category] || 0) + 1;
    }

    // Обновляем график
    this.updateTimelineChart();
  }

  /**
   * 📈 Обновление timeline графика
   */
  updateTimelineChart() {
    const canvas = document.getElementById('timeline-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Очищаем canvas
    ctx.clearRect(0, 0, width, height);

    if (this.chartData.timeline.length === 0) return;

    // Настройки графика
    const padding = 20;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Находим максимальное значение
    const maxValue = Math.max(
      ...this.chartData.timeline.map(
        (entry) => entry.errors + entry.warnings + entry.info + entry.debug,
      ),
    );

    if (maxValue === 0) return;

    // Рисуем оси
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Рисуем график
    const pointWidth = chartWidth / this.chartData.timeline.length;

    this.chartData.timeline.forEach((entry, index) => {
      const x = padding + index * pointWidth;
      const totalHeight =
        ((entry.errors + entry.warnings + entry.info + entry.debug) / maxValue) * chartHeight;

      let currentY = height - padding;

      // Рисуем столбцы разными цветами
      const levels = [
        { key: 'errors', color: '#dc2626' },
        { key: 'warnings', color: '#ca8a04' },
        { key: 'info', color: '#2563eb' },
        { key: 'debug', color: '#6b7280' },
      ];

      levels.forEach((level) => {
        const levelHeight = (entry[level.key] / maxValue) * chartHeight;
        if (levelHeight > 0) {
          ctx.fillStyle = level.color;
          ctx.fillRect(x, currentY - levelHeight, pointWidth - 1, levelHeight);
          currentY -= levelHeight;
        }
      });
    });
  }

  /**
   * 📊 Обновление статистики
   */
  updateStats() {
    if (!this.logger) return;

    const stats = this.logger.getStats();

    // Обновляем общую статистику
    document.getElementById('total-errors').textContent = stats.total;
    document.getElementById('critical-errors').textContent = stats.byLevel.error || 0;
    document.getElementById('high-errors').textContent = stats.byLevel.warning || 0;
    document.getElementById('medium-errors').textContent = stats.byLevel.info || 0;
    document.getElementById('low-errors').textContent = stats.byLevel.debug || 0;

    // TODO: Вычислить изменения за последний период
    // Пока показываем +0 для всех
  }

  /**
   * 📋 Добавление ошибки в список
   */
  addErrorToList(logEntry) {
    const errorsList = document.getElementById('errors-list');
    if (!errorsList) return;

    // Проверяем фильтры
    if (!this.passesFilters(logEntry)) return;

    const errorItem = this.createErrorItemHTML(logEntry);
    errorsList.insertAdjacentHTML('afterbegin', errorItem);

    // Ограничиваем количество отображаемых ошибок
    while (errorsList.children.length > 50) {
      errorsList.removeChild(errorsList.lastChild);
    }
  }

  /**
   * 🔍 Проверка соответствия фильтрам
   */
  passesFilters(logEntry) {
    // Фильтр по уровню
    if (this.filters.level !== 'all' && logEntry.level !== this.filters.level) {
      return false;
    }

    // Фильтр по категории
    if (this.filters.category !== 'all') {
      const category = logEntry.classification?.category || 'general';
      if (category !== this.filters.category) {
        return false;
      }
    }

    // Фильтр по времени
    if (this.filters.timeRange !== 'all') {
      const now = Date.now();
      const timeRanges = {
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      };
      const timeLimit = timeRanges[this.filters.timeRange];
      if (timeLimit && now - logEntry.timestamp > timeLimit) {
        return false;
      }
    }

    // Фильтр по тексту поиска
    if (this.filters.searchText) {
      const searchText = this.filters.searchText.toLowerCase();
      const searchIn = [
        logEntry.title,
        logEntry.details?.message || '',
        JSON.stringify(logEntry.details || {}),
      ]
        .join(' ')
        .toLowerCase();

      if (!searchIn.includes(searchText)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 🏗️ Создание HTML для элемента ошибки
   */
  createErrorItemHTML(logEntry) {
    const time = new Date(logEntry.timestamp).toLocaleTimeString();
    const classification = logEntry.classification || {};
    const isHeys = classification.heysSpecific;
    const severity = classification.severity || 'medium';

    const tags = [
      logEntry.level,
      ...(classification.tags || []),
      isHeys ? 'heys' : null,
      severity === 'critical' ? 'critical' : null,
    ].filter(Boolean);

    const tagsHTML = tags.map((tag) => `<span class="error-tag ${tag}">${tag}</span>`).join('');

    return `
            <div class="error-item level-${logEntry.level}" onclick="errorDashboard.showErrorDetails('${logEntry.id}')">
                <div class="error-header">
                    <div class="error-title">${this.escapeHtml(logEntry.title)}</div>
                    <div class="error-time">${time}</div>
                </div>
                <div class="error-message">
                    ${this.escapeHtml(logEntry.details?.message || 'Нет описания')}
                </div>
                <div class="error-tags">${tagsHTML}</div>
            </div>
        `;
  }

  /**
   * 🔒 Экранирование HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * ⏱️ Запуск real-time обновлений
   */
  startRealTimeUpdates() {
    this.isActive = true;
    this.updateInterval = setInterval(() => {
      this.updateStats();
      this.updateTimelineChart();
    }, 5000); // Обновляем каждые 5 секунд
  }

  /**
   * ⏸️ Остановка real-time обновлений
   */
  stopRealTimeUpdates() {
    this.isActive = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 🔄 Обновление фильтра
   */
  updateFilter(filterType, value) {
    this.filters[filterType] = value;
    this.refreshErrorsList();
  }

  /**
   * 🔄 Обновление списка ошибок с учетом фильтров
   */
  refreshErrorsList() {
    const errorsList = document.getElementById('errors-list');
    if (!errorsList || !this.logger) return;

    errorsList.innerHTML = '';

    // Конвертируем фильтры в формат Enhanced Error Logger
    const convertedFilters = this.convertFiltersForLogger(this.filters);

    // Получаем логи с правильными фильтрами
    const logs = this.logger.getLogs(convertedFilters);

    // Отладочная информация
    console.log('🔄 refreshErrorsList:', {
      originalFilters: this.filters,
      convertedFilters: convertedFilters,
      logsFound: logs.length,
      totalLogsInLogger: this.logger.logs?.length || 0,
    });

    logs
      .reverse()
      .slice(0, 50)
      .forEach((logEntry) => {
        const errorItem = this.createErrorItemHTML(logEntry);
        errorsList.insertAdjacentHTML('beforeend', errorItem);
      });
  }

  /**
   * 📄 Показ деталей ошибки
   */
  showErrorDetails(logId) {
    if (!this.logger) return;

    const logEntry = this.logger.logs.find((log) => log.id === logId);
    if (!logEntry) return;

    // Создаем модальное окно с деталями
    this.showErrorModal(logEntry);
  }

  /**
   * 📱 Создание модального окна с деталями ошибки
   */
  showErrorModal(logEntry) {
    const modal = document.createElement('div');
    modal.className = 'error-details-modal';
    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🔍 Детали ошибки</h3>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()">✕</button>
                </div>
                <div class="modal-body">
                    <pre>${JSON.stringify(logEntry, null, 2)}</pre>
                </div>
                <div class="modal-footer">
                    <button onclick="navigator.clipboard.writeText(JSON.stringify(${JSON.stringify(logEntry)}, null, 2))">
                        📋 Копировать
                    </button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()">
                        ❌ Закрыть
                    </button>
                </div>
            </div>
        `;

    // Добавляем стили для модального окна
    modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
        `;

    modal.querySelector('.modal-content').style.cssText = `
            background: white;
            width: 90%;
            max-width: 800px;
            max-height: 90%;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
        `;

    document.body.appendChild(modal);

    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * ⏸️ Переключение паузы
   */
  togglePause() {
    if (this.isActive) {
      this.stopRealTimeUpdates();
      document.getElementById('pause-icon').textContent = '▶️';
      document.getElementById('pause-text').textContent = 'Запуск';
      this.updateConnectionStatus('⏸️ На паузе');
    } else {
      this.startRealTimeUpdates();
      document.getElementById('pause-icon').textContent = '⏸️';
      document.getElementById('pause-text').textContent = 'Пауза';
      this.updateConnectionStatus('🟢 Активен');
    }
  }

  /**
   * 🗑️ Очистка dashboard
   */
  clearDashboard() {
    this.chartData = { timeline: [], byLevel: {}, byCategory: {} };
    document.getElementById('errors-list').innerHTML = '';
    this.updateStats();
    this.updateTimelineChart();
  }

  /**
   * � Конвертация фильтров Dashboard в формат Enhanced Error Logger
   */
  convertFiltersForLogger(dashboardFilters) {
    const loggerFilters = {};

    // Конвертируем level (остается как есть, если не 'all')
    if (dashboardFilters.level && dashboardFilters.level !== 'all') {
      loggerFilters.level = dashboardFilters.level;
    }

    // Конвертируем timeRange в since
    if (dashboardFilters.timeRange && dashboardFilters.timeRange !== 'all') {
      const now = Date.now();
      const timeRanges = {
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      };
      const timeLimit = timeRanges[dashboardFilters.timeRange];
      if (timeLimit) {
        loggerFilters.since = now - timeLimit;
      }
    }

    // Конвертируем searchText (остается как есть)
    if (dashboardFilters.searchText) {
      loggerFilters.searchText = dashboardFilters.searchText;
    }

    // category конвертируем в classification
    if (dashboardFilters.category && dashboardFilters.category !== 'all') {
      loggerFilters.classification = dashboardFilters.category;
    }

    return loggerFilters;
  }

  /**
   * �📊 Экспорт отчета
   */
  exportReport() {
    // Пытаемся найти активный логгер
    let activeLogger = this.logger || window.enhancedLogger;

    if (!activeLogger) {
      console.error('❌ No active logger found for export');
      alert('❌ Логгер не найден! Убедитесь, что Enhanced Error Logger инициализирован.');
      return;
    }

    console.log('📤 Exporting from logger:', {
      loggerExists: !!activeLogger,
      logsCount: activeLogger.logs?.length || 0,
      isActive: activeLogger.isActive,
      sessionId: activeLogger.sessionId,
    });

    // Получаем все логи БЕЗ фильтрации для полного отчета
    const allLogs = activeLogger.getLogs ? activeLogger.getLogs() : activeLogger.logs || [];

    // Конвертируем фильтры Dashboard в формат Enhanced Error Logger
    const convertedFilters = this.convertFiltersForLogger(this.filters);

    // Получаем отфильтрованные логи с правильными фильтрами
    const filteredLogs = activeLogger.getLogs ? activeLogger.getLogs(convertedFilters) : [];
    const stats = activeLogger.getStats ? activeLogger.getStats() : {};

    // Также пробуем прямой доступ к массиву для отладки
    const directLogs = activeLogger.logs || [];

    console.log('📊 Export data debug:', {
      allLogsFromMethod: allLogs.length,
      filteredLogsFromMethod: filteredLogs.length,
      directLogsAccess: directLogs.length,
      statsTotal: stats.total,
      originalFilters: this.filters,
      convertedFilters: convertedFilters,
    });

    const report = {
      timestamp: new Date().toISOString(),
      stats: stats,
      chartData: this.chartData,
      filters: this.filters,
      logs: allLogs, // Логи через метод getLogs()
      filteredLogs: filteredLogs, // Отфильтрованные логи
      directLogs: directLogs, // Прямой доступ к массиву для отладки
      totalLogsCount: allLogs.length,
      filteredLogsCount: filteredLogs.length,
      directLogsCount: directLogs.length,
      debugInfo: {
        loggerType: activeLogger.constructor.name || 'Unknown',
        hasGetStats: typeof activeLogger.getStats === 'function',
        hasGetLogs: typeof activeLogger.getLogs === 'function',
        sessionId: activeLogger.sessionId,
        isActive: activeLogger.isActive,
        methodsAvailable: {
          getLogs: typeof activeLogger.getLogs === 'function',
          getStats: typeof activeLogger.getStats === 'function',
          logs: Array.isArray(activeLogger.logs),
        },
      },
    };

    console.log('📊 Export report prepared:', {
      totalLogs: report.totalLogsCount,
      filteredLogs: report.filteredLogsCount,
      directLogs: report.directLogsCount,
      statsTotal: report.stats.total,
      logsArrayEmpty: report.logs.length === 0,
      directLogsArrayEmpty: report.directLogs.length === 0,
    });

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Логируем информацию об экспорте
    console.log(
      `📤 Экспортирован отчет: ${allLogs.length} всего логов (метод), ${directLogs.length} прямых логов, ${filteredLogs.length} отфильтрованных`,
    );

    // Если все массивы пустые, это проблема
    if (allLogs.length === 0 && directLogs.length === 0 && stats.total > 0) {
      console.warn(
        '⚠️ ВНИМАНИЕ: Статистика показывает логи, но массивы пустые! Возможна проблема с методом getLogs()',
      );
    }
  }

  /**
   * ⚙️ Открытие настроек
   */
  openSettings() {
    // TODO: Реализовать окно настроек
    alert('Настройки будут доступны в следующей версии');
  }

  /**
   * 🔄 Обновление статуса подключения
   */
  updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = status;
    }
  }

  /**
   * ⏰ Обновление времени последнего обновления
   */
  updateLastUpdateTime() {
    const updateElement = document.getElementById('last-update');
    if (updateElement) {
      updateElement.textContent = new Date().toLocaleTimeString();
    }
  }

  /**
   * 🎛️ Настройка обработчиков событий
   */
  setupEventListeners() {
    // Минимизация по двойному клику на заголовок
    setTimeout(() => {
      const header = this.container?.querySelector('.dashboard-header h2');
      if (header) {
        header.addEventListener('dblclick', () => {
          this.container.classList.toggle('minimized');
        });
      }
    }, 100);

    // Клавиатурные сокращения
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        this.togglePause();
      }
    });
  }

  /**
   * 💀 Уничтожение dashboard
   */
  destroy() {
    this.stopRealTimeUpdates();
    if (this.container) {
      this.container.remove();
    }
    const styles = document.getElementById('error-dashboard-styles');
    if (styles) {
      styles.remove();
    }
  }
}

// Создание глобального экземпляра
if (typeof window !== 'undefined') {
  window.RealTimeErrorDashboard = RealTimeErrorDashboard;

  // Автоматическая инициализация
  if (!window.HEYS_ERROR_DASHBOARD_NO_AUTO_INIT) {
    setTimeout(() => {
      window.errorDashboard = new RealTimeErrorDashboard();
    }, 1000);
  }
}

// Экспорт для модульных систем
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RealTimeErrorDashboard;
}
