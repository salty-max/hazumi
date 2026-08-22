import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UserError } from "../src/errors";
import { findPackageRoot, readOwnVersion, resolveLocalSpecs } from "../src/local";

describe("findPackageRoot", () => {
  test("walks up from this test file to create-hazumi", () => {
    const root = findPackageRoot(import.meta.url);
    expect(root.endsWith("packages/create-hazumi")).toBe(true);
    expect(readOwnVersion(root)).toBe("0.1.0");
  });
});

describe("resolveLocalSpecs", () => {
  test("points at sibling packages in this repo", () => {
    const root = findPackageRoot(import.meta.url);
    const specs = resolveLocalSpecs(root);
    expect(specs.hazumiSpec.startsWith("file://")).toBe(true);
    expect(specs.hazumiSpec.endsWith("/packages/hazumi")).toBe(true);
    expect(specs.vitePluginSpec.endsWith("/packages/vite-plugin")).toBe(true);
    expect(specs.overrides["@hazumi/math"]?.endsWith("/packages/math")).toBe(true);
    expect(specs.overrides["@hazumi/core"]?.endsWith("/packages/core")).toBe(true);
    expect(specs.overrides["@hazumi/backend-webgl2"]?.endsWith("/packages/backend-webgl2")).toBe(
      true,
    );
  });

  test("fails when the siblings are not the Hazumi packages", () => {
    const dir = mkdtempSync(join(tmpdir(), "create-hazumi-local-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "create-hazumi", version: "0.0.0" }),
    );
    mkdirSync(join(dir, ".."), { recursive: true });
    expect(() => resolveLocalSpecs(dir)).toThrow(UserError);
  });
});
