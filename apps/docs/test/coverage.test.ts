import { describe, expect, test } from "bun:test";
import catalog from "../dist/catalog.json";
import type { Catalog } from "../src/model";
import { findDocGaps, formatGaps, undocumentedMembers } from "../src/coverage";
import { parseMembers } from "../src/members";

const gaps = (source: string): readonly string[] => undocumentedMembers(parseMembers(source));

describe("undocumentedMembers", () => {
  test("finds a member with nothing above it", () => {
    expect(gaps("interface A {\n  readonly x: number;\n}")).toEqual(["x"]);
  });

  test("accepts a one-line comment", () => {
    expect(gaps("interface A {\n  /** The x. */\n  readonly x: number;\n}")).toEqual([]);
  });

  test("a comment covers one declaration, not the run under it", () => {
    // The failure this catches: a pair written together, documented once, and
    // the second rendering as a bare row under someone else's prose.
    const source =
      "interface A {\n  /** Both of them. */\n  columnAt: () => number;\n  rowAt: () => number;\n}";
    expect(gaps(source)).toEqual(["rowAt"]);
  });

  test("says nothing about a symbol with no body", () => {
    expect(gaps("function f(x: number): void;")).toEqual([]);
  });

  test("skips members that document themselves", () => {
    expect(gaps("class E extends Error {\n  constructor(m: string);\n}")).toEqual([]);
  });
});

describe("reference coverage", () => {
  test("every export and every member of one is documented", () => {
    // A game engine is an API people read while trying to do something else.
    // Anything exported and unexplained is a question they have to answer by
    // reading our source, which is the thing the reference exists to prevent.
    const found = findDocGaps(catalog as Catalog);
    expect(found.length === 0 ? "" : `\n${formatGaps(found)}\n`).toBe("");
  });
});
