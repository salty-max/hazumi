/**
 * Writes the API catalog JSON the site imports.
 *
 * Run with: bun run apps/docs/src/catalog.ts
 */
import { mkdir } from "node:fs/promises";
import { loadCatalog, type CatalogIo } from "./load-catalog";

const ROOT = new URL("../../../", import.meta.url).pathname;

const io: CatalogIo = {
  async read(relative) {
    const file = Bun.file(ROOT + relative);
    return (await file.exists()) ? file.text() : null;
  },
  async glob(dir, pattern) {
    const files: string[] = [];
    for await (const path of new Bun.Glob(pattern).scan({ cwd: ROOT + dir, onlyFiles: true })) {
      files.push(path);
    }
    return files;
  },
};

const catalog = await loadCatalog(io);
const outDir = `${ROOT}apps/docs/dist/`;
await mkdir(outDir, { recursive: true });
await Bun.write(`${outDir}catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`catalog: ${catalog.moduleCount} modules, ${catalog.symbolCount} symbols`);
