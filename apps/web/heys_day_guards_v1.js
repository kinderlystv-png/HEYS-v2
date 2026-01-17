// heys_day_guards_v1.js — DayTab guard screens (logout/loading)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function renderGuardScreen({ React, message }) {
        return React.createElement('div', {
            className: 'flex items-center justify-center h-screen bg-[var(--bg-primary)]'
        }, message);
    }

    function getLogoutScreen({ React, HEYSRef }) {
        if (HEYSRef?._isLoggingOut) {
            return renderGuardScreen({ React, message: 'Выход...' });
        }
        return null;
    }

    function getPropsGuardScreen({ React, props }) {
        if (!props || props._isLoggingOut) {
            return renderGuardScreen({ React, message: 'Загрузка...' });
        }
        return null;
    }

    function getMissingDayScreen({ React, day }) {
        if (!day) {
            return renderGuardScreen({ React, message: 'Загрузка...' });
        }
        return null;
    }

    HEYS.dayGuards = {
        renderGuardScreen,
        getLogoutScreen,
        getPropsGuardScreen,
        getMissingDayScreen
    };
})(window);
