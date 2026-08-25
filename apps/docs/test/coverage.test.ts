import { describe, expect, test } from "bun:test";
import catalog from "../dist/catalog.json";
import type { Catalog } from "../src/model";
import { findDocGaps, formatGaps, undocumentedMembers } from "../src/coverage";

describe("undocumentedMembers", () => {
  test("finds a member with nothing above it", () => {
    expect(undocumentedMembers("interface A {\n  readonly x: number;\n}")).toEqual(["x"]);
  });

  test("accepts a one-line comment", () => {
    expect(undocumentedMembers("interface A {\n  /** The x. */\n  readonly x: number;\n}")).toEqual(
      [],
    );
  });

  test("accepts a block comment", () => {
    const source = "interface A {\n  /**\n   * The x.\n   */\n  x: number;\n}";
    expect(undocumentedMembers(source)).toEqual([]);
  });

  test("a comment covers one declaration, not the run under it", () => {
    // The failure this catches: a pair written together, documented once, and
    // the second one rendering as a bare line under someone else's prose.
    const source =
      "interface A {\n  /** Both of them. */\n  columnAt: () => number;\n  rowAt: () => number;\n}";
    expect(undocumentedMembers(source)).toEqual(["rowAt"]);
  });

  test("ignores the fields of an inline object type", () => {
    // Nested deeper than one level: those belong to the member's own signature,
    // which the reader is already looking at.
    const source =
      "interface A {\n  /** Thing. */\n  thing: {\n    readonly deep: number;\n  };\n}";
    expect(undocumentedMembers(source)).toEqual([]);
  });

  test("says nothing about a symbol with no body", () => {
    expect(undocumentedMembers("function f(x: number): void;")).toEqual([]);
  });

  test("skips members that document themselves", () => {
    expect(undocumentedMembers("class E extends Error {\n  constructor(m: string);\n}")).toEqual(
      [],
    );
  });
});

describe("reference coverage", () => {
  test("every export and every member of one is documented", () => {
    // A game engine is an API people read while trying to do something else.
    // Anything exported and unexplained is a question they have to answer by
    // reading our source, which is the thing the reference exists to prevent.
    const gaps = findDocGaps(catalog as Catalog);
    expect(gaps.length === 0 ? "" : `\n${formatGaps(gaps)}\n`).toBe("");
  });
});
