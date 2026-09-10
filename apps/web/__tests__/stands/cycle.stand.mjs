/** Stand · cycle — из cycle-insight-balance / cycle-v4-canvas-razbor. */
export default {
  zone: 'cycle',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/500-pwa-and-offline.css',
  ],
  html: `
    <div class="cycle-card-v4 cycle-card-v4--filled">
      <div class="cycle-card-v4__head">
        <span class="cycle-card-v4__title">День 22</span>
        <span class="cycle-card-v4__phase">Вторая половина</span>
        <button type="button" class="cycle-card-v4__action">Изменить</button>
      </div>
      <span class="cycle-card-v4__norm-pill">+5 %</span>
      <div class="cycle-card-v4__insight">
        <div class="cycle-card-v4__insight-title">Норма выше на 5 %</div>
        <div class="cycle-card-v4__insight-text">Вторая половина — норма, а не срыв</div>
      </div>
      <div class="cycle-card-v4__days">
        <button type="button" class="cycle-card-v4__day-btn is-active">22</button>
        <button type="button" class="cycle-card-v4__day-btn">23</button>
      </div>
      <div class="cycle-card-v4__date-confirm-sub">Подтвердите день цикла</div>
    </div>
  
    <!-- Пустая карточка: дня ещё не указывали. -->
    <div class="cycle-card-v4 cycle-card-v4--empty">
      <div class="cycle-card-v4__head">
        <span class="cycle-card-v4__title">Особый период</span>
      </div>
      <button type="button" class="cycle-card-v4__action">Указать день</button>
    </div>

    <!-- Панель пометки: карточка «Особые дни» в шаге отдыха. -->
    <div class="mc-rest-cycle-week-card">
      <div class="mc-rest-cycle-week-head">
        <div class="mc-rest-cycle-week-title">Особые дни</div>
        <div class="mc-rest-cycle-week-badge">День 3</div>
      </div>
      <div class="mc-rest-cycle-week-hint">Отметьте день — нормы подстроятся сами</div>
      <div class="mc-rest-cycle-days" role="radiogroup" aria-label="Какой день">
        <button type="button" role="radio" class="mc-rest-cycle-day-btn" aria-checked="false">1</button>
        <button type="button" role="radio" class="mc-rest-cycle-day-btn is-on" aria-checked="true">3</button>
        <button type="button" role="radio" class="mc-rest-cycle-day-btn" aria-checked="false">5</button>
      </div>
      <div class="mc-rest-cycle-week-actions">
        <button type="button" class="mc-rest-cycle-btn mc-rest-cycle-btn--secondary">Закрыть</button>
        <button type="button" class="mc-rest-cycle-btn mc-rest-cycle-btn--primary">Верно</button>
      </div>
    </div>

    <!-- Дни закончились раньше срока. -->
    <div class="mc-rest-row mc-rest-row--cycle mc-rest-row--cycle-ended">
      <div>
        <div class="mc-rest-card-title">Особые дни</div>
        <div class="mc-rest-card-hint mc-rest-card-hint--muted">Закончились на 4 день</div>
        <div class="mc-rest-cycle-ended-note">Нормы дальше идут по счёту фаз — влияние на организм не кончается вместе с днями.</div>
      </div>
    </div>
`,
  watch: {
    'Пустая карточка': '.cycle-card-v4--empty',
    'Указать день': '.cycle-card-v4--empty .cycle-card-v4__action',
    'Панель пометки': '.mc-rest-cycle-week-card',
    'Заголовок панели': '.mc-rest-cycle-week-title',
    'Пилюля дня': '.mc-rest-cycle-week-badge',
    'Подсказка панели': '.mc-rest-cycle-week-hint',
    'День не выбран': '.mc-rest-cycle-day-btn:not(.is-on)',
    'День выбран': '.mc-rest-cycle-day-btn.is-on',
    'Кнопка «Верно»': '.mc-rest-cycle-btn--primary',
    'Кнопка «Закрыть»': '.mc-rest-cycle-btn--secondary',
    'Дни закончились': '.mc-rest-row--cycle-ended',
    'Сноска о фазах': '.mc-rest-cycle-ended-note',
    'Карточка цикла': '.cycle-card-v4--filled',
    'Заголовок дня': '.cycle-card-v4__title',
    'Фаза': '.cycle-card-v4__phase',
    'Действие': '.cycle-card-v4__action',
    'Пометка нормы': '.cycle-card-v4__norm-pill',
    'Заголовок инсайта': '.cycle-card-v4__insight-title',
    'Текст инсайта': '.cycle-card-v4__insight-text',
    'Активный день': '.cycle-card-v4__day-btn.is-active',
    'Подпись подтверждения': '.cycle-card-v4__date-confirm-sub',
  },
};
