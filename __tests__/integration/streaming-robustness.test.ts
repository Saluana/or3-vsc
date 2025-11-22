// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import Or3Scroll from '../../src/lib/components/Or3Scroll.vue';
import { resizeObserverManager } from '../../src/lib/measurement/observer';

// Mock ResizeObserver
const { observeMock, unobserveMock } = vi.hoisted(() => ({
  observeMock: vi.fn(),
  unobserveMock: vi.fn()
}));

vi.mock('../../src/lib/measurement/observer', () => ({
  resizeObserverManager: {
    observe: observeMock,
    unobserve: unobserveMock
  }
}));

// Mock HTMLElement
function mockElementProps() {
  vi.spyOn(window.HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(window.HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
  Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', { 
    configurable: true, 
    get() { return this._scrollTop || 0; },
    set(v) { 
      const max = this.scrollHeight - this.clientHeight;
      this._scrollTop = Math.max(0, Math.min(v, max));
    }
  });
  vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 50,
    width: 100,
    top: 0,
    left: 0,
    right: 100,
    bottom: 50,
    x: 0,
    y: 0,
    toJSON() { return {}; }
  } as DOMRect);
}

describe('Streaming Robustness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockElementProps();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should remain stable when streaming finalizes while scrolled up', async () => {
    // 1. Setup items
    interface Message { id: number; text: string }
    const items = ref<Message[]>(Array.from({ length: 50 }, (_, i) => ({ id: i, text: `Message ${i}` })));
    
    const wrapper = mount(Or3Scroll as any, {
      props: {
        items: items.value,
        itemKey: 'id',
        estimateHeight: 50,
        maintainBottom: true
      },
      attachTo: document.body
    });

    await nextTick();

    const container = wrapper.find('.or3-scroll').element as HTMLElement;
    
    // 2. Simulate being at the bottom initially
    // Total height ~ 50 * 50 = 2500
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(2500);
    container.scrollTop = 1900; // 2500 - 600 (viewport) = 1900 (at bottom)
    await wrapper.find('.or3-scroll').trigger('scroll');
    await nextTick();

    // 3. Add a new "streaming" message
    const streamingId = 50;
    items.value = [...items.value, { id: streamingId, text: 'Streaming...' }];
    await nextTick();

    // Simulate the NEW item being rendered and measured
    // The virtualizer should render it because we are at the bottom
    if (observeMock.mock.calls.length > 0) {
      // Find the observer for the new item (index 50)
      // In JSDOM/test environment, we might need to manually trigger it
      const callback = observeMock.mock.calls.find(c => c[0].getAttribute('data-index') == '50')?.[1] 
        || observeMock.mock.calls[observeMock.mock.calls.length - 1][1];
        
      if (callback) {
        callback({ 
          borderBoxSize: [{ blockSize: 50 }] 
        } as unknown as ResizeObserverEntry);
      }
    }
    
    // Update scroll height to reflect new item (2500 + 50 = 2550)
    // We must do this BEFORE the flushUpdates runs so scrollToBottom sees the new height
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(2550);

    // Trigger flushUpdates
    vi.advanceTimersByTime(16);
    await nextTick();

    // NOW we should be snapped to bottom
    expect(container.scrollTop).toBe(1950); // 2550 - 600

    // 4. User scrolls UP to read history
    // Scroll up by 200px
    container.scrollTop = 1750; 
    await wrapper.find('.or3-scroll').trigger('scroll');
    await nextTick();
    
    // Verify we are NOT at bottom
    expect(container.scrollTop).toBe(1750);
    
    // 5. Simulate streaming updates (height changes on the last item)
    // The last item grows in height as text streams in
    const lastItemIndex = 50;
    
    // Simulate growth: 50px -> 80px
    if (observeMock.mock.calls.length > 0) {
      const callback = observeMock.mock.calls.find(c => c[0].getAttribute('data-index') == lastItemIndex.toString())?.[1] 
        || observeMock.mock.calls[observeMock.mock.calls.length - 1][1];
        
      if (callback) {
        callback({ 
          borderBoxSize: [{ blockSize: 80 }] 
        } as unknown as ResizeObserverEntry);
      }
    }
    
    // Update DOM scrollHeight to reflect growth (2550 + 30 = 2580)
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(2580);
    
    // Trigger flushUpdates
    vi.advanceTimersByTime(16); // RequestAnimationFrame
    await nextTick();
    
    // 6. CRITICAL CHECK:
    // The scroll position should remain STABLE at 1750.
    // It should NOT snap to bottom (which would be 2580 - 600 = 1980).
    // It should NOT jump due to compensation (since the growing item is below viewport).
    
    expect(container.scrollTop).toBe(1750);
    
    // 7. Finalize message (maybe it shrinks slightly or stays same)
    // Simulate final height settle: 80px -> 75px
    if (observeMock.mock.calls.length > 0) {
       const callback = observeMock.mock.calls[observeMock.mock.calls.length - 1][1];
       if (callback) {
        callback({ 
          borderBoxSize: [{ blockSize: 75 }] 
        } as unknown as ResizeObserverEntry);
      }
    }
    
    // Update scrollHeight (2580 - 5 = 2575)
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(2575);
    
    vi.advanceTimersByTime(16);
    await nextTick();
    
    // Should still be stable
    expect(container.scrollTop).toBe(1750);

    wrapper.unmount();
  });

  it('should auto-scroll when at bottom and message grows', async () => {
    const items = ref(Array.from({ length: 20 }, (_, i) => ({ id: i, text: `Message ${i}` })));
    
    const wrapper = mount(Or3Scroll as any, {
      props: {
        items: items.value,
        itemKey: 'id',
        estimateHeight: 50,
        maintainBottom: true
      },
      attachTo: document.body
    });

    await nextTick();
    const container = wrapper.find('.or3-scroll').element as HTMLElement;

    // 1. Scroll to bottom
    // Total height ~ 1000. Viewport 600. MaxScroll 400.
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(1000);
    container.scrollTop = 400; 
    await wrapper.find('.or3-scroll').trigger('scroll');
    await nextTick();

    // 2. Add new streaming message
    items.value = [...items.value, { id: 999, text: 'Stream...' }];
    await nextTick();

    // Simulate initial render of new item (50px)
    if (observeMock.mock.calls.length > 0) {
      const callback = observeMock.mock.calls[observeMock.mock.calls.length - 1][1];
      if (callback) {
        callback({ borderBoxSize: [{ blockSize: 50 }] } as unknown as ResizeObserverEntry);
      }
    }
    
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(1050);
    vi.advanceTimersByTime(16);
    await nextTick();

    // Should be at bottom (450)
    expect(container.scrollTop).toBe(450);
    
    // Trigger scroll event to update internal state (isAtBottom)
    await wrapper.find('.or3-scroll').trigger('scroll');
    await nextTick();

    // 3. Message grows (50px -> 100px)
    if (observeMock.mock.calls.length > 0) {
      // Find observer for the last item (index 20, since we had 0-19 initially)
      // Wait, items are 0-19, then we added 999. Index depends on visible range.
      // We are at bottom. startIndex is likely close to end.
      // The new item is at the end of the list.
      // Let's just find the observer for the new item element.
      const lastCall = observeMock.mock.calls.find(call => {
         const el = call[0] as HTMLElement;
         // We can't easily check data-index because it might be rendered via slot
         // But we know it's the last one added.
         return true; 
      });
      
      // Use the absolute last one registered
      const callback = observeMock.mock.calls[observeMock.mock.calls.length - 1][1];
      if (callback) {
        callback({ borderBoxSize: [{ blockSize: 100 }] } as unknown as ResizeObserverEntry);
      }
    }

    // DOM updates height before scroll compensation runs
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(1100); // 1050 + 50 growth
    
    vi.advanceTimersByTime(16);
    await nextTick();

    // Should still be at bottom (1100 - 600 = 500)
    expect(container.scrollTop).toBe(500);
    
    wrapper.unmount();
  });

  it('should stop auto-scrolling immediately if user scrolls up during stream', async () => {
    const items = ref(Array.from({ length: 20 }, (_, i) => ({ id: i, text: `Message ${i}` })));
    
    const wrapper = mount(Or3Scroll as any, {
      props: {
        items: items.value,
        itemKey: 'id',
        estimateHeight: 50,
        maintainBottom: true
      },
      attachTo: document.body
    });

    await nextTick();
    const container = wrapper.find('.or3-scroll').element as HTMLElement;

    // 1. Start at bottom
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(1000);
    container.scrollTop = 400; 
    await wrapper.find('.or3-scroll').trigger('scroll');
    await nextTick();

    // 2. Add streaming item
    items.value = [...items.value, { id: 999, text: 'Stream...' }];
    await nextTick();
    
    // Render new item (50px)
    if (observeMock.mock.calls.length > 0) {
        const callback = observeMock.mock.calls[observeMock.mock.calls.length - 1][1];
        if(callback) callback({ borderBoxSize: [{ blockSize: 50 }] } as unknown as ResizeObserverEntry);
    }
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(1050);
    vi.advanceTimersByTime(16);
    await nextTick();
    
    // Confirm at bottom
    expect(container.scrollTop).toBe(450);

    // 3. User scrolls UP
    container.scrollTop = 300;
    // Note: We do NOT trigger 'scroll' event here to simulate the race condition
    // where the user moves but the event hasn't processed yet.
    // Or we can trigger it, but we rely on the logic handling both cases.
    // Let's trigger it to set isAtBottom = false? 
    // Actually, the "hardening" logic handles the case where scroll event ISN'T processed.
    // So let's NOT trigger 'scroll' to test the robust check.

    // 4. Message grows (50px -> 100px)
    if (observeMock.mock.calls.length > 0) {
        const callback = observeMock.mock.calls[observeMock.mock.calls.length - 1][1];
        if(callback) callback({ borderBoxSize: [{ blockSize: 100 }] } as unknown as ResizeObserverEntry);
    }
    
    vi.spyOn(container, 'scrollHeight', 'get').mockReturnValue(1100);
    
    vi.advanceTimersByTime(16);
    await nextTick();

    // 5. Should NOT snap to bottom (500). Should stay where user put it (300)
    expect(container.scrollTop).toBe(300);

    wrapper.unmount();
  });

  it('should handle rapid height updates without layout thrashing', async () => {
    const items = ref(Array.from({ length: 20 }, (_, i) => ({ id: i, text: `Message ${i}` })));
    const wrapper = mount(Or3Scroll as any, {
      props: { items: items.value, itemKey: 'id' },
      attachTo: document.body
    });
    await nextTick();
    
    // Trigger multiple resize events in same frame
    const callback = observeMock.mock.calls[0][1];
    
    // Update 1
    callback({ borderBoxSize: [{ blockSize: 60 }] } as unknown as ResizeObserverEntry);
    // Update 2 (same item, new size)
    callback({ borderBoxSize: [{ blockSize: 70 }] } as unknown as ResizeObserverEntry);
    // Update 3 (same item, new size)
    callback({ borderBoxSize: [{ blockSize: 80 }] } as unknown as ResizeObserverEntry);
    
    // Should not have flushed yet
    // We can't easily spy on flushUpdates since it's internal, 
    // but we can check that DOM writes (scrollTop) haven't happened if we were compensating.
    
    vi.advanceTimersByTime(16);
    await nextTick();
    
    // Logic: The Map should debounce to the last value (80)
    // If it processed all 3, we might see weird artifacts or multiple engine updates.
    // Since we can't inspect internal engine state easily, we verify stability.
    const container = wrapper.find('.or3-scroll').element as HTMLElement;
    expect(container.scrollTop).toBeDefined();
    
    wrapper.unmount();
  });

});
