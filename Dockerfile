# ===== BASE STAGE =====
FROM node:18-alpine AS base

# Установка pnpm
RUN npm install -g pnpm@8

# Рабочая директория
WORKDIR /app

# ===== DEVELOPMENT STAGE =====
FROM base AS development

# Копируем файлы зависимостей
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY apps/*/package.json ./apps/*/

# Устанавливаем все зависимости (включая dev)
RUN pnpm install --frozen-lockfile

# Копируем исходный код
COPY . .

# Открываем порт
EXPOSE 3000

# Запускаем dev сервер
CMD ["pnpm", "run", "dev"]

# ===== BUILD STAGE =====
FROM base AS builder

# Копируем файлы зависимостей
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY apps/*/package.json ./apps/*/

# Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# Копируем исходный код
COPY . .

# Собираем проект
RUN pnpm run build

# Запускаем тесты (fail fast если тесты не проходят)
RUN pnpm run test:all

# ===== PRODUCTION STAGE =====
FROM base AS production

# Безопасность: создаем пользователя
RUN addgroup -g 1001 -S nodejs
RUN adduser -S heys -u 1001

# Копируем зависимости production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY apps/*/package.json ./apps/*/

# Устанавливаем только production зависимости
RUN pnpm install --frozen-lockfile --prod

# Копируем собранные файлы из builder stage
COPY --from=builder --chown=heys:nodejs /app/apps/web/dist ./apps/web/dist
COPY --from=builder --chown=heys:nodejs /app/packages/*/dist ./packages/*/dist

# Копируем необходимые файлы
COPY --chown=heys:nodejs apps/web/package.json ./apps/web/
COPY --chown=heys:nodejs scripts ./scripts

# Переключаемся на непривилегированного пользователя
USER heys

# Расширенная проверка здоровья приложения
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD pnpm --filter "@heys/web" run health-check || curl -f http://localhost:3000/health || exit 1

# Открываем порт
EXPOSE 3000

# Настройки для production
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Запускаем приложение
CMD ["pnpm", "--filter", "@heys/web", "run", "preview"]
