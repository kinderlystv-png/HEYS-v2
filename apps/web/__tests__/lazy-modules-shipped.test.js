// lazy-modules-shipped.test.js — ленивые модули обязаны попадать в dist.
//
// heys_day_stats_bundle_loader_v1.js грузит часть модулей отдельными файлами по
// пути от корня приложения. В прод выкладывается apps/web/dist, куда каталоги
// копирует viteStaticCopy из vite.config.ts. Каталога нет в списке — файлы дают
// 404 на проде, и приложение молча уходит на фолбэк: локально всё работает,
// в проде фича мертва. Именно так и случилось с silovoy-конструктором
// (2026-08-09), поэтому связь двух списков закреплена тестом.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const loaderSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_stats_bundle_loader_v1.js'), 'utf8');
const viteSrc = fs.readFileSync(path.join(WEB_DIR, 'vite.config.ts'), 'utf8');
const pkgSrc = fs.readFileSync(path.join(WEB_DIR, 'package.json'), 'utf8');

/** Каталоги, из которых загрузчик тянет файлы (пути со слэшем). */
function lazyDirs() {
    const start = loaderSrc.indexOf('const scripts = [');
    const end = loaderSrc.indexOf('];', start);
    const chunk = loaderSrc.slice(start, end);
    const dirs = new Set();
    for (const m of chunk.matchAll(/'([^'\n]+\/[^'\n]+)'/g)) {
        dirs.add(m[1].split('/')[0]);
    }
    return [...dirs];
}

/**
 * Каталоги, которые сборка копирует в dist. Механизма два и оба в ходу:
 * viteStaticCopy в vite.config.ts и явные cp в скрипте build:dist.
 */
function copiedDirs() {
    const fromVite = [...viteSrc.matchAll(/src:\s*'([\w./-]+)'/g)]
        .map((m) => m[1].replace(/^\.\.\/\.\.\//, ''));
    const fromCp = [...pkgSrc.matchAll(/cp -r ([\w./*-]+) dist\//g)]
        .map((m) => m[1].split('/')[0]);
    return [...fromVite, ...fromCp];
}

describe('ленивые модули доезжают до прода', () => {
    it('каждый каталог из загрузчика копируется в dist', () => {
        const copied = copiedDirs();
        const missing = lazyDirs().filter((dir) => !copied.includes(dir));
        expect(missing).toEqual([]);
    });

    it('файлы, которые грузит загрузчик, существуют на диске', () => {
        const start = loaderSrc.indexOf('const scripts = [');
        const end = loaderSrc.indexOf('];', start);
        const files = [...loaderSrc.slice(start, end).matchAll(/'([^'\n]+\.js)'/g)].map((m) => m[1]);
        const missing = files.filter((f) => !fs.existsSync(path.join(WEB_DIR, f)));
        expect(missing).toEqual([]);
    });
});
