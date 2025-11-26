/**
 * Browser-friendly logger that делает безопасный бридж к window.HEYS.logger
 * и аккуратно буферизует сообщения, пока реальный логгер недоступен.
 */

type LogMethod = (message: string, context?: Record<string, unknown>) => void;

export interface Logger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
}

type ExternalLogger = Partial<Record<keyof Logger, LogMethod>>;

interface LogEntry {
  level: keyof Logger;
  message: string;
  context: Record<string, unknown> | undefined;
  timestamp: number;
}

const LOG_LEVELS: Array<keyof Logger> = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const BUFFER_LIMIT = 200;

const logBuffer: LogEntry[] = [];

const readGlobalLogger = (): ExternalLogger | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const heysNamespace = (window as unknown as { HEYS?: { logger?: ExternalLogger } }).HEYS;
  return heysNamespace?.logger;
};

const pushToBuffer = (entry: LogEntry) => {
  if (logBuffer.length >= BUFFER_LIMIT) {
    logBuffer.shift();
  }

  logBuffer.push(entry);
};

const flushBuffer = (target: ExternalLogger | undefined) => {
  if (!target) {
    return;
  }

  while (logBuffer.length > 0) {
    const entry = logBuffer.shift();
    if (!entry) {
      continue;
    }

    target[entry.level]?.(entry.message, entry.context);
  }
};

const emit = (level: keyof Logger, message: string, context?: Record<string, unknown>) => {
  const target = readGlobalLogger();

  if (target && typeof target[level] === 'function') {
    target[level]?.(message, context);
    if (logBuffer.length > 0) {
      flushBuffer(target);
    }
    return;
  }

  pushToBuffer({
    level,
    message,
    context,
    timestamp: Date.now(),
  });
};

const createBrowserLogger = (): Logger =>
  LOG_LEVELS.reduce((acc, level) => {
    acc[level] = (message: string, context?: Record<string, unknown>) =>
      emit(level, message, context);
    return acc;
  }, {} as Record<keyof Logger, LogMethod>) as Logger;

export const log = createBrowserLogger();

export const logError = (error: Error, context?: Record<string, unknown>) => {
  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...context,
  };

  emit('error', 'Browser error captured', payload);
};

export const logWarning = (message: string, context?: Record<string, unknown>) => {
  emit('warn', message, context);
};

export const logInfo = (message: string, context?: Record<string, unknown>) => {
  emit('info', message, context);
};

export const getBufferedLogs = () => logBuffer.slice();
