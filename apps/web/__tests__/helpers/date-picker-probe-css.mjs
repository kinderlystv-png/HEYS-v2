/**
 * Минимальный CSS для computed-пробы date-picker (polosa6, smoke).
 * Полный 000-base-and-gamification.css happy-dom парсит секунды; под
 * contention deploy-контура это гонка с testTimeout 5s (TOCTOU: стили ещё
 * не в каскаде — тест падает по timeout, не по assertion).
 */
export function sliceDatePickerProbeCss(fullCss) {
  const chunks = new Set();

  // Плоские правила и селекторы с атрибутами набора.
  const flatRe = /(?:^|[\n}])([^{@\n][^{]*date-picker[^{]*)\{([^}]*)\}/g;
  for (const m of fullCss.matchAll(flatRe)) {
    chunks.add(`${m[1].trim()}{${m[2]}}`);
  }

  // @media-блоки, где внутри есть date-picker (375px min-height и т.д.).
  const mediaRe = /@media[^{]+\{([\s\S]*?)\n\}/g;
  for (const m of fullCss.matchAll(mediaRe)) {
    if (m[0].includes('date-picker')) chunks.add(m[0]);
  }

  return [...chunks].join('\n');
}
