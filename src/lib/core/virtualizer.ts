import { FenwickTree } from './fenwick';

export type Index = number;

export interface VirtualizerConfig {
    estimateHeight: number; // px
    overscanTop: number; // px
    overscanBottom: number; // px
    tailCount: number; // ensure last N items always in range
    maxWindow?: number; // max items to render in tail mode
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
    private capacity: number = 0;
    private prefixSums: FenwickTree;
    private config: VirtualizerConfig;

    constructor(config: VirtualizerConfig) {
        if (!Number.isFinite(config.estimateHeight) || config.estimateHeight < 0) {
            throw new RangeError('estimateHeight must be a non-negative finite number.');
        }
        this.config = {
            estimateHeight: config.estimateHeight,
            overscanTop: this.normalizeDistance(config.overscanTop),
            overscanBottom: this.normalizeDistance(config.overscanBottom),
            tailCount: this.normalizeCount(config.tailCount, 'tailCount'),
            maxWindow: this.normalizeOptionalWindow(config.maxWindow),
        };
        this.heights = new Float64Array(0);
        this.flags = new Uint8Array(0);
        this.prefixSums = new FenwickTree(0);
    }

    /**
     * Sets the total number of items.
     * Resizes internal storage if necessary.
     */
    setCount(count: number): void {
        count = this.normalizeCount(count, 'count');
        if (count === this.count) return;

        const oldCount = this.count;

        // Shrink without releasing capacity. Removed values must be cleared from
        // the Fenwick tree so later growth cannot resurrect stale measurements.
        if (count < oldCount) {
            for (let i = count; i < oldCount; i++) {
                this.prefixSums.update(i, -this.getEffectiveHeight(i));
                this.heights[i] = NaN;
                this.flags[i] = 0;
            }
            this.count = count;
            return;
        }

        this.ensureCapacity(count);
        for (let i = oldCount; i < count; i++) {
            this.heights[i] = NaN;
            this.flags[i] = 0;
            this.prefixSums.update(i, this.config.estimateHeight);
        }
        this.count = count;
    }

    /**
     * Updates the height of a specific item.
     */
    setHeight(index: Index, height: number): void {
        if (!Number.isSafeInteger(index)) {
            throw new RangeError('Height index must be a safe integer.');
        }
        if (index < 0 || index >= this.count) return;

        if (Number.isNaN(height)) {
            if ((this.flags[index] & 1) !== 1) return;
            const previous = this.heights[index];
            this.heights[index] = NaN;
            this.flags[index] = 0;
            this.prefixSums.update(
                index,
                this.config.estimateHeight - previous
            );
            return;
        }
        this.assertHeight(height);

        const oldHeight = this.heights[index];
        const isMeasured = (this.flags[index] & 1) === 1;

        // If it's already measured and the height hasn't changed, do nothing
        if (isMeasured && oldHeight === height) return;

        this.heights[index] = height;
        this.flags[index] |= 1; // Mark as measured

        // Update prefix sum
        // The delta is newEffectiveHeight - oldEffectiveHeight
        // Effective height is height if measured, else estimateHeight
        const oldEffective = isMeasured
            ? oldHeight
            : this.config.estimateHeight;
        const newEffective = height; // It is now measured

        this.prefixSums.update(index, newEffective - oldEffective);
    }

    /**
     * Bulk inserts items at a specific index (used for history prepend).
     * This is an expensive operation as it shifts data.
     */
    bulkInsert(at: Index, heights: readonly number[]): void {
        if (!Number.isSafeInteger(at)) {
            throw new RangeError('Insertion index must be a safe integer.');
        }
        if (at < 0 || at > this.count) return;
        const insertCount = heights.length;
        if (insertCount === 0) return;
        this.assertHeightList(heights);

        const oldCount = this.count;
        const newCount = oldCount + insertCount;
        this.ensureCapacity(newCount);

        this.heights.copyWithin(at + insertCount, at, oldCount);
        this.flags.copyWithin(at + insertCount, at, oldCount);

        // 2. Insert new items
        // If heights are provided, they are considered measured.
        // If a height is NaN, it's unknown.
        for (let i = 0; i < insertCount; i++) {
            const h = heights[i];
            this.heights[at + i] = h;
            this.flags[at + i] = 0;
            if (!isNaN(h)) {
                this.flags[at + i] = 1;
            }
        }
        this.count = newCount;

        this.rebuildPrefixSums();
    }

    /** Replaces the logical list while preserving allocated capacity. */
    replaceHeights(heights: readonly number[]): void {
        this.assertHeightList(heights);
        const nextCount = heights.length;
        this.shrinkCapacityForReplacement(nextCount);
        this.ensureCapacity(nextCount);
        for (let i = 0; i < nextCount; i++) {
            const height = heights[i];
            this.heights[i] = height;
            this.flags[i] = Number(!Number.isNaN(height));
        }
        for (let i = nextCount; i < this.count; i++) {
            this.heights[i] = NaN;
            this.flags[i] = 0;
        }
        this.count = nextCount;
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
        const safeScrollTop = Number.isFinite(scrollTop)
            ? Math.max(0, scrollTop)
            : 0;
        const safeViewportHeight = Number.isFinite(viewportHeight)
            ? Math.max(0, viewportHeight)
            : 0;

        // Handle overscan
        const visibleStart = Math.max(
            0,
            safeScrollTop - this.config.overscanTop
        );
        const visibleEnd = Math.min(
            totalHeight,
            safeScrollTop + safeViewportHeight + this.config.overscanBottom
        );

        let startIndex = this.findIndexForOffset(visibleStart);
        let endIndex = this.findIndexForOffset(visibleEnd);
        const viewportStartIndex = this.findIndexForOffset(
            safeScrollTop
        );

        // Keep tailCount items rendered when viewport reaches the tail region
        if (this.config.tailCount > 0 && this.count > 0) {
            const tailStartIndex = Math.max(
                0,
                this.count - this.config.tailCount
            );
            const tailStartOffset = this.getOffsetForIndex(tailStartIndex);

            // Only extend the range once the overscanned window overlaps the tail
            if (visibleEnd >= tailStartOffset) {
                // We are in or near the tail. Force the range to include tailStart..total.
                // But respect maxWindow to avoid exploding the range.

                // 1. Ensure we include the tail
                const newEnd = this.count - 1;
                let newStart = Math.min(startIndex, tailStartIndex);

                // 2. Apply maxWindow constraint
                const maxWindow = this.config.maxWindow ?? Infinity;
                const currentWindowSize = newEnd - newStart + 1;

                if (currentWindowSize > maxWindow) {
                    // Trim only extra overscan. The actual viewport must remain
                    // covered even when maxWindow was derived from a poor estimate.
                    const cappedStart = Math.max(
                        0,
                        newEnd - maxWindow + 1
                    );
                    newStart = Math.min(viewportStartIndex, cappedStart);
                }

                startIndex = newStart;
                endIndex = newEnd;
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
            totalHeight,
        };
    }

    /**
     * Binary search to find the index at a given byte/pixel offset.
     */
    findIndexForOffset(offset: number): Index {
        if (Number.isNaN(offset)) return 0;
        if (offset <= 0) return 0;
        if (offset >= this.getTotalHeight()) return Math.max(0, this.count - 1);

        // We want the item that *contains* the offset.
        // Item i covers [prefix(i-1), prefix(i)).
        // upperBound(offset) returns smallest i such that prefix(i) > offset.
        // This is exactly what we want.
        return Math.min(this.count - 1, this.prefixSums.upperBound(offset));
    }

    getOffsetForIndex(index: Index): number {
        if (!Number.isSafeInteger(index) || index < 0 || index > this.count) {
            throw new RangeError(
                `Offset index must be an integer between 0 and ${this.count}.`
            );
        }
        if (index <= 0) return 0;
        return this.prefixSums.query(index - 1);
    }

    getTotalHeight(): number {
        return this.count === 0 ? 0 : this.prefixSums.query(this.count - 1);
    }

    getCount(): number {
        return this.count;
    }

    getCapacity(): number {
        return this.capacity;
    }

    getMeasuredHeight(index: Index): number | undefined {
        if (
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index >= this.count ||
            (this.flags[index] & 1) !== 1
        ) {
            return undefined;
        }
        return this.heights[index];
    }

    /**
     * Updates the overscan configuration.
     * This is useful for dynamic overscan adjustments based on scroll position.
     */
    updateOverscan(overscanTop: number, overscanBottom: number): void {
        this.config.overscanTop = this.normalizeDistance(overscanTop);
        this.config.overscanBottom = this.normalizeDistance(overscanBottom);
    }

    /**
     * Updates the maximum window size for tail rendering.
     */
    updateMaxWindow(maxWindow: number | undefined): void {
        this.config.maxWindow = this.normalizeOptionalWindow(maxWindow);
    }

    updateTailCount(tailCount: number): void {
        this.config.tailCount = this.normalizeCount(tailCount, 'tailCount');
    }

    /**
     * Resets all height measurements to unknown (NaN).
     * Call this when the items array is replaced entirely (e.g., thread switch).
     */
    resetHeights(): void {
        this.heights.fill(NaN, 0, this.count);
        this.flags.fill(0, 0, this.count);
        this.rebuildPrefixSums();
    }

    private getEffectiveHeight(index: Index): number {
        return (this.flags[index] & 1) === 1
            ? this.heights[index]
            : this.config.estimateHeight;
    }

    private normalizeCount(value: number, label: string): number {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError(`${label} must be a non-negative finite number.`);
        }
        const normalized = Math.floor(value);
        if (!Number.isSafeInteger(normalized)) {
            throw new RangeError(`${label} must fit in a safe integer.`);
        }
        return normalized;
    }

    private normalizeDistance(value: number): number {
        return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    private normalizeOptionalWindow(value: number | undefined): number | undefined {
        if (value === undefined || value === Number.POSITIVE_INFINITY) {
            return value;
        }
        return this.normalizeCount(value, 'maxWindow');
    }

    private assertHeight(height: number): void {
        if (!Number.isFinite(height) || height < 0) {
            throw new RangeError('Item heights must be non-negative finite numbers or NaN.');
        }
    }

    private assertHeightList(heights: readonly number[]): void {
        for (const height of heights) {
            if (!Number.isNaN(height)) this.assertHeight(height);
        }
    }

    private shrinkCapacityForReplacement(nextCount: number): void {
        if (this.capacity < 256) return;
        let targetCapacity = nextCount === 0 ? 0 : 16;
        while (targetCapacity < nextCount) targetCapacity *= 2;
        if (targetCapacity > this.capacity / 4) return;

        this.capacity = targetCapacity;
        this.heights = new Float64Array(targetCapacity);
        this.heights.fill(NaN);
        this.flags = new Uint8Array(targetCapacity);
        this.prefixSums = new FenwickTree(targetCapacity);
    }

    private ensureCapacity(required: number): void {
        if (required <= this.capacity) return;

        let nextCapacity = Math.max(16, this.capacity || 0);
        while (nextCapacity < required) nextCapacity *= 2;

        const nextHeights = new Float64Array(nextCapacity);
        nextHeights.fill(NaN);
        nextHeights.set(this.heights.subarray(0, this.count));
        const nextFlags = new Uint8Array(nextCapacity);
        nextFlags.set(this.flags.subarray(0, this.count));

        this.heights = nextHeights;
        this.flags = nextFlags;
        this.capacity = nextCapacity;

        const effectiveHeights = new Float64Array(nextCapacity);
        for (let i = 0; i < this.count; i++) {
            effectiveHeights[i] = this.getEffectiveHeight(i);
        }
        this.prefixSums = new FenwickTree(nextCapacity);
        this.prefixSums.build(effectiveHeights);
    }

    private rebuildPrefixSums(): void {
        const effectiveHeights = new Float64Array(this.capacity);
        for (let i = 0; i < this.count; i++) {
            effectiveHeights[i] = this.getEffectiveHeight(i);
        }
        this.prefixSums.build(effectiveHeights);
    }
}
