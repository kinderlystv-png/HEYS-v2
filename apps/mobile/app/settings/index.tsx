import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';

import { canUseBiometrics } from '../../src/features/biometrics';
import { ACCOUNT_DELETION_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../../src/shared/config/urls';
import { loadStoredSession, saveStoredSession } from '../../src/features/session/storage';
import type { StoredSession } from '../../src/features/session/types';
import { colors, PrimaryButton, Screen } from '../../src/shared/ui/shell';

export default function SettingsScreen() {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  useEffect(() => {
    loadStoredSession().then((stored) => {
      setSession(stored);
      setBiometricsEnabled(Boolean(stored?.biometricUnlockEnabled));
    });
  }, []);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch((err) => Alert.alert('Ссылка не открылась', err.message));
  };

  const toggleBiometrics = async (enabled: boolean) => {
    if (!session) {
      Alert.alert('Нет активной сессии', 'Сначала войдите в HEYS.');
      return;
    }

    if (enabled) {
      const available = await canUseBiometrics();
      if (!available) {
        Alert.alert('Face ID недоступен', 'На устройстве нет настроенной биометрии.');
        return;
      }
    }

    const nextSession = { ...session, biometricUnlockEnabled: enabled };
    await saveStoredSession(nextSession);
    setSession(nextSession);
    setBiometricsEnabled(enabled);
  };

  const logout = () => router.replace('/auth/logout');
  const accountLabel = session?.user?.email || session?.user?.name || 'Активный аккаунт не найден';
  const roleLabel = session?.kind === 'client'
    ? 'Клиент'
    : session?.kind === 'curator'
      ? 'Куратор'
      : session?.user?.role || 'Роль не указана';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Настройки</Text>
        <Text style={styles.subtitle}>
          Управление локальной сессией, доступом к web-части и служебными ссылками.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Аккаунт</Text>
          <Text style={styles.value}>{accountLabel}</Text>
          <Text style={styles.value}>Роль: {roleLabel}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Face ID / Touch ID</Text>
            <Text style={styles.rowBody}>Разблокирует уже выданную mobile-сессию на этом устройстве.</Text>
          </View>
          <Switch onValueChange={toggleBiometrics} value={biometricsEnabled} />
        </View>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Push-уведомления</Text>
            <Text style={styles.rowBody}>Будут включены после появления согласованного сценария сопровождения.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Поддержка и документы</Text>
          <PrimaryButton label="Поддержка" onPress={() => openUrl(SUPPORT_URL)} secondary />
          <PrimaryButton label="Политика конфиденциальности" onPress={() => openUrl(PRIVACY_URL)} secondary />
          <PrimaryButton label="Пользовательское соглашение" onPress={() => openUrl(TERMS_URL)} secondary />
          <PrimaryButton label="Удаление аккаунта" onPress={() => openUrl(ACCOUNT_DELETION_URL)} secondary />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Версия</Text>
          <Text style={styles.value}>
            {Application.applicationName || 'HEYS'} {Application.nativeApplicationVersion || '1.0.0'} (
            {Application.nativeBuildVersion || 'dev'})
          </Text>
        </View>

        <PrimaryButton label="Выйти" onPress={logout} />
        <PrimaryButton label="Назад к HEYS" onPress={() => router.replace('/web')} secondary />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 24,
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    padding: 14,
  },
  rowBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  section: {
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
  },
  value: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
