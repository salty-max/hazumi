import { describe, expect, test } from 'bun:test';
import { collectExportedNames, extractModule, parseDocComment } from '../src/extract';

describe('parseDocComment', () => {
  test('reads prose', () => {
    const doc = parseDocComment(`/**
 * First line.
 * Second line.
 */`);
    expect(doc.description).toBe('First line.\nSecond line.');
  });

  test('reads params, returns and examples', () => {
    const doc = parseDocComment(`/**
 * Adds two numbers.
 * @param a - the first
 * @param b - the second
 * @returns their sum
 * @example
 * add(1, 2) // 3
 */`);
    expect(doc.description).toBe('Adds two numbers.');
    expect(doc.params).toEqual([
      { name: 'a', description: 'the first' },
      { name: 'b', description: 'the second' },
    ]);
    expect(doc.returns).toBe('their sum');
    expect(doc.examples).toEqual(['add(1, 2) // 3']);
  });

  test('continuation lines attach to the tag they follow', () => {
    const doc = parseDocComment(`/**
 * Prose.
 * @param value the thing,
 * continued here
 * @returns something
 * also continued
 */`);
    expect(doc.params[0]?.description).toBe('the thing, continued here');
    expect(doc.returns).toBe('something also continued');
    // Continuations must not leak back into the description.
    expect(doc.description).toBe('Prose.');
  });

  test('params work without the dash', () => {
    const doc = parseDocComment('/**\n * @param x the value\n */');
    expect(doc.params).toEqual([{ name: 'x', description: 'the value' }]);
  });

  test('captures multiple examples separately', () => {
    const doc = parseDocComment(`/**
 * @example
 * one()
 * @example
 * two()
 */`);
    expect(doc.examples).toEqual(['one()', 'two()']);
  });

  test('records deprecation', () => {
    expect(parseDocComment('/**\n * @deprecated use other()\n */').deprecated).toBe('use other()');
    expect(parseDocComment('/**\n * @deprecated\n */').deprecated).toBe('Deprecated.');
  });

  test('a single-line comment is all description', () => {
    expect(parseDocComment('/** Short. */').description).toBe('Short.');
  });

  test('an unknown tag does not swallow the rest', () => {
    const doc = parseDocComment(`/**
 * Prose.
 * @internal
 * @returns a value
 */`);
    expect(doc.returns).toBe('a value');
  });
});

describe('collectExportedNames', () => {
  test('reads plain, type-only and aliased exports', () => {
    const names = collectExportedNames(`
      export { alpha, beta };
      export type { Gamma };
      export { delta as epsilon };
    `);
    expect([...names].toSorted()).toEqual(['Gamma', 'alpha', 'beta', 'epsilon']);
  });

  test('handles a mixed clause', () => {
    const names = collectExportedNames('export { a, type B, c as d };');
    expect([...names].toSorted()).toEqual(['B', 'a', 'd']);
  });

  test('an empty file exports nothing', () => {
    expect(collectExportedNames('').size).toBe(0);
  });
});

describe('extractModule', () => {
  const source = `
/** A widget. */
interface Widget {
  readonly size: number;
}
/**
 * Makes a widget.
 * @param size - how big
 * @returns the widget
 */
declare function makeWidget(size: number): Widget;
/** Internal helper. */
declare function helper(): void;
declare const VERSION: string;
export { makeWidget, VERSION };
export type { Widget };
`;

  test('includes only exported declarations', () => {
    const mod = extractModule('demo', source);
    const names = mod.entries.map((e) => e.name);
    expect(names).toContain('makeWidget');
    expect(names).toContain('Widget');
    expect(names).toContain('VERSION');
    // Declared but never exported, so not API.
    expect(names).not.toContain('helper');
  });

  test('attaches the right comment to the right declaration', () => {
    const mod = extractModule('demo', source);
    const widget = mod.entries.find((e) => e.name === 'Widget');
    const make = mod.entries.find((e) => e.name === 'makeWidget');
    expect(widget?.description).toBe('A widget.');
    expect(make?.description).toBe('Makes a widget.');
    expect(make?.params[0]?.name).toBe('size');
  });

  test('an undocumented export still appears', () => {
    const version = extractModule('demo', source).entries.find((e) => e.name === 'VERSION');
    expect(version).toBeDefined();
    expect(version?.description).toBe('');
  });

  test('captures a whole interface body', () => {
    const widget = extractModule('demo', source).entries.find((e) => e.name === 'Widget');
    expect(widget?.signature).toContain('readonly size: number;');
    expect(widget?.signature.trimEnd().endsWith('}')).toBe(true);
  });

  test('records the declaration kind', () => {
    const mod = extractModule('demo', source);
    const kinds = Object.fromEntries(mod.entries.map((e) => [e.name, e.kind]));
    expect(kinds).toEqual({ Widget: 'interface', makeWidget: 'function', VERSION: 'const' });
  });

  test('orders types before values', () => {
    const kinds = extractModule('demo', source).entries.map((e) => e.kind);
    expect(kinds.indexOf('interface')).toBeLessThan(kinds.indexOf('function'));
    expect(kinds.indexOf('function')).toBeLessThan(kinds.indexOf('const'));
  });

  test('a comment separated from its declaration is dropped', () => {
    // Otherwise a file-level note would be attributed to whatever follows it.
    const mod = extractModule('demo', `
/** Detached note. */

const notADeclaration = 1;
declare function thing(): void;
export { thing };
`);
    expect(mod.entries.find((e) => e.name === 'thing')?.description).toBe('');
  });
});

/**
 * The extractor runs against our own build output, so a change to how tsdown
 * emits declarations would break the reference silently. This reads the real
 * files.
 *
 * Paths are anchored to this file rather than the working directory, so the
 * suite passes whether it is run from the repo root or from apps/docs.
 */
const REPO_ROOT = new URL('../../../', import.meta.url).pathname;
describe('against the real build output', () => {
  test('finds the documented public API of @matter/graphics', async () => {
    const source = await Bun.file(`${REPO_ROOT}packages/graphics/dist/index.d.ts`).text();
    const mod = extractModule('@matter/graphics', source);
    const names = mod.entries.map((e) => e.name);

    expect(names).toContain('CommandBuffer');
    expect(names).toContain('decode');
    expect(names).toContain('Op');

    const buffer = mod.entries.find((e) => e.name === 'CommandBuffer');
    expect(buffer?.kind).toBe('class');
    expect(buffer?.description).toContain('Struct-of-arrays');
  });

  test('finds sketch() with its example', async () => {
    const source = await Bun.file(`${REPO_ROOT}packages/matter/dist/index.d.ts`).text();
    const mod = extractModule('matter', source);
    const sketch = mod.entries.find((e) => e.name === 'sketch');

    expect(sketch?.kind).toBe('function');
    expect(sketch?.description).toContain('Create and run a sketch');
    expect(sketch?.examples.length).toBeGreaterThan(0);
  });
});

describe('fenced examples', () => {
  test('a markdown fence is lifted out of the prose', () => {
    const doc = parseDocComment(`/**
 * Does a thing.
 *
 * \`\`\`ts
 * doThing();
 * \`\`\`
 */`);
    expect(doc.examples).toEqual(['doThing();']);
    // Removed from the prose so it is not rendered twice.
    expect(doc.description).toBe('Does a thing.');
  });

  test('fenced and tagged examples both land in the same list', () => {
    const doc = parseDocComment(`/**
 * Prose.
 *
 * \`\`\`ts
 * fenced();
 * \`\`\`
 * @example
 * tagged();
 */`);
    expect(doc.examples).toEqual(['fenced();', 'tagged();']);
  });

  test('prose without a fence is untouched', () => {
    expect(parseDocComment('/**\n * Just prose.\n */').description).toBe('Just prose.');
  });
});
