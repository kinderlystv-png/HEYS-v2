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
  // 📤 ЭКСПОРТ В ОСНОВНОЙ МОДУЛЬ
  // ═══════════════════════════════════════════════════════════════════════════

  // Расширяем основной модуль научными данными
  Object.assign(HEYS.Supplements, {
    // Научные базы данных
    SCIENCE: {
      BIOAVAILABILITY,
      CIRCADIAN_OPTIMAL,
      INTERACTIONS_EXTENDED,
      CYCLE_SUPPLEMENTS,
      DEFICIENCY_SYMPTOMS,
      FOOD_NUTRIENT_SOURCES
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
    getScientificRecommendations
  });

  console.log('[HEYS] Supplements Science v1.0 loaded: bioavailability, circadian, 50+ interactions');

})(typeof window !== 'undefined' ? window : global);
