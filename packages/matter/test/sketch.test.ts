import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { record, type RecordedCommand } from '@matter/backend-headless';
import type { CommandBuffer, Renderer } from '@matter/graphics';
import { sketch } from '../src/sketch';

class TestCanvas extends EventTarget {
  width = 0;
  height = 0;
  removed = false;
  readonly style = { width: '', height: '' };

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0 } as DOMRect;
  }

  remove(): void {
    this.removed = true;
  }
}

interface RuntimeHarness {
  readonly canvas: HTMLCanvasElement;
  readonly frames: RecordedCommand[][];
  readonly renderer: Renderer;
  runFrame: (nowMs: number) => void;
}

const originalDocument = globalThis.document;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

let callbacks: FrameRequestCallback[];

beforeEach(() => {
  callbacks = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback): number => {
      callbacks.push(callback);
      return callbacks.length;
    },
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (): void => {},
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: originalRequestAnimationFrame,
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: originalCancelAnimationFrame,
  });
});

function harness(): RuntimeHarness {
  const fakeCanvas = new TestCanvas();
  const canvas = fakeCanvas as unknown as HTMLCanvasElement;
  const frames: RecordedCommand[][] = [];
  const renderer: Renderer = {
    render: (buffer: CommandBuffer): void => {
      frames.push(record(buffer));
    },
    setViewport: (): void => {},
    dispose: (): void => {},
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (): HTMLCanvasElement => canvas,
      body: { append: (): void => {} },
    },
  });

  return {
    canvas,
    frames,
    renderer,
    runFrame: (nowMs: number): void => {
      const callback = callbacks.shift();
      if (callback === undefined) throw new Error('No animation frame is queued');
      callback(nowMs);
    },
  };
}

describe('fixed loop', () => {
  test('validates timing before acquiring the renderer', () => {
    const h = harness();
    let acquisitions = 0;

    expect(() =>
      sketch(
        {
          backend: () => {
            acquisitions++;
            return h.renderer;
          },
          canvas: h.canvas,
          clock: { fixedStep: 0 },
        },
        () => {},
      ),
    ).toThrow(RangeError);
    expect(acquisitions).toBe(0);
  });

  test('updates at a fixed rate and draws once with the remainder alpha', async () => {
    const h = harness();
    const updates: number[] = [];
    const alphas: number[] = [];
    const handle = sketch(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.1, maxDelta: 1 },
      },
      () => ({
        update: (dt, context): void => {
          updates.push(dt);
          // Commands emitted from update must not leak into the draw stream.
          context.rect(0, 0, 10, 10);
        },
        draw: (alpha, context): void => {
          alphas.push(alpha);
          context.circle(20, 20, 10);
        },
      }),
    );

    await handle.ready;
    h.runFrame(0);
    h.runFrame(350);

    expect(updates).toEqual([0.1, 0.1, 0.1]);
    expect(alphas).toHaveLength(2);
    expect(alphas[0]).toBe(0);
    expect(alphas[1]).toBeCloseTo(0.5);
    expect(h.frames).toHaveLength(2);
    expect(h.frames[1]?.filter((command) => command.op === 'circle')).toHaveLength(1);
    expect(h.frames[1]?.some((command) => command.op === 'rect')).toBe(false);

    handle.stop();
  });

  test('caps catch-up work and drops unaffordable time', async () => {
    const h = harness();
    let updates = 0;
    let alpha = -1;
    const handle = sketch(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.01, maxDelta: 1, maxFixedSteps: 3 },
      },
      () => ({
        update: (): void => {
          updates++;
        },
        draw: (remainder): void => {
          alpha = remainder;
        },
      }),
    );

    await handle.ready;
    h.runFrame(0);
    h.runFrame(1000);

    expect(updates).toBe(3);
    expect(alpha).toBe(0);

    handle.stop();
  });

  test('an update error stops the loop and reaches onError', async () => {
    const h = harness();
    const errors: unknown[] = [];
    let draws = 0;
    const failure = new Error('update failed');
    const handle = sketch(
      {
        backend: () => h.renderer,
        canvas: h.canvas,
        clock: { fixedStep: 0.01 },
        onError: (error): void => void errors.push(error),
      },
      () => ({
        update: (): void => {
          throw failure;
        },
        draw: (): void => {
          draws++;
        },
      }),
    );

    await handle.ready;
    h.runFrame(0);
    h.runFrame(20);
    h.runFrame(40);

    expect(errors).toEqual([failure]);
    expect(draws).toBe(1);
    expect(handle.context.isLooping()).toBe(false);

    handle.stop();
  });
});

describe('variable loop compatibility', () => {
  test('keeps passing the live context to a legacy draw function', async () => {
    const h = harness();
    const deltas: number[] = [];
    const handle = sketch(
      { backend: () => h.renderer, canvas: h.canvas },
      () =>
        (context): void =>
          void deltas.push(context.dt),
    );

    await handle.ready;
    h.runFrame(100);
    h.runFrame(116);

    expect(deltas[0]).toBe(0);
    expect(deltas[1]).toBeCloseTo(0.016);

    handle.stop();
  });
});
