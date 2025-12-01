// heys_app_v12.js — Main app entry, React root, tab navigation, Supabase integration

      // Service Worker отключен для dev режима
      // if ('serviceWorker' in navigator) {
      //   window.addEventListener('load', () => {
      //     navigator.serviceWorker.register('/sw.js')
      //       .then((registration) => {
      //         console.log('✅ SW: Registered successfully', registration.scope);
      //       })
      //       .catch((error) => {
      //         console.log('❌ SW: Registration failed', error);
      //       });
      //   });
      // }

      (function () {
        window.HEYS = window.HEYS || {};
        
        // === Badge API Module ===
        // Показывает streak на иконке приложения (Android Chrome PWA)
        window.HEYS.badge = {
          update(count) {
            if (!('setAppBadge' in navigator)) return;
            
            try {
              if (count > 0) {
                navigator.setAppBadge(count);
              } else {
                navigator.clearAppBadge();
              }
            } catch (e) {
              // Silently fail — badge не критичен
            }
          },
          
          updateFromStreak() {
            const streak = window.HEYS?.Day?.getStreak?.() || 0;
            this.update(streak);
          },
          
          clear() {
            if ('clearAppBadge' in navigator) {
              navigator.clearAppBadge().catch(() => {});
            }
          }
        };
        
        // Wait for React and HEYS components to load
        let reactCheckCount = 0;
        function initializeApp() {
          // Проверяем загрузку React
          if (!window.React || !window.ReactDOM) {
            reactCheckCount++;
            // Логи ожидания отключены для чистой консоли
            setTimeout(initializeApp, 100);
            return;
          }

          // Проверяем загрузку критичных HEYS компонентов
          const heysReady =
            window.HEYS &&
            window.HEYS.DayTab &&
            window.HEYS.Ration &&
            window.HEYS.UserTab &&
            window.HEYS.ReportsTab;

          if (!heysReady) {
            reactCheckCount++;
            // Логи ожидания отключены для чистой консоли
            setTimeout(initializeApp, 100);
            return;
          }

          // Логи инициализации отключены для чистой консоли
          const React = window.React,
            ReactDOM = window.ReactDOM;
          const { useState, useEffect, useRef, useCallback } = React;

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🛡️ КОМПОНЕНТ: ErrorBoundary — Защита от ошибок рендеринга
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          class ErrorBoundary extends React.Component {
            constructor(props) {
              super(props);
              this.state = { hasError: false, error: null };
            }
            static getDerivedStateFromError(error) {
              return { hasError: true, error };
            }
            componentDidCatch(error, info) {
              console.error('[HEYS] ErrorBoundary caught:', error, info);
            }
            render() {
              if (this.state.hasError) {
                return React.createElement('div', { 
                  className: 'error-boundary-fallback',
                  style: {
                    padding: '32px 24px',
                    textAlign: 'center',
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    borderRadius: '16px',
                    margin: '16px',
                    border: '1px solid #fecaca'
                  }
                },
                  React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '😔'),
                  React.createElement('h2', { style: { color: '#dc2626', marginBottom: '8px', fontSize: '18px' } }, 'Что-то пошло не так'),
                  React.createElement('p', { style: { color: '#7f1d1d', marginBottom: '16px', fontSize: '14px' } }, 
                    'Попробуйте обновить страницу'
                  ),
                  React.createElement('button', {
                    onClick: () => window.location.reload(),
                    style: {
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }
                  }, '🔄 Обновить')
                );
              }
              return this.props.children;
            }
          }

          // Экспортируем для использования в других модулях
          window.HEYS.ErrorBoundary = ErrorBoundary;

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🎨 КОМПОНЕНТ: AppLoader — Красивый скелетон-прелоадер
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function AppLoader({ message = 'Загрузка...', subtitle = 'Подключение к серверу' }) {
            return React.createElement('div', { className: 'app-loader' },
              // Лого и сообщение
              React.createElement('div', { className: 'app-loader-header' },
                React.createElement('div', { className: 'app-loader-logo' }, '🥗'),
                React.createElement('div', { className: 'app-loader-title' }, message),
                React.createElement('div', { className: 'app-loader-subtitle' }, subtitle)
              ),
              // Скелетон UI
              React.createElement('div', { className: 'app-loader-skeleton' },
                // Header skeleton
                React.createElement('div', { className: 'skeleton-header' },
                  React.createElement('div', { className: 'skeleton-bar skeleton-bar-xp' }),
                  React.createElement('div', { className: 'skeleton-nav' },
                    React.createElement('div', { className: 'skeleton-circle' }),
                    React.createElement('div', { className: 'skeleton-rect skeleton-client' }),
                    React.createElement('div', { className: 'skeleton-circle' })
                  )
                ),
                // Content skeleton - sparkline
                React.createElement('div', { className: 'skeleton-content' },
                  React.createElement('div', { className: 'skeleton-sparkline' },
                    // Имитация точек графика
                    ...Array.from({ length: 14 }, (_, i) => 
                      React.createElement('div', { 
                        key: i,
                        className: 'skeleton-dot',
                        style: { 
                          height: `${20 + Math.random() * 60}%`,
                          animationDelay: `${i * 0.05}s`
                        }
                      })
                    )
                  ),
                  // Cards skeleton
                  React.createElement('div', { className: 'skeleton-cards' },
                    React.createElement('div', { className: 'skeleton-card' }),
                    React.createElement('div', { className: 'skeleton-card' }),
                    React.createElement('div', { className: 'skeleton-card skeleton-card-wide' })
                  )
                ),
                // Bottom nav skeleton
                React.createElement('div', { className: 'skeleton-tabs' },
                  ...Array.from({ length: 5 }, (_, i) => 
                    React.createElement('div', { 
                      key: i,
                      className: `skeleton-tab ${i === 1 ? 'skeleton-tab-active' : ''}`
                    })
                  )
                )
              ),
              // Spinner
              React.createElement('div', { className: 'app-loader-spinner' })
            );
          }

          // Экспортируем AppLoader
          window.HEYS.AppLoader = AppLoader;

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🎮 КОМПОНЕНТ: GamificationBar — XP, уровень, streak, достижения
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function GamificationBar() {
            const [stats, setStats] = useState(() => {
              return HEYS.game ? HEYS.game.getStats() : {
                totalXP: 0,
                level: 1,
                title: { icon: '🌱', title: 'Новичок', color: '#94a3b8' },
                progress: { current: 0, required: 100, percent: 0 },
                unlockedCount: 0,
                totalAchievements: 25
              };
            });
            const [streak, setStreak] = useState(() => {
              return HEYS.Day && HEYS.Day.getStreak ? HEYS.Day.getStreak() : 0;
            });
            const [expanded, setExpanded] = useState(false);
            const [notification, setNotification] = useState(null);
            const [isXPCounting, setIsXPCounting] = useState(false);
            const [isLevelUpFlash, setIsLevelUpFlash] = useState(false);
            const [dailyBonusAvailable, setDailyBonusAvailable] = useState(() => {
              return HEYS.game ? HEYS.game.canClaimDailyBonus() : false;
            });
            const [justUnlockedAch, setJustUnlockedAch] = useState(null);
            const [dailyMultiplier, setDailyMultiplier] = useState(() => {
              return HEYS.game ? HEYS.game.getDailyMultiplier() : { multiplier: 1, actions: 0, label: '' };
            });
            const [weeklyChallenge, setWeeklyChallenge] = useState(() => {
              return HEYS.game ? HEYS.game.getWeeklyChallenge() : { earned: 0, target: 500, percent: 0, completed: false };
            });
            const [xpHistory, setXpHistory] = useState(() => {
              return HEYS.game && HEYS.game.getXPHistory ? HEYS.game.getXPHistory() : [];
            });
            const prevLevelRef = useRef(stats.level);
            
            // Проверяем daily bonus и streak при монтировании + слушаем инициализацию Day
            useEffect(() => {
              const updateStreak = () => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                  setStreak(HEYS.Day.getStreak());
                }
              };
              
              const handleStreakEvent = (e) => {
                if (e.detail && typeof e.detail.streak === 'number') {
                  setStreak(e.detail.streak);
                }
              };
              
              if (HEYS.game) {
                setDailyBonusAvailable(HEYS.game.canClaimDailyBonus());
              }
              
              // Пробуем сразу
              updateStreak();
              
              // Слушаем событие обновления streak из DayTab
              window.addEventListener('heysDayStreakUpdated', handleStreakEvent);
              
              return () => {
                window.removeEventListener('heysDayStreakUpdated', handleStreakEvent);
              };
            }, []);

            // Слушаем обновления XP
            useEffect(() => {
              const handleUpdate = (e) => {
                if (HEYS.game) {
                  const newStats = HEYS.game.getStats();
                  
                  // XP counting animation
                  if (e.detail && e.detail.xpGained > 0) {
                    setIsXPCounting(true);
                    setTimeout(() => setIsXPCounting(false), 400);
                  }
                  
                  // Level up flash
                  if (newStats.level > prevLevelRef.current) {
                    setIsLevelUpFlash(true);
                    setTimeout(() => setIsLevelUpFlash(false), 1000);
                    prevLevelRef.current = newStats.level;
                  }
                  
                  setStats(newStats);
                }
                // Обновляем streak
                if (HEYS.Day && HEYS.Day.getStreak) {
                  setStreak(HEYS.Day.getStreak());
                }
              };

              const handleNotification = (e) => {
                setNotification(e.detail);
                setTimeout(() => setNotification(null), e.detail.type === 'level_up' ? 4000 : 3000);
                
                // Achievement unlock animation
                if (e.detail.type === 'achievement') {
                  setJustUnlockedAch(e.detail.data.achievement.id);
                  setTimeout(() => setJustUnlockedAch(null), 1000);
                }
              };

              const handleDailyMultiplierUpdate = (e) => {
                setDailyMultiplier(e.detail);
              };

              const handleWeeklyUpdate = () => {
                if (HEYS.game) {
                  setWeeklyChallenge(HEYS.game.getWeeklyChallenge());
                  // Также обновляем daily multiplier
                  setDailyMultiplier(HEYS.game.getDailyMultiplier());
                  // И историю XP
                  if (HEYS.game.getXPHistory) {
                    setXpHistory(HEYS.game.getXPHistory());
                  }
                }
              };

              window.addEventListener('heysGameUpdate', handleUpdate);
              window.addEventListener('heysGameNotification', handleNotification);
              window.addEventListener('heysProductAdded', handleUpdate);
              window.addEventListener('heysWaterAdded', handleUpdate);
              window.addEventListener('heysDailyMultiplierUpdate', handleDailyMultiplierUpdate);
              window.addEventListener('heysGameUpdate', handleWeeklyUpdate);

              return () => {
                window.removeEventListener('heysGameUpdate', handleUpdate);
                window.removeEventListener('heysGameNotification', handleNotification);
                window.removeEventListener('heysProductAdded', handleUpdate);
                window.removeEventListener('heysWaterAdded', handleUpdate);
                window.removeEventListener('heysDailyMultiplierUpdate', handleDailyMultiplierUpdate);
                window.removeEventListener('heysGameUpdate', handleWeeklyUpdate);
              };
            }, []);

            // Периодическое обновление streak (каждые 30 сек)
            useEffect(() => {
              const interval = setInterval(() => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                  setStreak(HEYS.Day.getStreak());
                }
              }, 30000);
              return () => clearInterval(interval);
            }, []);

            const toggleExpanded = () => setExpanded(!expanded);

            const { title, progress } = stats;
            const progressPercent = Math.max(5, progress.percent); // Minimum 5% для визуального feedback

            // Эффекты по уровню прогресса
            const isShimmering = progress.percent >= 80; // Блик при >80%
            const isPulsing = progress.percent >= 90;    // Пульсация при >90%
            const isGlowing = progress.percent >= 90;

            // Streak класс по уровню
            const getStreakClass = (s) => {
              if (s >= 30) return 'streak-legendary';  // 30+ дней — радужный
              if (s >= 14) return 'streak-epic';       // 14+ дней — золотой
              if (s >= 7) return 'streak-high';        // 7+ дней — яркий
              if (s >= 3) return 'streak-mid';         // 3+ дней — мерцающий
              return 'streak-low';                     // 1-2 дня — статичный
            };

            // Ripple эффект на тапе по progress bar
            const handleProgressClick = (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ripple = document.createElement('span');
              ripple.className = 'ripple';
              ripple.style.left = `${e.clientX - rect.left}px`;
              ripple.style.top = `${e.clientY - rect.top}px`;
              e.currentTarget.appendChild(ripple);
              setTimeout(() => ripple.remove(), 600);
            };

            // Динамический золотой градиент — чем ближе к 100%, тем ярче золото
            const getProgressGradient = (percent) => {
              // От приглушённого (#b8860b / darkgoldenrod) до яркого (#ffd700 / gold)
              const t = percent / 100; // 0..1
              // Интерполяция RGB: darkgoldenrod(184,134,11) → gold(255,215,0)
              const r = Math.round(184 + (255 - 184) * t);
              const g = Math.round(134 + (215 - 134) * t);
              const b = Math.round(11 + (0 - 11) * t);
              const brightColor = `rgb(${r}, ${g}, ${b})`;
              // Начальный цвет ещё темнее
              const startR = Math.round(140 + (184 - 140) * t);
              const startG = Math.round(100 + (134 - 100) * t);
              const startB = Math.round(20 + (11 - 20) * t);
              const startColor = `rgb(${startR}, ${startG}, ${startB})`;
              return `linear-gradient(90deg, ${startColor} 0%, ${brightColor} 100%)`;
            };

            return React.createElement('div', { 
              className: `game-bar-container ${isLevelUpFlash ? 'level-up-flash' : ''}`
            },
              // Main bar — одна строка
              React.createElement('div', { 
                className: 'game-bar',
                onClick: toggleExpanded
              },
                // Level + Rank Badge (горизонтально, компактно)
                React.createElement('div', { 
                  className: 'game-level-group',
                  style: { color: title.color }
                }, 
                  React.createElement('span', { className: 'game-level-text' }, `${title.icon} ${stats.level}`),
                  HEYS.game && React.createElement('span', {
                    className: 'game-rank-badge',
                    style: { 
                      background: `linear-gradient(135deg, ${HEYS.game.getRankBadge(stats.level).color}66 0%, ${HEYS.game.getRankBadge(stats.level).color} 100%)`,
                      color: stats.level >= 10 ? '#000' : '#fff'
                    }
                  }, HEYS.game.getRankBadge(stats.level).rank),
                  // Level Roadmap Tooltip — все звания
                  HEYS.game && HEYS.game.getAllTitles && React.createElement('div', { 
                    className: 'game-level-roadmap' 
                  },
                    React.createElement('div', { className: 'roadmap-title' }, '🎮 Путь развития'),
                    HEYS.game.getAllTitles().map((t, i) => {
                      const isCurrent = stats.level >= t.min && stats.level <= t.max;
                      const isAchieved = stats.level > t.max;
                      const isFuture = stats.level < t.min;
                      return React.createElement('div', {
                        key: i,
                        className: `roadmap-item ${isCurrent ? 'current' : ''} ${isAchieved ? 'achieved' : ''} ${isFuture ? 'future' : ''}`
                      },
                        React.createElement('span', { className: 'roadmap-icon' }, t.icon),
                        React.createElement('span', { className: 'roadmap-name' }, t.title),
                        React.createElement('span', { 
                          className: 'roadmap-levels',
                          style: { color: t.color }
                        }, `ур.${t.min}-${t.max}`),
                        isCurrent && React.createElement('span', { className: 'roadmap-you' }, '← ты'),
                        isAchieved && React.createElement('span', { className: 'roadmap-check' }, '✓')
                      );
                    })
                  )
                ),
                
                // Progress bar
                React.createElement('div', { 
                  className: `game-progress ${isGlowing ? 'glowing' : ''} ${isShimmering ? 'shimmer' : ''} ${isPulsing ? 'pulse' : ''} ${progress.percent >= 85 && progress.percent < 100 ? 'near-goal' : ''}`,
                  onClick: handleProgressClick
                },
                  React.createElement('div', { 
                    className: 'game-progress-fill',
                    style: { 
                      width: `${progressPercent}%`,
                      background: getProgressGradient(progress.percent)
                    }
                  }),
                  // Tooltip
                  React.createElement('span', { className: 'game-progress-tooltip' },
                    `Ещё ${progress.required - progress.current} XP до ур.${stats.level + 1}`
                  )
                ),
                
                // Daily Multiplier
                dailyMultiplier.actions > 0 && React.createElement('span', {
                  className: `game-daily-mult ${dailyMultiplier.multiplier >= 2 ? 'high' : dailyMultiplier.multiplier > 1 ? 'active' : ''}`,
                  title: dailyMultiplier.nextThreshold 
                    ? `${dailyMultiplier.actions} действий сегодня. Ещё ${dailyMultiplier.nextThreshold - dailyMultiplier.actions} до ${dailyMultiplier.nextMultiplier}x!`
                    : `${dailyMultiplier.actions} действий сегодня. Максимальный бонус!`
                },
                  dailyMultiplier.multiplier > 1 
                    ? React.createElement('span', { className: 'game-daily-mult-value' }, `${dailyMultiplier.multiplier}x`)
                    : `⚡${dailyMultiplier.actions}`
                ),
                
                // Streak
                streak > 0 && React.createElement('span', { 
                  className: `game-streak ${getStreakClass(streak)}`,
                  title: `${streak} дней подряд в норме!`
                }, `🔥${streak}`),
                
                // Personal Best
                HEYS.game && HEYS.game.isNewStreakRecord() && streak > 0 && React.createElement('span', {
                  className: 'game-personal-best',
                  title: 'Новый рекорд streak!'
                }, '🏆'),
                
                // Daily Bonus
                dailyBonusAvailable && React.createElement('button', {
                  className: 'game-daily-bonus',
                  onClick: (e) => {
                    e.stopPropagation();
                    if (HEYS.game && HEYS.game.claimDailyBonus()) {
                      setDailyBonusAvailable(false);
                    }
                  },
                  title: 'Забрать ежедневный бонус!'
                }, '🎁'),
                
                // XP counter
                React.createElement('span', { 
                  className: `game-xp ${isXPCounting ? 'counting' : ''}`
                }, `${progress.current}/${progress.required}`),
                
                // Expand button
                React.createElement('button', { 
                  className: `game-expand-btn ${expanded ? 'expanded' : ''}`,
                  title: expanded ? 'Свернуть' : 'Подробнее'
                }, expanded ? '▲' : '▼')
              ),

              // Notification (level up / achievement)
              notification && React.createElement('div', {
                className: `game-notification ${notification.type}`,
                onClick: () => setNotification(null)
              },
                notification.type === 'level_up' 
                  ? React.createElement(React.Fragment, null,
                      React.createElement('span', { className: 'notif-icon' }, notification.data.icon),
                      React.createElement('div', { className: 'notif-content' },
                        React.createElement('div', { className: 'notif-title' }, `🎉 Уровень ${notification.data.newLevel}!`),
                        React.createElement('div', { className: 'notif-subtitle' }, `Ты теперь ${notification.data.title}`)
                      )
                    )
                  : notification.type === 'achievement'
                    ? React.createElement(React.Fragment, null,
                        React.createElement('span', { className: 'notif-icon' }, notification.data.achievement.icon),
                        React.createElement('div', { className: 'notif-content' },
                          React.createElement('div', { className: 'notif-title' }, notification.data.achievement.name),
                          React.createElement('div', { className: 'notif-subtitle' }, `+${notification.data.achievement.xp} XP`)
                        )
                      )
                    : notification.type === 'daily_bonus'
                      ? React.createElement(React.Fragment, null,
                          React.createElement('span', { className: 'notif-icon' }, '🎁'),
                          React.createElement('div', { className: 'notif-content' },
                            React.createElement('div', { className: 'notif-title' }, 'Ежедневный бонус!'),
                            React.createElement('div', { className: 'notif-subtitle' }, 
                              notification.data.multiplier > 1 
                                ? `+${notification.data.xp} XP (${notification.data.multiplier}x бонус!)` 
                                : `+${notification.data.xp} XP`
                            )
                          )
                        )
                      : notification.type === 'weekly_complete'
                        ? React.createElement(React.Fragment, null,
                            React.createElement('span', { className: 'notif-icon' }, '🎯'),
                            React.createElement('div', { className: 'notif-content' },
                              React.createElement('div', { className: 'notif-title' }, '🎉 Недельный челлендж!'),
                              React.createElement('div', { className: 'notif-subtitle' }, `+100 XP бонус!`)
                            )
                          )
                        : null
              ),

              // Expanded panel (backdrop + content)
              expanded && React.createElement(React.Fragment, null,
                // Backdrop
                React.createElement('div', { 
                  className: 'game-panel-backdrop',
                  onClick: () => setExpanded(false)
                }),
                // Panel content
                React.createElement('div', { className: 'game-panel-expanded' },
                  // Weekly Challenge Section (красивая карточка)
                  React.createElement('div', { 
                    className: `game-weekly-card ${weeklyChallenge.completed ? 'completed' : ''}`
                  },
                    React.createElement('div', { className: 'weekly-header' },
                      React.createElement('span', { className: 'weekly-icon' }, weeklyChallenge.completed ? '🏆' : '🎯'),
                      React.createElement('div', { className: 'weekly-title-group' },
                        React.createElement('span', { className: 'weekly-title' }, 'Недельный челлендж'),
                        React.createElement('span', { className: 'weekly-subtitle' }, 
                          weeklyChallenge.completed 
                            ? '✨ Выполнено! +100 XP бонус' 
                            : `Заработай ${weeklyChallenge.target} XP за неделю`
                        )
                      )
                    ),
                    React.createElement('div', { className: 'weekly-progress-container' },
                      React.createElement('div', { className: 'weekly-progress-bar' },
                        React.createElement('div', { 
                          className: 'weekly-progress-fill',
                          style: { width: `${weeklyChallenge.percent}%` }
                        }),
                        React.createElement('div', { className: 'weekly-progress-glow' })
                      ),
                      React.createElement('div', { className: 'weekly-progress-labels' },
                        React.createElement('span', { className: 'weekly-earned' }, `${weeklyChallenge.earned} XP`),
                        React.createElement('span', { className: 'weekly-target' }, `${weeklyChallenge.target} XP`)
                      )
                    ),
                    React.createElement('div', { className: 'weekly-percent' }, 
                      weeklyChallenge.completed 
                        ? '100%' 
                        : `${weeklyChallenge.percent}%`
                    )
                  ),
                  
                  // XP History — мини-график за 7 дней
                  xpHistory.length > 0 && React.createElement('div', { className: 'xp-history-section' },
                    React.createElement('div', { className: 'xp-history-title' }, '📊 XP за неделю'),
                    React.createElement('div', { className: 'xp-history-chart' },
                      (() => {
                        const maxXP = Math.max(...xpHistory.map(d => d.xp), 1);
                        return xpHistory.map((day, i) => 
                          React.createElement('div', { 
                            key: i, 
                            className: `xp-history-bar ${i === 6 ? 'today' : ''}`,
                            title: `${day.date}: ${day.xp} XP`
                          },
                            React.createElement('div', { 
                              className: 'xp-bar-fill',
                              style: { height: `${(day.xp / maxXP) * 100}%` }
                            }),
                            React.createElement('span', { className: 'xp-bar-day' }, day.day),
                            day.xp > 0 && React.createElement('span', { className: 'xp-bar-value' }, day.xp)
                          )
                        );
                      })()
                    )
                  ),
                  
                  // Stats section
                  React.createElement('div', { className: 'game-stats-section' },
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, stats.totalXP),
                      React.createElement('span', { className: 'stat-label' }, 'Всего XP')
                    ),
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, `${stats.level}`),
                      React.createElement('span', { className: 'stat-label' }, 'Уровень')
                    ),
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, streak || 0),
                      React.createElement('span', { className: 'stat-label' }, 'Streak')
                    ),
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, `${stats.unlockedCount}/${stats.totalAchievements}`),
                      React.createElement('span', { className: 'stat-label' }, 'Достижения')
                    )
                  ),

                  // Title & next level
                  React.createElement('div', { className: 'game-title-section' },
                    React.createElement('div', { 
                      className: 'current-title',
                      style: { color: title.color }
                    }, `${title.icon} ${title.title}`),
                    React.createElement('div', { className: 'next-level-hint' },
                      `До уровня ${stats.level + 1}: ${progress.required - progress.current} XP`
                    )
                  ),

                  // Achievements grid
                  React.createElement('div', { className: 'game-achievements-section' },
                    React.createElement('h4', null, '🏆 Достижения'),
                    HEYS.game && HEYS.game.getAchievementCategories().map(cat =>
                      React.createElement('div', { key: cat.id, className: 'achievement-category' },
                        React.createElement('div', { className: 'category-name' }, cat.name),
                        React.createElement('div', { className: 'achievements-row' },
                          cat.achievements.map(achId => {
                            const ach = HEYS.game.ACHIEVEMENTS[achId];
                            const unlocked = HEYS.game.isAchievementUnlocked(achId);
                            const isJustUnlocked = justUnlockedAch === achId;
                            const rarityClass = unlocked ? `rarity-${ach.rarity}` : '';
                            return React.createElement('div', {
                              key: achId,
                              className: `achievement-badge ${unlocked ? 'unlocked' : 'locked'} ${rarityClass} ${isJustUnlocked ? 'just-unlocked' : ''}`,
                              title: `${ach.name}: ${ach.desc}`,
                              style: unlocked ? { borderColor: HEYS.game.RARITY_COLORS[ach.rarity] } : {}
                            },
                              React.createElement('span', { className: 'badge-icon' }, unlocked ? ach.icon : '🔒'),
                              React.createElement('span', { className: 'badge-xp' }, `+${ach.xp}`)
                            );
                          })
                        )
                      )
                    )
                  )
                )
              )
            );
          }

          // Экспортируем GamificationBar
          window.HEYS.GamificationBar = GamificationBar;

          // init cloud (safe if no cloud module)
          if (window.HEYS.cloud && typeof HEYS.cloud.init === 'function') {
            HEYS.cloud.init({
              url: 'https://ukqolcziqcuplqfgrmsh.supabase.co',
              anonKey:
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNTE1NDUsImV4cCI6MjA3MDgyNzU0NX0.Nzd8--PyGMJvIHqFoCQKNUOwpxnrAZuslQHtAjcE1Ds',
            });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 📅 КОМПОНЕНТ: DayTabWithCloudSync (строки 142-181)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_day_v12.js с синхронизацией из облака
           * Props: { clientId, products, selectedDate, setSelectedDate }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.DayTab
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          
          // Skeleton для DayTab — показываем пока грузится
          function DayTabSkeleton() {
            return React.createElement('div', { className: 'day-tab-skeleton', style: { padding: 16 } },
              // Sparkline skeleton
              React.createElement('div', { 
                className: 'skeleton-sparkline',
                style: { height: 80, marginBottom: 16, borderRadius: 12 }
              }),
              // Cards skeleton
              React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
                React.createElement('div', { className: 'skeleton-card', style: { flex: 1, height: 60 } }),
                React.createElement('div', { className: 'skeleton-card', style: { flex: 1, height: 60 } })
              ),
              // Progress skeleton  
              React.createElement('div', { className: 'skeleton-progress', style: { height: 48, marginBottom: 16 } }),
              // Macros skeleton
              React.createElement('div', { className: 'skeleton-macros', style: { marginBottom: 16 } },
                React.createElement('div', { className: 'skeleton-ring' }),
                React.createElement('div', { className: 'skeleton-ring' }),
                React.createElement('div', { className: 'skeleton-ring' })
              )
            );
          }
          
          function DayTabWithCloudSync(props) {
            const { clientId, products, selectedDate, setSelectedDate, subTab } = props;
            const [loading, setLoading] = React.useState(true);
            
            React.useEffect(() => {
              let cancelled = false;
              const cloud = window.HEYS && window.HEYS.cloud;
              const finish = () => {
                if (!cancelled) setLoading(false);
              };
              if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                const need =
                  typeof cloud.shouldSyncClient === 'function'
                    ? cloud.shouldSyncClient(clientId, 4000)
                    : true;
                if (need) {
                  setLoading(true);
                  cloud.bootstrapClientSync(clientId)
                    .then(finish)
                    .catch((err) => {
                      console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                      finish();
                    });
                } else finish();
              } else {
                finish();
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            
            if (loading || !window.HEYS || !window.HEYS.DayTab) {
              return React.createElement(DayTabSkeleton);
            }
            return React.createElement(window.HEYS.DayTab, { products, selectedDate, setSelectedDate, subTab });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🍽️ КОМПОНЕНТ: RationTabWithCloudSync (строки 185-227)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_core_v12.js (Ration) с синхронизацией продуктов
           * Props: { clientId, setProducts, products }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.Ration
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          
          // Skeleton для Ration/Products
          function RationSkeleton() {
            return React.createElement('div', { style: { padding: 16 } },
              React.createElement('div', { className: 'skeleton-header', style: { width: 150, marginBottom: 16 } }),
              ...Array.from({ length: 5 }, (_, i) => 
                React.createElement('div', { 
                  key: i,
                  className: 'skeleton-block',
                  style: { height: 56, marginBottom: 8 }
                })
              )
            );
          }
          
          function RationTabWithCloudSync(props) {
            const { clientId, setProducts, products } = props;
            const [loading, setLoading] = React.useState(true);
            React.useEffect(() => {
              let cancelled = false;
              if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.bootstrapClientSync === 'function'
              ) {
                setLoading(true);
                window.HEYS.cloud.bootstrapClientSync(clientId)
                  .then(() => {
                    if (!cancelled) {
                      const loadedProducts = Array.isArray(
                        window.HEYS.utils.lsGet('heys_products', []),
                      )
                        ? window.HEYS.utils.lsGet('heys_products', [])
                        : [];
                      setProducts(loadedProducts);
                      setLoading(false);
                    }
                  })
                  .catch((err) => {
                    console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                    if (!cancelled) {
                      const loadedProducts = window.HEYS.utils.lsGet('heys_products', []);
                      setProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                      setLoading(false);
                    }
                  });
              } else {
                setLoading(false);
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            if (loading || !window.HEYS || !window.HEYS.Ration) {
              return React.createElement(RationSkeleton);
            }
            return React.createElement(window.HEYS.Ration, { products, setProducts });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 👤 КОМПОНЕНТ: UserTabWithCloudSync (строки 230-266)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_user_v12.js с синхронизацией профиля и зон
           * Props: { clientId }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.UserTab
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          
          // Skeleton для UserTab
          function UserSkeleton() {
            return React.createElement('div', { style: { padding: 16 } },
              React.createElement('div', { className: 'skeleton-header', style: { width: 120, marginBottom: 16 } }),
              React.createElement('div', { className: 'skeleton-block', style: { height: 100, marginBottom: 12 } }),
              React.createElement('div', { className: 'skeleton-block', style: { height: 80, marginBottom: 12 } }),
              React.createElement('div', { className: 'skeleton-block', style: { height: 80 } })
            );
          }
          
          function UserTabWithCloudSync(props) {
            const { clientId } = props;
            const [loading, setLoading] = React.useState(true);
            React.useEffect(() => {
              let cancelled = false;
              if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.bootstrapClientSync === 'function'
              ) {
                setLoading(true);
                window.HEYS.cloud.bootstrapClientSync(clientId)
                  .then(() => {
                    if (!cancelled) setLoading(false);
                  })
                  .catch((err) => {
                    console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                    if (!cancelled) setLoading(false);
                  });
              } else {
                setLoading(false);
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            if (loading || !window.HEYS || !window.HEYS.UserTab) {
              return React.createElement(UserSkeleton);
            }
            return React.createElement(window.HEYS.UserTab, {});
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 📊 КОМПОНЕНТ: AnalyticsTab (строки 269-450)
           * ───────────────────────────────────────────────────────────────────────────────
           * Вкладка аналитики производительности (heys_simple_analytics.js)
           * Props: none
           * Dependencies: window.HEYS.analytics, window.HEYS.analyticsUI
           * Features: Auto-refresh каждые 30 сек, экспорт данных, очистка истории
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function AnalyticsTab() {
            const [stats, setStats] = useState(null);
            const [autoRefresh, setAutoRefresh] = useState(true);

            const loadStats = () => {
              if (window.HEYS && window.HEYS.analytics) {
                const data = window.HEYS.analytics.getStats();
                setStats(data);
              }
            };

            useEffect(() => {
              loadStats();
              if (autoRefresh) {
                const interval = setInterval(loadStats, 5000); // Обновление каждые 5 сек
                return () => clearInterval(interval);
              }
            }, [autoRefresh]);

            if (!stats) {
              return React.createElement('div', { style: { padding: 16 } },
                React.createElement('div', { className: 'skeleton-header', style: { width: 180, marginBottom: 16 } }),
                React.createElement('div', { className: 'skeleton-block', style: { height: 60, marginBottom: 12 } }),
                React.createElement('div', { className: 'skeleton-block', style: { height: 120 } })
              );
            }

            return React.createElement(
              'div',
              { style: { padding: 24, maxWidth: 900 } },
              // Заголовок
              React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 24,
                  },
                },
                React.createElement('h2', { style: { margin: 0 } }, '📊 Аналитика сессии'),
                React.createElement(
                  'div',
                  { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                  React.createElement(
                    'label',
                    null,
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: autoRefresh,
                      onChange: (e) => setAutoRefresh(e.target.checked),
                      style: { marginRight: 4 },
                    }),
                    'Автообновление',
                  ),
                  React.createElement(
                    'button',
                    { className: 'btn', onClick: loadStats },
                    '🔄 Обновить',
                  ),
                ),
              ),

              // Время сессии
              React.createElement(
                'div',
                {
                  style: { marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 8 },
                },
                React.createElement(
                  'div',
                  { style: { fontSize: 14, color: '#666', marginBottom: 4 } },
                  'Время сессии',
                ),
                React.createElement(
                  'div',
                  { style: { fontSize: 24, fontWeight: 600 } },
                  stats.session.duration,
                ),
              ),

              // Поисковые запросы
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🔍 Поисковые запросы'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.total,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Медленных (>1s)',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.slow,
                    ),
                  ),
                  React.createElement(
                    'div',
                    {
                      style: {
                        padding: 16,
                        background: stats.searches.slowRate === '0%' ? '#e8f5e9' : '#ffebee',
                        borderRadius: 8,
                      },
                    },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Slow Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.slowRate,
                    ),
                  ),
                ),
              ),

              // API вызовы
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🌐 API вызовы'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.total,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Медленных (>2s)',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.slow,
                    ),
                  ),
                  React.createElement(
                    'div',
                    {
                      style: {
                        padding: 16,
                        background: stats.apiCalls.failed > 0 ? '#ffebee' : '#e8f5e9',
                        borderRadius: 8,
                      },
                    },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Ошибок',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.failed,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#f3e5f5', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Slow Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.slowRate,
                    ),
                  ),
                ),
              ),

              // Cache эффективность
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '💾 Cache эффективность'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e8f5e9', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Hits'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.hits,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#ffebee', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Misses',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.misses,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e1f5fe', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Hit Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.hitRate,
                    ),
                  ),
                ),
              ),

              // Ошибки
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🐛 Ошибки'),
                React.createElement(
                  'div',
                  {
                    style: {
                      padding: 16,
                      background: stats.errors.total > 0 ? '#ffebee' : '#e8f5e9',
                      borderRadius: 8,
                    },
                  },
                  React.createElement(
                    'div',
                    { style: { fontSize: 12, color: '#666' } },
                    'Всего ошибок в сессии',
                  ),
                  React.createElement(
                    'div',
                    { style: { fontSize: 24, fontWeight: 600 } },
                    stats.errors.total,
                  ),
                ),
              ),

              // Кнопка сброса
              React.createElement(
                'div',
                { style: { marginTop: 32, paddingTop: 24, borderTop: '1px solid #eee' } },
                React.createElement(
                  'button',
                  {
                    className: 'btn secondary',
                    onClick: () => {
                      if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.reset) {
                        if (confirm('Сбросить всю статистику сессии?')) {
                          window.HEYS.analytics.reset();
                          loadStats();
                        }
                      }
                    },
                  },
                  '🗑️ Сбросить статистику',
                ),
              ),
            );
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🚀 ГЛАВНЫЙ КОМПОНЕНТ: App (строки 482-1140)
           * ───────────────────────────────────────────────────────────────────────────────
           * Корневой компонент приложения с управлением состоянием
           *
           * STATE MANAGEMENT:
           *   - tab: текущая активная вкладка ('day'|'ration'|'reports'|'user'|'analytics')
           *   - products: массив продуктов для текущего клиента
           *   - clients: список клиентов куратора
           *   - clientId: ID выбранного клиента
           *   - cloudUser: авторизованный пользователь Supabase
           *   - status: состояние подключения ('online'|'offline')
           *
           * MAIN FEATURES:
           *   - Автологин в Supabase (ONE_CURATOR_MODE)
           *   - Модальное окно выбора клиента
           *   - Синхронизация данных с облаком
           *   - Локальный режим (localStorage fallback)
           *
           * DEPENDENCIES: window.HEYS.cloud, window.HEYS.utils
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          const CORE_BACKUP_KEYS = [
            'heys_products',
            'heys_profile',
            'heys_hr_zones',
            'heys_norms',
            'heys_dayv2_date',
          ];

          function App() {
            const ONE_CURATOR_MODE = true; // Включаем автовход для работы с Supabase
            const [tab, setTab] = useState('stats');
            
            // === Dark Theme (3 modes: light / dark / auto) ===
            const [theme, setTheme] = useState(() => {
              const saved = localStorage.getItem('heys_theme');
              return ['light', 'dark', 'auto'].includes(saved) ? saved : 'light';
            });
            
            const resolvedTheme = React.useMemo(() => {
              if (theme === 'auto') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              }
              return theme;
            }, [theme]);
            
            React.useEffect(() => {
              document.documentElement.setAttribute('data-theme', resolvedTheme);
              localStorage.setItem('heys_theme', theme);
              
              if (theme !== 'auto') return;
              
              const mq = window.matchMedia('(prefers-color-scheme: dark)');
              const handler = () => {
                document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
              };
              mq.addEventListener('change', handler);
              return () => mq.removeEventListener('change', handler);
            }, [theme, resolvedTheme]);
            
            const cycleTheme = () => {
              setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
            };
            
            // ...все остальные useState...
            // useEffect автосмены клиента — ниже всех useState!
            const U = window.HEYS.utils || { lsGet: (k, d) => d, lsSet: () => {} };
            const [products, setProducts] = useState([]);
            
            // === SWIPE NAVIGATION ===
            const TABS_ORDER = ['ration', 'stats', 'diary', 'reports', 'overview', 'user'];
            const touchRef = React.useRef({ startX: 0, startY: 0, startTime: 0 });
            const MIN_SWIPE_DISTANCE = 60;
            const MAX_SWIPE_TIME = 500; // ms — увеличено для более плавного свайпа
            
            // Slide animation state
            const [slideDirection, setSlideDirection] = useState(null); // 'left' | 'right' | null
            const [edgeBounce, setEdgeBounce] = useState(null); // 'left' | 'right' | null
            
            const onTouchStart = React.useCallback((e) => {
              // Игнорируем свайпы на интерактивных элементах, модалках и слайдерах
              const target = e.target;
              if (target.closest('input, textarea, select, button, .swipeable-container, table, .tab-switch-group, .advice-list-overlay, .no-swipe-zone, [type="range"]')) {
                return;
              }
              const touch = e.touches[0];
              touchRef.current = {
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: Date.now()
              };
            }, []);
            
            const onTouchEnd = React.useCallback((e) => {
              if (!touchRef.current.startTime) return; // Не было валидного touchStart
              
              const touch = e.changedTouches[0];
              const deltaX = touch.clientX - touchRef.current.startX;
              const deltaY = touch.clientY - touchRef.current.startY;
              const deltaTime = Date.now() - touchRef.current.startTime;
              
              // Сбрасываем для следующего свайпа
              const startTime = touchRef.current.startTime;
              touchRef.current.startTime = 0;
              
              // Игнорируем если:
              // - свайп слишком медленный
              // - вертикальный скролл больше горизонтального
              // - расстояние слишком маленькое
              if (deltaTime > MAX_SWIPE_TIME) return;
              if (Math.abs(deltaY) > Math.abs(deltaX) * 0.7) return; // Более мягкое условие
              if (Math.abs(deltaX) < MIN_SWIPE_DISTANCE) return;
              
              // Свайп между stats и diary обрабатывается глобально
              // (больше нет отдельной вкладки 'day')
              
              const currentIndex = TABS_ORDER.indexOf(tab);
              
              if (deltaX < 0 && currentIndex < TABS_ORDER.length - 1) {
                // Свайп влево → следующая вкладка
                const nextTab = TABS_ORDER[currentIndex + 1];
                if (nextTab === 'reports' && window.HEYS?.Day?.requestFlush) {
                  try { window.HEYS.Day.requestFlush(); } catch (e) {}
                  setReportsRefresh(Date.now());
                }
                setSlideDirection('left');
                setTimeout(() => {
                  setTab(nextTab);
                  setSlideDirection(null);
                }, 150);
                if (navigator.vibrate) navigator.vibrate(10);
              } else if (deltaX > 0 && currentIndex > 0) {
                // Свайп вправо → предыдущая вкладка
                setSlideDirection('right');
                setTimeout(() => {
                  setTab(TABS_ORDER[currentIndex - 1]);
                  setSlideDirection(null);
                }, 150);
                if (navigator.vibrate) navigator.vibrate(10);
              } else if (deltaX < 0 && currentIndex === TABS_ORDER.length - 1) {
                // Край справа — показываем bounce
                setEdgeBounce('right');
                if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
                setTimeout(() => setEdgeBounce(null), 300);
              } else if (deltaX > 0 && currentIndex === 0) {
                // Край слева — показываем bounce
                setEdgeBounce('left');
                if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
                setTimeout(() => setEdgeBounce(null), 300);
              }
            }, [tab]);
            const [reportsRefresh, setReportsRefresh] = useState(0);
            
            // Дата для DayTab (поднятый state для DatePicker в шапке)
            // До 3:00 — "сегодня" = вчера (день ещё не закончился)
            const todayISO = () => {
              const d = new Date();
              const hour = d.getHours();
              if (hour < 3) {
                d.setDate(d.getDate() - 1);
              }
              return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            };
            const [selectedDate, setSelectedDate] = useState(todayISO());

            const cloud = window.HEYS.cloud || {};
            const [status, setStatus] = useState(
              typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'offline',
            );
            const [syncVer, setSyncVer] = useState(0);
            // === Clients (selector + persistence) ===
            const [clients, setClients] = useState([]);
            const [clientId, setClientId] = useState('');
            const [newName, setNewName] = useState('');
            const [cloudUser, setCloudUser] = useState(null);
            const [isInitializing, setIsInitializing] = useState(true); // Флаг начальной загрузки
            
            // === PWA Install Banner ===
            const [pwaInstallPrompt, setPwaInstallPrompt] = useState(null);
            const [showPwaBanner, setShowPwaBanner] = useState(false);
            const [showIosPwaBanner, setShowIosPwaBanner] = useState(false);
            
            // Определяем iOS Safari
            const isIosSafari = React.useMemo(() => {
              const ua = navigator.userAgent || '';
              const isIos = /iPhone|iPad|iPod/.test(ua);
              const isWebkit = /WebKit/.test(ua);
              const isChrome = /CriOS/.test(ua);
              const isFirefox = /FxiOS/.test(ua);
              // iOS Safari = iOS + WebKit + не Chrome + не Firefox
              return isIos && isWebkit && !isChrome && !isFirefox;
            }, []);
            
            // Слушаем beforeinstallprompt событие (Android/Desktop)
            React.useEffect(() => {
              // Проверяем, не установлено ли уже приложение
              const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                                   window.navigator.standalone === true;
              if (isStandalone) return;
              
              // Проверяем, не отклонил ли пользователь баннер ранее
              const dismissed = localStorage.getItem('heys_pwa_banner_dismissed');
              if (dismissed) {
                const dismissedTime = parseInt(dismissed, 10);
                // Показываем снова через 7 дней
                if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) return;
              }
              
              // Для iOS Safari — показываем специальный баннер
              if (isIosSafari) {
                setTimeout(() => setShowIosPwaBanner(true), 3000);
                return;
              }
              
              const handler = (e) => {
                e.preventDefault();
                setPwaInstallPrompt(e);
                // Показываем баннер через 3 секунды после загрузки
                setTimeout(() => setShowPwaBanner(true), 3000);
              };
              
              window.addEventListener('beforeinstallprompt', handler);
              return () => window.removeEventListener('beforeinstallprompt', handler);
            }, [isIosSafari]);
            
            const handlePwaInstall = async () => {
              if (!pwaInstallPrompt) return;
              pwaInstallPrompt.prompt();
              const { outcome } = await pwaInstallPrompt.userChoice;
              if (outcome === 'accepted') {
                setShowPwaBanner(false);
                localStorage.setItem('heys_pwa_installed', 'true');
              }
              setPwaInstallPrompt(null);
            };
            
            const dismissPwaBanner = () => {
              setShowPwaBanner(false);
              localStorage.setItem('heys_pwa_banner_dismissed', Date.now().toString());
            };
            
            const dismissIosPwaBanner = () => {
              setShowIosPwaBanner(false);
              localStorage.setItem('heys_pwa_banner_dismissed', Date.now().toString());
            };
            
            // === Update Toast (новая версия доступна) ===
            const [showUpdateToast, setShowUpdateToast] = useState(false);
            
            // Регистрируем глобальный хук для SW
            React.useEffect(() => {
              window.HEYS = window.HEYS || {};
              window.HEYS.showUpdateToast = () => {
                setShowUpdateToast(true);
              };
              return () => {
                if (window.HEYS) delete window.HEYS.showUpdateToast;
              };
            }, []);
            
            const handleUpdate = () => {
              // Принудительно активируем новый SW
              if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage('skipWaiting');
              }
              // Перезагрузка через 300ms для завершения активации
              setTimeout(() => window.location.reload(), 300);
            };
            
            const dismissUpdateToast = () => {
              setShowUpdateToast(false);
              // Напоминаем через 24 часа
              localStorage.setItem('heys_update_dismissed', Date.now().toString());
            };

            // === Cloud Sync Status ===
            const [cloudStatus, setCloudStatus] = useState(() => navigator.onLine ? 'idle' : 'offline');
            const [pendingCount, setPendingCount] = useState(0); // Количество ожидающих изменений
            const [pendingDetails, setPendingDetails] = useState({ days: 0, products: 0, profile: 0, other: 0 });
            const [showOfflineBanner, setShowOfflineBanner] = useState(false); // Управляется через useEffect
            const [showOnlineBanner, setShowOnlineBanner] = useState(false); // Баннер "Сеть восстановлена"
            const [syncProgress, setSyncProgress] = useState({ synced: 0, total: 0 }); // Прогресс синхронизации
            const [retryCountdown, setRetryCountdown] = useState(0); // Countdown до retry
            const cloudSyncTimeoutRef = useRef(null);
            const pendingChangesRef = useRef(false); // Есть ли несинхронизированные изменения
            const syncingStartRef = useRef(null); // Время начала syncing для минимальной длительности
            const MIN_SYNCING_DURATION = 1500; // Минимум 1.5 секунды показывать анимацию
            const SYNCING_DELAY = 400; // Показывать spinner только если sync длится дольше 400ms
            const syncedTimeoutRef = useRef(null); // Отдельный ref для synced timeout
            const syncingDelayTimeoutRef = useRef(null); // Задержка перед показом spinner
            const initialCheckDoneRef = useRef(false); // Начальная проверка сети выполнена
            const retryIntervalRef = useRef(null); // Интервал для countdown
            
            // 🔊 Звук успешной синхронизации (тихий, приятный)
            const playSyncSound = useCallback(() => {
              // Проверяем настройку (по умолчанию включено)
              const soundEnabled = localStorage.getItem('heys_sync_sound') !== 'false';
              if (!soundEnabled) return;
              
              try {
                // Создаём короткий приятный звук через Web Audio API
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                // Приятная частота (как уведомление)
                oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
                oscillator.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1); // C#6
                
                // Тихий звук с fade out
                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                
                oscillator.type = 'sine';
                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 0.2);
              } catch (e) {
                // Звук не критичен, игнорируем ошибки
              }
            }, []);
            
            // Функция для показа synced с учётом минимального времени syncing
            const showSyncedWithMinDuration = useCallback(() => {
              // Защита от множественных вызовов
              if (syncedTimeoutRef.current) {
                // showSyncedWithMinDuration already scheduled, skip
                return;
              }
              
              const elapsed = syncingStartRef.current ? Date.now() - syncingStartRef.current : 0;
              const remaining = Math.max(0, MIN_SYNCING_DURATION - elapsed);
              
              // showSyncedWithMinDuration: elapsed + remaining = MIN_SYNCING_DURATION
              
              syncedTimeoutRef.current = setTimeout(() => {
                syncedTimeoutRef.current = null;
                syncingStartRef.current = null;
                // → synced
                setCloudStatus('synced');
                // 🔊 Воспроизводим звук синхронизации
                playSyncSound();
                // Сбрасываем прогресс
                setSyncProgress({ synced: 0, total: 0 });
                // Скрываем через 2 сек
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                cloudSyncTimeoutRef.current = setTimeout(() => {
                  // → idle
                  setCloudStatus('idle');
                }, 2000);
              }, remaining);
            }, [playSyncSound]);
            
            useEffect(() => {
              // Слушаем события синхронизации
              const handleSyncComplete = () => {
                // Отменяем delay timeout — если sync завершился быстро, не показываем spinner
                if (syncingDelayTimeoutRef.current) {
                  clearTimeout(syncingDelayTimeoutRef.current);
                  syncingDelayTimeoutRef.current = null;
                }
                // Отменяем fallback
                if (cloudSyncTimeoutRef.current) {
                  clearTimeout(cloudSyncTimeoutRef.current);
                  cloudSyncTimeoutRef.current = null;
                }
                pendingChangesRef.current = false;
                if (navigator.onLine) {
                  showSyncedWithMinDuration();
                }
              };
              
              const handleDataSaved = (e) => {
                pendingChangesRef.current = true;
                
                if (!navigator.onLine) {
                  // Оффлайн — показываем статус offline
                  setCloudStatus('offline');
                  return;
                }
                
                // Если synced уже запланирован — не прерываем, пусть отработает
                if (syncedTimeoutRef.current) {
                  return;
                }
                
                // Также отменяем fallback timeout
                if (cloudSyncTimeoutRef.current) {
                  clearTimeout(cloudSyncTimeoutRef.current);
                  cloudSyncTimeoutRef.current = null;
                }
                
                // Запоминаем время начала
                if (!syncingStartRef.current) {
                  syncingStartRef.current = Date.now();
                  
                  // Показываем spinner только если sync длится дольше SYNCING_DELAY
                  // Это предотвращает мерцание для быстрых операций
                  if (!syncingDelayTimeoutRef.current) {
                    syncingDelayTimeoutRef.current = setTimeout(() => {
                      syncingDelayTimeoutRef.current = null;
                      // Проверяем что всё ещё в процессе синхронизации
                      if (syncingStartRef.current && !syncedTimeoutRef.current) {
                        setCloudStatus('syncing');
                      }
                    }, SYNCING_DELAY);
                  }
                }
                
                // Fallback на 5 сек — если heysSyncCompleted не сработает
                if (!cloudSyncTimeoutRef.current) {
                  cloudSyncTimeoutRef.current = setTimeout(() => {
                    pendingChangesRef.current = false;
                    showSyncedWithMinDuration();
                  }, 5000);
                }
              };
              
              // Обработчик изменения pending count
              const handlePendingChange = (e) => {
                const count = e.detail?.count || 0;
                const details = e.detail?.details || { days: 0, products: 0, profile: 0, other: 0 };
                setPendingCount(count);
                setPendingDetails(details);
                
                // Обновляем прогресс синхронизации
                if (syncProgress.total > 0 && count < syncProgress.total) {
                  setSyncProgress(prev => ({ ...prev, synced: prev.total - count }));
                }
                
                if (count > 0 && !navigator.onLine) {
                  setCloudStatus('offline');
                }
              };
              
              // Обработчик прогресса синхронизации
              const handleSyncProgress = (e) => {
                const { synced, total } = e.detail || {};
                if (typeof synced === 'number' && typeof total === 'number') {
                  setSyncProgress({ synced, total });
                }
              };
              
              // Обработчик ошибки синхронизации с retry
              const handleSyncError = (e) => {
                const retryIn = e.detail?.retryIn || 5; // секунд до retry
                setCloudStatus('error');
                setRetryCountdown(retryIn);
                
                // Запускаем countdown
                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = setInterval(() => {
                  setRetryCountdown(prev => {
                    if (prev <= 1) {
                      clearInterval(retryIntervalRef.current);
                      retryIntervalRef.current = null;
                      // Автоматически retry
                      if (navigator.onLine && window.HEYS?.cloud?.retrySync) {
                        window.HEYS.cloud.retrySync();
                        setCloudStatus('syncing');
                      }
                      return 0;
                    }
                    return prev - 1;
                  });
                }, 1000);
              };
              
              // Сеть вернулась с pending данными
              const handleNetworkRestored = (e) => {
                const count = e.detail?.pendingCount || 0;
                if (count > 0) {
                  if (!syncingStartRef.current) {
                    syncingStartRef.current = Date.now();
                  }
                  setCloudStatus('syncing');
                }
              };
              
              // Отслеживаем онлайн/оффлайн статус
              const handleOnline = () => {
                setShowOfflineBanner(false);
                // Показываем баннер "Сеть восстановлена" на 2 секунды
                setShowOnlineBanner(true);
                setTimeout(() => setShowOnlineBanner(false), 2000);
                
                // Сеть появилась — если есть pending изменения, показываем syncing
                if (pendingChangesRef.current || pendingCount > 0) {
                  if (!syncingStartRef.current) {
                    syncingStartRef.current = Date.now();
                  }
                  setCloudStatus('syncing');
                  // Ждём завершения синхронизации
                  if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                  cloudSyncTimeoutRef.current = setTimeout(() => {
                    pendingChangesRef.current = false;
                    showSyncedWithMinDuration();
                  }, 2000);
                } else {
                  setCloudStatus('idle');
                }
              };
              
              const handleOffline = () => {
                // Показываем баннер на 3 секунды, потом скрываем
                // Основная индикация — через иконку в header
                setShowOfflineBanner(true);
                setCloudStatus('offline');
                setTimeout(() => {
                  setShowOfflineBanner(false);
                }, 3000);
              };
              
              window.addEventListener('heysSyncCompleted', handleSyncComplete);
              window.addEventListener('heys:data-saved', handleDataSaved);
              window.addEventListener('heys:pending-change', handlePendingChange);
              window.addEventListener('heys:network-restored', handleNetworkRestored);
              window.addEventListener('heys:sync-progress', handleSyncProgress);
              window.addEventListener('heys:sync-error', handleSyncError);
              window.addEventListener('online', handleOnline);
              window.addEventListener('offline', handleOffline);
              
              // Начальный статус — выполняется только один раз
              if (!initialCheckDoneRef.current) {
                initialCheckDoneRef.current = true;
                if (!navigator.onLine) {
                  setCloudStatus('offline');
                  // Показываем баннер на 3 секунды при старте без сети
                  setShowOfflineBanner(true);
                  setTimeout(() => setShowOfflineBanner(false), 3000);
                } else {
                  setCloudStatus('idle');
                }
              }
              
              // Получить начальный pending count и details
              if (window.HEYS?.cloud?.getPendingCount) {
                setPendingCount(window.HEYS.cloud.getPendingCount());
              }
              if (window.HEYS?.cloud?.getPendingDetails) {
                setPendingDetails(window.HEYS.cloud.getPendingDetails());
              }
              
              return () => {
                window.removeEventListener('heysSyncCompleted', handleSyncComplete);
                window.removeEventListener('heys:data-saved', handleDataSaved);
                window.removeEventListener('heys:pending-change', handlePendingChange);
                window.removeEventListener('heys:network-restored', handleNetworkRestored);
                window.removeEventListener('heys:sync-progress', handleSyncProgress);
                window.removeEventListener('heys:sync-error', handleSyncError);
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
              };
            }, [pendingCount, showSyncedWithMinDuration]);
            
            // === Badge API: обновление streak на иконке ===
            useEffect(() => {
              // Обновляем badge при загрузке (с задержкой пока DayTab загрузится)
              const initialUpdate = setTimeout(() => {
                window.HEYS?.badge?.updateFromStreak();
              }, 2000);
              
              // Обновляем при изменении данных
              const handleDataChange = () => {
                // Небольшая задержка чтобы streak успел пересчитаться
                setTimeout(() => {
                  window.HEYS?.badge?.updateFromStreak();
                }, 500);
              };
              
              window.addEventListener('heysSyncCompleted', handleDataChange);
              window.addEventListener('heys:data-saved', handleDataChange);
              
              return () => {
                clearTimeout(initialUpdate);
                window.removeEventListener('heysSyncCompleted', handleDataChange);
                window.removeEventListener('heys:data-saved', handleDataChange);
              };
            }, []);
            
            // Retry синхронизации
            const handleRetrySync = () => {
              if (window.HEYS?.cloud?.retrySync) {
                window.HEYS.cloud.retrySync();
                syncingStartRef.current = Date.now();
                setCloudStatus('syncing');
              }
            };

            const [backupMeta, setBackupMeta] = useState(() => {
              if (U && typeof U.lsGet === 'function') {
                try {
                  return U.lsGet('heys_backup_meta', null);
                } catch (error) {
                  // Тихий fallback — метаданные backup не критичны
                }
              }
              return null;
            });
            const [backupBusy, setBackupBusy] = useState(false);
            
            // Вычисляем activeDays для DatePicker (после объявления clientId и products)
            // Пересчитывается когда: меняется дата, clientId, products, syncVer (данные дня) или ЗАВЕРШАЕТСЯ синхронизация
            const datePickerActiveDays = React.useMemo(() => {
              // Не вычисляем пока идёт инициализация или нет продуктов
              if (isInitializing || !products || products.length === 0) {
                return new Map();
              }
              
              const getActiveDaysForMonth = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
              if (!getActiveDaysForMonth || !clientId) {
                return new Map();
              }
              
              // Получаем profile из localStorage
              const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};
              
              // Парсим selectedDate для определения месяца
              const parts = selectedDate.split('-');
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
              
              try {
                // Передаём products напрямую в функцию
                return getActiveDaysForMonth(year, month, profile, products);
              } catch (e) {
                // Тихий fallback — activeDays для календаря не критичны
                return new Map();
              }
            }, [selectedDate, clientId, products, isInitializing, syncVer]);

            // Получить клиентов куратора из Supabase
            async function fetchClientsFromCloud(curatorId) {
              if (!cloud.client || !curatorId) {
                return [];
              }
              
              // Таймаут 5 секунд для запроса к Supabase
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: Supabase request took too long')), 5000)
              );
              
              try {
                const fetchPromise = cloud.client
                  .from('clients')
                  .select('id, name')
                  .eq('curator_id', curatorId)
                  .order('updated_at', { ascending: true });
                
                const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
                if (error) {
                  console.error('Ошибка загрузки клиентов:', error);
                  return [];
                }
                return data || [];
              } catch (e) {
                console.error('[HEYS] ❌ fetchClientsFromCloud failed:', e.message);
                return [];
              }
            }

            // Добавить клиента в Supabase или локально
            async function addClientToCloud(name) {
              const clientName = (name || '').trim() || `Клиент ${clients.length + 1}`;

              // Локальный режим
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const newClient = {
                  id: `local-user-${Date.now()}`,
                  name: clientName,
                };
                const updatedClients = [...clients, newClient];
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                setClientId(newClient.id);
                U.lsSet('heys_client_current', newClient.id);
                return;
              }

              // Облачный режим
              const userId = cloudUser.id;
              const { data, error } = await cloud.client
                .from('clients')
                .insert([{ name: clientName, curator_id: userId }])
                .select('id, name')
                .single();
              if (error) {
                console.error('Ошибка создания клиента:', error);
                alert('Ошибка создания клиента: ' + error.message);
                return;
              }
              // После создания — обновить список
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
              setClientId(data.id);
              U.lsSet('heys_client_current', data.id);
            }

            // Переименовать клиента (локально или Supabase)
            async function renameClient(id, name) {
              // Локальный режим
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const updatedClients = clients.map((c) => (c.id === id ? { ...c, name } : c));
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                return;
              }

              // Облачный режим
              const userId = cloudUser.id;
              await cloud.client.from('clients').update({ name }).eq('id', id);
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
            }

            // Удалить клиента (локально или Supabase)
            async function removeClient(id) {
              // Локальный режим
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const updatedClients = clients.filter((c) => c.id !== id);
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                if (clientId === id) {
                  setClientId('');
                  U.lsSet('heys_client_current', '');
                }
                return;
              }

              // Облачный режим
              const userId = cloudUser.id;
              await cloud.client.from('clients').delete().eq('id', id);
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
              if (clientId === id) {
                setClientId('');
                U.lsSet('heys_client_current', '');
              }
            }

            const downloadBackupFile = React.useCallback((payload, activeClientId, timestamp) => {
              try {
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeTs = (timestamp || '').replace(/[:]/g, '-');
                a.download = `heys-backup-${activeClientId || 'client'}-${safeTs || Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 0);
              } catch (error) {
                console.error('Не удалось выгрузить файл резервной копии:', error);
              }
            }, []);

            const listDayKeysForClient = React.useCallback(() => {
              if (!clientId) return [];
              const normalized = new Set();
              try {
                const heysPrefix = `heys_${clientId}_`;
                const legacyDayPrefix = `day_${clientId}_`;
                for (let i = 0; i < localStorage.length; i++) {
                  const rawKey = localStorage.key(i);
                  if (!rawKey) continue;
                  if (rawKey.startsWith(`${heysPrefix}dayv2_`)) {
                    normalized.add('heys_' + rawKey.slice(heysPrefix.length));
                  } else if (rawKey.startsWith(legacyDayPrefix)) {
                    normalized.add('day_' + rawKey.slice(legacyDayPrefix.length));
                  }
                }
              } catch (error) {
                // Тихий fallback — backup ключи не критичны
              }
              return Array.from(normalized);
            }, [clientId]);

            const backupAllKeys = React.useCallback(
              (options = {}) => {
                if (!clientId) {
                  if (!options.silent) alert('Сначала выберите клиента');
                  return { ok: false, reason: 'no-client' };
                }
                const timestamp = new Date().toISOString();
                const reason = options.reason || 'manual';
                const includeDays = options.includeDays !== false;
                const baseKeys = Array.isArray(options.keys) && options.keys.length
                  ? options.keys
                  : CORE_BACKUP_KEYS;
                const keysToProcess = new Set(baseKeys);
                if (includeDays) {
                  listDayKeysForClient().forEach((key) => keysToProcess.add(key));
                }
                const shouldDownload = Boolean(options.triggerDownload);
                const filePayload = shouldDownload
                  ? { version: 1, clientId, generatedAt: timestamp, reason, items: [] }
                  : null;
                let processed = 0;
                keysToProcess.forEach((key) => {
                  let data = null;
                  try {
                    data = U && typeof U.lsGet === 'function' ? U.lsGet(key, null) : null;
                  } catch (error) {
                    console.warn('[HEYS] Ошибка чтения ключа для бэкапа:', key, error);
                    data = null;
                  }
                  if (data === null || data === undefined) return;
                  if (key === 'heys_products' && Array.isArray(data) && data.length === 0) {
                    if (window.DEV) {
                      window.DEV.log(
                        '[BACKUP] SKIP heys_products_backup: source array is empty, keep previous snapshot',
                      );
                    }
                    return;
                  }
                  const snapshot = {
                    key,
                    clientId,
                    backupAt: timestamp,
                    reason,
                    data,
                    itemsCount: Array.isArray(data)
                      ? data.length
                      : data && typeof data === 'object'
                        ? Object.keys(data).length
                        : 1,
                  };
                  if (window.DEV && key === 'heys_products') {
                    window.DEV.log('[BACKUP] heys_products_backup items:', snapshot.itemsCount);
                  }
                  if (U && typeof U.lsSet === 'function') {
                    U.lsSet(`${key}_backup`, snapshot);
                  } else {
                    try {
                      localStorage.setItem(`${key}_backup`, JSON.stringify(snapshot));
                    } catch (error) {
                      console.warn('[HEYS] Ошибка сохранения бэкапа в localStorage:', error);
                    }
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                      try {
                        window.HEYS.saveClientKey(`${key}_backup`, snapshot);
                      } catch (error) {
                        console.warn('[HEYS] Ошибка отправки бэкапа в облако:', error);
                      }
                    }
                  }
                  if (filePayload) {
                    filePayload.items.push(snapshot);
                  }
                  processed++;
                });
                const meta = {
                  timestamp,
                  clientId,
                  reason,
                  processed,
                  keys: Array.from(keysToProcess),
                };
                if (U && typeof U.lsSet === 'function') {
                  U.lsSet('heys_backup_meta', meta);
                } else {
                  try {
                    localStorage.setItem('heys_backup_meta', JSON.stringify(meta));
                  } catch (error) {}
                  if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                    try {
                      window.HEYS.saveClientKey('heys_backup_meta', meta);
                    } catch (error) {
                      console.warn('[HEYS] Ошибка синхронизации метаданных бэкапа:', error);
                    }
                  }
                }
                setBackupMeta(meta);
                if (shouldDownload && filePayload && filePayload.items.length) {
                  downloadBackupFile(filePayload, clientId, timestamp);
                }
                if (!options.silent) {
                  alert(
                    processed
                      ? `Бэкап готов: ${processed} разделов`
                      : 'Нет данных для резервного копирования',
                  );
                }
                if (window.HEYS && window.HEYS.analytics) {
                  window.HEYS.analytics.trackDataOperation('backup-save', processed);
                }
                return { ok: processed > 0, meta, processed };
              },
              [clientId, downloadBackupFile, listDayKeysForClient, setBackupMeta],
            );

            const restoreFromBackup = React.useCallback(
              (target = 'heys_products', options = {}) => {
                if (!clientId) {
                  if (!options.silent) alert('Сначала выберите клиента');
                  return { ok: false, reason: 'no-client' };
                }
                const keysList =
                  target === 'all'
                    ? Array.from(
                        new Set([
                          ...CORE_BACKUP_KEYS,
                          ...(options.includeDays === false
                            ? []
                            : listDayKeysForClient()),
                        ]),
                      )
                    : Array.isArray(target)
                      ? target
                      : [target];
                let restored = 0;
                keysList.forEach((key) => {
                  let snapshot = null;
                  try {
                    snapshot = U && typeof U.lsGet === 'function' ? U.lsGet(`${key}_backup`, null) : null;
                  } catch (error) {
                    console.warn('[HEYS] Ошибка чтения бэкапа перед восстановлением:', key, error);
                    snapshot = null;
                  }
                  if (!snapshot || typeof snapshot !== 'object' || !('data' in snapshot)) {
                    return;
                  }
                  if (key === 'heys_products' && Array.isArray(snapshot.data) && snapshot.data.length === 0) {
                    if (window.DEV) {
                      window.DEV.log('[RESTORE] Empty heys_products_backup, treating as no backup');
                    }
                    return;
                  }
                  if (key === 'heys_products') {
                    setProducts(Array.isArray(snapshot.data) ? snapshot.data : []);
                  } else if (U && typeof U.lsSet === 'function') {
                    U.lsSet(key, snapshot.data);
                  } else {
                    try {
                      localStorage.setItem(key, JSON.stringify(snapshot.data));
                    } catch (error) {}
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                      try {
                        window.HEYS.saveClientKey(key, snapshot.data);
                      } catch (error) {
                        console.warn('[HEYS] Ошибка синхронизации восстановленных данных:', error);
                      }
                    }
                  }
                  restored++;
                });
                if (restored) {
                  setSyncVer((v) => v + 1);
                  if (window.HEYS && window.HEYS.analytics) {
                    window.HEYS.analytics.trackDataOperation('backup-restore', restored);
                  }
                }
                if (!options.silent) {
                  alert(
                    restored
                      ? `Восстановлено разделов: ${restored}`
                      : 'Не удалось найти подходящий бэкап',
                  );
                }
                return { ok: restored > 0, restored };
              },
              [clientId, listDayKeysForClient, setProducts, setSyncVer],
            );

            // Автопереключение на вкладку статистики дня при выборе клиента
            // (пропускаем если это PWA shortcut action)
            const skipTabSwitchRef = useRef(false);
            useEffect(() => {
              if (clientId && !skipTabSwitchRef.current) setTab('stats');
            }, [clientId]);

            // === PWA Shortcut: обработка ?action=add-meal ===
            useEffect(() => {
              const params = new URLSearchParams(window.location.search);
              const action = params.get('action');
              
              if (action === 'add-meal') {
                // Блокируем переключение вкладки при смене clientId
                skipTabSwitchRef.current = true;
                
                // Очищаем URL чтобы не триггерить повторно
                const url = new URL(window.location.href);
                url.searchParams.delete('action');
                window.history.replaceState({}, '', url.pathname + url.search);
                
                // Переключаемся на вкладку stats (там DayTab)
                setTab('stats');
                
                // Ждём пока DayTab смонтируется и вызываем addMeal
                const tryAddMeal = () => {
                  if (window.HEYS?.Day?.addMeal) {
                    window.HEYS.Day.addMeal();
                    // Вибрация при успешном открытии
                    if (navigator.vibrate) navigator.vibrate(15);
                    // Сбрасываем флаг после небольшой задержки
                    setTimeout(() => { skipTabSwitchRef.current = false; }, 500);
                  } else {
                    // Повторяем через 100ms если DayTab ещё не готов
                    setTimeout(tryAddMeal, 100);
                  }
                };
                // Даём время на рендер
                setTimeout(tryAddMeal, 150);
              }
            }, []);

            // Fallback: если после входа продукты пустые, пробуем взять из localStorage через utils
            useEffect(() => {
              if (products.length === 0) {
                try {
                  const stored =
                    (window.HEYS &&
                      window.HEYS.utils &&
                      window.HEYS.utils.lsGet &&
                      window.HEYS.utils.lsGet('heys_products', [])) ||
                    [];
                  if (Array.isArray(stored) && stored.length) setProducts(stored);
                } catch (e) {}
              }
            }, [products.length]);

            // При смене клиента сохраняем в localStorage (для совместимости)
            useEffect(() => {
              if (clientId) {
                U.lsSet('heys_client_current', clientId);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = clientId;
                
                // Критический лог: переключение клиента
                console.info('[HEYS] 👤 Клиент:', clientId.substring(0,8) + '...');
                
                // Подгружаем данные клиента из Supabase и обновляем продукты
                if (cloud && typeof cloud.bootstrapClientSync === 'function') {
                  // КРИТИЧНО: Сохраняем текущие продукты перед синхронизацией
                  const productsBeforeSync = products.length > 0 ? products : window.HEYS.utils.lsGet('heys_products', []);
                  
                  cloud.bootstrapClientSync(clientId)
                    .then(() => {
                      // всегда используем HEYS.utils.lsGet для clientId-специфичного ключа
                      const loadedProducts = Array.isArray(
                        window.HEYS.utils.lsGet('heys_products', []),
                      )
                        ? window.HEYS.utils.lsGet('heys_products', [])
                        : [];
                      
                      // ЗАЩИТА: если синхронизация вернула пустой массив, а у нас были продукты - не затираем
                      if (loadedProducts.length === 0 && Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                        console.info(`ℹ️ [SYNC] Kept ${productsBeforeSync.length} local products (cloud empty)`);
                        setProducts(productsBeforeSync);
                        // Восстанавливаем в localStorage
                        window.HEYS.utils.lsSet('heys_products', productsBeforeSync);
                      } else {
                        setProducts(loadedProducts);
                      }
                      setSyncVer((v) => v + 1);
                    })
                    .catch((err) => {
                      console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                      // Используем локальные продукты
                      if (Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                        setProducts(productsBeforeSync);
                      }
                      setSyncVer((v) => v + 1);
                    });
                } else {
                  setSyncVer((v) => v + 1);
                }
              }
            }, [clientId]);

            useEffect(() => {
              if (!clientId) {
                setBackupMeta(null);
                return;
              }
              try {
                const meta = U && typeof U.lsGet === 'function' ? U.lsGet('heys_backup_meta', null) : null;
                setBackupMeta(meta || null);
              } catch (error) {
                // Тихий fallback — метаданные backup не критичны
              }
            }, [clientId]);

            // Слушаем событие обновления продуктов из облака
            useEffect(() => {
              const handleProductsUpdate = (event) => {
                const { products } = event.detail;
                setProducts(products);
                setSyncVer((v) => v + 1);
              };

              window.addEventListener('heysProductsUpdated', handleProductsUpdate);
              return () => window.removeEventListener('heysProductsUpdated', handleProductsUpdate);
            }, []);

            // Обертка для сохранения данных клиента в облако
            // ВАЖНО: Поддерживает ДВА формата вызова:
            //   - saveClientKey(key, value) — старый формат, 2 аргумента
            //   - saveClientKey(clientId, key, value) — новый формат, 3 аргумента (из Store.set)
            window.HEYS = window.HEYS || {};
            window.HEYS.saveClientKey = function (...args) {
              if (cloud && typeof cloud.saveClientKey === 'function') {
                if (args.length === 3) {
                  // Новый формат: (clientId, key, value)
                  const [cid, k, v] = args;
                  cloud.saveClientKey(cid, k, v);
                } else if (args.length === 2) {
                  // Старый формат: (key, value) — используем clientId из замыкания
                  const [k, v] = args;
                  if (clientId) {
                    cloud.saveClientKey(clientId, k, v);
                  }
                }
              }
            };
            useEffect(() => {
              window.HEYS = window.HEYS || {};
              window.HEYS.backupManager = window.HEYS.backupManager || {};
              window.HEYS.backupManager.backupAll = backupAllKeys;
              window.HEYS.backupManager.restore = restoreFromBackup;
              window.HEYS.backupManager.getLastBackupMeta = () => backupMeta;
            }, [backupAllKeys, restoreFromBackup, backupMeta]);
            // overlay (no early return, to keep hooks order stable)
            // One-time migration of old, namespaced client lists -> global
            // После входа — загрузить клиентов куратора и автовыбрать последнего
            useEffect(() => {
              if (cloudUser && cloudUser.id) {
                fetchClientsFromCloud(cloudUser.id)
                  .then((loadedClients) => {
                    setClients(loadedClients);
                    
                    // Автовыбор последнего клиента (если он есть в списке)
                    const lastClientId = localStorage.getItem('heys_last_client_id');
                    if (lastClientId && loadedClients.some(c => c.id === lastClientId)) {
                      // Безопасное переключение
                      if (HEYS.cloud && HEYS.cloud.switchClient) {
                        HEYS.cloud.switchClient(lastClientId)
                          .then(() => {
                            setClientId(lastClientId);
                          })
                          .catch((err) => {
                            console.warn('[HEYS] Switch client failed:', err?.message || err);
                            // Всё равно ставим clientId локально
                            U.lsSet('heys_client_current', lastClientId);
                            setClientId(lastClientId);
                          });
                      } else {
                        U.lsSet('heys_client_current', lastClientId);
                        setClientId(lastClientId);
                      }
                    }
                  })
                  .catch((err) => {
                    console.warn('[HEYS] Failed to fetch clients:', err?.message || err);
                    // Пробуем использовать локальный список клиентов
                    const localClients = U.lsGet('heys_clients_cache', []);
                    if (localClients.length > 0) {
                      setClients(localClients);
                    }
                  });
              }
            }, [cloudUser]);

            // Создать тестовых клиентов
            async function createTestClients() {
              if (!cloud.client || !cloudUser || !cloudUser.id) return;
              const userId = cloudUser.id; // Сохраняем локально
              const testClients = [{ name: 'Иван Петров' }, { name: 'Анна Сидорова' }];

              for (const testClient of testClients) {
                try {
                  await cloud.client
                    .from('clients')
                    .insert([{ name: testClient.name, curator_id: userId }]);
                } catch (error) {
                  console.error('Ошибка создания тестового клиента:', error);
                }
              }

              // Обновить список клиентов
              const updated = await fetchClientsFromCloud(userId);
              setClients(updated);
            }

            function formatBackupTime(meta) {
              if (!meta || !meta.timestamp) return '—';
              try {
                return new Date(meta.timestamp).toLocaleString('ru-RU', { hour12: false });
              } catch (error) {
                return meta.timestamp;
              }
            }

            async function handleManualBackup() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (backupBusy) return;
              setBackupBusy(true);
              try {
                await backupAllKeys({ reason: 'manual' });
              } finally {
                setBackupBusy(false);
              }
            }

            async function handleExportBackup() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (backupBusy) return;
              setBackupBusy(true);
              try {
                const result = await backupAllKeys({
                  reason: 'manual-export',
                  triggerDownload: true,
                  includeDays: true,
                  silent: true,
                });
                alert(
                  result && result.processed
                    ? `Файл бэкапа скачан (${result.processed} разделов)`
                    : 'Нет данных для экспорта',
                );
              } finally {
                setBackupBusy(false);
              }
            }

            function handleRestoreProducts() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (!confirm('Восстановить список продуктов из последнего бэкапа?')) return;
              const result = restoreFromBackup('heys_products', { silent: true });
              alert(result && result.ok ? 'Продукты восстановлены.' : 'Не найден бэкап продуктов.');
            }

            function handleRestoreAll() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (!confirm('Восстановить все доступные данные из бэкапа?')) return;
              const result = restoreFromBackup('all', { silent: true });
              alert(
                result && result.ok
                  ? `Восстановлено разделов: ${result.restored}`
                  : 'Не найдено подходящих бэкапов.',
              );
            }

            // Login form state (нужно до gate!)
            const [email, setEmail] = useState('');
            const [pwd, setPwd] = useState('');
            const [rememberMe, setRememberMe] = useState(() => {
              // Восстанавливаем checkbox из localStorage
              return localStorage.getItem('heys_remember_me') === 'true';
            });
            const [loginError, setLoginError] = useState('');
            const [clientSearch, setClientSearch] = useState(''); // Поиск клиентов
            const [showClientDropdown, setShowClientDropdown] = useState(false); // Dropdown в шапке
            
            // Morning Check-in — показываем ПОСЛЕ синхронизации, если нет веса за сегодня
            // НЕ показываем сразу — ждём heysSyncCompleted чтобы данные успели подтянуться
            const [showMorningCheckin, setShowMorningCheckin] = useState(false);
            
            // Проверяем после синхронизации (heysSyncCompleted) или смены клиента
            useEffect(() => {
              // Функция проверки
              const checkMorningCheckin = () => {
                if (clientId && !isInitializing && HEYS.shouldShowMorningCheckin) {
                  const shouldShow = HEYS.shouldShowMorningCheckin();
                  console.log('[App] 🌅 MorningCheckin check | shouldShow:', shouldShow, '| syncCompleted:', HEYS.cloud?.isInitialSyncCompleted?.());
                  setShowMorningCheckin(shouldShow);
                }
              };
              
              // Если синхронизация уже завершена — проверяем сразу
              if (HEYS.cloud?.isInitialSyncCompleted?.()) {
                checkMorningCheckin();
              }
              
              // Слушаем событие завершения синхронизации
              const handleSyncCompleted = () => {
                console.log('[App] 🌅 heysSyncCompleted → checking MorningCheckin');
                // Небольшая задержка чтобы localStorage обновился
                setTimeout(checkMorningCheckin, 100);
              };
              
              window.addEventListener('heysSyncCompleted', handleSyncCompleted);
              return () => window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
            }, [clientId, isInitializing]);

            // Закрытие dropdown по Escape
            useEffect(() => {
              const handleEscape = (e) => {
                if (e.key === 'Escape' && showClientDropdown) {
                  setShowClientDropdown(false);
                }
              };
              if (showClientDropdown) {
                document.addEventListener('keydown', handleEscape);
                return () => document.removeEventListener('keydown', handleEscape);
              }
            }, [showClientDropdown]);

            // Получаем инициалы клиента для аватара
            const getClientInitials = (name) => {
              if (!name) return '?';
              const parts = name.trim().split(' ');
              if (parts.length >= 2) {
                return (parts[0][0] + parts[1][0]).toUpperCase();
              }
              return name.slice(0, 2).toUpperCase();
            };

            // Цветные аватары по первой букве имени
            const AVATAR_COLORS = [
              'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // А, К, Ф — фиолетовый
              'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', // Б, Л, Х — розовый
              'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', // В, М, Ц — голубой
              'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // Г, Н, Ч — зелёный
              'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', // Д, О, Ш — оранжевый
              'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', // Е, П, Щ — мятный
              'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', // Ж, Р, Ы — персиковый
              'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', // З, С, Э — кремовый
              'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)', // И, Т, Ю — светло-синий
              'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)', // Й, У, Я — лаймовый
            ];
            
            const getAvatarColor = (name) => {
              if (!name) return AVATAR_COLORS[0];
              const firstChar = name.trim()[0]?.toUpperCase() || 'А';
              const code = firstChar.charCodeAt(0);
              let index = 0;
              if (code >= 1040 && code <= 1071) { // Русский
                index = (code - 1040) % AVATAR_COLORS.length;
              } else if (code >= 65 && code <= 90) { // Английский
                index = (code - 65) % AVATAR_COLORS.length;
              } else {
                index = code % AVATAR_COLORS.length;
              }
              return AVATAR_COLORS[index];
            };

            // Получаем статистику клиента (последний визит, streak)
            const getClientStats = (cId) => {
              try {
                const today = new Date();
                let lastActiveDate = null;
                let streak = 0;
                
                for (let i = 0; i < 30; i++) {
                  const d = new Date(today);
                  d.setDate(d.getDate() - i);
                  const key = `heys_dayv2_${d.toISOString().slice(0, 10)}`;
                  const fullKey = `${cId}_${key}`;
                  const data = localStorage.getItem(fullKey);
                  if (data) {
                    try {
                      const parsed = JSON.parse(data);
                      if (parsed && parsed.meals && parsed.meals.length > 0) {
                        if (!lastActiveDate) lastActiveDate = d;
                        if (i === streak) streak++;
                      } else if (streak > 0) break;
                    } catch (e) {}
                  } else if (streak > 0) break;
                }
                
                return { lastActiveDate, streak };
              } catch (e) {
                return { lastActiveDate: null, streak: 0 };
              }
            };

            // Форматируем "последний визит"
            const formatLastActive = (date) => {
              if (!date) return '';
              const now = new Date();
              const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
              if (diff === 0) return 'Сегодня';
              if (diff === 1) return 'Вчера';
              if (diff < 7) return `${diff} дн. назад`;
              return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            };

            const gate = !clientId
              ? (isInitializing
                  // Красивый полноэкранный лоадер
                  ? React.createElement(AppLoader, { 
                      message: 'Загрузка...', 
                      subtitle: 'Подключение к серверу' 
                    })
                  // Если не залогинен — показать красивую форму входа
                  : !cloudUser
                    ? React.createElement(
                        'div',
                        { className: 'modal-backdrop', style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' } },
                        React.createElement(
                          'div',
                          { 
                            className: 'modal login-modal', 
                            style: { 
                              maxWidth: 360, 
                              padding: '32px 28px',
                              borderRadius: 20,
                              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                            } 
                          },
                          // Логотип
                          React.createElement('div', { 
                            style: { 
                              textAlign: 'center', 
                              marginBottom: 24 
                            } 
                          },
                            React.createElement('div', { 
                              style: { 
                                fontSize: 48, 
                                marginBottom: 8,
                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                              } 
                            }, '🍎'),
                            React.createElement('div', { 
                              style: { 
                                fontSize: 28, 
                                fontWeight: 700, 
                                color: 'var(--text)',
                                letterSpacing: '-0.5px'
                              } 
                            }, 'HEYS'),
                            React.createElement('div', { 
                              style: { 
                                fontSize: 14, 
                                color: 'var(--muted)',
                                marginTop: 4
                              } 
                            }, 'Умный дневник питания')
                          ),
                          // Email поле
                          React.createElement('div', { style: { marginBottom: 12 } },
                            React.createElement('input', {
                              type: 'email',
                              placeholder: '📧  Email',
                              value: email,
                              onChange: (e) => { setEmail(e.target.value); setLoginError(''); },
                              onKeyDown: (e) => e.key === 'Enter' && doSignIn(),
                              style: { 
                                width: '100%', 
                                padding: '14px 16px', 
                                borderRadius: 12, 
                                border: '2px solid var(--border)', 
                                fontSize: 16,
                                transition: 'border-color 0.2s, box-shadow 0.2s',
                                outline: 'none'
                              }
                            })
                          ),
                          // Пароль поле
                          React.createElement('div', { style: { marginBottom: 16 } },
                            React.createElement('input', {
                              type: 'password',
                              placeholder: '🔒  Пароль',
                              value: pwd,
                              onChange: (e) => { setPwd(e.target.value); setLoginError(''); },
                              onKeyDown: (e) => e.key === 'Enter' && doSignIn(),
                              style: { 
                                width: '100%', 
                                padding: '14px 16px', 
                                borderRadius: 12, 
                                border: '2px solid var(--border)', 
                                fontSize: 16,
                                transition: 'border-color 0.2s, box-shadow 0.2s',
                                outline: 'none'
                              }
                            })
                          ),
                          // Checkbox "Запомнить меня"
                          React.createElement('label', { 
                            style: { 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 8, 
                              marginBottom: 20,
                              cursor: 'pointer',
                              fontSize: 14,
                              color: 'var(--muted)'
                            } 
                          },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: rememberMe,
                              onChange: (e) => setRememberMe(e.target.checked),
                              style: { 
                                width: 18, 
                                height: 18, 
                                accentColor: '#667eea',
                                cursor: 'pointer'
                              }
                            }),
                            'Запомнить меня'
                          ),
                          // Ошибка входа
                          loginError && React.createElement('div', { 
                            style: { 
                              padding: '10px 14px', 
                              marginBottom: 16, 
                              background: '#fee2e2', 
                              color: '#dc2626', 
                              borderRadius: 10,
                              fontSize: 14,
                              textAlign: 'center'
                            } 
                          }, loginError),
                          // Кнопка входа
                          React.createElement(
                            'button',
                            { 
                              className: 'btn acc', 
                              onClick: doSignIn,
                              style: { 
                                width: '100%', 
                                padding: '14px', 
                                fontSize: 16,
                                fontWeight: 600,
                                borderRadius: 12,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                border: 'none',
                                color: '#fff',
                                cursor: status === 'signin' ? 'wait' : 'pointer',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                boxShadow: '0 4px 14px rgba(102, 126, 234, 0.4)'
                              },
                              disabled: status === 'signin'
                            },
                            status === 'signin' 
                              ? React.createElement('span', null, '⏳ Вход...')
                              : React.createElement('span', null, 'Войти →')
                          ),
                          // Подсказка
                          React.createElement(
                            'div',
                            { style: { marginTop: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 } },
                            status === 'offline' 
                              ? '📡 Нет подключения к сети'
                              : (() => {
                                  const hour = new Date().getHours();
                                  if (hour >= 5 && hour < 12) return '🌅 Доброе утро!';
                                  if (hour >= 12 && hour < 18) return '☀️ Добрый день!';
                                  if (hour >= 18 && hour < 23) return '🌆 Добрый вечер!';
                                  return '🌙 Доброй ночи!';
                                })()
                          )
                        )
                      )
                    // Модалка выбора клиента (только после логина)
                  : React.createElement(
                  'div',
                  { className: 'modal-backdrop', style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' } },
                  React.createElement(
                    'div',
                    { 
                      className: 'modal client-select-modal', 
                      style: { 
                        maxWidth: 420,
                        padding: '28px 24px',
                        borderRadius: 20,
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                      } 
                    },
                          React.createElement(
                          React.Fragment,
                          null,
                          // Заголовок
                          React.createElement(
                            'div',
                            { style: { textAlign: 'center', marginBottom: 20 } },
                            React.createElement('div', { 
                              style: { fontSize: 32, marginBottom: 8 } 
                            }, '👥'),
                            React.createElement(
                              'div',
                              { style: { fontSize: 20, fontWeight: 700, color: 'var(--text)' } },
                              'Выберите клиента'
                            ),
                            React.createElement(
                              'div',
                              { style: { fontSize: 14, color: 'var(--muted)', marginTop: 4 } },
                              clients.length ? `${clients.length} клиентов` : 'Пока нет клиентов'
                            )
                          ),
                          // Поиск клиентов (если > 3)
                          clients.length > 3 && React.createElement('div', { 
                            style: { position: 'relative', marginBottom: 16 } 
                          },
                            React.createElement('span', { 
                              style: { 
                                position: 'absolute', 
                                left: 14, 
                                top: '50%', 
                                transform: 'translateY(-50%)',
                                fontSize: 16,
                                opacity: 0.5
                              } 
                            }, '🔍'),
                            React.createElement('input', {
                              type: 'text',
                              placeholder: 'Поиск клиента...',
                              value: clientSearch || '',
                              onChange: (e) => setClientSearch(e.target.value),
                              style: { 
                                width: '100%', 
                                padding: '12px 12px 12px 42px', 
                                borderRadius: 12, 
                                border: '2px solid var(--border)', 
                                fontSize: 15,
                                outline: 'none'
                              }
                            })
                          ),
                          // Список клиентов
                          React.createElement(
                            'div',
                            { 
                              style: { 
                                maxHeight: 320, 
                                overflow: 'auto', 
                                marginBottom: 16,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8
                              } 
                            },
                            clients.length
                              ? clients
                                  .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                  .map((c, idx) => {
                                    const stats = getClientStats(c.id);
                                    const isLast = localStorage.getItem('heys_last_client_id') === c.id;
                                    return React.createElement(
                                    'div',
                                    {
                                      key: c.id,
                                      className: 'client-card',
                                      style: { 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '12px 14px',
                                        borderRadius: 14,
                                        background: 'var(--card)',
                                        border: isLast ? '2px solid #667eea' : '2px solid var(--border)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        animation: `fadeSlideIn 0.3s ease ${idx * 0.05}s both`
                                      },
                                      onClick: async () => {
                                        // Безопасное переключение с синхронизацией
                                        if (HEYS.cloud && HEYS.cloud.switchClient) {
                                          await HEYS.cloud.switchClient(c.id);
                                        } else {
                                          U.lsSet('heys_client_current', c.id);
                                        }
                                        // Сохраняем как последнего выбранного
                                        localStorage.setItem('heys_last_client_id', c.id);
                                        setClientId(c.id);
                                      }
                                    },
                                    // Аватар с цветом по букве
                                    React.createElement(
                                      'div',
                                      { 
                                        style: { 
                                          width: 48, 
                                          height: 48, 
                                          borderRadius: '50%',
                                          background: getAvatarColor(c.name),
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: '#fff',
                                          fontWeight: 700,
                                          fontSize: 18,
                                          flexShrink: 0,
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                        } 
                                      },
                                      getClientInitials(c.name)
                                    ),
                                    // Инфо + статистика
                                    React.createElement(
                                      'div',
                                      { style: { flex: 1, minWidth: 0 } },
                                      React.createElement(
                                        'div',
                                        { style: { fontWeight: 600, fontSize: 15, color: 'var(--text)' } },
                                        c.name
                                      ),
                                      React.createElement(
                                        'div', 
                                        { style: { fontSize: 12, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' } },
                                        // Последний визит
                                        stats.lastActiveDate && React.createElement('span', null, 
                                          '📅 ' + formatLastActive(stats.lastActiveDate)
                                        ),
                                        // Streak
                                        stats.streak > 0 && React.createElement('span', { 
                                          style: { color: stats.streak >= 3 ? '#22c55e' : 'var(--muted)' } 
                                        }, 
                                          '🔥 ' + stats.streak + ' дн.'
                                        ),
                                        // Метка "Последний"
                                        isLast && React.createElement('span', { 
                                          style: { color: '#667eea', fontWeight: 500 } 
                                        }, '✓')
                                      )
                                    ),
                                    // Кнопки действий
                                    React.createElement(
                                      'div',
                                      { 
                                        style: { display: 'flex', gap: 4 },
                                        onClick: (e) => e.stopPropagation() // Не срабатывать на родителе
                                      },
                                      React.createElement(
                                        'button',
                                        {
                                          className: 'btn-icon',
                                          title: 'Переименовать',
                                          onClick: () => {
                                            const nm = prompt('Новое имя', c.name) || c.name;
                                            renameClient(c.id, nm);
                                          },
                                          style: {
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            border: 'none',
                                            background: 'var(--border)',
                                            cursor: 'pointer',
                                            fontSize: 14,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }
                                        },
                                        '✏️'
                                      ),
                                      React.createElement(
                                        'button',
                                        {
                                          className: 'btn-icon',
                                          title: 'Удалить',
                                          onClick: () => {
                                            if (confirm(`Удалить клиента "${c.name}"?`)) removeClient(c.id);
                                          },
                                          style: {
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            border: 'none',
                                            background: '#fee2e2',
                                            cursor: 'pointer',
                                            fontSize: 14,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }
                                        },
                                        '🗑️'
                                      )
                                    )
                                  );
                                  })
                              : React.createElement(
                                  'div',
                                  { 
                                    style: { 
                                      textAlign: 'center', 
                                      padding: '40px 20px',
                                      color: 'var(--muted)'
                                    } 
                                  },
                                  React.createElement('div', { style: { fontSize: 48, marginBottom: 12 } }, '📋'),
                                  React.createElement('div', { style: { fontSize: 15 } }, 'Пока нет клиентов'),
                                  React.createElement('div', { style: { fontSize: 13, marginTop: 4 } }, 'Создайте первого клиента ниже')
                                ),
                          ),
                          // Разделитель
                          React.createElement('div', { 
                            style: { 
                              height: 1, 
                              background: 'var(--border)', 
                              margin: '16px 0' 
                            } 
                          }),
                          // Создание нового клиента
                          React.createElement(
                            'div',
                            { style: { display: 'flex', gap: 10 } },
                            React.createElement('input', {
                              placeholder: '+ Новый клиент...',
                              value: newName,
                              onChange: (e) => setNewName(e.target.value),
                              onKeyDown: (e) => e.key === 'Enter' && newName.trim() && addClientToCloud(newName),
                              style: { 
                                flex: 1,
                                padding: '12px 14px',
                                borderRadius: 12,
                                border: '2px solid var(--border)',
                                fontSize: 15,
                                outline: 'none'
                              }
                            }),
                            React.createElement(
                              'button',
                              { 
                                className: 'btn acc', 
                                onClick: () => addClientToCloud(newName),
                                disabled: !newName.trim(),
                                style: {
                                  padding: '12px 20px',
                                  borderRadius: 12,
                                  background: newName.trim() 
                                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                                    : 'var(--border)',
                                  border: 'none',
                                  color: newName.trim() ? '#fff' : 'var(--muted)',
                                  fontWeight: 600,
                                  cursor: newName.trim() ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.2s'
                                }
                              },
                              'Создать'
                            )
                          ),
                          // Выход
                          React.createElement(
                            'button',
                            { 
                              onClick: doSignOut,
                              style: {
                                width: '100%',
                                marginTop: 16,
                                padding: '10px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--muted)',
                                fontSize: 14,
                                cursor: 'pointer'
                              }
                            },
                            '← Выйти из аккаунта'
                          )
                        ), // ← Закрываем React.Fragment
                  ) // ← Закрываем modal
                )) // ← Закрываем modal-backdrop и тернарный isInitializing
              : null;

            useEffect(() => {
              // Минимальная инициализация — только загрузка из localStorage
              const initLocalData = () => {
                // Загружаем продукты из localStorage
                const storedProducts = U.lsGet('heys_products', []);
                if (Array.isArray(storedProducts)) {
                  setProducts(storedProducts);
                }

                // Загружаем клиентов из localStorage (без создания тестовых!)
                const storedClients = U.lsGet('heys_clients', []);
                if (Array.isArray(storedClients) && storedClients.length > 0) {
                  // Фильтруем тестовых клиентов
                  const realClients = storedClients.filter(c => !c.id?.startsWith('local-user'));
                  if (realClients.length > 0) {
                    setClients(realClients);
                  }
                }

                // Проверяем есть ли сохраненный клиент
                const currentClient = U.lsGet('heys_client_current');
                const storedClientsArray = U.lsGet('heys_clients', []);
                if (currentClient && storedClientsArray.some((c) => c.id === currentClient)) {
                  setClientId(currentClient);
                  window.HEYS = window.HEYS || {};
                  window.HEYS.currentClientId = currentClient;
                }

                setSyncVer((v) => v + 1);
              };

              // Проверка сети
              if (!navigator.onLine) {
                // Нет сети — загружаем локальные данные и показываем предупреждение
                initLocalData();
                setIsInitializing(false);
                setStatus('offline');
                // Показываем alert только если нет сохранённых данных
                if (!U.lsGet('heys_client_current')) {
                  setTimeout(() => {
                    alert('Нет подключения к интернету. Для первого входа нужна сеть.');
                  }, 100);
                }
                return;
              }

              // Есть сеть — проверяем "Запомнить меня"
              const shouldRemember = localStorage.getItem('heys_remember_me') === 'true';
              const savedEmail = localStorage.getItem('heys_saved_email');
              
              if (shouldRemember && savedEmail) {
                // Пробуем восстановить сессию Supabase
                setEmail(savedEmail);
                initLocalData();
                
                // Supabase автоматически восстанавливает сессию из localStorage
                if (cloud && cloud.client && cloud.client.auth) {
                  cloud.client.auth.getSession().then(({ data }) => {
                    if (data && data.session && data.session.user) {
                      setCloudUser(data.session.user);
                      setStatus('online');
                    }
                    setIsInitializing(false);
                  }).catch(() => {
                    setIsInitializing(false);
                  });
                } else {
                  setIsInitializing(false);
                }
              } else {
                // Нет "Запомнить меня" — показываем форму входа
                if (cloud && cloud.signOut) {
                  cloud.signOut();
                }
                initLocalData();
                setIsInitializing(false);
              }
            }, []);

            // Обновление products при смене clientId (без bootstrap — его делают wrapper'ы)
            useEffect(() => {
              if (clientId) {
                const loadedProducts = Array.isArray(window.HEYS.utils.lsGet('heys_products', []))
                  ? window.HEYS.utils.lsGet('heys_products', [])
                  : [];
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
              }
            }, [clientId]);

            // debounced save products
            const saveTimerRef = React.useRef(null);
            useEffect(() => {
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              saveTimerRef.current = setTimeout(() => {
                try {
                  window.HEYS.saveClientKey('heys_products', products);
                } catch (e) {
                  console.error('Error saving products:', e);
                }
              }, 300);
              return () => {
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
              };
            }, [products]);

            // auto sign-in in single-curator mode
            useEffect(() => {
              if (ONE_CURATOR_MODE && status !== 'online') {
                doSignIn();
              }
            }, [ONE_CURATOR_MODE, status]);

            async function doSignIn() {
              try {
                if (!email || !pwd) {
                  setLoginError('Введите email и пароль');
                  return;
                }
                setLoginError('');
                setStatus('signin');
                if (cloud && typeof cloud.signIn === 'function') {
                  const result = await cloud.signIn(email, pwd);
                  if (result.error) {
                    setLoginError(result.error.message || 'Неверный email или пароль');
                    setStatus('offline');
                    return;
                  }
                  setCloudUser(result.user);
                  
                  // Сохраняем "Запомнить меня"
                  if (rememberMe) {
                    localStorage.setItem('heys_remember_me', 'true');
                    localStorage.setItem('heys_saved_email', email);
                  } else {
                    localStorage.removeItem('heys_remember_me');
                    localStorage.removeItem('heys_saved_email');
                  }
                }
                setStatus(typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'online');
                // Загружаем продукты после sign-in
                const loadedProducts = Array.isArray(U.lsGet('heys_products', []))
                  ? U.lsGet('heys_products', [])
                  : [];
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
              } catch (e) {
                setStatus('offline');
                setLoginError(e && e.message ? e.message : 'Ошибка подключения');
              }
            }
            async function doSignOut() {
              try {
                if (cloud && typeof cloud.signOut === 'function') await cloud.signOut();
              } catch (e) {}
              // Сбрасываем состояние — покажется форма входа
              setCloudUser(null);
              setClientId(null);
              setClients([]);
              setProducts([]);
              setStatus('offline');
              setSyncVer((v) => v + 1);
              // Очищаем сохранённый клиент (но не email если "Запомнить меня")
              try { localStorage.removeItem('heys_last_client_id'); } catch (e) {}
            }
            
            // Формируем текст для pending details
            const getPendingText = () => {
              const parts = [];
              if (pendingDetails.days > 0) parts.push(`${pendingDetails.days} дн.`);
              if (pendingDetails.products > 0) parts.push(`${pendingDetails.products} прод.`);
              if (pendingDetails.profile > 0) parts.push('профиль');
              if (pendingDetails.other > 0) parts.push(`${pendingDetails.other} др.`);
              return parts.length > 0 ? parts.join(', ') : '';
            };

            const currentClientName = clients.find((c) => c.id === clientId)?.name || 'Выберите клиента';
            
            // Morning Check-in блокирует основной контент (показывается ДО загрузки)
            const isMorningCheckinBlocking = showMorningCheckin === true && HEYS.MorningCheckin;

            return React.createElement(
              React.Fragment,
              null,
              gate,
              // === MORNING CHECK-IN (вес, сон, шаги — показывается ВМЕСТО контента) ===
              isMorningCheckinBlocking && React.createElement(HEYS.MorningCheckin, {
                onComplete: (data) => {
                  console.log('[App] 🎉 MorningCheckin onComplete вызван');
                  // НЕ инкрементим syncVer — данные обновляются через событие 'heys:day-updated'
                  // Это предотвращает пересоздание DayTab и показ скелетонов
                  console.log('[App] 👁️ Скрываю MorningCheckin');
                  setShowMorningCheckin(false);
                }
              }),
              // === OFFLINE BANNER (показывается 3 сек при потере сети) ===
              !isMorningCheckinBlocking && showOfflineBanner && React.createElement(
                'div',
                { className: 'offline-banner' },
                React.createElement('span', { className: 'offline-banner-icon' }, '📡'),
                React.createElement('span', { className: 'offline-banner-text' }, 
                  'Нет сети — данные сохраняются локально'
                )
              ),
              // === ONLINE BANNER (показывается 2 сек при восстановлении сети) ===
              !isMorningCheckinBlocking && showOnlineBanner && React.createElement(
                'div',
                { className: 'online-banner' },
                React.createElement('span', { className: 'online-banner-icon' }, '✓'),
                React.createElement('span', { className: 'online-banner-text' }, 
                  pendingCount > 0 ? 'Сеть восстановлена — синхронизация...' : 'Сеть восстановлена'
                )
              ),
              // Toast убран — отвлекает
              // Основной контент — скрыт во время Morning Check-in (но рендерится для preload)
              React.createElement(
                'div',
                { 
                  className: 'wrap',
                  style: isMorningCheckinBlocking ? { display: 'none' } : undefined
                },
                React.createElement(
                  'div',
                  { className: 'hdr' },
                  // === ВЕРХНЯЯ ЛИНИЯ: Gamification Bar ===
                  React.createElement(
                    'div',
                    { className: 'hdr-top hdr-gamification' },
                    // Live GamificationBar component
                    React.createElement(GamificationBar)
                  ),
                  // === НИЖНЯЯ ЛИНИЯ: Клиент + Действия ===
                  clientId
                    ? React.createElement(
                        'div',
                        { className: 'hdr-bottom' },
                        // Информация о клиенте + DatePicker
                        React.createElement(
                          'div',
                          { className: 'hdr-client', style: { position: 'relative' } },
                          // Кликабельный блок для dropdown
                          React.createElement(
                            'div',
                            {
                              className: 'hdr-client-clickable',
                              onClick: () => setShowClientDropdown(!showClientDropdown),
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                padding: '4px 8px 4px 4px',
                                borderRadius: 12,
                                transition: 'background 0.2s'
                              }
                            },
                            React.createElement(
                              'div',
                              {
                                className: 'hdr-client-avatar',
                                style: { background: getAvatarColor(currentClientName) }
                              },
                              getClientInitials(currentClientName)
                            ),
                            React.createElement(
                              'div',
                              { className: 'hdr-client-info' },
                              // Имя и фамилия в 2 строки из профиля
                              (() => {
                                const U = window.HEYS && window.HEYS.utils;
                                const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};
                                const firstName = profile.firstName || '';
                                const lastName = profile.lastName || '';
                                // Если профиль пустой — fallback на имя клиента
                                if (!firstName && !lastName) {
                                  const parts = currentClientName.split(' ');
                                  return [
                                    React.createElement('span', { key: 'fn', className: 'hdr-client-firstname' }, parts[0] || ''),
                                    parts[1] && React.createElement('span', { key: 'ln', className: 'hdr-client-lastname' }, parts.slice(1).join(' '))
                                  ];
                                }
                                return [
                                  React.createElement('span', { key: 'fn', className: 'hdr-client-firstname' }, firstName),
                                  lastName && React.createElement('span', { key: 'ln', className: 'hdr-client-lastname' }, lastName)
                                ];
                              })()
                            ),
                            // Стрелка dropdown
                            React.createElement('span', { 
                              style: { 
                                fontSize: 10, 
                                color: 'var(--muted)',
                                transition: 'transform 0.2s',
                                transform: showClientDropdown ? 'rotate(180deg)' : 'rotate(0)'
                              } 
                            }, '▼')
                          ),
                          // Dropdown список клиентов
                          showClientDropdown && React.createElement(
                            'div',
                            {
                              className: 'client-dropdown',
                              style: {
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: 8,
                                background: 'var(--card)',
                                borderRadius: 16,
                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                border: '1px solid var(--border)',
                                minWidth: 260,
                                maxHeight: 320,
                                overflow: 'auto',
                                zIndex: 1000,
                                animation: 'fadeSlideIn 0.2s ease'
                              }
                            },
                            // Заголовок
                            React.createElement('div', { 
                              style: { 
                                padding: '12px 16px 8px', 
                                fontSize: 12, 
                                color: 'var(--muted)',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              } 
                            }, `Быстрый выбор (${clients.length})`),
                            // Список клиентов (сортировка: последний использованный сверху)
                            [...clients]
                              .sort((a, b) => {
                                const lastA = localStorage.getItem('heys_last_client_id') === a.id ? 1 : 0;
                                const lastB = localStorage.getItem('heys_last_client_id') === b.id ? 1 : 0;
                                if (lastA !== lastB) return lastB - lastA;
                                // Затем по активности (streak)
                                const statsA = getClientStats(a.id);
                                const statsB = getClientStats(b.id);
                                return (statsB.streak || 0) - (statsA.streak || 0);
                              })
                              .map((c) => 
                              React.createElement(
                                'div',
                                {
                                  key: c.id,
                                  className: 'client-dropdown-item' + (c.id === clientId ? ' active' : ''),
                                  style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                    background: c.id === clientId ? 'rgba(102, 126, 234, 0.1)' : 'transparent'
                                  },
                                  onClick: async () => {
                                    if (c.id !== clientId) {
                                      if (HEYS.cloud && HEYS.cloud.switchClient) {
                                        await HEYS.cloud.switchClient(c.id);
                                      } else {
                                        U.lsSet('heys_client_current', c.id);
                                      }
                                      localStorage.setItem('heys_last_client_id', c.id);
                                      setClientId(c.id);
                                    }
                                    setShowClientDropdown(false);
                                  }
                                },
                                // Мини-аватар
                                React.createElement('div', { 
                                  style: { 
                                    width: 32, 
                                    height: 32, 
                                    borderRadius: '50%',
                                    background: getAvatarColor(c.name),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    flexShrink: 0
                                  } 
                                }, getClientInitials(c.name)),
                                // Имя
                                React.createElement('span', { 
                                  style: { 
                                    flex: 1,
                                    fontWeight: c.id === clientId ? 600 : 400,
                                    color: c.id === clientId ? '#667eea' : 'var(--text)'
                                  } 
                                }, c.name),
                                // Галочка для выбранного
                                c.id === clientId && React.createElement('span', { 
                                  style: { color: '#667eea' } 
                                }, '✓')
                              )
                            ),
                            // Разделитель
                            React.createElement('div', { 
                              style: { height: 1, background: 'var(--border)', margin: '8px 0' } 
                            }),
                            // Кнопка "Все клиенты"
                            React.createElement(
                              'div',
                              {
                                style: {
                                  padding: '10px 16px 12px',
                                  textAlign: 'center',
                                  color: '#667eea',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  fontSize: 14
                                },
                                onClick: () => {
                                  localStorage.removeItem('heys_client_current');
                                  window.HEYS.currentClientId = null;
                                  setClientId('');
                                  setShowClientDropdown(false);
                                }
                              },
                              '👥 Все клиенты'
                            ),
                            // Кнопка Выход с email
                            React.createElement(
                              'div',
                              {
                                style: {
                                  padding: '8px 16px 12px',
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  fontSize: 13
                                },
                                onClick: () => {
                                  setShowClientDropdown(false);
                                  doSignOut();
                                }
                              },
                              React.createElement('div', { 
                                style: { color: 'var(--muted)', fontSize: 11, marginBottom: 4 } 
                              }, cloudUser?.email || ''),
                              React.createElement('span', { 
                                style: { color: '#ef4444' } 
                              }, '🚪 Выйти')
                            )
                          ),
                          // Overlay для закрытия dropdown при клике вне
                          showClientDropdown && React.createElement('div', {
                            style: {
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              zIndex: 999
                            },
                            onClick: () => setShowClientDropdown(false)
                          }),
                          // Cloud sync indicator
                          React.createElement('div', {
                            key: 'cloud-' + cloudStatus, // Force re-render on status change
                            className: 'cloud-sync-indicator ' + cloudStatus,
                            title: cloudStatus === 'syncing' 
                              ? (syncProgress.total > 1 
                                  ? `Синхронизация... ${syncProgress.synced}/${syncProgress.total}`
                                  : 'Синхронизация...') 
                              : cloudStatus === 'synced' ? 'Сохранено в облако'
                              : cloudStatus === 'offline' 
                                ? (pendingCount > 0 
                                    ? `Офлайн — ${pendingCount} изменений ожидают синхронизации`
                                    : 'Офлайн — данные сохраняются локально')
                              : cloudStatus === 'error' 
                                ? (retryCountdown > 0 ? `Ошибка. Повтор через ${retryCountdown}с` : 'Ошибка синхронизации')
                              : 'Подключено к облаку',
                            // Синее облако — сеть есть, зелёная галочка — синхронизировано
                            dangerouslySetInnerHTML: {
                              __html: cloudStatus === 'syncing' 
                                ? '<div class="sync-spinner"></div>' + (syncProgress.total > 1 ? '<span class="sync-progress">' + syncProgress.synced + '/' + syncProgress.total + '</span>' : '')
                                : cloudStatus === 'synced' 
                                ? '<span class="cloud-icon synced">✓</span>'
                                : cloudStatus === 'offline' 
                                ? '<svg class="cloud-icon offline" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2"/></svg>' + (pendingCount > 0 ? '<span class="pending-badge">' + pendingCount + '</span>' : '')
                                : cloudStatus === 'error' 
                                ? '<span class="cloud-icon error">⚠</span>' + (retryCountdown > 0 ? '<span class="retry-countdown">' + retryCountdown + '</span>' : '')
                                : '<svg class="cloud-icon idle" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>'
                            }
                          }),
                          // Кнопки "Вчера" + "Сегодня" + DatePicker
                          (tab === 'stats' || tab === 'diary' || tab === 'reports') && window.HEYS.DatePicker
                            ? React.createElement('div', { className: 'hdr-date-group' },
                                // Кнопка быстрого перехода на вчера
                                React.createElement('button', {
                                  className: 'yesterday-quick-btn' + (selectedDate === (() => {
                                    const d = new Date();
                                    if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                    d.setDate(d.getDate() - 1);
                                    return d.toISOString().slice(0, 10);
                                  })() ? ' active' : ''),
                                  onClick: () => {
                                    const d = new Date();
                                    if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                    d.setDate(d.getDate() - 1);
                                    setSelectedDate(d.toISOString().slice(0, 10));
                                  },
                                  title: 'Перейти на вчера'
                                }, (() => {
                                  // До 3:00 — вчера = позавчера реально
                                  const d = new Date();
                                  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                  d.setDate(d.getDate() - 1);
                                  return d.getDate();
                                })()),
                                // Кнопка быстрого перехода на сегодня (учитываем ночной порог)
                                React.createElement('button', {
                                  className: 'today-quick-btn' + (selectedDate === todayISO() ? ' active' : ''),
                                  onClick: () => setSelectedDate(todayISO()),
                                  title: 'Перейти на сегодня'
                                }, (() => {
                                  // До 3:00 — показываем вчерашнее число
                                  const d = new Date();
                                  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                  return d.getDate();
                                })()),
                                // DatePicker
                                React.createElement(window.HEYS.DatePicker, {
                                  valueISO: selectedDate,
                                  onSelect: setSelectedDate,
                                  onRemove: () => {
                                    setSelectedDate(todayISO());
                                  },
                                  activeDays: datePickerActiveDays,
                                  // Функция для загрузки данных при смене месяца
                                  getActiveDaysForMonth: (year, month) => {
                                    const getActiveDaysForMonthFn = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
                                    if (!getActiveDaysForMonthFn || !clientId || !products || products.length === 0) {
                                      return new Map();
                                    }
                                    const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};
                                    try {
                                      return getActiveDaysForMonthFn(year, month, profile, products);
                                    } catch (e) {
                                      return new Map();
                                    }
                                  }
                                }),
                                // Кнопка темы
                                React.createElement('button', {
                                  className: 'hdr-theme-btn',
                                  onClick: () => {
                                    const html = document.documentElement;
                                    const current = html.getAttribute('data-theme') || 'light';
                                    const next = current === 'dark' ? 'light' : 'dark';
                                    html.setAttribute('data-theme', next);
                                    localStorage.setItem('heys_theme', next);
                                  },
                                  title: 'Сменить тему'
                                }, document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙')
                              )
                            : null,
                        ),
                      )
                    : null,
                ),
                React.createElement(
                  'div',
                  { className: 'tabs' },
                  // Рацион — только для десктопа
                  React.createElement(
                    'div',
                    {
                      className: 'tab tab-desktop-only ' + (tab === 'ration' ? 'active' : ''),
                      onClick: () => setTab('ration'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '🗂️'),
                    React.createElement('span', { className: 'tab-text' }, 'База'),
                  ),
                  // Обзор — слева
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'overview' ? 'active' : ''),
                      onClick: () => setTab('overview'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '📋'),
                    React.createElement('span', { className: 'tab-text' }, 'Обзор'),
                  ),
                  // iOS Switch группа для stats/diary — ПО ЦЕНТРУ
                  React.createElement(
                    'div',
                    { 
                      className: 'tab-switch-group',
                      onClick: () => setTab(tab === 'stats' ? 'diary' : 'stats'),
                    },
                    React.createElement(
                      'div',
                      {
                        className: 'tab tab-switch ' + (tab === 'stats' ? 'active' : ''),
                      },
                      React.createElement('span', { className: 'tab-icon' }, '📊'),
                      React.createElement('span', { className: 'tab-text' }, 'Итоги'),
                    ),
                    React.createElement(
                      'div',
                      {
                        className: 'tab tab-switch ' + (tab === 'diary' ? 'active' : ''),
                      },
                      React.createElement('span', { className: 'tab-icon' }, '🍴'),
                      React.createElement('span', { className: 'tab-text' }, 'Еда'),
                    ),
                  ),
                  // Графики — только для десктопа
                  React.createElement(
                    'div',
                    {
                      className: 'tab tab-desktop-only ' + (tab === 'reports' ? 'active' : ''),
                      onClick: () => {
                        if (
                          window.HEYS &&
                          window.HEYS.Day &&
                          typeof window.HEYS.Day.requestFlush === 'function'
                        ) {
                          try {
                            window.HEYS.Day.requestFlush();
                          } catch (error) {}
                        }
                        setTab('reports');
                        setReportsRefresh(Date.now());
                      },
                    },
                    React.createElement('span', { className: 'tab-icon' }, '📈'),
                    React.createElement('span', { className: 'tab-text' }, 'Графики'),
                  ),
                  // Настройки — справа
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'user' ? 'active' : ''),
                      onClick: () => setTab('user'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '⚙️'),
                    React.createElement('span', { className: 'tab-text' }, 'Настройки'),
                  ),
                ),
                // === SWIPEABLE TAB CONTENT ===
                React.createElement(
                  'div',
                  {
                    className: 'tab-content-swipeable' + 
                      (slideDirection === 'left' ? ' slide-out-left' : '') +
                      (slideDirection === 'right' ? ' slide-out-right' : '') +
                      (edgeBounce === 'left' ? ' edge-bounce-left' : '') +
                      (edgeBounce === 'right' ? ' edge-bounce-right' : ''),
                    onTouchStart: onTouchStart,
                    onTouchEnd: onTouchEnd,
                  },
                  // Edge indicators
                  edgeBounce && React.createElement('div', { 
                    className: 'edge-indicator ' + edgeBounce 
                  }),
                  tab === 'ration'
                    ? React.createElement(RationTabWithCloudSync, {
                        key: 'ration' + syncVer + '_' + String(clientId || ''),
                        products,
                        setProducts,
                        clientId,
                      })
                    : (tab === 'stats' || tab === 'diary')
                      ? React.createElement(DayTabWithCloudSync, {
                          key: 'day' + syncVer + '_' + String(clientId || '') + '_' + selectedDate,
                          products,
                          clientId,
                          selectedDate,
                          setSelectedDate,
                          subTab: tab,
                        })
                      : tab === 'user'
                        ? React.createElement(UserTabWithCloudSync, {
                            key: 'user' + syncVer + '_' + String(clientId || ''),
                            clientId,
                          })
                        : tab === 'overview'
                          ? (window.HEYS && window.HEYS.DataOverviewTab
                              ? React.createElement(window.HEYS.DataOverviewTab, {
                                  key: 'overview' + syncVer + '_' + String(clientId || ''),
                                  clientId,
                                  setTab,
                                  setSelectedDate,
                                })
                              : React.createElement('div', { style: { padding: 16 } },
                                  React.createElement('div', { className: 'skeleton-sparkline', style: { height: 80, marginBottom: 16 } }),
                                  React.createElement('div', { className: 'skeleton-block', style: { height: 100 } })
                                ))
                          : window.HEYS && window.HEYS.ReportsTab
                            ? React.createElement(window.HEYS.ReportsTab, {
                                key:
                                  'reports' +
                                  syncVer +
                                  '_' +
                                  String(clientId || '') +
                                  '_' +
                                  reportsRefresh,
                                products,
                              })
                            : React.createElement('div', { style: { padding: 16 } },
                                React.createElement('div', { className: 'skeleton-header', style: { width: 150, marginBottom: 16 } }),
                                React.createElement('div', { className: 'skeleton-block', style: { height: 200 } })
                              ),
                ),
              ),
              // === PWA Install Banner for Android/Desktop (только после Morning Check-in) ===
              !isMorningCheckinBlocking && showPwaBanner && React.createElement(
                'div',
                { className: 'pwa-install-banner' },
                React.createElement('div', { className: 'pwa-banner-content' },
                  React.createElement('div', { className: 'pwa-banner-icon' }, '📱'),
                  React.createElement('div', { className: 'pwa-banner-text' },
                    React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                    React.createElement('div', { className: 'pwa-banner-desc' }, 'Быстрый доступ с главного экрана')
                  ),
                  React.createElement('div', { className: 'pwa-banner-actions' },
                    React.createElement('button', { 
                      className: 'pwa-banner-install',
                      onClick: handlePwaInstall
                    }, 'Установить'),
                    React.createElement('button', { 
                      className: 'pwa-banner-dismiss',
                      onClick: dismissPwaBanner
                    }, '✕')
                  )
                )
              ),
              // === iOS Safari PWA Banner ===
              !isMorningCheckinBlocking && showIosPwaBanner && React.createElement(
                'div',
                { className: 'pwa-install-banner ios-pwa-banner' },
                React.createElement('div', { className: 'pwa-banner-content ios-banner-content' },
                  React.createElement('div', { className: 'pwa-banner-icon' }, '📲'),
                  React.createElement('div', { className: 'pwa-banner-text' },
                    React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                    React.createElement('div', { className: 'ios-benefit-hint' }, 
                      '✨ Полный экран • Быстрый доступ • Работа offline'
                    ),
                    React.createElement('div', { className: 'ios-steps' },
                      React.createElement('div', { className: 'ios-step' },
                        React.createElement('span', { className: 'ios-step-num' }, '1'),
                        'Нажмите ',
                        React.createElement('span', { className: 'ios-share-icon' }, 
                          React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
                            React.createElement('path', { d: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8' }),
                            React.createElement('polyline', { points: '16 6 12 2 8 6' }),
                            React.createElement('line', { x1: 12, y1: 2, x2: 12, y2: 15 })
                          )
                        ),
                        ' внизу'
                      ),
                      React.createElement('div', { className: 'ios-step' },
                        React.createElement('span', { className: 'ios-step-num' }, '2'),
                        '«На экран Домой»'
                      )
                    )
                  ),
                  React.createElement('button', { 
                    className: 'ios-got-it-btn',
                    onClick: dismissIosPwaBanner
                  }, 'Понял')
                ),
                React.createElement('div', { className: 'ios-arrow-hint' },
                  React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'currentColor' },
                    React.createElement('path', { d: 'M12 16l-6-6h12l-6 6z' })
                  )
                )
              ),
              // === Update Toast (только после Morning Check-in) ===
              !isMorningCheckinBlocking && showUpdateToast && React.createElement(
                'div',
                { className: 'update-toast' },
                React.createElement('div', { className: 'update-toast-content' },
                  React.createElement('span', { className: 'update-toast-icon' }, '🚀'),
                  React.createElement('span', { className: 'update-toast-text' }, 'Доступна новая версия!'),
                  React.createElement('button', { 
                    className: 'update-toast-btn',
                    onClick: handleUpdate
                  }, 'Обновить'),
                  React.createElement('button', { 
                    className: 'update-toast-dismiss',
                    onClick: dismissUpdateToast
                  }, '✕')
                )
              ),
            );
          }
          const root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(React.createElement(ErrorBoundary, null, React.createElement(App)));
        }

        // Start initialization
        initializeApp();
      })();
