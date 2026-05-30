// heys_fingers_grips_catalog_v1.js — Каталог 8 хватов с биомеханикой и риск-профилем.
// Wave 2-A: статичный массив + хелперы lookup.
//
// Public API:
//   HEYS.Fingers.GRIPS                — массив 8 хватов
//   HEYS.Fingers.getGripById(id)      — lookup
//   HEYS.Fingers.GRIPS_BY_ID          — index id → grip
//
// Формат:
//   { id, label, icon, primaryMuscles, a2ForceRatio, dangerLevel, minAge, sourceIds, methodTips }
//
// a2ForceRatio — отношение нагрузки на блок A2 к open-hand baseline (Schweizer 2008).
// dangerLevel  — 'low' | 'moderate' | 'high' | 'very-high'.
// minAge       — минимальный возраст по UIAA 2018 / BMC 2019.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__gripsCatalogRegistered) return; // idempotent
  Fingers.__gripsCatalogRegistered = true;

  /** @type {Array<{id:string,label:string,icon:string,primaryMuscles:string[],a2ForceRatio:number,dangerLevel:string,minAge:number,sourceIds:string[],methodTips:string}>} */
  const GRIPS = [
    {
      id: 'openhand4',
      label: 'Открытый 4-палец',
      icon: '🖐',
      primaryMuscles: ['FDS', 'FDP', 'lumbricals', 'brachioradialis'],
      a2ForceRatio: 1.0,
      dangerLevel: 'low',
      minAge: 14,
      sourceIds: ['schweizer2008', 'horst_753'],
      methodTips: 'Безопасный базовый хват: все 4 пальца на одной щёчке, межфаланговые суставы расслаблены. Лучше всего для длительных висов и repeaters.'
    },
    {
      id: 'halfcrimp',
      label: 'Полузамок',
      icon: '✊',
      primaryMuscles: ['FDP', 'FDS', 'lumbricals'],
      a2ForceRatio: 4.0,
      dangerLevel: 'moderate',
      minAge: 14,
      sourceIds: ['schweizer2008', 'horst_753'],
      methodTips: 'Первая фаланга вертикально, вторая под ~90°. Самый универсальный хват — большинство движений на скалах. Чередуй с открытым.'
    },
    {
      id: 'fullcrimp',
      label: 'Замок (full crimp)',
      icon: '👊',
      primaryMuscles: ['FDP', 'FDS', 'lumbricals'],
      a2ForceRatio: 33.0,
      dangerLevel: 'very-high',
      minAge: 18,
      sourceIds: ['schweizer2008', 'schoffl2021', 'uiaa_medcom'],
      methodTips: 'Большой палец накрывает указательный сверху. Сила огромная, но и нагрузка на A2 в 33 раза выше open-hand. Используй экономно и только для проекта.'
    },
    {
      id: 'front3',
      label: 'Front-3 (передние 3)',
      icon: '🤟',
      primaryMuscles: ['FDP', 'FDS', 'lumbricals'],
      a2ForceRatio: 1.4,
      dangerLevel: 'moderate',
      minAge: 14,
      sourceIds: ['schweizer2008', 'beastmaker_1000'],
      methodTips: 'Указательный + средний + безымянный, мизинец свободен. Чуть менее нагружен на A2 чем full hand, но больше на каждый отдельный палец.'
    },
    {
      id: 'back3',
      label: 'Back-3 (задние 3)',
      icon: '🖖',
      primaryMuscles: ['FDP', 'FDS', 'lumbricals'],
      a2ForceRatio: 1.6,
      dangerLevel: 'high',
      minAge: 16,
      sourceIds: ['schweizer2008', 'schoffl2021'],
      methodTips: 'Средний + безымянный + мизинец. Высокий риск для A2 мизинца (анатомически слабее остальных). Не злоупотребляй.'
    },
    {
      id: 'mono',
      label: 'Mono (1 палец)',
      icon: '☝️',
      primaryMuscles: ['FDP', 'FDS', 'lumbricals'],
      a2ForceRatio: 8.0,
      dangerLevel: 'very-high',
      minAge: 18,
      sourceIds: ['schweizer2008', 'schoffl2021', 'uiaa_medcom'],
      methodTips: 'Только указательный или средний палец. Очень высокий риск разрыва A2 и A4. Используй ТОЛЬКО для специфических проектов после 2+ лет опыта.'
    },
    {
      id: 'pinch',
      label: 'Pinch (зажим)',
      icon: '🤏',
      primaryMuscles: ['FDP', 'FDS', 'thumb adductor', 'FCR'],
      a2ForceRatio: 0.8,
      dangerLevel: 'low',
      minAge: 14,
      sourceIds: ['lopez2019', 'lattice_critical_force'],
      methodTips: 'Сжатие большим пальцем напротив остальных. Развивает оппозицию и силу большого. Низкий риск для A2, но нагружает кисть и предплечье.'
    },
    {
      id: 'sloper',
      label: 'Sloper (покатость)',
      icon: '🫳',
      primaryMuscles: ['FDP', 'FDS', 'lumbricals', 'shoulder stabilizers'],
      a2ForceRatio: 0.5,
      dangerLevel: 'low',
      minAge: 14,
      sourceIds: ['beastmaker_1000', 'lopez2019'],
      methodTips: 'Открытая ладонь на покатой поверхности. Главная нагрузка — на сцепление кожи и стабилизаторы плеча. A2 почти не нагружается.'
    }
  ];

  const GRIPS_BY_ID = Object.create(null);
  GRIPS.forEach(function (g) { GRIPS_BY_ID[g.id] = g; });

  function getGripById(id) {
    return GRIPS_BY_ID[id] || null;
  }

  // === Экспорт ===
  Fingers.GRIPS = GRIPS;
  Fingers.GRIPS_BY_ID = GRIPS_BY_ID;
  Fingers.getGripById = getGripById;
})(typeof window !== 'undefined' ? window : globalThis);
