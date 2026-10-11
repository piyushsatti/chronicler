/**
 * Stale-chunk crash recovery for lazy routes (#307).
 * Shell-owned copy for Wave 1; T221 may relocate under utils/.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_FLAG = 'chunk_reload_once';

const CHUNK_LOAD_ERROR_PATTERNS: RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
];

function isChunkLoadError(err: unknown): boolean {
  return (
    err instanceof Error &&
    CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(err.message))
  );
}

function readReloadFlag(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1';
  } catch {
    return false;
  }
}

function setReloadFlag(): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
  } catch {
    // ignore
  }
}

export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // ignore
  }
}

export function forceChunkReload(): void {
  clearChunkReloadFlag();
  window.location.reload();
}

function attemptReloadOnce(): boolean {
  if (readReloadFlag()) return false;
  setReloadFlag();
  window.location.reload();
  return true;
}

export class ChunkReloadFailedError extends Error {
  constructor(cause: unknown) {
    super('This part of the app failed to load. Please refresh the page.', {
      cause,
    });
    this.name = 'ChunkReloadFailedError';
  }
}

export function withChunkReload<T>(factory: () => Promise<T>): () => Promise<T> {
  return () =>
    factory().then(
      (module) => {
        clearChunkReloadFlag();
        return module;
      },
      (err: unknown) => {
        if (!isChunkLoadError(err)) throw err;
        if (attemptReloadOnce()) {
          return new Promise<T>(() => {});
        }
        throw new ChunkReloadFailedError(err);
      },
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(withChunkReload(factory));
}
