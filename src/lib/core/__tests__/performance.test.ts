import { describe, it, expect } from 'vitest';
import { VirtualizerEngine } from '../virtualizer';

describe('VirtualizerEngine Performance', () => {
  const createEngine = (count: number) => {
    const engine = new VirtualizerEngine({
      estimateHeight: 50,
      overscanTop: 200,
      overscanBottom: 200,
      tailCount: 0,
    });
    engine.setCount(count);
    return engine;
  };

  it('should initialize with 100k items quickly', () => {
    const start = performance.now();
    const engine = createEngine(100_000);
    const end = performance.now();
    
    // Initialization should be near-instant as it's just setting a number
    // Increased threshold to 50ms to account for CI/machine variance
    expect(end - start).toBeLessThan(50); // 50ms
    expect(engine.getTotalHeight()).toBe(100_000 * 50);
  });

  it('should seek randomly in 100k items quickly', () => {
    const engine = createEngine(100_000);
    
    const start = performance.now();
    
    // Perform 1000 random seeks
    for (let i = 0; i < 1000; i++) {
      const randomScroll = Math.floor(Math.random() * engine.getTotalHeight());
      engine.computeRange(randomScroll, 800);
    }
    
    const end = performance.now();
    const avgTime = (end - start) / 1000;
    
    // Each seek should be extremely fast (logarithmic or constant time)
    expect(avgTime).toBeLessThan(0.1); // 0.1ms per seek
  });

  it('should handle bulk updates efficiently', () => {
    const engine = createEngine(100_000);
    
    const start = performance.now();
    
    // Simulate measuring 100 items at once (e.g. initial render)
    const heights = Array(100).fill(60);
    for (let i = 0; i < 100; i++) {
      engine.setHeight(i, heights[i]);
    }
    
    const end = performance.now();
    
    // Bulk updates might be slower if done individually, but should still be reasonable
    // Fenwick tree updates are O(log N). 100 updates * log2(100000) ~ 100 * 17 ops.
    expect(end - start).toBeLessThan(50); // 50ms for 100 updates
  });
  
  it('should handle bulk insert at start efficiently', () => {
    const engine = createEngine(100_000);
    const start = performance.now();
    
    // Prepend 1000 items
    const newHeights = Array(1000).fill(50);
    engine.bulkInsert(0, newHeights);
    
    const end = performance.now();
    
    // Bulk insert should be fast
    expect(end - start).toBeLessThan(20); // 20ms
    expect(engine.getTotalHeight()).toBe(101_000 * 50);
  });
});
