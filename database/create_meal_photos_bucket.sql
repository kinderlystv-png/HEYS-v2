-- Создание bucket для фотографий приёмов пищи
-- Выполнить в Supabase SQL Editor

-- 1. Создаём bucket (если не существует)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meal-photos',
  'meal-photos',
  true,  -- публичный доступ для чтения
  5242880,  -- 5MB лимит на файл
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ВАЖНО: Удалить старые политики если они были созданы с ошибкой
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own files" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

-- 2. Политика: авторизованные пользователи могут загружать фото
-- (clientId в пути не обязательно совпадает с auth.uid)
CREATE POLICY "Authenticated users can upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'meal-photos');

-- 3. Политика: публичное чтение (bucket публичный)
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'meal-photos');

-- 4. Политика: авторизованные пользователи могут удалять
CREATE POLICY "Authenticated users can delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'meal-photos');

-- Проверка создания:
-- SELECT * FROM storage.buckets WHERE id = 'meal-photos';
-- SELECT * FROM pg_policies WHERE tablename = 'objects';
