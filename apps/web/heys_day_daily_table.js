// heys_day_daily_table.js — daily totals table helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildDailyTableState(params) {
        const {
            React,
            dayTot,
            normAbs,
            getDailyNutrientColor,
            getDailyNutrientTooltip
        } = params || {};

        const factKeys = ['kcal', 'carbs', 'simple', 'complex', 'prot', 'fat', 'bad', 'good', 'trans', 'fiber', 'gi', 'harm'];

        function fmtVal(key, v) {
            const num = +v || 0;
            if (!num) return '-';
            if (key === 'harm') return Math.round(num * 10) / 10;
            return Math.round(num);
        }

        function devVal(k) {
            const n = +normAbs[k] || 0;
            const f = +dayTot[k] || 0;
            if (!n) return '-';
            const d = ((f - n) / n) * 100;
            return (d > 0 ? '+' : '') + Math.round(d) + '%';
        }

        function devCell(k) {
            const n = +normAbs[k] || 0;
            if (!n) return React.createElement('td', { key: 'ds-dv' + k }, '-');
            const f = +dayTot[k] || 0;
            const d = ((f - n) / n) * 100;
            const diff = Math.round(d);
            const color = diff > 0 ? '#dc2626' : (diff < 0 ? '#059669' : '#111827');
            const fw = diff !== 0 ? 600 : 400;
            return React.createElement('td', { key: 'ds-dv' + k, style: { color, fontWeight: fw } }, (diff > 0 ? '+' : '') + diff + '%');
        }

        function factCell(k) {
            const f = +dayTot[k] || 0;
            const n = +normAbs[k] || 0;
            if (!n) return React.createElement('td', { key: 'ds-fv' + k }, fmtVal(k, f));
            const over = f > n, under = f < n; let color = null; let fw = 600;
            if (['bad', 'trans'].includes(k)) { if (under) color = '#059669'; else if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'simple') { if (under) color = '#059669'; else if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'complex') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
            else if (k === 'fiber') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
            else if (k === 'kcal') { if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'prot') { if (over) color = '#059669'; else fw = 400; }
            else if (k === 'carbs' || k === 'fat') { if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'good') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
            else if (k === 'gi' || k === 'harm') { if (over) color = '#dc2626'; else if (under) color = '#059669'; else fw = 400; }
            else { fw = 400; }
            const style = color ? { color, fontWeight: fw } : { fontWeight: fw };
            return React.createElement('td', { key: 'ds-fv' + k, style }, fmtVal(k, f));
        }

        function normVal(k) {
            const n = +normAbs[k] || 0;
            return n ? fmtVal(k, n) : '-';
        }

        const per100Head = ['', '', '', '', '', '', '', '', '', ''];
        const factHead = ['ккал', 'У', 'Прост', 'Сл', 'Б', 'Ж', 'ВрЖ', 'ПолЖ', 'СупЖ', 'Клет', 'ГИ', 'Вред', ''];

        const pct = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;

        const daySummary = HEYS.dayDailySummary?.renderDailySummary?.({
            React,
            dayTot,
            normAbs,
            fmtVal,
            pct,
            getDailyNutrientColor,
            getDailyNutrientTooltip
        }) || null;

        return {
            factKeys,
            fmtVal,
            devVal,
            devCell,
            factCell,
            normVal,
            per100Head,
            factHead,
            pct,
            daySummary
        };
    }

    HEYS.dayDailyTable = {
        buildDailyTableState
    };
})(window);
