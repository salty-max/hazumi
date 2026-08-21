import { describe, expect, test } from "bun:test";
import { Canvas2dRenderer } from "../src/index";

function pixelHarness(): {
  readonly canvas: HTMLCanvasElement;
  readonly source: ImageData;
  readonly written: ImageData[];
} {
  const written: ImageData[] = [];
  const source = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]),
  } as ImageData;
  const context = {
    lineCap: "butt",
    lineJoin: "miter",
    getImageData: (): ImageData => source,
    createImageData: (width: number, height: number): ImageData =>
      ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
    putImageData: (image: ImageData): void => void written.push(image),
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 2,
    height: 1,
    getContext: (): CanvasRenderingContext2D => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, source, written };
}

describe("Canvas2dRenderer pixels", () => {
  test("returns an owned top-down snapshot", () => {
    const h = pixelHarness();
    const renderer = new Canvas2dRenderer(h.canvas, { willReadFrequently: true });

    const pixels = renderer.readPixels();
    pixels.data[0] = 99;

    expect(pixels.width).toBe(2);
    expect(pixels.height).toBe(1);
    expect(Array.from(pixels.data)).toEqual([99, 2, 3, 255, 4, 5, 6, 128]);
    expect(h.source.data[0]).toBe(1);
  });

  test("writes through ImageData and validates physical dimensions", () => {
    const h = pixelHarness();
    const renderer = new Canvas2dRenderer(h.canvas);
    const data = new Uint8ClampedArray([9, 8, 7, 6, 5, 4, 3, 2]);

    renderer.writePixels({ width: 2, height: 1, data });

    expect(h.written).toHaveLength(1);
    expect(h.written[0]!.data).toEqual(data);
    expect(() =>
      renderer.writePixels({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
    ).toThrow("expected 2x1");
  });
});
