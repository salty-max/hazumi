import { describe, expect, test } from "bun:test";
import {
  CONTEXT_MEMBERS,
  NON_IMPORTABLE_MEMBERS,
  findUsedMembers,
  hasExplicitImport,
  matterAutoImport,
  transform,
} from "../src/index";

describe("findUsedMembers", () => {
  test("finds names that are actually called", () => {
    const used = findUsedMembers('circle(1, 2, 3); fill("red");');
    expect(used).toContain("circle");
    expect(used).toContain("fill");
    expect(used).not.toContain("rect");
  });

  test("finds bare value references, not just calls", () => {
    expect(findUsedMembers("const x = width / 2;")).toContain("width");
    expect(findUsedMembers("const physical = width * pixelRatio;")).toContain("pixelRatio");
  });

  test("ignores property access", () => {
    // shape.circle() is someone else's method, not ours.
    expect(findUsedMembers("shape.circle(1, 2, 3);")).not.toContain("circle");
    expect(findUsedMembers("a.width;")).not.toContain("width");
  });

  test("ignores names that merely contain a member", () => {
    expect(findUsedMembers("const myCircle = 1; circleCount++;")).not.toContain("circle");
    expect(findUsedMembers("const textual = 1;")).not.toContain("text");
  });

  test("ignores identifiers inside strings", () => {
    // The scan is deliberately not a parser, so this is where false positives
    // would come from if anywhere.
    expect(findUsedMembers('const s = "circle(1,2,3)";')).not.toContain("circle");
    expect(findUsedMembers("const s = 'fill me in';")).not.toContain("fill");
    expect(findUsedMembers("const s = `rect here`;")).not.toContain("rect");
  });

  test("ignores identifiers inside comments", () => {
    expect(findUsedMembers("// circle(1,2,3)\nrect(0,0,1,1);")).not.toContain("circle");
    expect(findUsedMembers("/* fill */ rect(0,0,1,1);")).not.toContain("fill");
  });

  test("still sees code after a skipped region", () => {
    const used = findUsedMembers('const s = "circle"; rect(0, 0, 1, 1);');
    expect(used).toContain("rect");
    expect(used).not.toContain("circle");
  });

  test("honours a restricted member list", () => {
    expect(findUsedMembers("circle(); rect();", ["rect"])).toEqual(["rect"]);
  });

  test("an empty source uses nothing", () => {
    expect(findUsedMembers("")).toEqual([]);
  });
});

describe("transform", () => {
  test("prepends a binding for exactly what is used", () => {
    const out = transform("circle(1, 2, 3);");
    expect(out.startsWith("const { circle } = __matterContext;")).toBe(true);
    expect(out).toContain("circle(1, 2, 3);");
  });

  test("leaves a source that uses nothing untouched", () => {
    const source = "const x = 1 + 2;";
    expect(transform(source)).toBe(source);
  });

  test("the context identifier is configurable", () => {
    expect(transform("rect();", { contextName: "s" })).toContain("} = s;");
  });

  test("binds several members in one statement", () => {
    const out = transform('background("x"); circle(1,2,3); fill("y");');
    const first = out.split("\n")[0] as string;
    expect(first).toContain("background");
    expect(first).toContain("circle");
    expect(first).toContain("fill");
  });

  test("every context member is transformable", () => {
    // Guards against a member being added to the context but not the list.
    for (const name of CONTEXT_MEMBERS) {
      expect(findUsedMembers(`${name};`)).toContain(name);
    }
  });
});

describe("hasExplicitImport", () => {
  test("detects an existing import", () => {
    expect(hasExplicitImport("import { start } from 'matter';")).toBe(true);
    expect(hasExplicitImport('import { webgl2 } from "matter/backends/webgl2";')).toBe(true);
  });

  test("is not fooled by other packages", () => {
    expect(hasExplicitImport("import x from 'matterhorn';")).toBe(false);
    expect(hasExplicitImport("import x from 'other';")).toBe(false);
  });
});

describe("matterAutoImport", () => {
  test("only transforms matching files", () => {
    const plugin = matterAutoImport();
    expect(plugin.transform("circle();", "/a/b.scene.ts")).not.toBeNull();
    expect(plugin.transform("circle();", "/a/b.ts")).toBeNull();
  });

  test("returns null when nothing changed, so the bundler can skip it", () => {
    expect(matterAutoImport().transform("const x = 1;", "/a/b.scene.ts")).toBeNull();
  });

  test("runs before other transforms", () => {
    // Must land before TypeScript strips types, or the binding is injected
    // into already-compiled output.
    expect(matterAutoImport().enforce).toBe("pre");
  });

  test("the include pattern is configurable", () => {
    const plugin = matterAutoImport({ include: /\.art\.js$/ });
    expect(plugin.transform("circle();", "/x.art.js")).not.toBeNull();
    expect(plugin.transform("circle();", "/x.scene.ts")).toBeNull();
  });

  test("produces code the bundler can consume", () => {
    const result = matterAutoImport().transform("circle(1,2,3);", "/s.scene.ts");
    expect(result?.code).toContain("__matterContext");
    expect(result?.map).toBeNull();
  });
});

/**
 * The member list is maintained here rather than imported, so that a build
 * tool does not depend on the library it serves. That trades a dependency for
 * a drift risk, so the risk is checked directly: the list is compared against
 * the MatterContext declaration in the source. The declaration build may put
 * shared types in a content-hashed chunk when several public subpaths use it.
 */
describe("drift against the real context", () => {
  const ROOT = new URL("../../../", import.meta.url).pathname;

  async function declaredContextMembers(): Promise<string[]> {
    const source = await Bun.file(`${ROOT}packages/matter/src/context.ts`).text();
    const start = source.indexOf("interface MatterContext {");
    expect(start).toBeGreaterThan(-1);

    // Walk to the matching brace so nested object types do not end it early.
    let depth = 0;
    let end = start;
    for (let i = source.indexOf("{", start); i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    const body = source.slice(start, end);
    const names = new Set<string>();
    for (const match of body.matchAll(/^ {2}(?:readonly\s+)?([a-zA-Z_$][\w$]*)\s*[?:]/gm)) {
      names.add(match[1] as string);
    }
    return [...names].toSorted();
  }

  test("every context member is in the auto-import list", async () => {
    const declared = await declaredContextMembers();
    const missing = declared.filter(
      (name) => !CONTEXT_MEMBERS.includes(name) && !NON_IMPORTABLE_MEMBERS.includes(name),
    );
    // A member added to the context but not here silently fails to auto-import.
    expect(missing).toEqual([]);
  });

  test("the list contains nothing the context does not have", async () => {
    const declared = new Set(await declaredContextMembers());
    const stale = CONTEXT_MEMBERS.filter((name) => !declared.has(name));
    expect(NON_IMPORTABLE_MEMBERS.every((name) => declared.has(name))).toBe(true);
    // A stale entry would bind an undefined and fail at runtime.
    expect(stale).toEqual([]);
  });
});

describe("reserved words", () => {
  test("with is never auto-imported", () => {
    // `const { with } = ctx` does not parse, so binding it would break the file.
    expect(CONTEXT_MEMBERS).not.toContain("with");
    expect(findUsedMembers('with({ fill: "red" }, () => {});')).not.toContain("with");
  });

  test("a source referencing no members is left alone", () => {
    const source = "scoped(options, () => {});";
    expect(transform(source)).toBe(source);
  });

  test("an object key that shares a member name costs one unused binding", () => {
    // The scan is not a parser, so `{ fill: "red" }` reads as a use of fill.
    // Binding it is harmless — the key is unaffected — and the alternative is
    // a parser dependency. Pinned so the behaviour is a decision, not a
    // surprise.
    const out = transform('scoped({ fill: "red" }, () => {});');
    expect(out.startsWith("const { fill } = __matterContext;")).toBe(true);
  });
});
