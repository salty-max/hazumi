/**
 * What the reference does not explain.
 *
 * The catalog is built from the shipped `.d.ts`, so this measures exactly what
 * a user sees — on the site, and on hover in their editor. Two kinds of gap:
 * an export with no description, and a member of one with no comment above it.
 *
 * It exists because writing the descriptions once does not keep them written.
 * A game engine is an API people read while they are trying to do something
 * else, and the second `lighten`/`darken` pair — one documented, one not,
 * because it was added a minute later — is how the last hundred blanks got
 * there. So this is a test, not a report.
 */
import type { Catalog } from "./model";

export interface DocGap {
  readonly module: string;
  readonly symbol: string;
  /** Absent for a whole export; present when it is one member of one. */
  readonly member?: string;
}

/**
 * A member declaration inside an interface or class body.
 *
 * Indented exactly two spaces, which is what the emitter produces for a
 * top-level member: nesting deeper than that belongs to an inline object type,
 * whose fields are part of the member's own signature rather than separate
 * entries a reader can be pointed at.
 */
const MEMBER =
  /^ {2}(?:readonly |get |set |static |abstract |declare |protected |public )*([A-Za-z_$][\w$]*)\s*(?:\??\s*[:(<]|\()/;

/** Members that document themselves, and would only collect noise. */
const OBVIOUS = new Set(["constructor", "name", "message", "stack", "cause"]);

/**
 * Members with no comment above them, in declaration order.
 *
 * A comment covers the one declaration that follows it, so `rowAt` sitting
 * under a comment written for `columnAt` counts as undocumented — which is
 * right: on the page it renders as a bare line under someone else's prose.
 */
export function undocumentedMembers(signature: string): readonly string[] {
  if (!signature.includes("{")) return [];
  const missing: string[] = [];
  let inComment = false;
  let documented = false;
  for (const line of signature.split("\n")) {
    const text = line.trim();
    if (inComment) {
      if (text.endsWith("*/")) inComment = false;
      continue;
    }
    if (text.startsWith("/**")) {
      inComment = !text.endsWith("*/");
      documented = true;
      continue;
    }
    if (text.startsWith("//")) continue;
    const match = MEMBER.exec(line);
    if (match === null) {
      documented = false;
      continue;
    }
    const name = match[1] ?? "";
    if (!documented && !OBVIOUS.has(name)) missing.push(name);
    documented = false;
  }
  return missing;
}

/** Every gap in the catalog, ready to print or to assert is empty. */
export function findDocGaps(catalog: Catalog): readonly DocGap[] {
  const gaps: DocGap[] = [];
  for (const group of catalog.groups) {
    for (const module of group.modules) {
      for (const entry of module.entries) {
        if (entry.description.trim().length === 0) {
          gaps.push({ module: module.name, symbol: entry.name });
        }
        for (const member of undocumentedMembers(entry.signature)) {
          gaps.push({ module: module.name, symbol: entry.name, member });
        }
      }
    }
  }
  return gaps;
}

/** One gap per line, for a failure message worth reading. */
export function formatGaps(gaps: readonly DocGap[]): string {
  return gaps
    .map((gap) =>
      gap.member === undefined
        ? `${gap.module} ${gap.symbol}`
        : `${gap.module} ${gap.symbol}.${gap.member}`,
    )
    .join("\n");
}
