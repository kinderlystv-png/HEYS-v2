import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bank = JSON.parse(await readFile(new URL('../src/data/question-bank.json', import.meta.url), 'utf8'));

test('банк содержит два теста по 100 вопросов и один unavailable', () => {
  assert.equal(bank.questions.length, 200);
  assert.equal(bank.questions.filter((q) => q.testNumber === 1).length, 100);
  assert.equal(bank.questions.filter((q) => q.testNumber === 2).length, 100);
  assert.equal(bank.questions.filter((q) => q.status === 'ready').length, 199);
  assert.deepEqual(
    bank.questions.filter((q) => q.status === 'unavailable').map((q) => [q.testNumber, q.number]),
    [[2, 1]],
  );
});

test('каждый оцениваемый ключ указывает на существующий вариант', () => {
  for (const question of bank.questions.filter((q) => q.status === 'ready')) {
    assert.ok(question.options.some((option) => option.id === question.correctOptionId), question.id);
  }
});

test('все 200 вопросов вычитаны, а неоднозначные пропуски имеют пояснение', () => {
  assert.equal(bank.schemaVersion, 3);
  assert.equal(bank.questions.filter((q) => q.ocrReview?.reviewed === true).length, 200);
  const gaps = bank.questions.filter((q) => q.ocrReview?.hasUnresolvedGap);
  assert.ok(gaps.length > 0);
  assert.ok(gaps.every((q) => q.ocrReview.note.trim()));
  assert.equal(
    bank.questions.find((q) => q.id === 'test-2-question-004').ocrReview.hasUnresolvedGap,
    true,
  );
});

test('OCR-вычитка восстановила начало вопросов 1.9 и 1.10', () => {
  assert.match(bank.questions.find((q) => q.id === 'test-1-question-009').prompt, /^В отделении патологии/);
  assert.match(bank.questions.find((q) => q.id === 'test-1-question-010').prompt, /^Родители ребенка/);
});

test('односимвольные варианты 5, 7 и 8 сохранены', () => {
  const options = bank.questions.flatMap((q) => q.options.map((option) => option.text));
  for (const token of ['5', '7', '8']) assert.ok(options.includes(token), token);
});

test('четыре исправленных ключа совпадают с финальным аудитом', () => {
  const expected = new Map([
    ['test-1-question-083', ['o4', 'Лазеркоагуляция сетчатки']],
    ['test-2-question-006', ['o3', 'Монофокальные очки OU sph (+) 3,0 D']],
    ['test-2-question-034', ['o3', 'Рано приобретённая медленно прогрессирующая изометропическая миопия высокой степени']],
    ['test-2-question-051', ['o5', 'Врождённая глаукома, развитая стадия, с умеренно повышенным давлением']],
  ]);
  for (const [id, [optionId, answerText]] of expected) {
    const question = bank.questions.find((item) => item.id === id);
    assert.equal(question.correctOptionId, optionId, id);
    assert.equal(question.answerText, answerText, id);
    assert.equal(question.options.find((option) => option.id === optionId)?.text, answerText, id);
  }
});

test('вопрос 2.83 ссылается на профильные источники профилактики офтальмии', () => {
  const question = bank.questions.find((item) => item.id === 'test-2-question-083');
  assert.equal(question.clinicalTopic, 'Неонатальная инфекция глаза');
  assert.ok(question.sources.some((source) => source.organization === 'World Health Organization'));
  assert.ok(question.sources.every((source) => /^https:\/\//.test(source.url)));
});
