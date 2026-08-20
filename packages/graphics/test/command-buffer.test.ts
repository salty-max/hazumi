import { describe, expect, test } from 'bun:test';
import { CommandBuffer, Op } from '../src/index';

describe('CommandBuffer', () => {
  test('encodes a circle as opcode plus three floats', () => {
    const buf = new CommandBuffer();
    buf.circle(10, 20, 5);

    expect(buf.length).toBe(4);
    expect(buf.u32[0]).toBe(Op.Circle);
    expect(buf.f32[1]).toBe(10);
    expect(buf.f32[2]).toBe(20);
    expect(buf.f32[3]).toBe(5);
  });

  test('u32 and f32 views address the same memory', () => {
    const buf = new CommandBuffer();
    buf.setFill(0.25, 0.5, 0.75, 1);

    // Opcode read as an integer, operands read as floats, same backing store.
    expect(buf.u32[0]).toBe(Op.SetFill);
    expect(buf.f32[1]).toBeCloseTo(0.25);
    expect(buf.f32[4]).toBeCloseTo(1);
  });

  test('reset rewinds without shrinking capacity', () => {
    const buf = new CommandBuffer();
    for (let i = 0; i < 500; i++) buf.circle(i, i, 1);

    const capacity = buf.capacity;
    buf.reset();

    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(capacity);
  });

  test('grows to fit, then stops growing once warm', () => {
    const buf = new CommandBuffer(8);

    for (let i = 0; i < 10_000; i++) buf.circle(i, i, 1);
    const afterWarmup = buf.growths;
    expect(afterWarmup).toBeGreaterThan(0);

    // Same workload again against the settled capacity: no further growth.
    for (let frame = 0; frame < 50; frame++) {
      buf.reset();
      for (let i = 0; i < 10_000; i++) buf.circle(i, i, 1);
    }

    expect(buf.growths).toBe(afterWarmup);
  });

  test('preserves earlier commands across a growth', () => {
    const buf = new CommandBuffer(8);
    buf.circle(1, 2, 3);
    for (let i = 0; i < 100; i++) buf.circle(i, i, i);

    expect(buf.growths).toBeGreaterThan(0);
    expect(buf.u32[0]).toBe(Op.Circle);
    expect(buf.f32[1]).toBe(1);
    expect(buf.f32[2]).toBe(2);
    expect(buf.f32[3]).toBe(3);
  });
});
