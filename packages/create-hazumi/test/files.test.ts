import { describe, expect, test } from "bun:test";

import { TemplateKind } from "../src/args";
import { projectFiles, sceneSource } from "../src/files";

describe("sceneSource", () => {
  test("sketch imports capabilities and draws a circle", () => {
    const source = sceneSource(TemplateKind.Sketch, false);
    expect(source).toContain('from "hazumi/app"');
    expect(source).toContain('from "hazumi/draw"');
    expect(source).toContain("oklch(0.16, 0.02, 250)");
    expect(source).not.toContain('"oklch(');
    expect(source).toContain('from "hazumi/scene"');
    expect(source).toContain("time.elapsed");
    expect(source).not.toContain("update(");
  });

  test("game splits update and draw and slides against AABBs", () => {
    const source = sceneSource(TemplateKind.Game, false);
    expect(source).toContain("update(dt: number)");
    expect(source).toContain("draw(alpha: number)");
    expect(source).toContain("collision.slideAabb");
    expect(source).toContain("keyIsDown");
    expect(source).toContain('from "hazumi/math"');
    expect(source).toContain('from "hazumi/particles"');
    expect(source).toContain("dust.emit");
  });

  test("auto-import still needs start, the backend, and math", () => {
    const sketch = sceneSource(TemplateKind.Sketch, true);
    expect(sketch).toContain('from "hazumi/app"');
    expect(sketch).toContain('from "hazumi/backends/webgl2"');
    expect(sketch).not.toContain('from "hazumi/draw"');
    expect(sketch).not.toContain('from "hazumi/scene"');

    const game = sceneSource(TemplateKind.Game, true);
    expect(game).toContain('from "hazumi/math"');
    expect(game).not.toContain('from "hazumi/draw"');
    expect(game).not.toContain('from "hazumi/input"');
    expect(game).not.toContain('from "hazumi/particles"');
    expect(game).toContain("particles(");
  });
});

describe("projectFiles", () => {
  test("writes a Vite app with explicit imports by default", () => {
    const files = projectFiles({
      name: "orion",
      template: TemplateKind.Sketch,
      autoImport: false,
      hazumiSpec: "^0.1.0",
      vitePluginSpec: "^0.1.0",
      packageManager: "bun",
      overrides: {},
    });
    const paths = files.map((file) => file.path);
    expect(paths).toEqual([
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "index.html",
      ".gitignore",
      "README.md",
      "src/main.ts",
    ]);

    const pkg = JSON.parse(files[0]!.contents) as {
      dependencies: { hazumi: string };
      devDependencies: Record<string, string>;
      overrides?: Record<string, string>;
    };
    expect(pkg.dependencies.hazumi).toBe("^0.1.0");
    expect(pkg.devDependencies["@hazumi/vite-plugin"]).toBeUndefined();
    expect(pkg.overrides).toBeUndefined();
    expect(files.find((file) => file.path === "vite.config.ts")?.contents).not.toContain(
      "hazumiAutoImport",
    );
    expect(files.find((file) => file.path === "index.html")?.contents).toContain("/src/main.ts");
  });

  test("auto-import names the scene and wires the plugin", () => {
    const files = projectFiles({
      name: "orion",
      template: TemplateKind.Game,
      autoImport: true,
      hazumiSpec: "file:///repo/packages/hazumi",
      vitePluginSpec: "file:///repo/packages/vite-plugin",
      packageManager: "npm",
      overrides: { "@hazumi/math": "file:///repo/packages/math" },
    });
    const paths = files.map((file) => file.path);
    expect(paths).toContain("src/main.scene.ts");
    expect(paths).not.toContain("src/main.ts");

    const pkg = JSON.parse(files[0]!.contents) as {
      dependencies: { hazumi: string };
      devDependencies: Record<string, string>;
      overrides: Record<string, string>;
    };
    expect(pkg.dependencies.hazumi).toBe("file:///repo/packages/hazumi");
    expect(pkg.devDependencies["@hazumi/vite-plugin"]).toBe("file:///repo/packages/vite-plugin");
    expect(pkg.overrides["@hazumi/math"]).toBe("file:///repo/packages/math");
    expect(files.find((file) => file.path === "tsconfig.json")?.contents).toContain("globals.d.ts");
    expect(files.find((file) => file.path === "vite.config.ts")?.contents).toContain(
      "hazumiAutoImport",
    );
    expect(files.find((file) => file.path === "index.html")?.contents).toContain(
      "/src/main.scene.ts",
    );
    expect(files.find((file) => file.path === "README.md")?.contents).toContain("npm run build");
  });

  test("pnpm --local writes pnpm.overrides", () => {
    const files = projectFiles({
      name: "orion",
      template: TemplateKind.Sketch,
      autoImport: false,
      hazumiSpec: "file:///repo/packages/hazumi",
      vitePluginSpec: "file:///repo/packages/vite-plugin",
      packageManager: "pnpm",
      overrides: { "@hazumi/math": "file:///repo/packages/math" },
    });
    const pkg = JSON.parse(files[0]!.contents) as {
      overrides?: Record<string, string>;
      pnpm?: { overrides: Record<string, string> };
      resolutions?: Record<string, string>;
    };
    expect(pkg.overrides).toBeUndefined();
    expect(pkg.pnpm?.overrides["@hazumi/math"]).toBe("file:///repo/packages/math");
  });

  test("yarn --local writes resolutions", () => {
    const files = projectFiles({
      name: "orion",
      template: TemplateKind.Sketch,
      autoImport: false,
      hazumiSpec: "file:///repo/packages/hazumi",
      vitePluginSpec: "file:///repo/packages/vite-plugin",
      packageManager: "yarn",
      overrides: { "@hazumi/math": "file:///repo/packages/math" },
    });
    const pkg = JSON.parse(files[0]!.contents) as {
      overrides?: Record<string, string>;
      resolutions?: Record<string, string>;
    };
    expect(pkg.overrides).toBeUndefined();
    expect(pkg.resolutions?.["@hazumi/math"]).toBe("file:///repo/packages/math");
  });
});
