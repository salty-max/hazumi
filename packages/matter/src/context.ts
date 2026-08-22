import { Align, Baseline, Blend, CommandBuffer, type ImageSource } from "@matter/graphics";
import { isSpriteFrame, type SpriteFrame } from "./spritesheet";
import { createNoise, type Noise, type Rng, seeded } from "@matter/math";
import { type ColorCache, type ColorLike } from "./color-cache";
import { type Camera2D, createCamera2D } from "./camera";
import { loadImage } from "./load-image";

/** Style overrides accepted by `with()`. */
export interface StyleOverrides {
  fill?: ColorLike | null;
  stroke?: ColorLike | null;
  strokeWeight?: number;
  blendMode?: Blend;
  textFont?: string;
  textSize?: number;
  textAlign?: Align;
  textBaseline?: Baseline;
}

/** One mouse, pen, or touch contact in logical canvas coordinates. */
export interface PointerInput {
  /** Browser `PointerEvent.pointerId`. */
  readonly id: number;
  /** Browser pointer type: usually `mouse`, `pen`, or `touch`. */
  readonly type: string;
  readonly x: number;
  readonly y: number;
  /** Position at the end of the previous fixed update. */
  readonly previousX: number;
  readonly previousY: number;
  /** Normalized contact pressure from 0 to 1. */
  readonly pressure: number;
  readonly isPrimary: boolean;
  readonly isPressed: boolean;
}

/** One analog or digital button reported by a gamepad. */
export interface GamepadButtonInput {
  readonly value: number;
  readonly pressed: boolean;
  readonly touched: boolean;
}

/** A gamepad snapshot updated at the start of every fixed update. */
export interface GamepadInput {
  /** Browser-assigned slot, stable while the controller remains connected. */
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonInput[];
}

/**
 * Everything a scene can reach.
 *
 * Handed to the scene factory and retained as the compatibility argument for
 * lifecycle callbacks. New scenes normally import built-in capabilities from
 * `matter/draw`, `matter/input`, and `matter/scene`; the context remains useful
 * for app-owned plugin extensions such as audio.
 *
 * The same object is mutated in place rather than rebuilt, so code that keeps
 * it for a plugin service or a live getter does not receive a stale snapshot.
 */
export interface MatterContext {
  // --- environment ---
  readonly width: number;
  readonly height: number;
  /** Physical pixels per logical canvas unit. */
  readonly pixelRatio: number;
  /** Frames drawn so far. */
  readonly frameCount: number;
  /** Seconds since the application started. */
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

  /** Active pointers, plus contacts released during the current fixed update. */
  readonly pointers: readonly PointerInput[];
  /** True only during the first update after this pointer goes down. */
  pointerJustPressed: (pointerId?: number) => boolean;
  /** True only during the first update after this pointer goes up or is cancelled. */
  pointerJustReleased: (pointerId?: number) => boolean;
  /** Horizontal wheel delta accumulated since the previous fixed update, in CSS pixels. */
  readonly wheelX: number;
  /** Vertical wheel delta accumulated since the previous fixed update, in CSS pixels. */
  readonly wheelY: number;

  /** Connected gamepads, plus controllers disconnected during the current update. */
  readonly gamepads: readonly GamepadInput[];
  gamepadButtonIsDown: (button: number, gamepadIndex?: number) => boolean;
  gamepadButtonJustPressed: (button: number, gamepadIndex?: number) => boolean;
  gamepadButtonJustReleased: (button: number, gamepadIndex?: number) => boolean;

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
  /** True only during the first update after this key goes down. */
  keyJustPressed: (key: string) => boolean;
  /** True only during the first update after this key goes up. */
  keyJustReleased: (key: string) => boolean;
  /** True only during the first update after this mouse button goes down. */
  mouseJustPressed: (button?: number) => boolean;
  /** True only during the first update after this mouse button goes up. */
  mouseJustReleased: (button?: number) => boolean;

  /** Seeded by default, so an application renders identically on every run. */
  readonly random: Rng;
  readonly noise: Noise;
  /** World-space view, including zoom, following and coordinate conversion. */
  readonly camera: Camera2D;

  // --- style ---
  background: (color: ColorLike) => void;
  fill: (color: ColorLike) => void;
  noFill: () => void;
  stroke: (color: ColorLike) => void;
  noStroke: () => void;
  strokeWeight: (weight: number) => void;
  blendMode: (mode: Blend) => void;

  // --- paths ---
  /**
   * Begin a shape. Add points with `vertex`, curves with `bezierVertex` or
   * `quadraticVertex`, and finish with `endShape`.
   *
   * The buffer stores the control points, not a flattened polyline, so an SVG
   * export gets real curve commands and the GPU is free to flatten at whatever
   * resolution it is drawing.
   */
  beginShape: () => void;
  vertex: (x: number, y: number) => void;
  quadraticVertex: (cx: number, cy: number, x: number, y: number) => void;
  bezierVertex: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => void;
  /**
   * Finish the shape and paint it with the current style.
   *
   * `close` joins the last point back to the first.
   */
  endShape: (close?: boolean) => void;

  // --- post-processing ---
  /**
   * Set the post-processing chain. Passes run in order, each reading the
   * previous one's output.
   *
   * Set it while creating the scene: it is configuration, not per-frame drawing, and calling
   * it every frame would recompile nothing but still churn.
   */
  setPasses: (passes: readonly ShaderPassLike[]) => void;

  // --- images ---
  /**
   * Decode an image.
   *
   * Async, so a scene factory must await it — there is no separate preload phase. A
   * preload step would be a second lifecycle to learn, and `await` already
   * means what it needs to mean.
   */
  loadImage: (url: string) => Promise<ImageSource>;
  /**
   * Draw an image, or one frame of a spritesheet.
   *
   * Defaults to natural size when width and height are omitted — for a frame
   * that means the frame's size, not the whole sheet's.
   */
  image: (
    source: ImageSource | SpriteFrame,
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
   * drawing code, which is the classic failure of manual save/restore.
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
  pixelRatio: number;
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
  keysPressed: Set<string>;
  keysReleased: Set<string>;
  mouseButtonsPressed: Set<number>;
  mouseButtonsReleased: Set<number>;
  pointers: PointerInput[];
  pointersPressed: Set<number>;
  pointersReleased: Set<number>;
  wheelX: number;
  wheelY: number;
  gamepads: GamepadInput[];
  readonly gamepadButtonsPressed: Map<number, Set<number>>;
  readonly gamepadButtonsReleased: Map<number, Set<number>>;
  looping: boolean;
}

export interface ContextDeps {
  readonly buffer: CommandBuffer;
  readonly colors: ColorCache;
  readonly state: ContextState;
  readonly seed: number;
  /** Injected by the runtime; the context does not know about renderers. */
  readonly setPasses: (passes: readonly ShaderPassLike[]) => void;
}

/**
 * A post-processing pass.
 *
 * `fragment` is only a `main()`. The runtime supplies `v_uv`, `fragColor`,
 * `u_texture` (the previous pass, or the scene), `u_resolution`, `u_time` and
 * a `texelSize()` helper, so the smallest useful effect is three lines.
 */
export interface ShaderPassLike {
  readonly fragment: string;
  readonly uniforms?: Readonly<Record<string, number | readonly number[]>>;
}

/**
 * Builds the context object once. Scalar fields are defined as getters over
 * mutable state, so destructuring in the draw callback reads live values while
 * the object itself is never reallocated.
 */
export interface ContextBundle {
  readonly context: MatterContext;
  /**
   * Re-emit the current style into a freshly reset buffer.
   *
   * The buffer is cleared every frame, so style set during scene creation would be lost
   * otherwise. Re-emitting the live values rather than a hardcoded default is
   * what makes `fill()` in a scene factory behave the way anyone would expect.
   */
  readonly beginFrame: () => void;
  /** Update camera geometry after the logical canvas size changes. */
  readonly resize: (width: number, height: number) => void;
}

function hasGamepadEdge(
  edges: ReadonlyMap<number, ReadonlySet<number>>,
  gamepadIndex: number,
  button: number,
): boolean {
  return edges.get(gamepadIndex)?.has(button) ?? false;
}

export function createContext(deps: ContextDeps): ContextBundle {
  const { buffer, colors, state } = deps;
  const random = seeded(deps.seed);
  const noise = createNoise(seeded(deps.seed));
  const {
    camera,
    beginFrame: beginCameraFrame,
    resize,
  } = createCamera2D(buffer, state.width, state.height);
  const findGamepad = (index: number): GamepadInput | undefined => {
    for (let gamepadIndex = 0; gamepadIndex < state.gamepads.length; gamepadIndex++) {
      const gamepad = state.gamepads[gamepadIndex]!;
      if (gamepad.index === index) return gamepad;
    }
    return undefined;
  };

  // Mirrors what has been written to the buffer, so `with()` can restore it.
  let fillColor: ColorLike | null = "#ffffff";
  let strokeColor: ColorLike | null = null;
  let strokeWidth = 1;
  let blend: Blend = Blend.Normal;
  let fontFamily = "sans-serif";
  let fontSize = 16;
  let textHorizontal: Align = Align.Left;
  let textVertical: Baseline = Baseline.Alphabetic;
  // Whether the current shape has an open contour, so the first vertex knows
  // to move rather than draw a line from wherever the pen happened to be.
  let pathStarted = false;

  const applyFill = (): void => {
    const [r, g, b, a] = fillColor === null ? [0, 0, 0, 0] : colors.resolve(fillColor);
    buffer.setFill(r, g, b, a);
  };

  const applyStroke = (): void => {
    const [r, g, b, a] = strokeColor === null ? [0, 0, 0, 0] : colors.resolve(strokeColor);
    buffer.setStroke(r, g, b, a);
    buffer.setStrokeWidth(strokeColor === null ? 0 : strokeWidth);
  };

  const applyText = (): void => {
    buffer.setFont(fontFamily);
    buffer.setTextSize(fontSize);
    buffer.setTextAlign(textHorizontal, textVertical);
  };

  const context: MatterContext = {
    get width() {
      return state.width;
    },
    get height() {
      return state.height;
    },
    get pixelRatio() {
      return state.pixelRatio;
    },
    get frameCount() {
      return state.frameCount;
    },
    get t() {
      return state.t;
    },
    get dt() {
      return state.dt;
    },
    get mouseX() {
      return state.mouseX;
    },
    get mouseY() {
      return state.mouseY;
    },
    get pmouseX() {
      return state.pmouseX;
    },
    get pmouseY() {
      return state.pmouseY;
    },
    get mouseIsPressed() {
      return state.mouseIsPressed;
    },
    get mouseButton() {
      return state.mouseButton;
    },
    get pointers() {
      return state.pointers;
    },
    pointerJustPressed: (pointerId?: number): boolean =>
      pointerId === undefined
        ? state.pointersPressed.size > 0
        : state.pointersPressed.has(pointerId),
    pointerJustReleased: (pointerId?: number): boolean =>
      pointerId === undefined
        ? state.pointersReleased.size > 0
        : state.pointersReleased.has(pointerId),
    get wheelX() {
      return state.wheelX;
    },
    get wheelY() {
      return state.wheelY;
    },
    get gamepads() {
      return state.gamepads;
    },
    gamepadButtonIsDown: (button: number, gamepadIndex = 0): boolean =>
      findGamepad(gamepadIndex)?.buttons[button]?.pressed ?? false,
    gamepadButtonJustPressed: (button: number, gamepadIndex = 0): boolean =>
      hasGamepadEdge(state.gamepadButtonsPressed, gamepadIndex, button),
    gamepadButtonJustReleased: (button: number, gamepadIndex = 0): boolean =>
      hasGamepadEdge(state.gamepadButtonsReleased, gamepadIndex, button),
    get keyIsPressed() {
      return state.keyIsPressed;
    },
    get key() {
      return state.key;
    },
    keyIsDown: (key: string): boolean => state.keysDown.has(key),
    keyJustPressed: (key: string): boolean => state.keysPressed.has(key),
    keyJustReleased: (key: string): boolean => state.keysReleased.has(key),
    mouseJustPressed: (button = 0): boolean => state.mouseButtonsPressed.has(button),
    mouseJustReleased: (button = 0): boolean => state.mouseButtonsReleased.has(button),
    random,
    noise,
    camera,

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

    beginShape: (): void => {
      buffer.beginPath();
      pathStarted = false;
    },
    vertex: (x: number, y: number): void => {
      // The first vertex opens the contour; the rest extend it.
      if (pathStarted) buffer.lineTo(x, y);
      else {
        buffer.moveTo(x, y);
        pathStarted = true;
      }
    },
    quadraticVertex: (cx: number, cy: number, x: number, y: number): void => {
      if (!pathStarted) {
        buffer.moveTo(cx, cy);
        pathStarted = true;
      }
      buffer.quadraticTo(cx, cy, x, y);
    },
    bezierVertex: (
      c1x: number,
      c1y: number,
      c2x: number,
      c2y: number,
      x: number,
      y: number,
    ): void => {
      if (!pathStarted) {
        buffer.moveTo(c1x, c1y);
        pathStarted = true;
      }
      buffer.cubicTo(c1x, c1y, c2x, c2y, x, y);
    },
    endShape: (close = false): void => {
      if (!pathStarted) return;
      if (close) buffer.closePath();
      // Fill then stroke, the same order every other primitive uses.
      if (fillColor !== null) buffer.fillPath();
      if (strokeColor !== null && strokeWidth > 0) buffer.strokePath();
      pathStarted = false;
    },

    setPasses: deps.setPasses,

    loadImage,
    image: (
      source: ImageSource | SpriteFrame,
      x: number,
      y: number,
      width?: number,
      height?: number,
    ): void => {
      if (isSpriteFrame(source)) {
        buffer.imageRegion(
          source.source,
          x,
          y,
          width ?? source.width,
          height ?? source.height,
          source.x,
          source.y,
          source.width,
          source.height,
        );
        return;
      }
      buffer.image(source, x, y, width ?? source.width, height ?? source.height);
    },

    textFont: (family: string): void => {
      fontFamily = family;
      buffer.setFont(family);
    },
    textSize: (size: number): void => {
      fontSize = size;
      buffer.setTextSize(size);
    },
    textAlign: (horizontal: Align, vertical: Baseline = Baseline.Alphabetic): void => {
      textHorizontal = horizontal;
      textVertical = vertical;
      buffer.setTextAlign(horizontal, vertical);
    },
    // Content first, then position — the buffer stores it the other way round,
    // like every other primitive.
    text: (content: string, x: number, y: number): void => buffer.text(x, y, content),

    // A diameter, not a radius: `rect` takes width and height and `square` a
    // side, so every primitive's size argument is a full extent. The buffer
    // stores radii, so the halving happens here, once.
    circle: (x: number, y: number, diameter: number): void => buffer.circle(x, y, diameter / 2),
    ellipse: (x: number, y: number, w: number, h: number): void =>
      buffer.ellipse(x, y, w / 2, h / 2),
    rect: (x: number, y: number, w: number, h: number): void => buffer.rect(x, y, w, h),
    square: (x: number, y: number, size: number): void => buffer.rect(x, y, size, size),
    line: (x1: number, y1: number, x2: number, y2: number): void => buffer.line(x1, y1, x2, y2),
    point: (x: number, y: number): void => {
      // A dot of the current stroke weight, painted in the stroke colour: a
      // point is a degenerate line, so it follows stroke and not fill.
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
      const savedFont = fontFamily;
      const savedSize = fontSize;
      const savedAlign = textHorizontal;
      const savedBaseline = textVertical;

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
        if (
          overrides.textFont !== undefined ||
          overrides.textSize !== undefined ||
          overrides.textAlign !== undefined ||
          overrides.textBaseline !== undefined
        ) {
          if (overrides.textFont !== undefined) fontFamily = overrides.textFont;
          if (overrides.textSize !== undefined) fontSize = overrides.textSize;
          if (overrides.textAlign !== undefined) textHorizontal = overrides.textAlign;
          if (overrides.textBaseline !== undefined) textVertical = overrides.textBaseline;
          applyText();
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
        fontFamily = savedFont;
        fontSize = savedSize;
        textHorizontal = savedAlign;
        textVertical = savedBaseline;
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
    applyText();
    beginCameraFrame();
  };

  // Establish the defaults the first frame starts from.
  beginFrame();

  return { context, beginFrame, resize };
}
