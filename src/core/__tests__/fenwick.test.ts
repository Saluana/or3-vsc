import { describe, it, expect } from 'vitest';
import { FenwickTree } from '../fenwick';

describe('FenwickTree', () => {
  it('should initialize with zeros', () => {
    const ft = new FenwickTree(5);
    expect(ft.total()).toBe(0);
    expect(ft.query(4)).toBe(0);
  });

  it('should build from array', () => {
    const ft = new FenwickTree(5);
    ft.build(new Float64Array([1, 2, 3, 4, 5]));
    expect(ft.query(0)).toBe(1);
    expect(ft.query(1)).toBe(3); // 1+2
    expect(ft.query(4)).toBe(15); // 1+2+3+4+5
    expect(ft.total()).toBe(15);
  });

  it('should update values', () => {
    const ft = new FenwickTree(5);
    ft.build(new Float64Array([1, 1, 1, 1, 1]));
    ft.update(2, 5); // Add 5 to index 2 (was 1, now 6)
    
    expect(ft.query(1)).toBe(2); // 1+1
    expect(ft.query(2)).toBe(8); // 1+1+6
    expect(ft.total()).toBe(10);
  });

  it('should find lower bound', () => {
    const ft = new FenwickTree(5);
    // [10, 20, 30, 40, 50]
    // Prefix: [10, 30, 60, 100, 150]
    ft.build(new Float64Array([10, 20, 30, 40, 50]));

    expect(ft.lowerBound(5)).toBe(0); // prefix(0)=10 >= 5
    expect(ft.lowerBound(10)).toBe(0); // prefix(0)=10 >= 10
    expect(ft.lowerBound(11)).toBe(1); // prefix(1)=30 >= 11
    expect(ft.lowerBound(30)).toBe(1);
    expect(ft.lowerBound(31)).toBe(2);
    expect(ft.lowerBound(150)).toBe(4);
    expect(ft.lowerBound(151)).toBe(5); // Out of bounds
  });

  it('should resize correctly', () => {
    const ft = new FenwickTree(2);
    ft.build(new Float64Array([10, 20]));
    expect(ft.total()).toBe(30);

    ft.resize(4, new Float64Array([10, 20, 30, 40]));
    expect(ft.total()).toBe(100);
    expect(ft.query(2)).toBe(60);
  });
});
