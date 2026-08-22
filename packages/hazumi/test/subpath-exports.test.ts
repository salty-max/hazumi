import { describe, expect, test } from "bun:test";
import * as app from "hazumi/app";
import * as assets from "hazumi/assets";
import * as debug from "hazumi/debug";
import * as draw from "hazumi/draw";
import * as input from "hazumi/input";
import * as physicsPlugin from "hazumi/physics";
import * as scene from "hazumi/scene";

describe("capability subpath exports", () => {
  test("ship their runtime values", () => {
    expect(typeof app.start).toBe("function");
    expect(typeof assets.loadImage).toBe("function");
    expect(typeof assets.spritesheet).toBe("function");
    expect(typeof draw.circle).toBe("function");
    expect(typeof draw.tint).toBe("function");
    expect(typeof draw.noTint).toBe("function");
    expect(typeof assets.sliceFrame).toBe("function");
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
