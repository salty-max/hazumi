import { describe, expect, test } from "bun:test";
import { record } from "@matter/backend-headless";
import { toSvg } from "@matter/backend-svg";
import { CommandBuffer } from "@matter/graphics";
import { createCamera2D } from "../src/camera";

describe("Camera2D view", () => {
  test("defaults to the existing canvas coordinate system", () => {
    const buffer = new CommandBuffer();
    const { camera, beginFrame } = createCamera2D(buffer, 400, 300);

    beginFrame();

    expect(camera.x).toBe(200);
    expect(camera.y).toBe(150);
    expect(camera.zoom).toBe(1);
    expect(record(buffer)).toEqual([]);
  });

  test("centres a world position and applies zoom in transform order", () => {
    const buffer = new CommandBuffer();
    const { camera, beginFrame } = createCamera2D(buffer, 400, 300);
    camera.lookAt(100, 80);
    camera.setZoom(2);

    buffer.reset();
    beginFrame();

    expect(record(buffer)).toEqual([
      { op: "translate", args: [200, 150] },
      { op: "scale", args: [2, 2] },
      { op: "translate", args: [-100, -80] },
    ]);
  });

  test("follow moves a stable fraction toward its target", () => {
    const buffer = new CommandBuffer();
    const { camera } = createCamera2D(buffer, 400, 300);

    camera.follow(300, 50, 0.25);

    expect(camera.x).toBe(225);
    expect(camera.y).toBe(125);
  });

  test("rejects values that would make the view silently disappear", () => {
    const buffer = new CommandBuffer();
    const { camera } = createCamera2D(buffer, 400, 300);

    expect(() => camera.lookAt(Number.NaN, 0)).toThrow(RangeError);
    expect(() => camera.setZoom(0)).toThrow(RangeError);
    expect(() => camera.follow(0, 0, 1.1)).toThrow(RangeError);
  });

  test("keeps the default canvas coordinate system after resize", () => {
    const buffer = new CommandBuffer();
    const { camera, beginFrame, resize } = createCamera2D(buffer, 400, 300);

    resize(800, 450);
    buffer.reset();
    beginFrame();

    expect(camera.x).toBe(400);
    expect(camera.y).toBe(225);
    expect(camera.worldToScreen(32, 48)).toEqual({ x: 32, y: 48 });
    expect(record(buffer)).toEqual([]);
  });

  test("preserves an explicitly positioned world view after resize", () => {
    const buffer = new CommandBuffer();
    const { camera, resize } = createCamera2D(buffer, 400, 300);
    // Explicitly pinning the current default is still an intentional world view.
    camera.lookAt(200, 150);

    resize(800, 450);

    expect(camera.x).toBe(200);
    expect(camera.y).toBe(150);
    expect(camera.worldToScreen(200, 150)).toEqual({ x: 400, y: 225 });
  });
});

describe("coordinate conversion", () => {
  test("world and screen conversions round-trip under pan and zoom", () => {
    const buffer = new CommandBuffer();
    const { camera } = createCamera2D(buffer, 400, 300);
    camera.lookAt(100, 80);
    camera.setZoom(2);

    const screen = camera.worldToScreen(130, 100);
    const world = camera.screenToWorld(screen.x, screen.y);

    expect(screen).toEqual({ x: 260, y: 190 });
    expect(world.x).toBeCloseTo(130);
    expect(world.y).toBeCloseTo(100);
  });

  test("writes into a reusable point when supplied", () => {
    const buffer = new CommandBuffer();
    const { camera } = createCamera2D(buffer, 400, 300);
    const out = { x: 0, y: 0 };

    expect(camera.screenToWorld(10, 20, out)).toBe(out);
    expect(out).toEqual({ x: 10, y: 20 });
  });
});

describe("screen-space drawing", () => {
  test("draws HUD commands at identity then restores the world view", () => {
    const buffer = new CommandBuffer();
    const { camera, beginFrame } = createCamera2D(buffer, 400, 300);
    camera.lookAt(100, 80);
    camera.setZoom(2);
    buffer.reset();
    beginFrame();

    buffer.circle(100, 80, 5);
    camera.screen(() => {
      buffer.rect(10, 10, 40, 20);
    });
    buffer.circle(120, 80, 5);

    const svg = toSvg(buffer, 400, 300);
    const circles = svg.split("\n").filter((line) => line.includes("<circle"));
    const rect = svg.split("\n").find((line) => line.includes("<rect"));

    expect(circles).toHaveLength(2);
    expect(circles[0]).toContain('transform="matrix(2 0 0 2 0 -10)"');
    expect(circles[1]).toContain('transform="matrix(2 0 0 2 0 -10)"');
    expect(rect).not.toContain("transform=");
  });

  test("restores the view even when HUD drawing throws", () => {
    const buffer = new CommandBuffer();
    const { camera } = createCamera2D(buffer, 400, 300);
    camera.lookAt(100, 80);
    buffer.reset();

    expect(() =>
      camera.screen(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(record(buffer).map((command) => command.op)).toEqual([
      "resetTransform",
      "resetTransform",
      "translate",
    ]);
  });
});
