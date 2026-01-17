// heys_app_client_helpers_v1.js — Client UI helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    // Цветные аватары по первой букве имени
    const AVATAR_COLORS = [
        'linear-gradient(135deg, #4285f4 0%, #2563eb 100%)', // А, К, Ф — фиолетовый
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

    const getClientInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

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
                    } catch (e) { }
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

    HEYS.AppClientHelpers = {
        AVATAR_COLORS,
        getClientInitials,
        getAvatarColor,
        getClientStats,
        formatLastActive,
    };
})();
