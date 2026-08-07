'use strict';

/**
 * Галочки слотов и привычек с PWA-доски.
 * Семантика та же, что у desktop board / tasks_close_day / tasks_habit.
 */

const tasks = require('./tasks');

function resolveDate(raw, today) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text || text === 'сегодня' || text === 'today') return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const err = new Error(`invalid_date:${text}`);
    err.code = 'invalid_date';
    throw err;
  }
  return text;
}

/**
 * Toggle / set слот «состоялось» в days/<date>.md.
 * Body: { date?, start|at, title?, done? } — без done переключает.
 */
async function slotDone(args = {}, { readFile, writeFile, ToolError, today }) {
  const date = resolveDate(args.date, today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ToolError('invalid_date', `Дата «${args.date}» не в формате ГГГГ-ММ-ДД.`);
  }

  const at = String(args.start || args.at || '').trim() || null;
  const title = String(args.title || '').trim() || null;
  if (!at && !title) {
    throw new ToolError('slot_query_required', 'Нужны start (время начала) и/или title слота.');
  }

  const file = await readFile(`days/${date}.md`);
  const all = tasks.parseSlots(file.text);
  const listing = all.length
    ? all.map((s) => `${s.start}–${s.end} ${s.title}`).join('; ')
    : 'в этом дне вообще ничего не стоит';

  let found;
  try {
    found = tasks.findSlotsIn(file.text, { at, title });
  } catch (e) {
    throw new ToolError('invalid_time', `Время «${at}» не в формате ЧЧ:ММ.`);
  }
  if (!found.length) {
    throw new ToolError(
      'slot_not_found',
      `В ${date} нет слота «${[at, title].filter(Boolean).join(' ')}». Что там стоит: ${listing}.`,
    );
  }
  if (found.length > 1) {
    throw new ToolError(
      'slot_ambiguous',
      `Под «${[at, title].filter(Boolean).join(' ')}» в ${date} подходит ${found.length}: ${found.map((s) => `${s.start}–${s.end} ${s.title}`).join('; ')}.`,
    );
  }

  const slot = found[0];
  const wantDone = typeof args.done === 'boolean' ? args.done : !slot.done;
  if (slot.done === wantDone) {
    return {
      text: wantDone
        ? `Слот ${slot.start} «${slot.title}» уже отмечен состоявшимся.`
        : `Слот ${slot.start} «${slot.title}» уже без отметки.`,
      structured: {
        date,
        from: slot.start,
        to: slot.end,
        title: slot.title,
        done: wantDone,
        already: true,
        rev: file.rev,
      },
    };
  }

  const next = tasks.markSlotDone(file.text, slot.line, wantDone);
  const saved = await writeFile(file, next);
  return {
    text: wantDone
      ? `Отметил состоявшимся: ${slot.start}–${slot.end} ${slot.title}.`
      : `Снял отметку: ${slot.start}–${slot.end} ${slot.title}.`,
    structured: {
      date,
      from: slot.start,
      to: slot.end,
      title: slot.title,
      done: wantDone,
      already: false,
      rev: saved.rev,
    },
  };
}

/**
 * Отметить / снять привычку за день в habits.md.
 * Body: { habit, date?, done? } — без done: если уже есть дата — снять, иначе отметить.
 */
async function habitDone(args = {}, { readFile, writeFile, ToolError, today }) {
  const habit = String(args.habit || '').trim();
  if (!habit) {
    throw new ToolError('habit_required', 'Нужно название привычки.');
  }
  const date = resolveDate(args.date, today);

  const file = await readFile('habits.md');
  const parsed = [];
  for (const line of String(file.text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ') || !trimmed.includes('|')) continue;
    const cut = trimmed.slice(2);
    const pipe = cut.indexOf('|');
    const name = cut.slice(0, pipe).trim();
    const days = cut.slice(pipe + 1).split(',').map((d) => d.trim()).filter(Boolean);
    parsed.push({ name, days });
  }

  const needle = habit.toLowerCase();
  const matches = parsed.filter((h) => h.name.toLowerCase().includes(needle));
  if (!matches.length) {
    throw new ToolError('habit_not_found', `Привычка «${habit}» не найдена в habits.md.`);
  }
  if (matches.length > 1) {
    const exact = matches.filter((h) => h.name.toLowerCase() === needle);
    if (exact.length !== 1) {
      throw new ToolError(
        'habit_ambiguous',
        `Под «${habit}» подходит ${matches.length}: ${matches.map((h) => h.name).join(', ')}.`,
      );
    }
  }
  const hit = matches.length === 1
    ? matches[0]
    : matches.find((h) => h.name.toLowerCase() === needle);

  const isDone = hit.days.includes(date);
  const wantDone = typeof args.done === 'boolean' ? args.done : !isDone;

  if (wantDone === isDone) {
    return {
      text: wantDone
        ? `«${hit.name}» за ${date} уже отмечена.`
        : `«${hit.name}» за ${date} уже без отметки.`,
      structured: {
        habit: hit.name,
        date,
        done: wantDone,
        already: true,
        rev: file.rev,
      },
    };
  }

  let result;
  try {
    result = wantDone
      ? tasks.markHabit(file.text, hit.name, date)
      : tasks.unmarkHabit(file.text, hit.name, date);
  } catch (e) {
    throw new ToolError('habit_not_found', `Привычка «${habit}» не найдена в habits.md: ${e.message}`);
  }

  if (result.already) {
    return {
      text: wantDone
        ? `«${result.habit}» за ${date} уже отмечена.`
        : `«${result.habit}» за ${date} уже без отметки.`,
      structured: {
        habit: result.habit,
        date,
        done: wantDone,
        already: true,
        rev: file.rev,
      },
    };
  }

  const saved = await writeFile(file, result.text);
  return {
    text: wantDone
      ? `Отметил «${result.habit}» за ${date}.`
      : `Снял отметку «${result.habit}» за ${date}.`,
    structured: {
      habit: result.habit,
      date,
      done: wantDone,
      already: false,
      rev: saved.rev,
    },
  };
}

module.exports = {
  slotDone,
  habitDone,
};
