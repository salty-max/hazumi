import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { UserError } from "./errors";

interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
}

export function findPackageRoot(fromUrl: string = import.meta.url): string {
  let dir = dirname(fileURLToPath(fromUrl));
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = readJson(pkgPath);
      if (pkg.name === "create-matter") return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new UserError("Could not find the create-matter package root.");
    }
    dir = parent;
  }
}

export function readOwnVersion(packageRoot: string): string {
  const pkg = readJson(join(packageRoot, "package.json"));
  if (pkg.version === undefined || pkg.version.length === 0) {
    throw new UserError("create-matter package.json has no version.");
  }
  return pkg.version;
}

export interface LocalSpecs {
  readonly matterSpec: string;
  readonly vitePluginSpec: string;
  /**
   * Replaces `workspace:^` inside matter's package.json. A generated app is
   * not a workspace member, so bun cannot resolve that protocol without these.
   */
  readonly overrides: Readonly<Record<string, string>>;
}

/**
 * Point generated dependencies at this monorepo. Matter is unpublished, so
 * dogfooding has to go through file: rather than the registry.
 */
export function resolveLocalSpecs(packageRoot: string): LocalSpecs {
  const packagesDir = join(packageRoot, "..");
  const matterDir = join(packagesDir, "matter");
  const pluginDir = join(packagesDir, "vite-plugin");
  assertLocalPackage(matterDir, "matter");
  assertLocalPackage(pluginDir, "@matter/vite-plugin");
  return {
    matterSpec: fileSpec(matterDir),
    vitePluginSpec: fileSpec(pluginDir),
    overrides: workspaceOverrides(packagesDir, matterDir),
  };
}

function workspaceOverrides(
  packagesDir: string,
  matterDir: string,
): Readonly<Record<string, string>> {
  const matterPkg = readJson(join(matterDir, "package.json"));
  const overrides: Record<string, string> = {};
  for (const [name, spec] of Object.entries(matterPkg.dependencies ?? {})) {
    if (!spec.startsWith("workspace:")) continue;
    if (!name.startsWith("@matter/")) {
      throw new UserError(`--local does not know where to find workspace dependency "${name}".`);
    }
    const dir = join(packagesDir, name.slice("@matter/".length));
    assertLocalPackage(dir, name);
    overrides[name] = fileSpec(dir);
  }
  return overrides;
}

function fileSpec(dir: string): string {
  return pathToFileURL(dir).href;
}

function assertLocalPackage(dir: string, expectedName: string): void {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new UserError(
      `--local needs the Matter monorepo (${expectedName} next to create-matter).`,
    );
  }
  const pkg = readJson(pkgPath);
  if (pkg.name !== expectedName) {
    throw new UserError(
      `--local found ${pkgPath} but its name is "${pkg.name ?? "(missing)"}", not "${expectedName}".`,
    );
  }
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}
