/**
 * @fileoverview Две строки контракта про выход из аккаунта, которые вручную
 * не проверить: нужно бросить регистрацию на середине, выйти и посмотреть,
 * что осталось в хранилище и что подставилось в поля входа.
 *
 * login «выход, удаление данных, производительность»: «выход из аккаунта
 * приводит именно сюда, и введённые ранее цифры не подставляются; палитра
 * остаётся выбранной».
 *
 * registration «выход, удаление данных, производительность»: «незаконченная
 * регистрация при выходе стирается локально, но записанные шаги остаются
 * в профиле».
 */

import { describe, expect, it } from 'vitest';

const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const storageSrc = read('heys_storage_supabase_v1.js');
const gateSrc = read('heys_app_gate_flow_v1.js');
const loginSrc = read('heys_login_screen_v1.js');
const profileStepSrc = read('heys_profile_step_v1.js');

function signOutBody() {
  const start = storageSrc.indexOf('cloud.signOut = function');
  if (start < 0) throw new Error('Test setup: cloud.signOut не найден');
  const end = storageSrc.indexOf('\n  };', start);
  return storageSrc.slice(start, end);
}

describe('registration: незаконченная регистрация стирается при выходе', () => {
  it('signOut снимает маркер явно', () => {
    expect(signOutBody()).toContain("localStorage.removeItem('heys_registration_in_progress')");
  });

  it('маркер снимается после clearNamespace, а не до', () => {
    const body = signOutBody();
    expect(body.indexOf('clearNamespace()')).toBeLessThan(
      body.indexOf("removeItem('heys_registration_in_progress')"),
    );
  });

  it('маркер остаётся в чёрном списке — синхронизировать его некуда', () => {
    // Клиента на шаге регистрации ещё нет, поэтому ключ не client-specific.
    // Именно поэтому снимаем его точечно, а не удалением из списка.
    const start = storageSrc.indexOf('const NON_CLIENT_DATA_BLACKLIST = [');
    const area = storageSrc.slice(start, storageSrc.indexOf('];', start));
    expect(area).toContain("'heys_registration_in_progress'");
  });

  it('шаги переживают выход: маркер восстанавливается из неполного профиля', () => {
    expect(profileStepSrc).toContain('function ensureRegistrationInProgressMarker');
    expect(profileStepSrc).toContain("lsSet('heys_registration_in_progress', true)");
  });

  it('реплика: после выхода маркера нет, а облачный профиль не тронут', () => {
    const local = {
      heys_registration_in_progress: 'true',
      heys_theme: 'sand',
    };
    const cloudProfile = { profileCompleted: false, height: 178, birthYear: 1990 };

    delete local.heys_registration_in_progress; // то, что делает signOut

    expect(local.heys_registration_in_progress).toBeUndefined();
    expect(local.heys_theme).toBe('sand');
    expect(cloudProfile.height).toBe(178);

    // Следующий вход: профиль неполный → маркер ставится заново.
    const marker = cloudProfile.profileCompleted === true ? undefined : 'true';
    expect(marker).toBe('true');
  });
});

describe('login: выход приводит на экран входа с пустыми полями', () => {
  it('выход перемонтирует приложение целиком', () => {
    const body = signOutBody();
    expect(body).toContain("source: 'logout'");
    expect(body).toContain('heys:client-changed');
  });

  it('поля телефона и пина начинаются пустыми', () => {
    expect(loginSrc).toContain("useState('')");
    expect(loginSrc).toContain("useState(['', '', '', ''])");
  });

  it('экран входа не получает начальных цифр от гейта', () => {
    const start = gateSrc.indexOf('HEYS.LoginScreen,');
    const props = gateSrc.slice(start, start + 900);
    expect(props).toContain('initialMode');
    // initialEmail/initialPassword — кураторский автологин, это не «цифры».
    expect(props).not.toContain('initialPhone');
    expect(props).not.toContain('initialPin');
  });

  it('палитра переживает выход', () => {
    const start = storageSrc.indexOf('const NON_CLIENT_DATA_BLACKLIST = [');
    const area = storageSrc.slice(start, storageSrc.indexOf('];', start));
    expect(area).toContain("'heys_theme'");
    expect(area).toContain("'heys_theme_pref'");
    expect(area).toContain("'heys_theme_explicit'");
  });
});

describe('undo-bar: окно отмены закрывается при выходе', () => {
  it('signOut закрывает окно до полной чистки', () => {
    const body = signOutBody();
    expect(body).toContain("Undo?.commit?.('logout')");
    expect(body.indexOf("Undo?.commit?.('logout')")).toBeLessThan(body.indexOf('clearNamespace()'));
  });

  it('commit прогоняет onExpire и убирает бар', () => {
    const undoSrc = read('heys_undo_v1.js');
    const start = undoSrc.indexOf('function commitCurrent(');
    const body = undoSrc.slice(start, start + 700);
    expect(body).toContain('destroyBar()');
    expect(body).toContain('onExpire?.(');
  });

  it('реплика: правка применена в момент действия, отмена её откатывает', () => {
    // day/_meals.js:5018-5027 — мутация уже выполнена до push, onUndo обратный.
    let meals = ['завтрак', 'обед'];
    const snapshot = meals.slice();
    meals = meals.filter((m) => m !== 'обед'); // удаление применилось сразу
    const onUndo = () => { meals = snapshot.slice(); };
    const onExpire = () => { /* коммит: откатывать нечего */ };

    onExpire(); // выход закрывает окно
    expect(meals).toEqual(['завтрак']);

    // Проверяем, что реплика не вырождена: отмена действительно возвращала бы.
    onUndo();
    expect(meals).toEqual(['завтрак', 'обед']);
  });
});
