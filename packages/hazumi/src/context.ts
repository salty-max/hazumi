import {
  Align,
  Baseline,
  Blend,
  CommandBuffer,
  type ImageSource,
  type ShaderPass,
  type TextMetrics,
  type Capabilities,
  MaterialKind,
} from "@hazumi/graphics";
import { isSpriteFrame, type SpriteFrame } from "./spritesheet";
import { createNoise, type Noise, type Rng, seeded } from "@hazumi/math";
import { type ColorCache, type ColorLike } from "./color-cache";
import { type Camera2D, createCamera2D } from "./camera";
import { loadImage } from "./load";

/**
 * A per-sprite effect, from a fixed vocabulary.
 *
 * Fixed rather than "your fragment shader here", and the reason is batching:
 * the material rides in the instance data, so two sprites wearing different
 * ones still merge into a single draw call. A shader per sprite would make
 * each sprite its own draw, which is the cost this API exists to avoid.
 *
 * Everything here is something the rest of the style cannot say. A tint
 * multiplies, so it can darken a sprite and never lighten it toward white; a
 * blend mode belongs to a draw and not to the edge of the art inside it.
 *
 * Materials apply to images and to text. `outline` is images only — it works
 * by looking at neighbouring texels, and a glyph is a distance field rather
 * than pixels.
 */
export type Material =
  /**
   * Lerp the sprite toward a colour, keeping its own alpha. The hit flash:
   * `{ type: "flash", amount: 1 }` is a white silhouette, `0` is untouched.
   */
  | {
      /** Discriminant. */
      readonly type: "flash";
      /** What to lerp toward. Defaults to white. */
      readonly color?: ColorLike;
      /** How far, 0 to 1. Defaults to 1 — a flat silhouette in `color`. */
      readonly amount?: number;
    }
  /**
   * A border in the transparent texels around the art.
   *
   * `width` is a whole number of *source* texels, so it scales with the sprite
   * rather than with the screen — a 1 on a 16x16 sprite drawn at 4x is four
   * pixels thick, which is what pixel art wants. Needs a texel of empty space
   * inside the frame to draw into: art that runs to the edge of its cell has
   * nowhere to put the border, and the edge is clamped rather than bleeding
   * into the neighbouring frame of a sheet.
   */
  | {
      /** Discriminant. */
      readonly type: "outline";
      /** Border colour. Defaults to black. */
      readonly color?: ColorLike;
      /** Thickness in whole source texels, 1 to 8. Defaults to 1. */
      readonly width?: number;
    }
  /**
   * Eat the sprite away along a noise field, with a lit edge at the boundary.
   *
   * `amount` runs 0 (whole) to 1 (gone). The field is fixed in sprite space,
   * so an animating sprite dissolves in place instead of shimmering. `scale`
   * is how many noise cells span the frame — larger is finer.
   */
  | {
      /** Discriminant. */
      readonly type: "dissolve";
      /** Progress, 0 (whole) to 1 (gone). The one parameter with no default. */
      readonly amount: number;
      /** Width of the lit band at the boundary, as a fraction. Defaults to 0.1. */
      readonly edge?: number;
      /** Colour of that band. Defaults to white. */
      readonly color?: ColorLike;
      /** Noise cells across the frame. Larger is finer. Defaults to 8. */
      readonly scale?: number;
    };

/** Style overrides accepted by `with()`. */
export interface StyleOverrides {
  /** Interior colour, or `null` for `noFill()`. */
  fill?: ColorLike | null;
  /** Outline colour, or `null` for `noStroke()`. */
  stroke?: ColorLike | null;
  /** Outline width in user units. */
  strokeWeight?: number;
  /** How the block's draws combine with what is under them. */
  blendMode?: Blend;
  /** Image multiplier, or `null` for opaque white. */
  tint?: ColorLike | null;
  /** `null` clears the material for the body, as `noMaterial()` would. */
  material?: Material | null;
  /** Font family, as a CSS font stack. */
  textFont?: string;
  /** Text size in user units. */
  textSize?: number;
  /** Which point of the text its x refers to. */
  textAlign?: Align;
  /** Which point of the text its y refers to. */
  textBaseline?: Baseline;
}

/** One mouse, pen, or touch contact in logical canvas coordinates. */
export interface PointerInput {
  /** Browser `PointerEvent.pointerId`. */
  readonly id: number;
  /** Browser pointer type: usually `mouse`, `pen`, or `touch`. */
  readonly type: string;
  /** Position in logical canvas coordinates. */
  readonly x: number;
  /** Position in logical canvas coordinates. */
  readonly y: number;
  /** Position at the end of the previous fixed update. */
  readonly previousX: number;
  /** Position at the end of the previous fixed update. */
  readonly previousY: number;
  /** Normalized contact pressure from 0 to 1. */
  readonly pressure: number;
  /** The first contact of its type — the one a single-pointer scene should follow. */
  readonly isPrimary: boolean;
  /** Whether it is currently down. A hovering mouse is present but not pressed. */
  readonly isPressed: boolean;
}

/** One analog or digital button reported by a gamepad. */
export interface GamepadButtonInput {
  /** Analog position, 0 to 1. A digital button reports 0 or 1. */
  readonly value: number;
  /** Whether the pad considers it pressed. Triggers have their own threshold. */
  readonly pressed: boolean;
  /** Whether a finger is resting on it — capacitive pads only. */
  readonly touched: boolean;
}

/** A gamepad snapshot updated at the start of every fixed update. */
export interface GamepadInput {
  /** Browser-assigned slot, stable while the controller remains connected. */
  readonly index: number;
  /** What the pad calls itself. Useful for telling two models apart. */
  readonly id: string;
  /** `"standard"` when the browser could map it to the standard layout. */
  readonly mapping: string;
  /** False once it is unplugged. The slot stays, reporting everything at rest. */
  readonly connected: boolean;
  /** Axis positions, -1 to 1. Standard layout is left stick, then right. */
  readonly axes: readonly number[];
  /** Buttons, indexed by the standard layout. */
  readonly buttons: readonly GamepadButtonInput[];
}

/**
 * Everything a scene can reach.
 *
 * Handed to the scene factory and retained as the compatibility argument for
 * lifecycle callbacks. New scenes normally import built-in capabilities from
 * `hazumi/draw`, `hazumi/input`, and `hazumi/scene`; the context remains useful
 * for app-owned plugin extensions such as audio.
 *
 * The same object is mutated in place rather than rebuilt, so code that keeps
 * it for a plugin service or a live getter does not receive a stale snapshot.
 */
export interface HazumiContext {
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
  /**
   * Set fill from display-referred 0–1 channels. No parse, no allocation —
   * the path a particle system (or any per-shape colour) needs.
   */
  fillRgba: (r: number, g: number, b: number, a: number) => void;
  noFill: () => void;
  /**
   * Multiplier for images. Independent of fill so `noFill()` cannot hide a
   * sprite. Pass `null` via `noTint()` for opaque white, a no-op.
   */
  tint: (color: ColorLike) => void;
  /** Set tint from display-referred 0–1 channels. No parse, no allocation. */
  tintRgba: (r: number, g: number, b: number, a: number) => void;
  noTint: () => void;
  /**
   * Set the effect worn by following images and text.
   *
   * Costs nothing per sprite that a plain draw does not: it is two words of
   * instance data, and sprites wearing different materials still batch
   * together. Ignored by backends that report `capabilities.materials` false —
   * the sprite draws plain rather than failing.
   */
  material: (material: Material) => void;
  noMaterial: () => void;
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
  setPasses: (passes: readonly ShaderPass[]) => void;

  /**
   * What this backend can do, so a scene can ask instead of being thrown at.
   *
   * ```ts
   * if (capabilities.shaders) setPasses([{ fragment: GRADE }]);
   * ```
   */
  readonly capabilities: Capabilities;

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
   * that means the frame's size, not the whole sheet's. Optional `sx, sy, sw,
   * sh` crop source pixels; on a frame they are relative to that frame.
   */
  image: (
    source: ImageSource | SpriteFrame,
    x: number,
    y: number,
    width?: number,
    height?: number,
    sx?: number,
    sy?: number,
    sw?: number,
    sh?: number,
  ) => void;

  // --- text ---
  /** Font family, as in CSS. Defaults to sans-serif. */
  textFont: (family: string) => void;
  textSize: (size: number) => void;
  /**
   * Measure one line at the current font and size.
   *
   * Needs the renderer, because only it knows the font. A backend without a
   * font context — the headless recorder — cannot answer, and says so rather
   * than guessing a width that would silently misplace every layout built on it.
   */
  /**
   * Draw `body` at `depth`. Lower depths paint first.
   *
   * Depth overrides call order, and only that: within one depth, and inside a
   * layer, calls still paint in the order they were made. Anything drawn
   * outside a layer sits at depth 0.
   *
   * Style and transform are scoped to the block, like `scoped()`. That is not
   * a convenience — a layer that leaked a fill would change the colour of a
   * different layer depending on which depth sorted first, which is the kind of
   * bug that only appears when someone reorders their scene.
   */
  layer: (depth: number, body: () => void) => void;
  measureText: (content: string) => TextMetrics;
  /** Advance width of one line at the current font and size. */
  textWidth: (content: string) => number;
  /**
   * Break text into lines that each fit `maxWidth`.
   *
   * Splits on spaces, keeps existing newlines, and never drops a word: one
   * longer than `maxWidth` gets a line to itself rather than being cut.
   */
  wrapText: (content: string, maxWidth: number) => readonly string[];
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
  readonly setPasses: (passes: readonly ShaderPass[]) => void;
  /** Measure at the family and size the context currently holds. */
  readonly measureText: (content: string, font: string, size: number) => TextMetrics;
  readonly capabilities: Capabilities;
}

/**
 * Builds the context object once. Scalar fields are defined as getters over
 * mutable state, so destructuring in the draw callback reads live values while
 * the object itself is never reallocated.
 */
export interface ContextBundle {
  readonly context: HazumiContext;
  /**
   * Re-emit the current style into a freshly reset buffer.
   *
   * The buffer is cleared every frame, so style set during scene creation would be lost
   * otherwise. Re-emitting the live values rather than a hardcoded default is
   * what makes `fill()` in a scene factory behave the way anyone would expect.
   */
  readonly beginFrame: () => void;
  /** Settle depth ordering. Call once after the scene has drawn. */
  readonly endFrame: () => void;
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
  const fillRgbaStore: [number, number, number, number] = [1, 1, 1, 1];
  let fillUsesRgba = false;
  let tintColor: ColorLike = "#ffffff";
  const tintRgbaStore: [number, number, number, number] = [1, 1, 1, 1];
  let tintUsesRgba = false;
  let activeMaterial: Material | null = null;
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
    if (fillUsesRgba) {
      buffer.setFill(fillRgbaStore[0], fillRgbaStore[1], fillRgbaStore[2], fillRgbaStore[3]);
      return;
    }
    const [r, g, b, a] = fillColor === null ? [0, 0, 0, 0] : colors.resolve(fillColor);
    buffer.setFill(r, g, b, a);
  };

  const applyTint = (): void => {
    if (tintUsesRgba) {
      buffer.setTint(tintRgbaStore[0], tintRgbaStore[1], tintRgbaStore[2], tintRgbaStore[3]);
      return;
    }
    const [r, g, b, a] = colors.resolve(tintColor);
    buffer.setTint(r, g, b, a);
  };

  /**
   * Write the current material, defaulting whatever the caller left out.
   *
   * The defaults are here rather than in the backend so that every backend
   * receives the same numbers: a default that lives in one renderer is a
   * difference between renderers waiting to be found.
   */
  const applyMaterial = (): void => {
    if (activeMaterial === null) {
      buffer.setMaterial(MaterialKind.None, 0, 0, 0, 0, 0, 0, 0);
      return;
    }
    switch (activeMaterial.type) {
      case "flash": {
        const [r, g, b, a] = colors.resolve(activeMaterial.color ?? "#ffffff");
        buffer.setMaterial(MaterialKind.Flash, r, g, b, a, activeMaterial.amount ?? 1, 0, 0);
        return;
      }
      case "outline": {
        const [r, g, b, a] = colors.resolve(activeMaterial.color ?? "#000000");
        buffer.setMaterial(MaterialKind.Outline, r, g, b, a, activeMaterial.width ?? 1, 0, 0);
        return;
      }
      case "dissolve": {
        const [r, g, b, a] = colors.resolve(activeMaterial.color ?? "#ffffff");
        buffer.setMaterial(
          MaterialKind.Dissolve,
          r,
          g,
          b,
          a,
          activeMaterial.amount,
          activeMaterial.edge ?? 0.1,
          activeMaterial.scale ?? 8,
        );
        return;
      }
    }
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

  const context: HazumiContext = {
    capabilities: deps.capabilities,
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
      fillUsesRgba = false;
      applyFill();
    },
    fillRgba: (r: number, g: number, b: number, a: number): void => {
      fillColor = "#ffffff";
      fillUsesRgba = true;
      fillRgbaStore[0] = r;
      fillRgbaStore[1] = g;
      fillRgbaStore[2] = b;
      fillRgbaStore[3] = a;
      applyFill();
    },
    noFill: (): void => {
      fillColor = null;
      fillUsesRgba = false;
      applyFill();
    },
    tint: (color: ColorLike): void => {
      tintColor = color;
      tintUsesRgba = false;
      applyTint();
    },
    tintRgba: (r: number, g: number, b: number, a: number): void => {
      tintColor = "#ffffff";
      tintUsesRgba = true;
      tintRgbaStore[0] = r;
      tintRgbaStore[1] = g;
      tintRgbaStore[2] = b;
      tintRgbaStore[3] = a;
      applyTint();
    },
    noTint: (): void => {
      tintColor = "#ffffff";
      tintUsesRgba = false;
      applyTint();
    },
    material: (next: Material): void => {
      activeMaterial = next;
      applyMaterial();
    },
    noMaterial: (): void => {
      activeMaterial = null;
      applyMaterial();
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
      sx?: number,
      sy?: number,
      sw?: number,
      sh?: number,
    ): void => {
      const cropped = sx !== undefined || sy !== undefined || sw !== undefined || sh !== undefined;
      if (cropped) {
        if (sx === undefined || sy === undefined || sw === undefined || sh === undefined) {
          throw new TypeError("image() source crop requires sx, sy, sw, and sh");
        }
        if (isSpriteFrame(source)) {
          buffer.imageRegion(
            source.source,
            x,
            y,
            width ?? sw,
            height ?? sh,
            source.x + sx,
            source.y + sy,
            sw,
            sh,
          );
          return;
        }
        buffer.imageRegion(source, x, y, width ?? sw, height ?? sh, sx, sy, sw, sh);
        return;
      }
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

    layer: (depth: number, body: () => void): void => {
      if (!Number.isFinite(depth)) {
        throw new RangeError(`layer depth must be a finite number, got ${depth}`);
      }
      // Close whatever was open at the ambient depth, then run the body inside
      // its own push/pop so the segment is self-contained once moved.
      closeSegment(layerDepth, buffer.length);
      const outerDepth = layerDepth;
      layerDepth = depth;
      buffer.push();
      try {
        body();
      } finally {
        buffer.pop();
        closeSegment(depth, buffer.length);
        layerDepth = outerDepth;
      }
    },

    measureText: (content: string): TextMetrics => deps.measureText(content, fontFamily, fontSize),

    textWidth: (content: string): number => deps.measureText(content, fontFamily, fontSize).width,

    wrapText: (content: string, maxWidth: number): readonly string[] => {
      const lines: string[] = [];
      // Existing newlines are the author's own breaks and survive wrapping.
      for (const paragraph of content.split("\n")) {
        const words = paragraph.split(" ").filter((word) => word.length > 0);
        if (words.length === 0) {
          lines.push("");
          continue;
        }
        let line = words[0] as string;
        for (const word of words.slice(1)) {
          const candidate = `${line} ${word}`;
          if (deps.measureText(candidate, fontFamily, fontSize).width <= maxWidth) {
            line = candidate;
          } else {
            // A word wider than the box still gets its own line: cutting it
            // would lose characters, which is worse than overflowing.
            lines.push(line);
            line = word;
          }
        }
        lines.push(line);
      }
      return lines;
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
      const savedUsesRgba = fillUsesRgba;
      const savedR = fillRgbaStore[0];
      const savedG = fillRgbaStore[1];
      const savedB = fillRgbaStore[2];
      const savedA = fillRgbaStore[3];
      const savedTint = tintColor;
      const savedTintUsesRgba = tintUsesRgba;
      const savedTintR = tintRgbaStore[0];
      const savedTintG = tintRgbaStore[1];
      const savedTintB = tintRgbaStore[2];
      const savedTintA = tintRgbaStore[3];
      const savedMaterial = activeMaterial;
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
          fillUsesRgba = false;
          applyFill();
        }
        if (overrides.tint !== undefined) {
          tintColor = overrides.tint ?? "#ffffff";
          tintUsesRgba = false;
          applyTint();
        }
        if (overrides.material !== undefined) {
          activeMaterial = overrides.material;
          applyMaterial();
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
        fillUsesRgba = savedUsesRgba;
        fillRgbaStore[0] = savedR;
        fillRgbaStore[1] = savedG;
        fillRgbaStore[2] = savedB;
        fillRgbaStore[3] = savedA;
        tintColor = savedTint;
        tintUsesRgba = savedTintUsesRgba;
        tintRgbaStore[0] = savedTintR;
        tintRgbaStore[1] = savedTintG;
        tintRgbaStore[2] = savedTintB;
        tintRgbaStore[3] = savedTintA;
        activeMaterial = savedMaterial;
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

  /**
   * Depth segments for this frame.
   *
   * Reused across frames rather than rebuilt: `layer()` runs per draw, and a
   * fresh array each time would allocate in the hot path. `segmentCount` is the
   * live length; entries past it are last frame's, waiting to be overwritten.
   */
  const segments: { depth: number; start: number; end: number }[] = [];
  let segmentCount = 0;
  let openStart = 0;
  let layerDepth = 0;

  const closeSegment = (depth: number, end: number): void => {
    if (end <= openStart) return;
    const existing = segments[segmentCount];
    if (existing === undefined) {
      segments.push({ depth, start: openStart, end });
    } else {
      existing.depth = depth;
      existing.start = openStart;
      existing.end = end;
    }
    segmentCount++;
    openStart = end;
  };

  const beginFrame = (): void => {
    applyFill();
    applyTint();
    applyMaterial();
    applyStroke();
    buffer.setBlend(blend);
    applyText();
    beginCameraFrame();
    // Style set up above belongs to every layer, so the first segment opens
    // after it rather than carrying it into whichever layer sorts first.
    segmentCount = 0;
    openStart = buffer.length;
    layerDepth = 0;
  };

  const endFrame = (): void => {
    closeSegment(layerDepth, buffer.length);
    if (segmentCount > 1) buffer.reorderSegments(segments.slice(0, segmentCount));
  };

  // Establish the defaults the first frame starts from.
  beginFrame();

  return { context, beginFrame, endFrame, resize };
}
