export default {
  zone: 'questionnaire',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
  ],
  html: `
    <div class="trial-intake-shell" style="min-height:100vh;background:var(--v4-chip);padding:24px 16px 48px;box-sizing:border-box;color:var(--v4-ink)">
      <div class="trial-intake-card" style="max-width:680px;margin:0 auto;background:var(--v4-bg);border-radius:24px;padding:16px 18px 20px;box-sizing:border-box">
        <div class="trial-intake-access" style="background:var(--v4-tint);border-radius:18px;padding:13px 15px;color:var(--v4-ink-2);font-size:11.5px;font-weight:500;line-height:1.55;margin-bottom:12px">
          Ответы видите вы и назначенный куратор. Анкета не гарантирует пробную неделю.
        </div>
        <div class="trial-intake-step-caption" style="font-size:12px;font-weight:600;color:var(--v4-ink)">Шаг 1 из 5</div>
        <h1 class="trial-intake-title" style="font-size:22px;font-weight:700;line-height:1.2;color:var(--v4-ink);margin:8px 0 0">Цель</h1>
        <p class="trial-intake-subtitle" style="font-size:12.5px;font-weight:500;line-height:1.55;color:var(--v4-ink-2);margin:9px 0 12px">Расскажите, что хотите изменить.</p>
        <label class="trial-intake-question" style="display:grid;background:var(--v4-card);border-radius:18px;padding:14px 16px;font-size:12.5px;font-weight:600;color:var(--v4-ink)">
          Что хотите изменить *
          <textarea class="trial-intake-field" style="margin-top:8px;width:100%;box-sizing:border-box;border:none;border-radius:14px;min-height:44px;padding:12px 14px;font-size:16px;line-height:1.45;color:var(--v4-ink);background:var(--v4-bg);outline:none">Больше энергии днём</textarea>
        </label>
        <button type="button" class="trial-intake-primary" style="margin-top:16px;width:100%;min-height:48px;border:0;border-radius:999px;background:var(--v4-act);color:var(--v4-btn-on-act);font-size:13px;font-weight:700">Продолжить</button>
      </div>
      <div class="trial-intake-card" style="max-width:680px;margin:24px auto 0;background:var(--v4-bg);border-radius:24px;padding:16px 18px 20px;box-sizing:border-box">
        <div class="trial-intake-step-caption" style="font-size:12px;font-weight:600;color:var(--v4-ink)">Шаг 2 из 5</div>
        <h1 class="trial-intake-title" style="font-size:22px;font-weight:700;line-height:1.2;color:var(--v4-ink);margin:8px 0 0">Активность</h1>
        <div id="intake-warning" style="background:var(--v4-card);color:var(--v4-ink);padding:14px 16px;border-radius:18px;margin-top:12px">Нет сети — ответы сохранятся локально</div>
      </div>
      <div class="trial-intake-card" style="max-width:680px;margin:24px auto 0;background:var(--v4-bg);border-radius:24px;padding:16px 18px 20px;box-sizing:border-box">
        <div class="trial-intake-step-caption" style="font-size:12px;font-weight:600;color:var(--v4-ink)">Шаг 3 из 5</div>
        <h1 class="trial-intake-title" style="font-size:22px;font-weight:700;line-height:1.2;color:var(--v4-ink);margin:8px 0 0">Предыдущий опыт</h1>
        <p class="trial-intake-subtitle" style="font-size:12.5px;font-weight:500;line-height:1.55;color:var(--v4-ink-2);margin:9px 0 12px">Это помогает не повторять то, что уже не подошло.</p>
        <label class="trial-intake-question" style="display:grid;background:var(--v4-card);border-radius:18px;padding:14px 16px;font-size:12.5px;font-weight:600;color:var(--v4-ink)">
          Был ли опыт изменения питания или образа жизни? *
          <select id="intake-previous_experience" class="trial-intake-field" style="margin-top:8px;width:100%;box-sizing:border-box;border:none;border-radius:14px;min-height:44px;padding:12px 14px;font-size:16px;line-height:1.45;color:var(--v4-ink);background:var(--v4-bg)">
            <option value="self">Да, самостоятельно</option>
          </select>
        </label>
      </div>
      <div class="trial-intake-card" style="max-width:680px;margin:24px auto 0;background:var(--v4-bg);border-radius:24px;padding:16px 18px 20px;box-sizing:border-box">
        <div class="trial-intake-step-caption" style="font-size:12px;font-weight:600;color:var(--v4-ink)">Шаг 4 из 5</div>
        <h1 class="trial-intake-title" style="font-size:22px;font-weight:700;line-height:1.2;color:var(--v4-ink);margin:8px 0 0">Ритм жизни</h1>
        <p class="trial-intake-subtitle" style="font-size:12.5px;font-weight:500;line-height:1.55;color:var(--v4-ink-2);margin:9px 0 12px">Нужен реальный контекст, а не идеальная неделя.</p>
        <label class="trial-intake-question" style="display:grid;background:var(--v4-card);border-radius:18px;padding:14px 16px;font-size:12.5px;font-weight:600;color:var(--v4-ink)">
          Как обычно устроен ваш день? *
          <textarea id="intake-schedule" class="trial-intake-field" style="margin-top:8px;width:100%;box-sizing:border-box;border:none;border-radius:14px;min-height:44px;padding:12px 14px;font-size:16px;line-height:1.45;color:var(--v4-ink);background:var(--v4-bg);outline:none">Работа по сменам</textarea>
        </label>
        <label class="trial-intake-question" style="display:grid;background:var(--v4-card);border-radius:18px;padding:14px 16px;font-size:12.5px;font-weight:600;color:var(--v4-ink);margin-top:8px">
          Сколько вы обычно спите и как восстанавливаетесь? *
          <input id="intake-sleep" class="trial-intake-field" type="text" value="Около восьми часов" style="margin-top:8px;width:100%;box-sizing:border-box;border:none;border-radius:14px;min-height:44px;padding:12px 14px;font-size:16px;line-height:1.45;color:var(--v4-ink);background:var(--v4-bg);outline:none" />
        </label>
      </div>
      <div class="trial-intake-card" style="max-width:680px;margin:24px auto 0;background:var(--v4-bg);border-radius:24px;padding:16px 18px 20px;box-sizing:border-box">
        <div class="trial-intake-step-caption" style="font-size:12px;font-weight:600;color:var(--v4-ink)">Шаг 5 из 5</div>
        <h1 class="trial-intake-title" style="font-size:22px;font-weight:700;line-height:1.2;color:var(--v4-ink);margin:8px 0 0">Формат совместной работы</h1>
        <p class="trial-intake-subtitle" style="font-size:12.5px;font-weight:500;line-height:1.55;color:var(--v4-ink-2);margin:9px 0 12px">Для пробной недели достаточно регулярно присылать фото или короткие сообщения.</p>
        <label class="trial-intake-question" style="display:grid;background:var(--v4-card);border-radius:18px;padding:14px 16px;font-size:12.5px;font-weight:600;color:var(--v4-ink)">
          Готовы присылать фото, текст или голосовые сообщения о приёмах пищи? *
          <select id="intake-daily_tracking" class="trial-intake-field" style="margin-top:8px;width:100%;box-sizing:border-box;border:none;border-radius:14px;min-height:44px;padding:12px 14px;font-size:16px;line-height:1.45;color:var(--v4-ink);background:var(--v4-bg)">
            <option value="yes">Да</option>
          </select>
        </label>
        <label class="trial-intake-question" style="display:grid;background:var(--v4-card);border-radius:18px;padding:14px 16px;font-size:12.5px;font-weight:600;color:var(--v4-ink);margin-top:8px">
          Какая обратная связь вам полезнее? *
          <select id="intake-feedback_style" class="trial-intake-field" style="margin-top:8px;width:100%;box-sizing:border-box;border:none;border-radius:14px;min-height:44px;padding:12px 14px;font-size:16px;line-height:1.45;color:var(--v4-ink);background:var(--v4-bg)">
            <option value="concise">Коротко и по делу</option>
          </select>
        </label>
        <div id="intake-blocked-reason" style="margin-top:16px;font-size:11px;font-weight:500;line-height:1.45;text-align:center;color:var(--v4-ink-2)">Заполните поля со звёздочкой</div>
        <div id="intake-warning-text" role="region" style="margin-top:12px;max-height:186px;overflow-y:auto;padding:14px 16px;border-radius:18px;background:var(--v4-card);color:var(--v4-ink-2);font-size:12.5px;font-weight:500;line-height:1.55">Прочитайте предупреждение и подтвердите, что готовы продолжить.</div>
      </div>
      <div id="heys-intake-login" class="heys-auth-shell" style="max-width:680px;margin:24px auto 0;background:var(--v4-bg);border-radius:24px;padding:16px 18px 20px;box-sizing:border-box">
        <div class="heys-auth-card" style="background:transparent;padding:0">
          <div class="heys-auth-title" style="font-size:20px;font-weight:700;line-height:1.2;color:var(--v4-ink)">Вход в анкету</div>
          <p class="heys-auth-subtitle" style="font-size:12.5px;font-weight:500;line-height:1.55;color:var(--v4-ink-2);margin:9px 0 12px">Это только анкета. Приложение откроется, когда куратор её проверит.</p>
          <div class="heys-auth-label" style="font-size:12px;font-weight:600;color:var(--v4-ink)">Код от куратора</div>
          <div class="heys-auth-pin-box is-filled" style="margin-top:8px;display:inline-grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--v4-card)">
            <input class="heys-auth-pin-input is-filled" type="text" value="1" style="width:100%;height:100%;border:0;background:transparent;text-align:center;color:var(--v4-ink);font-size:18px;font-weight:700" />
          </div>
        </div>
      </div>
    </div>
  `,
  watch: {
    'оболочка анкеты': '.trial-intake-shell',
    'карточка анкеты': '.trial-intake-card',
    'плашка доступа': '.trial-intake-access',
    'заголовок шага': '.trial-intake-title',
    'карточка вопроса': '.trial-intake-question',
    'поле ответа': '.trial-intake-field',
    'кнопка продолжить': '.trial-intake-primary',
    'шаг 2 заголовок': '.trial-intake-card:nth-of-type(2) .trial-intake-title',
    'предупреждение offline': '#intake-warning',
    'шаг 3 заголовок': '.trial-intake-card:nth-of-type(3) .trial-intake-title',
    'поле опыта': '#intake-previous_experience',
    'шаг 4 заголовок': '.trial-intake-card:nth-of-type(4) .trial-intake-title',
    'поле расписания': '#intake-schedule',
    'поле сна': '#intake-sleep',
    'шаг 5 заголовок': '.trial-intake-card:nth-of-type(5) .trial-intake-title',
    'поле готовности': '#intake-daily_tracking',
    'поле обратной связи': '#intake-feedback_style',
    'причина блокировки': '#intake-blocked-reason',
    'текст предупреждения': '#intake-warning-text',
    'вход в анкету': '#heys-intake-login .heys-auth-title',
    'код от куратора': '.heys-auth-pin-input',
  },
};
