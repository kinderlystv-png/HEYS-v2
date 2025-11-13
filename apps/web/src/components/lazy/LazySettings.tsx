// filepath: apps/web/src/components/lazy/LazySettings.tsx
// Lazy loaded Settings Panel - Performance Sprint Day 3

import React, { Suspense } from 'react';

import { log } from '../../lib/browser-logger';
import { createChunkedLazyComponent } from '../../utils/dynamicImport';
import { SettingsSkeleton } from '../loading/ComponentSkeleton';

// Lazy load настроек по категориям
const GeneralSettings = createChunkedLazyComponent(
  'SETTINGS',
  'general',
  () => Promise.resolve({ default: GeneralSettingsComponent }),
  {
    retries: 2,
    timeout: 6000,
    preloadOnHover: true,
  },
);

const PerformanceSettings = createChunkedLazyComponent(
  'SETTINGS',
  'performance',
  () => Promise.resolve({ default: PerformanceSettingsComponent }),
  {
    retries: 2,
    timeout: 6000,
  },
);

const SecuritySettings = createChunkedLazyComponent(
  'SETTINGS',
  'security',
  () => Promise.resolve({ default: SecuritySettingsComponent }),
  {
    retries: 3,
    timeout: 8000,
  },
);

const NotificationSettings = createChunkedLazyComponent(
  'SETTINGS',
  'notifications',
  () => Promise.resolve({ default: NotificationSettingsComponent }),
  {
    retries: 2,
    timeout: 5000,
  },
);

const AdvancedSettings = createChunkedLazyComponent(
  'SETTINGS',
  'advanced',
  () => Promise.resolve({ default: AdvancedSettingsComponent }),
  {
    retries: 2,
    timeout: 7000,
  },
);

interface LazySettingsProps {
  /** Активная категория настроек */
  category?: 'general' | 'performance' | 'security' | 'notifications' | 'advanced' | 'all';
  /** Текущие настройки */
  currentSettings?: Record<string, unknown>;
  /** Колбэк при изменении настроек */
  onSettingsChange?: (category: string, key: string, value: unknown) => void;
  /** Колбэк при сохранении */
  onSave?: (settings: Record<string, unknown>) => void;
  /** Колбэк при ошибке */
  onError?: (error: Error) => void;
  /** Режим только для чтения */
  readonly?: boolean;
}

/**
 * Lazy loaded Settings Panel с категоризированными настройками
 */
export const LazySettings: React.FC<LazySettingsProps> = ({
  category = 'all',
  currentSettings = { _ },
  onSettingsChange,
  onSave,
  _onError,
  readonly = false,
}) => {
  const [activeCategory, setActiveCategory] = React.useState<string>(
    category === 'all' ? 'general' : category,
  );
  const [preloadQueue, setPreloadQueue] = React.useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // Settings categories configuration
  const settingsCategories = [
    { key: 'general', label: '⚙️ Общие', icon: '🔧', priority: 'high' },
    { key: 'performance', label: '⚡ Производительность', icon: '🚀', priority: 'high' },
    { key: 'security', label: '🔐 Безопасность', icon: '🛡️', priority: 'medium' },
    { key: 'notifications', label: '🔔 Уведомления', icon: '📢', priority: 'low' },
    { key: 'advanced', label: '🛠️ Расширенные', icon: '⚙️', priority: 'low' },
  ];

  // Error handling
  const handleComponentError = React.useCallback((error: Error, componentName: string) => {
    if (process.env.NODE_ENV === 'development') {
      log.error('Lazy settings component failed to load', {
        component: componentName,
        error,
      });
    }
    onError?.(error);
  }, []);

  // Settings change handler
  const handleSettingChange = React.useCallback(
    (categoryKey: string, settingKey: string, value: unknown) => {
      if (_) return;

      setHasUnsavedChanges(true);
      onSettingsChange?.(categoryKey, settingKey, value);
    },
    [__readonly, onSettingsChange],
  );

  // Preload on hover
  const handleCategoryHover = React.useCallback(
    (categoryKey: string) => {
      if (!preloadQueue.has(categoryKey)) {
        setPreloadQueue((prev) => new Set([...prev, categoryKey]));
        if (process.env.NODE_ENV === 'development') {
          log.debug('Preloading settings component', {
            category: categoryKey,
          });
        }
      }
    },
    [preloadQueue],
  );

  // Save settings
  const handleSave = React.useCallback(() => {
    if (_) return;

    setHasUnsavedChanges(false);
    onSave?.(currentSettings);
    if (process.env.NODE_ENV === 'development') {
      log.info('Settings saved', {
        categories: Object.keys(currentSettings || {}),
        isReadonly: readonly,
      });
    }
  }, [__readonly, currentSettings, onSave]);

  // Single category mode
  if (category !== 'all') {
    const renderSingleCategory = () => {
      const categoryProps = {
        settings: currentSettings,
        onChange: handleSettingChange,
        _readonly,
        onError: (error: Error) => handleComponentError(error, category),
      };

      switch (category) {
        case 'general':
          return (
            <Suspense fallback={<SettingsSkeleton />}>
              <GeneralSettings {...categoryProps} />
            </Suspense>
          );
        case 'performance':
          return (
            <Suspense fallback={<SettingsSkeleton />}>
              <PerformanceSettings {...categoryProps} />
            </Suspense>
          );
        case 'security':
          return (
            <Suspense fallback={<SettingsSkeleton />}>
              <SecuritySettings {...categoryProps} />
            </Suspense>
          );
        case 'notifications':
          return (
            <Suspense fallback={<SettingsSkeleton />}>
              <NotificationSettings {...categoryProps} />
            </Suspense>
          );
        case 'advanced':
          return (
            <Suspense fallback={<SettingsSkeleton />}>
              <AdvancedSettings {...categoryProps} />
            </Suspense>
          );
        default:
          return <div>Unknown settings category: {category}</div>;
      }
    };

    return <div className="lazy-settings-single">{renderSingleCategory()}</div>;
  }

  // Full settings panel with sidebar navigation
  return (
    <div className="lazy-settings-full" style={{ display: 'flex', minHeight: '600px' }}>
      {/* Sidebar Navigation */}
      <div
        style={{
          width: '240px',
          borderRight: '1px solid #e0e0e0',
          padding: '20px 0',
          backgroundColor: '#f8f9fa',
        }}
      >
        <h3
          style={{ padding: '0 20px', marginBottom: '20px', fontSize: '16px', fontWeight: '600' }}
        >
          ⚙️ Настройки
        </h3>

        {settingsCategories.map((cat: unknown) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            onMouseEnter={() => handleCategoryHover(cat.key)}
            style={{
              width: '100%',
              padding: '12px 20px',
              border: 'none',
              backgroundColor: activeCategory === cat.key ? '#2563eb' : 'transparent',
              color: activeCategory === cat.key ? 'white' : '#374151',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
            {preloadQueue.has(cat.key) && (
              <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>✓</span>
            )}
          </button>
        ))}

        {/* Save button in sidebar */}
        {hasUnsavedChanges && !readonly && (
          <div style={{ padding: '20px', borderTop: '1px solid #e0e0e0', marginTop: '20px' }}>
            <button
              onClick={handleSave}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              💾 Сохранить
            </button>
          </div>
        )}
      </div>

      {/* Main Settings Content */}
      <div style={{ flex: 1, padding: '20px' }}>
        {activeCategory === 'general' && (
          <Suspense fallback={<SettingsSkeleton />}>
            <GeneralSettings
              settings={currentSettings}
              onChange={handleSettingChange}
              readonly={readonly}
              onError={(error: Error) => handleComponentError(error, 'General')}
            />
          </Suspense>
        )}

        {activeCategory === 'performance' && (
          <Suspense fallback={<SettingsSkeleton />}>
            <PerformanceSettings
              settings={currentSettings}
              onChange={handleSettingChange}
              readonly={readonly}
              onError={(error: Error) => handleComponentError(error, 'Performance')}
            />
          </Suspense>
        )}

        {activeCategory === 'security' && (
          <Suspense fallback={<SettingsSkeleton />}>
            <SecuritySettings
              settings={currentSettings}
              onChange={handleSettingChange}
              readonly={readonly}
              onError={(error: Error) => handleComponentError(error, 'Security')}
            />
          </Suspense>
        )}

        {activeCategory === 'notifications' && (
          <Suspense fallback={<SettingsSkeleton />}>
            <NotificationSettings
              settings={currentSettings}
              onChange={handleSettingChange}
              readonly={readonly}
              onError={(error: Error) => handleComponentError(error, 'Notifications')}
            />
          </Suspense>
        )}

        {activeCategory === 'advanced' && (
          <Suspense fallback={<SettingsSkeleton />}>
            <AdvancedSettings
              settings={currentSettings}
              onChange={handleSettingChange}
              readonly={readonly}
              onError={(error: Error) => handleComponentError(error, 'Advanced')}
            />
          </Suspense>
        )}
      </div>

      {/* Preload indicator */}
      {preloadQueue.size > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '8px 12px',
            backgroundColor: '#2563eb',
            color: 'white',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 1000,
          }}
        >
          🚀 Preloaded: {preloadQueue.size}/{settingsCategories.length}
        </div>
      )}
    </div>
  );
};

// Settings Components (заглушки для демонстрации)

const GeneralSettingsComponent: React.FC<Record<string, unknown>> = ({
  _settings,
  _onChange,
  readonly,
}) => {
  const [localSettings, setLocalSettings] = React.useState({
    language: settings?.language || 'ru',
    theme: settings?.theme || 'light',
    timezone: settings?.timezone || 'Europe/Moscow',
    dateFormat: settings?.dateFormat || 'DD.MM.YYYY',
  });

  const handleChange = (key: string, value: unknown) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    onChange?.('general', key, value);
  };

  return (
    <div>
      <h2>⚙️ Общие настройки</h2>

      <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Язык интерфейса:
          </label>
          <select
            value={localSettings.language}
            onChange={(e) => handleChange('language', e.target.value)}
            disabled={readonly}
            style={{
              width: '200px',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Тема оформления:
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            {['light', 'dark', 'auto'].map((theme: unknown) => (
              <label key={theme} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="radio"
                  value={theme}
                  checked={localSettings.theme === theme}
                  onChange={(e) => handleChange('theme', e.target.value)}
                  disabled={readonly}
                />
                <span style={{ textTransform: 'capitalize' }}>{theme}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Часовой пояс:
          </label>
          <select
            value={localSettings.timezone}
            onChange={(e) => handleChange('timezone', e.target.value)}
            disabled={readonly}
            style={{
              width: '250px',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            <option value="Europe/Moscow">Moscow (UTC+3)</option>
            <option value="Europe/London">London (UTC+0)</option>
            <option value="America/New_York">New York (UTC-5)</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>
        Bundle: settings-general.js
      </div>
    </div>
  );
};

const PerformanceSettingsComponent: React.FC<Record<string, unknown>> = ({
  _settings,
  _onChange,
  readonly,
}) => {
  const [localSettings, setLocalSettings] = React.useState({
    enableCaching: settings?.enableCaching ?? true,
    lazyLoading: settings?.lazyLoading ?? true,
    compressionLevel: settings?.compressionLevel || 'medium',
    maxConcurrentRequests: settings?.maxConcurrentRequests || 5,
  });

  const handleChange = (key: string, value: unknown) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    onChange?.('performance', key, value);
  };

  return (
    <div>
      <h2>⚡ Настройки производительности</h2>

      <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: '500' }}>Включить кэширование</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Кэширование ресурсов для быстрой загрузки
            </div>
          </div>
          <input
            type="checkbox"
            checked={localSettings.enableCaching}
            onChange={(e) => handleChange('enableCaching', e.target.checked)}
            disabled={readonly}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: '500' }}>Ленивая загрузка</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Загрузка компонентов по требованию
            </div>
          </div>
          <input
            type="checkbox"
            checked={localSettings.lazyLoading}
            onChange={(e) => handleChange('lazyLoading', e.target.checked)}
            disabled={readonly}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Уровень сжатия:
          </label>
          <select
            value={localSettings.compressionLevel}
            onChange={(e) => handleChange('compressionLevel', e.target.value)}
            disabled={readonly}
            style={{
              width: '200px',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Максимум параллельных запросов: {localSettings.maxConcurrentRequests}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={localSettings.maxConcurrentRequests}
            onChange={(e) => handleChange('maxConcurrentRequests', parseInt(e.target.value))}
            disabled={readonly}
            style={{ width: '300px' }}
          />
        </div>
      </div>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>
        Bundle: settings-performance.js
      </div>
    </div>
  );
};

const SecuritySettingsComponent: React.FC<Record<string, unknown>> = ({
  _settings,
  _onChange,
  readonly,
}) => {
  return (
    <div>
      <h2>🔐 Настройки безопасности</h2>
      <div
        style={{
          padding: '20px',
          backgroundColor: '#fef3c7',
          borderRadius: '8px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🛡️</span>
          <span style={{ fontWeight: '500' }}>Безопасность включена</span>
        </div>
      </div>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>
        Bundle: settings-security.js (Heavy component - loaded on demand)
      </div>
    </div>
  );
};

const NotificationSettingsComponent: React.FC<Record<string, unknown>> = ({
  _settings,
  _onChange,
  readonly,
}) => {
  return (
    <div>
      <h2>🔔 Настройки уведомлений</h2>
      <div
        style={{
          padding: '20px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          marginBottom: '20px',
        }}
      >
        <div>📢 Уведомления настроены</div>
      </div>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>
        Bundle: settings-notifications.js
      </div>
    </div>
  );
};

const AdvancedSettingsComponent: React.FC<Record<string, unknown>> = ({
  _settings,
  _onChange,
  readonly,
}) => {
  return (
    <div>
      <h2>🛠️ Расширенные настройки</h2>
      <div
        style={{
          padding: '20px',
          backgroundColor: '#fef2f2',
          borderRadius: '8px',
          marginBottom: '20px',
        }}
      >
        <div style={{ color: '#dc2626' }}>⚠️ Осторожно: расширенные настройки</div>
      </div>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>
        Bundle: settings-advanced.js (Low priority loading)
      </div>
    </div>
  );
};

export {
  AdvancedSettingsComponent,
  GeneralSettingsComponent,
  NotificationSettingsComponent,
  PerformanceSettingsComponent,
  SecuritySettingsComponent,
};
