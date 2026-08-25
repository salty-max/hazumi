import { describe, expect, test } from "bun:test";
import { declarationBody, parseMembers } from "../src/members";

describe("declarationBody", () => {
  test("takes the outermost braces, not the first closing one", () => {
    const source = "interface A {\n  thing: { deep: number };\n  after: string;\n}";
    expect(declarationBody(source)).toContain("after: string;");
  });

  test("is null for a declaration without a body", () => {
    expect(declarationBody("function f(x: number): void;")).toBeNull();
  });
});

describe("parseMembers", () => {
  test("reads name, type and prose", () => {
    const source = "interface A {\n  /** How wide. */\n  readonly width: number;\n}";
    expect(parseMembers(source)).toEqual([
      {
        name: "width",
        signature: "readonly width: number",
        type: "number",
        description: "How wide.",
        optional: false,
        readonly: true,
        callable: false,
      },
    ]);
  });

  test("marks an optional member", () => {
    const [member] = parseMembers("interface A {\n  /** Maybe. */\n  gain?: number;\n}");
    expect([member?.name, member?.optional]).toEqual(["gain", true]);
  });

  test("keeps an arrow type in one piece", () => {
    // The separators inside the parameter list are what a naive split on `;`
    // or `,` breaks on, leaving `x: number` as a member of its own.
    const source = "interface A {\n  /** Draws. */\n  image: (src: Frame, x: number) => void;\n}";
    const [member] = parseMembers(source);
    expect([member?.name, member?.type, member?.callable]).toEqual([
      "image",
      "(src: Frame, x: number) => void",
      true,
    ]);
  });

  test("keeps an inline object type in one piece", () => {
    const source =
      "interface A {\n  /** Nested. */\n  camera: { x: number; y: number };\n  /** After. */\n  size: number;\n}";
    expect(parseMembers(source).map((m) => m.name)).toEqual(["camera", "size"]);
  });

  test("reads a method as callable", () => {
    const source = "interface A {\n  /** Finds it. */\n  layer(name: string): Layer;\n}";
    const [member] = parseMembers(source);
    expect([member?.name, member?.callable]).toEqual(["layer", true]);
  });

  test("reads the members of a const object", () => {
    const source =
      "const Blend: {\n  /** Over. */\n  readonly Normal: 0;\n  /** Added. */\n  readonly Add: 1;\n};";
    expect(parseMembers(source).map((m) => [m.name, m.type])).toEqual([
      ["Normal", "0"],
      ["Add", "1"],
    ]);
  });

  test("is empty for a function, which has no body to split", () => {
    expect(parseMembers("function circle(x: number, y: number): void;")).toEqual([]);
  });
});
