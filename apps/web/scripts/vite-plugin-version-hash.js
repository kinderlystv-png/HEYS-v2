/**
 * @file Vite Plugin: Auto-version static files with content hash
 * @description Заменяет ?v=N на ?v=CONTENTHASH[8] в HTML при сборке
 * @version 1.0.0
 * @author HEYS Team
 *
 * Решает проблему ручного обновления версий при изменении файлов:
 * - insights/pi_*.js?v=6 → insights/pi_*.js?v=a1b2c3d4
 * - heys_*.js?v=N → heys_*.js?v=HASH
 *
 * Хеш генерируется из содержимого файла, поэтому при изменении файла
 * хеш автоматически обновляется → браузер скачивает новую версию
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Генерирует короткий хеш из содержимого файла
 * @param {string} content - Содержимое файла
 * @returns {string} 8-символьный hex хеш
 */
function generateContentHash(content) {
  return createHash('md5').update(content).digest('hex').slice(0, 8);
}

/**
 * @typedef {object} VersionHashOptions
 * @property {string[]} [excludePatterns] - Паттерны для исключения
 * @property {boolean} [verbose] - Выводить логи
 */

/**
 * Vite плагин для автоматического версионирования статических файлов
 * @param {VersionHashOptions} options - Опции плагина
 * @returns {import('vite').Plugin}
 */
export default function vitePluginVersionHash(options = {}) {
  const {
    excludePatterns = ['react', 'react-dom', 'cdn.jsdelivr', 'twemoji'],
    verbose = false,
  } = options;

  /** @type {Map<string, string>} Кеш хешей файлов */
  const hashCache = new Map();

  /** @type {string} Корневая директория */
  let rootDir = '';

  return {
    name: 'vite-plugin-version-hash',
    enforce: 'post',

    configResolved(config) {
      rootDir = config.root;
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Только в production build
        if (ctx.server) return html;

        let updatedHtml = html;
        let updatedCount = 0;

        // Regex для поиска src="...?v=N" или href="...?v=N"
        const versionRegex = /((?:src|href)=["'])([^"']+\.(js|css))\?v=\d+(["'])/g;

        updatedHtml = html.replace(versionRegex, (match, prefix, filePath, ext, suffix) => {
          // Пропускаем CDN и внешние ресурсы
          if (excludePatterns.some((p) => filePath.includes(p))) {
            return match;
          }

          // Определяем полный путь к файлу
          const fullPath = resolve(rootDir, filePath);

          // Проверяем кеш
          if (hashCache.has(fullPath)) {
            const hash = hashCache.get(fullPath);
            updatedCount++;
            return `${prefix}${filePath}?v=${hash}${suffix}`;
          }

          // Читаем файл и генерируем хеш
          if (existsSync(fullPath)) {
            try {
              const content = readFileSync(fullPath, 'utf-8');
              const hash = generateContentHash(content);
              hashCache.set(fullPath, hash);
              updatedCount++;

              if (verbose) {
                // eslint-disable-next-line no-console
                console.log(`[version-hash] ${filePath} → ?v=${hash}`);
              }

              return `${prefix}${filePath}?v=${hash}${suffix}`;
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn(`[version-hash] Failed to hash ${filePath}:`, err.message);
              return match;
            }
          }

          // Файл не найден — оставляем как есть (может быть в dist после copy)
          return match;
        });

        if (verbose && updatedCount > 0) {
          // eslint-disable-next-line no-console
          console.log(`[version-hash] Updated ${updatedCount} file versions`);
        }

        return updatedHtml;
      },
    },
  };
}
