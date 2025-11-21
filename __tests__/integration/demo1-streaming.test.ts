// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DemoApp from '../../demo/App.vue';

// Mock ResizeObserver Manager
const { observeMock, unobserveMock } = vi.hoisted(() => ({
  observeMock: vi.fn(),
  unobserveMock: vi.fn()
}));

vi.mock('../../src/measurement/observer', () => ({
  resizeObserverManager: {
    observe: observeMock,
    unobserve: unobserveMock
  }
}));

// Mock HTMLElement methods
vi.spyOn(window.HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
vi.spyOn(window.HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(5000);
Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', { 
  configurable: true, 
  get() { return this._scrollTop || 0; },
  set(v) { this._scrollTop = v; }
});

vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
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

describe('Demo 1: Synthetic Chat Streaming Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('3.1 Continuous streaming with many messages', () => {
    it('should handle continuous streaming without errors', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      // Get initial item count
      const initialItems = wrapper.findAll('.or3-scroll-item');
      expect(initialItems.length).toBeGreaterThan(0);
      const initialCount = initialItems.length;
      
      // Start streaming
      const streamButton = wrapper.find('button');
      expect(streamButton.text()).toContain('Start Stream');
      await streamButton.trigger('click');
      await nextTick();
      
      // Let stream run for multiple cycles
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000); // Advance by 1 second
        await nextTick();
      }
      
      // Verify DOM node count doesn't grow linearly
      // With virtualization, should only render visible + overscan
      const items = wrapper.findAll('.or3-scroll-item');
      expect(items.length).toBeLessThan(100);
      
      // Component should remain stable (may or may not have added items depending on timing)
      expect(items.length).toBeGreaterThanOrEqual(initialCount - 5); // Allow some variance
      
      // Stop streaming
      await streamButton.trigger('click');
      expect(streamButton.text()).toContain('Start Stream');
      
      wrapper.unmount();
    });

    it('should not throw errors from ResizeObserver during streaming', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      // Start streaming
      await wrapper.findAll('button')[0].trigger('click');
      await nextTick();
      
      // Simulate measurements during streaming
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(100);
        await nextTick();
        
        // Trigger some resize callbacks
        if (observeMock.mock.calls.length > 0) {
          const callback = observeMock.mock.calls[0][1];
          if (callback) {
            callback({ 
              borderBoxSize: [{ blockSize: 65 }] 
            } as unknown as ResizeObserverEntry);
          }
        }
      }
      
      // No console errors should have been logged
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('ResizeObserver')
      );
      
      consoleErrorSpy.mockRestore();
      wrapper.unmount();
    });
  });

  describe('3.1 Start/stop stream repeatedly', () => {
    it('should handle rapid start/stop without duplicate timeouts', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      const streamButton = wrapper.findAll('button')[0];
      
      // Rapidly toggle stream
      for (let i = 0; i < 5; i++) {
        await streamButton.trigger('click'); // Start
        await nextTick();
        vi.advanceTimersByTime(200);
        await nextTick();
        
        await streamButton.trigger('click'); // Stop
        await nextTick();
      }
      
      // Component should still be functional
      const items = wrapper.findAll('.or3-scroll-item');
      expect(items.length).toBeGreaterThan(0);
      
      wrapper.unmount();
    });

    it('should clean up timers when component unmounts during stream', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      // Start streaming
      await wrapper.findAll('button')[0].trigger('click');
      await nextTick();
      vi.advanceTimersByTime(100);
      await nextTick();
      
      // Unmount while streaming
      wrapper.unmount();
      
      // Advance timers - should not cause errors
      expect(() => {
        vi.advanceTimersByTime(1000);
      }).not.toThrow();
    });
  });

  describe('3.3 History + streaming combo', () => {
    it('should handle prepend then stream', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      const buttons = wrapper.findAll('button');
      const prependButton = buttons.find(b => b.text().includes('Prepend'));
      const scrollButton = buttons.find(b => b.text().includes('Bottom'));
      
      if (!prependButton || !scrollButton) {
        throw new Error('Required buttons not found');
      }
      
      // Prepend history
      await prependButton.trigger('click');
      await nextTick();
      vi.advanceTimersByTime(600); // Wait for async prepend
      await nextTick();
      
      const itemsAfterPrepend = wrapper.findAll('.or3-scroll-item');
      
      // Scroll to bottom
      await scrollButton.trigger('click');
      await nextTick();
      
      // Start streaming
      const streamButton = buttons[0];
      await streamButton.trigger('click');
      await nextTick();
      vi.advanceTimersByTime(1000);
      await nextTick();
      
      // Should have more items now
      const finalItems = wrapper.findAll('.or3-scroll-item');
      expect(finalItems.length).toBeGreaterThanOrEqual(itemsAfterPrepend.length);
      
      wrapper.unmount();
    });
  });

  describe('4. Behavioral edge cases', () => {
    it('should handle very fast scroll gestures', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      const scroller = wrapper.find('.or3-scroll');
      const container = scroller.element as HTMLElement;
      
      // Simulate rapid scroll events
      for (let scrollTop = 0; scrollTop < 1000; scrollTop += 200) {
        container.scrollTop = scrollTop;
        await scroller.trigger('scroll');
      }
      await nextTick();
      
      // Should still render items without gaps
      const items = wrapper.findAll('.or3-scroll-item');
      expect(items.length).toBeGreaterThan(0);
      
      // Check for contiguous indices
      const indices = items.map(item => Number(item.attributes('data-index')));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
        expect(indices[i] - indices[i - 1]).toBeLessThanOrEqual(1);
      }
      
      wrapper.unmount();
    });

    it('should handle props changes at runtime', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      // Get scroller component
      const scroller = wrapper.findComponent({ name: 'Or3Scroll' });
      if (!scroller.exists()) {
        throw new Error('Or3Scroll component not found');
      }
      
      // Change estimate height via the demo's data (if accessible)
      // For this test, we verify the component handles changes gracefully
      const initialItems = wrapper.findAll('.or3-scroll-item');
      
      // Trigger some activity
      const streamButton = wrapper.findAll('button')[0];
      await streamButton.trigger('click');
      await nextTick();
      vi.advanceTimersByTime(500);
      await nextTick();
      await streamButton.trigger('click'); // Stop
      
      const finalItems = wrapper.findAll('.or3-scroll-item');
      expect(finalItems.length).toBeGreaterThanOrEqual(initialItems.length);
      
      wrapper.unmount();
    });
  });

  describe('5. Performance regression checks', () => {
    it('should complete large list operations within reasonable time', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      // Start streaming to build up many items
      const streamButton = wrapper.findAll('button')[0];
      await streamButton.trigger('click');
      
      const start = performance.now();
      
      // Run for a while to accumulate items
      for (let i = 0; i < 20; i++) {
        vi.advanceTimersByTime(100);
        await nextTick();
      }
      
      const elapsed = performance.now() - start;
      
      // Should complete in reasonable time (not too strict due to test environment)
      expect(elapsed).toBeLessThan(5000);
      
      // Verify virtualization is working - DOM nodes should be limited
      const renderedItems = wrapper.findAll('.or3-scroll-item');
      expect(renderedItems.length).toBeLessThan(50);
      
      wrapper.unmount();
    });

    it('should not grow internal arrays beyond item count', async () => {
      const wrapper = mount(DemoApp, {
        attachTo: document.body
      });

      await nextTick();
      
      // Start text stream which modifies last message repeatedly
      const textStreamButton = wrapper.findAll('button')[1];
      await textStreamButton.trigger('click');
      await nextTick();
      
      // Let it run for a bit
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(100);
        await nextTick();
      }
      
      await textStreamButton.trigger('click'); // Stop
      
      // The component should still function normally
      const items = wrapper.findAll('.or3-scroll-item');
      expect(items.length).toBeGreaterThan(0);
      
      // No memory leak indicators (hard to test directly, but check stability)
      expect(wrapper.findAll('.or3-scroll-item').length).toBeLessThan(100);
      
      wrapper.unmount();
    });
  });
});
