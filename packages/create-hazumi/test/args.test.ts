import { describe, expect, test } from "bun:test";

import { HELP, parseArgs, parseTemplateChoice, parseYesNo, TemplateKind } from "../src/args";
import { UserError } from "../src/errors";

describe("parseArgs", () => {
  test("defaults to an interactive wizard with no flags", () => {
    expect(parseArgs([])).toEqual({
      help: false,
      yes: false,
      local: false,
      autoImport: false,
      install: undefined,
      template: undefined,
      directory: undefined,
    });
  });

  test("accepts a directory and the documented flags", () => {
    expect(
      parseArgs(["my-game", "--yes", "--local", "--auto-import", "--no-install", "-t", "game"]),
    ).toEqual({
      help: false,
      yes: true,
      local: true,
      autoImport: true,
      install: false,
      template: TemplateKind.Game,
      directory: "my-game",
    });
  });

  test("accepts --template=sketch", () => {
    expect(parseArgs(["--template=sketch"]).template).toBe(TemplateKind.Sketch);
  });

  test("prints help without scaffolding", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(HELP).toContain("--template");
    expect(HELP).toContain("--local");
  });

  test("rejects an unknown template", () => {
    expect(() => parseArgs(["--template", "unity"])).toThrow(UserError);
  });

  test("rejects an unknown flag", () => {
    expect(() => parseArgs(["--overwrite"])).toThrow("Unknown flag --overwrite");
  });

  test("rejects a second directory", () => {
    expect(() => parseArgs(["one", "two"])).toThrow("at most one directory");
  });

  test("rejects a template flag with no value", () => {
    expect(() => parseArgs(["--template"])).toThrow("missing a value");
  });
});

describe("parseTemplateChoice", () => {
  test("accepts numbers and names", () => {
    expect(parseTemplateChoice("1")).toBe(TemplateKind.Sketch);
    expect(parseTemplateChoice("sketch")).toBe(TemplateKind.Sketch);
    expect(parseTemplateChoice("2")).toBe(TemplateKind.Game);
    expect(parseTemplateChoice("GAME")).toBe(TemplateKind.Game);
    expect(parseTemplateChoice("3")).toBeUndefined();
  });
});

describe("parseYesNo", () => {
  test("empty input uses the fallback", () => {
    expect(parseYesNo("", true)).toBe(true);
    expect(parseYesNo("  ", false)).toBe(false);
  });

  test("accepts y/n and yes/no", () => {
    expect(parseYesNo("y", false)).toBe(true);
    expect(parseYesNo("Yes", false)).toBe(true);
    expect(parseYesNo("n", true)).toBe(false);
    expect(parseYesNo("NO", true)).toBe(false);
    expect(parseYesNo("maybe", true)).toBeUndefined();
  });
});
