import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { UserError } from "../src/errors";
import { resolveTarget, toPackageName } from "../src/names";

describe("toPackageName", () => {
  test("lowercases and hyphenates", () => {
    expect(toPackageName("My Scene")).toBe("my-scene");
    expect(toPackageName("  Blood_Mage  ")).toBe("blood_mage");
  });

  test("rejects empty and reserved names", () => {
    expect(() => toPackageName("")).toThrow(UserError);
    expect(() => toPackageName("...")).toThrow(UserError);
    expect(() => toPackageName(".")).toThrow(UserError);
    expect(() => toPackageName("node_modules")).toThrow(UserError);
  });
});

describe("resolveTarget", () => {
  const cwd = "/tmp/matter-projects";

  test("creates a subdirectory from a name", () => {
    expect(resolveTarget(cwd, "My Game")).toEqual({
      directory: join(cwd, "my-game"),
      name: "my-game",
    });
  });

  test("keeps a parent path and sanitizes the last segment", () => {
    expect(resolveTarget(cwd, "games/My Game")).toEqual({
      directory: join(cwd, "games", "my-game"),
      name: "my-game",
    });
  });

  test("dot uses the current directory's basename", () => {
    expect(resolveTarget(join(cwd, "orion"), ".")).toEqual({
      directory: join(cwd, "orion"),
      name: "orion",
    });
  });
});
