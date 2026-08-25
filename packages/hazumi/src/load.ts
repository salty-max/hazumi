/**
 * Loading assets, without tying any of it to a running application.
 *
 * Everything here is a plain async function taking a URL, because a scene
 * factory is already async — `await loadImage(…)` in setup needs no preload
 * phase, no manifest, and no loader object to thread around.
 *
 * Deliberately uncached. The browser already caches the bytes, and a
 * module-level Map keyed by URL is an unbounded cache with no owner and no
 * lifetime: it would hold every asset any scene ever touched for as long as the
 * page lives. A caller who wants one holds the promise.
 */
import type { ImageSource } from "@hazumi/graphics";

/** Thrown when an asset cannot be fetched or decoded. */
export class AssetLoadError extends Error {
  /** What was asked for. */
  readonly url: string;
  /** HTTP status, when the request completed and the failure was the response. */
  readonly status: number | undefined;

  constructor(url: string, detail: string, status?: number) {
    super(`Could not load ${JSON.stringify(url)}: ${detail}`);
    this.name = "AssetLoadError";
    this.url = url;
    this.status = status;
  }
}

/** Swappable transport, so a test does not have to reach for a global. */
export interface LoadOptions {
  /** Used instead of the global `fetch`. Defaults to it. */
  readonly fetch?: (url: string) => Promise<Response>;
}

async function get(url: string, options: LoadOptions): Promise<Response> {
  const request = options.fetch ?? globalThis.fetch;
  if (request === undefined) {
    throw new AssetLoadError(url, "fetch is unavailable in this environment");
  }
  let response: Response;
  try {
    response = await request(url);
  } catch (cause) {
    // A network failure and a 404 are different problems with different fixes,
    // so they read differently rather than both surfacing as "failed".
    throw new AssetLoadError(url, cause instanceof Error ? cause.message : String(cause));
  }
  if (!response.ok) throw new AssetLoadError(url, `HTTP ${response.status}`, response.status);
  return response;
}

/** Decode an image. */
export async function loadImage(url: string, options: LoadOptions = {}): Promise<ImageSource> {
  const response = await get(url, options);
  // createImageBitmap decodes off the main thread, so a large image does not
  // stall the first frame.
  return createImageBitmap(await response.blob());
}

/** Fetch a file as text. */
export async function loadText(url: string, options: LoadOptions = {}): Promise<string> {
  return (await get(url, options)).text();
}

/**
 * Fetch and parse JSON.
 *
 * The type parameter is a claim, not a check — nothing here validates the
 * shape. It exists so a caller can name what it expects at the call site
 * instead of casting afterwards.
 */
export async function loadJson<T = unknown>(url: string, options: LoadOptions = {}): Promise<T> {
  const text = await loadText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new AssetLoadError(url, `not valid JSON (${(cause as Error).message})`);
  }
}

/**
 * Load a font file and register the family with the document.
 *
 * Until this resolves, `textFont(family)` has nothing to find and the renderer
 * falls back — so await it in setup rather than firing it off. Text drawing has
 * always used whatever fonts the system already had; this is how a game ships
 * its own.
 */
export async function loadFont(
  family: string,
  url: string,
  descriptors: FontFaceDescriptors = {},
): Promise<void> {
  if (typeof FontFace === "undefined" || globalThis.document?.fonts === undefined) {
    throw new AssetLoadError(url, "the Font Loading API is unavailable in this environment");
  }
  const face = new FontFace(family, `url(${JSON.stringify(url)})`, descriptors);
  try {
    await face.load();
  } catch (cause) {
    throw new AssetLoadError(url, cause instanceof Error ? cause.message : String(cause));
  }
  globalThis.document.fonts.add(face);
}
