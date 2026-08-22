import { describe, expect, test } from "bun:test";
import * as hazumi from "../src/index";

/**
 * A class re-exported through `export type` typechecks and builds cleanly, then
 * is undefined at runtime. Only an actual runtime check catches it, so the
 * umbrella's value exports are pinned here.
 */
describe("hazumi exports", () => {
  test("exports the application API as runtime values", () => {
    expect(typeof hazumi.start).toBe("function");
    expect(typeof hazumi.AppClock).toBe("function");
    expect(typeof hazumi.createPluginHost).toBe("function");
    expect(typeof hazumi.audio).toBe("function");
    expect(typeof hazumi.physicsHost).toBe("function");
    expect(typeof hazumi.overlay).toBe("function");
    expect(typeof hazumi.PhysicsPluginInUseError).toBe("function");
    expect(typeof hazumi.OverlayPluginInUseError).toBe("function");
    expect(typeof hazumi.Pixels).toBe("function");
    expect(typeof hazumi.PixelAccessUnavailableError).toBe("function");
    expect(typeof hazumi.TextMeasurementUnavailableError).toBe("function");
    expect(typeof hazumi.DuplicatePluginError).toBe("function");
    expect(typeof hazumi.DuplicateContributionError).toBe("function");
    expect(typeof hazumi.ReservedContributionError).toBe("function");
  });

  test("exports the command buffer API as values, not just types", () => {
    expect(typeof hazumi.oklch).toBe("function");
    expect(typeof hazumi.rgb).toBe("function");
    expect(typeof hazumi.CommandBuffer).toBe("function");
    expect(typeof hazumi.decode).toBe("function");
    expect(typeof hazumi.UnknownOpcodeError).toBe("function");
    expect(typeof hazumi.Op).toBe("object");
    expect(typeof hazumi.OP_SIZE).toBe("object");
  });

  test("exports collision math as a runtime namespace", () => {
    expect(typeof hazumi.collision.aabb).toBe("function");
    expect(typeof hazumi.collision.raycastAabb).toBe("function");
    expect(typeof hazumi.collision.sweepCircle).toBe("function");
    expect(typeof hazumi.collision.slideAabb).toBe("function");
  });

  test("exports pathfinding as a runtime namespace", () => {
    expect(typeof hazumi.pathfind.grid).toBe("function");
    expect(typeof hazumi.pathfind.astar).toBe("function");
    expect(typeof hazumi.pathfind.createPath).toBe("function");
  });

  test("exports rigid-body physics as a runtime namespace", () => {
    expect(typeof hazumi.physics.world).toBe("function");
    expect(typeof hazumi.physics.PhysicsWorld).toBe("function");
    expect(typeof hazumi.physics.Shape).toBe("object");
  });

  test("exports tilemaps as runtime values", () => {
    expect(typeof hazumi.tilemap).toBe("function");
    expect(hazumi.EMPTY_TILE).toBe(-1);
  });

  test("exports sliceFrame as a runtime value", () => {
    expect(typeof hazumi.sliceFrame).toBe("function");
    expect(typeof hazumi.spritesheet).toBe("function");
  });

  test("exports particles as a runtime value", () => {
    expect(typeof hazumi.particles).toBe("function");
  });

  test("the re-exported CommandBuffer is usable", () => {
    const buf = new hazumi.CommandBuffer();
    buf.circle(1, 2, 3);
    expect(buf.length).toBe(4);
    expect(buf.u32[0]).toBe(hazumi.Op.Circle);
  });
});
