import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { login, loginWithPin } from '../../src/features/auth/api';
import { saveStoredSession } from '../../src/features/session/storage';
import { colors, FieldLabel, PrimaryButton, Screen } from '../../src/shared/ui/shell';

type LoginMode = 'client' | 'curator';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loginMode, setLoginMode] = useState<LoginMode>('client');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (loginMode === 'client' && (!phone || !pin)) {
      return Alert.alert('Ошибка', 'Введите телефон и PIN');
    }
    if (loginMode === 'curator' && (!email || !password)) {
      return Alert.alert('Ошибка', 'Заполните email и пароль');
    }

    try {
      setLoading(true);
      const session = loginMode === 'client'
        ? await loginWithPin({ phone, pin })
        : await login({ email, mfa_code: mfaCode || undefined, password });
      await saveStoredSession(session);
      router.replace('/web');
    } catch (error: any) {
      const message = error?.message || 'Не удалось войти';
      if (loginMode === 'curator' && /mfa/i.test(message)) setNeedsMfa(true);
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
        <Text style={styles.subtitle}>Клиентам нужен телефон и PIN. Кураторам - email и пароль.</Text>

        <View style={styles.form}>
          <View style={styles.modeSwitch} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: loginMode === 'client' }}
              onPress={() => setLoginMode('client')}
              style={[styles.modeButton, loginMode === 'client' ? styles.modeButtonActive : null]}
            >
              <Text style={[styles.modeText, loginMode === 'client' ? styles.modeTextActive : null]}>Клиент</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: loginMode === 'curator' }}
              onPress={() => setLoginMode('curator')}
              style={[styles.modeButton, loginMode === 'curator' ? styles.modeButtonActive : null]}
            >
              <Text style={[styles.modeText, loginMode === 'curator' ? styles.modeTextActive : null]}>Куратор</Text>
            </Pressable>
          </View>

          {loginMode === 'client' ? (
            <>
              <FieldLabel>Телефон</FieldLabel>
              <TextInput
                autoComplete="tel"
                keyboardType="phone-pad"
                onChangeText={setPhone}
                placeholder="9624556111"
                style={styles.input}
                textContentType="telephoneNumber"
                value={phone}
              />

              <FieldLabel>PIN</FieldLabel>
              <TextInput
                keyboardType="number-pad"
                maxLength={8}
                onChangeText={setPin}
                secureTextEntry
                style={styles.input}
                textContentType="oneTimeCode"
                value={pin}
              />
            </>
          ) : (
            <>
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
            </>
          )}

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
  modeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
  },
  modeSwitch: {
    backgroundColor: '#e8eeeb',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 14,
    padding: 4,
  },
  modeText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  modeTextActive: {
    color: '#fff',
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
