/**
 * Sole module that touches process signals, exit, and fatal hooks.
 */

export interface ProcessPort {
  onSignal(s: 'SIGTERM' | 'SIGINT', fn: () => void): void;
  onFatal(fn: (e: unknown) => void): void;
  exit(code: number): void;
}

export const realProcess: ProcessPort = {
  onSignal(signal, fn) {
    process.once(signal, fn);
  },
  onFatal(fn) {
    process.on('uncaughtException', (error: Error, origin: string) => {
      fn({
        error: error.message,
        stack: error.stack,
        origin,
      });
    });
    process.on('unhandledRejection', (reason: unknown) => {
      fn({
        error: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        origin: 'unhandledRejection',
      });
    });
  },
  exit(code) {
    process.exit(code);
  },
};
