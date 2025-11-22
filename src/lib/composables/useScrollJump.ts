import { ref, watch, type Ref } from 'vue';

export type JumpState =
  | { state: 'idle' }
  | { state: 'jumping'; targetId: string; align: 'start' | 'center' | 'end' }
  | { state: 'waitingForHistory'; targetId: string; direction: 'up' | 'down' };

export interface Or3ScrollRef {
  scrollToItemKey: (key: string | number, opts?: { align?: 'start' | 'center' | 'end'; smooth?: boolean }) => void;
}

export interface UseScrollJumpOptions<T> {
  /**
   * Ref to the Or3Scroll component instance
   */
  scrollerRef: Ref<Or3ScrollRef | null>;
  
  /**
   * Reactive items array
   */
  items: Ref<T[]>;
  
  /**
   * Function to extract the unique ID from an item
   */
  getItemId: (item: T) => string | number;
  
  /**
   * Callback to load more history until the target ID is found
   * Should return a promise that resolves when loading is complete
   * or rejects if the ID cannot be found
   */
  loadHistoryUntil: (targetId: string | number, direction: 'up' | 'down') => Promise<void>;
}

/**
 * Composable for handling "jump to ID" navigation in Or3Scroll.
 * 
 * Use this when you need to scroll to a message that might not be loaded yet.
 * 
 * @example
 * ```ts
 * const scrollerRef = ref<InstanceType<typeof Or3Scroll>>();
 * const items = ref<Message[]>([...]);
 * 
 * const { jumpTo, jumpState } = useScrollJump({
 *   scrollerRef,
 *   items,
 *   getItemId: (msg) => msg.id,
 *   loadHistoryUntil: async (id, direction) => {
 *     // Your pagination logic here
 *     await fetchMessagesUntil(id, direction);
 *   }
 * });
 * 
 * // Later...
 * jumpTo('message-123', { align: 'center' });
 * ```
 */
export function useScrollJump<T>(options: UseScrollJumpOptions<T>) {
  const { scrollerRef, items, getItemId, loadHistoryUntil } = options;
  
  const jumpState = ref<JumpState>({ state: 'idle' });
  
  /**
   * Jumps to a specific item by ID.
   * If the item is already loaded, scrolls immediately.
   * Otherwise, triggers history loading and scrolls once the item appears.
   */
  async function jumpTo(
    id: string | number,
    opts: { align?: 'start' | 'center' | 'end'; direction?: 'up' | 'down' } = {}
  ): Promise<void> {
    const align = opts.align ?? 'center';
    const direction = opts.direction ?? 'up';
    
    // 1. If already loaded, scroll immediately
    const index = items.value.findIndex(item => getItemId(item) === id);
    if (index !== -1) {
      scrollerRef.value?.scrollToItemKey(id, { align });
      jumpState.value = { state: 'idle' };
      return;
    }
    
    // 2. Not loaded. Start loading history
    jumpState.value = { state: 'waitingForHistory', targetId: String(id), direction };
    
    try {
      await loadHistoryUntil(id, direction);
      // After loading, the watch below should handle the scroll
    } catch (err) {
      console.error('[useScrollJump] Failed to load history:', err);
      jumpState.value = { state: 'idle' };
    }
  }
  
  /**
   * Watch items for the target ID appearing
   */
  watch(items, () => {
    if (jumpState.value.state === 'waitingForHistory') {
      const { targetId } = jumpState.value;
      const index = items.value.findIndex(item => String(getItemId(item)) === targetId);
      
      if (index !== -1) {
        // Found it! Scroll to it
        // Use nextTick to ensure DOM is updated
        queueMicrotask(() => {
          scrollerRef.value?.scrollToItemKey(targetId, { align: 'center' });
          jumpState.value = { state: 'idle' };
        });
      }
    }
  }, { deep: false });
  
  return {
    jumpTo,
    jumpState,
  };
}
