import { describe, expect, test } from 'bun:test';
import { CommandBuffer } from '@matter/graphics';
import { record, recordCircles } from '../src/index';

describe('record', () => {
  test('round-trips a buffer into a readable log', () => {
    const buf = new CommandBuffer();
    buf.setFill(1, 0, 0, 1);
    buf.circle(10, 20, 5);

    expect(record(buf)).toEqual([
      { op: 'setFill', args: [1, 0, 0, 1] },
      { op: 'circle', args: [10, 20, 5] },
    ]);
  });
});

describe('recordCircles', () => {
  test('resolves the fill in effect at emit time', () => {
    const buf = new CommandBuffer();
    buf.setFill(1, 0, 0, 1);
    buf.circle(0, 0, 1);
    buf.setFill(0, 1, 0, 0.5);
    buf.circle(5, 5, 2);

    const circles = recordCircles(buf);

    expect(circles).toHaveLength(2);
    expect(circles[0]?.fill).toEqual([1, 0, 0, 1]);
    expect(circles[1]?.fill).toEqual([0, 1, 0, 0.5]);
    expect(circles[1]?.x).toBe(5);
  });

  test('circles before any setFill get the default fill', () => {
    const buf = new CommandBuffer();
    buf.circle(1, 1, 1);

    expect(recordCircles(buf)[0]?.fill).toEqual([0, 0, 0, 1]);
  });

  test('a fill persists across many circles', () => {
    const buf = new CommandBuffer();
    buf.setFill(0.2, 0.4, 0.6, 1);
    for (let i = 0; i < 100; i++) buf.circle(i, i, 1);

    const circles = recordCircles(buf);
    expect(circles).toHaveLength(100);
    for (const c of circles) {
      expect(c.fill[0]).toBeCloseTo(0.2);
      expect(c.fill[2]).toBeCloseTo(0.6);
    }
  });
});
