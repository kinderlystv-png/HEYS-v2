import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

// heys/d8f2b0 — повторное согласие по необязательным документам.
//
// Инвариант, который здесь защищается: проверка необязательных согласий
// НИЧЕГО не блокирует. Она поднимает мягкий баннер и на этом останавливается.
// Человек не должен терять доступ к сервису из-за того, что не переподписал
// согласие на доступ куратора, push или маркетинг.
//
// Проверяется контрактом по исходникам, а не рендером: модуль оверлеев —
// React-компонент с хуками, и поднимать под него дерево ради двух условий
// дороже, чем сверить сам контракт.

const repoRoot = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.resolve(repoRoot, rel), 'utf8');

const migrationRaw = read('database/2026-08-21_optional_consent_recheck_v1.sql');
// Инвариант «ничего не блокирует» относится к исполняемому SQL, а не к прозе:
// в шапке миграции grace и must_block упоминаются как раз для объяснения,
// почему их здесь нет. Комментарии срезаем, иначе тест ловит собственное
// обоснование.
const migration = migrationRaw.replace(new RegExp('^\\s*--.*$', 'gm'), '');
const overlays = read('apps/web/heys_app_overlays_v1.js');
const overlaysProps = read('apps/web/heys_app_overlays_props_v1.js');
const consents = read('apps/web/heys_consents_v1.js');
const gateFlow = read('apps/web/heys_app_gate_flow_v1.js');
const rpcIndex = read('yandex-cloud-functions/heys-api-rpc/index.js');

describe('необязательные согласия: серверная часть ничего не блокирует', () => {
  it('не трогает grace и не отдаёт must_block', () => {
    // consent_outdated_since + семидневный grace + must_block — это механика
    // блокирующего контура. Появление их здесь означало бы, что человека
    // однажды не пустят в приложение из-за необязательного документа.
    expect(migration).not.toMatch(/consent_outdated_since/);
    expect(migration).not.toMatch(/must_block/);
    expect(migration).not.toMatch(/INTERVAL '7 days'/);
    expect(migration).not.toMatch(/UPDATE\s+clients/i);
  });

  it('исключает типы, которые уже проверяет блокирующий контур', () => {
    // Пересечение двух контуров дало бы двойной показ: и экран-гейт, и баннер.
    expect(migration).toMatch(
      /v_blocking\s+TEXT\[\]\s*:=\s*ARRAY\['user_agreement','personal_data','health_data'\]/,
    );
    expect(migration).toMatch(/CONTINUE WHEN v_type = ANY\(v_blocking\)/);
  });

  it('пропускает служебные ключи LegalVersions, а не только типы согласий', () => {
    // HEYS.LegalVersions несёт labels (объект), required (массив) и _updatedAt.
    // Без фильтра они прошли бы как «типы согласий» с мусорными версиями.
    expect(migration).toMatch(/v_meta\s+TEXT\[\]\s*:=\s*ARRAY\['labels','required','_updatedAt'\]/);
    expect(migration).toMatch(/jsonb_typeof\(p_expected_versions->v_type\) <> 'string'/);
  });

  it('не считает устаревшим то, что никогда не подписывали', () => {
    // Никогда не выданное согласие — это первичный сбор, дело онбординга,
    // а не повод показывать баннер «переподпишите».
    expect(migration).toMatch(/IF FOUND AND COALESCE\(v_granted, false\) AND v_actual_version <> v_expected/);
  });

  it('открыта для роли heys_rpc и внесена в белый список шлюза', () => {
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.check_optional_consents_by_session/);
    // Без записи в allowlist вызов вернул бы 403 — ровно как get_public_app_status.
    expect(rpcIndex).toMatch(/'check_optional_consents_by_session'/);
  });
});

describe('необязательные согласия: клиентская часть', () => {
  it('при любой ошибке отдаёт пустой список, а не роняет экран', () => {
    const fn = consents.slice(consents.indexOf('consentsAPI.checkOptionalOutdated'));
    const body = fn.slice(0, fn.indexOf('\n  };'));
    // Три ветки отказа: нет API, error в ответе, success === false.
    expect(body).toMatch(/if \(!HEYS\.YandexAPI\?\.checkOptionalConsentsBySession\) return \{ outdated: \[\] \};/);
    expect(body).toMatch(/if \(result\.error\) return \{ outdated: \[\] \};/);
    expect(body).toMatch(/if \(data\?\.success === false\) return \{ outdated: \[\] \};/);
    expect(body).toMatch(/catch/);
  });

  it('баннер рисуется поверх приложения и только когда гейт не блокирует', () => {
    const banner = overlays.slice(overlays.indexOf("key: 'optional-outdated-banner'") - 900);
    const guard = banner.slice(0, banner.indexOf("key: 'optional-outdated-banner'"));
    expect(guard).toMatch(/!isConsentBlocking/);
    expect(guard).toMatch(/\(optionalOutdatedTypes \|\| \[\]\)\.length > 0/);
    // Именно ConsentOutdatedBanner: он position: fixed поверх контента,
    // в отличие от ConsentScreen, который заменяет приложение целиком.
    expect(guard).toMatch(/HEYS\.Consents\?\.ConsentOutdatedBanner/);
  });

  it('пробрасывается через строитель пропсов оверлеев', () => {
    expect(overlaysProps).toMatch(/optionalOutdatedTypes,/);
    expect(overlaysProps).toMatch(/onOptionalReconsent,/);
  });

  it('блокирующее условие гейта не знает про необязательные типы', () => {
    // shouldBlockForConsents должен остаться прежним: needsConsent,
    // mustBlockReconsent и outdated из блокирующего контура. Появление здесь
    // optionalOutdatedTypes означало бы, что баннер стал гейтом.
    const line = gateFlow.slice(gateFlow.indexOf('const shouldBlockForConsents'));
    const expr = line.slice(0, line.indexOf(';'));
    expect(expr).toMatch(/needsConsent \|\| mustBlockReconsent \|\| hasOutdatedRequiredConsents/);
    expect(expr).not.toMatch(/optional/i);
  });
});
