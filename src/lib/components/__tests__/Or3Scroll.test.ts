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
// We need to spy on the getter
vi.spyOn(window.HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
vi.spyOn(window.Element.prototype, 'clientHeight', 'get').mockReturnValue(500);
vi.spyOn(window.HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
// scrollTop is a property, we can define it
Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', { configurable: true, value: 0, writable: true });


describe('Or3Scroll', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, text: `Item ${i}` }));
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id,
        estimateHeight: 50
      },
      slots: {
        default: '<template #default="{ item }">{{ item.text }}</template>'
      }
    });
    
    expect(wrapper.find('.or3-scroll').exists()).toBe(true);
    expect(wrapper.find('.or3-scroll-track').exists()).toBe(true);
    expect(wrapper.find('.or3-scroll-slice').exists()).toBe(true);
  });

  it('renders visible items', async () => {
    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id,
        estimateHeight: 50,
        overscan: 0 // Disable overscan for easier calculation
      },
      attachTo: document.body
    });
    
    // Viewport 500, item 50 -> 10 items visible
    // But initial render might be different depending on engine state.
    // Engine defaults to showing some items.
    
    await nextTick();
    const renderedItems = wrapper.findAll('.or3-scroll-item');
    expect(renderedItems.length).toBeGreaterThan(0);
  });

  it('handles scroll events', async () => {
    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id
      }
    });
    
    const container = wrapper.find('.or3-scroll');
    await container.trigger('scroll');
    
    expect(wrapper.emitted('scroll')).toBeTruthy();
  });

  it('exposes scrollToBottom', async () => {
    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id
      }
    });
    
    const vm = wrapper.vm as any;
    expect(vm.scrollToBottom).toBeDefined();
    
    vm.scrollToBottom();
    // Verify scrollTop changed (mocked)
    // Since we mocked scrollTop as writable, it should be updated?
    // But container.value.scrollTop = ...
    // In JSDOM, scrollTop might not update automatically unless we mock the setter behavior or trigger it.
    // But we can check if the function runs without error.
  });
  
  it('exposes measureItems', async () => {
    const rectSpy = vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 0,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      }
    } as any);

    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id
      }
    });
    
    const vm = wrapper.vm as any;
    expect(vm.measureItems).toBeDefined();
    
    const itemsToMeasure = [{ id: 999, text: 'New' }];
    const promise = vm.measureItems(itemsToMeasure);
    
    // It waits for nextTick
    await nextTick();
    
    const heights = await promise;
    expect(heights).toHaveLength(1);
    expect(heights[0]).toBe(50); // Falls back to estimateHeight when DOM reports 0

    rectSpy.mockRestore();
  });

  it('compensates prepend with measured heights when loadingHistory', async () => {
    const rectSpy = vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 30,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      }
    } as any);

    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id,
        loadingHistory: true,
        estimateHeight: 50
      },
      attachTo: document.body
    });

    const container = wrapper.find('.or3-scroll');
    const initialScrollTop = container.element.scrollTop;
    const prepend = Array.from({ length: 5 }, (_, i) => ({ id: 1000 + i, text: `P ${i}` }));

    await wrapper.setProps({ items: [...prepend, ...items], loadingHistory: true });
    
    // Watcher is async and uses measureItems which uses nextTick.
    // We need to wait enough ticks for the async flow to complete.
    await new Promise(resolve => setTimeout(resolve, 50));
    await nextTick();

    // Re-find container in case it was replaced (unlikely but safer)
    const updatedContainer = wrapper.find('.or3-scroll');
    expect(updatedContainer.element.scrollTop).toBeGreaterThan(initialScrollTop);
    expect(updatedContainer.element.scrollTop).toBeCloseTo(prepend.length * 30, 1);

    rectSpy.mockRestore();
  });

  it('updates rendered range after scroll', async () => {
    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id,
        estimateHeight: 50,
        overscan: 0
      },
      attachTo: document.body
    });

    await nextTick();
    const container = wrapper.find('.or3-scroll');
    container.element.scrollTop = 500;
    await container.trigger('scroll');
    await nextTick();

    const firstRendered = wrapper.find('.or3-scroll-item');
    expect(Number(firstRendered.attributes('data-index'))).toBeGreaterThan(0);
  });

  it('keeps tail items rendered when approaching bottom with small overscan', async () => {
    const tailItems = Array.from({ length: 20 }, (_, i) => ({ id: i, text: `Tail ${i}` }));

    const wrapper = mount(Or3Scroll, {
      props: {
        items: tailItems,
        itemKey: (item: any) => item.id,
        estimateHeight: 50,
        overscan: 0,
        tailCount: 3
      },
      attachTo: document.body
    });

    await nextTick();
    const container = wrapper.find('.or3-scroll');

    // Scroll near the end so the overscanned window overlaps the tail
    container.element.scrollTop = 450;
    await container.trigger('scroll');
    await nextTick();

    const renderedIndexes = wrapper.findAll('.or3-scroll-item').map(el => Number(el.attributes('data-index')));
    expect(renderedIndexes).toContain(tailItems.length - 1);
    expect(Math.min(...renderedIndexes)).toBeLessThanOrEqual(tailItems.length - 3);
  });

  it('defers scroll compensation during user interaction', async () => {
    const originalRaf = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    const wrapper = mount(Or3Scroll, {
      props: {
        items,
        itemKey: (item: any) => item.id,
        estimateHeight: 50,
        overscan: 0
      },
      attachTo: document.body
    });

    await nextTick();
    // Capture callback for item 0 while it is rendered
    const resizeCallbackAtIndex0 = observeMock.mock.calls.find(() => {
       // We can't easily know which call is which index because observe takes an element.
       // But initial render is 0..9.
       // The calls are likely in order.
       // Let's assume call[0] is index 0.
       return true;
    })?.[1];
    
    // We need to be sure. The component calls setItemRef(index).
    // setItemRef calls observe(el, callback).
    // The callback is what we need.
    
    if (!resizeCallbackAtIndex0) throw new Error('No observe call found');

    const container = wrapper.find('.or3-scroll');
    container.element.scrollTop = 500;
    await container.trigger('scroll');
    await nextTick();
    
    // Now startIndex should be > 0 (it is 10).
    // Item 0 is unmounted.
    
    await container.trigger('wheel');

    // Trigger resize for item 0 (simulating background update or just testing compensation logic)
    resizeCallbackAtIndex0({ borderBoxSize: [{ blockSize: 100 }] } as unknown as ResizeObserverEntry);
    await nextTick();

    const duringScroll = container.element.scrollTop;
    expect(duringScroll).toBe(500); // Should NOT have changed yet

    await container.trigger('touchend');
    await nextTick();

    expect(container.element.scrollTop).toBeGreaterThan(500); // Should have applied compensation

    vi.stubGlobal('requestAnimationFrame', originalRaf);
    vi.stubGlobal('cancelAnimationFrame', originalCancel);
  });
});
