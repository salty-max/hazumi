/**
 * Two spritesheets at once: a tile field and an animated character.
 *
 * The character sheet declares its own animations, so the sketch asks for
 * `clip('run').at(t)` rather than tracking frame indices. Sampling is
 * stateless, which is why forty characters can share one clip without any of
 * them advancing another.
 *
 * Draw order matters here: the tiles are all drawn, then all the characters.
 * Interleaving them would cost one draw call per sprite instead of one per
 * sheet, because batching only merges adjacent instances.
 */
import { ClipEnd, sketch, spritesheet, type SketchContext, type SketchHandle } from 'matter';
import { webgl2 } from 'matter/backends/webgl2';

const COUNT = 40;
const TILE = 40;

export function characters(parent: HTMLElement): SketchHandle {
  return sketch(
    { backend: webgl2(), width: 600, height: 600, parent, seed: 21 },
    async (s) => {
      const [tilesImage, heroImage] = await Promise.all([
        s.loadImage('./assets/tiles.png'),
        s.loadImage('./assets/hero.png'),
      ]);

      const tiles = spritesheet(tilesImage, { frame: [16, 16] });
      const hero = spritesheet(heroImage, {
        frame: [16, 24],
        clips: {
          idle: { frames: [0, 1, 2, 3], fps: 6 },
          run: { frames: [8, 9, 10, 11, 12, 13], fps: 14 },
          jump: { frames: [16], fps: 1, end: ClipEnd.Hold },
        },
      });

      const cols = Math.ceil(s.width / TILE) + 1;
      const rows = Math.ceil(s.height / TILE) + 1;
      const ground = Array.from({ length: cols * rows }, () => s.random.int(0, tiles.length));

      const actors = Array.from({ length: COUNT }, () => ({
        x: s.random.range(0, s.width),
        y: s.random.range(60, s.height - 60),
        speed: s.random.range(18, 70),
        offset: s.random.range(0, 4),
        clip: s.random.pick(['idle', 'run', 'run'] as const),
        scale: s.random.range(1.6, 3),
      }));

      return ({ background, image, text, textSize, fill,
                width, height, t, dt }: SketchContext) => {
        background('oklch(0.13 0.02 265)');

        // Pass one: every tile, from one sheet.
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            image(
              tiles.frame(ground[row * cols + col] as number),
              col * TILE,
              row * TILE,
              TILE,
              TILE,
            );
          }
        }

        // Pass two: every character, from the other. Grouping the two passes
        // is what keeps this at two draw calls rather than hundreds.
        for (const actor of actors) {
          if (actor.clip === 'run') {
            actor.x += actor.speed * dt;
            if (actor.x > width + 40) actor.x = -40;
          }
          const clip = hero.clip(actor.clip);
          image(
            clip.at(t + actor.offset),
            actor.x,
            actor.y,
            16 * actor.scale,
            24 * actor.scale,
          );
        }

        fill('oklch(0.95 0.02 90)');
        textSize(13);
        text(`${cols * rows} tiles + ${COUNT} characters · 2 sheets`, 14, height - 16);
      };
    },
  );
}
