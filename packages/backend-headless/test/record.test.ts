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

/**
 * decode() skips visitor methods a backend does not implement, so an opcode
 * added without updating this recorder disappears from every test that relies
 * on it — silently, and with everything still green. This guard is what turns
 * that into a failure.
 */
describe('recorder coverage', () => {
  test('records every command an encoder can emit', () => {
    const buf = new CommandBuffer();
    const emitters: ReadonlyArray<[string, () => void]> = [
      ['setFill', () => buf.setFill(1, 1, 1, 1)],
      ['setStroke', () => buf.setStroke(1, 1, 1, 1)],
      ['setStrokeWidth', () => buf.setStrokeWidth(1)],
      ['setBlend', () => buf.setBlend(1)],
      ['push', () => buf.push()],
      ['pop', () => buf.pop()],
      ['translate', () => buf.translate(1, 2)],
      ['rotate', () => buf.rotate(1)],
      ['scale', () => buf.scale(1, 2)],
      ['background', () => buf.background(1, 1, 1, 1)],
      ['circle', () => buf.circle(1, 2, 3)],
      ['ellipse', () => buf.ellipse(1, 2, 3, 4)],
      ['rect', () => buf.rect(1, 2, 3, 4)],
      ['line', () => buf.line(1, 2, 3, 4)],
      ['text', () => buf.text(1, 2, 'hi')],
      ['setTextSize', () => buf.setTextSize(24)],
      ['setTextAlign', () => buf.setTextAlign(1, 2)],
      ['setFont', () => buf.setFont('serif')],
      ['image', () => buf.image({ width: 1, height: 1 } as never, 1, 2, 3, 4)],
      ['imageRegion', () =>
        buf.imageRegion({ width: 1, height: 1 } as never, 1, 2, 3, 4, 5, 6, 7, 8)],
      ['beginPath', () => buf.beginPath()],
      ['moveTo', () => buf.moveTo(1, 2)],
      ['lineTo', () => buf.lineTo(1, 2)],
      ['quadraticTo', () => buf.quadraticTo(1, 2, 3, 4)],
      ['cubicTo', () => buf.cubicTo(1, 2, 3, 4, 5, 6)],
      ['closePath', () => buf.closePath()],
      ['fillPath', () => buf.fillPath()],
      ['strokePath', () => buf.strokePath()],
    ];

    for (const [name, emit] of emitters) {
      buf.reset();
      emit();
      expect(record(buf).map((c) => c.op)).toEqual([name]);
    }
  });
});
