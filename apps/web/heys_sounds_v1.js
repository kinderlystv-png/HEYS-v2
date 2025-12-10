/**
 * HEYS Sounds Module v1
 * Синтезированные звуки через Web Audio API
 * 
 * @file heys_sounds_v1.js
 * @version 1.0.0
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Lazy AudioContext (создаётся при первом звуке)
  let audioCtx = null;
  
  // Флаг: был ли user gesture
  let userGestureReceived = false;
  
  // Слушаем первый user gesture для AudioContext
  function initOnUserGesture() {
    if (userGestureReceived) return;
    userGestureReceived = true;
    // Создаём AudioContext только после user gesture
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    // Удаляем listeners после первого gesture
    document.removeEventListener('click', initOnUserGesture);
    document.removeEventListener('touchstart', initOnUserGesture);
    document.removeEventListener('keydown', initOnUserGesture);
  }
  
  // Регистрируем listeners для user gesture
  document.addEventListener('click', initOnUserGesture, { once: true, passive: true });
  document.addEventListener('touchstart', initOnUserGesture, { once: true, passive: true });
  document.addEventListener('keydown', initOnUserGesture, { once: true, passive: true });
  
  function getAudioContext() {
    // Если user gesture не было — не создаём AudioContext
    if (!userGestureReceived) return null;
    
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audioCtx = new AudioContext();
    }
    // Resume если suspended (iOS requirement)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }
  
  // Проверка настроек
  function isSoundEnabled() {
    try {
      const settings = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
      return settings.soundEnabled !== false; // true по умолчанию
    } catch { return true; }
  }
  
  // Проверка тихих часов (23:00 - 07:00)
  function isQuietHours() {
    const hour = new Date().getHours();
    return hour >= 23 || hour < 7;
  }
  
  // Проверка prefers-reduced-motion
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  
  /**
   * Воспроизвести звук
   * @param {string} type - 'pop' | 'ding' | 'success' | 'warning' | 'whoosh'
   */
  function play(type) {
    if (!isSoundEnabled() || isQuietHours() || prefersReducedMotion()) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    
    try {
      switch (type) {
        case 'pop':
          playPop(ctx);
          break;
        case 'ding':
          playDing(ctx);
          break;
        case 'success':
        case 'achievement':
          playSuccess(ctx);
          break;
        case 'warning':
          playWarning(ctx);
          break;
        case 'whoosh':
          playWhoosh(ctx);
          break;
        default:
          playPop(ctx);
      }
    } catch (e) {
      // Тихо игнорируем ошибки звука
    }
  }
  
  // === Звуки ===
  
  // Pop - мягкое появление тоста
  function playPop(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }
  
  // Ding - прочитано (свайп влево)
  function playDing(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08); // G5
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }
  
  // Success/Achievement - мажорный аккорд C-E-G
  function playSuccess(ctx) {
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 (C major)
    const duration = 0.35;
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = 'sine';
      
      const startTime = ctx.currentTime + i * 0.05;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.07, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }
  
  // Warning - низкий тон A3 → G3
  function playWarning(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
    osc.frequency.setValueAtTime(196, ctx.currentTime + 0.1); // G3
    osc.type = 'triangle';
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }
  
  // Whoosh - свайп (скрыть)
  function playWhoosh(ctx) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }
  
  // Экспорт
  HEYS.sounds = {
    play,
    isEnabled: isSoundEnabled,
    // Алиасы для удобства
    pop: () => play('pop'),
    ding: () => play('ding'),
    success: () => play('success'),
    warning: () => play('warning'),
    whoosh: () => play('whoosh')
  };
  
})(typeof window !== 'undefined' ? window : global);
