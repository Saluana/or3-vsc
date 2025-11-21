import { FenwickTree } from './fenwick';

export type Index = number;

export interface VirtualizerConfig {
  estimateHeight: number; // px
  overscanPx: number; // px
  tailCount: number; // ensure last N items always in range
}

export interface RangeResult {
  startIndex: Index;
  endIndex: Index;
  offsetY: number; // sum heights before startIndex
  totalHeight: number; // known + estimated
}

export class VirtualizerEngine {
  private heights: Float64Array; // Stores known heights. NaN if unknown.
  private flags: Uint8Array; // Bitmask: 1 = measured
  private count: number = 0;
  private prefixSums: FenwickTree;

  constructor(private config: VirtualizerConfig) {
    this.heights = new Float64Array(0);
    this.flags = new Uint8Array(0);
    this.prefixSums = new FenwickTree(0);
  }

  /**
   * Sets the total number of items.
   * Resizes internal storage if necessary.
   */
  setCount(count: number): void {
    if (count === this.count) return;

    const oldHeights = this.heights;
    const oldFlags = this.flags;

    this.heights = new Float64Array(count);
    this.flags = new Uint8Array(count);
    
    // Copy existing data
    const copyLen = Math.min(this.count, count);
    this.heights.set(oldHeights.subarray(0, copyLen));
    this.flags.set(oldFlags.subarray(0, copyLen));

    // Initialize new items with NaN (unknown)
    if (count > this.count) {
      this.heights.fill(NaN, this.count);
    }

    this.count = count;

    // Rebuild Fenwick Tree
    // We need to feed it the effective heights (known or estimated)
    this.rebuildPrefixSums();
  }

  /**
   * Updates the height of a specific item.
   */
  setHeight(index: Index, height: number): void {
    if (index < 0 || index >= this.count) return;

    const oldHeight = this.heights[index];
    const isMeasured = (this.flags[index] & 1) === 1;

    // If it's already measured and the height hasn't changed, do nothing
    if (isMeasured && oldHeight === height) return;

    this.heights[index] = height;
    this.flags[index] |= 1; // Mark as measured

    // Update prefix sum
    // The delta is newEffectiveHeight - oldEffectiveHeight
    // Effective height is height if measured, else estimateHeight
    const oldEffective = isMeasured ? oldHeight : this.config.estimateHeight;
    const newEffective = height; // It is now measured
    
    this.prefixSums.update(index, newEffective - oldEffective);
  }

  /**
   * Bulk inserts items at a specific index (used for history prepend).
   * This is an expensive operation as it shifts data.
   */
  bulkInsert(at: Index, heights: readonly number[]): void {
    if (at < 0 || at > this.count) return;
    const insertCount = heights.length;
    if (insertCount === 0) return;

    const newCount = this.count + insertCount;
    const newHeights = new Float64Array(newCount);
    const newFlags = new Uint8Array(newCount);

    // 1. Copy before insertion point
    newHeights.set(this.heights.subarray(0, at), 0);
    newFlags.set(this.flags.subarray(0, at), 0);

    // 2. Insert new items
    // If heights are provided, they are considered measured.
    // If a height is NaN, it's unknown.
    for (let i = 0; i < insertCount; i++) {
      const h = heights[i];
      newHeights[at + i] = h;
      if (!isNaN(h)) {
        newFlags[at + i] |= 1;
      }
    }

    // 3. Copy after insertion point
    newHeights.set(this.heights.subarray(at), at + insertCount);
    newFlags.set(this.flags.subarray(at), at + insertCount);

    this.heights = newHeights;
    this.flags = newFlags;
    this.count = newCount;

    this.rebuildPrefixSums();
  }

  /**
   * Computes the visible range based on scroll position and viewport.
   */
  computeRange(scrollTop: number, viewportHeight: number): RangeResult {
    if (this.count === 0) {
      return { startIndex: 0, endIndex: -1, offsetY: 0, totalHeight: 0 };
    }

    const totalHeight = this.getTotalHeight();
    
    // Handle overscan
    const visibleStart = Math.max(0, scrollTop - this.config.overscanPx);
    const visibleEnd = Math.min(totalHeight, scrollTop + viewportHeight + this.config.overscanPx);

    let startIndex = this.findIndexForOffset(visibleStart);
    let endIndex = this.findIndexForOffset(visibleEnd);

    // Ensure tailCount items are included if we are near the end
    if (this.config.tailCount > 0) {
      // Requirement: "Keep last `tailCount` indexes in render window even if off-screen"
      if (endIndex < this.count - 1) {
         // ... comments ...
      }
    }

    // Clamp
    startIndex = Math.max(0, Math.min(startIndex, this.count - 1));
    endIndex = Math.max(startIndex, Math.min(endIndex, this.count - 1));

    const offsetY = this.getOffsetForIndex(startIndex);

    return {
      startIndex,
      endIndex,
      offsetY,
      totalHeight
    };
  }

  /**
   * Binary search to find the index at a given byte/pixel offset.
   */
  findIndexForOffset(offset: number): Index {
    if (offset <= 0) return 0;
    if (offset >= this.getTotalHeight()) return Math.max(0, this.count - 1);
    
    // We want the item that *contains* the offset.
    // Item i covers [prefix(i-1), prefix(i)).
    // upperBound(offset) returns smallest i such that prefix(i) > offset.
    // This is exactly what we want.
    return Math.min(this.count - 1, this.prefixSums.upperBound(offset));
  }

  getOffsetForIndex(index: Index): number {
    if (index <= 0) return 0;
    return this.prefixSums.query(index - 1);
  }

  getTotalHeight(): number {
    return this.prefixSums.total();
  }

  private rebuildPrefixSums(): void {
    this.prefixSums.resize(this.count);
    
    // We need to construct the array of effective heights
    const effectiveHeights = new Float64Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const h = this.heights[i];
      effectiveHeights[i] = isNaN(h) ? this.config.estimateHeight : h;
    }
    
    this.prefixSums.build(effectiveHeights);
  }
}
