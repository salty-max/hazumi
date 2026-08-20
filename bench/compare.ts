/**
 * P3 acceptance: WebGL2 and Canvas2D must agree on every primitive.
 *
 * Canvas2D is the reference. Two independent rasterisers never match
 * bit-for-bit on antialiased edges, so the measure is mean per-channel
 * difference over the whole frame plus the share of pixels that differ
 * noticeably — enough to catch a wrong stroke width, a flipped painter order
 * or a broken transform, without failing on a half-intensity edge pixel.
 */
import { CommandBuffer } from '@matter/graphics';
import { Webgl2Renderer } from '@matter/backend-webgl2';
import { Canvas2dRenderer } from '@matter/backend-canvas2d';
import { SCENES } from './scenes';

const W = 400;
const H = 400;
const DEFAULT_TOLERANCE = 3.0;
const BAD_PIXEL_THRESHOLD = 48;

const out = document.getElementById('out') as HTMLElement;
const strip = document.getElementById('strip') as HTMLElement;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

const glCanvas = makeCanvas();
const c2dCanvas = makeCanvas();

const gpu = new Webgl2Renderer(glCanvas);
const ref = new Canvas2dRenderer(c2dCanvas);
const buffer = new CommandBuffer();

interface Result {
  name: string;
  mean: number;
  max: number;
  badPixels: number;
  drawCalls: number;
  instances: number;
  pass: boolean;
}

function readPixels(canvas: HTMLCanvasElement, webgl: boolean): Uint8ClampedArray {
  if (webgl) {
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
    const raw = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    // WebGL reads bottom-up; flip to match Canvas2D's top-down order.
    const flipped = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4;
      flipped.set(raw.subarray(src, src + W * 4), y * W * 4);
    }
    return flipped;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return ctx.getImageData(0, 0, W, H).data;
}

/**
 * Composite over black, accounting for how each source stores colour.
 *
 * The WebGL context is created with premultipliedAlpha, so readPixels already
 * returns colour scaled by alpha. Canvas2D's getImageData does not — it hands
 * back straight alpha. Treating both the same way double-multiplies the GPU
 * side and makes every translucent scene look like a renderer bug.
 */
function overBlack(
  data: Uint8ClampedArray,
  i: number,
  premultiplied: boolean,
): [number, number, number] {
  const r = data[i] as number;
  const g = data[i + 1] as number;
  const b = data[i + 2] as number;
  if (premultiplied) return [r, g, b];
  const a = (data[i + 3] as number) / 255;
  return [r * a, g * a, b * a];
}

function compare(
  gpuPixels: Uint8ClampedArray,
  refPixels: Uint8ClampedArray,
): { mean: number; max: number; bad: number } {
  let total = 0;
  let max = 0;
  let bad = 0;

  for (let i = 0; i < gpuPixels.length; i += 4) {
    const [ar, ag, ab] = overBlack(gpuPixels, i, true);
    const [br, bg, bb] = overBlack(refPixels, i, false);
    const d = Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
    total += d;
    if (d > max) max = d;
    if (d > BAD_PIXEL_THRESHOLD) bad++;
  }

  return {
    mean: total / (gpuPixels.length / 4),
    max,
    bad: (bad / (gpuPixels.length / 4)) * 100,
  };
}

const results: Result[] = [];

for (const scene of SCENES) {
  buffer.reset();
  scene.draw(buffer);

  gpu.render(buffer);
  ref.render(buffer);

  const diff = compare(readPixels(glCanvas, true), readPixels(c2dCanvas, false));
  const tolerance = scene.tolerance ?? DEFAULT_TOLERANCE;
  const stats = gpu.stats;

  results.push({
    name: scene.name,
    mean: diff.mean,
    max: diff.max,
    badPixels: diff.bad,
    drawCalls: stats.drawCalls,
    instances: stats.instances,
    pass: diff.mean <= tolerance,
  });

  // Keep a visual copy of each pair for eyeballing.
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = scene.name;
  row.append(label);
  for (const [tag, src] of [['webgl2', glCanvas], ['canvas2d', c2dCanvas]] as const) {
    const copy = makeCanvas();
    const ctx = copy.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(src, 0, 0);
    copy.title = `${scene.name} — ${tag}`;
    row.append(copy);
  }
  strip.append(row);
}

const failures = results.filter((r) => !r.pass);
const lines = [
  'scene'.padEnd(28) + 'mean'.padStart(7) + 'max'.padStart(6) + 'bad%'.padStart(8) + 'calls'.padStart(7) + 'inst'.padStart(6) + '  ',
  '-'.repeat(70),
];
for (const r of results) {
  lines.push(
    r.name.padEnd(28) +
      r.mean.toFixed(2).padStart(7) +
      r.max.toFixed(0).padStart(6) +
      r.badPixels.toFixed(2).padStart(8) +
      String(r.drawCalls).padStart(7) +
      String(r.instances).padStart(6) +
      (r.pass ? '  OK' : '  FAIL'),
  );
}
lines.push('');
lines.push(`scenes: ${results.length}   failures: ${failures.length}`);
lines.push(`STATUS: ${failures.length === 0 ? 'ALL AGREE' : 'MISMATCH'}`);

out.textContent = lines.join('\n');
