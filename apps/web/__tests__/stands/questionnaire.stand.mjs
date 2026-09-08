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
  },
};
