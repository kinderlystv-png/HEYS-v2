/** Stand · curator-cabinet — из curator-panel-canvas-geometry / curator-panel-sheet-render. */
export default {
  zone: 'curator-cabinet',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/734-ui-v4-curator-panel.css',
  ],
  html: `
    <button type="button" class="cur-row">
      <span class="cur-row__avatar">МК</span>
      <span class="cur-row__name">Марина К.</span>
      <span class="cur-row__state">ждёт решения</span>
      <span class="cur-row__dot"></span>
      <span class="cur-row__age is-data">21 день</span>
    </button>
    <div class="cur-sheet">
      <div class="cur-sheet__meta">окно 21 день · −0,6 кг</div>
      <span class="cur-sheet__fact-value is-fact">2 220</span>
      <span class="cur-sheet__fact-hint">факт за окно</span>
      <div class="cur-sheet__save-error" role="alert">Решение не сохранено</div>
      <div class="cur-sheet__actions">
        <button type="button">Открыть дневник</button>
      </div>
    </div>
  
    <!-- Здоровье клиента: три степени. -->
    <div class="cur-cab__card is-last">
      <span class="cur-cab__health is-ok">ровно</span>
      <span class="cur-cab__health is-warning">внимание</span>
      <span class="cur-cab__health is-critical">срочно</span>
      <span class="cur-cab__access is-warn">доступ истекает</span>
    </div>

    <!-- Утренний чек-ин: сдан, не сдан, выключен. -->
    <div>
      <span class="cur-cab__mch is-ok">сдан</span>
      <span class="cur-cab__mch is-none">нет</span>
      <span class="cur-cab__mch is-off">выключен</span>
    </div>

    <!-- Вкладки, превью и меню. -->
    <div>
      <button type="button" class="cur-cab__tab is-on">Панель</button>
      <button type="button" class="cur-cab__tab">Клиенты</button>
      <div class="cur-cab__tab-note is-form-note">Заполнено не всё</div>
      <div class="cur-cab__preview is-unread">Новое сообщение</div>
      <div class="cur-cab__menu-row is-bad">Отозвать доступ</div>
      <button type="button" class="cur-cab__open is-soft">Открыть</button>
      <span class="cur-cab__sheet-term is-warn">до 12 сентября</span>
    </div>

    <!-- Чипы фильтра и значения фактов. -->
    <div>
      <span class="cur-chip is-on">все · 12</span>
      <span class="cur-chip is-muted">копят</span>
      <span class="cur-kv__val is-ok">в норме</span>
      <span class="cur-kv__val is-warn">выше</span>
      <span class="cur-kv__val is-bad">много</span>
      <span class="cur-kv__val is-id">a1b2c3</span>
      <input class="cur-field__input is-pin" value="4821" readonly />
    </div>

    <!-- Строка клиента: точки состояний, возраст, счётчик. -->
    <div class="cur-row cur-row--line is-static">
      <span class="cur-row__dot--awaits"></span>
      <span class="cur-row__dot--silent"></span>
      <span class="cur-row__dot--mismatch"></span>
      <span class="cur-row__dot--in_corridor"></span>
      <span class="cur-row__dot--decided_today"></span>
      <span class="cur-row__state is-act">ждёт решения</span>
      <span class="cur-row__age is-data">3 дня</span>
      <span class="cur-row__count--muted">0</span>
    </div>
    <div class="cur-panel__empty cur-panel__empty--ok">Все разобраны</div>

    <!-- Лист поправки: факты, история, рекомендация. -->
    <div class="cur-sheet">
      <span class="cur-sheet__fact-value is-fact">2 100 ккал</span>
      <span class="cur-sheet__fact-value is-ok">держится</span>
      <span class="cur-sheet__fact-value is-warn">разошлось</span>
      <span class="cur-sheet__hist-dash is-target"></span>
      <span class="cur-sheet__rec-num is-target">1 950</span>
      <span class="cur-sheet__rec-delta is-up">+150</span>
      <button type="button" class="cur-sheet__btn cur-sheet__btn--wide">Применить</button>
    </div>
`,
  watch: {
    'Карточка · последняя': '.cur-cab__card.is-last',
    'Здоровье · ровно': '.cur-cab__health.is-ok',
    'Здоровье · внимание': '.cur-cab__health.is-warning',
    'Здоровье · срочно': '.cur-cab__health.is-critical',
    'Доступ истекает': '.cur-cab__access.is-warn',
    'Чек-ин сдан': '.cur-cab__mch.is-ok',
    'Чек-ина нет': '.cur-cab__mch.is-none',
    'Чек-ин выключен': '.cur-cab__mch.is-off',
    'Вкладка выбрана': '.cur-cab__tab.is-on',
    'Вкладка обычная': '.cur-cab__tab:not(.is-on)',
    'Пометка анкеты': '.cur-cab__tab-note.is-form-note',
    'Непрочитанное превью': '.cur-cab__preview.is-unread',
    'Опасный пункт меню': '.cur-cab__menu-row.is-bad',
    'Мягкая кнопка «Открыть»': '.cur-cab__open.is-soft',
    'Срок в листе': '.cur-cab__sheet-term.is-warn',
    'Чип включён': '.cur-chip.is-on',
    'Чип приглушён': '.cur-chip.is-muted',
    'Значение · норма': '.cur-kv__val.is-ok',
    'Значение · выше': '.cur-kv__val.is-warn',
    'Значение · много': '.cur-kv__val.is-bad',
    'Значение · номер': '.cur-kv__val.is-id',
    'Поле PIN': '.cur-field__input.is-pin',
    'Строка-линия': '.cur-row--line.is-static',
    'Точка · ждёт': '.cur-row__dot--awaits',
    'Точка · молчит': '.cur-row__dot--silent',
    'Точка · разошлось': '.cur-row__dot--mismatch',
    'Точка · в коридоре': '.cur-row__dot--in_corridor',
    'Точка · решено сегодня': '.cur-row__dot--decided_today',
    'Состояние строки': '.cur-row__state.is-act',
    'Возраст с данными': '.cur-row__age.is-data',
    'Счётчик приглушён': '.cur-row__count--muted',
    'Пусто · всё разобрано': '.cur-panel__empty--ok',
    'Факт · число': '.cur-sheet__fact-value.is-fact',
    'Факт · держится': '.cur-sheet__fact-value.is-ok',
    'Факт · разошлось': '.cur-sheet__fact-value.is-warn',
    'Черта цели': '.cur-sheet__hist-dash.is-target',
    'Число рекомендации': '.cur-sheet__rec-num.is-target',
    'Дельта вверх': '.cur-sheet__rec-delta.is-up',
    'Широкая кнопка листа': '.cur-sheet__btn--wide',
    'Строка клиента': '.cur-row',
    'Аватар': '.cur-row__avatar',
    'Имя клиента': '.cur-row__name',
    'Статус строки': '.cur-row__state',
    'Точка строки': '.cur-row__dot',
    'Возраст окна': '.cur-row__age.is-data',
    'Лист поправки': '.cur-sheet',
    'Мета листа': '.cur-sheet__meta',
    'Факт поправки': '.cur-sheet__fact-value.is-fact',
    'Ошибка сохранения': '.cur-sheet__save-error',
  },
};
