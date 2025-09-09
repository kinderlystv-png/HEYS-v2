#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Модуль самообучения анализатора
const learningSystem = {
  projectPatterns: {},
  metricDistributions: {},
  suggestedThresholds: {},

  // Анализ распределения метрик для самообучения
  analyzeMetricDistributions(results) {
    // Анализ распределения размера файлов
    const fileSizes = results.complexityData.map(file => file.linesOfCode);

    if (fileSizes.length > 0) {
      const sortedSizes = [...fileSizes].sort((a, b) => a - b);
      const median = sortedSizes[Math.floor(sortedSizes.length / 2)];
      const p75 = sortedSizes[Math.floor(sortedSizes.length * 0.75)];
      const p90 = sortedSizes[Math.floor(sortedSizes.length * 0.9)];

      this.metricDistributions.fileSize = { median, p75, p90 };

      // Предложение по корректировке порога размера файла
      if (p90 < 300 * 0.7) {
        this.suggestedThresholds.fileSize = Math.max(p90 * 1.2, 200);
      } else if (p75 > 300 * 1.2) {
        this.suggestedThresholds.fileSize = Math.max(p75 * 1.1, 350);
      }
    }

    // Анализ распределения сложности
    const complexities = results.complexityData.map(file => file.cyclomaticComplexity);
    if (complexities.length > 0) {
      const sortedComplexities = [...complexities].sort((a, b) => a - b);
      const median = sortedComplexities[Math.floor(sortedComplexities.length / 2)];
      const p75 = sortedComplexities[Math.floor(sortedComplexities.length * 0.75)];

      this.metricDistributions.complexity = { median, p75 };

      // Предложение по корректировке порога сложности
      if (p75 < 15 * 0.7) {
        this.suggestedThresholds.complexity = Math.max(p75 * 1.2, 10);
      } else if (median > 15 * 0.8) {
        this.suggestedThresholds.complexity = Math.max(median * 1.1, 18);
      }
    }

    // Анализ индекса сопровождаемости
    const maintainabilityIndexes = results.complexityData.map(file => file.maintainabilityIndex);
    if (maintainabilityIndexes.length > 0) {
      const sortedMaintainability = [...maintainabilityIndexes].sort((a, b) => a - b);
      const p25 = sortedMaintainability[Math.floor(sortedMaintainability.length * 0.25)];
      const p50 = sortedMaintainability[Math.floor(sortedMaintainability.length * 0.5)];

      this.metricDistributions.maintainability = { p25, p50 };

      // Предложение по корректировке порога индекса сопровождаемости
      if (p25 > 65 * 1.1) {
        this.suggestedThresholds.maintainability = Math.min(p25 * 0.95, 70);
      } else if (p50 < 65 * 0.8) {
        this.suggestedThresholds.maintainability = Math.max(p50 * 1.1, 60);
      }
    }

    return this;
  },

  // Определение архитектурных паттернов проекта
  detectProjectPatterns(results) {
    // Анализ распределения файлов по директориям для определения архитектуры
    const dirPatterns = {};
    for (const [dir, data] of Object.entries(results.filesByDirectory)) {
      const dirName = path.basename(dir);
      // Распознаем типичные директории в архитектурах
      if (['components', 'views', 'pages'].includes(dirName)) {
        dirPatterns.uiLayer = dirPatterns.uiLayer || {};
        dirPatterns.uiLayer[dirName] = data.files.length;
      } else if (['services', 'api', 'data', 'store', 'stores'].includes(dirName)) {
        dirPatterns.dataLayer = dirPatterns.dataLayer || {};
        dirPatterns.dataLayer[dirName] = data.files.length;
      } else if (['utils', 'helpers', 'lib', 'common'].includes(dirName)) {
        dirPatterns.utilLayer = dirPatterns.utilLayer || {};
        dirPatterns.utilLayer[dirName] = data.files.length;
      }
    }

    // Определяем типовой архитектурный паттерн
    const fileExtensions = new Set(results.complexityData.map(file => path.extname(file.path)));

    if (dirPatterns.uiLayer && dirPatterns.dataLayer) {
      if (Object.keys(dirPatterns.uiLayer).includes('components') &&
          Object.keys(dirPatterns.uiLayer).includes('pages')) {
        this.projectPatterns.architecture = 'React/Next.js';
      } else if (Object.keys(dirPatterns.uiLayer).includes('components') &&
                Object.keys(dirPatterns.dataLayer).includes('store')) {
        this.projectPatterns.architecture = 'Vue/Vuex';
      } else if (fileExtensions.has('.svelte')) {
        this.projectPatterns.architecture = 'SvelteKit';
      } else {
        this.projectPatterns.architecture = 'Generic Frontend';
      }
    } else if (fileExtensions.has('.ts') && !fileExtensions.has('.jsx')) {
      this.projectPatterns.architecture = 'Node.js/TypeScript Backend';
    } else {
      this.projectPatterns.architecture = 'Generic JavaScript Project';
    }

    return this;
  },

  // Генерация рекомендаций по улучшению критериев оценки
  generateAnalyzerImprovements(results) {
    const improvements = {
      thresholdAdjustments: [],
      additionalMetrics: [],
      contextualRules: []
    };

    // Рекомендации по корректировке порогов на основе распределения метрик
    if (this.suggestedThresholds.fileSize &&
        Math.abs(this.suggestedThresholds.fileSize - 300) > 50) {
      improvements.thresholdAdjustments.push({
        metric: 'Размер файла',
        current: 300,
        suggested: Math.round(this.suggestedThresholds.fileSize),
        reason: `Распределение размеров файлов в проекте (медиана: ${this.metricDistributions.fileSize.median}, P90: ${this.metricDistributions.fileSize.p90})`
      });
    }

    if (this.suggestedThresholds.complexity &&
        Math.abs(this.suggestedThresholds.complexity - 15) > 3) {
      improvements.thresholdAdjustments.push({
        metric: 'Цикломатическая сложность',
        current: 15,
        suggested: Math.round(this.suggestedThresholds.complexity),
        reason: `Распределение сложности в проекте (медиана: ${this.metricDistributions.complexity?.median})`
      });
    }

    if (this.suggestedThresholds.maintainability &&
        Math.abs(this.suggestedThresholds.maintainability - 65) > 5) {
      improvements.thresholdAdjustments.push({
        metric: 'Индекс сопровождаемости',
        current: 65,
        suggested: Math.round(this.suggestedThresholds.maintainability),
        reason: `Распределение индекса сопровождаемости в проекте (P25: ${this.metricDistributions.maintainability?.p25})`
      });
    }

    // Предложения новых метрик на основе архитектуры проекта
    if (this.projectPatterns.architecture) {
      switch(this.projectPatterns.architecture) {
        case 'React/Next.js':
          improvements.additionalMetrics.push({
            name: 'Анализ размера пропсов компонентов',
            description: 'Выявление компонентов с избыточным количеством props (>8)',
            implementation: 'Парсинг определений компонентов и подсчет props'
          });
          improvements.contextualRules.push({
            name: 'Правила для React-хуков',
            description: 'Проверка корректности использования правила зависимостей в useEffect/useMemo/useCallback',
            implementation: 'Статический анализ замыканий в хуках'
          });
          break;
        case 'Vue/Vuex':
          improvements.additionalMetrics.push({
            name: 'Анализ размера шаблонов компонентов',
            description: 'Выявление компонентов со сложными шаблонами',
            implementation: 'Подсчет количества директив и вложенности шаблонов'
          });
          break;
        case 'SvelteKit':
          improvements.additionalMetrics.push({
            name: 'Анализ реактивных переменных',
            description: 'Поиск избыточного использования реактивных переменных',
            implementation: 'Анализ использования $: синтаксиса'
          });
          break;
        case 'Node.js/TypeScript Backend':
          improvements.additionalMetrics.push({
            name: 'Анализ обработки ошибок',
            description: 'Проверка корректности обработки асинхронных ошибок',
            implementation: 'Анализ try/catch блоков в async функциях'
          });
          improvements.additionalMetrics.push({
            name: 'Анализ производительности',
            description: 'Выявление потенциальных узких мест в API-эндпоинтах',
            implementation: 'Анализ сложных запросов к базе данных и циклов'
          });
          break;
      }
    }

    // Дополнительные универсальные метрики
    const filesWithHighComplexity = results.complexityData.filter(f => f.cyclomaticComplexity > 15);
    if (filesWithHighComplexity.length > results.totalFiles * 0.2) {
      improvements.additionalMetrics.push({
        name: 'Расширенная когнитивная сложность',
        description: 'Улучшенная оценка понятности кода с учетом архитектурных паттернов',
        implementation: 'Анализ вложенности, рекурсии и абстракций с весами по архитектуре'
      });
    }

    // Если много файлов с низкой сопровождаемостью
    const lowMaintainabilityFiles = results.complexityData.filter(f => f.maintainabilityIndex < 65);
    if (lowMaintainabilityFiles.length > results.totalFiles * 0.3) {
      improvements.additionalMetrics.push({
        name: 'Анализ технического долга по времени',
        description: 'Оценка времени, необходимого для улучшения сопровождаемости',
        implementation: 'Расчет на основе размера файла, сложности и частоты изменений'
      });
    }

    return improvements;
  }
};

// Основная функция анализа
async function analyzeProject() {
  const projectRoot = process.argv[2] || process.cwd();
  const outputFile = path.join(projectRoot, 'advanced-analysis-report.md');

  console.log(`Углубленный анализ проекта: ${projectRoot}`);
  console.log('Версия анализатора: 2.0.0 (с самообучением)');

  // Собираем список файлов
  const jsFiles = collectFiles(projectRoot, ['**/*.{js,jsx,ts,tsx,svelte,vue}']);

  // Результаты анализа
  const results = {
    totalFiles: jsFiles.length,
    complexityData: [],
    duplicationData: null,
    architectureMetrics: {},
    summary: {},
    filesByDirectory: {},
    hotspots: [],
    technicalDebt: 0,
  };

  // 1. Анализ сложности кода
  console.log('Анализ сложности кода...');
  for (const file of jsFiles) {
    try {
      const fullPath = path.join(projectRoot, file);
      const content = fs.readFileSync(fullPath, 'utf8');

      const fileAnalysis = analyzeFileComplexity(file, content);
      results.complexityData.push(fileAnalysis);

      // Группировка по директориям
      const dir = path.dirname(file);
      if (!results.filesByDirectory[dir]) {
        results.filesByDirectory[dir] = { files: [], avgComplexity: 0, totalLines: 0 };
      }
      results.filesByDirectory[dir].files.push(fileAnalysis);
      results.filesByDirectory[dir].totalLines += fileAnalysis.linesOfCode;
    } catch (error) {
      console.error(`Ошибка при анализе файла ${file}:`, error.message);
    }
  }

  // Вычисляем средние значения по директориям
  for (const dir in results.filesByDirectory) {
    const dirData = results.filesByDirectory[dir];
    if (dirData.files.length > 0) {
      dirData.avgComplexity =
        dirData.files.reduce((sum, f) => sum + f.cyclomaticComplexity, 0) / dirData.files.length;
    }
  }

  // 2. Анализ дублирования кода
  console.log('Анализ дублирования кода...');
  results.duplicationData = analyzeDuplication(jsFiles, projectRoot);

  // 3. Архитектурные метрики
  console.log('Расчет архитектурных метрик...');
  calculateArchitecturalMetrics(results, jsFiles, projectRoot);

  // 4. Поиск hotspot'ов
  console.log('Поиск проблемных файлов...');
  findHotspots(results, projectRoot);

  // 5. Оценка необходимости рефакторинга
  calculateRefactoringNeeds(results);

  // 6. Самообучение анализатора
  console.log('Анализ паттернов проекта для самообучения...');
  learningSystem.analyzeMetricDistributions(results);
  learningSystem.detectProjectPatterns(results);
  const analyzerImprovements = learningSystem.generateAnalyzerImprovements(results);

  // 7. Генерация отчета
  generateAdvancedReport(results, outputFile, projectRoot, analyzerImprovements);

  console.log(`Углубленный анализ завершен. Отчет сохранен в: ${outputFile}`);

  // Краткая сводка
  console.log('\n🎯 Результаты углубленного анализа:');
  console.log(`- Всего файлов: ${results.totalFiles}`);
  console.log(
    `- Файлов требующих рефакторинга: ${results.summary.totalFilesNeedingRefactoring} (${results.summary.refactoringPercentage.toFixed(1)}%)`
  );
  console.log(`- Циклических зависимостей: ${results.summary.cyclicDependencies}`);
  console.log(`- Дублирование кода: ${results.summary.duplicationPercentage.toFixed(1)}%`);
  console.log(`- Необходимость рефакторинга: ${results.summary.refactoringNecessity}`);
  console.log(`- Технический долг: ${results.technicalDebt.toFixed(1)} часов`);

  // Выводим информацию о самообучении
  if (learningSystem.suggestedThresholds.fileSize || learningSystem.suggestedThresholds.complexity || learningSystem.suggestedThresholds.maintainability) {
    console.log('\n🧠 Результаты самообучения:');
    if (learningSystem.projectPatterns.architecture) {
      console.log(`- Архитектурный паттерн: ${learningSystem.projectPatterns.architecture}`);
    }
    if (learningSystem.suggestedThresholds.fileSize) {
      console.log(`- Рекомендуемый порог размера файла: ${Math.round(learningSystem.suggestedThresholds.fileSize)} строк (текущий: 300)`);
    }
    if (learningSystem.suggestedThresholds.complexity) {
      console.log(`- Рекомендуемый порог сложности: ${Math.round(learningSystem.suggestedThresholds.complexity)} (текущий: 15)`);
    }
    if (learningSystem.suggestedThresholds.maintainability) {
      console.log(`- Рекомендуемый порог сопровождаемости: ${Math.round(learningSystem.suggestedThresholds.maintainability)} (текущий: 65)`);
    }
  }
}

// Функция сбора файлов
function collectFiles(projectRoot, patterns) {
  const files = [];
  const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.svelte-kit', '.next'];

  function traverse(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);

        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            traverse(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.js', '.jsx', '.ts', '.tsx', '.svelte', '.vue'].includes(ext)) {
            files.push(relativePath);
          }
        }
      }
    } catch (error) {
      // Игнорируем ошибки доступа к файлам
    }
  }

  traverse(projectRoot);
  return files;
}

// Анализ сложности файла
function analyzeFileComplexity(filePath, content) {
  const lines = content.split('\n');
  const linesOfCode = lines.filter(line => line.trim() && !line.trim().startsWith('//')).length;

  // Цикломатическая сложность (упрощенная)
  const cyclomaticComplexity = calculateCyclomaticComplexity(content);

  // Когнитивная сложность (упрощенная)
  const cognitiveComplexity = calculateCognitiveComplexity(content);

  // Индекс сопровождаемости (упрощенная формула)
  const maintainabilityIndex = calculateMaintainabilityIndex(
    linesOfCode,
    cyclomaticComplexity,
    content
  );

  // Глубина вложенности
  const maxNestingDepth = calculateMaxNestingDepth(content);

  // Количество функций
  const functionCount = (content.match(/function\s+\w+|=>\s*{|\w+\s*\(/g) || []).length;

  // Определяем необходимость рефакторинга
  const needsRefactoring =
    linesOfCode > 300 ||
    cyclomaticComplexity > 15 ||
    maintainabilityIndex < 65 ||
    maxNestingDepth > 4;

  return {
    path: filePath,
    linesOfCode,
    cyclomaticComplexity,
    cognitiveComplexity,
    maintainabilityIndex,
    maxNestingDepth,
    functionCount,
    needsRefactoring,
    refactoringReasons: getRefactoringReasons(
      linesOfCode,
      cyclomaticComplexity,
      maintainabilityIndex,
      maxNestingDepth
    ),
  };
}

// Расчет цикломатической сложности
function calculateCyclomaticComplexity(content) {
  const patterns = [
    /if\s*\(/g,
    /else\s*if\s*\(/g,
    /for\s*\(/g,
    /while\s*\(/g,
    /do\s*{/g,
    /switch\s*\(/g,
    /case\s+[^:]+:/g,
    /catch\s*\(/g,
    /\?\s*[^:]+:/g, // тернарный оператор
    /&&/g,
    /\|\|/g,
  ];

  let complexity = 1; // базовая сложность

  for (const pattern of patterns) {
    const matches = content.match(pattern) || [];
    complexity += matches.length;
  }

  return complexity;
}

// Расчет когнитивной сложности
function calculateCognitiveComplexity(content) {
  let complexity = 0;
  let nestingLevel = 0;

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Увеличиваем уровень вложенности
    if (trimmed.includes('{')) {
      nestingLevel++;
    }

    // Уменьшаем уровень вложенности
    if (trimmed.includes('}')) {
      nestingLevel = Math.max(0, nestingLevel - 1);
    }

    // Добавляем сложность для различных конструкций
    if (/if\s*\(/.test(trimmed)) {
      complexity += 1 + nestingLevel;
    }
    if (/else/.test(trimmed)) {
      complexity += 1;
    }
    if (/for\s*\(|while\s*\(/.test(trimmed)) {
      complexity += 1 + nestingLevel;
    }
    if (/switch\s*\(/.test(trimmed)) {
      complexity += 1 + nestingLevel;
    }
    if (/case\s+[^:]+:/.test(trimmed)) {
      complexity += 1;
    }
    if (/catch\s*\(/.test(trimmed)) {
      complexity += 1 + nestingLevel;
    }
  }

  return complexity;
}

// Расчет индекса сопровождаемости
function calculateMaintainabilityIndex(linesOfCode, cyclomaticComplexity, content) {
  // Упрощенная формула индекса сопровождаемости
  const halsteadVolume = Math.log2(linesOfCode) * linesOfCode; // упрощенный объем Halstead
  const commentRatio = getCommentRatio(content);

  let maintainabilityIndex =
    171 -
    5.2 * Math.log(halsteadVolume) -
    0.23 * cyclomaticComplexity -
    16.2 * Math.log(linesOfCode);

  // Бонус за комментарии
  maintainabilityIndex += commentRatio * 10;

  return Math.max(0, Math.min(100, maintainabilityIndex));
}

// Расчет максимальной глубины вложенности
function calculateMaxNestingDepth(content) {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of content) {
    if (char === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '}') {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }

  return maxDepth;
}

// Получение коэффициента комментариев
function getCommentRatio(content) {
  const lines = content.split('\n');
  const commentLines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
  }).length;

  return lines.length === 0 ? 0 : commentLines / lines.length;
}

// Получение причин для рефакторинга
function getRefactoringReasons(
  linesOfCode,
  cyclomaticComplexity,
  maintainabilityIndex,
  maxNestingDepth
) {
  const reasons = [];

  if (linesOfCode > 300) {
    reasons.push(`Large file (${linesOfCode} lines)`);
  }
  if (cyclomaticComplexity > 15) {
    reasons.push(`High cyclomatic complexity (${cyclomaticComplexity})`);
  }
  if (maintainabilityIndex < 65) {
    reasons.push(`Low maintainability index (${maintainabilityIndex.toFixed(1)})`);
  }
  if (maxNestingDepth > 4) {
    reasons.push(`Deep nesting (${maxNestingDepth} levels)`);
  }

  return reasons;
}

// Анализ дублирования кода
function analyzeDuplication(jsFiles, projectRoot) {
  // Упрощенный анализ дублирования
  const duplicates = [];
  let totalDuplicatedLines = 0;
  let totalLines = 0;

  const fileContents = {};

  // Читаем все файлы
  for (const file of jsFiles) {
    try {
      const content = fs.readFileSync(path.join(projectRoot, file), 'utf8');
      const lines = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 10);
      fileContents[file] = lines;
      totalLines += lines.length;
    } catch (error) {
      // Игнорируем ошибки
    }
  }

  // Поиск дублирующихся блоков (упрощенно)
  for (const file1 of jsFiles) {
    for (const file2 of jsFiles) {
      if (file1 >= file2) continue;

      const lines1 = fileContents[file1] || [];
      const lines2 = fileContents[file2] || [];

      // Ищем одинаковые последовательности строк (минимум 5 строк)
      for (let i = 0; i < lines1.length - 4; i++) {
        for (let j = 0; j < lines2.length - 4; j++) {
          let matchLength = 0;
          while (
            i + matchLength < lines1.length &&
            j + matchLength < lines2.length &&
            lines1[i + matchLength] === lines2[j + matchLength] &&
            matchLength < 20 // ограничиваем поиск
          ) {
            matchLength++;
          }

          if (matchLength >= 5) {
            duplicates.push({
              file1,
              file2,
              startLine1: i + 1,
              startLine2: j + 1,
              length: matchLength,
            });
            totalDuplicatedLines += matchLength;
            j += matchLength; // избегаем перекрытий
          }
        }
      }
    }
  }

  const duplicationPercentage = totalLines === 0 ? 0 : (totalDuplicatedLines / totalLines) * 100;

  return {
    duplicates,
    totalDuplicatedLines,
    totalLines,
    percentage: duplicationPercentage,
  };
}

// Расчет архитектурных метрик
function calculateArchitecturalMetrics(results, jsFiles, projectRoot) {
  const dependencyGraph = {};
  const allDependencies = new Set();

  // Строим граф зависимостей
  for (const file of jsFiles) {
    try {
      const fullPath = path.join(projectRoot, file);
      const content = fs.readFileSync(fullPath, 'utf8');

      dependencyGraph[file] = {
        inbound: [],
        outbound: [],
      };

      // Анализ импортов
      const imports = extractImports(content, file, jsFiles, projectRoot);
      dependencyGraph[file].outbound = imports;

      for (const imp of imports) {
        allDependencies.add(imp);
        if (!dependencyGraph[imp]) {
          dependencyGraph[imp] = { inbound: [], outbound: [] };
        }
        dependencyGraph[imp].inbound.push(file);
      }
    } catch (error) {
      // Игнорируем ошибки
    }
  }

  // Поиск циклических зависимостей
  const cyclicDependencies = findCycles(dependencyGraph);

  // Расчет метрик связанности и связности
  const coupling = calculateCoupling(dependencyGraph);
  const cohesion = calculateCohesion(results.filesByDirectory);

  results.architectureMetrics = {
    dependencyGraph,
    cyclicDependencies,
    coupling,
    cohesion,
    totalDependencies: allDependencies.size,
  };
}

// Извлечение импортов
function extractImports(content, currentFile, allFiles, projectRoot) {
  const imports = [];
  const importRegex =
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2];

    // Пропускаем внешние зависимости
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      continue;
    }

    // Преобразуем относительный путь в абсолютный
    const resolvedPath = resolveImport(importPath, currentFile, allFiles, projectRoot);
    if (resolvedPath) {
      imports.push(resolvedPath);
    }
  }

  return imports;
}

// Преобразование импорта в путь к файлу
function resolveImport(importPath, currentFile, allFiles, projectRoot) {
  const currentDir = path.dirname(currentFile);
  let targetPath = path.resolve(currentDir, importPath);

  // Делаем путь относительным к проекту
  targetPath = path.relative(projectRoot, targetPath);

  // Проверяем точное совпадение
  if (allFiles.includes(targetPath)) {
    return targetPath;
  }

  // Проверяем с расширениями
  for (const ext of ['.js', '.jsx', '.ts', '.tsx', '.svelte', '.vue']) {
    const pathWithExt = targetPath + ext;
    if (allFiles.includes(pathWithExt)) {
      return pathWithExt;
    }
  }

  // Проверяем index файлы
  for (const ext of ['.js', '.jsx', '.ts', '.tsx', '.svelte', '.vue']) {
    const indexPath = path.join(targetPath, `index${ext}`);
    if (allFiles.includes(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

// Поиск циклических зависимостей
function findCycles(dependencyGraph) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node, path = []) {
    if (recursionStack.has(node)) {
      // Найден цикл
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const outbound = dependencyGraph[node]?.outbound || [];
    for (const neighbor of outbound) {
      dfs(neighbor, [...path]);
    }

    recursionStack.delete(node);
  }

  for (const node in dependencyGraph) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

// Расчет связанности
function calculateCoupling(dependencyGraph) {
  let totalCoupling = 0;
  let nodeCount = 0;

  for (const node in dependencyGraph) {
    const inbound = dependencyGraph[node].inbound.length;
    const outbound = dependencyGraph[node].outbound.length;
    const total = inbound + outbound;

    if (total > 0) {
      totalCoupling += outbound / total;
      nodeCount++;
    }
  }

  return nodeCount === 0 ? 0 : totalCoupling / nodeCount;
}

// Расчет связности
function calculateCohesion(filesByDirectory) {
  let totalCohesion = 0;
  let dirCount = 0;

  for (const dir in filesByDirectory) {
    const files = filesByDirectory[dir].files;
    if (files.length > 1) {
      // Простая метрика: файлы в одной директории должны иметь схожую сложность
      const complexities = files.map(f => f.cyclomaticComplexity);
      const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
      const variance =
        complexities.reduce((sum, c) => sum + Math.pow(c - avgComplexity, 2), 0) /
        complexities.length;
      const cohesion = Math.max(0, 1 - variance / Math.max(avgComplexity, 1));

      totalCohesion += cohesion;
      dirCount++;
    }
  }

  return dirCount === 0 ? 1 : totalCohesion / dirCount;
}

// Поиск проблемных файлов (hotspots)
function findHotspots(results, projectRoot) {
  const hotspots = [];

  // Анализируем историю Git для поиска часто изменяемых файлов
  for (const fileData of results.complexityData) {
    try {
      const filePath = path.join(projectRoot, fileData.path);

      // Получаем количество коммитов для файла
      const gitLog = execSync(`git log --oneline --follow "${filePath}" 2>/dev/null || echo ""`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      const commitCount = gitLog.split('\n').filter(line => line.trim()).length;

      // Получаем количество багфиксов
      const bugfixLog = execSync(
        `git log --oneline --follow --grep="fix\\|bug\\|issue\\|resolve" "${filePath}" 2>/dev/null || echo ""`,
        {
          encoding: 'utf8',
          timeout: 5000,
        }
      );
      const bugfixCount = bugfixLog.split('\n').filter(line => line.trim()).length;

      // Вычисляем hotspot score
      const complexityScore = fileData.cyclomaticComplexity / 20; // нормализация
      const sizeScore = fileData.linesOfCode / 500; // нормализация
      const changeScore = commitCount / 50; // нормализация
      const bugScore = bugfixCount / 10; // нормализация

      const hotspotScore = (complexityScore + sizeScore + changeScore + bugScore * 2) / 5;

      if (hotspotScore > 0.3) {
        // порог для hotspot
        hotspots.push({
          ...fileData,
          commitCount,
          bugfixCount,
          hotspotScore,
        });
      }
    } catch (error) {
      // Игнорируем ошибки Git (файл может быть не в репозитории)
    }
  }

  // Сортируем по hotspot score
  hotspots.sort((a, b) => b.hotspotScore - a.hotspotScore);

  results.hotspots = hotspots.slice(0, 10); // топ 10 hotspots
}

// Расчет необходимости рефакторинга
function calculateRefactoringNeeds(results) {
  const metrics = {
    highComplexityFiles: 0,
    largeFiles: 0,
    lowMaintainabilityFiles: 0,
    duplicationPercentage: results.duplicationData?.percentage || 0,
    cyclicDependencies: results.architectureMetrics.cyclicDependencies?.length || 0,
    coupling: results.architectureMetrics.coupling || 0,
    totalFilesNeedingRefactoring: 0,
  };

  // Анализ файлов
  for (const file of results.complexityData) {
    if (file.cyclomaticComplexity > 15) {
      metrics.highComplexityFiles++;
    }

    if (file.linesOfCode > 300) {
      metrics.largeFiles++;
    }

    if (file.maintainabilityIndex < 65) {
      metrics.lowMaintainabilityFiles++;
    }

    if (file.needsRefactoring) {
      metrics.totalFilesNeedingRefactoring++;
    }
  }

  // Расчет процента файлов требующих рефакторинга
  const totalFiles = results.totalFiles || 1;
  const refactoringPercentage = (metrics.totalFilesNeedingRefactoring / totalFiles) * 100;

  // Определение уровня необходимости рефакторинга
  let refactoringNecessity = 'НИЗКАЯ';
  if (
    refactoringPercentage > 20 ||
    metrics.cyclicDependencies > 5 ||
    metrics.duplicationPercentage > 15
  ) {
    refactoringNecessity = 'ВЫСОКАЯ';
  } else if (
    refactoringPercentage > 10 ||
    metrics.cyclicDependencies > 0 ||
    metrics.duplicationPercentage > 7
  ) {
    refactoringNecessity = 'СРЕДНЯЯ';
  }

  // Оценка технического долга в часах
  let technicalDebt = 0;
  technicalDebt += metrics.totalFilesNeedingRefactoring * 4; // 4 часа на файл
  technicalDebt += metrics.cyclicDependencies * 8; // 8 часов на цикл
  technicalDebt += (metrics.duplicationPercentage / 10) * 12; // часы на дублирование

  results.technicalDebt = technicalDebt;

  results.summary = {
    ...metrics,
    refactoringPercentage,
    refactoringNecessity,
  };
}

// Генерация расширенного отчета
function generateAdvancedReport(results, outputFile, projectRoot, analyzerImprovements) {
  // Сортируем файлы по необходимости рефакторинга
  const sortedFiles = [...results.complexityData]
    .filter(file => file.needsRefactoring)
    .sort((a, b) => {
      const scoreA =
        a.cyclomaticComplexity / 20 + a.linesOfCode / 500 + (100 - a.maintainabilityIndex) / 100;
      const scoreB =
        b.cyclomaticComplexity / 20 + b.linesOfCode / 500 + (100 - b.maintainabilityIndex) / 100;
      return scoreB - scoreA;
    });

  let report = `# 🏗️ Углубленный анализ структуры проекта

**Проект**: ${path.basename(projectRoot)}
**Дата анализа**: ${new Date().toISOString().split('T')[0]}
**Время анализа**: ${new Date().toISOString().split('T')[1].split('.')[0]}

## 📊 Общая информация

| Метрика | Значение | Статус |
|---------|----------|--------|
| Всего файлов | ${results.totalFiles} | ✅ |
| Файлов требующих рефакторинга | ${results.summary.totalFilesNeedingRefactoring} (${results.summary.refactoringPercentage.toFixed(1)}%) | ${results.summary.refactoringPercentage > 15 ? '🔴' : results.summary.refactoringPercentage > 7 ? '🟡' : '🟢'} |
| Циклических зависимостей | ${results.summary.cyclicDependencies} | ${results.summary.cyclicDependencies > 0 ? '🔴' : '🟢'} |
| Дублирование кода | ${results.summary.duplicationPercentage.toFixed(1)}% | ${results.summary.duplicationPercentage > 10 ? '🔴' : results.summary.duplicationPercentage > 5 ? '🟡' : '🟢'} |
| Технический долг | ${results.technicalDebt.toFixed(1)} часов | ${results.technicalDebt > 100 ? '🔴' : results.technicalDebt > 40 ? '🟡' : '🟢'} |

## 🔄 Необходимость рефакторинга: ${results.summary.refactoringNecessity}

### 🏗️ Архитектурные метрики

| Метрика | Значение | Рекомендуемое | Статус |
|---------|----------|---------------|--------|
| Связность модулей | ${results.architectureMetrics.cohesion?.toFixed(2) || 'Н/Д'} | > 0.70 | ${(results.architectureMetrics.cohesion || 0) > 0.7 ? '🟢' : '🟡'} |
| Связанность модулей | ${results.architectureMetrics.coupling?.toFixed(2) || 'Н/Д'} | < 0.30 | ${(results.architectureMetrics.coupling || 0) < 0.3 ? '🟢' : '🔴'} |
| Всего зависимостей | ${results.architectureMetrics.totalDependencies} | - | ℹ️ |

### 📈 Детальные метрики качества

| Категория | Количество файлов | Процент |
|-----------|-------------------|---------|
| Высокая сложность (>15) | ${results.summary.highComplexityFiles} | ${((results.summary.highComplexityFiles / results.totalFiles) * 100).toFixed(1)}% |
| Крупные файлы (>300 строк) | ${results.summary.largeFiles} | ${((results.summary.largeFiles / results.totalFiles) * 100).toFixed(1)}% |
| Низкая сопровождаемость (<65) | ${results.summary.lowMaintainabilityFiles} | ${((results.summary.lowMaintainabilityFiles / results.totalFiles) * 100).toFixed(1)}% |

`;

  // Добавляем секцию самообучения в отчет
  report += `
## 🧠 Самообучение анализатора

### 📐 Обнаруженные паттерны проекта

`;

  if (learningSystem.projectPatterns.architecture) {
    report += `- **Архитектурный паттерн**: ${learningSystem.projectPatterns.architecture}\n`;
  }

  if (learningSystem.metricDistributions.fileSize) {
    report += `- **Распределение размеров файлов**:
  - Медиана: ${learningSystem.metricDistributions.fileSize.median} строк
  - 75-й процентиль: ${learningSystem.metricDistributions.fileSize.p75} строк
  - 90-й процентиль: ${learningSystem.metricDistributions.fileSize.p90} строк\n`;
  }

  if (learningSystem.metricDistributions.complexity) {
    report += `- **Распределение сложности**:
  - Медиана: ${learningSystem.metricDistributions.complexity.median}
  - 75-й процентиль: ${learningSystem.metricDistributions.complexity.p75}\n`;
  }

  if (learningSystem.metricDistributions.maintainability) {
    report += `- **Распределение сопровождаемости**:
  - 25-й процентиль: ${learningSystem.metricDistributions.maintainability.p25.toFixed(1)}
  - Медиана: ${learningSystem.metricDistributions.maintainability.p50.toFixed(1)}\n`;
  }

  report += `
### 🛠️ Рекомендации по улучшению критериев анализа

`;

  if (analyzerImprovements.thresholdAdjustments.length > 0) {
    report += `#### Корректировка порогов для текущего проекта

| Метрика | Текущий порог | Рекомендуемый | Причина |
|---------|---------------|---------------|---------|
`;

    for (const adjustment of analyzerImprovements.thresholdAdjustments) {
      report += `| ${adjustment.metric} | ${adjustment.current} | ${adjustment.suggested} | ${adjustment.reason} |\n`;
    }
  } else {
    report += `- Текущие пороги оценки оптимальны для данного проекта\n`;
  }

  if (analyzerImprovements.additionalMetrics.length > 0) {
    report += `
#### Предлагаемые дополнительные метрики

`;

    for (const metric of analyzerImprovements.additionalMetrics) {
      report += `- **${metric.name}**: ${metric.description}\n`;
    }
  }

  if (analyzerImprovements.contextualRules.length > 0) {
    report += `
#### Специфичные для данного проекта правила

`;

    for (const rule of analyzerImprovements.contextualRules) {
      report += `- **${rule.name}**: ${rule.description}\n`;
    }
  }

  // Добавляем топ файлов требующих рефакторинга
  if (sortedFiles.length > 0) {
    report += `
## 🔥 Топ файлов требующих рефакторинга

`;

    const topFiles = sortedFiles.slice(0, 10);
    for (let i = 0; i < topFiles.length; i++) {
      const file = topFiles[i];
      report += `### ${i + 1}. ${path.basename(file.path)}\n\n`;
      report += `**Путь**: \`${file.path}\`\n\n`;
      report += `| Метрика | Значение | Статус |\n`;
      report += `|---------|----------|--------|\n`;
      report += `| Строк кода | ${file.linesOfCode} | ${file.linesOfCode > 300 ? '🔴' : file.linesOfCode > 200 ? '🟡' : '🟢'} |\n`;
      report += `| Цикломатическая сложность | ${file.cyclomaticComplexity} | ${file.cyclomaticComplexity > 15 ? '🔴' : file.cyclomaticComplexity > 10 ? '🟡' : '🟢'} |\n`;
      report += `| Когнитивная сложность | ${file.cognitiveComplexity} | ${file.cognitiveComplexity > 25 ? '🔴' : file.cognitiveComplexity > 15 ? '🟡' : '🟢'} |\n`;
      report += `| Индекс сопровождаемости | ${file.maintainabilityIndex.toFixed(1)} | ${file.maintainabilityIndex < 65 ? '🔴' : file.maintainabilityIndex < 75 ? '🟡' : '🟢'} |\n`;
      report += `| Глубина вложенности | ${file.maxNestingDepth} | ${file.maxNestingDepth > 4 ? '🔴' : file.maxNestingDepth > 3 ? '🟡' : '🟢'} |\n`;
      report += `| Количество функций | ${file.functionCount} | ℹ️ |\n\n`;

      if (file.refactoringReasons.length > 0) {
        report += `**Причины для рефакторинга**:\n`;
        for (const reason of file.refactoringReasons) {
          report += `- ${reason}\n`;
        }
      }
      report += '\n';
    }
  }

  // Добавляем hotspots
  if (results.hotspots.length > 0) {
    report += `
## 🌡️ Проблемные файлы (Hotspots)

`;
    for (let i = 0; i < results.hotspots.length; i++) {
      const hotspot = results.hotspots[i];
      report += `### ${i + 1}. ${path.basename(hotspot.path)}\n`;
      report += `**Путь**: \`${hotspot.path}\`\n`;
      report += `**Hotspot Score**: ${hotspot.hotspotScore.toFixed(2)}\n`;
      report += `**Коммитов**: ${hotspot.commitCount || 0}\n`;
      report += `**Исправлений багов**: ${hotspot.bugfixCount || 0}\n`;
      report += `**Сложность**: ${hotspot.cyclomaticComplexity}\n`;
      report += `**Строк кода**: ${hotspot.linesOfCode}\n\n`;
    }
  }

  // Добавляем информацию о циклических зависимостях
  if (
    results.architectureMetrics.cyclicDependencies &&
    results.architectureMetrics.cyclicDependencies.length > 0
  ) {
    report += `
## 🔄 Циклические зависимости

`;
    for (let i = 0; i < results.architectureMetrics.cyclicDependencies.length; i++) {
      const cycle = results.architectureMetrics.cyclicDependencies[i];
      report += `### Цикл ${i + 1}:\n`;
      for (let j = 0; j < cycle.length; j++) {
        const file = cycle[j];
        report += `${j + 1}. \`${file}\`\n`;
      }
      report += '↩️ (цикл замыкается)\n\n';
    }
  }

  // Добавляем тепловую карту директорий
  report += `
## 📊 Тепловая карта директорий

| Директория | Файлов | Общ. строк | Ср. сложность | Статус |
|------------|--------|------------|---------------|--------|
`;

  const sortedDirs = Object.entries(results.filesByDirectory).sort(
    ([, a], [, b]) => b.avgComplexity - a.avgComplexity
  );

  for (const [dir, dirStats] of sortedDirs) {
    const status = dirStats.avgComplexity > 15 ? '🔴' : dirStats.avgComplexity > 10 ? '🟡' : '🟢';

    report += `| \`${dir}\` | ${dirStats.files.length} | ${dirStats.totalLines} | ${dirStats.avgComplexity.toFixed(1)} | ${status} |\n`;
  }

  // Добавляем информацию о дублировании
  if (results.duplicationData && results.duplicationData.duplicates.length > 0) {
    report += `
## 📋 Дублирование кода

**Общий процент дублирования**: ${results.duplicationData.percentage.toFixed(1)}%
**Дублированных строк**: ${results.duplicationData.totalDuplicatedLines}
**Найдено дубликатов**: ${results.duplicationData.duplicates.length}

### Топ дубликатов:

`;
    const topDuplicates = results.duplicationData.duplicates
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);

    for (let i = 0; i < topDuplicates.length; i++) {
      const dup = topDuplicates[i];
      report += `${i + 1}. **${dup.length} строк** дублируется между:\n`;
      report += `   - \`${dup.file1}\` (строка ${dup.startLine1})\n`;
      report += `   - \`${dup.file2}\` (строка ${dup.startLine2})\n\n`;
    }
  }

  // Рекомендации по рефакторингу
  report += `
## 💡 Детальные рекомендации по рефакторингу

`;

  if (results.summary.totalFilesNeedingRefactoring > 0) {
    report += `### 🎯 Стратегия рефакторинга

**Оценка трудозатрат**: ${results.technicalDebt.toFixed(1)} часов

#### Фаза 1: Критические исправления (${Math.ceil(results.technicalDebt * 0.4)} часов)
`;

    if (results.summary.cyclicDependencies > 0) {
      report += `1. **Устранение циклических зависимостей** (приоритет 1)\n`;
      report += `   - Обнаружено циклов: ${results.summary.cyclicDependencies}\n`;
      report += `   - Рекомендуется: внедрение dependency injection, создание абстракций\n\n`;
    }

    if (results.hotspots.length > 0) {
      report += `2. **Рефакторинг проблемных файлов (hotspots)**\n`;
      const topHotspots = results.hotspots.slice(0, 3);
      for (const hotspot of topHotspots) {
        report += `   - \`${hotspot.path}\` (score: ${hotspot.hotspotScore.toFixed(2)}, багфиксов: ${hotspot.bugfixCount || 0})\n`;
      }
      report += '\n';
    }

    report += `#### Фаза 2: Структурные улучшения (${Math.ceil(results.technicalDebt * 0.4)} часов)

1. **Декомпозиция сложных файлов**
`;

    const complexFiles = sortedFiles.filter(f => f.cyclomaticComplexity > 15).slice(0, 3);
    for (const file of complexFiles) {
      report += `   - \`${file.path}\` (сложность: ${file.cyclomaticComplexity})\n`;
    }

    report += `
2. **Уменьшение размера файлов**
`;

    const largeFiles = sortedFiles.filter(f => f.linesOfCode > 300).slice(0, 3);
    for (const file of largeFiles) {
      report += `   - \`${file.path}\` (${file.linesOfCode} строк)\n`;
    }

    if (results.summary.duplicationPercentage > 5) {
      report += `
3. **Устранение дублирования кода** (${results.summary.duplicationPercentage.toFixed(1)}%)
   - Создание переиспользуемых компонентов
   - Вынесение общей логики в утилиты
   - Применение паттернов проектирования
`;
    }

    report += `
#### Фаза 3: Долгосрочные улучшения (${Math.ceil(results.technicalDebt * 0.2)} часов)

1. **Повышение покрытия тестами**
   - Добавление unit-тестов для отрефакторенного кода
   - Создание интеграционных тестов

2. **Улучшение архитектуры**
   - Снижение связанности между модулями
   - Повышение связности внутри модулей
   - Документирование архитектурных решений

3. **Автоматизация контроля качества**
   - Настройка lint правил для предотвращения регрессии
   - Внедрение метрик качества в CI/CD
`;
  } else {
    report += `### ✅ Проект в хорошем состоянии

Специальный рефакторинг не требуется. Рекомендации для поддержания качества:

1. **Продолжайте следовать лучшим практикам**
   - Поддерживайте низкую цикломатическую сложность (<15)
   - Ограничивайте размер файлов (<300 строк)
   - Избегайте глубокой вложенности (<4 уровней)

2. **Регулярный мониторинг**
   - Запускайте анализ качества кода еженедельно
   - Отслеживайте метрики в процессе разработки

3. **Профилактические меры**
   - Code review с фокусом на качество архитектуры
   - Рефакторинг при добавлении новой функциональности
`;
  }

  report += `

## 📋 Чек-лист для рефакторинга

### Перед началом рефакторинга:
- [ ] Убедитесь в наличии тестового покрытия для изменяемого кода
- [ ] Создайте отдельную ветку для рефакторинга
- [ ] Запланируйте небольшие итеративные изменения

### Во время рефакторинга:
- [ ] Применяйте принцип "красный-зеленый-рефакторинг"
- [ ] Делайте частые коммиты с описательными сообщениями
- [ ] Запускайте тесты после каждого изменения

### После рефакторинга:
- [ ] Проведите повторный анализ для проверки улучшений
- [ ] Обновите документацию при необходимости
- [ ] Проведите code review с командой

---

**Отчет сгенерирован**: ${new Date().toISOString()}
**Анализатор**: Advanced Project Structure Analyzer v2.0 (с самообучением)
`;

  fs.writeFileSync(outputFile, report);
}

// Запуск анализа
analyzeProject().catch(error => {
  console.error('Ошибка при углубленном анализе проекта:', error);
  process.exit(1);
});
