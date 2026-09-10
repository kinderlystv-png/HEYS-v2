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
    <div class="messenger-composer">
      <div class="messenger-input-row">
        <div class="messenger-input-stack">
          <textarea class="messenger-input" rows="1">Сообщение</textarea>
        </div>
        <button type="button" class="messenger-send">Отправить</button>
      </div>
      <div class="messenger-recording-live">
        <span class="messenger-recording-dot"></span>
        <span class="messenger-recording-label">Идёт запись</span>
        <span class="messenger-recording-time">0:12</span>
        <button type="button" class="messenger-recording-stop">Стоп</button>
      </div>
    </div>
    <div class="messenger-offline-bar" role="status">
      <span class="messenger-offline-bar__dot" aria-hidden="true"></span>
      <span class="messenger-offline-bar__text">Нет сети</span>
      <button type="button" class="messenger-offline-bar__retry">Повторить</button>
    </div>
    <div class="messenger-action-sheet-backdrop"></div>
    <div class="messenger-action-sheet" role="menu">
      <div class="messenger-action-sheet__quote">Цитата</div>
      <button type="button" class="messenger-action-sheet__item">Ответить</button>
      <button type="button" class="messenger-action-sheet__item messenger-action-sheet__item--danger">Удалить</button>
    </div>
  `,
  watch: {
    'подложка листа действий': '.messenger-action-sheet-backdrop',
    'Пустой тред': '.messenger-empty',
    'Бейдж пустого треда': '.messenger-empty__badge',
    'Текст пустого треда': '.messenger-empty__text',
    'Подсказка': '.messenger-empty__prompt',
    'Своё сообщение': '.msg-bubble-mine',
    'Чужое сообщение': '.msg-bubble-theirs',
    'Мета времени': '.msg-meta',
    'Карточка дня': '.msg-applied-card',
    'Композер': '.messenger-composer',
    'Поле ввода': '.messenger-input',
    'Кнопка отправки': '.messenger-send',
    'Запись голоса': '.messenger-recording-live',
    'Точка записи': '.messenger-recording-dot',
    'Офлайн-бар': '.messenger-offline-bar',
    'Лист действий': '.messenger-action-sheet',
    'Опасное действие': '.messenger-action-sheet__item--danger',
  },
};
