import { describe, expect, test } from "bun:test";
import * as app from "matter/app";
import * as assets from "matter/assets";
import * as debug from "matter/debug";
import * as draw from "matter/draw";
import * as input from "matter/input";
import * as physicsPlugin from "matter/physics";
import * as scene from "matter/scene";

describe("capability subpath exports", () => {
  test("ship their runtime values", () => {
    expect(typeof app.start).toBe("function");
    expect(typeof assets.loadImage).toBe("function");
    expect(typeof assets.spritesheet).toBe("function");
    expect(typeof draw.circle).toBe("function");
    expect(typeof draw.scoped).toBe("function");
    expect(typeof draw.NoActiveSceneError).toBe("function");
    expect(typeof input.keyIsDown).toBe("function");
    expect(typeof input.input).toBe("object");
    expect(typeof scene.screen).toBe("object");
    expect(typeof scene.time).toBe("object");
    expect(typeof scene.camera).toBe("object");
    expect(typeof scene.random).toBe("object");
    expect(typeof physicsPlugin.physics).toBe("function");
    expect(typeof physicsPlugin.Shape).toBe("object");
    expect(typeof debug.overlay).toBe("function");
  });
});
