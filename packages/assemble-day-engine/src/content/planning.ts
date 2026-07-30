import type { WeeklyRule, WeeklyRulePresetId } from '../types.js';

export const WEEKLY_RULE_PRESETS: ReadonlyArray<{
  id: WeeklyRulePresetId;
  kind: WeeklyRule['kind'];
  title: string;
  summary: string;
  source: string;
  tradeoff: string;
}> = [
  { id: 'protect_sleep', kind: 'protected_window', title: 'Закончить день вовремя', summary: 'Сохранить вечернюю границу на каждом дне.', source: 'защищённое вечернее окно', tradeoff: 'Поздняя работа становится дольше и рискованнее.' },
  { id: 'family_anchor', kind: 'protected_window', title: 'Сохранить семейные вечера', summary: 'Не отдавать семейные окна новым задачам.', source: 'два семейных окна', tradeoff: 'Работа в семейном окне усиливает риск договорённостей.' },
  { id: 'work_blocks', kind: 'work_boundary', title: 'Защитить рабочие блоки', summary: 'Оставить рабочее время на проект до срока.', source: 'рабочие окна до 18:00', tradeoff: 'Другие дела внутри рабочего окна усиливают давление.' },
];
