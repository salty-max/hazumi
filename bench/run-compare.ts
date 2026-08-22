/**
 * Run the backend-agreement harness and fail loudly when the backends disagree.
 *
 * This is the automated half of `bench/compare.html`. The page itself is still
 * the thing to open when a scene looks wrong and you want to *see* both
 * renders; this drives the same page in headless Chromium and turns the result
 * into an exit code, so agreement can gate a merge instead of relying on
 * somebody remembering to look.
 *
 * Headless Chromium rasterises WebGL2 through SwiftShader, so this needs no GPU
 * and runs on an ordinary CI box. That is worth stating plainly, because the
 * repo previously assumed the opposite and left the harness unautomated for it.
 *
 * The bundle is rebuilt every run on purpose: `bench/dist/*.js` inlines the
 * packages, so a stale bundle happily reports that a bug you just fixed is
 * still there — or worse, that one you just introduced is not.
 *
 *   bun run compare
 *
 * Chromium once: `bunx playwright install chromium`.
 */
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const REPO = dirname(fileURLToPath(new URL(".", import.meta.url)));

interface Result {
  readonly name: string;
  readonly mean: number;
  readonly svgMean: number;
  readonly drawCalls: number;
  readonly instances: number;
  readonly pass: boolean;
}

interface Comparison {
  readonly results: readonly Result[];
  readonly failures: number;
  readonly table: string;
}

function build(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "bun",
      ["build", "bench/compare.ts", "--outfile", "bench/dist/compare.js", "--target", "browser"],
      { cwd: REPO, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Bundling bench/compare.ts failed:\n${stderr}`));
    });
  });
}

/**
 * Serve the repo root on a free port, so /bench and /examples assets resolve.
 *
 * Port 0 rather than a fixed one: the dev server may already hold the usual
 * port, and binding over it silently serves the web app instead of the harness
 * — which looks exactly like the harness hanging.
 */
function serve(): { origin: string; stop: () => void } {
  const server = Bun.serve({
    port: 0,
    fetch(request): Response | Promise<Response> {
      const url = new URL(request.url);
      const requested = url.pathname === "/" ? "/bench/compare.html" : url.pathname;
      // Resolve before serving: without this, `/../../etc/passwd` escapes the root.
      const resolved = new URL(`.${requested}`, `file://${REPO}/`).pathname;
      if (!resolved.startsWith(REPO)) return new Response("Forbidden", { status: 403 });
      const file = Bun.file(resolved);
      return file
        .exists()
        .then((exists) =>
          exists ? new Response(file) : new Response("Not found", { status: 404 }),
        );
    },
  });
  return {
    origin: `http://localhost:${server.port}`,
    stop: (): void => void server.stop(true),
  };
}

async function main(): Promise<number> {
  await build();
  const server = serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const crashes: string[] = [];
    page.on("pageerror", (error) => crashes.push(String(error)));

    await page.goto(`${server.origin}/bench/compare.html`, { waitUntil: "load" });
    await page.waitForFunction(
      () => (globalThis as { comparison?: unknown }).comparison !== undefined,
      undefined,
      { timeout: 60_000 },
    );

    const comparison = (await page.evaluate(
      () => (globalThis as unknown as { comparison: Comparison }).comparison,
    )) as Comparison;

    console.log(comparison.table);
    for (const crash of crashes) console.error(`page error: ${crash}`);

    if (comparison.results.length === 0) {
      console.error("\nThe harness produced no scenes, which means it did not run.");
      return 1;
    }
    if (comparison.failures > 0 || crashes.length > 0) {
      console.error(`\n${comparison.failures} scene(s) disagree between backends.`);
      return 1;
    }
    console.log(`\n${comparison.results.length} scenes agree.`);
    return 0;
  } finally {
    await browser.close();
    server.stop();
  }
}

process.exitCode = await main();
