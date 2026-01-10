/**
 * 🎨 Пример React компонента в стиле HEYS
 * Правила: Tailwind, no inline styles, BEM для CSS
 */

// ═══════════════════════════════════════════════════════════════════
// ✅ ПРАВИЛЬНО — Tailwind классы
// ═══════════════════════════════════════════════════════════════════

function MealCard({ meal, onEdit, onDelete }) {
  const { name, time, items } = meal;
  const totalKcal = items.reduce((sum, i) => sum + i.kcal, 0);
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {name}
        </h3>
        <span className="text-sm text-gray-500">{time}</span>
      </div>
      
      {/* Список продуктов */}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div 
            key={idx}
            className="flex justify-between text-sm text-gray-600 dark:text-gray-300"
          >
            <span>{item.name}</span>
            <span>{item.grams}г · {item.kcal} ккал</span>
          </div>
        ))}
      </div>
      
      {/* Итого */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex justify-between font-medium">
          <span>Итого</span>
          <span className="text-blue-600">{totalKcal} ккал</span>
        </div>
      </div>
      
      {/* Действия */}
      <div className="flex gap-2 mt-3">
        <button 
          onClick={onEdit}
          className="flex-1 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          Редактировать
        </button>
        <button 
          onClick={onDelete}
          className="flex-1 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ❌ ЗАПРЕЩЕНО — inline styles
// ═══════════════════════════════════════════════════════════════════

// НЕ ИСПОЛЬЗОВАТЬ:
// <div style={{ color: 'red', padding: '10px' }}>
// <span style={{ fontSize: '14px' }}>

// ═══════════════════════════════════════════════════════════════════
// ✅ ПРАВИЛЬНО — динамические стили через Tailwind
// ═══════════════════════════════════════════════════════════════════

function ProgressBar({ percent }) {
  // Динамическая ширина — единственный допустимый inline style
  return (
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
      <div 
        className="h-full bg-green-500 transition-all duration-300"
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ✅ ПРАВИЛЬНО — условные классы
// ═══════════════════════════════════════════════════════════════════

function StatusBadge({ status }) {
  const baseClasses = 'px-2 py-1 text-xs font-medium rounded-full';
  
  const statusClasses = {
    active: 'bg-green-100 text-green-800',
    trial: 'bg-blue-100 text-blue-800',
    expired: 'bg-red-100 text-red-800',
    none: 'bg-gray-100 text-gray-800'
  };
  
  return (
    <span className={`${baseClasses} ${statusClasses[status] || statusClasses.none}`}>
      {status}
    </span>
  );
}
