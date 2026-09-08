/** Stand · tab-activity — из tab-activity-v4-current-contract / activity-zero-and-calendar-grid. */
export default {
  zone: 'tab-activity',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/731-ui-v4-activity.css',
    'styles/modules/750-strength-builder.css',
  ],
  html: `
    <div class="activity-v4">
      <section class="activity-v4-steps">
        <span class="activity-v4-steps__value activity-v4-steps__value--zero">0</span>
        <span class="activity-v4-steps__kcal activity-v4-steps__kcal--zero">0 ккал</span>
        <span class="activity-v4-steps__note">шаги не синхронизированы</span>
      </section>
      <div class="activity-v4-today__row activity-v4-today__row--action">
        <span class="activity-v4-today__name">Тренировки</span>
        <span class="activity-v4-today__sub">силовая</span>
        <span class="activity-v4-today__value activity-v4-today__value--chevron">45 мин</span>
      </div>
      <div class="activity-v4-sheet">
        <span class="activity-v4-sheet__sub">Подробнее о нагрузке</span>
      </div>
      <div class="activity-v4-program">
        <div class="sb-plan-card">
          <span class="sb-plan-badge">сегодня</span>
          <button type="button" class="sb-btn sb-plan-cta is-accent">Начать</button>
        </div>
      </div>
    </div>
  `,
  watch: {
    'Корень активности': '.activity-v4',
    'Шаги ноль': '.activity-v4-steps__value--zero',
    'Ккал шагов ноль': '.activity-v4-steps__kcal--zero',
    'Примечание шагов': '.activity-v4-steps__note',
    'Строка сегодня': '.activity-v4-today__row--action',
    'Название строки': '.activity-v4-today__name',
    'Значение строки': '.activity-v4-today__value--chevron',
    'Лист активности': '.activity-v4-sheet',
    'Подзаголовок листа': '.activity-v4-sheet__sub',
    'Карточка плана': '.sb-plan-card',
    'CTA плана': '.sb-plan-cta',
  },
};
