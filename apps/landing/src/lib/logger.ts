/* eslint-disable no-console */
/**
 * Простой логгер для Landing page
 * Изолирован от @heys/logger для минимизации зависимостей
 * 
 * Примечание: console.* используется НАМЕРЕННО, т.к. это сам логгер
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  data?: unknown
  timestamp: string
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

function formatMessage(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  }
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function output(entry: LogEntry): void {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`
  
  if (process.env.NODE_ENV === 'production') {
    // В production — структурированный JSON
    console.log(JSON.stringify(entry))
  } else {
    // В development — человекочитаемый формат
    if (entry.data !== undefined) {
      console.log(prefix, entry.message, entry.data)
    } else {
      console.log(prefix, entry.message)
    }
  }
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (shouldLog('debug')) {
      output(formatMessage('debug', message, data))
    }
  },
  
  info(message: string, data?: unknown): void {
    if (shouldLog('info')) {
      output(formatMessage('info', message, data))
    }
  },
  
  warn(message: string, data?: unknown): void {
    if (shouldLog('warn')) {
      output(formatMessage('warn', message, data))
    }
  },
  
  error(message: string, data?: unknown): void {
    if (shouldLog('error')) {
      output(formatMessage('error', message, data))
    }
  },
}

export default logger
