/**
 * L5 — the batteries-included entry point.
 *
 * Deliberately thin: everything here should be expressible in terms of L0–L4.
 * If something can only be written at this layer, that is a signal a lower
 * layer is missing a capability, not that this layer needs more code.
 *
 * Note the split between `export` and `export type`. Classes and functions must
 * be re-exported as values — `export type { CommandBuffer }` typechecks fine and
 * then vanishes at runtime.
 *
 * Re-exports are explicit rather than `export *` so a name collision between
 * packages is a conflict here rather than a silent shadow.
 */

// --- application and scene API ---
export { start } from "./app";
export { Pixels, PixelAccessUnavailableError } from "./pixels";
export type { MutablePixelColor, PixelColor } from "./pixels";
export type {
  AppOptions,
  MatterApp,
  Scene,
  SceneSource,
  SceneFactory,
  SceneUpdate,
  SceneDraw,
  ShaderPass,
  FrameStats,
} from "./app";
export type {
  GamepadButtonInput,
  GamepadInput,
  MatterContext,
  PointerInput,
  StyleOverrides,
} from "./context";
export type { Camera2D, CameraPoint } from "./camera";
export { ColorCache } from "./color-cache";
export { spritesheet, isSpriteFrame, UnknownFrameError, UnknownClipError } from "./spritesheet";
export { createClip, ClipEnd, EmptyClipError } from "./animation";
export type { AnimationClip, ClipOptions } from "./animation";
export { tilemap, EMPTY_TILE } from "./tilemap";
export type {
  Tilemap,
  TilemapDrawContext,
  TilemapLayer,
  TilemapLayerOptions,
  TilemapOptions,
} from "./tilemap";
export type {
  Spritesheet,
  SpriteFrame,
  SpritesheetOptions,
  GridOptions,
  NamedOptions,
  ClipsOption,
} from "./spritesheet";
export type { ColorLike, Rgba } from "./color-cache";

// --- optional plugins ---
export {
  audio,
  AudioDisposedError,
  AudioPluginInUseError,
  AudioUnavailableError,
  UnknownSoundError,
} from "@matter/audio";
export type {
  AudioApi,
  AudioController,
  AudioPluginOptions,
  AudioVoice,
  PlayOptions,
  Sound,
} from "@matter/audio";

// --- L0 core ---
export { AppClock, createPluginHost, definePlugin, DuplicatePluginError } from "@matter/core";
export type {
  Clock,
  ClockOptions,
  Plugin,
  PluginHost,
  PluginLifecycle,
  PluginBuilder,
  PluginSetupContext,
} from "@matter/core";

// --- L1 math ---
export {
  vec2,
  vec3,
  mat4,
  easing,
  collision,
  seeded,
  createNoise,
  lerp,
  clamp,
  norm,
  remap,
  degrees,
  radians,
  wrap,
  angleDelta,
  smoothstep,
} from "@matter/math";
export type {
  Aabb,
  Circle,
  Easing,
  Mat4,
  Noise,
  RayHit,
  Rng,
  SweepHit,
  Vec2,
  Vec3,
} from "@matter/math";

// --- L2 color ---
export {
  oklch,
  parse as parseColor,
  tryParse as tryParseColor,
  ColorParseError,
  toSrgb,
  fromSrgb,
  toLinearRgb,
  inGamut,
  clampToGamut,
  toCss,
  toHex,
  toRgbCss,
  mix,
  gradient,
  lighten,
  darken,
  withAlpha,
  rotateHue,
} from "@matter/color";
export type { Oklch, Oklab, Srgb, LinearRgb } from "@matter/color";

// --- L3 graphics ---
export {
  CommandBuffer,
  decode,
  Op,
  OP_SIZE,
  Blend,
  Align,
  Baseline,
  UnknownOpcodeError,
} from "@matter/graphics";
export type { CommandVisitor, Renderer, BackendFactory, Affine } from "@matter/graphics";
