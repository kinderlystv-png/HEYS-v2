// heys_export_utils_v1.js — shared export helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.ExportUtils = HEYS.ExportUtils || {};

    const getIsoDate = (date) => {
        const d = date instanceof Date ? date : new Date();
        return d.toISOString().slice(0, 10);
    };

    HEYS.ExportUtils.buildDatedFileName = function (prefix, date) {
        return `${prefix}-${getIsoDate(date)}.json`;
    };

    HEYS.ExportUtils.downloadJSON = function ({ data, fileName }) {
        const payload = JSON.stringify(data, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
})();
