/**
 * A solar system, drawn on the transform stack.
 *
 * Tests: nested push/pop, rotate and translate composing, scoped `with`.
 *
 * A moon is the reason the transform stack exists. Its position is the sun's
 * frame, turned by the planet's year, moved out to the planet's orbit, turned
 * again by the moon's month, moved out again — four operations that each
 * belong to one body, rather than one trigonometric expression that belongs to
 * nobody and has to be rewritten every time something moves.
 *
 * Distances and periods are compressed. At true scale Neptune sits four metres
 * off the side of the screen and takes an hour and a half to come back, which
 * is accurate and unwatchable; the ordering and the ratios survive, the units
 * do not.
 */
import { start, type HazumiApp } from "hazumi/app";
import { webgl2 } from "hazumi/backends/webgl2";
import {
  Align,
  Blend,
  background,
  blendMode,
  circle,
  ellipse,
  fill,
  noFill,
  noStroke,
  pop,
  push,
  rotate,
  stroke,
  strokeWeight,
  text,
  textAlign,
  textSize,
  translate,
} from "hazumi/draw";
import { random, screen, time } from "hazumi/scene";

/** Seconds for one Earth year, before each planet's own period is applied. */
const YEAR = 5.5;
/**
 * How hard the outer years are pulled in.
 *
 * Neptune takes 165 of Earth's; at 0.42 it takes eight and a half of them on
 * screen, which is still visibly the slowest thing out there without being a
 * fixed dot.
 */
const TIME_COMPRESSION = 0.42;
const TAU = Math.PI * 2;

interface Moon {
  readonly distance: number;
  readonly radius: number;
  readonly months: number;
  readonly color: string;
}

interface Planet {
  readonly name: string;
  /** Orbit radius in pixels, already compressed. */
  readonly orbit: number;
  /** Drawn radius in pixels, already compressed. */
  readonly size: number;
  /** Orbital period in Earth years. */
  readonly period: number;
  /**
   * Where it starts, in radians.
   *
   * Without this every planet begins at three o'clock, which is a conjunction
   * of all eight — something that has not happened in recorded history and
   * reads, correctly, as a mistake.
   */
  readonly phase: number;
  readonly color: string;
  /** Second, lighter band colour, for the ones that have bands. */
  readonly band?: string;
  readonly ring?: boolean;
  readonly moons?: readonly Moon[];
}

const PLANETS: readonly Planet[] = [
  { name: "Mercury", orbit: 60, size: 4, period: 0.24, phase: 0.2, color: "oklch(0.66 0.02 70)" },
  { name: "Venus", orbit: 80, size: 7, period: 0.62, phase: 2.4, color: "oklch(0.82 0.09 85)" },
  {
    name: "Earth",
    orbit: 102,
    size: 7.4,
    period: 1,
    phase: 4.1,
    color: "oklch(0.58 0.15 245)",
    band: "oklch(0.72 0.14 150)",
    moons: [{ distance: 15, radius: 2.2, months: 0.075, color: "oklch(0.8 0.01 250)" }],
  },
  { name: "Mars", orbit: 128, size: 5.4, period: 1.88, phase: 5.6, color: "oklch(0.6 0.16 40)" },
  {
    name: "Jupiter",
    orbit: 176,
    size: 21,
    period: 11.86,
    phase: 1.2,
    color: "oklch(0.72 0.08 65)",
    band: "oklch(0.62 0.1 45)",
    moons: [
      { distance: 30, radius: 2.4, months: 0.045, color: "oklch(0.85 0.05 90)" },
      { distance: 40, radius: 2.8, months: 0.09, color: "oklch(0.75 0.03 60)" },
    ],
  },
  {
    name: "Saturn",
    orbit: 216,
    size: 18,
    period: 29.5,
    phase: 3.35,
    color: "oklch(0.82 0.07 90)",
    band: "oklch(0.72 0.06 80)",
    ring: true,
    moons: [{ distance: 36, radius: 2.6, months: 0.11, color: "oklch(0.8 0.03 80)" }],
  },
  { name: "Uranus", orbit: 248, size: 12, period: 84, phase: 5.1, color: "oklch(0.78 0.09 200)" },
  {
    name: "Neptune",
    orbit: 272,
    size: 11.6,
    period: 165,
    phase: 0.9,
    color: "oklch(0.6 0.15 255)",
  },
];

export function orbits(parent: HTMLElement): HazumiApp {
  return start({ backend: webgl2(), width: 600, height: 600, parent, seed: 3 }, () => {
    // Fixed stars, in both senses: drawn from the seed once, so they do not
    // shimmer from frame to frame the way freshly random ones would.
    const count = 260;
    const starX = new Float32Array(count);
    const starY = new Float32Array(count);
    const starSize = new Float32Array(count);
    const starGlow = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      starX[i] = random.range(0, screen.width);
      starY[i] = random.range(0, screen.height);
      starSize[i] = random.range(0.6, 2.1);
      starGlow[i] = random.range(0.25, 0.9);
    }

    return {
      draw: (): void => {
        background("oklch(0.11 0.03 275)");

        noStroke();
        for (let i = 0; i < count; i++) {
          fill(`oklch(0.95 0.02 250 / ${starGlow[i] as number})`);
          circle(starX[i] as number, starY[i] as number, starSize[i] as number);
        }

        push();
        translate(screen.width / 2, screen.height / 2);

        // Orbits first, so every planet sits on top of its own path.
        noFill();
        stroke("oklch(0.62 0.03 250 / 0.16)");
        strokeWeight(1);
        for (const planet of PLANETS) circle(0, 0, planet.orbit * 2);

        // The sun, as three sizes of the same light rather than one disc:
        // additive, so where they overlap they add up to a core.
        noStroke();
        blendMode(Blend.Add);
        fill("oklch(0.72 0.16 75 / 0.1)");
        circle(0, 0, 132);
        fill("oklch(0.8 0.17 80 / 0.16)");
        circle(0, 0, 76);
        fill("oklch(0.95 0.13 90)");
        circle(0, 0, 30);
        blendMode(Blend.Normal);

        for (const planet of PLANETS) {
          const turn =
            (time.elapsed / (YEAR * planet.period ** TIME_COMPRESSION)) * TAU + planet.phase;
          push();
          rotate(turn);
          translate(planet.orbit, 0);

          if (planet.ring === true) {
            // Drawn under the planet and tilted, which is the whole reason it
            // reads as a ring around something rather than a hoop beside it.
            push();
            rotate(-0.42);
            noFill();
            stroke("oklch(0.86 0.06 90 / 0.75)");
            strokeWeight(3);
            ellipse(0, 0, planet.size * 4.6, planet.size * 1.5);
            stroke("oklch(0.86 0.06 90 / 0.4)");
            strokeWeight(2);
            ellipse(0, 0, planet.size * 3.6, planet.size * 1.15);
            pop();
          }

          noStroke();
          fill(planet.color);
          circle(0, 0, planet.size * 2);
          if (planet.band !== undefined) {
            // A band across the disc: an ellipse clipped by nothing, just
            // narrower than the planet, which at this size is enough.
            fill(planet.band);
            ellipse(0, 0, planet.size * 1.9, planet.size * 0.62);
          }

          for (const moon of planet.moons ?? []) {
            push();
            rotate((time.elapsed / (YEAR * moon.months)) * TAU);
            translate(moon.distance, 0);
            fill(moon.color);
            circle(0, 0, moon.radius * 2);
            pop();
          }

          // The label rides with the planet but not with its rotation, so it
          // stays the right way up all the way round.
          rotate(-turn);
          fill("oklch(0.78 0.03 250 / 0.75)");
          textSize(10);
          textAlign(Align.Center);
          text(planet.name, 0, planet.size + 15);
          textAlign(Align.Left);
          pop();
        }
        pop();
      },
    };
  });
}
