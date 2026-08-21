/**
 * The auto-import transform.
 *
 * Kept apart from the plugin wrapper so it is a pure string-to-string function
 * and can be tested without a bundler.
 */

/** Everything the Matter context provides, and can therefore be auto-imported. */
export const CONTEXT_MEMBERS: readonly string[] = [
  "width",
  "height",
  "frameCount",
  "t",
  "dt",
  "mouseX",
  "mouseY",
  "pmouseX",
  "pmouseY",
  "mouseIsPressed",
  "mouseButton",
  "keyIsPressed",
  "key",
  "keyIsDown",
  "keyJustPressed",
  "keyJustReleased",
  "mouseJustPressed",
  "mouseJustReleased",
  "random",
  "noise",
  "camera",
  "background",
  "fill",
  "noFill",
  "stroke",
  "noStroke",
  "strokeWeight",
  "blendMode",
  "circle",
  "ellipse",
  "rect",
  "square",
  "line",
  "point",
  "beginShape",
  "vertex",
  "quadraticVertex",
  "bezierVertex",
  "endShape",
  "image",
  "loadImage",
  "text",
  "textSize",
  "textAlign",
  "textFont",
  "push",
  "pop",
  "translate",
  "rotate",
  "scale",
  "noLoop",
  "loop",
  "isLooping",
  "setPasses",
];

/**
 * Context members that cannot be auto-imported.
 *
 * `with` is a reserved word: `const { with } = ctx` is a syntax error, and a
 * call to `with(...)` would not parse either. It has to be destructured under
 * another name by hand — `const { with: scoped } = ctx` — which is what the
 * examples do.
 *
 * Listed rather than simply omitted so the drift test can tell a deliberate
 * exclusion from a member somebody forgot to add.
 */
export const NON_IMPORTABLE_MEMBERS: readonly string[] = ["with"];

export interface TransformOptions {
  /** Names to expose. Defaults to the whole context. */
  readonly members?: readonly string[];
  /** Identifier the context is bound to. */
  readonly contextName?: string;
}

const DEFAULT_CONTEXT_NAME = "__matterContext";

/** Strings, comments and regex literals, so identifiers inside them are ignored. */
const SKIP = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

/**
 * Which context members a source actually references.
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
  members: readonly string[] = CONTEXT_MEMBERS,
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

/** True when the source already imports from the library itself. */
export function hasExplicitImport(source: string): boolean {
  return /^\s*import\s[^;]*from\s*['"]matter(?:\/[^'"]*)?['"]/m.test(source);
}

/**
 * Prepend a destructuring binding for the members a source uses.
 *
 * Global-style ergonomics without a global object: the binding happens at build
 * time, where it is inspectable, rather than by writing onto `window` at
 * runtime where nothing can type it.
 */
export function transform(source: string, options: TransformOptions = {}): string {
  const members = options.members ?? CONTEXT_MEMBERS;
  const contextName = options.contextName ?? DEFAULT_CONTEXT_NAME;

  const used = findUsedMembers(source, members);
  if (used.length === 0) return source;

  const binding = `const { ${used.join(", ")} } = ${contextName};`;
  return `${binding}\n${source}`;
}
