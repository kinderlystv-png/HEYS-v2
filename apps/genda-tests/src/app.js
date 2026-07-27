import {
  calculateResult,
  clearProgress,
  readProgress,
  shouldRevealAnswer,
  storageKey,
  writeProgress,
} from './logic.js';

const root = document.querySelector('#main');
let bank;
let session = null;

syncViewportMode();
bindThemeControl();
window.addEventListener('resize', syncViewportMode, { passive: true });
window.visualViewport?.addEventListener('resize', syncViewportMode, { passive: true });

try {
  const response = await fetch('./data/question-bank.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  bank = await response.json();
  const route = readRoute();
  if (route) startSession(route.testNumber, route.mode, false);
  else renderStart(false);
} catch (error) {
  root.innerHTML = `
    <section class="panel error-panel" role="alert">
      <p class="eyebrow">Не удалось открыть тренажёр</p>
      <h1>Вопросы временно недоступны</h1>
      <p>Обновите страницу. Если ошибка повторится, сообщите владельцу ссылки.</p>
      <button class="button button-primary" type="button" data-reload>Обновить страницу</button>
    </section>`;
  root.querySelector('[data-reload]').addEventListener('click', () => location.reload());
  console.error(error);
}

function syncViewportMode() {
  const width = window.visualViewport?.width || window.innerWidth;
  const mode = width <= 360 ? 'small' : width <= 520 ? 'mobile' : 'desktop';
  if (document.documentElement.dataset.viewport !== mode) {
    document.documentElement.dataset.viewport = mode;
  }
}

function bindThemeControl() {
  const toggle = document.querySelector('[data-theme-toggle]');
  if (!toggle || !window.GenDATheme) return;
  const update = (theme) => {
    toggle.querySelector('[data-theme-emoji]').textContent = theme === 'dark' ? '🌙' : '☀️';
    toggle.setAttribute('aria-label', `Тема: ${theme === 'dark' ? 'тёмная' : 'светлая'}. Переключить`);
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  };
  update(window.GenDATheme.readPreference());
  toggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    window.GenDATheme.setPreference(current === 'dark' ? 'light' : 'dark');
  });
  window.addEventListener('genda-theme-change', (event) => update(event.detail.resolved));
}

function renderStart(clearRoute = true) {
  if (clearRoute) history.replaceState(null, '', `${location.pathname}${location.search}`);
  session = null;
  root.innerHTML = `
    <section class="hero panel">
      <p class="eyebrow">Учебный тренажёр</p>
      <h1>${escapeHtml(bank.title)}</h1>
      <p class="lead">Два теста по 100 вопросов: изучайте разборы или проверьте себя без подсказок.</p>

      <form class="start-form" data-start-form>
        <fieldset>
          <legend>Выберите тест</legend>
          <div class="choice-grid choice-grid-tests">
            ${selectionCard('test', '1', 'Тест 1', '100 вопросов', true)}
            ${selectionCard('test', '2', 'Тест 2', '99 оцениваемых вопросов')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Выберите режим</legend>
          <div class="choice-grid">
            ${selectionCard('mode', 'learn', 'Обучение', 'Ответ, пояснение и источники видны сразу', true)}
            ${selectionCard('mode', 'exam', 'Контрольная', 'Отвечаете сами; разбор ошибки появляется сразу')}
          </div>
        </fieldset>
        <button class="button button-primary button-wide" type="submit">Начать тест</button>
      </form>

      <aside class="notice" aria-label="Ограничение">
        Материал предназначен для обучения и не заменяет медицинские рекомендации. Вероятность рядом с ответом отражает уверенность проверки, а не официальную оценку экзамена.
      </aside>
    </section>`;

  root.querySelector('[data-start-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startSession(Number(data.get('test')), String(data.get('mode')));
  });
}

function selectionCard(name, value, title, description, checked = false) {
  return `<label class="selection-card">
    <input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} />
    <span class="selection-copy"><strong>${title}</strong><small>${description}</small></span>
    <span class="radio-dot" aria-hidden="true"></span>
  </label>`;
}

function startSession(testNumber, mode, updateRoute = true) {
  if (updateRoute) history.replaceState(null, '', `#test=${testNumber}&mode=${mode}`);
  const questions = bank.questions.filter((question) => question.testNumber === testNumber);
  const key = storageKey(testNumber, mode);
  const saved = readProgress(localStorage, key);
  session = {
    testNumber,
    mode,
    questions,
    key,
    index: clamp(saved?.index ?? 0, 0, questions.length - 1),
    answers: saved?.answers && typeof saved.answers === 'object' ? saved.answers : {},
    completed: mode === 'exam' && saved?.completed === true,
  };
  if (session.completed) renderResults(); else renderQuestion();
}

function saveSession() {
  writeProgress(localStorage, session.key, {
    index: session.index,
    answers: session.answers,
    completed: session.completed,
  });
}

function renderQuestion() {
  const question = session.questions[session.index];
  const isLearn = session.mode === 'learn';
  const selected = session.answers[question.id] || null;
  const answeredCount = Object.keys(session.answers).filter((id) => session.questions.some((q) => q.id === id)).length;
  const gradableCount = session.questions.filter((item) => item.status === 'ready').length;

  root.innerHTML = `
    <section class="test-layout">
      <header class="test-toolbar">
        <button class="text-button" type="button" data-home aria-label="Вернуться к выбору теста">← К выбору</button>
        <div class="mode-label">Тест ${session.testNumber} · ${isLearn ? 'Обучение' : 'Контрольная'}</div>
      </header>

      <div class="progress-copy">
        <span>Вопрос ${question.number} из 100</span>
        <span>${isLearn ? `Пройдено ${session.index + 1}` : `Отвечено ${answeredCount} из ${gradableCount}`}</span>
      </div>
      <progress class="progress-track" max="100" value="${session.index + 1}" aria-label="Пройдено вопросов: ${session.index + 1} из 100"></progress>

      <article class="question-card panel">
        ${question.status === 'unavailable' ? unavailableMarkup(question) : questionMarkup(question, selected, isLearn)}
      </article>

      <details class="navigator panel-soft">
        <summary>Перейти к вопросу</summary>
        <div class="question-grid" aria-label="Номера вопросов">
          ${session.questions.map((item, index) => questionJump(item, index)).join('')}
        </div>
      </details>

      <nav class="bottom-actions" aria-label="Навигация по тесту">
        <button class="button button-secondary" type="button" data-previous ${session.index === 0 ? 'disabled' : ''}>Назад</button>
        ${session.index === session.questions.length - 1 && !isLearn
          ? '<button class="button button-primary" type="button" data-finish>Завершить</button>'
          : `<button class="button button-primary" type="button" data-next ${session.index === session.questions.length - 1 ? 'disabled' : ''}>Далее</button>`}
      </nav>
      ${!isLearn && session.index !== session.questions.length - 1 ? '<button class="finish-link text-button" type="button" data-finish>Завершить контрольную</button>' : ''}
    </section>`;

  bindQuestionEvents(question);
}

function questionMarkup(question, selected, isLearn) {
  const answerRevealed = shouldRevealAnswer(session.mode, selected);
  const examAnswered = !isLearn && answerRevealed;
  return `
    <p class="question-kicker">Вопрос ${question.number}</p>
    ${ocrGapMarkup(question)}
    <h1 class="question-title">${escapeHtml(question.prompt)}</h1>
    <div class="options" role="radiogroup" aria-label="Варианты ответа">
      ${question.options.map((option) => optionMarkup(question, option, selected, isLearn, examAnswered)).join('')}
    </div>
    ${isLearn ? learningDetails(question) : examAnswered ? examFeedback(question, selected) : ''}`;
}

function optionMarkup(question, option, selected, isLearn, examAnswered) {
  const isCorrect = option.id === question.correctOptionId;
  const isWrongSelection = examAnswered && selected === option.id && !isCorrect;
  const selectedClass = selected === option.id ? ' is-selected' : '';
  const correctClass = (isLearn || examAnswered) && isCorrect ? ' is-correct' : '';
  const wrongClass = isWrongSelection ? ' is-incorrect' : '';
  let marker = '';
  if (isLearn && isCorrect) marker = '<span class="answer-marker">✓ Верный ответ</span>';
  if (examAnswered && isCorrect) marker = `<span class="answer-marker">✓ ${selected === option.id ? 'Верно' : 'Правильный ответ'}</span>`;
  if (isWrongSelection) marker = '<span class="answer-marker answer-marker-wrong">× Ваш ответ</span>';
  return `<label class="option${selectedClass}${correctClass}${wrongClass}">
    <input type="radio" name="answer" value="${option.id}" ${selected === option.id ? 'checked' : ''} ${isLearn || examAnswered ? 'disabled' : ''} />
    <span class="option-letter" aria-hidden="true">${option.id.slice(1)}</span>
    <span class="option-text">${escapeHtml(option.text)}</span>
    ${marker}
  </label>`;
}

function examFeedback(question, selected) {
  if (selected === question.correctOptionId) {
    return `<section class="answer-details immediate-feedback correct-feedback" role="status">
      <strong>Верно. Ответ зафиксирован для этого прохождения.</strong>
    </section>`;
  }
  return `<div class="immediate-feedback" role="status">
    <p class="feedback-title"><strong>Ответ неверный.</strong> Правильный вариант показан выше; результат уже зафиксирован.</p>
    ${learningDetails(question)}
  </div>`;
}

function learningDetails(question) {
  const tier = confidenceLabel(question.confidenceTier);
  return `<section class="answer-details" aria-label="Разбор ответа">
    <div class="confidence"><strong>Уверенность: ${question.probabilityPercent}%</strong><span>${tier}</span></div>
    <p class="audit-status"><strong>${statusLabel(question.finalStatus)}</strong> · качество текста: ${escapeHtml(question.textQuality)}</p>
    <p>${escapeHtml(question.rationale)}</p>
    ${question.ambiguityNote ? `<p class="ambiguity"><strong>Важно:</strong> ${escapeHtml(question.ambiguityNote)}</p>` : ''}
    ${sourcesMarkup(question.sources)}
  </section>`;
}

function unavailableMarkup(question) {
  return `<div class="unavailable" role="note">
    <span class="unavailable-icon" aria-hidden="true">!</span>
    <p class="question-kicker">Вопрос ${question.number}</p>
    ${ocrGapMarkup(question)}
    <h1>Исходных данных недостаточно</h1>
    <p>Формулировка и варианты этого вопроса отсутствуют в доступной записи. Он сохранён в нумерации, но не учитывается в результате.</p>
  </div>`;
}

function questionJump(question, index) {
  const answered = Boolean(session.answers[question.id]);
  const classes = [index === session.index ? 'is-current' : '', answered ? 'is-answered' : '', question.status === 'unavailable' ? 'is-unavailable' : ''].filter(Boolean).join(' ');
  return `<button class="question-number ${classes}" type="button" data-jump="${index}" aria-label="Вопрос ${question.number}${answered ? ', отвечен' : ''}" ${index === session.index ? 'aria-current="step"' : ''}>${question.number}</button>`;
}

function bindQuestionEvents(question) {
  root.querySelector('[data-home]').addEventListener('click', renderStart);
  root.querySelector('[data-previous]')?.addEventListener('click', () => move(-1));
  root.querySelector('[data-next]')?.addEventListener('click', () => move(1));
  root.querySelectorAll('[data-finish]').forEach((button) => button.addEventListener('click', finishExam));
  root.querySelectorAll('[data-jump]').forEach((button) => button.addEventListener('click', () => {
    session.index = Number(button.dataset.jump);
    saveSession();
    renderQuestion();
    focusMain();
  }));
  if (session.mode === 'exam' && question.status === 'ready' && !session.answers[question.id]) {
    root.querySelectorAll('input[name="answer"]').forEach((input) => input.addEventListener('change', () => {
      session.answers[question.id] = input.value;
      saveSession();
      renderQuestion();
    }));
  }
}

function move(delta) {
  session.index = clamp(session.index + delta, 0, session.questions.length - 1);
  saveSession();
  renderQuestion();
  focusMain();
}

function finishExam() {
  const result = calculateResult(session.questions, session.answers);
  const message = result.skipped
    ? `Осталось без ответа: ${result.skipped}. Завершить контрольную и посмотреть результат?`
    : 'Завершить контрольную и посмотреть результат?';
  if (!window.confirm(message)) return;
  session.completed = true;
  saveSession();
  renderResults();
  focusMain();
}

function renderResults() {
  const result = calculateResult(session.questions, session.answers);
  const review = result.details.filter((detail) => detail.state !== 'correct');
  root.innerHTML = `
    <section class="results">
      <div class="panel results-summary">
        <p class="eyebrow">Контрольная завершена</p>
        <h1>${result.percent}% правильных ответов</h1>
        <p>Результат рассчитан по ${result.gradable} вопросам с проверенным ключом.</p>
        <div class="score-grid">
          ${scoreCard(result.correct, 'Правильно', 'score-correct')}
          ${scoreCard(result.incorrect, 'Неправильно', 'score-incorrect')}
          ${scoreCard(result.skipped, 'Без ответа', 'score-skipped')}
        </div>
        <div class="result-actions">
          <button class="button button-primary" type="button" data-restart>Пройти ещё раз</button>
          <button class="button button-secondary" type="button" data-home>Выбрать другой тест</button>
        </div>
      </div>

      <section class="review-section" aria-labelledby="review-title">
        <h2 id="review-title">Разбор ошибок${review.length ? ` · ${review.length}` : ''}</h2>
        ${review.length ? review.map(reviewMarkup).join('') : '<div class="panel perfect-result"><strong>Все оцениваемые вопросы отвечены правильно.</strong></div>'}
      </section>
    </section>`;

  root.querySelector('[data-home]').addEventListener('click', renderStart);
  root.querySelector('[data-restart]').addEventListener('click', () => {
    if (!window.confirm('Удалить сохранённые ответы и начать этот тест заново?')) return;
    clearProgress(localStorage, session.key);
    startSession(session.testNumber, session.mode);
    focusMain();
  });
}

function scoreCard(value, label, className) {
  return `<div class="score-card ${className}"><strong>${value}</strong><span>${label}</span></div>`;
}

function reviewMarkup({ question, selectedOptionId, state }) {
  const selected = question.options.find((option) => option.id === selectedOptionId)?.text || 'Ответ не выбран';
  const correct = question.options.find((option) => option.id === question.correctOptionId)?.text || question.answerText;
  return `<article class="panel review-card">
    <p class="question-kicker">Вопрос ${question.number} · ${state === 'skipped' ? 'Без ответа' : 'Неправильно'}</p>
    ${ocrGapMarkup(question)}
    <h3>${escapeHtml(question.prompt)}</h3>
    <dl>
      <div><dt>Ваш ответ</dt><dd>${escapeHtml(selected)}</dd></div>
      <div class="correct-row"><dt>Верный ответ</dt><dd>✓ ${escapeHtml(correct)}</dd></div>
    </dl>
    ${learningDetails(question)}
  </article>`;
}

function ocrGapMarkup(question) {
  const review = question.ocrReview;
  if (!review?.hasUnresolvedGap) return '';
  return `<aside class="ocr-gap-warning" role="note" aria-label="Пропуск в исходнике">
    <strong>⚠ Пропуск в исходнике.</strong>
    <span>Неоднозначный фрагмент не дополнен по логике.${review.note ? ` ${escapeHtml(review.note)}` : ''}</span>
  </aside>`;
}

function sourcesMarkup(sources) {
  if (!sources.length) return '<p class="sources-empty">Источники не указаны.</p>';
  return `<details class="sources"><summary>Источники · ${sources.length}</summary><ul>${sources.map((source, index) => {
    const label = source.title || `Источник ${index + 1}`;
    const meta = [source.organization, source.year].filter(Boolean).join(', ');
    return `<li><a href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</li>`;
  }).join('')}</ul></details>`;
}

function confidenceLabel(tier) {
  return { high: 'высокая', medium: 'средняя', low: 'низкая' }[tier] || 'не определена';
}

function statusLabel(status) {
  return {
    VERIFIED_STRONG: 'Подтверждено',
    VERIFIED_WITH_LIMITATIONS: 'Подтверждено с ограничениями',
    TEST_LOGIC_ONLY: 'Учебная логика теста',
    OCR_BLOCKED: 'Ограничено качеством OCR',
    SOURCE_CONFLICT: 'Источники расходятся',
    UNRESOLVED: 'Не определено',
  }[status] || status || 'Статус не указан';
}

function readRoute() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const testNumber = Number(params.get('test'));
  const mode = params.get('mode');
  return [1, 2].includes(testNumber) && ['learn', 'exam'].includes(mode) ? { testNumber, mode } : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function focusMain() {
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function escapeAttribute(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#';
  } catch {
    return '#';
  }
}
