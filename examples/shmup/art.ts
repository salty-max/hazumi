/**
 * Everything the shmup draws.
 *
 * Kept apart from the rules so the two move independently: the game reads the
 * same whether a ship is a sprite or a triangle, and the sheets are only
 * mentioned here.
 */
import { background, fill, image, noStroke, pop, push, rect, rotate, translate } from "hazumi/draw";
import { screen } from "hazumi/scene";

import { definePlugin, type Plugin } from "hazumi";
import { loadArt, type IconFrame, type ShmupArt } from "./sprites";

export const INK = "oklch(0.95 0.02 250)";
export const DIM = "oklch(0.66 0.03 250)";
export const GOLD = "oklch(0.86 0.16 85)";
export const ENEMY = "oklch(0.72 0.19 25)";
export const SHIELD = "oklch(0.82 0.14 195)";

const SHIP = 34;
const SHOT = 16;

/** The interface tiles are twelve of face plus a pixel of shadow. */
const ICON_WIDTH = 12;
const ICON_HEIGHT = 13;

/** Two star fields at different speeds, which is the whole parallax. */
function drawSky(art: ShmupArt, near: number, far: number): void {
  background("oklch(0.10 0.02 265)");
  drawLayer(art, 3, far);
  drawLayer(art, 0, near);
}

function drawLayer(art: ShmupArt, index: number, offset: number): void {
  const tile = art.sky.frame(index);
  const height = screen.height + 8;
  const scale = screen.width / tile.width;
  const tall = tile.height * scale;
  // Two copies chase each other down the screen; one is always covering the
  // seam the other leaves.
  const y = offset % tall;
  image(tile, 0, y - tall, screen.width, tall);
  image(tile, 0, y, screen.width, tall);
  if (y + tall < height) image(tile, 0, y + tall, screen.width, tall);
}

function drawPlayer(art: ShmupArt, x: number, y: number, tilt: number): void {
  const name = tilt < -0.35 ? "playerLeft" : tilt > 0.35 ? "playerRight" : "player";
  image(art.ships.named(name), x - SHIP / 2, y - SHIP / 2, SHIP, SHIP);
}

/**
 * The core the ship is actually hit on, drawn so the player can see it.
 *
 * A shmup that hides its hitbox is asking you to learn it by dying. Every
 * bullet-hell since the mid nineties has shown the dot instead.
 */
export function drawCore(x: number, y: number, radius: number, pulse: number): void {
  noStroke();
  // Exactly the radius the game collides on, landed on whole pixels: a dot
  // that overstates the hitbox teaches the wrong thing.
  fill(SHIELD);
  const left = Math.round(x - radius);
  const top = Math.round(y - radius);
  rect(left, top, radius * 2, radius * 2);
  fill(INK);
  const core = Math.round(radius * (0.6 + pulse * 0.4));
  rect(left + core, top + core, radius * 2 - core * 2, radius * 2 - core * 2);
}

const ENEMY_FRAMES = ["darter", "weaver", "gunship", "hulk"] as const;

function drawEnemy(art: ShmupArt, x: number, y: number, kind: number, size: number): void {
  const name = ENEMY_FRAMES[
    Math.min(kind, ENEMY_FRAMES.length - 1)
  ] as (typeof ENEMY_FRAMES)[number];
  image(art.ships.named(name), x - size / 2, y - size / 2, size, size);
}

function drawBoss(art: ShmupArt, x: number, y: number, wobble: number): void {
  push();
  translate(x, y);
  rotate(wobble * 0.04);
  // Sixteen by twenty-four, so it keeps its proportions rather than squaring.
  image(art.ships.named("boss"), -48, -72, 96, 144);
  pop();
}

function drawShot(art: ShmupArt, x: number, y: number, hostile: boolean): void {
  const frame = art.shots.named(hostile ? "enemyBolt" : "bolt");
  image(frame, x - SHOT / 2, y - SHOT / 2, SHOT, SHOT);
}

function drawPickup(art: ShmupArt, x: number, y: number, kind: number, spin: number): void {
  push();
  translate(x, y);
  rotate(spin);
  image(art.shots.named(kind === 0 ? "burst" : "shield"), -12, -12, 24, 24);
  pop();
}

/** Width of an interface tile at a whole-number scale. */
export function iconWidth(scale: number): number {
  return ICON_WIDTH * scale;
}

/** One interface tile, centred on x, at its own aspect rather than squared. */
function icon(art: ShmupArt, name: IconFrame, x: number, y: number, scale: number): void {
  const w = ICON_WIDTH * scale;
  image(art.ui.named(name), Math.round(x - w / 2), Math.round(y), w, ICON_HEIGHT * scale);
}

/** The cabinet either side of the playfield, and the seams that frame it. */
export function drawSides(fieldX: number, fieldRight: number): void {
  noStroke();
  fill("oklch(0.14 0.02 265)");
  rect(0, 0, fieldX, screen.height);
  rect(fieldRight, 0, screen.width - fieldRight, screen.height);
  fill("oklch(0.42 0.06 265)");
  rect(fieldX - 2, 0, 2, screen.height);
  rect(fieldRight, 0, 2, screen.height);
}

/**
 * The art, with the drawing bound to it.
 *
 * Threading `art` through twenty call sites was the one place the game read
 * unlike the library it is written in: `image` and `fill` find the running
 * scene by themselves, and every one of these took a bundle by hand. A plugin
 * puts the bundle on the scene context instead, so the game asks for it once
 * and the drawing arrives already knowing which sheets it draws from.
 */
export interface Painter {
  /** The sheets themselves, for the font and the dialogue panel. */
  readonly sheets: ShmupArt;
  /** Two star fields at different speeds, which is the whole parallax. */
  sky: (near: number, far: number) => void;
  /** The ship, leaning into its turn. */
  player: (x: number, y: number, tilt: number) => void;
  /** The core the ship is actually hit on, drawn so the player can see it. */
  core: (x: number, y: number, radius: number, pulse: number) => void;
  /** One enemy hull, by kind. */
  enemy: (x: number, y: number, kind: number, size: number) => void;
  /** The boss, which wobbles rather than tilting. */
  boss: (x: number, y: number, wobble: number) => void;
  /** A bolt, ours or theirs. */
  shot: (x: number, y: number, hostile: boolean) => void;
  /** A spinning pickup. */
  pickup: (x: number, y: number, kind: number, spin: number) => void;
  /** One interface tile, centred on the point. */
  icon: (name: IconFrame, x: number, y: number, scale: number) => void;
  /** The cabinet either side of the playfield. */
  sides: (fieldX: number, fieldRight: number) => void;
}

/** What the plugin adds to the scene context. */
export interface ArtApi {
  readonly art: Painter;
}

/**
 * Loads the sheets and contributes a painter bound to them.
 *
 * The order is worth knowing, because it decides the shape: the host is built
 * first — which calls every `setup` and fixes what the context carries — then
 * `presetup` runs and may be async, and only then does the scene factory run.
 * So `setup` has to hand back the painter before the sheets exist, and the
 * painter reaches for them through a slot `presetup` fills. Nothing calls a
 * draw method before the scene exists, so the slot is never empty in practice
 * and says so loudly if that ever changes.
 *
 * What it buys: the scene factory is not async, and no draw call carries the
 * bundle it draws from.
 */
export function artwork(): Plugin<ArtApi> {
  let sheets: ShmupArt | null = null;
  const loaded = (): ShmupArt => {
    if (sheets === null) throw new Error("The shmup art was used before it finished loading");
    return sheets;
  };

  const art: Painter = {
    get sheets() {
      return loaded();
    },
    sky: (near, far) => drawSky(loaded(), near, far),
    player: (x, y, tilt) => drawPlayer(loaded(), x, y, tilt),
    core: drawCore,
    enemy: (x, y, kind, size) => drawEnemy(loaded(), x, y, kind, size),
    boss: (x, y, wobble) => drawBoss(loaded(), x, y, wobble),
    shot: (x, y, hostile) => drawShot(loaded(), x, y, hostile),
    pickup: (x, y, kind, spin) => drawPickup(loaded(), x, y, kind, spin),
    icon: (name, x, y, scale) => icon(loaded(), name, x, y, scale),
    sides: drawSides,
  };

  return definePlugin({
    name: "shmup-art",
    presetup: async (): Promise<void> => {
      sheets = await loadArt();
    },
    setup: (): ArtApi => ({ art }),
  });
}
