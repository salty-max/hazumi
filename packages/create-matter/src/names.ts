import { basename, dirname, resolve } from "node:path";

import { UserError } from "./errors";

const DISALLOWED = new Set([".", "..", "node_modules", "dist"]);

/**
 * Turn a directory argument or typed name into an npm-safe package name.
 * Spaces and punctuation become hyphens; the result is lowercase.
 */
export function toPackageName(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new UserError("Project name is empty.");
  }

  const name = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .replace(/-+/g, "-");

  if (name.length === 0) {
    throw new UserError(`"${input}" is not a usable project name.`);
  }
  if (DISALLOWED.has(name) || name.startsWith(".")) {
    throw new UserError(`"${name}" is not a usable project name.`);
  }
  return name;
}

export interface Target {
  /** Absolute directory to write into. */
  readonly directory: string;
  /** package.json "name". */
  readonly name: string;
}

/**
 * Resolve the output directory against `cwd`.
 *
 * `.` means the current directory; the package name is then the folder's
 * basename. Any other argument is created as a subdirectory.
 */
export function resolveTarget(cwd: string, directoryArg: string): Target {
  if (directoryArg === "." || directoryArg === "./") {
    const directory = resolve(cwd);
    return { directory, name: toPackageName(basename(directory)) };
  }

  const name = toPackageName(basename(directoryArg));
  const parent = dirname(resolve(cwd, directoryArg));
  return { directory: resolve(parent, name), name };
}
