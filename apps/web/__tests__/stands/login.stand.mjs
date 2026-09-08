export default {
  zone: 'login',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/000-base-and-gamification.css',
    'styles/heys-components.css',
    'styles/modules/733-ui-v4-login-theme.css',
  ],
  html: `
    <div id="heys-login-gate" class="heys-auth-shell">
      <div class="heys-auth-shell-client">
        <div class="heys-auth-shell-stage">
          <div class="heys-auth-card">
            <div class="heys-auth-heading">
              <div class="heys-auth-title">Вход клиента</div>
              <div class="heys-auth-subtitle">Введите телефон и код доступа</div>
            </div>
            <div class="space-y-6">
              <div class="space-y-3">
                <div class="heys-auth-label">Телефон</div>
                <div class="heys-auth-field is-active">
                  <span class="heys-auth-prefix">+7</span>
                  <input class="heys-auth-phone-input" type="tel" value="(999) 123-45-67" />
                </div>
              </div>
              <div class="heys-auth-pin-section space-y-3">
                <div class="heys-auth-label">Код доступа</div>
                <div class="heys-auth-pin-grid">
                  <div class="heys-auth-pin-box is-filled">
                    <input class="heys-auth-pin-input is-filled" type="text" value="1" />
                  </div>
                  <div class="heys-auth-pin-box is-filled">
                    <input class="heys-auth-pin-input is-filled" type="text" value="2" />
                  </div>
                  <div class="heys-auth-pin-box">
                    <input class="heys-auth-pin-input" type="text" />
                  </div>
                  <div class="heys-auth-pin-box">
                    <input class="heys-auth-pin-input" type="text" />
                  </div>
                </div>
              </div>
              <div class="heys-auth-keypad" aria-label="Цифровая клавиатура кода">
                <button type="button" class="heys-auth-key">1</button>
                <button type="button" class="heys-auth-key">2</button>
                <button type="button" class="heys-auth-key">3</button>
                <button type="button" class="heys-auth-key heys-auth-key--muted">⌫</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  watch: {
    'оболочка входа': '#heys-login-gate.heys-auth-shell',
    'карточка входа': '.heys-auth-card',
    'заголовок': '.heys-auth-title',
    'подпись поля': '.heys-auth-label',
    'поле телефона': '.heys-auth-field',
    'бокс кода': '.heys-auth-pin-box',
    'клавиша PIN': '.heys-auth-key',
  },
};
