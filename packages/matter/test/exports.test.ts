import { describe, expect, test } from "bun:test";
import * as matter from "../src/index";

/**
 * A class re-exported through `export type` typechecks and builds cleanly, then
 * is undefined at runtime. Only an actual runtime check catches it, so the
 * umbrella's value exports are pinned here.
 */
describe("matter exports", () => {
  test("exports the application API as runtime values", () => {
    expect(typeof matter.start).toBe("function");
    expect(typeof matter.AppClock).toBe("function");
    expect(typeof matter.createPluginHost).toBe("function");
  });

  test("exports the command buffer API as values, not just types", () => {
    expect(typeof matter.CommandBuffer).toBe("function");
    expect(typeof matter.decode).toBe("function");
    expect(typeof matter.UnknownOpcodeError).toBe("function");
    expect(typeof matter.Op).toBe("object");
    expect(typeof matter.OP_SIZE).toBe("object");
  });

  test("the re-exported CommandBuffer is usable", () => {
    const buf = new matter.CommandBuffer();
    buf.circle(1, 2, 3);
    expect(buf.length).toBe(4);
    expect(buf.u32[0]).toBe(matter.Op.Circle);
  });
});
