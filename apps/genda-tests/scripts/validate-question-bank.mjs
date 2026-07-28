import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bankPath = process.argv[2] || path.join(appRoot, 'src/data/question-bank.json');
const bank = JSON.parse(await readFile(bankPath, 'utf8'));
const errors = [];

if (bank.schemaVersion !== 3) errors.push('schemaVersion должен быть равен 3');
if (bank.sourceOfTruth !== true) errors.push('sourceOfTruth должен быть true');
if (!Array.isArray(bank.questions)) errors.push('questions должен быть массивом');

const questions = Array.isArray(bank.questions) ? bank.questions : [];
const ids = new Set();
for (const question of questions) {
  if (ids.has(question.id)) errors.push(`Повторный id: ${question.id}`);
  ids.add(question.id);
  if (![1, 2].includes(question.testNumber)) errors.push(`Некорректный testNumber: ${question.id}`);
  if (!Number.isInteger(question.number) || question.number < 1 || question.number > 100) {
    errors.push(`Некорректный номер: ${question.id}`);
  }
  if (typeof question.prompt !== 'string' || !question.prompt.trim()) errors.push(`Пустой prompt: ${question.id}`);
  if (question.ocrReview?.reviewed !== true) errors.push(`Нет отметки OCR-вычитки: ${question.id}`);
  if (question.ocrReview?.hasUnresolvedGap === true && !question.ocrReview.note?.trim()) {
    errors.push(`Нет пояснения к OCR-пропуску: ${question.id}`);
  }
  if (!Array.isArray(question.options)) errors.push(`options не массив: ${question.id}`);
  else {
    const optionIds = new Set();
    for (const option of question.options) {
      if (typeof option.id !== 'string' || !option.id) errors.push(`Пустой id варианта: ${question.id}`);
      if (optionIds.has(option.id)) errors.push(`Повторный id варианта: ${question.id}/${option.id}`);
      optionIds.add(option.id);
      if (typeof option.text !== 'string' || !option.text.trim()) errors.push(`Пустой текст варианта: ${question.id}`);
    }
  }

  if (question.status === 'ready') {
    if (!question.options.some((option) => option.id === question.correctOptionId)) {
      errors.push(`Правильный вариант отсутствует: ${question.id}`);
    }
    if (!Number.isInteger(question.probabilityPercent) || question.probabilityPercent < 0 || question.probabilityPercent > 100) {
      errors.push(`Некорректная вероятность: ${question.id}`);
    }
    if (!['high', 'medium', 'low'].includes(question.confidenceTier)) errors.push(`Некорректная уверенность: ${question.id}`);
    if (!['VERIFIED_STRONG', 'VERIFIED_WITH_LIMITATIONS', 'TEST_LOGIC_ONLY', 'OCR_BLOCKED', 'SOURCE_CONFLICT'].includes(question.finalStatus)) {
      errors.push(`Некорректный итоговый статус: ${question.id}`);
    }
    if (typeof question.textQuality !== 'string' || !question.textQuality) errors.push(`Нет качества текста: ${question.id}`);
    if (typeof question.rationale !== 'string' || !question.rationale.trim()) errors.push(`Пустое пояснение: ${question.id}`);
    if (typeof question.ambiguityNote !== 'string') errors.push(`Некорректная пометка спорности: ${question.id}`);
    if (!Array.isArray(question.sources) || question.sources.some((source) => (
      !source || typeof source.title !== 'string' || typeof source.url !== 'string'
    ))) {
      errors.push(`Некорректные источники: ${question.id}`);
    }
    if (question.probabilityPercent > 84 && question.sources.length === 0) {
      errors.push(`Нет источника при уверенности >84%: ${question.id}`);
    }
    if (question.probabilityPercent < 85 && !question.ambiguityNote.trim()) {
      errors.push(`Нет объяснения ограничения при уверенности <85%: ${question.id}`);
    }
  } else if (question.status === 'unavailable') {
    if (question.correctOptionId !== null) errors.push(`Unavailable имеет ключ: ${question.id}`);
    if (question.finalStatus !== 'UNRESOLVED') errors.push(`Unavailable должен быть UNRESOLVED: ${question.id}`);
  } else {
    errors.push(`Неизвестный status: ${question.id}`);
  }
}

for (const testNumber of [1, 2]) {
  const testQuestions = questions.filter((question) => question.testNumber === testNumber);
  if (testQuestions.length !== 100) errors.push(`Тест ${testNumber}: ожидалось 100, получено ${testQuestions.length}`);
  const numbers = new Set(testQuestions.map((question) => question.number));
  for (let number = 1; number <= 100; number += 1) {
    if (!numbers.has(number)) errors.push(`Тест ${testNumber}: отсутствует №${number}`);
  }
}

const ready = questions.filter((question) => question.status === 'ready');
const unavailable = questions.filter((question) => question.status === 'unavailable');
if (questions.length !== 200) errors.push(`Всего ожидалось 200, получено ${questions.length}`);
if (ready.length !== 199) errors.push(`Оцениваемых ожидалось 199, получено ${ready.length}`);
if (unavailable.length !== 1) errors.push(`Unavailable ожидался 1, получено ${unavailable.length}`);
if (unavailable[0]?.testNumber !== 2 || unavailable[0]?.number !== 1) {
  errors.push('Unavailable должен быть тест 2, вопрос 1');
}

for (const token of ['5', '7', '8']) {
  if (!questions.some((question) => question.options.some((option) => option.text === token))) {
    errors.push(`Не найден односимвольный вариант «${token}»`);
  }
}

const expectedChangedKeys = new Map([
  ['test-1-question-083', 'o4'],
  ['test-2-question-006', 'o3'],
  ['test-2-question-034', 'o3'],
  ['test-2-question-051', 'o5'],
]);
for (const [id, optionId] of expectedChangedKeys) {
  const question = questions.find((item) => item.id === id);
  if (question?.correctOptionId !== optionId) {
    errors.push(`Не применён финальный ключ аудита: ${id} → ${optionId}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`OK: 2×100, оцениваемых ${ready.length}, unavailable ${unavailable.length}, ID уникальны`);
