// This is a placeholder for the logger functionality.
// In a real scenario, this would proxy to the background script.

enum LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR,
  }
  
  type LogFn = (...args: any[]) => void;
  
  interface Logger {
    debug: LogFn;
    info: LogFn;
    warn: LogFn;
    error: LogFn;
  }
  
  const createLoggerInternal = (namespace: string): Logger => {
    const log = (level: LogLevel, ...args: any[]) => {
      const levelStr = LogLevel[level];
      console.log(`[${levelStr}] ${namespace}:`, ...args);
    };
  
    return {
      debug: (...args: any[]) => log(LogLevel.DEBUG, ...args),
      info: (...args: any[]) => log(LogLevel.INFO, ...args),
      warn: (...args: any[]) => log(LogLevel.WARN, ...args),
      error: (...args: any[]) => log(LogLevel.ERROR, ...args),
    };
  };
  
  export function createLogger(namespace: string): Logger {
    return createLoggerInternal(namespace);
  }
  