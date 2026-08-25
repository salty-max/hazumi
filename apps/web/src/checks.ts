/**
 * Browser harness for `bun run test:browser`.
 *
 * Not linked from the site — Vite serves it as /checks.html in dev, and
 * `bench/run-checks.ts` drives it under Chromium.
 */
import { materialChecks } from "./checks/materials";
import { passChecks } from "./checks/passes";
import type { Check } from "./checks/harness";

async function runBrowserChecks(): Promise<readonly Check[]> {
  return [...(await passChecks()), ...(await materialChecks())];
}

(globalThis as unknown as { runBrowserChecks: typeof runBrowserChecks }).runBrowserChecks =
  runBrowserChecks;
