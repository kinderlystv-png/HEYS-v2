import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'HEYS Mobile' }} />
      <Stack.Screen name="auth/login" options={{ title: 'Вход' }} />
    </Stack>
  );
}

export const unstable_settings = {
  initialRouteName: 'index',
};
