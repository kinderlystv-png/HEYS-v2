/**
 * Modern error logging utility
 * Replaces legacy error logging functionality
 */

export interface ErrorInfo {
  componentStack?: string;
  errorBoundary?: string;
  [key: string]: unknown;
}

export interface ErrorLogEntry {
  timestamp: string;
  error: Error;
  info?: ErrorInfo;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
}

class ErrorLogger {
  private readonly maxLogEntries = 100;
  private logs: ErrorLogEntry[] = [];
  private apiEndpoint?: string;
  private apiKey?: string;

  constructor(config?: { apiEndpoint?: string; apiKey?: string }) {
    if (config?.apiEndpoint) this.apiEndpoint = config.apiEndpoint;
    if (config?.apiKey) this.apiKey = config.apiKey;
    
    // Set up global error handlers
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers(): void {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.logError(event.error || new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError(
        new Error(`Unhandled Promise Rejection: ${event.reason}`),
        { reason: event.reason }
      );
    });
  }

  /**
   * Log an error with optional context information
   */
  logError(error: Error, info?: ErrorInfo): void {
    const logEntry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } as Error,
      ...(info && { info }),
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...(this.getCurrentUserId() && { userId: this.getCurrentUserId() }),
      sessionId: this.getSessionId(),
    };

    // Add to local logs
    this.logs.push(logEntry);
    
    // Keep only the most recent entries
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }

    // Log to console in development
    if (typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.search.includes('debug=true'))) {
      console.error('[ErrorLogger]', error, info);
    }

    // Send to server if configured
    this.sendToServer(logEntry);

    // Store in localStorage for persistence
    this.persistToLocalStorage(logEntry);
  }

  private async sendToServer(logEntry: ErrorLogEntry): Promise<void> {
    if (!this.apiEndpoint) return;

    try {
      await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify(logEntry),
      });
    } catch (err) {
      // Silently fail - don't create infinite error loops
      console.warn('[ErrorLogger] Failed to send error to server:', err);
    }
  }

  private persistToLocalStorage(logEntry: ErrorLogEntry): void {
    try {
      const storedLogs = JSON.parse(
        localStorage.getItem('heys_error_logs') || '[]'
      );
      storedLogs.push(logEntry);
      
      // Keep only last 50 entries in localStorage
      const recentLogs = storedLogs.slice(-50);
      localStorage.setItem('heys_error_logs', JSON.stringify(recentLogs));
    } catch (err) {
      // Ignore localStorage errors
    }
  }

  private getCurrentUserId(): string | undefined {
    // Try to get user ID from various sources
    try {
      // Check for user in global state
      if (typeof window !== 'undefined') {
        const globalUser = (window as any).HEYS?.user?.id ||
                          (window as any).user?.id ||
                          sessionStorage.getItem('userId') ||
                          localStorage.getItem('userId');
        
        return globalUser;
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  private getSessionId(): string {
    // Try to get or create session ID
    try {
      let sessionId = sessionStorage.getItem('sessionId');
      if (!sessionId) {
        sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('sessionId', sessionId);
      }
      return sessionId;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Get all stored error logs
   */
  getLogs(): ErrorLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs from localStorage
   */
  getPersistedLogs(): ErrorLogEntry[] {
    try {
      return JSON.parse(localStorage.getItem('heys_error_logs') || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
    try {
      localStorage.removeItem('heys_error_logs');
    } catch {
      // Ignore errors
    }
  }

  /**
   * Configure the error logger
   */
  configure(config: { apiEndpoint?: string; apiKey?: string }): void {
    if (config.apiEndpoint) this.apiEndpoint = config.apiEndpoint;
    if (config.apiKey) this.apiKey = config.apiKey;
  }
}

// Create singleton instance
const errorLogger = new ErrorLogger();

// Export the logger instance and class
export { errorLogger, ErrorLogger };

// Set up global HEYS namespace for backward compatibility
if (typeof window !== 'undefined') {
  window.HEYS = window.HEYS || {};
  window.HEYS.logError = errorLogger.logError.bind(errorLogger);
  (window.HEYS as any).errorLogger = errorLogger;
}

export default errorLogger;
