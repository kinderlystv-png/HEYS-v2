// Принятые уязвимости: вычитаются из счёта, но не исчезают и не живут вечно.
//
// Гейт зависимостей гасит записи, которые мы согласились терпеть (сегодня это
// extract-zip внутри Playwright — исправленной версии не существует вовсе).
// Гашение реальной высокой отметки опасно ровно тем, что незаметно: список
// принятого легко превращается в место, куда складывают неудобное. Поэтому за
// него платят тремя вещами, и проверки ниже сторожат каждую.
//
// Отдельно проверяется арифметика. metadata.vulnerabilities у pnpm считает
// ПУТИ зависимостей, а подробности — уникальные записи: extract-zip приходит
// двумя путями и даёт в metadata четыре при двух записях. Первая версия
// вычитала записи из счёта по путям, недосчитывала на это удвоение, и гейт
// оставался красным на уже принятом — молча и убедительно.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const { default: DependencySecurityChecker } = await import(
  pathToFileURL(path.join(HERE, 'dependency-check.js')).href
);

/** Проверяльщик с подставленными находками — без запуска настоящего аудита. */
function checkerWith(vulns, accepted) {
  const checker = new DependencySecurityChecker();
  checker.results.vulnerabilities = vulns.map((v) => ({ ...v }));
  // metadata намеренно расходится с подробностями: так это и приходит от pnpm.
  checker.results.summary = { critical: 0, high: 4, moderate: 3, low: 0, info: 0, total: 7, score: 0 };
  checker.results.auditStatus = 'ok';
  checker.config.acceptedVulnerabilities = accepted;
  return checker;
}

const EXTRACT_ZIP = [
  { id: 1, package: 'extract-zip', severity: 'high', title: 'symlink path traversal' },
  { id: 2, package: 'extract-zip', severity: 'high', title: 'arbitrary file writes' },
];
const MODERATES = [
  { id: 3, package: 'fflate', severity: 'moderate', title: 'infinite loop' },
  { id: 4, package: 'vitest', severity: 'moderate', title: 'path traversal' },
  { id: 5, package: '@vitest/mocker', severity: 'moderate', title: 'path traversal' },
];

const FUTURE = '2099-01-01';
const PAST = '2000-01-01';

test('счёт идёт по уникальным записям, а не по путям metadata', () => {
  const checker = checkerWith([...EXTRACT_ZIP, ...MODERATES], []);
  checker.applyAcceptedVulnerabilities();
  const eff = checker.effectiveSummary();
  // metadata говорила high 4 / total 7 — это пути. Записей пять, высоких две.
  assert.equal(eff.high, 2);
  assert.equal(eff.total, 5);
});

test('принятое вычитается из счёта и гейт зеленеет', () => {
  const checker = checkerWith(
    [...EXTRACT_ZIP, ...MODERATES],
    [{ package: 'extract-zip', reason: 'только разработка, починки нет', reviewBy: FUTURE }],
  );
  checker.applyAcceptedVulnerabilities();
  assert.equal(checker.results.accepted.length, 2);
  assert.equal(checker.effectiveSummary().high, 0);
  assert.equal(checker.getExitCode(), 0);
});

test('принятое остаётся в подробностях — вычесть не значит спрятать', () => {
  const checker = checkerWith(
    [...EXTRACT_ZIP, ...MODERATES],
    [{ package: 'extract-zip', reason: 'только разработка', reviewBy: FUTURE }],
  );
  checker.applyAcceptedVulnerabilities();
  const zips = checker.results.vulnerabilities.filter((v) => v.package === 'extract-zip');
  assert.equal(zips.length, 2, 'записи не выброшены из отчёта');
  assert.ok(zips.every((v) => v.accepted && v.accepted.reason));
});

test('просроченный пересмотр роняет гейт', () => {
  const checker = checkerWith(
    [...EXTRACT_ZIP, ...MODERATES],
    [{ package: 'extract-zip', reason: 'только разработка', reviewBy: PAST }],
  );
  checker.applyAcceptedVulnerabilities();
  assert.equal(checker.results.exceptionProblems.length, 1);
  assert.match(checker.results.exceptionProblems[0], /просрочено/);
  assert.equal(checker.getExitCode(), 1);
});

test('исключение, которому нечего гасить, роняет гейт', () => {
  const checker = checkerWith(
    MODERATES,
    [{ package: 'extract-zip', reason: 'только разработка', reviewBy: FUTURE }],
  );
  checker.applyAcceptedVulnerabilities();
  assert.match(checker.results.exceptionProblems[0], /нечего гасить/);
  assert.equal(checker.getExitCode(), 1);
});

test('исключение без причины или без даты не принимается', () => {
  for (const bad of [
    { package: 'extract-zip', reviewBy: FUTURE },
    { package: 'extract-zip', reason: 'потому что' },
  ]) {
    const checker = checkerWith([...EXTRACT_ZIP, ...MODERATES], [bad]);
    checker.applyAcceptedVulnerabilities();
    assert.equal(checker.results.accepted.length, 0);
    assert.match(checker.results.exceptionProblems[0], /reason.*reviewBy/);
    assert.equal(checker.getExitCode(), 1);
  }
});

test('без подробностей счёт остаётся по metadata — зелёного на неизвестном нет', () => {
  const checker = checkerWith([], []);
  checker.applyAcceptedVulnerabilities();
  const eff = checker.effectiveSummary();
  assert.equal(eff.high, 4, 'пустые подробности не превращаются в чистый счёт');
  assert.equal(checker.getExitCode(), 1);
});
