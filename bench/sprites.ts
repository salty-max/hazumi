/**
 * Multiple sheets: does it work, and what does it cost?
 *
 * A game has several — tiles, a character, effects. They cannot share a
 * texture, and batching merges only adjacent instances, so the cost depends
 * entirely on the order draws are issued in.
 */
import { CommandBuffer } from '@matter/graphics';
import { Webgl2Renderer } from '@matter/backend-webgl2';
import { spritesheet, type Spritesheet } from 'matter';

const out = document.getElementById('out') as HTMLElement;

function makeSheet(hues: readonly string[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32 * hues.length;
  c.height = 32;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  for (const [i, colour] of hues.entries()) {
    ctx.fillStyle = colour;
    ctx.fillRect(i * 32, 0, 32, 32);
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

const tiles = spritesheet(makeSheet(['#ff2d2d', '#22c55e', '#3b82f6', '#eab308']), { frame: [32, 32] });
const hero = spritesheet(makeSheet(['#f472b6', '#a78bfa', '#38bdf8']), { frame: [32, 32] });
const fx = spritesheet(makeSheet(['#fbbf24', '#fb923c']), { frame: [32, 32] });

function place(i: number): [number, number] {
  return [(i % 20) * 20, Math.floor(i / 20) * 20];
}

function drawFrom(sheet: Spritesheet, index: number, i: number): void {
  const f = sheet.frame(index);
  const [x, y] = place(i);
  buffer.imageRegion(sheet.source, x, y, 18, 18, f.x, f.y, f.width, f.height);
}

/** Interleaved: the order a naive scene graph would produce. */
function interleaved(n: number): number {
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  const sheets = [tiles, hero, fx];
  for (let i = 0; i < n; i++) {
    drawFrom(sheets[i % sheets.length] as Spritesheet, i, i);
  }
  renderer.render(buffer);
  return renderer.stats.drawCalls;
}

/** Grouped: all of one sheet, then the next. */
function grouped(n: number): number {
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  const sheets = [tiles, hero, fx];
  let i = 0;
  for (const sheet of sheets) {
    for (let k = 0; k < n / sheets.length; k++, i++) drawFrom(sheet, k, i);
  }
  renderer.render(buffer);
  return renderer.stats.drawCalls;
}

out.textContent = [
  'THREE SHEETS, 300 SPRITES',
  `  interleaved (tiles, hero, fx, tiles, …)   ${interleaved(300)} draw calls`,
  `  grouped by sheet                          ${grouped(300)} draw calls`,
  '',
  'Multiple sheets work. The cost is entirely in draw order: one call per',
  'sheet when grouped, one call per sprite when interleaved.',
].join('\n');
