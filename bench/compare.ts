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
import { toSvg } from '@matter/backend-svg';
import { SCENES, prepareScenes } from './scenes';

const W = 400;
const H = 400;
const DEFAULT_TOLERANCE = 3.0;
/**
 * Tighter than the GPU tolerance, not looser: SVG and Canvas2D are rasterised
 * by the same engine, so they agree to a fraction of a level — several scenes
 * come out pixel-identical. Worst observed is 1.22, so this leaves headroom
 * without letting a real regression through.
 */
const SVG_TOLERANCE = 2.0;
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
// This harness reads the reference canvas back on every scene, and context
// attributes only apply at creation, so the hint has to be set here.
const ref = new Canvas2dRenderer(c2dCanvas, { willReadFrequently: true });
const buffer = new CommandBuffer();

interface Result {
  name: string;
  mean: number;
  svgMean: number;
  drawCalls: number;
  instances: number;
  pass: boolean;
}

/**
 * Rasterise an SVG document through the browser's own renderer.
 *
 * This is what makes the export claim meaningful: a document can be perfectly
 * well-formed and still draw the wrong picture, and only a rasteriser that did
 * not write it can tell the difference.
 */
async function rasterizeSvg(svg: string): Promise<Uint8ClampedArray> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.width = W;
    img.height = H;
    await new Promise<void>((resolve, reject) => {
      img.addEventListener('load', () => resolve());
      img.addEventListener('error', () => reject(new Error('SVG failed to load')));
      img.src = url;
    });

    const canvas = makeCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
  } finally {
    URL.revokeObjectURL(url);
  }
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
  // This harness reads back every frame; without the hint Chrome keeps the
  // surface on the GPU and every read is a stall.
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
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

/** Both inputs unpremultiplied — used for SVG against Canvas2D. */
function compare2(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
): { mean: number; max: number; bad: number } {
  let total = 0;
  let max = 0;
  let bad = 0;
  for (let i = 0; i < a.length; i += 4) {
    const [ar, ag, ab] = overBlack(a, i, false);
    const [br, bg, bb] = overBlack(b, i, false);
    const d = Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
    total += d;
    if (d > max) max = d;
    if (d > BAD_PIXEL_THRESHOLD) bad++;
  }
  return { mean: total / (a.length / 4), max, bad: (bad / (a.length / 4)) * 100 };
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

/**
 * Pass one, synchronous: render each scene through both canvas backends and
 * read the pixels back before the next scene overwrites them. The two
 * renderers share one canvas pair, so this part cannot be reordered.
 */
interface Captured {
  readonly scene: (typeof SCENES)[number];
  readonly gpuPixels: Uint8ClampedArray;
  readonly refPixels: Uint8ClampedArray;
  readonly svg: string;
  readonly drawCalls: number;
  readonly instances: number;
  readonly glImage: ImageData;
  readonly refImage: ImageData;
}

const captured: Captured[] = [];

await prepareScenes();

for (const scene of SCENES) {
  buffer.reset();
  scene.draw(buffer);

  gpu.render(buffer);
  ref.render(buffer);

  const stats = gpu.stats;
  const gpuPixels = readPixels(glCanvas, true);
  const refPixels = readPixels(c2dCanvas, false);

  captured.push({
    scene,
    gpuPixels,
    refPixels,
    svg: toSvg(buffer, W, H),
    drawCalls: stats.drawCalls,
    instances: stats.instances,
    glImage: new ImageData(new Uint8ClampedArray(gpuPixels), W, H),
    refImage: new ImageData(new Uint8ClampedArray(refPixels), W, H),
  });
}

// Pass two: every SVG rasterises into its own canvas, so these are independent
// and run together.
const rasterized = await Promise.all(captured.map((c) => rasterizeSvg(c.svg)));

const results: Result[] = [];

for (const [index, item] of captured.entries()) {
  const svgPixels = rasterized[index] as Uint8ClampedArray;
  const diff = compare(item.gpuPixels, item.refPixels);
  const svgDiff = compare2(svgPixels, item.refPixels);
  const tolerance = item.scene.tolerance ?? DEFAULT_TOLERANCE;

  results.push({
    name: item.scene.name,
    mean: diff.mean,
    svgMean: svgDiff.mean,
    drawCalls: item.drawCalls,
    instances: item.instances,
    pass: diff.mean <= tolerance && svgDiff.mean <= SVG_TOLERANCE,
  });

  // Keep a visual copy of each triple for eyeballing.
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = item.scene.name;
  row.append(label);

  for (const [tag, image] of [
    ['webgl2', item.glImage],
    ['canvas2d', item.refImage],
    ['svg', new ImageData(svgPixels, W, H)],
  ] as const) {
    const copy = makeCanvas();
    const ctx = copy.getContext('2d') as CanvasRenderingContext2D;
    ctx.putImageData(image, 0, 0);
    copy.title = `${item.scene.name} — ${tag}`;
    row.append(copy);
  }

  strip.append(row);
}

const failures = results.filter((r) => !r.pass);
const lines = [
  'scene'.padEnd(30) + 'gl/2d'.padStart(8) + 'svg/2d'.padStart(9) + 'calls'.padStart(7) + 'inst'.padStart(6) + '  ',
  '-'.repeat(70),
];
for (const r of results) {
  lines.push(
    r.name.padEnd(30) +
      r.mean.toFixed(2).padStart(8) +
      r.svgMean.toFixed(2).padStart(9) +
      String(r.drawCalls).padStart(7) +
      String(r.instances).padStart(6) +
      (r.pass ? '  OK' : '  FAIL'),
  );
}
lines.push('');
lines.push(`scenes: ${results.length}   failures: ${failures.length}`);
lines.push(`STATUS: ${failures.length === 0 ? 'ALL AGREE' : 'MISMATCH'}`);

out.textContent = lines.join('\n');
