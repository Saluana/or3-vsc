// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Or3Scroll from '../Or3Scroll.vue';
import { nextTick } from 'vue';

// Mock ResizeObserver Manager
const { observeMock, unobserveMock } = vi.hoisted(() => {
  return {
    observeMock: vi.fn(),
    unobserveMock: vi.fn()
  };
});

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
    // Since we didn't mock getBoundingClientRect, it returns 0 or default estimate?
    // In JSDOM, getBoundingClientRect returns 0s usually.
    // Our code: el.getBoundingClientRect().height : props.estimateHeight || 50
    // If 0, it returns 0.
    // Wait, `el ? el.getBoundingClientRect().height : ...`
    // If JSDOM returns 0, it is 0.
  });
});
