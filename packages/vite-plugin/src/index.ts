/**
 * Optional auto-import plugin: the modern replacement for p5's global mode.
 *
 * p5 injects its API onto `window`, which is what makes it impossible to type.
 * This does the same job at build time instead — a sketch file gets a
 * destructuring binding for exactly the names it uses, so the source stays
 * terse and everything downstream still sees ordinary typed identifiers.
 */

import { transform, type TransformOptions } from './transform';

export interface MatterPluginOptions extends TransformOptions {
  /** Which files to transform. Defaults to `*.sketch.ts` and `*.sketch.js`. */
  readonly include?: RegExp;
}

/** The shape Vite expects, declared here so the package needs no Vite dependency. */
export interface VitePluginLike {
  readonly name: string;
  readonly enforce?: 'pre' | 'post';
  transform: (code: string, id: string) => { code: string; map: null } | null;
}

const DEFAULT_INCLUDE = /\.sketch\.[jt]s$/;

export function matterAutoImport(options: MatterPluginOptions = {}): VitePluginLike {
  const include = options.include ?? DEFAULT_INCLUDE;

  return {
    name: 'matter-auto-import',
    // Before TypeScript strips types, so the binding is present when the file
    // is checked rather than injected into already-compiled output.
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!include.test(id)) return null;

      const out = transform(code, options);
      if (out === code) return null;

      // No source map: the transform only prepends a line, so a map would be
      // an exact off-by-one and is better handled by the bundler's own
      // line-offset tracking than by a wrong map.
      return { code: out, map: null };
    },
  };
}

export {
  CONTEXT_MEMBERS,
  NON_IMPORTABLE_MEMBERS,
  transform,
  findUsedMembers,
  hasExplicitImport,
} from './transform';
export type { TransformOptions } from './transform';
