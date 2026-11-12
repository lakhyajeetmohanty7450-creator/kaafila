/**
 * Creates an idempotent, bounded-timeout graceful shutdown handler
 * for HTTP, Socket.IO, and PostgreSQL resources.
 */
export function createGracefulShutdown({
  httpServer,
  io = null,
  disconnectDb = async () => {},
  timeoutMs = 10000,
  logger = console,
  onExit = (code) => process.exit(code),
}) {
  let inProgress = false;

  return async function shutdown(signal = 'SIGTERM') {
    if (inProgress) {
      return { alreadyShuttingDown: true };
    }
    inProgress = true;

    let timedOut = false;
    const forceTimer = setTimeout(() => {
      timedOut = true;
      if (httpServer && typeof httpServer.closeAllConnections === 'function') {
        httpServer.closeAllConnections();
      }
      logger.error(
        JSON.stringify({
          level: 'error',
          event: 'graceful_shutdown_timeout',
          signal,
          timeoutMs,
        })
      );
      onExit(1);
    }, timeoutMs);

    let exitCode = 0;
    try {
      if (io && typeof io.close === 'function') {
        await new Promise((resolve) => {
          io.close(() => resolve());
        });
      }

      if (httpServer && typeof httpServer.close === 'function') {
        await new Promise((resolve, reject) => {
          httpServer.close((err) => {
            if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') reject(err);
            else resolve();
          });
          if (typeof httpServer.closeIdleConnections === 'function') {
            httpServer.closeIdleConnections();
          }
        });
      }

      await disconnectDb();
    } catch (err) {
      exitCode = 1;
      logger.error(
        JSON.stringify({
          level: 'error',
          event: 'graceful_shutdown_error',
          signal,
          message: err?.message || 'Unknown shutdown error',
        })
      );
    } finally {
      clearTimeout(forceTimer);
      if (!timedOut) {
        onExit(exitCode);
      }
    }

    return { alreadyShuttingDown: false, exitCode };
  };
}

