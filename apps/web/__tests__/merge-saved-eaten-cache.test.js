/**
 * Регресс 2026-08-02: `merged` в mergeDayData строится как `{ ...remote }`, а
 * приёмы объединяются с обеих сторон. При конфликтном merge (обе стороны
 * несли непустой день) savedEatenKcal/Prot/Carbs/Fat/Fiber оставались от
 * remote и переставали соответствовать итоговому списку позиций — та же
 * ошибка, что чинили в MCP-коннекторе (heys-mcp/lib/day.js, savedEatenCache),
 * только на сервере она бьёт любой конфликт двух устройств, не только запись
 * куратора.
 *
 * Тестируем настоящий модуль (три копии обязаны быть побайтово идентичны),
 * не изолированную копию логики.
 */
import { describe, expect, it } from 'vitest';

const { mergeDayData } = require('../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');

function item(name, grams, kcal100, protein100 = 0, carbs100 = 0, fat100 = 0) {
  return { id: name, name, grams, kcal100, protein100, carbs100, fat100 };
}

describe('merge пересчитывает savedEaten* кэш', () => {
  it('конфликтный merge пересчитывает savedEaten* из объединённых meals, а не наследует их от remote', () => {
    // Клиент сам записал завтрак (100 ккал), кэш = 100.
    const remote = {
      date: '2026-08-02',
      updatedAt: 1000,
      meals: [{ id: 'm1', time: '08:00', items: [item('овсянка', 100, 100)] }],
      savedEatenKcal: 100,
    };
    // Куратор внёс обед (200 ккал) с другого писателя, конфликт по updatedAt.
    const local = {
      date: '2026-08-02',
      updatedAt: 2000,
      meals: [{ id: 'm2', time: '13:00', items: [item('суп', 100, 200)] }],
    };

    const merged = mergeDayData(local, remote, { forceKeepAll: true });

    expect(merged.meals.length).toBe(2);
    expect(merged.savedEatenKcal).toBe(300);
  });

  it('пустой день после merge снимает кэш, а не оставляет калории несуществующей еды', () => {
    const remote = { date: '2026-08-02', updatedAt: 1000, meals: [], savedEatenKcal: 500, savedEatenProt: 20 };
    const local = { date: '2026-08-02', updatedAt: 2000, meals: [] };

    const merged = mergeDayData(local, remote, { forceKeepAll: true });

    expect(merged.savedEatenKcal).toBeUndefined();
    expect(merged.savedEatenProt).toBeUndefined();
  });

  it('пересчёт учитывает белки/жиры по той же формуле, что коннектор', () => {
    const remote = { date: '2026-08-02', updatedAt: 1000, meals: [] };
    const local = {
      date: '2026-08-02',
      updatedAt: 2000,
      meals: [{
        id: 'm1',
        time: '08:00',
        items: [{ id: 'i1', name: 'куриная грудка', grams: 200, kcal100: 165, protein100: 31, carbs100: 0, fat100: 3.6, fiber100: 0 }],
      }],
    };

    const merged = mergeDayData(local, remote, { forceKeepAll: true });

    expect(merged.savedEatenKcal).toBe(330);
    expect(merged.savedEatenProt).toBe(62);
    expect(merged.savedEatenFat).toBe(7.2);
  });
});
