/**
 * Optional auto-import plugin, for scenes written in global style.
 *
 * The usual way to get bare `circle` and `fill` is to inject the API onto
 * `window`, which is precisely what makes such an API impossible to type.
 * This does the same job at build time instead — a scene file gets capability
 * imports for exactly the names it uses, so the source stays terse and
 * everything downstream still sees ordinary typed identifiers from
 * `matter/draw`, `matter/input`, `matter/scene`, and `matter/assets`.
 */

import { transform, type TransformOptions } from "./transform";

export interface MatterPluginOptions extends TransformOptions {
  /** Which files to transform. Defaults to `*.scene.ts` and `*.scene.js`. */
  readonly include?: RegExp;
}

/** The shape Vite expects, declared here so the package needs no Vite dependency. */
export interface VitePluginLike {
  readonly name: string;
  readonly enforce?: "pre" | "post";
  transform: (code: string, id: string) => { code: string; map: null } | null;
}

const DEFAULT_INCLUDE = /\.scene\.[jt]s$/;

export function matterAutoImport(options: MatterPluginOptions = {}): VitePluginLike {
  const include = options.include ?? DEFAULT_INCLUDE;

  return {
    name: "matter-auto-import",
    // Before TypeScript strips types, so the binding is present when the file
    // is checked rather than injected into already-compiled output.
    enforce: "pre",
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
  AUTO_IMPORT_MEMBERS,
  CAPABILITY_MODULES,
  transform,
  findUsedMembers,
  hasExplicitImport,
  importedNames,
} from "./transform";
export type { CapabilityModule, TransformOptions } from "./transform";
