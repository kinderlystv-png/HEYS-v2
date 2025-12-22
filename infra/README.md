# HEYS Infrastructure — Yandex Cloud

> **Источники правды для CDN/Storage конфигурации**  
> Обновлено: 2025-12-22

---

## 🌐 PWA `app.heyslab.ru`

| Параметр            | Значение                                    |
| ------------------- | ------------------------------------------- |
| **CDN Resource ID** | `bc8rvrvenqslkmti5yts`                      |
| **Origin Group ID** | `1046384460070918226`                       |
| **Origin**          | `heys-app.website.yandexcloud.net`          |
| **Host Header**     | `heys-app.website.yandexcloud.net`          |
| **Provider CNAME**  | `e1e14e1dabe6ab92.a.yccdn.cloud.yandex.net` |
| **SSL Certificate** | `fpq2cb4ir6jje51dnsbu` (CM managed)         |
| **S3 Bucket**       | `heys-app`                                  |

**DNS (Yandex Cloud DNS):**

```
app.heyslab.ru → CNAME → e1e14e1dabe6ab92.a.yccdn.cloud.yandex.net
```

---

## 🏠 Landing `heyslab.ru`

| Параметр            | Значение                                    |
| ------------------- | ------------------------------------------- |
| **CDN Resource ID** | `bc8rk3pnqppsfime3nth`                      |
| **Origin Group ID** | `7225628537405235922`                       |
| **Origin**          | `heys-static.website.yandexcloud.net`       |
| **Host Header**     | `heys-static.website.yandexcloud.net`       |
| **Provider CNAME**  | `e1e14e1dabe6ab92.a.yccdn.cloud.yandex.net` |
| **SSL Certificate** | `fpq9tvrkni47ogh6jgkk` (CM managed)         |
| **S3 Bucket**       | `heys-static`                               |

**DNS (Yandex Cloud DNS):**

```
heyslab.ru → CNAME → e1e14e1dabe6ab92.a.yccdn.cloud.yandex.net
```

---

## 🔧 Полезные команды

### Диагностика

```bash
# Статус CDN ресурсов
yc cdn resource list

# Детали ресурса
yc cdn resource get bc8rvrvenqslkmti5yts --format yaml

# Origin groups (должно быть только 2!)
yc cdn origin-group list

# Проверка origin напрямую (минуя CDN)
curl -sI https://heys-app.website.yandexcloud.net/index.html
curl -sI https://heys-static.website.yandexcloud.net/index.html
```

### Purge кэша

```bash
# Только критичные файлы (рекомендуется)
yc cdn cache purge --resource-id bc8rvrvenqslkmti5yts --path "/" --path "/index.html" --path "/sw.js"

# Полный purge (только при катастрофе, rate limit!)
yc cdn cache purge --resource-id bc8rvrvenqslkmti5yts --path "/*"
```

### Health check после деплоя

```bash
# PWA
curl -sI https://app.heyslab.ru/ | head -5
curl -sI https://app.heyslab.ru/manifest.json | head -5
curl -sI https://app.heyslab.ru/sw.js | head -5
curl -sI https://app.heyslab.ru/random/deep/route | head -5  # SPA fallback

# Landing
curl -sI https://heyslab.ru/ | head -5
```

---

## 📦 S3 Buckets

| Bucket        | Назначение               | Website Endpoint                      |
| ------------- | ------------------------ | ------------------------------------- |
| `heys-app`    | PWA (React SPA)          | `heys-app.website.yandexcloud.net`    |
| `heys-static` | Landing (Next.js export) | `heys-static.website.yandexcloud.net` |

**Website hosting settings:**

- Index document: `index.html`
- Error document: `index.html` (для SPA fallback)

---

## ⚡ Кэширование

### Рекомендуемые Cache-Control заголовки

| Файлы                    | Cache-Control                         | Почему         |
| ------------------------ | ------------------------------------- | -------------- |
| `index.html`             | `no-cache, no-store, must-revalidate` | Всегда свежий  |
| `sw.js`                  | `no-cache, no-store, must-revalidate` | PWA updates    |
| `manifest.json`          | `max-age=3600`                        | Редко меняется |
| `assets/*` (hashed)      | `public, max-age=31536000, immutable` | Хэш в имени    |
| `*.css`, `*.js` (hashed) | `public, max-age=31536000, immutable` | Хэш в имени    |

### CDN Edge Cache

Текущая настройка: `edge_cache_settings.default_value: 86400` (24 часа)

⚠️ **Важно:** Если 403/404 "залипает" — это кэшированная ошибка на edge.
Решение: purge критичных путей после деплоя.

---

## 🚨 Troubleshooting

### 403/404 после деплоя

1. Проверь origin напрямую: `curl -sI https://heys-app.website.yandexcloud.net/`
2. Если origin отдаёт 200 → purge CDN:
   `yc cdn cache purge --resource-id bc8rvrvenqslkmti5yts --path "/"`
3. Подожди 1-2 минуты
4. Проверь CDN: `curl -sI https://app.heyslab.ru/`

### Purge rate limit

Yandex CDN ограничивает количество purge запросов. Тактика:

- Purge только критичные пути: `/`, `/index.html`, `/sw.js`
- `/*` — только при катастрофе
- Между purge — пауза 1-2 минуты

---

## 📋 Чеклист деплоя

- [ ] Собрать билд
- [ ] Загрузить assets/\* с `Cache-Control: public, max-age=31536000, immutable`
- [ ] Загрузить sw.js, manifest.json с `Cache-Control: no-cache`
- [ ] Загрузить index.html **ПОСЛЕДНИМ** с `Cache-Control: no-cache`
- [ ] Purge: `/`, `/index.html`, `/sw.js`
- [ ] Health check: `curl -sI https://app.heyslab.ru/`
