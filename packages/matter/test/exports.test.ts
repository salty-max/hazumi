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
    expect(typeof matter.audio).toBe("function");
    expect(typeof matter.physicsHost).toBe("function");
    expect(typeof matter.overlay).toBe("function");
    expect(typeof matter.PhysicsPluginInUseError).toBe("function");
    expect(typeof matter.OverlayPluginInUseError).toBe("function");
    expect(typeof matter.Pixels).toBe("function");
    expect(typeof matter.PixelAccessUnavailableError).toBe("function");
  });

  test("exports the command buffer API as values, not just types", () => {
    expect(typeof matter.CommandBuffer).toBe("function");
    expect(typeof matter.decode).toBe("function");
    expect(typeof matter.UnknownOpcodeError).toBe("function");
    expect(typeof matter.Op).toBe("object");
    expect(typeof matter.OP_SIZE).toBe("object");
  });

  test("exports collision math as a runtime namespace", () => {
    expect(typeof matter.collision.aabb).toBe("function");
    expect(typeof matter.collision.raycastAabb).toBe("function");
    expect(typeof matter.collision.sweepCircle).toBe("function");
    expect(typeof matter.collision.slideAabb).toBe("function");
  });

  test("exports pathfinding as a runtime namespace", () => {
    expect(typeof matter.pathfind.grid).toBe("function");
    expect(typeof matter.pathfind.astar).toBe("function");
    expect(typeof matter.pathfind.createPath).toBe("function");
  });

  test("exports rigid-body physics as a runtime namespace", () => {
    expect(typeof matter.physics.world).toBe("function");
    expect(typeof matter.physics.PhysicsWorld).toBe("function");
    expect(typeof matter.physics.Shape).toBe("object");
  });

  test("exports tilemaps as runtime values", () => {
    expect(typeof matter.tilemap).toBe("function");
    expect(matter.EMPTY_TILE).toBe(-1);
  });

  test("the re-exported CommandBuffer is usable", () => {
    const buf = new matter.CommandBuffer();
    buf.circle(1, 2, 3);
    expect(buf.length).toBe(4);
    expect(buf.u32[0]).toBe(matter.Op.Circle);
  });
});
