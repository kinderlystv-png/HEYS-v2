/** Stand · gamification — из gamification-v4-achievement-row / polosa4-task104. */
export default {
  zone: 'gamification',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/000-base-and-gamification.css',
  ],
  html: `
    <div class="game-v4-sheet">
      <div class="game-v4-sheet__hero">
        <span class="game-v4-sheet__hero-muted">Уровень 4</span>
        <span class="game-v4-sheet__card-meta">1 240 XP</span>
      </div>
      <div class="game-v4-sheet__ach-row is-unlocked">
        <span class="game-v4-sheet__ach-medal"></span>
        <div class="game-v4-sheet__ach-body">
          <div class="game-v4-sheet__ach-head">
            <span class="game-v4-sheet__ach-name">Неделя подряд</span>
            <span class="game-v4-sheet__ach-xp">+50 XP</span>
          </div>
          <span class="game-v4-sheet__ach-cond">7 дней</span>
        </div>
      </div>
      <div class="game-v4-sheet__ach-row is-locked">
        <span class="game-v4-sheet__ach-medal"></span>
        <div class="game-v4-sheet__ach-body">
          <div class="game-v4-sheet__ach-head">
            <span class="game-v4-sheet__ach-name">Месяц без пропусков</span>
            <span class="game-v4-sheet__ach-xp">+200 XP</span>
          </div>
        </div>
      </div>
      <p class="game-v4-sheet__footnote">XP начисляется после подтверждения дня</p>
    </div>
  `,
  watch: {
    'Лист прогресса': '.game-v4-sheet',
    'Герой muted': '.game-v4-sheet__hero-muted',
    'Мета карточки': '.game-v4-sheet__card-meta',
    'Строка достигнуто': '.game-v4-sheet__ach-row.is-unlocked',
    'Медаль достигнуто': '.game-v4-sheet__ach-row.is-unlocked .game-v4-sheet__ach-medal',
    'Название достижения': '.game-v4-sheet__ach-name',
    'Условие достижения': '.game-v4-sheet__ach-cond',
    'Награда XP': '.game-v4-sheet__ach-xp',
    'Строка недостигнуто': '.game-v4-sheet__ach-row.is-locked',
    'Сноска': '.game-v4-sheet__footnote',
  },
};
