/**
 * Aseprite's JSON sheet, as spritesheet options.
 *
 * Aseprite is how most 2D sprite work actually arrives, and its export already
 * carries everything a clip needs: frame rectangles, per-frame durations, and
 * named tags with a direction. Reading it by hand means retyping all of that
 * into a grid definition and keeping the two in step, which is exactly the sort
 * of duplication that goes stale the first time an animation gains a frame.
 *
 * This is a pure transform — no fetching, no image. Pair it with `loadJson`:
 *
 * ```ts
 * const sheet = spritesheet(
 *   await loadImage("hero.png"),
 *   fromAseprite(await loadJson<AsepriteSheet>("hero.json")),
 * );
 * sheet.clip("run");
 * ```
 */
import { ClipEnd } from "../animation";
import type { ClipOptions } from "../animation";
import type { NamedOptions } from "../spritesheet";

/** One frame's rectangle in the packed sheet. */
export interface AsepriteFrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One frame of an Aseprite export: where it is on the sheet, and how long it is held. */
export interface AsepriteFrame {
  /** Present in the array export; the hash export puts it in the key instead. */
  readonly filename?: string;
  readonly frame: AsepriteFrameRect;
  /** Milliseconds this frame is held. */
  readonly duration?: number;
}

/**
 * An Aseprite tag, which becomes a clip.
 *
 * `from` and `to` are inclusive frame indices, so a one-frame tag has them
 * equal rather than one apart.
 */
export interface AsepriteTag {
  readonly name: string;
  /** Inclusive frame indices. */
  readonly from: number;
  readonly to: number;
  readonly direction?: string;
  readonly repeat?: string;
}

/**
 * An Aseprite JSON export.
 *
 * Both export shapes are accepted: `frames` may be an array or an object keyed
 * by filename, and which one you get depends on a checkbox in the export
 * dialog rather than on anything the file says about itself.
 */
export interface AsepriteSheet {
  /** Array export, or hash export keyed by filename. */
  readonly frames: readonly AsepriteFrame[] | Readonly<Record<string, AsepriteFrame>>;
  readonly meta?: { readonly frameTags?: readonly AsepriteTag[] };
}

/** Thrown when a sheet cannot be read as Aseprite's export. */
export class AsepriteImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsepriteImportError";
  }
}

/**
 * Expanding per-frame durations is capped.
 *
 * A tag whose durations share no useful divisor — 33ms and 50ms, say — would
 * otherwise expand into thousands of repeats to express itself at 1000fps.
 * Past this the clip falls back to one rate for the whole tag.
 */
const MAX_EXPANDED_FRAMES = 600;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Frames in index order, with the name each one is registered under. */
function orderFrames(sheet: AsepriteSheet): { name: string; frame: AsepriteFrame }[] {
  const { frames } = sheet;
  if (Array.isArray(frames)) {
    return (frames as readonly AsepriteFrame[]).map((frame, index) => ({
      name: frame.filename ?? String(index),
      frame,
    }));
  }
  // The hash export is an object, and its insertion order is the frame order —
  // which is what tags index into, so it has to be preserved rather than sorted.
  return Object.entries(frames as Readonly<Record<string, AsepriteFrame>>).map(([name, frame]) => ({
    name,
    frame,
  }));
}

function endFor(tag: AsepriteTag): ClipEnd {
  if (tag.direction === "pingpong" || tag.direction === "pingpong_reverse") return ClipEnd.PingPong;
  // Aseprite writes `repeat` as a count for tags that play a fixed number of
  // times. Anything that does not loop forever holds on its last frame, which
  // is what a one-shot wants.
  if (tag.repeat !== undefined) return ClipEnd.Hold;
  return ClipEnd.Loop;
}

/**
 * Turn per-frame durations into a rate plus repeats.
 *
 * A clip has one fps, and `ClipOptions` documents repeating a frame as the way
 * to hold it longer — so durations become the common divisor as the rate and
 * each frame repeated by its multiple of it. Uniform durations, which is most
 * sheets, come out as one entry per frame at the obvious rate.
 */
function timing(
  names: readonly string[],
  durations: readonly number[],
): { frames: string[]; fps: number } {
  const usable = durations.filter((duration) => duration > 0);
  if (usable.length !== durations.length || usable.length === 0) {
    return { frames: [...names], fps: 12 };
  }

  const step = usable.reduce((a, b) => gcd(a, b));
  const total = usable.reduce((sum, duration) => sum + duration / step, 0);
  if (step <= 0 || total > MAX_EXPANDED_FRAMES) {
    const mean = usable.reduce((sum, duration) => sum + duration, 0) / usable.length;
    return { frames: [...names], fps: 1000 / mean };
  }

  const frames: string[] = [];
  for (const [index, duration] of durations.entries()) {
    const repeats = duration / step;
    for (let i = 0; i < repeats; i++) frames.push(names[index] as string);
  }
  return { frames, fps: 1000 / step };
}

/** Read an Aseprite JSON sheet as named frames and clips. */
export function fromAseprite(sheet: AsepriteSheet): NamedOptions {
  if (sheet.frames === undefined || sheet.frames === null) {
    throw new AsepriteImportError("This JSON has no `frames`, so it is not an Aseprite sheet.");
  }
  const ordered = orderFrames(sheet);
  if (ordered.length === 0) {
    throw new AsepriteImportError("This Aseprite sheet has no frames.");
  }

  const frames: Record<string, readonly [number, number, number, number]> = {};
  for (const { name, frame } of ordered) {
    const rect = frame.frame;
    if (rect === undefined) {
      throw new AsepriteImportError(`Frame ${JSON.stringify(name)} has no rectangle.`);
    }
    frames[name] = [rect.x, rect.y, rect.w, rect.h];
  }

  const clips: Record<string, ClipOptions> = {};
  for (const tag of sheet.meta?.frameTags ?? []) {
    if (tag.from < 0 || tag.to >= ordered.length || tag.from > tag.to) {
      throw new AsepriteImportError(
        `Tag ${JSON.stringify(tag.name)} covers frames ${tag.from}..${tag.to}, ` +
          `but the sheet has ${ordered.length}.`,
      );
    }
    const span = ordered.slice(tag.from, tag.to + 1);
    const names = span.map((entry) => entry.name);
    const durations = span.map((entry) => entry.frame.duration ?? 0);
    const reversed = tag.direction === "reverse" || tag.direction === "pingpong_reverse";
    const timed = timing(
      reversed ? names.toReversed() : names,
      reversed ? durations.toReversed() : durations,
    );
    clips[tag.name] = { frames: timed.frames, fps: timed.fps, end: endFor(tag) };
  }

  return { frames, clips };
}
