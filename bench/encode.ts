/**
 * Measures the P1 encode criteria: throughput and zero steady-state allocation.
 *
 * Run with:  bun run bench/encode.ts
 */
import { CommandBuffer } from '@matter/graphics';

const SHAPES = 100_000;
const FRAMES = 200;

function encodeFrame(buf: CommandBuffer, t: number): void {
  buf.reset();
  buf.setFill(0.2, 0.6, 0.9, 1);
  for (let i = 0; i < SHAPES; i++) {
    const a = i * 0.001 + t;
    buf.circle(Math.cos(a) * 400 + 400, Math.sin(a) * 400 + 400, 3);
  }
}

const buf = new CommandBuffer();

// Warm up: let the buffer reach its steady capacity and let the JIT settle.
for (let f = 0; f < 20; f++) encodeFrame(buf, f * 0.01);
const growthsAfterWarmup = buf.growths;

Bun.gc(true);
const heapBefore = process.memoryUsage().heapUsed;
const start = performance.now();

for (let f = 0; f < FRAMES; f++) encodeFrame(buf, f * 0.01);

const elapsed = performance.now() - start;
const heapAfter = process.memoryUsage().heapUsed;

const perFrame = elapsed / FRAMES;
const heapDelta = heapAfter - heapBefore;

console.log(`shapes/frame        ${SHAPES.toLocaleString()}`);
console.log(`frames              ${FRAMES}`);
console.log(`buffer capacity     ${(buf.capacity * 4 / 1024 / 1024).toFixed(2)} MB`);
console.log(`growths (warmup)    ${growthsAfterWarmup}`);
console.log(`growths (steady)    ${buf.growths - growthsAfterWarmup}`);
console.log(`encode time/frame   ${perFrame.toFixed(3)} ms`);
console.log(`frame budget used   ${((perFrame / 16.67) * 100).toFixed(1)}% of 16.67 ms`);
console.log(`heap delta          ${(heapDelta / 1024).toFixed(1)} KB over ${FRAMES} frames`);
console.log(`shapes/second       ${((SHAPES * FRAMES) / (elapsed / 1000) / 1e6).toFixed(1)}M`);
