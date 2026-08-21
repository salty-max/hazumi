import { describe, expect, test } from 'bun:test';
import { CommandBuffer } from '@matter/graphics';
import { Canvas2dRenderer } from '../src/index';

function viewportHarness(
  width: number,
  height: number,
): {
  readonly canvas: HTMLCanvasElement;
  readonly transforms: number[][];
} {
  const transforms: number[][] = [];
  const context = {
    lineCap: 'butt',
    lineJoin: 'miter',
    globalCompositeOperation: 'source-over',
    setTransform: (...values: number[]): void => void transforms.push(values),
    save: (): void => {},
    restore: (): void => {},
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width,
    height,
    getContext: (): CanvasRenderingContext2D => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, transforms };
}

describe('Canvas2dRenderer viewport', () => {
  test('maps logical coordinates across the physical backing store', () => {
    const h = viewportHarness(200, 150);
    const renderer = new Canvas2dRenderer(h.canvas);
    renderer.setViewport(100, 50);

    renderer.render(new CommandBuffer());

    expect(h.transforms).toEqual([[2, 0, 0, 3, 0, 0]]);
  });

  test('resetTransform returns to logical space rather than raw device pixels', () => {
    const h = viewportHarness(200, 100);
    const renderer = new Canvas2dRenderer(h.canvas);
    renderer.setViewport(100, 50);
    const buffer = new CommandBuffer();
    buffer.resetTransform();

    renderer.render(buffer);

    expect(h.transforms).toEqual([
      [2, 0, 0, 2, 0, 0],
      [2, 0, 0, 2, 0, 0],
    ]);
  });
});
