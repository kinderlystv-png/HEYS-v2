export default {
  zone: 'registration',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/500-pwa-and-offline.css',
  ],
  html: `
    <div style="min-height:812px;position:relative;width:375px">
    <div class="mc-backdrop">
      <div class="mc-modal mc-modal--daily" data-heys-step-id="profile-personal">
        <div class="profile-personal-step flex flex-col gap-4">
          <div class="profile-personal-name flex flex-col gap-2">
            <label>Имя
              <input type="text" placeholder="Иван" value="Иван" />
            </label>
          </div>
          <div class="profile-personal-wheel-card flex justify-center gap-2">
            <div class="mc-wheel-picker mc-wheel-picker--compact">
              <div class="mc-wheel-values">
                <div class="mc-wheel-value mc-wheel-value--prev n">167</div>
                <div class="mc-wheel-value mc-wheel-value--current n">168</div>
                <div class="mc-wheel-value mc-wheel-value--next n">169</div>
              </div>
            </div>
          </div>
        </div>
        <div class="mc-daily-footer">
          <button type="button" class="mc-daily-footer-primary mc-btn--primary">Продолжить</button>
        </div>
      </div>
    </div>
    </div>
  `,
  watch: {
    'модалка регистрации': '.mc-modal[data-heys-step-id="profile-personal"]',
    'поле имени': '.profile-personal-name input[type="text"]',
    'текущее значение колеса': '.mc-wheel-value--current',
    'сосед колеса': '.mc-wheel-value--prev',
    'кнопка продолжить': '.mc-daily-footer-primary',
  },
};
