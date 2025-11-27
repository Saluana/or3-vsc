// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import Or3Scroll from '../Or3Scroll.vue';
import { nextTick, ref } from 'vue';

/**
 * This test suite investigates the issue where high overscan values
 * cause inconsistent scroll positioning when switching threads.
 *
 * Scenario:
 * - ChatContainer uses Or3Scroll with overscan: 6500px
 * - paddingBottom: ~216px (to clear the input overlay)
 * - When switching threads, the last message should be consistently
 *   positioned above the input, but instead appears at varying distances.
 */

// Mock ResizeObserver callbacks - we'll trigger them manually
const observerCallbacks = new Map<
    HTMLElement,
    (entry: ResizeObserverEntry) => void
>();
const { observeMock, unobserveMock } = vi.hoisted(() => ({
    observeMock: vi.fn(
        (el: HTMLElement, callback: (entry: ResizeObserverEntry) => void) => {
            observerCallbacks.set(el, callback);
        }
    ),
    unobserveMock: vi.fn((el: HTMLElement) => {
        observerCallbacks.delete(el);
    }),
}));

vi.mock('../../measurement/observer', () => ({
    resizeObserverManager: {
        observe: observeMock,
        unobserve: unobserveMock,
    },
}));

describe('High Overscan Thread Switching', () => {
    let scrollTopValue = 0;
    let mockScrollHeight = 1000;
    let mockClientHeight = 850;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        observerCallbacks.clear();
        scrollTopValue = 0;
        mockScrollHeight = 1000;
        mockClientHeight = 850;

        // Mock clientHeight (viewport)
        vi.spyOn(
            window.HTMLElement.prototype,
            'clientHeight',
            'get'
        ).mockImplementation(function (this: HTMLElement) {
            if (this.classList?.contains('or3-scroll')) {
                return mockClientHeight;
            }
            return 100;
        });

        // Mock scrollHeight - this should reflect the track height
        vi.spyOn(
            window.HTMLElement.prototype,
            'scrollHeight',
            'get'
        ).mockImplementation(function (this: HTMLElement) {
            if (this.classList?.contains('or3-scroll')) {
                // Return track height based on the track element
                const track = this.querySelector(
                    '.or3-scroll-track'
                ) as HTMLElement;
                if (track) {
                    const style = track.getAttribute('style') || '';
                    const match = style.match(/height:\s*(\d+)px/);
                    if (match) {
                        return parseInt(match[1], 10);
                    }
                }
                return mockScrollHeight;
            }
            return 100;
        });

        // Mock scrollTop with getter/setter
        Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            get() {
                return scrollTopValue;
            },
            set(v: number) {
                // Clamp to valid range like real browser
                // Use actual scrollHeight from the element for clamping
                const actualScrollHeight =
                    (this as HTMLElement).scrollHeight || mockScrollHeight;
                const actualClientHeight =
                    (this as HTMLElement).clientHeight || mockClientHeight;
                const maxScroll = Math.max(
                    0,
                    actualScrollHeight - actualClientHeight
                );
                scrollTopValue = Math.max(0, Math.min(v, maxScroll));
            },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Helper to create thread messages
    const createThread = (
        id: string,
        count: number,
        heights: number[] = []
    ) => {
        return Array.from({ length: count }, (_, i) => ({
            id: `${id}-msg-${i}`,
            text: `Message ${i} in thread ${id}`,
            height: heights[i] || 80, // Default estimate height
        }));
    };

    // Helper to trigger resize observer for an element
    const triggerResize = (el: HTMLElement, height: number) => {
        const callback = observerCallbacks.get(el);
        if (callback) {
            callback({
                borderBoxSize: [{ blockSize: height }],
                contentRect: { height } as DOMRectReadOnly,
            } as unknown as ResizeObserverEntry);
        }
    };

    // Helper to trigger all pending resize observers with actual heights
    const measureAllItems = (wrapper: VueWrapper, heights: number[]) => {
        const items = wrapper.findAll('.or3-scroll-item');
        items.forEach((item, i) => {
            const el = item.element as HTMLElement;
            const height = heights[i] || 80;
            triggerResize(el, height);
        });
    };

    it('should maintain consistent bottom position with high overscan', async () => {
        const items = ref(createThread('A', 10));

        const wrapper = mount(Or3Scroll as any, {
            props: {
                items: items.value,
                itemKey: (item: any) => item.id,
                estimateHeight: 80,
                overscan: 6500, // High overscan like ChatContainer
                paddingBottom: 216,
                paddingTop: 28,
                maintainBottom: true,
            },
            slots: {
                default: `<template #default="{ item }"><div :style="{ height: item.height + 'px' }">{{ item.text }}</div></template>`,
            },
            attachTo: document.body,
        });

        await nextTick();
        vi.advanceTimersByTime(16);
        await nextTick();

        // Measure all items with varying heights
        const threadAHeights = [100, 150, 80, 200, 90, 120, 80, 300, 100, 150];
        measureAllItems(wrapper, threadAHeights);

        vi.advanceTimersByTime(16);
        await nextTick();
        await nextTick();

        // Calculate expected total height
        const totalContentHeight = threadAHeights.reduce((a, b) => a + b, 0); // 1370
        const expectedTrackHeight = totalContentHeight + 28 + 216; // 1614

        // Update mock to reflect actual track height
        mockScrollHeight = expectedTrackHeight;

        // Trigger scrollToBottom
        const scrollApi = wrapper.vm as any;
        scrollApi.scrollToBottom();
        await nextTick();

        const expectedScrollTop = Math.max(
            0,
            expectedTrackHeight - mockClientHeight
        );
        console.log('Thread A:', {
            totalContentHeight,
            expectedTrackHeight,
            expectedScrollTop,
            actualScrollTop: scrollTopValue,
        });

        // The scroll position should put us at the bottom
        expect(scrollTopValue).toBe(expectedScrollTop);

        // Now switch to Thread B with different message count
        const threadB = createThread('B', 6);
        const threadBHeights = [80, 120, 500, 90, 100, 80]; // One tall message (image)

        items.value = threadB;
        await wrapper.setProps({ items: threadB });
        await nextTick();
        vi.advanceTimersByTime(16);
        await nextTick();

        // Measure Thread B items
        measureAllItems(wrapper, threadBHeights);

        vi.advanceTimersByTime(16);
        await nextTick();
        await nextTick();

        const totalContentHeightB = threadBHeights.reduce((a, b) => a + b, 0); // 970
        const expectedTrackHeightB = totalContentHeightB + 28 + 216; // 1214
        mockScrollHeight = expectedTrackHeightB;

        // Wait for the double RAF in thread switch
        vi.advanceTimersByTime(32);
        await nextTick();
        await nextTick();

        scrollApi.scrollToBottom();
        await nextTick();

        const expectedScrollTopB = Math.max(
            0,
            expectedTrackHeightB - mockClientHeight
        );
        console.log('Thread B:', {
            totalContentHeightB,
            expectedTrackHeightB,
            expectedScrollTopB,
            actualScrollTop: scrollTopValue,
        });

        // Should be at bottom of Thread B
        expect(scrollTopValue).toBe(expectedScrollTopB);

        // The key test: distance from bottom should be 0
        const distanceFromBottom =
            mockScrollHeight - scrollTopValue - mockClientHeight;
        expect(distanceFromBottom).toBe(0);

        wrapper.unmount();
    });

    it('should handle measurement timing with high overscan', async () => {
        /**
         * This test simulates the real-world scenario where:
         * 1. Thread loads with estimate heights
         * 2. scrollToBottom is called
         * 3. ResizeObserver measures actual heights (async)
         * 4. Heights update, potentially changing total height significantly
         * 5. The scroll position should still end up at the correct bottom
         */

        const items = ref(createThread('A', 10));

        const wrapper = mount(Or3Scroll as any, {
            props: {
                items: items.value,
                itemKey: (item: any) => item.id,
                estimateHeight: 80,
                overscan: 6500,
                paddingBottom: 216,
                paddingTop: 28,
                maintainBottom: true,
            },
            slots: {
                default: `<template #default="{ item }"><div>{{ item.text }}</div></template>`,
            },
            attachTo: document.body,
        });

        await nextTick();

        // Initial state: all items at estimate height (80px)
        // Total = 10 * 80 = 800 + 28 + 216 = 1044
        const initialTrackHeight = 10 * 80 + 28 + 216;
        mockScrollHeight = initialTrackHeight;

        vi.advanceTimersByTime(16);
        await nextTick();

        // First scrollToBottom with estimate heights
        const scrollApi = wrapper.vm as any;
        scrollApi.scrollToBottom();
        await nextTick();

        const initialScrollTop = scrollTopValue;
        console.log('Initial (estimates):', {
            trackHeight: initialTrackHeight,
            scrollTop: initialScrollTop,
            distanceFromBottom:
                initialTrackHeight - initialScrollTop - mockClientHeight,
        });

        // Now simulate ResizeObserver callbacks with ACTUAL heights
        // Some messages are much taller than estimate
        const actualHeights = [100, 150, 80, 400, 90, 120, 80, 600, 100, 150];
        measureAllItems(wrapper, actualHeights);

        vi.advanceTimersByTime(16);
        await nextTick();
        await nextTick();

        // New total height after measurements
        const actualTotalHeight = actualHeights.reduce((a, b) => a + b, 0); // 1870
        const actualTrackHeight = actualTotalHeight + 28 + 216; // 2114
        mockScrollHeight = actualTrackHeight;

        // flushUpdates should have adjusted scroll
        vi.advanceTimersByTime(16);
        await nextTick();

        const finalScrollTop = scrollTopValue;
        const finalDistanceFromBottom =
            actualTrackHeight - finalScrollTop - mockClientHeight;

        console.log('After measurements:', {
            actualTotalHeight,
            actualTrackHeight,
            finalScrollTop,
            finalDistanceFromBottom,
            expectedScrollTop: actualTrackHeight - mockClientHeight,
        });

        // The scroll should have been adjusted to stay at bottom
        // Distance from bottom should be 0 (or very close)
        expect(finalDistanceFromBottom).toBeLessThanOrEqual(5);

        wrapper.unmount();
    });

    it('should diagnose thread switch inconsistency', async () => {
        /**
         * This test simulates the exact real-world scenario:
         * 1. Load thread A with messages, scroll to bottom
         * 2. Switch to thread B (different messages)
         * 3. Measure the distance from last message to bottom
         *
         * The issue: Distance varies between threads even though
         * paddingBottom is consistent.
         */

        const threadA = ref(createThread('A', 8));

        const wrapper = mount(Or3Scroll as any, {
            props: {
                items: threadA.value,
                itemKey: (item: any) => item.id,
                estimateHeight: 80,
                overscan: 6500, // High overscan like in production
                paddingBottom: 216,
                paddingTop: 28,
                maintainBottom: true,
            },
            attachTo: document.body,
        });

        await nextTick();
        vi.advanceTimersByTime(16);

        // Measure thread A items with varying heights
        const heightsA = [120, 80, 200, 90, 150, 100, 300, 80];
        measureAllItems(wrapper, heightsA);
        vi.advanceTimersByTime(50);
        await nextTick();
        await nextTick();

        // Get thread A final state
        const getState = () => {
            const track = wrapper.find('.or3-scroll-track')
                .element as HTMLElement;
            const style = track?.getAttribute('style') || '';
            const match = style.match(/height:\s*(\d+)px/);
            const trackHeight = match ? parseInt(match[1], 10) : 0;

            // Find last visible item position
            const items = wrapper.findAll('.or3-scroll-item');
            const slice = wrapper.find('.or3-scroll-slice')
                .element as HTMLElement;
            const sliceStyle = slice?.getAttribute('style') || '';
            const translateMatch = sliceStyle.match(/translateY\((\d+)px\)/);
            const sliceOffset = translateMatch
                ? parseInt(translateMatch[1], 10)
                : 0;

            return {
                trackHeight,
                scrollTop: scrollTopValue,
                scrollHeight: trackHeight, // In our mock, scrollHeight = trackHeight
                clientHeight: mockClientHeight,
                distanceFromBottom:
                    trackHeight - scrollTopValue - mockClientHeight,
                sliceOffset,
                itemCount: items.length,
            };
        };

        const stateA = getState();
        console.log('Thread A state:', stateA);

        // Now switch to thread B
        const threadB = createThread('B', 5);
        await wrapper.setProps({ items: threadB });
        await nextTick();
        vi.advanceTimersByTime(50);
        await nextTick();
        await nextTick();

        // Measure thread B items
        const heightsB = [100, 250, 80, 180, 120];
        measureAllItems(wrapper, heightsB);
        vi.advanceTimersByTime(50);
        await nextTick();
        await nextTick();
        await nextTick();

        const stateB = getState();
        console.log('Thread B state:', stateB);

        // Switch to thread C
        const threadC = createThread('C', 12);
        await wrapper.setProps({ items: threadC });
        await nextTick();
        vi.advanceTimersByTime(50);
        await nextTick();

        // Measure thread C items with very different heights
        const heightsC = [50, 400, 60, 70, 500, 80, 90, 100, 200, 150, 80, 300];
        measureAllItems(wrapper, heightsC);
        vi.advanceTimersByTime(50);
        await nextTick();
        await nextTick();
        await nextTick();

        const stateC = getState();
        console.log('Thread C state:', stateC);

        // THE KEY ASSERTION:
        // All threads should have distanceFromBottom = 0 (at the bottom)
        // If they're different, we have the bug
        console.log('Distance comparison:', {
            threadA: stateA.distanceFromBottom,
            threadB: stateB.distanceFromBottom,
            threadC: stateC.distanceFromBottom,
        });

        expect(stateA.distanceFromBottom).toBeLessThanOrEqual(5);
        expect(stateB.distanceFromBottom).toBeLessThanOrEqual(5);
        expect(stateC.distanceFromBottom).toBeLessThanOrEqual(5);

        wrapper.unmount();
    });

    it('should identify what causes inconsistent positioning', async () => {
        /**
         * Debug test to identify the root cause.
         * We'll trace through the exact sequence of events.
         */

        const items = ref(createThread('A', 5));

        const wrapper = mount(Or3Scroll as any, {
            props: {
                items: items.value,
                itemKey: (item: any) => item.id,
                estimateHeight: 80,
                overscan: 6500,
                paddingBottom: 216,
                paddingTop: 28,
                maintainBottom: true,
            },
            attachTo: document.body,
        });

        await nextTick();
        vi.advanceTimersByTime(16);

        const scrollApi = wrapper.vm as any;

        // Track all scroll positions
        const scrollPositions: {
            event: string;
            scrollTop: number;
            trackHeight: number;
        }[] = [];

        const logPosition = (event: string) => {
            const track = wrapper.find('.or3-scroll-track')
                .element as HTMLElement;
            const style = track?.getAttribute('style') || '';
            const match = style.match(/height:\s*(\d+)px/);
            const trackHeight = match ? parseInt(match[1], 10) : 0;

            scrollPositions.push({
                event,
                scrollTop: scrollTopValue,
                trackHeight,
            });
        };

        logPosition('initial');

        // Measure items one by one (simulating staggered ResizeObserver)
        const heights = [100, 200, 150, 300, 250];
        const items_els = wrapper.findAll('.or3-scroll-item');

        for (let i = 0; i < items_els.length; i++) {
            triggerResize(items_els[i].element as HTMLElement, heights[i]);
            vi.advanceTimersByTime(1); // Small delay between each
            await nextTick();
            logPosition(`after measuring item ${i}`);
        }

        vi.advanceTimersByTime(50);
        await nextTick();
        await nextTick();
        logPosition('after all measurements');

        // Now call scrollToBottom explicitly
        mockScrollHeight = heights.reduce((a, b) => a + b, 0) + 28 + 216;
        scrollApi.scrollToBottom();
        await nextTick();
        logPosition('after scrollToBottom');

        console.log('Scroll position trace:', scrollPositions);

        // Check if any position was inconsistent
        const finalPos = scrollPositions[scrollPositions.length - 1];
        const expectedFinalScroll = Math.max(
            0,
            finalPos.trackHeight - mockClientHeight
        );

        console.log('Final analysis:', {
            finalScrollTop: finalPos.scrollTop,
            expectedScrollTop: expectedFinalScroll,
            trackHeight: finalPos.trackHeight,
            clientHeight: mockClientHeight,
            difference: Math.abs(finalPos.scrollTop - expectedFinalScroll),
        });

        wrapper.unmount();
    });
});
