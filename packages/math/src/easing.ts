/**
 * Easing functions. Each maps [0, 1] to [0, 1] with f(0) = 0 and f(1) = 1,
 * except `back` and `elastic`, which deliberately overshoot in between.
 */

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const quadIn: Easing = (t) => t * t;
export const quadOut: Easing = (t) => t * (2 - t);
export const quadInOut: Easing = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export const cubicIn: Easing = (t) => t * t * t;
export const cubicOut: Easing = (t) => 1 + (t - 1) ** 3;
export const cubicInOut: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 + (t - 1) * (2 * t - 2) * (2 * t - 2);

export const quartIn: Easing = (t) => t ** 4;
export const quartOut: Easing = (t) => 1 - (t - 1) ** 4;
export const quartInOut: Easing = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - 8 * (t - 1) ** 4);

export const sineIn: Easing = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const sineOut: Easing = (t) => Math.sin((t * Math.PI) / 2);
export const sineInOut: Easing = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const expoIn: Easing = (t) => (t === 0 ? 0 : 2 ** (10 * t - 10));
export const expoOut: Easing = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
export const expoInOut: Easing = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
};

export const circIn: Easing = (t) => 1 - Math.sqrt(1 - t * t);
export const circOut: Easing = (t) => Math.sqrt(1 - (t - 1) ** 2);

const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;

/** Overshoots below 0 before settling. */
export const backIn: Easing = (t) => BACK_C3 * t ** 3 - BACK_C1 * t ** 2;
/** Overshoots above 1 before settling. */
export const backOut: Easing = (t) => 1 + BACK_C3 * (t - 1) ** 3 + BACK_C1 * (t - 1) ** 2;

const ELASTIC_C4 = (2 * Math.PI) / 3;

export const elasticOut: Easing = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1;
};

export const bounceOut: Easing = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** Mirror an ease-in into its ease-out counterpart. */
export function reverse(easing: Easing): Easing {
  return (t: number): number => 1 - easing(1 - t);
}

/** Build an in-out curve from an ease-in. */
export function inOut(easing: Easing): Easing {
  return (t: number): number => (t < 0.5 ? easing(t * 2) / 2 : 1 - easing((1 - t) * 2) / 2);
}
