/** Stand · messenger — из messenger-empty-applied-geometry / messenger-bubble-v4-palette. */
export default {
  zone: 'messenger',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/1000-messenger.css',
  ],
  html: `
    <div class="messenger-empty">
      <div class="messenger-empty__badge">i</div>
      <div class="messenger-empty__title">Начните диалог</div>
      <div class="messenger-empty__text">Напишите куратору</div>
      <div class="messenger-empty__prompts">
        <button type="button" class="messenger-empty__prompt">Фото завтрака</button>
      </div>
    </div>
    <div class="msg-bubble msg-bubble-mine">Текст</div>
    <div class="msg-bubble msg-bubble-theirs">Ответ</div>
    <span class="msg-meta">12:30</span>
    <div class="msg-applied-card">
      <div class="msg-applied-card__head">
        <span class="msg-applied-card__dot"></span>
        <span class="msg-applied-card__title">Обед</span>
      </div>
      <div class="msg-applied-card__items">
        <div class="msg-applied-card__item">
          <span class="msg-applied-card__name">Суп</span>
          <span class="msg-applied-card__grams">180 г</span>
        </div>
      </div>
    </div>
  `,
  watch: {
    'Пустой тред': '.messenger-empty',
    'Бейдж пустого треда': '.messenger-empty__badge',
    'Текст пустого треда': '.messenger-empty__text',
    'Подсказка': '.messenger-empty__prompt',
    'Своё сообщение': '.msg-bubble-mine',
    'Чужое сообщение': '.msg-bubble-theirs',
    'Мета времени': '.msg-meta',
    'Карточка дня': '.msg-applied-card',
  },
};
