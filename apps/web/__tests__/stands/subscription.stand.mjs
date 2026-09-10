/** Stand · subscription — paywall из subscription-paywall-computed-v4 / subscription-readonly-surfaces-v4. */
export default {
  zone: 'subscription',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/735-ui-v4-subscription.css',
  ],
  html: `
    <div id="ui-v4-subscription-screen-host">
      <div class="readonly-banner readonly-banner--sticky">
        <div class="readonly-banner-content">
          <div class="readonly-banner-title">Доступ только для чтения</div>
          <div class="readonly-banner-text">Чтобы записывать — напишите в поддержку</div>
        </div>
        <button type="button" class="readonly-banner-pill">Подписка</button>
      </div>
      <div class="paywall-overlay">
        <div class="paywall-modal">
          <div class="paywall-plans">
            <div class="paywall-plan selected">
              <div class="paywall-plan-main"><div class="paywall-plan-name">Pro</div></div>
              <div class="paywall-plan-price">7 990 ₽</div>
              <div class="paywall-plan-badge">Популярный</div>
            </div>
          </div>
          <button type="button" class="paywall-cta">Оформить</button>
          <div class="paywall-trial paywall-trial--offer">
            <div class="paywall-trial-title">Место освободилось</div>
          </div>
        </div>
      </div>
      <div class="sub-screen">
        <div class="sub-screen__headline">Подписка</div>
        <div class="sub-screen__status-card"></div>
        <a class="sub-screen__support-link" href="#">Поддержка</a>
      </div>
    </div>
  
    <!-- Очередь на пробу: предложение, «идёт» и «готово». -->
    <div class="paywall-trial paywall-trial--offer">
      <span class="paywall-trial-dot--ok"></span>
      <span class="paywall-trial-status--ok">Место есть</span>
    </div>
    <div class="paywall-trial">
      <span class="paywall-trial-dot--busy"></span>
      <span class="paywall-trial-status--busy">Очередь занята</span>
    </div>

    <!-- Согласие: отмеченный бокс. -->
    <span class="paywall-consent-box is-checked"></span>

    <!-- Экран: опасная подпись и карточка статуса только для чтения. -->
    <div class="sub-screen__kick--danger">Доступ закрыт</div>
    <div class="sub-screen__status-card sub-screen__status-card--readonly">Читать можно, менять нельзя</div>
`,
  watch: {
    'Очередь · предложение': '.paywall-trial--offer',
    'Точка · место есть': '.paywall-trial-dot--ok',
    'Статус · место есть': '.paywall-trial-status--ok',
    'Точка · занято': '.paywall-trial-dot--busy',
    'Статус · занято': '.paywall-trial-status--busy',
    'Согласие отмечено': '.paywall-consent-box.is-checked',
    'Опасная подпись': '.sub-screen__kick--danger',
    'Статус только чтение': '.sub-screen__status-card--readonly',
    'хост экрана': '#ui-v4-subscription-screen-host',
    'подложка пейволла': '.paywall-overlay',
    'экран подписки': '.sub-screen',
    'Баннер «только чтение»': '.readonly-banner',
    'Пилюля «Подписка»': '.readonly-banner-pill',
    'Модалка тарифов': '.paywall-modal',
    'Кнопка «Оформить»': '.paywall-cta',
    'Блок очереди': '.paywall-trial',
    'Бейдж тарифа': '.paywall-plan-badge',
    'Заголовок экрана': '.sub-screen__headline',
    'Карточка статуса': '.sub-screen__status-card',
    'Ссылка поддержки': '.sub-screen__support-link',
  },
};
