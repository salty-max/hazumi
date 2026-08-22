import { describe, expect, test } from "bun:test";
import { ClipEnd } from "../src/animation";
import { AsepriteImportError, fromAseprite } from "../src/import/aseprite";
import type { AsepriteSheet } from "../src/import/aseprite";

const rect = (x: number) => ({ x, y: 0, w: 16, h: 16 });

/** The hash export, which is Aseprite's default. */
function hashSheet(durations: readonly number[]): AsepriteSheet {
  const frames: Record<string, { frame: ReturnType<typeof rect>; duration: number }> = {};
  for (const [index, duration] of durations.entries()) {
    frames[`hero ${index}.aseprite`] = { frame: rect(index * 16), duration };
  }
  return { frames };
}

describe("fromAseprite", () => {
  test("reads the array export, naming frames by filename", () => {
    const options = fromAseprite({
      frames: [
        { filename: "idle.png", frame: rect(0), duration: 100 },
        { filename: "run.png", frame: rect(16), duration: 100 },
      ],
    });
    expect(options.frames).toEqual({
      "idle.png": [0, 0, 16, 16],
      "run.png": [16, 0, 16, 16],
    });
  });

  test("reads the hash export, keeping key order as frame order", () => {
    const options = fromAseprite(hashSheet([100, 100, 100]));
    expect(Object.keys(options.frames)).toEqual([
      "hero 0.aseprite",
      "hero 1.aseprite",
      "hero 2.aseprite",
    ]);
  });

  test("turns a tag into a clip over its inclusive range", () => {
    const sheet: AsepriteSheet = {
      ...hashSheet([100, 100, 100, 100]),
      meta: { frameTags: [{ name: "run", from: 1, to: 2 }] },
    };
    const clip = fromAseprite(sheet).clips?.run;
    expect(clip?.frames).toEqual(["hero 1.aseprite", "hero 2.aseprite"]);
    expect(clip?.fps).toBe(10);
    expect(clip?.end).toBe(ClipEnd.Loop);
  });

  test("expresses uneven durations as repeats at a common rate", () => {
    // 100ms then 200ms: one rate cannot say that, but repeating the slow frame
    // can — which is the mechanism ClipOptions already documents.
    const sheet: AsepriteSheet = {
      ...hashSheet([100, 200]),
      meta: { frameTags: [{ name: "beat", from: 0, to: 1 }] },
    };
    const clip = fromAseprite(sheet).clips?.beat;
    expect(clip?.fps).toBe(10);
    expect(clip?.frames).toEqual(["hero 0.aseprite", "hero 1.aseprite", "hero 1.aseprite"]);
  });

  test("falls back to one rate when durations would explode into repeats", () => {
    // 7ms and 1000ms share only 1ms, which would need over a thousand entries.
    const sheet: AsepriteSheet = {
      ...hashSheet([7, 1000]),
      meta: { frameTags: [{ name: "odd", from: 0, to: 1 }] },
    };
    const clip = fromAseprite(sheet).clips?.odd;
    expect(clip?.frames).toHaveLength(2);
    expect(clip?.fps).toBeCloseTo(1000 / 503.5, 5);
  });

  test("reverse plays the range backwards", () => {
    const sheet: AsepriteSheet = {
      ...hashSheet([100, 100, 100]),
      meta: { frameTags: [{ name: "back", from: 0, to: 2, direction: "reverse" }] },
    };
    expect(fromAseprite(sheet).clips?.back?.frames).toEqual([
      "hero 2.aseprite",
      "hero 1.aseprite",
      "hero 0.aseprite",
    ]);
  });

  test("pingpong maps to the ping-pong ending", () => {
    const sheet: AsepriteSheet = {
      ...hashSheet([100, 100]),
      meta: { frameTags: [{ name: "sway", from: 0, to: 1, direction: "pingpong" }] },
    };
    expect(fromAseprite(sheet).clips?.sway?.end).toBe(ClipEnd.PingPong);
  });

  test("a tag that repeats a fixed number of times holds instead of looping", () => {
    const sheet: AsepriteSheet = {
      ...hashSheet([100, 100]),
      meta: { frameTags: [{ name: "hit", from: 0, to: 1, repeat: "1" }] },
    };
    expect(fromAseprite(sheet).clips?.hit?.end).toBe(ClipEnd.Hold);
  });

  test("frames without durations still make a clip, at the default rate", () => {
    const options = fromAseprite({
      frames: [{ filename: "a", frame: rect(0) }],
      meta: { frameTags: [{ name: "still", from: 0, to: 0 }] },
    });
    expect(options.clips?.still?.fps).toBe(12);
  });

  test("names the tag whose range runs off the end of the sheet", () => {
    const sheet: AsepriteSheet = {
      ...hashSheet([100, 100]),
      meta: { frameTags: [{ name: "walk", from: 0, to: 9 }] },
    };
    expect(() => fromAseprite(sheet)).toThrow(AsepriteImportError);
    expect(() => fromAseprite(sheet)).toThrow(/"walk".*0\.\.9.*has 2/s);
  });

  test("rejects JSON that is not an Aseprite sheet", () => {
    expect(() => fromAseprite({} as unknown as AsepriteSheet)).toThrow(AsepriteImportError);
  });

  test("rejects a sheet with no frames at all", () => {
    expect(() => fromAseprite({ frames: [] })).toThrow(/no frames/);
  });
});
