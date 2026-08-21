/**
 * Two things this has to get right.
 *
 * Orientation: textures are uploaded flipped, so a sub-rectangle's v range is
 * inverted. Getting it backwards renders every sprite upside down or picks the
 * wrong row, and neither is caught by a draw-call count.
 *
 * Batching: a sheet exists so every sprite shares one texture. The whole point
 * is that the draw-call count stops scaling with the number of distinct
 * sprites.
 */
import { CommandBuffer } from '@matter/graphics';
import { Webgl2Renderer } from '@matter/backend-webgl2';
import { spritesheet } from 'matter';

const out = document.getElementById('out') as HTMLElement;

/** A 2x2 sheet with a distinct, nameable colour in each quadrant. */
function makeSheet(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const quadrants: ReadonlyArray<[number, number, string]> = [
    [0, 0, '#ff2d2d'],   // top-left    red
    [32, 0, '#22c55e'],  // top-right   green
    [0, 32, '#3b82f6'],  // bottom-left blue
    [32, 32, '#eab308'], // bottom-right yellow
  ];
  for (const [x, y, colour] of quadrants) {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, 32, 32);
  }
  return c;
}

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 400;
document.body.append(canvas);

const renderer = new Webgl2Renderer(canvas);
renderer.setViewport(400, 400);
const buffer = new CommandBuffer();

const sheetImage = makeSheet();
const sheet = spritesheet(sheetImage, { frame: [32, 32] });

function colourName(r: number, g: number, b: number): string {
  if (r > 180 && g < 100) return 'red';
  if (g > 150 && r < 120) return 'green';
  if (b > 180 && r < 120) return 'blue';
  if (r > 180 && g > 140) return 'yellow';
  return `rgb(${r},${g},${b})`;
}

/** Centre colour of a sprite drawn alone at a known place. */
function colourOfFrame(column: number, row: number): string {
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  const frame = sheet.at(column, row);
  buffer.imageRegion(sheetImage, 100, 100, 200, 200, frame.x, frame.y, frame.width, frame.height);
  renderer.render(buffer);

  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
  const px = new Uint8Array(4);
  // readPixels is bottom-up; the sprite centre is the canvas centre either way.
  gl.readPixels(200, 200, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return colourName(px[0] as number, px[1] as number, px[2] as number);
}

const orientation = [
  ['at(0,0) top-left', 'red', colourOfFrame(0, 0)],
  ['at(1,0) top-right', 'green', colourOfFrame(1, 0)],
  ['at(0,1) bottom-left', 'blue', colourOfFrame(0, 1)],
  ['at(1,1) bottom-right', 'yellow', colourOfFrame(1, 1)],
] as const;

/** Draw n sprites, cycling through every frame of the sheet. */
function drawCallsForSheet(n: number): number {
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  for (let i = 0; i < n; i++) {
    const frame = sheet.frame(i);
    buffer.imageRegion(
      sheetImage,
      (i % 20) * 20, Math.floor(i / 20) * 20, 18, 18,
      frame.x, frame.y, frame.width, frame.height,
    );
  }
  renderer.render(buffer);
  return renderer.stats.drawCalls;
}

const lines: string[] = ['ORIENTATION'];
let allCorrect = true;
for (const [label, expected, actual] of orientation) {
  const ok = expected === actual;
  if (!ok) allCorrect = false;
  lines.push(`  ${label.padEnd(24)} expected ${expected.padEnd(7)} got ${actual.padEnd(7)} ${ok ? 'OK' : 'WRONG'}`);
}

lines.push('', 'BATCHING');
lines.push(`  400 sprites, 4 distinct frames, one sheet   ${drawCallsForSheet(400)} draw call(s)`);
lines.push('  (before spritesheets: 400 draws across 8 images cost 400 calls)');
lines.push('', `STATUS: ${allCorrect ? 'ALL CORRECT' : 'ORIENTATION WRONG'}`);

out.textContent = lines.join('\n');
