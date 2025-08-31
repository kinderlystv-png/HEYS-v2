/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_gaming_system_v1.js (871 строка)                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 📄 ЗАГОЛОВОК И ИМПОРТЫ (строки 1-50):                                                    │
│    ├── Описание модуля (1-15)                                                           │
│    ├── Импорты зависимостей (17-20)                                                     │
│    ├── GAME_CONFIG константы (22-33)                                                    │
│    └── ACHIEVEMENT_TYPES (35-45)                                                        │
│                                                                                           │
│ 🎮 ОСНОВНОЙ КЛАСС HEYSGamingSystem (строки 51-180):                                      │
│    ├── constructor() - инициализация (51-80)                                            │
│    ├── Игровые данные и состояние (81-100)                                              │
│    ├── initialize() - настройка системы (101-130)                                       │
│    ├── loadPlayerData() - загрузка профиля (131-150)                                    │
│    └── savePlayerData() - сохранение (151-180)                                          │
│                                                                                           │
│ 🏆 СИСТЕМА ДОСТИЖЕНИЙ (строки 181-350):                                                  │
│    ├── Achievement class (181-220)                                                      │
│    ├── createAchievement() - создание (221-250)                                         │
│    ├── checkAchievements() - проверка (251-290)                                         │
│    ├── unlockAchievement() - разблокировка (291-320)                                    │
│    └── getPlayerAchievements() - получение (321-350)                                    │
│                                                                                           │
│ 📈 СИСТЕМА УРОВНЕЙ И ОПЫТА (строки 351-500):                                             │
│    ├── addExperience() - добавление опыта (351-380)                                     │
│    ├── calculateLevel() - расчет уровня (381-410)                                       │
│    ├── getXPForLevel() - XP для уровня (411-430)                                        │
│    ├── levelUp() - повышение уровня (431-460)                                           │
│    └── getPlayerLevel() - текущий уровень (461-500)                                     │
│                                                                                           │
│ 🎯 СИСТЕМА ЧЕЛЛЕНДЖЕЙ (строки 501-650):                                                  │
│    ├── DailyChallenge class (501-540)                                                   │
│    ├── generateDailyChallenges() - генерация (541-580)                                  │
│    ├── completeDailyChallenge() - завершение (581-610)                                  │
│    └── getActiveChallenges() - активные (611-650)                                       │
│                                                                                           │
│ 💰 ЭКОНОМИЧЕСКАЯ СИСТЕМА (строки 651-750):                                               │
│    ├── addCurrency() - добавление валюты (651-680)                                      │
│    ├── spendCurrency() - трата валюты (681-710)                                         │
│    ├── getCurrencyBalance() - баланс (711-730)                                          │
│    └── Shop class - магазин (731-750)                                                   │
│                                                                                           │
│ 📊 АНАЛИТИКА И ЭКСПОРТ (строки 751-812):                                                 │
│    ├── getGameStats() - игровая статистика (751-780)                                    │
│    ├── generateLeaderboard() - таблица лидеров (781-800)                                │
│    └── HEYS.GamingSystem экспорт (801-812)                                              │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Класс: HEYSGamingSystem (51), initialize() (101)                                  │
│    • Достижения: Achievement (181), unlockAchievement() (291)                          │
│    • Уровни: addExperience() (351), levelUp() (431)                                    │
│    • Челленджи: DailyChallenge (501), completeDailyChallenge() (581)                   │
│    • Экономика: addCurrency() (651), Shop (731)                                        │
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
    async loadPlayerProfile() {
        console.log('👤 Загрузка профиля игрока...');
        
        try {
            const savedProfile = await this.storage.get('player_profile');
            
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
    async addExperience(amount, reason = 'general') {
        if (!this.playerProfile || amount <= 0) return;
        
        const oldLevel = this.playerProfile.level;
        const oldXP = this.playerProfile.experience;
        
        // Добавляем опыт
        this.playerProfile.experience += amount;
        
        // Пересчитываем уровень
        const newLevel = HEYSGamingSystem.ExperienceSystem.calculateLevel(this.playerProfile.experience);
        
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
    async addCurrency(type, amount) {
        if (!this.playerProfile || amount <= 0) return;
        
        if (!this.playerProfile.currencies[type]) {
            this.playerProfile.currencies[type] = 0;
        }
        
        this.playerProfile.currencies[type] += amount;
        
        console.log(`💰 +${amount} ${type}. Итого: ${this.playerProfile.currencies[type]}`);
        
        this.triggerEvent('currency_added', { type, amount, total: this.playerProfile.currencies[type] });
        await this.savePlayerProfile();
    }

    async spendCurrency(type, amount) {
        if (!this.playerProfile || amount <= 0) return false;
        
        const currentAmount = this.playerProfile.currencies[type] || 0;
        
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

    async checkAchievements(eventType, data) {
        for (const [id, achievement] of this.achievements) {
            if (achievement.unlocked) continue;
            
            let progress = this.calculateAchievementProgress(achievement, eventType, data);
            
            if (progress >= achievement.requirement.value) {
                await this.unlockAchievement(id);
            } else {
                // Обновляем прогресс
                achievement.progress = progress;
                this.triggerEvent('achievement_progress', { id, progress, total: achievement.requirement.value });
            }
        }
    }

    calculateAchievementProgress(achievement, eventType, data) {
        const reqType = achievement.requirement.type;
        
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

    async unlockAchievement(achievementId) {
        const achievement = this.achievements.get(achievementId);
        if (!achievement || achievement.unlocked) return;
        
        // Отмечаем как разблокированное
        achievement.unlocked = true;
        this.playerProfile.achievements.push(achievementId);
        this.playerProfile.statistics.achievementsUnlocked++;
        
        // Выдаем награды
        if (achievement.rewards.xp) {
            await this.addExperience(achievement.rewards.xp, `achievement: ${achievement.name}`);
        }
        
        if (achievement.rewards.coins) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, achievement.rewards.coins);
        }
        
        if (achievement.rewards.energy) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.ENERGY_POINTS, achievement.rewards.energy);
        }
        
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
    async loadDailyChallenges() {
        console.log('📅 Загрузка ежедневных вызовов...');
        
        const today = new Date().toDateString();
        const savedChallenges = await this.storage.get('daily_challenges');
        
        if (savedChallenges && savedChallenges.date === today) {
            this.challenges = new Map(Object.entries(savedChallenges.challenges));
        } else {
            await this.generateDailyChallenges();
        }
        
        console.log(`🎯 Загружено ${this.challenges.size} ежедневных вызовов`);
    }

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

    async saveDailyChallenges() {
        const today = new Date().toDateString();
        const challengesData = {
            date: today,
            challenges: Object.fromEntries(this.challenges)
        };
        
        await this.storage.set('daily_challenges', challengesData);
    }

    // Обновление прогресса вызовов
    async updateChallengeProgress(eventType, data) {
        for (const [id, challenge] of this.challenges) {
            if (challenge.completed) continue;
            
            let progress = this.calculateChallengeProgress(challenge, eventType, data);
            challenge.progress = Math.min(progress, challenge.target);
            
            if (challenge.progress >= challenge.target && !challenge.completed) {
                await this.completeChallenge(id);
            }
        }
        
        await this.saveDailyChallenges();
    }

    calculateChallengeProgress(challenge, eventType, data) {
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

    async completeChallenge(challengeId) {
        const challenge = this.challenges.get(challengeId);
        if (!challenge || challenge.completed) return;
        
        challenge.completed = true;
        this.playerProfile.statistics.challengesCompleted++;
        
        // Выдаем награды
        if (challenge.reward.xp) {
            await this.addExperience(challenge.reward.xp, `challenge: ${challenge.name}`);
        }
        
        if (challenge.reward.coins) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, challenge.reward.coins);
        }
        
        if (challenge.reward.energy) {
            await this.addCurrency(GAME_CONFIG.CURRENCIES.ENERGY_POINTS, challenge.reward.energy);
        }
        
        console.log(`✅ ВЫЗОВ ВЫПОЛНЕН: ${challenge.name}`);
        
        this.triggerEvent('challenge_completed', { id: challengeId, challenge });
        await this.savePlayerProfile();
        
        // Проверяем, выполнены ли все вызовы дня
        const allCompleted = Array.from(this.challenges.values()).every(c => c.completed);
        if (allCompleted) {
            await this.handleAllChallengesCompleted();
        }
    }

    async handleAllChallengesCompleted() {
        console.log('🎉 ВСЕ ЕЖЕДНЕВНЫЕ ВЫЗОВЫ ВЫПОЛНЕНЫ!');
        
        // Бонусная награда
        await this.addExperience(100, 'all daily challenges completed');
        await this.addCurrency(GAME_CONFIG.CURRENCIES.HEYS_COINS, 100);
        
        this.triggerEvent('all_challenges_completed');
    }

    // Утилиты
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    generatePlayerId() {
        return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async checkDailyActivity() {
        const lastActive = new Date(this.playerProfile.lastActive);
        const today = new Date();
        const daysDiff = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));
        
        if (daysDiff >= 1) {
            // Проверяем streak
            if (daysDiff === 1) {
                this.playerProfile.statistics.currentStreak++;
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

    async handleTaskCompleted(data) {
        this.playerProfile.statistics.totalTasksCompleted++;
        
        // Базовый опыт за задачу
        let xp = 25;
        
        // Бонус за качество
        if (data.rating === 5) {
            xp += 15;
            this.playerProfile.statistics.perfectTasks = (this.playerProfile.statistics.perfectTasks || 0) + 1;
        }
        
        // Бонус за streak
        if (this.playerProfile.statistics.currentStreak > 1) {
            xp += Math.floor(xp * 0.1 * this.playerProfile.statistics.currentStreak);
        }
        
        await this.addExperience(xp, 'task completed');
        await this.checkAchievements('task_completed', data);
        await this.updateChallengeProgress('task_completed', data);
    }

    async handleFocusSession(data) {
        const timeSpent = data.duration; // в секундах
        this.playerProfile.statistics.totalTimeSpent += timeSpent;
        
        // Опыт за время в фокусе (1 XP за минуту)
        const xp = Math.floor(timeSpent / 60);
        
        await this.addExperience(xp, 'focus session');
        await this.checkAchievements('focus_session', data);
        await this.updateChallengeProgress('focus_session', data);
    }

    async handleAppStart(data) {
        const hour = new Date().getHours();
        
        if (hour < 8) {
            this.playerProfile.statistics.earlyStarts = (this.playerProfile.statistics.earlyStarts || 0) + 1;
            await this.checkAchievements('early_start', data);
            await this.updateChallengeProgress('early_start', data);
        }
    }

    // UI и уведомления
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

    showAchievementNotification(achievement) {
        console.log(`
🏆 ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО!
═══════════════════════════════
${achievement.icon} ${achievement.name}
${achievement.description}
        `);
    }

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

    async checkMidnight() {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            await this.generateDailyChallenges();
        }
    }

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

    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(callback);
    }

    off(eventName, callback) {
        if (this.eventListeners.has(eventName)) {
            const listeners = this.eventListeners.get(eventName);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    // Геттеры для UI
    getPlayerProfile() {
        return { ...this.playerProfile };
    }

    getAchievements() {
        return Array.from(this.achievements.entries()).map(([id, achievement]) => ({
            id,
            ...achievement
        }));
    }

    getDailyChallenges() {
        return Array.from(this.challenges.entries()).map(([id, challenge]) => ({
            id,
            ...challenge
        }));
    }

    getLeaderboard(type = 'level') {
        // В реальном приложении здесь был бы запрос к серверу
        return [];
    }
}

// Экспорт модуля
export default HEYSGamingSystem;
