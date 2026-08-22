import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { loadCatalog, packagePathFromSpecifier, type CatalogIo } from "../src/load-catalog";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

const io: CatalogIo = {
  async read(relative) {
    const file = Bun.file(REPO_ROOT + relative);
    return (await file.exists()) ? file.text() : null;
  },
  async glob(dir, pattern) {
    const cwd = REPO_ROOT + dir;
    if (!existsSync(cwd)) return [];
    const files: string[] = [];
    for await (const path of new Bun.Glob(pattern).scan({ cwd, onlyFiles: true })) {
      files.push(path);
    }
    return files;
  },
};

describe("packagePathFromSpecifier", () => {
  test("maps workspace packages to their dist declarations", () => {
    expect(packagePathFromSpecifier("@hazumi/math")).toBe("packages/math/dist/index.d.ts");
    expect(packagePathFromSpecifier("hazumi/draw")).toBe("packages/hazumi/dist/draw.d.ts");
    expect(packagePathFromSpecifier("lodash")).toBeNull();
  });
});

describe("loadCatalog", () => {
  test("groups scene first and allowlists webgl2", async () => {
    const catalog = await loadCatalog(io);
    expect(catalog.groups.map((group) => group.id)).toEqual(["scene", "library", "backends"]);
    expect(catalog.moduleCount).toBeGreaterThan(0);

    const math = catalog.groups
      .find((group) => group.id === "library")
      ?.modules.find((mod) => mod.name === "hazumi/math");
    expect(math?.entries.some((entry) => entry.name === "vec2" && entry.kind === "namespace")).toBe(
      true,
    );
    expect(math?.entries.some((entry) => entry.name === "add")).toBe(false);

    const webgl = catalog.groups
      .find((group) => group.id === "backends")
      ?.modules.find((mod) => mod.name === "hazumi/backends/webgl2");
    expect(webgl?.entries.map((entry) => entry.name).toSorted()).toEqual([
      "Webgl2Options",
      "Webgl2Renderer",
      "webgl2",
    ]);
  });
});
