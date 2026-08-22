import { describe, expect, test } from "bun:test";

import { detectPackageManager, spawnArgs } from "../src/install";

describe("detectPackageManager", () => {
  test("reads the name from npm_config_user_agent", () => {
    expect(detectPackageManager("bun/1.3.14 npm/? node/v22.0.0")).toBe("bun");
    expect(detectPackageManager("npm/10.9.0 node/v22.0.0")).toBe("npm");
    expect(detectPackageManager("pnpm/9.0.0 npm/? node/v22.0.0")).toBe("pnpm");
    expect(detectPackageManager("yarn/1.22.22 npm/? node/v22.0.0")).toBe("yarn");
  });

  test("defaults to bun when the agent is missing", () => {
    expect(detectPackageManager(undefined)).toBe("bun");
    expect(detectPackageManager("unknown/1")).toBe("bun");
  });
});

describe("spawnArgs", () => {
  test("yarn install is just yarn", () => {
    expect(spawnArgs("yarn")).toEqual({ command: "yarn", args: [] });
    expect(spawnArgs("bun")).toEqual({ command: "bun", args: ["install"] });
    expect(spawnArgs("npm")).toEqual({ command: "npm", args: ["install"] });
  });
});
