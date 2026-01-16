#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const indexPath = path.join(repoRoot, 'apps', 'web', 'index.html');
const configPath = path.join(repoRoot, 'apps', 'web', 'config', 'insulin-wave-config.json');

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

const indentJson = (json, spaces) => {
    const pad = ' '.repeat(spaces);
    return json
        .split('\n')
        .map((line) => `${pad}${line}`)
        .join('\n');
};

const buildInlineBlock = (json) => {
    const indented = indentJson(json, 4);
    return `  <script id="heys-iw-config" type="application/json">\n${indented}\n  </script>`;
};

const updateIndexHtml = (html, inlineBlock) => {
    const blockRegex = /\s*<script id="heys-iw-config" type="application\/json">[\s\S]*?<\/script>/m;
    if (blockRegex.test(html)) {
        return html.replace(blockRegex, `\n${inlineBlock}`);
    }

    const headClose = '</head>';
    const idx = html.indexOf(headClose);
    if (idx === -1) {
        throw new Error('Cannot find </head> in index.html');
    }

    return `${html.slice(0, idx)}\n${inlineBlock}\n${html.slice(idx)}`;
};

const syncInlineConfig = () => {
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
    const inlineBlock = buildInlineBlock(prettyJson);

    const html = readFile(indexPath);
    const updatedHtml = updateIndexHtml(html, inlineBlock);

    if (updatedHtml !== html) {
        writeFile(indexPath, updatedHtml);
        return { updated: true };
    }

    return { updated: false };
};

module.exports = { syncInlineConfig };

if (require.main === module) {
    try {
        const result = syncInlineConfig();
        process.stdout.write(result.updated ? 'IW inline config synced.\n' : 'IW inline config already up to date.\n');
    } catch (error) {
        process.stderr.write(`IW inline config sync failed: ${error.message}\n`);
        process.exit(1);
    }
}
