'use strict';

/**
 * Кураторская административка: заведение клиента, PIN, подписки, очередь
 * триала, лиды с лендинга.
 *
 * Модуль намеренно чисто-функциональный: нормализация телефона, правила PIN и
 * его хеширование повторяют apps/web/heys_auth_v1.js один в один. Разойтись
 * здесь нельзя — клиент, заведённый коннектором с другой схемой хеша, просто
 * не сможет войти, и понять это можно будет только по жалобе.
 *
 * Отдельное решение — про секреты. PIN и ссылка доступа возвращаются в ответе
 * инструмента и, значит, остаются в истории чата. Поэтому инструменты, которые
 * их выдают, требуют явного подтверждения аргументом, а ответ несёт
 * предупреждение: это осознанный компромисс, а не недосмотр.
 */

const crypto = require('node:crypto');

/** Слабые PIN — тот же список, что в приложении при создании и смене PIN. */
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '0123', '1234', '2345', '3456', '4567', '5678', '6789',
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',
  '2580', '0852', '1379', '9731', '1397', '7913',
]);

/** RU-нормализация: 8XXXXXXXXXX и +7XXXXXXXXXX сводятся к 7XXXXXXXXXX. */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') return `7${digits.slice(1)}`;
  if (digits.length === 11 && digits[0] === '7') return digits;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function isValidPhone(raw) {
  return /^7\d{10}$/.test(normalizePhone(raw));
}

function formatPhone(raw) {
  const p = normalizePhone(raw);
  if (!/^7\d{10}$/.test(p)) return String(raw || '');
  const d = p.slice(1);
  return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}

function isWeakPin(pin) {
  return WEAK_PINS.has(String(pin || ''));
}

function validatePinStrict(pin) {
  return /^\d{4}$/.test(String(pin || '')) && !isWeakPin(pin);
}

/** Случайный PIN, который пройдёт те же правила, что и введённый вручную. */
function generatePin(randomInt = (max) => crypto.randomInt(max)) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pin = String(randomInt(10000)).padStart(4, '0');
    if (validatePinStrict(pin)) return pin;
  }
  return '5194'; // недостижимо на честном генераторе, но лучше числа, чем исключения
}

function generateSalt(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Схема хеша задана приложением: sha256(`${pin}:${salt}`), hex. */
function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(`${String(pin)}:${String(salt)}`, 'utf8').digest('hex');
}

/**
 * Строка ответа про выданный секрет. Одинаковая для PIN и ссылки доступа:
 * куратор должен видеть, что значение осталось в переписке, ровно там, где он
 * его получил.
 */
const SECRET_WARNING = 'Значение осталось в истории этого чата — передай его клиенту и не пересылай дальше.';

/** Понятная строка статуса подписки — из того, что отдают admin_*-функции. */
function describeSubscription(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    status: row.new_status || row.subscription_status || row.status || null,
    active_until: row.new_end_date || row.active_until || row.trial_ends_at || null,
  };
}

module.exports = {
  WEAK_PINS,
  SECRET_WARNING,
  normalizePhone,
  isValidPhone,
  formatPhone,
  isWeakPin,
  validatePinStrict,
  generatePin,
  generateSalt,
  hashPin,
  describeSubscription,
};
