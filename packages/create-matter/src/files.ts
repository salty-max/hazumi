import { TemplateKind } from "./args";

export interface FilePlan {
  readonly path: string;
  readonly contents: string;
}

export interface ProjectFilesOptions {
  readonly name: string;
  readonly template: TemplateKind;
  readonly autoImport: boolean;
  readonly matterSpec: string;
  readonly vitePluginSpec: string;
  readonly packageManager: PackageManagerName;
  readonly overrides: Readonly<Record<string, string>>;
}

export type PackageManagerName = "bun" | "npm" | "pnpm" | "yarn";

export function projectFiles(options: ProjectFilesOptions): readonly FilePlan[] {
  const sceneFile = options.autoImport ? "src/main.scene.ts" : "src/main.ts";
  return [
    { path: "package.json", contents: packageJson(options) },
    { path: "tsconfig.json", contents: tsconfig(options.autoImport) },
    { path: "vite.config.ts", contents: viteConfig(options.autoImport) },
    { path: "index.html", contents: indexHtml(options.name, sceneFile) },
    { path: ".gitignore", contents: gitignore() },
    { path: "README.md", contents: readme(options) },
    { path: sceneFile, contents: sceneSource(options.template, options.autoImport) },
  ];
}

function packageJson(options: ProjectFilesOptions): string {
  const devDependencies: Record<string, string> = {
    typescript: "^5.9.0",
    vite: "^8.2.2",
  };
  if (options.autoImport) {
    devDependencies["@matter/vite-plugin"] = options.vitePluginSpec;
  }

  const body = {
    name: options.name,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      matter: options.matterSpec,
    },
    devDependencies,
  };
  let json: Record<string, unknown> = body;
  if (Object.keys(options.overrides).length > 0) {
    if (options.packageManager === "pnpm") {
      json = { ...body, pnpm: { overrides: options.overrides } };
    } else if (options.packageManager === "yarn") {
      json = { ...body, resolutions: options.overrides };
    } else {
      json = { ...body, overrides: options.overrides };
    }
  }
  return `${JSON.stringify(json, null, 2)}\n`;
}

function tsconfig(autoImport: boolean): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2023", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
      },
      include: autoImport ? ["src", "node_modules/@matter/vite-plugin/globals.d.ts"] : ["src"],
    },
    null,
    2,
  )}\n`;
}

function viteConfig(autoImport: boolean): string {
  if (autoImport) {
    return `import { matterAutoImport } from "@matter/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [matterAutoImport()],
});
`;
  }
  return `import { defineConfig } from "vite";

export default defineConfig({});
`;
}

function indexHtml(name: string, sceneFile: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(name)}</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: #0b0d12;
      }
      canvas {
        display: block;
        margin: 0 auto;
      }
    </style>
  </head>
  <body>
    <script type="module" src="/${sceneFile}"></script>
  </body>
</html>
`;
}

function gitignore(): string {
  return `node_modules
dist
.DS_Store
`;
}

function readme(options: ProjectFilesOptions): string {
  const kind = options.template === TemplateKind.Game ? "game" : "sketch";
  const run = runCommand(options.packageManager);
  const install = installCommand(options.packageManager);
  const extra =
    options.template === TemplateKind.Game
      ? "\nMove with WASD or the arrow keys. Simulation runs in `update`; `draw` interpolates.\n"
      : "\nEdit `draw` — that is the whole loop.\n";

  return `# ${options.name}

A Matter ${kind}.

\`\`\`bash
${install}
${run} dev
\`\`\`
${extra}
\`${run} build\` writes a static site to \`dist/\`. Zip that folder to ship the ${kind} — itch.io, GitHub Pages, Netlify, a USB stick.
`;
}

export function sceneSource(template: TemplateKind, autoImport: boolean): string {
  const imports = sceneImports(template, autoImport);
  const body = template === TemplateKind.Game ? GAME_BODY : SKETCH_BODY;
  return `${imports}\n${body}`;
}

function sceneImports(template: TemplateKind, autoImport: boolean): string {
  const lines = [
    `import { start } from "matter/app";`,
    `import { webgl2 } from "matter/backends/webgl2";`,
  ];
  if (template === TemplateKind.Game) {
    lines.push(`import { collision } from "matter/math";`);
  }
  if (!autoImport) {
    if (template === TemplateKind.Sketch) {
      lines.push(`import { background, circle, fill } from "matter/draw";`);
      lines.push(`import { screen, time } from "matter/scene";`);
    } else {
      lines.push(`import { background, circle, fill, rect } from "matter/draw";`);
      lines.push(`import { keyIsDown } from "matter/input";`);
      lines.push(`import { screen } from "matter/scene";`);
    }
  }
  return `${lines.join("\n")}\n`;
}

const SKETCH_BODY = `start({ backend: webgl2(), width: 800, height: 450 }, () => {
  return {
    draw(): void {
      background("oklch(0.16 0.02 250)");
      fill("oklch(0.72 0.16 250)");
      circle(screen.width / 2, screen.height / 2, 140 + Math.sin(time.elapsed) * 36);
    },
  };
});
`;

const GAME_BODY = `const SPEED = 220;
const SIZE = 28;

start({ backend: webgl2(), width: 800, height: 450, clock: { fixedStep: 1 / 60 } }, () => {
  const player = { x: 80, y: 210, prevX: 80, prevY: 210 };
  const walls = [
    collision.aabb(360, 140, 48, 180),
    collision.aabb(520, 80, 200, 36),
    collision.aabb(520, 330, 200, 36),
  ];

  return {
    update(dt: number): void {
      player.prevX = player.x;
      player.prevY = player.y;

      let dx = 0;
      let dy = 0;
      if (keyIsDown("a") || keyIsDown("A") || keyIsDown("ArrowLeft")) dx -= 1;
      if (keyIsDown("d") || keyIsDown("D") || keyIsDown("ArrowRight")) dx += 1;
      if (keyIsDown("w") || keyIsDown("W") || keyIsDown("ArrowUp")) dy -= 1;
      if (keyIsDown("s") || keyIsDown("S") || keyIsDown("ArrowDown")) dy += 1;

      const length = Math.hypot(dx, dy);
      if (length > 0) {
        dx = (dx / length) * SPEED * dt;
        dy = (dy / length) * SPEED * dt;
      }

      const box = collision.aabb(player.x, player.y, SIZE, SIZE);
      const moved = collision.slideAabb(box, dx, dy, walls);
      player.x += moved.x;
      player.y += moved.y;
      player.x = Math.min(Math.max(player.x, 0), screen.width - SIZE);
      player.y = Math.min(Math.max(player.y, 0), screen.height - SIZE);
    },
    draw(alpha: number): void {
      background("oklch(0.16 0.02 250)");
      fill("oklch(0.28 0.03 250)");
      for (const wall of walls) {
        rect(wall.minX, wall.minY, wall.maxX - wall.minX, wall.maxY - wall.minY);
      }
      const x = player.prevX + (player.x - player.prevX) * alpha;
      const y = player.prevY + (player.y - player.prevY) * alpha;
      fill("oklch(0.72 0.16 145)");
      circle(x + SIZE / 2, y + SIZE / 2, SIZE);
    },
  };
});
`;

export function runCommand(pm: PackageManagerName): string {
  if (pm === "npm") return "npm run";
  if (pm === "yarn") return "yarn";
  return `${pm} run`;
}

export function installCommand(pm: PackageManagerName): string {
  if (pm === "yarn") return "yarn";
  return `${pm} install`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
