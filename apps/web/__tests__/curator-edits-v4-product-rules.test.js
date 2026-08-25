// @vitest-environment jsdom
/**
 * Смоук-симуляция трёх сквозных правил продукта против канваса
 * curator-edits.v4.dc.html, строки:
 *   - «safe-area и кнопка назад» (врезки листа)
 *   - «язык, выделение, часовой пояс»: «комментарий куратора выделяется и
 *     копируется, названия правок и сводка даты — нет»
 *   - «повторный тап и поворот»: «защита стоит на „Понятно“ — вторая отметка
 *     о прочтении не пишется»
 *
 * Живые условия человек собрать не может: два быстрых тапа по «Понятно» с
 * реальной сетью между ними, реальный CSS-каскад для user-select и
 * calc(var(--safe-area-*)) — это работа фейковых таймеров и jsdom, не ручного
 * QA на телефоне.
 */
import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modulePath = path.resolve(__dirname, '../heys_curator_actions_banner_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const CA_MODAL_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css'),
  'utf8',
);
const originalConsoleInfo = console.info;

function createEntry(id, createdAt, actions = [{ type: 'meal_item_added', meal_label: 'Обед', count: 7 }]) {
  return {
    id,
    curator_id: '22222222-2222-4222-8222-222222222222',
    keys: ['heys_dayv2_2026-07-05'],
    created_at: createdAt,
    actions: { actions },
  };
}

function response(entries, serverNow = '2026-07-05T10:00:00.000Z') {
  return {
    ok: true,
    since: '2026-07-01T00:00:00.000Z',
    server_now: serverNow,
    has_more: false,
    entries,
  };
}

function loadBanner() {
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

/** Кладёт настоящий CSS модуля в документ — getComputedStyle отвечает то же,
 * что ответил бы браузер для свойств, которые happy-dom/jsdom умеют считать
 * (user-select — умеет; calc(var(--safe-area-*)) — нет, поэтому врезки
 * сверяются текстом объявления). */
function mountCss() {
  const style = document.createElement('style');
  style.textContent = CA_MODAL_CSS;
  document.head.appendChild(style);
  return style;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

describe('лист правок куратора · правила продукта (curator-edits.v4.dc.html)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T10:00:00.000Z'));
    document.body.innerHTML = '';
    document.head.querySelectorAll('style').forEach((s) => s.remove());
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.querySelectorAll('style').forEach((s) => s.remove());
    window.HEYS = undefined;
    console.info = originalConsoleInfo;
  });

  // ── Врезки экрана (safe-area) ──

  it('подложка листа прижимается к нижней системной врезке, а не к краю стекла', () => {
    mountCss();
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(
      response([createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z')]),
    );

    return banner.checkAndShow().then(() => {
      const backdrop = document.querySelector('.ca-modal-backdrop');
      expect(backdrop).toBeTruthy();
      // Само правило совпало с живым узлом (иначе borderRadius был бы дефолтным).
      expect(getComputedStyle(backdrop).position).toBe('fixed');
      expect(getComputedStyle(document.querySelector('.ca-modal')).borderRadius).toBe('26px');

      // calc(var(--safe-area-*)) jsdom не резолвит в число — врезка сверяется
      // текстом объявления, откуда видно, что нижняя привязана к
      // --safe-area-bottom, а не к литералу и не к краю экрана.
      const backdropBlock = CA_MODAL_CSS.slice(
        CA_MODAL_CSS.indexOf('.ca-modal-backdrop {'),
        CA_MODAL_CSS.indexOf('.ca-modal-backdrop--visible {'),
      );
      expect(backdropBlock).toMatch(/padding:\s*12px 12px calc\(12px \+ var\(--safe-area-bottom\)\) 12px/);

      const modalBlock = CA_MODAL_CSS.slice(CA_MODAL_CSS.indexOf('.ca-modal {'), CA_MODAL_CSS.indexOf('.ca-modal__header {'));
      expect(modalBlock).toMatch(/max-height:\s*calc\(100dvh - 24px - var\(--safe-area-top\)\)/);
    });
  });

  // ── Выделение текста ──

  it('названия правок и сводка даты не выделяются (комментария куратора в этом листе нет)', () => {
    mountCss();
    const banner = loadBanner();
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(
      response([createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', [
        { type: 'meal_item_added', meal_name: 'Обед', count: 7 },
      ])]),
    );

    return banner.checkAndShow().then(() => {
      const itemCopy = document.querySelector('.ca-modal__item-copy');
      expect(itemCopy).toBeTruthy();
      // Дедуп собирает добавленные продукты в карточку приёма: заголовок —
      // название приёма, подзаголовок называет результат правки числом.
      expect(itemCopy.textContent).toContain('Обед');
      expect(itemCopy.textContent).toContain('7 продуктов');
      expect(getComputedStyle(itemCopy).userSelect).toBe('none');

      const dateRow = document.querySelector('.ca-modal__date');
      expect(dateRow).toBeTruthy();
      expect(getComputedStyle(dateRow).userSelect).toBe('none');
    });
  });

  // ── Повторный тап ──

  it('второй быстрый тап по «Понятно» уже не находит модалку — защита конструктивная, не таймером', () => {
    const banner = loadBanner();
    const entry = createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z');
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(response([entry]));

    return banner.checkAndShow().then(async () => {
      const ackBtn = document.querySelector('.ca-modal__ack-btn');
      expect(ackBtn).toBeTruthy();

      // Реальный второй тап бьёт по координатам экрана заново, а не по
      // сохранённой JS-ссылке: removeExistingModal() внутри ackShown снимает
      // модалку синхронно с первым тапом, поэтому второй тап ищет кнопку
      // заново и не находит её — некуда бить.
      ackBtn.click();
      expect(document.querySelector('.ca-modal__ack-btn')).toBeNull();
      document.querySelector('.ca-modal__ack-btn')?.click();
      await flushMicrotasks();

      expect(document.querySelector('.ca-modal-backdrop')).toBeFalsy();
      expect(window.HEYS.YandexAPI.ackCuratorChangelog).toHaveBeenCalledTimes(1);
    });
  });

  // ── Свёртка дня по типам (строка «очень много правок за день») ──

  it('строки свёртки по типам и раскрытые под ними правки держат правило «область нажатия ≥ 44»', () => {
    mountCss();
    const banner = loadBanner();
    const actions = [
      ...Array.from({ length: 12 }, (_, i) => ({
        type: 'meal_added',
        meal_id: `meal_${i}`,
        meal_label: `Приём ${i + 1}`,
        time: `0${(i % 9) + 1}:1${i % 9}`,
        items: [{ name: `Продукт ${i + 1}` }],
      })),
      { type: 'training_added', kind: 'силовая', duration_min: 45, time: '08:30' },
    ];
    window.HEYS.YandexAPI.getMyCuratorChangelogSince.mockResolvedValue(
      response([createEntry('11111111-1111-4111-8111-111111111111', '2026-07-05T09:00:00.000Z', actions)]),
    );

    return banner.checkAndShow().then(() => {
      const toggle = document.querySelector('[data-ca-expand-type]');
      expect(toggle).toBeTruthy();
      expect(getComputedStyle(toggle).minHeight).toBe('44px');
      expect(getComputedStyle(toggle).borderRadius).toBe('16px');

      toggle.click();
      const member = document.querySelector('.ca-modal__type-members > li > .ca-modal__item');
      expect(member).toBeTruthy();
      // Отступ вложенности есть, но высота тач-таргета не съедена.
      // 26 px — из строки контракта: «вложенные строки с левым полем 26 px
      // вместо 13» (15-я сборка; прежде тест держал 24).
      expect(getComputedStyle(member).minHeight).toBe('44px');
      expect(getComputedStyle(member).paddingLeft).toBe('26px');
      // Список раскрылся внутри того же листа.
      expect(document.querySelectorAll('.ca-modal-backdrop')).toHaveLength(1);
    });
  });
});
