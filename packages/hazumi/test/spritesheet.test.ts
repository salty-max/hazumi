import { describe, expect, test } from "bun:test";
import { InvalidClipError } from "../src/animation";
import {
  isSpriteFrame,
  sliceFrame,
  spritesheet,
  UnknownClipError,
  UnknownFrameError,
} from "../src/spritesheet";

/** Stand-in for an ImageBitmap; only the dimensions matter here. */
const image = (width: number, height: number): never => ({ width, height }) as never;

describe("grid slicing", () => {
  test("slices an even grid", () => {
    const sheet = spritesheet(image(64, 32), { frame: [16, 16] });
    expect(sheet.columns).toBe(4);
    expect(sheet.rows).toBe(2);
    expect(sheet.length).toBe(8);
  });

  test("frames land at the right pixels", () => {
    const sheet = spritesheet(image(64, 32), { frame: [16, 16] });
    expect(sheet.at(0, 0)).toMatchObject({ x: 0, y: 0, width: 16, height: 16 });
    expect(sheet.at(3, 1)).toMatchObject({ x: 48, y: 16, width: 16, height: 16 });
  });

  test("accounts for spacing between cells", () => {
    // 3 cells of 16 with 2px gaps: 16 + 2 + 16 + 2 + 16 = 52.
    const sheet = spritesheet(image(52, 16), { frame: [16, 16], spacing: 2 });
    expect(sheet.columns).toBe(3);
    expect(sheet.at(2, 0).x).toBe(36);
  });

  test("accounts for a margin around the grid", () => {
    const sheet = spritesheet(image(36, 36), { frame: [16, 16], margin: 2 });
    expect(sheet.columns).toBe(2);
    expect(sheet.at(0, 0).x).toBe(2);
    expect(sheet.at(1, 1)).toMatchObject({ x: 18, y: 18 });
  });

  test("ignores a partial trailing cell", () => {
    // 70px holds four whole 16px cells, not four and a bit.
    expect(spritesheet(image(70, 16), { frame: [16, 16] }).columns).toBe(4);
  });

  test("an image smaller than one cell yields no frames", () => {
    const sheet = spritesheet(image(8, 8), { frame: [16, 16] });
    expect(sheet.length).toBe(0);
  });

  test("rejects a non-positive frame size", () => {
    expect(() => spritesheet(image(64, 64), { frame: [0, 16] })).toThrow(/positive/);
  });
});

describe("indexing", () => {
  const sheet = spritesheet(image(64, 32), { frame: [16, 16] });

  test("linear index runs left to right, top to bottom", () => {
    expect(sheet.frame(0)).toBe(sheet.at(0, 0));
    expect(sheet.frame(4)).toBe(sheet.at(0, 1));
    expect(sheet.frame(7)).toBe(sheet.at(3, 1));
  });

  test("indices wrap, which is what animation wants", () => {
    // frame(t) with a rising t should loop rather than throw.
    expect(sheet.frame(8)).toBe(sheet.frame(0));
    expect(sheet.frame(-1)).toBe(sheet.frame(7));
    expect(sheet.at(4, 0)).toBe(sheet.at(0, 0));
  });

  test("an empty sheet falls back to the whole image", () => {
    const empty = spritesheet(image(8, 8), { frame: [16, 16] });
    expect(empty.frame(0)).toMatchObject({ x: 0, y: 0, width: 8, height: 8 });
  });
});

describe("frames are precomputed", () => {
  test("the same frame is the same object every time", () => {
    // A draw loop asks for a frame every frame; returning a new object each
    // time would be per-frame allocation, which AGENTS.md rules out.
    const sheet = spritesheet(image(64, 32), { frame: [16, 16] });
    expect(sheet.at(2, 1)).toBe(sheet.at(2, 1));
    expect(sheet.frame(3)).toBe(sheet.frame(3));
  });

  test("frames() lists them in order", () => {
    const sheet = spritesheet(image(32, 32), { frame: [16, 16] });
    expect(sheet.frames()).toHaveLength(4);
    expect(sheet.frames()[0]).toBe(sheet.at(0, 0));
  });
});

describe("named frames", () => {
  const sheet = spritesheet(image(64, 64), {
    frames: {
      idle: [0, 0, 16, 24],
      run: [16, 0, 16, 24],
    },
  });

  test("looks up by name", () => {
    expect(sheet.named("idle")).toMatchObject({ x: 0, y: 0, width: 16, height: 24 });
    expect(sheet.named("run").x).toBe(16);
  });

  test("an unknown name throws and lists what exists", () => {
    expect(() => sheet.named("jump")).toThrow(UnknownFrameError);
    try {
      sheet.named("jump");
    } catch (error) {
      expect((error as Error).message).toContain("idle");
      expect((error as UnknownFrameError).frameName).toBe("jump");
    }
  });

  test("named frames are also reachable by index", () => {
    expect(sheet.length).toBe(2);
    expect(sheet.frame(1)).toBe(sheet.named("run"));
  });
});

describe("isSpriteFrame", () => {
  test("distinguishes a frame from a raw image", () => {
    const sheet = spritesheet(image(32, 32), { frame: [16, 16] });
    expect(isSpriteFrame(sheet.at(0, 0))).toBe(true);
    expect(isSpriteFrame(image(32, 32))).toBe(false);
  });
});

describe("sliceFrame", () => {
  const sheet = spritesheet(image(64, 32), { frame: [16, 16] });
  const cell = sheet.at(1, 1);

  test("three arguments crop a strip from the left of the frame", () => {
    expect(sliceFrame(cell, 3, 1)).toMatchObject({
      source: cell.source,
      x: cell.x + 3,
      y: cell.y,
      width: 1,
      height: cell.height,
    });
  });

  test("five arguments crop a sub-rectangle relative to the frame", () => {
    expect(sliceFrame(cell, 2, 4, 6, 8)).toMatchObject({
      x: cell.x + 2,
      y: cell.y + 4,
      width: 6,
      height: 8,
    });
  });

  test("allocates a new frame rather than mutating the original", () => {
    const original = { x: cell.x, y: cell.y, width: cell.width, height: cell.height };
    const sliced = sliceFrame(cell, 1, 1);
    expect(sliced).not.toBe(cell);
    expect(cell).toMatchObject(original);
  });
});

describe("animation clips", () => {
  const sheet = spritesheet(image(64, 64), {
    frame: [16, 16],
    clips: {
      idle: { frames: [0, 1], fps: 4 },
      run: { frames: [4, 5, 6, 7], fps: 12 },
    },
  });

  test("a sheet carries its animations", () => {
    expect(sheet.clipNames().toSorted()).toEqual(["idle", "run"]);
    expect(sheet.clip("run").fps).toBe(12);
    expect(sheet.clip("run").frames).toHaveLength(4);
  });

  test("clip frames resolve to the sheet’s own frames", () => {
    expect(sheet.clip("run").frames[0]).toBe(sheet.frame(4));
    expect(sheet.clip("idle").at(0)).toBe(sheet.at(0, 0));
  });

  test("an unknown clip throws and lists what exists", () => {
    expect(() => sheet.clip("fly")).toThrow(UnknownClipError);
    try {
      sheet.clip("fly");
    } catch (error) {
      expect((error as Error).message).toContain("run");
      expect((error as UnknownClipError).clipName).toBe("fly");
    }
  });

  test("a sheet without clips has none, and says so", () => {
    const plain = spritesheet(image(32, 32), { frame: [16, 16] });
    expect(plain.clipNames()).toEqual([]);
    expect(() => plain.clip("run")).toThrow(/\(none\)/);
  });

  test("clips work on a named sheet too", () => {
    const named = spritesheet(image(64, 64), {
      frames: { a: [0, 0, 16, 16], b: [16, 0, 16, 16] },
      clips: { blink: { frames: ["a", "b"], fps: 2 } },
    });
    expect(named.clip("blink").frames[0]).toBe(named.named("a"));
  });

  test("a clip naming a missing frame fails at construction, not at draw time", () => {
    expect(() =>
      spritesheet(image(64, 64), {
        frames: { a: [0, 0, 16, 16] },
        clips: { bad: { frames: ["a", "nope"] } },
      }),
    ).toThrow(UnknownFrameError);
  });
});

describe("clips from a run of frames", () => {
  // 4 columns, 3 rows, so the column count is not something a caller reading
  // "row 1" would have written out by hand.
  const sheet = spritesheet(image(64, 48), {
    frame: [16, 16],
    clips: {
      idle: { row: 0, fps: 4 },
      run: { row: 1, fps: 12 },
      attack: { row: 2, from: 1, to: 2 },
      whole: { from: 2, to: 5 },
    },
  });

  test("a row becomes that row, left to right", () => {
    const run = sheet.clip("run");
    expect(run.frames).toHaveLength(4);
    expect(run.frames[0]).toBe(sheet.at(0, 1));
    expect(run.frames[3]).toBe(sheet.at(3, 1));
  });

  test("from and to cut a slice of the row, inclusive", () => {
    const attack = sheet.clip("attack");
    expect(attack.frames).toHaveLength(2);
    expect(attack.frames[0]).toBe(sheet.at(1, 2));
    expect(attack.frames[1]).toBe(sheet.at(2, 2));
  });

  test("a run without a row counts across the whole sheet", () => {
    const whole = sheet.clip("whole");
    expect(whole.frames).toHaveLength(4);
    expect(whole.frames[0]).toBe(sheet.frame(2));
    expect(whole.frames[3]).toBe(sheet.frame(5));
  });

  test("the run is resolved from the sheet's own column count", () => {
    // The same declaration on a wider sheet has to give a longer clip, or it
    // is really just indices in disguise.
    const wide = spritesheet(image(128, 48), { frame: [16, 16], clips: { run: { row: 1 } } });
    expect(wide.clip("run").frames).toHaveLength(8);
    expect(wide.clip("run").frames[0]).toBe(wide.at(0, 1));
  });

  test("options and defaults still apply", () => {
    expect(sheet.clip("idle").fps).toBe(4);
    expect(sheet.clip("whole").fps).toBe(12);
  });

  test("listing frames and asking for a run at once is refused", () => {
    expect(() =>
      spritesheet(image(64, 48), { frame: [16, 16], clips: { run: { frames: [0], row: 1 } } }),
    ).toThrow(InvalidClipError);
  });

  test("a clip declaring neither is refused", () => {
    expect(() => spritesheet(image(64, 48), { frame: [16, 16], clips: { run: {} } })).toThrow(
      /no frames/,
    );
  });

  test("a row past the end of the sheet says how many there are", () => {
    try {
      spritesheet(image(64, 48), { frame: [16, 16], clips: { run: { row: 7 } } });
      throw new Error("expected the row to be refused");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidClipError);
      expect((error as Error).message).toContain("3 rows");
      expect((error as InvalidClipError).clipName).toBe("run");
    }
  });

  test("a run past the end of its row is refused", () => {
    // 4 columns, so column 4 is off the row even though frame 4 exists.
    expect(() =>
      spritesheet(image(64, 48), { frame: [16, 16], clips: { run: { row: 0, to: 4 } } }),
    ).toThrow(/outside the 4 frames/);
  });

  test("a backwards run is refused rather than yielding nothing", () => {
    expect(() =>
      spritesheet(image(64, 48), { frame: [16, 16], clips: { run: { from: 5, to: 2 } } }),
    ).toThrow(InvalidClipError);
  });

  test("a row on a sheet of named rectangles is refused", () => {
    expect(() =>
      spritesheet(image(64, 64), {
        frames: { a: [0, 0, 16, 16] },
        clips: { run: { row: 0 } },
      }),
    ).toThrow(/named rectangles/);
  });
});
