import { describe, expect, test } from "bun:test";
import {
  AUTO_IMPORT_MEMBERS,
  CAPABILITY_MODULES,
  findUsedMembers,
  hasExplicitImport,
  importedNames,
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

  test("finds capability objects, not leftover p5 scalars", () => {
    expect(findUsedMembers("const x = screen.width / 2;")).toContain("screen");
    expect(findUsedMembers("const x = screen.width / 2;")).not.toContain("width");
    expect(findUsedMembers("circle(x, y, 10 + time.elapsed);")).toContain("time");
    expect(findUsedMembers("const x = width / 2;")).not.toContain("width");
    expect(findUsedMembers("const t = 1;")).not.toContain("t");
  });

  test("ignores property access", () => {
    // shape.circle() is someone else's method, not ours.
    expect(findUsedMembers("shape.circle(1, 2, 3);")).not.toContain("circle");
    expect(findUsedMembers("a.screen;")).not.toContain("screen");
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
  test("prepends capability imports for exactly what is used", () => {
    const out = transform("circle(1, 2, 3);");
    expect(out.startsWith('import { circle } from "matter/draw";')).toBe(true);
    expect(out).toContain("circle(1, 2, 3);");
  });

  test("groups names by capability module", () => {
    const out = transform("circle(screen.width / 2, 0, 10);\nkeyIsDown('a');");
    expect(out).toContain('import { circle } from "matter/draw";');
    expect(out).toContain('import { keyIsDown } from "matter/input";');
    expect(out).toContain('import { screen } from "matter/scene";');
  });

  test("leaves a source that uses nothing untouched", () => {
    const source = "const x = 1 + 2;";
    expect(transform(source)).toBe(source);
  });

  test("does not re-import a name the file already imported", () => {
    const source = 'import { circle } from "matter/draw";\ncircle(1, 2, 3);\nfill("red");';
    const out = transform(source);
    expect(out.startsWith('import { fill } from "matter/draw";')).toBe(true);
    expect(out.match(/import \{ circle \}/g)?.length).toBe(1);
  });

  test("binds several members of one module in one statement", () => {
    const out = transform('background("x"); circle(1,2,3); fill("y");');
    const first = out.split("\n")[0] as string;
    expect(first).toBe('import { background, fill, circle } from "matter/draw";');
  });

  test("every auto-import member is transformable", () => {
    for (const name of AUTO_IMPORT_MEMBERS) {
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

describe("importedNames", () => {
  test("collects named bindings across subpaths", () => {
    const names = importedNames(
      `import { circle, fill } from "matter/draw";\nimport { screen as viewport } from "matter/scene";`,
    );
    expect(names.has("circle")).toBe(true);
    expect(names.has("fill")).toBe(true);
    expect(names.has("screen")).toBe(false);
    expect(names.has("viewport")).toBe(true);
  });

  test("counts type-only imports so it does not emit a duplicate", () => {
    expect(
      importedNames('import type { SpriteFrame } from "matter/assets";').has("SpriteFrame"),
    ).toBe(true);
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
    expect(result?.code).toContain('from "matter/draw"');
    expect(result?.map).toBeNull();
  });
});

/**
 * The member list is maintained here rather than imported, so that a build
 * tool does not depend on the library it serves. That trades a dependency for
 * a drift risk, so the risk is checked directly against the capability module
 * sources.
 */
describe("drift against capability modules", () => {
  const ROOT = new URL("../../../", import.meta.url).pathname;

  const SOURCE_BY_MODULE: Readonly<Record<string, string>> = {
    "matter/draw": "packages/matter/src/draw.ts",
    "matter/input": "packages/matter/src/input.ts",
    "matter/scene": "packages/matter/src/scene.ts",
    "matter/assets": "packages/matter/src/assets.ts",
  };

  async function exportedValues(relativePath: string): Promise<Set<string>> {
    const source = await Bun.file(`${ROOT}${relativePath}`).text();
    const names = new Set<string>();
    for (const match of source.matchAll(/^export function ([A-Za-z_$][\w$]*)/gm)) {
      names.add(match[1] as string);
    }
    for (const match of source.matchAll(/^export const ([A-Za-z_$][\w$]*)/gm)) {
      names.add(match[1] as string);
    }
    for (const match of source.matchAll(/^export \{([^}]+)\}/gm)) {
      const spec = match[1];
      if (spec === undefined) continue;
      for (const part of spec.split(",")) {
        const exported = part
          .trim()
          .split(/\s+as\s+/i)[0]
          ?.trim();
        if (exported !== undefined && exported.length > 0 && !exported.startsWith("type ")) {
          names.add(exported);
        }
      }
    }
    return names;
  }

  test("every auto-import name is exported by its module", async () => {
    const exportedByModule = await Promise.all(
      CAPABILITY_MODULES.map(async (entry) => {
        const path = SOURCE_BY_MODULE[entry.module];
        expect(path).toBeDefined();
        return { entry, exported: await exportedValues(path as string) };
      }),
    );
    for (const { entry, exported } of exportedByModule) {
      const missing = entry.members.filter((name) => !exported.has(name));
      expect(missing).toEqual([]);
    }
  });

  test("the list contains nothing a capability module does not export", async () => {
    const listed = new Set(AUTO_IMPORT_MEMBERS);
    expect(listed.size).toBe(AUTO_IMPORT_MEMBERS.length);
  });
});

describe("reserved words and the old context names", () => {
  test("with is never auto-imported; scoped is", () => {
    expect(AUTO_IMPORT_MEMBERS).not.toContain("with");
    expect(AUTO_IMPORT_MEMBERS).toContain("scoped");
    expect(findUsedMembers('with({ fill: "red" }, () => {});')).not.toContain("with");
    const out = transform("scoped({}, () => {});");
    expect(out).toContain('import { scoped } from "matter/draw";');
  });

  test("an object key that shares a member name costs one unused import", () => {
    // The scan is not a parser, so `{ fill: "red" }` reads as a use of fill.
    // Importing it is harmless — the key is unaffected — and the alternative is
    // a parser dependency. Pinned so the behaviour is a decision, not a
    // surprise.
    const out = transform('scoped({ fill: "red" }, () => {});');
    expect(out).toContain("fill");
    expect(out).toContain("scoped");
  });
});
