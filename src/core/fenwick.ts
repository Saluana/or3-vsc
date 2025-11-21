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
    this.capacity = capacity;
    this.tree = new Float64Array(capacity + 1);
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
    if (newCapacity <= this.capacity) return;
    const oldCapacity = this.capacity;
    const newTree = new Float64Array(newCapacity + 1);
    newTree.set(this.tree.subarray(0, oldCapacity + 1));
    for (let i = 1; i <= oldCapacity; i++) {
      const parent = i + (i & -i);
      if (parent > oldCapacity && parent <= newCapacity) {
        newTree[parent] += newTree[i];
      }
    }
    this.capacity = newCapacity;
    this.tree = newTree;
  }

  /**
   * Builds the tree from an array of values in O(n)
   */
  build(values: Float64Array | number[]): void {
    const n = Math.min(this.capacity, values.length);
    // Initialize tree with values (1-based)
    for (let i = 0; i < n; i++) {
      this.tree[i + 1] = values[i];
    }

    // Propagate sums
    for (let i = 1; i <= n; i++) {
      const parent = i + (i & -i);
      if (parent <= n) {
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
    return this.query(this.capacity - 1);
  }
}
