#!/usr/bin/env node
// PreToolUse(Bash) hook — блокирует `git push` / push-and-watch.sh когда
// команду пытается выполнить SUBAGENT (вызванный через Agent tool).
// Главная сессия пользователя не задета — push разрешён.
//
// Зачем: subagent compliance с правилом «не пушить без явной команды»
// слабее основной сессии. Зафиксировано 2 инцидента 2026-05-31 (один
// subagent запушил после Task 2 cleanup без согласования; впервые — ещё
// 2026-05-28). Push виден другим клиентам, откатить дорого → hard-block
// единственно правильный layer (см. user CLAUDE.md "Hook vs text rule":
// data loss / outward-facing failure mode → hook, не текстовое правило).
//
// Spec: читает JSON со stdin, ищет agent_id (subagent marker) +
// tool_input.command (что собираются запускать). Exit 2 + stderr message
// → Claude видит блок, не может обойти.

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Malformed input — не блокируем (fail-open для defensive use).
    process.exit(0);
  }

  const agentId = payload?.agent_id;
  const command = String(payload?.tool_input?.command || '');

  // Нет agent_id = главная сессия → всегда разрешаем.
  if (!agentId) {
    process.exit(0);
  }

  // Паттерны push'а. Грануляция: git push в любой форме + локальный
  // wrapper push-and-watch.sh (он внутри делает git push + ждёт CI).
  const pushPatterns = [
    /\bgit\s+push\b/,
    /push-and-watch\.sh/,
  ];
  const isPush = pushPatterns.some((rx) => rx.test(command));
  if (!isPush) {
    process.exit(0);
  }

  // Блокируем.
  process.stderr.write(
    `❌ Subagent push заблокирован.\n` +
    `   Subagent'ы не могут запускать 'git push' / push-and-watch.sh.\n` +
    `   Push разрешён только из главной сессии после явной команды\n` +
    `   пользователя («пуш»/«push»/«запушь»/«отправь»/«выкатывай»).\n` +
    `\n` +
    `   Что делать: закоммить изменения, отчитайся главной сессии\n` +
    `   «закоммитил X, Y, Z. Пушить?» и остановись.\n` +
    `\n` +
    `   Hook: scripts/hooks/block-subagent-push.mjs\n`
  );
  process.exit(2);
});
