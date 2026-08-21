/**
 * A scrolling field of sprites drawn from one sheet.
 *
 * The point: every tile here is a different frame, and the whole field is one
 * draw call. Before spritesheets each distinct sprite needed its own image,
 * and batching could not merge them because it only joins adjacent instances —
 * so this same scene cost one call per tile.
 */
import { sketch, spritesheet, type SketchContext, type SketchHandle } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

const TILE = 34;

export function tileField(parent: HTMLElement): SketchHandle {
  return sketch(
    { backend: webgl2(), width: 600, height: 600, parent, seed: 12 },
    async (s) => {
      const image = await s.loadImage('./assets/tiles.png');
      const sheet = spritesheet(image, { frame: [16, 16] });

      const cols = Math.ceil(s.width / TILE) + 2;
      const rows = Math.ceil(s.height / TILE) + 2;

      // Which tile sits where, decided once so the field is stable as it
      // scrolls rather than shimmering.
      const pick = new Uint8Array(cols * rows);
      for (let i = 0; i < pick.length; i++) {
        pick[i] = s.random.int(0, sheet.length);
      }

      return ({ background, image: draw, text, textSize, fill,
                width, height, t }: SketchContext) => {
        background('oklch(0.12 0.02 270)');

        const offsetX = -((t * 26) % TILE);
        const offsetY = -((t * 14) % TILE);

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const frame = sheet.frame(pick[row * cols + col] as number);
            draw(frame, col * TILE + offsetX, row * TILE + offsetY, TILE - 2, TILE - 2);
          }
        }

        fill('oklch(0.95 0.02 90)');
        textSize(14);
        text(`${cols * rows} sprites · 16 frames · one texture`, 16, height - 18);
        void width;
      };
    },
  );
}
