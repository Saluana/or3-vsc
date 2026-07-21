/**
 * Fenwick Tree (Binary Indexed Tree) implementation for efficient prefix sum calculations.
 * 1-based indexing internally, but exposed methods should handle 0-based indices if needed.
 *
 * Invariants:
 * - tree array size is capacity + 1
 * - values must be non-negative (for monotonic prefix sums, though BIT supports negatives, our use case implies heights >= 0)
 */
export class FenwickTree {
  private tree: Float64Array;
  private capacity: number;

  constructor(capacity: number) {
    FenwickTree.assertCapacity(capacity);
    this.capacity = capacity;
    this.tree = new Float64Array(capacity + 1);
  }

  private static assertCapacity(capacity: number): void {
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new RangeError('FenwickTree capacity must be a non-negative safe integer.');
    }
  }

  private assertIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.capacity) {
      throw new RangeError(
        `FenwickTree index must be an integer between 0 and ${Math.max(0, this.capacity - 1)}.`
      );
    }
  }

  /**
   * Resizes the tree to a new capacity.
   * This is expensive as it requires rebuilding the tree if we want to preserve data,
   * or we can just clear it if the use case allows.
   * For our virtualizer, usually we resize when items are added.
   *
   * @param newCapacity The new size of the list
   * @param values Optional array of current values to rebuild the tree from scratch (faster than incremental updates)
   */
  resize(newCapacity: number, values?: Float64Array | number[]): void {
    FenwickTree.assertCapacity(newCapacity);
    if (newCapacity === this.capacity && !values) return;

    this.capacity = newCapacity;
    this.tree = new Float64Array(newCapacity + 1);

    if (values) {
      this.build(values);
    }
  }

  /**
   * Grows the tree preserving existing sums. No-op if newCapacity <= current capacity.
   */
  grow(newCapacity: number): void {
    FenwickTree.assertCapacity(newCapacity);
    if (newCapacity <= this.capacity) return;
    
    // Extract current values by computing differences
    const oldCapacity = this.capacity;
    const values = new Float64Array(newCapacity); // Size for new capacity
    for (let i = 0; i < oldCapacity; i++) {
      const current = this.query(i);
      const prev = i > 0 ? this.query(i - 1) : 0;
      values[i] = current - prev;
    }
    // New indices are initialized to 0 (already done by Float64Array)
    
    // Resize and rebuild
    this.capacity = newCapacity;
    this.tree = new Float64Array(newCapacity + 1);
    this.build(values);
  }

  /**
   * Builds the tree from an array of values in O(n)
   */
  build(values: Float64Array | number[]): void {
    this.tree.fill(0);
    const n = Math.min(this.capacity, values.length);
    // Initialize tree with values (1-based)
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(values[i])) {
        throw new RangeError('FenwickTree values must be finite.');
      }
      this.tree[i + 1] = values[i];
    }

    // Propagate through the complete capacity. Zero-valued tail cells still
    // need their ancestors populated when `values` is shorter than capacity.
    for (let i = 1; i <= this.capacity; i++) {
      const parent = i + (i & -i);
      if (parent <= this.capacity) {
        this.tree[parent] += this.tree[i];
      }
    }
  }

  /**
   * Adds delta to the element at index.
   * @param index 0-based index
   * @param delta Change in value
   */
  update(index: number, delta: number): void {
    this.assertIndex(index);
    if (!Number.isFinite(delta)) {
      throw new RangeError('FenwickTree update delta must be finite.');
    }
    let i = index + 1; // Convert to 1-based
    while (i <= this.capacity) {
      this.tree[i] += delta;
      i += i & -i;
    }
  }

  /**
   * Returns the prefix sum up to index (inclusive).
   * @param index 0-based index
   */
  query(index: number): number {
    this.assertIndex(index);
    let sum = 0;
    let i = index + 1; // Convert to 1-based
    while (i > 0) {
      sum += this.tree[i];
      i -= i & -i;
    }
    return sum;
  }

  /**
   * Finds the smallest index such that query(index) >= value.
   * Uses binary lifting for O(log n).
   * @param value Target prefix sum
   * @returns 0-based index
   */
  lowerBound(value: number): number {
    let idx = 0;
    let bitMask = 1;
    while (bitMask <= this.capacity) bitMask <<= 1;
    bitMask >>= 1;

    while (bitMask > 0) {
      const tIdx = idx + bitMask;
      if (tIdx <= this.capacity && value > this.tree[tIdx]) {
        idx = tIdx;
        value -= this.tree[idx];
      }
      bitMask >>= 1;
    }
    return idx;
  }

  /**
   * Finds the smallest index such that query(index) > value.
   * @param value Target prefix sum
   * @returns 0-based index
   */
  upperBound(value: number): number {
    let idx = 0;
    let bitMask = 1;
    while (bitMask <= this.capacity) bitMask <<= 1;
    bitMask >>= 1;

    while (bitMask > 0) {
      const tIdx = idx + bitMask;
      if (tIdx <= this.capacity && value >= this.tree[tIdx]) {
        idx = tIdx;
        value -= this.tree[idx];
      }
      bitMask >>= 1;
    }
    return idx;
  }


  /**
   * Get total sum of all elements.
   */
  total(): number {
    if (this.capacity === 0) return 0;
    return this.query(this.capacity - 1);
  }

  getCapacity(): number {
    return this.capacity;
  }
}
