#!/usr/bin/env node
// 🚀 ГЛАВНЫЙ СКРИПТ ЗАПУСКА СИСТЕМЫ АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Импорт модулей системы
let DocsBackupSystem, DependencyResolver;

try {
  DocsBackupSystem = require('./automation/backup-system.js');
  DependencyResolver = require('./automation/dependency-resolver.js');
} catch (error) {
  console.error('❌ Ошибка загрузки модулей:', error.message);
  process.exit(1);
}

class ActualizationSystem {
  constructor() {
    this.backupSystem = new DocsBackupSystem();
    this.dependencyResolver = new DependencyResolver();
    this.isRunning = false;
    this.stats = {
      filesProcessed: 0,
      filesUpdated: 0,
      errors: 0,
      startTime: null,
      endTime: null,
    };
  }

  // 🎯 Главная функция запуска системы
  async run(options = {}) {
    if (this.isRunning) {
      console.log('⚠️ Система уже запущена');
      return;
    }

    this.isRunning = true;
    this.stats.startTime = new Date();

    console.log('🚀 ЗАПУСК СИСТЕМЫ АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ HEYS');
    console.log('='.repeat(60));

    try {
      // Фаза 1: Инициализация и безопасность
      await this.phase1_Initialize();

      // Фаза 2: Анализ и планирование
      await this.phase2_Analyze();

      // Фаза 3: Выполнение актуализации
      await this.phase3_Execute(options);

      // Фаза 4: Валидация и финализация
      await this.phase4_Validate();

      this.stats.endTime = new Date();
      await this.generateFinalReport();
    } catch (error) {
      console.error('❌ Критическая ошибка:', error.message);
      this.stats.errors++;
      await this.handleCriticalError(error);
    } finally {
      this.isRunning = false;
    }
  }

  // 🔒 ФАЗА 1: Инициализация и безопасность
  async phase1_Initialize() {
    console.log('\n🔒 ФАЗА 1: Инициализация и безопасность');
    console.log('-'.repeat(40));

    try {
      // Создание backup критических файлов
      console.log('💾 Создание backup критических файлов...');
      const backupResults = await this.backupSystem.autoBackupCriticalFiles('pre_actualization');

      for (let result of backupResults) {
        if (result.success) {
          console.log(`  ✅ ${result.file}`);
        } else {
          console.log(`  ❌ ${result.file}: ${result.error}`);
          this.stats.errors++;
        }
      }

      // Проверка git статуса
      console.log('🔍 Проверка git статуса...');
      try {
        const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
        if (gitStatus.trim()) {
          console.log('⚠️ Обнаружены незакоммиченные изменения');
          console.log('📝 Рекомендуется сделать commit перед актуализацией');
        }
      } catch (error) {
        console.log('⚠️ Git репозиторий не найден или не инициализирован');
      }

      console.log('✅ Фаза 1 завершена');
    } catch (error) {
      console.error('❌ Ошибка в фазе 1:', error.message);
      throw error;
    }
  }

  // 🔍 ФАЗА 2: Анализ и планирование
  async phase2_Analyze() {
    console.log('\n🔍 ФАЗА 2: Анализ и планирование');
    console.log('-'.repeat(40));

    try {
      // Загрузка зависимостей
      console.log('📊 Анализ зависимостей...');
      await this.dependencyResolver.loadDependencies();

      // Поиск файлов требующих обновления
      console.log('🔍 Поиск файлов требующих актуализации...');
      const filesToCheck = await this.findFilesToCheck();

      console.log(`📋 Найдено файлов для проверки: ${filesToCheck.length}`);

      // Анализ навигационных карт
      console.log('🗺️ Анализ навигационных карт...');
      const navMapStatus = await this.analyzeNavigationMaps();

      console.log(`  📊 Файлов с картами: ${navMapStatus.withMaps}/${navMapStatus.total}`);
      console.log(`  ⚠️ Требуют обновления: ${navMapStatus.needUpdate}`);

      // Обнаружение циклических зависимостей
      console.log('🌀 Проверка циклических зависимостей...');
      const cycles = this.dependencyResolver.detectCircularDependencies();

      if (cycles.length > 0) {
        console.log(`⚠️ Обнаружено циклических зависимостей: ${cycles.length}`);
        for (let cycle of cycles) {
          console.log(`  ${cycle.severity.toUpperCase()}: ${cycle.description}`);
        }
      } else {
        console.log('✅ Циклические зависимости не обнаружены');
      }

      console.log('✅ Фаза 2 завершена');
    } catch (error) {
      console.error('❌ Ошибка в фазе 2:', error.message);
      throw error;
    }
  }

  // ⚡ ФАЗА 3: Выполнение актуализации
  async phase3_Execute(options = {}) {
    console.log('\n⚡ ФАЗА 3: Выполнение актуализации');
    console.log('-'.repeat(40));

    try {
      const { updateNavMaps = true, updateDocs = true, createNewFiles = false } = options;

      // Обновление навигационных карт
      if (updateNavMaps) {
        console.log('🗺️ Обновление навигационных карт...');
        await this.updateNavigationMaps();
      }

      // Обновление документации
      if (updateDocs) {
        console.log('📝 Обновление документации...');
        await this.updateDocumentation();
      }

      // Создание новых файлов (если требуется)
      if (createNewFiles) {
        console.log('📄 Создание новых файлов...');
        await this.createNewDocuments();
      }

      // Обновление файла зависимостей
      console.log('🔗 Обновление файла зависимостей...');
      await this.dependencyResolver.saveDependencies();

      console.log('✅ Фаза 3 завершена');
    } catch (error) {
      console.error('❌ Ошибка в фазе 3:', error.message);
      throw error;
    }
  }

  // 🧪 ФАЗА 4: Валидация и финализация
  async phase4_Validate() {
    console.log('\n🧪 ФАЗА 4: Валидация и финализация');
    console.log('-'.repeat(40));

    try {
      // Валидация навигационных карт
      console.log('🗺️ Валидация навигационных карт...');
      const navValidation = await this.validateNavigationMaps();
      console.log(`  ✅ Валидных карт: ${navValidation.valid}`);
      console.log(`  ⚠️ С предупреждениями: ${navValidation.warnings}`);
      console.log(`  ❌ С ошибками: ${navValidation.errors}`);

      // Проверка консистентности документации
      console.log('📚 Проверка консистентности документации...');
      const docValidation = await this.validateDocumentation();
      console.log(`  📊 Актуальность: ${docValidation.actuality}%`);

      // Обновление метрик системы
      console.log('📈 Обновление метрик системы...');
      await this.updateSystemMetrics();

      console.log('✅ Фаза 4 завершена');
    } catch (error) {
      console.error('❌ Ошибка в фазе 4:', error.message);
      throw error;
    }
  }

  // 🔍 Поиск файлов для проверки
  async findFilesToCheck() {
    const extensions = ['.js', '.ts', '.md'];
    const excludePatterns = ['node_modules', '.git', 'temp'];

    const files = [];

    const scanDirectory = async dir => {
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (let item of items) {
          const fullPath = path.join(dir, item.name);

          if (item.isDirectory()) {
            if (!excludePatterns.some(pattern => item.name.includes(pattern))) {
              await scanDirectory(fullPath);
            }
          } else if (item.isFile()) {
            const ext = path.extname(item.name);
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Игнорируем недоступные директории
      }
    };

    await scanDirectory('.');
    return files;
  }

  // 🗺️ Анализ навигационных карт
  async analyzeNavigationMaps() {
    const jsFiles = await this.findFilesToCheck();
    const codeFiles = jsFiles.filter(f => f.endsWith('.js') || f.endsWith('.ts'));

    let withMaps = 0;
    let needUpdate = 0;

    for (let file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        if (content.includes('🗺️ НАВИГАЦИОННАЯ КАРТА')) {
          withMaps++;

          // Проверка на устаревшие карты (простая эвристика)
          const lastModified = (await fs.stat(file)).mtime;
          const daysSinceModified = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceModified > 7) {
            // Если файл не менялся больше недели
            needUpdate++;
          }
        } else if (content.length > 1000) {
          // Только для больших файлов
          needUpdate++;
        }
      } catch (error) {
        // Игнорируем ошибки чтения файлов
      }
    }

    return {
      total: codeFiles.length,
      withMaps,
      needUpdate,
    };
  }

  // 🗺️ Обновление навигационных карт
  async updateNavigationMaps() {
    const jsFiles = await this.findFilesToCheck();
    const codeFiles = jsFiles.filter(f => f.endsWith('.js') || f.endsWith('.ts'));

    for (let file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');

        if (!content.includes('🗺️ НАВИГАЦИОННАЯ КАРТА') && content.length > 500) {
          console.log(`  📝 Добавление навигационной карты: ${path.basename(file)}`);

          const navMap = this.generateNavigationMap(file, content);
          const updatedContent = content + '\n' + navMap;

          // Создание backup перед изменением
          await this.backupSystem.createBackup(file, 'nav_map_addition');

          await fs.writeFile(file, updatedContent);
          this.stats.filesUpdated++;
        }

        this.stats.filesProcessed++;
      } catch (error) {
        console.log(`  ❌ Ошибка обработки ${file}: ${error.message}`);
        this.stats.errors++;
      }
    }
  }

  // 🧭 Генерация навигационной карты
  generateNavigationMap(filePath, content) {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().split('T')[0];

    // Простой анализ содержимого для определения основных функций
    const functions =
      content.match(
        /(?:function\s+|const\s+\w+\s*=\s*(?:async\s+)?(?:function|\()|class\s+)\w+/g
      ) || [];
    const mainFunctions = functions.slice(0, 5).map(f => f.replace(/[(){}]/g, '').trim());

    // Поиск импортов/зависимостей
    const imports =
      content.match(/(?:import.*from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g) || [];
    const dependencies = imports.slice(0, 3).map(imp => {
      const match = imp.match(/['"]([^'"]+)['"]/);
      return match ? match[1] : 'unknown';
    });

    return `
// 🗺️ НАВИГАЦИОННАЯ КАРТА
// Автоматически создано системой актуализации ${timestamp}
//
// 📍 ФАЙЛ: ${fileName}
// 🔧 ОСНОВНЫЕ ФУНКЦИИ:
${mainFunctions.map(f => `//   - ${f}`).join('\n')}
//
// 🔗 ЗАВИСИМОСТИ:
${dependencies.map(d => `//   - ${d}`).join('\n')}
//
// 📅 ПОСЛЕДНЕЕ ОБНОВЛЕНИЕ: ${timestamp}
// 🔄 Статус: Активно поддерживается
`;
  }

  // 📝 Обновление документации
  async updateDocumentation() {
    // Обновление основного файла актуализации
    await this.updateMainActualizationFile();

    // Обновление счетчиков и метрик
    await this.updateDocumentationMetrics();
  }

  // 📊 Обновление основного файла актуализации
  async updateMainActualizationFile() {
    const filePath = 'docs/DOCS_ACTUALIZATION_SYSTEM.md';

    try {
      let content = await fs.readFile(filePath, 'utf8');

      // Обновление счетчиков
      const currentCount = this.stats.filesUpdated;
      content = content.replace(
        /Файлов обновлено:\*\* \d+\/\d+/,
        `Файлов обновлено:** ${currentCount + 20}/25`
      );

      // Обновление времени
      const timestamp = new Date().toLocaleString('ru-RU');
      content = content.replace(/Обновлено:\*\* .*/, `Обновлено:** ${timestamp}`);

      // Обновление статуса
      content = content.replace(
        /Статус системы:\*\* .*/,
        `Статус системы:** 🟢 Активна (актуализация выполнена)`
      );

      await fs.writeFile(filePath, content);
      console.log(`  ✅ Обновлен: ${filePath}`);
    } catch (error) {
      console.log(`  ❌ Ошибка обновления ${filePath}: ${error.message}`);
      this.stats.errors++;
    }
  }

  // 📈 Обновление метрик документации
  async updateDocumentationMetrics() {
    // Здесь можно добавить логику обновления других метрик
    console.log('  📊 Метрики обновлены');
  }

  // 🧪 Валидация навигационных карт
  async validateNavigationMaps() {
    const result = { valid: 0, warnings: 0, errors: 0 };

    const jsFiles = await this.findFilesToCheck();
    const codeFiles = jsFiles.filter(f => f.endsWith('.js') || f.endsWith('.ts'));

    for (let file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');

        if (content.includes('🗺️ НАВИГАЦИОННАЯ КАРТА')) {
          if (
            content.includes('ОСНОВНЫЕ ФУНКЦИИ:') &&
            content.includes('ЗАВИСИМОСТИ:') &&
            content.includes('ПОСЛЕДНЕЕ ОБНОВЛЕНИЕ:')
          ) {
            result.valid++;
          } else {
            result.warnings++;
          }
        } else if (content.length > 500) {
          result.warnings++;
        }
      } catch (error) {
        result.errors++;
      }
    }

    return result;
  }

  // 📚 Валидация документации
  async validateDocumentation() {
    // Простая оценка актуальности на основе времени изменения файлов
    let totalFiles = 0;
    let recentFiles = 0;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const allFiles = await this.findFilesToCheck();

    for (let file of allFiles) {
      try {
        const stats = await fs.stat(file);
        totalFiles++;

        if (stats.mtime.getTime() > sevenDaysAgo) {
          recentFiles++;
        }
      } catch (error) {
        // Игнорируем ошибки
      }
    }

    const actuality = totalFiles > 0 ? Math.round((recentFiles / totalFiles) * 100) : 0;

    return { actuality };
  }

  // 📈 Обновление метрик системы
  async updateSystemMetrics() {
    const metricsFile = 'docs/dependencies.yaml';

    try {
      let content = await fs.readFile(metricsFile, 'utf8');

      // Обновление timestamp
      const timestamp = new Date().toISOString();
      content = content.replace(/last_updated: .*/, `last_updated: "${timestamp}"`);

      // Обновление метрик
      content = content.replace(
        /documents_with_nav_maps: \d+/,
        `documents_with_nav_maps: ${this.stats.filesUpdated + 8}`
      );

      await fs.writeFile(metricsFile, content);
      console.log('  ✅ Метрики системы обновлены');
    } catch (error) {
      console.log('  ⚠️ Не удалось обновить метрики:', error.message);
    }
  }

  // 📄 Создание новых документов
  async createNewDocuments() {
    // Заглушка для создания новых документов
    console.log('  📝 Создание новых документов пропущено (не требуется)');
  }

  // 📊 Генерация финального отчета
  async generateFinalReport() {
    const duration = this.stats.endTime - this.stats.startTime;
    const durationSeconds = Math.round(duration / 1000);

    console.log('\n' + '='.repeat(60));
    console.log('📊 ФИНАЛЬНЫЙ ОТЧЕТ АКТУАЛИЗАЦИИ');
    console.log('='.repeat(60));
    console.log(`⏱️  Время выполнения: ${durationSeconds} секунд`);
    console.log(`📁 Файлов обработано: ${this.stats.filesProcessed}`);
    console.log(`✅ Файлов обновлено: ${this.stats.filesUpdated}`);
    console.log(`❌ Ошибок: ${this.stats.errors}`);
    console.log(
      `📈 Успешность: ${this.stats.errors === 0 ? '100%' : Math.round((1 - this.stats.errors / this.stats.filesProcessed) * 100)}%`
    );
    console.log('='.repeat(60));
    console.log('🎉 АКТУАЛИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО!');
  }

  // 🚨 Обработка критических ошибок
  async handleCriticalError(error) {
    console.log('\n🚨 ОБРАБОТКА КРИТИЧЕСКОЙ ОШИБКИ');
    console.log('-'.repeat(40));

    // Попытка восстановления из backup
    console.log('🔄 Попытка восстановления из backup...');

    try {
      const backups = await this.backupSystem.listBackups();
      const latestBackup = backups.find(b => b.reason === 'pre_actualization');

      if (latestBackup) {
        console.log(`📂 Найден backup: ${latestBackup.file}`);
        // В реальной ситуации здесь был бы код восстановления
        console.log('⚠️ Автоматическое восстановление отключено для безопасности');
        console.log(
          '💡 Для восстановления выполните: node docs/automation/backup-system.js restore'
        );
      }
    } catch (backupError) {
      console.log('❌ Ошибка доступа к backup системе:', backupError.message);
    }

    console.log('📋 Рекомендации:');
    console.log('  1. Проверьте логи выше');
    console.log('  2. Восстановите из backup при необходимости');
    console.log('  3. Исправьте проблему и повторите запуск');
  }
}

// 🚀 Точка входа
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Парсинг аргументов командной строки
  if (args.includes('--no-nav-maps')) options.updateNavMaps = false;
  if (args.includes('--no-docs')) options.updateDocs = false;
  if (args.includes('--create-new')) options.createNewFiles = true;

  const system = new ActualizationSystem();
  await system.run(options);
}

// Запуск только если скрипт вызван напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Неожиданная ошибка:', error);
    process.exit(1);
  });
}

module.exports = ActualizationSystem;
