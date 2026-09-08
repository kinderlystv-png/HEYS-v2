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
  `,
  watch: {
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
