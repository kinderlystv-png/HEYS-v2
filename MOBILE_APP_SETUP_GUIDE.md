# Задача: Мобильное приложение HEYS на Expo

## Контекст
Монорепо HEYS-v2 (pnpm), есть `apps/web`, backend API локально. Цель: чистое React Native приложение для постепенного переноса функционала.

## Чеклист выполнения

### [ ] Этап 1: Инициализация (15 мин)
- [ ] Выполнить из корня: `pnpm dlx create-expo-app@latest apps/mobile --template expo-template-blank-typescript`
- [ ] В `apps/mobile/package.json` установить `"main": "expo-router/entry"`
- [ ] Установить зависимости: `cd apps/mobile && pnpm install expo-router expo-linking expo-constants expo-status-bar react-native-screens react-native-safe-area-context`
- [ ] Создать `apps/mobile/babel.config.js`:
  ```js
  module.exports = function (api) {
    api.cache(true);
    return {
      presets: ['babel-preset-expo'],
      plugins: ['expo-router/babel']
    };
  };
  ```
- [ ] Добавить в корневой `package.json` → `scripts`: `"mobile": "pnpm --filter mobile run start"`
- [ ] Добавить в `apps/mobile/package.json` → `scripts`: `"start:clear": "expo start -c"`
- [ ] Добавить в корневой `package.json` → `scripts`: `"mobile:clear": "pnpm --filter mobile run start:clear"`

### [ ] Этап 2: Навигация (10 мин)
- [ ] Создать `apps/mobile/app/_layout.tsx`:
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
- [ ] Создать `apps/mobile/app/index.tsx`:
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
- [ ] Создать папку `apps/mobile/app/auth/` (пока пустую)
- [ ] Проверить: `cd /Users/poplavskijanton/HEYS-v2 && pnpm mobile` → QR → Expo Go → видно "HEYS Mobile"

### [ ] Этап 3: API-клиент (10 мин)
- [ ] Узнать IP: `ifconfig | grep "inet " | grep -v 127.0.0.1` (первая строка)
- [ ] Создать `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<IP>:3001` (заменить `<IP>` на реальный)
- [ ] Создать `apps/mobile/.env.example`: 
  ```
  EXPO_PUBLIC_API_URL=http://192.168.1.10:3001
  ```
- [ ] Создать `apps/mobile/src/services/api-client.ts`:
  ```ts
  const API_URL = process.env.EXPO_PUBLIC_API_URL;
  
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL не задан в .env');
  }
  
  export const apiClient = {
    async get<T>(path: string, options?: RequestInit): Promise<T> {
      const res = await fetch(`${API_URL}${path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return res.json();
    },
    
    async post<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
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
- [ ] Перезапустить Expo после создания `.env`: `Ctrl+C` → `pnpm mobile`

### [ ] Этап 4: Авторизация (20 мин)
- [ ] Создать `apps/mobile/src/features/auth/api.ts`:
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
    return apiClient.post<LoginResponse>('/auth/login', req);
  }
  ```
- [ ] Создать `apps/mobile/app/auth/login.tsx`:
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
      if (!email || !password) {
        return Alert.alert('Ошибка', 'Заполните все поля');
      }
      
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
          keyboardType="email-address"
          style={{ 
            borderWidth: 1, 
            borderColor: '#ccc', 
            borderRadius: 8, 
            padding: 8, 
            marginBottom: 16 
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
            marginBottom: 24 
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
- [ ] Запустить backend: `pnpm dev` (в отдельном терминале)
- [ ] Протестировать: главный экран → "Авторизация" → ввод → submit → проверить console и backend логи

### [ ] Этап 5: Токен и контекст (следующий этап)
- [ ] Установить `expo-secure-store`
- [ ] Создать AuthContext с `token`, `user`, `isAuthenticated`
- [ ] Сохранение токена при успешном логине
- [ ] Защищённые маршруты в `_layout.tsx`

## Критические требования

⚠️ **Перезапускать Expo** после изменения `.env`  
⚠️ **НЕ добавлять** `expo-router/api` в babel (не нужен для клиента)  
⚠️ **НЕ добавлять** `module-resolver` до появления `packages/core`  
⚠️ **Проверять IP** при смене Wi-Fi сети  
⚠️ Запускать `pnpm mobile` **только из корня** `/Users/poplavskijanton/HEYS-v2`

## Команды быстрого старта

```bash
# Из корня проекта
cd /Users/poplavskijanton/HEYS-v2

# Создание Expo приложения
pnpm dlx create-expo-app@latest apps/mobile --template expo-template-blank-typescript

# Установка зависимостей
cd apps/mobile
pnpm install expo-router expo-linking expo-constants expo-status-bar react-native-screens react-native-safe-area-context

# Возврат в корень и запуск
cd /Users/poplavskijanton/HEYS-v2
pnpm mobile
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

### "Network request failed"
→ Проверить IP в `.env`, перезапустить Expo

### "Unable to resolve module"
→ `pnpm mobile:clear` (очистка кеша)

### Белый экран на телефоне
→ Проверить консоль Expo Dev Tools, убедиться что `apps/mobile/app/_layout.tsx` корректен

### Изменения в .env не применяются
→ Полностью остановить Expo (`Ctrl+C`) и запустить заново `pnpm mobile`

### Expo Go не видит QR
→ Убедиться что телефон и компьютер в одной Wi-Fi сети

## Следующие шаги после авторизации

1. **AuthContext и SecureStore**
   - Глобальное управление состоянием авторизации
   - Безопасное хранение токена

2. **Первый функциональный экран**
   - `app/day/index.tsx` - статистика дня
   - Использование реальных данных из backend

3. **Shared-пакеты**
   - Создание `packages/core` для типов и логики
   - Переиспользование между web и mobile

4. **Навигация через tabs**
   - Bottom navigation для основных разделов
   - Структура: День, История, Настройки
