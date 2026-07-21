import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualizerEngine } from '../virtualizer';

describe('VirtualizerEngine', () => {
  let engine: VirtualizerEngine;
  const config = {
    estimateHeight: 50,
    overscanTop: 100,
    overscanBottom: 100,
    tailCount: 0
  };

  beforeEach(() => {
    engine = new VirtualizerEngine(config);
  });

  it('should handle empty state', () => {
    const range = engine.computeRange(0, 500);
    expect(range).toEqual({
      startIndex: 0,
      endIndex: -1,
      offsetY: 0,
      totalHeight: 0
    });
  });

  it('should use estimated heights initially', () => {
    engine.setCount(10); // 10 * 50 = 500px total
    expect(engine.getTotalHeight()).toBe(500);

    const range = engine.computeRange(0, 200); // Viewport 200px
    // Visible: 0..200. Overscan: 100. Range: 0..300.
    // Items: 0 (0-50), 1 (50-100), 2 (100-150), 3 (150-200), 4 (200-250), 5 (250-300)
    // Start: 0. End: 5 (covers up to 300)
    
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBeGreaterThanOrEqual(3); // At least visible
    expect(range.totalHeight).toBe(500);
  });

  it('should update with measured heights', () => {
    engine.setCount(10);
    engine.setHeight(0, 100); // Item 0 is now 100px
    // Total: 100 + 9*50 = 550
    expect(engine.getTotalHeight()).toBe(550);

    const range = engine.computeRange(50, 200); 
    // ScrollTop 50. Viewport 200. Visible: 50..250.
    // Overscan 100. Range: 0..350.
    // Item 0: 0-100.
    // Item 1: 100-150.
    // Item 2: 150-200.
    // ...
    
    expect(range.offsetY).toBe(0); // Start index 0 starts at 0
    expect(range.startIndex).toBe(0);
  });

  it('should handle bulk insert (prepend)', () => {
    engine.setCount(5); // [50, 50, 50, 50, 50]
    engine.setHeight(0, 100); // [100, 50, 50, 50, 50]
    
    // Prepend 2 items of height 80
    engine.bulkInsert(0, [80, 80]);
    
    // New state: [80, 80, 100, 50, 50, 50, 50]
    expect(engine.getTotalHeight()).toBe(160 + 100 + 200); // 460
    
    expect(engine.getOffsetForIndex(2)).toBe(160); // Index 2 is the old Index 0 (100px)
  });

  it('should find index for offset correctly', () => {
    engine.setCount(3);
    engine.setHeight(0, 100);
    engine.setHeight(1, 200);
    engine.setHeight(2, 300);
    // [0-100), [100-300), [300-600)

    expect(engine.findIndexForOffset(0)).toBe(0);
    expect(engine.findIndexForOffset(50)).toBe(0);
    expect(engine.findIndexForOffset(99)).toBe(0);
    expect(engine.findIndexForOffset(100)).toBe(1); // Start of item 1
    expect(engine.findIndexForOffset(299)).toBe(1);
    expect(engine.findIndexForOffset(300)).toBe(2);
    expect(engine.findIndexForOffset(600)).toBe(2); // Clamped
  });
  
  it('should respect tailCount', () => {
    const tailEngine = new VirtualizerEngine({ 
      estimateHeight: 50,
      overscanTop: 100,
      overscanBottom: 100,
      tailCount: 10,
      maxWindow: 30
    });
    tailEngine.setCount(100);

    // Viewport at top should not render the entire list
    const rangeTop = tailEngine.computeRange(0, 500);
    expect(rangeTop.endIndex).toBeLessThan(99);

    // Near the end we should always include the final item
    const total = tailEngine.getTotalHeight(); // 5000
    const rangeBottom = tailEngine.computeRange(total - 500, 500);
    expect(rangeBottom.endIndex).toBe(99);
    expect(rangeBottom.startIndex).toBeLessThanOrEqual(99);
  });

  it('should retain measured data when growing count incrementally', () => {
    engine.setCount(2);
    engine.setHeight(0, 100);

    engine.setCount(4);

    expect(engine.getOffsetForIndex(1)).toBe(100);
    expect(engine.getTotalHeight()).toBe(100 + 50 + 50 + 50);
  });

  it('grows storage geometrically and never resurrects truncated heights', () => {
    engine.setCount(17);
    expect(engine.getCapacity()).toBe(32);
    engine.setHeight(16, 400);

    engine.setCount(8);
    expect(engine.getTotalHeight()).toBe(8 * 50);
    engine.setCount(17);

    expect(engine.getCapacity()).toBe(32);
    expect(engine.getMeasuredHeight(16)).toBeUndefined();
    expect(engine.getTotalHeight()).toBe(17 * 50);
  });

  it('uses logarithmically many allocations for incremental appends', () => {
    for (let count = 1; count <= 100_000; count++) {
      engine.setCount(count);
    }

    expect(engine.getCount()).toBe(100_000);
    expect(engine.getCapacity()).toBe(131_072);
    expect(engine.getTotalHeight()).toBe(5_000_000);
  });

  it('replaces arbitrary height layouts while preserving capacity', () => {
    engine.setCount(40);
    const capacity = engine.getCapacity();

    engine.replaceHeights([20, NaN, 80, 10]);

    expect(engine.getCapacity()).toBe(capacity);
    expect(engine.getTotalHeight()).toBe(20 + 50 + 80 + 10);
    expect(engine.getOffsetForIndex(3)).toBe(150);
  });

  it('normalizes fractional window configuration and rejects fractional indices', () => {
    const tailEngine = new VirtualizerEngine({
      estimateHeight: 50,
      overscanTop: 0,
      overscanBottom: 0,
      tailCount: 1.5,
      maxWindow: 4.5,
    });
    tailEngine.setCount(10);

    expect(tailEngine.computeRange(450, 50).endIndex).toBe(9);
    expect(() => tailEngine.getOffsetForIndex(0.5)).toThrow(RangeError);
  });

  it('does not mutate configuration shared by another engine', () => {
    const shared = {
      estimateHeight: 50,
      overscanTop: 100,
      overscanBottom: 100,
      tailCount: 0,
    };
    const first = new VirtualizerEngine(shared);
    const second = new VirtualizerEngine(shared);
    first.setCount(10);
    second.setCount(10);

    first.updateOverscan(0, 0);

    expect(first.computeRange(0, 50).endIndex).toBe(1);
    expect(second.computeRange(0, 50).endIndex).toBe(3);
  });

  it('rejects invalid counts without corrupting existing state', () => {
    engine.setCount(3);

    expect(() => engine.setCount(Number.NaN)).toThrow(RangeError);
    expect(() => engine.setCount(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(engine.getCount()).toBe(3);
    expect(engine.getTotalHeight()).toBe(150);
  });

  it('clears NaN measurements and rejects other invalid heights', () => {
    engine.setCount(3);
    engine.setHeight(1, 90);
    expect(engine.getTotalHeight()).toBe(190);

    engine.setHeight(1, Number.NaN);
    expect(engine.getMeasuredHeight(1)).toBeUndefined();
    expect(engine.getTotalHeight()).toBe(150);
    expect(() => engine.setHeight(1, -1)).toThrow(RangeError);
    expect(() => engine.setHeight(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => engine.replaceHeights([10, -5])).toThrow(RangeError);
    expect(engine.getCount()).toBe(3);
  });

  it('releases stale high-water capacity before small arbitrary rebuilds', () => {
    engine.setCount(1_000_000);
    expect(engine.getCapacity()).toBe(1_048_576);

    engine.replaceHeights([25]);

    expect(engine.getCapacity()).toBeLessThanOrEqual(16);
    expect(engine.getTotalHeight()).toBe(25);
  });

  it('never lets tail capping remove rows required by the viewport', () => {
    const tailEngine = new VirtualizerEngine({
      estimateHeight: 100,
      overscanTop: 0,
      overscanBottom: 500,
      tailCount: 10,
      maxWindow: 4,
    });
    tailEngine.setCount(20);
    for (let index = 0; index < 20; index++) {
      tailEngine.setHeight(index, 20);
    }

    const range = tailEngine.computeRange(200, 160);
    expect(range.startIndex).toBeLessThanOrEqual(10);
    expect(range.endIndex).toBe(19);
  });

  it('matches a naive height array across mixed list mutations', () => {
    let seed = 0x12345678;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const estimate = config.estimateHeight;
    let naive: number[] = [];

    const verify = () => {
      expect(engine.getCount()).toBe(naive.length);
      expect(engine.getTotalHeight()).toBeCloseTo(
        naive.reduce((total, height) => total + height, 0),
        8
      );
      for (let index = 0; index <= naive.length; index++) {
        expect(engine.getOffsetForIndex(index)).toBeCloseTo(
          naive.slice(0, index).reduce((total, height) => total + height, 0),
          8
        );
      }
    };

    for (let operation = 0; operation < 500; operation++) {
      const kind = Math.floor(random() * 5);
      if (kind === 0 || naive.length === 0) {
        const amount = 1 + Math.floor(random() * 5);
        engine.setCount(naive.length + amount);
        naive.push(...Array.from({ length: amount }, () => estimate));
      } else if (kind === 1) {
        const index = Math.floor(random() * naive.length);
        const height = 10 + Math.floor(random() * 190);
        engine.setHeight(index, height);
        naive[index] = height;
      } else if (kind === 2) {
        const nextCount = Math.floor(random() * naive.length);
        engine.setCount(nextCount);
        naive.length = nextCount;
      } else if (kind === 3) {
        const values = Array.from({ length: 1 + Math.floor(random() * 4) }, () =>
          random() < 0.35 ? NaN : 10 + Math.floor(random() * 190)
        );
        engine.bulkInsert(0, values);
        naive.unshift(...values.map((height) => Number.isNaN(height) ? estimate : height));
      } else {
        const values = Array.from({ length: Math.floor(random() * 24) }, () =>
          random() < 0.35 ? NaN : 10 + Math.floor(random() * 190)
        );
        engine.replaceHeights(values);
        naive = values.map((height) => Number.isNaN(height) ? estimate : height);
      }
      verify();
    }
  });
});
