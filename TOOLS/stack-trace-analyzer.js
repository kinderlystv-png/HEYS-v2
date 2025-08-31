/**
 * 🔍 STACK TRACE ANALYZER
 * Анализатор стеков вызовов для точной локализации ошибок
 *
 * Возможности:
 * - Парсинг и анализ JavaScript stack traces
 * - Определение точного места возникновения ошибки
 * - Извлечение контекстной информации о функциях
 * - Интеграция с HEYS модулями для умного анализа
 *
 * @version 1.0.0
 * @created 26.08.2025
 */

class StackTraceAnalyzer {
  constructor() {
    this.heysModules = new Set();
    this.knownPatterns = this.initializeKnownPatterns();
    this.init();
  }

  init() {
    this.detectHeysModules();
  }

  /**
   * 🔍 Обнаружение HEYS модулей в проекте
   */
  detectHeysModules() {
    // Обнаружение HEYS модулей из window объекта
    if (typeof window !== 'undefined' && window.HEYS) {
      Object.keys(window.HEYS).forEach(moduleName => {
        this.heysModules.add(moduleName);
      });
    }

    // Обнаружение по именам файлов в stack traces
    const heysFilePatterns = [
      /heys_[\w_]+\.js/,
      /heys-[\w-]+\.js/,
      /super-diagnostic-center\.html/,
      /ROADMAPS_SUPERSYSTEM\.html/,
    ];

    this.heysFilePatterns = heysFilePatterns;
  }

  /**
   * 📚 Инициализация известных паттернов ошибок
   */
  initializeKnownPatterns() {
    return {
      moduleNotFound: [
        /Cannot read propert(y|ies) of undefined/,
        /is not defined/,
        /Cannot access before initialization/,
      ],
      typeError: [
        /Cannot read propert(y|ies) of null/,
        /Cannot set propert(y|ies) of null/,
        /is not a function/,
      ],
      syntaxError: [/Unexpected token/, /Invalid or unexpected token/, /Unexpected end of input/],
      networkError: [/Failed to fetch/, /NetworkError/, /ERR_NETWORK/],
      heysSpecific: [/HEYS\./, /namespace.*undefined/, /supabase.*not.*defined/],
    };
  }

  /**
   * 🔬 Основной метод анализа stack trace
   */
  analyze(stackTrace) {
    if (!stackTrace) {
      return {
        success: false,
        error: 'No stack trace provided',
      };
    }

    try {
      const parsed = this.parseStackTrace(stackTrace);
      const analysis = this.performDetailedAnalysis(parsed);
      const suggestions = this.generateSuggestions(analysis);

      return {
        success: true,
        parsed: parsed,
        analysis: analysis,
        suggestions: suggestions,
        heysContext: this.extractHeysContext(parsed),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rawStackTrace: stackTrace,
      };
    }
  }

  /**
   * 📋 Парсинг stack trace в структурированный формат
   */
  parseStackTrace(stackTrace) {
    const lines = stackTrace.split('\n').filter(line => line.trim());
    const frames = [];

    for (const line of lines) {
      const frame = this.parseStackFrame(line.trim());
      if (frame) {
        frames.push(frame);
      }
    }

    return {
      rawTrace: stackTrace,
      frames: frames,
      topFrame: frames[0] || null,
      heysFrames: frames.filter(frame => this.isHeysFrame(frame)),
    };
  }

  /**
   * 🔍 Парсинг отдельного фрейма stack trace
   */
  parseStackFrame(line) {
    // Различные форматы stack trace в разных браузерах
    const patterns = [
      // Chrome/V8: "at functionName (file:line:column)"
      /at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/,
      // Chrome/V8: "at file:line:column"
      /at\s+(.+?):(\d+):(\d+)/,
      // Firefox: "functionName@file:line:column"
      /(.+?)@(.+?):(\d+):(\d+)/,
      // Safari: "functionName (file:line:column)"
      /(.+?)\s+\((.+?):(\d+):(\d+)\)/,
      // Edge: various formats
      /(.+?)\s+(.+?):(\d+):(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return this.createFrameObject(match, line);
      }
    }

    // Если не удалось распарсить, возвращаем базовую информацию
    return {
      raw: line,
      functionName: 'unknown',
      fileName: 'unknown',
      lineNumber: 0,
      columnNumber: 0,
      isHeys: false,
    };
  }

  /**
   * 🏗️ Создание объекта фрейма
   */
  createFrameObject(match, rawLine) {
    let functionName, fileName, lineNumber, columnNumber;

    if (match.length === 5) {
      // Полный формат с именем функции
      [, functionName, fileName, lineNumber, columnNumber] = match;
    } else if (match.length === 4) {
      // Формат без имени функции или с другой структурой
      if (match[1].includes(':')) {
        // Формат "at file:line:column"
        [, fileName, lineNumber, columnNumber] = match;
        functionName = 'anonymous';
      } else {
        [, functionName, fileName, lineNumber, columnNumber] = match;
      }
    } else {
      functionName = 'unknown';
      fileName = match[1] || 'unknown';
      lineNumber = match[2] || 0;
      columnNumber = match[3] || 0;
    }

    return {
      raw: rawLine,
      functionName: functionName?.trim() || 'anonymous',
      fileName: fileName?.trim() || 'unknown',
      lineNumber: parseInt(lineNumber) || 0,
      columnNumber: parseInt(columnNumber) || 0,
      isHeys: this.isHeysFrame({ fileName }),
      fileType: this.getFileType(fileName),
    };
  }

  /**
   * 🎯 Проверка, является ли фрейм частью HEYS
   */
  isHeysFrame(frame) {
    if (!frame.fileName) return false;

    return this.heysFilePatterns.some(pattern => pattern.test(frame.fileName));
  }

  /**
   * 📄 Определение типа файла
   */
  getFileType(fileName) {
    if (!fileName || fileName === 'unknown') return 'unknown';

    const extension = fileName.split('.').pop()?.toLowerCase();
    const typeMap = {
      js: 'javascript',
      ts: 'typescript',
      html: 'html',
      htm: 'html',
      css: 'css',
      json: 'json',
    };

    return typeMap[extension] || 'unknown';
  }

  /**
   * 🔬 Детальный анализ распарсенного stack trace
   */
  performDetailedAnalysis(parsed) {
    const analysis = {
      errorLocation: null,
      errorType: 'unknown',
      heysInvolved: false,
      criticalFrame: null,
      callChain: [],
      patterns: [],
    };

    // Определение критического фрейма (где произошла ошибка)
    analysis.criticalFrame = parsed.topFrame;
    analysis.errorLocation = this.extractErrorLocation(parsed.topFrame);

    // Анализ вовлеченности HEYS модулей
    analysis.heysInvolved = parsed.heysFrames.length > 0;

    // Построение цепочки вызовов
    analysis.callChain = this.buildCallChain(parsed.frames);

    // Обнаружение паттернов ошибок
    analysis.patterns = this.detectErrorPatterns(parsed);

    // Определение типа ошибки
    analysis.errorType = this.determineErrorType(analysis);

    return analysis;
  }

  /**
   * 📍 Извлечение точного местоположения ошибки
   */
  extractErrorLocation(frame) {
    if (!frame) return null;

    return {
      file: frame.fileName,
      function: frame.functionName,
      line: frame.lineNumber,
      column: frame.columnNumber,
      context: this.getFileContext(frame.fileName),
      isHeysModule: frame.isHeys,
    };
  }

  /**
   * 📁 Получение контекста файла
   */
  getFileContext(fileName) {
    if (!fileName || fileName === 'unknown') return null;

    // Определение контекста на основе имени файла
    const contexts = {
      heys_core: 'Основная логика HEYS',
      heys_storage: 'Система хранения данных',
      heys_user: 'Управление пользователями',
      heys_day: 'Дневная логика',
      heys_reports: 'Система отчетов',
      'super-diagnostic': 'Диагностическая система',
      ROADMAPS_SUPERSYSTEM: 'Система дорожных карт',
    };

    for (const [key, description] of Object.entries(contexts)) {
      if (fileName.includes(key)) {
        return {
          module: key,
          description: description,
          category: 'heys',
        };
      }
    }

    return {
      module: 'external',
      description: 'Внешний модуль или браузерный код',
      category: 'external',
    };
  }

  /**
   * 🔗 Построение цепочки вызовов
   */
  buildCallChain(frames) {
    return frames.slice(0, 10).map((frame, index) => ({
      depth: index,
      function: frame.functionName,
      file: frame.fileName,
      line: frame.lineNumber,
      isHeys: frame.isHeys,
    }));
  }

  /**
   * 🔍 Обнаружение паттернов ошибок
   */
  detectErrorPatterns(parsed) {
    const patterns = [];
    const stackText = parsed.rawTrace.toLowerCase();

    for (const [patternType, regexList] of Object.entries(this.knownPatterns)) {
      for (const regex of regexList) {
        if (regex.test(stackText)) {
          patterns.push({
            type: patternType,
            confidence: this.calculatePatternConfidence(patternType, parsed),
            description: this.getPatternDescription(patternType),
          });
          break; // Один паттерн на тип
        }
      }
    }

    return patterns;
  }

  /**
   * 📊 Вычисление уверенности в паттерне
   */
  calculatePatternConfidence(patternType, parsed) {
    let confidence = 0.5; // Базовая уверенность

    // Увеличиваем уверенность если вовлечены HEYS модули
    if (parsed.heysFrames.length > 0) {
      confidence += 0.2;
    }

    // Увеличиваем для специфичных паттернов HEYS
    if (patternType === 'heysSpecific') {
      confidence += 0.3;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 📝 Получение описания паттерна
   */
  getPatternDescription(patternType) {
    const descriptions = {
      moduleNotFound: 'Модуль или переменная не найдена',
      typeError: 'Ошибка типа данных',
      syntaxError: 'Синтаксическая ошибка',
      networkError: 'Ошибка сети',
      heysSpecific: 'Специфичная ошибка HEYS системы',
    };

    return descriptions[patternType] || 'Неизвестный тип ошибки';
  }

  /**
   * 🎯 Определение общего типа ошибки
   */
  determineErrorType(analysis) {
    if (analysis.patterns.length === 0) {
      return 'unknown';
    }

    // Возвращаем паттерн с наивысшей уверенностью
    const bestPattern = analysis.patterns.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return bestPattern.type;
  }

  /**
   * 💡 Генерация предложений по исправлению
   */
  generateSuggestions(analysis) {
    const suggestions = [];

    for (const pattern of analysis.patterns) {
      const patternSuggestions = this.getSuggestionsForPattern(pattern.type, analysis);
      suggestions.push(...patternSuggestions);
    }

    // Добавляем общие предложения
    suggestions.push(...this.getGeneralSuggestions(analysis));

    // Убираем дубликаты и сортируем по приоритету
    return this.deduplicateAndSortSuggestions(suggestions);
  }

  /**
   * 💡 Предложения для конкретных паттернов
   */
  getSuggestionsForPattern(patternType, analysis) {
    const suggestions = [];

    switch (patternType) {
      case 'moduleNotFound':
        suggestions.push({
          type: 'check',
          priority: 'high',
          message: 'Проверьте, что модуль загружен и доступен',
          action: 'Убедитесь что HEYS namespace инициализирован',
        });
        break;

      case 'typeError':
        suggestions.push({
          type: 'validate',
          priority: 'high',
          message: 'Добавьте проверку на null/undefined',
          action: 'Используйте optional chaining (?.) или проверки if',
        });
        break;

      case 'heysSpecific':
        suggestions.push({
          type: 'heys',
          priority: 'critical',
          message: 'Ошибка в HEYS системе',
          action: 'Проверьте инициализацию HEYS модулей в правильном порядке',
        });
        break;

      case 'networkError':
        suggestions.push({
          type: 'network',
          priority: 'medium',
          message: 'Проблема с сетевым запросом',
          action: 'Проверьте соединение с Supabase или локальным сервером',
        });
        break;
    }

    return suggestions;
  }

  /**
   * 🔧 Общие предложения
   */
  getGeneralSuggestions(analysis) {
    const suggestions = [];

    if (analysis.heysInvolved) {
      suggestions.push({
        type: 'debug',
        priority: 'medium',
        message: 'Используйте HEYS диагностику',
        action: 'Запустите диагностические тесты для проверки состояния системы',
      });
    }

    if (analysis.errorLocation && analysis.errorLocation.line > 0) {
      suggestions.push({
        type: 'location',
        priority: 'low',
        message: `Ошибка в строке ${analysis.errorLocation.line}`,
        action: `Проверьте код в файле ${analysis.errorLocation.file}:${analysis.errorLocation.line}`,
      });
    }

    return suggestions;
  }

  /**
   * 🔄 Удаление дубликатов и сортировка предложений
   */
  deduplicateAndSortSuggestions(suggestions) {
    // Удаление дубликатов по сообщению
    const unique = suggestions.filter(
      (suggestion, index, array) => array.findIndex(s => s.message === suggestion.message) === index
    );

    // Сортировка по приоритету
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return unique.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * 🏠 Извлечение HEYS контекста
   */
  extractHeysContext(parsed) {
    const heysContext = {
      modulesInvolved: [],
      callDepth: 0,
      entryPoint: null,
      systemState: this.getHeysSystemState(),
    };

    // Найдем все HEYS модули в stack trace
    parsed.heysFrames.forEach(frame => {
      const moduleName = this.extractModuleName(frame.fileName);
      if (moduleName && !heysContext.modulesInvolved.includes(moduleName)) {
        heysContext.modulesInvolved.push(moduleName);
      }
    });

    // Определяем точку входа в HEYS
    const firstHeysFrame = parsed.frames.find(frame => frame.isHeys);
    if (firstHeysFrame) {
      heysContext.entryPoint = {
        function: firstHeysFrame.functionName,
        file: firstHeysFrame.fileName,
        line: firstHeysFrame.lineNumber,
      };
    }

    // Глубина вызовов HEYS
    heysContext.callDepth = parsed.heysFrames.length;

    return heysContext;
  }

  /**
   * 📦 Извлечение имени модуля из имени файла
   */
  extractModuleName(fileName) {
    if (!fileName) return null;

    const modulePatterns = [
      /heys_(\w+)_v?\d*\.js/,
      /heys-(\w+)-v?\d*\.js/,
      /(super-diagnostic-center|ROADMAPS_SUPERSYSTEM)\.html/,
    ];

    for (const pattern of modulePatterns) {
      const match = fileName.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 🔍 Получение состояния HEYS системы
   */
  getHeysSystemState() {
    if (typeof window === 'undefined' || !window.HEYS) {
      return { status: 'not_initialized', modules: [] };
    }

    const state = {
      status: 'initialized',
      modules: Object.keys(window.HEYS),
      namespace: !!window.HEYS,
      core: !!window.HEYS.core,
      storage: !!window.HEYS.storage,
    };

    return state;
  }
}

// Создание глобального экземпляра
if (typeof window !== 'undefined') {
  window.StackTraceAnalyzer = StackTraceAnalyzer;
}

// Экспорт для модульных систем
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StackTraceAnalyzer;
}
