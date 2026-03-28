// heys_leaderboard_section_v1.js — Reusable leaderboard/competitions section (v1.1.0)
// Extracted from heys_app_shell_v1.js for reuse in client + curator dropdowns.

(function () {
    'use strict';

    var HEYS = window.HEYS = window.HEYS || {};
    var React = window.React;
    if (!React) return;

    // ── Visual constants ──────────────────────────────────

    var MEDAL_STYLES = {
        1: { background: 'linear-gradient(135deg, #ffd700, #ffb300)', color: '#7a5c00', boxShadow: '0 1px 3px rgba(255,183,0,0.4)' },
        2: { background: 'linear-gradient(135deg, #e0e0e0, #b0b0b0)', color: '#555', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
        3: { background: 'linear-gradient(135deg, #cd7f32, #a0522d)', color: '#fff', boxShadow: '0 1px 3px rgba(160,82,45,0.4)' },
    };

    var DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    // ── Helpers ───────────────────────────────────────────

    function getCEBToneStyle(score) {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            if (score >= 8.0) return { background: 'rgba(21, 128, 61, 0.38)', color: '#86efac' };
            if (score >= 6.0) return { background: 'rgba(146, 64, 14, 0.38)', color: '#fcd34d' };
            return { background: 'rgba(153, 27, 27, 0.38)', color: '#fca5a5' };
        }
        if (score >= 8.0) return { background: '#dcfce7', color: '#166534' };
        if (score >= 6.0) return { background: '#fef3c7', color: '#92400e' };
        return { background: '#fee2e2', color: '#991b1b' };
    }

    function getClientCEB(clientId, dateStr, options) {
        try {
            return window.HEYS?.CascadeCard?.resolveCEBForDate?.(dateStr, clientId, {
                isCurrent: !!(options && options.isCurrent),
                silent: true
            }) || null;
        } catch (e) {
            return null;
        }
    }

    function formatISODate(date) {
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function tryParseStoredValue(raw, fallback) {
        if (raw === null || raw === undefined) return fallback;
        if (typeof raw === 'string') {
            var str = raw;
            if (str.startsWith('¤Z¤') && HEYS.store && typeof HEYS.store.decompress === 'function') {
                try { str = HEYS.store.decompress(str); } catch (_) { str = raw; }
            }
            try { return JSON.parse(str); } catch (_) { return str; }
        }
        return raw;
    }

    function buildFullWeekDates(anchorDateStr) {
        var base = anchorDateStr ? new Date(anchorDateStr + 'T12:00:00') : new Date();
        if (Number.isNaN(base.getTime())) base = new Date();
        var dow = base.getDay();
        var isoDay = dow === 0 ? 7 : dow;
        var monday = new Date(base);
        monday.setDate(monday.getDate() - (isoDay - 1));

        var dates = [];
        for (var i = 0; i < 7; i++) {
            var current = new Date(monday);
            current.setDate(monday.getDate() + i);
            dates.push(formatISODate(current));
        }
        return dates;
    }

    function normalizeWeekDates(weekDates, fallbackDateStr) {
        if (Array.isArray(weekDates) && weekDates.length > 0) {
            return buildFullWeekDates(weekDates[0]);
        }
        return buildFullWeekDates(fallbackDateStr);
    }

    function shiftISODate(dateStr, delta) {
        if (!dateStr) return '';
        var base = new Date(dateStr + 'T12:00:00');
        if (Number.isNaN(base.getTime())) return '';
        base.setDate(base.getDate() + Number(delta || 0));
        return formatISODate(base);
    }

    function getCompetitionRowUpdatedAtMs(row) {
        var raw = row && (row.updated_at || row.updatedAt);
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        if (typeof raw === 'string') {
            var parsed = Date.parse(raw);
            return Number.isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }

    function normalizeCompetitionCEBPayload(raw) {
        var parsed = tryParseStoredValue(raw, null);
        if (!parsed || typeof parsed !== 'object') return null;

        var score = Number(parsed.s);
        if (!Number.isFinite(score)) return null;

        var confidence = Number(parsed.c);
        return {
            score: Math.round(score * 10) / 10,
            confidence: Number.isFinite(confidence) ? confidence : 1,
            raw: parsed
        };
    }

    function extractCompetitionDataFromKVRows(rows) {
        var daysByDate = {};
        var dayUpdatedAtByDate = {};
        var cebByDate = {};
        var profile = null;
        var list = Array.isArray(rows) ? rows.slice() : [];

        list.sort(function (a, b) {
            return getCompetitionRowUpdatedAtMs(a) - getCompetitionRowUpdatedAtMs(b);
        });

        for (var i = 0; i < list.length; i++) {
            var row = list[i] || {};
            var key = String(row.k || row.key || '');
            if (!key) continue;

            if (key === 'heys_profile' || /(^heys_[a-f0-9-]+_profile$)/i.test(key)) {
                profile = tryParseStoredValue(row.v, {}) || {};
                continue;
            }

            var cebMatch = key.match(/(?:^heys_[a-f0-9-]+_ceb_d_|^heys_ceb_d_)(\d{4}-\d{2}-\d{2})$/i);
            if (cebMatch) {
                var cebDateStr = cebMatch[1];
                var parsedCeb = normalizeCompetitionCEBPayload(row.v);
                if (parsedCeb) {
                    parsedCeb.updatedAt = getCompetitionRowUpdatedAtMs(row);
                    cebByDate[cebDateStr] = parsedCeb;
                }
                continue;
            }

            var dayMatch = key.match(/(?:^heys_[a-f0-9-]+_dayv2_|^heys_dayv2_)(\d{4}-\d{2}-\d{2})$/i);
            if (!dayMatch) continue;

            var dateStr = dayMatch[1];
            var parsedDay = tryParseStoredValue(row.v, null);
            if (parsedDay) {
                daysByDate[dateStr] = parsedDay;
                dayUpdatedAtByDate[dateStr] = getCompetitionRowUpdatedAtMs(row);
            }
        }

        return {
            daysByDate: daysByDate,
            dayUpdatedAtByDate: dayUpdatedAtByDate,
            cebByDate: cebByDate,
            profile: profile || {}
        };
    }

    function formatCompetitionName(name) {
        var fullName = String(name || '').trim();
        if (!fullName) return 'Участник';
        if (fullName.length <= 10) return fullName;

        var parts = fullName.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            var firstName = parts[0];
            var lastInitial = parts[1] ? parts[1].charAt(0).toUpperCase() + '.' : '';
            if (firstName.length <= 8) return firstName + ' ' + lastInitial;
        }

        return fullName.slice(0, 8) + '…';
    }

    function getClientCEBFromCompetitionData(clientId, dateStr, competitionData, options) {
        var cached = competitionData || {};
        var daysByDate = cached.daysByDate || {};
        var cachedCebByDate = cached.cebByDate || {};
        var cachedCeb = cachedCebByDate[dateStr] || null;
        var day = daysByDate[dateStr];
        var dayHasMeals = !!(day && Array.isArray(day.meals) && day.meals.length > 0);
        var dayUpdatedAt = Number((cached.dayUpdatedAtByDate || {})[dateStr]) || 0;
        var cachedCebUpdatedAt = cachedCeb ? (Number(cachedCeb.updatedAt) || 0) : 0;

        if (cachedCeb && (!dayHasMeals || !dayUpdatedAt || (cachedCebUpdatedAt && cachedCebUpdatedAt >= dayUpdatedAt))) {
            return {
                score: cachedCeb.score,
                confidence: cachedCeb.confidence,
                raw: cachedCeb.raw
            };
        }

        if (!day) {
            if (!cachedCeb) return null;
            return {
                score: cachedCeb.score,
                confidence: cachedCeb.confidence,
                raw: cachedCeb.raw
            };
        }

        var prevDays = [];
        for (var i = 1; i <= 14; i++) {
            prevDays.push(daysByDate[shiftISODate(dateStr, -i)] || null);
        }

        try {
            var resolved = window.HEYS?.CascadeCard?.resolveCEBForDate?.(dateStr, clientId, {
                day: day,
                profile: cached.profile || {},
                prevDays: prevDays,
                mealBandShift: 0,
                includeLiveCurrent: !!(options && options.isCurrent),
                isCurrent: !!(options && options.isCurrent),
                silent: true
            }) || null;

            if (resolved) return resolved;
        } catch (e) {
        }

        if (cachedCeb) {
            return {
                score: cachedCeb.score,
                confidence: cachedCeb.confidence,
                raw: cachedCeb.raw
            };
        }

        return null;
    }

    // ── Render ────────────────────────────────────────────

    function renderLeaderboardShell(bodyNode, weekDates, options) {
        var summaryLabel = '★';
        var metricSubtitle = weekDates.length > 1 ? 'Ежедневные оценки + сумма за неделю' : 'Оценка за выбранный день';

        return React.createElement('div', {
            key: 'leaderboard',
            className: 'client-dropdown-leaderboard-shell',
            'aria-busy': options && options.isLoading ? 'true' : undefined
        },
            React.createElement('div', {
                className: 'client-dropdown-divider'
            }),
            React.createElement('div', {
                className: 'client-dropdown-leaderboard' + ((options && options.isLoading) ? ' is-loading' : '')
            },
                React.createElement('div', {
                    className: 'client-dropdown-leaderboard__section-header'
                },
                    React.createElement('div', {
                        className: 'client-dropdown-leaderboard__eyebrow'
                    }, '🏆 СОСТЯЗАНИЯ'),
                    React.createElement('div', {
                        className: 'client-dropdown-leaderboard__subtitle'
                    }, 'Соревнования по разным метрикам')
                ),
                React.createElement('div', {
                    className: 'client-dropdown-competition-card'
                },
                    React.createElement('div', {
                        className: 'client-dropdown-competition-card__header'
                    },
                        React.createElement('div', {
                            className: 'client-dropdown-competition-card__badge'
                        }, 'Каскад дня'),
                        React.createElement('div', {
                            className: 'client-dropdown-competition-card__meta'
                        }, metricSubtitle)
                    ),
                    React.createElement('div', {
                        className: 'client-dropdown-leaderboard__content' + ((options && options.isLoading) ? ' is-loading' : '')
                    }, bodyNode)
                )
            )
        );
    }

    function renderSkeletonChip(className, style) {
        return React.createElement('span', {
            className: 'client-dropdown-leaderboard__skeleton-chip ' + className,
            style: style || undefined,
            'aria-hidden': 'true'
        });
    }

    function renderLeaderboardSkeleton(weekDates) {
        var safeWeekDates = Array.isArray(weekDates) && weekDates.length > 0
            ? weekDates
            : buildFullWeekDates();
        var headerCells = [
            React.createElement('div', { key: 'h-rank', className: 'client-dropdown-leaderboard__head-rank' },
                renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--header-rank')),
            React.createElement('div', { key: 'h-name', className: 'client-dropdown-leaderboard__head-name' },
                renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--header-name'))
        ];

        for (var di = 0; di < safeWeekDates.length; di++) {
            headerCells.push(
                React.createElement('div', {
                    key: 'h-d' + di,
                    className: 'client-dropdown-leaderboard__head-day'
                }, renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--header-day'))
            );
        }

        headerCells.push(
            React.createElement('div', {
                key: 'h-avg',
                className: 'client-dropdown-leaderboard__head-balance'
            }, renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--header-avg'))
        );

        var nameWidths = ['72%', '58%', '66%'];
        var rows = [];
        for (var ri = 0; ri < 3; ri++) {
            var rowCells = [
                React.createElement('div', {
                    key: 'r-rank',
                    className: 'client-dropdown-leaderboard__rank-badge client-dropdown-leaderboard__rank-badge--skeleton'
                }, renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--rank')),
                React.createElement('div', {
                    key: 'r-name',
                    className: 'client-dropdown-leaderboard__name'
                }, renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--name', {
                    width: nameWidths[ri % nameWidths.length]
                }))
            ];

            for (var wi = 0; wi < safeWeekDates.length; wi++) {
                rowCells.push(
                    React.createElement('div', {
                        key: 'r-d' + wi,
                        className: 'client-dropdown-leaderboard__day-score client-dropdown-leaderboard__day-score--skeleton'
                    }, renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--day'))
                );
            }

            rowCells.push(
                React.createElement('div', {
                    key: 'r-avg',
                    className: 'client-dropdown-leaderboard__avg-wrap'
                }, renderSkeletonChip('client-dropdown-leaderboard__skeleton-chip--avg'))
            );

            rows.push(
                React.createElement('div', {
                    key: 'lb-skeleton-' + ri,
                    className: 'client-dropdown-leaderboard__row client-dropdown-leaderboard__row--skeleton'
                }, rowCells)
            );
        }

        return React.createElement('div', {
            className: 'client-dropdown-leaderboard__scroll client-dropdown-leaderboard__scroll--skeleton',
            'aria-hidden': 'true'
        }, [
            React.createElement('div', {
                key: 'lb-skeleton-header',
                className: 'client-dropdown-leaderboard__header-row client-dropdown-leaderboard__header-row--skeleton'
            }, headerCells)
        ].concat(rows));
    }

    function renderLeaderboardSection(weeklyData, options) {
        var config = options || {};
        var entries = weeklyData && Array.isArray(weeklyData.entries) ? weeklyData.entries : [];
        var weekDates = weeklyData && Array.isArray(weeklyData.weekDates) && weeklyData.weekDates.length > 0
            ? weeklyData.weekDates
            : buildFullWeekDates(config.fallbackDateStr);

        if (config.isLoading) {
            return renderLeaderboardShell(renderLeaderboardSkeleton(weekDates), weekDates, { isLoading: true });
        }

        if (entries.length === 0) {
            return null;
        }

        var summaryLabel = '★';

        // Header cells: rank, name, day columns, average
        var headerCells = [
            React.createElement('div', { key: 'h-rank', className: 'client-dropdown-leaderboard__head-rank' }, '#'),
            React.createElement('div', { key: 'h-name', className: 'client-dropdown-leaderboard__head-name' }, 'Имя')
        ];
        for (var di = 0; di < weekDates.length; di++) {
            var dayDate = new Date(weekDates[di] + 'T12:00:00');
            var dow = dayDate.getDay();
            var isoDay = dow === 0 ? 7 : dow;
            headerCells.push(
                React.createElement('div', {
                    key: 'h-d' + di,
                    className: 'client-dropdown-leaderboard__head-day'
                }, DAY_LABELS[isoDay - 1])
            );
        }
        headerCells.push(
            React.createElement('div', {
                key: 'h-avg',
                className: 'client-dropdown-leaderboard__head-balance'
            }, React.createElement('span', { className: 'client-dropdown-leaderboard__head-balance-badge' }, summaryLabel))
        );

        var headerRow = React.createElement('div', {
            key: 'lb-header',
            className: 'client-dropdown-leaderboard__header-row'
        }, headerCells);

        var rows = entries.map(function (entry, index) {
            var rank = index + 1;
            var medal = MEDAL_STYLES[rank] || null;
            var isCurrent = !!entry.isCurrent;

            var cells = [
                // Rank medal
                React.createElement('div', {
                    key: 'r-rank',
                    className: 'client-dropdown-leaderboard__rank-badge',
                    style: Object.assign({}, medal || { background: 'var(--bg-secondary, #f1f5f9)', color: 'var(--muted)' })
                }, rank),
                // Name
                React.createElement('div', {
                    key: 'r-name',
                    className: 'client-dropdown-leaderboard__name' + (isCurrent ? ' is-current' : ''),
                    title: entry.name || ''
                }, formatCompetitionName(entry.name))
            ];

            // Day score cells
            var dailyScores = entry.dailyScores || {};
            for (var di = 0; di < weekDates.length; di++) {
                var scoreVal = dailyScores[weekDates[di]];
                var hasScore = scoreVal !== undefined && scoreVal !== null;
                var numScore = hasScore ? Number(scoreVal) : 0;
                var tone = hasScore ? getCEBToneStyle(numScore) : null;

                cells.push(
                    React.createElement('div', {
                        key: 'r-d' + di,
                        className: 'client-dropdown-leaderboard__day-score' + (hasScore ? '' : ' is-empty'),
                        style: {
                            background: tone ? tone.background : 'transparent',
                            color: tone ? tone.color : 'var(--muted)',
                            opacity: hasScore ? 1 : 0.3
                        }
                    }, hasScore ? numScore.toFixed(1) : '—')
                );
            }

            // Average cell
            var totalTone = getCEBToneStyle((entry.weekTotal || 0) / Math.max(weekDates.length || 1, 1));
            cells.push(
                React.createElement('div', {
                    key: 'r-avg',
                    className: 'client-dropdown-leaderboard__avg-wrap'
                }, React.createElement('span', {
                    className: 'client-dropdown-leaderboard__avg-badge' + (isCurrent ? ' is-current' : ''),
                    style: {
                        background: isCurrent ? (document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(37, 99, 235, 0.28)' : 'rgba(37, 99, 235, 0.14)') : totalTone.background,
                        color: isCurrent ? (document.documentElement.getAttribute('data-theme') === 'dark' ? '#bfdbfe' : '#1d4ed8') : totalTone.color,
                        borderColor: isCurrent ? 'rgba(96, 165, 250, 0.38)' : 'rgba(148, 163, 184, 0.18)'
                    }
                }, (entry.weekTotal || 0).toFixed(1)))
            );

            return React.createElement('div', {
                key: 'lb-' + entry.id,
                className: 'client-dropdown-leaderboard__row' + (isCurrent ? ' is-current' : '')
            }, cells);
        });

        return renderLeaderboardShell(
            React.createElement('div', {
                className: 'client-dropdown-leaderboard__scroll'
            }, [headerRow].concat(rows)),
            weekDates,
            { isLoading: false }
        );
    }

    // ── Export ─────────────────────────────────────────────

    HEYS.LeaderboardSection = {
        render: renderLeaderboardSection,
        // Data helpers for computing leaderboard entries
        getClientCEB: getClientCEB,
        getClientCEBFromCompetitionData: getClientCEBFromCompetitionData,
        extractCompetitionDataFromKVRows: extractCompetitionDataFromKVRows,
        normalizeWeekDates: normalizeWeekDates,
        getCEBToneStyle: getCEBToneStyle,
        formatCompetitionName: formatCompetitionName,
        VERSION: '1.1.0'
    };

    console.info('[HEYS.LeaderboardSection] ✅ Module loaded v1.1.0');
})();
