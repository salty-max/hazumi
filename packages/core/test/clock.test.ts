import { describe, expect, test } from 'bun:test';
import { SketchClock } from '../src/index';

describe('SketchClock', () => {
  test('the first frame reports dt 0 rather than a huge startup gap', () => {
    const clock = new SketchClock();
    expect(clock.advance(100)).toBe(0);
    expect(clock.frame).toBe(1);
    expect(clock.elapsed).toBe(0);
  });

  test('accumulates elapsed time across frames', () => {
    const clock = new SketchClock();
    clock.advance(0);
    clock.advance(0.016);
    clock.advance(0.032);
    expect(clock.dt).toBeCloseTo(0.016);
    expect(clock.elapsed).toBeCloseTo(0.032);
    expect(clock.frame).toBe(3);
  });

  test('clamps a long stall to maxDelta', () => {
    const clock = new SketchClock({ maxDelta: 0.1 });
    clock.advance(0);
    // A backgrounded tab returning after 5 seconds.
    expect(clock.advance(5)).toBe(0.1);
    expect(clock.elapsed).toBeCloseTo(0.1);
  });

  test('never reports a negative delta', () => {
    const clock = new SketchClock();
    clock.advance(10);
    expect(clock.advance(5)).toBe(0);
  });

  test('reset returns it to its initial state', () => {
    const clock = new SketchClock();
    clock.advance(0);
    clock.advance(1);
    clock.reset();
    expect(clock.frame).toBe(0);
    expect(clock.elapsed).toBe(0);
    expect(clock.advance(100)).toBe(0);
  });

  test('rejects invalid timing options at construction', () => {
    expect(() => new SketchClock({ maxDelta: Number.NaN })).toThrow(RangeError);
    expect(() => new SketchClock({ fixedStep: 0 })).toThrow(RangeError);
    expect(() => new SketchClock({ maxFixedSteps: 1.5 })).toThrow(RangeError);
  });
});

function runFixedSequence(): number[] {
  const clock = new SketchClock({ fixedStep: 1 / 60 });
  const out: number[] = [];
  for (let f = 0; f < 100; f++) {
    clock.advance(f / 60);
    clock.stepFixed((dt) => out.push(dt));
  }
  return out;
}

describe('fixed timestep', () => {
  test('takes one step per elapsed interval', () => {
    // maxDelta is raised so this exercises the accumulator, not the stall
    // clamp — 0.35s would otherwise be clamped to the 0.25s default.
    const clock = new SketchClock({ fixedStep: 0.1, maxDelta: 1 });
    clock.advance(0);
    clock.advance(0.35);

    const steps: number[] = [];
    const taken = clock.stepFixed((dt) => steps.push(dt));

    expect(taken).toBe(3);
    expect(steps).toEqual([0.1, 0.1, 0.1]);
    expect(clock.pending).toBeCloseTo(0.05);
  });

  test('carries the remainder into the next frame', () => {
    const clock = new SketchClock({ fixedStep: 0.1 });
    clock.advance(0);

    clock.advance(0.06);
    expect(clock.stepFixed(() => {})).toBe(0);

    clock.advance(0.12);
    // 0.06 + 0.06 crosses one interval.
    expect(clock.stepFixed(() => {})).toBe(1);
  });

  test('caps steps per frame and drops the debt', () => {
    // Without the cap, a long stall makes every later frame run extra steps
    // and the simulation never catches up.
    const clock = new SketchClock({ fixedStep: 0.01, maxDelta: 1, maxFixedSteps: 3 });
    clock.advance(0);
    clock.advance(1);

    expect(clock.stepFixed(() => {})).toBe(3);
    expect(clock.pending).toBe(0);
    // The next frame starts clean rather than replaying the backlog.
    clock.advance(1.005);
    expect(clock.stepFixed(() => {})).toBe(0);
  });

  test('the stall clamp limits how much the accumulator can receive', () => {
    // A frame longer than maxDelta contributes only maxDelta of simulated time.
    const clock = new SketchClock({ fixedStep: 0.1, maxDelta: 0.25 });
    clock.advance(0);
    clock.advance(0.35);
    expect(clock.stepFixed(() => {})).toBe(2);
  });

  test('alpha reports progress between steps', () => {
    const clock = new SketchClock({ fixedStep: 0.1 });
    clock.advance(0);
    clock.advance(0.05);
    expect(clock.alpha()).toBeCloseTo(0.5);
  });

  test('is deterministic when driven with fixed timestamps', () => {
    // This is what makes frame-by-frame offline rendering reproducible.
    expect(runFixedSequence()).toEqual(runFixedSequence());
  });
});
