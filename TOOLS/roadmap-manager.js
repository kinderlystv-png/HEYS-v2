/**
 * 🗺️ ROADMAP MANAGER - Интерактивная система управления дорожными картами
 *
 * Функциональность:
 * - Парсинг дорожных карт из markdown файлов
 * - Отслеживание прогресса выполнения задач
 * - Интерактивные кнопки для отметки выполненных задач
 * - Сохранение состояния прогресса
 * - Визуализация прогресса с прогресс-барами
 * - Экспорт отчетов о прогрессе
 */

class RoadmapManager {
  constructor() {
    this.roadmaps = new Map();
    this.progress = new Map();
    this.storageKey = 'heys_roadmap_progress';
    this.roadmapFiles = [
      'docs/plans/ENHANCED_ERROR_LOGGING_SYSTEM.md',
      'docs/plans/UNIVERSAL_NAVIGATION_MAPS_SYSTEM.md',
      'docs/plans/FUTURE_NAVIGATION_MAPS_IMPLEMENTATION_FIXED.md',
      'docs/plans/EXAMPLE_COMPLETE_ROADMAP.md',
    ];

    this.taskStates = {
      TODO: 'todo',
      IN_PROGRESS: 'in_progress',
      DONE: 'done',
      BLOCKED: 'blocked',
    };

    this.taskIcons = {
      [this.taskStates.TODO]: '⏳',
      [this.taskStates.IN_PROGRESS]: '🔄',
      [this.taskStates.DONE]: '✅',
      [this.taskStates.BLOCKED]: '🚫',
    };

    this.loadProgress();
    this.init();
  }

  /**
   * Инициализация системы
   */
  async init() {
    console.log('🗺️ Инициализация Roadmap Manager...');
    await this.loadRoadmaps();
    this.createUI();
    console.log('✅ Roadmap Manager готов к работе');
  }

  /**
   * Загрузка всех дорожных карт
   */
  async loadRoadmaps() {
    for (const filePath of this.roadmapFiles) {
      try {
        const response = await fetch(filePath);
        if (response.ok) {
          const content = await response.text();
          const roadmap = this.parseRoadmap(content, filePath);
          this.roadmaps.set(filePath, roadmap);

          // Инициализируем прогресс если его нет
          if (!this.progress.has(filePath)) {
            this.initRoadmapProgress(filePath, roadmap);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Не удалось загрузить дорожную карту: ${filePath}`, error);
      }
    }
  }

  /**
   * Парсинг дорожной карты из markdown
   */
  parseRoadmap(content, filePath) {
    const lines = content.split('\n');
    const roadmap = {
      title: '',
      sections: [],
      tasks: [],
      filePath: filePath,
    };

    let currentSection = null;
    let taskCounter = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Заголовок дорожной карты
      if (line.startsWith('# ') && !roadmap.title) {
        roadmap.title = line
          .replace('# ', '')
          .replace(/🗺️|ROADMAP:|СИСТЕМА|ДЕТАЛЬНОГО/, '')
          .trim();
      }

      // Секции
      if (line.startsWith('## ')) {
        currentSection = {
          title: line.replace('## ', ''),
          tasks: [],
        };
        roadmap.sections.push(currentSection);
      }

      // Задачи (различные форматы)
      if (this.isTaskLine(line)) {
        const task = this.parseTask(line, taskCounter++, currentSection?.title);
        roadmap.tasks.push(task);
        if (currentSection) {
          currentSection.tasks.push(task);
        }
      }
    }

    return roadmap;
  }

  /**
   * Проверка является ли строка задачей
   */
  isTaskLine(line) {
    const taskPatterns = [
      /^-\s+\*\*.*\*\*/, // - **Задача**
      /^-\s+✅/, // - ✅ Задача
      /^-\s+❌/, // - ❌ Задача
      /^-\s+⏳/, // - ⏳ Задача
      /^-\s+🔄/, // - 🔄 Задача
      /^\*\*.*\*\*/, // **Задача**
      /^###\s+/, // ### Подзадача
      /^####\s+/, // #### Микрозадача
      /^1\./, // 1. Нумерованная задача
      /^\d+\./, // Любая нумерованная задача
    ];

    return taskPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Парсинг отдельной задачи
   */
  parseTask(line, id, sectionTitle) {
    const task = {
      id: `task_${id}`,
      originalLine: line,
      title: '',
      description: '',
      priority: 'normal',
      section: sectionTitle || 'Общие',
      state: this.taskStates.TODO,
    };

    // Извлекаем заголовок задачи
    let title = line;

    // Убираем маркеры списка
    title = title
      .replace(/^-\s+/, '')
      .replace(/^\*\s+/, '')
      .replace(/^\d+\.\s+/, '');

    // Убираем эмодзи статуса
    title = title.replace(/^[✅❌⏳🔄🚫]\s+/, '');

    // Убираем markdown форматирование
    title = title.replace(/\*\*(.*?)\*\*/g, '$1');
    title = title.replace(/#{1,6}\s+/, '');

    task.title = title.trim();

    // Определяем приоритет по эмодзи и ключевым словам
    if (line.includes('🔥') || line.includes('КРИТИЧНО') || line.includes('URGENT')) {
      task.priority = 'high';
    } else if (line.includes('⭐') || line.includes('ВАЖНО') || line.includes('ВАЖНЫЙ')) {
      task.priority = 'medium';
    }

    // Определяем начальное состояние по эмодзи
    if (line.includes('✅')) {
      task.state = this.taskStates.DONE;
    } else if (line.includes('🔄')) {
      task.state = this.taskStates.IN_PROGRESS;
    } else if (line.includes('🚫') || line.includes('❌')) {
      task.state = this.taskStates.BLOCKED;
    }

    return task;
  }

  /**
   * Инициализация прогресса для новой дорожной карты
   */
  initRoadmapProgress(filePath, roadmap) {
    const progressData = {
      roadmapTitle: roadmap.title,
      totalTasks: roadmap.tasks.length,
      tasks: {},
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Инициализируем состояние каждой задачи
    roadmap.tasks.forEach(task => {
      progressData.tasks[task.id] = {
        state: task.state,
        updatedAt: new Date().toISOString(),
        completedBy: null,
        notes: '',
      };
    });

    this.progress.set(filePath, progressData);
    this.saveProgress();
  }

  /**
   * Создание пользовательского интерфейса
   */
  createUI() {
    const container = document.createElement('div');
    container.id = 'roadmap-manager-ui';
    container.className = 'roadmap-manager';

    container.innerHTML = `
            <div class="roadmap-header">
                <h2>🗺️ Управление дорожными картами HEYS</h2>
                <div class="roadmap-stats">
                    <span class="total-roadmaps">Карт: ${this.roadmaps.size}</span>
                    <span class="total-tasks">Всего задач: ${this.getTotalTasks()}</span>
                    <span class="completed-tasks">Выполнено: ${this.getCompletedTasks()}</span>
                </div>
            </div>
            
            <div class="roadmap-controls">
                <button onclick="window.roadmapManager.exportProgress()" class="export-btn">📊 Экспорт прогресса</button>
                <button onclick="window.roadmapManager.resetProgress()" class="reset-btn">🔄 Сброс прогресса</button>
                <button onclick="window.roadmapManager.refresh()" class="refresh-btn">🔄 Обновить</button>
            </div>
            
            <div class="roadmap-list" id="roadmap-list">
                ${this.renderRoadmaps()}
            </div>
        `;

    // Добавляем стили
    this.addStyles();

    // Добавляем в DOM
    document.body.appendChild(container);

    // Глобальный доступ
    window.roadmapManager = this;
  }

  /**
   * Рендеринг списка дорожных карт
   */
  renderRoadmaps() {
    let html = '';

    for (const [filePath, roadmap] of this.roadmaps) {
      const progress = this.progress.get(filePath);
      const completedCount = this.getCompletedTasksForRoadmap(filePath);
      const totalCount = roadmap.tasks.length;
      const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      html += `
                <div class="roadmap-item" data-filepath="${filePath}">
                    <div class="roadmap-item-header">
                        <h3>${roadmap.title}</h3>
                        <div class="roadmap-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${percentage}%"></div>
                            </div>
                            <span class="progress-text">${completedCount}/${totalCount} (${percentage}%)</span>
                        </div>
                    </div>
                    
                    <div class="roadmap-sections">
                        ${this.renderSections(roadmap, filePath)}
                    </div>
                    
                    <div class="roadmap-actions">
                        <button onclick="window.roadmapManager.toggleRoadmap('${filePath}')" class="toggle-btn">
                            📋 Показать/скрыть задачи
                        </button>
                        <button onclick="window.roadmapManager.markAllCompleted('${filePath}')" class="complete-all-btn">
                            ✅ Отметить все как выполненные
                        </button>
                    </div>
                </div>
            `;
    }

    return html;
  }

  /**
   * Рендеринг секций дорожной карты
   */
  renderSections(roadmap, filePath) {
    let html = '';

    for (const section of roadmap.sections) {
      if (section.tasks.length === 0) continue;

      html += `
                <div class="roadmap-section">
                    <h4>${section.title}</h4>
                    <div class="task-list">
                        ${this.renderTasks(section.tasks, filePath)}
                    </div>
                </div>
            `;
    }

    return html;
  }

  /**
   * Рендеринг списка задач
   */
  renderTasks(tasks, filePath) {
    let html = '';

    for (const task of tasks) {
      const progress = this.progress.get(filePath);
      const taskProgress = progress?.tasks[task.id] || { state: task.state };
      const icon = this.taskIcons[taskProgress.state];
      const stateClass = taskProgress.state;

      html += `
                <div class="task-item ${stateClass}" data-task-id="${task.id}">
                    <div class="task-content">
                        <span class="task-icon">${icon}</span>
                        <span class="task-title">${task.title}</span>
                        <span class="task-priority priority-${task.priority}">
                            ${task.priority === 'high' ? '🔥' : task.priority === 'medium' ? '⭐' : ''}
                        </span>
                    </div>
                    
                    <div class="task-actions">
                        <button onclick="window.roadmapManager.setTaskState('${filePath}', '${task.id}', '${this.taskStates.TODO}')" 
                                class="state-btn todo-btn" title="К выполнению">⏳</button>
                        <button onclick="window.roadmapManager.setTaskState('${filePath}', '${task.id}', '${this.taskStates.IN_PROGRESS}')" 
                                class="state-btn progress-btn" title="В процессе">🔄</button>
                        <button onclick="window.roadmapManager.setTaskState('${filePath}', '${task.id}', '${this.taskStates.DONE}')" 
                                class="state-btn done-btn" title="Выполнено">✅</button>
                        <button onclick="window.roadmapManager.setTaskState('${filePath}', '${task.id}', '${this.taskStates.BLOCKED}')" 
                                class="state-btn blocked-btn" title="Заблокировано">🚫</button>
                    </div>
                </div>
            `;
    }

    return html;
  }

  /**
   * Установка состояния задачи
   */
  setTaskState(filePath, taskId, newState) {
    const progress = this.progress.get(filePath);
    if (!progress) return;

    progress.tasks[taskId] = {
      ...progress.tasks[taskId],
      state: newState,
      updatedAt: new Date().toISOString(),
      completedBy: newState === this.taskStates.DONE ? 'User' : null,
    };

    progress.lastUpdated = new Date().toISOString();

    this.saveProgress();
    this.updateUI();

    console.log(`✅ Задача "${taskId}" изменена на состояние: ${newState}`);
  }

  /**
   * Переключение видимости дорожной карты
   */
  toggleRoadmap(filePath) {
    const roadmapElement = document.querySelector(
      `[data-filepath="${filePath}"] .roadmap-sections`
    );
    if (roadmapElement) {
      roadmapElement.style.display = roadmapElement.style.display === 'none' ? 'block' : 'none';
    }
  }

  /**
   * Отметить все задачи как выполненные
   */
  markAllCompleted(filePath) {
    const roadmap = this.roadmaps.get(filePath);
    if (!roadmap) return;

    const progress = this.progress.get(filePath);
    if (!progress) return;

    roadmap.tasks.forEach(task => {
      progress.tasks[task.id] = {
        ...progress.tasks[task.id],
        state: this.taskStates.DONE,
        updatedAt: new Date().toISOString(),
        completedBy: 'User (bulk completion)',
      };
    });

    progress.lastUpdated = new Date().toISOString();
    this.saveProgress();
    this.updateUI();

    console.log(`✅ Все задачи в "${roadmap.title}" отмечены как выполненные`);
  }

  /**
   * Получение общего количества задач
   */
  getTotalTasks() {
    let total = 0;
    for (const roadmap of this.roadmaps.values()) {
      total += roadmap.tasks.length;
    }
    return total;
  }

  /**
   * Получение количества выполненных задач
   */
  getCompletedTasks() {
    let completed = 0;
    for (const [filePath, progress] of this.progress) {
      for (const taskProgress of Object.values(progress.tasks)) {
        if (taskProgress.state === this.taskStates.DONE) {
          completed++;
        }
      }
    }
    return completed;
  }

  /**
   * Получение количества выполненных задач для конкретной дорожной карты
   */
  getCompletedTasksForRoadmap(filePath) {
    const progress = this.progress.get(filePath);
    if (!progress) return 0;

    let completed = 0;
    for (const taskProgress of Object.values(progress.tasks)) {
      if (taskProgress.state === this.taskStates.DONE) {
        completed++;
      }
    }
    return completed;
  }

  /**
   * Обновление интерфейса
   */
  updateUI() {
    const roadmapList = document.getElementById('roadmap-list');
    if (roadmapList) {
      roadmapList.innerHTML = this.renderRoadmaps();
    }

    // Обновляем статистику
    const totalRoadmaps = document.querySelector('.total-roadmaps');
    const totalTasks = document.querySelector('.total-tasks');
    const completedTasks = document.querySelector('.completed-tasks');

    if (totalRoadmaps) totalRoadmaps.textContent = `Карт: ${this.roadmaps.size}`;
    if (totalTasks) totalTasks.textContent = `Всего задач: ${this.getTotalTasks()}`;
    if (completedTasks) completedTasks.textContent = `Выполнено: ${this.getCompletedTasks()}`;
  }

  /**
   * Экспорт прогресса
   */
  exportProgress() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      roadmaps: [],
      summary: {
        totalRoadmaps: this.roadmaps.size,
        totalTasks: this.getTotalTasks(),
        completedTasks: this.getCompletedTasks(),
        progressPercentage: Math.round((this.getCompletedTasks() / this.getTotalTasks()) * 100),
      },
    };

    for (const [filePath, roadmap] of this.roadmaps) {
      const progress = this.progress.get(filePath);
      const completedCount = this.getCompletedTasksForRoadmap(filePath);

      exportData.roadmaps.push({
        filePath,
        title: roadmap.title,
        totalTasks: roadmap.tasks.length,
        completedTasks: completedCount,
        progress: Math.round((completedCount / roadmap.tasks.length) * 100),
        tasks: roadmap.tasks.map(task => ({
          id: task.id,
          title: task.title,
          section: task.section,
          priority: task.priority,
          state: progress?.tasks[task.id]?.state || task.state,
          updatedAt: progress?.tasks[task.id]?.updatedAt,
          completedBy: progress?.tasks[task.id]?.completedBy,
        })),
      });
    }

    // Скачиваем файл
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heys-roadmap-progress-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('📊 Прогресс экспортирован:', exportData);
  }

  /**
   * Сброс прогресса
   */
  resetProgress() {
    if (confirm('Вы уверены что хотите сбросить весь прогресс? Это действие нельзя отменить.')) {
      this.progress.clear();
      localStorage.removeItem(this.storageKey);

      // Переинициализируем прогресс
      for (const [filePath, roadmap] of this.roadmaps) {
        this.initRoadmapProgress(filePath, roadmap);
      }

      this.updateUI();
      console.log('🔄 Прогресс сброшен');
    }
  }

  /**
   * Обновление данных
   */
  async refresh() {
    console.log('🔄 Обновление дорожных карт...');
    this.roadmaps.clear();
    await this.loadRoadmaps();
    this.updateUI();
    console.log('✅ Обновление завершено');
  }

  /**
   * Сохранение прогресса в localStorage
   */
  saveProgress() {
    const progressData = {};
    for (const [filePath, progress] of this.progress) {
      progressData[filePath] = progress;
    }
    localStorage.setItem(this.storageKey, JSON.stringify(progressData));
  }

  /**
   * Загрузка прогресса из localStorage
   */
  loadProgress() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const progressData = JSON.parse(saved);
        for (const [filePath, progress] of Object.entries(progressData)) {
          this.progress.set(filePath, progress);
        }
      }
    } catch (error) {
      console.warn('⚠️ Ошибка загрузки прогресса:', error);
    }
  }

  /**
   * Добавление стилей
   */
  addStyles() {
    if (document.getElementById('roadmap-manager-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'roadmap-manager-styles';
    styles.textContent = `
            .roadmap-manager {
                max-width: 1200px;
                margin: 20px auto;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 10px;
                font-family: 'Segoe UI', sans-serif;
            }

            .roadmap-header {
                text-align: center;
                margin-bottom: 20px;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 10px;
            }

            .roadmap-stats {
                display: flex;
                justify-content: space-around;
                margin-top: 15px;
                flex-wrap: wrap;
            }

            .roadmap-stats span {
                background: rgba(255,255,255,0.2);
                padding: 8px 15px;
                border-radius: 20px;
                margin: 5px;
            }

            .roadmap-controls {
                display: flex;
                justify-content: center;
                gap: 10px;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }

            .roadmap-controls button {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.3s ease;
            }

            .export-btn { background: #28a745; color: white; }
            .reset-btn { background: #dc3545; color: white; }
            .refresh-btn { background: #17a2b8; color: white; }

            .roadmap-controls button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }

            .roadmap-item {
                background: white;
                margin-bottom: 20px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                overflow: hidden;
            }

            .roadmap-item-header {
                padding: 20px;
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                color: white;
            }

            .roadmap-item-header h3 {
                margin: 0 0 15px 0;
                font-size: 1.4em;
            }

            .roadmap-progress {
                display: flex;
                align-items: center;
                gap: 15px;
            }

            .progress-bar {
                flex: 1;
                height: 8px;
                background: rgba(255,255,255,0.3);
                border-radius: 4px;
                overflow: hidden;
            }

            .progress-fill {
                height: 100%;
                background: #4CAF50;
                transition: width 0.3s ease;
            }

            .progress-text {
                font-weight: bold;
                min-width: 80px;
            }

            .roadmap-sections {
                padding: 20px;
            }

            .roadmap-section {
                margin-bottom: 25px;
            }

            .roadmap-section h4 {
                color: #333;
                border-bottom: 2px solid #e9ecef;
                padding-bottom: 8px;
                margin-bottom: 15px;
            }

            .task-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 15px;
                margin-bottom: 8px;
                border-radius: 8px;
                border-left: 4px solid #e9ecef;
                background: #f8f9fa;
                transition: all 0.3s ease;
            }

            .task-item:hover {
                transform: translateX(5px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .task-item.done {
                background: #d4edda;
                border-left-color: #28a745;
            }

            .task-item.in_progress {
                background: #fff3cd;
                border-left-color: #ffc107;
            }

            .task-item.blocked {
                background: #f8d7da;
                border-left-color: #dc3545;
            }

            .task-content {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
            }

            .task-icon {
                font-size: 1.2em;
            }

            .task-title {
                flex: 1;
                font-weight: 500;
            }

            .task-priority {
                margin-left: 10px;
            }

            .task-actions {
                display: flex;
                gap: 5px;
            }

            .state-btn {
                width: 35px;
                height: 35px;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                font-size: 1.1em;
                transition: all 0.2s ease;
                background: #e9ecef;
            }

            .state-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }

            .todo-btn:hover { background: #ffc107; }
            .progress-btn:hover { background: #17a2b8; }
            .done-btn:hover { background: #28a745; }
            .blocked-btn:hover { background: #dc3545; }

            .roadmap-actions {
                padding: 15px 20px;
                background: #f8f9fa;
                display: flex;
                gap: 10px;
                justify-content: center;
                flex-wrap: wrap;
            }

            .toggle-btn, .complete-all-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.2s ease;
            }

            .toggle-btn {
                background: #6c757d;
                color: white;
            }

            .complete-all-btn {
                background: #28a745;
                color: white;
            }

            .toggle-btn:hover, .complete-all-btn:hover {
                transform: translateY(-1px);
                opacity: 0.9;
            }

            @media (max-width: 768px) {
                .roadmap-manager {
                    margin: 10px;
                    padding: 15px;
                }

                .roadmap-stats {
                    flex-direction: column;
                    align-items: center;
                }

                .task-item {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 10px;
                }

                .task-actions {
                    align-self: flex-end;
                }
            }
        `;

    document.head.appendChild(styles);
  }
}

// Автоматическая инициализация при загрузке страницы
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.roadmapManager) {
      window.roadmapManager = new RoadmapManager();
    }
  });
}

// Экспорт для использования в модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoadmapManager;
}
