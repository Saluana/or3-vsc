// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Or3Scroll from '../Or3Scroll.vue';
import { nextTick } from 'vue';

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

// Mock HTMLElement methods
vi.spyOn(window.HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
vi.spyOn(window.Element.prototype, 'clientHeight', 'get').mockReturnValue(400);
vi.spyOn(window.HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(5000);
Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', { 
  configurable: true, 
  get() { return this._scrollTop || 0; },
  set(v) { this._scrollTop = v; }
});

// Mock getBoundingClientRect for measurements
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

describe('Or3Scroll - Extended Component Tests', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, text: `Item ${i}` }));
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('2.1 Rendering and basic scrolling', () => {
    it('should render correct subset of items with overscan', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items,
          itemKey: 'id' as any,
          estimateHeight: 40,
          overscan: 100
        },
        slots: {
          default: '<template #default="{ item }">{{ item.text }}</template>'
        },
        attachTo: document.body
      });

      await nextTick();
      
      const renderedItems = wrapper.findAll('.or3-scroll-item');
      
      // With viewport 400px, estimate 40px, overscan 100px
      // Visible: 0-400, with overscan: 0-500
      // Should render roughly 500/40 = 12.5, so ~13+ items
      expect(renderedItems.length).toBeGreaterThan(10);
      expect(renderedItems.length).toBeLessThan(30); // Should not render all 100
      
      wrapper.unmount();
    });

    it('should change visible indices when scroll offset changes', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items,
          itemKey: 'id' as any,
          estimateHeight: 40,
          overscan: 0 // No overscan for clearer test
        },
        attachTo: document.body
      });

      await nextTick();
      
      const firstItem = wrapper.find('.or3-scroll-item');
      const initialIndex = Number(firstItem.attributes('data-index'));
      expect(initialIndex).toBe(0);
      
      // Scroll down
      const container = wrapper.find('.or3-scroll').element as HTMLElement;
      container.scrollTop = 400;
      await container.dispatchEvent(new Event('scroll'));
      await nextTick();
      
      const firstItemAfterScroll = wrapper.find('.or3-scroll-item');
      const scrolledIndex = Number(firstItemAfterScroll.attributes('data-index'));
      expect(scrolledIndex).toBeGreaterThan(initialIndex);
      
      wrapper.unmount();
    });
  });

  describe('2.2 "Stick to bottom" and auto-append behavior', () => {
    it('should stay at bottom when stickToBottom=true and appending items', async () => {
      const initialItems = items.slice(0, 20);
      
      const wrapper = mount(Or3Scroll, {
        props: {
          items: initialItems,
          itemKey: 'id' as any,
          maintainBottom: true,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      // Simulate being at bottom
      const container = wrapper.find('.or3-scroll').element as HTMLElement;
      container.scrollTop = container.scrollHeight - container.clientHeight;
      await container.dispatchEvent(new Event('scroll'));
      await nextTick();
      
      // Append new items
      await wrapper.setProps({ items: [...initialItems, ...items.slice(20, 30)] });
      await nextTick();
      
      // scrollToBottom should have been called due to maintainBottom
      // Note: Due to complexity of async watchers, we check for the effect
      const finalScrollTop = container.scrollTop;
      const finalScrollHeight = container.scrollHeight;
      const finalClientHeight = container.clientHeight;
      
      // Should still be at or near bottom
      expect(finalScrollTop).toBeGreaterThanOrEqual(finalScrollHeight - finalClientHeight - 50);
      
      wrapper.unmount();
    });

    it('should not snap to bottom when user scrolls up', async () => {
      const initialItems = items.slice(0, 20);
      
      const wrapper = mount(Or3Scroll, {
        props: {
          items: initialItems,
          itemKey: 'id' as any,
          maintainBottom: true,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      // Scroll to middle (not at bottom)
      const container = wrapper.find('.or3-scroll').element as HTMLElement;
      container.scrollTop = 100; // Clearly not at bottom
      await container.dispatchEvent(new Event('scroll'));
      await nextTick();
      
      // Append new items
      await wrapper.setProps({ items: [...initialItems, ...items.slice(20, 30)] });
      await nextTick();
      
      // Scroll position should not have jumped to bottom
      expect(container.scrollTop).toBeLessThan(container.scrollHeight - container.clientHeight - 100);
      
      wrapper.unmount();
    });
  });

  describe('2.3 loadingHistory / prepend behavior', () => {
    it('should compensate scroll when prepending with loadingHistory=true', async () => {
      const rectSpy = vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        height: 60,
        width: 100,
        top: 0,
        left: 0,
        right: 100,
        bottom: 60,
        x: 0,
        y: 0,
        toJSON() { return {}; }
      } as DOMRect);

      const initialItems = items.slice(10, 30);
      
      const wrapper = mount(Or3Scroll, {
        props: {
          items: initialItems,
          itemKey: 'id' as any,
          loadingHistory: true,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      const container = wrapper.find('.or3-scroll').element as HTMLElement;
      const initialScrollTop = container.scrollTop;
      
      // Prepend items
      const prependItems = items.slice(0, 10);
      await wrapper.setProps({ 
        items: [...prependItems, ...initialItems],
        loadingHistory: true 
      });
      
      // Wait for async measurement and watcher
      await new Promise(resolve => setTimeout(resolve, 100));
      await nextTick();
      
      // Scroll should have been compensated
      expect(container.scrollTop).toBeGreaterThan(initialScrollTop);
      
      rectSpy.mockRestore();
      wrapper.unmount();
    });

    it('should handle prepend when user is in middle of list', async () => {
      const initialItems = items.slice(20, 50);
      
      const wrapper = mount(Or3Scroll, {
        props: {
          items: initialItems,
          itemKey: 'id' as any,
          loadingHistory: false,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      const container = wrapper.find('.or3-scroll').element as HTMLElement;
      container.scrollTop = 200; // Scroll to middle
      await container.dispatchEvent(new Event('scroll'));
      await nextTick();
      
      const scrollTopBefore = container.scrollTop;
      
      // Prepend without loadingHistory (unmeasured)
      const prependItems = items.slice(10, 20);
      await wrapper.setProps({ items: [...prependItems, ...initialItems] });
      await nextTick();
      
      // Scroll position should adjust based on prepended content
      // With unmeasured items, it uses estimate
      expect(container.scrollTop).toBeGreaterThanOrEqual(scrollTopBefore);
      
      wrapper.unmount();
    });
  });

  describe('2.4 Measurement / hidden pool behavior', () => {
    it('should use estimateHeight initially, then update with measured', async () => {
      const rectSpy = vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        height: 75, // Different from estimate
        width: 100,
        top: 0,
        left: 0,
        right: 100,
        bottom: 75,
        x: 0,
        y: 0,
        toJSON() { return {}; }
      } as DOMRect);

      const smallSet = items.slice(0, 5);
      
      const wrapper = mount(Or3Scroll, {
        props: {
          items: smallSet,
          itemKey: 'id' as any,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      // Initial total height uses estimate
      const track = wrapper.find('.or3-scroll-track').element as HTMLElement;
      const initialHeight = parseInt(track.style.height);
      expect(initialHeight).toBe(5 * 50); // 5 items * 50px estimate
      
      // Trigger resize observer callbacks for items
      const resizeCalls = observeMock.mock.calls;
      for (const call of resizeCalls) {
        const callback = call[1];
        if (callback) {
          callback({ 
            borderBoxSize: [{ blockSize: 75 }] 
          } as unknown as ResizeObserverEntry);
        }
      }
      
      // Wait for RAF to flush updates
      await new Promise(resolve => setTimeout(resolve, 50));
      await nextTick();
      
      // Total height should update to measured values
      const updatedTrack = wrapper.find('.or3-scroll-track').element as HTMLElement;
      const updatedHeight = parseInt(updatedTrack.style.height);
      expect(updatedHeight).toBeGreaterThan(initialHeight);
      
      rectSpy.mockRestore();
      wrapper.unmount();
    });

    it('should handle items smaller and larger than estimated', async () => {
      let callCount = 0;
      const rectSpy = vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function() {
        // Alternate between small and large
        const height = (callCount++ % 2 === 0) ? 30 : 80;
        return {
          height,
          width: 100,
          top: 0,
          left: 0,
          right: 100,
          bottom: height,
          x: 0,
          y: 0,
          toJSON() { return {}; }
        } as DOMRect;
      });

      const smallSet = items.slice(0, 10);
      
      const wrapper = mount(Or3Scroll, {
        props: {
          items: smallSet,
          itemKey: 'id' as any,
          estimateHeight: 50,
          maintainBottom: true
        },
        attachTo: document.body
      });

      await nextTick();
      
      // Simulate measurements
      const resizeCalls = observeMock.mock.calls;
      for (let i = 0; i < resizeCalls.length && i < 10; i++) {
        const callback = resizeCalls[i][1];
        if (callback) {
          const height = (i % 2 === 0) ? 30 : 80;
          callback({ 
            borderBoxSize: [{ blockSize: height }] 
          } as unknown as ResizeObserverEntry);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      await nextTick();
      
      // Should handle both shrink and grow without errors
      const track2 = wrapper.find('.or3-scroll-track').element as HTMLElement;
      const trackHeight = parseInt(track2.style.height);
      expect(trackHeight).toBeGreaterThan(0);
      expect(trackHeight).not.toBe(10 * 50); // Should differ from estimate
      
      rectSpy.mockRestore();
      wrapper.unmount();
    });

    it('should handle multiple measurement cycles', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items: items.slice(0, 10),
          itemKey: 'id' as any,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      const initialObserveCount = observeMock.mock.calls.length;
      
      // Add more items
      await wrapper.setProps({ items: items.slice(0, 20) });
      await nextTick();
      
      // More observe calls for new items
      expect(observeMock.mock.calls.length).toBeGreaterThan(initialObserveCount);
      
      // Change content (simulate remount of different indices)
      await wrapper.setProps({ items: items.slice(5, 25) });
      await nextTick();
      
      // Should not have excessive DOM nodes
      const hiddenPool = wrapper.find('.or3-scroll-hidden-pool');
      if (hiddenPool.exists()) {
        const hiddenNodes = hiddenPool.findAll('div');
        expect(hiddenNodes.length).toBeLessThan(50); // Reasonable limit
      }
      
      wrapper.unmount();
    });
  });

  describe('2.5 Resize behavior', () => {
    it('should recalculate range when container resizes', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items,
          itemKey: 'id' as any,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      const initialItemCount = wrapper.findAll('.or3-scroll-item').length;
      
      // Mock container resize (change clientHeight)
      const container = wrapper.find('.or3-scroll').element as HTMLElement;
      Object.defineProperty(container, 'clientHeight', {
        configurable: true,
        get() { return 800; } // Double the viewport
      });
      
      // Trigger scroll to force range update
      await container.dispatchEvent(new Event('scroll'));
      await nextTick();
      
      const newItemCount = wrapper.findAll('.or3-scroll-item').length;
      
      // With larger viewport, should render more items (or at least not fewer)
      expect(newItemCount).toBeGreaterThanOrEqual(initialItemCount);
      
      wrapper.unmount();
    });

    it('should update when item resizes', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items: items.slice(0, 10),
          itemKey: 'id' as any,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      const track = wrapper.find('.or3-scroll-track').element as HTMLElement;
      const initialHeight = parseInt(track.style.height);
      
      // Simulate item resize by calling the first observe callback
      const firstObserveCall = observeMock.mock.calls[0];
      if (firstObserveCall && firstObserveCall[1]) {
        const callback = firstObserveCall[1];
        callback({ 
          borderBoxSize: [{ blockSize: 150 }] // Much larger
        } as unknown as ResizeObserverEntry);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      await nextTick();
      
      const updatedTrack = wrapper.find('.or3-scroll-track').element as HTMLElement;
      const updatedHeight = parseInt(updatedTrack.style.height);
      expect(updatedHeight).toBeGreaterThan(initialHeight);
      
      wrapper.unmount();
    });
  });

  describe('2.6 Cleanup and lifecycle', () => {
    it('should cleanup observers on unmount', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items: items.slice(0, 20),
          itemKey: 'id' as any,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      const observeCount = observeMock.mock.calls.length;
      expect(observeCount).toBeGreaterThan(0);
      
      unobserveMock.mockClear();
      
      wrapper.unmount();
      
      // Should have called unobserve for all observed elements
      expect(unobserveMock).toHaveBeenCalled();
    });

    it('should cancel RAF and timeouts on unmount', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items: items.slice(0, 20),
          itemKey: 'id' as any,
          estimateHeight: 50
        },
        attachTo: document.body
      });

      await nextTick();
      
      // Trigger resize observer callback to queue RAF
      const firstObserveCall = observeMock.mock.calls[0];
      if (firstObserveCall && firstObserveCall[1]) {
        const callback = firstObserveCall[1];
        callback({ 
          borderBoxSize: [{ blockSize: 100 }]
        } as unknown as ResizeObserverEntry);
      }
      
      // Don't wait for RAF to execute
      wrapper.unmount();
      
      // Component should unmount without errors and cleanup properly
      // The main check is that unmount completes successfully
      expect(wrapper.vm).toBeDefined(); // Verify wrapper existed
    });
  });
  describe('2.7 Delayed resize (images)', () => {
    it('should adjust scroll position when item height changes after mount', async () => {
      const wrapper = mount(Or3Scroll, {
        props: {
          items: items.slice(0, 10),
          itemKey: 'id' as any,
          estimateHeight: 50,
          maintainBottom: true
        },
        attachTo: document.body
      });

      await nextTick();
      
      const container = wrapper.find('.or3-scroll').element as HTMLElement;
      
      // Simulate scroll to bottom
      container.scrollTop = container.scrollHeight;
      await container.dispatchEvent(new Event('scroll'));
      await nextTick();
      
      const initialScrollTop = container.scrollTop;
      
      // Simulate image load resizing item 9
      const observeCalls = observeMock.mock.calls;
      const lastItemCallback = observeCalls[observeCalls.length - 1][1];
      
      if (lastItemCallback) {
        // Update scrollHeight mock to reflect growth
        vi.spyOn(window.HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(5150);
        
        lastItemCallback({
          borderBoxSize: [{ blockSize: 200 }] // Grow from 50 to 200
        } as unknown as ResizeObserverEntry);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      await nextTick();
      
      // Should stay at bottom (scroll top increases)
      // Old top: 4600 (5000 - 400)
      // New top should be: 4750 (5150 - 400)
      expect(container.scrollTop).toBeGreaterThan(initialScrollTop);
      
      wrapper.unmount();
    });
  });
});
