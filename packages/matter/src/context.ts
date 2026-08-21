import { Align, Baseline, Blend, CommandBuffer, type ImageSource } from '@matter/graphics';
import { createNoise, type Noise, type Rng, seeded } from '@matter/math';
import { type ColorCache, type ColorLike } from './color-cache';

/** Style overrides accepted by `with()`. */
export interface StyleOverrides {
  fill?: ColorLike | null;
  stroke?: ColorLike | null;
  strokeWeight?: number;
  blendMode?: Blend;
}

/**
 * Everything a sketch can reach.
 *
 * Handed to `draw` on every frame as one object so it can be destructured at
 * the top of the callback and still read current values — the same object is
 * mutated in place rather than rebuilt, so this costs nothing per frame.
 *
 * This is the replacement for p5's global mode. Destructuring recovers nearly
 * all of the terseness of bare `circle(50, 50, 20)` while staying fully typed
 * and never touching `window`.
 */
export interface SketchContext {
  // --- environment ---
  readonly width: number;
  readonly height: number;
  /** Frames drawn so far. */
  readonly frameCount: number;
  /** Seconds since the sketch started. */
  readonly t: number;
  /** Seconds since the previous frame. */
  readonly dt: number;
  readonly mouseX: number;
  readonly mouseY: number;
  /** Cursor position on the previous frame, for velocity and trails. */
  readonly pmouseX: number;
  readonly pmouseY: number;
  readonly mouseIsPressed: boolean;
  /** Which button is down: 0 left, 1 middle, 2 right. */
  readonly mouseButton: number;

  readonly keyIsPressed: boolean;
  /** The most recent key, as `KeyboardEvent.key`. */
  readonly key: string;
  /**
   * Whether a key is currently held.
   *
   * Takes a `KeyboardEvent.key` value — `'a'`, `'ArrowLeft'`, `' '` — rather
   * than a numeric code, so it reads the same as what the event reports.
   */
  keyIsDown: (key: string) => boolean;

  /** Seeded by default, so a sketch renders identically on every run. */
  readonly random: Rng;
  readonly noise: Noise;

  // --- style ---
  background: (color: ColorLike) => void;
  fill: (color: ColorLike) => void;
  noFill: () => void;
  stroke: (color: ColorLike) => void;
  noStroke: () => void;
  strokeWeight: (weight: number) => void;
  blendMode: (mode: Blend) => void;

  // --- images ---
  /**
   * Decode an image.
   *
   * Async, so setup must await it — there is no preload() phase here. p5 2.x
   * made the same move for the same reason: a separate preload step is a
   * second lifecycle to learn, and await already means what it needs to mean.
   */
  loadImage: (url: string) => Promise<ImageSource>;
  /** Draw an image. Defaults to its natural size when width and height are omitted. */
  image: (
    source: ImageSource,
    x: number,
    y: number,
    width?: number,
    height?: number,
  ) => void;

  // --- text ---
  /** Font family, as in CSS. Defaults to sans-serif. */
  textFont: (family: string) => void;
  textSize: (size: number) => void;
  textAlign: (horizontal: Align, vertical?: Baseline) => void;
  text: (content: string, x: number, y: number) => void;

  // --- drawing ---
  circle: (x: number, y: number, diameter: number) => void;
  ellipse: (x: number, y: number, width: number, height: number) => void;
  rect: (x: number, y: number, width: number, height: number) => void;
  square: (x: number, y: number, size: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  point: (x: number, y: number) => void;

  // --- transform ---
  push: () => void;
  pop: () => void;
  translate: (x: number, y: number) => void;
  rotate: (radians: number) => void;
  scale: (x: number, y?: number) => void;
  /**
   * Scoped style and transform.
   *
   * Restores on exit, including when the body throws — which is why this
   * exists alongside push/pop. A forgotten `pop()` leaks state into unrelated
   * drawing code and is the single most common beginner bug in p5.
   */
  with: (overrides: StyleOverrides, body: () => void) => void;

  // --- loop control ---
  noLoop: () => void;
  loop: () => void;
  isLooping: () => boolean;
}

/** Mutable fields the runtime updates between frames. */
export interface ContextState {
  width: number;
  height: number;
  frameCount: number;
  t: number;
  dt: number;
  mouseX: number;
  mouseY: number;
  pmouseX: number;
  pmouseY: number;
  mouseIsPressed: boolean;
  mouseButton: number;
  keyIsPressed: boolean;
  key: string;
  readonly keysDown: Set<string>;
  looping: boolean;
}

export interface ContextDeps {
  readonly buffer: CommandBuffer;
  readonly colors: ColorCache;
  readonly state: ContextState;
  readonly seed: number;
}

/**
 * Builds the context object once. Scalar fields are defined as getters over
 * mutable state, so destructuring in the draw callback reads live values while
 * the object itself is never reallocated.
 */
export interface ContextBundle {
  readonly context: SketchContext;
  /**
   * Re-emit the current style into a freshly reset buffer.
   *
   * The buffer is cleared every frame, so style set during setup would be lost
   * otherwise. Re-emitting the live values rather than a hardcoded default is
   * what makes `fill()` in setup behave the way anyone would expect.
   */
  readonly beginFrame: () => void;
}

export function createContext(deps: ContextDeps): ContextBundle {
  const { buffer, colors, state } = deps;
  const random = seeded(deps.seed);
  const noise = createNoise(seeded(deps.seed));

  // Mirrors what has been written to the buffer, so `with()` can restore it.
  let fillColor: ColorLike | null = '#ffffff';
  let strokeColor: ColorLike | null = null;
  let strokeWidth = 1;
  let blend: Blend = Blend.Normal;

  const applyFill = (): void => {
    const [r, g, b, a] = fillColor === null ? [0, 0, 0, 0] : colors.resolve(fillColor);
    buffer.setFill(r, g, b, a);
  };

  const applyStroke = (): void => {
    const [r, g, b, a] = strokeColor === null ? [0, 0, 0, 0] : colors.resolve(strokeColor);
    buffer.setStroke(r, g, b, a);
    buffer.setStrokeWidth(strokeColor === null ? 0 : strokeWidth);
  };

  const context: SketchContext = {
    get width() { return state.width; },
    get height() { return state.height; },
    get frameCount() { return state.frameCount; },
    get t() { return state.t; },
    get dt() { return state.dt; },
    get mouseX() { return state.mouseX; },
    get mouseY() { return state.mouseY; },
    get pmouseX() { return state.pmouseX; },
    get pmouseY() { return state.pmouseY; },
    get mouseIsPressed() { return state.mouseIsPressed; },
    get mouseButton() { return state.mouseButton; },
    get keyIsPressed() { return state.keyIsPressed; },
    get key() { return state.key; },
    keyIsDown: (key: string): boolean => state.keysDown.has(key),
    random,
    noise,

    background: (color: ColorLike): void => {
      const [r, g, b, a] = colors.resolve(color);
      buffer.background(r, g, b, a);
    },
    fill: (color: ColorLike): void => {
      fillColor = color;
      applyFill();
    },
    noFill: (): void => {
      fillColor = null;
      applyFill();
    },
    stroke: (color: ColorLike): void => {
      strokeColor = color;
      applyStroke();
    },
    noStroke: (): void => {
      strokeColor = null;
      applyStroke();
    },
    strokeWeight: (weight: number): void => {
      strokeWidth = weight;
      applyStroke();
    },
    blendMode: (mode: Blend): void => {
      blend = mode;
      buffer.setBlend(mode);
    },

    loadImage: async (url: string): Promise<ImageSource> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not load image ${JSON.stringify(url)}: ${response.status}`);
      }
      // createImageBitmap decodes off the main thread, so a large image does
      // not stall the first frame.
      return createImageBitmap(await response.blob());
    },
    image: (
      source: ImageSource,
      x: number,
      y: number,
      width?: number,
      height?: number,
    ): void => {
      buffer.image(source, x, y, width ?? source.width, height ?? source.height);
    },

    textFont: (family: string): void => buffer.setFont(family),
    textSize: (size: number): void => buffer.setTextSize(size),
    textAlign: (horizontal: Align, vertical: Baseline = Baseline.Alphabetic): void =>
      buffer.setTextAlign(horizontal, vertical),
    // Argument order follows p5: content first, then position.
    text: (content: string, x: number, y: number): void => buffer.text(x, y, content),

    // p5 takes a diameter, and so does this — a library in that tradition
    // silently halving every ported circle would be a nasty way to differ.
    circle: (x: number, y: number, diameter: number): void =>
      buffer.circle(x, y, diameter / 2),
    ellipse: (x: number, y: number, w: number, h: number): void =>
      buffer.ellipse(x, y, w / 2, h / 2),
    rect: (x: number, y: number, w: number, h: number): void => buffer.rect(x, y, w, h),
    square: (x: number, y: number, size: number): void => buffer.rect(x, y, size, size),
    line: (x1: number, y1: number, x2: number, y2: number): void =>
      buffer.line(x1, y1, x2, y2),
    point: (x: number, y: number): void => {
      // A dot of the current stroke weight, painted in the stroke colour —
      // p5's point() uses stroke, not fill.
      if (strokeColor === null) return;
      const [r, g, b, a] = colors.resolve(strokeColor);
      buffer.push();
      buffer.setFill(r, g, b, a);
      buffer.setStrokeWidth(0);
      buffer.circle(x, y, strokeWidth / 2);
      buffer.pop();
    },

    push: (): void => buffer.push(),
    pop: (): void => buffer.pop(),
    translate: (x: number, y: number): void => buffer.translate(x, y),
    rotate: (radians: number): void => buffer.rotate(radians),
    scale: (x: number, y?: number): void => buffer.scale(x, y ?? x),

    with: (overrides: StyleOverrides, body: () => void): void => {
      const savedFill = fillColor;
      const savedStroke = strokeColor;
      const savedWidth = strokeWidth;
      const savedBlend = blend;

      buffer.push();
      try {
        if (overrides.fill !== undefined) {
          fillColor = overrides.fill;
          applyFill();
        }
        if (overrides.stroke !== undefined || overrides.strokeWeight !== undefined) {
          if (overrides.stroke !== undefined) strokeColor = overrides.stroke;
          if (overrides.strokeWeight !== undefined) strokeWidth = overrides.strokeWeight;
          applyStroke();
        }
        if (overrides.blendMode !== undefined) {
          blend = overrides.blendMode;
          buffer.setBlend(blend);
        }
        body();
      } finally {
        // finally, not a trailing call: a throw inside the body must not leak
        // style into everything drawn afterwards.
        buffer.pop();
        fillColor = savedFill;
        strokeColor = savedStroke;
        strokeWidth = savedWidth;
        blend = savedBlend;
      }
    },

    noLoop: (): void => {
      state.looping = false;
    },
    loop: (): void => {
      state.looping = true;
    },
    isLooping: (): boolean => state.looping,
  };

  const beginFrame = (): void => {
    applyFill();
    applyStroke();
    buffer.setBlend(blend);
  };

  // Establish the defaults the first frame starts from.
  beginFrame();

  return { context, beginFrame };
}
