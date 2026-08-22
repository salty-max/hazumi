/**
 * The auto-import transform.
 *
 * Kept apart from the plugin wrapper so it is a pure string-to-string function
 * and can be tested without a bundler.
 */

export interface CapabilityModule {
  readonly module: string;
  readonly members: readonly string[];
}

/**
 * Names each capability subpath exports that a global-style scene may write
 * without importing. Error classes are omitted: they are for catch sites, not
 * for drawing.
 *
 * Live values are the objects (`screen`, `time`, `input`), not the old p5-style
 * scalars (`width`, `t`, `pmouseX`). Style scoping is `scoped`.
 */
export const CAPABILITY_MODULES: readonly CapabilityModule[] = [
  {
    module: "matter/draw",
    members: [
      "Align",
      "Baseline",
      "Blend",
      "background",
      "oklch",
      "rgb",
      "fill",
      "noFill",
      "stroke",
      "noStroke",
      "strokeWeight",
      "blendMode",
      "beginShape",
      "vertex",
      "quadraticVertex",
      "bezierVertex",
      "endShape",
      "image",
      "textFont",
      "textSize",
      "textAlign",
      "text",
      "circle",
      "ellipse",
      "rect",
      "square",
      "line",
      "point",
      "push",
      "pop",
      "translate",
      "rotate",
      "scale",
      "scoped",
    ],
  },
  {
    module: "matter/input",
    members: [
      "input",
      "keyIsDown",
      "keyJustPressed",
      "keyJustReleased",
      "mouseJustPressed",
      "mouseJustReleased",
      "pointerJustPressed",
      "pointerJustReleased",
      "gamepadButtonIsDown",
      "gamepadButtonJustPressed",
      "gamepadButtonJustReleased",
    ],
  },
  {
    module: "matter/scene",
    members: [
      "screen",
      "time",
      "random",
      "noise",
      "camera",
      "setPasses",
      "noLoop",
      "loop",
      "isLooping",
    ],
  },
  {
    module: "matter/assets",
    members: [
      "loadImage",
      "spritesheet",
      "isSpriteFrame",
      "createClip",
      "ClipEnd",
      "tilemap",
      "EMPTY_TILE",
    ],
  },
];

const AUTO_IMPORT_LIST: string[] = [];
for (const entry of CAPABILITY_MODULES) {
  for (const name of entry.members) AUTO_IMPORT_LIST.push(name);
}

/** Flat list of every auto-imported identifier, in module order. */
export const AUTO_IMPORT_MEMBERS: readonly string[] = AUTO_IMPORT_LIST;

export interface TransformOptions {
  /** Names to expose. Defaults to every capability-module member. */
  readonly members?: readonly string[];
}

/** Strings, comments and regex literals, so identifiers inside them are ignored. */
const SKIP = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

/**
 * Which capability names a source actually references.
 *
 * Deliberately a scan rather than a parse. A name that is mentioned but not
 * actually a reference — shadowed, or an object key like `{ fill: 'red' }` —
 * costs exactly one unused binding, which is harmless. A full parse would cost
 * a parser dependency and a great deal more that can go wrong.
 *
 * Strings and comments are skipped, since that is where a false positive would
 * do real damage rather than just add a binding.
 */
export function findUsedMembers(
  source: string,
  members: readonly string[] = AUTO_IMPORT_MEMBERS,
): string[] {
  const code = source.replace(SKIP, (match) => " ".repeat(match.length));
  const used: string[] = [];

  for (const name of members) {
    // Not preceded by a dot or an identifier character: `circle(...)` counts,
    // `shape.circle(...)` and `myCircle` do not.
    const pattern = new RegExp(`(^|[^.\\w$])${name}\\s*(?=[^\\w$]|$)`, "m");
    if (pattern.test(code)) used.push(name);
  }

  return used;
}

const MATTER_NAMED_IMPORT =
  /^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s*['"]matter(?:\/[^'"]*)?['"]/gm;

/**
 * Named bindings already imported from a Matter package, including subpaths.
 *
 * Type-only imports count: `import type { SpriteFrame }` already bound the
 * name, so emitting a second value import for it would be a duplicate.
 */
export function importedNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(MATTER_NAMED_IMPORT)) {
    const spec = match[1];
    if (spec === undefined) continue;
    for (const part of spec.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      const pieces = trimmed.split(/\s+as\s+/i);
      const local = (pieces[1] ?? pieces[0])?.trim();
      if (local !== undefined && local.length > 0) names.add(local);
    }
  }
  return names;
}

/** True when the source already imports from the library itself. */
export function hasExplicitImport(source: string): boolean {
  return /^\s*import\s[^;]*from\s*['"]matter(?:\/[^'"]*)?['"]/m.test(source);
}

/**
 * Prepend capability-module imports for the names a source uses.
 *
 * Global-style ergonomics without a global object: the imports happen at build
 * time, where they are inspectable, rather than by writing onto `window` or by
 * destructuring a runtime context the type checker cannot see.
 */
export function transform(source: string, options: TransformOptions = {}): string {
  const members = options.members ?? AUTO_IMPORT_MEMBERS;
  const already = importedNames(source);
  const used = findUsedMembers(source, members).filter((name) => !already.has(name));
  if (used.length === 0) return source;

  const needed = new Set(used);
  const lines: string[] = [];
  for (const entry of CAPABILITY_MODULES) {
    const names = entry.members.filter((name) => needed.has(name));
    if (names.length === 0) continue;
    lines.push(`import { ${names.join(", ")} } from ${JSON.stringify(entry.module)};`);
  }
  if (lines.length === 0) return source;
  return `${lines.join("\n")}\n${source}`;
}

/** Ambient globals matching `AUTO_IMPORT_MEMBERS`, for `tsc` on `*.scene.ts` files. */
export function globalsDeclaration(): string {
  const lines = ["export type MatterAutoImportGlobals = never;", "", "declare global {"];
  for (const entry of CAPABILITY_MODULES) {
    for (const name of entry.members) {
      lines.push(`  const ${name}: typeof import(${JSON.stringify(entry.module)}).${name};`);
    }
  }
  lines.push("}", "");
  return `${lines.join("\n")}\n`;
}

/**
 * Identity source map that maps output line `i + extraLines` to source line `i`.
 *
 * The transform only prepends import lines, so every original line is unchanged
 * — it just sits further down the file.
 */
export function offsetSourceMap(
  extraLines: number,
  original: string,
  file: string,
): {
  version: 3;
  file: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
} {
  const lineCount = original.length === 0 ? 1 : original.split("\n").length;
  const body = Array.from({ length: lineCount }, (_, i) => (i === 0 ? "AAAA" : "AACA")).join(";");
  return {
    version: 3,
    file,
    sources: [file],
    sourcesContent: [original],
    names: [],
    mappings: `${";".repeat(extraLines)}${body}`,
  };
}
