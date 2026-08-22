import type { SceneFactory } from "matter/app";
import type { AudioApi } from "matter/audio";
import type { OverlayApi } from "matter/debug";
import type { PhysicsApi } from "matter/physics";
import type { Starter, StarterFile } from "./scenes";

export type PlaygroundApi = AudioApi & PhysicsApi & OverlayApi;

export interface EditableFile {
  readonly name: string;
  code: string;
}

const MODULE_SPECIFIER = /(from\s*|import\s*\(\s*|import\s+)(["'])(\.\.?\/[^"']+)\2/g;
const MATTER_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*(["'])(matter\/[^"']+)\2\s*;?/gm;
const MATTER_MODULES = new Set([
  "matter/assets",
  "matter/audio",
  "matter/color",
  "matter/debug",
  "matter/draw",
  "matter/input",
  "matter/math",
  "matter/physics",
  "matter/scene",
]);

function rewriteMatterImports(source: string): string {
  return source.replace(MATTER_IMPORT, (_match, names: string, _quote: string, module: string) => {
    if (!MATTER_MODULES.has(module)) throw new Error(`Unsupported playground import: ${module}`);
    const bindings = names
      .split(",")
      .map((name) => name.trim().replace(/\s+as\s+/, ": "))
      .filter((name) => name.length > 0)
      .join(", ");
    return `const { ${bindings} } = globalThis.__matterPlaygroundModules[${JSON.stringify(module)}];`;
  });
}

export function copyStarterFiles(starter: Starter): EditableFile[] {
  const files: readonly StarterFile[] = starter.files ?? [{ name: "scene.js", code: starter.code }];
  return files.map((file) => ({ name: file.name, code: file.code }));
}

export async function compileWorkspace(
  files: readonly EditableFile[],
): Promise<SceneFactory<PlaygroundApi>> {
  const sources = new Map(files.map((file) => [file.name, file.code]));
  const urls = new Map<string, string>();
  const building = new Set<string>();

  const buildModule = (name: string): string => {
    const existing = urls.get(name);
    if (existing !== undefined) return existing;
    const source = sources.get(name);
    if (source === undefined) throw new Error(`Unknown playground module: ${name}`);
    if (building.has(name)) throw new Error(`Circular playground import: ${name}`);
    building.add(name);

    const rewritten = rewriteMatterImports(source).replace(
      MODULE_SPECIFIER,
      (match, prefix: string, quote: string, specifier: string): string => {
        const resolved = new URL(specifier, `https://playground.local/${name}`).pathname.slice(1);
        if (!sources.has(resolved)) throw new Error(`Unknown playground module: ${specifier}`);
        return `${prefix}${quote}${buildModule(resolved)}${quote}`;
      },
    );
    const entryImports: string[] = [];
    const body =
      name === "scene.js"
        ? rewritten.replace(/^import\s+[^;]+;\s*$/gm, (statement): string => {
            entryImports.push(statement);
            return "";
          })
        : rewritten;
    const module =
      name === "scene.js"
        ? `${entryImports.join("\n")}\nexport default async (s) => {\n${body}\n};`
        : body;
    const url = URL.createObjectURL(new Blob([module], { type: "text/javascript" }));
    urls.set(name, url);
    building.delete(name);
    return url;
  };

  try {
    const entryUrl = buildModule("scene.js");
    const loaded = (await import(/* @vite-ignore */ entryUrl)) as {
      default: SceneFactory<PlaygroundApi>;
    };
    return loaded.default;
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}
