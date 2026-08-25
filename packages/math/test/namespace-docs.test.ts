import { describe, expect, test } from "bun:test";
import {
  applyNamespaceDocs,
  documentNamespaces,
  findNamespaceDocs,
  NamespaceDocError,
} from "../build/namespace-docs";

const SOURCE = `/**
 * Module header, which belongs to nothing in particular.
 */

/** Two-component vectors. */
export * as vec2 from "./vec2";
/** Easing curves. */
export * as easing from "./easing";
export * as undocumented from "./undocumented";
export type { Vec2 } from "./vec2";
`;

const TYPES = `declare namespace vec2_d_exports {
  export { add };
}
declare namespace easing_d_exports {
  export { linear };
}
declare namespace undocumented_d_exports {
  export { thing };
}
`;

describe("namespace docs", () => {
  test("finds the comment on each documented re-export", () => {
    expect(findNamespaceDocs(SOURCE).map((doc) => doc.name)).toEqual(["vec2", "easing"]);
  });

  test("takes the nearest comment, not the module header", () => {
    // The header is separated by a blank line, and a greedy match would swallow
    // everything from it down to the export — putting the module's own summary
    // on the first namespace and nothing on the rest.
    const [first] = findNamespaceDocs(SOURCE);
    expect(first?.comment).toBe("/** Two-component vectors. */");
  });

  test("puts each comment above its declaration", () => {
    const out = documentNamespaces(SOURCE, TYPES);
    expect(out).toContain("/** Two-component vectors. */\ndeclare namespace vec2_d_exports {");
    expect(out).toContain("/** Easing curves. */\ndeclare namespace easing_d_exports {");
  });

  test("leaves an undocumented namespace alone", () => {
    const out = documentNamespaces(SOURCE, TYPES);
    expect(out).toContain("\ndeclare namespace undocumented_d_exports {");
    expect(out.match(/\/\*\*/g)).toHaveLength(2);
  });

  test("survives a bundler that stops mangling the name", () => {
    const plain = "declare namespace vec2 {\n  export { add };\n}\n";
    expect(applyNamespaceDocs(plain, [{ name: "vec2", comment: "/** doc */" }])).toBe(
      "/** doc */\ndeclare namespace vec2 {\n  export { add };\n}\n",
    );
  });

  test("throws rather than silently doing nothing", () => {
    // The failure this is guarding against: the bundler changes how it names
    // synthesized namespaces, the injection quietly matches nothing, and the
    // types ship bare again with no build output to say so.
    expect(() =>
      applyNamespaceDocs("declare namespace vec2_exports {}", [
        { name: "vec2", comment: "/** doc */" },
      ]),
    ).toThrow(NamespaceDocError);
  });

  test("names the namespace it could not place", () => {
    try {
      applyNamespaceDocs("", [{ name: "mat4", comment: "/** doc */" }]);
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(NamespaceDocError);
      expect((error as NamespaceDocError).namespaceName).toBe("mat4");
      expect((error as NamespaceDocError).message).toContain("mat4");
    }
  });
});
