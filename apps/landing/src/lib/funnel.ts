// funnel.ts — события воронки лендинга.
//
// Имена событий те же, что у бота HEYS Старт (`маркетинг/17`), плюс
// `entry: 'landing'`: воронка «бот» и воронка «лендинг» должны читаться одним
// запросом, а не склеиваться руками. Список открытый — на сервере
// `funnel_events.event_type` без CHECK ровно по этой причине.
//
// Куда события попадают. Отдельного эндпойнта событий у лендинга нет и по
// решению владельца (2026-08-08) не заводится: след воронки уезжает полями
// внутри самой заявки — одним пакетом вместе с согласием. Поэтому здесь события
// копятся в памяти вкладки и отдаются `funnelTrail()` в момент отправки формы.
// `window.heysTrack` — точка расширения: если на странице появится свой
// приёмник (например, серверный сбор шагов), он получит те же события сразу.
//
// В событиях не должно быть ничего личного: только имя шага, время и код
// сегмента. Содержание ответов квиза уходит отдельно и только вместе с
// согласием (`17`, реестр данных).

declare global {
  interface Window {
    heysTrack?: (event: Record<string, unknown>) => void;
  }
}

export type FunnelEventName = 'quiz_start' | 'quiz_complete' | 'week_request';

export interface FunnelPayload {
  /** Код сегмента квиза — обезличенный, из `quizModel`. */
  segment?: string;
  /** Была ли заявка оставлена после разбора. */
  quiz?: boolean;
}

/** След воронки в том виде, в каком он уезжает вместе с заявкой. */
export interface FunnelStep extends FunnelPayload {
  name: FunnelEventName;
  /** Миллисекунды от первого события вкладки — без абсолютных меток времени. */
  offset_ms: number;
}

const steps: FunnelStep[] = [];
let firstAt: number | null = null;

export function track(name: FunnelEventName, payload: FunnelPayload = {}): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (firstAt === null) firstAt = now;

  steps.push({ name, offset_ms: now - firstAt, ...payload });

  try {
    window.heysTrack?.({ name, entry: 'landing', ts: now, ...payload });
  } catch {
    /* чужой обработчик не должен ломать страницу */
  }
}

/** Копия следа для отправки. Пустой массив отдаём как `undefined`. */
export function funnelTrail(): FunnelStep[] | undefined {
  return steps.length > 0 ? steps.map((step) => ({ ...step })) : undefined;
}
