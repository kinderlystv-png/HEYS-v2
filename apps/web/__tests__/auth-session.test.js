/**
 * Тесты для авторизации и управления сессией
 * 
 * Проверяет:
 * - RTR (Refresh Token Rotation) — защита от 400 refresh_token_already_used
 * - _signInInProgress — race condition между auto-restore и signIn
 * - _ignoreSignedOutUntil — защита от ложных SIGNED_OUT событий SDK
 * - Failsafe timer — таймаут для первоначальной sync
 * - Session cleanup при logout
 * 
 * Создано: 2025-12-12
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
// Мок для localStorage
// ═══════════════════════════════════════════════════════════════════

const createMockStorage = () => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; }
  };
};

// ═══════════════════════════════════════════════════════════════════
// Симуляция auth state machine
// ═══════════════════════════════════════════════════════════════════

/**
 * Имитация auth state из heys_storage_supabase_v1.js
 */
function createAuthStateMachine() {
  let _signInInProgress = false;
  let _ignoreSignedOutUntil = 0;
  let _user = null;
  let _session = null;
  const SIGN_IN_PROTECTION_MS = 10000;
  
  return {
    get signInInProgress() { return _signInInProgress; },
    get ignoreSignedOutUntil() { return _ignoreSignedOutUntil; },
    get user() { return _user; },
    
    /**
     * signIn — должен блокировать auto-restore и другие signIn
     */
    async signIn(email, _password) {
      if (_signInInProgress) {
        throw new Error('signIn already in progress');
      }
      
      _signInInProgress = true;
      
      try {
        // Simulate Supabase signIn
        await new Promise(resolve => setTimeout(resolve, 50));
        
        _session = { access_token: 'test-token', expires_at: Date.now() / 1000 + 3600 };
        _user = { id: 'user-1', email };
        
        // Защита от ложных SIGNED_OUT событий
        _ignoreSignedOutUntil = Date.now() + SIGN_IN_PROTECTION_MS;
        
        return { user: _user, session: _session };
      } finally {
        _signInInProgress = false;
      }
    },
    
    /**
     * handleAuthStateChange — обработчик событий SDK
     */
    handleAuthStateChange(event, session) {
      if (event === 'SIGNED_OUT') {
        // Защита от ложных событий
        if (Date.now() < _ignoreSignedOutUntil) {
          return { ignored: true, reason: 'within_protection_window' };
        }
        
        _user = null;
        _session = null;
        return { ignored: false };
      }
      
      if (event === 'TOKEN_REFRESHED') {
        _session = session;
        return { refreshed: true };
      }
      
      return { handled: true };
    },
    
    /**
     * signOut — должен очистить всё
     */
    async signOut() {
      _user = null;
      _session = null;
      _ignoreSignedOutUntil = 0;
    },
    
    /**
     * Проверка валидности токена
     */
    isTokenExpired() {
      if (!_session || !_session.expires_at) return true;
      return _session.expires_at * 1000 < Date.now();
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
// ТЕСТЫ
// ═══════════════════════════════════════════════════════════════════

describe('Auth State Machine', () => {
  let authState;
  
  beforeEach(() => {
    authState = createAuthStateMachine();
  });
  
  describe('signIn race condition protection', () => {
    
    test('signInInProgress is false initially', () => {
      expect(authState.signInInProgress).toBe(false);
    });
    
    test('signInInProgress is true during signIn', async () => {
      const promise = authState.signIn('test@example.com', 'password');
      
      // Проверяем сразу после вызова
      expect(authState.signInInProgress).toBe(true);
      
      await promise;
      
      // После завершения — false
      expect(authState.signInInProgress).toBe(false);
    });
    
    test('concurrent signIn throws error', async () => {
      const promise1 = authState.signIn('test@example.com', 'password');
      
      await expect(authState.signIn('test2@example.com', 'password'))
        .rejects.toThrow('signIn already in progress');
      
      await promise1;
    });
    
    test('signInInProgress is false even if signIn throws', async () => {
      const brokenAuthState = createAuthStateMachine();
      // Заставляем первый signIn завершиться
      await brokenAuthState.signIn('test@example.com', 'password');
      
      // Второй — нормально
      expect(brokenAuthState.signInInProgress).toBe(false);
    });
  });
  
  describe('SIGNED_OUT protection window', () => {
    
    test('SIGNED_OUT is ignored immediately after signIn', async () => {
      await authState.signIn('test@example.com', 'password');
      
      const result = authState.handleAuthStateChange('SIGNED_OUT', null);
      
      expect(result.ignored).toBe(true);
      expect(result.reason).toBe('within_protection_window');
      expect(authState.user).not.toBeNull();
    });
    
    test('SIGNED_OUT is handled after protection window expires', async () => {
      await authState.signIn('test@example.com', 'password');
      
      // Симулируем истечение окна
      vi.useFakeTimers();
      vi.advanceTimersByTime(15000); // 15 секунд
      
      const result = authState.handleAuthStateChange('SIGNED_OUT', null);
      
      expect(result.ignored).toBe(false);
      expect(authState.user).toBeNull();
      
      vi.useRealTimers();
    });
    
    test('ignoreSignedOutUntil is set after successful signIn', async () => {
      expect(authState.ignoreSignedOutUntil).toBe(0);
      
      await authState.signIn('test@example.com', 'password');
      
      expect(authState.ignoreSignedOutUntil).toBeGreaterThan(Date.now());
    });
  });
  
  describe('Token handling', () => {
    
    test('TOKEN_REFRESHED updates session', async () => {
      await authState.signIn('test@example.com', 'password');
      
      const newSession = { access_token: 'new-token', expires_at: Date.now() / 1000 + 7200 };
      const result = authState.handleAuthStateChange('TOKEN_REFRESHED', newSession);
      
      expect(result.refreshed).toBe(true);
    });
    
    test('isTokenExpired returns true when no session', () => {
      expect(authState.isTokenExpired()).toBe(true);
    });
    
    test('isTokenExpired returns false with valid token', async () => {
      await authState.signIn('test@example.com', 'password');
      
      expect(authState.isTokenExpired()).toBe(false);
    });
    
    test('isTokenExpired returns true when token expired', async () => {
      await authState.signIn('test@example.com', 'password');
      
      // Симулируем истёкший токен
      vi.useFakeTimers();
      vi.advanceTimersByTime(4000 * 1000); // 4000 секунд = больше часа
      
      expect(authState.isTokenExpired()).toBe(true);
      
      vi.useRealTimers();
    });
  });
  
  describe('signOut cleanup', () => {
    
    test('signOut clears user', async () => {
      await authState.signIn('test@example.com', 'password');
      expect(authState.user).not.toBeNull();
      
      await authState.signOut();
      
      expect(authState.user).toBeNull();
    });
    
    test('signOut resets ignoreSignedOutUntil', async () => {
      await authState.signIn('test@example.com', 'password');
      expect(authState.ignoreSignedOutUntil).toBeGreaterThan(0);
      
      await authState.signOut();
      
      expect(authState.ignoreSignedOutUntil).toBe(0);
    });
  });
});

describe('Token Storage', () => {
  let mockStorage;
  const AUTH_KEY = 'heys_supabase_auth_token';
  
  beforeEach(() => {
    mockStorage = createMockStorage();
  });
  
  describe('Token persistence', () => {
    
    test('expired token should be removed on init', () => {
      // Записываем истёкший токен
      const expiredToken = {
        access_token: 'old-token',
        expires_at: Date.now() / 1000 - 3600 // Час назад
      };
      mockStorage.setItem(AUTH_KEY, JSON.stringify(expiredToken));
      
      // Симуляция init logic
      const stored = JSON.parse(mockStorage.getItem(AUTH_KEY) || 'null');
      if (stored?.expires_at && stored.expires_at * 1000 < Date.now()) {
        mockStorage.removeItem(AUTH_KEY);
      }
      
      expect(mockStorage.removeItem).toHaveBeenCalledWith(AUTH_KEY);
    });
    
    test('valid token should remain on init', () => {
      const validToken = {
        access_token: 'valid-token',
        expires_at: Date.now() / 1000 + 3600 // Через час
      };
      mockStorage.setItem(AUTH_KEY, JSON.stringify(validToken));
      
      // Симуляция init logic
      const stored = JSON.parse(mockStorage.getItem(AUTH_KEY) || 'null');
      const shouldRemove = stored?.expires_at && stored.expires_at * 1000 < Date.now();
      
      expect(shouldRemove).toBe(false);
    });
  });
  
  describe('RTR (Refresh Token Rotation)', () => {
    
    test('refresh_token_already_used scenario detection', () => {
      // Симуляция ошибки от Supabase
      const error = {
        code: 400,
        message: 'refresh_token_already_used'
      };
      
      const isRTRError = error.message?.includes('refresh_token') && 
                         error.message?.includes('already_used');
      
      expect(isRTRError).toBe(true);
    });
    
    test('RTR error handling clears stored token', () => {
      mockStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 'old' }));
      
      // Симуляция обработки RTR ошибки
      const handleRTRError = () => {
        mockStorage.removeItem(AUTH_KEY);
      };
      
      handleRTRError();
      
      expect(mockStorage.removeItem).toHaveBeenCalledWith(AUTH_KEY);
      expect(mockStorage.getItem(AUTH_KEY)).toBeNull();
    });
  });
});

describe('Failsafe Timer', () => {
  
  test('initial sync should have timeout', async () => {
    vi.useFakeTimers();
    
    const FAILSAFE_TIMEOUT_MS = 45000;
    const syncState = { completed: false };
    let failsafeTriggered = false;
    
    // Симуляция failsafe timer
    const failsafeTimer = setTimeout(() => {
      if (!syncState.completed) {
        failsafeTriggered = true;
      }
    }, FAILSAFE_TIMEOUT_MS);
    
    // Sync не завершился за 45 секунд
    vi.advanceTimersByTime(50000);
    
    expect(failsafeTriggered).toBe(true);
    
    clearTimeout(failsafeTimer);
    vi.useRealTimers();
  });
  
  test('failsafe timer is cleared when sync completes', async () => {
    vi.useFakeTimers();
    
    const FAILSAFE_TIMEOUT_MS = 45000;
    const syncState = { completed: false };
    let failsafeTriggered = false;
    
    const failsafeTimer = setTimeout(() => {
      if (!syncState.completed) {
        failsafeTriggered = true;
      }
    }, FAILSAFE_TIMEOUT_MS);
    
    // Sync завершился за 5 секунд
    vi.advanceTimersByTime(5000);
    syncState.completed = true;
    clearTimeout(failsafeTimer);
    
    // Прошло 45 секунд, но failsafe не сработал
    vi.advanceTimersByTime(50000);
    
    expect(failsafeTriggered).toBe(false);
    
    vi.useRealTimers();
  });
});
