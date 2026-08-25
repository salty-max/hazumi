/**
 * Run the browser checks under a real GL context.
 *
 * The oracle in `run-compare.ts` diffs WebGL2 against Canvas2D, which checks
 * the rasteriser against the browser's own and cannot say anything about the
 * parts Canvas2D has no answer for: a shader chain, a material. This is the
 * other half — a real GL context, scenes whose correct output is arithmetic,
 * and assertions on the pixels that come back.
 *
 * Needs a real browser. Chromium once: `bunx playwright install chromium`.
 *
 *   bun run test:browser
 */
import { spawn, type ChildProcess } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const REPO = dirname(fileURLToPath(new URL(".", import.meta.url)));
const ORIGIN = "http://localhost:5199";
const PAGE = `${ORIGIN}/checks.html`;

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

async function serverUp(): Promise<boolean> {
  try {
    return (await fetch(PAGE)).ok;
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
    if (Date.now() - started >= timeoutMs) throw new Error(`Timed out waiting for ${PAGE}`);
    return delay(200).then(() => waitForServer(timeoutMs, started));
  });
}

function startVite(): ChildProcess {
  const child = spawn("bun", ["run", "--filter", "@hazumi/web", "dev"], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

async function main(): Promise<void> {
  const alreadyRunning = await serverUp();
  const vite = alreadyRunning ? null : startVite();
  if (vite !== null) await waitForServer(30_000);

  const browser = await chromium.launch();
  let failures = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(PAGE, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => typeof (globalThis as { runBrowserChecks?: unknown }).runBrowserChecks === "function",
    );

    const checks = (await page.evaluate(async () => {
      const run = (globalThis as unknown as { runBrowserChecks: () => Promise<Check[]> })
        .runBrowserChecks;
      return run();
    })) as Check[];

    for (const check of checks) {
      process.stdout.write(`${check.ok ? "  ok  " : "FAIL  "}${check.name}\n`);
      if (!check.ok) {
        failures++;
        process.stdout.write(`        ${check.detail}\n`);
      }
    }
    for (const error of errors) {
      failures++;
      process.stdout.write(`FAIL  page error: ${error}\n`);
    }
    process.stdout.write(`\n${checks.length - failures}/${checks.length} passed\n`);
  } finally {
    await browser.close();
    vite?.kill("SIGTERM");
  }

  if (failures > 0) process.exitCode = 1;
}

await main();
