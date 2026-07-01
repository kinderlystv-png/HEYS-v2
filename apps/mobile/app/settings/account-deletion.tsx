import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { deleteAccount } from '../../src/features/auth/api';
import { loadStoredSession } from '../../src/features/session/storage';
import type { StoredSession } from '../../src/features/session/types';
import { SUPPORT_URL } from '../../src/shared/config/urls';
import { colors, PrimaryButton, Screen } from '../../src/shared/ui/shell';

export default function AccountDeletionScreen() {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    loadStoredSession().then(setSession).catch(() => setSession(null));
  }, []);

  const openSupport = () => {
    Linking.openURL(SUPPORT_URL).catch((err) => Alert.alert('Ссылка не открылась', err.message));
  };

  const confirmDeletion = () => {
    if (!session) {
      Alert.alert('Нужен вход', 'Войдите в HEYS и повторите удаление аккаунта.');
      return;
    }
    if (session.kind !== 'client') {
      Alert.alert('Клиентский аккаунт', 'Удаление аккаунта доступно после входа по телефону и PIN.');
      return;
    }

    Alert.alert(
      'Удалить аккаунт?',
      'Профиль и связанные данные будут удалены. Восстановить доступ из приложения после этого действия нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          onPress: () => {
            setDeleting(true);
            deleteAccount(session)
              .then(() => router.replace('/auth/logout'))
              .catch((error) => {
                setDeleting(false);
                Alert.alert('Не удалось удалить аккаунт', error instanceof Error ? error.message : 'Попробуйте позже.');
              });
          },
          style: 'destructive',
          text: 'Удалить',
        },
      ]
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Удаление аккаунта</Text>
        <Text style={styles.subtitle}>
          Запрос выполняется только для текущего клиентского входа. После удаления приложение очистит локальную
          сессию и вернёт вас на экран входа.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Что будет удалено</Text>
          <Text style={styles.value}>Профиль клиента, дневник, сессии и связанные клиентские данные.</Text>
          <Text style={styles.value}>
            Часть записей может сохраняться только там, где это требуется законом или безопасностью сервиса.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Если доступ потерян</Text>
          <Text style={styles.value}>Напишите в поддержку, чтобы подтвердить владение аккаунтом и запросить удаление.</Text>
          <PrimaryButton label="Поддержка" onPress={openSupport} secondary />
        </View>

        <PrimaryButton disabled={deleting} label={deleting ? 'Удаляем...' : 'Удалить аккаунт'} onPress={confirmDeletion} />
        <PrimaryButton label="Назад" onPress={() => router.replace('/settings')} secondary />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 24,
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
