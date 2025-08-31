// 🔒 СИСТЕМА BACKUP И ROLLBACK ДЛЯ ДОКУМЕНТАЦИИ HEYS
// Автоматическое создание backup'ов и восстановление документов

class DocsBackupSystem {
  constructor() {
    this.backupDir = './docs/backups';
    this.maxBackups = 10;
    this.criticalFiles = [
      'README.md',
      'HEYS Project Context.md',
      'docs/dependencies.yaml',
      'docs/DOCS_ACTUALIZATION_SYSTEM.md',
    ];
    this.initializeSystem();
  }

  // 📁 Инициализация системы backup'ов
  async initializeSystem() {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      console.log('🔒 Система backup инициализирована');
    } catch (error) {
      console.error('❌ Ошибка инициализации backup системы:', error);
    }
  }

  // 💾 Создание backup'а файла
  async createBackup(filePath, reason = 'manual') {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = path.basename(filePath);
      const backupPath = path.join(this.backupDir, `${fileName}.${timestamp}.${reason}.backup`);

      const backupData = {
        original_path: filePath,
        backup_time: new Date().toISOString(),
        reason: reason,
        content: content,
        file_size: content.length,
        checksum: this.calculateChecksum(content),
      };

      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup создан: ${backupPath}`);

      // Очистка старых backup'ов
      await this.cleanupOldBackups(fileName);

      return backupPath;
    } catch (error) {
      console.error(`❌ Ошибка создания backup для ${filePath}:`, error);
      throw error;
    }
  }

  // 🔄 Восстановление из backup'а
  async restoreFromBackup(backupPath, targetPath = null) {
    const fs = require('fs').promises;

    try {
      const backupContent = await fs.readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);

      const restorePath = targetPath || backupData.original_path;

      // Создание backup текущего состояния перед восстановлением
      await this.createBackup(restorePath, 'pre_restore');

      // Восстановление файла
      await fs.writeFile(restorePath, backupData.content);

      console.log(`🔄 Файл восстановлен: ${restorePath}`);
      console.log(`📅 Восстановлено состояние от: ${backupData.backup_time}`);

      return {
        success: true,
        restored_path: restorePath,
        backup_time: backupData.backup_time,
        reason: backupData.reason,
      };
    } catch (error) {
      console.error(`❌ Ошибка восстановления из ${backupPath}:`, error);
      throw error;
    }
  }

  // 🧹 Очистка старых backup'ов
  async cleanupOldBackups(fileName) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const files = await fs.readdir(this.backupDir);
      const fileBackups = files
        .filter(f => f.startsWith(fileName))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.stat(path.join(this.backupDir, f)).then(s => s.mtime),
        }));

      // Сортировка по времени (новые первые)
      for (let backup of fileBackups) {
        backup.time = await backup.time;
      }
      fileBackups.sort((a, b) => b.time - a.time);

      // Удаление лишних backup'ов
      if (fileBackups.length > this.maxBackups) {
        const toDelete = fileBackups.slice(this.maxBackups);
        for (let backup of toDelete) {
          await fs.unlink(backup.path);
          console.log(`🗑️ Удален старый backup: ${backup.name}`);
        }
      }
    } catch (error) {
      console.error("❌ Ошибка очистки backup'ов:", error);
    }
  }

  // 🔍 Список доступных backup'ов
  async listBackups(fileName = null) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const files = await fs.readdir(this.backupDir);
      let backups = files.filter(f => f.endsWith('.backup'));

      if (fileName) {
        backups = backups.filter(f => f.startsWith(fileName));
      }

      const backupDetails = [];
      for (let backup of backups) {
        try {
          const content = await fs.readFile(path.join(this.backupDir, backup), 'utf8');
          const data = JSON.parse(content);
          backupDetails.push({
            file: backup,
            original_path: data.original_path,
            backup_time: data.backup_time,
            reason: data.reason,
            size: data.file_size,
          });
        } catch (e) {
          console.warn(`⚠️ Не удалось прочитать backup: ${backup}`);
        }
      }

      return backupDetails.sort((a, b) => new Date(b.backup_time) - new Date(a.backup_time));
    } catch (error) {
      console.error("❌ Ошибка получения списка backup'ов:", error);
      return [];
    }
  }

  // 🔢 Расчет контрольной суммы
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  // 🚨 Автоматический backup критических файлов
  async autoBackupCriticalFiles(reason = 'auto_backup') {
    console.log('🔒 Запуск автоматического backup критических файлов...');

    const results = [];
    for (let filePath of this.criticalFiles) {
      try {
        const backupPath = await this.createBackup(filePath, reason);
        results.push({ file: filePath, backup: backupPath, success: true });
      } catch (error) {
        results.push({ file: filePath, error: error.message, success: false });
      }
    }

    console.log(`✅ Автоматический backup завершен. Обработано: ${results.length} файлов`);
    return results;
  }
}

// 🌐 Экспорт для использования в системе актуализации
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocsBackupSystem;
}

// 🔧 Инициализация глобальной системы backup
if (typeof window !== 'undefined') {
  window.DocsBackupSystem = DocsBackupSystem;
}

console.log('🔒 Система backup и rollback документации загружена');
