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
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" 
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginBottom: 16 }} />
      <Text>Пароль</Text>
      <TextInput value={password} onChangeText={setPassword} secureTextEntry
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginBottom: 24 }} />
      <Button title={loading ? 'Входим...' : 'Войти'} onPress={onSubmit} disabled={loading} />
    </View>
  );
}
