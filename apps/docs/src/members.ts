/**
 * Breaks a declaration body into its members.
 *
 * The reference used to render an interface as one syntax-highlighted block,
 * which is the shape the `.d.ts` happens to have rather than the shape a
 * reader wants: the prose explaining a field sits above it as a comment, so
 * finding what `invMass` means costs the same scan as reading the source. With
 * the members split out, each one can be a row with its own type and its own
 * sentence, and a page can link a member's type to the page that documents it.
 *
 * Hand-written rather than run through the compiler API, for the same reason
 * the rest of the extractor is: TS 7.0 does not stabilise it. Declaration files
 * are regular — one member per statement, always terminated — so a brace
 * counter is enough, and anything it cannot read falls back to the code block
 * that was there before.
 */

export interface DocMember {
  readonly name: string;
  /** The declaration as written, with its comment and terminator removed. */
  readonly signature: string;
  /** Everything after the name: the type, or the call signature. */
  readonly type: string;
  /** Prose from the comment above it. */
  readonly description: string;
  /** Declared with `?`, so a caller may leave it out. */
  readonly optional: boolean;
  /** Declared `readonly`. Says nothing about a method. */
  readonly readonly: boolean;
  /** A method or a function-typed property, as opposed to a plain value. */
  readonly callable: boolean;
}

/** The body between the outermost braces, or null when there is not one. */
export function declarationBody(signature: string): string | null {
  const open = signature.indexOf("{");
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < signature.length; i++) {
    const ch = signature[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return signature.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * Split a body into statements, ignoring separators nested inside a member.
 *
 * A member is not always one line: an inline object type, a union spread over
 * several, and an arrow type all carry braces, angles or semicolons of their
 * own. Depth counting is what keeps `image: (source: SpriteFrame, x: number)
 * => void` in one piece.
 *
 * Angle brackets are counted too, which is safe here because a declaration
 * file has no comparisons in it — the ambiguity that makes `<` hard to parse
 * in real code does not arise.
 */
function statements(body: string): readonly string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inComment = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inComment) {
      if (ch === "*" && body[i + 1] === "/") inComment = false;
      continue;
    }
    if (ch === "/" && body[i + 1] === "*") {
      inComment = true;
      continue;
    }
    // `=>` is not a closing angle bracket. Counting it as one drove depth
    // negative on every callback member, so the terminator after it never
    // split and `cost: (column: number, row: number) => number` came back as a
    // member called `row`.
    if (ch === "=" && body[i + 1] === ">") {
      i++;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === "]" || ch === ">") depth--;
    else if ((ch === ";" || ch === ",") && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/** Strip the leading `*` from each line of a block comment. */
function commentProse(raw: string): string {
  return raw
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*\*ic?/, "")
        .replace(/^\s*\*/, "")
        .trim(),
    )
    .join("\n")
    .trim();
}

const NAME =
  /^(?:(readonly)\s+)?(?:(?:get|set|static|abstract|declare|protected|public)\s+)*(\[[^\]]+\]|"[^"]*"|[A-Za-z_$][\w$]*)(\?)?/;

/**
 * The members of a declaration, in the order they appear.
 *
 * Empty for anything without a body — a function, a plain type alias — which
 * is the signal the site uses to fall back to showing the signature alone.
 */
export function parseMembers(signature: string): readonly DocMember[] {
  const body = declarationBody(signature);
  if (body === null) return [];

  const members: DocMember[] = [];
  for (const statement of statements(body)) {
    // A statement carries its own comment, because the split kept everything
    // between the previous terminator and this one.
    const commentEnd = statement.lastIndexOf("*/");
    const comment = commentEnd < 0 ? "" : statement.slice(0, commentEnd + 2);
    const declaration = (commentEnd < 0 ? statement : statement.slice(commentEnd + 2)).trim();
    if (declaration.length === 0) continue;

    const match = NAME.exec(declaration);
    if (match === null) continue;
    const name = match[2] ?? "";
    if (name.length === 0) continue;

    const rest = declaration.slice(match[0].length).trim();
    const type = rest.startsWith(":") ? rest.slice(1).trim() : rest;
    members.push({
      name,
      signature: declaration,
      type,
      description: comment.trim().startsWith("/**") ? commentProse(comment.trim()) : "",
      optional: match[3] === "?",
      readonly: match[1] === "readonly",
      // A method is `name(...)`; a callback property is `name: (...) => …`.
      callable: rest.startsWith("(") || rest.startsWith("<") || /=>/.test(type),
    });
  }
  return members;
}
