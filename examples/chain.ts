/**
 * A chain you can pull, to see what a distance joint actually does.
 *
 * Dragging is itself a joint: grabbing a link pins it to the world with a
 * zero-length distance joint whose world anchor is moved to the cursor every
 * frame. Pull a chain sideways and let go to watch it swing back; pull a lower
 * link upwards and the chain above it has nowhere to go but sideways, which is
 * what compression looks like when links cannot pass through one another.
 *
 * The readouts are the point. A joint holds its length exactly under a light
 * load and gives under a heavy one, and the only way to see the difference is
 * to measure it: the left chain is uniform, the right one hangs a weight
 * fifteen times a link's mass off the bottom.
 */
import { createPluginHost, start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Align,
  background,
  circle,
  fill,
  line,
  noStroke,
  stroke,
  strokeWeight,
  text,
  textAlign,
  textSize,
} from "hazumi/draw";
import { input, pointerJustPressed, pointerJustReleased } from "hazumi/input";
import { physics, type Joint, type PhysicsApi, type RigidBody } from "hazumi/physics";
import { screen } from "hazumi/scene";

const LINKS = 12;
const SPAN = 24;
const LINK_RADIUS = 7;

interface Chain {
  readonly label: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly links: RigidBody[];
  /** Length with every joint exactly at rest, for comparison. */
  readonly restLength: number;
  peak: number;
}

/** Chain length now, as a percentage of the same chain at rest. */
function extension(c: Chain): number {
  let total = 0;
  let px = c.anchorX;
  let py = c.anchorY;
  for (const link of c.links) {
    total += Math.hypot(link.x - px, link.y - py);
    px = link.x;
    py = link.y;
  }
  return (total / c.restLength) * 100;
}

export function chain(parent: HTMLElement): HazumiApp<PhysicsApi> {
  return start(
    {
      backend: webgl2(),
      width: 600,
      height: 600,
      parent,
      plugins: createPluginHost().use(physics({ gravityY: 1400 })),
    },
    ({ physics: sim }) => {
      const world = sim.world;
      const chains: Chain[] = [];

      function build(label: string, anchorX: number, weight: number): Chain {
        const links: RigidBody[] = [];
        let above: RigidBody | null = null;
        for (let i = 0; i < LINKS; i++) {
          const last = i === LINKS - 1;
          const link = world.addCircle({
            x: anchorX,
            y: 90 + i * SPAN,
            radius: last && weight > 1 ? 16 : LINK_RADIUS,
            density: last ? weight : 1,
            linearDamping: 0.4,
            angularDamping: 0.6,
          });
          links.push(link);
          if (above === null) {
            world.addDistanceJoint({ a: link, anchorBX: anchorX, anchorBY: 70, length: SPAN });
          } else {
            world.addDistanceJoint({ a: above, b: link, length: SPAN });
          }
          above = link;
        }
        return { label, anchorX, anchorY: 70, links, restLength: LINKS * SPAN, peak: 100 };
      }

      chains.push(build("uniform", 190, 1));
      chains.push(build("weighted", 410, 15));

      /** The joint that follows the pointer, and what it holds. */
      let leash: Joint | null = null;
      let held: RigidBody | null = null;

      return {
        update(): void {
          if (pointerJustPressed()) {
            const grabbed = world.pointQuery(input.mouseX, input.mouseY);
            if (grabbed !== null && !grabbed.isStatic) {
              held = grabbed;
              // Zero length, so the link is pulled onto the cursor rather than
              // held at a distance from it.
              leash = world.addDistanceJoint({
                a: grabbed,
                anchorBX: input.mouseX,
                anchorBY: input.mouseY,
                length: 0,
              });
            }
          }
          if (pointerJustReleased() && leash !== null) {
            world.removeJoint(leash);
            leash = null;
            held = null;
          }
          if (leash !== null && held !== null) {
            leash.anchorBX = input.mouseX;
            leash.anchorBY = input.mouseY;
            // A chain that fell asleep hanging still has to answer the pointer.
            world.wake(held);
          }
        },
        draw(): void {
          background("oklch(0.15 0.02 260)");

          for (const c of chains) {
            const stretched = extension(c);
            c.peak = Math.max(c.peak, stretched);

            stroke("oklch(0.45 0.05 260)");
            strokeWeight(2);
            let px = c.anchorX;
            let py = c.anchorY;
            for (const link of c.links) {
              line(px, py, link.x, link.y);
              px = link.x;
              py = link.y;
            }
            noStroke();

            fill("oklch(0.62 0.03 260)");
            circle(c.anchorX, c.anchorY, 10);
            for (const link of c.links) {
              fill(link === held ? "oklch(0.86 0.19 90)" : "oklch(0.72 0.14 250)");
              circle(link.x, link.y, link.radius * 2);
            }

            fill("oklch(0.88 0.02 260)");
            textSize(12);
            textAlign(Align.Center);
            text(c.label, c.anchorX, 40);
            // Under 100 is compression, over is stretch; the peak is what the
            // chain gave at its worst, which a swing back hides again.
            text(`${stretched.toFixed(1)}%  peak ${c.peak.toFixed(1)}%`, c.anchorX, 56);
          }

          fill("oklch(0.62 0.02 260)");
          textSize(12);
          textAlign(Align.Center);
          text(
            "drag a link and let go · pull one upwards to compress the chain above it",
            screen.width / 2,
            screen.height - 20,
          );
          textAlign(Align.Left);
        },
      };
    },
  );
}
