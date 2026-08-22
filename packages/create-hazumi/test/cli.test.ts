import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { run } from "../src/cli";
import { HAZUMI_RANGE } from "../src/library";
import { findPackageRoot } from "../src/local";

function captureIo(input = ""): {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  stdoutText: () => string;
  stderrText: () => string;
} {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  stdout.on("data", (chunk: Buffer) => out.push(chunk));
  stderr.on("data", (chunk: Buffer) => err.push(chunk));
  if (input.length > 0) stdin.end(input);
  return {
    stdin,
    stdout,
    stderr,
    stdoutText: (): string => Buffer.concat(out).toString("utf8"),
    stderrText: (): string => Buffer.concat(err).toString("utf8"),
  };
}

describe("run", () => {
  const packageRoot = findPackageRoot(import.meta.url);

  test("--help prints usage and writes nothing", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-hazumi-cli-"));
    const io = captureIo();
    const code = await run(["--help"], {
      cwd,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      packageRoot,
    });
    expect(code).toBe(0);
    expect(io.stdoutText()).toContain("scaffold a Vite + Hazumi project");
    expect(io.stdoutText()).toContain("--template");
  });

  test("--yes --no-install scaffolds a sketch", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-hazumi-cli-"));
    const io = captureIo();
    const calls: string[] = [];
    const code = await run(["orbit", "--yes", "--no-install"], {
      cwd,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      packageRoot,
      env: { npm_config_user_agent: "bun/1.3.14" },
      install: async (directory, pm) => {
        calls.push(`${pm}:${directory}`);
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(cwd, "orbit", "package.json"), "utf8")) as {
      name: string;
      dependencies: { hazumi: string };
    };
    expect(pkg.name).toBe("orbit");
    expect(pkg.dependencies.hazumi).toBe(HAZUMI_RANGE);
    expect(readFileSync(join(cwd, "orbit", "src/main.ts"), "utf8")).toContain("time.elapsed");
    expect(io.stdoutText()).toContain("bun run dev");
    expect(io.stdoutText()).toContain("Zip that folder");
  });

  test("an absolute target is printed as-is", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-hazumi-cli-"));
    const target = mkdtempSync(join(tmpdir(), "create-hazumi-abs-"));
    const io = captureIo();
    const code = await run([target, "--yes", "--no-install"], {
      cwd,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      packageRoot,
      env: { npm_config_user_agent: "bun/1.3.14" },
      install: async () => 0,
    });
    expect(code).toBe(0);
    expect(io.stdoutText()).toMatch(/Wrote 7 files to \//);
    expect(io.stdoutText()).not.toMatch(/\.\.\//);
  });

  test("--local rewrites hazumi to a file: URL", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-hazumi-cli-"));
    const io = captureIo();
    const code = await run(["demo", "--yes", "--no-install", "--local", "--template", "game"], {
      cwd,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      packageRoot,
    });
    expect(code).toBe(0);
    const pkg = JSON.parse(readFileSync(join(cwd, "demo", "package.json"), "utf8")) as {
      dependencies: { hazumi: string };
    };
    expect(pkg.dependencies.hazumi.startsWith("file://")).toBe(true);
    expect(pkg.dependencies.hazumi.endsWith("/packages/hazumi")).toBe(true);
    const localPkg = JSON.parse(readFileSync(join(cwd, "demo", "package.json"), "utf8")) as {
      overrides: Record<string, string>;
    };
    expect(localPkg.overrides["@hazumi/math"]?.endsWith("/packages/math")).toBe(true);
    expect(readFileSync(join(cwd, "demo", "src/main.ts"), "utf8")).toContain("slideAabb");
  });

  test("installs when --yes does not pass --no-install", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-hazumi-cli-"));
    const io = captureIo();
    const calls: string[] = [];
    const code = await run(["ship", "--yes"], {
      cwd,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      packageRoot,
      env: { npm_config_user_agent: "npm/10.9.0 node/v22.0.0" },
      install: async (directory, pm) => {
        calls.push(`${pm}:${directory}`);
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(calls).toEqual([`npm:${join(cwd, "ship")}`]);
    expect(io.stdoutText()).toContain("npm run dev");
    expect(io.stdoutText()).not.toContain("npm install\n");
  });

  test("the wizard reads piped answers", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-hazumi-cli-"));
    const io = captureIo("arena\n2\nn\n");
    const calls: string[] = [];
    const code = await run([], {
      cwd,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      packageRoot,
      install: async (directory, pm) => {
        calls.push(`${pm}:${directory}`);
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(readFileSync(join(cwd, "arena", "src/main.ts"), "utf8")).toContain("update(dt: number)");
  });

  test("refuses to overwrite a non-empty directory", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-hazumi-cli-"));
    mkdirSync(join(cwd, "taken"));
    writeFileSync(join(cwd, "taken", "nope.txt"), "x");
    const io = captureIo();
    const code = await run(["taken", "--yes", "--no-install"], {
      cwd,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      packageRoot,
    });
    expect(code).toBe(1);
    expect(io.stderrText()).toContain("is not empty");
  });
});
