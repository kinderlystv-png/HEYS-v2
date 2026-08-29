// Пустая строка тренировки не должна стирать заполненную по свежести.
//
// Инцидент 29.08: куратор записал 70 минут кардио через MCP (delete + log),
// сервер ответил успехом, а к ночи день показывал «активность не отмечена».
// Строка не потерялась при записи — её затёрла последующая синхронизация
// приложения. Тренировки мержатся позиционно, и ветка localTrainingIsNewer
// стояла ВЫШЕ проверки «пустая против непустой»: приложение при сохранении дня
// штампует изменённую строку свежим mutationTs, поэтому устаревший React-снимок
// открытой вкладки приходил с меткой новее кураторской и выигрывал.
//
// Тот же механизм 19.08 трижды откатывал зоны «Барабаны» [47,73] → [0,120]
// (heys/9cb568). Защита remoteRowEditedUnseen его не ловит: ей нужно
// remoteTrainingTs > lastSeenUpdatedAt, а клиент, открывший день после
// кураторской записи, поднимает last-seen выше её метки.
//
// Осознанное удаление сюда не попадает и попасть не должно — оно приходит
// tombstone'ом и гасит обе стороны по одной подписи. Второй тест сторожит
// именно это: перестановка веток не должна оживлять удалённое.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

import { describe, test, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Тот же .cjs, что исполняет Cloud Function, — гарантирует единый путь кода.
const MERGE_PATH = path.resolve(
  __dirname,
  '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs',
);
const { mergeDayData, trainingDeletionSignature } = require(MERGE_PATH);

const day = (updatedAt, trainings) => ({
  date: '2026-08-29',
  updatedAt,
  meals: [],
  trainings,
  ...(fs.existsSync(MERGE_PATH) ? {} : {}),
});

/** Пустая заготовка, какую оставляет deleteTraining на месте удалённой строки. */
const emptyRow = (updatedAt) => ({ z: [0, 0, 0, 0], updatedAt });

describe('позиционный merge тренировок · пустая против непустой', () => {
  test('свежая пустая строка не стирает заполненную облачную', () => {
    // Куратор дописал тренировку на индекс 1 (deleteTraining оставил пустую
    // заготовку на 0, addTraining дописал в конец). У клиента на позиции 1 —
    // пустая заготовка со свежей меткой открытого дня.
    const local = day(5000, [emptyRow(4000), emptyRow(5000)]);
    const remote = day(3000, [
      emptyRow(3000),
      { z: [0, 35, 35, 0], activityLabel: 'Лёгкий бег', time: '14:00', updatedAt: 4200 },
    ]);

    const merged = mergeDayData(local, remote, { forceKeepAll: true });

    expect(merged, 'merge вернул null — расхождение не увидено').not.toBeNull();
    expect(merged.trainings[1].z).toEqual([0, 35, 35, 0]);
    expect(merged.trainings[1].activityLabel).toBe('Лёгкий бег');
  });

  test('tombstone сильнее: осознанное удаление не оживает', () => {
    const training = {
      z: [0, 35, 35, 0],
      activityLabel: 'Лёгкий бег',
      time: '14:00',
      id: 'tr_cardio',
      updatedAt: 4200,
    };
    const signature = trainingDeletionSignature(training);
    expect(signature, 'подпись удаления не построилась').toBeTruthy();

    // Человек удалил тренировку у себя: строка пуста, рядом лежит tombstone.
    const local = {
      ...day(5000, [emptyRow(5000)]),
      deletedTrainings: [{ id: 'tr_cardio', signature, deletedAt: 5000 }],
    };
    const remote = day(3000, [training]);

    const merged = mergeDayData(local, remote, { forceKeepAll: true });

    const row = merged ? merged.trainings[0] : local.trainings[0];
    const sum = (row.z || []).reduce((a, b) => a + (b || 0), 0);
    expect(sum, 'удалённая тренировка вернулась из облака').toBe(0);
  });
});
