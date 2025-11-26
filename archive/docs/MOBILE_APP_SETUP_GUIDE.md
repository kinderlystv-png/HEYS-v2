# Задача: Мобильное приложение HEYS на Expo (Standalone APK)

## Контекст

Монорепо HEYS-v2 (pnpm), есть `apps/web`, backend API локально. Цель:
полноценное Android APK приложение для установки на телефон и постепенного
переноса функционала из web версии.

## Чеклист выполнения

### [✓] Этап 1: Инициализация (15 мин)

- [x] Выполнить из корня:
      `pnpm dlx create-expo-app@latest apps/mobile --template expo-template-blank-typescript`
- [x] В `apps/mobile/package.json` установить `"main": "expo-router/entry"`
- [x] Создать структуру директорий:
      `mkdir -p apps/mobile/app/auth apps/mobile/src/services apps/mobile/src/features/auth`
- [x] Установить совместимые зависимости:
      `cd apps/mobile && pnpm add expo-router expo-linking expo-constants react-native-screens react-native-safe-area-context`
- [x] Проверить `apps/mobile/tsconfig.json` → в `include` должны быть
      `["app", "src"]`
- [x] Создать `apps/mobile/babel.config.js`:
  ```js
  module.exports = function (api) {
    api.cache(true);
    return {
      presets: ['babel-preset-expo'],
      plugins: ['expo-router/babel'],
    };
  };
  ```
- [x] Добавить в корневой `package.json` → `scripts`:
      `"mobile": "pnpm --filter mobile run start"`
- [x] Добавить в `apps/mobile/package.json` → `scripts`:
      `"start:clear": "expo start -c"`
- [x] Добавить в корневой `package.json` → `scripts`:
      `"mobile:clear": "pnpm --filter mobile run start:clear"`
- [ ] (Опционально) В `apps/mobile/app.json` → `expo.plugins`: добавить
      `["expo-router"]` для продвинутой навигации

### [✓] Этап 2: Навигация (10 мин)

- [x] Создать `apps/mobile/app/_layout.tsx`:

  ```tsx
  import { Stack } from 'expo-router';

  export default function RootLayout() {
    return (
      <Stack>
        <Stack.Screen name="index" options={{ title: 'HEYS Mobile' }} />
        <Stack.Screen name="auth/login" options={{ title: 'Вход' }} />
      </Stack>
    );
  }
  ```

- [x] Создать `apps/mobile/app/index.tsx`:

  ```tsx
  import { Link } from 'expo-router';
  import { Text, View } from 'react-native';

  export default function Index() {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 24 }}>HEYS Mobile</Text>
        <Link href="/auth/login" style={{ marginTop: 24 }}>
          <Text style={{ color: 'blue' }}>→ Авторизация</Text>
        </Link>
      </View>
    );
  }
  ```

- [x] (Опционально) Проверить через Expo Go:
      `cd /Users/poplavskijanton/HEYS-v2 && pnpm mobile` → QR → Expo Go
- [ ] Или **пропустить и сразу перейти к Этапу 5 для сборки APK**

### [✓] Этап 3: API-клиент (10 мин)

- [x] Узнать IP: `ifconfig | grep "inet " | grep -v 127.0.0.1` (первая строка) —
      **192.168.1.114**
- [x] Создать `apps/mobile/.env`:
      `EXPO_PUBLIC_API_URL=http://192.168.1.114:3001`
- [x] Создать `apps/mobile/.env.example`:
  ```
  EXPO_PUBLIC_API_URL=http://192.168.1.10:3001
  ```
- [x] Создать `apps/mobile/src/services/api-client.ts`:

  ```ts
  const API_URL = process.env.EXPO_PUBLIC_API_URL;
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL не задан в .env');

  export const apiClient = {
    async post<T>(
      path: string,
      body: unknown,
      options?: RequestInit,
    ): Promise<T> {
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...options,
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return res.json();
    },
  };
  ```

- [x] Перезапустить Expo после создания `.env`: `Ctrl+C` → `pnpm mobile`

### [✓] Этап 4: Авторизация (20 мин)

- [x] Создать `apps/mobile/src/features/auth/api.ts`:

  ```ts
  import { apiClient } from '../../services/api-client';

  export type LoginRequest = {
    email: string;
    password: string;
  };

  export type LoginResponse = {
    token: string;
  };

  export async function login(req: LoginRequest): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/auth/login', req); // Замени /auth/login на реальный эндпоинт
  }
  ```

- [x] Создать `apps/mobile/app/auth/login.tsx`:

  ```tsx
  import React, { useState } from 'react';
  import { Alert, Button, Text, TextInput, View } from 'react-native';
  import { useRouter } from 'expo-router';
  import { login } from '../../src/features/auth/api';

  export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const onSubmit = async () => {
      if (!email || !password) return Alert.alert('Ошибка', 'Заполните поля');

      try {
        setLoading(true);
        const res = await login({ email, password });
        console.log('Login success:', res);
        Alert.alert('Успех', 'Вы авторизованы');
        router.back();
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось войти');
      } finally {
        setLoading(false);
      }
    };

    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, marginBottom: 24 }}>Вход в HEYS</Text>

        <Text>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 8,
            marginBottom: 16,
          }}
        />
        <Text>Пароль</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 8,
            marginBottom: 24,
          }}
        />
        <Button
          title={loading ? 'Входим...' : 'Войти'}
          onPress={onSubmit}
          disabled={loading}
        />
      </View>
    );
  }
  ```

- [x] Запустить backend: `pnpm dev` (в отдельном терминале)
- [ ] Протестировать: главный экран → "Авторизация" → ввод → submit → проверить
      console и backend логи

### [ ] Этап 5: Сборка APK для установки на телефон (15 мин)

#### Вариант A: EAS Build (рекомендую, проще)

- [ ] Установить EAS CLI: `pnpm add -g eas-cli`
- [ ] Войти в Expo: `eas login`
- [ ] Настроить проект: `cd apps/mobile && eas build:configure`
- [ ] Создать `eas.json`:
  ```json
  {
    "build": {
      "development": {
        "developmentClient": true,
        "distribution": "internal",
        "android": {
          "buildType": "apk"
        }
      },
      "preview": {
        "distribution": "internal",
        "android": {
          "buildType": "apk"
        }
      }
    }
  }
  ```
- [ ] Добавить в `app.json` → `expo.android.package`: `"com.heys.mobile.dev"`
- [ ] Запустить сборку: `eas build --profile development --platform android`
- [ ] Дождаться окончания сборки (~10-15 мин)
- [ ] Скачать APK по ссылке из терминала
- [ ] Установить на телефон: перенести APK и открыть

#### Вариант B: Локальная сборка (больше контроля)

- [ ] Установить Android Studio и SDK
- [ ] Сгенерировать Android проект:
      `cd apps/mobile && npx expo prebuild --platform android`
- [ ] Собрать APK: `cd android && ./gradlew assembleRelease`
- [ ] APK будет в `android/app/build/outputs/apk/release/app-release.apk`
- [ ] Перенести на телефон и установить

### [ ] Этап 6: Токен и контекст (после установки APK)

- [ ] Установить `expo-secure-store`
- [ ] Создать AuthContext для хранения `token`, `user`
- [ ] Сохранение токена при успешном логине
- [ ] Защищённые маршруты в `_layout.tsx`

## Критические требования

⚠️ **Использовать `pnpm expo install`** для зависимостей Expo.  
⚠️ **Перезапускать приложение** после изменения `.env`.  
⚠️ **Проверять IP** при смене Wi-Fi сети (для API_URL).  
⚠️ **Для APK**: включить "Установка из неизвестных источников" на Android.  
⚠️ **EAS Build требует** аккаунт Expo (бесплатный).  
⚠️ **Локальная сборка требует** Android Studio + Java JDK.

## Команды быстрого старта

### Инициализация и разработка

```bash
cd /Users/poplavskijanton/HEYS-v2
pnpm dlx create-expo-app@latest apps/mobile --template expo-template-blank-typescript
cd apps/mobile
pnpm expo install expo-router expo-linking expo-constants expo-status-bar react-native-screens react-native-safe-area-context
cd ..
# Опционально: тестирование через Expo Go
pnpm mobile
```

### Сборка APK (после этапов 1-4)

```bash
# EAS Build (рекомендуется)
pnpm add -g eas-cli
eas login
cd apps/mobile
eas build:configure
eas build --profile development --platform android

# Или локальная сборка
cd apps/mobile
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

## Итоговая структура

```
apps/mobile/
├── .env                    # EXPO_PUBLIC_API_URL
├── .env.example
├── app/
│   ├── _layout.tsx        # Stack навигация
│   ├── index.tsx          # Главный экран
│   └── auth/
│       └── login.tsx      # Экран авторизации
├── src/
│   ├── services/
│   │   └── api-client.ts  # HTTP клиент
│   └── features/
│       └── auth/
│           └── api.ts     # API авторизации
├── babel.config.js
└── package.json
```

## Troubleshooting

### Общие проблемы

- **"Network request failed"** → Проверить IP в `.env`, перезапустить
  приложение.
- **"Unable to resolve module"** → `pnpm mobile:clear` (очистка кеша).
- **Белый экран** → Проверить консоль, `apps/mobile/app/_layout.tsx` корректен.
- **`pnpm expo install` не работает** → Использовать `npx expo install`
  (fallback).

### Проблемы с APK

- **"Приложение не установлено"** → Включить "Установка из неизвестных
  источников" в настройках Android.
- **EAS Build зависает** → Проверить статус на
  expo.dev/accounts/[username]/builds.
- **Gradle ошибка** → Убедиться что установлена Java JDK 17 (`java -version`).
- **APK не запускается** → Проверить логи через `adb logcat` или пересобрать с
  `--clear-cache`.
