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
import type { Catalog, DocMember } from "./model";

export interface DocGap {
  readonly module: string;
  readonly symbol: string;
  /** Absent for a whole export; present when it is one member of one. */
  readonly member?: string;
}

/** Members that document themselves, and would only collect noise. */
const OBVIOUS = new Set(["constructor", "name", "message", "stack", "cause"]);

/**
 * Members with no comment above them, in declaration order.
 *
 * Reads the parsed members rather than scanning the text again: one parser,
 * and what this measures is exactly what the page renders. A comment covers
 * the one declaration that follows it, so `rowAt` sitting under a comment
 * written for `columnAt` counts as undocumented — which is right, because on
 * the page it renders as a bare row under someone else's prose.
 */
export function undocumentedMembers(members: readonly DocMember[]): readonly string[] {
  return members
    .filter((member) => member.description.trim().length === 0 && !OBVIOUS.has(member.name))
    .map((member) => member.name);
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
        for (const member of undocumentedMembers(entry.members)) {
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
