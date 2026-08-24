/**
 * A scrolling field of sprites drawn from one sheet.
 *
 * The point: every tile here is a different frame, and the whole field is one
 * draw call. Before spritesheets each distinct sprite needed its own image,
 * and batching could not merge them because it only joins adjacent instances —
 * so this same scene cost one call per tile.
 */
import { loadImage, spritesheet, tilemap } from "hazumi/assets";
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import { background, fill, text, textSize } from "hazumi/draw";
import { screen, time } from "hazumi/scene";

const TILE = 34;

export function tileField(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 12 }, async (scene) => {
    const { random, width, height } = scene;
    const image = await loadImage("/examples/assets/dungeon-tiles.png");
    // Named by what they are, and pointed at by grid position rather than by
    // an index nobody can check. The eight are the floor of the sheet: four
    // cobbled, four of dirt and pebbles, all in one palette so a field of them
    // reads as a floor rather than as a test pattern.
    const sheet = spritesheet(image, {
      frame: [16, 16],
      frames: {
        cobble: [2, 2],
        cobbleWorn: [3, 2],
        cobbleCracked: [4, 2],
        cobbleChipped: [5, 2],
        dirt: [2, 3],
        dirtStones: [3, 3],
        dirtPebbles: [4, 3],
        dirtBare: [5, 3],
      },
    });
    const FLOOR = [
      "cobble",
      "cobbleWorn",
      "cobbleCracked",
      "cobbleChipped",
      "dirt",
      "dirtStones",
      "dirtPebbles",
      "dirtBare",
    ] as const;
    const floor = FLOOR.map((name) => sheet.indexOf(name));

    const cols = Math.ceil(width / TILE) + 2;
    const rows = Math.ceil(height / TILE) + 2;

    // Which tile sits where, decided once so the field is stable as it
    // scrolls rather than shimmering.
    const tiles = new Uint8Array(cols * rows);
    for (let i = 0; i < tiles.length; i++) {
      tiles[i] = floor[random.int(0, floor.length)] as number;
    }
    const field = tilemap({
      columns: cols,
      rows,
      tileWidth: TILE,
      tileHeight: TILE,
      layers: [{ name: "ground", sheet, tiles }],
    });

    return {
      draw: (): void => {
        background("oklch(0.12 0.02 270)");

        const offsetX = -((time.elapsed * 26) % TILE);
        const offsetY = -((time.elapsed * 14) % TILE);
        field.draw(offsetX, offsetY);

        fill("oklch(0.95 0.02 90)");
        textSize(14);
        text(
          `${cols * rows} sprites · ${floor.length} frames · one texture`,
          16,
          screen.height - 18,
        );
      },
    };
  });
}
