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
    expect(document.querySelector('.ca-modal__header-title')?.textContent).toBe('Куратор Антон обновил твой дневник');
    expect(document.querySelector('.ca-modal__curator-signature')).toBeFalsy();
    expect(document.querySelector('.ca-modal__show-btn')?.textContent).toBe('Показать');
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
    expect(document.querySelector('.ca-modal__summary')?.textContent).toBe('+1 тренировка');
    expect(document.querySelector('.ca-modal__content')?.textContent).toContain('Тренировка: Кардио · 60 мин (19:50)');
  });

  it('renders the same training only once when it appears in multiple changelog entries', async () => {
    const action = { type: 'training_added', kind: 'Кардио', duration_min: 60, time: '19:50' };
    const first = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:55:00.000Z', [action]);
    const second = createEntry('33333333-3333-4333-8333-333333333333', '2026-07-05T10:00:00.000Z', [action]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([second, first]));

    await banner.checkAndShow();

    expect(document.querySelector('.ca-modal__summary')?.textContent).toBe('+1 тренировка');
    const trainingCards = Array.from(document.querySelectorAll('.ca-modal__item-text'))
      .filter((node) => node.textContent?.includes('Тренировка: Кардио · 60 мин (19:50)'));
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

    expect(document.querySelector('.ca-modal__summary')?.textContent).toBe('+3 продукта');
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
    expect(document.querySelector('.ca-modal__summary')?.textContent).toBe('+2 приёма пищи');
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
    expect(Array.from(document.querySelectorAll('.ca-modal__date')).map(node => node.textContent)).toEqual([
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

  it('opens selected change target without acking', async () => {
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
      { type: 'meal_item_changed', date: '2026-07-05', meal_id: 'meal_1', item_id: 'item_1', meal_label: 'Обед', from_grams: 80, to_grams: 100 },
    ]);
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));
    const target = document.createElement('div');
    target.setAttribute('data-item-id', 'item_1');
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    await banner.checkAndShow();
    document.querySelector('.ca-modal__show-btn').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);

    expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
    expect(window.HEYS.YandexAPI.ackCuratorChangelog).not.toHaveBeenCalled();
    expect(window.HEYS.ui.setSelectedDate).toHaveBeenCalledWith('2026-07-05');
    expect(window.HEYS.ui.switchTab).toHaveBeenCalledWith('diary');
    expect(sessionStorage.getItem('heys_curator_review_target_date')).toBe('2026-07-05');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

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
      [{ type: 'weight_set' }, 'stats', '[data-curator-target="weight"]'],
      [{ type: 'sleep_set' }, 'stats', '[data-curator-target="sleep"]'],
      [{ type: 'profile_changed' }, 'user', '[data-curator-target="profile"]'],
      [{ type: 'norms_changed' }, 'user', '#profile-section-norms'],
      [{ type: 'planning_changed' }, 'tasks', '[data-curator-target="planning"]'],
    ];

    for (const [action, tab, selector] of cases) {
      const target = build(entry, action);
      expect(target.tab).toBe(tab);
      expect(target.selectors[0]).toBe(selector);
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
      '../heys_user_tab_impl_v1.js',
      '../heys_planning_tasks_v1.js',
    ].map((relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')).join('\n');

    for (const marker of [
      "id: 'water-card'",
      "'data-curator-target': 'steps'",
      "'data-curator-target': 'training'",
      "'data-curator-target': 'activity'",
      "'data-curator-target': 'weight'",
      "'data-curator-target': 'sleep'",
      "id: 'diary-heading'",
      "'data-curator-target': 'profile'",
      "id: 'norms'",
      "'data-curator-target': 'planning'",
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

  it('acknowledges and opens the primary training with scroll and pulse', async () => {
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
    document.querySelector('.ca-modal__ack-btn').click();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);

    expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledWith({
      entryIds: ['11111111-1111-4111-8111-111111111111'],
      untilTs: '2026-07-05T09:00:00.000Z',
    });
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

    expect(window.HEYS.ui.switchTab).toHaveBeenCalledWith('diary');
    expect(waterCard.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(waterCard.classList.contains('ca-scroll-highlight')).toBe(true);
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
});
