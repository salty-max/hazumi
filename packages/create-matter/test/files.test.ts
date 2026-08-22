import { describe, expect, test } from "bun:test";

import { TemplateKind } from "../src/args";
import { projectFiles, sceneSource } from "../src/files";

describe("sceneSource", () => {
  test("sketch imports capabilities and draws a circle", () => {
    const source = sceneSource(TemplateKind.Sketch, false);
    expect(source).toContain('from "matter/app"');
    expect(source).toContain('from "matter/draw"');
    expect(source).toContain('from "matter/scene"');
    expect(source).toContain("time.elapsed");
    expect(source).not.toContain("update(");
  });

  test("game splits update and draw and slides against AABBs", () => {
    const source = sceneSource(TemplateKind.Game, false);
    expect(source).toContain("update(dt: number)");
    expect(source).toContain("draw(alpha: number)");
    expect(source).toContain("collision.slideAabb");
    expect(source).toContain("keyIsDown");
    expect(source).toContain('from "matter/math"');
  });

  test("auto-import still needs start, the backend, and math", () => {
    const sketch = sceneSource(TemplateKind.Sketch, true);
    expect(sketch).toContain('from "matter/app"');
    expect(sketch).toContain('from "matter/backends/webgl2"');
    expect(sketch).not.toContain('from "matter/draw"');
    expect(sketch).not.toContain('from "matter/scene"');

    const game = sceneSource(TemplateKind.Game, true);
    expect(game).toContain('from "matter/math"');
    expect(game).not.toContain('from "matter/draw"');
    expect(game).not.toContain('from "matter/input"');
  });
});

describe("projectFiles", () => {
  test("writes a Vite app with explicit imports by default", () => {
    const files = projectFiles({
      name: "orion",
      template: TemplateKind.Sketch,
      autoImport: false,
      matterSpec: "^0.1.0",
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
      dependencies: { matter: string };
      devDependencies: Record<string, string>;
      overrides?: Record<string, string>;
    };
    expect(pkg.dependencies.matter).toBe("^0.1.0");
    expect(pkg.devDependencies["@matter/vite-plugin"]).toBeUndefined();
    expect(pkg.overrides).toBeUndefined();
    expect(files.find((file) => file.path === "vite.config.ts")?.contents).not.toContain(
      "matterAutoImport",
    );
    expect(files.find((file) => file.path === "index.html")?.contents).toContain("/src/main.ts");
  });

  test("auto-import names the scene and wires the plugin", () => {
    const files = projectFiles({
      name: "orion",
      template: TemplateKind.Game,
      autoImport: true,
      matterSpec: "file:///repo/packages/matter",
      vitePluginSpec: "file:///repo/packages/vite-plugin",
      packageManager: "npm",
      overrides: { "@matter/math": "file:///repo/packages/math" },
    });
    const paths = files.map((file) => file.path);
    expect(paths).toContain("src/main.scene.ts");
    expect(paths).not.toContain("src/main.ts");

    const pkg = JSON.parse(files[0]!.contents) as {
      dependencies: { matter: string };
      devDependencies: Record<string, string>;
      overrides: Record<string, string>;
    };
    expect(pkg.dependencies.matter).toBe("file:///repo/packages/matter");
    expect(pkg.devDependencies["@matter/vite-plugin"]).toBe("file:///repo/packages/vite-plugin");
    expect(pkg.overrides["@matter/math"]).toBe("file:///repo/packages/math");
    expect(files.find((file) => file.path === "vite.config.ts")?.contents).toContain(
      "matterAutoImport",
    );
    expect(files.find((file) => file.path === "index.html")?.contents).toContain(
      "/src/main.scene.ts",
    );
    expect(files.find((file) => file.path === "README.md")?.contents).toContain("npm run build");
  });
});
