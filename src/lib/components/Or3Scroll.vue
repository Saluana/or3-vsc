<script setup lang="ts" generic="T">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, shallowRef, type ComponentPublicInstance } from 'vue';
import { VirtualizerEngine } from '../core/virtualizer';
import { resizeObserverManager } from '../measurement/observer';

export interface Props<T> {
  items: T[];
  /**
   * Estimated height of an item in pixels.
   * Used for initial rendering and scrollbar calculations before measurement.
   */
  estimateHeight?: number;
  /**
   * Extra buffer in pixels to render above/below the visible viewport.
   * Strictly pixel-based.
   */
  overscan?: number;
  /**
   * Unique key for each item.
   * Can be a property name (string) or a function returning a string/number.
   */
  itemKey: keyof T | ((item: T) => string | number);
  /**
   * Whether to automatically scroll to bottom when new items are added
   * and the user is already at the bottom.
   */
  maintainBottom?: boolean;
  /**
   * Whether history is currently loading (affects prepend behavior).
   */
  loadingHistory?: boolean;
  /**
   * Number of items at the tail to always keep rendered/measured,
   * even if off-screen.
   */
  tailCount?: number;
}

const props = withDefaults(defineProps<Props<T>>(), {
  estimateHeight: 50,
  overscan: 200,
  maintainBottom: true,
  loadingHistory: false,
  tailCount: 0
});

const emit = defineEmits<{
  (e: 'scroll', payload: { scrollTop: number; scrollHeight: number; clientHeight: number; isAtBottom: boolean }): void;
  (e: 'reachTop'): void;
  (e: 'reachBottom'): void;
}>();

// --- Constants ---
const BOTTOM_THRESHOLD = 20; // pixels from bottom to consider "at bottom"
const USER_SCROLL_END_DELAY = 140; // ms to wait before considering user scroll ended
const SCROLL_POSITION_TOLERANCE = 5; // pixels tolerance for detecting user scroll

// --- State ---
const container = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(0);
const scrollHeight = ref(0);
const isUserScrolling = ref(false);
const isAtBottom = ref(true); // Default to true? Or derive?
let deferredScrollDelta = 0;
let isDestroyed = false;

// Engine - will be initialized with dynamic overscan values
const engine = new VirtualizerEngine({
  estimateHeight: props.estimateHeight,
  overscanTop: props.overscan,
  overscanBottom: props.overscan,
  tailCount: props.tailCount,
  maxWindow: undefined // computed dynamically
});

// Virtual Range
const startIndex = ref(0);
const endIndex = ref(-1);
const offsetY = ref(0);
const totalHeight = ref(0);

// Visible Items
const visibleItems = computed(() => {
  if (!props.items || props.items.length === 0) return [];
  // Slice is exclusive end, so +1
  // But endIndex from engine is inclusive?
  // Engine: "startIndex, endIndex" (inclusive)
  // Array.slice: start, end (exclusive)
  // So we need slice(startIndex, endIndex + 1)
  const end = endIndex.value === -1 ? 0 : endIndex.value + 1;
  return props.items.slice(startIndex.value, end);
});

// Helper to get key
const getItemKey = (item: T): string | number => {
  if (typeof props.itemKey === 'function') {
    return (props.itemKey as (item: T) => string | number)(item);
  }

  const key = props.itemKey as keyof T;
  return item[key] as unknown as string | number;
};

// --- Scroll Handling ---
const onScroll = () => {
  if (!container.value) return;
  
  const target = container.value;
  scrollTop.value = target.scrollTop;
  scrollHeight.value = target.scrollHeight;
  if (isUserScrolling.value) {
    scheduleUserScrollEnd();
  }
  
  // Update isAtBottom
  const dist = target.scrollHeight - (target.scrollTop + target.clientHeight);
  isAtBottom.value = dist <= BOTTOM_THRESHOLD;

  // Emit
  emit('scroll', {
    scrollTop: scrollTop.value,
    scrollHeight: scrollHeight.value,
    clientHeight: viewportHeight.value,
    isAtBottom: isAtBottom.value
  });
  
  if (scrollTop.value <= 0) emit('reachTop'); // Or threshold?
  if (isAtBottom.value) emit('reachBottom');

  // Update range
  updateRange();
};

// --- User Interaction Tracking ---
let userScrollEndTimeout: ReturnType<typeof setTimeout> | null = null;

const applyDeferredScrollDelta = () => {
  if (!deferredScrollDelta || !container.value) return;
  container.value.scrollTop += deferredScrollDelta;
  scrollTop.value = container.value.scrollTop;
  deferredScrollDelta = 0;
  updateRange();
};

const scheduleUserScrollEnd = () => {
  if (userScrollEndTimeout) {
    clearTimeout(userScrollEndTimeout);
  }
  userScrollEndTimeout = setTimeout(() => {
    isUserScrolling.value = false;
    applyDeferredScrollDelta();
    userScrollEndTimeout = null;
  }, USER_SCROLL_END_DELAY);
};

const onUserScrollStart = () => {
  isUserScrolling.value = true;
  scheduleUserScrollEnd();
};

const onUserScrollEnd = () => {
  if (userScrollEndTimeout) {
    clearTimeout(userScrollEndTimeout);
    userScrollEndTimeout = null;
  }
  isUserScrolling.value = false;
  applyDeferredScrollDelta();
};

const updateRange = () => {
  if (!container.value) return;
  
  // Compute dynamic overscan values based on position
  const { overscanTop, overscanBottom, maxWindow } = getOverscanConfig();
  
  // Update engine config using public methods
  engine.updateOverscan(overscanTop, overscanBottom);
  engine.updateMaxWindow(maxWindow);
  
  const range = engine.computeRange(scrollTop.value, viewportHeight.value);
  startIndex.value = range.startIndex;
  endIndex.value = range.endIndex;
  offsetY.value = range.offsetY;
  totalHeight.value = range.totalHeight;
};

const getOverscanConfig = () => {
  const base = props.overscan ?? 200; // px
  const vh = viewportHeight.value;
  
  // Compute maxWindow: ~2x viewport height worth of items
  const estimatedItemsPerScreen = vh / (props.estimateHeight || 50);
  const maxWindow = Math.ceil(estimatedItemsPerScreen * 2);
  
  // Asymmetric overscan: when at bottom, prefer more overscan above
  const topMultiplier = isAtBottom.value ? 2.0 : 1.0;
  const bottomMultiplier = isAtBottom.value ? 0.5 : 1.0;
  
  return {
    overscanTop: base * topMultiplier,
    overscanBottom: base * bottomMultiplier,
    maxWindow
  };
};

// --- Hidden Measurement ---
const itemsToMeasure = shallowRef<T[]>([]);
const measureRefs = new Map<number, HTMLElement>();

const setMeasureRef = (index: number, el: HTMLElement | null) => {
  if (el) {
    // Track mounted measurement node
    measureRefs.set(index, el);
  } else {
    // Drop reference on unmount to avoid stale nodes
    measureRefs.delete(index);
  }
};

const measureItems = async (items: T[]): Promise<number[]> => {
  const fallback = props.estimateHeight ?? 50;
  if (isDestroyed) return items.map(() => fallback);

  itemsToMeasure.value = items;
  measureRefs.clear();
  
  return new Promise<number[]>((resolve) => {
    // Wait for render
    nextTick(() => {
      if (isDestroyed) {
        itemsToMeasure.value = [];
        resolve(items.map(() => fallback));
        return;
      }

      // Measure
      const heights = items.map((_, i) => {
        const el = measureRefs.get(i);
        const measured = el?.getBoundingClientRect().height ?? 0;
        return measured > 0 ? measured : fallback;
      });
      
      // Reset
      itemsToMeasure.value = [];
      resolve(heights);
    });
  });
};



// --- Resize Observer & Measurement ---
const itemRefs = new Map<number, HTMLElement>();

const setItemRef = (index: number) => (el: Element | ComponentPublicInstance | null) => {
  if (el) {
    // Handle both raw elements and Vue component instances
    const element = (el instanceof Element ? el : (el as ComponentPublicInstance).$el) as HTMLElement;
    itemRefs.set(index, element);
    resizeObserverManager.observe(element, (entry) => onItemResize(index, entry));
  } else {
    const existing = itemRefs.get(index);
    if (existing) {
      resizeObserverManager.unobserve(existing);
      itemRefs.delete(index);
    }
  }
};

const onItemResize = (index: number, entry: ResizeObserverEntry) => {
  // Use borderBoxSize if available (modern browsers), fallback to contentRect for compatibility
  const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
  
  // We queue the update to batch changes and detect scroll shifts.
  // Do NOT update engine immediately, otherwise flushUpdates can't calculate delta.
  queueUpdate(index, height);
};

const pendingUpdates = new Map<number, number>();
let updateRaf: number | null = null;

// --- Exposed Methods ---
const scrollToBottom = () => {
  if (container.value) {
    container.value.scrollTop = container.value.scrollHeight;
  }
};

const scrollToIndex = (index: number, opts: { align?: 'start' | 'center' | 'end'; smooth?: boolean } = {}) => {
  if (!container.value || index < 0 || index >= props.items.length) return;
  
  const offset = engine.getOffsetForIndex(index);
  const measuredHeight = itemRefs.get(index)?.getBoundingClientRect().height ?? props.estimateHeight ?? 50;
  const behavior = opts.smooth ? 'smooth' : 'auto';
  let top = offset;

  if (opts.align === 'center') {
    top = offset - (viewportHeight.value / 2 - measuredHeight / 2);
  } else if (opts.align === 'end') {
    top = offset - (viewportHeight.value - measuredHeight);
  }

  container.value.scrollTo({ top: Math.max(0, top), behavior });
};

const scrollToItemKey = (key: string | number, opts: { align?: 'start' | 'center' | 'end'; smooth?: boolean } = {}) => {
  const index = props.items.findIndex(item => getItemKey(item) === key);
  if (index !== -1) {
    scrollToIndex(index, opts);
  }
};

const refreshMeasurements = () => {
  if (!container.value) {
    updateRange();
    return;
  }

  const anchorIndex = startIndex.value;
  const anchorOffsetBefore = engine.getOffsetForIndex(anchorIndex);
  const fallback = props.estimateHeight ?? 50;

  // Read-only pass: avoid mixing writes to the DOM in this loop to prevent layout thrash.
  itemRefs.forEach((el, idx) => {
    const measured = el.getBoundingClientRect().height;
    engine.setHeight(idx, measured > 0 ? measured : fallback);
  });

  const anchorOffsetAfter = engine.getOffsetForIndex(anchorIndex);
  const delta = anchorOffsetAfter - anchorOffsetBefore;

  if (delta !== 0) {
    container.value.scrollTop += delta;
    scrollTop.value = container.value.scrollTop;
  }

  updateRange();
};
const flushUpdates = () => {
  updateRaf = null;
  if (pendingUpdates.size === 0) return;
  
  // Check for user movement BEFORE syncing state
  let userHasMoved = false;
  if (container.value) {
    const liveScrollTop = container.value.scrollTop;
    // If the live scroll position differs significantly from our last known position,
    // it means the user has scrolled (and onScroll hasn't processed it yet).
    if (Math.abs(liveScrollTop - scrollTop.value) > SCROLL_POSITION_TOLERANCE) {
      userHasMoved = true;
    }
    // Sync local state
    scrollTop.value = liveScrollTop;
  }
  
  // We need to apply updates and compensate scroll.
  const anchorIndex = startIndex.value;
  const anchorOffsetBefore = engine.getOffsetForIndex(anchorIndex);
  
  // Apply all updates
  for (const [index, height] of pendingUpdates) {
    engine.setHeight(index, height);
  }
  pendingUpdates.clear();
  
  const anchorOffsetAfter = engine.getOffsetForIndex(anchorIndex);
  const delta = anchorOffsetAfter - anchorOffsetBefore;
  
  if (delta !== 0 && container.value) {
    if (!isUserScrolling.value) {
      container.value.scrollTop += delta;
      scrollTop.value = container.value.scrollTop; // Sync
    } else {
      deferredScrollDelta += delta;
    }
  }
  
  // Recompute range
  updateRange();
  
  // If following output, snap to bottom?
  if (props.maintainBottom && !isUserScrolling.value && container.value) {
    const { scrollHeight, scrollTop, clientHeight } = container.value;
    const isReallyAtBottom = (scrollHeight - (scrollTop + clientHeight)) <= BOTTOM_THRESHOLD;
    
    // We snap if we are effectively at the bottom, 
    // OR if we were at the bottom before and the user hasn't moved (auto-scroll for new content)
    const shouldSnap = isReallyAtBottom || (isAtBottom.value && !userHasMoved);

    if (shouldSnap) {
       scrollToBottom();
    }
  }
};

const queueUpdate = (index: number, height: number) => {
  pendingUpdates.set(index, height);
  if (!updateRaf) {
    updateRaf = requestAnimationFrame(flushUpdates);
  }
};

// --- Viewport Resize Observer ---
let containerResizeObserver: ResizeObserver | null = null;

const onViewportResize = (newHeight: number) => {
  if (!container.value) return;
  
  const oldHeight = viewportHeight.value;
  viewportHeight.value = newHeight;
  
  if (oldHeight === newHeight) return;
  
  // If at bottom, maintain bottom position
  if (isAtBottom.value && !isUserScrolling.value) {
    const totalHeight = engine.getTotalHeight();
    container.value.scrollTop = Math.max(0, totalHeight - newHeight);
    updateRange();
  } else {
    // Neutral anchor: try to keep the same top item visible
    // The current scrollTop should keep the same content visible
    updateRange();
  }
};

// --- Lifecycle ---
onMounted(() => {
  if (container.value) {
    viewportHeight.value = container.value.clientHeight;
    
    // Setup viewport resize observer (if available, e.g. not in test environment)
    if (typeof ResizeObserver !== 'undefined') {
      containerResizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          onViewportResize(newHeight);
        }
      });
      containerResizeObserver.observe(container.value);
    }
    
    // --- Guardrails ---
    // Only show warnings in dev mode and not in test environment
    const isTestEnv = import.meta.env.MODE === 'test' || typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
    if (import.meta.env.DEV && !isTestEnv) {
      if (viewportHeight.value === 0) {
        console.warn(
          '[or3-scroll] Container has 0 height. Please ensure the parent container has a set height or flex constraint.'
        );
      }
      
      if (props.estimateHeight && props.estimateHeight <= 0) {
        console.warn(
          `[or3-scroll] estimateHeight must be positive. Got ${props.estimateHeight}.`
        );
      }

      // Check for duplicate keys (dev only, first 100 items to avoid perf hit)
      if (props.items.length > 0) {
        const keys = new Set();
        const sample = props.items.slice(0, 100);
        for (const item of sample) {
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
    }
    
    updateRange();
  }
});

onUnmounted(() => {
  isDestroyed = true;

  if (updateRaf) cancelAnimationFrame(updateRaf);
  if (userScrollEndTimeout) {
    clearTimeout(userScrollEndTimeout);
    userScrollEndTimeout = null;
  }
  containerResizeObserver?.disconnect();
  containerResizeObserver = null;
  itemRefs.forEach((el) => resizeObserverManager.unobserve(el));
  itemRefs.clear();
});

// --- Watchers ---
watch(() => props.items, async (newItems, oldItems) => {
  // Handle initialization
  if (!oldItems || oldItems.length === 0) {
    engine.setCount(newItems.length);
    updateRange();
    return;
  }

  const newCount = newItems.length;
  const oldCount = oldItems.length;
  
  if (newCount === oldCount) {
    return;
  }
  
  if (newCount > oldCount) {
    // Fast path: common append/no-op case where head key is unchanged.
    const firstKeyOld = getItemKey(oldItems[0]);
    const firstKeyNew = getItemKey(newItems[0]);
    if (firstKeyOld === firstKeyNew) {
      engine.setCount(newCount);
      updateRange();
      return;
    }

    // Check for prepend by locating the old first key in the new list
    const indexInNew = newItems.findIndex(item => getItemKey(item) === firstKeyOld);
    
    if (indexInNew > 0) {
      // Confirm that the tail matches to reduce false positives on reorder
      const tailMatches = oldItems.every((item, idx) => getItemKey(item) === getItemKey(newItems[idx + indexInNew]));
      if (tailMatches) {
        const prependCount = indexInNew;
        const heights = props.loadingHistory
          ? await measureItems(newItems.slice(0, prependCount))
          : new Array(prependCount).fill(NaN);

        if (isDestroyed) return;
        
        engine.bulkInsert(0, heights);
        
        // Adjust scroll position using the new offsets
        const offsetShift = engine.getOffsetForIndex(indexInNew);
        
        if (container.value && offsetShift !== 0) {
          container.value.scrollTop += offsetShift;
          scrollTop.value = container.value.scrollTop;
        }
        
        // Account for any appended items beyond the prepend
        engine.setCount(newCount);
        
        updateRange();
        return;
      }
    }
  }
  
  // Default: Append or other change
  engine.setCount(newCount);
  updateRange();
}, { immediate: true });


defineExpose({
  /**
   * Scrolls the container to the absolute bottom.
   */
  scrollToBottom,
  /**
   * Scrolls to a specific index.
   * @param index The index of the item to scroll to.
   * @param opts Options for alignment and smoothness.
   */
  scrollToIndex,
  /**
   * Scrolls to a specific item by its unique key.
   * @param key The unique key of the item.
   * @param opts Options for alignment and smoothness.
   */
  scrollToItemKey,
  /**
   * Forces a remeasurement of all currently rendered items.
   * Useful if item content changes size without the item itself being replaced.
   */
  refreshMeasurements,
  /**
   * Whether the scroller is currently at the bottom (within threshold).
   */
  isAtBottom,
});
</script>

<template>
  <div 
    ref="container" 
    class="or3-scroll" 
    @scroll.passive="onScroll"
    @touchstart.passive="onUserScrollStart"
    @touchend.passive="onUserScrollEnd"
    @touchcancel.passive="onUserScrollEnd"
    @mousedown.passive="onUserScrollStart"
    @mouseup.passive="onUserScrollEnd"
    @wheel.passive="onUserScrollStart"
    @mouseleave="onUserScrollEnd"
  >
    <div
      class="or3-scroll-track"
      :style="{ height: totalHeight + 'px' }"
    >
      <div
        class="or3-scroll-slice"
        :style="{ transform: `translateY(${offsetY}px)` }"
      >
        <slot
          v-if="loadingHistory"
          name="prepend-loading"
        />
        <template
          v-for="(item, i) in visibleItems"
          :key="getItemKey(item)"
        >
          <div 
            class="or3-scroll-item"
            :data-index="startIndex + i"
            :ref="setItemRef(startIndex + i)"
          >
            <slot
              :item="item"
              :index="startIndex + i"
            />
          </div>
        </template>
      </div>
      
      <!-- Hidden Measurement Pool -->
      <div
        v-if="loadingHistory || itemsToMeasure.length"
        class="or3-scroll-hidden-pool"
        aria-hidden="true"
      >
        <slot
          v-if="loadingHistory"
          name="prepend-loading"
        />
        <template
          v-for="(item, i) in itemsToMeasure"
          :key="i"
        >
          <div :ref="el => setMeasureRef(i, el as HTMLElement | null)">
            <slot
              :item="item"
              :index="-1"
            />
          </div>
        </template>
      </div>
      
      <!-- Debug Slot -->
      <slot 
        name="__debug" 
        :start-index="startIndex" 
        :end-index="endIndex" 
        :total-height="totalHeight"
        :scroll-top="scrollTop"
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
