# HEYS Infrastructure — Yandex Cloud

> **Статус: historical/source.** Это подробный runbook и snapshot, а не источник
> текущего состояния ресурсов. Актуальные проверки и границы операций:
> [`docs/reference/systems/INFRA_OPERATIONS.md`](../docs/reference/systems/INFRA_OPERATIONS.md).

> **Источники правды для CDN/Storage/VM конфигурации**  
> Обновлено: 2026-02-25

> **Статус 2026-07-17:** документ сохранён как подробный инфраструктурный
> runbook, но перечисленные IP, resource IDs, firewall rules, версии ПО и срок
> SSL являются runtime-фактами на дату последней проверки, а не вечными
> контрактами. Перед операцией сверяйте их с Yandex Cloud/DNS/VM. Общая
> актуальная граница и источники проверки описаны в
> [`docs/reference/systems/INFRA_OPERATIONS.md`](../docs/reference/systems/INFRA_OPERATIONS.md).

---

## 🌐 PWA `app.heyslab.ru` — Nginx Reverse Proxy

> ⚠️ **Миграция 2025-12-24**: PWA перенесена с Yandex CDN на Nginx VM из-за
> проблем с кэшированием Service Worker.

| Параметр      | Значение                           |
| ------------- | ---------------------------------- |
| **VM Name**   | `app-heyslab-proxy`                |
| **VM IP**     | `158.160.53.194`                   |
| **Zone**      | `ru-central1-a`                    |
| **OS**        | Ubuntu 20.04 LTS                   |
| **Nginx**     | 1.18.0                             |
| **Origin**    | `heys-app.website.yandexcloud.net` |
| **SSL**       | Let's Encrypt (expires 2026-03-24) |
| **S3 Bucket** | `heys-app`                         |

**DNS (reg.ru):**

```
app.heyslab.ru → A → 158.160.53.194
```

**Nginx Config:** `/etc/nginx/sites-available/app.heyslab.ru`

**SSH доступ:**

```bash
# Ключ генерировался через ssh-keygen + cloud-init bootcmd user-data
# Приватный ключ: ~/.ssh/yc_key (ed25519, без пассфразы)
ssh -i ~/.ssh/yc_key -o IdentitiesOnly=yes yc-user@158.160.53.194
```

> ⚠️ Стандартный `add-metadata ssh-keys` + restart **не работает** (cloud-init
> обрабатывает `user-data` только при первом запуске). Единственный способ
> добавить SSH ключ после создания VM — через `bootcmd` в user-data (выполняется
> при каждом старте):  
> `yc compute instance add-metadata --name app-heyslab-proxy --metadata-from-file "user-data=bootcmd.yaml"`
>
> - stop/start.

### Почему Nginx вместо CDN?

Yandex CDN добавлял `Cache-Control: public, max-age=3600` ко всем файлам,
игнорируя заголовки из S3. Это приводило к тому, что PWA Service Worker не
обновлялся у пользователей (застревали на старой версии).

Nginx позволяет явно переопределять заголовки через `add_header ... always`.

---

## 🏠 Landing `heyslab.ru` — Yandex CDN

| Параметр            | Значение                                    |
| ------------------- | ------------------------------------------- |
| **CDN Resource ID** | `bc8rk3pnqppsfime3nth`                      |
| **Origin Group ID** | `7225628537405235922`                       |
| **Origin**          | `heys-static.website.yandexcloud.net`       |
| **Host Header**     | `heys-static.website.yandexcloud.net`       |
| **Provider CNAME**  | `e1e14e1dabe6ab92.a.yccdn.cloud.yandex.net` |
| **SSL Certificate** | `fpq9tvrkni47ogh6jgkk` (CM managed)         |
| **S3 Bucket**       | `heys-static`                               |

**DNS (reg.ru):**

```
heyslab.ru     → A     → 188.72.103.3 (CDN edge)
www.heyslab.ru → CNAME → e1e14e1dabe6ab92.a.yccdn.cloud.yandex.net
```

---

## 🔧 Полезные команды

### PWA (Nginx VM)

```bash
# SSH на VM (ключ ~/.ssh/yc_key, см. раздел выше)
ssh -i ~/.ssh/yc_key -o IdentitiesOnly=yes yc-user@158.160.53.194

# Проверить конфиг nginx
sudo nginx -t

# Перезагрузить nginx
sudo systemctl reload nginx

# Логи nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Статус firewall
sudo ufw status verbose

# Обновить SSL сертификат (автоматически по cron, но можно вручную)
sudo certbot renew --dry-run
```

### Проверка Cache-Control (PWA)

```bash
# Должно быть: no-cache, no-store, must-revalidate
curl -sI https://app.heyslab.ru/sw.js | grep -iE "cache-control|pragma"
curl -sI https://app.heyslab.ru/index.html | grep -iE "cache-control|pragma"

# Должно быть: no-cache, must-revalidate
curl -sI https://app.heyslab.ru/heys_products_v2.js | grep -iE "cache-control"

# Должно быть: public, max-age=31536000, immutable
curl -sI https://app.heyslab.ru/boot-core.bundle.e0cfd58e1796.js | grep -iE "cache-control"
curl -sI "https://app.heyslab.ru/assets/index-*.js" | grep -iE "cache-control"
```

> ✅ Fix 2026-02-25: добавлено правило
> `location ~ \.(bundle|chunk)\.[a-f0-9]+\.(js|css)$` в nginx конфиг →
> хешированные бандлы получили `immutable` вместо `no-cache`.<br> **Результат:**
> скорость загрузки при повторном визите: `~30s → мгновенно`.

### Landing (CDN)

```bash
# Статус CDN ресурсов
yc cdn resource list

# Детали ресурса
yc cdn resource get bc8rk3pnqppsfime3nth --format yaml

# Проверка origin напрямую (минуя CDN)
curl -sI https://heys-static.website.yandexcloud.net/index.html

# Health check
curl -sI https://heyslab.ru/ | head -5
```

### Purge кэша Landing (CDN)

```bash
# Только критичные файлы (рекомендуется)
yc cdn cache purge --resource-id bc8rk3pnqppsfime3nth --path "/" --path "/index.html"

# Полный purge (только при катастрофе, rate limit!)
yc cdn cache purge --resource-id bc8rk3pnqppsfime3nth --path "/*"
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

### PWA застряла на старой версии

1. Проверь Cache-Control на VM:
   `curl -sI https://app.heyslab.ru/sw.js | grep cache`
2. Должно быть `no-cache, no-store, must-revalidate`
3. Если не то — проверь nginx конфиг:
   ```bash
   ssh yc-user@158.160.53.194 "cat /etc/nginx/sites-available/app.heyslab.ru"
   ```

### VM недоступна

1. Проверь статус в Yandex Cloud Console → Compute Cloud
2. Проверь firewall: `ssh yc-user@158.160.53.194 "sudo ufw status"`
3. Проверь nginx: `ssh yc-user@158.160.53.194 "sudo systemctl status nginx"`

---

## 🔐 Безопасность VM

| Компонент      | Статус     | Детали                    |
| -------------- | ---------- | ------------------------- |
| UFW Firewall   | ✅ Активен | 80, 443 открыты; 22 по IP |
| SSH            | ✅ Ключи   | PasswordAuthentication no |
| fail2ban       | ✅ Активен | Защита от brute-force     |
| SSL Auto-renew | ✅ Активен | certbot.timer             |

**SSH разрешён только с IP:** `144.31.90.83`

При смене IP:

```bash
ssh yc-user@158.160.53.194 "sudo ufw delete allow from 144.31.90.83/32 to any port 22 && sudo ufw allow from NEW_IP/32 to any port 22 proto tcp"
```

---

## 📋 Чеклист деплоя PWA

- [ ] Собрать билд: `pnpm build`
- [ ] GitHub Actions автоматически загрузит в S3
- [ ] Проверить: `curl -sI https://app.heyslab.ru/sw.js | grep cache`
- [ ] Открыть https://app.heyslab.ru, DevTools → Application → Service Workers
- [ ] Убедиться что новая версия SW активна

### При смене IP VM

1. Обновить DNS: reg.ru → `app.heyslab.ru` A → новый IP
2. Подождать ~1 час (или Premium DNS ~10 мин)
3. Получить новый SSL: `sudo certbot --nginx -d app.heyslab.ru`
4. Обновить UFW: добавить свой IP для SSH
