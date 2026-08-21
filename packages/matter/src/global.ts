/**
 * IIFE entry for the script-tag / CDN path. Bundles the default WebGL2 setup
 * under a single `Matter` global.
 *
 * Re-exports are explicit where the two modules overlap: both the library and
 * the backend define a `ShaderPass`, and `export *` from both would be an
 * ambiguous name rather than a useful one.
 */
export * from "./index";
export {
  Webgl2Renderer,
  webgl2,
  SdfAtlas,
  BatchList,
  Pipeline,
  GlStateCache,
  ResourceRegistry,
  PingPongTargets,
  PassCache,
} from "./backends/webgl2";
export type { Webgl2Options, FrameStats, Batch, RenderTarget } from "./backends/webgl2";
