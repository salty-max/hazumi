import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { UserError } from "./errors";
import { projectFiles, type ProjectFilesOptions } from "./files";

const ALLOWED_EXISTING = new Set([".git", ".hg", ".svn", ".DS_Store"]);

export interface ScaffoldResult {
  readonly directory: string;
  readonly name: string;
  readonly files: readonly string[];
}

export function scaffold(
  options: ProjectFilesOptions & { readonly directory: string },
): ScaffoldResult {
  assertDirectoryUsable(options.directory);
  mkdirSync(options.directory, { recursive: true });

  const files = projectFiles(options);
  const written: string[] = [];
  for (const file of files) {
    const dest = join(options.directory, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents);
    written.push(file.path);
  }

  return { directory: options.directory, name: options.name, files: written };
}

export function assertDirectoryUsable(directory: string): void {
  let stats: ReturnType<typeof statSync> | undefined;
  try {
    stats = statSync(directory);
  } catch {
    return;
  }

  if (stats === undefined) return;
  if (!stats.isDirectory()) {
    throw new UserError(`${directory} exists and is not a directory.`);
  }

  const entries = readdirSync(directory).filter((name) => !ALLOWED_EXISTING.has(name));
  if (entries.length > 0) {
    throw new UserError(`${directory} is not empty. Pick another name, or pass a new directory.`);
  }
}
