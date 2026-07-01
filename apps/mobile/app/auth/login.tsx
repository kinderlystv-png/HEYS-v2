import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { login } from '../../src/features/auth/api';
import { saveStoredSession } from '../../src/features/session/storage';
import { colors, FieldLabel, PrimaryButton, Screen } from '../../src/shared/ui/shell';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) return Alert.alert('Ошибка', 'Заполните email и пароль');
    
    try {
      setLoading(true);
      const session = await login({ email, mfa_code: mfaCode || undefined, password });
      await saveStoredSession(session);
      router.replace('/web');
    } catch (error: any) {
      const message = error?.message || 'Не удалось войти';
      if (/mfa/i.test(message)) setNeedsMfa(true);
      Alert.alert('Ошибка входа', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Text style={styles.title}>Вход в HEYS</Text>
        <Text style={styles.subtitle}>Доступ к данным закрыт аккаунтом и серверными правами.</Text>

        <View style={styles.form}>
          <FieldLabel>Email</FieldLabel>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            style={styles.input}
            textContentType="username"
            value={email}
          />

          <FieldLabel>Пароль</FieldLabel>
          <TextInput
            autoComplete="password"
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
          />

          {needsMfa ? (
            <>
              <FieldLabel>MFA-код</FieldLabel>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setMfaCode}
                style={styles.input}
                value={mfaCode}
              />
            </>
          ) : null}

          <PrimaryButton disabled={loading} label={loading ? 'Входим...' : 'Войти'} onPress={onSubmit} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  form: {
    gap: 8,
    marginTop: 26,
  },
  input: {
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
