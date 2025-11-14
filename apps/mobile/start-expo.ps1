# Установка переменной окружения для expo-router
$env:EXPO_ROUTER_APP_ROOT = "c:\Users\Ant\HEYS-v2\apps\mobile\app"

# Переход в директорию mobile
Set-Location -Path "c:\Users\Ant\HEYS-v2\apps\mobile"

# Запуск Expo с очисткой кеша
npx expo start --clear --port 8082
