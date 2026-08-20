import { describe, expect, test } from 'bun:test';
import {
  createSketch,
  definePlugin,
  DuplicatePluginError,
  type SketchCore,
} from '../src/index';

interface PhysicsApi {
  gravity: number;
  stepCount: () => number;
}

interface AudioApi {
  volume: number;
}

function makePhysics(log: string[] = []) {
  let steps = 0;
  return definePlugin<PhysicsApi>({
    name: 'physics',
    setup: () => {
      log.push('physics:setup');
      return { gravity: 9.8, stepCount: () => steps };
    },
    presetup: () => void log.push('physics:presetup'),
    postsetup: () => void log.push('physics:postsetup'),
    predraw: () => {
      steps++;
      log.push('physics:predraw');
    },
    postdraw: () => void log.push('physics:postdraw'),
    dispose: () => void log.push('physics:dispose'),
  });
}

const audio = definePlugin<AudioApi>({
  name: 'audio',
  setup: () => ({ volume: 0.8 }),
});

describe('type accumulation', () => {
  test('composed plugin APIs are available at runtime', () => {
    const sketch = createSketch().use(makePhysics()).use(audio).build();
    expect(sketch.gravity).toBe(9.8);
    expect(sketch.volume).toBe(0.8);
    expect(sketch.plugins).toEqual(['physics', 'audio']);
  });

  /**
   * The runtime test above passes even if the types are `any`. These assertions
   * fail at compile time instead, which is where the actual claim lives: `use`
   * must widen the sketch type without any declaration merging.
   */
  test('composed plugin APIs are visible to the type checker', () => {
    const sketch = createSketch().use(makePhysics()).use(audio).build();

    // Assignable to the exact composed shape.
    const typed: SketchCore & PhysicsApi & AudioApi = sketch;
    const gravity: number = typed.gravity;
    const volume: number = typed.volume;
    expect(gravity + volume).toBeCloseTo(10.6);

    // @ts-expect-error — nothing contributed `missing`, so this must not compile.
    const absent = sketch.missing;
    expect(absent).toBeUndefined();
  });

  test('a plugin that contributes nothing still composes', () => {
    const silent = definePlugin({ name: 'silent' });
    const sketch = createSketch().use(silent).use(audio).build();
    expect(sketch.volume).toBe(0.8);
    expect(sketch.plugins).toEqual(['silent', 'audio']);
  });

  test('an empty sketch builds', () => {
    const sketch = createSketch().build();
    expect(sketch.plugins).toEqual([]);
  });

  test('use() does not mutate the builder it was called on', () => {
    const base = createSketch().use(audio);
    const withPhysics = base.use(makePhysics());
    expect(base.build().plugins).toEqual(['audio']);
    expect(withPhysics.build().plugins).toEqual(['audio', 'physics']);
  });

  test('rejects duplicate plugin names', () => {
    expect(() => createSketch().use(audio).use(audio)).toThrow(DuplicatePluginError);
    try {
      createSketch().use(audio).use(audio);
    } catch (error) {
      expect((error as DuplicatePluginError).pluginName).toBe('audio');
    }
  });
});

describe('lifecycle dispatch', () => {
  test('runs hooks in registration order', async () => {
    const log: string[] = [];
    const sketch = createSketch().use(makePhysics(log)).build();

    await sketch.presetup();
    await sketch.postsetup();
    sketch.predraw(0.016);
    sketch.postdraw(0.016);

    expect(log).toEqual([
      'physics:setup',
      'physics:presetup',
      'physics:postsetup',
      'physics:predraw',
      'physics:postdraw',
    ]);
  });

  test('disposes in reverse order', () => {
    const log: string[] = [];
    const first = definePlugin({ name: 'first', dispose: () => void log.push('first') });
    const second = definePlugin({ name: 'second', dispose: () => void log.push('second') });

    createSketch().use(first).use(second).build().dispose();

    // Reverse, so a plugin tears down before anything it depends on.
    expect(log).toEqual(['second', 'first']);
  });

  test('passes dt through to draw hooks', () => {
    const seen: number[] = [];
    const plugin = definePlugin({
      name: 'timing',
      predraw: (dt: number) => void seen.push(dt),
      postdraw: (dt: number) => void seen.push(dt),
    });

    createSketch().use(plugin).build().predraw(0.5);
    expect(seen).toEqual([0.5]);
  });

  test('awaits async setup hooks in order', async () => {
    const log: string[] = [];
    const slow = definePlugin({
      name: 'slow',
      presetup: async () => {
        await new Promise((r) => setTimeout(r, 10));
        log.push('slow');
      },
    });
    const fast = definePlugin({
      name: 'fast',
      presetup: () => void log.push('fast'),
    });

    await createSketch().use(slow).use(fast).build().presetup();
    // Sequential, not concurrent: 'slow' must complete first.
    expect(log).toEqual(['slow', 'fast']);
  });

  test('setup runs once at build, not per hook', () => {
    const log: string[] = [];
    const sketch = createSketch().use(makePhysics(log)).build();
    sketch.predraw(0);
    sketch.predraw(0);
    expect(log.filter((l) => l === 'physics:setup')).toHaveLength(1);
    expect(sketch.stepCount()).toBe(2);
  });
});
