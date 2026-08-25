import { getActiveContext } from "./active-context";
import { sliceFrame, type SpriteFrame } from "./spritesheet";

/**
 * Border widths, CSS-style.
 *
 * One number for all four sides, two for `[vertical, horizontal]`, or four for
 * `[top, right, bottom, left]` — the order everyone already knows, so nobody
 * has to look it up.
 */
export type Border =
  | number
  | readonly [vertical: number, horizontal: number]
  | readonly [top: number, right: number, bottom: number, left: number];

/** How a nine-patch is cut and drawn. */
export interface NinePatchOptions {
  /**
   * How much to enlarge the border art. Defaults to 1, the size it was drawn.
   *
   * Keep it whole for pixel art. Scaling a 5px corner into 12px is a factor of
   * 2.4, which makes one authored pixel two wide here and three there — an
   * unevenness the eye finds immediately along a straight edge.
   */
  readonly scale?: number;
}

/** Thrown when a border cannot fit inside the frame it is cut from. */
export class InvalidBorderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBorderError";
  }
}

/**
 * A frame cut into nine pieces, so it can be drawn at any size.
 *
 * Corners keep their size, edges stretch along one axis, the middle stretches
 * along both. Cut once when the patch is built rather than per draw.
 */
export interface NinePatch {
  /** The frame the patch was cut from. */
  readonly frame: SpriteFrame;
  /** Border widths in source pixels, as `[top, right, bottom, left]`. */
  readonly border: readonly [number, number, number, number];
  /** Smallest box that draws without the corners having to overlap. */
  readonly minWidth: number;
  /** Smallest height that draws without the corners having to overlap. */
  readonly minHeight: number;
  /** Draw the patch to fill a box. */
  draw: (x: number, y: number, width: number, height: number) => void;
}

function sides(border: Border): readonly [number, number, number, number] {
  if (typeof border === "number") return [border, border, border, border];
  if (border.length === 2) return [border[0], border[1], border[0], border[1]];
  return border;
}

/**
 * A stretchable box cut from one frame.
 *
 * The corners keep the size they were drawn and only the spans between them
 * grow, which is the whole point: scaling the tile as a single image smears its
 * border into the fill. Every scene that draws a panel has to write this, and
 * every one of them gets the same two things wrong — the corner scaled by a
 * fraction, and the middle slices measured off the wrong edge.
 *
 * The nine sub-frames are cut once here, so drawing one is nine `image` calls
 * against one texture and no allocation.
 *
 * ```ts
 * const box = ninePatch(ui.named("panel"), 5, { scale: 3 });
 * box.draw(40, 40, 260, 120);
 * ```
 */
export function ninePatch(
  frame: SpriteFrame,
  border: Border,
  options: NinePatchOptions = {},
): NinePatch {
  const [top, right, bottom, left] = sides(border);
  for (const value of [top, right, bottom, left]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new InvalidBorderError("nine-patch borders must be whole pixels from zero");
    }
  }
  if (left + right > frame.width || top + bottom > frame.height) {
    throw new InvalidBorderError(
      `a [${top}, ${right}, ${bottom}, ${left}] border does not fit inside a ` +
        `${frame.width}x${frame.height} frame`,
    );
  }
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new InvalidBorderError("nine-patch scale must be greater than zero");
  }

  const midW = frame.width - left - right;
  const midH = frame.height - top - bottom;
  const farX = frame.width - right;
  const farY = frame.height - bottom;

  // Cut once. A patch redrawn every frame should cost nine draw calls and
  // nothing else.
  const pieces = {
    topLeft: sliceFrame(frame, 0, 0, left, top),
    top: sliceFrame(frame, left, 0, midW, top),
    topRight: sliceFrame(frame, farX, 0, right, top),
    left: sliceFrame(frame, 0, top, left, midH),
    middle: sliceFrame(frame, left, top, midW, midH),
    right: sliceFrame(frame, farX, top, right, midH),
    bottomLeft: sliceFrame(frame, 0, farY, left, bottom),
    bottom: sliceFrame(frame, left, farY, midW, bottom),
    bottomRight: sliceFrame(frame, farX, farY, right, bottom),
  };

  const drawnTop = top * scale;
  const drawnRight = right * scale;
  const drawnBottom = bottom * scale;
  const drawnLeft = left * scale;

  return {
    frame,
    border: [top, right, bottom, left],
    minWidth: drawnLeft + drawnRight,
    minHeight: drawnTop + drawnBottom,
    draw: (x: number, y: number, width: number, height: number): void => {
      const context = getActiveContext();
      // A box narrower than its own border still has to draw something rather
      // than fold the corners through each other, so the border gives way
      // first and the middle disappears.
      const shrinkX = Math.min(1, width / Math.max(1, drawnLeft + drawnRight));
      const shrinkY = Math.min(1, height / Math.max(1, drawnTop + drawnBottom));
      const l = drawnLeft * shrinkX;
      const r = drawnRight * shrinkX;
      const t = drawnTop * shrinkY;
      const b = drawnBottom * shrinkY;
      const innerW = Math.max(0, width - l - r);
      const innerH = Math.max(0, height - t - b);
      const rightX = x + width - r;
      const bottomY = y + height - b;

      const put = (piece: SpriteFrame, px: number, py: number, pw: number, ph: number): void => {
        if (pw <= 0 || ph <= 0 || piece.width <= 0 || piece.height <= 0) return;
        context.image(piece, px, py, pw, ph);
      };

      put(pieces.topLeft, x, y, l, t);
      put(pieces.top, x + l, y, innerW, t);
      put(pieces.topRight, rightX, y, r, t);
      put(pieces.left, x, y + t, l, innerH);
      put(pieces.middle, x + l, y + t, innerW, innerH);
      put(pieces.right, rightX, y + t, r, innerH);
      put(pieces.bottomLeft, x, bottomY, l, b);
      put(pieces.bottom, x + l, bottomY, innerW, b);
      put(pieces.bottomRight, rightX, bottomY, r, b);
    },
  };
}
