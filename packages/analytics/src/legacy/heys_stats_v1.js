// heys_stats_v1.js — предагрегация и быстрые вычисления статистик по дням
;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const Stats = HEYS.stats = HEYS.stats || {};

  // Агрегировать массив дней в сводные показатели
  Stats.aggregateDays = function(daysArr) {
    const res = {
      totalKcal: 0, totalProt: 0, totalFat: 0, totalCarbs: 0, days: 0,
      avgKcal: 0, avgProt: 0, avgFat: 0, avgCarbs: 0
    };
    if (!Array.isArray(daysArr) || !daysArr.length) return res;
    daysArr.forEach(day => {
      if (!day || !Array.isArray(day.meals)) return;
      let dayKcal=0, dayProt=0, dayFat=0, dayCarbs=0;
      day.meals.forEach(m => {
        const t = (HEYS.models && HEYS.models.mealTotals) ? HEYS.models.mealTotals(m, HEYS.models.buildProductIndex(HEYS.products.getAll())) : {};
        dayKcal += t.kcal||0; dayProt += t.prot||0; dayFat += t.fat||0; dayCarbs += t.carbs||0;
      });
      res.totalKcal += dayKcal; res.totalProt += dayProt; res.totalFat += dayFat; res.totalCarbs += dayCarbs;
      res.days++;
    });
    if (res.days) {
      res.avgKcal = Math.round(res.totalKcal/res.days);
      res.avgProt = Math.round(res.totalProt/res.days);
      res.avgFat = Math.round(res.totalFat/res.days);
      res.avgCarbs = Math.round(res.totalCarbs/res.days);
    }
    return res;
  };

  // Быстрый доступ к агрегированным данным по диапазону дат
  Stats.getRangeStats = function(startISO, endISO) {
    // Можно реализовать кэширование или хранить агрегаты в отдельном ключе
    // Пока просто пример вызова
    const days = [];
    let d = new Date(startISO), end = new Date(endISO);
    while (d <= end) {
      const iso = d.toISOString().slice(0,10);
      const rec = (HEYS.store && HEYS.store.get) ? HEYS.store.get('heys_dayv2_'+iso, null) : null;
      if (rec) days.push(rec);
      d.setDate(d.getDate()+1);
    }
    return Stats.aggregateDays(days);
  };

  // Простой компонент для отображения статистики
  function StatsTab() {
    if (typeof React === 'undefined') {
      return null;
    }
    
    return React.createElement('div', {className: 'stats-tab'},
      React.createElement('h2', null, 'Статистика'),
      React.createElement('p', null, 'Система статистики загружена и готова к работе')
    );
  }

  // Экспорт для совместимости
  HEYS.Stats = {
    StatsTab: StatsTab,
    aggregateDays: Stats.aggregateDays,
    getRangeStats: Stats.getRangeStats
  };
})(window);
