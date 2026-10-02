'use strict';

/**
 * Minimal logger utility.
 * Wraps console methods with a timestamp and level prefix.
 * Replace with a structured logger (e.g. pino) in a production upgrade.
 */

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info:  (...args) => console.log (`[${timestamp()}] [INFO] `, ...args),
  warn:  (...args) => console.warn(`[${timestamp()}] [WARN] `, ...args),
  error: (...args) => console.error(`[${timestamp()}] [ERROR]`, ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${timestamp()}] [DEBUG]`, ...args);
    }
  },
};

module.exports = logger;
