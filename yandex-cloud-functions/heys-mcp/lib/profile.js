'use strict';

/**
 * Карточка клиента: профиль (`heys_profile`), нормы (`heys_norms`) и пульсовые
 * зоны (`heys_hr_zones`) — то, что куратор до сих пор вбивал руками во вкладке
 * «Пользователь».
 *
 * Два решения определяют модуль.
 *
 * **Пишем полями, а не блобом.** Модель получает whitelist известных полей с
 * диапазонами из apps/web/heys_user_v12.js (PROFILE_VALIDATORS); всё остальное
 * в присланном объекте игнорируется. `heys_profile` — исторически самый
 * «загрязняемый» ключ проекта, и запись целым блобом из модели означала бы
 * ровно тот класс инцидентов, против которого в приложении построена защита.
 *
 * **Обновление идёт через merge, а не upsert.** Все три ключа входят в
 * MERGEABLE_KEY_RE приложения (apps/web/heys_storage_supabase_v1.js), и сервер
 * сливает их через mergeScalarKv: победитель выбирается по `updatedAt` на
 * уровне поля. Поэтому патч = прочитать текущее значение, наложить свои поля,
 * поставить свежий `updatedAt` — тогда параллельно открытое приложение не
 * потеряет поля, которых мы не касались.
 */

const PROFILE_KEY = 'heys_profile';
const NORMS_KEY = 'heys_norms';
const ZONES_KEY = 'heys_hr_zones';

/** Пол хранится русскими словами — так его пишет и читает приложение. */
const GENDERS = ['Мужской', 'Женский'];

/**
 * Дефолт зон повторяет apps/web/heys_user_v12.js: если клиент их не трогал, в
 * облаке ключа нет вовсе, и патч должен лечь на ту же сетку, что показывает UI.
 */
const DEFAULT_ZONES = [
  { name: 'Бытовая активность (ходьба)', hrFrom: 85, hrTo: 99, MET: 2 },
  { name: 'Умеренная активность (медленный бег)', hrFrom: 100, hrTo: 119, MET: 3 },
  { name: 'Аэробная (кардио)', hrFrom: 120, hrTo: 139, MET: 5 },
  { name: 'Анаэробная (активная нагрузка, когда тяжело)', hrFrom: 140, hrTo: 181, MET: 8 },
];

/**
 * Диапазоны повторяют PROFILE_VALIDATORS приложения. Имя клиента здесь
 * намеренно отсутствует: оно живёт в таблице `clients` и меняется отдельным
 * кураторским путём, а правка его копии в профиле рассинхронизировала бы две
 * записи об одном человеке.
 */
const PROFILE_FIELDS = {
  gender: { type: 'enum', values: GENDERS, label: 'пол' },
  birth_date: { type: 'date', target: 'birthDate', label: 'дата рождения' },
  age: { type: 'number', min: 0, max: 150, label: 'возраст' },
  height: { type: 'number', min: 50, max: 300, label: 'рост, см' },
  weight: { type: 'number', min: 20, max: 500, label: 'вес, кг' },
  base_weight: { type: 'number', target: 'baseWeight', min: 20, max: 500, label: 'базовый вес, кг' },
  weight_goal: { type: 'number', target: 'weightGoal', min: 0, max: 500, label: 'целевой вес, кг' },
  sleep_hours: { type: 'number', target: 'sleepHours', min: 0, max: 24, label: 'норма сна, ч' },
  insulin_wave_hours: { type: 'number', target: 'insulinWaveHours', min: 0.5, max: 12, label: 'инсулиновая волна, ч' },
  deficit_pct_target: { type: 'number', target: 'deficitPctTarget', min: -50, max: 50, label: 'целевой дефицит, %' },
  steps_goal: { type: 'number', target: 'stepsGoal', min: 0, max: 50000, label: 'цель по шагам' },
  cycle_tracking_enabled: { type: 'boolean', target: 'cycleTrackingEnabled', label: 'трекинг цикла' },
  measurements_tracking_enabled: { type: 'boolean', target: 'measurementsTrackingEnabled', label: 'трекинг замеров тела' },
  supplements_tracking_enabled: { type: 'boolean', target: 'supplementsTrackingEnabled', label: 'трекинг добавок' },
  desktop_allowed: { type: 'boolean', target: 'desktopAllowed', label: 'доступ с десктопа' },
};

/** Нормы — доли от суточной калорийности и пороги качества рациона, все в %. */
const NORMS_FIELDS = {
  protein_pct: { type: 'number', target: 'proteinPct', min: 0, max: 100, label: 'белок, %' },
  carbs_pct: { type: 'number', target: 'carbsPct', min: 0, max: 100, label: 'углеводы, %' },
  simple_carb_pct: { type: 'number', target: 'simpleCarbPct', min: 0, max: 100, label: 'простые углеводы, %' },
  fiber_pct: { type: 'number', target: 'fiberPct', min: 0, max: 100, label: 'клетчатка, %' },
  bad_fat_pct: { type: 'number', target: 'badFatPct', min: 0, max: 100, label: 'насыщенные жиры, %' },
  superbad_fat_pct: { type: 'number', target: 'superbadFatPct', min: 0, max: 100, label: 'транс-жиры, %' },
  gi_pct: { type: 'number', target: 'giPct', min: 0, max: 100, label: 'гликемический индекс, %' },
  harm_pct: { type: 'number', target: 'harmPct', min: 0, max: 100, label: 'вредность, %' },
};

class ProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(value));
}

function coerce(publicName, spec, raw) {
  if (spec.type === 'enum') {
    const value = String(raw).trim();
    const hit = spec.values.find((v) => v.toLowerCase() === value.toLowerCase());
    if (!hit) throw new ProfileError('invalid_value', `${publicName}: допустимо только ${spec.values.join(' или ')}.`);
    return hit;
  }
  if (spec.type === 'date') {
    const value = String(raw).trim();
    if (!isValidDate(value)) throw new ProfileError('invalid_value', `${publicName}: дата должна быть в формате YYYY-MM-DD.`);
    return value;
  }
  if (spec.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    throw new ProfileError('invalid_value', `${publicName}: нужно true или false.`);
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) throw new ProfileError('invalid_value', `${publicName}: нужно число.`);
  if (num < spec.min || num > spec.max) {
    throw new ProfileError('invalid_value', `${publicName}: допустим диапазон ${spec.min}–${spec.max}, пришло ${num}.`);
  }
  return Math.round(num * 100) / 100;
}

/**
 * Патч по whitelist. Возвращает и новое значение, и человекочитаемый список
 * изменений: он идёт в ответ куратору, чтобы промах было видно сразу, а не
 * после того, как клиент пожалуется на чужую норму.
 */
function applyFields(current, fields, schema, nowMs) {
  const base = (current && typeof current === 'object' && !Array.isArray(current)) ? { ...current } : {};
  const next = { ...base };
  const changed = [];
  const ignored = [];

  for (const [publicName, raw] of Object.entries(fields || {})) {
    if (raw === undefined || raw === null || raw === '') continue;
    const spec = schema[publicName];
    if (!spec) {
      ignored.push(publicName);
      continue;
    }
    const target = spec.target || publicName;
    const value = coerce(publicName, spec, raw);
    if (base[target] === value) continue;
    next[target] = value;
    changed.push(`${spec.label}: ${base[target] === undefined ? '—' : base[target]} → ${value}`);
  }

  if (!changed.length) return { value: current, changed, ignored };
  next.updatedAt = nowMs;
  return { value: next, changed, ignored };
}

function applyProfileFields(current, fields, nowMs) {
  if (fields && Object.prototype.hasOwnProperty.call(fields, 'cycle_tracking_enabled')) {
    // prompt-cycle-removal: cannot enable or change cycle tracking flag in this release.
    throw new ProfileError(
      'cycle_tracking_removed',
      'Трекинг менструального цикла снят с релиза: cycle_tracking_enabled не пишется. Функция вернётся после релиза в архитектуре device-only.',
    );
  }
  return applyFields(current, fields, PROFILE_FIELDS, nowMs);
}

function applyNormsFields(current, fields, nowMs) {
  return applyFields(current, fields, NORMS_FIELDS, nowMs);
}

/**
 * Зоны — массив из четырёх строк фиксированного смысла (бытовая, умеренная,
 * аэробная, анаэробная). Правится точечно по индексу: прислать весь массив
 * значило бы дать модели переписать названия и MET, которые она не проверяла.
 */
function applyZonePatches(currentZones, patches, defaults = DEFAULT_ZONES) {
  const zones = (Array.isArray(currentZones) && currentZones.length ? currentZones : defaults).map((z) => ({ ...z }));
  const changed = [];

  for (const patch of patches || []) {
    const index = Number(patch && patch.zone) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= zones.length) {
      throw new ProfileError('invalid_zone', `zone должен быть от 1 до ${zones.length}.`);
    }
    const zone = zones[index];
    for (const [publicName, target, min, max] of [['hr_from', 'hrFrom', 20, 250], ['hr_to', 'hrTo', 20, 250], ['met', 'MET', 0.5, 20]]) {
      const raw = patch[publicName];
      if (raw === undefined || raw === null || raw === '') continue;
      const num = Number(raw);
      if (!Number.isFinite(num) || num < min || num > max) {
        throw new ProfileError('invalid_value', `Зона ${index + 1}, ${publicName}: допустим диапазон ${min}–${max}.`);
      }
      if (zone[target] === num) continue;
      zone[target] = num;
      changed.push(`зона ${index + 1} (${zone.name || ''}) ${publicName}: → ${num}`);
    }
    if (zone.hrFrom !== undefined && zone.hrTo !== undefined && Number(zone.hrFrom) > Number(zone.hrTo)) {
      throw new ProfileError('invalid_zone_range', `Зона ${index + 1}: нижняя граница пульса больше верхней.`);
    }
  }

  return { value: zones, changed };
}

/** Возраст из даты рождения — приложение считает его так же и перекрывает поле age. */
function ageFromBirthDate(birthDate, nowMs) {
  if (!isValidDate(birthDate)) return null;
  const birth = new Date(birthDate);
  const now = new Date(nowMs);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

/** Компактная карточка для ответа модели: только то, что куратор реально ведёт. */
function describeCard(profile, norms, zones, nowMs) {
  const p = (profile && typeof profile === 'object') ? profile : {};
  const n = (norms && typeof norms === 'object') ? norms : {};
  const derivedAge = ageFromBirthDate(p.birthDate, nowMs);

  const profileOut = {};
  for (const [publicName, spec] of Object.entries(PROFILE_FIELDS)) {
    const value = p[spec.target || publicName];
    profileOut[publicName] = value === undefined ? null : value;
  }
  if (derivedAge !== null) profileOut.age = derivedAge;
  profileOut.planned_supplements = Array.isArray(p.plannedSupplements) ? p.plannedSupplements : [];

  const normsOut = {};
  for (const [publicName, spec] of Object.entries(NORMS_FIELDS)) {
    const value = n[spec.target || publicName];
    normsOut[publicName] = value === undefined ? null : value;
  }

  return {
    profile: profileOut,
    norms: normsOut,
    hr_zones: (Array.isArray(zones) ? zones : []).map((z, i) => ({
      zone: i + 1,
      name: (z && z.name) || '',
      hr_from: z && z.hrFrom,
      hr_to: z && z.hrTo,
      met: z && z.MET,
    })),
  };
}

module.exports = {
  PROFILE_KEY,
  NORMS_KEY,
  ZONES_KEY,
  PROFILE_FIELDS,
  NORMS_FIELDS,
  GENDERS,
  DEFAULT_ZONES,
  ProfileError,
  applyProfileFields,
  applyNormsFields,
  applyZonePatches,
  ageFromBirthDate,
  describeCard,
};
