# Mobile через EAS Build

## ✅ Конфигурация завершена

Мобильное приложение настроено для изолированной сборки в монорепе:

- ✅ `scripts/build-rustore.sh` - чистая mobile-копия вне Git-корня
- ✅ `.easignore` - дополнительная защита архива от локальных файлов
- ✅ `package.json` - все зависимости явные (без `workspace:*`)
- ✅ `eas.json` - профили для dev/preview/production
- ✅ `app.json` - Android конфигурация с package ID

## 📦 Запуск сборки

### Вариант 1: Облачная сборка (рекомендуется)

```bash
# Перейти в директорию приложения
cd apps/mobile

# Войти в Expo аккаунт
eas login

# Собрать подписанный APK для RuStore из изолированной mobile-копии
npm run build:rustore

# После сборки (10-15 минут):
# - Получите ссылку на скачивание APK
# - Проверьте артефакт: npm run verify:release-apk -- /path/to/app.apk
# - Установите этот же APK на Android-устройство и пройдите вход
```

### Вариант 2: Локальная сборка

```bash
cd apps/mobile
npm run build:rustore -- --local --output /tmp/HEYS-rustore.apk
npm run verify:release-apk -- /tmp/HEYS-rustore.apk
```

**Примечание:** Локальная сборка требует установленных Android SDK и Gradle.

---

## 📋 Профили сборки

### `development`

- Режим разработки с hot reload
- Debug APK
- `NODE_ENV=development`

```bash
eas build --profile development --platform android
```

### `preview` (рекомендуется для тестирования)

- Release APK для внутреннего тестирования
- Оптимизированная сборка
- `NODE_ENV=production`

```bash
eas build --profile preview --platform android
```

### `production`

- AAB (Android App Bundle) для Google Play
- Автоинкремент версий
- `NODE_ENV=production`

```bash
eas build --profile production --platform android
```

### `rustore`

- APK для публикации в RuStore
- Production API, автоинкремент `versionCode`
- Release-подпись из EAS credentials

```bash
npm run build:rustore
npm run verify:release-apk -- /path/to/app.apk
```

---

## 🔍 Что было настроено

### 1. Изоляция от монорепы (`scripts/build-rustore.sh` + `.easignore`)

EAS определяет Git-корень всей монорепы раньше вложенного `.easignore`, поэтому
прямой запуск `eas build` из `apps/mobile` может упаковать весь репозиторий.
Штатный wrapper сначала копирует только mobile-проект во временную директорию и
запускает EAS там. Из архива исключены:

- `node_modules` - локальные зависимости
- `.env*` - локальные адреса и настройки
- `android`, `ios` - локальные prebuild-папки; EAS создаёт их из `app.json`
- `release` - старые APK/AAB и материалы магазина

**Зачем:** Уменьшает размер загружаемого архива, избегает конфликтов
зависимостей.

### 2. Standalone конфигурация (`package.json`)

- Все зависимости указаны явно с конкретными версиями
- Нет ссылок на `workspace:*` пакеты
- EAS может установить зависимости через `npm install`

### 3. EAS профили (`eas.json`)

```json
{
  "build": {
    "rustore": {
      "extends": "production",
      "credentialsSource": "remote",
      "distribution": "store",
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

**Ключевые параметры:**

- `distribution: "store"` - APK для магазина
- `buildType: "apk"` - создает APK (не AAB)
- `credentialsSource: "remote"` - EAS подставляет release-keystore

### 4. Android манифест (`app.json`)

```json
{
  "android": {
    "package": "com.heys.mobile",
    "versionCode": 3,
    "permissions": ["INTERNET", "ACCESS_NETWORK_STATE"]
  }
}
```

---

## 🐛 Troubleshooting

### Ошибка: "workspace:\* not found"

**Решение:** Убедитесь что в `package.json` нет ссылок на `workspace:*`. Все
версии должны быть явными.

### Ошибка: "Cannot resolve @heys/core"

**Решение:** Приложение не использует монорепа-пакеты, проверьте импорты.

### Сборка зависает

**Решение:**

1. Попробуйте `--local` флаг для локальной сборки
2. Проверьте статус EAS: https://status.expo.dev/

### Размер архива слишком большой

**Решение:** запускайте `npm run build:rustore`, а не прямой `eas build` из
монорепы. Wrapper сформирует отдельный чистый mobile-проект.

### RuStore сообщает о несовпадении подписи

Первые отклонённые APK `1.0.0` и `1.0.1` были подписаны Android Debug
сертификатом. Не возвращайтесь к debug-подписи: для текущего release-keystore
нужно запросить у поддержки RuStore деактивацию старого сертификата, после чего
загрузить APK заново. Все следующие версии собирайте с тем же EAS
release-keystore.

---

## 📱 Установка APK на устройство

### Через ссылку:

1. EAS предоставит ссылку после сборки
2. Откройте на Android устройстве
3. Разрешите установку из неизвестных источников

### Через ADB:

```bash
adb install path/to/app.apk
```

---

## 🔐 Важные файлы

- `.easignore` - исключения для EAS Build
- `eas.json` - профили сборки
- `app.json` - конфигурация Expo/React Native
- `package.json` - зависимости приложения
- `scripts/build-rustore.sh` - изолированный запуск EAS из монорепы
- `scripts/verify-release-apk.sh` - обязательная проверка APK перед загрузкой

**НЕ удаляйте эти файлы** без понимания последствий для сборки.

---

## 📚 Дополнительная информация

- [EAS Build документация](https://docs.expo.dev/build/introduction/)
- [Monorepo setup](https://docs.expo.dev/build-reference/working-with-monorepos/)
- [Android build types](https://docs.expo.dev/build-reference/apk/)

---

Сборка настроена и готова к использованию! 🎉
