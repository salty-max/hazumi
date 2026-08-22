import { extractModule, type DocModule } from "./extract";
import type { Catalog, CatalogGroup, CatalogModule, RefGroup } from "./model";

export interface PackageSpec {
  readonly name: string;
  readonly path: string;
  readonly blurb: string;
  readonly group: RefGroup;
  readonly only?: readonly string[];
}

export const GROUPS: ReadonlyArray<{
  readonly id: RefGroup;
  readonly title: string;
  readonly lead: string;
}> = [
  { id: "scene", title: "Scene", lead: "" },
  { id: "library", title: "Library", lead: "" },
  { id: "backends", title: "Backends", lead: "" },
];

/** Scene API first, then supporting packages. Backends are allowlisted. */
export const PACKAGES: readonly PackageSpec[] = [
  {
    name: "hazumi/app",
    path: "packages/hazumi/dist/app.d.ts",
    blurb: "start() and the running app.",
    group: "scene",
  },
  {
    name: "hazumi/draw",
    path: "packages/hazumi/dist/draw.d.ts",
    blurb: "Shapes, paths, text, style, transforms.",
    group: "scene",
  },
  {
    name: "hazumi/input",
    path: "packages/hazumi/dist/input.d.ts",
    blurb: "Keys, pointer, wheel, gamepad.",
    group: "scene",
  },
  {
    name: "hazumi/scene",
    path: "packages/hazumi/dist/scene.d.ts",
    blurb: "screen, time, camera, random, noise.",
    group: "scene",
  },
  {
    name: "hazumi/assets",
    path: "packages/hazumi/dist/assets.d.ts",
    blurb: "Images, spritesheets, clips, tilemaps.",
    group: "scene",
  },
  {
    name: "hazumi/particles",
    path: "packages/hazumi/dist/particles.d.ts",
    blurb: "Pooled emitters. Circles, or paint your own.",
    group: "scene",
  },
  {
    name: "hazumi/audio",
    path: "packages/hazumi/dist/audio.d.ts",
    blurb: "Load, play, gain, voice pool.",
    group: "scene",
  },
  {
    name: "hazumi/physics",
    path: "packages/hazumi/dist/physics.d.ts",
    blurb: "Rigid-body host. The solver is in hazumi/math.",
    group: "scene",
  },
  {
    name: "hazumi/debug",
    path: "packages/hazumi/dist/debug.d.ts",
    blurb: "Stats HUD and body outlines.",
    group: "scene",
  },
  {
    name: "hazumi/math",
    path: "packages/hazumi/dist/math.d.ts",
    blurb: "vec2, collision, pathfinding, bodies, noise, easing.",
    group: "library",
  },
  {
    name: "hazumi/color",
    path: "packages/color/dist/index.d.ts",
    blurb: "OKLCH values.",
    group: "library",
  },
  {
    name: "hazumi/backends/webgl2",
    path: "packages/backend-webgl2/dist/index.d.ts",
    blurb: "WebGL2 renderer.",
    group: "backends",
    only: ["webgl2", "Webgl2Renderer", "Webgl2Options"],
  },
  {
    name: "hazumi/backends/canvas2d",
    path: "packages/backend-canvas2d/dist/index.d.ts",
    blurb: "Canvas 2D. Pixel checks and text fallback.",
    group: "backends",
    only: ["canvas2d", "Canvas2dRenderer", "Canvas2dOptions"],
  },
  {
    name: "hazumi/backends/svg",
    path: "packages/backend-svg/dist/index.d.ts",
    blurb: "SVG export.",
    group: "backends",
    only: ["toSvg", "SvgRenderer", "SvgOptions"],
  },
  {
    name: "hazumi/backends/headless",
    path: "packages/backend-headless/dist/index.d.ts",
    blurb: "Records commands for tests.",
    group: "backends",
    only: ["record", "recordCircles", "RecordedCommand", "RecordedCircle"],
  },
];

const STAR_FROM = /export\s+\*\s+from\s+["']([^"']+)["']/g;

export function packagePathFromSpecifier(spec: string): string | null {
  if (spec.startsWith("@hazumi/"))
    return `packages/${spec.slice("@hazumi/".length)}/dist/index.d.ts`;
  if (spec.startsWith("hazumi/"))
    return `packages/hazumi/dist/${spec.slice("hazumi/".length)}.d.ts`;
  return null;
}

export interface CatalogIo {
  read(relative: string): Promise<string | null>;
  glob(dir: string, pattern: string): Promise<readonly string[]>;
}

function filterModule(mod: DocModule, only: readonly string[] | undefined): DocModule {
  if (only === undefined) return mod;
  const allow = new Set(only);
  return { ...mod, entries: mod.entries.filter((entry) => allow.has(entry.name)) };
}

export async function loadCatalog(io: CatalogIo): Promise<Catalog> {
  const lookupLibrary = (
    await Promise.all(
      [
        "packages/hazumi/dist",
        "packages/math/dist",
        "packages/color/dist",
        "packages/core/dist",
        "packages/graphics/dist",
        "packages/audio/dist",
        "packages/physics/dist",
      ].map(async (dir) => {
        const files = await io.glob(dir, "**/*.d.ts");
        return Promise.all(files.map((path) => io.read(`${dir}/${path}`)));
      }),
    )
  )
    .flat()
    .filter((text): text is string => text !== null)
    .join("\n");

  const buckets = new Map<RefGroup, CatalogModule[]>(GROUPS.map((group) => [group.id, []]));

  const loaded = await Promise.all(
    PACKAGES.map(async (spec) => {
      let publicText = await io.read(spec.path);
      if (publicText === null) return null;

      const extraPaths = [...publicText.matchAll(STAR_FROM)]
        .map((match) => match[1])
        .filter((target): target is string => target !== undefined)
        .map(packagePathFromSpecifier)
        .filter((resolved): resolved is string => resolved !== null);
      const extras = (await Promise.all(extraPaths.map((path) => io.read(path)))).filter(
        (text): text is string => text !== null,
      );
      if (extras.length > 0) publicText = extras.join("\n");

      const lookup = `${publicText}\n${lookupLibrary}`;
      const mod = filterModule(extractModule(spec.name, lookup, publicText), spec.only);
      return { spec, mod };
    }),
  );

  for (const item of loaded) {
    if (item === null) continue;
    buckets.get(item.spec.group)?.push({
      name: item.mod.name,
      blurb: item.spec.blurb,
      entries: item.mod.entries,
    });
  }

  const groups: CatalogGroup[] = GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    lead: group.lead,
    modules: buckets.get(group.id) ?? [],
  })).filter((group) => group.modules.length > 0);

  const moduleCount = groups.reduce((sum, group) => sum + group.modules.length, 0);
  const symbolCount = groups.reduce(
    (sum, group) => sum + group.modules.reduce((inner, mod) => inner + mod.entries.length, 0),
    0,
  );

  return { groups, moduleCount, symbolCount };
}
