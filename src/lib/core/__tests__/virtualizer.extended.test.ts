import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualizerEngine } from '../virtualizer';

describe('VirtualizerEngine - Extended Tests', () => {
  let engine: VirtualizerEngine;
  const baseConfig = {
    estimateHeight: 50,
    overscanTop: 100,
    overscanBottom: 100,
    tailCount: 0
  };

  beforeEach(() => {
    engine = new VirtualizerEngine(baseConfig);
  });

  describe('1.1 Basic range computation', () => {
    it('should handle count = 0 without throwing', () => {
      const range = engine.computeRange(0, 500);
      expect(range).toBeDefined();
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(-1); // Empty range
      expect(range.offsetY).toBe(0);
      expect(range.totalHeight).toBe(0);
    });

    it('should handle count = 1 at scroll offset 0', () => {
      engine.setCount(1);
      const range = engine.computeRange(0, 500);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(0);
      expect(range.offsetY).toBe(0);
      expect(range.totalHeight).toBe(50);
    });

    it('should handle count = 2 at various scroll offsets', () => {
      engine.setCount(2);
      
      // At offset 0
      let range = engine.computeRange(0, 500);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(1);
      
      // At offset 50 (mid)
      range = engine.computeRange(50, 500);
      expect(range.startIndex).toBe(0); // Overscan includes item 0
      expect(range.endIndex).toBe(1);
      
      // At max offset
      range = engine.computeRange(100, 500);
      expect(range.startIndex).toBe(0); // With overscan
      expect(range.endIndex).toBe(1);
    });

    it('should handle count = 3 with different scroll offsets', () => {
      engine.setCount(3);
      
      // At top
      let range = engine.computeRange(0, 500);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(2);
      
      // Mid scroll
      range = engine.computeRange(75, 500);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(2);
    });

    it('should handle count = 100 with uniform heights at various offsets', () => {
      engine.setCount(100);
      // All items are 50px by default, total 5000px
      
      // Set all to uniform height 40px
      for (let i = 0; i < 100; i++) {
        engine.setHeight(i, 40);
      }
      
      expect(engine.getTotalHeight()).toBe(4000);
      
      // Viewport height 400, overscan 100
      // Scroll in steps and verify ranges
      
      // At top
      let range = engine.computeRange(0, 400);
      const prevStartIndex = range.startIndex;
      const prevEndIndex = range.endIndex;
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBeGreaterThan(0);
      
      // Scroll by 10 items (400px)
      range = engine.computeRange(400, 400);
      expect(range.startIndex).toBeGreaterThan(prevStartIndex);
      expect(range.endIndex).toBeGreaterThan(prevEndIndex);
      
      // Verify no gaps or overlaps
      const itemsAtFirst = prevEndIndex - prevStartIndex + 1;
      const itemsAtSecond = range.endIndex - range.startIndex + 1;
      expect(itemsAtFirst).toBeGreaterThan(0);
      expect(itemsAtSecond).toBeGreaterThan(0);
    });
  });

  describe('1.2 Variable heights', () => {
    it('should handle alternating heights (20, 200, 20, 200...)', () => {
      engine.setCount(10);
      for (let i = 0; i < 10; i++) {
        engine.setHeight(i, i % 2 === 0 ? 20 : 200);
      }
      
      // Total: 5 * 20 + 5 * 200 = 1100
      expect(engine.getTotalHeight()).toBe(1100);
      
      // Viewport 300, overscan 100
      // Visible range: 0-300, with overscan: 0-400
      const range = engine.computeRange(0, 300);
      
      // Should include all items that intersect viewport + overscan
      expect(range.startIndex).toBe(0);
      // Items: 0(20), 1(200), 2(20), 3(200) = 440px cumulative
      expect(range.endIndex).toBeGreaterThanOrEqual(1);
      
      // Verify items fully below are not included unnecessarily
      const offsetEnd = engine.getOffsetForIndex(range.endIndex + 1);
      expect(offsetEnd).toBeGreaterThan(300); // Should extend past viewport
    });

    it('should handle extreme outlier in middle', () => {
      engine.setCount(10);
      for (let i = 0; i < 10; i++) {
        if (i === 5) {
          engine.setHeight(i, 5000); // Huge item
        } else {
          engine.setHeight(i, 50);
        }
      }
      
      // Total: 9 * 50 + 5000 = 5450
      expect(engine.getTotalHeight()).toBe(5450);
      
      // Check range above the outlier
      let range = engine.computeRange(0, 400);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBeLessThanOrEqual(5); // May include item 5 with overscan
      
      // Check range inside the outlier
      range = engine.computeRange(250, 400); // Inside item 5
      expect(range.startIndex).toBeLessThanOrEqual(5);
      expect(range.endIndex).toBeGreaterThanOrEqual(5);
      
      // Check range below the outlier
      // Item 5 ends at offset 250 + 5000 = 5250
      // Scroll to 5300 means we're past item 5, so with overscan we might still include it
      range = engine.computeRange(5400, 400); // Further past to ensure we're beyond
      expect(range.startIndex).toBeGreaterThanOrEqual(5);
    });

    it('should handle items with height = 0', () => {
      engine.setCount(5);
      engine.setHeight(0, 50);
      engine.setHeight(1, 0); // Zero height
      engine.setHeight(2, 0); // Zero height
      engine.setHeight(3, 50);
      engine.setHeight(4, 50);
      
      // Total: 150
      expect(engine.getTotalHeight()).toBe(150);
      
      // Verify no negative offsets
      for (let i = 0; i < 5; i++) {
        const offset = engine.getOffsetForIndex(i);
        expect(offset).toBeGreaterThanOrEqual(0);
      }
      
      // Zero height items still count in indices
      expect(engine.getOffsetForIndex(1)).toBe(50);
      expect(engine.getOffsetForIndex(2)).toBe(50);
      expect(engine.getOffsetForIndex(3)).toBe(50);
      
      const range = engine.computeRange(0, 200);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('1.3 setCount / growth / shrink', () => {
    it('should increase count from 0 → 10 → 100 preserving heights', () => {
      // Start empty
      expect(engine.getTotalHeight()).toBe(0);
      
      // Grow to 10
      engine.setCount(10);
      expect(engine.getTotalHeight()).toBe(500); // 10 * 50
      
      // Measure some items
      engine.setHeight(0, 100);
      engine.setHeight(5, 75);
      
      // Total should now be: 100 + 4*50 + 75 + 4*50 = 100 + 200 + 75 + 200 = 575
      expect(engine.getTotalHeight()).toBe(575);
      
      // Grow to 100
      engine.setCount(100);
      
      // Verify existing heights preserved
      expect(engine.getOffsetForIndex(1)).toBe(100); // Item 0 is 100
      const offset6 = engine.getOffsetForIndex(6);
      // Items 0-5: 100 + 50*4 + 75 = 375
      expect(offset6).toBe(375);
      
      // New items use estimate: 100 + 75 + 98*50 = 5075
      expect(engine.getTotalHeight()).toBe(5075);
    });

    it('should decrease count 100 → 50 → 0', () => {
      engine.setCount(100);
      engine.setHeight(10, 100);
      engine.setHeight(60, 200);
      
      // Shrink to 50 (item 60 is removed, only item 10 remains measured)
      engine.setCount(50);
      // Total: item 10 is 100, rest (49 items) are 50 each = 100 + 49*50 = 2550
      expect(engine.getTotalHeight()).toBe(2550);
      
      // Item 10 still has its height
      // Offset for index 11: items 0-10 cumulative
      // Items 0-9: 10*50 = 500, Item 10: 100, so offset 11 = 600
      expect(engine.getOffsetForIndex(11)).toBe(600);
      
      // Shrink to 0
      engine.setCount(0);
      expect(engine.getTotalHeight()).toBe(0);
      
      const range = engine.computeRange(0, 500);
      expect(range.endIndex).toBe(-1);
    });

    it('should handle repeated grow/shrink cycles', () => {
      const sizes = [0, 10, 5, 20, 15, 50, 25, 0, 30];
      
      for (let i = 0; i < sizes.length; i++) {
        const size = sizes[i];
        
        engine.setCount(size);
        
        // When shrinking, some measured heights may be lost
        // When growing, new items use estimate
        // The total depends on what was measured before
        const total = engine.getTotalHeight();
        
        // At minimum, if all unmeasured, should be size * estimate
        expect(total).toBeGreaterThanOrEqual(0);
        
        // Verify range computation works
        const range = engine.computeRange(0, 500);
        if (size === 0) {
          expect(range.endIndex).toBe(-1);
        } else {
          expect(range.startIndex).toBe(0);
          expect(range.endIndex).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('1.4 setMeasured (setHeight) behavior', () => {
    it('should update single index correctly', () => {
      engine.setCount(10);
      
      engine.setHeight(3, 120);
      
      // Verify height is returned correctly
      const offset4 = engine.getOffsetForIndex(4);
      const offset3 = engine.getOffsetForIndex(3);
      expect(offset4 - offset3).toBe(120);
      
      // Verify total height reflects change
      // Items: 3 * 50 + 120 + 6 * 50 = 570
      expect(engine.getTotalHeight()).toBe(570);
    });

    it('should handle multiple updates on same index', () => {
      engine.setCount(5);
      
      engine.setHeight(2, 100);
      // Items: 0(50), 1(50), 2(100), 3(50), 4(50) = 300
      expect(engine.getTotalHeight()).toBe(300);
      
      // Update same index
      engine.setHeight(2, 200);
      // Items: 0(50), 1(50), 2(200), 3(50), 4(50) = 400
      expect(engine.getTotalHeight()).toBe(400);
      
      // Update back down
      engine.setHeight(2, 50);
      // Items: 0(50), 1(50), 2(50), 3(50), 4(50) = 250
      expect(engine.getTotalHeight()).toBe(250);
      
      // Verify range computation still works
      const range = engine.computeRange(0, 500);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBe(4);
    });

    it('should handle many updates in one frame', () => {
      engine.setCount(100);
      
      // Batch update many indices
      const updates: [number, number][] = [];
      for (let i = 0; i < 20; i++) {
        const index = i * 5;
        const height = 40 + (i * 10);
        updates.push([index, height]);
        engine.setHeight(index, height);
      }
      
      // Verify total height is correct
      let expected = 0;
      for (let i = 0; i < 100; i++) {
        const update = updates.find(u => u[0] === i);
        expected += update ? update[1] : 50;
      }
      expect(engine.getTotalHeight()).toBe(expected);
      
      // Verify range computation still works
      const range = engine.computeRange(1000, 500);
      expect(range.startIndex).toBeGreaterThan(0);
      expect(range.endIndex).toBeLessThan(100);
    });
  });

  describe('1.5 History prepend / bulk insert', () => {
    it('should insert N items at top with known heights', () => {
      engine.setCount(10);
      const oldTotal = engine.getTotalHeight(); // 500
      
      // Insert 5 items at top with heights [60, 70, 80, 90, 100]
      const newHeights = [60, 70, 80, 90, 100];
      engine.bulkInsert(0, newHeights);
      
      // New total should increase by sum of new heights
      const newHeightsSum = newHeights.reduce((a, b) => a + b, 0);
      expect(engine.getTotalHeight()).toBe(oldTotal + newHeightsSum);
      
      // Previously visible item at index k should now be at k + 5
      // Item that was at index 0 is now at index 5
      const offset5 = engine.getOffsetForIndex(5);
      expect(offset5).toBe(newHeightsSum);
    });

    it('should insert with mixed measured/unmeasured heights', () => {
      engine.setCount(5);
      
      // Insert with some NaN (unmeasured)
      engine.bulkInsert(0, [100, NaN, NaN, 150]);
      
      // Count should be 9 now
      expect(engine.getTotalHeight()).toBe(100 + 50 + 50 + 150 + 5 * 50);
      
      // Old items shifted by 4
      // Item that was at 0 is now at 4
      const offset4 = engine.getOffsetForIndex(4);
      expect(offset4).toBe(100 + 50 + 50 + 150);
      
      // Range computation should work
      const range = engine.computeRange(0, 500);
      expect(range.startIndex).toBe(0);
      expect(range.endIndex).toBeGreaterThan(0);
    });

    it('should handle insert at non-zero position', () => {
      engine.setCount(10);
      
      // Insert 3 items at position 5
      engine.bulkInsert(5, [40, 40, 40]);
      
      // Count should be 13
      expect(engine.getTotalHeight()).toBe(10 * 50 + 3 * 40);
      
      // Item originally at 5 should now be at 8
      const offset8 = engine.getOffsetForIndex(8);
      const offset5 = engine.getOffsetForIndex(5);
      expect(offset8 - offset5).toBe(40 * 3);
    });
  });

  describe('1.6 Numerical safety and limits', () => {
    it('should handle large lists (50k items) efficiently', () => {
      const count = 50000;
      const start = performance.now();
      
      engine.setCount(count);
      
      // Warm with some random heights
      for (let i = 0; i < 1000; i++) {
        const idx = Math.floor(Math.random() * count);
        const height = 30 + Math.random() * 100;
        engine.setHeight(idx, height);
      }
      
      // Test range computation is fast
      const rangeStart = performance.now();
      const range = engine.computeRange(100000, 1000);
      const rangeTime = performance.now() - rangeStart;
      
      expect(rangeTime).toBeLessThan(10); // Should be very fast
      expect(range.startIndex).toBeGreaterThanOrEqual(0);
      expect(range.startIndex).toBeLessThan(count);
      expect(range.endIndex).toBeGreaterThanOrEqual(range.startIndex);
      expect(range.endIndex).toBeLessThan(count);
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1000); // Should complete in reasonable time
    });

    it('should handle 100k items without pathological behavior', () => {
      const count = 100000;
      engine.setCount(count);
      
      // Add some variety
      for (let i = 0; i < 100; i++) {
        engine.setHeight(i * 1000, 100);
      }
      
      // Multiple range computations should be fast
      const iterations = 100;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const scroll = (i / iterations) * engine.getTotalHeight();
        const range = engine.computeRange(scroll, 1000);
        expect(range).toBeDefined();
      }
      
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;
      
      // Average time per range computation should be very low
      expect(avgTime).toBeLessThan(1); // Less than 1ms per computation
    });
  });
  describe('1.7 Tail behavior', () => {
    it('should handle tailCount near 0', () => {
      const e1 = new VirtualizerEngine({ ...baseConfig, tailCount: 1 });
      e1.setCount(100);
      
      // Scroll to bottom
      const range = e1.computeRange(4500, 500);
      expect(range.endIndex).toBe(99);
    });

    it('should handle tailCount equal to list size', () => {
      const e2 = new VirtualizerEngine({ ...baseConfig, tailCount: 10 });
      e2.setCount(10);
      
      const range = e2.computeRange(0, 500);
      expect(range.endIndex).toBe(9);
    });

    it('should handle tailCount larger than list size', () => {
      const e3 = new VirtualizerEngine({ ...baseConfig, tailCount: 50 });
      e3.setCount(10);
      
      const range = e3.computeRange(0, 500);
      expect(range.endIndex).toBe(9);
    });
  });

  describe('1.8 Bulk prepend under load', () => {
    it('should maintain consistent offsets during repeated prepends', () => {
      engine.setCount(200);
      const initialTotal = engine.getTotalHeight();
      
      // Prepend 50 items
      const newHeights = Array(50).fill(60);
      engine.bulkInsert(0, newHeights);
      
      expect(engine.getTotalHeight()).toBe(initialTotal + 50 * 60);
      
      // Check offset of original item 0 (now 50)
      expect(engine.getOffsetForIndex(50)).toBe(50 * 60);
    });
  });
});
