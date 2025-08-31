// calculation_worker.js - Воркер для математических вычислений
self.onmessage = function (e) {
  const { type, taskId, data } = e.data;

  if (type === 'ping') {
    self.postMessage({ type: 'pong' });
    return;
  }

  if (type === 'execute_task') {
    try {
      handleCalculationTask(taskId, data);
    } catch (error) {
      self.postMessage({
        type: 'task_complete',
        taskId: taskId,
        error: error.message,
      });
    }
  }
};

function handleCalculationTask(taskId, data) {
  switch (data.type) {
    case 'nutrition_calculation':
      calculateNutrition(taskId, data);
      break;

    case 'data_export':
      exportData(taskId, data);
      break;

    case 'bulk_import':
      processBulkImport(taskId, data);
      break;

    case 'recipe_analysis':
      analyzeRecipe(taskId, data);
      break;

    default:
      throw new Error(`Неизвестный тип задачи: ${data.type}`);
  }
}

// Расчет питательности
function calculateNutrition(taskId, data) {
  const { products, portions } = data;

  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 0, step: 'Начало расчета' },
  });

  const nutrition = {
    totalKcal: 0,
    totalProteins: 0,
    totalFats: 0,
    totalCarbs: 0,
    totalFiber: 0,
    totalSugar: 0,
    details: [],
  };

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const portion = portions[i] || 100;

    // Расчет на порцию
    const portionMultiplier = portion / 100;

    const productNutrition = {
      productId: product.id,
      productName: product.name,
      portion: portion,
      kcal: (product.kcal100 || 0) * portionMultiplier,
      proteins: (product.proteins100 || 0) * portionMultiplier,
      fats: (product.fats100 || 0) * portionMultiplier,
      carbs: (product.carbs100 || 0) * portionMultiplier,
      fiber: (product.fiber100 || 0) * portionMultiplier,
      sugar: (product.sugar100 || 0) * portionMultiplier,
    };

    // Добавляем к общему
    nutrition.totalKcal += productNutrition.kcal;
    nutrition.totalProteins += productNutrition.proteins;
    nutrition.totalFats += productNutrition.fats;
    nutrition.totalCarbs += productNutrition.carbs;
    nutrition.totalFiber += productNutrition.fiber;
    nutrition.totalSugar += productNutrition.sugar;

    nutrition.details.push(productNutrition);

    // Прогресс
    const progress = ((i + 1) / products.length) * 100;
    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: { progress, step: `Обработано ${i + 1}/${products.length} продуктов` },
    });
  }

  // Округляем результаты
  nutrition.totalKcal = Math.round(nutrition.totalKcal * 100) / 100;
  nutrition.totalProteins = Math.round(nutrition.totalProteins * 100) / 100;
  nutrition.totalFats = Math.round(nutrition.totalFats * 100) / 100;
  nutrition.totalCarbs = Math.round(nutrition.totalCarbs * 100) / 100;
  nutrition.totalFiber = Math.round(nutrition.totalFiber * 100) / 100;
  nutrition.totalSugar = Math.round(nutrition.totalSugar * 100) / 100;

  // Добавляем аналитику
  nutrition.analysis = analyzeNutritionBalance(nutrition);

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: nutrition,
  });
}

// Экспорт данных
function exportData(taskId, data) {
  const { format, startDate, endDate } = data;

  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 0, step: 'Подготовка данных для экспорта' },
  });

  let exportResult;

  switch (format) {
    case 'csv':
      exportResult = exportToCSV(startDate, endDate);
      break;

    case 'json':
      exportResult = exportToJSON(startDate, endDate);
      break;

    case 'pdf':
      exportResult = preparePDFData(startDate, endDate);
      break;

    default:
      throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
  }

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: exportResult,
  });
}

// Массовый импорт
function processBulkImport(taskId, data) {
  const { importData, format } = data;

  self.postMessage({
    type: 'progress',
    taskId: taskId,
    data: { progress: 0, step: 'Начало обработки импорта' },
  });

  const results = {
    totalRows: 0,
    processedRows: 0,
    errors: [],
    warnings: [],
    importedData: [],
  };

  // Парсим данные в зависимости от формата
  let parsedData;
  switch (format) {
    case 'csv':
      parsedData = parseCSVData(importData);
      break;

    case 'json':
      parsedData = JSON.parse(importData);
      break;

    default:
      throw new Error(`Неподдерживаемый формат импорта: ${format}`);
  }

  results.totalRows = parsedData.length;

  // Обрабатываем каждую строку
  for (let i = 0; i < parsedData.length; i++) {
    try {
      const processedRow = processImportRow(parsedData[i], i);
      results.importedData.push(processedRow);
      results.processedRows++;
    } catch (error) {
      results.errors.push({
        row: i + 1,
        error: error.message,
        data: parsedData[i],
      });
    }

    // Прогресс
    const progress = ((i + 1) / parsedData.length) * 100;
    self.postMessage({
      type: 'progress',
      taskId: taskId,
      data: { progress, step: `Обработано ${i + 1}/${parsedData.length} записей` },
    });
  }

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: results,
  });
}

// Анализ рецепта
function analyzeRecipe(taskId, data) {
  const { ingredients, servings } = data;

  const recipeAnalysis = {
    servings: servings || 1,
    totalNutrition: {
      kcal: 0,
      proteins: 0,
      fats: 0,
      carbs: 0,
    },
    perServing: {},
    ingredients: [],
    tips: [],
  };

  // Анализируем каждый ингредиент
  for (const ingredient of ingredients) {
    const analysis = analyzeIngredient(ingredient);
    recipeAnalysis.ingredients.push(analysis);

    // Добавляем к общей питательности
    recipeAnalysis.totalNutrition.kcal += analysis.kcal;
    recipeAnalysis.totalNutrition.proteins += analysis.proteins;
    recipeAnalysis.totalNutrition.fats += analysis.fats;
    recipeAnalysis.totalNutrition.carbs += analysis.carbs;
  }

  // Рассчитываем на порцию
  recipeAnalysis.perServing = {
    kcal: recipeAnalysis.totalNutrition.kcal / servings,
    proteins: recipeAnalysis.totalNutrition.proteins / servings,
    fats: recipeAnalysis.totalNutrition.fats / servings,
    carbs: recipeAnalysis.totalNutrition.carbs / servings,
  };

  // Генерируем советы
  recipeAnalysis.tips = generateRecipeTips(recipeAnalysis);

  self.postMessage({
    type: 'task_complete',
    taskId: taskId,
    data: recipeAnalysis,
  });
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function analyzeNutritionBalance(nutrition) {
  const totalKcal = nutrition.totalKcal;

  // Процентное соотношение макронутриентов
  const proteinPercent = ((nutrition.totalProteins * 4) / totalKcal) * 100;
  const fatPercent = ((nutrition.totalFats * 9) / totalKcal) * 100;
  const carbPercent = ((nutrition.totalCarbs * 4) / totalKcal) * 100;

  return {
    macroBalance: {
      proteins: Math.round(proteinPercent),
      fats: Math.round(fatPercent),
      carbs: Math.round(carbPercent),
    },
    recommendations: generateNutritionRecommendations(proteinPercent, fatPercent, carbPercent),
    score: calculateNutritionScore(proteinPercent, fatPercent, carbPercent),
  };
}

function generateNutritionRecommendations(protein, fat, carb) {
  const recommendations = [];

  if (protein < 15) {
    recommendations.push('Увеличьте потребление белка');
  } else if (protein > 30) {
    recommendations.push('Снизьте потребление белка');
  }

  if (fat < 20) {
    recommendations.push('Добавьте полезные жиры');
  } else if (fat > 35) {
    recommendations.push('Снизьте потребление жиров');
  }

  if (carb < 45) {
    recommendations.push('Увеличьте потребление углеводов');
  } else if (carb > 65) {
    recommendations.push('Снизьте потребление углеводов');
  }

  return recommendations;
}

function calculateNutritionScore(protein, fat, carb) {
  let score = 100;

  // Идеальные диапазоны
  const idealProtein = { min: 15, max: 25 };
  const idealFat = { min: 25, max: 35 };
  const idealCarb = { min: 45, max: 65 };

  // Штрафы за отклонения
  if (protein < idealProtein.min || protein > idealProtein.max) {
    score -= Math.abs(protein - 20) * 2;
  }

  if (fat < idealFat.min || fat > idealFat.max) {
    score -= Math.abs(fat - 30) * 1.5;
  }

  if (carb < idealCarb.min || carb > idealCarb.max) {
    score -= Math.abs(carb - 55) * 1;
  }

  return Math.max(0, Math.round(score));
}

// Экспорт в CSV
function exportToCSV(startDate, endDate) {
  const csvData = [['Дата', 'Калории', 'Белки', 'Жиры', 'Углеводы']];

  // Генерируем примерные данные для экспорта
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    csvData.push([
      date.toISOString().split('T')[0],
      Math.round(1800 + Math.random() * 400),
      Math.round(80 + Math.random() * 40),
      Math.round(60 + Math.random() * 30),
      Math.round(200 + Math.random() * 100),
    ]);
  }

  const csvContent = csvData.map(row => row.join(',')).join('\n');

  return {
    format: 'csv',
    content: csvContent,
    filename: `heys-export-${startDate}-${endDate}.csv`,
    size: csvContent.length,
  };
}

// Экспорт в JSON
function exportToJSON(startDate, endDate) {
  const jsonData = {
    exportDate: new Date().toISOString(),
    period: { start: startDate, end: endDate },
    data: [],
  };

  // Генерируем данные
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    jsonData.data.push({
      date: date.toISOString().split('T')[0],
      nutrition: {
        kcal: Math.round(1800 + Math.random() * 400),
        proteins: Math.round(80 + Math.random() * 40),
        fats: Math.round(60 + Math.random() * 30),
        carbs: Math.round(200 + Math.random() * 100),
      },
    });
  }

  const jsonContent = JSON.stringify(jsonData, null, 2);

  return {
    format: 'json',
    content: jsonContent,
    filename: `heys-export-${startDate}-${endDate}.json`,
    size: jsonContent.length,
  };
}

// Подготовка данных для PDF
function preparePDFData(startDate, endDate) {
  return {
    format: 'pdf',
    title: 'Отчет HEYS',
    period: { start: startDate, end: endDate },
    sections: [
      {
        title: 'Сводка',
        data: {
          totalDays: calculateDaysBetween(startDate, endDate),
          avgKcal: 2000,
          avgProteins: 100,
          avgFats: 70,
          avgCarbs: 250,
        },
      },
      {
        title: 'Детальные данные',
        data: generateDetailedPDFData(startDate, endDate),
      },
    ],
    filename: `heys-report-${startDate}-${endDate}.pdf`,
  };
}

function generateDetailedPDFData(startDate, endDate) {
  const data = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    data.push({
      date: date.toISOString().split('T')[0],
      kcal: Math.round(1800 + Math.random() * 400),
      proteins: Math.round(80 + Math.random() * 40),
      fats: Math.round(60 + Math.random() * 30),
      carbs: Math.round(200 + Math.random() * 100),
    });
  }

  return data;
}

function calculateDaysBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate - startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Парсинг CSV
function parseCSVData(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',');
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',');
      const row = {};

      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim();
      });

      data.push(row);
    }
  }

  return data;
}

// Обработка строки импорта
function processImportRow(row, index) {
  // Валидация обязательных полей
  if (!row.name) {
    throw new Error(`Отсутствует название продукта в строке ${index + 1}`);
  }

  if (!row.kcal100) {
    throw new Error(`Отсутствуют калории в строке ${index + 1}`);
  }

  return {
    name: row.name,
    kcal100: parseFloat(row.kcal100) || 0,
    proteins100: parseFloat(row.proteins100) || 0,
    fats100: parseFloat(row.fats100) || 0,
    carbs100: parseFloat(row.carbs100) || 0,
    category: row.category || 'Без категории',
    barcode: row.barcode || null,
  };
}

// Анализ ингредиента
function analyzeIngredient(ingredient) {
  const { product, amount } = ingredient;
  const multiplier = amount / 100;

  return {
    name: product.name,
    amount: amount,
    kcal: (product.kcal100 || 0) * multiplier,
    proteins: (product.proteins100 || 0) * multiplier,
    fats: (product.fats100 || 0) * multiplier,
    carbs: (product.carbs100 || 0) * multiplier,
    contribution: {
      kcal: (product.kcal100 || 0) * multiplier,
      proteins: (product.proteins100 || 0) * multiplier,
      fats: (product.fats100 || 0) * multiplier,
      carbs: (product.carbs100 || 0) * multiplier,
    },
  };
}

// Советы для рецепта
function generateRecipeTips(analysis) {
  const tips = [];
  const perServing = analysis.perServing;

  if (perServing.kcal > 500) {
    tips.push('Высококалорийное блюдо - подходит для основного приема пищи');
  } else if (perServing.kcal < 200) {
    tips.push('Легкое блюдо - идеально для перекуса');
  }

  if (perServing.proteins > 25) {
    tips.push('Высокое содержание белка - отлично для спортсменов');
  }

  if (perServing.fats > 20) {
    tips.push('Содержит много жиров - учитывайте при планировании дня');
  }

  return tips;
}

console.log('[Worker] Calculation Worker готов к работе');
