#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { syncInlineConfig } = require('./sync-iw-inline-config.cjs');

const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'apps', 'web', 'config', 'insulin-wave-config.json');

const debounce = (fn, delay) => {
    let timer = null;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
    };
};

const runSync = () => {
    try {
        const result = syncInlineConfig();
        process.stdout.write(result.updated ? '[IW] inline config synced.\n' : '[IW] inline config already up to date.\n');
    } catch (error) {
        process.stderr.write(`[IW] sync failed: ${error.message}\n`);
    }
};

const onChange = debounce(runSync, 200);

process.stdout.write('[IW] Watching insulin-wave-config.json for changes...\n');
runSync();

let lastMtimeMs = 0;
const pollIntervalMs = 500;

const pollFile = () => {
    try {
        const stat = fs.statSync(configPath);
        if (stat.mtimeMs && stat.mtimeMs !== lastMtimeMs) {
            lastMtimeMs = stat.mtimeMs;
            onChange();
        }
    } catch (error) {
        // ignore missing file or transient errors
    }
};

const startPolling = () => {
    setInterval(pollFile, pollIntervalMs);
};

try {
    const watcher = fs.watch(configPath, { persistent: true }, () => onChange());
    watcher.on('error', () => startPolling());
    startPolling();
} catch (error) {
    process.stderr.write(`[IW] fs.watch failed, switching to polling: ${error.message}\n`);
    startPolling();
}
