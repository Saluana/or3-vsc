<script setup lang="ts" generic="T">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, shallowRef } from 'vue';
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

// --- State ---
const container = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(0);
const scrollHeight = ref(0);
const isUserScrolling = ref(false);
const isAtBottom = ref(true); // Default to true? Or derive?

// Engine
const engine = new VirtualizerEngine({
  estimateHeight: props.estimateHeight,
  overscanPx: props.overscan,
  tailCount: props.tailCount
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
    return (props.itemKey as any)(item);
  }
  return (item as any)[props.itemKey];
};

// --- Scroll Handling ---
const onScroll = () => {
  if (!container.value) return;
  
  const target = container.value;
  scrollTop.value = target.scrollTop;
  scrollHeight.value = target.scrollHeight;
  
  // Update isAtBottom
  // Threshold? Requirements say "threshold" but don't specify default.
  // Design says "bottomThreshold". Let's use 20px.
  const bottomThreshold = 20;
  const dist = target.scrollHeight - (target.scrollTop + target.clientHeight);
  isAtBottom.value = dist <= bottomThreshold;

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

const updateRange = () => {
  if (!container.value) return;
  
  const range = engine.computeRange(scrollTop.value, viewportHeight.value);
  startIndex.value = range.startIndex;
  endIndex.value = range.endIndex;
  offsetY.value = range.offsetY;
  totalHeight.value = range.totalHeight;
};

// --- Hidden Measurement ---
const itemsToMeasure = shallowRef<T[]>([]);
const measureRefs = new Map<number, HTMLElement>();

const setMeasureRef = (index: number, el: any) => {
  if (el) measureRefs.set(index, el as HTMLElement);
};

const measureItems = async (items: T[]): Promise<number[]> => {
  itemsToMeasure.value = items;
  measureRefs.clear();
  
  return new Promise<number[]>((resolve) => {
    // Wait for render
    nextTick(() => {
      // Measure
      const heights = items.map((_, i) => {
        const el = measureRefs.get(i);
        return el ? el.getBoundingClientRect().height : props.estimateHeight || 50;
      });
      
      // Reset
      itemsToMeasure.value = [];
      resolve(heights);
    });
  });
};



// --- Resize Observer & Measurement ---
const itemRefs = new Map<number, HTMLElement>();

const setItemRef = (index: number) => (el: any) => {
  if (el) {
    const element = el as HTMLElement;
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
  const height = entry.borderBoxSize[0].blockSize;
  
  // Feed engine
  engine.setHeight(index, height);
  
  // If this update affects layout above current scroll position, we might need compensation.
  // But we batch updates usually.
  // For now, let's just update range on next frame or immediately?
  // Design says: "Batch updates with requestAnimationFrame".
  // Also: "Detect total delta for indexes < startIndex and adjust container scrollTop".
  
  // We need to track delta if index < startIndex.
  // But engine.setHeight updates prefix sums immediately.
  // So we can calculate delta by checking offset before and after?
  // Or we can rely on the engine to tell us?
  // The engine just updates data.
  
  // If we update height of item 5, and we are at item 10.
  // The offset of item 10 increases.
  // So scrollTop should increase to keep item 10 in place.
  
  // Implementation:
  // 1. Get current anchor item (first visible item).
  // 2. Get its offset BEFORE update.
  // 3. Update height.
  // 4. Get its offset AFTER update.
  // 5. Diff is the scroll correction.
  
  // However, we might have multiple updates per frame.
  // So we should queue them.
  
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
  // TODO: Handle alignment (start is default)
  // For center/end we need item height. If not measured, use estimate.
  // But getOffsetForIndex gives top.
  
  // Simple implementation for now: scroll to top of item
  const behavior = opts.smooth ? 'smooth' : 'auto';
  container.value.scrollTo({ top: offset, behavior });
};

const scrollToItemKey = (key: string | number, opts: { align?: 'start' | 'center' | 'end'; smooth?: boolean } = {}) => {
  const index = props.items.findIndex(item => getItemKey(item) === key);
  if (index !== -1) {
    scrollToIndex(index, opts);
  }
};

const refreshMeasurements = () => {
  // Manual lever to reclaim memory or fix issues
  // We reset the engine?
  // Or just clear refs?
  // Engine has setCount.
  // If we want to clear cache, we might need a method on engine.
  // But engine.setCount(0) then setCount(n) might work but is destructive.
  // Let's just re-measure visible items?
  // Requirement says: "doubles as the manual lever for reclaiming memory".
  // So we should probably reset engine state.
  // But we need to keep current scroll position?
  // That's hard if we clear everything.
  // Maybe just force updateRange?
  updateRange();
};
const flushUpdates = () => {
  updateRaf = null;
  if (pendingUpdates.size === 0) return;
  
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
      container.value.scrollTop += delta;
      scrollTop.value = container.value.scrollTop;
    }
  }
  
  // Recompute range
  updateRange();
  
  // If following output, snap to bottom?
  if (props.maintainBottom && isAtBottom.value) {
     scrollToBottom();
  }
};

const queueUpdate = (index: number, height: number) => {
  pendingUpdates.set(index, height);
  if (!updateRaf) {
    updateRaf = requestAnimationFrame(flushUpdates);
  }
};

// --- Lifecycle ---
onMounted(() => {
  if (container.value) {
    viewportHeight.value = container.value.clientHeight;
    updateRange();
  }
});

onUnmounted(() => {
  if (updateRaf) cancelAnimationFrame(updateRaf);
  itemRefs.forEach((el) => resizeObserverManager.unobserve(el));
  itemRefs.clear();
});

// --- Watchers ---
watch(() => props.items, (newItems, oldItems) => {
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
    // Check for prepend
    const firstKeyOld = getItemKey(oldItems[0]);
    const firstKeyNew = getItemKey(newItems[0]);
    
    if (firstKeyNew !== firstKeyOld) {
      // Likely prepend.
      // Find old first item in new list
      const indexInNew = newItems.findIndex(item => getItemKey(item) === firstKeyOld);
      
      if (indexInNew > 0) {
        // Prepended 'indexInNew' items
        const prependCount = indexInNew;
        
        // Insert into engine
        // We pass NaN to indicate unknown height (use estimate)
        const newHeights = new Array(prependCount).fill(NaN);
        engine.bulkInsert(0, newHeights);
        
        // Adjust scroll position
        // The offset of the old first item (now at indexInNew) is exactly what we need.
        const offsetShift = engine.getOffsetForIndex(indexInNew);
        
        if (container.value) {
          container.value.scrollTop += offsetShift;
          scrollTop.value = container.value.scrollTop;
        }
        
        // If there are also appended items, ensure count is correct
        // bulkInsert updates count by prependCount.
        // If newCount is still larger, it means we also appended.
        // engine.setCount will handle resizing for the end.
        // We can't check engine.count directly as it's private, but we know what we did.
        // Actually, we can just call setCount(newCount) safely.
        // It will resize if needed.
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
  scrollToBottom,
  scrollToIndex,
  scrollToItemKey,
  refreshMeasurements,
  measureItems,
});
</script>

<template>
  <div 
    ref="container" 
    class="or3-scroll" 
    @scroll.passive="onScroll"
  >
    <div class="or3-scroll-track" :style="{ height: totalHeight + 'px' }">
      <div
        class="or3-scroll-slice"
        :style="{ transform: `translateY(${offsetY}px)` }"
      >
        <slot name="prepend-loading" v-if="loadingHistory" />
        <template
          v-for="(item, i) in visibleItems"
          :key="getItemKey(item)"
        >
          <div 
            class="or3-scroll-item" 
            :data-index="startIndex + i"
            :ref="setItemRef(startIndex + i)"
          >
            <slot :item="item" :index="startIndex + i" />
          </div>
        </template>
      </div>
      
      <!-- Hidden Measurement Pool -->
      <div class="or3-scroll-hidden-pool" aria-hidden="true">
        <slot name="prepend-loading" v-if="loadingHistory" />
        <!-- We need a way to render specific items for measurement. 
             The requirement says: "Provide measureItems(items: T[]): Promise<number[]>".
             So we need a reactive state for items to measure. -->
        <template v-for="(item, i) in itemsToMeasure" :key="i">
           <div :ref="el => setMeasureRef(i, el)">
             <slot :item="item" :index="-1" />
           </div>
        </template>
      </div>
      
      <!-- Debug Slot -->
      <slot 
        name="__debug" 
        :startIndex="startIndex" 
        :endIndex="endIndex" 
        :totalHeight="totalHeight"
        :scrollTop="scrollTop"
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
