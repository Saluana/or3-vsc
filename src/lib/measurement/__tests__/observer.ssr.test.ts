import { describe, expect, it, vi } from 'vitest';

describe('ResizeObserverManager SSR safety', () => {
  it('imports without a ResizeObserver global', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.resetModules();

    await expect(import('../observer')).resolves.toMatchObject({
      resizeObserverManager: expect.any(Object),
    });

    vi.unstubAllGlobals();
  });
});
