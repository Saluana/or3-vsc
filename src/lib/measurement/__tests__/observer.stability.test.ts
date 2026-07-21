// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

describe('ResizeObserverManager registration stability', () => {
  it('observes an element once and dispatches to the latest callback', async () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    let dispatch: ResizeObserverCallback | undefined;

    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        dispatch = callback;
      }

      observe = observe;
      unobserve = unobserve;
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.resetModules();
    const { resizeObserverManager } = await import('../observer');
    const element = document.createElement('div');
    const first = vi.fn();
    const latest = vi.fn();

    resizeObserverManager.observe(element, first);
    resizeObserverManager.observe(element, latest);
    expect(observe).toHaveBeenCalledTimes(1);

    const entry = { target: element } as unknown as ResizeObserverEntry;
    dispatch?.([entry], {} as ResizeObserver);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(entry);

    resizeObserverManager.unobserve(element);
    expect(unobserve).toHaveBeenCalledTimes(1);
    resizeObserverManager.disconnect();
    vi.unstubAllGlobals();
  });
});
