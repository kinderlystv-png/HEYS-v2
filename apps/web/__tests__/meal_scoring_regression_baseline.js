// REGRESSION TEST BASELINE for Meal Scoring (Phase 4)
// Created: 2026-01-14
// Purpose: Validate that extracted meal scoring logic produces identical results
// 
// This file contains test cases and expected results BEFORE extraction.
// After extraction, these tests MUST produce 100% identical results.

const REGRESSION_TEST_MEALS = [
  // Test 1: Normal breakfast (optimal)
  {
    name: 'Optimal Breakfast',
    meal: {
      kcal: 450,
      protein: 25,
      carbs: 50,
      fat: 15,
      time: '08:00',
      items: [
        { name: 'Овсянка', grams: 100, kcal100: 350, protein100: 12, carbs100: 60, fat100: 6, gi: 55, harm: 0 },
        { name: 'Яйцо', grams: 60, kcal100: 150, protein100: 13, carbs100: 1, fat100: 11, gi: 0, harm: 0 }
      ]
    },
    expected: {
      // Expected score will be calculated and stored here
      // score: 85-95 (should be high quality)
      // color should be green
    }
  },
  
  // Test 2: High carb lunch
  {
    name: 'High Carb Lunch',
    meal: {
      kcal: 700,
      protein: 20,
      carbs: 100,
      fat: 20,
      time: '13:00',
      items: [
        { name: 'Белый хлеб', grams: 200, kcal100: 250, protein100: 8, carbs100: 50, fat100: 1, gi: 85, harm: 5 },
        { name: 'Картошка', grams: 150, kcal100: 80, protein100: 2, carbs100: 17, fat100: 0, gi: 85, harm: 0 }
      ]
    }
  },
  
  // Test 3: Late night snack (should be penalized)
  {
    name: 'Late Night Snack',
    meal: {
      kcal: 300,
      protein: 10,
      carbs: 40,
      fat: 10,
      time: '23:30',
      items: [
        { name: 'Печенье', grams: 50, kcal100: 450, protein100: 6, carbs100: 70, fat100: 15, gi: 70, harm: 8 }
      ]
    }
  },
  
  // Test 4: Edge case - 0 kcal
  {
    name: 'Zero Calories',
    meal: {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      time: '12:00',
      items: []
    }
  },
  
  // Test 5: Edge case - huge portion
  {
    name: 'Huge Portion',
    meal: {
      kcal: 2000,
      protein: 100,
      carbs: 200,
      fat: 80,
      time: '14:00',
      items: [
        { name: 'Пицца', grams: 500, kcal100: 270, protein100: 12, carbs100: 33, fat100: 10, gi: 60, harm: 7 }
      ]
    }
  },
  
  // Test 6: Edge case - negative values (invalid data)
  {
    name: 'Invalid Negative',
    meal: {
      kcal: -100,
      protein: -10,
      carbs: -20,
      fat: -5,
      time: '10:00',
      items: []
    }
  },
  
  // Test 7: Liquid food (should be penalized)
  {
    name: 'Liquid Meal',
    meal: {
      kcal: 350,
      protein: 5,
      carbs: 60,
      fat: 10,
      time: '15:00',
      items: [
        { name: 'Кока-кола', grams: 500, kcal100: 42, protein100: 0, carbs100: 10.6, fat100: 0, gi: 90, harm: 15 },
        { name: 'Апельсиновый сок', grams: 200, kcal100: 45, protein100: 0.7, carbs100: 10, fat100: 0, gi: 50, harm: 3 }
      ]
    }
  },
  
  // Test 8: High protein meal
  {
    name: 'High Protein',
    meal: {
      kcal: 500,
      protein: 60,
      carbs: 20,
      fat: 20,
      time: '12:00',
      items: [
        { name: 'Куриная грудка', grams: 200, kcal100: 110, protein100: 23, carbs100: 0, fat100: 1.2, gi: 0, harm: 0 },
        { name: 'Протеин', grams: 30, kcal100: 380, protein100: 80, carbs100: 5, fat100: 5, gi: 0, harm: 0 }
      ]
    }
  },
  
  // Test 9: Kefir (healthy liquid - should NOT be penalized)
  {
    name: 'Healthy Liquid',
    meal: {
      kcal: 200,
      protein: 12,
      carbs: 15,
      fat: 6,
      time: '20:00',
      items: [
        { name: 'Кефир', grams: 300, kcal100: 56, protein100: 2.8, carbs100: 4, fat100: 3.2, gi: 15, harm: 0 }
      ]
    }
  },
  
  // Test 10: Mixed macros (balanced)
  {
    name: 'Balanced Meal',
    meal: {
      kcal: 550,
      protein: 30,
      carbs: 60,
      fat: 20,
      time: '18:00',
      items: [
        { name: 'Гречка', grams: 100, kcal100: 123, protein100: 4.5, carbs100: 25, fat100: 1.6, gi: 50, harm: 0 },
        { name: 'Говядина', grams: 100, kcal100: 250, protein100: 26, carbs100: 0, fat100: 15, gi: 0, harm: 3 },
        { name: 'Овощной салат', grams: 150, kcal100: 25, protein100: 1, carbs100: 5, fat100: 0, gi: 15, harm: 0 }
      ]
    }
  }
];

// Instructions for running baseline tests:
// 1. Before extraction, run these tests and save results
// 2. After extraction, run again and compare
// 3. All values must match 100%
//
// To run: Open developer console on app.heyslab.ru
// Copy test meals and use existing scoreMeal function
// Store results for comparison

console.log('📊 REGRESSION TEST BASELINE');
console.log('Test meals defined:', REGRESSION_TEST_MEALS.length);
console.log('Run these tests BEFORE and AFTER extraction');
console.log('Expected: 100% identical results');
