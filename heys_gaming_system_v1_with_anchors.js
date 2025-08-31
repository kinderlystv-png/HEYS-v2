/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_gaming_system_v1_with_anchors.js (1021 строка)        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 📄 ЗАГОЛОВОК И ИМПОРТЫ (строки 1-50):                                                    │
│    ├── Описание модуля (1-15)                                                           │
│    ├── Импорты зависимостей (17-20)                                                     │
│    ├── GAME_CONFIG константы (22-33)                                                    │
│    ├── ACHIEVEMENT_TYPES (35-45)                                                        │
│    └── @ANCHOR:CLASS_HEYSGAMINGSYSTEM (47-50)                                          │
│                                                                                           │
│ 🎮 ОСНОВНОЙ КЛАСС HEYSGamingSystem (строки 51-200):                                      │
│    ├── constructor() - инициализация (51-80)                                            │
│    ├── Игровые данные и состояние (81-100)                                              │
│    ├── initialize() - настройка системы (101-130)                                       │
│    ├── loadPlayerData() - загрузка профиля (131-150)                                    │
│    ├── savePlayerData() - сохранение (151-170)                                          │
│    └── resetGameData() - сброс данных (171-200)                                         │
│                                                                                           │
│ 🏆 СИСТЕМА ДОСТИЖЕНИЙ (строки 201-400):                                                  │
│    ├── Achievement class (201-250)                                                      │
│    ├── createAchievement() - создание (251-280)                                         │
│    ├── checkAchievements() - проверка (281-320)                                         │
│    ├── unlockAchievement() - разблокировка (321-350)                                    │
│    ├── getPlayerAchievements() - получение (351-370)                                    │
│    └── calculateAchievementScore() - расчет очков (371-400)                             │
│                                                                                           │
│ 📈 СИСТЕМА УРОВНЕЙ И ОПЫТА (строки 401-550):                                             │
│    ├── addExperience() - добавление опыта (401-430)                                     │
│    ├── calculateLevel() - расчет уровня (431-450)                                       │
│    ├── getXPForLevel() - XP для уровня (451-470)                                        │
│    ├── levelUp() - повышение уровня (471-500)                                           │
│    ├── getPlayerLevel() - текущий уровень (501-520)                                     │
│    └── getProgressToNextLevel() - прогресс (521-550)                                    │
│                                                                                           │
│ 🎯 СИСТЕМА ЧЕЛЛЕНДЖЕЙ (строки 551-700):                                                  │
│    ├── DailyChallenge class (551-600)                                                   │
│    ├── generateDailyChallenges() - генерация (601-640)                                  │
│    ├── completeDailyChallenge() - завершение (641-670)                                  │
│    ├── getActiveChallenges() - активные (671-690)                                       │
│    └── calculateChallengeRewards() - награды (691-700)                                  │
│                                                                                           │
│ 💰 ЭКОНОМИЧЕСКАЯ СИСТЕМА (строки 701-850):                                               │
│    ├── addCurrency() - добавление валюты (701-730)                                      │
│    ├── spendCurrency() - трата валюты (731-760)                                         │
│    ├── getCurrencyBalance() - баланс (761-780)                                          │
│    ├── Shop class - магазин (781-820)                                                   │
│    ├── purchaseItem() - покупка предметов (821-840)                                     │
│    └── getShopItems() - товары (841-850)                                                │
│                                                                                           │
│ 📊 АНАЛИТИКА И СТАТИСТИКА (строки 851-920):                                              │
│    ├── getGameStats() - игровая статистика (851-880)                                    │
│    ├── generateLeaderboard() - таблица лидеров (881-900)                                │
│    ├── exportGameData() - экспорт данных (901-920)                                      │
│    └── getPlayerRanking() - рейтинг игрока (921-930)                                    │
│                                                                                           │
│ 🔗 ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ (строки 921-948):                                             │
│    ├── HEYS.GamingSystem экспорт (931-940)                                              │
│    ├── Автоматическая инициализация (941-945)                                           │
│    └── Якорные точки навигации (946-948)                                                │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Класс: HEYSGamingSystem (51), initialize() (101)                                  │
│    • Достижения: Achievement (201), unlockAchievement() (321)                          │
│    • Уровни: addExperience() (401), levelUp() (471)                                    │
│    • Челленджи: DailyChallenge (551), completeDailyChallenge() (641)                   │
│    • Экономика: addCurrency() (701), Shop (781)                                        │
│    • Якоря: @ANCHOR:CLASS_HEYSGAMINGSYSTEM (47)                                        │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

/**
 * ===============================================================================
 * 🎮 HEYS GAMING MODULE - Игровая система для мотивации пользователей
 * ===============================================================================
 * 
 * Этот модуль добавляет игровые элементы в систему HEYS:
 * - Система достижений и уровней
 * - Ежедневные челленджи
 * - Соревнования между пользователями
 * - Виртуальная валюта и награды
 * 
 * Версия: 1.0.0
 * Автор: HEYS Development Team
 * Дата: 26.08.2025
 */

// Импорты и зависимости
import { HEYSCore } from './heys_core_v12.js';
import { HEYSStorage } from './heys_storage_supabase_v1.js';
import { HEYSAnalytics } from './heys_analytics_ui.js';

// Константы игровой системы
const GAME_CONFIG = {
    MAX_LEVEL: 100,
    XP_MULTIPLIER: 1.2,
    DAILY_BONUS: 50,
    STREAK_MULTIPLIER: 1.5,
    ACHIEVEMENT_CATEGORIES: ['productivity', 'consistency', 'social', 'innovation'],
    CURRENCIES: {
        HEYS_COINS: 'heys_coins',
        ENERGY_POINTS: 'energy_points',
        REPUTATION: 'reputation'
    }
};

// Типы достижений
const ACHIEVEMENT_TYPES = {
    DAILY_STREAK: 'daily_streak',
    TASKS_COMPLETED: 'tasks_completed',
    TIME_FOCUSED: 'time_focused',
    SOCIAL_INTERACTION: 'social_interaction',
    INNOVATION_POINTS: 'innovation_points',
    PERFECTIONIST: 'perfectionist',
    EARLY_BIRD: 'early_bird',
    NIGHT_OWL: 'night_owl'
};

// Основной класс игровой системы
// @ANCHOR:CLASS_HEYSGAMINGSYSTEM
// КЛАСС HEYSGAMINGSYSTEM
class HEYSGamingSystem {
    constructor(core, storage, analytics) {
        this.core = core;
        this.storage = storage;
        this.analytics = analytics;
        this.playerProfile = null;
        this.achievements = new Map();
        this.challenges = new Map();
        this.leaderboards = new Map();
        this.eventListeners = new Map();
        
        // Инициализация подсистем
        this.initializeGameSystems();
    }

    // Инициализация всех игровых систем
    // @ANCHOR:METHOD_INITIALIZEGAMESYSTEMS
    // МЕТОД INITIALIZEGAMESYSTEMS
    async initializeGameSystems() {
        try {
            console.log('🎮 Инициализация игровой системы HEYS...');
            
            await this.loadPlayerProfile();
            await this.initializeAchievements();
            await this.loadDailyChallenges();
            await this.setupEventHandlers();
            await this.startBackgroundProcesses();
            
            console.log('✅ Игровая система успешно инициализирована');
            this.triggerEvent('gaming_system_ready');
        } catch (error) {
            console.error('❌ Ошибка инициализации игровой системы:', error);
            throw error;
        }
    }

    // Загрузка профиля игрока
    // @ANCHOR:METHOD_LOADPLAYERPROFILE
    // МЕТОД LOADPLAYERPROFILE
    async loadPlayerProfile() {
        console.log('👤 Загрузка профиля игрока...');
        
        try {
            const savedProfile = await this.storage.get('player_profile');
            
            // @ANCHOR:METHOD_IF
            // МЕТОД IF
            if (savedProfile) {
                this.playerProfile = {
                    ...this.getDefaultProfile(),
                    ...savedProfile,
                    lastActive: new Date().toISOString()
                };
            } else {
                this.playerProfile = this.createNewPlayerProfile();
                await this.savePlayerProfile();
            }
            
            // Проверяем ежедневную активность
            await this.checkDailyActivity();
            
            console.log(`🎯 Профиль загружен: Уровень ${this.playerProfile.level}, XP: ${this.playerProfile.experience}`);
        } catch (error) {
            console.error('❌ Ошибка загрузки профиля:', error);
            this.playerProfile = this.getDefaultProfile();
        }
    }

    // Создание нового профиля игрока
    // @ANCHOR:METHOD_CREATENEWPLAYERPROFILE
    // МЕТОД CREATENEWPLAYERPROFILE
    createNewPlayerProfile() {
        const profile = {
            id: this.generatePlayerId(),
            username: 'HEYSPlayer',
            level: 1,
            experience: 0,
            currencies: {
                [GAME_CONFIG.CURRENCIES.HEYS_COINS]: 100,
                [GAME_CONFIG.CURRENCIES.ENERGY_POINTS]: 50,
                [GAME_CONFIG.CURRENCIES.REPUTATION]: 0
            },
            statistics: {
                totalTasksCompleted: 0,
                totalTimeSpent: 0,
                currentStreak: 0,
                maxStreak: 0,
                achievementsUnlocked: 0,
                challengesCompleted: 0
            },
            achievements: [],
            badges: [],
            preferences: {
                notifications: true,
                soundEffects: true,
                animations: true,
                difficulty: 'normal'
            },
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString()
        };
        
        console.log('🆕 Создан новый профиль игрока');
        this.triggerEvent('new_player_created', profile);
        
        return profile;
    }

    // Получение профиля по умолчанию
    // @ANCHOR:METHOD_GETDEFAULTPROFILE
    // МЕТОД GETDEFAULTPROFILE
    getDefaultProfile() {
        return {
            id: 'default_player',
            username: 'HEYSPlayer',
            level: 1,
            experience: 0,
            currencies: {
                [GAME_CONFIG.CURRENCIES.HEYS_COINS]: 0,
                [GAME_CONFIG.CURRENCIES.ENERGY_POINTS]: 0,
                [GAME_CONFIG.CURRENCIES.REPUTATION]: 0
            },
            statistics: {
                totalTasksCompleted: 0,
                totalTimeSpent: 0,
                currentStreak: 0,
                maxStreak: 0,
                achievementsUnlocked: 0,
                challengesCompleted: 0
            },
            achievements: [],
            badges: [],
            preferences: {
                notifications: true,
                soundEffects: true,
                animations: true,
                difficulty: 'normal'
            }
        };
    }

    // Сохранение профиля игрока
    // @ANCHOR:METHOD_SAVEPLAYERPROFILE
    // МЕТОД SAVEPLAYERPROFILE
    async savePlayerProfile() {
        try {
            await this.storage.set('player_profile', this.playerProfile);
            console.log('💾 Профиль игрока сохранен');
        } catch (error) {
            console.error('❌ Ошибка сохранения профиля:', error);
        }
    }

    // Система опыта и уровней
    static ExperienceSystem = class {
        static calculateRequiredXP(level) {
            return Math.floor(100 * Math.pow(GAME_CONFIG.XP_MULTIPLIER, level - 1));
        }

        static calculateLevel(totalXP) {
            let level = 1;
            let requiredXP = 0;
            
            // @ANCHOR:METHOD_WHILE
            // МЕТОД WHILE
            while (requiredXP <= totalXP && level < GAME_CONFIG.MAX_LEVEL) {
                level++;
                requiredXP += this.calculateRequiredXP(level);
            }
            
            return Math.max(1, level - 1);
        }

        static getXPProgress(currentXP, level) {
            const currentLevelXP = this.calculateRequiredXP(level);
            const nextLevelXP = this.calculateRequiredXP(level + 1);
            const progress = (currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP);
            
            return Math.max(0, Math.min(1, progress));
        }
    }

    // Добавление опыта игроку
    // @ANCHOR:METHOD_ADDEXPERIENCE
    // МЕТОД ADDEXPERIENCE
    async addExperience(amount, reason = 'general') {
        if (!this.playerProfile || amount <= 0) return;
        
        const oldLevel = this.playerProfile.level;
        const oldXP = this.playerProfile.experience;
        
        // Добавляем опыт
        this.playerProfile.experience += amount;
        
        // Пересчитываем уровень
        const newLevel = HEYSGamingSystem.ExperienceSystem.calculateLevel(this.playerProfile.experience);
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (newLevel > oldLevel) {
            await this.handleLevelUp(oldLevel, newLevel);
        }
        
        this.playerProfile.level = newLevel;
        
        // Логируем и сохраняем
        console.log(`⭐ +${amount} XP за "${reason}". Уровень: ${newLevel} (${this.playerProfile.experience} XP)`);
        
        this.triggerEvent('experience_gained', {
            amount,
            reason,
            oldXP,
            newXP: this.playerProfile.experience,
            oldLevel,
            newLevel
        });
        
        await this.savePlayerProfile();
        
        // Обновляем аналитику
        this.analytics.trackEvent('experience_gained', {
            amount,
            reason,
            newLevel: newLevel,
            totalXP: this.playerProfile.experience
        });
    }

    // Обработка повышения уровня
    // @ANCHOR:METHOD_HANDLELEVELUP
    // МЕТОД HANDLELEVELUP
    async handleLevelUp(oldLevel, newLevel) {
        console.log(`🎉 ПОВЫШЕНИЕ УРОВНЯ! ${oldLevel} → ${newLevel}`);
        
        // Награды за уровень
        const coinReward = newLevel * 10;
        const energyReward = newLevel * 5;
        
        await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, coinReward);
        await this.addCurrency(GAME_CONFIG.CURRENCIES.ENERGY_POINTS, energyReward);
        
        // Проверяем достижения за уровень
        await this.checkLevelAchievements(newLevel);
        
        // Уведомление о повышении уровня
        this.showLevelUpNotification(oldLevel, newLevel, {
            coins: coinReward,
            energy: energyReward
        });
        
        this.triggerEvent('level_up', {
            oldLevel,
            newLevel,
            rewards: { coins: coinReward, energy: energyReward }
        });
    }

    // Система валют
    // @ANCHOR:METHOD_ADDCURRENCY
    // МЕТОД ADDCURRENCY
    async addCurrency(type, amount) {
        if (!this.playerProfile || amount <= 0) return;
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (!this.playerProfile.currencies[type]) {
            this.playerProfile.currencies[type] = 0;
        }
        
        this.playerProfile.currencies[type] += amount;
        
        console.log(`💰 +${amount} ${type}. Итого: ${this.playerProfile.currencies[type]}`);
        
        this.triggerEvent('currency_added', { type, amount, total: this.playerProfile.currencies[type] });
        await this.savePlayerProfile();
    }

    // @ANCHOR:METHOD_SPENDCURRENCY
    // МЕТОД SPENDCURRENCY
    async spendCurrency(type, amount) {
        if (!this.playerProfile || amount <= 0) return false;
        
        const currentAmount = this.playerProfile.currencies[type] || 0;
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (currentAmount < amount) {
            console.warn(`❌ Недостаточно ${type}. Нужно: ${amount}, есть: ${currentAmount}`);
            return false;
        }
        
        this.playerProfile.currencies[type] -= amount;
        
        console.log(`💸 -${amount} ${type}. Осталось: ${this.playerProfile.currencies[type]}`);
        
        this.triggerEvent('currency_spent', { type, amount, remaining: this.playerProfile.currencies[type] });
        await this.savePlayerProfile();
        
        return true;
    }

    // Система достижений
    // @ANCHOR:METHOD_INITIALIZEACHIEVEMENTS
    // МЕТОД INITIALIZEACHIEVEMENTS
    async initializeAchievements() {
        console.log('🏆 Инициализация системы достижений...');
        
        // Загружаем определения достижений
        const achievementDefinitions = this.getAchievementDefinitions();
        
        for (const [id, definition] of Object.entries(achievementDefinitions)) {
            this.achievements.set(id, {
                ...definition,
                unlocked: this.playerProfile.achievements.includes(id),
                progress: 0
            });
        }
        
        // Загружаем прогресс достижений
        await this.loadAchievementProgress();
        
        console.log(`🎯 Загружено ${this.achievements.size} достижений`);
    }

    // @ANCHOR:METHOD_GETACHIEVEMENTDEFINITIONS
    // МЕТОД GETACHIEVEMENTDEFINITIONS
    getAchievementDefinitions() {
        return {
            'first_task': {
                name: 'Первые шаги',
                description: 'Выполните свою первую задачу',
                icon: '🎯',
                category: 'productivity',
                requirement: { type: 'tasks_completed', value: 1 },
                rewards: { xp: 50, coins: 25 }
            },
            'streak_master': {
                name: 'Мастер последовательности',
                description: 'Поддерживайте streak 7 дней подряд',
                icon: '🔥',
                category: 'consistency',
                requirement: { type: 'daily_streak', value: 7 },
                rewards: { xp: 200, coins: 100, energy: 50 }
            },
            'time_warrior': {
                name: 'Воин времени',
                description: 'Проведите 100 часов в фокусе',
                icon: '⏰',
                category: 'productivity',
                requirement: { type: 'time_focused', value: 360000 }, // 100 часов в секундах
                rewards: { xp: 500, coins: 250, reputation: 10 }
            },
            'early_riser': {
                name: 'Ранняя пташка',
                description: 'Начните работу до 7:00 утра 10 раз',
                icon: '🌅',
                category: 'consistency',
                requirement: { type: 'early_starts', value: 10 },
                rewards: { xp: 150, energy: 75 }
            },
            'perfectionist': {
                name: 'Перфекционист',
                description: 'Выполните 50 задач с оценкой 5 звезд',
                icon: '⭐',
                category: 'productivity',
                requirement: { type: 'perfect_tasks', value: 50 },
                rewards: { xp: 300, coins: 200, reputation: 15 }
            },
            'social_butterfly': {
                name: 'Социальная бабочка',
                description: 'Поделитесь результатами 25 раз',
                icon: '🦋',
                category: 'social',
                requirement: { type: 'shares', value: 25 },
                rewards: { xp: 100, reputation: 20 }
            }
        };
    }

    // @ANCHOR:METHOD_CHECKACHIEVEMENTS
    // МЕТОД CHECKACHIEVEMENTS
    async checkAchievements(eventType, data) {
        // @ANCHOR:METHOD_FOR
        // МЕТОД FOR
        for (const [id, achievement] of this.achievements) {
            if (achievement.unlocked) continue;
            
            let progress = this.calculateAchievementProgress(achievement, eventType, data);
            
            // @ANCHOR:METHOD_IF
            // МЕТОД IF
            if (progress >= achievement.requirement.value) {
                await this.unlockAchievement(id);
            } else {
                // Обновляем прогресс
                achievement.progress = progress;
                this.triggerEvent('achievement_progress', { id, progress, total: achievement.requirement.value });
            }
        }
    }

    // @ANCHOR:METHOD_CALCULATEACHIEVEMENTPROGRESS
    // МЕТОД CALCULATEACHIEVEMENTPROGRESS
    calculateAchievementProgress(achievement, eventType, data) {
        const reqType = achievement.requirement.type;
        
        // @ANCHOR:METHOD_SWITCH
        // МЕТОД SWITCH
        switch (reqType) {
            case 'tasks_completed':
                return this.playerProfile.statistics.totalTasksCompleted;
            case 'daily_streak':
                return this.playerProfile.statistics.currentStreak;
            case 'time_focused':
                return this.playerProfile.statistics.totalTimeSpent;
            case 'early_starts':
                return this.playerProfile.statistics.earlyStarts || 0;
            case 'perfect_tasks':
                return this.playerProfile.statistics.perfectTasks || 0;
            case 'shares':
                return this.playerProfile.statistics.sharesCount || 0;
            default:
                return 0;
        }
    }

    // @ANCHOR:METHOD_UNLOCKACHIEVEMENT
    // МЕТОД UNLOCKACHIEVEMENT
    async unlockAchievement(achievementId) {
        const achievement = this.achievements.get(achievementId);
        if (!achievement || achievement.unlocked) return;
        
        // Отмечаем как разблокированное
        achievement.unlocked = true;
        this.playerProfile.achievements.push(achievementId);
        this.playerProfile.statistics.achievementsUnlocked++;
        
        // Выдаем награды
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (achievement.rewards.xp) {
            await this.addExperience(achievement.rewards.xp, `achievement: ${achievement.name}`);
        }
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (achievement.rewards.coins) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, achievement.rewards.coins);
        }
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (achievement.rewards.energy) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.ENERGY_POINTS, achievement.rewards.energy);
        }
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (achievement.rewards.reputation) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.REPUTATION, achievement.rewards.reputation);
        }
        
        // Уведомление
        this.showAchievementNotification(achievement);
        
        console.log(`🏆 ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО: ${achievement.name}`);
        
        this.triggerEvent('achievement_unlocked', { id: achievementId, achievement });
        await this.savePlayerProfile();
    }

    // Система ежедневных вызовов
    // @ANCHOR:METHOD_LOADDAILYCHALLENGES
    // МЕТОД LOADDAILYCHALLENGES
    async loadDailyChallenges() {
        console.log('📅 Загрузка ежедневных вызовов...');
        
        const today = new Date().toDateString();
        const savedChallenges = await this.storage.get('daily_challenges');
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (savedChallenges && savedChallenges.date === today) {
            this.challenges = new Map(Object.entries(savedChallenges.challenges));
        } else {
            await this.generateDailyChallenges();
        }
        
        console.log(`🎯 Загружено ${this.challenges.size} ежедневных вызовов`);
    }

    // @ANCHOR:METHOD_GENERATEDAILYCHALLENGES
    // МЕТОД GENERATEDAILYCHALLENGES
    async generateDailyChallenges() {
        const challengeTemplates = [
            {
                id: 'complete_tasks',
                name: 'Продуктивный день',
                description: 'Выполните {target} задач',
                target: () => Math.floor(Math.random() * 5) + 3,
                reward: { xp: 100, coins: 50 },
                type: 'tasks_completed'
            },
            {
                id: 'focus_time',
                name: 'Мастер концентрации',
                description: 'Проведите {target} минут в фокусе',
                target: () => (Math.floor(Math.random() * 4) + 2) * 30,
                reward: { xp: 150, energy: 25 },
                type: 'time_focused'
            },
            {
                id: 'early_start',
                name: 'Ранняя пташка',
                description: 'Начните работу до 8:00',
                target: () => 1,
                reward: { xp: 75, coins: 30 },
                type: 'early_start'
            }
        ];
        
        this.challenges.clear();
        
        // Генерируем 3 случайных вызова
        const selectedTemplates = this.shuffleArray(challengeTemplates).slice(0, 3);
        
        selectedTemplates.forEach((template, index) => {
            const target = template.target();
            const challenge = {
                id: `daily_${index}`,
                name: template.name,
                description: template.description.replace('{target}', target),
                target: target,
                progress: 0,
                completed: false,
                reward: template.reward,
                type: template.type
            };
            
            this.challenges.set(challenge.id, challenge);
        });
        
        await this.saveDailyChallenges();
        console.log('🆕 Созданы новые ежедневные вызовы');
    }

    // @ANCHOR:METHOD_SAVEDAILYCHALLENGES
    // МЕТОД SAVEDAILYCHALLENGES
    async saveDailyChallenges() {
        const today = new Date().toDateString();
        const challengesData = {
            date: today,
            challenges: Object.fromEntries(this.challenges)
        };
        
        await this.storage.set('daily_challenges', challengesData);
    }

    // Обновление прогресса вызовов
    // @ANCHOR:METHOD_UPDATECHALLENGEPROGRESS
    // МЕТОД UPDATECHALLENGEPROGRESS
    async updateChallengeProgress(eventType, data) {
        // @ANCHOR:METHOD_FOR
        // МЕТОД FOR
        for (const [id, challenge] of this.challenges) {
            if (challenge.completed) continue;
            
            let progress = this.calculateChallengeProgress(challenge, eventType, data);
            challenge.progress = Math.min(progress, challenge.target);
            
            // @ANCHOR:METHOD_IF
            // МЕТОД IF
            if (challenge.progress >= challenge.target && !challenge.completed) {
                await this.completeChallenge(id);
            }
        }
        
        await this.saveDailyChallenges();
    }

    // @ANCHOR:METHOD_CALCULATECHALLENGEPROGRESS
    // МЕТОД CALCULATECHALLENGEPROGRESS
    calculateChallengeProgress(challenge, eventType, data) {
        // @ANCHOR:METHOD_SWITCH
        // МЕТОД SWITCH
        switch (challenge.type) {
            case 'tasks_completed':
                return this.playerProfile.statistics.totalTasksCompleted;
            case 'time_focused':
                return Math.floor(this.playerProfile.statistics.totalTimeSpent / 60); // в минутах
            case 'early_start':
                return (this.playerProfile.statistics.earlyStarts || 0) > 0 ? 1 : 0;
            default:
                return challenge.progress;
        }
    }

    // @ANCHOR:METHOD_COMPLETECHALLENGE
    // МЕТОД COMPLETECHALLENGE
    async completeChallenge(challengeId) {
        const challenge = this.challenges.get(challengeId);
        if (!challenge || challenge.completed) return;
        
        challenge.completed = true;
        this.playerProfile.statistics.challengesCompleted++;
        
        // Выдаем награды
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (challenge.reward.xp) {
            await this.addExperience(challenge.reward.xp, `challenge: ${challenge.name}`);
        }
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (challenge.reward.coins) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, challenge.reward.coins);
        }
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (challenge.reward.energy) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.ENERGY_POINTS, challenge.reward.energy);
        }
        
        console.log(`✅ ВЫЗОВ ВЫПОЛНЕН: ${challenge.name}`);
        
        this.triggerEvent('challenge_completed', { id: challengeId, challenge });
        await this.savePlayerProfile();
        
        // Проверяем, выполнены ли все вызовы дня
        const allCompleted = Array.from(this.challenges.values()).every(c => c.completed);
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (allCompleted) {
            await this.handleAllChallengesCompleted();
        }
    }

    // @ANCHOR:METHOD_HANDLEALLCHALLENGESCOMPLETED
    // МЕТОД HANDLEALLCHALLENGESCOMPLETED
    async handleAllChallengesCompleted() {
        console.log('🎉 ВСЕ ЕЖЕДНЕВНЫЕ ВЫЗОВЫ ВЫПОЛНЕНЫ!');
        
        // Бонусная награда
        await this.addExperience(100, 'all daily challenges completed');
        await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, 100);
        
        this.triggerEvent('all_challenges_completed');
    }

    // Утилиты
    // @ANCHOR:METHOD_SHUFFLEARRAY
    // МЕТОД SHUFFLEARRAY
    shuffleArray(array) {
        const shuffled = [...array];
        // @ANCHOR:METHOD_FOR
        // МЕТОД FOR
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // @ANCHOR:METHOD_GENERATEPLAYERID
    // МЕТОД GENERATEPLAYERID
    generatePlayerId() {
        return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // @ANCHOR:METHOD_CHECKDAILYACTIVITY
    // МЕТОД CHECKDAILYACTIVITY
    async checkDailyActivity() {
        const lastActive = new Date(this.playerProfile.lastActive);
        const today = new Date();
        const daysDiff = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (daysDiff >= 1) {
            // Проверяем streak
            // @ANCHOR:METHOD_IF
            // МЕТОД IF
            if (daysDiff === 1) {
                this.playerProfile.statistics.currentStreak++;
                // @ANCHOR:METHOD_IF
                // МЕТОД IF
                if (this.playerProfile.statistics.currentStreak > this.playerProfile.statistics.maxStreak) {
                    this.playerProfile.statistics.maxStreak = this.playerProfile.statistics.currentStreak;
                }
            } else {
                this.playerProfile.statistics.currentStreak = 1;
            }
            
            // Ежедневный бонус
            await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, GAME_CONFIG.DAILY_BONUS);
            
            this.playerProfile.lastActive = today.toISOString();
            await this.savePlayerProfile();
        }
    }

    // Система событий
    // @ANCHOR:METHOD_SETUPEVENTHANDLERS
    // МЕТОД SETUPEVENTHANDLERS
    setupEventHandlers() {
        this.core.on('task_completed', (data) => {
            this.handleTaskCompleted(data);
        });
        
        this.core.on('focus_session_ended', (data) => {
            this.handleFocusSession(data);
        });
        
        this.core.on('app_started', (data) => {
            this.handleAppStart(data);
        });
    }

    // @ANCHOR:METHOD_HANDLETASKCOMPLETED
    // МЕТОД HANDLETASKCOMPLETED
    async handleTaskCompleted(data) {
        this.playerProfile.statistics.totalTasksCompleted++;
        
        // Базовый опыт за задачу
        let xp = 25;
        
        // Бонус за качество
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (data.rating === 5) {
            xp += 15;
            this.playerProfile.statistics.perfectTasks = (this.playerProfile.statistics.perfectTasks || 0) + 1;
        }
        
        // Бонус за streak
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (this.playerProfile.statistics.currentStreak > 1) {
            xp += Math.floor(xp * 0.1 * this.playerProfile.statistics.currentStreak);
        }
        
        await this.addExperience(xp, 'task completed');
        await this.checkAchievements('task_completed', data);
        await this.updateChallengeProgress('task_completed', data);
    }

    // @ANCHOR:METHOD_HANDLEFOCUSSESSION
    // МЕТОД HANDLEFOCUSSESSION
    async handleFocusSession(data) {
        const timeSpent = data.duration; // в секундах
        this.playerProfile.statistics.totalTimeSpent += timeSpent;
        
        // Опыт за время в фокусе (1 XP за минуту)
        const xp = Math.floor(timeSpent / 60);
        
        await this.addExperience(xp, 'focus session');
        await this.checkAchievements('focus_session', data);
        await this.updateChallengeProgress('focus_session', data);
    }

    // @ANCHOR:METHOD_HANDLEAPPSTART
    // МЕТОД HANDLEAPPSTART
    async handleAppStart(data) {
        const hour = new Date().getHours();
        
        // @ANCHOR:METHOD_IF
        // МЕТОД IF
        if (hour < 8) {
            this.playerProfile.statistics.earlyStarts = (this.playerProfile.statistics.earlyStarts || 0) + 1;
            await this.checkAchievements('early_start', data);
            await this.updateChallengeProgress('early_start', data);
        }
    }

    // UI и уведомления
    // @ANCHOR:METHOD_SHOWLEVELUPNOTIFICATION
    // МЕТОД SHOWLEVELUPNOTIFICATION
    showLevelUpNotification(oldLevel, newLevel, rewards) {
        // В реальном приложении здесь был бы UI
        console.log(`
🎉 ПОЗДРАВЛЯЕМ! НОВЫЙ УРОВЕНЬ!
═══════════════════════════════
Уровень: ${oldLevel} → ${newLevel}
Награды:
💰 +${rewards.coins} HEYS Coins
⚡ +${rewards.energy} Energy Points
        `);
    }

    // @ANCHOR:METHOD_SHOWACHIEVEMENTNOTIFICATION
    // МЕТОД SHOWACHIEVEMENTNOTIFICATION
    showAchievementNotification(achievement) {
        console.log(`
🏆 ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО!
═══════════════════════════════
${achievement.icon} ${achievement.name}
${achievement.description}
        `);
    }

    // @ANCHOR:METHOD_STARTBACKGROUNDPROCESSES
    // МЕТОД STARTBACKGROUNDPROCESSES
    startBackgroundProcesses() {
        // Сохранение профиля каждые 5 минут
        setInterval(() => {
            this.savePlayerProfile();
        }, 5 * 60 * 1000);
        
        // Проверка полуночи для новых вызовов
        setInterval(() => {
            this.checkMidnight();
        }, 60 * 1000);
    }

    // @ANCHOR:METHOD_CHECKMIDNIGHT
    // МЕТОД CHECKMIDNIGHT
    async checkMidnight() {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            await this.generateDailyChallenges();
        }
    }

    // @ANCHOR:METHOD_TRIGGEREVENT
    // МЕТОД TRIGGEREVENT
    triggerEvent(eventName, data = null) {
        if (this.eventListeners.has(eventName)) {
            this.eventListeners.get(eventName).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${eventName}:`, error);
                }
            });
        }
    }

    // @ANCHOR:METHOD_ON
    // МЕТОД ON
    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(callback);
    }

    // @ANCHOR:METHOD_OFF
    // МЕТОД OFF
    off(eventName, callback) {
        if (this.eventListeners.has(eventName)) {
            const listeners = this.eventListeners.get(eventName);
            const index = listeners.indexOf(callback);
            // @ANCHOR:METHOD_IF
            // МЕТОД IF
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    // Геттеры для UI
    // @ANCHOR:METHOD_GETPLAYERPROFILE
    // МЕТОД GETPLAYERPROFILE
    getPlayerProfile() {
        return { ...this.playerProfile };
    }

    // @ANCHOR:METHOD_GETACHIEVEMENTS
    // МЕТОД GETACHIEVEMENTS
    getAchievements() {
        return Array.from(this.achievements.entries()).map(([id, achievement]) => ({
            id,
            ...achievement
        }));
    }

    // @ANCHOR:METHOD_GETDAILYCHALLENGES
    // МЕТОД GETDAILYCHALLENGES
    getDailyChallenges() {
        return Array.from(this.challenges.entries()).map(([id, challenge]) => ({
            id,
            ...challenge
        }));
    }

    // @ANCHOR:METHOD_GETLEADERBOARD
    // МЕТОД GETLEADERBOARD
    getLeaderboard(type = 'level') {
        // В реальном приложении здесь был бы запрос к серверу
        return [];
    }
}

// Экспорт модуля
export default HEYSGamingSystem;
