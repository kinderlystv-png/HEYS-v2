#!/usr/bin/env node
// sync-iw-inline-config.cjs — Sync IW config to public/ for async loading
// v2.0.0: No longer inlines in index.html. Writes to public/heys-iw-config.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'apps', 'web', 'config', 'insulin-wave-config.json');
const publicConfigPath = path.join(repoRoot, 'apps', 'web', 'public', 'heys-iw-config.json');

const readFile = (filePath) => fs.readFileSync(filePath, 'utf8');
const writeFile = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8');

const formatJson = (value) => {
    return JSON.stringify(value, null, 4);
};

const sortKeysDeep = (value) => {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((acc, key) => {
            acc[key] = sortKeysDeep(value[key]);
            return acc;
        }, {});
    }
    return value;
};

const computeConfigHash = (config) => {
    const stable = sortKeysDeep(config);
    const json = JSON.stringify(stable);
    return crypto.createHash('sha256').update(json).digest('hex').slice(0, 12);
};

const syncConfig = () => {
    const rawConfig = readFile(configPath);
    const parsed = JSON.parse(rawConfig);
    const { version: _version, ...content } = parsed || {};
    const hash = computeConfigHash(content);
    const nextVersion = `hash:${hash}`;
    const updatedConfig = { version: nextVersion, ...content };

    if (parsed?.version !== nextVersion) {
        writeFile(configPath, `${formatJson(updatedConfig)}\n`);
    }

    const prettyJson = formatJson(updatedConfig);

    // Write to public/ for async fetch by heys_iw_config_loader.js
    let publicNeedsUpdate = true;
    try {
        const existing = readFile(publicConfigPath);
        if (existing.trim() === prettyJson.trim()) {
            publicNeedsUpdate = false;
        }
    } catch (e) {
        // file doesn't exist yet
    }

    if (publicNeedsUpdate) {
        writeFile(publicConfigPath, `${prettyJson}\n`);
        return { updated: true };
    }

    return { updated: false };
};

module.exports = { syncConfig };

if (require.main === module) {
    try {
        const result = syncConfig();
        process.stdout.write(result.updated ? 'IW config synced to public/.\n' : 'IW config already up to date.\n');
    } catch (error) {
        process.stderr.write(`IW config sync failed: ${error.message}\n`);
        process.exit(1);
    }
}
