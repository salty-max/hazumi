import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UserError } from "../src/errors";
import { findPackageRoot, readOwnVersion, resolveLocalSpecs } from "../src/local";

describe("findPackageRoot", () => {
  test("walks up from this test file to create-matter", () => {
    const root = findPackageRoot(import.meta.url);
    expect(root.endsWith("packages/create-matter")).toBe(true);
    expect(readOwnVersion(root)).toBe("0.1.0");
  });
});

describe("resolveLocalSpecs", () => {
  test("points at sibling packages in this repo", () => {
    const root = findPackageRoot(import.meta.url);
    const specs = resolveLocalSpecs(root);
    expect(specs.matterSpec.startsWith("file://")).toBe(true);
    expect(specs.matterSpec.endsWith("/packages/matter")).toBe(true);
    expect(specs.vitePluginSpec.endsWith("/packages/vite-plugin")).toBe(true);
    expect(specs.overrides["@matter/math"]?.endsWith("/packages/math")).toBe(true);
    expect(specs.overrides["@matter/core"]?.endsWith("/packages/core")).toBe(true);
    expect(specs.overrides["@matter/backend-webgl2"]?.endsWith("/packages/backend-webgl2")).toBe(
      true,
    );
  });

  test("fails when the siblings are not the Matter packages", () => {
    const dir = mkdtempSync(join(tmpdir(), "create-matter-local-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "create-matter", version: "0.0.0" }),
    );
    mkdirSync(join(dir, ".."), { recursive: true });
    expect(() => resolveLocalSpecs(dir)).toThrow(UserError);
  });
});
