/**
 * Measures the P1 encode criteria: throughput and zero steady-state allocation.
 *
 * Run with:  bun run bench/encode.ts
 */
import { CommandBuffer } from "@matter/graphics";

const SHAPES = 100_000;
const FRAMES = 200;

/**
 * Two workloads, because they stress the encoder differently and the GPU bench
 * uses the second one. Quoting a flat-fill number next to a per-shape-fill GPU
 * number would be comparing different work.
 */
type Workload = "flat fill" | "fill per shape";

function encodeFrame(buf: CommandBuffer, t: number, workload: Workload): void {
  buf.reset();
  if (workload === "flat fill") buf.setFill(0.2, 0.6, 0.9, 1);

  for (let i = 0; i < SHAPES; i++) {
    const a = i * 0.001 + t;
    if (workload === "fill per shape") {
      buf.setFill(0.35 + 0.3 * Math.sin(a), 0.55, 0.95 - 0.3 * Math.cos(a), 0.55);
    }
    buf.circle(Math.cos(a) * 400 + 400, Math.sin(a) * 400 + 400, 3);
  }
}

/**
 * Timing and allocation are measured in separate passes.
 *
 * Calling `process.memoryUsage()` before a timed loop makes that loop roughly
 * five times slower in Bun — enough to turn a 0.95ms frame into 4.9ms. Reading
 * the heap and timing the encoder in one pass silently measures the reading,
 * not the encoder.
 */
function timeEncoding(workload: Workload): { perFrame: number; buf: CommandBuffer } {
  const buf = new CommandBuffer();

  // Warm up: let the buffer reach its steady capacity and the JIT settle.
  for (let f = 0; f < 20; f++) encodeFrame(buf, f * 0.01, workload);

  const start = performance.now();
  for (let f = 0; f < FRAMES; f++) encodeFrame(buf, f * 0.01, workload);
  return { perFrame: (performance.now() - start) / FRAMES, buf };
}

/** Untimed: the heap reads here are what would distort a timing pass. */
function measureAllocation(workload: Workload): { heapDelta: number; steadyGrowths: number } {
  const buf = new CommandBuffer();
  for (let f = 0; f < 20; f++) encodeFrame(buf, f * 0.01, workload);
  const growthsAfterWarmup = buf.growths;

  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  for (let f = 0; f < FRAMES; f++) encodeFrame(buf, f * 0.01, workload);
  const heapDelta = process.memoryUsage().heapUsed - heapBefore;

  return { heapDelta, steadyGrowths: buf.growths - growthsAfterWarmup };
}

function measure(workload: Workload): void {
  const { perFrame, buf } = timeEncoding(workload);
  const { heapDelta, steadyGrowths } = measureAllocation(workload);

  console.log(`\n--- ${workload} ---`);
  console.log(`shapes/frame        ${SHAPES.toLocaleString()}`);
  console.log(`frames              ${FRAMES}`);
  console.log(`buffer capacity     ${((buf.capacity * 4) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`growths (steady)    ${steadyGrowths}`);
  console.log(`encode time/frame   ${perFrame.toFixed(3)} ms`);
  console.log(`frame budget used   ${((perFrame / 16.67) * 100).toFixed(1)}% of 16.67 ms`);
  console.log(`heap delta          ${(heapDelta / 1024).toFixed(1)} KB over ${FRAMES} frames`);
  console.log(
    `shapes/second       ${((SHAPES * FRAMES) / ((perFrame * FRAMES) / 1000) / 1e6).toFixed(1)}M`,
  );
}

measure("flat fill");
measure("fill per shape");
