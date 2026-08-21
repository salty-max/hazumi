/**
 * Are sprites drawn the right way up?
 *
 * Two traps this checks for, both of which an earlier version missed:
 *
 *  - Solid-colour quadrants are identical when flipped, so they confirm *which*
 *    cell was sampled but not which way up it landed. The test image below has
 *    a distinct top, bottom and corner.
 *  - WebGL ignores UNPACK_FLIP_Y_WEBGL when the source is an ImageBitmap, so a
 *    texture uploaded from a canvas and one uploaded from a decoded PNG can end
 *    up with opposite orientation. Every case runs through both source types.
 */
import { CommandBuffer } from '@matter/graphics';
import type { ImageSource } from '@matter/graphics';
import { Webgl2Renderer } from '@matter/backend-webgl2';

const out = document.getElementById('out') as HTMLElement;

/** 64x64: top half red, bottom half blue, white marker in the top-left. */
function draw(target: CanvasRenderingContext2D): void {
  target.fillStyle = '#ff2d2d';
  target.fillRect(0, 0, 64, 32);
  target.fillStyle = '#3b82f6';
  target.fillRect(0, 32, 64, 32);
  target.fillStyle = '#ffffff';
  target.fillRect(2, 2, 8, 8);
}

function asCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  draw(c.getContext('2d') as CanvasRenderingContext2D);
  return c;
}

const canvas = document.createElement('canvas');
canvas.width = 200;
canvas.height = 200;
document.body.append(canvas);

const renderer = new Webgl2Renderer(canvas, { smoothing: false });
renderer.setViewport(200, 200);
const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
const buffer = new CommandBuffer();

/** Colour at a point, in screen coordinates with the origin top-left. */
function sample(sx: number, sy: number): string {
  const px = new Uint8Array(4);
  // readPixels is bottom-up, so flip the row we ask for.
  gl.readPixels(sx, canvas.height - 1 - sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const [r, g, b] = [px[0] as number, px[1] as number, px[2] as number];
  if (r > 150 && g > 150 && b > 150) return 'white';
  if (r > 150 && b < 100) return 'red';
  if (b > 150 && r < 100) return 'blue';
  return `rgb(${r},${g},${b})`;
}

const lines: string[] = [];
let failures = 0;

function check(label: string, got: string, want: string): void {
  const ok = got === want;
  if (!ok) failures++;
  lines.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${got.padEnd(7)} want ${want}`);
}

function run(sourceLabel: string, source: ImageSource): void {
  lines.push(`${sourceLabel}`);

  // The whole image.
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  buffer.image(source, 0, 0, 200, 200);
  renderer.render(buffer);
  check('image() top', sample(100, 30), 'red');
  check('image() bottom', sample(100, 170), 'blue');
  check('image() marker is top-left', sample(16, 16), 'white');

  // The whole image again, as a single region: identical content, so any
  // difference between this and the above is purely the UV convention.
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  buffer.imageRegion(source, 0, 0, 200, 200, 0, 0, 64, 64);
  renderer.render(buffer);
  check('imageRegion() whole, top', sample(100, 30), 'red');
  check('imageRegion() whole, marker top-left', sample(16, 16), 'white');

  // Sub-rectangles: the right rows, the right way up.
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  buffer.imageRegion(source, 0, 0, 200, 100, 0, 0, 64, 32);
  renderer.render(buffer);
  check('imageRegion() rows 0..32', sample(100, 50), 'red');
  check('imageRegion() rows 0..32, marker', sample(16, 16), 'white');

  buffer.reset();
  buffer.background(0, 0, 0, 1);
  buffer.imageRegion(source, 0, 0, 200, 100, 0, 32, 64, 32);
  renderer.render(buffer);
  check('imageRegion() rows 32..64', sample(100, 50), 'blue');

  lines.push('');
}

run('canvas source (UNPACK_FLIP_Y applies)', asCanvas());
run(
  'ImageBitmap source (UNPACK_FLIP_Y ignored)',
  await createImageBitmap(asCanvas()),
);

lines.push(failures === 0 ? 'STATUS: UPRIGHT' : `STATUS: ${failures} FAILURE(S)`);
out.textContent = lines.join('\n');
