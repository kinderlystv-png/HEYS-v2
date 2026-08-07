'use strict';

/**
 * Облачко на сущности — тот же контракт, что POST /talk в board_server.py.
 * Dual-write: строка на карточке + пункт планёрки (если standup и не «агенту»).
 */

const tasks = require('./tasks');

const TALK_REF_RE = /^([\w\d-]+)\/([0-9a-f]{6})$/;
const STANDUP_HEAD_RE = /^-\s*\[([ xX])\]\s*(\d{4}-\d{2}-\d{2})\s*·\s*(.+)$/;
const TALK_DEV_KW = ['доска', 'планёрк', 'планерка', 'standup', 'board', 'облачко',
  'коннектор', 'стенограмм', 'задачник', 'heys-mcp', 'board_server', 'build_board'];

function parseRef(ref) {
  const clean = String(ref || '').trim().toLowerCase();
  const m = TALK_REF_RE.exec(clean);
  return m ? { project: m[1], hash: m[2], ref: clean } : null;
}

function talkCategory(projectKey, title, refText = '') {
  const blob = `${title || ''} ${refText || ''}`.toLowerCase();
  if (projectKey === 'heys' && TALK_DEV_KW.some((k) => blob.includes(k))) return 'разработка';
  return 'общее';
}

function talkStandupNote(comment) {
  const c = String(comment || '').trim();
  if (!c) return c;
  return c.startsWith('💬') ? c : `💬 ${c}`;
}

function mergeTalkNote(existingTalk, comment) {
  const parts = [];
  let right = String(existingTalk || '').trim();
  if (right.startsWith('💬')) right = right.slice(1).trim();
  if (right) {
    for (const p of right.split(/\s*;\s*/)) {
      let piece = p.trim();
      if (piece.startsWith('💬')) piece = piece.slice(1).trim();
      if (piece) parts.push(piece);
    }
  }
  let c = String(comment || '').trim();
  if (c.startsWith('💬')) c = c.slice(1).trim();
  if (c && !parts.includes(c)) parts.push(c);
  if (!parts.length) return '';
  return `💬 ${parts.join('; ')}`;
}

function appendTalkToStandupBody(body, comment) {
  let b = String(body || '').trim();
  const note = talkStandupNote(comment);
  if (b.includes('💬')) {
    const idx = b.indexOf('💬');
    const pre = b.slice(0, idx).replace(/[ —–\-;]+$/, '');
    const merged = mergeTalkNote(`💬 ${b.slice(idx + 1).trim()}`, comment);
    return pre ? `${pre} — ${merged}` : merged;
  }
  if (b.includes(' — ')) return `${b} — ${note}`;
  return `${b} — ${note}`;
}

function standupSectionRange(lines) {
  const head = lines.findIndex((l) => l.trim().toLowerCase().startsWith('## на планёрку'));
  if (head === -1) return null;
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) { end = i; break; }
  }
  return { head, end };
}

function findOpenStandupForRef(lines, ref) {
  const range = standupSectionRange(lines);
  if (!range) return null;
  for (let i = range.head + 1; i < range.end; i += 1) {
    const m = STANDUP_HEAD_RE.exec(lines[i].trim());
    if (!m || m[1].toLowerCase() === 'x') continue;
    if (tasks.standupItemRef(m[3]) === ref) return { index: i, match: m };
  }
  return null;
}

function standupTalkText(fileText, { ref, title, comment, category, today }) {
  const c = String(comment || '').trim();
  if (!c) return { ok: false, error: 'empty' };
  const note = talkStandupNote(c);
  const refClean = String(ref || '').trim().toLowerCase();
  const projectKey = refClean.split('/')[0] || '';
  const cat = category || talkCategory(projectKey, title, refClean);
  const catMark = cat === 'разработка' ? '[разработка] ' : '';
  const topic = (refClean && title) ? `${refClean} · ${title}` : (refClean || title);
  const lines = String(fileText || '').split('\n');

  if (!lines.some((l) => l.trim())) {
    const line = `- [ ] ${today} · ${catMark}${topic} — ${note}`;
    return { ok: true, text: `## На планёрку\n\n${line}\n`, action: 'created' };
  }

  let range = standupSectionRange(lines);
  if (!range) {
    const line = `- [ ] ${today} · ${catMark}${topic} — ${note}`;
    return { ok: true, text: [...lines, '', '## На планёрку', '', line, ''].join('\n'), action: 'created' };
  }

  if (refClean) {
    const hit = findOpenStandupForRef(lines, refClean);
    if (hit) {
      const body = appendTalkToStandupBody(hit.match[3].trim(), c);
      lines[hit.index] = `- [ ] ${hit.match[2]} · ${body}`;
      return { ok: true, text: lines.join('\n'), action: 'appended' };
    }
  }

  const line = `- [ ] ${today} · ${catMark}${topic} — ${note}`;
  let { end } = range;
  while (end > range.head + 1 && !lines[end - 1].trim()) end -= 1;
  lines.splice(end, 0, line);
  return { ok: true, text: lines.join('\n'), action: 'added' };
}

function insertTaskChildLine(text, taskLineIndex, childLine) {
  const lines = String(text || '').split('\n');
  let insertAt = taskLineIndex + 1;
  while (insertAt < lines.length) {
    const line = lines[insertAt];
    if (!line.trim()) break;
    if (!/^\s/.test(line)) break;
    insertAt += 1;
  }
  lines.splice(insertAt, 0, `  ${childLine}`);
  return lines.join('\n');
}

async function appendTaskTalk({ readFile, writeFile, project, hash, comment, toAgent, today }) {
  const path = `projects/${project}.md`;
  const file = await readFile(path);
  const found = tasks.findTaskByHash(file, hash);
  if (!found) return { ok: false, error: 'not_found' };
  const line = toAgent
    ? `для агента: ${comment} ^${today}`
    : `обсудить: ${comment} ^${today}`;
  const next = insertTaskChildLine(file.text, found.line, line);
  const saved = await writeFile(file, next);
  return { ok: true, path: saved.path, title: found.parsed.title };
}

async function entityTalk(data, { readFile, writeFile, nowMs, ToolError }) {
  const action = String(data.action || '').trim().toLowerCase();
  if (action) {
    throw new ToolError('unsupported_action', `Действие «${action}» в PWA пока не поддерживается.`);
  }

  const comment = String(data.comment || '').trim();
  if (!comment) throw new ToolError('empty_comment', 'Нужен текст комментария.');

  let audience = String(data.audience || 'me').trim().toLowerCase();
  const toAgent = ['agent', 'агент', 'агенту'].includes(audience);
  let toStandup = data.standup !== false && data.standup !== 'false' && data.standup !== 0;
  if (toAgent) toStandup = false;

  const today = tasks.taskDay(nowMs);
  const refParsed = parseRef(data.ref);
  const label = String(data.label || '').trim().replace(/\s+/g, ' ');

  if (refParsed) {
    const taskRes = await appendTaskTalk({
      readFile, writeFile,
      project: refParsed.project,
      hash: refParsed.hash,
      comment,
      toAgent,
      today,
    });
    if (!taskRes.ok) throw new ToolError('task_not_found', 'Задача не найдена.');

    let standupAction = null;
    if (toStandup) {
      const standupFile = await readFile(tasks.STANDUP_PATH);
      const title = label || taskRes.title || '';
      const st = standupTalkText(standupFile.text, {
        ref: refParsed.ref,
        title,
        comment,
        today,
      });
      if (!st.ok) throw new ToolError('standup_failed', st.error || 'standup_failed');
      await writeFile(standupFile, st.text);
      standupAction = st.action;
    }

    return {
      ok: true,
      ref: refParsed.ref,
      task: taskRes.path,
      standup: toStandup,
      standup_action: standupAction,
      audience: toAgent ? 'agent' : 'me',
    };
  }

  const entity = String(data.entity || '').trim().toLowerCase();
  if (entity === 'slot' && data.date && data.start) {
    const dayPath = `days/${data.date}.md`;
    const file = await readFile(dayPath);
    const lines = String(file.text || '').split('\n');
    const slots = tasks.parseSlots(file.text, { dayStart: tasks.BOARD_DAY_START });
    const wantTitle = String(data.title || label || '').trim();
    const hits = slots.filter((s) => s.start === data.start && (
      !wantTitle || tasks.slotCoreTitle(s.title) === tasks.slotCoreTitle(wantTitle)
    ));
    if (hits.length !== 1) throw new ToolError('slot_not_found', 'Слот не найден однозначно.');
    const slot = hits[0];
    const insertAt = Number.isInteger(slot.line) ? slot.line + 1 : lines.length;
    lines.splice(insertAt, 0, `  обсудить: ${comment} ^${today}`);
    await writeFile(file, lines.join('\n'));

    let slotRef = null;
    const parts = String(slot.title || '').split('·').map((p) => p.trim());
    const tail = parts[parts.length - 1];
    if (TALK_REF_RE.test(tail)) slotRef = tail.toLowerCase();

    if (toStandup) {
      const standupFile = await readFile(tasks.STANDUP_PATH);
      const st = standupTalkText(standupFile.text, {
        ref: slotRef,
        title: label || tasks.slotCoreTitle(slot.title),
        comment,
        today,
      });
      if (!st.ok) throw new ToolError('standup_failed', st.error || 'standup_failed');
      await writeFile(standupFile, st.text);
    }

    return { ok: true, entity: 'slot', date: data.date, standup: toStandup };
  }

  throw new ToolError('bad_target', 'Нужен ref задачи (проект/хэш) или entity: slot с date и start.');
}

module.exports = {
  parseRef,
  entityTalk,
  standupTalkText,
  insertTaskChildLine,
};
