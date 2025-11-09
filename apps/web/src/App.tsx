import { useEffect, useState } from 'react';
import { log, logError } from './lib/browser-logger';
import './App.css';

// Типы для HEYS глобального объекта
declare global {
  interface Window {
    HEYS: any;
    React: any;
  }
}

export function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'day' | 'user' | 'reports'>('day');
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Инициализация HEYS legacy модулей
    const initializeHEYS = async () => {
      try {
        log.info('Initializing HEYS application');

        // Проверяем наличие глобального объекта HEYS
        if (!window.HEYS) {
          window.HEYS = {};
        }

        // Загружаем продукты из localStorage
        const storedProducts = localStorage.getItem('products');
        if (storedProducts) {
          const parsedProducts = JSON.parse(storedProducts);
          setProducts(parsedProducts);
          log.debug('Products loaded from localStorage', { count: parsedProducts.length });
        } else {
          // Создаём пустой массив продуктов
          const initialProducts: any[] = [];
          localStorage.setItem('products', JSON.stringify(initialProducts));
          setProducts(initialProducts);
          log.info('Created empty products array');
        }

        setIsInitialized(true);
        log.info('HEYS application initialized successfully');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        logError(err as Error, { context: 'heys-initialization' });
        setError(`Ошибка инициализации: ${errorMsg}`);
      }
    };

    initializeHEYS();
  }, []);

  const renderDayTab = () => {
    // Используем legacy DayTab если доступен
    if (window.HEYS?.DayTab && window.React) {
      const DayTab = window.HEYS.DayTab;
      return window.React.createElement(DayTab, {
        products: products,
        date: currentDate,
        onDateChange: (newDate: string) => setCurrentDate(newDate),
      });
    }

    // Fallback UI если legacy модуль недоступен
    return (
      <div className="day-tab">
        <h2>📅 День: {currentDate}</h2>
        <div className="date-picker">
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="date-input"
          />
        </div>

        <div className="meals-section">
          <h3>🍽️ Приёмы пищи</h3>
          <p className="info-text">
            Здесь будет отображаться список приёмов пищи за день
          </p>
          <button className="add-meal-btn">+ Добавить приём пищи</button>
        </div>

        <div className="training-section">
          <h3>💪 Тренировки</h3>
          <p className="info-text">Данные о тренировках и активности</p>
        </div>

        <div className="stats-section">
          <h3>📊 Статистика дня</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Калории:</span>
              <span className="stat-value">0 ккал</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Белки:</span>
              <span className="stat-value">0 г</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Жиры:</span>
              <span className="stat-value">0 г</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Углеводы:</span>
              <span className="stat-value">0 г</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUserTab = () => {
    // Используем legacy UserTab если доступен
    if (window.HEYS?.UserTab && window.React) {
      const UserTab = window.HEYS.UserTab;
      return window.React.createElement(UserTab, {});
    }

    // Fallback UI
    return (
      <div className="user-tab">
        <h2>👤 Профиль пользователя</h2>
        
        <div className="profile-section">
          <h3>📋 Основные данные</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Имя:</label>
              <input type="text" placeholder="Введите имя" />
            </div>
            <div className="form-field">
              <label>Возраст:</label>
              <input type="number" placeholder="Возраст" />
            </div>
            <div className="form-field">
              <label>Пол:</label>
              <select>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </select>
            </div>
            <div className="form-field">
              <label>Вес (кг):</label>
              <input type="number" placeholder="Вес" />
            </div>
            <div className="form-field">
              <label>Рост (см):</label>
              <input type="number" placeholder="Рост" />
            </div>
          </div>
        </div>

        <div className="norms-section">
          <h3>🎯 Нормы питания</h3>
          <div className="norms-grid">
            <div className="norm-card">
              <label>Калории (ккал/день):</label>
              <input type="number" placeholder="2000" />
            </div>
            <div className="norm-card">
              <label>Белки (г/день):</label>
              <input type="number" placeholder="150" />
            </div>
            <div className="norm-card">
              <label>Жиры (г/день):</label>
              <input type="number" placeholder="70" />
            </div>
            <div className="norm-card">
              <label>Углеводы (г/день):</label>
              <input type="number" placeholder="250" />
            </div>
          </div>
        </div>

        <button className="save-btn">💾 Сохранить</button>
      </div>
    );
  };

  const renderReportsTab = () => {
    return (
      <div className="reports-tab">
        <h2>📈 Отчёты и статистика</h2>
        
        <div className="reports-section">
          <h3>📊 Недельная статистика</h3>
          <p className="info-text">Здесь будут отображаться графики и аналитика</p>
        </div>

        <div className="charts-section">
          <h3>📉 Графики</h3>
          <div className="charts-placeholder">
            <p>Графики калорий, БЖУ, веса и других показателей</p>
          </div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="app">
        <div className="error-container">
          <h1>❌ Ошибка</h1>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>🔄 Перезагрузить</button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>⏳ Загрузка HEYS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🥗 HEYS - Учёт питания и тренировок</h1>
        <p className="subtitle">Современная система управления питанием</p>
      </header>

      <nav className="app-nav">
        <button
          className={`nav-btn ${activeTab === 'day' ? 'active' : ''}`}
          onClick={() => setActiveTab('day')}
        >
          📅 День
        </button>
        <button
          className={`nav-btn ${activeTab === 'user' ? 'active' : ''}`}
          onClick={() => setActiveTab('user')}
        >
          👤 Профиль
        </button>
        <button
          className={`nav-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          📈 Отчёты
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'day' && renderDayTab()}
        {activeTab === 'user' && renderUserTab()}
        {activeTab === 'reports' && renderReportsTab()}
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <p>HEYS Platform v2.0 — База продуктов: {products.length} шт.</p>
          <p className="footer-note">Последнее обновление: {new Date().toLocaleDateString('ru-RU')}</p>
        </div>
      </footer>
    </div>
  );
}
