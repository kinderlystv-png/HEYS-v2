/**
 * Log Level Control for HEYS Platform
 * Система контроля уровней логирования
 */

// Уровни логирования согласно RFC 5424
const LOG_LEVELS = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10
};

// Текущий уровень логирования
let currentLevel = process.env.LOG_LEVEL || 'info';

// Проверка включенности уровня
const isLevelEnabled = (level) => {
  const levelValue = LOG_LEVELS[level] || 0;
  const currentValue = LOG_LEVELS[currentLevel] || 30;
  return levelValue >= currentValue;
};

// Установка уровня
const setLevel = (level) => {
  if (LOG_LEVELS[level] !== undefined) {
    currentLevel = level;
    return true;
  }
  return false;
};

// Получение текущего уровня
const getLevel = () => currentLevel;

// Экспорт для CommonJS и ES6
module.exports = {
  LOG_LEVELS,
  isLevelEnabled,
  setLevel,
  getLevel,
  currentLevel
};

// ES6 default export
if (typeof exports === 'object') {
  exports.default = {
    LOG_LEVELS,
    isLevelEnabled,
    setLevel,
    getLevel,
    currentLevel
  };
}
