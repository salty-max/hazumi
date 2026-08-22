/**
 * P1 GPU criteria, measured in a real browser:
 *   - 100k instanced shapes inside the 60fps budget
 *   - one draw call per frame
 *   - no steady-state growth of the instance array
 *   - a forced context loss recovers without a reload
 *
 * Deliberately does NOT use requestAnimationFrame: rAF is suspended in hidden
 * tabs, and the metric of interest is CPU+GPU work per frame, not vsync pacing.
 * Each frame ends with a 1x1 readPixels, which forces the GPU to finish so the
 * timing covers actual rendering rather than just command submission.
 */
import { CommandBuffer } from "@hazumi/graphics";
import { Webgl2Renderer } from "@hazumi/backend-webgl2";

const SHAPES = 100_000;
const MEASURE_FRAMES = 120;
const WARMUP_FRAMES = 20;

const canvas = document.getElementById("c") as HTMLCanvasElement;
const out = document.getElementById("out") as HTMLElement;

const width = 900;
const height = 700;
canvas.width = width;
canvas.height = height;

const renderer = new Webgl2Renderer(canvas);
renderer.setViewport(width, height);
const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
const syncPixel = new Uint8Array(4);

const buffer = new CommandBuffer();

function encodeFrame(t: number): void {
  buffer.reset();
  buffer.background(0, 0, 0, 1);
  for (let i = 0; i < SHAPES; i++) {
    const a = i * 0.0007 + t;
    const r = 40 + (i % 300);
    buffer.setFill(0.35 + 0.3 * Math.sin(a), 0.55, 0.95 - 0.3 * Math.cos(a), 0.55);
    buffer.circle(width / 2 + Math.cos(a * 3.1) * r, height / 2 + Math.sin(a * 2.7) * r * 0.8, 1.6);
  }
}

/** Blocks until the GPU has finished the frame. */
function gpuSync(): void {
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
}

const results: Record<string, string> = {};
function log(label: string, value: string): void {
  results[label] = value;
  out.textContent = Object.entries(results)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function runFrames(count: number, t0: number, collect: number[] | null): number {
  let t = t0;
  for (let i = 0; i < count; i++) {
    t += 0.004;
    const started = performance.now();
    encodeFrame(t);
    renderer.render(buffer);
    gpuSync();
    if (collect !== null) collect.push(performance.now() - started);
  }
  return t;
}

function main(): void {
  let t = runFrames(WARMUP_FRAMES, 0, null);
  const growthsAtStart = renderer.stats.growths;

  const times: number[] = [];
  t = runFrames(MEASURE_FRAMES, t, times);

  const sorted = times.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] as number;
  const mean = times.reduce((a, b) => a + b, 0) / times.length;

  log("shapes", SHAPES.toLocaleString());
  log("frames measured", String(times.length));
  log("draw calls per frame", String(renderer.stats.drawCalls));
  log("instances per frame", renderer.stats.instances.toLocaleString());
  log("vertex upload per frame", `${(renderer.stats.uploadedBytes / 1_000_000).toFixed(2)} MB`);
  log("instance-array growths (steady)", String(renderer.stats.growths - growthsAtStart));
  log("frame mean", `${mean.toFixed(2)} ms`);
  log("frame median", `${median.toFixed(2)} ms`);
  log("frame p95", `${p95.toFixed(2)} ms`);
  log("60fps budget used (median)", `${((median / 16.67) * 100).toFixed(1)}%`);
  log("within 60fps budget", median < 16.67 ? "YES" : "NO");

  // --- forced context loss ---
  const ext = gl.getExtension("WEBGL_lose_context");
  if (ext === null) {
    log("context loss test", "SKIPPED (extension unavailable)");
    finish();
    return;
  }

  const realizationsBefore = renderer.realizations;
  ext.loseContext();

  // The lost/restored events are delivered asynchronously.
  setTimeout(() => {
    log("contextLost after loseContext", String(renderer.contextLost));
    ext.restoreContext();

    setTimeout(() => {
      // Draw again after restore to prove the pipeline is live.
      runFrames(2, t, null);

      log("contextLost after restore", String(renderer.contextLost));
      log("realizations", `${realizationsBefore} -> ${renderer.realizations}`);
      log("draw calls after restore", String(renderer.stats.drawCalls));
      log("instances after restore", renderer.stats.instances.toLocaleString());
      log(
        "recovered without reload",
        !renderer.contextLost &&
          renderer.realizations > realizationsBefore &&
          renderer.stats.drawCalls === 1
          ? "YES"
          : "NO",
      );
      finish();
    }, 600);
  }, 300);
}

function finish(): void {
  log("STATUS", "COMPLETE");
  (window as unknown as { benchResults: Record<string, string> }).benchResults = results;
}

main();
