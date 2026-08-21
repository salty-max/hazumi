/**
 * A scrolling field of sprites drawn from one sheet.
 *
 * The point: every tile here is a different frame, and the whole field is one
 * draw call. Before spritesheets each distinct sprite needed its own image,
 * and batching could not merge them because it only joins adjacent instances —
 * so this same scene cost one call per tile.
 */
import { loadImage, spritesheet, tilemap } from "matter/assets";
import { start, type MatterApp } from "matter/app";
import { webgl2 } from "matter/backends/webgl2";
import { background, fill, text, textSize } from "matter/draw";
import { screen, time } from "matter/scene";

const TILE = 34;

export function tileField(parent: HTMLElement): MatterApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 12 }, async (scene) => {
    const { random, width, height } = scene;
    const image = await loadImage("/examples/assets/tiles.png");
    const sheet = spritesheet(image, { frame: [16, 16] });

    const cols = Math.ceil(width / TILE) + 2;
    const rows = Math.ceil(height / TILE) + 2;

    // Which tile sits where, decided once so the field is stable as it
    // scrolls rather than shimmering.
    const tiles = new Uint8Array(cols * rows);
    for (let i = 0; i < tiles.length; i++) {
      tiles[i] = random.int(0, sheet.length);
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
        text(`${cols * rows} sprites · 16 frames · one texture`, 16, screen.height - 18);
      },
    };
  });
}
