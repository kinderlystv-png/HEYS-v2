/**
 * @fileoverview Tests for Advanced Data Encryption System
 * Comprehensive test suite for enterprise-grade encryption
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AdvancedEncryptionService, EncryptionUtils, defaultEncryptionService } from './AdvancedEncryption';

// Mock Web Crypto API for Node.js environment
const mockCrypto = {
  subtle: {
    generateKey: vi.fn(),
    deriveKey: vi.fn(),
    importKey: vi.fn(),
    exportKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    digest: vi.fn()
  },
  getRandomValues: vi.fn()
};

// Mock crypto object
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  configurable: true
});
global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

describe('AdvancedEncryptionService', () => {
  let encryptionService: AdvancedEncryptionService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    encryptionService = new AdvancedEncryptionService();
    
    // Setup common mock implementations
    mockCrypto.getRandomValues.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    });
  });

  describe('Key Generation', () => {
    it('should generate a symmetric key', async () => {
      const mockKey = { type: 'secret', algorithm: { name: 'AES-GCM' } };
      mockCrypto.subtle.generateKey.mockResolvedValue(mockKey);

      const key = await encryptionService.generateKey();
      
      expect(mockCrypto.subtle.generateKey).toHaveBeenCalledWith(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      expect(key).toBe(mockKey);
    });

    it('should derive key from password', async () => {
      const password = 'testPassword123';
      const mockKeyMaterial = { type: 'raw' };
      const mockDerivedKey = { type: 'secret', algorithm: { name: 'AES-GCM' } };

      mockCrypto.subtle.importKey.mockResolvedValue(mockKeyMaterial);
      mockCrypto.subtle.deriveKey.mockResolvedValue(mockDerivedKey);

      const key = await encryptionService.deriveKeyFromPassword(password);

      expect(mockCrypto.subtle.importKey).toHaveBeenCalledWith(
        'raw',
        expect.any(Uint8Array),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      expect(mockCrypto.subtle.deriveKey).toHaveBeenCalled();
      expect(key).toBe(mockDerivedKey);
    });
  });

  describe('Symmetric Encryption', () => {
    it('should encrypt data with password', async () => {
      const testData = 'Hello, World!';
      const password = 'testPassword123';
      
      const mockKeyMaterial = { type: 'raw' };
      const mockDerivedKey = { type: 'secret' };
      const mockEncryptedBuffer = new ArrayBuffer(32);
      const mockEncryptedArray = new Uint8Array(mockEncryptedBuffer);
      
      // Fill with test data
      for (let i = 0; i < mockEncryptedArray.length; i++) {
        mockEncryptedArray[i] = i;
      }

      mockCrypto.subtle.importKey.mockResolvedValue(mockKeyMaterial);
      mockCrypto.subtle.deriveKey.mockResolvedValue(mockDerivedKey);
      mockCrypto.subtle.encrypt.mockResolvedValue(mockEncryptedBuffer);

      const encryptedData = await encryptionService.encryptData(testData, undefined, password);

      expect(encryptedData).toHaveProperty('data');
      expect(encryptedData).toHaveProperty('iv');
      expect(encryptedData).toHaveProperty('salt');
      expect(encryptedData).toHaveProperty('algorithm', 'AES-GCM');
      expect(encryptedData).toHaveProperty('timestamp');
      expect(encryptedData).toHaveProperty('keyVersion');
    });

    it('should decrypt data with password', async () => {
      const originalData = 'Hello, World!';
      const password = 'testPassword123';
      
      const encryptedData = {
        data: 'dGVzdGRhdGE=', // base64 encoded test data
        iv: 'dGVzdGl2', // base64 encoded test iv
        salt: 'dGVzdHNhbHQ=', // base64 encoded test salt
        tag: 'dGVzdHRhZw==', // base64 encoded test tag
        algorithm: 'AES-GCM' as const,
        timestamp: Date.now(),
        keyVersion: '1'
      };

      const mockKeyMaterial = { type: 'raw' };
      const mockDerivedKey = { type: 'secret' };
      const mockDecryptedBuffer = new TextEncoder().encode(originalData).buffer;

      mockCrypto.subtle.importKey.mockResolvedValue(mockKeyMaterial);
      mockCrypto.subtle.deriveKey.mockResolvedValue(mockDerivedKey);
      mockCrypto.subtle.decrypt.mockResolvedValue(mockDecryptedBuffer);

      const decryptedData = await encryptionService.decryptData(encryptedData, undefined, password);

      expect(decryptedData).toBe(originalData);
      expect(mockCrypto.subtle.decrypt).toHaveBeenCalled();
    });
  });

  describe('Asymmetric Encryption', () => {
    it('should generate RSA key pair', async () => {
      const mockKeyPair = {
        publicKey: { type: 'public', algorithm: { name: 'RSA-OAEP' } },
        privateKey: { type: 'private', algorithm: { name: 'RSA-OAEP' } }
      };

      mockCrypto.subtle.generateKey.mockResolvedValue(mockKeyPair);

      const keyPair = await encryptionService.generateKeyPair();

      expect(mockCrypto.subtle.generateKey).toHaveBeenCalledWith(
        {
          name: 'RSA-OAEP',
          modulusLength: 256, // From default config
          publicExponent: expect.any(Uint8Array),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      );
      expect(keyPair.publicKey).toBe(mockKeyPair.publicKey);
      expect(keyPair.privateKey).toBe(mockKeyPair.privateKey);
    });

    it('should encrypt with public key', async () => {
      const testData = 'Secret message';
      const mockPublicKey = { type: 'public', algorithm: { name: 'RSA-OAEP' } };
      const mockEncryptedBuffer = new ArrayBuffer(32);

      mockCrypto.subtle.encrypt.mockResolvedValue(mockEncryptedBuffer);

      const encryptedData = await encryptionService.encryptWithPublicKey(testData, mockPublicKey as any);

      expect(typeof encryptedData).toBe('string');
      expect(mockCrypto.subtle.encrypt).toHaveBeenCalledWith(
        { name: 'RSA-OAEP' },
        mockPublicKey,
        expect.any(Uint8Array)
      );
    });

    it('should decrypt with private key', async () => {
      const originalData = 'Secret message';
      const encryptedData = 'dGVzdGVuY3J5cHRlZGRhdGE=';
      const mockPrivateKey = { type: 'private', algorithm: { name: 'RSA-OAEP' } };
      const mockDecryptedBuffer = new TextEncoder().encode(originalData).buffer;

      mockCrypto.subtle.decrypt.mockResolvedValue(mockDecryptedBuffer);

      const decryptedData = await encryptionService.decryptWithPrivateKey(encryptedData, mockPrivateKey as any);

      expect(decryptedData).toBe(originalData);
      expect(mockCrypto.subtle.decrypt).toHaveBeenCalledWith(
        { name: 'RSA-OAEP' },
        mockPrivateKey,
        expect.any(ArrayBuffer)
      );
    });
  });

  describe('Field-Level Encryption', () => {
    it('should encrypt specific fields of an object', async () => {
      const userData = {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        publicInfo: 'This is public'
      };

      const password = 'testPassword123';
      const fieldsToEncrypt: Array<keyof typeof userData> = ['email', 'phone'];

      // Mock the encryption process
      const mockKeyMaterial = { type: 'raw' };
      const mockDerivedKey = { type: 'secret' };
      const mockEncryptedBuffer = new ArrayBuffer(32);

      mockCrypto.subtle.importKey.mockResolvedValue(mockKeyMaterial);
      mockCrypto.subtle.deriveKey.mockResolvedValue(mockDerivedKey);
      mockCrypto.subtle.encrypt.mockResolvedValue(mockEncryptedBuffer);

      const encryptedUser = await encryptionService.encryptFields(userData, fieldsToEncrypt, undefined, password);

      expect(encryptedUser).toHaveProperty('_encrypted');
      expect(encryptedUser._encrypted).toEqual(['email', 'phone']);
      expect(encryptedUser.id).toBe('123'); // Unchanged
      expect(encryptedUser.name).toBe('John Doe'); // Unchanged
      expect(encryptedUser.publicInfo).toBe('This is public'); // Unchanged
      expect(typeof encryptedUser.email).toBe('object'); // Encrypted
      expect(typeof encryptedUser.phone).toBe('object'); // Encrypted
    });

    it('should decrypt specific fields of an object', async () => {
      const encryptedUser = {
        id: '123',
        name: 'John Doe',
        email: {
          data: 'dGVzdA==',
          iv: 'aXY=',
          salt: 'c2FsdA==',
          tag: 'dGFn',
          algorithm: 'AES-GCM' as const,
          timestamp: Date.now(),
          keyVersion: '1'
        },
        phone: {
          data: 'dGVzdA==',
          iv: 'aXY=',
          salt: 'c2FsdA==',
          tag: 'dGFn',
          algorithm: 'AES-GCM' as const,
          timestamp: Date.now(),
          keyVersion: '1'
        },
        _encrypted: ['email', 'phone']
      };

      const password = 'testPassword123';

      // Mock the decryption process
      const mockKeyMaterial = { type: 'raw' };
      const mockDerivedKey = { type: 'secret' };
      const emailBuffer = new TextEncoder().encode('john@example.com').buffer;
      const phoneBuffer = new TextEncoder().encode('+1234567890').buffer;

      mockCrypto.subtle.importKey.mockResolvedValue(mockKeyMaterial);
      mockCrypto.subtle.deriveKey.mockResolvedValue(mockDerivedKey);
      mockCrypto.subtle.decrypt
        .mockResolvedValueOnce(emailBuffer)
        .mockResolvedValueOnce(phoneBuffer);

      const decryptedUser = await encryptionService.decryptFields(encryptedUser, undefined, password);

      expect(decryptedUser).not.toHaveProperty('_encrypted');
      expect(decryptedUser.id).toBe('123');
      expect(decryptedUser.name).toBe('John Doe');
      expect(decryptedUser.email).toBe('john@example.com');
      expect(decryptedUser.phone).toBe('+1234567890');
    });
  });

  describe('Key Management', () => {
    it('should export and import keys', async () => {
      const mockKey = { type: 'secret', algorithm: { name: 'AES-GCM' } };
      const mockJWK = { kty: 'oct', k: 'test-key-data' };

      mockCrypto.subtle.exportKey.mockResolvedValue(mockJWK);
      mockCrypto.subtle.importKey.mockResolvedValue(mockKey);

      const exportedKey = await encryptionService.exportKey(mockKey as any);
      expect(exportedKey).toBe(mockJWK);

      const importedKey = await encryptionService.importKey(mockJWK, 'AES-GCM');
      expect(importedKey).toBe(mockKey);
    });

    it('should get current key version', () => {
      const version = encryptionService.getKeyVersion();
      expect(typeof version).toBe('string');
    });

    it('should clear key cache', () => {
      encryptionService.clearKeyCache();
      // No error should be thrown
    });

    it('should get encryption statistics', () => {
      const stats = encryptionService.getStats();
      expect(stats).toHaveProperty('keyVersion');
      expect(stats).toHaveProperty('cachedKeys');
      expect(stats).toHaveProperty('algorithm');
      expect(stats).toHaveProperty('keyLength');
    });
  });

  describe('Utility Functions', () => {
    it('should generate secure hash', async () => {
      const testData = 'Hello, World!';
      const mockHashBuffer = new ArrayBuffer(32);

      mockCrypto.subtle.digest.mockResolvedValue(mockHashBuffer);

      const hash = await encryptionService.generateHash(testData);

      expect(typeof hash).toBe('string');
      expect(mockCrypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(Uint8Array));
    });

    it('should verify hash', async () => {
      const testData = 'Hello, World!';
      const testHash = 'mockHash123';
      const mockHashBuffer = new ArrayBuffer(32);

      mockCrypto.subtle.digest.mockResolvedValue(mockHashBuffer);

      // Mock arrayBufferToBase64 to return the test hash
      const originalMethod = encryptionService['arrayBufferToBase64'];
      encryptionService['arrayBufferToBase64'] = vi.fn().mockReturnValue(testHash);

      const isValid = await encryptionService.verifyHash(testData, testHash);

      expect(isValid).toBe(true);

      // Restore original method
      encryptionService['arrayBufferToBase64'] = originalMethod;
    });

    it('should generate secure token', () => {
      const token = encryptionService.generateSecureToken(32);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });
});

describe('EncryptionUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Quick Operations', () => {
    it('should provide quick encrypt function', async () => {
      const testData = 'test data';
      const password = 'test password';

      // Mock the encryption service methods
      const encryptSpy = vi.spyOn(defaultEncryptionService, 'encryptData').mockResolvedValue({
        data: 'encrypted',
        iv: 'iv',
        salt: 'salt',
        algorithm: 'AES-GCM',
        timestamp: Date.now(),
        keyVersion: '1'
      });

      const result = await EncryptionUtils.quickEncrypt(testData, password);

      expect(encryptSpy).toHaveBeenCalledWith(testData, undefined, password);
      expect(result).toHaveProperty('data', 'encrypted');
    });

    it('should provide quick decrypt function', async () => {
      const encryptedData = {
        data: 'encrypted',
        iv: 'iv',
        salt: 'salt',
        algorithm: 'AES-GCM' as const,
        timestamp: Date.now(),
        keyVersion: '1'
      };
      const password = 'test password';
      const expectedResult = 'decrypted data';

      const decryptSpy = vi.spyOn(defaultEncryptionService, 'decryptData').mockResolvedValue(expectedResult);

      const result = await EncryptionUtils.quickDecrypt(encryptedData, password);

      expect(decryptSpy).toHaveBeenCalledWith(encryptedData, undefined, password);
      expect(result).toBe(expectedResult);
    });
  });

  describe('User Data Operations', () => {
    it('should encrypt user data with sensitive fields', async () => {
      const userData = {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        ssn: '123-45-6789'
      };
      const password = 'userPassword';

      const encryptFieldsSpy = vi.spyOn(defaultEncryptionService, 'encryptFields').mockResolvedValue({
        ...userData,
        _encrypted: ['email', 'phone', 'ssn']
      });

      const result = await EncryptionUtils.encryptUserData(userData, password);

      expect(encryptFieldsSpy).toHaveBeenCalledWith(
        userData,
        ['email', 'phone', 'ssn', 'bankAccount', 'creditCard'],
        undefined,
        password
      );
      expect(result).toHaveProperty('_encrypted');
    });

    it('should decrypt user data', async () => {
      const encryptedUserData = {
        id: '123',
        name: 'John Doe',
        _encrypted: ['email', 'phone']
      };
      const password = 'userPassword';

      const decryptFieldsSpy = vi.spyOn(defaultEncryptionService, 'decryptFields').mockResolvedValue({
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890'
      });

      const result = await EncryptionUtils.decryptUserData(encryptedUserData, password);

      expect(decryptFieldsSpy).toHaveBeenCalledWith(encryptedUserData, undefined, password);
      expect(result).not.toHaveProperty('_encrypted');
    });
  });

  describe('Security Operations', () => {
    it('should generate session token', () => {
      const generateTokenSpy = vi.spyOn(defaultEncryptionService, 'generateSecureToken').mockReturnValue('sessionToken123');

      const token = EncryptionUtils.generateSessionToken();

      expect(generateTokenSpy).toHaveBeenCalledWith(64);
      expect(token).toBe('sessionToken123');
    });

    it('should hash password', async () => {
      const password = 'userPassword';
      const salt = 'randomSalt';

      vi.spyOn(defaultEncryptionService, 'generateSecureToken').mockReturnValue(salt);
      vi.spyOn(defaultEncryptionService, 'generateHash').mockResolvedValue('hashedPassword');

      const result = await EncryptionUtils.hashPassword(password, salt);

      expect(result).toHaveProperty('hash', 'hashedPassword');
      expect(result).toHaveProperty('salt', salt);
    });

    it('should verify password', async () => {
      const password = 'userPassword';
      const hash = 'hashedPassword';
      const salt = 'randomSalt';

      const generateHashSpy = vi.spyOn(defaultEncryptionService, 'generateHash').mockResolvedValue(hash);

      const isValid = await EncryptionUtils.verifyPassword(password, hash, salt);

      expect(generateHashSpy).toHaveBeenCalledWith(password + salt);
      expect(isValid).toBe(true);
    });
  });
});

describe('Integration Tests', () => {
  it('should handle full encryption/decryption cycle', async () => {
    // This test would need a real crypto implementation
    // For now, we'll test the structure and flow
    const service = new AdvancedEncryptionService();
    
    expect(service.getKeyVersion()).toBeDefined();
    expect(service.getStats()).toHaveProperty('algorithm');
    
    // Test token generation (doesn't require crypto.subtle)
    const token = service.generateSecureToken(16);
    expect(typeof token).toBe('string');
  });

  it('should handle error cases gracefully', async () => {
    const service = new AdvancedEncryptionService();
    
    // Test decryption without key or password
    const encryptedData = {
      data: 'test',
      iv: 'test',
      salt: 'test',
      algorithm: 'AES-GCM' as const,
      timestamp: Date.now(),
      keyVersion: '1'
    };

    await expect(service.decryptData(encryptedData)).rejects.toThrow('No key or password provided for decryption');
  });
});
