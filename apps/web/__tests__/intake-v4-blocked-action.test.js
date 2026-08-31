/**
 * Недоступное действие в анкете (канвас questionnaire.v4, строки «одно
 * правило», «шаги 1 и 3», «отправка»).
 *
 * Правило простое и сквозное: если действие недоступно, оно называет причину
 * ЗАРАНЕЕ — строкой над кнопкой, — а сама кнопка не нажимается. Прежде
 * «Продолжить» была активна всегда, и человек узнавал о незаполненном поле
 * только после нажатия: тап, отказ, красный текст где-то ниже.
 *
 * Почему смоуком. Проверять надо не вид, а связь: пустое обязательное поле →
 * кнопка мертва и причина названа; поле заполнено → кнопка жива и причины нет.
 * Это четыре состояния на пяти шагах, и собирать их руками в проде — заполнять
 * и очищать поля по кругу.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_trial_intake_v1.js'), 'utf8');

describe('анкета: недоступное действие называет причину', () => {
  it('кнопка не нажимается, пока обязательное поле пусто', () => {
    expect(SRC).toMatch(/disabled:\s*saveState === 'saving' \|\| blocked/);
    expect(SRC).toContain('blocked = missingRequired');
  });

  it('причина стоит над кнопкой, а не появляется после нажатия', () => {
    // Строка рендерится по тому же признаку, что блокирует кнопку.
    expect(SRC).toMatch(/missingRequired \? React\.createElement\('div', \{[\s\S]*?'blocked-reason'/);
    expect(SRC).toContain('Заполните поля со звёздочкой');
    expect(SRC).toContain('Поставьте галочку выше');
  });

  it('на шаге предупреждения причина говорит про галочку, на прочих — про звёздочку', () => {
    const at = SRC.indexOf("'blocked-reason'");
    const tail = SRC.slice(at, at + 700);
    expect(tail).toMatch(
      /current\?\.id === 'warning' \? 'Поставьте галочку выше' : 'Заполните поля со звёздочкой'/,
    );
  });

  it('заблокированная кнопка гаснет и теряет курсор действия', () => {
    const at = SRC.indexOf('const submitOrContinueButton');
    const tail = SRC.slice(at, at + 700);
    expect(tail).toMatch(/opacity:.*blocked.*0\.45/);
    expect(tail).toMatch(/cursor:.*blocked.*'default'/);
  });

  it('кнопка держит высоту 48 и заливку акцента', () => {
    const at = SRC.indexOf('const submitOrContinueButton');
    const tail = SRC.slice(at, at + 700);
    expect(tail).toMatch(/minHeight:\s*48/);
    // Проверялась роль с именем набора — `var(--v4-sand-act, …)`. По решению
    // владельца 31 августа такая роль в модуле незаконна: в синих темах она
    // держит песочную терракоту. Заливка берётся из ACCENT_FILL, а он объявлен
    // общей ролью один раз на весь модуль — проверяем и то, и другое.
    expect(tail).toContain('ACCENT_FILL');
    expect(SRC).toContain("const ACCENT_FILL = 'var(--v4-act, #c67139)'");
    // Комментарий не в счёт: там имя набора названо как то, что убрано.
    expect(SRC.replace(/\/\/[^\n]*/g, '')).not.toContain('--v4-sand-');
    // Легаси-фиолетовый #434587 на кнопке анкеты больше не встречается.
    expect(SRC).not.toContain('#434587');
  });
});

describe('анкета: предупреждение прокручивается в своей области', () => {
  it('область 186 px с настоящей прокруткой — чекбокс не уезжает за экран', () => {
    expect(SRC).toMatch(/maxHeight:\s*186,\s*overflowY:\s*'auto'/);
  });

  it('экран сведён на роли набора, а не на легаси-палитру', () => {
    expect(SRC).toContain("var(--v4-chip, #efe3cf)");
    expect(SRC).not.toContain('#f6f7f5');
  });
});
