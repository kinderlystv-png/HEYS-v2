// @vitest-environment jsdom

import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modulePath = path.resolve(__dirname, '../heys_curator_actions_banner_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const originalConsoleInfo = console.info;

function createEntry(id, createdAt, actions = [{ type: 'meal_item_added', meal_label: 'Обед', count: 1 }]) {
  return {
    id,
    curator_id: '22222222-2222-4222-8222-222222222222',
    keys: ['heys_dayv2_2026-07-05'],
    created_at: createdAt,
    actions: { actions },
  };
}

function response(entries, serverNow = '2026-07-05T10:00:00.000Z', extra = {}) {
  return {
    ok: true,
    since: '2026-07-01T00:00:00.000Z',
    server_now: serverNow,
    has_more: false,
    entries,
    ...extra,
  };
}

function loadBanner({ url = '/' } = {}) {
  window.history.replaceState({}, '', url);
  window.HEYS = {
    cloud: {
      isPinAuthClient: vi.fn(() => true),
      _syncLastCompleted: false,
    },
    auth: {
      getSessionToken: vi.fn(() => 'pin-session'),
    },
    YandexAPI: {
      getMyCuratorChangelogSince: vi.fn(),
      ackCuratorChangelog: vi.fn().mockResolvedValue({ ok: true }),
    },
    utils: {
      lsSet: vi.fn((key, value) => Storage.prototype.setItem.call(window.localStorage, key, JSON.stringify(value))),
      lsGet: vi.fn(() => null),
    },
    ui: {
      switchTab: vi.fn(),
      setSelectedDate: vi.fn(),
    },
  };
  console.info = vi.fn();
  eval(moduleSource);
  return window.HEYS.CuratorActionsBanner;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

function createDatedEntry(id, createdAt, date, actions) {
  const raw = actions || [{ type: 'meal_item_added', meal_label: 'Обед', count: 1 }];
  return {
    id,
    curator_id: '22222222-2222-4222-8222-222222222222',
    keys: [`heys_dayv2_${date}`],
    created_at: createdAt,
    actions: { actions: raw.map((action) => (action.date ? action : { ...action, date })) },
  };
}

async function dismissSheetTwice() {
  expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
  document.querySelector('.ca-modal__later-btn').click();
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
  expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
  document.querySelector('.ca-modal__later-btn').click();
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
  expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
}

function dateLabels() {
  return Array.from(document.querySelectorAll('.ca-modal__date-label')).map((el) => el.textContent);
}

describe('CuratorActionsBanner review modal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T10:00:00.000Z'));
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.HEYS = undefined;
    console.info = originalConsoleInfo;
  });

  it('summarizes meal_item_added as products, not meals', () => {
    const banner = loadBanner();
    const helpers = banner._test;
    const summary = helpers.summarizeEntries([
      createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
        {
          type: 'meal_item_added',
          meal_id: 'm_1',
          meal_label: 'Обед',
          count: 2,
          items: [
            { item_id: 'it_1', name: 'Рис', grams: 100 },
            { item_id: 'it_2', name: 'Курица', grams: 150 },
          ],
        },
      ]),
    ]);

    expect(summary).toBe('+2 продукта');
  });

  it('keeps unknown action visible instead of silent auto-ack', () => {
    const banner = loadBanner();
    const helpers = banner._test;

    expect(helpers.actionText({ type: 'future_curator_action' })).toBe('Обновлены данные');
    expect(helpers.summarizeEntries([
      createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
        { type: 'future_curator_action' },
      ]),
    ])).toBe('1 правка');
  });

  it('documents snooze as session-only storage', () => {
    const banner = loadBanner();

    expect(banner._test.dismissStorageName).toBe('sessionStorage');
  });

  it('opens initial backlog as a modal after check', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    expect(document.querySelector('.ca-modal__header-title')?.textContent).toBe('Ваш куратор обновил дневник');
    expect(document.querySelector('.ca-modal__curator-signature')).toBeFalsy();
    expect(document.querySelector('.ca-modal__show-btn')).toBeFalsy();
    expect(document.querySelector('.ca-modal__ack-btn')?.textContent).toBe('Понятно');
  });

  it('does not open live entries immediately and opens them after 30 minutes', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T10:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([entry], '2026-07-05T10:00:00.000Z'));

    await banner.checkAndShow();
    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
  });

  it('opens a curator-added training immediately with its details', async () => {
    const training = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T10:00:00.000Z', [
      { type: 'training_added', kind: 'Кардио', duration_min: 60, time: '19:50' },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([training], '2026-07-05T10:00:00.000Z'));

    await banner.checkAndShow();
    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    expect(document.querySelector('.ca-modal__header-subtitle')?.textContent).toBe('Еду не трогали — правки по весу и активности');
    expect(document.querySelector('.ca-modal__content')?.textContent).toContain('Тренировка: Кардио, 60 минут');
  });

  it('renders the same training only once when it appears in multiple changelog entries', async () => {
    const action = { type: 'training_added', kind: 'Кардио', duration_min: 60, time: '19:50' };
    const first = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:55:00.000Z', [action]);
    const second = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-05T10:00:00.000Z', [action]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([second, first]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__header-subtitle')?.textContent).toBe('Еду не трогали — правки по весу и активности');
    const trainingCards = Array.from(document.querySelectorAll('.ca-modal__item-title'))
      .filter((node) => node.textContent?.includes('Тренировка: Кардио, 60 минут'));
    expect(trainingCards).toHaveLength(1);
  });

  it('treats a changed PIN session as a new initial backlog', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T10:00:00.000Z');
    const banner = loadBanner();
    let token = 'pin-session-a';
    window.HEYS.currentClientId = 'client-a';
    window.HEYS.auth.getSessionToken.mockImplementation(() => token);
    window.HEYS.YandexAPI.getMyCuratorChangelogSince
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([entry], '2026-07-05T10:00:00.000Z'));

    await banner.checkAndShow();
    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();

    token = 'pin-session-b';
    window.HEYS.currentClientId = 'client-b';
    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
  });

  it('adds entries arriving during the 30 minute live window to the same modal', async () => {
    const first = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T10:00:00.000Z', [
      { type: 'meal_item_added', meal_label: 'Обед', count: 1 },
    ]);
    const second = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-05T10:10:00.000Z', [
      { type: 'meal_item_added', meal_label: 'Ужин', count: 2 },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([first], '2026-07-05T10:00:00.000Z'))
      .mockResolvedValueOnce(response([second, first], '2026-07-05T10:10:00.000Z'));

    await banner.checkAndShow();
    await banner.checkAndShow();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await banner.checkAndShow();
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);

    expect(document.querySelector('.ca-modal__header-subtitle')?.textContent).toBe('Проверьте, что изменилось по вашим данным');
  });

  it('updates an open modal and acknowledges newly rendered entries', async () => {
    const breakfast = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'meal_added', meal_id: 'breakfast', meal_label: 'Завтрак', time: '09:30', items: [{ name: 'Овсянка' }] },
    ]);
    const lunch = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-05T09:05:00.000Z', [
      { type: 'meal_added', meal_id: 'lunch', meal_label: 'Обед', time: '13:30', items: [{ name: 'Суп' }] },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince
      .mockResolvedValueOnce(response([breakfast]))
      .mockResolvedValueOnce(response([lunch, breakfast]));

    await banner.checkAndShow();
    expect(document.querySelector('.ca-modal__content')?.textContent).toContain('Завтрак');
    expect(document.querySelector('.ca-modal__content')?.textContent).not.toContain('Обед');

    await banner.checkAndShow();
    expect(document.querySelector('.ca-modal__header-subtitle')?.textContent).toBe('Проверьте, что изменилось по вашим данным');
    expect(document.querySelector('.ca-modal__content')?.textContent).toContain('Обед');

    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();

    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
      entryIds: [
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
      ],
      untilTs: '2026-07-05T09:05:00.000Z',
    });
  });

  it('keeps changes for different days in one modal grouped by date', async () => {
    const today = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'meal_added', date: '2026-07-05', meal_id: 'breakfast', meal_label: 'Завтрак', items: [{ name: 'Овсянка' }] },
    ]);
    const yesterday = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-04T09:00:00.000Z', [
      { type: 'meal_added', date: '2026-07-04', meal_id: 'lunch', meal_label: 'Обед', items: [{ name: 'Суп' }] },
    ]);
    yesterday.keys = ['heys_dayv2_2026-07-04'];
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([today, yesterday]));

    await banner.checkAndShow();

    expect(document.querySelectorAll('.ca-modal-backdrop')).toHaveLength(1);
    expect(document.querySelectorAll('.ca-modal__group')).toHaveLength(2);
    expect(Array.from(document.querySelectorAll('.ca-modal__date-label')).map(node => node.textContent)).toEqual([
      '5 июля',
      '4 июля',
    ]);
  });

  it('hides and auto-acks a curator meal that the client already deleted', async () => {
    const breakfast = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'meal_added', date: '2026-07-05', meal_id: 'breakfast', meal_label: 'Завтрак', items: [{ item_id: 'oats', name: 'Овсянка' }] },
    ]);
    const deletedLunch = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-05T09:05:00.000Z', [
      { type: 'meal_added', date: '2026-07-05', meal_id: 'lunch', meal_label: 'Обед', items: [{ item_id: 'soup', name: 'Суп' }] },
    ]);
    const banner = loadBanner();
    window.HEYS.utils.lsGet.mockReturnValue({
      meals: [{ id: 'breakfast', items: [{ id: 'oats', name: 'Овсянка' }] }],
      deletedMealIds: { lunch: Date.now() },
    });
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([deletedLunch, breakfast]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__content')?.textContent).toContain('Завтрак');
    expect(document.querySelector('.ca-modal__content')?.textContent).not.toContain('Обед');
    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
      entryIds: ['33333333-3333-4333-8333-333333333333'],
      untilTs: '2026-07-05T09:05:00.000Z',
    });
  });

  it('does not auto-ack a curator meal while the local day is still stale', async () => {
    const lunch = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-05T09:05:00.000Z', [
      { type: 'meal_added', date: '2026-07-05', meal_id: 'lunch', meal_label: 'Обед', items: [{ item_id: 'soup', name: 'Суп' }] },
    ]);
    const banner = loadBanner();
    window.HEYS.utils.lsGet.mockReturnValue({
      meals: [{ id: 'breakfast', items: [{ id: 'oats', name: 'Овсянка' }] }],
    });
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([lunch]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__content')?.textContent).toContain('Обед');
    expect(window.HEYS.YandexAPI.ackCuratorChangelog).not.toHaveBeenCalled();
  });

  it('hides products that the client removed from a curator-added meal', () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      {
        type: 'meal_item_added', date: '2026-07-05', meal_id: 'lunch', meal_label: 'Обед', count: 2,
        items: [{ item_id: 'soup', name: 'Суп' }, { item_id: 'bread', name: 'Хлеб' }],
      },
    ]);
    const banner = loadBanner();
    window.HEYS.utils.lsGet.mockReturnValue({
      meals: [{ id: 'lunch', items: [{ id: 'soup', name: 'Суп' }] }],
      deletedItemIds: { bread: Date.now() },
    });

    const [reconciled] = banner._test.reconcileEntriesWithCurrentDays([entry]);

    expect(reconciled.actions.actions[0]).toMatchObject({ count: 1, items: [{ item_id: 'soup', name: 'Суп' }] });
  });

  it('postpones opening while the tab is hidden and opens on visibilitychange', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
  });

  it('re-fetches and opens live changes immediately when an existing PIN session returns', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T10:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([entry], '2026-07-05T10:00:00.000Z'));

    await banner.checkAndShow();
    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(window.HEYS.YandexAPI.getMyCuratorChangelogSince).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
  });

  it('snoozes on later without acking', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();
    document.querySelector('.ca-modal__later-btn').click();
    await flushMicrotasks();

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(sessionStorage.getItem(banner._test.constants.SNOOZE_UNTIL_KEY)).toBeTruthy();
    expect(window.HEYS.YandexAPI.ackCuratorChangelog).not.toHaveBeenCalled();
  });

  it('opens selected change target and acks only when no visible actions remain', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'meal_item_changed', date: '2026-07-05', meal_id: 'meal_1', item_id: 'item_1', meal_label: 'Обед', from_grams: 80, to_grams: 100 },
      { type: 'weight_set', date: '2026-07-05', from: 82, to: 81.5 },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));
    const target = document.createElement('div');
    target.setAttribute('data-item-id', 'item_1');
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    await banner.checkAndShow();
    document.querySelector('[data-ca-target-id]').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(window.HEYS.YandexAPI.ackCuratorChangelog).not.toHaveBeenCalled();
    expect(window.HEYS.ui.setSelectedDate).toHaveBeenCalledWith('2026-07-05');
    expect(window.HEYS.ui.switchTab).toHaveBeenCalledWith('diary');
    expect(sessionStorage.getItem('heys_curator_review_target_date')).toBe('2026-07-05');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  // Канвас curator-edits.v4, строка «адреса переходов»: «еда, вес, вода, сон —
  // дневник нужного дня · шаги и тренировки — „Актив“ · нормы, профиль, план —
  // дневник по умолчанию». Прежняя таблица закрепляла адреса, которых контракт
  // не называет (вес и сон → «Статистика», нормы и профиль → «Профиль», план →
  // «Задачи»); для веса и сна это ещё и вело туда, где помеченного элемента
  // нет, — вспышка не срабатывала. Таблица приведена к контракту.
  it('routes every curator action to a real product surface', () => {
    const banner = loadBanner();
    const build = banner._test.buildActionTarget;
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const cases = [
      [{ type: 'meal_added', meal_id: 'meal-1' }, 'diary', '[data-meal-id="meal-1"]'],
      [{ type: 'meal_item_removed', meal_id: 'meal-1', item_id: 'gone-item' }, 'diary', '[data-meal-id="meal-1"]'],
      [{ type: 'meal_removed' }, 'diary', '#diary-heading'],
      [{ type: 'water_set' }, 'diary', '#water-card'],
      [{ type: 'steps_set' }, 'activity', '[data-curator-target="steps"]'],
      [{ type: 'training_added', kind: 'Зарядка', training_index: 2 }, 'activity', '[data-training-index="2"]'],
      [{ type: 'training_removed', training_index: 1 }, 'activity', '[data-curator-target="activity"]'],
      [{ type: 'weight_set' }, 'diary', '[data-curator-target="weight"]'],
      [{ type: 'sleep_set' }, 'diary', '[data-curator-target="sleep"]'],
      [{ type: 'profile_changed' }, 'diary', '[data-curator-target="nutrition"]'],
      [{ type: 'norms_changed' }, 'diary', '[data-curator-target="nutrition"]'],
      [{ type: 'planning_changed' }, 'diary', '[data-curator-target="nutrition"]'],
    ];

    for (const [action, tab, selector] of cases) {
      const target = build(entry, action);
      expect(target.tab).toBe(tab);
      expect(target.selectors[0]).toBe(selector);
    }
  });

  // Смоук по каждому виду правки: таблица адресов проверяет чистую функцию, а
  // здесь нажимается реальная строка реального листа — руками такой набор не
  // собрать, для этого куратору пришлось бы девять раз править чужой день.
  it('sends every kind of edit to its contract address from the real sheet', async () => {
    const cases = [
      [{ type: 'meal_item_added', meal_label: 'Обед', count: 1 }, 'diary', '2026-07-05'],
      [{ type: 'water_set', from: 1000, to: 1800 }, 'diary', '2026-07-05'],
      [{ type: 'weight_set', from: 82, to: 81.5 }, 'diary', '2026-07-05'],
      [{ type: 'sleep_set', from: 6, to: 8 }, 'diary', '2026-07-05'],
      [{ type: 'steps_set', from: 3000, to: 9000 }, 'activity', '2026-07-05'],
      [{ type: 'training_added', kind: 'Силовая' }, 'activity', '2026-07-05'],
      [{ type: 'norms_changed', fields: ['Калории'] }, 'diary', null],
      [{ type: 'profile_changed', fields: ['Рост'] }, 'diary', null],
      [{ type: 'planning_changed' }, 'diary', null],
    ];

    for (const [action, tab, date] of cases) {
      document.body.innerHTML = '';
      localStorage.clear();
      sessionStorage.clear();
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([
        createDatedEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', '2026-07-05', [action]),
      ]));

      await banner.checkAndShow();
      const row = document.querySelector('[data-ca-target-id]');
      expect(row, `нет строки для ${action.type}`).toBeTruthy();
      row.click();
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(300);

      expect(window.HEYS.ui.switchTab, action.type).toHaveBeenCalledWith(tab);
      if (date) expect(window.HEYS.ui.setSelectedDate, action.type).toHaveBeenCalledWith(date);
      else expect(window.HEYS.ui.setSelectedDate, action.type).not.toHaveBeenCalled();
    }
  });

  // «Дневник нужного дня» против «дневника по умолчанию»: правка дня несёт
  // дату и переключает день, правка норм/профиля/плана — нет, потому что к дню
  // она не привязана и переключать день под неё нечем.
  it('carries the day date only for day-scoped actions', () => {
    const banner = loadBanner();
    const build = banner._test.buildActionTarget;
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');

    for (const type of ['meal_added', 'water_set', 'weight_set', 'sleep_set']) {
      expect(build(entry, { type, date: '2026-07-05' }).date).toBe('2026-07-05');
    }
    for (const type of ['norms_changed', 'profile_changed', 'planning_changed']) {
      expect(build(entry, { type, date: '2026-07-05' }).date).toBe(null);
    }
  });

  it('keeps every curator target selector backed by a rendered DOM marker', () => {
    const sources = [
      '../heys_day_water_v1.js',
      '../heys_day_activity_v1.js',
      '../heys_day_trainings_v1.js',
      '../heys_day_main_block_v1.js',
      '../heys_day_side_block_v1.js',
      '../heys_day_diary_section.js',
      '../heys_day_nutrition_v1.js',
    ].map((relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')).join('\n');

    for (const marker of [
      "id: 'water-card'",
      "'data-curator-target': 'steps'",
      "'data-curator-target': 'training'",
      "'data-curator-target': 'activity'",
      "'data-curator-target': 'weight'",
      "'data-curator-target': 'sleep'",
      "id: 'diary-heading'",
      "'data-curator-target': 'nutrition'",
    ]) {
      expect(sources).toContain(marker);
    }
  });

  it('extracts target date from scoped dayv2 keys', () => {
    const banner = loadBanner();
    const date = banner._test.targetDateFromEntries([
      {
        created_at: '2026-07-04T10:00:00.000Z',
        keys: ['heys_4545ee50-254d-4c83-902b-f10e6e8e6d9a_dayv2_2026-07-05'],
        actions: { actions: [{ type: 'future_curator_action' }] },
      },
    ]);

    expect(date).toBe('2026-07-05');
  });

  it('falls back target date to created_at when day key is absent', () => {
    const banner = loadBanner();
    const date = banner._test.targetDateFromEntries([
      {
        created_at: '2026-07-04T10:00:00.000Z',
        keys: ['heys_profile'],
        actions: { actions: [{ type: 'profile_changed' }] },
      },
    ]);

    expect(date).toBe('2026-07-04');
  });

  it('acks only shown entry ids after acknowledge', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();

    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
      entryIds: ['11111111-1111-4111-8111-111111111111'],
      untilTs: '2026-07-05T09:00:00.000Z',
    });
    expect(window.HEYS.utils.lsSet).not.toHaveBeenCalled();
  });

  it('acknowledges with Понятно and stays on the current screen', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'training_added', date: '2026-07-05', kind: 'Активное хобби', duration_min: 45, time: '10:40' },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);

    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
      entryIds: ['11111111-1111-4111-8111-111111111111'],
      untilTs: '2026-07-05T09:00:00.000Z',
    });
    expect(window.HEYS.ui.switchTab).not.toHaveBeenCalled();
    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(banner.getDayCue('2026-07-05')).toBeNull();
    expect(banner.getVisibleCue('2026-07-05')).toBeNull();
  });

  it('forceShowLastReview opens the sheet again after Понятно', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'training_added', date: '2026-07-05', kind: 'Активное хобби', duration_min: 45, time: '10:40' },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);
    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();

    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([]));
    const opened = await banner.forceShowLastReview({ allowSample: false });
    expect(opened).toBe(true);
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    expect(document.querySelector('.ca-modal__ack-btn')?.textContent).toBe('Понятно');
    expect(typeof window.HEYS.debug.replayCuratorReview).toBe('function');
  });

  it('forceShowLastReview shows a sample sheet when nothing is left to replay', async () => {
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([]));
    const opened = await banner.forceShowLastReview({ allowSample: true });
    expect(opened).toBe(true);
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    expect(document.body.textContent).toMatch(/куратор|дневник/i);
  });

  it('forceShowLastReview reopens after local hide of an action', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'training_added', date: '2026-07-05', kind: 'Активное хобби', duration_min: 45, time: '10:40' },
      { type: 'steps_set', date: '2026-07-05', steps: 9000 },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();
    banner._test.hideActionLocally(entry, entry.actions.actions[0]);
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);

    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([]));
    const opened = await banner.forceShowLastReview({ allowSample: false });
    expect(opened).toBe(true);
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
  });

  it('navigates from a training row with scroll and pulse', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'training_added', date: '2026-07-05', kind: 'Активное хобби', duration_min: 45, time: '10:40' },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));
    const training = document.createElement('div');
    training.setAttribute('data-curator-target', 'training');
    training.scrollIntoView = vi.fn();
    document.body.appendChild(training);

    await banner.checkAndShow();
    document.querySelector('[data-ca-target-id]').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);

    expect(window.HEYS.ui.setSelectedDate).toHaveBeenCalledWith('2026-07-05');
    expect(window.HEYS.ui.switchTab).toHaveBeenCalledWith('activity');
    expect(training.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(training.classList.contains('ca-scroll-highlight')).toBe(true);
  });

  it('acknowledges a water update and scrolls to the water card', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'water_set', date: '2026-07-05', to: 1800 },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));
    const waterCard = document.createElement('div');
    waterCard.id = 'water-card';
    waterCard.scrollIntoView = vi.fn();
    document.body.appendChild(waterCard);

    await banner.checkAndShow();
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);

    expect(window.HEYS.ui.switchTab).not.toHaveBeenCalled();
    expect(waterCard.scrollIntoView).not.toHaveBeenCalled();
  });

  it('acks from runtime queue when browser storage writes fail', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    await banner.checkAndShow();
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();

    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
      entryIds: ['11111111-1111-4111-8111-111111111111'],
      untilTs: '2026-07-05T09:00:00.000Z',
    });
  });

  it('does not reopen entries while a failed ack is queued for retry', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));
    window.HEYS.YandexAPI.ackCuratorChangelog.mockResolvedValue({ ok: false });

    await banner.checkAndShow();
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();
    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledTimes(2);
  });

  it('force-opens from push URL without waiting for live accumulation', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T10:00:00.000Z');
    const banner = loadBanner({ url: '/?openCuratorFeed=1' });
    window.HEYS.YandexAPI.getMyCuratorChangelogSince
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([entry], '2026-07-05T10:00:00.000Z'));

    await banner.checkAndShow();
    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('auto-acks empty legacy rows without showing a modal', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', []);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();
    await flushMicrotasks();

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
      entryIds: ['11111111-1111-4111-8111-111111111111'],
      untilTs: '2026-07-05T09:00:00.000Z',
    });
  });

  it('omits day kcal when envelope fields are missing', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'weight_set', date: '2026-07-05', from: 82, to: 81.5 },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__date-kcal')).toBeFalsy();
    expect(document.querySelector('.ca-modal__date-label')?.textContent).toBe('5 июля');
  });

  it('shows first-unacked before to last-unacked after kcal', async () => {
    const first = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'meal_added', date: '2026-07-05', meal_label: 'Ужин', kcal: 697 },
    ]);
    first.actions.day_kcal_before = 1240;
    first.actions.day_kcal_after = 1800;
    const second = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-05T09:10:00.000Z', [
      { type: 'meal_item_changed', date: '2026-07-05', meal_label: 'Обед', from_grams: 200, to_grams: 288, kcal_delta: 118 },
    ]);
    second.actions.day_kcal_before = 1800;
    second.actions.day_kcal_after = 1937;
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([second, first]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__date-kcal')?.textContent).toMatch(/1\s240 → 1\s937 ккал/);
  });

  it('uses curator first name from the client profile', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.utils.lsGet.mockImplementation((key) => (
      key === 'heys_profile' ? { curatorName: 'Антон Петров' } : null
    ));
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__header-title')?.textContent).toBe('Куратор Антон обновил ваш дневник');
  });

  it('uses curatorDisplayName from config when profile has no name', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.utils.lsGet.mockImplementation((key) => (
      key === 'heys_profile' ? { curatorId: 'c1' } : null
    ));
    window.HEYS.config = { curatorDisplayName: 'Антон Волков' };
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__header-title')?.textContent).toBe('Куратор Антон обновил ваш дневник');
    expect(document.querySelector('.ca-modal__close-svg')).toBeTruthy();
  });

  it('diag sample uses canvas name when profile has none', async () => {
    const banner = loadBanner();
    window.HEYS.utils.lsGet.mockReturnValue({});
    window.HEYS.config = {};
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([]));

    const ok = await banner.forceShowLastReview({ allowSample: true });

    expect(ok).toBe(true);
    expect(document.querySelector('.ca-modal__header-title')?.textContent).toBe('Куратор Антон обновил ваш дневник');
  });

  it('stops auto-opening after two shows and clears the day cue after Понятно', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    await banner.checkAndShow();
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    document.querySelector('.ca-modal__later-btn').click();

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    document.querySelector('.ca-modal__later-btn').click();

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(banner.shouldShowNutritionDot()).toBe(true);

    banner.openFromCue('2026-07-05');
    expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();
    expect(banner.getDayCue('2026-07-05')).toBeNull();
    expect(banner.getVisibleCue('2026-07-05')).toBeNull();
    expect(banner.shouldShowNutritionDot()).toBe(false);
  });

  describe('display grouping', () => {
    it('groups identical meal_item_removed rows', () => {
      const banner = loadBanner();
      const { groupIdenticalRemovalPairs, actionRowCopy } = banner._test;
      const pairs = Array.from({ length: 5 }, () => ({
        entry: { id: 'entry-1' },
        action: {
          type: 'meal_item_removed',
          meal_label: 'Кофе с молоком',
          kcal_delta: -113,
        },
      }));
      const grouped = groupIdenticalRemovalPairs(pairs);
      expect(grouped).toHaveLength(1);
      expect(grouped[0].action).toMatchObject({
        type: 'meal_item_removed_group',
        count: 5,
        kcal_total: -565,
      });
      expect(actionRowCopy(grouped[0].action).title).toBe('Из «Кофе с молоком» убран продукт');
    });

    it('keeps raw action count for subtitle before display grouping', () => {
      const banner = loadBanner();
      const { groupVisibleByDate } = banner._test;
      const entry = createDatedEntry(
        '11111111-1111-4111-8111-111111111111',
        '2026-08-16T09:00:00.000Z',
        '2026-08-16',
        [
          { type: 'meal_added', meal_id: 'dinner', meal_label: 'Ужин', kcal: 637 },
          { type: 'steps_set', to: 5000 },
          ...Array.from({ length: 5 }, () => ({
            type: 'meal_item_removed',
            meal_label: 'Кофе с молоком',
            kcal_delta: -113,
          })),
        ],
      );
      const groups = groupVisibleByDate([entry]);
      expect(groups[0].rawPairCount).toBe(7);
      expect(groups[0].pairs.filter((p) => p.action.type === 'meal_item_removed')).toHaveLength(5);
      const grouped = banner._test.groupIdenticalMealPairs(groups[0].pairs);
      expect(grouped.filter((p) => p.action.type === 'meal_item_removed')).toHaveLength(0);
      expect(grouped.some((p) => p.action.type === 'meal_item_removed_group')).toBe(true);
    });
  });

  describe('v4 smoke: точка, строка дня, стык дат', () => {
    const day5 = () => createDatedEntry(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-05T09:00:00.000Z',
      '2026-07-05',
      [{ type: 'meal_item_added', meal_label: 'Обед', count: 1 }],
    );
    const day4 = () => createDatedEntry(
      '44444444-4444-4444-8444-444444444444',
      '2026-07-04T18:00:00.000Z',
      '2026-07-04',
      [{ type: 'weight_set', from: 82, to: 81.5 }],
    );

    it('does not show the nutrition dot on the first auto-open or after the first Позже', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5()]));

      await banner.checkAndShow();
      expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
      expect(banner.shouldShowNutritionDot()).toBe(false);

      document.querySelector('.ca-modal__later-btn').click();
      expect(banner.shouldShowNutritionDot()).toBe(false);
      expect(sessionStorage.getItem(banner._test.constants.SHOW_COUNT_KEY)).toBe('1');
    });

    it('shows the nutrition dot only after the second Позже, without a numeric badge', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5()]));

      await banner.checkAndShow();
      await dismissSheetTwice();

      expect(banner.shouldShowNutritionDot()).toBe(true);
      expect(sessionStorage.getItem(banner._test.constants.SHOW_COUNT_KEY)).toBe('2');
      expect(document.querySelector('.ca-tab-dot-mark')).toBeFalsy();
      expect(document.body.textContent).not.toMatch(/\b43\b/);
    });

    it('clears the nutrition dot after Понятно on the full unfiltered sheet', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5(), day4()]));

      await banner.checkAndShow();
      await dismissSheetTwice();
      expect(banner.shouldShowNutritionDot()).toBe(true);

      banner.openFromTab();
      expect(dateLabels().join(' ')).toMatch(/5 июля/);
      expect(dateLabels().join(' ')).toMatch(/4 июля/);
      document.querySelector('.ca-modal__ack-btn').click();
      await flushMicrotasks();

      expect(banner.shouldShowNutritionDot()).toBe(false);
      const ackedIds = window.HEYS.YandexAPI.ackCuratorChangelog.mock.calls[0][0].entryIds;
      expect(ackedIds).toHaveLength(2);
      expect(ackedIds).toEqual(expect.arrayContaining([
        '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
      ]));
    });

    it('does not put a day cue on a date without curator changes', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5()]));

      await banner.checkAndShow();

      expect(banner.getDayCue('2026-07-05')).toBeTruthy();
      expect(banner.getDayCue('2026-07-04')).toBeNull();
      expect(banner.getDayCue('2026-07-06')).toBeNull();
      expect(banner.openFromCue('2026-07-04')).toBe(false);
      expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
    });

    it('opens the day cue as a date-filtered sheet, not the full backlog', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5(), day4()]));

      await banner.checkAndShow();
      document.querySelector('.ca-modal__later-btn').click();
      expect(banner.openFromCue('2026-07-04')).toBe(true);

      expect(dateLabels()).toEqual(['4 июля']);
      expect(dateLabels().join(' ')).not.toMatch(/5 июля/);
    });

    it('clears the day cue after Понятно and does not reopen from it', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5()]));

      await banner.checkAndShow();
      document.querySelector('.ca-modal__ack-btn').click();
      await flushMicrotasks();

      expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
      expect(banner.getDayCue('2026-07-05')).toBeNull();
      expect(banner.getVisibleCue('2026-07-05')).toBeNull();
      expect(banner.shouldShowNutritionDot()).toBe(false);

      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
      expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
      expect(banner.openFromCue('2026-07-05')).toBe(false);
    });

    it('clears the acked day cue but keeps the nutrition dot while other days remain', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5(), day4()]));

      await banner.checkAndShow();
      await dismissSheetTwice();
      expect(banner.shouldShowNutritionDot()).toBe(true);
      expect(banner.getDayCue('2026-07-05')).toBeTruthy();
      expect(banner.getDayCue('2026-07-04')).toBeTruthy();

      expect(banner.openFromCue('2026-07-05')).toBe(true);
      expect(dateLabels()).toEqual(['5 июля']);
      document.querySelector('.ca-modal__ack-btn').click();
      await flushMicrotasks();

      expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
        entryIds: ['11111111-1111-4111-8111-111111111111'],
        untilTs: '2026-07-05T09:00:00.000Z',
      });
      expect(banner.shouldShowNutritionDot()).toBe(true);
      expect(banner.getDayCue('2026-07-05')).toBeNull();
      expect(banner.getVisibleCue('2026-07-05')).toMatchObject({
        date: '2026-07-04',
        title: 'Куратор обновил 4 июля',
      });
      expect(banner.getDayCue('2026-07-04')).toBeTruthy();
      expect(banner.getDayCue('2026-07-06')).toBeNull();

      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
      expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();

      banner.openFromTab();
      expect(document.querySelector('.ca-modal-backdrop')).toBeTruthy();
      expect(dateLabels()).toEqual(['4 июля']);
    });

    it('shows a same-day cue when navigating to the edited date', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day4()]));

      await banner.checkAndShow();
      document.querySelector('.ca-modal__later-btn').click();

      expect(banner.getDayCue('2026-07-05')).toBeNull();
      expect(banner.getVisibleCue('2026-07-04')).toMatchObject({
        date: '2026-07-04',
        title: 'Куратор обновил этот день',
      });
    });

    it('on a day without edits points the in-tab row at the latest edited date', async () => {
      const banner = loadBanner();
      window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([day5(), day4()]));

      await banner.checkAndShow();
      document.querySelector('.ca-modal__later-btn').click();

      expect(banner.getVisibleCue('2026-07-05')?.title).toBe('Куратор обновил этот день');
      expect(banner.getVisibleCue('2026-07-06')).toMatchObject({
        date: '2026-07-05',
        title: 'Куратор обновил 5 июля',
      });
      expect(banner.getVisibleCue('2026-07-03')).toMatchObject({
        date: '2026-07-05',
        title: 'Куратор обновил 5 июля',
      });

      expect(banner.openFromCue(banner.getVisibleCue('2026-07-06').date)).toBe(true);
      expect(dateLabels()).toEqual(['5 июля']);
      expect(dateLabels().join(' ')).not.toMatch(/4 июля/);
    });
  });
});
