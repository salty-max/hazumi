import { beforeEach, describe, expect, test } from 'bun:test';
import { Blend, CommandBuffer } from '@matter/graphics';
import { record } from '@matter/backend-headless';
import { ColorCache } from '../src/color-cache';
import { type ContextState, createContext, type SketchContext } from '../src/context';

/**
 * The context is pure — buffer in, commands out — so the whole public drawing
 * API is testable in Node without a canvas. Assertions are on the recorded
 * command stream, which is what backend-headless exists for.
 */
function makeContext(): {
  ctx: SketchContext;
  buffer: CommandBuffer;
  state: ContextState;
  beginFrame: () => void;
  ops: () => string[];
} {
  const buffer = new CommandBuffer();
  const state: ContextState = {
    width: 400, height: 300, frameCount: 0, t: 0, dt: 0,
    mouseX: 0, mouseY: 0, mouseIsPressed: false, looping: true,
  };
  const { context, beginFrame } = createContext({
    buffer,
    colors: new ColorCache(),
    state,
    seed: 42,
  });
  return {
    ctx: context,
    buffer,
    state,
    beginFrame,
    ops: () => record(buffer).map((c) => c.op),
  };
}

describe('environment', () => {
  test('reads live state rather than a snapshot', () => {
    const { ctx, state } = makeContext();
    expect(ctx.width).toBe(400);
    state.width = 800;
    state.frameCount = 12;
    state.mouseX = 55;
    // Destructuring in a draw callback must see the current frame's values.
    expect(ctx.width).toBe(800);
    expect(ctx.frameCount).toBe(12);
    expect(ctx.mouseX).toBe(55);
  });

  test('random and noise are seeded, so runs reproduce', () => {
    const a = makeContext().ctx;
    const b = makeContext().ctx;
    expect(a.random.next()).toBe(b.random.next());
    expect(a.noise.noise2(1.3, 2.7)).toBe(b.noise.noise2(1.3, 2.7));
  });
});

describe('drawing', () => {
  let h: ReturnType<typeof makeContext>;
  beforeEach(() => {
    h = makeContext();
    h.buffer.reset();
  });

  test('circle takes a diameter, matching p5', () => {
    h.ctx.circle(10, 20, 100);
    const cmd = record(h.buffer).find((c) => c.op === 'circle');
    // Halved to the radius the buffer stores — a ported p5 sketch keeps its
    // sizes.
    expect(cmd?.args).toEqual([10, 20, 50]);
  });

  test('ellipse takes width and height', () => {
    h.ctx.ellipse(10, 20, 100, 60);
    expect(record(h.buffer).find((c) => c.op === 'ellipse')?.args).toEqual([10, 20, 50, 30]);
  });

  test('square is a rect', () => {
    h.ctx.square(5, 6, 30);
    expect(record(h.buffer).find((c) => c.op === 'rect')?.args).toEqual([5, 6, 30, 30]);
  });

  test('point paints with the stroke colour, not the fill', () => {
    h.ctx.stroke('#ff0000');
    h.ctx.strokeWeight(8);
    h.buffer.reset();
    h.ctx.point(50, 60);

    const ops = record(h.buffer).map((c) => c.op);
    // Wrapped in push/pop so it cannot leak the substituted fill.
    expect(ops).toEqual(['push', 'setFill', 'setStrokeWidth', 'circle', 'pop']);
  });

  test('point with no stroke draws nothing', () => {
    h.ctx.noStroke();
    h.buffer.reset();
    h.ctx.point(50, 60);
    expect(record(h.buffer)).toHaveLength(0);
  });
});

describe('style', () => {
  test('noFill emits a zero-alpha fill', () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.noFill();
    expect(record(h.buffer).find((c) => c.op === 'setFill')?.args).toEqual([0, 0, 0, 0]);
  });

  test('noStroke zeroes the stroke width', () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.noStroke();
    expect(record(h.buffer).find((c) => c.op === 'setStrokeWidth')?.args).toEqual([0]);
  });

  test('colour strings are parsed and cached', () => {
    const colors = new ColorCache();
    const buffer = new CommandBuffer();
    const state: ContextState = {
      width: 1, height: 1, frameCount: 0, t: 0, dt: 0,
      mouseX: 0, mouseY: 0, mouseIsPressed: false, looping: true,
    };
    const { context } = createContext({ buffer, colors, state, seed: 1 });

    // createContext already resolved the default fill, so measure the delta.
    const missesBefore = colors.misses;
    for (let i = 0; i < 100; i++) context.fill('#ff0000');

    // One parse, ninety-nine hits — this runs per shape per frame.
    expect(colors.misses - missesBefore).toBe(1);
    expect(colors.hits).toBeGreaterThanOrEqual(99);
  });
});

describe('with()', () => {
  test('restores style after the body', () => {
    const h = makeContext();
    h.ctx.fill('#ff0000');
    h.buffer.reset();

    h.ctx.with({ fill: '#00ff00', strokeWeight: 9 }, () => {
      h.ctx.circle(0, 0, 10);
    });
    h.ctx.circle(1, 1, 10);

    const ops = h.ops();
    expect(ops[0]).toBe('push');
    expect(ops).toContain('pop');
    // The trailing circle is drawn after state was restored.
    expect(ops.at(-1)).toBe('circle');
  });

  test('restores even when the body throws', () => {
    const h = makeContext();
    h.buffer.reset();

    expect(() => {
      h.ctx.with({ fill: '#00ff00' }, () => {
        throw new Error('boom');
      });
    }).toThrow('boom');

    // A forgotten pop is the classic p5 bug; the scoped form makes it
    // impossible even on the error path.
    expect(h.ops()).toContain('pop');
  });

  test('nests', () => {
    const h = makeContext();
    h.buffer.reset();
    h.ctx.with({ fill: '#111111' }, () => {
      h.ctx.with({ fill: '#222222' }, () => {
        h.ctx.circle(0, 0, 1);
      });
    });
    const ops = h.ops();
    expect(ops.filter((o) => o === 'push')).toHaveLength(2);
    expect(ops.filter((o) => o === 'pop')).toHaveLength(2);
  });

  test('leaves unmentioned properties alone', () => {
    const h = makeContext();
    h.ctx.strokeWeight(4);
    h.ctx.stroke('#ffffff');
    h.buffer.reset();

    h.ctx.with({ fill: '#ff0000' }, () => {
      h.ctx.circle(0, 0, 1);
    });

    // No stroke commands emitted: `with` only touched fill.
    expect(h.ops().filter((o) => o.startsWith('setStroke'))).toHaveLength(0);
  });
});

describe('frame lifecycle', () => {
  test('beginFrame re-emits current style into a reset buffer', () => {
    const h = makeContext();
    h.ctx.fill('#123456');
    h.ctx.blendMode(Blend.Add);

    h.buffer.reset();
    h.beginFrame();

    // Style set during setup survives the per-frame buffer reset.
    expect(h.ops()).toEqual(['setFill', 'setStroke', 'setStrokeWidth', 'setBlend']);
    expect(record(h.buffer).find((c) => c.op === 'setBlend')?.args).toEqual([Blend.Add]);
  });
});

describe('loop control', () => {
  test('noLoop and loop toggle the shared state', () => {
    const h = makeContext();
    expect(h.ctx.isLooping()).toBe(true);
    h.ctx.noLoop();
    expect(h.state.looping).toBe(false);
    expect(h.ctx.isLooping()).toBe(false);
    h.ctx.loop();
    expect(h.ctx.isLooping()).toBe(true);
  });
});
