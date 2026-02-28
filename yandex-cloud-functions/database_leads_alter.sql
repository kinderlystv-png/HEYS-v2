-- Добавляем новые колонки в таблицу лидов
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent VARCHAR(50) DEFAULT 'trial';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS plan_name VARCHAR(50);
