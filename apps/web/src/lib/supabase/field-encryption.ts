// filepath: apps/web/src/lib/supabase/field-encryption.ts
/**
 * Proof-of-concept реализация шифрования полей для Supabase
 * Обеспечивает защиту чувствительных данных на уровне приложения
 *
 * @created КТ3 - Supabase Security
 * @author HEYS Security Team
 */

import { log } from '../browser-logger';

// Utility функции для базового шифрования (в продакшене использовать crypto-js или similar)
class FieldEncryption {
  private readonly encryptionKey: string;
  private readonly algorithm = 'AES-GCM';

  constructor(key?: string) {
    // В продакшене ключ должен браться из переменных окружения
    this.encryptionKey =
      key || process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  /**
   * Шифрование строки
   */
  async encrypt(plaintext: string): Promise<string> {
    try {
      // В реальном приложении использовать Web Crypto API
      const encrypted = this.simpleEncrypt(plaintext);
      return `enc:${encrypted}`;
    } catch (error) {
      log.error('Field encryption failed', {
        operation: 'encrypt',
        error,
      });
      throw new Error('Ошибка шифрования данных');
    }
  }

  /**
   * Расшифровка строки
   */
  async decrypt(encryptedText: string): Promise<string> {
    try {
      if (!encryptedText.startsWith('enc:')) {
        // Если текст не зашифрован, возвращаем как есть
        return encryptedText;
      }

      const ciphertext = encryptedText.substring(4);
      return this.simpleDecrypt(ciphertext);
    } catch (error) {
      log.error('Field decryption failed', {
        operation: 'decrypt',
        error,
      });
      throw new Error('Ошибка расшифровки данных');
    }
  }

  /**
   * Проверка, зашифрован ли текст
   */
  isEncrypted(text: string): boolean {
    return text.startsWith('enc:');
  }

  /**
   * Простое шифрование для демонстрации (НЕ для продакшена!)
   */
  private simpleEncrypt(text: string): string {
    // Это упрощенная реализация для демонстрации
    // В продакшене использовать криптографически стойкие алгоритмы
    const key = this.encryptionKey;
    let result = '';

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const keyChar = key.charCodeAt(i % key.length);
      const encrypted = charCode ^ keyChar;
      result += encrypted.toString(16).padStart(2, '0');
    }

    return btoa(result); // Base64 encoding
  }

  /**
   * Простая расшифровка для демонстрации (НЕ для продакшена!)
   */
  private simpleDecrypt(encryptedText: string): string {
    try {
      const hexString = atob(encryptedText); // Base64 decoding
      const key = this.encryptionKey;
      let result = '';

      for (let i = 0; i < hexString.length; i += 2) {
        const hexChar = hexString.substr(i, 2);
        const encrypted = parseInt(hexChar, 16);
        const keyChar = key.charCodeAt((i / 2) % key.length);
        const decrypted = encrypted ^ keyChar;
        result += String.fromCharCode(decrypted);
      }

      return result;
    } catch (error) {
      throw new Error('Ошибка расшифровки: поврежденные данные');
    }
  }
}

// Singleton instance
const fieldEncryption = new FieldEncryption();

// ==================== ТИПЫ ДЛЯ ШИФРУЕМЫХ ПОЛЕЙ ====================

export interface EncryptableUserProfile {
  id: string;
  user_id: string;

  // Обычные поля
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  language: string;
  timezone: string;
  theme: 'light' | 'dark' | 'auto';
  role: string;
  permissions: string[];

  // Шифруемые поля
  encrypted_phone?: string; // Зашифрованный телефон
  encrypted_address?: string; // Зашифрованный адрес (JSON)
  encrypted_first_name?: string; // Зашифрованное имя
  encrypted_last_name?: string; // Зашифрованная фамилия
  encrypted_security_questions?: string; // Зашифрованные секретные вопросы

  // Метаданные
  created_at: string;
  updated_at: string;
}

export interface DecryptedUserData {
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    country?: string;
    postal_code?: string;
  };
  first_name?: string;
  last_name?: string;
  security_questions?: Record<string, string>;
}

// ==================== СЕРВИС ШИФРОВАНИЯ ====================

export class EncryptedProfileService {
  private encryption = fieldEncryption;

  /**
   * Подготовить данные профиля для сохранения (с шифрованием)
   */
  async encryptProfileData(profileData: {
    phone?: string;
    address?: DecryptedUserData['address'];
    first_name?: string;
    last_name?: string;
    security_questions?: Record<string, string>;
    [key: string]: unknown;
  }): Promise<Record<string, unknown>> {
    const encryptedData: Record<string, unknown> = { ...profileData };

    try {
      // Шифруем чувствительные поля
      if (profileData.phone) {
        encryptedData.encrypted_phone = await this.encryption.encrypt(profileData.phone);
        delete encryptedData.phone;
      }

      if (profileData.address) {
        const addressJson = JSON.stringify(profileData.address);
        encryptedData.encrypted_address = await this.encryption.encrypt(addressJson);
        delete encryptedData.address;
      }

      if (profileData.first_name) {
        encryptedData.encrypted_first_name = await this.encryption.encrypt(profileData.first_name);
        delete encryptedData.first_name;
      }

      if (profileData.last_name) {
        encryptedData.encrypted_last_name = await this.encryption.encrypt(profileData.last_name);
        delete encryptedData.last_name;
      }

      if (profileData.security_questions) {
        const questionsJson = JSON.stringify(profileData.security_questions);
        encryptedData.encrypted_security_questions = await this.encryption.encrypt(questionsJson);
        delete encryptedData.security_questions;
      }

      return encryptedData;
    } catch (error) {
      log.error('Profile encryption error', {
        operation: 'encryptProfileData',
        fields: Object.keys(profileData),
        error,
      });
      throw new Error('Ошибка шифрования данных профиля');
    }
  }

  /**
   * Расшифровать данные профиля после получения из БД
   */
  async decryptProfileData(encryptedProfile: EncryptableUserProfile): Promise<DecryptedUserData> {
    const decryptedData: DecryptedUserData = {};

    try {
      // Расшифровываем поля
      if (encryptedProfile.encrypted_phone) {
        decryptedData.phone = await this.encryption.decrypt(encryptedProfile.encrypted_phone);
      }

      if (encryptedProfile.encrypted_address) {
        const addressJson = await this.encryption.decrypt(encryptedProfile.encrypted_address);
        decryptedData.address = JSON.parse(addressJson);
      }

      if (encryptedProfile.encrypted_first_name) {
        decryptedData.first_name = await this.encryption.decrypt(
          encryptedProfile.encrypted_first_name,
        );
      }

      if (encryptedProfile.encrypted_last_name) {
        decryptedData.last_name = await this.encryption.decrypt(
          encryptedProfile.encrypted_last_name,
        );
      }

      if (encryptedProfile.encrypted_security_questions) {
        const questionsJson = await this.encryption.decrypt(
          encryptedProfile.encrypted_security_questions,
        );
        decryptedData.security_questions = JSON.parse(questionsJson);
      }

      return decryptedData;
    } catch (error) {
      log.error('Profile decryption error', {
        operation: 'decryptProfileData',
        profileId: encryptedProfile.id,
        error,
      });
      throw new Error('Ошибка расшифровки данных профиля');
    }
  }

  /**
   * Обновить зашифрованные поля профиля
   */
  async updateEncryptedProfile(
    profileId: string,
    updates: Partial<DecryptedUserData & Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    // Разделяем обновления на шифруемые и обычные
    const sensitiveFields = ['phone', 'address', 'first_name', 'last_name', 'security_questions'];
    const encryptedUpdates: Record<string, unknown> = {};
    const normalUpdates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (sensitiveFields.includes(key)) {
        encryptedUpdates[key] = value;
      } else {
        normalUpdates[key] = value;
      }
    }

    // Шифруем чувствительные данные
    const encryptedData = await this.encryptProfileData(encryptedUpdates);

    // Объединяем с обычными обновлениями
    return {
      ...normalUpdates,
      ...encryptedData,
    };
  }

  /**
   * Поиск по зашифрованным полям (ограниченный)
   */
  async searchEncryptedField(
    fieldName: 'phone' | 'first_name' | 'last_name',
    searchValue: string,
  ): Promise<string> {
    // Для поиска по зашифрованным полям нужно зашифровать поисковый запрос
    // Это работает только для точного совпадения
    try {
      return await this.encryption.encrypt(searchValue);
    } catch (error) {
      log.error('Search encryption error', {
        operation: 'searchEncryptedField',
        fieldName,
        error,
      });
      throw new Error('Ошибка подготовки поискового запроса');
    }
  }
}

// ==================== УТИЛИТЫ ДЛЯ НАСТРОЕК ====================

export class EncryptedPreferencesService {
  private encryption = fieldEncryption;

  /**
   * Зашифровать значение настройки
   */
  async encryptPreferenceValue(
    value: unknown,
    shouldEncrypt: boolean = false,
  ): Promise<{
    value: unknown;
    is_encrypted: boolean;
  }> {
    if (!shouldEncrypt) {
      return {
        value,
        is_encrypted: false,
      };
    }

    try {
      const valueString = typeof value === 'string' ? value : JSON.stringify(value);
      const encryptedValue = await this.encryption.encrypt(valueString);

      return {
        value: encryptedValue,
        is_encrypted: true,
      };
    } catch (error) {
      log.error('Preference encryption error', {
        operation: 'encryptPreferenceValue',
        isSensitive: shouldEncrypt,
        error,
      });
      throw new Error('Ошибка шифрования настройки');
    }
  }

  /**
   * Расшифровать значение настройки
   */
  async decryptPreferenceValue(
    encryptedValue: unknown,
    isEncrypted: boolean = false,
  ): Promise<unknown> {
    if (!isEncrypted || !encryptedValue) {
      return encryptedValue;
    }

    try {
      const decryptedString = await this.encryption.decrypt(encryptedValue);

      // Пытаемся распарсить как JSON, если не получается - возвращаем строку
      try {
        return JSON.parse(decryptedString);
      } catch {
        return decryptedString;
      }
    } catch (error) {
      log.error('Preference decryption error', {
        operation: 'decryptPreferenceValue',
        isEncrypted,
        error,
      });
      throw new Error('Ошибка расшифровки настройки');
    }
  }

  /**
   * Определить, нужно ли шифровать настройку
   */
  shouldEncryptPreference(category: string, key: string): boolean {
    // Определяем чувствительные настройки
    const sensitivePreferences: Record<string, string[]> = {
      security: ['backup_email', 'recovery_phone', 'emergency_contact'],
      personal: ['ssn', 'passport', 'driver_license'],
      payment: ['card_number', 'bank_account', 'crypto_wallet'],
      medical: ['allergies', 'conditions', 'medications'],
      private: ['notes', 'diary', 'secrets'],
    };

    return sensitivePreferences[category]?.includes(key) || false;
  }
}

// ==================== ЭКСПОРТ ====================

// Основные сервисы
export const encryptedProfileService = new EncryptedProfileService();
export const encryptedPreferencesService = new EncryptedPreferencesService();

// Утилиты
export { fieldEncryption as FieldEncryption };

// Вспомогательные функции
export const EncryptionUtils = {
  /**
   * Проверить, зашифрован ли текст
   */
  isEncrypted: (text: string): boolean => {
    return fieldEncryption.isEncrypted(text);
  },

  /**
   * Получить статистику шифрования профиля
   */
  getEncryptionStats: (
    profile: EncryptableUserProfile,
  ): {
    total_fields: number;
    encrypted_fields: number;
    encryption_percentage: number;
  } => {
    const encryptedFields = [
      'encrypted_phone',
      'encrypted_address',
      'encrypted_first_name',
      'encrypted_last_name',
      'encrypted_security_questions',
    ];

    const totalFields = encryptedFields.length;
    const actualEncrypted = encryptedFields.filter(
      (field) => profile[field as keyof EncryptableUserProfile],
    ).length;

    return {
      total_fields: totalFields,
      encrypted_fields: actualEncrypted,
      encryption_percentage: totalFields > 0 ? (actualEncrypted / totalFields) * 100 : 0,
    };
  },

  /**
   * Валидация ключа шифрования
   */
  validateEncryptionKey: (key: string): boolean => {
    return key.length >= 16; // Минимальная длина ключа
  },
};
