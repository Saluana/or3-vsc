<script setup lang="ts" generic="T">
import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    shallowRef,
    useSlots,
    watch,
    type ComponentPublicInstance,
} from 'vue';
import { VirtualizerEngine } from '../core/virtualizer';
import { resizeObserverManager } from '../measurement/observer';
import type {
    Or3ScrollItemKey,
    Or3ScrollProps,
} from './types';

type ItemKey = Or3ScrollItemKey;
type ScrollMode =
    | 'followingBottom'
    | 'userBrowsing'
    | 'programmaticJump'
    | 'compensatingLayout';
type InternalScrollOwner = 'bottom' | 'jump' | 'compensation' | null;

const props = withDefaults(defineProps<Or3ScrollProps<T>>(), {
    estimateHeight: 50,
    overscan: 200,
    prefetchOverscan: 0,
    maintainBottom: true,
    loadingHistory: false,
    tailCount: 0,
    paddingBottom: 0,
    paddingTop: 0,
    bottomThreshold: 3,
    autoscrollThreshold: 10,
    mutationMode: 'append-prepend',
    contentKey: undefined,
});

const emit = defineEmits<{
    (
        e: 'scroll',
        payload: {
            scrollTop: number;
            scrollHeight: number;
            clientHeight: number;
            isAtBottom: boolean;
        }
    ): void;
    (e: 'reachTop'): void;
    (e: 'reachBottom'): void;
    (e: 'prefetchRange', payload: { startIndex: number; endIndex: number }): void;
}>();

const USER_SCROLL_END_DELAY = 140;
const MEASUREMENT_EPSILON = 0.5;
const slots = useSlots();
const safeEstimateHeight =
    Number.isFinite(props.estimateHeight) && props.estimateHeight > 0
        ? props.estimateHeight
        : 50;

const container = ref<HTMLElement | null>(null);
const track = ref<HTMLElement | null>(null);
const viewportHeight = ref(0);
const isAtBottom = ref(true);
const startIndex = ref(0);
const endIndex = ref(-1);
const offsetY = ref(0);
const totalHeight = ref(0);
const committedTrackHeight = ref(0);
const debugScrollTop = ref(0);

let latestScrollTop = 0;
let processedScrollTop = 0;
let scrollMode: ScrollMode = props.maintainBottom
    ? 'followingBottom'
    : 'userBrowsing';
let internalScrollOwner: InternalScrollOwner = null;
let internalScrollTarget: number | null = null;
let isUserScrolling = false;
let isMounted = false;
let isDestroyed = false;
let scrollFrame = 0;
let resetFrameOne = 0;
let resetFrameTwo = 0;
let userScrollEndTimeout: ReturnType<typeof setTimeout> | null = null;
let contentGeneration = 0;
let resetGeneration = 0;
let measurementGeneration = 0;
let jumpGeneration = 0;
let reachedTop = false;
let reachedBottom = false;
let lastPrefetchStart = -1;
let lastPrefetchEnd = -1;

const engine = new VirtualizerEngine({
    estimateHeight: safeEstimateHeight,
    overscanTop: props.overscan,
    overscanBottom: props.overscan,
    tailCount: props.tailCount,
    maxWindow: undefined,
});

const currentKeys: ItemKey[] = [];
const indexByKey = new Map<ItemKey, number>();
const heightByKey = new Map<ItemKey, number>();

const visibleItems = computed(() => {
    const end = endIndex.value === -1 ? 0 : endIndex.value + 1;
    return props.items.slice(startIndex.value, end);
});

const getItemKey = (item: T): ItemKey => {
    if (typeof props.itemKey === 'function') return props.itemKey(item);
    const value = item[props.itemKey];
    if (
        import.meta.env.DEV &&
        typeof value !== 'string' &&
        typeof value !== 'number'
    ) {
        console.warn(
            `[or3-scroll] itemKey "${String(props.itemKey)}" resolved to non-string/number:`,
            value
        );
    }
    return value as ItemKey;
};

const requestFrame = (callback: (timestamp: number) => void): number => {
    if (import.meta.env.MODE === 'test') {
        queueMicrotask(() => callback(Date.now()));
        return -1;
    }
    if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(callback);
    }
    queueMicrotask(() => callback(Date.now()));
    return 0;
};

const cancelFrame = (id: number) => {
    if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
};

const quantizeHeight = (height: number): number => {
    const scale =
        typeof devicePixelRatio === 'number' && devicePixelRatio > 0
            ? devicePixelRatio
            : 1;
    return Math.round(height * scale) / scale;
};

const rebuildIndex = () => {
    indexByKey.clear();
    currentKeys.forEach((key, index) => indexByKey.set(key, index));
};

type Anchor = { key: ItemKey; withinItem: number };

const captureAnchor = (): Anchor | null => {
    if (currentKeys.length === 0) return null;
    if (container.value) {
        latestScrollTop = container.value.scrollTop;
        const viewport = container.value.getBoundingClientRect();
        if (
            viewport.height > 0 &&
            Math.abs(viewport.height - container.value.clientHeight) < 2
        ) {
            let visibleAnchor:
                | { key: ItemKey; top: number; withinItem: number }
                | undefined;
            for (const [key, element] of itemElements) {
                const rect = element.getBoundingClientRect();
                if (
                    rect.bottom <= viewport.top + MEASUREMENT_EPSILON ||
                    rect.top >= viewport.bottom
                ) {
                    continue;
                }
                if (!visibleAnchor || rect.top < visibleAnchor.top) {
                    visibleAnchor = {
                        key,
                        top: rect.top,
                        withinItem: viewport.top - rect.top,
                    };
                }
            }
            if (visibleAnchor) {
                return {
                    key: visibleAnchor.key,
                    withinItem: visibleAnchor.withinItem,
                };
            }
        }
    }
    const contentScrollTop = latestScrollTop - props.paddingTop;
    const index = engine.findIndexForOffset(Math.max(0, contentScrollTop));
    const key = currentKeys[index];
    if (key === undefined) return null;
    return {
        key,
        withinItem: contentScrollTop - engine.getOffsetForIndex(index),
    };
};

const setCommittedTrackHeight = (height: number) => {
    const normalized = Math.max(0, height);
    committedTrackHeight.value = normalized;
    if (track.value) {
        track.value.style.height = `${normalized + props.paddingTop + props.paddingBottom}px`;
    }
};

const applyScrollTop = (
    top: number,
    owner: Exclude<InternalScrollOwner, null>,
    smooth = false
) => {
    const target = container.value;
    if (!target) return;
    const max = Math.max(
        0,
        committedTrackHeight.value +
            props.paddingTop +
            props.paddingBottom -
            target.clientHeight
    );
    const next = Math.max(0, Math.min(top, max));
    internalScrollOwner = owner;
    internalScrollTarget = next;
    if (smooth) target.scrollTo({ top: next, behavior: 'smooth' });
    else target.scrollTop = next;
    latestScrollTop = target.scrollTop;
};

const restoreAnchor = (anchor: Anchor | null) => {
    if (!anchor || !container.value) return;
    const index = indexByKey.get(anchor.key);
    if (index === undefined) return;
    const next =
        props.paddingTop +
        engine.getOffsetForIndex(index) +
        anchor.withinItem;
    if (Math.abs(next - container.value.scrollTop) < MEASUREMENT_EPSILON) return;
    const previousMode = scrollMode;
    scrollMode = 'compensatingLayout';
    applyScrollTop(next, 'compensation');
    scrollMode = previousMode;
};

const contentScrollTop = () =>
    Math.max(0, latestScrollTop - Math.max(0, props.paddingTop));

const updateRange = () => {
    const { overscanTop, overscanBottom, maxWindow } = getOverscanConfig();
    engine.updateOverscan(overscanTop, overscanBottom);
    engine.updateMaxWindow(maxWindow);
    const range = engine.computeRange(contentScrollTop(), viewportHeight.value);
    if (startIndex.value !== range.startIndex) startIndex.value = range.startIndex;
    if (endIndex.value !== range.endIndex) endIndex.value = range.endIndex;
    if (offsetY.value !== range.offsetY) offsetY.value = range.offsetY;
    if (totalHeight.value !== range.totalHeight) totalHeight.value = range.totalHeight;
};

const getOverscanConfig = () => {
    const base = Number.isFinite(props.overscan)
        ? Math.max(0, props.overscan)
        : 200;
    const tailCount = Number.isFinite(props.tailCount)
        ? Math.max(0, Math.floor(props.tailCount))
        : 0;
    const estimatedItemsPerScreen =
        viewportHeight.value / safeEstimateHeight;
    return {
        overscanTop: base,
        overscanBottom: base,
        maxWindow: Math.max(
            tailCount,
            Math.ceil(estimatedItemsPerScreen * 2)
        ),
    };
};

const emitPrefetchRange = () => {
    if (props.prefetchOverscan <= 0 || currentKeys.length === 0) return;
    const prefetchOverscan = Number.isFinite(props.prefetchOverscan)
        ? Math.max(0, props.prefetchOverscan)
        : 0;
    const contentTop = contentScrollTop();
    const start = engine.findIndexForOffset(
        Math.max(0, contentTop - prefetchOverscan)
    );
    const end = engine.findIndexForOffset(
        Math.min(
            engine.getTotalHeight(),
            contentTop + viewportHeight.value + prefetchOverscan
        )
    );
    if (start === lastPrefetchStart && end === lastPrefetchEnd) return;
    lastPrefetchStart = start;
    lastPrefetchEnd = end;
    emit('prefetchRange', { startIndex: start, endIndex: end });
};

const commitModelHeight = (
    anchor: Anchor | null,
    followBottom: boolean
) => {
    setCommittedTrackHeight(engine.getTotalHeight());
    if (followBottom && props.maintainBottom) {
        void nextTick(() => {
            if (!isDestroyed && scrollMode === 'followingBottom') {
                scrollToBottom();
            }
        });
    } else {
        restoreAnchor(anchor);
    }
};

const preserveOrCommitModelHeight = (
    anchor: Anchor | null,
    followBottom: boolean
) => {
    if (isUserScrolling) {
        restoreAnchor(anchor);
        return;
    }
    commitModelHeight(anchor, followBottom);
};

const currentCommittedScrollHeight = () =>
    committedTrackHeight.value + props.paddingTop + props.paddingBottom;

const updateScrollState = (deltaY: number, isInternal: boolean) => {
    const target = container.value;
    if (!target) return;
    const distance =
        currentCommittedScrollHeight() -
        (target.scrollTop + target.clientHeight);
    const physicallyAtBottom = distance <= props.bottomThreshold;
    isAtBottom.value = physicallyAtBottom;

    if (!isInternal) {
        if (deltaY < -MEASUREMENT_EPSILON && distance > props.autoscrollThreshold) {
            scrollMode = 'userBrowsing';
        } else if (
            deltaY > MEASUREMENT_EPSILON &&
            physicallyAtBottom &&
            props.maintainBottom
        ) {
            scrollMode = 'followingBottom';
        }
    }
};

const emitBoundaryTransitions = () => {
    const atTopNow = latestScrollTop <= MEASUREMENT_EPSILON;
    if (atTopNow && !reachedTop) emit('reachTop');
    if (!atTopNow && latestScrollTop > 1.5) reachedTop = false;
    else if (atTopNow) reachedTop = true;

    if (isAtBottom.value && !reachedBottom) emit('reachBottom');
    const target = container.value;
    if (target) {
        const distance =
            currentCommittedScrollHeight() -
            (target.scrollTop + target.clientHeight);
        if (distance > props.bottomThreshold + 1) reachedBottom = false;
        else if (isAtBottom.value) reachedBottom = true;
    }
};

const refreshStructuralScrollState = () => {
    if (!container.value) return;
    latestScrollTop = container.value.scrollTop;
    updateScrollState(0, true);
    emitBoundaryTransitions();
};

const finishScrolling = () => {
    if (userScrollEndTimeout) {
        clearTimeout(userScrollEndTimeout);
        userScrollEndTimeout = null;
    }
    const endedUserControl = isUserScrolling;
    isUserScrolling = false;
    if (container.value) {
        latestScrollTop = container.value.scrollTop;
        updateScrollState(0, true);
    }
    if (scrollMode === 'programmaticJump') {
        scrollMode =
            props.maintainBottom && isAtBottom.value
                ? 'followingBottom'
                : 'userBrowsing';
    } else if (endedUserControl) {
        scrollMode =
            props.maintainBottom && isAtBottom.value
                ? 'followingBottom'
                : 'userBrowsing';
    }
    internalScrollOwner = null;
    internalScrollTarget = null;
    commitModelHeight(captureAnchor(), scrollMode === 'followingBottom');
    refreshStructuralScrollState();
};

const scheduleScrollEnd = () => {
    if (userScrollEndTimeout) clearTimeout(userScrollEndTimeout);
    userScrollEndTimeout = setTimeout(finishScrolling, USER_SCROLL_END_DELAY);
};

const processScrollFrame = () => {
    scrollFrame = 0;
    const target = container.value;
    if (!target || isDestroyed) return;
    latestScrollTop = target.scrollTop;
    const deltaY = latestScrollTop - processedScrollTop;
    const isInternal = internalScrollOwner !== null;

    if (!isInternal && Math.abs(deltaY) > MEASUREMENT_EPSILON) {
        isUserScrolling = true;
    }
    if (internalScrollTarget !== null && Math.abs(latestScrollTop - internalScrollTarget) < 1) {
        if (internalScrollOwner !== 'jump') {
            internalScrollOwner = null;
            internalScrollTarget = null;
        }
    }

    updateScrollState(deltaY, isInternal);
    updateRange();
    emitPrefetchRange();
    if (slots.__debug) debugScrollTop.value = latestScrollTop;
    emit('scroll', {
        scrollTop: latestScrollTop,
        scrollHeight: target.scrollHeight,
        clientHeight: viewportHeight.value,
        isAtBottom: isAtBottom.value,
    });
    emitBoundaryTransitions();
    processedScrollTop = latestScrollTop;
    if (isUserScrolling || internalScrollOwner === 'jump') scheduleScrollEnd();
};

const scheduleScrollFrame = () => {
    if (scrollFrame || isDestroyed) return;
    scrollFrame = requestFrame(processScrollFrame);
};

const onScroll = () => {
    if (!container.value) return;
    latestScrollTop = container.value.scrollTop;
    scheduleScrollFrame();
};

const onUserScrollStart = () => {
    isUserScrolling = true;
    internalScrollOwner = null;
    internalScrollTarget = null;
    jumpGeneration++;
    if (!isAtBottom.value) scrollMode = 'userBrowsing';
    cancelResetFrames();
    scheduleScrollEnd();
};

const onKeyDown = (event: KeyboardEvent) => {
    if (
        ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
            event.key
        )
    ) {
        onUserScrollStart();
    }
};

const onNativeScrollEnd = () => finishScrolling();

type MeasureRecord = { item: T; index: number; key: ItemKey };
const itemsToMeasure = shallowRef<MeasureRecord[]>([]);
const measureRefs = new Map<number, HTMLElement>();

const setMeasureRef = (index: number, el: HTMLElement | null) => {
    if (el) measureRefs.set(index, el);
    else measureRefs.delete(index);
};

const measureRecords = async (records: MeasureRecord[]): Promise<number[]> => {
    const generation = ++measurementGeneration;
    if (isDestroyed) return records.map(() => NaN);
    itemsToMeasure.value = records;
    measureRefs.clear();
    await nextTick();
    if (isDestroyed || generation !== measurementGeneration) {
        return records.map(() => NaN);
    }
    const heights = records.map((_, index) => {
        const measured = measureRefs.get(index)?.getBoundingClientRect().height ?? 0;
        return measured > 0 ? quantizeHeight(measured) : safeEstimateHeight;
    });
    if (generation === measurementGeneration) itemsToMeasure.value = [];
    return heights;
};

const measureItems = async (items: T[]): Promise<number[]> =>
    measureRecords(
        items.map((item, index) => ({
            item,
            index,
            key: getItemKey(item),
        }))
    );

// Retained as a script binding for the existing component measurement tests.
void measureItems;

type ItemRefValue = Element | ComponentPublicInstance | null;
const itemElements = new Map<ItemKey, HTMLElement>();
const itemRefSetters = new Map<ItemKey, (el: ItemRefValue) => void>();

const setItemRef = (_index: number, item: T) => {
    const key = getItemKey(item);
    const cached = itemRefSetters.get(key);
    if (cached) return cached;

    const setter = (value: ItemRefValue) => {
        if (value) {
            const element = (
                value instanceof Element
                    ? value
                    : (value as ComponentPublicInstance).$el
            ) as HTMLElement;
            const previous = itemElements.get(key);
            if (previous === element) return;
            if (previous) resizeObserverManager.unobserve(previous);
            itemElements.set(key, element);
            resizeObserverManager.observe(element, (entry) => {
                const height =
                    entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
                queueUpdate(key, height);
            });
        } else {
            const previous = itemElements.get(key);
            if (previous) resizeObserverManager.unobserve(previous);
            itemElements.delete(key);
        }
    };
    itemRefSetters.set(key, setter);
    return setter;
};

const pendingUpdates = new Map<ItemKey, number>();
let isUpdatePending = false;

const queueUpdate = (key: ItemKey, rawHeight: number) => {
    const height = quantizeHeight(rawHeight);
    const previous = heightByKey.get(key);
    if (
        previous !== undefined &&
        Math.abs(previous - height) < MEASUREMENT_EPSILON
    ) {
        return;
    }
    pendingUpdates.set(key, height);
    if (!isUpdatePending) {
        isUpdatePending = true;
        queueMicrotask(flushUpdates);
    }
};

const flushUpdates = () => {
    isUpdatePending = false;
    if (pendingUpdates.size === 0 || isDestroyed) return;
    if (container.value) latestScrollTop = container.value.scrollTop;
    const anchor = captureAnchor();
    let changed = false;
    for (const [key, height] of pendingUpdates) {
        const index = indexByKey.get(key);
        if (index === undefined) continue;
        const previous = heightByKey.get(key);
        if (
            previous !== undefined &&
            Math.abs(previous - height) < MEASUREMENT_EPSILON
        ) {
            continue;
        }
        heightByKey.set(key, height);
        engine.setHeight(index, height);
        changed = true;
    }
    pendingUpdates.clear();
    if (!changed) return;
    updateRange();
    const shouldFollow =
        props.maintainBottom &&
        scrollMode === 'followingBottom' &&
        !isUserScrolling;
    preserveOrCommitModelHeight(anchor, shouldFollow);
    refreshStructuralScrollState();
};

const pruneHeightCache = (keys: readonly ItemKey[]) => {
    const retained = new Set(keys);
    for (const key of heightByKey.keys()) {
        if (!retained.has(key)) heightByKey.delete(key);
    }
    for (const key of itemRefSetters.keys()) {
        if (retained.has(key)) continue;
        const element = itemElements.get(key);
        if (element) resizeObserverManager.unobserve(element);
        itemElements.delete(key);
        itemRefSetters.delete(key);
    }
};

const replaceCurrentKeys = (keys: readonly ItemKey[]) => {
    currentKeys.splice(0, currentKeys.length, ...keys);
    rebuildIndex();
};

const reconcileAll = (items: readonly T[], clearMeasurements = false) => {
    const anchor = captureAnchor();
    const keys = items.map(getItemKey);
    if (clearMeasurements) heightByKey.clear();
    pruneHeightCache(keys);
    engine.replaceHeights(
        keys.map((key) => heightByKey.get(key) ?? NaN)
    );
    replaceCurrentKeys(keys);
    updateRange();
    lastPrefetchStart = -1;
    emitPrefetchRange();
    if (isMounted) {
        const shouldFollow =
            props.maintainBottom &&
            scrollMode === 'followingBottom' &&
            !isUserScrolling;
        preserveOrCommitModelHeight(anchor, shouldFollow);
        refreshStructuralScrollState();
    }
};

const appendItems = (items: readonly T[], from: number) => {
    const anchor = captureAnchor();
    for (let index = from; index < items.length; index++) {
        const key = getItemKey(items[index]);
        currentKeys.push(key);
        indexByKey.set(key, index);
    }
    engine.setCount(items.length);
    updateRange();
    lastPrefetchStart = -1;
    emitPrefetchRange();
    if (isMounted) {
        preserveOrCommitModelHeight(
            anchor,
            props.maintainBottom &&
                scrollMode === 'followingBottom' &&
                !isUserScrolling
        );
        refreshStructuralScrollState();
    }
};

const prependItems = async (items: readonly T[], count: number, generation: number) => {
    const records = items.slice(0, count).map((item, index) => ({
        item,
        index,
        key: getItemKey(item),
    }));
    const heights = props.loadingHistory
        ? await measureRecords(records)
        : records.map((record) => heightByKey.get(record.key) ?? NaN);
    if (isDestroyed || generation !== contentGeneration) return;
    const anchor = captureAnchor();
    records.forEach((record, index) => {
        if (!Number.isNaN(heights[index])) {
            heightByKey.set(record.key, heights[index]);
        }
    });
    engine.bulkInsert(0, heights);
    currentKeys.unshift(...records.map((record) => record.key));
    if (engine.getCount() < items.length) engine.setCount(items.length);
    for (let index = currentKeys.length; index < items.length; index++) {
        currentKeys.push(getItemKey(items[index]));
    }
    rebuildIndex();
    updateRange();
    lastPrefetchStart = -1;
    emitPrefetchRange();
    preserveOrCommitModelHeight(anchor, false);
    refreshStructuralScrollState();
};

const syncItems = async () => {
    const generation = ++contentGeneration;
    const items = props.items;
    const nextCount = items.length;
    const oldCount = currentKeys.length;

    if (oldCount === 0) {
        reconcileAll(items);
        return;
    }
    if (props.mutationMode === 'arbitrary') {
        reconcileAll(items);
        return;
    }
    if (nextCount === 0) {
        reconcileAll(items);
        return;
    }

    const oldFirst = currentKeys[0];
    const oldLast = currentKeys[oldCount - 1];
    const nextFirst = getItemKey(items[0]);
    const nextLast = getItemKey(items[nextCount - 1]);

    if (nextCount === oldCount && nextFirst === oldFirst && nextLast === oldLast) {
        return;
    }
    if (
        nextCount > oldCount &&
        nextFirst === oldFirst &&
        getItemKey(items[oldCount - 1]) === oldLast
    ) {
        appendItems(items, oldCount);
        return;
    }
    const prependCount = nextCount - oldCount;
    if (
        prependCount > 0 &&
        getItemKey(items[prependCount]) === oldFirst &&
        getItemKey(items[prependCount + oldCount - 1]) === oldLast
    ) {
        await prependItems(items, prependCount, generation);
        return;
    }
    if (
        nextCount < oldCount &&
        nextFirst === oldFirst &&
        nextLast === currentKeys[nextCount - 1]
    ) {
        const anchor = captureAnchor();
        currentKeys.splice(nextCount);
        pruneHeightCache(currentKeys);
        rebuildIndex();
        engine.setCount(nextCount);
        updateRange();
        lastPrefetchStart = -1;
        emitPrefetchRange();
        if (isMounted) {
            preserveOrCommitModelHeight(anchor, false);
            refreshStructuralScrollState();
        }
        return;
    }
    reconcileAll(items);
};

const cancelResetFrames = () => {
    resetGeneration++;
    cancelFrame(resetFrameOne);
    cancelFrame(resetFrameTwo);
    resetFrameOne = 0;
    resetFrameTwo = 0;
};

const scheduleInitialBottom = (cancelOnContentMutation = false) => {
    cancelResetFrames();
    const generation = resetGeneration;
    const scheduledContentGeneration = contentGeneration;
    resetFrameOne = requestFrame(() => {
        resetFrameOne = 0;
        resetFrameTwo = requestFrame(() => {
            resetFrameTwo = 0;
            if (
                generation === resetGeneration &&
                (!cancelOnContentMutation ||
                    scheduledContentGeneration === contentGeneration) &&
                !isDestroyed &&
                props.maintainBottom
            ) {
                scrollToBottom();
            }
        });
    });
};

const resetForNewContent = () => {
    contentGeneration++;
    measurementGeneration++;
    jumpGeneration++;
    cancelResetFrames();
    pendingUpdates.clear();
    itemsToMeasure.value = [];
    measureRefs.clear();
    itemElements.forEach((element) => resizeObserverManager.unobserve(element));
    itemElements.clear();
    itemRefSetters.clear();
    heightByKey.clear();
    scrollMode = props.maintainBottom ? 'followingBottom' : 'userBrowsing';
    internalScrollOwner = null;
    internalScrollTarget = null;
    latestScrollTop = 0;
    processedScrollTop = 0;
    lastPrefetchStart = -1;
    lastPrefetchEnd = -1;
    if (container.value) container.value.scrollTop = 0;
    reconcileAll(props.items, true);
    setCommittedTrackHeight(engine.getTotalHeight());
    refreshStructuralScrollState();
    const generation = contentGeneration;
    void nextTick(() => {
        if (isDestroyed || generation !== contentGeneration) return;
        refreshMeasurements();
    });
    if (props.maintainBottom) scheduleInitialBottom();
};

const scrollToBottom = (opts: { smooth?: boolean } = {}) => {
    if (!container.value) return;
    scrollMode = 'followingBottom';
    setCommittedTrackHeight(engine.getTotalHeight());
    const target = Math.max(
        0,
        currentCommittedScrollHeight() - container.value.clientHeight
    );
    applyScrollTop(target, 'bottom', opts.smooth === true);
    scheduleScrollFrame();
};

const alignedScrollTop = (
    index: number,
    align: 'start' | 'center' | 'end',
    height: number
) => {
    let top = engine.getOffsetForIndex(index) + props.paddingTop;
    if (align === 'center') {
        top -= viewportHeight.value / 2 - height / 2;
    } else if (align === 'end') {
        top -= viewportHeight.value - height;
    }
    return Math.max(0, top);
};

const scrollToIndex = (
    index: number,
    opts: { align?: 'start' | 'center' | 'end'; smooth?: boolean } = {}
) => {
    if (
        !container.value ||
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= props.items.length
    ) {
        return;
    }
    cancelResetFrames();
    const generation = ++jumpGeneration;
    const align = opts.align ?? 'start';
    const key = currentKeys[index];
    scrollMode = 'programmaticJump';
    setCommittedTrackHeight(engine.getTotalHeight());
    const estimatedHeight =
        heightByKey.get(key) ?? engine.getMeasuredHeight(index) ?? safeEstimateHeight;
    applyScrollTop(
        alignedScrollTop(index, align, estimatedHeight),
        'jump',
        opts.smooth === true
    );
    scheduleScrollFrame();

    void nextTick(() => {
        requestFrame(() => {
            if (generation !== jumpGeneration || isDestroyed) return;
            const currentIndex = indexByKey.get(key);
            if (currentIndex === undefined) return;
            const element = itemElements.get(key);
            const measured = element?.getBoundingClientRect().height;
            if (measured && measured > 0) {
                const height = quantizeHeight(measured);
                heightByKey.set(key, height);
                engine.setHeight(currentIndex, height);
                updateRange();
                setCommittedTrackHeight(engine.getTotalHeight());
            }
            const exactHeight =
                heightByKey.get(key) ??
                engine.getMeasuredHeight(currentIndex) ??
                safeEstimateHeight;
            applyScrollTop(
                alignedScrollTop(currentIndex, align, exactHeight),
                'jump',
                opts.smooth === true
            );
            scheduleScrollFrame();
        });
    });
};

const scrollToItemKey = (
    key: ItemKey,
    opts: { align?: 'start' | 'center' | 'end'; smooth?: boolean } = {}
) => {
    const index = indexByKey.get(key);
    if (index !== undefined) scrollToIndex(index, opts);
};

const refreshMeasurements = () => {
    for (const [key, element] of itemElements) {
        const measured = element.getBoundingClientRect().height;
        if (measured > 0) queueUpdate(key, measured);
    }
    if (isUpdatePending) flushUpdates();
    else updateRange();
};

const reset = () => resetForNewContent();

let containerResizeObserver: ResizeObserver | null = null;

const onViewportResize = (newHeight: number) => {
    if (!container.value || newHeight === viewportHeight.value) return;
    const anchor = captureAnchor();
    viewportHeight.value = newHeight;
    updateRange();
    commitModelHeight(
        anchor,
        props.maintainBottom && scrollMode === 'followingBottom'
    );
    updateScrollState(0, true);
    emitPrefetchRange();
};

onMounted(() => {
    isMounted = true;
    const target = container.value;
    if (!target) return;
    latestScrollTop = target.scrollTop;
    processedScrollTop = target.scrollTop;
    viewportHeight.value = target.clientHeight;
    if (typeof ResizeObserver !== 'undefined') {
        containerResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) onViewportResize(entry.contentRect.height);
        });
        containerResizeObserver.observe(target);
    }

    const isTestEnv = import.meta.env.MODE === 'test';
    if (import.meta.env.DEV && !isTestEnv) {
        if (viewportHeight.value === 0) {
            console.warn(
                '[or3-scroll] Container has 0 height. Please ensure the parent container has a set height or flex constraint.'
            );
        }
        if (props.estimateHeight <= 0) {
            console.warn(
                `[or3-scroll] estimateHeight must be positive. Got ${props.estimateHeight}. Falling back to 50.`
            );
        }
        const keys = new Set<ItemKey>();
        for (const item of props.items.slice(0, 100)) {
            const key = getItemKey(item);
            if (keys.has(key)) {
                console.warn(
                    `[or3-scroll] Duplicate item key detected: "${key}". Rendering behavior may be unstable.`
                );
                break;
            }
            keys.add(key);
        }
    }

    updateRange();
    setCommittedTrackHeight(engine.getTotalHeight());
    emitPrefetchRange();
    if (props.maintainBottom) scheduleInitialBottom(true);
});

onUnmounted(() => {
    isDestroyed = true;
    contentGeneration++;
    measurementGeneration++;
    jumpGeneration++;
    cancelFrame(scrollFrame);
    cancelResetFrames();
    if (userScrollEndTimeout) clearTimeout(userScrollEndTimeout);
    containerResizeObserver?.disconnect();
    itemElements.forEach((element) => resizeObserverManager.unobserve(element));
    itemElements.clear();
    itemRefSetters.clear();
    pendingUpdates.clear();
});

watch(
    () => {
        const items = props.items;
        return props.mutationMode === 'arbitrary'
            ? items.map(getItemKey)
            : [items, items.length];
    },
    () => void syncItems(),
    { immediate: true }
);

watch(
    () => props.contentKey,
    (next, previous) => {
        if (next !== previous) resetForNewContent();
    }
);

watch(
    () => [props.paddingBottom, props.paddingTop],
    () => {
        const anchor = captureAnchor();
        commitModelHeight(
            anchor,
            props.maintainBottom && scrollMode === 'followingBottom'
        );
    }
);

watch(
    () => [props.overscan, props.prefetchOverscan],
    () => {
        lastPrefetchStart = -1;
        lastPrefetchEnd = -1;
        updateRange();
        emitPrefetchRange();
    }
);

watch(
    () => props.tailCount,
    (value) => {
        engine.updateTailCount(value);
        updateRange();
    }
);

watch(
    () => props.maintainBottom,
    (enabled) => {
        if (!enabled) return;
        updateScrollState(0, true);
        scrollMode = isAtBottom.value ? 'followingBottom' : 'userBrowsing';
    }
);

watch(
    () => props.estimateHeight,
    (value, previous) => {
        if (value !== previous && import.meta.env.DEV) {
            console.warn(
                '[or3-scroll] estimateHeight is immutable after mount; reset the component to apply a new estimate.'
            );
        }
    }
);

defineExpose({
    scrollToBottom,
    scrollToIndex,
    scrollToItemKey,
    refreshMeasurements,
    reset,
    isAtBottom,
});
</script>

<template>
    <div
        ref="container"
        class="or3-scroll"
        @scroll.passive="onScroll"
        @touchstart.passive="onUserScrollStart"
        @mousedown.passive="onUserScrollStart"
        @wheel.passive="onUserScrollStart"
        @keydown="onKeyDown"
        @scrollend.passive="onNativeScrollEnd"
    >
        <div
            ref="track"
            class="or3-scroll-track"
            :style="{
                height:
                    committedTrackHeight + paddingTop + paddingBottom + 'px',
            }"
        >
            <div
                class="or3-scroll-slice"
                :style="{ transform: `translateY(${offsetY + paddingTop}px)` }"
            >
                <slot v-if="loadingHistory" name="prepend-loading" />
                <template
                    v-for="(item, i) in visibleItems"
                    :key="getItemKey(item)"
                >
                    <div
                        :ref="setItemRef(startIndex + i, item)"
                        class="or3-scroll-item"
                        :data-index="startIndex + i"
                    >
                        <slot :item="item" :index="startIndex + i" />
                    </div>
                </template>
            </div>

            <!-- Hidden Measurement Pool -->
            <div
                v-if="loadingHistory || itemsToMeasure.length"
                class="or3-scroll-hidden-pool"
                aria-hidden="true"
            >
                <template
                    v-for="(record, i) in itemsToMeasure"
                    :key="record.key"
                >
                    <div
                        :ref="el => setMeasureRef(i, el as HTMLElement | null)"
                        class="or3-scroll-item"
                    >
                        <slot :item="record.item" :index="record.index" />
                    </div>
                </template>
            </div>

            <!-- Debug Slot -->
            <slot
                name="__debug"
                :start-index="startIndex"
                :end-index="endIndex"
                :total-height="totalHeight"
                :scroll-top="debugScrollTop"
            />
        </div>
    </div>
</template>

<style scoped>
.or3-scroll {
    overflow-y: auto;
    overflow-anchor: none;
    height: 100%;
    width: 100%;
    position: relative;
}

.or3-scroll-track {
    position: relative;
    width: 100%;
}

.or3-scroll-slice {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    will-change: transform;
}

.or3-scroll-item {
    /* Prevent margin collapse - ensures measured height matches rendered height */
    overflow: hidden;
}

.or3-scroll-hidden-pool {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    visibility: hidden;
    pointer-events: none;
    z-index: -1;
}
</style>
