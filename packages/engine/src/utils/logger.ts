type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as Level;
const currentLevel: Level = envLevel in LEVELS ? envLevel : 'info';

function log(level: Level, ...args: any[]) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  // Route to appropriate console method
  switch (level) {
    case 'debug':
    case 'info':
      console.log(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'error':
      console.error(...args);
      break;
  }
}

export const logger = {
  level: currentLevel,
  debug: (...args: any[]) => log('debug', ...args),
  info: (...args: any[]) => log('info', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  error: (...args: any[]) => log('error', ...args),
};

