import { describe, expect, test } from "bun:test";
import {
  enterContext,
  getActiveContext,
  NoActiveSceneError,
  restoreContext,
} from "../src/active-context";
import type { MatterContext } from "../src/context";

function context(width: number): MatterContext {
  return { width } as MatterContext;
}

describe("active scene context", () => {
  test("fails clearly outside a lifecycle callback", () => {
    expect(() => getActiveContext()).toThrow(NoActiveSceneError);
  });

  test("restores nested contexts in stack order", () => {
    const outer = context(320);
    const inner = context(640);
    const beforeOuter = enterContext(outer);
    expect(getActiveContext()).toBe(outer);

    const beforeInner = enterContext(inner);
    expect(getActiveContext()).toBe(inner);
    restoreContext(beforeInner);
    expect(getActiveContext()).toBe(outer);
    restoreContext(beforeOuter);

    expect(() => getActiveContext()).toThrow(NoActiveSceneError);
  });
});
