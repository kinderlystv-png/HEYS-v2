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

-- 2. Политика: авторизованные пользователи могут загружать в свою папку
CREATE POLICY "Users can upload to own folder" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Политика: авторизованные пользователи могут читать свои файлы
CREATE POLICY "Users can read own files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Политика: публичное чтение (для отображения фото)
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'meal-photos');

-- 5. Политика: авторизованные пользователи могут удалять свои файлы
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Проверка создания:
-- SELECT * FROM storage.buckets WHERE id = 'meal-photos';
