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

import { offsetSourceMap, transform, type TransformOptions } from "./transform";

export interface MatterPluginOptions extends TransformOptions {
  /** Which files to transform. Defaults to `*.scene.ts` and `*.scene.js`. */
  readonly include?: RegExp;
}

/** The shape Vite expects, declared here so the package needs no Vite dependency. */
export interface VitePluginLike {
  readonly name: string;
  readonly enforce?: "pre" | "post";
  transform: (
    code: string,
    id: string,
  ) => { code: string; map: ReturnType<typeof offsetSourceMap> | null } | null;
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

      const prefix = out.length === code.length ? "" : out.slice(0, -code.length);
      const extraLines = prefix.length === 0 ? 0 : prefix.split("\n").length - 1;
      return {
        code: out,
        map: offsetSourceMap(Math.max(extraLines, 0), code, id),
      };
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
  globalsDeclaration,
  offsetSourceMap,
} from "./transform";
export type { CapabilityModule, TransformOptions } from "./transform";
