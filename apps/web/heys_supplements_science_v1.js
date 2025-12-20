// heys_supplements_science_v1.js — Научное расширение модуля витаминов
// Версия: 1.0.0 | Дата: 2025-12-14
// Биодоступность, циркадные ритмы, 50+ взаимодействий, дефициты по симптомам
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Ждём загрузки основного модуля
  if (!HEYS.Supplements) {
    console.warn('[HEYS] Supplements Science: основной модуль не загружен');
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔬 НАУЧНАЯ БАЗА ДАННЫХ — БИОДОСТУПНОСТЬ
  // ═══════════════════════════════════════════════════════════════════════════
  
  const BIOAVAILABILITY = {
    // Витамин D3
    vitD: {
      baseAbsorption: 0.5,           // 50% базовая абсорбция
      withFat: 0.8,                   // 80% с жирной едой
      optimalFatGrams: 15,            // Оптимально 15г жира
      minFatGrams: 5,                 // Минимум 5г для эффекта
      halfLife: '2-3 недели',         // Период полувыведения
      storage: 'жировая ткань',
      toxicityRisk: 'низкий при <10000 IU/день',
      synergists: ['vitK2', 'magnesium', 'calcium'],
      mechanism: 'Холекальциферол абсорбируется в тонком кишечнике через мицеллы желчных кислот. Жиры стимулируют выброс желчи → увеличение мицелл → лучшая абсорбция.',
      optimalDose: '1000-4000 IU/день',
      testMarker: '25(OH)D в крови',
      optimalLevel: '40-60 нг/мл'
    },
    
    // Витамин K2 (MK-7)
    vitK2: {
      baseAbsorption: 0.3,
      withFat: 0.7,
      optimalFatGrams: 10,
      minFatGrams: 3,
      halfLife: '3 дня (MK-7)',
      storage: 'минимальный',
      synergists: ['vitD', 'calcium'],
      mechanism: 'K2 активирует остеокальцин (направляет Ca в кости) и MGP (убирает Ca из артерий). Работает в паре с D3.',
      optimalDose: '100-200 мкг MK-7',
      ratio: 'D3:K2 = 1000 IU : 100 мкг'
    },
    
    // Омега-3 (EPA/DHA)
    omega3: {
      baseAbsorption: 0.25,
      withFat: 0.6,
      optimalFatGrams: 15,
      minFatGrams: 5,
      halfLife: '2-3 дня',
      storage: 'клеточные мембраны',
      synergists: ['vitE', 'vitD'],
      antagonists: ['omega6 избыток'],
      mechanism: 'EPA/DHA встраиваются в фосфолипиды мембран, снижают воспаление через резольвины и протектины.',
      optimalDose: '1-3г EPA+DHA',
      ratio: 'EPA:DHA = 2:1 для воспаления, 1:2 для мозга',
      oxidationRisk: 'высокий — хранить в холоде'
    },
    
    // Железо
    iron: {
      baseAbsorption: 0.15,           // 15% для негемового железа
      hemeAbsorption: 0.35,           // 35% для гемового (мясо)
      withVitC: 0.45,                 // +200% с витамином C
      withoutInhibitors: 0.25,
      inhibitors: ['кальций', 'танины', 'фитаты', 'кофе', 'чай'],
      halfLife: 'годы (в ферритине)',
      storage: 'ферритин, гемоглобин',
      synergists: ['vitC', 'vitA', 'copper'],
      mechanism: 'Негемовое Fe3+ → Fe2+ (витамин C) → DMT1 транспортер → ферритин/трансферрин',
      optimalDose: '18мг/день (женщины), 8мг/день (мужчины)',
      testMarker: 'ферритин + трансферрин',
      toxicityRisk: 'средний — не принимать без анализов'
    },
    
    // Магний
    magnesium: {
      baseAbsorption: 0.35,
      forms: {
        oxide: { absorption: 0.04, use: 'слабительное' },
        citrate: { absorption: 0.25, use: 'универсальный' },
        glycinate: { absorption: 0.40, use: 'сон, нервы' },
        threonate: { absorption: 0.35, use: 'мозг, память' },
        taurate: { absorption: 0.35, use: 'сердце' },
        malate: { absorption: 0.30, use: 'энергия, мышцы' }
      },
      inhibitors: ['фитаты', 'избыток кальция', 'алкоголь'],
      halfLife: '12-24 часа',
      storage: 'кости (60%), мышцы (39%)',
      synergists: ['vitB6', 'vitD'],
      mechanism: 'Mg — кофактор 600+ ферментов. Критичен для ATP, синтеза белка, нервной проводимости.',
      optimalDose: '400-600мг элементарного Mg',
      testMarker: 'Mg в эритроцитах (не сыворотка!)',
      bestTime: 'вечер (релаксация)'
    },
    
    // Цинк
    zinc: {
      baseAbsorption: 0.30,
      withProtein: 0.40,
      inhibitors: ['фитаты', 'железо (конкуренция)', 'кальций'],
      halfLife: '2-3 недели',
      storage: 'минимальный',
      synergists: ['vitA', 'vitB6'],
      antagonists: ['copper (при избытке Zn)'],
      mechanism: 'Zn — кофактор 300+ ферментов, критичен для иммунитета, заживления, тестостерона.',
      optimalDose: '15-30мг',
      ratio: 'Zn:Cu = 10:1',
      testMarker: 'цинк сыворотки',
      bestTime: 'с белковой едой, не с железом'
    },
    
    // Витамин B12
    b12: {
      baseAbsorption: 0.50,
      withIntrinsicFactor: 0.90,
      sublingual: 0.60,
      forms: {
        cyanocobalamin: { absorption: 0.40, conversion: 'требуется' },
        methylcobalamin: { absorption: 0.55, conversion: 'активная форма' },
        adenosylcobalamin: { absorption: 0.50, conversion: 'активная форма' }
      },
      halfLife: '6-12 месяцев',
      storage: 'печень (2-5 лет запас)',
      synergists: ['folate', 'b6'],
      mechanism: 'B12 критичен для метилирования, синтеза ДНК, нервной системы. Дефицит → анемия, нейропатия.',
      optimalDose: '500-1000 мкг метилкобаламина',
      riskGroups: ['веганы', '50+ лет', 'приём метформина'],
      testMarker: 'B12 + гомоцистеин + MMA'
    },
    
    // Витамин C
    vitC: {
      baseAbsorption: 0.70,
      saturationDose: 200,            // мг — после этого абсорбция падает
      highDoseAbsorption: 0.30,       // при >1000мг
      halfLife: '2-3 часа',
      storage: 'минимальный',
      synergists: ['vitE', 'iron', 'collagen'],
      mechanism: 'Аскорбат — донор электронов, регенерирует vitE, критичен для синтеза коллагена.',
      optimalDose: '500-1000мг, разделить на 2-3 приёма',
      forms: {
        ascorbicAcid: { absorption: 0.70, gastric: 'может раздражать' },
        sodiumAscorbate: { absorption: 0.70, gastric: 'нейтральный' },
        liposomal: { absorption: 0.90, gastric: 'отлично' }
      },
      bestTime: 'утро + день (не вечер — может бодрить)'
    },
    
    // CoQ10
    coq10: {
      baseAbsorption: 0.03,           // Очень низкая!
      withFat: 0.08,
      ubiquinol: 0.15,                // Восстановленная форма — лучше
      halfLife: '33 часа',
      storage: 'митохондрии',
      synergists: ['vitE', 'selenium'],
      mechanism: 'CoQ10 — переносчик электронов в митохондриях, критичен для ATP. Антиоксидант.',
      optimalDose: '100-300мг убихинола',
      note: 'Статины истощают CoQ10 — обязательно добавлять',
      bestTime: 'с жирной едой'
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️ ЛИМИТЫ / UPPER LIMITS (UL) — ориентиры безопасности
  // Важно: это не медицинская рекомендация. Для хронических заболеваний,
  // беременности, терапии и высоких доз — только с врачом и анализами.
  // ═══════════════════════════════════════════════════════════════════════════

  const LIMITS = {
    vitD: {
      ul: 10000,
      unit: 'IU',
      note: 'Высокие дозы повышают риск гиперкальциемии. Контроль 25(OH)D и Ca при длительном приёме.',
      courseMaxDays: 120,
      courseNote: 'Высокие дозы обычно курсами с контролем анализов.'
    },
    vitC: {
      ul: 2000,
      unit: 'mg',
      note: 'Высокие дозы чаще дают ЖКТ-симптомы. Лучше дробить на 2-3 приёма.',
      courseMaxDays: 365
    },
    magnesium: {
      ul: 350,
      unit: 'mg',
      note: 'UL относится к ДОБАВКАМ (элементарный Mg), не к Mg из пищи. При проблемах с почками — осторожно.',
      courseMaxDays: 365
    },
    zinc: {
      ul: 40,
      unit: 'mg',
      note: 'Длительные высокие дозы Zn могут снижать Cu. Смотри баланс Zn:Cu.',
      courseMaxDays: 90,
      courseNote: 'Если >25-30мг/день — лучше ограничивать курс и следить за Cu.'
    },
    iron: {
      ul: 45,
      unit: 'mg',
      note: 'Железо без анализов не принимать. Риск перегруза железом. Ориентируйся на ферритин/трансферрин.',
      courseMaxDays: 60,
      courseNote: 'Курс зависит от дефицита; обычно с анализами и пересмотром дозы.'
    },
    omega3: {
      ul: 3,
      unit: 'g',
      note: 'Высокие дозы EPA+DHA требуют осторожности при приёме антикоагулянтов/перед операциями.',
      courseMaxDays: 365
    },
    b12: {
      note: 'UL для B12 обычно не устанавливается (низкая токсичность). Дозы зависят от причины дефицита.'
    },
    coq10: {
      note: 'Обычно хорошо переносится. Высокие дозы обсуждать с врачом при терапии и хронических заболеваниях.'
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ⏰ ЦИРКАДНЫЕ РИТМЫ — ОПТИМАЛЬНОЕ ВРЕМЯ ПРИЁМА
  // ═══════════════════════════════════════════════════════════════════════════
  
  const CIRCADIAN_OPTIMAL = {
    // Утро (6-10)
    morning: {
      supplements: ['vitD', 'b12', 'vitC', 'iron', 'coq10'],
      reason: 'Кортизол максимален утром → лучшая абсорбция жирорастворимых. B12/C бодрят.',
      avoid: ['magnesium', 'melatonin', 'glycine']
    },
    
    // День (10-14)
    midday: {
      supplements: ['omega3', 'vitE', 'zinc'],
      reason: 'Пищеварение активно, жирная еда на обед → идеально для жирорастворимых.',
      avoid: ['melatonin']
    },
    
    // Вечер (18-21)
    evening: {
      supplements: ['magnesium', 'vitK2', 'calcium'],
      reason: 'Mg расслабляет, K2 работает ночью (костная ремодуляция).',
      avoid: ['vitC', 'b12', 'coq10']
    },
    
    // Перед сном (21-23)
    beforeBed: {
      supplements: ['magnesium', 'glycine', 'melatonin', 'ashwagandha'],
      reason: 'Расслабление, подготовка ко сну, ночная регенерация.',
      avoid: ['vitD', 'b12', 'iron', 'vitC']
    },
    
    // Хронотипы
    chronotypes: {
      lark: {  // Жаворонок
        shift: -1,  // На час раньше
        note: 'Утренние добавки в 6-7, вечерние в 20-21'
      },
      owl: {   // Сова
        shift: +2,  // На 2 часа позже
        note: 'Утренние добавки в 9-11, вечерние в 22-23'
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔗 РАСШИРЕННЫЕ ВЗАИМОДЕЙСТВИЯ (50+)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const INTERACTIONS_EXTENDED = {
    // ══════ СИНЕРГИИ (усиливают друг друга) ══════
    synergies: [
      {
        pair: ['vitD', 'vitK2'],
        effect: 'critical',
        mechanism: 'D3 увеличивает абсорбцию Ca, K2 направляет Ca в кости (не артерии). Без K2 риск кальцификации сосудов!',
        ratio: '1000 IU D3 : 100 мкг K2',
        evidence: 'RCT, meta-analysis'
      },
      {
        pair: ['vitD', 'magnesium'],
        effect: 'high',
        mechanism: 'Mg необходим для активации D3 (гидроксилирование в печени и почках). Без Mg — D3 неактивен.',
        evidence: 'observational + mechanistic'
      },
      {
        pair: ['iron', 'vitC'],
        effect: 'critical',
        mechanism: 'VitC восстанавливает Fe3+ → Fe2+ (единственная форма для абсорбции). Усиление +200-300%.',
        timing: 'принимать вместе',
        evidence: 'RCT, gold standard'
      },
      {
        pair: ['iron', 'vitA'],
        effect: 'moderate',
        mechanism: 'VitA мобилизует железо из депо, улучшает утилизацию.',
        evidence: 'observational'
      },
      {
        pair: ['zinc', 'vitA'],
        effect: 'moderate',
        mechanism: 'Zn необходим для синтеза ретинол-связывающего белка.',
        evidence: 'mechanistic'
      },
      {
        pair: ['b12', 'folate'],
        effect: 'critical',
        mechanism: 'Работают вместе в цикле метилирования. Дефицит одного маскирует дефицит другого.',
        warning: 'Фолат без B12 может маскировать B12-дефицит → нейропатия',
        evidence: 'clinical'
      },
      {
        pair: ['vitE', 'vitC'],
        effect: 'high',
        mechanism: 'VitC регенерирует окисленный vitE, продлевая антиоксидантную защиту.',
        evidence: 'mechanistic + RCT'
      },
      {
        pair: ['vitE', 'selenium'],
        effect: 'high',
        mechanism: 'Se — кофактор глутатионпероксидазы, работает в паре с vitE как антиоксидант.',
        evidence: 'mechanistic'
      },
      {
        pair: ['omega3', 'vitE'],
        effect: 'moderate',
        mechanism: 'VitE защищает omega3 от окисления (PUFA очень нестабильны).',
        timing: 'принимать вместе',
        evidence: 'mechanistic'
      },
      {
        pair: ['calcium', 'vitD'],
        effect: 'critical',
        mechanism: 'D3 увеличивает абсорбцию Ca в кишечнике через кальбиндин.',
        evidence: 'gold standard'
      },
      {
        pair: ['magnesium', 'vitB6'],
        effect: 'high',
        mechanism: 'B6 увеличивает внутриклеточное накопление Mg.',
        evidence: 'RCT'
      },
      {
        pair: ['coq10', 'omega3'],
        effect: 'moderate',
        mechanism: 'Оба улучшают митохондриальную функцию, взаимно усиливают.',
        evidence: 'mechanistic'
      },
      {
        pair: ['curcumin', 'piperine'],
        effect: 'critical',
        mechanism: 'Пиперин блокирует глюкуронидацию куркумина → +2000% биодоступность.',
        ratio: '95% куркумин + 5% пиперин',
        evidence: 'RCT'
      },
      {
        pair: ['vitD', 'omega3'],
        effect: 'moderate',
        mechanism: 'Оба — противовоспалительные, синергия в иммунной функции.',
        evidence: 'observational'
      }
    ],
    
    // ══════ АНТАГОНИЗМЫ (мешают друг другу) ══════
    antagonisms: [
      {
        pair: ['calcium', 'iron'],
        effect: 'high',
        mechanism: 'Ca конкурирует с Fe за DMT1 транспортер. Снижение абсорбции Fe до 50%.',
        solution: 'Разделить приём на 2-3 часа',
        evidence: 'RCT'
      },
      {
        pair: ['zinc', 'iron'],
        effect: 'moderate',
        mechanism: 'Конкуренция за DMT1 при высоких дозах (>25мг каждого).',
        solution: 'Разделить или принимать с едой',
        evidence: 'RCT'
      },
      {
        pair: ['zinc', 'copper'],
        effect: 'high',
        mechanism: 'Избыток Zn (>50мг) индуцирует металлотионеин → связывает Cu → дефицит меди.',
        solution: 'Соблюдать Zn:Cu = 10:1',
        evidence: 'clinical'
      },
      {
        pair: ['calcium', 'magnesium'],
        effect: 'moderate',
        mechanism: 'Высокие дозы Ca могут снижать абсорбцию Mg.',
        solution: 'Ca:Mg = 2:1, разделить если высокие дозы',
        evidence: 'observational'
      },
      {
        pair: ['vitE', 'vitK'],
        effect: 'moderate',
        mechanism: 'Высокие дозы vitE (>800 IU) могут антагонизировать vitK (свёртывание).',
        solution: 'Не превышать 400 IU vitE',
        evidence: 'clinical'
      },
      {
        pair: ['folate', 'b12'],
        effect: 'masking',
        mechanism: 'Высокие дозы фолата маскируют B12-дефицит, позволяя нейропатии прогрессировать.',
        warning: 'Всегда проверять B12 перед приёмом фолата',
        evidence: 'clinical'
      }
    ],
    
    // ══════ ВЗАИМОДЕЙСТВИЯ С ЕДОЙ ══════
    foodInteractions: {
      enhancers: [
        { food: 'жирная рыба', supplements: ['vitD', 'vitK2', 'vitE', 'omega3'], effect: '+50-80% абсорбция' },
        { food: 'авокадо', supplements: ['vitD', 'vitK2', 'vitE', 'vitA'], effect: '+40-60% абсорбция' },
        { food: 'цитрусовые', supplements: ['iron'], effect: '+200% абсорбция (vitC)' },
        { food: 'чёрный перец', supplements: ['curcumin', 'coq10'], effect: '+20-2000% абсорбция' },
        { food: 'белковая еда', supplements: ['zinc', 'b12'], effect: '+30% абсорбция' },
        { food: 'ферментированные', supplements: ['probiotics', 'b12'], effect: 'улучшение колонизации' }
      ],
      inhibitors: [
        { food: 'кофе', supplements: ['iron', 'calcium', 'zinc', 'magnesium'], effect: '-40-60%', gap: 60 },
        { food: 'чай', supplements: ['iron', 'zinc'], effect: '-30-50% (танины)', gap: 60 },
        { food: 'молочные', supplements: ['iron', 'tetracycline'], effect: '-50% (кальций)', gap: 120 },
        { food: 'отруби/злаки', supplements: ['iron', 'zinc', 'calcium', 'magnesium'], effect: '-30% (фитаты)', gap: 60 },
        { food: 'шпинат', supplements: ['calcium', 'iron'], effect: '-30% (оксалаты)', note: 'варка снижает' },
        { food: 'алкоголь', supplements: ['b12', 'folate', 'magnesium', 'zinc'], effect: 'истощает запасы', gap: 180 },
        { food: 'грейпфрут', supplements: ['статины', 'some drugs'], effect: 'CYP3A4 ингибирование', warning: true }
      ]
    },
    
    // ══════ ВЗАИМОДЕЙСТВИЯ С ЛЕКАРСТВАМИ ══════
    drugInteractions: [
      { drug: 'статины', supplements: ['coq10'], interaction: 'статины истощают CoQ10', action: 'добавить CoQ10 100-200мг' },
      { drug: 'метформин', supplements: ['b12'], interaction: 'метформин снижает B12', action: 'добавить B12 1000мкг' },
      { drug: 'омепразол/ИПП', supplements: ['b12', 'magnesium', 'iron'], interaction: 'снижает кислотность → абсорбция↓', action: 'мониторить уровни' },
      { drug: 'антикоагулянты', supplements: ['vitK', 'omega3', 'vitE'], interaction: 'усиление кроворазжижения', warning: 'консультация врача!' },
      { drug: 'тироксин', supplements: ['calcium', 'iron', 'magnesium'], interaction: 'снижают абсорбцию', action: 'разделить на 4 часа' },
      { drug: 'антибиотики', supplements: ['probiotics', 'zinc'], interaction: 'антибиотики убивают флору', action: 'пробиотики через 2ч после АБ' }
    ]
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🌸 ДОБАВКИ ПО ФАЗАМ МЕНСТРУАЛЬНОГО ЦИКЛА
  // ═══════════════════════════════════════════════════════════════════════════
  
  const CYCLE_SUPPLEMENTS = {
    menstrual: {  // Дни 1-5
      priority: ['iron', 'vitC', 'b12'],
      reason: 'Потеря крови → железо критично. VitC усиливает абсорбцию.',
      increase: { iron: 1.5, vitC: 1.3 },
      symptoms: ['усталость', 'бледность', 'холодные конечности']
    },
    follicular: {  // Дни 6-14
      priority: ['vitD', 'omega3', 'zinc'],
      reason: 'Эстроген растёт → поддержка фолликулогенеза.',
      optimal: 'Лучшее время для интенсивных тренировок',
      energy: 'высокая'
    },
    ovulation: {  // Дни 14-16
      priority: ['vitE', 'selenium', 'zinc'],
      reason: 'Поддержка овуляции и качества яйцеклетки.',
      note: 'Пик энергии и либидо'
    },
    luteal: {  // Дни 17-28
      priority: ['magnesium', 'b6', 'calcium', 'vitD'],
      reason: 'Прогестерон растёт → Mg снижает ПМС, B6 помогает с настроением.',
      increase: { magnesium: 1.3, b6: 1.5 },
      symptoms: ['вздутие', 'раздражительность', 'тяга к сладкому'],
      pmsTips: ['Mg 400-600мг', 'B6 50-100мг', 'Ca 1000мг']
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🩺 ДЕФИЦИТЫ ПО СИМПТОМАМ
  // ═══════════════════════════════════════════════════════════════════════════
  
  const DEFICIENCY_SYMPTOMS = {
    fatigue: {
      likely: ['iron', 'b12', 'vitD', 'magnesium', 'coq10'],
      questions: [
        { q: 'Бледная кожа/слизистые?', yes: 'iron' },
        { q: 'Онемение/покалывание?', yes: 'b12' },
        { q: 'Мышечная слабость?', yes: ['vitD', 'magnesium'] },
        { q: 'Хуже после 40 лет?', yes: 'coq10' }
      ],
      tests: ['ферритин', 'B12', '25(OH)D', 'Mg эритроцитов']
    },
    hairLoss: {
      likely: ['iron', 'zinc', 'biotin', 'vitD', 'protein'],
      questions: [
        { q: 'Выпадение диффузное?', yes: ['iron', 'zinc'] },
        { q: 'Ломкие ногти тоже?', yes: 'biotin' },
        { q: 'Сухая кожа головы?', yes: 'vitD' }
      ],
      tests: ['ферритин (>70)', 'цинк', 'ТТГ']
    },
    mood: {
      likely: ['vitD', 'omega3', 'magnesium', 'b12', 'folate'],
      questions: [
        { q: 'Хуже зимой?', yes: 'vitD' },
        { q: 'Тревожность?', yes: 'magnesium' },
        { q: 'Апатия?', yes: ['b12', 'folate'] }
      ],
      tests: ['25(OH)D', 'гомоцистеин', 'Omega-3 Index']
    },
    muscle: {
      likely: ['magnesium', 'vitD', 'potassium', 'calcium'],
      questions: [
        { q: 'Судороги ночью?', yes: 'magnesium' },
        { q: 'Слабость проксимальных мышц?', yes: 'vitD' },
        { q: 'Судороги при физнагрузке?', yes: ['potassium', 'magnesium'] }
      ],
      tests: ['Mg эритроцитов', '25(OH)D', 'электролиты']
    },
    immune: {
      likely: ['vitD', 'zinc', 'vitC', 'selenium'],
      questions: [
        { q: 'Частые простуды?', yes: ['vitD', 'zinc'] },
        { q: 'Долго заживают раны?', yes: 'zinc' },
        { q: 'Герпес часто?', yes: ['zinc', 'lysine'] }
      ],
      tests: ['25(OH)D', 'цинк сыворотки']
    },
    sleep: {
      likely: ['magnesium', 'glycine', 'melatonin', 'vitD'],
      questions: [
        { q: 'Трудно заснуть?', yes: ['magnesium', 'glycine'] },
        { q: 'Просыпаетесь ночью?', yes: 'magnesium' },
        { q: 'Не высыпаетесь при 8ч сна?', yes: ['vitD', 'b12'] }
      ],
      note: 'Проверить апноэ сна, гигиену сна'
    },
    skin: {
      likely: ['vitA', 'zinc', 'omega3', 'vitE', 'vitC'],
      questions: [
        { q: 'Сухая кожа?', yes: ['omega3', 'vitE'] },
        { q: 'Акне?', yes: ['zinc', 'vitA'] },
        { q: 'Медленное заживление?', yes: ['zinc', 'vitC'] }
      ]
    },
    cognitive: {
      likely: ['omega3', 'b12', 'iron', 'vitD', 'magnesium'],
      questions: [
        { q: 'Мозговой туман?', yes: ['omega3', 'b12'] },
        { q: 'Проблемы с памятью?', yes: ['omega3', 'b12', 'magnesium'] },
        { q: 'Трудно сосредоточиться?', yes: ['iron', 'omega3'] }
      ],
      tests: ['ферритин', 'B12', 'Omega-3 Index']
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🥗 НУТРИЕНТЫ ИЗ ЕДЫ — ЧТО УЖЕ ПОЛУЧИЛ
  // ═══════════════════════════════════════════════════════════════════════════
  
  const FOOD_NUTRIENT_SOURCES = {
    iron: {
      heme: ['печень', 'говядина', 'баранина', 'индейка тёмная'],
      nonHeme: ['чечевица', 'фасоль', 'шпинат', 'тофу', 'гречка'],
      absorption: { heme: 0.25, nonHeme: 0.05 },
      rda: { male: 8, female: 18, pregnant: 27 }
    },
    calcium: {
      dairy: ['молоко', 'йогурт', 'сыр', 'творог'],
      nonDairy: ['сардины', 'тофу', 'брокколи', 'кале', 'миндаль'],
      rda: 1000,
      note: 'Усваивается порциями до 500мг'
    },
    magnesium: {
      sources: ['тыквенные семечки', 'шпинат', 'миндаль', 'авокадо', 'тёмный шоколад', 'гречка'],
      rda: { male: 420, female: 320 },
      note: '50% населения не добирает'
    },
    zinc: {
      sources: ['устрицы', 'говядина', 'тыквенные семечки', 'чечевица', 'кешью'],
      rda: { male: 11, female: 8 },
      note: 'Из растительных источников усваивается хуже'
    },
    omega3: {
      marine: ['лосось', 'сардины', 'скумбрия', 'сельдь', 'анчоусы'],
      plant: ['льняное масло', 'чиа', 'грецкий орех'],  // ALA, конверсия ~5%
      target: '1-2г EPA+DHA в неделю (2 порции жирной рыбы)',
      note: 'Растительная ALA плохо конвертируется в EPA/DHA'
    },
    vitD: {
      sources: ['жирная рыба', 'яичный желток', 'печень трески', 'грибы (UV)'],
      note: 'Еда даёт макс 10-20% потребности. Основной источник — солнце или добавки.',
      sun: '15-20 мин на солнце в полдень = ~10000 IU (летом)'
    },
    b12: {
      sources: ['печень', 'говядина', 'рыба', 'яйца', 'молочные'],
      note: 'НЕТ в растительной пище! Веганам обязательна добавка.',
      rda: 2.4
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 УМНЫЕ ФУНКЦИИ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Получить научные данные о добавке
   */
  function getSupplementScience(suppId) {
    const bio = BIOAVAILABILITY[suppId];
    if (!bio) return null;
    
    return {
      bioavailability: bio,
      optimalTime: getOptimalTime(suppId),
      synergies: getSynergies(suppId),
      antagonisms: getAntagonisms(suppId),
      foodTips: getFoodTips(suppId)
    };
  }

  /**
   * Оптимальное время приёма
   */
  function getOptimalTime(suppId) {
    for (const [period, data] of Object.entries(CIRCADIAN_OPTIMAL)) {
      if (period === 'chronotypes') continue;
      if (data.supplements?.includes(suppId)) {
        return { period, reason: data.reason };
      }
      if (data.avoid?.includes(suppId)) {
        return { avoid: period, reason: data.reason };
      }
    }
    return { period: 'any', reason: 'Нет строгих рекомендаций по времени' };
  }

  /**
   * Найти синергии для добавки
   */
  function getSynergies(suppId) {
    return INTERACTIONS_EXTENDED.synergies
      .filter(s => s.pair.includes(suppId))
      .map(s => ({
        partner: s.pair.find(p => p !== suppId),
        effect: s.effect,
        mechanism: s.mechanism,
        ratio: s.ratio
      }));
  }

  /**
   * Найти антагонизмы для добавки
   */
  function getAntagonisms(suppId) {
    return INTERACTIONS_EXTENDED.antagonisms
      .filter(a => a.pair.includes(suppId))
      .map(a => ({
        conflict: a.pair.find(p => p !== suppId),
        effect: a.effect,
        mechanism: a.mechanism,
        solution: a.solution
      }));
  }

  /**
   * Советы по еде для добавки
   */
  function getFoodTips(suppId) {
    const tips = [];
    
    // Усилители
    for (const e of INTERACTIONS_EXTENDED.foodInteractions.enhancers) {
      if (e.supplements.includes(suppId)) {
        tips.push({ type: 'enhancer', food: e.food, effect: e.effect });
      }
    }
    
    // Ингибиторы
    for (const i of INTERACTIONS_EXTENDED.foodInteractions.inhibitors) {
      if (i.supplements.includes(suppId)) {
        tips.push({ type: 'inhibitor', food: i.food, effect: i.effect, gap: i.gap });
      }
    }
    
    return tips;
  }

  /**
   * Рекомендации по фазе цикла
   */
  function getCycleRecommendations(cyclePhase) {
    if (!cyclePhase || !CYCLE_SUPPLEMENTS[cyclePhase]) {
      return null;
    }
    return CYCLE_SUPPLEMENTS[cyclePhase];
  }

  /**
   * Анализ симптомов → возможные дефициты
   */
  function analyzeSymptoms(symptoms) {
    const results = [];
    
    for (const symptom of symptoms) {
      const data = DEFICIENCY_SYMPTOMS[symptom];
      if (data) {
        results.push({
          symptom,
          likelyDeficiencies: data.likely,
          questions: data.questions,
          tests: data.tests
        });
      }
    }
    
    // Найти общие дефициты
    const allLikely = results.flatMap(r => r.likelyDeficiencies);
    const counts = {};
    allLikely.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
    
    const prioritized = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([supp, count]) => ({ supplement: supp, matchedSymptoms: count }));
    
    return {
      bySymptom: results,
      prioritized,
      tests: [...new Set(results.flatMap(r => r.tests || []))]
    };
  }

  /**
   * Оценка текущего приёма еды на нутриенты
   */
  function analyzeMealNutrients(mealItems, pIndex) {
    const found = {
      iron: { amount: 0, sources: [] },
      calcium: { amount: 0, sources: [] },
      magnesium: { amount: 0, sources: [] },
      zinc: { amount: 0, sources: [] },
      omega3: { amount: 0, sources: [] },
      vitD: { amount: 0, sources: [] },
      b12: { amount: 0, sources: [] }
    };
    
    if (!mealItems || !Array.isArray(mealItems)) return found;
    
    for (const item of mealItems) {
      const name = (item.name || '').toLowerCase();
      
      // Проверяем каждый нутриент
      for (const [nutrient, data] of Object.entries(FOOD_NUTRIENT_SOURCES)) {
        const allSources = [
          ...(data.sources || []),
          ...(data.heme || []),
          ...(data.nonHeme || []),
          ...(data.dairy || []),
          ...(data.nonDairy || []),
          ...(data.marine || []),
          ...(data.plant || [])
        ];
        
        for (const source of allSources) {
          if (name.includes(source.toLowerCase())) {
            found[nutrient].sources.push(source);
            // Грубая оценка (можно улучшить с реальными данными)
            found[nutrient].amount += (item.grams || 100) * 0.01;
          }
        }
      }
    }
    
    return found;
  }

  /**
   * Расширенные рекомендации на основе всего контекста
   */
  function getScientificRecommendations(profile, dayData, meals) {
    const recs = [];
    const hour = new Date().getHours();
    const month = new Date().getMonth();
    
    // 1. По профилю
    if (profile) {
      // Возраст
      if (profile.age >= 50) {
        recs.push({
          id: 'b12',
          reason: '50+ лет: снижается выработка intrinsic factor → B12 усваивается хуже',
          science: BIOAVAILABILITY.b12,
          priority: 'high'
        });
        recs.push({
          id: 'coq10',
          reason: '50+ лет: эндогенный синтез CoQ10 падает на 50%',
          science: BIOAVAILABILITY.coq10,
          priority: 'medium'
        });
      }
      
      if (profile.age >= 40) {
        recs.push({
          id: 'vitD',
          reason: '40+ лет: синтез D3 в коже снижается, костная масса↓',
          science: BIOAVAILABILITY.vitD,
          priority: 'high'
        });
      }
      
      // Пол
      if (profile.gender === 'Женский') {
        recs.push({
          id: 'iron',
          reason: 'Женщины теряют железо с менструацией (~30мг/цикл)',
          science: BIOAVAILABILITY.iron,
          priority: 'high'
        });
        recs.push({
          id: 'calcium',
          reason: 'Женщины: риск остеопороза выше, особенно после 40',
          priority: 'medium'
        });
      }
    }
    
    // 2. По сезону
    if (month >= 10 || month <= 2) {  // Ноябрь-Март
      recs.push({
        id: 'vitD',
        reason: `Зима (${['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][month]}): УФ-индекс <3, синтез D3 невозможен`,
        science: BIOAVAILABILITY.vitD,
        priority: 'critical'
      });
    }
    
    // 3. По данным дня
    if (dayData) {
      // Плохой сон
      if (dayData.sleepQuality && dayData.sleepQuality <= 3) {
        recs.push({
          id: 'magnesium',
          reason: 'Плохой сон: Mg — натуральный релаксант, активирует GABA',
          science: BIOAVAILABILITY.magnesium,
          priority: 'high',
          form: 'glycinate или threonate'
        });
      }
      
      // Стресс
      if (dayData.stressAvg && dayData.stressAvg >= 6) {
        recs.push({
          id: 'magnesium',
          reason: 'Высокий стресс: кортизол истощает Mg, создавая порочный круг',
          science: BIOAVAILABILITY.magnesium,
          priority: 'high'
        });
        recs.push({
          id: 'omega3',
          reason: 'Стресс: EPA снижает воспаление и поддерживает нейропластичность',
          science: BIOAVAILABILITY.omega3,
          priority: 'medium'
        });
      }
      
      // Тренировки
      if (dayData.trainings && dayData.trainings.length > 0) {
        recs.push({
          id: 'magnesium',
          reason: 'Тренировка: потеря Mg с потом, нужен для синтеза ATP',
          science: BIOAVAILABILITY.magnesium,
          priority: 'medium'
        });
        recs.push({
          id: 'omega3',
          reason: 'Тренировка: EPA/DHA ускоряют восстановление через резольвины',
          science: BIOAVAILABILITY.omega3,
          priority: 'medium'
        });
      }
      
      // Фаза цикла
      if (dayData.cycleDay) {
        let phase;
        if (dayData.cycleDay <= 5) phase = 'menstrual';
        else if (dayData.cycleDay <= 14) phase = 'follicular';
        else if (dayData.cycleDay <= 16) phase = 'ovulation';
        else phase = 'luteal';
        
        const cycleRecs = CYCLE_SUPPLEMENTS[phase];
        if (cycleRecs) {
          for (const suppId of cycleRecs.priority) {
            recs.push({
              id: suppId,
              reason: `Фаза цикла (${phase}): ${cycleRecs.reason}`,
              priority: 'medium',
              cyclePhase: phase
            });
          }
        }
      }
    }
    
    // 4. По текущему времени
    const timeRecs = [];
    if (hour >= 6 && hour <= 10) {
      timeRecs.push(...CIRCADIAN_OPTIMAL.morning.supplements.map(id => ({
        id,
        timeWindow: 'сейчас',
        reason: CIRCADIAN_OPTIMAL.morning.reason
      })));
    } else if (hour >= 21) {
      timeRecs.push(...CIRCADIAN_OPTIMAL.beforeBed.supplements.map(id => ({
        id,
        timeWindow: 'сейчас',
        reason: CIRCADIAN_OPTIMAL.beforeBed.reason
      })));
    }
    
    // 5. Анализ еды
    if (meals && meals.length > 0) {
      const lastMeal = meals[meals.length - 1];
      if (lastMeal && lastMeal.items) {
        // Проверяем жирность для жирорастворимых
        let mealFat = 0;
        for (const item of lastMeal.items) {
          mealFat += (item.fat100 || 0) * (item.grams || 100) / 100;
        }
        
        if (mealFat >= 10) {
          recs.push({
            id: 'vitD',
            reason: `Жирный приём (${mealFat.toFixed(0)}г жира) — идеально для D3 (+60% абсорбция)`,
            priority: 'timing',
            science: BIOAVAILABILITY.vitD
          });
          recs.push({
            id: 'vitK2',
            reason: `Жирный приём — K2 усвоится лучше (+40%)`,
            priority: 'timing',
            science: BIOAVAILABILITY.vitK2
          });
        }
      }
    }
    
    // Убираем дубликаты по id, сохраняя приоритетные
    const seen = new Map();
    for (const rec of recs) {
      const existing = seen.get(rec.id);
      if (!existing || priorityOrder(rec.priority) < priorityOrder(existing.priority)) {
        seen.set(rec.id, rec);
      }
    }
    
    return Array.from(seen.values());
  }

  function priorityOrder(p) {
    const order = { critical: 0, high: 1, medium: 2, low: 3, timing: 4 };
    return order[p] ?? 5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🌅 НАУЧНЫЕ ОБОСНОВАНИЯ ДЛЯ УТРЕННЕГО ПРИЁМА ВИТАМИНОВ
  // ═══════════════════════════════════════════════════════════════════════════
  
  const MORNING_SUPPLEMENT_SCIENCE = {
    // === УТРЕННИЕ ВИТАМИНЫ (timing: morning, empty, withFood) ===
    vitD: {
      timing: 'withFood',
      mealTiming: 'С завтраком (с жирами!)',
      icon: '☀️',
      shortTip: 'Принимай с жирной едой на завтрак',
      science: {
        why: 'Витамин D жирорастворимый — усваивается на 50-80% лучше с жирами (яйца, авокадо, сыр).',
        when: 'Утром с первым приёмом пищи, содержащим минимум 10-15г жира.',
        mechanism: 'Кортизол максимален утром → улучшает транспорт D3. Вечерний приём может нарушить сон (подавляет мелатонин).',
        evidence: 'Journal of Bone and Mineral Research, 2010: приём D3 с едой увеличивает абсорбцию на 50%.',
        avoid: 'Не принимать вечером — может нарушить циркадные ритмы.',
        optimalFood: ['яйца', 'авокадо', 'сыр', 'орехи', 'сливочное масло']
      }
    },
    
    b12: {
      timing: 'morning',
      mealTiming: 'Утром, можно натощак',
      icon: '⚡',
      shortTip: 'Принимай утром — даёт энергию на весь день',
      science: {
        why: 'B12 участвует в выработке энергии и синтезе нейромедиаторов. Бодрит!',
        when: 'Сразу после пробуждения или с завтраком.',
        mechanism: 'B12 активирует метилирование → синтез допамина, серотонина, норадреналина. Даёт ментальную ясность.',
        evidence: 'Nutrients, 2016: B12 улучшает когнитивные функции при утреннем приёме.',
        avoid: 'Вечером может вызвать бессонницу из-за стимулирующего эффекта.',
        optimalFood: ['можно натощак', 'с белковым завтраком лучше']
      }
    },
    
    vitC: {
      timing: 'morning',
      mealTiming: 'Утром с едой или натощак',
      icon: '🍊',
      shortTip: 'Утром для иммунитета и энергии',
      science: {
        why: 'Витамин C поддерживает синтез кортизола, иммунитет и энергию. Может бодрить.',
        when: 'Утром с завтраком. При проблемах с желудком — с едой.',
        mechanism: 'Аскорбат — кофактор синтеза норадреналина (бодрость). Также помогает усвоению железа.',
        evidence: 'American Journal of Clinical Nutrition: пик абсорбции при дозе до 200мг. Для больших доз — разделить на 2-3 приёма.',
        avoid: 'Большие дозы вечером могут нарушить сон.',
        optimalFood: ['можно натощак', 'с цитрусовыми синергия']
      }
    },
    
    iron: {
      timing: 'empty',
      mealTiming: 'СТРОГО натощак, с витамином C!',
      icon: '🩸',
      shortTip: 'Натощак утром + витамин C = усвоение ×3',
      science: {
        why: 'Железо лучше всего усваивается на пустой желудок. Витамин C увеличивает абсорбцию в 3 раза!',
        when: 'За 30-60 минут до завтрака, запить водой с лимоном или принять с витамином C.',
        mechanism: 'Желудочная кислота максимальна натощак → Fe³⁺ восстанавливается до Fe²⁺ (единственная усваиваемая форма).',
        evidence: 'Hallberg et al.: витамин C увеличивает абсорбцию негемового железа на 200-300%.',
        avoid: 'НЕ принимать с кофе, чаем, молочкой, кальцием — блокируют усвоение на 40-60%!',
        conflict: ['calcium', 'zinc', 'кофе', 'чай', 'молоко']
      }
    },
    
    folic: {
      timing: 'morning',
      mealTiming: 'Утром с едой',
      icon: '🌸',
      shortTip: 'Утром для энергии и здоровья клеток',
      science: {
        why: 'Фолиевая кислота участвует в синтезе ДНК и клеточном делении. Критична для женщин!',
        when: 'Утром с завтраком.',
        mechanism: 'Фолат → метилфолат → метилирование ДНК, синтез нейромедиаторов.',
        evidence: 'Важно: принимать с B12 (работают в связке). Дефицит B12 маскируется высоким фолатом.',
        avoid: 'Не принимать алкоголь — разрушает фолат.',
        synergy: ['b12']
      }
    },
    
    coq10: {
      timing: 'withFat',
      mealTiming: 'С жирным завтраком',
      icon: '❤️',
      shortTip: 'С жирами на завтрак — для сердца и энергии',
      science: {
        why: 'CoQ10 жирорастворим, критичен для митохондрий. Убихинол усваивается лучше убихинона.',
        when: 'С первым жирным приёмом пищи (завтрак или обед).',
        mechanism: 'CoQ10 — переносчик электронов в митохондриях. Без жира абсорбция всего 3%, с жиром — до 15%.',
        evidence: 'Biofactors, 2008: приём с едой увеличивает абсорбцию CoQ10 в 3-5 раз.',
        avoid: 'Не принимать вечером — может давать энергию и нарушать сон.',
        optimalFood: ['яйца', 'авокадо', 'орехи', 'сыр']
      }
    },
    
    b6: {
      timing: 'morning',
      mealTiming: 'Утром с едой',
      icon: '🧬',
      shortTip: 'Утром для энергии и настроения',
      science: {
        why: 'B6 участвует в синтезе допамина и серотонина, метаболизме белка.',
        when: 'Утром с завтраком.',
        mechanism: 'Пиридоксин → пиридоксаль-5-фосфат → кофактор 100+ ферментов включая декарбоксилазу (синтез нейромедиаторов).',
        evidence: 'Идеальная пара с магнием — классическая связка Magne B6.',
        avoid: 'Высокие дозы (>100мг) могут вызвать нейропатию. Придерживаться 25-50мг.',
        synergy: ['magnesium']
      }
    },
    
    zinc: {
      timing: 'withFood',
      mealTiming: 'С белковым завтраком',
      icon: '🛡️',
      shortTip: 'С белковой едой, НЕ с железом и кальцием',
      science: {
        why: 'Цинк лучше усваивается с белковой пищей. Критичен для иммунитета и гормонов.',
        when: 'С завтраком или обедом, содержащим белок.',
        mechanism: 'Аминокислоты (цистеин, гистидин) образуют хелаты с цинком → улучшают транспорт.',
        evidence: 'При пустом желудке может вызвать тошноту. С белком — комфортно и эффективно.',
        avoid: 'НЕ с железом (конкуренция), НЕ с кальцием (блокировка), НЕ с кофе (танины).',
        conflict: ['iron', 'calcium', 'кофе']
      }
    },
    
    // === С ЕДОЙ (timing: withFood, withFat) ===
    omega3: {
      timing: 'withFat',
      mealTiming: 'С жирной едой (завтрак/обед)',
      icon: '🐟',
      shortTip: 'С жирной едой, хранить в холоде',
      science: {
        why: 'EPA/DHA лучше усваиваются с жирами. Базовая абсорбция — 25%, с жирами — 60%.',
        when: 'С любым приёмом пищи, содержащим жиры. Не критично утро или день.',
        mechanism: 'Жиры стимулируют выброс желчи → эмульгирование и мицеллообразование → абсорбция.',
        evidence: 'Journal of the Academy of Nutrition: приём omega-3 с жирной едой увеличивает абсорбцию на 300%.',
        avoid: 'Хранить в холоде (окисляются!). Принимать с витамином E для защиты.',
        synergy: ['vitE', 'vitD']
      }
    },
    
    vitE: {
      timing: 'withFat',
      mealTiming: 'С жирной едой',
      icon: '🌻',
      shortTip: 'С жирами, защищает Omega-3 от окисления',
      science: {
        why: 'Токоферол жирорастворим, является главным антиоксидантом для клеточных мембран.',
        when: 'С едой, содержащей жиры. Идеально — вместе с Omega-3.',
        mechanism: 'VitE встраивается в мембраны, перехватывает свободные радикалы. Регенерируется витамином C.',
        evidence: 'Не превышать 400 IU/день — высокие дозы могут антагонизировать витамин K.',
        avoid: 'Высокие дозы при приёме антикоагулянтов.',
        synergy: ['omega3', 'vitC']
      }
    },
    
    biotin: {
      timing: 'withFood',
      mealTiming: 'С любым приёмом пищи',
      icon: '💇',
      shortTip: 'С едой, не критично время',
      science: {
        why: 'Биотин водорастворим, хорошо усваивается. Важен для волос, кожи, ногтей.',
        when: 'В любое время с едой.',
        mechanism: 'H7 — кофактор карбоксилаз, участвует в метаболизме жирных кислот и глюкозы.',
        evidence: 'Эффект заметен через 2-3 месяца приёма. Терпение!',
        avoid: 'Избегать сырых яиц — авидин связывает биотин.',
        note: 'Может влиять на анализы щитовидки — предупредить врача!'
      }
    },
    
    collagen: {
      timing: 'empty',
      mealTiming: 'Натощак + витамин C',
      icon: '✨',
      shortTip: 'Натощак за 30 мин до еды + витамин C',
      science: {
        why: 'Коллаген лучше усваивается без конкуренции с другими белками.',
        when: 'Натощак за 30 минут до завтрака. Обязательно с витамином C!',
        mechanism: 'VitC — кофактор пролилгидроксилазы → необходим для синтеза коллагена. Без C коллаген не работает!',
        evidence: 'Журнал Nutrients, 2019: гидролизованный коллаген + VitC улучшает состояние кожи на 20%.',
        avoid: 'Не принимать с полноценным белковым приёмом — конкуренция за усвоение.',
        synergy: ['vitC']
      }
    },
    
    // === УТРЕННИЕ НЕ РЕКОМЕНДУЮТСЯ (вечерние) ===
    magnesium: {
      timing: 'evening',
      mealTiming: 'Вечером, перед сном',
      icon: '💤',
      shortTip: '⚠️ Лучше вечером — расслабляет!',
      science: {
        why: 'Магний расслабляет мышцы и нервную систему. Утром может вызвать сонливость.',
        when: 'За 1-2 часа до сна. Глицинат/треонат — для сна, цитрат — универсальный.',
        mechanism: 'Mg активирует ГАМК-рецепторы (торможение), блокирует NMDA (возбуждение) → расслабление.',
        evidence: 'Journal of Research in Medical Sciences: магний улучшает качество сна на 17%.',
        avoid: 'Оксид магния — только как слабительное, не для восполнения дефицита.',
        morningNote: 'Если уже запланировал — принимай с едой, но эффект будет слабее.'
      }
    },
    
    melatonin: {
      timing: 'beforeBed',
      mealTiming: '⚠️ Только перед сном!',
      icon: '🌙',
      shortTip: '⚠️ ТОЛЬКО перед сном, за 30-60 мин',
      science: {
        why: 'Мелатонин — гормон сна! Утренний приём собьёт циркадные ритмы.',
        when: 'За 30-60 минут до сна, в темноте.',
        mechanism: 'Мелатонин сигнализирует мозгу о наступлении ночи → запуск каскада засыпания.',
        evidence: 'Не принимать утром! Это собьёт внутренние часы.',
        avoid: 'КАТЕГОРИЧЕСКИ не принимать утром или днём.',
        morningNote: 'Перенеси на вечер. Утренний приём навредит!'
      }
    },
    
    glycine: {
      timing: 'beforeBed',
      mealTiming: '⚠️ Перед сном',
      icon: '😴',
      shortTip: '⚠️ Перед сном — улучшает качество сна',
      science: {
        why: 'Глицин — тормозной нейромедиатор, снижает температуру тела для засыпания.',
        when: 'За 30-60 минут до сна.',
        mechanism: 'Глицин активирует NMDA-рецепторы в гипоталамусе → снижение температуры ядра → сон.',
        evidence: 'Sleep and Biological Rhythms: 3г глицина улучшают субъективное качество сна.',
        avoid: 'Утром даст сонливость.',
        morningNote: 'Перенеси на вечер для лучшего эффекта.'
      }
    },
    
    ltheanine: {
      timing: 'evening',
      mealTiming: 'Вечером или с кофе (анти-тревога)',
      icon: '🍵',
      shortTip: 'Вечером для расслабления или с кофе',
      science: {
        why: 'L-теанин расслабляет без сонливости. С кофе — убирает jitters, сохраняя фокус.',
        when: 'Вечером для расслабления или утром С КОФЕ для спокойного фокуса.',
        mechanism: 'Теанин увеличивает альфа-волны мозга → спокойная бдительность.',
        evidence: 'Может приниматься утром С кофе (100-200мг) для "smooth energy".',
        morningNote: 'С кофе — ОК! Убирает тревожность от кофеина.'
      }
    },
    
    // === СПЕЦИАЛЬНЫЕ ===
    berberine: {
      timing: 'beforeMeal',
      mealTiming: 'За 15-30 мин ДО еды',
      icon: '🌿',
      shortTip: 'За 15-30 мин до еды — снизит сахар в крови',
      science: {
        why: 'Берберин снижает уровень сахара в крови и инсулиновую волну на 15%!',
        when: 'За 15-30 минут до еды, содержащей углеводы.',
        mechanism: 'Активирует AMPK → улучшает чувствительность к инсулину, снижает глюконеогенез.',
        evidence: 'Metabolism, 2008: берберин снижает HbA1c сравнимо с метформином.',
        avoid: 'Не принимать с метформином без консультации врача.',
        insulinBonus: -0.15
      }
    },
    
    cinnamon: {
      timing: 'withFood',
      mealTiming: 'С едой, содержащей углеводы',
      icon: '🍂',
      shortTip: 'С углеводной едой — снижает сахар',
      science: {
        why: 'Корица улучшает чувствительность к инсулину, снижает инсулиновую волну на 10%.',
        when: 'С едой, особенно содержащей углеводы.',
        mechanism: 'Полифенолы корицы активируют инсулиновые рецепторы.',
        evidence: 'Цейлонская корица безопаснее кассии (меньше кумарина).',
        insulinBonus: -0.10
      }
    },
    
    chromium: {
      timing: 'withFood',
      mealTiming: 'С углеводной едой',
      icon: '⚙️',
      shortTip: 'С углеводной едой — стабилизирует сахар',
      science: {
        why: 'Хром — кофактор GTF (glucose tolerance factor), помогает инсулину.',
        when: 'С едой, содержащей углеводы.',
        mechanism: 'Хром усиливает связывание инсулина с рецепторами.',
        evidence: 'Diabetes Care: хром пиколинат улучшает чувствительность к инсулину.',
        note: 'Эффект заметен при дефиците. Анализы покажут нужен ли.'
      }
    },
    
    vinegar: {
      timing: 'beforeMeal',
      mealTiming: 'За 15-20 мин до углеводной еды',
      icon: '🍎',
      shortTip: 'До еды — снижает инсулиновую волну на 20%',
      science: {
        why: 'Яблочный уксус снижает гликемический ответ на 20-30%!',
        when: '1-2 ст.л. разведённого уксуса за 15-20 минут до еды с углеводами.',
        mechanism: 'Уксусная кислота замедляет опорожнение желудка, ингибирует дисахаридазы.',
        evidence: 'European Journal of Clinical Nutrition: уксус снижает постпрандиальную глюкозу на 31%.',
        avoid: 'Не пить неразведённым — разрушает эмаль зубов!',
        insulinBonus: -0.20
      }
    },
    
    creatine: {
      timing: 'afterTrain',
      mealTiming: 'После тренировки или с углеводами',
      icon: '💪',
      shortTip: 'После тренировки — загрузка в мышцы',
      science: {
        why: 'Креатин лучше загружается в мышцы после тренировки с углеводами (инсулин помогает).',
        when: 'После тренировки с простыми углеводами или в любое время — эффект накопительный.',
        mechanism: 'Инсулин стимулирует GLUT4 и креатиновые транспортеры в мышцах.',
        evidence: '5г/день достаточно. Загрузка (20г) не обязательна.',
        morningNote: 'Утром тоже можно — эффект накопительный. Главное регулярность.'
      }
    },
    
    bcaa: {
      timing: 'afterTrain',
      mealTiming: 'До/во время/после тренировки',
      icon: '🏋️',
      shortTip: 'Вокруг тренировки',
      science: {
        why: 'BCAA (лейцин, изолейцин, валин) стимулируют синтез белка, снижают катаболизм.',
        when: 'До, во время или сразу после тренировки.',
        mechanism: 'Лейцин активирует mTOR → запуск синтеза мышечного белка.',
        evidence: 'Если ешь достаточно белка (1.6+г/кг) — BCAA не обязательны.',
        morningNote: 'Если тренировка утром натощак — BCAA до трени защитят мышцы.'
      }
    },
    
    protein: {
      timing: 'afterTrain',
      mealTiming: 'После тренировки, в любое время',
      icon: '🥛',
      shortTip: 'После тренировки или для добора белка',
      science: {
        why: 'Протеин — удобный способ добрать суточную норму белка.',
        when: 'В течение 2 часов после тренировки или в любое время для добора нормы.',
        mechanism: '"Анаболическое окно" — миф. Важна суточная норма белка (1.6-2.2г/кг).',
        evidence: 'Сывороточный — быстрый (после трени), казеин — медленный (на ночь).',
        morningNote: 'Утром можно, если не добираешь белок из еды.'
      }
    }
  };
  
  /**
   * Генерация персонализированного совета по утренним витаминам
   * Вызывается после утреннего чек-ина
   * @param {string[]} plannedSupplements - витамины, выбранные в чек-ине
   * @param {Object} context - контекст (profile, mealCount, hasEaten)
   * @returns {Object|null} совет для модуля Advice
   */
  function generateMorningSupplementAdvice(plannedSupplements, context = {}) {
    if (!plannedSupplements || plannedSupplements.length === 0) return null;
    
    const hour = new Date().getHours();
    // Только утром (6-12)
    if (hour < 6 || hour > 12) return null;
    
    const hasEaten = context.mealCount > 0 || context.hasEaten;
    
    // Фильтруем утренние витамины
    const morningSupps = plannedSupplements.filter(id => {
      const info = MORNING_SUPPLEMENT_SCIENCE[id];
      if (!info) return false;
      const timing = info.timing;
      return ['morning', 'empty', 'withFood', 'withFat', 'beforeMeal'].includes(timing);
    });
    
    if (morningSupps.length === 0) return null;
    
    // Сортируем по важности: натощак → до еды → с едой
    const priorityOrder = { empty: 1, beforeMeal: 2, morning: 3, withFood: 4, withFat: 5 };
    morningSupps.sort((a, b) => {
      const infoA = MORNING_SUPPLEMENT_SCIENCE[a];
      const infoB = MORNING_SUPPLEMENT_SCIENCE[b];
      return (priorityOrder[infoA?.timing] || 99) - (priorityOrder[infoB?.timing] || 99);
    });
    
    // Группируем по типу приёма
    const groups = {
      empty: [],      // Натощак
      beforeMeal: [], // До еды
      withFood: [],   // С едой
      withFat: [],    // С жирной едой
      evening: []     // Вечерние (предупреждение)
    };
    
    for (const id of morningSupps) {
      const info = MORNING_SUPPLEMENT_SCIENCE[id];
      if (!info) continue;
      
      const supp = HEYS.Supplements?.CATALOG?.[id] || { name: id, icon: '💊' };
      
      if (info.timing === 'evening' || info.timing === 'beforeBed') {
        groups.evening.push({ id, name: supp.name, icon: info.icon || supp.icon, info });
      } else if (info.timing === 'empty') {
        groups.empty.push({ id, name: supp.name, icon: info.icon || supp.icon, info });
      } else if (info.timing === 'beforeMeal') {
        groups.beforeMeal.push({ id, name: supp.name, icon: info.icon || supp.icon, info });
      } else if (info.timing === 'withFat') {
        groups.withFat.push({ id, name: supp.name, icon: info.icon || supp.icon, info });
      } else {
        groups.withFood.push({ id, name: supp.name, icon: info.icon || supp.icon, info });
      }
    }
    
    // Формируем сообщение и детали
    let title = '';
    let details = [];
    let priority = 1; // Высокий приоритет — первый совет дня
    
    // Если есть вечерние — предупреждаем
    if (groups.evening.length > 0) {
      const eveningNames = groups.evening.map(s => `${s.icon} ${s.name}`).join(', ');
      details.push(`⚠️ **Перенеси на вечер:** ${eveningNames}`);
      for (const s of groups.evening) {
        details.push(`   └ ${s.name}: ${s.info.science.why}`);
      }
    }
    
    // Если не ел и есть натощак — рекомендуем сначала их
    if (!hasEaten && groups.empty.length > 0) {
      const emptyNames = groups.empty.map(s => `${s.icon} ${s.name}`).join(', ');
      title = `💊 Сейчас: ${emptyNames}`;
      
      for (const s of groups.empty) {
        details.push(`**${s.icon} ${s.name}** — ${s.info.shortTip}`);
        details.push(`🔬 ${s.info.science.why}`);
        if (s.info.science.avoid) {
          details.push(`⚠️ ${s.info.science.avoid}`);
        }
      }
      
      // Напоминание о витаминах с едой
      const withFoodAll = [...groups.withFood, ...groups.withFat];
      if (withFoodAll.length > 0) {
        const withFoodNames = withFoodAll.map(s => s.name).join(', ');
        details.push(`\n⏰ **После завтрака:** ${withFoodNames}`);
      }
    } 
    // Если уже ел или нет натощак витаминов
    else {
      const allMorning = [...groups.beforeMeal, ...groups.withFood, ...groups.withFat, ...groups.empty];
      
      if (allMorning.length === 0) {
        return null; // Нет утренних витаминов
      }
      
      // Выбираем главный витамин для заголовка
      const mainSupp = allMorning[0];
      const otherCount = allMorning.length - 1;
      
      if (otherCount > 0) {
        title = `💊 Время витаминов: ${mainSupp.icon} ${mainSupp.name} и ещё ${otherCount}`;
      } else {
        title = `💊 Время: ${mainSupp.icon} ${mainSupp.name}`;
      }
      
      // Детали по каждому
      for (const s of allMorning.slice(0, 4)) { // Максимум 4 в деталях
        details.push(`**${s.icon} ${s.name}** — ${s.info.shortTip}`);
        details.push(`🔬 ${s.info.science.why}`);
      }
      
      if (allMorning.length > 4) {
        details.push(`\n...и ещё ${allMorning.length - 4} витаминов`);
      }
    }
    
    // Добавляем синергии если есть
    const allIds = morningSupps;
    if (allIds.includes('iron') && allIds.includes('vitC')) {
      details.push(`\n✨ **Синергия:** Железо + Витамин C = усвоение ×3!`);
    }
    if (allIds.includes('vitD') && allIds.includes('k2')) {
      details.push(`\n✨ **Синергия:** D3 + K2 = кальций в кости, не в сосуды!`);
    }
    if (allIds.includes('vitD') && allIds.includes('omega3')) {
      details.push(`\n✨ **Синергия:** D3 + Omega-3 = противовоспалительный дуэт!`);
    }
    
    // Конфликты
    if (allIds.includes('iron') && allIds.includes('calcium')) {
      details.push(`\n⚠️ **Конфликт:** Железо и Кальций — раздели на 2 часа!`);
    }
    if (allIds.includes('iron') && allIds.includes('zinc')) {
      details.push(`\n⚠️ **Конфликт:** Железо и Цинк — принимай раздельно!`);
    }
    
    return {
      id: 'morning_supplements_reminder',
      icon: '💊',
      text: title,
      details: details.join('\n'),
      type: 'health',
      priority: priority,
      category: 'health',   // 💊 Категория напоминаний — показывается ВСЕГДА
      isReminder: true,     // 💊 Флаг: это напоминание, не совет — bypass настроек
      triggers: ['tab_open', 'checkin_complete'],
      ttl: 10000, // 10 секунд показа
      suppIds: morningSupps,
      // Кнопка "Отметить принятыми"
      action: {
        label: '✅ Принял',
        onClick: () => {
          const dateKey = new Date().toISOString().slice(0, 10);
          if (HEYS.Supplements?.markAllSupplementsTaken) {
            HEYS.Supplements.markAllSupplementsTaken(dateKey);
          }
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🌙 ГЕНЕРАЦИЯ ВЕЧЕРНЕГО СОВЕТА ПО ВИТАМИНАМ
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Генерирует совет-напоминание о вечерних витаминах
   * Вызывается при добавлении еды вечером (18:00-23:00)
   * 
   * @param {string[]} plannedSupplements - ID запланированных витаминов
   * @param {Object} context - контекст { mealCount, hasEaten, profile }
   * @returns {Object|null} - объект совета или null
   */
  function generateEveningSupplementAdvice(plannedSupplements, context = {}) {
    if (!plannedSupplements || plannedSupplements.length === 0) return null;
    
    const hour = new Date().getHours();
    // Только вечером (18-23)
    if (hour < 18 || hour > 23) return null;
    
    // Фильтруем вечерние витамины
    const eveningSupps = plannedSupplements.filter(id => {
      const info = MORNING_SUPPLEMENT_SCIENCE[id];
      if (!info) return false;
      const timing = info.timing;
      return ['evening', 'beforeBed'].includes(timing);
    });
    
    if (eveningSupps.length === 0) return null;
    
    // Сортируем: вечерние → перед сном
    const priorityOrder = { evening: 1, beforeBed: 2 };
    eveningSupps.sort((a, b) => {
      const infoA = MORNING_SUPPLEMENT_SCIENCE[a];
      const infoB = MORNING_SUPPLEMENT_SCIENCE[b];
      return (priorityOrder[infoA?.timing] || 99) - (priorityOrder[infoB?.timing] || 99);
    });
    
    // Группируем
    const groups = {
      evening: [],   // Вечерние (с ужином)
      beforeBed: []  // Перед сном
    };
    
    for (const id of eveningSupps) {
      const info = MORNING_SUPPLEMENT_SCIENCE[id];
      if (!info) continue;
      
      const supp = HEYS.Supplements?.CATALOG?.[id] || { name: id, icon: '💊' };
      const item = { id, name: supp.name, icon: info.icon || supp.icon, info };
      
      if (info.timing === 'beforeBed') {
        groups.beforeBed.push(item);
      } else {
        groups.evening.push(item);
      }
    }
    
    // Формируем сообщение
    let title = '';
    let details = [];
    
    const allEvening = [...groups.evening, ...groups.beforeBed];
    
    if (allEvening.length === 0) return null;
    
    // Заголовок
    const mainSupp = allEvening[0];
    const otherCount = allEvening.length - 1;
    
    if (otherCount > 0) {
      title = `🌙 Вечерние витамины: ${mainSupp.icon} ${mainSupp.name} и ещё ${otherCount}`;
    } else {
      title = `🌙 Время: ${mainSupp.icon} ${mainSupp.name}`;
    }
    
    // Детали по каждому
    if (groups.evening.length > 0) {
      details.push('**С ужином:**');
      for (const s of groups.evening) {
        details.push(`${s.icon} **${s.name}** — ${s.info.shortTip}`);
        details.push(`   🔬 ${s.info.science.why}`);
      }
    }
    
    if (groups.beforeBed.length > 0) {
      if (groups.evening.length > 0) details.push('');
      details.push('**Перед сном (через 1-2ч):**');
      for (const s of groups.beforeBed) {
        details.push(`${s.icon} **${s.name}** — ${s.info.shortTip}`);
        details.push(`   🔬 ${s.info.science.why}`);
      }
    }
    
    // Синергии вечерних
    const allIds = eveningSupps;
    if (allIds.includes('magnesium') && allIds.includes('glycine')) {
      details.push(`\n✨ **Синергия:** Магний + Глицин = глубокий сон!`);
    }
    if (allIds.includes('magnesium') && allIds.includes('melatonin')) {
      details.push(`\n✨ **Синергия:** Магний + Мелатонин = быстрое засыпание!`);
    }
    
    return {
      id: 'evening_supplements_reminder',
      icon: '🌙',
      text: title,
      details: details.join('\n'),
      type: 'health',
      priority: 1, // Высокий приоритет
      category: 'health',   // 💊 Категория напоминаний — показывается ВСЕГДА
      isReminder: true,     // 💊 Флаг: это напоминание, не совет — bypass настроек
      triggers: ['product_added'],
      ttl: 10000,
      suppIds: eveningSupps,
      action: {
        label: '✅ Принял',
        onClick: () => {
          const dateKey = new Date().toISOString().slice(0, 10);
          // Отмечаем только вечерние витамины
          if (HEYS.Supplements?.markSupplementsTaken) {
            HEYS.Supplements.markSupplementsTaken(dateKey, eveningSupps);
          } else if (HEYS.Supplements?.markSupplementTaken) {
            eveningSupps.forEach(id => HEYS.Supplements.markSupplementTaken(dateKey, id));
          }
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📤 ЭКСПОРТ В ОСНОВНОЙ МОДУЛЬ
  // ═══════════════════════════════════════════════════════════════════════════

  // Расширяем основной модуль научными данными
  Object.assign(HEYS.Supplements, {
    // Научные базы данных
    SCIENCE: {
      BIOAVAILABILITY,
      LIMITS,
      CIRCADIAN_OPTIMAL,
      INTERACTIONS_EXTENDED,
      CYCLE_SUPPLEMENTS,
      DEFICIENCY_SYMPTOMS,
      FOOD_NUTRIENT_SOURCES,
      MORNING_SUPPLEMENT_SCIENCE  // 🆕 Научные обоснования времени приёма
    },
    
    // Научные функции
    getSupplementScience,
    getOptimalTime,
    getSynergies,
    getAntagonisms,
    getFoodTips,
    getCycleRecommendations,
    analyzeSymptoms,
    analyzeMealNutrients,
    getScientificRecommendations,
    generateMorningSupplementAdvice,  // 🆕 Генерация утреннего совета
    generateEveningSupplementAdvice   // 🆕 Генерация вечернего совета
  });

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
