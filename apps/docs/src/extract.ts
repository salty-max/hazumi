/**
 * Pulls the API reference out of the emitted `.d.ts` files.
 *
 * Not TypeDoc: that runs on the TypeScript compiler API, which TS 7.0 does not
 * stabilise until 7.1 — the same constraint that keeps linting on oxlint and
 * the build on tsdown. Declaration files are flat and regular enough to scan
 * directly, and using our own build output means the reference can never
 * document something the package does not actually ship.
 */

export type DocKind = 'function' | 'class' | 'interface' | 'type' | 'const';

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
}

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
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*ic?/, '').replace(/^\s*\*/, '').trim());
}

export function parseDocComment(raw: string): ParsedComment {
  const lines = stripCommentMarkers(raw);

  const description: string[] = [];
  const params: DocParam[] = [];
  const examples: string[] = [];
  let returns = '';
  let deprecated = '';

  // Which tag the current line belongs to, so continuations attach correctly.
  let mode: 'description' | 'param' | 'returns' | 'example' | 'deprecated' = 'description';
  let exampleBuffer: string[] = [];

  const flushExample = (): void => {
    if (exampleBuffer.length > 0) {
      examples.push(exampleBuffer.join('\n').trim());
      exampleBuffer = [];
    }
  };

  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line);
    if (tag !== null) {
      const [, name = '', rest = ''] = tag;
      if (name !== 'example') flushExample();

      switch (name) {
        case 'param': {
          const m = /^(\S+)\s*-?\s*(.*)$/.exec(rest);
          params.push({ name: m?.[1] ?? '', description: m?.[2] ?? '' });
          mode = 'param';
          break;
        }
        case 'returns':
        case 'return':
          returns = rest;
          mode = 'returns';
          break;
        case 'example':
          flushExample();
          mode = 'example';
          if (rest.length > 0) exampleBuffer.push(rest);
          break;
        case 'deprecated':
          deprecated = rest.length > 0 ? rest : 'Deprecated.';
          mode = 'deprecated';
          break;
        default:
          // Unknown tags end the current block rather than corrupting it.
          mode = 'description';
      }
      continue;
    }

    switch (mode) {
      case 'description':
        description.push(line);
        break;
      case 'param': {
        const last = params.at(-1);
        if (last !== undefined && line.length > 0) {
          params[params.length - 1] = {
            name: last.name,
            description: `${last.description} ${line}`.trim(),
          };
        }
        break;
      }
      case 'returns':
        if (line.length > 0) returns = `${returns} ${line}`.trim();
        break;
      case 'example':
        exampleBuffer.push(line);
        break;
      case 'deprecated':
        if (line.length > 0) deprecated = `${deprecated} ${line}`.trim();
        break;
    }
  }

  flushExample();

  // A fenced block in the prose is an example too. Authors reach for markdown
  // fences at least as often as @example, and the renderer should not have to
  // know which one was used.
  const prose = description.join('\n').trim();
  const fenced: string[] = [];
  const withoutFences = prose.replace(/```[a-z]*\n([\s\S]*?)```/g, (_match, code: string) => {
    fenced.push(code.trim());
    return '';
  });

  return {
    description: withoutFences.replace(/\n{3,}/g, '\n\n').trim(),
    params,
    returns,
    examples: [...fenced, ...examples],
    deprecated,
  };
}

const DECLARATION =
  /^(?:declare\s+)?(function|class|interface|type|const|abstract\s+class)\s+([A-Za-z_$][\w$]*)/;

/**
 * Names re-exported by the module, which is what makes an entry public.
 *
 * A declaration file contains internal helpers too; only what appears in an
 * export clause is API.
 */
export function collectExportedNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)) {
    for (const part of (match[1] ?? '').split(',')) {
      // Handles `a`, `a as b`, and `type a`.
      const cleaned = part.trim().replace(/^type\s+/, '');
      const alias = /\bas\s+([A-Za-z_$][\w$]*)/.exec(cleaned);
      const name = alias?.[1] ?? cleaned;
      if (name.length > 0) names.add(name);
    }
  }
  return names;
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
      if (char === '{') {
        depth++;
        seenBrace = true;
      } else if (char === '}') depth--;
    }

    if (seenBrace && depth <= 0) return { text: parts.join('\n'), next: i + 1 };
    if (!seenBrace && line.trimEnd().endsWith(';')) {
      return { text: parts.join('\n'), next: i + 1 };
    }
  }

  return { text: parts.join('\n'), next: lines.length };
}

export function extractModule(name: string, source: string): DocModule {
  const exported = collectExportedNames(source);
  const lines = source.split('\n');
  const entries: DocEntry[] = [];

  let pending: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] as string;
    const trimmed = line.trim();

    if (trimmed.startsWith('/**')) {
      const commentLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        commentLines.push(lines[j] as string);
        if ((lines[j] as string).includes('*/')) break;
        j++;
      }
      pending = commentLines.join('\n');
      i = j + 1;
      continue;
    }

    const decl = DECLARATION.exec(trimmed);
    if (decl !== null) {
      const kindRaw = (decl[1] ?? '').replace('abstract ', '');
      const entryName = decl[2] ?? '';
      const captured = captureSignature(lines, i);

      if (exported.has(entryName)) {
        const doc = pending === null
          ? { description: '', params: [], returns: '', examples: [], deprecated: '' }
          : parseDocComment(pending);

        entries.push({
          name: entryName,
          kind: kindRaw as DocKind,
          signature: captured.text.replace(/^declare\s+/, '').trim(),
          ...doc,
        });
      }

      pending = null;
      i = captured.next;
      continue;
    }

    // Anything else between a comment and a declaration drops the comment, so
    // prose never attaches to the wrong symbol.
    if (trimmed.length > 0 && !trimmed.startsWith('//')) pending = null;
    i++;
  }

  // Types and interfaces first, then values — reads better as a reference.
  const order: Record<DocKind, number> = {
    class: 0, interface: 1, type: 2, function: 3, const: 4,
  };
  const sorted = entries.toSorted(
    (a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name),
  );

  return { name, entries: sorted };
}
