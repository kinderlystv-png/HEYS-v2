module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // ✨ Новая функциональность
        'fix', // 🐛 Исправление багов
        'docs', // 📚 Документация
        'style', // 💄 Стилистические изменения
        'refactor', // ♻️ Рефакторинг
        'perf', // ⚡ Улучшение производительности
        'test', // ✅ Тесты
        'build', // 📦 Сборка
        'ci', // 👷 CI/CD
        'chore', // 🔧 Рутинные задачи
        'revert', // ⏪ Откат изменений
        'release', // 🚀 Релиз
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-case': [2, 'always', 'lower-case'],
    // 2026-05-28: понижено level 2 → 1 (warn). Блокировка ACRONYMS (SQL, PIN,
    // RPC, API) в subject стоила нам ~1 retry/день. Style-проверка остаётся
    // как warning — не блокирует push, но напоминает.
    'subject-case': [1, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [1, 'always'],
    'body-max-line-length': [2, 'always', 100],
    'footer-leading-blank': [1, 'always'],
  },
};
