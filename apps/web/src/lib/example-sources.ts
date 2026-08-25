/**
 * The examples' own source, served from the files that actually run.
 *
 * A gallery that shows a scene and hides how it was written is a screenshot.
 * The whole argument for these is "this is what the library looks like in use",
 * which only lands if you can read the use.
 *
 * Loaded lazily rather than eagerly: the sources are a few hundred kilobytes of
 * text nobody needs until they open one, and `eager: true` would put every byte
 * of it in the gallery's chunk.
 */
const RAW = import.meta.glob("../../../../examples/**/*.ts", {
  query: "?raw",
  import: "default",
}) as Readonly<Record<string, () => Promise<string>>>;

/** Path relative to `examples/`, as the scene list writes it. */
function keyOf(path: string): string {
  const marker = "/examples/";
  const at = path.lastIndexOf(marker);
  return at < 0 ? path : path.slice(at + marker.length);
}

const BY_PATH: ReadonlyMap<string, () => Promise<string>> = new Map(
  Object.entries(RAW).map(([path, load]) => [keyOf(path), load] as const),
);

export interface ExampleFile {
  /** What the tab shows: the file's own name, not its path. */
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

/**
 * Read the files a scene is made of, in the order given.
 *
 * A path the glob does not know is dropped rather than thrown on: the scene
 * still runs, and a gallery that goes blank because a filename moved is worse
 * than one missing a tab.
 */
export async function loadExampleFiles(paths: readonly string[]): Promise<readonly ExampleFile[]> {
  const found = paths.map((path) => ({ path, load: BY_PATH.get(path) }));
  const loaded = await Promise.all(
    found.map(async ({ path, load }) =>
      load === undefined
        ? null
        : { name: path.split("/").at(-1) ?? path, path, source: await load() },
    ),
  );
  return loaded.filter((file): file is ExampleFile => file !== null);
}
