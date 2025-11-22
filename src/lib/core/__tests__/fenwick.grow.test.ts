import { describe, it, expect } from 'vitest';
import { FenwickTree } from '../fenwick';

describe('FenwickTree - grow behavior', () => {
  it('should preserve existing sums when growing', () => {
    const tree = new FenwickTree(10);
    
    // Build with initial values
    const values = [100, 50, 50, 50, 50, 75, 50, 50, 50, 50];
    tree.build(values);
    
    const totalBefore = tree.total();
    expect(totalBefore).toBe(575);
    
    // Check a few individual queries before grow
    const query4Before = tree.query(4); // Sum of first 5 elements
    const query9Before = tree.query(9); // Sum of all 10 elements
    
    // Now grow to 100
    tree.grow(100);
    
    // Check that old queries still work
    const query4After = tree.query(4);
    const query9After = tree.query(9);
    console.log('query(4) before:', query4Before, 'after:', query4After);
    console.log('query(9) before:', query9Before, 'after:', query9After);
    console.log('total after grow (before adding new):', tree.total());
    
    // Add values for new indices
    for (let i = 10; i < 100; i++) {
      tree.update(i, 50);
    }
    
    const totalAfter = tree.total();
    console.log('total after adding new indices:', totalAfter);
    expect(totalAfter).toBe(575 + 90 * 50); // Should be 5075
  });

  it('should handle query after grow correctly', () => {
    const tree = new FenwickTree(5);
    tree.build([10, 20, 30, 40, 50]);
    
    expect(tree.query(4)).toBe(150); // Sum of all 5 elements
    expect(tree.total()).toBe(150);
    
    tree.grow(10);
    
    // Query first 5 should still be 150
    expect(tree.query(4)).toBe(150);
    
    // Add values for new indices
    tree.update(5, 60);
    tree.update(6, 70);
    
    expect(tree.query(6)).toBe(150 + 60 + 70);
    expect(tree.total()).toBe(150 + 60 + 70);
  });
});
