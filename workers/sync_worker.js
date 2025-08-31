// sync_worker.js - Воркер для синхронизации данных
self.onmessage = function (e) {
  const { type, taskId, data } = e.data;

  if (type === 'ping') {
    self.postMessage({ type: 'pong' });
    return;
  }

  if (type === 'execute_task') {
    try {
      handleSyncTask(taskId, data);
    } catch (error) {
      self.postMessage({
        type: 'task_complete',
        taskId: taskId,
        error: error.message,
      });
    }
  }
};

function handleSyncTask(taskId, data) {
  switch (data.type) {
    case 'data_sync':
      performDataSync(taskId, data);
      break;

    case 'backup_creation':
      createBackup(taskId, data);
      break;

    case 'conflict_resolution':
      resolveConflicts(taskId, data);
      break;

    case 'offline_queue_process':
      processOfflineQueue(taskId, data);
      break;

    default:
      throw new Error(`Неизвестный тип задачи: ${data.type}`);
  }
}

// Основная синхронизация данных
function performDataSync(taskId, data) {
  const syncResult = {
    startTime: Date.now(),
    endTime: null,
    status: 'in_progress',
    operations: {
      upload: { total: 0, completed: 0, errors: [] },
      download: { total: 0, completed: 0, errors: [] },
      conflicts: { total: 0, resolved: 0, pending: [] },
    },
    summary: {},
  };

  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 0, step: 'Инициализация синхронизации' },
  });

  // Этап 1: Получение pending операций из IndexedDB
  const pendingOperations = simulateGetPendingOperations();
  syncResult.operations.upload.total = pendingOperations.length;

  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 10, step: `Найдено ${pendingOperations.length} операций для загрузки` },
  });

  // Этап 2: Загрузка изменений на сервер
  for (let i = 0; i < pendingOperations.length; i++) {
    const operation = pendingOperations[i];

    try {
      const result = simulateUploadOperation(operation);
      if (result.success) {
        syncResult.operations.upload.completed++;
      } else if (result.conflict) {
        syncResult.operations.conflicts.total++;
        syncResult.operations.conflicts.pending.push({
          operation: operation,
          serverData: result.serverData,
          localData: result.localData,
        });
      }
    } catch (error) {
      syncResult.operations.upload.errors.push({
        operation: operation,
        error: error.message,
      });
    }

    const uploadProgress = 10 + ((i + 1) / pendingOperations.length) * 40;
    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: { progress: uploadProgress, step: `Загружено ${i + 1}/${pendingOperations.length}` },
    });
  }

  // Этап 3: Получение обновлений с сервера
  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 50, step: 'Получение обновлений с сервера' },
  });

  const serverUpdates = simulateGetServerUpdates();
  syncResult.operations.download.total = serverUpdates.length;

  for (let i = 0; i < serverUpdates.length; i++) {
    const update = serverUpdates[i];

    try {
      const result = simulateApplyServerUpdate(update);
      if (result.success) {
        syncResult.operations.download.completed++;
      } else if (result.conflict) {
        syncResult.operations.conflicts.total++;
        syncResult.operations.conflicts.pending.push({
          update: update,
          conflict: result.conflict,
        });
      }
    } catch (error) {
      syncResult.operations.download.errors.push({
        update: update,
        error: error.message,
      });
    }

    const downloadProgress = 50 + ((i + 1) / serverUpdates.length) * 30;
    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: {
        progress: downloadProgress,
        step: `Применено ${i + 1}/${serverUpdates.length} обновлений`,
      },
    });
  }

  // Этап 4: Разрешение конфликтов
  if (syncResult.operations.conflicts.total > 0) {
    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: {
        progress: 80,
        step: `Разрешение ${syncResult.operations.conflicts.total} конфликтов`,
      },
    });

    for (const conflict of syncResult.operations.conflicts.pending) {
      try {
        const resolution = autoResolveConflict(conflict);
        if (resolution.resolved) {
          syncResult.operations.conflicts.resolved++;
        }
      } catch (error) {
        console.error('Ошибка разрешения конфликта:', error);
      }
    }
  }

  // Завершение
  syncResult.endTime = Date.now();
  syncResult.status = 'completed';
  syncResult.summary = {
    duration: syncResult.endTime - syncResult.startTime,
    totalOperations: syncResult.operations.upload.total + syncResult.operations.download.total,
    successfulOperations:
      syncResult.operations.upload.completed + syncResult.operations.download.completed,
    errors:
      syncResult.operations.upload.errors.length + syncResult.operations.download.errors.length,
    unresolvedConflicts:
      syncResult.operations.conflicts.total - syncResult.operations.conflicts.resolved,
  };

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: syncResult,
  });
}

// Создание резервной копии
function createBackup(taskId, data) {
  const backupResult = {
    startTime: Date.now(),
    endTime: null,
    status: 'in_progress',
    backup: {
      version: '1.0',
      timestamp: Date.now(),
      data: {},
      metadata: {},
    },
  };

  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 0, step: 'Начало создания резервной копии' },
  });

  // Сбор данных для резервной копии
  const tables = ['products', 'days', 'searchCache', 'statsCache'];

  for (let i = 0; i < tables.length; i++) {
    const tableName = tables[i];

    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: { progress: (i / tables.length) * 80, step: `Резервное копирование ${tableName}` },
    });

    // Симуляция извлечения данных из IndexedDB
    const tableData = simulateExtractTableData(tableName);
    backupResult.backup.data[tableName] = tableData;

    // Добавляем метаданные
    backupResult.backup.metadata[tableName] = {
      recordCount: tableData.length,
      extractedAt: Date.now(),
    };
  }

  // Сжатие данных
  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 80, step: 'Сжатие резервной копии' },
  });

  const compressedBackup = simulateCompression(backupResult.backup);

  // Сохранение
  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 90, step: 'Сохранение резервной копии' },
  });

  const saveResult = simulateSaveBackup(compressedBackup);

  backupResult.endTime = Date.now();
  backupResult.status = 'completed';
  backupResult.backup.size = compressedBackup.size;
  backupResult.backup.location = saveResult.location;
  backupResult.backup.checksum = saveResult.checksum;

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: backupResult,
  });
}

// Разрешение конфликтов
function resolveConflicts(taskId, data) {
  const { conflicts, strategy } = data;

  const resolutionResult = {
    total: conflicts.length,
    resolved: 0,
    failed: 0,
    resolutions: [],
    strategy: strategy,
  };

  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i];

    try {
      const resolution = resolveConflict(conflict, strategy);
      resolutionResult.resolutions.push(resolution);

      if (resolution.success) {
        resolutionResult.resolved++;
      } else {
        resolutionResult.failed++;
      }
    } catch (error) {
      resolutionResult.failed++;
      resolutionResult.resolutions.push({
        conflict: conflict,
        success: false,
        error: error.message,
      });
    }

    const progress = ((i + 1) / conflicts.length) * 100;
    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: { progress, step: `Разрешено ${i + 1}/${conflicts.length} конфликтов` },
    });
  }

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: resolutionResult,
  });
}

// Обработка оффлайн очереди
function processOfflineQueue(taskId, data) {
  const queueResult = {
    processed: 0,
    failed: 0,
    operations: [],
  };

  const offlineQueue = simulateGetOfflineQueue();

  for (let i = 0; i < offlineQueue.length; i++) {
    const operation = offlineQueue[i];

    try {
      const result = processOfflineOperation(operation);
      queueResult.operations.push(result);

      if (result.success) {
        queueResult.processed++;
      } else {
        queueResult.failed++;
      }
    } catch (error) {
      queueResult.failed++;
      queueResult.operations.push({
        operation: operation,
        success: false,
        error: error.message,
      });
    }

    const progress = ((i + 1) / offlineQueue.length) * 100;
    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: { progress, step: `Обработано ${i + 1}/${offlineQueue.length} операций` },
    });
  }

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: queueResult,
  });
}

// === СИМУЛЯЦИИ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function simulateGetPendingOperations() {
  // Симуляция получения операций из IndexedDB
  return [
    { id: 1, type: 'day_update', data: { date: '2025-08-24', totalKcal: 2100 } },
    { id: 2, type: 'product_add', data: { name: 'Новый продукт', kcal100: 250 } },
    { id: 3, type: 'day_update', data: { date: '2025-08-25', totalKcal: 1950 } },
  ];
}

function simulateUploadOperation(operation) {
  // Симуляция загрузки на сервер
  const random = Math.random();

  if (random < 0.8) {
    return { success: true };
  } else if (random < 0.9) {
    return {
      success: false,
      conflict: true,
      serverData: {
        /* данные с сервера */
      },
      localData: operation.data,
    };
  } else {
    throw new Error('Ошибка сети');
  }
}

function simulateGetServerUpdates() {
  // Симуляция получения обновлений с сервера
  return [
    { id: 'server_1', type: 'product_update', data: { id: 123, name: 'Обновленный продукт' } },
    { id: 'server_2', type: 'day_sync', data: { date: '2025-08-23', totalKcal: 2050 } },
  ];
}

function simulateApplyServerUpdate(update) {
  // Симуляция применения обновления
  const random = Math.random();

  if (random < 0.9) {
    return { success: true };
  } else {
    return {
      success: false,
      conflict: {
        type: 'data_mismatch',
        serverData: update.data,
        localData: {
          /* локальные данные */
        },
      },
    };
  }
}

function autoResolveConflict(conflict) {
  // Автоматическое разрешение конфликтов
  // Простая стратегия: последний обновленный побеждает

  if (conflict.operation) {
    // Конфликт при загрузке
    return {
      resolved: true,
      strategy: 'server_wins',
      result: conflict.serverData,
    };
  } else if (conflict.update) {
    // Конфликт при применении обновления
    return {
      resolved: true,
      strategy: 'merge',
      result: mergeConflictData(conflict.update, conflict.conflict),
    };
  }

  return { resolved: false };
}

function resolveConflict(conflict, strategy) {
  switch (strategy) {
    case 'local_wins':
      return {
        success: true,
        resolution: 'Используются локальные данные',
        data: conflict.localData,
      };

    case 'server_wins':
      return {
        success: true,
        resolution: 'Используются серверные данные',
        data: conflict.serverData,
      };

    case 'merge':
      return {
        success: true,
        resolution: 'Данные объединены',
        data: mergeConflictData(conflict.localData, conflict.serverData),
      };

    case 'manual':
      return {
        success: false,
        resolution: 'Требуется ручное разрешение',
        requiresManualIntervention: true,
      };

    default:
      throw new Error(`Неизвестная стратегия разрешения: ${strategy}`);
  }
}

function mergeConflictData(local, server) {
  // Простое слияние данных
  return {
    ...server,
    ...local,
    mergedAt: Date.now(),
    mergeStrategy: 'auto',
  };
}

function simulateExtractTableData(tableName) {
  // Симуляция извлечения данных из таблицы
  const sampleData = {
    products: [
      { id: 1, name: 'Хлеб', kcal100: 250 },
      { id: 2, name: 'Молоко', kcal100: 60 },
    ],
    days: [
      { date: '2025-08-24', totalKcal: 2100 },
      { date: '2025-08-25', totalKcal: 1950 },
    ],
    searchCache: [{ query: 'хлеб', results: [], timestamp: Date.now() }],
    statsCache: [{ key: 'weekly_avg', data: { kcal: 2000 }, timestamp: Date.now() }],
  };

  return sampleData[tableName] || [];
}

function simulateCompression(data) {
  // Симуляция сжатия данных
  const jsonString = JSON.stringify(data);
  return {
    compressed: true,
    originalSize: jsonString.length,
    size: Math.round(jsonString.length * 0.7), // 30% сжатие
    algorithm: 'gzip',
  };
}

function simulateSaveBackup(compressedData) {
  // Симуляция сохранения резервной копии
  return {
    location: 'local_storage',
    checksum: 'abc123def456',
    savedAt: Date.now(),
  };
}

function simulateGetOfflineQueue() {
  // Симуляция получения оффлайн очереди
  return [
    { id: 'offline_1', type: 'day_update', timestamp: Date.now() - 3600000 },
    { id: 'offline_2', type: 'product_search', timestamp: Date.now() - 1800000 },
  ];
}

function processOfflineOperation(operation) {
  // Обработка оффлайн операции
  const random = Math.random();

  if (random < 0.9) {
    return {
      operation: operation,
      success: true,
      processedAt: Date.now(),
    };
  } else {
    return {
      operation: operation,
      success: false,
      error: 'Не удалось обработать операцию',
    };
  }
}

console.log('[Worker] Sync Worker готов к работе');
