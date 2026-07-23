// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Or3Scroll from '../Or3Scroll.vue';

const { observeMock, unobserveMock } = vi.hoisted(() => ({
    observeMock: vi.fn(),
    unobserveMock: vi.fn(),
}));

vi.mock('../../measurement/observer', () => ({
    resizeObserverManager: {
        observe: observeMock,
        unobserve: unobserveMock,
    },
}));

vi.spyOn(window.HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
vi.spyOn(window.Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    value: 0,
    writable: true,
});

const items = Array.from({ length: 100 }, (_, id) => ({ id, text: `${id}` }));

describe('Or3Scroll hardening behavior', () => {
    beforeEach(() => vi.clearAllMocks());

    it('emits a prefetch range without mounting prefetched rows', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 0,
                prefetchOverscan: 5500,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();

        const events = wrapper.emitted('prefetchRange');
        expect(events?.[events.length - 1]?.[0]).toEqual({
            startIndex: 0,
            endIndex: 99,
        });
        expect(wrapper.findAll('.or3-scroll-item').length).toBeLessThan(10);
        wrapper.unmount();
    });

    it('coalesces native scroll work to the latest position in one frame', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 0,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        const element = wrapper.find('.or3-scroll').element as HTMLElement;

        for (const top of [100, 200, 300]) {
            element.scrollTop = top;
            element.dispatchEvent(new Event('scroll'));
        }
        await nextTick();

        expect(wrapper.emitted('scroll')).toHaveLength(1);
        expect(wrapper.emitted('scroll')?.[0]?.[0]).toMatchObject({
            scrollTop: 300,
        });
        wrapper.unmount();
    });

    it('ignores fractional public scroll indices', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items,
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();

        (wrapper.vm as unknown as {
            scrollToIndex: (index: number) => void;
        }).scrollToIndex(0.5);

        expect((wrapper.find('.or3-scroll').element as HTMLElement).scrollTop).toBe(0);
        wrapper.unmount();
    });

    it('emits boundary events once per crossing with hysteresis', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items,
                itemKey: 'id' as never,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        const element = wrapper.find('.or3-scroll').element as HTMLElement;

        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        expect(wrapper.emitted('reachTop')).toHaveLength(1);

        element.scrollTop = 2;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        element.scrollTop = 0;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        expect(wrapper.emitted('reachTop')).toHaveLength(2);
        wrapper.unmount();
    });

    it('reconciles measured heights by key after a middle reorder', async () => {
        const initial = items.slice(0, 6);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: false,
                mutationMode: 'arbitrary',
            },
            attachTo: document.body,
        });
        await nextTick();
        const measuredIndexOne = observeMock.mock.calls.find(
            ([element]) => (element as HTMLElement).dataset.index === '1'
        );
        expect(measuredIndexOne).toBeTruthy();
        measuredIndexOne?.[1]({
            borderBoxSize: [{ blockSize: 90 }],
        } as unknown as ResizeObserverEntry);
        await nextTick();

        await wrapper.setProps({
            items: [initial[0], initial[2], initial[3], initial[4], initial[1], initial[5]],
        });
        await nextTick();
        (wrapper.vm as unknown as {
            scrollToItemKey: (key: number) => void;
        }).scrollToItemKey(3);
        await nextTick();

        expect((wrapper.find('.or3-scroll').element as HTMLElement).scrollTop).toBe(100);
        wrapper.unmount();
    });

    it('reconciles an in-place same-length reorder in arbitrary mode', async () => {
        const mutableItems = reactive(items.slice(0, 20));
        const wrapper = mount(Or3Scroll, {
            props: {
                items: mutableItems,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: false,
                mutationMode: 'arbitrary',
            },
            attachTo: document.body,
        });
        await nextTick();
        const measuredIndexFifteen = observeMock.mock.calls.find(
            ([element]) => (element as HTMLElement).dataset.index === '15'
        );
        measuredIndexFifteen?.[1]({
            borderBoxSize: [{ blockSize: 90 }],
        } as unknown as ResizeObserverEntry);
        await nextTick();

        mutableItems.reverse();
        await nextTick();
        (wrapper.vm as unknown as {
            scrollToItemKey: (key: number) => void;
        }).scrollToItemKey(10);
        await nextTick();

        expect((wrapper.find('.or3-scroll').element as HTMLElement).scrollTop).toBe(490);
        wrapper.unmount();
    });

    it('does not jump to the top when the first visible row is promoted', async () => {
        const initial = items.slice(0, 30);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: false,
                mutationMode: 'arbitrary',
            },
            attachTo: document.body,
        });
        await nextTick();

        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.scrollTop = 500;
        element.getBoundingClientRect = () =>
            ({
                top: 0,
                bottom: 200,
                height: 200,
            }) as DOMRect;
        for (const item of wrapper.findAll('.or3-scroll-item')) {
            const row = item.element as HTMLElement;
            const index = Number(row.dataset.index);
            row.getBoundingClientRect = () => {
                const top = index * 50 - element.scrollTop;
                return {
                    top,
                    bottom: top + 50,
                    height: 50,
                } as DOMRect;
            };
        }
        element.dispatchEvent(new Event('scroll'));
        await nextTick();

        const promoted = initial[10];
        await wrapper.setProps({
            items: [promoted, ...initial.filter((item) => item !== promoted)],
        });
        await nextTick();

        expect(element.scrollTop).toBe(500);
        wrapper.unmount();
    });

    it('subtracts top padding from rendered and prefetched content offsets', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items: items.slice(0, 20),
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 0,
                prefetchOverscan: 1,
                paddingTop: 100,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.scrollTop = 100;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();

        expect(wrapper.find('.or3-scroll-item').attributes('data-index')).toBe('0');
        const prefetchEvents = wrapper.emitted('prefetchRange');
        expect(prefetchEvents?.[prefetchEvents.length - 1]?.[0]).toMatchObject({
            startIndex: 0,
        });
        wrapper.unmount();
    });

    it('re-registers same-key row measurements after a content reset', async () => {
        const reusedItems = items.slice(0, 3);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: reusedItems,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: false,
                contentKey: 'thread-a',
            },
            attachTo: document.body,
        });
        await nextTick();
        const initialObserveCount = observeMock.mock.calls.length;

        await wrapper.setProps({ contentKey: 'thread-b' });
        await nextTick();

        expect(unobserveMock).toHaveBeenCalled();
        expect(observeMock.mock.calls.length).toBeGreaterThan(initialObserveCount);
        wrapper.unmount();
    });

    it('invalidates pending jump correction when contentKey changes', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items: items.slice(0, 20),
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: false,
                contentKey: 'thread-a',
            },
            attachTo: document.body,
        });
        await nextTick();
        (wrapper.vm as unknown as {
            scrollToIndex: (index: number) => void;
        }).scrollToIndex(10);

        await wrapper.setProps({
            contentKey: 'thread-b',
            items: items.slice(40, 60),
        });
        await nextTick();
        await nextTick();

        expect((wrapper.find('.or3-scroll').element as HTMLElement).scrollTop).toBe(0);
        wrapper.unmount();
    });

    it('establishes the initial bottom after contentKey and items change together', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items: items.slice(0, 20),
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: true,
                contentKey: 'thread-a',
            },
            attachTo: document.body,
        });
        await nextTick();
        (wrapper.vm as unknown as {
            scrollToIndex: (index: number) => void;
        }).scrollToIndex(10);

        await wrapper.setProps({
            contentKey: 'thread-b',
            items: items.slice(40, 60),
        });
        await nextTick();
        await nextTick();
        await nextTick();

        expect((wrapper.find('.or3-scroll').element as HTMLElement).scrollTop).toBe(800);
        wrapper.unmount();
    });

    it('does not let an early native scrollend redirect a jump to bottom', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items,
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: true,
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;

        (wrapper.vm as unknown as {
            scrollToIndex: (index: number) => void;
        }).scrollToIndex(10);
        element.dispatchEvent(new Event('scrollend'));
        await nextTick();

        expect(element.scrollTop).toBe(500);
        wrapper.unmount();
    });

    it('does not compensate an unchanged layout when user scrolling ends', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items: items.slice(0, 20),
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();

        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.scrollTop = 300;
        element.getBoundingClientRect = () =>
            ({
                top: 0,
                bottom: 200,
                height: 200,
            }) as DOMRect;
        for (const item of wrapper.findAll('.or3-scroll-item')) {
            const row = item.element as HTMLElement;
            const index = Number(row.dataset.index);
            row.getBoundingClientRect = () => {
                const top = index * 50 - element.scrollTop + 8;
                return {
                    top,
                    bottom: top + 50,
                    height: 50,
                } as DOMRect;
            };
        }

        element.dispatchEvent(new WheelEvent('wheel', { deltaY: 300 }));
        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        element.dispatchEvent(new Event('scrollend'));
        await nextTick();
        const compensatedTop = element.scrollTop;
        expect(compensatedTop).toBe(300);

        element.dispatchEvent(new Event('scrollend'));
        await nextTick();
        expect(element.scrollTop).toBe(compensatedTop);
        wrapper.unmount();
    });

    it('gives an active user gesture priority over same-frame arbitrary content', async () => {
        const initial = items.slice(0, 20);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: true,
                mutationMode: 'arbitrary',
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.scrollTop = 800;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();

        element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
        element.scrollTop = 100;
        element.dispatchEvent(new Event('scroll'));
        element.dispatchEvent(new Event('scrollend'));
        await wrapper.setProps({ items: [...initial, items[20]] });
        await nextTick();

        expect(element.scrollTop).toBe(100);
        wrapper.unmount();
    });

    it('keeps the committed track height stable while an active gesture truncates rows', async () => {
        const initial = items.slice(0, 20);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        const track = wrapper.find('.or3-scroll-track');
        element.scrollTop = 300;
        element.dispatchEvent(new WheelEvent('wheel', { deltaY: -50 }));

        await wrapper.setProps({ items: initial.slice(0, 10) });
        await nextTick();
        expect(track.attributes('style')).toContain('height: 1000px');

        element.dispatchEvent(new Event('scrollend'));
        await nextTick();
        expect(track.attributes('style')).toContain('height: 500px');
        wrapper.unmount();
    });

    it('does not commit measurement growth between gesture start and movement', async () => {
        const initial = items.slice(0, 20);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: true,
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        const track = wrapper.find('.or3-scroll-track');
        element.dispatchEvent(new WheelEvent('wheel', { deltaY: -50 }));
        const firstObserver = observeMock.mock.calls.find(
            ([observed]) => (observed as HTMLElement).dataset.index === '0'
        );
        firstObserver?.[1]({
            borderBoxSize: [{ blockSize: 75 }],
        } as unknown as ResizeObserverEntry);
        await nextTick();

        expect(track.attributes('style')).toContain('height: 1000px');
        element.dispatchEvent(new Event('scrollend'));
        await nextTick();
        expect(track.attributes('style')).toContain('height: 1025px');
        wrapper.unmount();
    });

    it('refreshes exposed bottom state after structural changes', async () => {
        const initial = items.slice(0, 4);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();

        await wrapper.setProps({ items: [...initial, items[4]] });
        await nextTick();

        expect((wrapper.vm as unknown as { isAtBottom: boolean }).isAtBottom).toBe(false);
        wrapper.unmount();
    });

    it('preserves the visible anchor when measuring with top padding', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items: items.slice(0, 20),
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                paddingTop: 28,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();

        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.scrollTop = 300;
        element.getBoundingClientRect = () =>
            ({
                top: 0,
                bottom: 200,
                height: 200,
            }) as DOMRect;
        for (const item of wrapper.findAll('.or3-scroll-item')) {
            const row = item.element as HTMLElement;
            const index = Number(row.dataset.index);
            row.getBoundingClientRect = () => {
                const top = 28 + index * 50 - element.scrollTop;
                return {
                    top,
                    bottom: top + 50,
                    height: 50,
                } as DOMRect;
            };
        }
        element.dispatchEvent(new Event('scroll'));
        await nextTick();

        const firstRowObserver = observeMock.mock.calls.find(
            ([observed]) => (observed as HTMLElement).dataset.index === '0'
        );
        expect(firstRowObserver).toBeTruthy();
        firstRowObserver?.[1]({
            borderBoxSize: [{ blockSize: 75 }],
        } as unknown as ResizeObserverEntry);
        await nextTick();

        // The row above the viewport grew by 25px, so preserving the same
        // within-row anchor moves scrollTop from 300px to 325px. Top padding
        // is part of both coordinate conversions and must not create drift.
        expect(element.scrollTop).toBe(325);
        wrapper.unmount();
    });

    it('anchors resize compensation to the pre-layout virtualizer model', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items: items.slice(0, 20),
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();

        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.scrollTop = 300;
        let browserLayoutShift = 0;
        element.getBoundingClientRect = () =>
            ({ top: 0, bottom: 200, height: 200 }) as DOMRect;
        for (const item of wrapper.findAll('.or3-scroll-item')) {
            const row = item.element as HTMLElement;
            const index = Number(row.dataset.index);
            row.getBoundingClientRect = () => {
                const top = index * 50 - element.scrollTop + browserLayoutShift;
                return { top, bottom: top + 50, height: 50 } as DOMRect;
            };
        }
        element.dispatchEvent(new Event('scroll'));
        await nextTick();

        const firstRowObserver = observeMock.mock.calls.find(
            ([observed]) => (observed as HTMLElement).dataset.index === '0'
        );
        browserLayoutShift = 25;
        firstRowObserver?.[1]({
            borderBoxSize: [{ blockSize: 75 }],
        } as unknown as ResizeObserverEntry);
        await nextTick();

        expect(element.scrollTop).toBe(325);
        wrapper.unmount();
    });

    it('clears old interaction state when contentKey resets the list', async () => {
        const first = items.slice(0, 10);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: first,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 1000,
                maintainBottom: false,
                contentKey: 'thread-a',
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }));

        await wrapper.setProps({
            contentKey: 'thread-b',
            items: items.slice(20, 30),
        });
        await nextTick();
        const resetObserveCount = observeMock.mock.calls.length;
        const resetRowObserver = observeMock.mock.calls
            .slice(0, resetObserveCount)
            .reverse()
            .find(([observed]) => (observed as HTMLElement).dataset.index === '0');
        resetRowObserver?.[1]({
            borderBoxSize: [{ blockSize: 75 }],
        } as unknown as ResizeObserverEntry);
        await nextTick();

        expect(wrapper.find('.or3-scroll-track').attributes('style')).toContain(
            'height: 525px'
        );
        wrapper.unmount();
    });

    it('releases row ref callbacks when virtual rows unmount', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 0,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        const firstCallback = observeMock.mock.calls.find(
            ([observed]) => (observed as HTMLElement).dataset.index === '0'
        )?.[1];

        element.scrollTop = 1000;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        await nextTick();
        element.scrollTop = 0;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        await nextTick();

        const callbacksForFirstRow = observeMock.mock.calls
            .filter(([observed]) => (observed as HTMLElement).dataset.index === '0')
            .map(([, callback]) => callback);
        expect(callbacksForFirstRow[callbacksForFirstRow.length - 1]).not.toBe(
            firstCallback
        );
        wrapper.unmount();
    });

    it('does not mount a full hidden copy of a prepended history page', async () => {
        const initial = items.slice(50, 70);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                overscan: 0,
                loadingHistory: true,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();
        const prepend = Array.from({ length: 1000 }, (_, id) => ({
            id: 1000 + id,
            text: `history-${id}`,
        }));

        await wrapper.setProps({ items: [...prepend, ...initial] });
        await nextTick();

        expect(wrapper.find('.or3-scroll-hidden-pool').exists()).toBe(false);
        expect(wrapper.findAll('.or3-scroll-item').length).toBeLessThan(20);
        wrapper.unmount();
    });

    it('renders the prepend loader outside the translated slice', async () => {
        const wrapper = mount(Or3Scroll, {
            props: {
                items: items.slice(0, 20),
                itemKey: 'id' as never,
                loadingHistory: true,
                maintainBottom: false,
            },
            slots: {
                'prepend-loading': '<div data-test="loader">Loading</div>',
            },
            attachTo: document.body,
        });
        await nextTick();

        const loader = wrapper.find('.or3-scroll-prepend-loading');
        expect(loader.exists()).toBe(true);
        expect(loader.element.parentElement).toBe(
            wrapper.find('.or3-scroll-track').element
        );
        expect(wrapper.find('.or3-scroll-slice [data-test="loader"]').exists()).toBe(
            false
        );
        wrapper.unmount();
    });

    it('finishes same-frame scroll work before native scrollend commits', async () => {
        const initial = items.slice(0, 20);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: false,
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;
        element.scrollTop = 300;
        element.dispatchEvent(new Event('scroll'));
        element.dispatchEvent(new Event('scrollend'));

        await wrapper.setProps({ items: initial.slice(0, 10) });
        await nextTick();

        expect(wrapper.find('.or3-scroll-track').attributes('style')).toContain(
            'height: 500px'
        );
        wrapper.unmount();
    });

    it('does not finish touch scrolling until the touch is released', async () => {
        vi.useFakeTimers();
        try {
            const initial = items.slice(0, 20);
            const wrapper = mount(Or3Scroll, {
                props: {
                    items: initial,
                    itemKey: 'id' as never,
                    estimateHeight: 50,
                    overscan: 1000,
                    maintainBottom: false,
                },
                attachTo: document.body,
            });
            await nextTick();
            const element = wrapper.find('.or3-scroll').element as HTMLElement;
            element.dispatchEvent(new TouchEvent('touchstart'));
            await vi.advanceTimersByTimeAsync(200);

            const firstRowObserver = observeMock.mock.calls.find(
                ([observed]) => (observed as HTMLElement).dataset.index === '0'
            );
            firstRowObserver?.[1]({
                borderBoxSize: [{ blockSize: 75 }],
            } as unknown as ResizeObserverEntry);
            await nextTick();
            expect(wrapper.find('.or3-scroll-track').attributes('style')).toContain(
                'height: 1000px'
            );

            element.dispatchEvent(new TouchEvent('touchend'));
            await vi.advanceTimersByTimeAsync(140);
            await nextTick();
            expect(wrapper.find('.or3-scroll-track').attributes('style')).toContain(
                'height: 1025px'
            );
            wrapper.unmount();
        } finally {
            vi.useRealTimers();
        }
    });

    it('treats maintainBottom=false as a suspension until physically at bottom', async () => {
        const initial = items.slice(0, 20);
        const wrapper = mount(Or3Scroll, {
            props: {
                items: initial,
                itemKey: 'id' as never,
                estimateHeight: 50,
                maintainBottom: true,
            },
            attachTo: document.body,
        });
        await nextTick();
        const element = wrapper.find('.or3-scroll').element as HTMLElement;

        await wrapper.setProps({ maintainBottom: false });
        element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
        element.scrollTop = 300;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();

        await wrapper.setProps({ items: [...initial, items[20]] });
        await wrapper.setProps({ maintainBottom: true });
        await wrapper.setProps({ items: [...initial, items[20], items[21]] });
        await nextTick();
        expect(element.scrollTop).toBe(300);

        element.dispatchEvent(new WheelEvent('wheel', { deltaY: 600 }));
        element.scrollTop = 900;
        element.dispatchEvent(new Event('scroll'));
        await nextTick();
        element.dispatchEvent(new Event('scrollend'));
        await nextTick();
        await wrapper.setProps({
            items: [...initial, items[20], items[21], items[22]],
        });
        await nextTick();
        await nextTick();
        expect(element.scrollTop).toBe(950);
        wrapper.unmount();
    });
});
