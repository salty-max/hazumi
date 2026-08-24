/**
 * Dump a PNG still of each heavy gallery scene.
 *
 * Needs a real browser (WebGL2). Chromium once: `bunx playwright install chromium`.
 *
 *   bun run capture:examples
 *   bun run capture:examples raycaster
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const REPO = dirname(fileURLToPath(new URL(".", import.meta.url)));
const OUT = join(REPO, "examples/assets/previews");
const ORIGIN = "http://localhost:5199";
const CAPTURE_URL = `${ORIGIN}/capture.html`;

interface Preview {
  readonly slug: string;
  readonly warmupMs: number;
  /** Key held down for the whole capture, for a scene that waits for input. */
  readonly hold?: string;
}

/**
 * Every scene in the gallery, and how long to let it settle first.
 *
 * The gallery shows a still until you ask for the scene, so a missing one is a
 * blank card. Warmups are per scene because they are not warming up the same
 * thing: a particle system needs long enough to have particles, a physics pile
 * needs long enough to have fallen over, and a poster is finished on frame one.
 */
const PREVIEWS: readonly Preview[] = [
  { slug: "flow-field", warmupMs: 1600 },
  { slug: "orbits", warmupMs: 1400 },
  { slug: "mouse-trail", warmupMs: 600 },
  { slug: "particles", warmupMs: 1200 },
  { slug: "grid-waves", warmupMs: 400 },
  { slug: "static-poster", warmupMs: 300 },
  { slug: "type-specimen", warmupMs: 400 },
  { slug: "image-grid", warmupMs: 700 },
  { slug: "post-bloom", warmupMs: 500 },
  { slug: "petals", warmupMs: 400 },
  { slug: "tile-field", warmupMs: 900 },
  { slug: "characters", warmupMs: 700 },
  { slug: "blood-mage", warmupMs: 700 },
  { slug: "rigid-bodies", warmupMs: 2600 },
  { slug: "chain", warmupMs: 1600 },
  { slug: "bike", warmupMs: 4200, hold: "ArrowRight" },
  { slug: "starfall", warmupMs: 3200, hold: " " },
  { slug: "raycaster", warmupMs: 500 },
];

async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(CAPTURE_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForServer(timeoutMs: number, started = Date.now()): Promise<void> {
  return serverUp().then((up) => {
    if (up) return;
    if (Date.now() - started >= timeoutMs) {
      throw new Error(`Timed out waiting for ${CAPTURE_URL}`);
    }
    return delay(200).then(() => waitForServer(timeoutMs, started));
  });
}

function startVite(): ChildProcess {
  const child = spawn("bun", ["run", "--filter", "@hazumi/web", "dev"], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

async function main(): Promise<void> {
  const wanted = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith("-")));
  const jobs =
    wanted.size === 0 ? PREVIEWS : PREVIEWS.filter((preview) => wanted.has(preview.slug));
  if (jobs.length === 0) {
    throw new Error(
      `Unknown scene. Choose from: ${PREVIEWS.map((preview) => preview.slug).join(", ")}`,
    );
  }

  const alreadyRunning = await serverUp();
  const vite = alreadyRunning ? null : startVite();
  if (vite !== null) await waitForServer(30_000);

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: 720, height: 720 },
    });
    await page.goto(CAPTURE_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => typeof (globalThis as { capturePreview?: unknown }).capturePreview === "function",
    );

    await jobs.reduce(async (previous, job) => {
      await previous;
      process.stdout.write(`capturing ${job.slug}… `);
      const base64 = await page.evaluate(
        async ({
          slug,
          warmupMs,
          hold,
        }: {
          slug: string;
          warmupMs: number;
          hold: string | undefined;
        }): Promise<string> => {
          const capture = (
            globalThis as unknown as {
              capturePreview: (name: string, warmup: number, hold?: string) => Promise<string>;
            }
          ).capturePreview;
          return capture(slug, warmupMs, hold);
        },
        { slug: job.slug, warmupMs: job.warmupMs, hold: job.hold },
      );
      const file = join(OUT, `${job.slug}.png`);
      writeFileSync(file, Buffer.from(base64, "base64"));
      process.stdout.write(`${file}\n`);
    }, Promise.resolve());
  } finally {
    await browser.close();
    vite?.kill("SIGTERM");
  }
}

await main();
