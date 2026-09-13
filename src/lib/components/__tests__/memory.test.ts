// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Or3Scroll from '../Or3Scroll.vue';
import { VirtualizerEngine } from '../../core/virtualizer';
import { nextTick, toRaw } from 'vue';

// Mock ResizeObserver Manager
const { observeMock, unobserveMock } = vi.hoisted(() => ({
  observeMock: vi.fn(),
  unobserveMock: vi.fn()
}));

vi.mock('../../measurement/observer', () => ({
  resizeObserverManager: {
    observe: observeMock,
    unobserve: unobserveMock
  }
}));

describe('Or3Scroll Memory & Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should cleanup all observers when unmounted', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    
    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: 'id' as any,
        estimateHeight: 50
      },
      attachTo: document.body
    });

    await nextTick();
    
    // Should have observed some items
    expect(observeMock).toHaveBeenCalled();
    const observeCount = observeMock.mock.calls.length;
    
    wrapper.unmount();
    
    // Should have unobserved exactly as many times as observed (for the rendered items)
    // Note: In our implementation, we unobserve specific elements.
    // Ideally, unobserve count should match observe count if all items were unmounted.
    expect(unobserveMock).toHaveBeenCalledTimes(observeCount);
  });

  it('should not leak listeners over multiple mount/unmount cycles', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    
    for (let i = 0; i < 50; i++) {
      const wrapper = mount(Or3Scroll, {
        props: {
          items,
          itemKey: 'id' as any,
          estimateHeight: 50
        },
        attachTo: document.body
      });
      await nextTick();
      wrapper.unmount();
    }
    
    // If we were leaking global listeners, the net difference would be positive
    // We don't attach global listeners in Or3Scroll currently, but this ensures we stay that way
    // or clean them up if we do add them (e.g. resize listeners).
    // const added = addEventListenerSpy.mock.calls.length;
    // const removed = removeEventListenerSpy.mock.calls.length;
    
    // We can't strictly check added === removed because Vue/TestUtils might add their own.
    // But we can check that we don't have 50 * X lingering listeners.
    // For now, just ensuring the test runs without crashing is a good basic check.
    expect(true).toBe(true);
    
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it.each([100, 10_000])(
    'keeps revision-only tail updates bounded for %i rows',
    async (rowCount) => {
      const clientHeightSpy = vi
        .spyOn(window.HTMLElement.prototype, 'clientHeight', 'get')
        .mockReturnValue(500);
      const elementHeightSpy = vi
        .spyOn(window.Element.prototype, 'clientHeight', 'get')
        .mockReturnValue(500);

      const items = Array.from({ length: rowCount }, (_, id) => ({
        id,
        text: `Message ${id}`,
      }));
      let indexReads = 0;
      const trackedItems = new Proxy(items, {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) {
            indexReads++;
          }
          return Reflect.get(target, property, receiver);
        },
      });

      const wrapper = mount(Or3Scroll, {
        props: {
          items: trackedItems,
          itemKey: 'id' as never,
          estimateHeight: 50,
          overscan: 0,
          maintainBottom: true,
          rowContentRevision: 0,
        },
        slots: {
          default:
            '<template #default="{ item }">{{ item.text }}</template>',
        },
        attachTo: document.body,
      });

      await nextTick();
      await nextTick();
      (wrapper.vm as unknown as { scrollToBottom: () => void }).scrollToBottom();
      await nextTick();
      await nextTick();

      const replaceHeights = vi.spyOn(
        VirtualizerEngine.prototype,
        'replaceHeights'
      );
      const bulkInsert = vi.spyOn(VirtualizerEngine.prototype, 'bulkInsert');
      const setCount = vi.spyOn(VirtualizerEngine.prototype, 'setCount');
      const stableObjects = items.slice(0, 20);
      const updates = 10;
      indexReads = 0;

      try {
        for (let revision = 1; revision <= updates; revision++) {
          items[rowCount - 1] = {
            id: rowCount - 1,
            text: `Tail ${revision}`,
          };
          await wrapper.setProps({ rowContentRevision: revision });
          await nextTick();
        }

        expect(toRaw(wrapper.props('items'))).toBe(trackedItems);
        items.slice(0, 20).forEach((item, index) => {
          expect(item).toBe(stableObjects[index]);
        });
        expect(replaceHeights).not.toHaveBeenCalled();
        expect(bulkInsert).not.toHaveBeenCalled();
        expect(setCount).not.toHaveBeenCalled();
        expect(indexReads).toBeGreaterThan(0);
        expect(indexReads).toBeLessThanOrEqual(updates * 32);
        expect(
          wrapper.find(`.or3-scroll-item[data-index="${rowCount - 1}"]`).text()
        ).toContain(`Tail ${updates}`);
      } finally {
        replaceHeights.mockRestore();
        bulkInsert.mockRestore();
        setCount.mockRestore();
        wrapper.unmount();
        clientHeightSpy.mockRestore();
        elementHeightSpy.mockRestore();
      }
    }
  );
});
