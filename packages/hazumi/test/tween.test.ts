import { describe, expect, test } from "bun:test";
import { easing } from "@hazumi/math";
import { ClipEnd } from "../src/animation";
import { InvalidTweenError, sequence, tween } from "../src/tween";

describe("tween", () => {
  test("interpolates linearly between the endpoints", () => {
    const t = tween({ from: 0, to: 100, duration: 2 });
    expect(t.at(0)).toBe(0);
    expect(t.at(1)).toBe(50);
    expect(t.at(2)).toBe(100);
  });

  test("is a pure function of time, so it can be read out of order", () => {
    // The property that makes a manager unnecessary: sampling backwards gives
    // the same answer as sampling forwards.
    const t = tween({ from: 0, to: 10, duration: 1 });
    const forwards = [0, 0.25, 0.5, 0.75, 1].map((s) => t.at(s));
    const backwards = [1, 0.75, 0.5, 0.25, 0].map((s) => t.at(s)).toReversed();
    expect(backwards).toEqual(forwards);
  });

  test("holds at the end by default, and reports finished", () => {
    const t = tween({ from: 0, to: 5, duration: 1 });
    expect(t.at(9)).toBe(5);
    expect(t.finished(0.5)).toBe(false);
    expect(t.finished(1)).toBe(true);
  });

  test("holds at the start through a delay", () => {
    const t = tween({ from: 2, to: 4, duration: 1, delay: 0.5 });
    expect(t.at(0)).toBe(2);
    expect(t.at(0.5)).toBe(2);
    expect(t.at(1)).toBe(3);
    expect(t.at(1.5)).toBe(4);
  });

  test("looping restarts and never finishes", () => {
    const t = tween({ from: 0, to: 10, duration: 1, end: ClipEnd.Loop });
    expect(t.at(1.5)).toBeCloseTo(5, 10);
    expect(t.at(3.25)).toBeCloseTo(2.5, 10);
    expect(t.finished(100)).toBe(false);
  });

  test("ping-pong runs back rather than snapping to the start", () => {
    const t = tween({ from: 0, to: 10, duration: 1, end: ClipEnd.PingPong });
    expect(t.at(0.5)).toBeCloseTo(5, 10);
    expect(t.at(1)).toBeCloseTo(10, 10);
    expect(t.at(1.5)).toBeCloseTo(5, 10);
    expect(t.at(2)).toBeCloseTo(0, 10);
  });

  test("an easing shapes the pass without moving the endpoints", () => {
    const t = tween({ from: 0, to: 1, duration: 1, ease: easing.quadIn });
    expect(t.at(0)).toBe(0);
    expect(t.at(1)).toBe(1);
    // quadIn starts slow, so the midpoint sits below linear.
    expect(t.at(0.5)).toBeLessThan(0.5);
  });

  test("counts down as happily as up", () => {
    const t = tween({ from: 10, to: 0, duration: 1 });
    expect(t.at(0.25)).toBeCloseTo(7.5, 10);
  });

  test("rejects a duration that cannot advance", () => {
    expect(() => tween({ from: 0, to: 1, duration: 0 })).toThrow(InvalidTweenError);
    expect(() => tween({ from: 0, to: 1, duration: Number.NaN })).toThrow(InvalidTweenError);
  });

  test("rejects a negative delay", () => {
    expect(() => tween({ from: 0, to: 1, duration: 1, delay: -1 })).toThrow(InvalidTweenError);
  });
});

describe("sequence", () => {
  test("runs steps one after another", () => {
    const s = sequence([
      { from: 0, to: 10, duration: 1 },
      { from: 10, to: 0, duration: 1 },
    ]);
    expect(s.duration).toBe(2);
    expect(s.at(0.5)).toBeCloseTo(5, 10);
    expect(s.at(1)).toBeCloseTo(10, 10);
    expect(s.at(1.5)).toBeCloseTo(5, 10);
    expect(s.at(2)).toBeCloseTo(0, 10);
  });

  test("counts a step's delay towards the total", () => {
    const s = sequence([
      { from: 0, to: 1, duration: 1 },
      { from: 1, to: 2, duration: 1, delay: 0.5 },
    ]);
    expect(s.duration).toBe(2.5);
    // The delay holds the second step at its start rather than advancing it.
    expect(s.at(1.25)).toBe(1);
  });

  test("holds on the last value past the end", () => {
    const s = sequence([{ from: 0, to: 3, duration: 1 }]);
    expect(s.at(99)).toBe(3);
    expect(s.finished(1)).toBe(true);
  });

  test("loops over the whole sequence", () => {
    const s = sequence(
      [
        { from: 0, to: 10, duration: 1 },
        { from: 10, to: 20, duration: 1 },
      ],
      { end: ClipEnd.Loop },
    );
    expect(s.at(2.5)).toBeCloseTo(5, 10);
    expect(s.finished(99)).toBe(false);
  });

  test("is itself a tween, so a sequence composes", () => {
    const inner = sequence([{ from: 0, to: 1, duration: 1 }]);
    expect(typeof inner.at).toBe("function");
    expect(inner.duration).toBe(1);
  });

  test("rejects an empty sequence", () => {
    expect(() => sequence([])).toThrow(InvalidTweenError);
  });
});
