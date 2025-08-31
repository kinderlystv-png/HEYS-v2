// heys_models_test.js — базовые тесты для моделей и хранилища
(function(global){
  const HEYS = global.HEYS;
  function assert(cond, msg){ if(!cond) throw new Error(msg); }
  // Тест ensureDay
  const d = HEYS.models.ensureDay({}, {weight: 70});
  assert(d.weightMorning === 70, 'ensureDay: weightMorning');
  // Тест mealTotals
  const idx = HEYS.models.buildProductIndex([
    {id:'1',name:'Яблоко',simple100:10,complex100:5,protein100:1,badFat100:0,goodFat100:0,trans100:0,fiber100:2}
  ]);
  const meal = {id:'m1',items:[{id:'it1',product_id:'1',grams:100}]};
  const t = HEYS.models.mealTotals(meal, idx);
  assert(t.kcal > 0, 'mealTotals: kcal');
  // Тест store
  HEYS.store.set('test_key', 123);
  assert(HEYS.store.get('test_key') === 123, 'store: set/get');
  console.log('HEYS models/store tests passed');
})(window);
