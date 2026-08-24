/**
 * Everything the shmup draws.
 *
 * Kept apart from the rules so the two move independently: the game reads the
 * same whether a ship is a sprite or a triangle, and the sheets are only
 * mentioned here.
 */
import { sliceFrame } from "hazumi/assets";
import {
  Align,
  background,
  fill,
  image,
  noStroke,
  rect,
  pop,
  push,
  rotate,
  text,
  textAlign,
  textSize,
  translate,
} from "hazumi/draw";
import { screen } from "hazumi/scene";

import type { ShmupArt } from "./sprites";

export const INK = "oklch(0.95 0.02 250)";
export const DIM = "oklch(0.66 0.03 250)";
export const GOLD = "oklch(0.86 0.16 85)";
export const ENEMY = "oklch(0.72 0.19 25)";
export const SHIELD = "oklch(0.82 0.14 195)";

const SHIP = 34;
const SHOT = 16;

/** Two star fields at different speeds, which is the whole parallax. */
export function drawSky(art: ShmupArt, near: number, far: number): void {
  background("oklch(0.10 0.02 265)");
  drawLayer(art, 3, far, 1);
  drawLayer(art, 0, near, 1);
}

function drawLayer(art: ShmupArt, index: number, offset: number, alpha: number): void {
  const tile = art.sky.frame(index);
  const height = screen.height + 8;
  const scale = screen.width / tile.width;
  const tall = tile.height * scale;
  // Two copies chase each other down the screen; one is always covering the
  // seam the other leaves.
  const y = offset % tall;
  void alpha;
  image(tile, 0, y - tall, screen.width, tall);
  image(tile, 0, y, screen.width, tall);
  if (y + tall < height) image(tile, 0, y + tall, screen.width, tall);
}

export function drawPlayer(art: ShmupArt, x: number, y: number, tilt: number): void {
  const name = tilt < -0.35 ? "playerLeft" : tilt > 0.35 ? "playerRight" : "player";
  image(art.ships.named(name), x - SHIP / 2, y - SHIP / 2, SHIP, SHIP);
}

const ENEMY_FRAMES = ["darter", "weaver", "gunship", "hulk"] as const;

export function drawEnemy(art: ShmupArt, x: number, y: number, kind: number, size: number): void {
  const name = ENEMY_FRAMES[Math.min(kind, ENEMY_FRAMES.length - 1)] as string;
  image(art.ships.named(name), x - size / 2, y - size / 2, size, size);
}

export function drawBoss(art: ShmupArt, x: number, y: number, wobble: number): void {
  push();
  translate(x, y);
  rotate(wobble * 0.04);
  // Sixteen by twenty-four, so it keeps its proportions rather than squaring.
  image(art.ships.named("boss"), -48, -72, 96, 144);
  pop();
}

export function drawShot(art: ShmupArt, x: number, y: number, hostile: boolean): void {
  const frame = art.shots.named(hostile ? "enemyBolt" : "bolt");
  image(frame, x - SHOT / 2, y - SHOT / 2, SHOT, SHOT);
}

export function drawPickup(art: ShmupArt, x: number, y: number, kind: number, spin: number): void {
  push();
  translate(x, y);
  rotate(spin);
  image(art.shots.named(kind === 0 ? "burst" : "shield"), -12, -12, 24, 24);
  pop();
}

/**
 * A panel from one 16x16 tile, cut into nine and stretched only in the middle.
 *
 * Scaling the tile whole would smear its border; the corners have to stay the
 * size they were drawn and only the spans between them may grow.
 */
export function panel(art: ShmupArt, x: number, y: number, w: number, h: number): void {
  const tile = art.ui.named("panel");
  const edge = 5;
  const drawn = 12;
  const midW = Math.max(0, w - drawn * 2);
  const midH = Math.max(0, h - drawn * 2);
  const piece = (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void => {
    image(sliceFrame(tile, sx, sy, sw, sh), dx, dy, dw, dh);
  };
  const far = 16 - edge;
  piece(0, 0, edge, edge, x, y, drawn, drawn);
  piece(far, 0, edge, edge, x + w - drawn, y, drawn, drawn);
  piece(0, far, edge, edge, x, y + h - drawn, drawn, drawn);
  piece(far, far, edge, edge, x + w - drawn, y + h - drawn, drawn, drawn);
  piece(edge, 0, 16 - edge * 2, edge, x + drawn, y, midW, drawn);
  piece(edge, far, 16 - edge * 2, edge, x + drawn, y + h - drawn, midW, drawn);
  piece(0, edge, edge, 16 - edge * 2, x, y + drawn, drawn, midH);
  piece(far, edge, edge, 16 - edge * 2, x + w - drawn, y + drawn, drawn, midH);
  piece(edge, edge, 16 - edge * 2, 16 - edge * 2, x + drawn, y + drawn, midW, midH);
}

export function icon(art: ShmupArt, name: string, x: number, y: number, size: number): void {
  image(art.ui.named(name), x, y, size, size);
}

/** The cabinet either side of the playfield, and the seams that frame it. */
export function drawSides(art: ShmupArt, fieldX: number, fieldRight: number): void {
  noStroke();
  fill("oklch(0.14 0.02 265)");
  rect(0, 0, fieldX, screen.height);
  rect(fieldRight, 0, screen.width - fieldRight, screen.height);
  fill("oklch(0.42 0.06 265)");
  rect(fieldX - 2, 0, 2, screen.height);
  rect(fieldRight, 0, 2, screen.height);
  void art;
}

export function centred(content: string, y: number, size: number, color: string = INK): void {
  noStroke();
  fill(color);
  textSize(size);
  textAlign(Align.Center);
  text(content, screen.width / 2, y);
  textAlign(Align.Left);
}
