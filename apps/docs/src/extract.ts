/**
 * Pulls the API reference out of the emitted `.d.ts` files.
 *
 * Not TypeDoc: that runs on the TypeScript compiler API, which TS 7.0 does not
 * stabilise until 7.1 — the same constraint that keeps linting on oxlint and
 * the build on tsdown. Declaration files are flat and regular enough to scan
 * directly, and using our own build output means the reference can never
 * document something the package does not actually ship.
 */

import { type DocMember, parseMembers } from "./members";

export type DocKind = "function" | "class" | "interface" | "type" | "const" | "namespace";

export interface DocParam {
  readonly name: string;
  readonly description: string;
}

export interface DocEntry {
  readonly name: string;
  readonly kind: DocKind;
  /** The declaration, with the `declare` keyword stripped. */
  readonly signature: string;
  /** Prose, with tag lines removed. */
  readonly description: string;
  readonly params: readonly DocParam[];
  readonly returns: string;
  readonly examples: readonly string[];
  readonly deprecated: string;
  /**
   * Fields and methods, split out of the signature.
   *
   * Empty for anything without a body. The site renders these as rows with
   * their own prose rather than leaving the reader to find each comment inside
   * a block of highlighted code.
   */
  readonly members: readonly DocMember[];
}

export type { DocMember };

export interface DocModule {
  readonly name: string;
  readonly entries: readonly DocEntry[];
}

interface ParsedComment {
  description: string;
  params: DocParam[];
  returns: string;
  examples: string[];
  deprecated: string;
}

/** Strip the leading `*` and indentation from a block comment body. */
function stripCommentMarkers(raw: string): string[] {
  return raw
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*\*ic?/, "")
        .replace(/^\s*\*/, "")
        .trim(),
    );
}

export function parseDocComment(raw: string): ParsedComment {
  const lines = stripCommentMarkers(raw);

  const description: string[] = [];
  const params: DocParam[] = [];
  const examples: string[] = [];
  let returns = "";
  let deprecated = "";

  // Which tag the current line belongs to, so continuations attach correctly.
  let mode: "description" | "param" | "returns" | "example" | "deprecated" = "description";
  let exampleBuffer: string[] = [];

  const flushExample = (): void => {
    if (exampleBuffer.length > 0) {
      examples.push(exampleBuffer.join("\n").trim());
      exampleBuffer = [];
    }
  };

  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line);
    if (tag !== null) {
      const [, name = "", rest = ""] = tag;
      if (name !== "example") flushExample();

      switch (name) {
        case "param": {
          const m = /^(\S+)\s*-?\s*(.*)$/.exec(rest);
          params.push({ name: m?.[1] ?? "", description: m?.[2] ?? "" });
          mode = "param";
          break;
        }
        case "returns":
        case "return":
          returns = rest;
          mode = "returns";
          break;
        case "example":
          flushExample();
          mode = "example";
          if (rest.length > 0) exampleBuffer.push(rest);
          break;
        case "deprecated":
          deprecated = rest.length > 0 ? rest : "Deprecated.";
          mode = "deprecated";
          break;
        default:
          // Unknown tags end the current block rather than corrupting it.
          mode = "description";
      }
      continue;
    }

    switch (mode) {
      case "description":
        description.push(line);
        break;
      case "param": {
        const last = params.at(-1);
        if (last !== undefined && line.length > 0) {
          params[params.length - 1] = {
            name: last.name,
            description: `${last.description} ${line}`.trim(),
          };
        }
        break;
      }
      case "returns":
        if (line.length > 0) returns = `${returns} ${line}`.trim();
        break;
      case "example":
        exampleBuffer.push(line);
        break;
      case "deprecated":
        if (line.length > 0) deprecated = `${deprecated} ${line}`.trim();
        break;
    }
  }

  flushExample();

  // A fenced block in the prose is an example too. Authors reach for markdown
  // fences at least as often as @example, and the renderer should not have to
  // know which one was used.
  const prose = description.join("\n").trim();
  const fenced: string[] = [];
  const withoutFences = prose.replace(/```[a-z]*\n([\s\S]*?)```/g, (_match, code: string) => {
    fenced.push(code.trim());
    return "";
  });

  return {
    description: withoutFences.replace(/\n{3,}/g, "\n\n").trim(),
    params,
    returns,
    examples: [...fenced, ...examples],
    deprecated,
  };
}

const DECLARATION =
  /^(?:declare\s+)?(function|class|interface|type|const|namespace|abstract\s+class)\s+([A-Za-z_$][\w$]*)/;

const INLINE_EXPORT =
  /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:function|class|interface|type|const|namespace)\s+([A-Za-z_$][\w$]*)/;

const STAR_AS_EXPORT = /^\s*export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+/;

/**
 * Walk file-level lines only. Nested `export { add as add }` inside
 * `declare namespace vec2_d_exports` is not public API — the public name is
 * the namespace itself (`vec2`).
 */
function forEachTopLevelLine(source: string, visit: (line: string) => void): void {
  let depth = 0;
  for (const line of source.split("\n")) {
    if (depth === 0) visit(line);
    for (const char of line) {
      if (char === "{") depth++;
      else if (char === "}") depth = Math.max(0, depth - 1);
    }
  }
}

function namesFromExportClause(clause: string): string[] {
  const names: string[] = [];
  for (const part of clause.split(",")) {
    const cleaned = part.trim().replace(/^type\s+/, "");
    if (cleaned.length === 0) continue;
    const alias = /\bas\s+([A-Za-z_$][\w$]*)/.exec(cleaned);
    const name = alias?.[1] ?? cleaned;
    if (name.length > 0) names.push(name);
  }
  return names;
}

/**
 * Names re-exported by the module, which is what makes an entry public.
 *
 * A declaration file contains internal helpers too; only what appears in an
 * export clause is API.
 */
export function collectExportedNames(source: string): Set<string> {
  const names = new Set<string>();
  forEachTopLevelLine(source, (line) => {
    const inline = INLINE_EXPORT.exec(line);
    if (inline?.[1] !== undefined) names.add(inline[1]);
    const starAs = STAR_AS_EXPORT.exec(line);
    if (starAs?.[1] !== undefined) names.add(starAs[1]);
    const brace = /^\s*export\s+(?:type\s+)?\{([^}]*)\}/.exec(line);
    if (brace?.[1] !== undefined) {
      for (const name of namesFromExportClause(brace[1])) names.add(name);
    }
  });
  return names;
}

/** Local declaration name → public export name (`vec2_d_exports` → `vec2`). */
export function collectExportAliases(source: string): Map<string, string> {
  const aliases = new Map<string, string>();
  forEachTopLevelLine(source, (line) => {
    const brace = /^\s*export\s+(?:type\s+)?\{([^}]*)\}/.exec(line);
    if (brace?.[1] === undefined) return;
    for (const part of brace[1].split(",")) {
      const cleaned = part.trim().replace(/^type\s+/, "");
      const aliased = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(cleaned);
      if (aliased === null) continue;
      const local = aliased[1];
      const exported = aliased[2];
      if (local !== undefined && exported !== undefined) aliases.set(local, exported);
    }
  });
  return aliases;
}

/** Capture a declaration's text, following braces so interfaces stay intact. */
function captureSignature(lines: readonly string[], start: number): { text: string; next: number } {
  let depth = 0;
  let seenBrace = false;
  const parts: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i] as string;
    parts.push(line);

    for (const char of line) {
      if (char === "{") {
        depth++;
        seenBrace = true;
      } else if (char === "}") depth--;
    }

    if (seenBrace && depth <= 0) return { text: parts.join("\n"), next: i + 1 };
    if (!seenBrace && line.trimEnd().endsWith(";")) {
      return { text: parts.join("\n"), next: i + 1 };
    }
  }

  return { text: parts.join("\n"), next: lines.length };
}

function emptyDoc(): {
  description: string;
  params: DocParam[];
  returns: string;
  examples: string[];
  deprecated: string;
} {
  return { description: "", params: [], returns: "", examples: [], deprecated: "" };
}

function namespaceSignature(publicName: string, body: string): string {
  const clause = /export\s*\{([^}]+)\}/.exec(body);
  const members =
    clause?.[1] === undefined
      ? []
      : namesFromExportClause(clause[1]).filter((member) => member !== publicName);
  if (members.length === 0) return `namespace ${publicName}`;
  return `namespace ${publicName} {\n  ${members.join(", ")}\n}`;
}

export function extractModule(
  name: string,
  source: string,
  publicSource: string = source,
): DocModule {
  const exported = collectExportedNames(publicSource);
  const aliases = collectExportAliases(publicSource);
  const lines = source.split("\n");
  const entries: DocEntry[] = [];
  const found = new Set<string>();

  let pending: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] as string;
    const trimmed = line.trim();

    if (trimmed.startsWith("/**")) {
      const commentLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        commentLines.push(lines[j] as string);
        if ((lines[j] as string).includes("*/")) break;
        j++;
      }
      pending = commentLines.join("\n");
      i = j + 1;
      continue;
    }

    const starAs = STAR_AS_EXPORT.exec(line);
    if (starAs?.[1] !== undefined && exported.has(starAs[1])) {
      const publicName = starAs[1];
      const doc = pending === null ? emptyDoc() : parseDocComment(pending);
      entries.push({
        name: publicName,
        kind: "namespace",
        signature: `namespace ${publicName}`,
        members: [],
        ...doc,
      });
      found.add(publicName);
      pending = null;
      i++;
      continue;
    }

    const decl = DECLARATION.exec(trimmed.replace(/^export\s+/, ""));
    if (decl !== null) {
      const kindRaw = (decl[1] ?? "").replace("abstract ", "");
      const declaredName = decl[2] ?? "";
      const publicName = aliases.get(declaredName) ?? declaredName;
      const captured = captureSignature(lines, i);

      if (exported.has(publicName)) {
        const doc = pending === null ? emptyDoc() : parseDocComment(pending);
        const raw = captured.text
          .replace(/^export\s+/, "")
          .replace(/^declare\s+/, "")
          .trim();
        const signature =
          kindRaw === "namespace" ? namespaceSignature(publicName, captured.text) : raw;
        entries.push({
          name: publicName,
          kind: kindRaw as DocKind,
          signature,
          // A namespace's braces hold a re-export list, not members.
          members: kindRaw === "namespace" ? [] : parseMembers(signature),
          ...doc,
        });
        found.add(publicName);
      }

      pending = null;
      i = captured.next;
      continue;
    }

    // Anything else between a comment and a declaration drops the comment, so
    // prose never attaches to the wrong symbol.
    if (trimmed.length > 0 && !trimmed.startsWith("//")) pending = null;
    i++;
  }

  // `export { physics }` with the declaration in another file still has a name.
  for (const leftover of exported) {
    if (found.has(leftover)) continue;
    entries.push({
      name: leftover,
      kind: "const",
      signature: leftover,
      members: [],
      ...emptyDoc(),
    });
  }

  // Call-ables first: that is what a scene author looks up.
  const order: Record<DocKind, number> = {
    function: 0,
    namespace: 1,
    const: 2,
    class: 3,
    interface: 4,
    type: 5,
  };
  const sorted = entries.toSorted(
    (a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name),
  );
  const byName = new Map<string, DocEntry>();
  for (const entry of sorted) {
    const previous = byName.get(entry.name);
    // `vec2` is both a factory function and a namespace in the rolled .d.ts.
    // The import is the namespace (`vec2.add`).
    if (previous === undefined || (entry.kind === "namespace" && previous.kind !== "namespace")) {
      byName.set(entry.name, entry);
    }
  }
  const unique = [...byName.values()].toSorted(
    (a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name),
  );

  return { name, entries: unique };
}
