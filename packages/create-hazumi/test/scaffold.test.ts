import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TemplateKind } from "../src/args";
import { UserError } from "../src/errors";
import { scaffold } from "../src/scaffold";

function emptyDir(): string {
  return mkdtempSync(join(tmpdir(), "create-hazumi-"));
}

describe("scaffold", () => {
  test("writes the sketch files", () => {
    const directory = emptyDir();
    const result = scaffold({
      directory,
      name: "orion",
      template: TemplateKind.Sketch,
      autoImport: false,
      hazumiSpec: "^0.1.0",
      vitePluginSpec: "^0.1.0",
      packageManager: "bun",
      overrides: {},
    });
    expect(result.files).toContain("src/main.ts");
    expect(result.files).toContain("package.json");
    const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
      name: string;
    };
    expect(pkg.name).toBe("orion");
    expect(readFileSync(join(directory, "src/main.ts"), "utf8")).toContain("time.elapsed");
  });

  test("refuses a non-empty directory", () => {
    const directory = emptyDir();
    writeFileSync(join(directory, "readme.txt"), "nope");
    expect(() =>
      scaffold({
        directory,
        name: "orion",
        template: TemplateKind.Sketch,
        autoImport: false,
        hazumiSpec: "^0.1.0",
        vitePluginSpec: "^0.1.0",
        packageManager: "bun",
        overrides: {},
      }),
    ).toThrow(UserError);
  });

  test("allows a directory that only contains git metadata", () => {
    const directory = emptyDir();
    mkdirSync(join(directory, ".git"));
    writeFileSync(join(directory, ".DS_Store"), "");
    const result = scaffold({
      directory,
      name: "orion",
      template: TemplateKind.Game,
      autoImport: false,
      hazumiSpec: "^0.1.0",
      vitePluginSpec: "^0.1.0",
      packageManager: "bun",
      overrides: {},
    });
    expect(result.files).toContain("src/main.ts");
  });
});
