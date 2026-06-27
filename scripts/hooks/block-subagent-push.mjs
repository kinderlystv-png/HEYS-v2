#!/usr/bin/env node
// PreToolUse(Bash) hook — блокирует push/shipping/integration commands когда
// команду пытается выполнить SUBAGENT (вызванный через Agent tool).
// Главная сессия пользователя не задета — push/shipping разрешены.
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

  // Паттерны push/shipping/integration. Грануляция: git push в любой форме, локальный
  // wrapper push-and-watch.sh, pnpm push:* и pnpm ship (ship по умолчанию
  // commit+push+watch), а также pnpm agents:integrate (merge/build/release commits).
  const pushPatterns = [
    /\bgit\s+push\b/,
    /push-and-watch\.sh/,
    /\bpnpm\s+push:[\w:-]+\b/,
    /\bpnpm\s+ship\b/,
    /\bpnpm\s+agents:integrate\b/,
  ];
  const isPush = pushPatterns.some((rx) => rx.test(command));
  if (!isPush) {
    process.exit(0);
  }

  // Блокируем.
  process.stderr.write(
    `❌ Subagent push заблокирован.\n` +
    `   Subagent'ы не могут запускать git push / pnpm push:* / pnpm ship / pnpm agents:integrate.\n` +
    `   Push/shipping/integration разрешены только из главной сессии после явной команды\n` +
    `   пользователя («пуш»/«push»/«запушь»/«отправь»/«выкатывай»).\n` +
    `\n` +
    `   Что делать: если commit был явно разрешён — отчитайся главной сессии\n` +
    `   «закоммитил X, Y, Z. Пушить?»; иначе отчитайся без commit и остановись.\n` +
    `\n` +
    `   Hook: scripts/hooks/block-subagent-push.mjs\n`
  );
  process.exit(2);
});
