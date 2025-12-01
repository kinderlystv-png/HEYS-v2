/**
 * 🎭 HEYS Demo Data Generator
 * Генерирует реалистичные данные за 36 дней для демо-клиента
 * 
 * Использование в консоли браузера:
 * 1. Скопировать весь код и вставить в консоль
 * 2. Вызвать: generateDemoData('90482824-c8ff-443f-b37e-9af1dbf81737')
 * 
 * Или запустить через Node.js с Supabase credentials
 */

(function() {
  
  // === Конфигурация персонажа ===
  const PERSONA = {
    name: 'ПУпс',
    gender: 'Женский',
    age: 28,
    height: 165,
    startWeight: 68.5,  // Начальный вес
    targetWeight: 62,   // Цель
    activityLevel: 'moderate',
    sleepNorm: 8,
    stepsGoal: 8000,
    deficitTarget: 15,  // % дефицита
  };

  // === Продукты для реалистичного питания ===
  const MEALS_DB = {
    breakfast: [
      { name: 'Овсянка на воде', kcal: 150, prot: 5, carbs: 27, fat: 3, simple: 2, complex: 25, fiber: 4, gi: 55 },
      { name: 'Яйца варёные 2шт', kcal: 140, prot: 12, carbs: 1, fat: 10, simple: 0, complex: 1, fiber: 0, gi: 0 },
      { name: 'Творог 5%', kcal: 120, prot: 18, carbs: 3, fat: 5, simple: 3, complex: 0, fiber: 0, gi: 30 },
      { name: 'Банан', kcal: 95, prot: 1, carbs: 23, fat: 0, simple: 14, complex: 9, fiber: 2, gi: 55 },
      { name: 'Тост с авокадо', kcal: 180, prot: 4, carbs: 15, fat: 12, simple: 2, complex: 13, fiber: 5, gi: 45 },
      { name: 'Йогурт греческий', kcal: 100, prot: 10, carbs: 6, fat: 5, simple: 6, complex: 0, fiber: 0, gi: 35 },
      { name: 'Омлет из 2 яиц', kcal: 180, prot: 14, carbs: 2, fat: 14, simple: 0, complex: 2, fiber: 0, gi: 0 },
      { name: 'Сырники 3шт', kcal: 250, prot: 15, carbs: 20, fat: 12, simple: 8, complex: 12, fiber: 1, gi: 50 },
    ],
    lunch: [
      { name: 'Куриная грудка 150г', kcal: 165, prot: 31, carbs: 0, fat: 4, simple: 0, complex: 0, fiber: 0, gi: 0 },
      { name: 'Гречка 150г', kcal: 180, prot: 6, carbs: 36, fat: 2, simple: 1, complex: 35, fiber: 4, gi: 50 },
      { name: 'Рис бурый 150г', kcal: 170, prot: 4, carbs: 38, fat: 1, simple: 0, complex: 38, fiber: 2, gi: 50 },
      { name: 'Салат овощной', kcal: 80, prot: 2, carbs: 10, fat: 4, simple: 5, complex: 5, fiber: 3, gi: 35 },
      { name: 'Лосось 150г', kcal: 280, prot: 30, carbs: 0, fat: 18, simple: 0, complex: 0, fiber: 0, gi: 0 },
      { name: 'Суп куриный', kcal: 120, prot: 8, carbs: 12, fat: 5, simple: 2, complex: 10, fiber: 2, gi: 45 },
      { name: 'Паста с овощами', kcal: 320, prot: 10, carbs: 55, fat: 8, simple: 5, complex: 50, fiber: 4, gi: 55 },
      { name: 'Говядина 150г', kcal: 250, prot: 26, carbs: 0, fat: 16, simple: 0, complex: 0, fiber: 0, gi: 0 },
    ],
    dinner: [
      { name: 'Рыба запечённая 150г', kcal: 180, prot: 25, carbs: 0, fat: 8, simple: 0, complex: 0, fiber: 0, gi: 0 },
      { name: 'Овощи на пару', kcal: 60, prot: 3, carbs: 12, fat: 1, simple: 4, complex: 8, fiber: 4, gi: 30 },
      { name: 'Творожная запеканка', kcal: 200, prot: 16, carbs: 18, fat: 8, simple: 10, complex: 8, fiber: 1, gi: 45 },
      { name: 'Салат с тунцом', kcal: 180, prot: 20, carbs: 8, fat: 8, simple: 3, complex: 5, fiber: 2, gi: 30 },
      { name: 'Куриные котлеты 2шт', kcal: 220, prot: 24, carbs: 8, fat: 10, simple: 1, complex: 7, fiber: 1, gi: 40 },
      { name: 'Греческий салат', kcal: 150, prot: 5, carbs: 10, fat: 10, simple: 5, complex: 5, fiber: 3, gi: 30 },
    ],
    snack: [
      { name: 'Яблоко', kcal: 52, prot: 0, carbs: 14, fat: 0, simple: 10, complex: 4, fiber: 2, gi: 35 },
      { name: 'Орехи 30г', kcal: 180, prot: 5, carbs: 6, fat: 16, simple: 2, complex: 4, fiber: 2, gi: 20 },
      { name: 'Кефир 250мл', kcal: 100, prot: 8, carbs: 10, fat: 3, simple: 10, complex: 0, fiber: 0, gi: 30 },
      { name: 'Протеиновый батончик', kcal: 150, prot: 15, carbs: 18, fat: 4, simple: 8, complex: 10, fiber: 2, gi: 45 },
      { name: 'Морковь', kcal: 35, prot: 1, carbs: 8, fat: 0, simple: 4, complex: 4, fiber: 3, gi: 35 },
      { name: 'Сыр 30г', kcal: 100, prot: 7, carbs: 0, fat: 8, simple: 0, complex: 0, fiber: 0, gi: 0 },
    ],
    // Срывы (редко)
    cheat: [
      { name: 'Пицца 2 куска', kcal: 550, prot: 20, carbs: 60, fat: 25, simple: 8, complex: 52, fiber: 3, gi: 65 },
      { name: 'Бургер', kcal: 500, prot: 25, carbs: 40, fat: 28, simple: 10, complex: 30, fiber: 2, gi: 60 },
      { name: 'Шоколад 100г', kcal: 550, prot: 5, carbs: 60, fat: 32, simple: 50, complex: 10, fiber: 3, gi: 70 },
      { name: 'Торт кусок', kcal: 400, prot: 4, carbs: 50, fat: 22, simple: 40, complex: 10, fiber: 1, gi: 75 },
      { name: 'Чипсы пачка', kcal: 500, prot: 6, carbs: 50, fat: 30, simple: 3, complex: 47, fiber: 4, gi: 55, harm: 70 },
    ]
  };

  // Типы тренировок
  const TRAINING_TYPES = ['cardio', 'strength', 'hobby'];

  // === Утилиты ===
  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomFloat(min, max, decimals = 1) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pickMultiple(arr, count) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  function formatDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function formatTime(hours, minutes = 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // === Генерация данных дня ===
  function generateDayData(date, dayIndex, totalDays) {
    const dayOfWeek = date.getDay(); // 0 = воскресенье
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const progress = dayIndex / totalDays; // 0 → 1

    // Вес: постепенное снижение с колебаниями
    const weightTrend = PERSONA.startWeight - (PERSONA.startWeight - PERSONA.targetWeight) * progress * 0.3;
    const dailyFluctuation = randomFloat(-0.4, 0.4);
    const weight = parseFloat((weightTrend + dailyFluctuation).toFixed(1));

    // Сон: 6-9 часов с вариациями
    const sleepHours = isWeekend ? randomFloat(7, 9) : randomFloat(6, 8);
    const sleepStart = isWeekend ? formatTime(randomBetween(23, 24), randomBetween(0, 59)) : formatTime(randomBetween(22, 23), randomBetween(0, 59));
    const sleepQuality = sleepHours >= 7 ? randomBetween(3, 5) : randomBetween(2, 4);

    // Шаги: 5000-12000
    const steps = isWeekend ? randomBetween(4000, 8000) : randomBetween(6000, 12000);

    // Дефицит цели
    const deficitPct = randomBetween(10, 20);

    // Вода: 1000-2500 мл
    const waterMl = randomBetween(1200, 2500);

    // Домашняя активность
    const householdMin = randomBetween(0, 60);

    // === Приёмы пищи ===
    const meals = [];
    const mealTimes = {
      breakfast: formatTime(randomBetween(7, 9), randomBetween(0, 59)),
      lunch: formatTime(randomBetween(12, 14), randomBetween(0, 59)),
      dinner: formatTime(randomBetween(18, 20), randomBetween(0, 59)),
    };

    // Шанс срыва: 5% обычный день, 15% выходные
    const isCheatDay = Math.random() < (isWeekend ? 0.15 : 0.05);

    // Завтрак (1-2 продукта)
    const breakfastItems = pickMultiple(MEALS_DB.breakfast, randomBetween(1, 2));
    meals.push({
      id: `meal_${Date.now()}_1`,
      name: 'Завтрак',
      time: mealTimes.breakfast,
      mood: randomBetween(3, 5),
      wellbeing: randomBetween(3, 5),
      stress: randomBetween(1, 3),
      items: breakfastItems.map((p, i) => ({
        id: `item_${Date.now()}_1_${i}`,
        product_id: `demo_${p.name.replace(/\s/g, '_')}`,
        name: p.name,
        grams: randomBetween(80, 200),
        ...p
      }))
    });

    // Обед (2-3 продукта)
    const lunchItems = pickMultiple(MEALS_DB.lunch, randomBetween(2, 3));
    meals.push({
      id: `meal_${Date.now()}_2`,
      name: 'Обед',
      time: mealTimes.lunch,
      mood: randomBetween(3, 5),
      wellbeing: randomBetween(3, 5),
      stress: randomBetween(1, 4),
      items: lunchItems.map((p, i) => ({
        id: `item_${Date.now()}_2_${i}`,
        product_id: `demo_${p.name.replace(/\s/g, '_')}`,
        name: p.name,
        grams: randomBetween(100, 200),
        ...p
      }))
    });

    // Перекус (50% шанс)
    if (Math.random() > 0.5) {
      const snackItems = pickMultiple(MEALS_DB.snack, 1);
      meals.push({
        id: `meal_${Date.now()}_3`,
        name: 'Перекус',
        time: formatTime(randomBetween(15, 17), randomBetween(0, 59)),
        mood: randomBetween(3, 5),
        wellbeing: randomBetween(3, 5),
        stress: randomBetween(1, 3),
        items: snackItems.map((p, i) => ({
          id: `item_${Date.now()}_3_${i}`,
          product_id: `demo_${p.name.replace(/\s/g, '_')}`,
          name: p.name,
          grams: randomBetween(30, 150),
          ...p
        }))
      });
    }

    // Ужин (1-2 продукта)
    const dinnerItems = isCheatDay 
      ? pickMultiple(MEALS_DB.cheat, 1)
      : pickMultiple(MEALS_DB.dinner, randomBetween(1, 2));
    meals.push({
      id: `meal_${Date.now()}_4`,
      name: 'Ужин',
      time: mealTimes.dinner,
      mood: isCheatDay ? randomBetween(4, 5) : randomBetween(3, 5),
      wellbeing: randomBetween(3, 5),
      stress: isCheatDay ? randomBetween(1, 2) : randomBetween(1, 4),
      items: dinnerItems.map((p, i) => ({
        id: `item_${Date.now()}_4_${i}`,
        product_id: `demo_${p.name.replace(/\s/g, '_')}`,
        name: p.name,
        grams: randomBetween(100, 250),
        ...p
      }))
    });

    // === Тренировки (40% шанс) ===
    const trainings = [];
    if (Math.random() < 0.4) {
      const type = pickRandom(TRAINING_TYPES);
      const zones = type === 'cardio' 
        ? [randomBetween(5, 10), randomBetween(15, 25), randomBetween(10, 20), randomBetween(0, 5)]
        : type === 'strength'
        ? [randomBetween(5, 10), randomBetween(20, 40), randomBetween(5, 15), 0]
        : [randomBetween(10, 20), randomBetween(20, 40), randomBetween(0, 10), 0];
      
      trainings.push({
        type,
        time: formatTime(randomBetween(7, 19), randomBetween(0, 59)),
        z: zones
      });
    }

    // Оценка дня
    const dayScore = isCheatDay ? randomBetween(4, 6) : randomBetween(6, 9);

    return {
      date: formatDate(date),
      weightMorning: weight,
      sleepStart,
      sleepEnd: formatTime(randomBetween(6, 8), randomBetween(0, 59)),
      sleepHours,
      sleepQuality,
      sleepNote: '',
      steps,
      deficitPct,
      waterMl,
      householdMin,
      dayScore,
      dayComment: isCheatDay ? 'Позволила себе вкусняшку 🍕' : '',
      meals,
      trainings,
      updatedAt: date.getTime()
    };
  }

  // === Генерация профиля ===
  function generateProfile() {
    return {
      firstName: PERSONA.name,
      lastName: '',
      gender: PERSONA.gender,
      weight: PERSONA.startWeight,
      height: PERSONA.height,
      age: PERSONA.age,
      sleepHours: PERSONA.sleepNorm,
      insulinWaveHours: 4,
      deficitPctTarget: PERSONA.deficitTarget,
      stepsGoal: PERSONA.stepsGoal,
      activityLevel: PERSONA.activityLevel
    };
  }

  // === Генерация норм ===
  function generateNorms() {
    return {
      carbsPct: 45,
      proteinPct: 30,
      simpleCarbPct: 25,
      badFatPct: 25,
      superbadFatPct: 3,
      fiberPct: 14,
      giPct: 55,
      harmPct: 10
    };
  }

  // === Главная функция ===
  window.generateDemoData = async function(clientId, days = 36) {
    if (!clientId) {
      console.error('❌ Укажи clientId: generateDemoData("90482824-c8ff-443f-b37e-9af1dbf81737")');
      return;
    }

    console.log(`🎭 Генерация демо-данных для клиента ${clientId.substring(0, 8)}...`);
    console.log(`📅 Период: ${days} дней`);

    const today = new Date();
    const allDays = [];

    // Генерируем данные за каждый день
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayData = generateDayData(date, days - i - 1, days);
      allDays.push(dayData);
    }

    // Профиль и нормы
    const profile = generateProfile();
    const norms = generateNorms();

    console.log('📊 Сгенерировано:');
    console.log(`  - Дней: ${allDays.length}`);
    console.log(`  - Приёмов пищи: ${allDays.reduce((sum, d) => sum + d.meals.length, 0)}`);
    console.log(`  - Тренировок: ${allDays.reduce((sum, d) => sum + d.trainings.length, 0)}`);

    // === Сохранение в localStorage ===
    // ВАЖНО: Формат ключа должен быть heys_{clientId}_xxx, а НЕ clientId_heys_xxx
    // Это соответствует nsKey() в heys_core_v12.js
    
    // Профиль
    localStorage.setItem(`heys_${clientId}_profile`, JSON.stringify(profile));
    console.log('✅ Профиль сохранён');

    // Нормы
    localStorage.setItem(`heys_${clientId}_norms`, JSON.stringify(norms));
    console.log('✅ Нормы сохранены');

    // Дни
    allDays.forEach(day => {
      const key = `heys_${clientId}_dayv2_${day.date}`;
      localStorage.setItem(key, JSON.stringify(day));
    });
    console.log(`✅ ${allDays.length} дней сохранено в localStorage`);

    // === Сохранение в Supabase (если доступен) ===
    if (window.HEYS && HEYS.cloud && HEYS.cloud.client) {
      console.log('☁️ Загрузка в Supabase...');
      
      const userId = HEYS.cloud.user?.id;
      if (!userId) {
        console.warn('⚠️ Нет авторизации в Supabase, данные только в localStorage');
        return allDays;
      }

      const kvData = [];
      
      // Профиль
      kvData.push({ user_id: userId, client_id: clientId, k: 'heys_profile', v: profile });
      
      // Нормы
      kvData.push({ user_id: userId, client_id: clientId, k: 'heys_norms', v: norms });
      
      // Дни
      allDays.forEach(day => {
        kvData.push({ 
          user_id: userId, 
          client_id: clientId, 
          k: `heys_dayv2_${day.date}`, 
          v: day 
        });
      });

      // Batch upsert
      const batchSize = 20;
      for (let i = 0; i < kvData.length; i += batchSize) {
        const batch = kvData.slice(i, i + batchSize);
        const { error } = await HEYS.cloud.client
          .from('client_kv_store')
          .upsert(batch, { onConflict: 'user_id,client_id,k' });
        
        if (error) {
          console.error('❌ Ошибка Supabase:', error);
        } else {
          console.log(`☁️ Загружено ${Math.min(i + batchSize, kvData.length)}/${kvData.length}`);
        }
      }
      
      console.log('✅ Данные загружены в Supabase!');
    }

    console.log('\n🎉 Готово! Переключись на клиента и обнови страницу.');
    console.log('   Или выполни: location.reload()');

    return allDays;
  };

  console.log('🎭 Demo Data Generator загружен!');
  console.log('   Использование: generateDemoData("CLIENT_ID", 36)');
  console.log('   Пример: generateDemoData("90482824-c8ff-443f-b37e-9af1dbf81737")');

})();
