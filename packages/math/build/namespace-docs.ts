/**
 * Put the namespace doc comments back into the emitted `.d.ts`.
 *
 * `export * as vec2 from "./vec2"` is the shape the whole vector API is
 * published under, and the d.ts bundler rewrites it into a synthesized
 * `declare namespace vec2_d_exports` — dropping the doc comment that was on
 * the re-export. Every member keeps its own documentation; only the container
 * loses one, so hovering `vec2.add` explains itself and hovering `vec2` says
 * nothing at all. That is the first token anyone types.
 *
 * Rewriting generated output is a liability, so this is built to fail loudly:
 * a documented namespace whose declaration cannot be found throws and takes
 * the build with it. The alternative — a silent no-op the day the bundler
 * renames its synthesized namespaces — is how a fix like this rots without
 * anyone noticing.
 *
 * Delete this the day the bundler carries the comment across itself.
 */

/** A documented `export * as` found in the entry module. */
export interface NamespaceDoc {
  readonly name: string;
  /** The comment verbatim, `/**` and `*\/` included. */
  readonly comment: string;
}

export class NamespaceDocError extends Error {
  readonly namespaceName: string;

  constructor(name: string) {
    super(
      `Documented namespace ${JSON.stringify(name)} has no declaration in the emitted types. ` +
        "The d.ts bundler has probably changed how it names synthesized namespaces; " +
        "see packages/math/build/namespace-docs.ts.",
    );
    this.name = "NamespaceDocError";
    this.namespaceName = name;
  }
}

/**
 * The comment body may not contain `*\/`, so the match cannot start at an
 * earlier comment and run through the one it wants.
 *
 * With a plain lazy body it does exactly that: the module header sits two
 * lines above the first re-export, and the whole header ends up prepended to
 * `vec2` — which is what shipped until a test went looking.
 */
const DOCUMENTED_REEXPORT = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)\s*\r?\nexport \* as (\w+) from/g;

/** Every `export * as` in the source that carries a doc comment. */
export function findNamespaceDocs(source: string): readonly NamespaceDoc[] {
  const found: NamespaceDoc[] = [];
  for (const match of source.matchAll(DOCUMENTED_REEXPORT)) {
    const comment = match[1];
    const name = match[2];
    if (comment !== undefined && name !== undefined) found.push({ name, comment });
  }
  return found;
}

/**
 * Prepend each comment to its namespace declaration.
 *
 * The suffix is optional in the pattern so that a bundler which stops mangling
 * the name keeps working rather than throwing on the first build after an
 * upgrade.
 */
export function applyNamespaceDocs(types: string, docs: readonly NamespaceDoc[]): string {
  let out = types;
  for (const { name, comment } of docs) {
    const declaration = new RegExp(`^declare namespace ${name}(?:_d_exports)? \\{`, "m");
    const match = declaration.exec(out);
    if (match === null) throw new NamespaceDocError(name);
    out = `${out.slice(0, match.index)}${comment}\n${out.slice(match.index)}`;
  }
  return out;
}

/** Both halves, for the build hook. */
export function documentNamespaces(source: string, types: string): string {
  return applyNamespaceDocs(types, findNamespaceDocs(source));
}
