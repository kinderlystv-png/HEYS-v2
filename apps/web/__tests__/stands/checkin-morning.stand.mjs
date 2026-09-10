/** Stand · checkin-morning — из morning-checkin-v4-contract-geometry. */
export default {
  zone: 'checkin-morning',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/500-pwa-and-offline.css',
  ],
  html: `
    <div class="mc-modal mc-modal--daily">
      <div class="mc-header mc-header--nav">
        <button type="button" class="mc-header-btn mc-header-btn--back">
          <span class="mc-header-back-icon"></span>
        </button>
        <div class="mc-header-center">
          <div class="mc-daily-greeting-title">Доброе утро</div>
          <div class="mc-daily-greeting-date">7 августа</div>
        </div>
        <div class="mc-header-spacer"></div>
      </div>
      <div class="mc-step-content">
        <div class="mc-weight-step">
          <div class="mc-weight-kilo-card">
            <div class="mc-kilo-label">Килограммы</div>
            <div class="mc-wheel-value mc-wheel-value--current">73</div>
          </div>
        </div>
        <div class="mc-rest-step">
          <button type="button" class="mc-rest-row mc-rest-row--overdue">
            <div>
              <div class="mc-rest-card-title">Замеры</div>
              <div class="mc-rest-card-hint">Без обхвата виден только вес</div>
            </div>
            <span class="mc-rest-overdue-badge">14 дней</span>
            <span class="mc-rest-chevron mc-rest-chevron--accent">&rsaquo;</span>
          </button>
        </div>
      </div>
      <button type="button" class="mc-btn mc-daily-footer-primary mc-btn--primary">Дальше</button>
    </div>
  
    <!-- Шаг «Шаги»: обычный герой и герой при своей цели. -->
    <div class="mc-steps-step">
      <div class="mc-step-kicker">Шаги</div>
      <div class="mc-steps-hero">
        <span class="mc-steps-hero-value">8 400</span>
        <span class="mc-steps-unit">шагов</span>
      </div>
      <div class="mc-recorded-sub">Записано вчера</div>
      <div class="mc-steps-slider-container">
        <span class="mc-steps-advice-mark"></span>
      </div>
    </div>
    <div class="mc-steps-hero mc-steps-hero--custom">
      <span class="mc-steps-hero-value">12 000</span>
    </div>

    <!-- Загрузочный день: своя строка на шаге. -->
    <div class="mc-steps-refeed-row">
      <div>
        <div class="mc-steps-refeed-title">Загрузочный день</div>
        <div class="mc-steps-refeed-hint">Норма выше обычной</div>
      </div>
    </div>
`,
  watch: {
    'Шаг «Шаги»': '.mc-steps-step',
    'Надзаголовок шага': '.mc-step-kicker',
    'Герой шагов': '.mc-steps-hero:not(.mc-steps-hero--custom)',
    'Герой · своя цель': '.mc-steps-hero--custom',
    'Число героя шагов': '.mc-steps-hero-value',
    'Единица': '.mc-steps-unit',
    'Подпись «записано»': '.mc-recorded-sub',
    'Дорожка ползунка': '.mc-steps-slider-container',
    'Метка совета': '.mc-steps-advice-mark',
    'Строка загрузки': '.mc-steps-refeed-row',
    'Заголовок загрузки': '.mc-steps-refeed-title',
    'Подсказка загрузки': '.mc-steps-refeed-hint',
    'Модалка daily': '.mc-modal--daily',
    'Приветствие': '.mc-daily-greeting-title',
    'Дата': '.mc-daily-greeting-date',
    'Кнопка назад': '.mc-header-btn--back',
    'Капсула веса': '.mc-weight-kilo-card',
    'Текущее число': '.mc-wheel-value--current',
    'Просроченная строка': '.mc-rest-row--overdue',
    'Бейдж просрочки': '.mc-rest-overdue-badge',
    'Кнопка «Дальше»': '.mc-daily-footer-primary',
  },
};
