export function createLogger({ appEnv, logLevel }) {
  function write(level, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      appEnv,
      level,
      message,
      ...metadata,
    };

    if (shouldLog(level, logLevel)) {
      console.log(JSON.stringify(entry));
    }
  }

  return {
    info(message, metadata) {
      write("info", message, metadata);
    },
    warn(message, metadata) {
      write("warn", message, metadata);
    },
    error(message, metadata) {
      write("error", message, metadata);
    },
  };
}

function shouldLog(level, minimumLevel) {
  const weights = { error: 0, warn: 1, info: 2 };
  return weights[level] <= weights[minimumLevel];
}
