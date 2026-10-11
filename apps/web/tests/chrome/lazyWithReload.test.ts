import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChunkReloadFailedError,
  clearChunkReloadFlag,
  withChunkReload,
} from '../../src/chrome/lazyWithReload.js';

describe('lazyWithReload / withChunkReload', () => {
  afterEach(() => {
    clearChunkReloadFlag();
    vi.unstubAllGlobals();
  });

  it('passes through successful imports and clears the reload flag', async () => {
    sessionStorage.setItem('chunk_reload_once', '1');
    const wrapped = withChunkReload(async () => ({ ok: true }));
    await expect(wrapped()).resolves.toEqual({ ok: true });
    expect(sessionStorage.getItem('chunk_reload_once')).toBeNull();
  });

  it('rethrows non-chunk errors untouched', async () => {
    const wrapped = withChunkReload(async () => {
      throw new Error('module boom');
    });
    await expect(wrapped()).rejects.toThrow('module boom');
  });

  it('throws ChunkReloadFailedError after the one-shot reload already ran', async () => {
    sessionStorage.setItem('chunk_reload_once', '1');
    const wrapped = withChunkReload(async () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    await expect(wrapped()).rejects.toBeInstanceOf(ChunkReloadFailedError);
  });
});
